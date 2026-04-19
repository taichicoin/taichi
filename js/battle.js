// ==================== 对战系统【纯时间驱动版 + 状态机根治锁 + 强制同步UI + 轮询保底 + 缓冲期 + 淘汰名次 + 重连修复 + 递增回合+固定缓冲/结算】 ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;
    let gameSubscription = null;
    let autoBotTimer = null;

    let phaseTimer = null;
    let timerInterval = null;
    let currentPhaseStartTime = 0;
    let currentPhaseDuration = 0;
    let enterGuard = false;

    let isUpdatingFromLocal = false;
    let isInPhaseTransition = false;

    let pollingInterval = null;
    let eliminationOrder = [];

    const BUFFER_DURATION = 2;
    const SETTLE_DURATION = 3;

    function getPrepareDuration(round) { return 25 + (round - 1) * 10; }
    function getBattleDuration(round) { return 30 + (round - 1) * 5; }

    const SETTLEMENT_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

    // 调试面板...
    function initDebugPanel() { /* 保持不变 */ }
    function logToScreen(msg, isError, persistent) { /* 保持不变 */ }
    function toast(msg, isError) { /* 保持不变 */ }

    function getGameState() { return gameState; }
    function getCurrentRoomId() { return currentRoomId; }

    async function fetchGameState() {
        if (!currentRoomId) return null;
        const { data, error } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', currentRoomId)
            .single();
        if (error) {
            log(`❌ 拉取状态失败: ${error.message}`, true);
            return null;
        }
        gameState = data.state;
        log(`📥 拉取最新状态: 回合${gameState.round}, 阶段${gameState.phase}, phaseStartTime=${gameState.phaseStartTime}`);
        return gameState;
    }

    async function updatePhaseToDB() {
        if (!currentRoomId || !gameState) return;
        const { error } = await supabase
            .from('game_states')
            .update({ state: gameState })
            .eq('room_id', currentRoomId);
        if (error) log(`❌ 更新阶段失败: ${error.message}`, true);
    }

    async function forceRefreshState() {
        await fetchGameState();
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
    }

    function log(msg, isError = false, persistent = false) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        logToScreen(msg, isError, persistent);
    }

    let safetyTimer = null;
    function clearAllTimers() {
        if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    }

    function startPhaseTimer(phase, duration, skipStateUpdate = false) {
        if (!duration || isNaN(duration) || duration <= 0) {
            let fallback = 0;
            if (phase === 'prepare') fallback = getPrepareDuration(gameState?.round || 1);
            else if (phase === 'battle') fallback = getBattleDuration(gameState?.round || 1);
            else if (phase === 'settle') fallback = SETTLE_DURATION;
            else fallback = 3;
            log(`⚠️ startPhaseTimer 无效 duration=${duration}，使用后备 ${fallback}`, true);
            duration = fallback;
        }
        
        clearAllTimers();
        currentPhaseDuration = duration;
        
        if (!skipStateUpdate) {
            gameState.phaseStartTime = new Date().toISOString();
            currentPhaseStartTime = Date.now();
            updatePhaseToDB();
            log(`⏲️ 启动计时器: 阶段=${phase}, 时长=${duration}秒, 新phaseStartTime=${gameState.phaseStartTime}`);
        } else {
            currentPhaseStartTime = Date.now() - (getPhaseDuration(phase, gameState.round) - duration) * 1000;
            log(`⏲️ 恢复计时器: 阶段=${phase}, 剩余=${duration}秒, 基于现有phaseStartTime`);
        }
        
        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(duration, phase);
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - currentPhaseStartTime) / 1000);
            const remaining = Math.max(0, currentPhaseDuration - elapsed);
            if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(remaining, phase);
        }, 100);
        
        phaseTimer = setTimeout(() => {
            if (safetyTimer) clearTimeout(safetyTimer);
            clearInterval(timerInterval);
            timerInterval = null;
            phaseTimer = null;
            onPhaseEnd(phase);
        }, duration * 1000);
        
        safetyTimer = setTimeout(() => {
            if (phaseTimer) {
                log(`⚠️ 阶段 ${phase} 超时未响应，强制结束`, true);
                clearTimeout(phaseTimer);
                phaseTimer = null;
                clearInterval(timerInterval);
                timerInterval = null;
                onPhaseEnd(phase);
            }
        }, (duration + 2) * 1000);
    }

    async function startBuffering(targetPhase) {
        log(`⏳ 进入缓冲期 ${BUFFER_DURATION} 秒，准备切换到 ${targetPhase}`);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase('buffering');
        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(BUFFER_DURATION, 'buffering');
        await new Promise(resolve => setTimeout(resolve, BUFFER_DURATION * 1000));
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(targetPhase);
    }

    async function callSettlement() {
        if (!currentRoomId) return false;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const accessToken = session?.access_token;
            if (!accessToken) { log('❌ 无 access token', true); return false; }
            const response = await fetch(SETTLEMENT_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                log(`❌ settlement 失败: ${result.error}`, true);
                return false;
            }
            log(`✅ settlement 成功，新回合: ${result.round}`);
            return true;
        } catch (err) {
            log(`❌ settlement 异常: ${err.message}`, true);
            return false;
        }
    }

    async function onPhaseEnd(phase) {
        if (isInPhaseTransition) { log(`⚠️ 阶段切换被锁: ${phase}`, true); return; }
        if (!gameState || !currentRoomId) return;
        isInPhaseTransition = true;
        const lockTimeout = setTimeout(() => { isInPhaseTransition = false; }, 12000);
        log(`🔄 阶段结束: ${phase}`);
        try {
            if (phase === 'prepare') {
                await startBuffering('battle');
                gameState.phase = 'battle';
                gameState.phaseStartTime = new Date().toISOString();
                await updatePhaseToDB();
                await applyUIMode(false);
                startPhaseTimer('battle', getBattleDuration(gameState.round));
                await simulateBattle();
            } else if (phase === 'battle') {
                gameState.phase = 'settle';
                gameState.phaseStartTime = new Date().toISOString();
                await updatePhaseToDB();
                await applyUIMode(false);
                startPhaseTimer('settle', SETTLE_DURATION);
            } else if (phase === 'settle') {
                const success = await callSettlement();
                if (!success) await fetchGameState();
                else await fetchGameState();
                const over = checkGameOver();
                if (over.isOver) { endGame(over.winner); clearTimeout(lockTimeout); return; }
                if (gameState.phase !== 'prepare') {
                    gameState.phase = 'prepare';
                    gameState.phaseStartTime = new Date().toISOString();
                    await updatePhaseToDB();
                }
                await applyUIMode(true);
                const newPrepareDur = getPrepareDuration(gameState.round);
                log(`🔁 进入第 ${gameState.round} 回合准备阶段，时长 ${newPrepareDur} 秒`);
                startPhaseTimer('prepare', newPrepareDur);
            }
        } catch (e) { log(`❌ onPhaseEnd 出错: ${e.message}`, true); }
        finally { clearTimeout(lockTimeout); isInPhaseTransition = false; }
    }

    async function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch (e) {}
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(isPrepare ? 'prepare' : (gameState?.phase === 'settle' ? 'settle' : 'battle'));
        const prepareTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
        // 不再在 applyUIMode 中 fetchGameState，避免覆盖
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
    }

    async function simulateBattle() { /* 保持不变 */ }

    function checkGameOver() { /* 保持不变 */ }
    function endGame(winnerId) { /* 保持不变 */ }

    // ===== 重连修复：纯基于 phaseStartTime，不依赖推算 =====
    async function fastForwardAndResume() {
        // 确保有最新的 gameState
        await fetchGameState();
        if (!gameState) return false;
        
        const now = Date.now();
        const phaseStart = gameState.phaseStartTime ? new Date(gameState.phaseStartTime).getTime() : null;
        
        if (!phaseStart) {
            log(`⚠️ phaseStartTime 缺失，无法恢复时间`, true);
            return false;
        }
        
        const elapsed = Math.floor((now - phaseStart) / 1000);
        const phaseDuration = getPhaseDuration(gameState.phase, gameState.round);
        let remaining = Math.max(0, phaseDuration - elapsed);
        
        log(`🔍 重连计算: 阶段=${gameState.phase}, 回合=${gameState.round}, 总时长=${phaseDuration}, 已过=${elapsed}, 剩余=${remaining}`);
        
        if (remaining <= 0) {
            log(`⏩ 阶段已过期，立即触发切换`);
            clearAllTimers();
            onPhaseEnd(gameState.phase);
            return true;
        }
        
        // 恢复 UI 和计时器
        await applyUIMode(gameState.phase === 'prepare');
        clearAllTimers();
        startPhaseTimer(gameState.phase, remaining, true); // skipStateUpdate = true
        return true;
    }

    function getPhaseDuration(phase, round) {
        if (phase === 'prepare') return getPrepareDuration(round);
        if (phase === 'buffering') return BUFFER_DURATION;
        if (phase === 'battle') return getBattleDuration(round);
        if (phase === 'settle') return SETTLE_DURATION;
        return 3;
    }

    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initDebugPanel();
        eliminationOrder = [];
        
        // 等待 shop 模块初始化
        for (let i = 0; i < 30; i++) {
            if (window.YYCardShop && typeof window.YYCardShop.init === 'function') {
                window.YYCardShop.init();
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        
        subscribeToGame(roomId);
        startPolling();
        bindBattleEvents();
        startBotAutoPlay();
        
        // 加载状态并恢复
        let attempts = 0;
        const loadState = async () => {
            await fetchGameState();
            if (gameState) {
                if (!gameState.gameStartTime) {
                    gameState.gameStartTime = new Date().toISOString();
                    await updatePhaseToDB();
                }
                await fastForwardAndResume();
                return;
            }
            if (attempts++ < 15) setTimeout(loadState, 200);
            else { toast('状态加载失败', true); enterGuard = false; }
        };
        loadState();
    }

    function subscribeToGame(roomId) { /* 保持不变 */ }
    function startPolling() { /* 保持不变 */ }
    function stopPolling() { /* 保持不变 */ }
    function startBotAutoPlay() { /* 保持不变 */ }
    function bindBattleEvents() { /* 保持不变 */ }

    return {
        enterBattle,
        getGameState,
        getCurrentRoomId,
        forceRefreshState,
        fetchGameState,
    };
})();

console.log('✅ battle.js 加载完成（重连修复：纯基于 phaseStartTime）');

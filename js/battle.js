// ==================== 对战系统【纯 gameStartTime + 服务器时间驱动】 ====================
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
    let currentPhaseStartServerTime = 0;
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

    // ---------- 调试面板（略）----------
    function initDebugPanel() { /* 保持不变 */ }
    function logToScreen(msg, isError, persistent) { /* 保持不变 */ }
    function toast(msg, isError) { /* 保持不变 */ }
    function getGameState() { return gameState; }
    function getCurrentRoomId() { return currentRoomId; }

    // ========== 获取服务器时间 ==========
    let cachedServerTime = null;
    let serverTimeCacheTime = 0;
    async function getServerTime() {
        const now = Date.now();
        if (cachedServerTime && (now - serverTimeCacheTime) < 500) {
            return cachedServerTime + (now - serverTimeCacheTime);
        }
        // 方法1：使用 RPC（推荐）
        try {
            const { data, error } = await supabase.rpc('get_server_time');
            if (!error && data) {
                const serverTime = new Date(data).getTime();
                cachedServerTime = serverTime;
                serverTimeCacheTime = now;
                return serverTime;
            }
        } catch(e) {}
        // 方法2：查询任意表的 now()
        try {
            const { data, error } = await supabase
                .from('game_states')
                .select('now()')
                .limit(1);
            if (!error && data && data[0]?.now) {
                const serverTime = new Date(data[0].now).getTime();
                cachedServerTime = serverTime;
                serverTimeCacheTime = now;
                return serverTime;
            }
        } catch(e) {}
        // 最终回退本地时间
        return Date.now();
    }

    // ========== 数据库操作 ==========
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
        return gameState;
    }

    async function updateGameStateToDB() {
        if (!currentRoomId || !gameState) return;
        const { error } = await supabase
            .from('game_states')
            .update({ state: gameState })
            .eq('room_id', currentRoomId);
        if (error) log(`❌ 更新状态失败: ${error.message}`, true);
    }

    async function forceRefreshState() {
        await fetchGameState();
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
    }

    function log(msg, isError, persistent) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        logToScreen(msg, isError, persistent);
    }

    // ---------- 计时器管理 ----------
    let safetyTimer = null;
    function clearAllTimers() {
        if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    }

    async function startPhaseTimer(phase, duration, serverStartTime = null) {
        if (!duration || isNaN(duration) || duration <= 0) {
            let fallback = 0;
            if (phase === 'prepare') fallback = getPrepareDuration(gameState?.round || 1);
            else if (phase === 'battle') fallback = getBattleDuration(gameState?.round || 1);
            else if (phase === 'settle') fallback = SETTLE_DURATION;
            else fallback = 3;
            log(`⚠️ 无效duration=${duration}，使用后备${fallback}`, true);
            duration = fallback;
        }
        clearAllTimers();
        currentPhaseDuration = duration;
        if (serverStartTime === null) {
            const nowServer = await getServerTime();
            currentPhaseStartServerTime = nowServer;
            gameState.phaseStartTime = new Date(nowServer).toISOString();
            await updateGameStateToDB();
        } else {
            currentPhaseStartServerTime = serverStartTime;
        }
        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(duration, phase);
        timerInterval = setInterval(async () => {
            const nowServer = await getServerTime();
            const elapsed = Math.floor((nowServer - currentPhaseStartServerTime) / 1000);
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
                log(`⚠️ 阶段${phase}超时强制结束`, true);
                clearTimeout(phaseTimer);
                phaseTimer = null;
                clearInterval(timerInterval);
                timerInterval = null;
                onPhaseEnd(phase);
            }
        }, (duration + 2) * 1000);
    }

    // ---------- 阶段切换 ----------
    async function startBuffering(targetPhase) {
        log(`⏳ 缓冲期${BUFFER_DURATION}s → ${targetPhase}`);
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
            if (!accessToken) { log('❌ 无token', true); return false; }
            const res = await fetch(SETTLEMENT_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            const result = await res.json();
            if (!res.ok || !result.success) { log(`❌ settlement失败: ${result.error}`, true); return false; }
            log(`✅ settlement成功，新回合: ${result.round}`);
            return true;
        } catch (err) { log(`❌ settlement异常: ${err.message}`, true); return false; }
    }

    async function onPhaseEnd(phase) {
        if (isInPhaseTransition) { log(`⚠️ 阶段切换被锁: ${phase}`, true); return; }
        if (!gameState || !currentRoomId) return;
        isInPhaseTransition = true;
        const lockTimeout = setTimeout(() => {
            if (isInPhaseTransition) { log(`⚠️ 阶段切换锁超时强制释放`, true); isInPhaseTransition = false; }
        }, 12000);
        log(`🔄 阶段结束: ${phase}`);
        try {
            if (phase === 'prepare') {
                await startBuffering('battle');
                gameState.phase = 'battle';
                await updateGameStateToDB();
                await applyUIMode(false);
                const battleDur = getBattleDuration(gameState.round);
                startPhaseTimer('battle', battleDur);
                await simulateBattle();
            } else if (phase === 'battle') {
                gameState.phase = 'settle';
                await updateGameStateToDB();
                await applyUIMode(false);
                startPhaseTimer('settle', SETTLE_DURATION);
            } else if (phase === 'settle') {
                const success = await callSettlement();
                if (success) await fetchGameState();
                else await fetchGameState(); // 即使失败也拉取最新
                const over = checkGameOver();
                if (over.isOver) { endGame(over.winner); clearTimeout(lockTimeout); return; }
                // 后端已将 phase 改为 prepare, round+1
                await applyUIMode(true);
                const newPrepareDur = getPrepareDuration(gameState.round);
                log(`🔁 第${gameState.round}回合准备阶段，时长${newPrepareDur}s`);
                startPhaseTimer('prepare', newPrepareDur);
            }
        } catch (e) { log(`❌ onPhaseEnd错误: ${e.message}`, true); }
        finally { clearTimeout(lockTimeout); isInPhaseTransition = false; }
    }

    async function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch(e) {}
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(isPrepare ? 'prepare' : (gameState?.phase === 'settle' ? 'settle' : 'battle'));
        const prepareTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
        if (!isPrepare) {
            await fetchGameState();
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        }
    }

    async function simulateBattle() {
        try {
            await fetchGameState();
            if (!window.YYCardCombat) { log('❌ 战斗模块未加载', true); return; }
            await window.YYCardCombat.resolveBattles(gameState, log, async () => {
                if (currentRoomId && gameState) await updateGameStateToDB();
            });
        } catch (e) { log(`❌ 战斗模拟出错: ${e.message}`, true); }
    }

    // ---------- 淘汰与结束 ----------
    function checkGameOver() { /* 同之前代码，略 */ }
    function endGame(winnerId) { /* 同之前代码，略 */ }

    // ========== 重连核心：只根据 gameStartTime + 服务器时间计算 ==========
    function getPhaseDuration(phase, round) {
        if (phase === 'prepare') return getPrepareDuration(round);
        if (phase === 'buffering') return BUFFER_DURATION;
        if (phase === 'battle') return getBattleDuration(round);
        if (phase === 'settle') return SETTLE_DURATION;
        return 3;
    }

    // 给定起始时间戳（毫秒，服务器时间），计算当前应处的回合、阶段、剩余秒数
    async function calculateCurrentPhaseFromStart(gameStartTimeMs) {
        const nowServer = await getServerTime();
        let elapsed = Math.floor((nowServer - gameStartTimeMs) / 1000);
        let round = 1;
        while (true) {
            const prep = getPrepareDuration(round);
            const buf = BUFFER_DURATION;
            const bat = getBattleDuration(round);
            const set = SETTLE_DURATION;
            const total = prep + buf + bat + set;
            if (elapsed >= total) {
                elapsed -= total;
                round++;
                if (round > 100) break;
            } else {
                if (elapsed < prep) return { round, phase: 'prepare', remaining: prep - elapsed };
                if (elapsed < prep + buf) return { round, phase: 'buffering', remaining: prep + buf - elapsed };
                if (elapsed < prep + buf + bat) return { round, phase: 'battle', remaining: prep + buf + bat - elapsed };
                return { round, phase: 'settle', remaining: total - elapsed };
            }
        }
        return { round: 1, phase: 'prepare', remaining: getPrepareDuration(1) };
    }

    async function fastForwardAndResume() {
        if (!gameState || !gameState.gameStartTime) {
            log('❌ 缺少 gameStartTime，无法重连', true);
            return false;
        }
        const gameStartMs = new Date(gameState.gameStartTime).getTime();
        const { round: targetRound, phase: targetPhase, remaining } = await calculateCurrentPhaseFromStart(gameStartMs);
        log(`📡 重连计算: 第${targetRound}回合 ${targetPhase} 剩余${remaining}s (本地存储round=${gameState.round})`);

        // 如果推算回合大于本地存储，说明错过了结算，先拉取最新状态
        if (targetRound > gameState.round) {
            log(`⏩ 回合落后，拉取最新状态`);
            await fetchGameState();
            // 重新用最新的 gameStartTime 计算（实际上 startTime 不变，但 round 已更新）
            const newCalc = await calculateCurrentPhaseFromStart(gameStartMs);
            if (newCalc.round !== targetRound || newCalc.phase !== targetPhase) {
                // 同步到本地 state
                gameState.round = newCalc.round;
                gameState.phase = newCalc.phase;
                await updateGameStateToDB();
            }
            // 重新获取剩余时间
            const finalRemaining = newCalc.remaining;
            if (finalRemaining <= 0) {
                log(`⏩ 阶段已过期，立即触发切换`);
                onPhaseEnd(gameState.phase);
                return true;
            }
            await applyUIMode(gameState.phase === 'prepare');
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            clearAllTimers();
            startPhaseTimer(gameState.phase, finalRemaining, null);
            return true;
        }

        // 正常情况：更新本地 phase 和 round（不依赖数据库 phaseStartTime）
        if (targetRound !== gameState.round || targetPhase !== gameState.phase) {
            gameState.round = targetRound;
            gameState.phase = targetPhase;
            await updateGameStateToDB();
        }
        if (remaining <= 0) {
            log(`⏩ 阶段已过期，立即触发切换`);
            onPhaseEnd(gameState.phase);
            return true;
        }
        await applyUIMode(gameState.phase === 'prepare');
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        clearAllTimers();
        // 启动计时器时，计算该阶段应该开始的服务器时间（用于倒计时）
        const nowServer = await getServerTime();
        const phaseStartServer = nowServer - (getPhaseDuration(gameState.phase, gameState.round) - remaining) * 1000;
        startPhaseTimer(gameState.phase, remaining, phaseStartServer);
        return true;
    }

    // ---------- 进入对战 ----------
    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initDebugPanel();
        eliminationOrder = [];
        let shopReady = false;
        for (let i = 0; i < 30; i++) {
            if (window.YYCardShop && typeof window.YYCardShop.init === 'function') {
                window.YYCardShop.init();
                shopReady = true;
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        if (!shopReady && window.YYCardShop) window.YYCardShop.init();
        subscribeToGame(roomId);
        startPolling();
        bindBattleEvents();
        startBotAutoPlay();
        let attempts = 0; const MAX = 15;
        const wait = async () => {
            if (gameState) {
                if (!gameState.gameStartTime) {
                    gameState.gameStartTime = new Date().toISOString();
                    await updateGameStateToDB();
                }
                await fastForwardAndResume();
                return;
            }
            if (attempts < MAX) {
                attempts++;
                const { data } = await supabase.from('game_states').select('state').eq('room_id', roomId).maybeSingle();
                if (data?.state) {
                    gameState = data.state;
                    if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                }
                setTimeout(wait, 200);
            } else {
                toast('状态加载失败', true);
                enterGuard = false;
            }
        };
        wait();
    }

    function subscribeToGame(roomId) {
        if (gameSubscription) gameSubscription.unsubscribe();
        gameSubscription = supabase.channel(`game:${roomId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_states', filter: `room_id=eq.${roomId}` }, (payload) => {
                if (isUpdatingFromLocal) return;
                gameState = payload.new.state;
                applyUIMode(gameState.phase === 'prepare');
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            })
            .subscribe();
    }

    function startPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(async () => {
            if (!currentRoomId || isInPhaseTransition) return;
            const { data } = await supabase.from('game_states').select('state').eq('room_id', currentRoomId).single();
            if (data?.state) {
                gameState = data.state;
                applyUIMode(gameState.phase === 'prepare');
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            }
        }, 2000);
    }

    function stopPolling() { if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; } }
    function startBotAutoPlay() { if (autoBotTimer) clearInterval(autoBotTimer); autoBotTimer = setInterval(() => {}, 2000); }
    function bindBattleEvents() { /* 同之前 */ }

    return {
        enterBattle,
        getGameState,
        getCurrentRoomId,
        forceRefreshState,
        fetchGameState,
    };
})();

console.log('✅ battle.js 加载完成（完全基于 gameStartTime + 服务器时间驱动）');

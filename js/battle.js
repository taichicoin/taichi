// ==================== 对战系统（基于初始化时间 + 重试调用 settlement） ====================
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

    const BUFFER_DURATION = 3;          // 缓冲期改为 3 秒
    const SETTLE_DURATION = 3;

    function getPrepareDuration(round) { return 25 + (round - 1) * 10; }
    function getBattleDuration(round) { return 30 + (round - 1) * 5; }

    // ========== 根据 gameStartTime 和当前 round 计算理论阶段 ==========
    function getCurrentPhaseInfo(gameStartTime, currentRound) {
        const start = new Date(gameStartTime).getTime();
        const now = Date.now();
        let elapsed = Math.floor((now - start) / 1000);
        let round = 1;
        let phase = 'prepare';
        let remaining = 0;
        while (true) {
            const prep = getPrepareDuration(round);
            const buf = BUFFER_DURATION;
            const bat = getBattleDuration(round);
            const set = SETTLE_DURATION;
            const total = prep + buf + bat + set;
            if (elapsed >= total) {
                elapsed -= total;
                round++;
            } else {
                if (elapsed < prep) {
                    phase = 'prepare';
                    remaining = prep - elapsed;
                } else if (elapsed < prep + buf) {
                    phase = 'buffering';
                    remaining = prep + buf - elapsed;
                } else if (elapsed < prep + buf + bat) {
                    phase = 'battle';
                    remaining = prep + buf + bat - elapsed;
                } else {
                    phase = 'settle';
                    remaining = total - elapsed;
                }
                break;
            }
            if (round > currentRound + 20) break;
        }
        return { round, phase, remaining };
    }

    // 初始化调试面板等（保持不变）
    function initDebugPanel() { /* 原有代码 */ }
    function logToScreen(msg, isError, persistent) { /* 原有代码 */ }
    function toast(msg, isError) { /* 原有代码 */ }
    function getGameState() { return gameState; }
    function getCurrentRoomId() { return currentRoomId; }

    async function updateGameState() { /* 原有代码 */ }
    async function forceRefreshState() { /* 原有代码 */ }
    function log(msg, isError, persistent) { /* 原有代码 */ }
    function getShopLevelByExp(exp) { /* 原有代码 */ }
    let safetyTimer = null;
    function clearAllTimers() { /* 原有代码 */ }

    // 修改后的 startPhaseTimer：基于理论剩余时间
    function startPhaseTimer(phase, duration, skipStateUpdate = false) {
        if (!duration || isNaN(duration) || duration <= 0) {
            let fallback = 0;
            if (phase === 'prepare') fallback = getPrepareDuration(gameState?.round || 1);
            else if (phase === 'battle') fallback = getBattleDuration(gameState?.round || 1);
            else if (phase === 'settle') fallback = SETTLE_DURATION;
            else fallback = 3;
            duration = fallback;
        }
        clearAllTimers();
        currentPhaseDuration = duration;
        if (!skipStateUpdate) {
            gameState.phaseStartTime = new Date().toISOString();
            currentPhaseStartTime = Date.now();
            updateGameState();
        } else {
            // 使用理论剩余时间时，不需要 phaseStartTime
            currentPhaseStartTime = Date.now();
        }
        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(duration, phase);
        timerInterval = setInterval(() => {
            // 重新计算理论剩余时间，避免累积误差
            if (gameState && gameState.gameStartTime) {
                const info = getCurrentPhaseInfo(gameState.gameStartTime, gameState.round);
                if (info.phase === phase) {
                    const remaining = Math.max(0, info.remaining);
                    if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(remaining, phase);
                } else {
                    // 阶段已经变化，清除计时器
                    clearInterval(timerInterval);
                    timerInterval = null;
                }
            } else {
                const elapsed = Math.floor((Date.now() - currentPhaseStartTime) / 1000);
                const remaining = Math.max(0, currentPhaseDuration - elapsed);
                if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(remaining, phase);
            }
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

    async function startBuffering(targetPhase) { /* 原有代码，使用 BUFFER_DURATION=3 */ }

    async function onPhaseEnd(phase) {
        if (isInPhaseTransition) { log(`⚠️ 阶段切换被锁拦截: ${phase}`, true); return; }
        if (!gameState || !currentRoomId) return;
        isInPhaseTransition = true;
        const lockTimeout = setTimeout(() => { if (isInPhaseTransition) { log(`⚠️ 阶段切换锁超时，强制释放`, true); isInPhaseTransition = false; } }, 12000);
        log(`🔄 阶段结束: ${phase}`);
        try {
            if (phase === 'prepare') {
                await startBuffering('battle');
                gameState.phase = 'battle';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                await applyUIMode(false);
                // 战斗阶段时长使用理论值
                const battleDur = getBattleDuration(gameState.round);
                startPhaseTimer('battle', battleDur);
                await simulateBattle();
            } else if (phase === 'battle') {
                gameState.phase = 'settle';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                await applyUIMode(false);
                startPhaseTimer('settle', SETTLE_DURATION);
            } else if (phase === 'settle') {
                // 调用 settlement 函数，带重试机制
                const userId = auth.currentUser?.id;
                const roomId = currentRoomId;
                const { data: { session } } = await supabase.auth.getSession();
                const accessToken = session?.access_token;
                if (!accessToken) {
                    log('❌ 无法获取 accessToken，跳过回合结束处理', true);
                } else {
                    let retries = 0;
                    const maxRetries = 10;
                    let success = false;
                    while (retries < maxRetries && !success) {
                        // 每次重试前，重新计算理论阶段，如果已经不是 settle，则停止重试
                        const info = getCurrentPhaseInfo(gameState.gameStartTime, gameState.round);
                        if (info.phase !== 'settle') {
                            log(`⏭️ 理论阶段已是 ${info.phase}，停止重试`, false, true);
                            break;
                        }
                        if (info.remaining > 0) {
                            log(`⏳ 理论结算剩余 ${info.remaining} 秒，等待...`, false, true);
                            await new Promise(r => setTimeout(r, 500));
                            retries++;
                            continue;
                        }
                        try {
                            const url = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';
                            const response = await fetch(url, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                                body: JSON.stringify({ roomId })
                            });
                            const data = await response.json();
                            log(`📡 settlement 响应: ${response.status} ${JSON.stringify(data)}`, false, true);
                            if (response.ok && data.success) {
                                success = true;
                                log(`✅ 回合结束处理成功，新回合: ${data.round}`, false, true);
                            } else {
                                log(`⚠️ 处理失败 (${data.error})，重试 ${retries+1}/${maxRetries}`, true, true);
                                await new Promise(r => setTimeout(r, 500));
                                retries++;
                            }
                        } catch (err) {
                            log(`❌ 调用异常: ${err.message}，重试 ${retries+1}/${maxRetries}`, true, true);
                            await new Promise(r => setTimeout(r, 500));
                            retries++;
                        }
                    }
                    if (!success) {
                        log(`❌ 最终失败，手动推进回合（仅用于测试）`, true, true);
                        // 降级：手动增加回合（避免卡死）
                        gameState.round++;
                        gameState.phase = 'prepare';
                        gameState.phaseStartTime = new Date().toISOString();
                        await updateGameState();
                    }
                }
                // 强制刷新最新状态
                await forceRefreshState();
                const over = checkGameOver();
                if (over.isOver) {
                    endGame(over.winner);
                    clearTimeout(lockTimeout);
                    return;
                }
                await applyUIMode(true);
                const newPrepareDur = getPrepareDuration(gameState.round);
                log(`🔁 进入第 ${gameState.round} 回合准备阶段，时长 ${newPrepareDur} 秒`, false, true);
                startPhaseTimer('prepare', newPrepareDur);
            }
        } catch (e) {
            log(`❌ onPhaseEnd 出错: ${e.message}`, true);
        } finally {
            clearTimeout(lockTimeout);
            isInPhaseTransition = false;
        }
    }

    async function applyUIMode(isPrepare) { /* 原有代码 */ }
    async function simulateBattle() { /* 原有代码 */ }
    function checkGameOver() { /* 原有代码 */ }
    function endGame(winnerId) { /* 原有代码 */ }
    async function fastForwardAndResume() { /* 原有代码（需稍作修改，使用 getCurrentPhaseInfo） */ }
    function getPhaseDuration(phase, round) { /* 原有代码 */ }
    async function enterBattle(roomId) { /* 原有代码 */ }
    function subscribeToGame(roomId) { /* 原有代码 */ }
    function startPolling() { /* 原有代码 */ }
    function stopPolling() { /* 原有代码 */ }
    function startBotAutoPlay() { /* 原有代码 */ }
    function bindBattleEvents() { /* 原有代码 */ }

    // 删除所有玩家操作方法（已迁移）

    return {
        enterBattle,
        getGameState,
        getCurrentRoomId,
        forceRefreshState,
        updateGameState,
    };
})();

console.log('✅ battle.js 加载完成（基于初始化时间 + 重试机制，缓冲期3秒）');

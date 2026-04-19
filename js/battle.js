// ==================== 对战系统（基于原版，仅移除玩家操作 + 结算改为调用后端） ====================
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

    function initDebugPanel() { /* 保持不变 */ }
    function logToScreen(msg, isError, persistent) { /* 保持不变 */ }
    function toast(msg, isError) { /* 保持不变 */ }
    function getGameState() { return gameState; }
    function getCurrentRoomId() { return currentRoomId; }

    async function updateGameState() { /* 保持不变 */ }
    async function forceRefreshState() { /* 保持不变 */ }
    function log(msg, isError, persistent) { /* 保持不变 */ }
    function getShopLevelByExp(exp) { /* 保持不变 */ }

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
            log(`⚠️ startPhaseTimer 收到无效 duration=${duration}，使用后备值 ${fallback}`, true);
            duration = fallback;
        }
        clearAllTimers();
        currentPhaseDuration = duration;
        if (!skipStateUpdate) {
            gameState.phaseStartTime = new Date().toISOString();
            currentPhaseStartTime = Date.now();
            updateGameState();
        } else {
            currentPhaseStartTime = Date.now() - (getPhaseDuration(phase, gameState.round) - duration) * 1000;
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
        log(`⏳ 进入缓冲期 ${BUFFER_DURATION} 秒，准备切换到 ${targetPhase} 阶段`);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase('buffering');
        if (window.YYCardShop?.updateTimerDisplay) {
            window.YYCardShop.updateTimerDisplay(BUFFER_DURATION, 'buffering');
        }
        await new Promise(resolve => setTimeout(resolve, BUFFER_DURATION * 1000));
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(targetPhase);
    }

    // ========== 新增：调用后端 settlement 函数（带重试） ==========
    async function callSettlementWithRetry() {
        const maxRetries = 30;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.access_token) {
                    log('❌ 无法获取 accessToken，停止结算调用', true);
                    return;
                }
                const response = await fetch('https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                    body: JSON.stringify({ roomId: currentRoomId })
                });
                const data = await response.json();
                if (response.ok && data.success) {
                    log(`✅ 结算成功，新回合: ${data.round}`, false);
                    await forceRefreshState();
                    return;
                } else if (data.alreadyProcessed) {
                    log(`✅ 回合已处理，无需重复`, false);
                    await forceRefreshState();
                    return;
                } else {
                    log(`⚠️ 结算失败 (${data.error})，重试 ${attempt+1}`, true);
                }
            } catch (err) {
                log(`❌ 结算异常: ${err.message}，重试 ${attempt+1}`, true);
            }
            await new Promise(r => setTimeout(r, 500));
        }
        log(`❌ 结算重试超时，强制刷新状态`, true);
        await forceRefreshState();
    }

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
                startPhaseTimer('battle', getBattleDuration(gameState.round));
                await simulateBattle();
            } else if (phase === 'battle') {
                gameState.phase = 'settle';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                await applyUIMode(false);
                startPhaseTimer('settle', SETTLE_DURATION);
            } else if (phase === 'settle') {
                // 原版：await distributeRoundRewards();  await refreshAllShops();
                // 改为调用后端函数
                await callSettlementWithRetry();
                const over = checkGameOver();
                if (over.isOver) {
                    endGame(over.winner);
                    clearTimeout(lockTimeout);
                    return;
                }
                // 注意：后端已经将 round++ 和 phase 改为 prepare，但为了兼容原版逻辑，我们仍然手动更新本地状态
                // 因为 callSettlementWithRetry 中已经 forceRefreshState，所以 gameState 已是最新
                await applyUIMode(true);
                const newPrepareDur = getPrepareDuration(gameState.round);
                log(`🔁 进入第 ${gameState.round} 回合准备阶段，时长 ${newPrepareDur} 秒`);
                startPhaseTimer('prepare', newPrepareDur);
            }
        } catch (e) {
            log(`❌ onPhaseEnd 出错: ${e.message}`, true);
        } finally {
            clearTimeout(lockTimeout);
            isInPhaseTransition = false;
        }
    }

    async function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch(e) {}
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(isPrepare ? 'prepare' : (gameState?.phase === 'settle' ? 'settle' : 'battle'));
        const prepareTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
        if (!isPrepare) {
            const { data: fresh, error } = await supabase.from('game_states').select('state').eq('room_id', currentRoomId).single();
            if (!error && fresh?.state) { gameState = fresh.state; log(`🔄 进入战斗/结算，已同步最新数据`); }
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        }
    }

    async function simulateBattle() {
        try {
            const { data: freshState, error } = await supabase.from('game_states').select('state').eq('room_id', currentRoomId).single();
            if (freshState?.state) gameState = freshState.state;
            if (!window.YYCardCombat) { await updateGameState(); return; }
            await window.YYCardCombat.resolveBattles(gameState, log, updateGameState);
        } catch(e) { await updateGameState(); }
    }

    // 注意：distributeRoundRewards 和 refreshAllShops 不再需要，但保留函数体以避免引用错误（但不会被调用）
    async function distributeRoundRewards() { /* 已废弃 */ }
    async function refreshAllShops() { /* 已废弃 */ }

    function checkGameOver() { /* 保持不变 */ }
    function endGame(winnerId) { /* 保持不变 */ }
    async function fastForwardAndResume() { /* 保持不变 */ }
    function getPhaseDuration(phase, round) { /* 保持不变 */ }
    async function enterBattle(roomId) { /* 保持不变 */ }
    function subscribeToGame(roomId) { /* 保持不变 */ }
    function startPolling() { /* 保持不变 */ }
    function stopPolling() { /* 保持不变 */ }
    function startBotAutoPlay() { /* 保持不变 */ }
    function bindBattleEvents() { /* 保持不变 */ }

    // ========== 已删除所有玩家操作函数 ==========
    // buyExpAction, refreshShopAction, buyCardAction, placeCardAction, sellCardAction, buyAndPlaceAction, swapBoardAction, boardToHandAction

    return {
        enterBattle,
        getGameState,
        getCurrentRoomId,
        forceRefreshState,
        updateGameState,
    };
})();

console.log('✅ battle.js 加载完成（原版计时器 + 结算调用后端）');

// ==================== 对战系统（绝对时间驱动，阶段自动切换，结算重试） ====================
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
    let enterGuard = false;

    let isUpdatingFromLocal = false;
    let isInPhaseTransition = false;

    let pollingInterval = null;
    let eliminationOrder = [];

    // 固定时长（秒）—— 缓冲期改为 3 秒
    const BUFFER_DURATION = 3;
    const SETTLE_DURATION = 3;

    // 递增时长公式
    function getPrepareDuration(round) { return 25 + (round - 1) * 10; }
    function getBattleDuration(round) { return 30 + (round - 1) * 5; }

    // ========== 根据游戏开始时间计算当前理论阶段和剩余时间 ==========
    function getCurrentPhaseInfo(gameStartTime, currentRound) {
        const start = new Date(gameStartTime).getTime();
        const now = Date.now();
        let elapsed = Math.floor((now - start) / 1000);
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
            } else {
                if (elapsed < prep) return { round, phase: 'prepare', remaining: prep - elapsed };
                if (elapsed < prep + buf) return { round, phase: 'buffering', remaining: prep + buf - elapsed };
                if (elapsed < prep + buf + bat) return { round, phase: 'battle', remaining: prep + buf + bat - elapsed };
                return { round, phase: 'settle', remaining: total - elapsed };
            }
            if (round > currentRound + 20) break;
        }
        return { round: currentRound, phase: 'prepare', remaining: 0 };
    }

    // 调试面板（保留原有，省略具体实现，请从原文件复制）
    function initDebugPanel() { /* 原样 */ }
    function logToScreen(msg, isError, persistent) { /* 原样 */ }
    function toast(msg, isError) { /* 原样 */ }
    function getGameState() { return gameState; }
    function getCurrentRoomId() { return currentRoomId; }

    async function updateGameState() { /* 原样 */ }
    async function forceRefreshState() { /* 原样 */ }
    function log(msg, isError, persistent) { /* 原样 */ }
    function getShopLevelByExp(exp) { /* 原样 */ }

    function clearAllTimers() {
        if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    }

    // 核心：根据理论剩余时间启动下一阶段切换定时器，并每秒刷新UI倒计时
    function startPhaseTimerFromTheory() {
        if (!gameState || !gameState.gameStartTime) return;
        const info = getCurrentPhaseInfo(gameState.gameStartTime, gameState.round);
        const remaining = Math.max(0, info.remaining);
        // 更新UI倒计时
        if (window.YYCardShop?.updateTimerDisplay) {
            window.YYCardShop.updateTimerDisplay(remaining, info.phase);
        }
        // 清除旧定时器
        if (phaseTimer) clearTimeout(phaseTimer);
        if (timerInterval) clearInterval(timerInterval);
        // 每秒刷新倒计时显示
        timerInterval = setInterval(() => {
            if (!gameState || !gameState.gameStartTime) return;
            const newInfo = getCurrentPhaseInfo(gameState.gameStartTime, gameState.round);
            if (window.YYCardShop?.updateTimerDisplay) {
                window.YYCardShop.updateTimerDisplay(Math.max(0, newInfo.remaining), newInfo.phase);
            }
        }, 200);
        // 设置到期定时器：剩余时间到0时，触发阶段更新
        phaseTimer = setTimeout(async () => {
            clearInterval(timerInterval);
            timerInterval = null;
            phaseTimer = null;
            // 重新获取最新状态（可能后端已经更新了回合）
            await forceRefreshState();
            // 重新启动计时器（基于新状态）
            startPhaseTimerFromTheory();
            // 如果当前理论阶段是 settle 且剩余时间 <=0，主动调用结算函数
            const newInfo = getCurrentPhaseInfo(gameState.gameStartTime, gameState.round);
            if (newInfo.phase === 'settle' && newInfo.remaining <= 0) {
                await callSettlementWithRetry();
            }
        }, remaining * 1000);
    }

    // 结算重试函数：在结算阶段不断调用后端直到成功
    async function callSettlementWithRetry() {
        const maxRetries = 30; // 最多重试 15 秒
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const info = getCurrentPhaseInfo(gameState.gameStartTime, gameState.round);
            if (info.phase !== 'settle') {
                log(`⏭️ 理论阶段已是 ${info.phase}，停止结算调用`, false);
                return;
            }
            if (info.remaining > 0) {
                await new Promise(r => setTimeout(r, 500));
                continue;
            }
            try {
                const { data: { session } } = await supabase.auth.getSession();
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

    // 战斗模拟（在战斗阶段开始时调用）
    async function simulateBattle() {
        try {
            const { data: freshState, error } = await supabase.from('game_states').select('state').eq('room_id', currentRoomId).single();
            if (freshState?.state) gameState = freshState.state;
            if (!window.YYCardCombat) { await updateGameState(); return; }
            await window.YYCardCombat.resolveBattles(gameState, log, updateGameState);
        } catch(e) { await updateGameState(); }
    }

    // 检查游戏结束
    function checkGameOver() { /* 原样 */ }
    function endGame(winnerId) { /* 原样 */ }

    // 重连快进
    async function fastForwardAndResume() {
        if (!gameState || !gameState.gameStartTime) return false;
        const info = getCurrentPhaseInfo(gameState.gameStartTime, gameState.round);
        // 如果理论回合大于存储回合，说明后端可能已推进，强制刷新
        if (info.round > gameState.round) {
            await forceRefreshState();
            return true;
        }
        // 否则直接应用理论阶段
        gameState.phase = info.phase;
        await updateGameState();
        await applyUIMode(info.phase === 'prepare');
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        clearAllTimers();
        startPhaseTimerFromTheory();
        return true;
    }

    async function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch(e) {}
        if (window.YYCardShop?.setPhase) {
            window.YYCardShop.setPhase(isPrepare ? 'prepare' : (gameState?.phase === 'settle' ? 'settle' : 'battle'));
        }
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

    // 进入战斗
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
        // 等待 gameState 加载
        let attempts = 0; const MAX = 15;
        const wait = async () => {
            if (gameState) {
                if (!gameState.gameStartTime) {
                    gameState.gameStartTime = new Date().toISOString();
                    await updateGameState();
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
            } else { toast('状态加载失败', true); enterGuard = false; }
        };
        wait();
    }

    function subscribeToGame(roomId) { /* 原样 */ }
    function startPolling() { /* 原样 */ }
    function stopPolling() { /* 原样 */ }
    function startBotAutoPlay() { /* 原样 */ }
    function bindBattleEvents() { /* 原样 */ }

    // 删除所有玩家操作函数（已迁移）

    return {
        enterBattle,
        getGameState,
        getCurrentRoomId,
        forceRefreshState,
        updateGameState,
    };
})();

console.log('✅ battle.js 加载完成（绝对时间驱动，缓冲期3秒，结算重试）');

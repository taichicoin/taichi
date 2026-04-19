// ==================== 对战系统（仅保留后台逻辑和状态机，玩家操作已移至后端函数） ====================
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
    function clearAllTimers() { /* 保持不变 */ }
    function startPhaseTimer(phase, duration, skipStateUpdate) { /* 保持不变 */ }
    async function startBuffering(targetPhase) { /* 保持不变 */ }
    async function onPhaseEnd(phase) { /* 保持不变 */ }
    async function applyUIMode(isPrepare) { /* 保持不变 */ }
    async function simulateBattle() { /* 保持不变 */ }

    // 后台逻辑：发放回合奖励
    async function distributeRoundRewards() {
        const round = gameState.round;
        const goldAdd = config.ECONOMY.GOLD_PER_ROUND(round);
        const expAdd = config.ECONOMY.EXP_PER_ROUND;
        for (const pid in gameState.players) {
            const p = gameState.players[pid];
            p.gold += goldAdd;
            p.exp += expAdd;
            const newLevel = getShopLevelByExp(p.exp);
            if (newLevel > p.shopLevel) p.shopLevel = newLevel;
        }
        await updateGameState();
    }

    // 后台逻辑：刷新所有玩家的商店（新回合）
    async function refreshAllShops() {
        if (!gameState || gameState.phase !== 'prepare') return;
        for (const pid in gameState.players) {
            gameState.players[pid].shopCards = await utils.generateShopCards(gameState.players[pid].shopLevel);
        }
    }

    function checkGameOver() { /* 保持不变 */ }
    function endGame(winnerId) { /* 保持不变 */ }
    async function fastForwardAndResume() { /* 保持不变 */ }
    function getPhaseDuration(phase, round) { /* 保持不变 */ }
    async function enterBattle(roomId) { /* 保持不变 */ }
    function subscribeToGame(roomId) { /* 保持不变 */ }
    function startPolling() { /* 保持不变 */ }
    function stopPolling() { /* 保持不变 */ }

    // 人机自动升级（后台逻辑）
    function startBotAutoPlay() {
        if (autoBotTimer) clearInterval(autoBotTimer);
        const bought = {};
        autoBotTimer = setInterval(async () => {
            if (!gameState || gameState.phase !== 'prepare') return;
            const uid = auth.currentUser?.id;
            const my = gameState.players[uid];
            if (!my || !my.isBot) return;
            if (bought[uid] === gameState.round) return;
            if (my.shopLevel >= 5) return;
            if (my.gold >= 1) {
                my.gold--; my.exp++;
                const lvl = getShopLevelByExp(my.exp);
                if (lvl > my.shopLevel) my.shopLevel = lvl;
                await updateGameState();
                bought[uid] = gameState.round;
            }
        }, 2000);
    }

    function bindBattleEvents() { /* 保持不变 */ }

    // 注意：以下玩家操作函数已全部删除，因为已迁移到 Edge Function
    // buyExpAction, buyCardAction, placeCardAction, sellCardAction, buyAndPlaceAction, swapBoardAction, boardToHandAction

    return {
        enterBattle,
        getGameState,
        getCurrentRoomId,
        forceRefreshState,
        updateGameState,   // 仍用于后台逻辑，但前端不应再直接调用
        // 不再暴露任何玩家操作方法
    };
})();

console.log('✅ battle.js 加载完成（已移除玩家操作，仅保留后台逻辑和状态机）');

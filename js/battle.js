// ==================== 对战系统【终极实时同步版】 ====================
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

    // 调试面板
    function initDebugPanel() {
        const old = document.getElementById('battle-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'battle-debug-panel';
        p.style.cssText = `
            position:fixed; top:0; left:0; right:0; bottom:0;
            overflow-y:auto;
            color:#7bffb1; font-size:12px; padding:8px; z-index:100000;
            font-family:monospace; pointer-events:none; text-shadow:0 0 4px black;
            background: transparent; border: none;
            display: flex; flex-direction: column-reverse;
        `;
        document.body.appendChild(p);
        return p;
    }

    function logToScreen(msg, isError = false) {
        const p = document.getElementById('battle-debug-panel') || initDebugPanel();
        const line = document.createElement('div');
        line.style.color = isError ? '#ff7b7b' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
        p.insertBefore(line, p.firstChild);
        while (p.children.length > 100) p.removeChild(p.lastChild);
    }

    function toast(msg, isError = false) {
        if (window.YYCardShop?.toast) window.YYCardShop.toast(msg, isError);
        else alert(msg);
    }

    function getGameState() { return gameState; }
    async function updateGameState() {
        if (!currentRoomId || !gameState) return;
        isUpdatingFromLocal = true;
        await supabase.from('game_states').update({ state: gameState }).eq('room_id', currentRoomId);
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        setTimeout(() => { isUpdatingFromLocal = false; }, 100);
    }
    function log(msg, isError = false) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        logToScreen(msg, isError);
    }

    // 回合时长
    function getPrepareDuration(r) { return 25 + (r-1)*10; }
    function getBattleDuration(r) { return 30 + (r-1)*5; }
    const SETTLE_DURATION = 3;
    function getPhaseDuration(phase, round) {
        if (phase === 'prepare') return getPrepareDuration(round);
        if (phase === 'battle') return getBattleDuration(round);
        return SETTLE_DURATION;
    }

    function getShopLevelByExp(exp) {
        if (exp >= 46) return 5;
        if (exp >= 26) return 4;
        if (exp >= 12) return 3;
        if (exp >= 4) return 2;
        return 1;
    }

    function clearAllTimers() {
        if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    }

    function startPhaseTimer(phase, duration, skipStateUpdate = false) {
        clearAllTimers();
        if (!duration || duration <= 0) duration = getPhaseDuration(phase, gameState?.round || 1);
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
            clearInterval(timerInterval); timerInterval = null; phaseTimer = null;
            onPhaseEnd(phase);
        }, duration * 1000);
    }

    async function onPhaseEnd(phase) {
        if (isInPhaseTransition) { log(`⚠️ 阶段切换被锁拦截: ${phase}`, true); return; }
        if (!gameState || !currentRoomId) return;
        
        isInPhaseTransition = true;
        const lockTimeout = setTimeout(() => {
            if (isInPhaseTransition) { log(`⚠️ 阶段切换锁超时，强制释放`, true); isInPhaseTransition = false; }
        }, 10000);
        
        log(`🔄 阶段结束: ${phase}`);
        try {
            if (phase === 'prepare') {
                gameState.phase = 'battle';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                applyUIMode(false);
                startPhaseTimer('battle', getBattleDuration(gameState.round));
                await simulateBattle();
            } else if (phase === 'battle') {
                gameState.phase = 'settle';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                applyUIMode(false);
                startPhaseTimer('settle', SETTLE_DURATION);
            } else if (phase === 'settle') {
                await distributeRoundRewards();
                const over = checkGameOver();
                if (over.isOver) { endGame(over.winner); clearTimeout(lockTimeout); return; }
                gameState.round++;
                gameState.phase = 'prepare';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                applyUIMode(true);
                await refreshAllShops();
                startPhaseTimer('prepare', getPrepareDuration(gameState.round));
            }
        } catch (e) {
            log(`❌ onPhaseEnd 出错: ${e.message}`, true);
        } finally {
            clearTimeout(lockTimeout);
            isInPhaseTransition = false;
        }
    }

    function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch (e) {}
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(isPrepare ? 'prepare' : 'battle');
        const prepareTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
    }

    // 战斗模拟（强制拉取最新状态）
    async function simulateBattle() {
        try {
            const { data: freshState } = await supabase.from('game_states').select('state').eq('room_id', currentRoomId).single();
            if (freshState?.state) { gameState = freshState.state; log(`🔄 已同步最新战斗数据`); }
            if (!window.YYCardCombat) { log('❌ 战斗模块未加载', true); return; }
            await window.YYCardCombat.resolveBattles(gameState, log, updateGameState);
        } catch (e) {
            log(`❌ 战斗模拟出错: ${e.message}`, true);
            await updateGameState();
        }
    }

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
        log(`💰 回合奖励: 金币 +${goldAdd}, 经验 +${expAdd}`);
    }

    async function refreshAllShops() {
        for (const pid in gameState.players) {
            gameState.players[pid].shopCards = await utils.generateShopCards(gameState.players[pid].shopLevel);
        }
    }

    function checkGameOver() {
        const alive = Object.values(gameState.players).filter(p => p.health > 0);
        if (alive.length <= 1) {
            const winner = alive[0] ? Object.keys(gameState.players).find(id => gameState.players[id] === alive[0]) : 'bot';
            return { isOver: true, winner };
        }
        return { isOver: false };
    }

    function endGame(winnerId) {
        isInPhaseTransition = false;
        log(`🏆 游戏结束！胜利者: ${winnerId}`);
        toast(`游戏结束！胜利者: ${winnerId}`);
        clearAllTimers();
        if (autoBotTimer) clearInterval(autoBotTimer);
        if (gameSubscription) gameSubscription.unsubscribe();
        setTimeout(() => {
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
            enterGuard = false;
        }, 3000);
    }

    // 重连
    async function fastForwardAndResume() {
        if (!gameState || !gameState.gameStartTime) return false;
        const start = new Date(gameState.gameStartTime).getTime();
        const now = Date.now();
        let elapsed = Math.floor((now - start) / 1000);
        let round = 1, phase = 'prepare', remaining = 0;
        while (true) {
            const prep = getPrepareDuration(round), bat = getBattleDuration(round);
            const total = prep + bat + SETTLE_DURATION;
            if (elapsed >= total) { elapsed -= total; round++; }
            else {
                if (elapsed < prep) { phase = 'prepare'; remaining = prep - elapsed; }
                else if (elapsed < prep + bat) { phase = 'battle'; remaining = prep + bat - elapsed; }
                else { phase = 'settle'; remaining = total - elapsed; }
                break;
            }
        }
        const oldRound = gameState.round;
        if (round > oldRound) {
            log(`⏩ 快进补发 ${oldRound} → ${round}`);
            for (let r = oldRound; r < round; r++) {
                const gold = config.ECONOMY.GOLD_PER_ROUND(r);
                const exp = config.ECONOMY.EXP_PER_ROUND;
                for (const pid in gameState.players) {
                    const p = gameState.players[pid];
                    p.gold += gold; p.exp += exp;
                    const lvl = getShopLevelByExp(p.exp);
                    if (lvl > p.shopLevel) p.shopLevel = lvl;
                }
            }
        }
        gameState.round = round;
        gameState.phase = phase;
        gameState.phaseStartTime = new Date(now - (getPhaseDuration(phase, round) - remaining) * 1000).toISOString();
        await refreshAllShops();
        await updateGameState();
        applyUIMode(phase === 'prepare');
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        clearAllTimers();
        startPhaseTimer(phase, remaining);
        return true;
    }

    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initDebugPanel();
        
        // 等待 shop 模块
        for (let i = 0; i < 30; i++) {
            if (window.YYCardShop?.init) { window.YYCardShop.init(); break; }
            await new Promise(r => setTimeout(r, 100));
        }
        
        subscribeToGame(roomId);
        bindBattleEvents();
        startBotAutoPlay();

        let attempts = 0;
        const wait = async () => {
            if (gameState) {
                if (!gameState.gameStartTime) { gameState.gameStartTime = new Date().toISOString(); await updateGameState(); }
                const resumed = await fastForwardAndResume();
                if (!resumed) {
                    const phase = gameState.phase, round = gameState.round;
                    applyUIMode(phase === 'prepare');
                    if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                    if (gameState.phaseStartTime) {
                        const st = new Date(gameState.phaseStartTime).getTime();
                        const el = Math.floor((Date.now() - st) / 1000);
                        const total = getPhaseDuration(phase, round);
                        const rem = Math.max(0, total - el);
                        if (rem <= 0) onPhaseEnd(phase);
                        else { currentPhaseStartTime = st; startPhaseTimer(phase, rem, true); }
                    } else startPhaseTimer(phase, getPhaseDuration(phase, round));
                }
                return;
            }
            if (attempts < 15) {
                attempts++;
                const { data } = await supabase.from('game_states').select('state').eq('room_id', roomId).maybeSingle();
                if (data?.state) { gameState = data.state; if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI(); }
                setTimeout(wait, 200);
            } else { toast('状态加载失败', true); enterGuard = false; }
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
                // 强制刷新 UI，并输出对手棋盘供调试
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                const uid = auth.currentUser?.id;
                const oppId = Object.keys(gameState.players).find(id => id !== uid);
                if (oppId) {
                    const oppBoard = gameState.players[oppId].board;
                    log(`📡 远程更新: 对手棋盘 ${oppBoard.map(c => c?.name || '空').join(' ')}`);
                }
            })
            .subscribe();
    }

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
            if (my.gold >= 1) { my.gold--; my.exp++; const lvl = getShopLevelByExp(my.exp); if (lvl > my.shopLevel) my.shopLevel = lvl; await updateGameState(); bought[uid] = gameState.round; }
        }, 2000);
    }

    function bindBattleEvents() {
        document.getElementById('leave-battle-btn')?.addEventListener('click', async () => {
            if(!confirm('确定退出？')) return;
            clearAllTimers();
            if (autoBotTimer) clearInterval(autoBotTimer);
            if(window.YYCardMatchmaking?.cancel) await window.YYCardMatchmaking.cancel();
            if(gameSubscription) gameSubscription.unsubscribe();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
            enterGuard = false;
        });
    }

    // 辅助函数
    function getCardBuyPrice(card) { return config.ECONOMY?.CARD_PRICE?.[card?.rarity]?.buy || 1; }
    function getCardSellPrice(card) { return config.ECONOMY?.CARD_PRICE?.[card?.rarity]?.sell || 1; }
    function generateInstanceId() { return utils?.uuid?.() || Date.now() + '-' + Math.random().toString(36).substr(2,9); }

    // 商店接口（保持原样）
    async function buyExpAction() { /* ... 原有代码 ... */ }
    async function refreshShopAction() { /* ... 原有代码 ... */ }
    async function buyCardAction(card, idx) { /* ... 原有代码 ... */ }
    async function placeCardAction(handIdx, boardIdx) { /* ... 原有代码 ... */ }
    async function sellCardAction(type, index) { /* ... 原有代码 ... */ }
    async function buyAndPlaceAction(card, shopIndex, boardIndex) { /* ... 原有代码 ... */ }
    async function swapBoardAction(indexA, indexB) { /* ... 原有代码 ... */ }
    async function boardToHandAction(boardIndex) { /* ... 原有代码 ... */ }

    // 由于长度限制，商店接口的完整代码请从上一版复制，此处省略但实际文件中必须包含。
    // 请确保你保留了所有商店方法！

    return {
        enterBattle, getGameState, updateGameState,
        buyExpAction, refreshShopAction, buyCardAction, placeCardAction, sellCardAction,
        buyAndPlaceAction, swapBoardAction, boardToHandAction
    };
})();
console.log('✅ battle.js 终极实时同步版');

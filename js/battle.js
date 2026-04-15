// ==================== 对战系统【终极加固版】 ====================
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

    // 调试面板（透明背景）
    function initDebugPanel() {
        const old = document.getElementById('battle-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'battle-debug-panel';
        p.style.cssText = `
            position:fixed; top:0; left:0; right:0; max-height:140px; overflow-y:auto;
            color:#7bffb1; font-size:11px; padding:4px 8px; z-index:100000;
            font-family:monospace; pointer-events:none; text-shadow:0 0 4px black;
            background: transparent; border: none;
        `;
        document.body.appendChild(p);
        return p;
    }
    function logToScreen(msg, isError = false) {
        const p = document.getElementById('battle-debug-panel') || initDebugPanel();
        const line = document.createElement('div');
        line.style.color = isError ? '#ff7b7b' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
        p.appendChild(line);
        p.scrollTop = p.scrollHeight;
        while (p.children.length > 30) p.removeChild(p.firstChild);
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
        log(`⏱️ 启动计时器: ${phase} / ${duration}秒 (回合 ${gameState.round})`);
        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(duration, phase);
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - currentPhaseStartTime) / 1000);
            const remaining = Math.max(0, currentPhaseDuration - elapsed);
            if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(remaining, phase);
        }, 100);
        phaseTimer = setTimeout(() => {
            clearInterval(timerInterval); timerInterval = null; phaseTimer = null;
            log(`⏰ 计时器到期: ${phase}`);
            onPhaseEnd(phase);
        }, duration * 1000);
    }

    async function onPhaseEnd(phase) {
        if (isInPhaseTransition) { log(`⚠️ 阶段切换被锁拦截: ${phase}`, true); return; }
        if (!gameState || !currentRoomId) return;
        isInPhaseTransition = true;
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
                if (over.isOver) {
                    endGame(over.winner);
                    isInPhaseTransition = false;
                    return;
                }
                gameState.round++;
                
                // 生成下回合配对
                if (window.YYCardCombat?.pairPlayers) {
                    gameState.battlePairs = window.YYCardCombat.pairPlayers(gameState.players);
                    log(`🔄 下回合配对已生成: ${JSON.stringify(gameState.battlePairs)}`);
                } else {
                    log('⚠️ 战斗模块未加载，无法生成配对', true);
                }
                
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

    // ---------- 战斗模拟（调用前强制检查配对） ----------
    async function simulateBattle() {
        // 最终兜底：如果 battlePairs 为空，当场生成
        if (!gameState.battlePairs || gameState.battlePairs.length === 0) {
            log('⚠️ simulateBattle 检测到 battlePairs 缺失，立即生成');
            if (window.YYCardCombat?.pairPlayers) {
                gameState.battlePairs = window.YYCardCombat.pairPlayers(gameState.players);
            } else {
                // 极端情况手动配对
                const alive = Object.keys(gameState.players).filter(id => gameState.players[id].health > 0);
                const pairs = [];
                for (let i = 0; i < alive.length; i += 2) {
                    pairs.push([alive[i], alive[i+1] || null]);
                }
                gameState.battlePairs = pairs;
            }
            // 立即同步到数据库
            await updateGameState();
        }
        
        if (!window.YYCardCombat) {
            log('❌ 战斗模块未加载，使用简化模拟', true);
            // 简化模拟（保底）
            const players = Object.keys(gameState.players);
            for (let i = 0; i < players.length; i += 2) {
                if (i + 1 >= players.length) break;
                const p1 = gameState.players[players[i]];
                const p2 = gameState.players[players[i+1]];
                const u1 = p1.board.filter(c => c).length;
                const u2 = p2.board.filter(c => c).length;
                let winner, loser, units;
                if (u1 > u2) { winner = p1; loser = p2; units = u1; }
                else if (u2 > u1) { winner = p2; loser = p1; units = u2; }
                else { winner = Math.random() > 0.5 ? p1 : p2; loser = winner === p1 ? p2 : p1; units = u1; }
                const damage = config.BATTLE.BASE_DAMAGE + units * config.BATTLE.DAMAGE_PER_SURVIVAL;
                loser.health = Math.max(0, loser.health - damage);
                log(`⚔️ 击败，伤害 ${damage}`);
            }
            await updateGameState();
            return;
        }
        
        await window.YYCardCombat.resolveBattles(gameState, log, updateGameState);
    }

    // ---------- 经济奖励 ----------
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

    // ---------- 重连 ----------
    async function fastForwardAndResume() {
        if (!gameState || !gameState.gameStartTime) return false;
        const start = new Date(gameState.gameStartTime).getTime();
        const now = Date.now();
        let elapsed = Math.floor((now - start) / 1000);
        let round = 1, phase = 'prepare', remaining = 0;
        while (true) {
            const prep = getPrepareDuration(round);
            const bat = getBattleDuration(round);
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
        if (window.YYCardShop) window.YYCardShop.init();
        subscribeToGame(roomId);
        bindBattleEvents();
        startBotAutoPlay();

        let attempts = 0; const MAX = 15;
        const wait = async () => {
            if (gameState) {
                if (!gameState.gameStartTime) {
                    gameState.gameStartTime = new Date().toISOString();
                    await updateGameState();
                }
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
            if (attempts < MAX) {
                attempts++;
                log(`⏳ 等待状态 (${attempts}/${MAX})`);
                const { data } = await supabase.from('game_states').select('state').eq('room_id', roomId).maybeSingle();
                if (data?.state) gameState = data.state;
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
                if (isUpdatingFromLocal || isInPhaseTransition) return;
                gameState = payload.new.state;
                applyUIMode(gameState.phase === 'prepare');
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            }).subscribe();
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
            if (my.gold >= 1) {
                my.gold--; my.exp++;
                const lvl = getShopLevelByExp(my.exp);
                if (lvl > my.shopLevel) my.shopLevel = lvl;
                await updateGameState();
                bought[uid] = gameState.round;
            }
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

    // ==================== 辅助函数 ====================
    function getCardBuyPrice(card) {
        const rarity = card?.rarity || 'Common';
        const priceTable = config.ECONOMY?.CARD_PRICE;
        if (!priceTable) return 1;
        return priceTable[rarity]?.buy || 1;
    }
    function getCardSellPrice(card) {
        const rarity = card?.rarity || 'Common';
        const priceTable = config.ECONOMY?.CARD_PRICE;
        if (!priceTable) return 1;
        return priceTable[rarity]?.sell || 1;
    }
    function generateInstanceId() {
        if (utils && typeof utils.uuid === 'function') return utils.uuid();
        return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    // ---------- 商店接口 ----------
    async function buyExpAction() {
        if (!gameState || gameState.phase !== 'prepare') return false;
        const uid = auth.currentUser?.id;
        const my = gameState.players[uid];
        if (my.isBot) return false;
        if (my.shopLevel >= 5) { toast('已满级', true); return false; }
        if (my.gold < 1) { toast('金币不足', true); return false; }
        my.gold--; my.exp++;
        const lvl = getShopLevelByExp(my.exp);
        if (lvl > my.shopLevel) my.shopLevel = lvl;
        await updateGameState();
        return true;
    }

    async function refreshShopAction() {
        if (!gameState || gameState.phase !== 'prepare') return false;
        const uid = auth.currentUser?.id;
        const my = gameState.players[uid];
        const cost = config.ECONOMY?.REFRESH_COST || 1;
        if (my.gold < cost) { toast('金币不足', true); return false; }
        my.gold -= cost;
        my.shopCards = await utils.generateShopCards(my.shopLevel);
        await updateGameState();
        return true;
    }

    async function buyCardAction(card, idx) {
        if (!gameState || gameState.phase !== 'prepare') return false;
        const uid = auth.currentUser?.id;
        const my = gameState.players[uid];
        const price = getCardBuyPrice(card);
        if (my.gold < price) return false;
        if (my.hand.filter(c => c).length >= (config.HAND_MAX_COUNT || 15)) return false;
        my.gold -= price;
        const newCard = { ...card, instanceId: generateInstanceId() };
        const empty = my.hand.findIndex(c => c === null);
        if (empty !== -1) my.hand[empty] = newCard;
        else my.hand.push(newCard);
        my.shopCards.splice(idx, 1);
        await updateGameState();
        return true;
    }

    async function placeCardAction(handIdx, boardIdx) {
        if (!gameState || gameState.phase !== 'prepare') return false;
        const uid = auth.currentUser?.id;
        const my = gameState.players[uid];
        const card = my.hand[handIdx];
        if (!card) return false;
        const old = my.board[boardIdx];
        my.board[boardIdx] = card;
        my.hand[handIdx] = old || null;
        await updateGameState();
        return true;
    }

    async function sellCardAction(type, index) {
        if (!gameState || gameState.phase !== 'prepare') return false;
        const uid = auth.currentUser?.id;
        const my = gameState.players[uid];
        let card;
        if (type === 'hand') { card = my.hand[index]; if (!card) return false; my.hand[index] = null; }
        else if (type === 'board') { card = my.board[index]; if (!card) return false; my.board[index] = null; }
        else return false;
        const price = getCardSellPrice(card);
        my.gold += price;
        await updateGameState();
        return true;
    }

    async function buyAndPlaceAction(card, shopIndex, boardIndex) {
        if (!gameState || gameState.phase !== 'prepare') return false;
        const uid = auth.currentUser?.id;
        const my = gameState.players[uid];
        if (my.isBot) return false;
        const price = getCardBuyPrice(card);
        if (my.gold < price) { toast('金币不足', true); return false; }
        if (my.board[boardIndex] !== null) { toast('目标格子已有单位', true); return false; }
        my.gold -= price;
        const newCard = { ...card, instanceId: generateInstanceId() };
        my.board[boardIndex] = newCard;
        my.shopCards.splice(shopIndex, 1);
        await updateGameState();
        return true;
    }

    async function swapBoardAction(indexA, indexB) {
        if (!gameState || gameState.phase !== 'prepare') return false;
        const uid = auth.currentUser?.id;
        const my = gameState.players[uid];
        if (my.isBot) return false;
        const temp = my.board[indexA];
        my.board[indexA] = my.board[indexB];
        my.board[indexB] = temp;
        await updateGameState();
        return true;
    }

    async function boardToHandAction(boardIndex) {
        if (!gameState || gameState.phase !== 'prepare') return false;
        const uid = auth.currentUser?.id;
        const my = gameState.players[uid];
        if (my.isBot) return false;
        const card = my.board[boardIndex];
        if (!card) return false;
        const handCount = my.hand.filter(c => c !== null).length;
        if (handCount >= (config.HAND_MAX_COUNT || 15)) { toast('手牌已满', true); return false; }
        const emptyIndex = my.hand.findIndex(c => c === null);
        if (emptyIndex === -1) { toast('手牌已满', true); return false; }
        my.hand[emptyIndex] = card;
        my.board[boardIndex] = null;
        await updateGameState();
        return true;
    }

    return {
        enterBattle,
        getGameState,
        updateGameState,
        buyExpAction,
        refreshShopAction,
        buyCardAction,
        placeCardAction,
        sellCardAction,
        buyAndPlaceAction,
        swapBoardAction,
        boardToHandAction
    };
})();

console.log('✅ battle.js 终极加固版加载完成');

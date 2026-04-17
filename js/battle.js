// ==================== 对战系统【递增回合 + 缓冲2s + 结算3s + 根治卡00】 ====================
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
    let safetyTimer = null;          // 安全超时定时器
    let timerInterval = null;
    let currentPhaseStartTime = 0;
    let currentPhaseDuration = 0;
    let enterGuard = false;

    let isUpdatingFromLocal = false;
    let isInPhaseTransition = false;

    let pollingInterval = null;
    let eliminationOrder = [];

    // 固定时长（秒）
    const BUFFER_DURATION = 2;   // 缓冲期
    const SETTLE_DURATION = 3;   // 结算期

    // 递增时长公式
    function getPrepareDuration(round) { return 25 + (round - 1) * 10; }
    function getBattleDuration(round) { return 30 + (round - 1) * 5; }

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

    function logToScreen(msg, isError = false, persistent = false) {
        const p = document.getElementById('battle-debug-panel') || initDebugPanel();
        const line = document.createElement('div');
        line.style.color = isError ? '#ff7b7b' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
        p.insertBefore(line, p.firstChild);
        while (p.children.length > 100) p.removeChild(p.lastChild);
        if (persistent) {
            setTimeout(() => {
                if (line.parentNode) {
                    line.style.transition = 'opacity 0.5s';
                    line.style.opacity = '0';
                    setTimeout(() => line.remove(), 500);
                }
            }, 60000);
        }
    }

    function toast(msg, isError = false) {
        if (window.YYCardShop?.toast) window.YYCardShop.toast(msg, isError);
        else alert(msg);
    }

    function getGameState() { return gameState; }

    async function updateGameState() {
        if (!currentRoomId || !gameState) return;
        const { data: fresh, error } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', currentRoomId)
            .single();
        if (!error && fresh?.state) {
            const latestState = fresh.state;
            const myId = auth.currentUser?.id;
            if (myId && gameState.players[myId]) {
                latestState.players[myId] = gameState.players[myId];
            }
            latestState.round = gameState.round;
            latestState.phase = gameState.phase;
            latestState.phaseStartTime = gameState.phaseStartTime;
            latestState.gameStartTime = gameState.gameStartTime;
            gameState = latestState;
        }
        isUpdatingFromLocal = true;
        const { error: updateError } = await supabase
            .from('game_states')
            .update({ state: gameState })
            .eq('room_id', currentRoomId);
        if (updateError) log(`写入状态失败: ${updateError.message}`, true);
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        setTimeout(() => { isUpdatingFromLocal = false; }, 100);
    }

    function log(msg, isError = false, persistent = false) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        logToScreen(msg, isError, persistent);
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
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    }

    // 启动阶段计时器（带安全超时）
    function startPhaseTimer(phase, duration, skipStateUpdate = false) {
        clearAllTimers();
        // 无效时长保护
        if (!duration || isNaN(duration) || duration <= 0) {
            let fallback = 0;
            if (phase === 'prepare') fallback = getPrepareDuration(gameState?.round || 1);
            else if (phase === 'battle') fallback = getBattleDuration(gameState?.round || 1);
            else if (phase === 'settle') fallback = SETTLE_DURATION;
            else fallback = 3;
            console.warn(`⚠️ startPhaseTimer 无效duration=${duration}，使用后备值${fallback}`);
            duration = fallback;
        }
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
                console.warn(`⚠️ 阶段 ${phase} 安全超时强制结束`);
                clearTimeout(phaseTimer);
                phaseTimer = null;
                clearInterval(timerInterval);
                timerInterval = null;
                onPhaseEnd(phase);
            }
        }, (duration + 2) * 1000);
    }

    // 缓冲期（固定2秒）
    async function startBuffering(targetPhase) {
        log(`⏳ 缓冲期 ${BUFFER_DURATION} 秒，准备切换到 ${targetPhase} 阶段`);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase('buffering');
        if (window.YYCardShop?.updateTimerDisplay) {
            window.YYCardShop.updateTimerDisplay(BUFFER_DURATION, 'buffering');
        }
        await new Promise(resolve => setTimeout(resolve, BUFFER_DURATION * 1000));
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(targetPhase);
    }

    // 阶段结束处理（核心）
    async function onPhaseEnd(phase) {
        if (isInPhaseTransition) {
            log(`⚠️ 阶段切换锁，跳过 ${phase}`, true);
            return;
        }
        if (!gameState || !currentRoomId) return;
        isInPhaseTransition = true;
        const lockTimeout = setTimeout(() => {
            if (isInPhaseTransition) {
                log(`⚠️ 阶段切换锁超时，强制释放`, true);
                isInPhaseTransition = false;
            }
        }, 12000);
        log(`🔄 阶段结束: ${phase} (回合${gameState.round})`);
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
                await distributeRoundRewards();
                const over = checkGameOver();
                if (over.isOver) {
                    endGame(over.winner);
                    clearTimeout(lockTimeout);
                    return;
                }
                gameState.round++;
                gameState.phase = 'prepare';
                await updateGameState();
                await applyUIMode(true);
                await refreshAllShops();
                const newPrepareDur = getPrepareDuration(gameState.round);
                log(`🔄 进入第 ${gameState.round} 回合准备阶段，时长 ${newPrepareDur} 秒`);
                clearAllTimers(); // 二次确保
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
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch (e) {}
        if (window.YYCardShop?.setPhase) {
            window.YYCardShop.setPhase(isPrepare ? 'prepare' : (gameState?.phase === 'settle' ? 'settle' : 'battle'));
        }
        const prepareTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
        if (!isPrepare) {
            const { data: fresh, error } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', currentRoomId)
                .single();
            if (!error && fresh?.state) {
                gameState = fresh.state;
                log(`🔄 进入战斗/结算，已同步最新数据`);
            }
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        }
    }

    async function simulateBattle() {
        try {
            const { data: freshState, error } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', currentRoomId)
                .single();
            if (!error && freshState?.state) gameState = freshState.state;
            if (!window.YYCardCombat) {
                log('⚠️ 战斗模块未加载，跳过详细模拟', true);
                return;
            }
            await window.YYCardCombat.resolveBattles(gameState, log, updateGameState);
        } catch (e) {
            log(`❌ 战斗模拟出错: ${e.message}`, true);
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
        log(`💰 回合 ${round} 奖励: 金币 +${goldAdd}, 经验 +${expAdd}`);
    }

    async function refreshAllShops() {
        if (!gameState || gameState.phase !== 'prepare') return;
        for (const pid in gameState.players) {
            gameState.players[pid].shopCards = await utils.generateShopCards(gameState.players[pid].shopLevel);
        }
        await updateGameState();
        log(`🃏 已刷新所有玩家商店 (回合 ${gameState.round})`);
    }

    function checkGameOver() {
        const players = gameState.players;
        const alive = Object.values(players).filter(p => p.health > 0 && !p.isEliminated);
        Object.entries(players).forEach(([id, p]) => {
            if (p.health <= 0 && !p.isEliminated) {
                p.isEliminated = true;
                if (!eliminationOrder.includes(id)) {
                    eliminationOrder.push(id);
                    const totalPlayers = Object.keys(players).length;
                    const rank = totalPlayers - eliminationOrder.length + 1;
                    log(`☠️ 玩家 ${id.slice(0,8)} 被淘汰，获得第 ${rank} 名`, false, true);
                }
            }
        });
        if (alive.length <= 1) {
            const winner = alive[0] ? Object.keys(players).find(id => players[id] === alive[0]) : eliminationOrder[eliminationOrder.length - 1];
            if (alive[0] && !eliminationOrder.includes(winner)) {
                eliminationOrder.push(winner);
                log(`🏆 玩家 ${winner.slice(0,8)} 获得第 1 名`, false, true);
            }
            return { isOver: true, winner };
        }
        return { isOver: false };
    }

    function endGame(winnerId) {
        stopPolling();
        isInPhaseTransition = false;
        const rankings = [...eliminationOrder].reverse();
        let rankMsg = `📋 最终排名：\n`;
        rankings.forEach((id, index) => {
            rankMsg += `  第${index + 1}名: ${id.slice(0,8)}\n`;
        });
        log(rankMsg, false, true);
        toast(`游戏结束！胜利者: ${winnerId}`);
        clearAllTimers();
        if (autoBotTimer) clearInterval(autoBotTimer);
        if (gameSubscription) gameSubscription.unsubscribe();
        eliminationOrder = [];
        setTimeout(() => {
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
            enterGuard = false;
        }, 3000);
    }

    // 重连快进（适配缓冲期和结算期）
    async function fastForwardAndResume() {
        if (!gameState || !gameState.gameStartTime) return false;
        const start = new Date(gameState.gameStartTime).getTime();
        const now = Date.now();
        let elapsed = Math.floor((now - start) / 1000);
        let round = 1, phase = 'prepare', remaining = 0;
        while (true) {
            const prep = getPrepareDuration(round);
            const buf = BUFFER_DURATION;
            const bat = getBattleDuration(round);
            const set = SETTLE_DURATION;
            const total = prep + buf + bat + set;
            if (elapsed >= total) { elapsed -= total; round++; }
            else {
                if (elapsed < prep) { phase = 'prepare'; remaining = prep - elapsed; }
                else if (elapsed < prep + buf) { phase = 'buffering'; remaining = prep + buf - elapsed; }
                else if (elapsed < prep + buf + bat) { phase = 'battle'; remaining = prep + buf + bat - elapsed; }
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
        const phaseDuration = (phase === 'prepare' ? getPrepareDuration(round) :
                              (phase === 'buffering' ? BUFFER_DURATION :
                              (phase === 'battle' ? getBattleDuration(round) : SETTLE_DURATION)));
        gameState.phaseStartTime = new Date(now - (phaseDuration - remaining) * 1000).toISOString();
        await updateGameState();
        await applyUIMode(phase === 'prepare');
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        clearAllTimers();
        if (phase === 'buffering') {
            // 重连时正处于缓冲期，直接进入战斗
            await startBuffering('battle');
            gameState.phase = 'battle';
            await updateGameState();
            await applyUIMode(false);
            startPhaseTimer('battle', getBattleDuration(round));
            await simulateBattle();
        } else {
            startPhaseTimer(phase, remaining);
        }
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
            const { data, error } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', currentRoomId)
                .single();
            if (error) return;
            if (data?.state) {
                gameState = data.state;
                applyUIMode(gameState.phase === 'prepare');
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            }
        }, 2000);
    }

    function stopPolling() {
        if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
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
            stopPolling();
            if (autoBotTimer) clearInterval(autoBotTimer);
            if(window.YYCardMatchmaking?.cancel) await window.YYCardMatchmaking.cancel();
            if(gameSubscription) gameSubscription.unsubscribe();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
            enterGuard = false;
        });
    }

    // ---------- 商店接口辅助函数 ----------
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

console.log('✅ battle.js 加载完成（递增回合+缓冲2s+结算3s+安全超时修复）');

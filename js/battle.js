// ==================== 对战系统【最终修复版：计时器 + UI刷新 + 升级扣费】 ====================
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

    // ===== 公开接口 =====
    function getGameState() { return gameState; }
    async function updateGameState() {
        if (!currentRoomId || !gameState) return;
        await supabase.from('game_states').update({ state: gameState }).eq('room_id', currentRoomId);
        // 每次数据库写入后强制刷新 UI
        if (window.YYCardShop?.refreshAllUI) {
            window.YYCardShop.refreshAllUI();
        }
    }

    function log(msg, isError = false) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        if (window.YYCardShop?.log) window.YYCardShop.log(msg, isError);
    }

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

    // ===== 计时器 =====
    function startPhaseTimer(phase, duration, skipStateUpdate = false) {
        if (phaseTimer) clearTimeout(phaseTimer);
        if (timerInterval) clearInterval(timerInterval);
        currentPhaseDuration = duration;
        
        if (!skipStateUpdate) {
            gameState.phaseStartTime = new Date().toISOString();
            currentPhaseStartTime = Date.now();
            updateGameState();
        } else {
            currentPhaseStartTime = Date.now() - (getPhaseDuration(phase, gameState.round) - duration) * 1000;
        }
        
        log(`⏱️ 启动计时器: ${phase} / ${duration}秒`);
        
        if (window.YYCardShop?.updateTimerDisplay) {
            window.YYCardShop.updateTimerDisplay(duration, phase);
        }
        
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - currentPhaseStartTime) / 1000);
            const remaining = Math.max(0, currentPhaseDuration - elapsed);
            if (window.YYCardShop?.updateTimerDisplay) {
                window.YYCardShop.updateTimerDisplay(remaining, phase);
            }
        }, 100);
        
        phaseTimer = setTimeout(() => {
            clearInterval(timerInterval);
            log(`⏰ 计时器到期: ${phase}`);
            onPhaseEnd(phase);
        }, duration * 1000);
    }

    // ===== 阶段结束 =====
    async function onPhaseEnd(phase) {
        log(`🔄 阶段结束: ${phase}`);
        if (!gameState || !currentRoomId) return;
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
                if (over.isOver) { endGame(over.winner); return; }
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
        }
    }

    function applyUIMode(isPrepare) {
        try {
            document.body.classList.toggle('battle-view-mode', !isPrepare);
        } catch (e) {}
        if (window.YYCardShop?.setPhase) {
            window.YYCardShop.setPhase(isPrepare ? 'prepare' : 'battle');
        }
    }

    // ===== 战斗模拟 =====
    async function simulateBattle() {
        const players = Object.keys(gameState.players);
        if (players.length < 2) return;
        for (let i = 0; i < players.length; i += 2) {
            if (i + 1 >= players.length) break;
            const p1Id = players[i], p2Id = players[i + 1];
            const p1 = gameState.players[p1Id], p2 = gameState.players[p2Id];
            const p1Units = p1.board.filter(c => c).length;
            const p2Units = p2.board.filter(c => c).length;
            let winnerId, loserId, winnerUnits;
            if (p1Units > p2Units) {
                winnerId = p1Id; loserId = p2Id; winnerUnits = p1Units;
            } else if (p2Units > p1Units) {
                winnerId = p2Id; loserId = p1Id; winnerUnits = p2Units;
            } else {
                const rand = Math.random() > 0.5;
                winnerId = rand ? p1Id : p2Id;
                loserId = rand ? p2Id : p1Id;
                winnerUnits = p1Units;
            }
            const loser = gameState.players[loserId];
            const damage = config.BATTLE.BASE_DAMAGE + winnerUnits * config.BATTLE.DAMAGE_PER_SURVIVAL;
            loser.health = Math.max(0, loser.health - damage);
            log(`⚔️ ${winnerId.slice(0,6)} 击败 ${loserId.slice(0,6)}，伤害 ${damage}`);
        }
        await updateGameState();
    }

    // ===== 经济奖励 =====
    async function distributeRoundRewards() {
        const round = gameState.round;
        const goldAdd = config.ECONOMY.GOLD_PER_ROUND(round);
        const expAdd = config.ECONOMY.EXP_PER_ROUND;
        for (const pid in gameState.players) {
            const p = gameState.players[pid];
            p.gold += goldAdd;
            p.exp += expAdd;
            const newLevel = getShopLevelByExp(p.exp);
            if (newLevel > p.shopLevel) {
                p.shopLevel = newLevel;
                log(`🎉 玩家 ${pid.slice(0,6)} 商店升级到 Lv.${p.shopLevel}`);
            }
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
        alert(`游戏结束！胜利者: ${winnerId}`);
        setTimeout(() => {
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            if (gameSubscription) gameSubscription.unsubscribe();
            clearTimeout(phaseTimer);
            clearInterval(timerInterval);
            clearInterval(autoBotTimer);
            gameState = currentRoomId = null;
            enterGuard = false;
        }, 3000);
    }

    // ===== 重连快速推进 =====
    function fastForwardToCurrentRound() {
        if (!gameState || !gameState.gameStartTime) return false;
        const startTime = new Date(gameState.gameStartTime).getTime();
        const now = Date.now();
        let elapsed = Math.floor((now - startTime) / 1000);
        let currentRound = 1, currentPhase = 'prepare', remaining = 0;
        while (elapsed > 0) {
            const prep = getPrepareDuration(currentRound);
            const bat = getBattleDuration(currentRound);
            const total = prep + bat + SETTLE_DURATION;
            if (elapsed >= total) {
                elapsed -= total;
                currentRound++;
            } else {
                if (elapsed < prep) {
                    currentPhase = 'prepare';
                    remaining = prep - elapsed;
                } else if (elapsed < prep + bat) {
                    currentPhase = 'battle';
                    remaining = prep + bat - elapsed;
                } else {
                    currentPhase = 'settle';
                    remaining = total - elapsed;
                }
                break;
            }
        }
        const oldRound = gameState.round;
        if (currentRound > oldRound) {
            log(`⏩ 快速推进: 从回合 ${oldRound} 到 ${currentRound}`);
            for (let r = oldRound; r < currentRound; r++) {
                const goldAdd = config.ECONOMY.GOLD_PER_ROUND(r);
                const expAdd = config.ECONOMY.EXP_PER_ROUND;
                for (const pid in gameState.players) {
                    const p = gameState.players[pid];
                    p.gold += goldAdd;
                    p.exp += expAdd;
                    const newLevel = getShopLevelByExp(p.exp);
                    if (newLevel > p.shopLevel) p.shopLevel = newLevel;
                }
            }
        }
        gameState.round = currentRound;
        gameState.phase = currentPhase;
        gameState.phaseStartTime = new Date(Date.now() - (getPhaseDuration(currentPhase, currentRound) - remaining) * 1000).toISOString();
        refreshAllShops().then(() => {
            applyUIMode(currentPhase === 'prepare');
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            startPhaseTimer(currentPhase, remaining);
        });
        return true;
    }

    // ===== 进入对战 =====
    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        
        if (window.YYCardShop) window.YYCardShop.init();
        
        subscribeToGame(roomId);
        bindBattleEvents();
        startBotAutoPlay();

        let attempts = 0;
        const MAX_ATTEMPTS = 15;
        const waitForState = async () => {
            if (gameState) {
                if (!gameState.gameStartTime) {
                    gameState.gameStartTime = new Date().toISOString();
                    updateGameState();
                }
                if (fastForwardToCurrentRound()) return;
                const phase = gameState.phase;
                const round = gameState.round;
                applyUIMode(phase === 'prepare');
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                if (gameState.phaseStartTime) {
                    const start = new Date(gameState.phaseStartTime).getTime();
                    const elapsed = Math.floor((Date.now() - start) / 1000);
                    const total = getPhaseDuration(phase, round);
                    const remaining = Math.max(0, total - elapsed);
                    if (remaining <= 0) onPhaseEnd(phase);
                    else {
                        currentPhaseStartTime = start;
                        startPhaseTimer(phase, remaining, true);
                    }
                } else {
                    startPhaseTimer(phase, getPhaseDuration(phase, round));
                }
                return;
            }
            if (attempts < MAX_ATTEMPTS) {
                attempts++;
                log(`⏳ 等待游戏状态... (${attempts}/${MAX_ATTEMPTS})`);
                const { data } = await supabase.from('game_states').select('state').eq('room_id', roomId).maybeSingle();
                if (data?.state) gameState = data.state;
                setTimeout(waitForState, 200);
            } else {
                alert('游戏状态加载失败');
                enterGuard = false;
            }
        };
        waitForState();
    }

    function subscribeToGame(roomId) {
        if (gameSubscription) gameSubscription.unsubscribe();
        gameSubscription = supabase
            .channel(`game:${roomId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_states', filter: `room_id=eq.${roomId}` }, (payload) => {
                gameState = payload.new.state;
                applyUIMode(gameState.phase === 'prepare');
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                if (!phaseTimer && !timerInterval) {
                    const phase = gameState.phase;
                    const round = gameState.round;
                    if (gameState.phaseStartTime) {
                        const start = new Date(gameState.phaseStartTime).getTime();
                        const elapsed = Math.floor((Date.now() - start) / 1000);
                        const total = getPhaseDuration(phase, round);
                        const remaining = Math.max(0, total - elapsed);
                        if (remaining > 0) {
                            currentPhaseStartTime = start;
                            startPhaseTimer(phase, remaining, true);
                        } else {
                            onPhaseEnd(phase);
                        }
                    }
                }
            })
            .subscribe();
    }

    function startBotAutoPlay() {
        if (autoBotTimer) clearInterval(autoBotTimer);
        const bought = {};
        autoBotTimer = setInterval(async () => {
            if (!gameState || gameState.phase !== 'prepare') return;
            const userId = auth.currentUser?.id;
            const my = gameState.players[userId];
            if (!my || !my.isBot) return;
            if (bought[userId] === gameState.round) return;
            if (my.shopLevel >= (config.MAX_SHOP_LEVEL||5)) return;
            if (my.gold >= 1) {
                my.gold--;
                my.exp++;
                const newLevel = getShopLevelByExp(my.exp);
                if (newLevel > my.shopLevel) my.shopLevel = newLevel;
                await updateGameState();
                bought[userId] = gameState.round;
            }
        }, 2000);
    }

    function bindBattleEvents() {
        document.getElementById('leave-battle-btn')?.addEventListener('click', async () => {
            if(!confirm('确定退出对局？')) return;
            clearTimeout(phaseTimer);
            clearInterval(timerInterval);
            clearInterval(autoBotTimer);
            if(window.YYCardMatchmaking?.cancel) await window.YYCardMatchmaking.cancel();
            if(gameSubscription) gameSubscription.unsubscribe();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
            enterGuard = false;
        });
    }

    // ===== 供 shop 调用的方法 =====
    async function endPreparePhase() {
        if (!gameState || gameState.phase !== 'prepare') return;
        if (phaseTimer) clearTimeout(phaseTimer);
        if (timerInterval) clearInterval(timerInterval);
        await onPhaseEnd('prepare');
    }

    async function buyExpAction() {
        if (!gameState || gameState.phase !== 'prepare') return false;
        const userId = auth.currentUser?.id;
        const my = gameState.players[userId];
        if (my.isBot) return false;
        if (my.shopLevel >= (config.MAX_SHOP_LEVEL || 5)) {
            alert('商店已满级');
            return false;
        }
        if (my.gold < 1) {
            alert('金币不足');
            return false;
        }
        my.gold--;
        my.exp++;
        const newLevel = getShopLevelByExp(my.exp);
        if (newLevel > my.shopLevel) my.shopLevel = newLevel;
        await updateGameState();
        return true;
    }

    async function refreshShopAction() {
        if (!gameState || gameState.phase !== 'prepare') return false;
        const userId = auth.currentUser?.id;
        const my = gameState.players[userId];
        const cost = config.ECONOMY?.REFRESH_COST || 1;
        if (my.gold < cost) {
            alert('金币不足');
            return false;
        }
        my.gold -= cost;
        my.shopCards = await utils.generateShopCards(my.shopLevel);
        await updateGameState();
        return true;
    }

    async function buyCardAction(card, idx) {
        if (!gameState || gameState.phase !== 'prepare') return false;
        const userId = auth.currentUser?.id;
        const my = gameState.players[userId];
        const price = config.ECONOMY.CARD_PRICE[card.rarity].buy;
        if (my.gold < price) return false;
        if (my.hand.filter(c => c).length >= config.HAND_MAX_COUNT) return false;
        my.gold -= price;
        const newCard = { ...card, instanceId: utils.uuid() };
        const emptyIndex = my.hand.findIndex(c => c === null);
        if (emptyIndex !== -1) my.hand[emptyIndex] = newCard;
        else my.hand.push(newCard);
        my.shopCards.splice(idx, 1);
        await updateGameState();
        return true;
    }

    async function placeCardAction(handIdx, boardIdx) {
        if (!gameState || gameState.phase !== 'prepare') return false;
        const userId = auth.currentUser?.id;
        const my = gameState.players[userId];
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
        const userId = auth.currentUser?.id;
        const my = gameState.players[userId];
        let card;
        if (type === 'hand') {
            card = my.hand[index];
            if (!card) return false;
            my.hand[index] = null;
        } else if (type === 'board') {
            card = my.board[index];
            if (!card) return false;
            my.board[index] = null;
        } else return false;
        const sellPrice = config.ECONOMY.CARD_PRICE[card.rarity].sell;
        my.gold += sellPrice;
        await updateGameState();
        return true;
    }

    return {
        enterBattle,
        getGameState,
        updateGameState,
        endPreparePhase,
        buyExpAction,
        refreshShopAction,
        buyCardAction,
        placeCardAction,
        sellCardAction
    };
})();

console.log('✅ battle.js 加载完成【最终修复版】');

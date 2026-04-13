// ==================== 对战系统（阶段切换加固版 + 详细日志） ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;
    let gameSubscription = null;
    let selectedCard = null;
    let autoBotTimer = null;

    let phaseTimer = null;
    let timerInterval = null;
    let currentPhaseStartTime = 0;
    let currentPhaseDuration = 0;

    function log(msg, isError = false) {
        if (auth && typeof auth.log === 'function') {
            auth.log(msg, isError);
        } else {
            console.log(msg);
        }
    }

    function getPrepareDuration(round) {
        return 25 + (round - 1) * 10;
    }

    function getBattleDuration(round) {
        return 30 + (round - 1) * 5;
    }

    const SETTLE_DURATION = 3;

    // ===== 加固版计时器：添加详细日志 =====
    function startPhaseTimer(phase, duration) {
        if (phaseTimer) clearTimeout(phaseTimer);
        if (timerInterval) clearInterval(timerInterval);

        currentPhaseDuration = duration;
        currentPhaseStartTime = Date.now();
        updateTimerDisplay(duration);

        log(`⏱️ [计时器启动] 阶段: ${phase}, 时长: ${duration}秒`);

        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - currentPhaseStartTime) / 1000);
            const remaining = Math.max(0, currentPhaseDuration - elapsed);
            updateTimerDisplay(remaining);
        }, 100);

        phaseTimer = setTimeout(() => {
            clearInterval(timerInterval);
            log(`⏰ [计时器到期] 阶段: ${phase}`);
            onPhaseEnd(phase);
        }, duration * 1000);
    }

    function updateTimerDisplay(seconds) {
        const timerEl = document.getElementById('phase-timer');
        if (timerEl) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    }

    // ===== 阶段结束处理（加固版） =====
    async function onPhaseEnd(phase) {
        log(`🔄 [阶段结束] ${phase}`);
        if (!gameState || !currentRoomId) {
            log('❌ gameState 或 currentRoomId 为空，无法切换阶段', true);
            return;
        }

        try {
            if (phase === 'prepare') {
                gameState.phase = 'battle';
                await updateGameState();
                renderBattleUI();

                const battleDuration = getBattleDuration(gameState.round);
                startPhaseTimer('battle', battleDuration);
                log(`⚔️ 进入战斗阶段，回合 ${gameState.round}，时长 ${battleDuration} 秒`);

                // 执行战斗模拟
                await simulateBattle();

            } else if (phase === 'battle') {
                gameState.phase = 'settle';
                await updateGameState();
                renderBattleUI();

                startPhaseTimer('settle', SETTLE_DURATION);
                log(`📊 进入结算阶段，时长 ${SETTLE_DURATION} 秒`);

            } else if (phase === 'settle') {
                await distributeRoundRewards();

                const gameOver = checkGameOver();
                if (gameOver.isOver) {
                    endGame(gameOver.winner);
                    return;
                }

                gameState.round++;
                gameState.phase = 'prepare';
                await updateGameState();
                renderBattleUI();

                refreshAllShops();

                const prepareDuration = getPrepareDuration(gameState.round);
                startPhaseTimer('prepare', prepareDuration);
                log(`🛒 进入第 ${gameState.round} 回合准备阶段，时长 ${prepareDuration} 秒`);
            }
        } catch (e) {
            log(`❌ onPhaseEnd 出错: ${e.message}`, true);
            console.error(e);
        }
    }

    // ===== 进入对战视图（加固版） =====
    async function enterBattle(roomId) {
        currentRoomId = roomId;
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        
        log('🎮 进入对战视图，房间ID: ' + roomId);
        
        subscribeToGame(roomId);
        bindBattleEvents();
        startBotAutoPlay();

        // 等待状态加载，然后根据当前阶段启动计时器
        const waitForState = setInterval(() => {
            if (!gameState) {
                log('⏳ 等待 gameState 加载...');
                return;
            }
            clearInterval(waitForState);
            
            const phase = gameState.phase;
            const round = gameState.round;
            log(`📋 当前游戏状态: 回合 ${round}, 阶段 ${phase}`);

            // 根据实际阶段启动对应计时器
            if (phase === 'prepare') {
                const duration = getPrepareDuration(round);
                startPhaseTimer('prepare', duration);
                log(`🛒 第 ${round} 回合准备阶段，时长 ${duration} 秒`);
            } else if (phase === 'battle') {
                const duration = getBattleDuration(round);
                startPhaseTimer('battle', duration);
                log(`⚔️ 第 ${round} 回合战斗阶段，时长 ${duration} 秒`);
            } else if (phase === 'settle') {
                startPhaseTimer('settle', SETTLE_DURATION);
                log(`📊 结算阶段，时长 ${SETTLE_DURATION} 秒`);
            } else {
                log(`❌ 未知阶段: ${phase}，强制进入准备阶段`, true);
                gameState.phase = 'prepare';
                updateGameState();
                const duration = getPrepareDuration(round);
                startPhaseTimer('prepare', duration);
            }
        }, 100);
    }

    // ===== 订阅游戏状态 =====
    function subscribeToGame(roomId) {
        if (gameSubscription) gameSubscription.unsubscribe();

        gameSubscription = supabase
            .channel(`game:${roomId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'game_states',
                filter: `room_id=eq.${roomId}`
            }, (payload) => {
                log('📡 收到游戏状态更新');
                gameState = payload.new.state;
                renderBattleUI();
            })
            .subscribe();

        supabase
            .from('game_states')
            .select('state')
            .eq('room_id', roomId)
            .single()
            .then(({ data }) => {
                if (data) {
                    gameState = data.state;
                    renderBattleUI();
                    log('📋 游戏状态已加载');
                } else {
                    log('❌ 未找到游戏状态', true);
                }
            });
    }

    async function updateGameState() {
        if (!currentRoomId || !gameState) return;
        await supabase
            .from('game_states')
            .update({ state: gameState })
            .eq('room_id', currentRoomId);
    }

    // ===== 以下渲染和交互函数保持不变（仅添加少量日志） =====
    function renderPlayerStatus() {
        const container = document.getElementById('player-status-list');
        if (!container || !gameState) return;
        
        const players = gameState.players;
        const myId = auth.currentUser.id;
        let html = '';
        
        for (const [pid, p] of Object.entries(players)) {
            const isMe = (pid === myId);
            const displayName = isMe ? '我' : (p.display_name || pid.slice(0,6));
            const avatarUrl = p.avatar_url || config.DEFAULT_AVATAR;
            
            html += `
                <div class="player-status-item">
                    <img src="${avatarUrl}" onerror="this.src='${config.DEFAULT_AVATAR}'">
                    <div style="flex:1;">
                        <div style="font-size:0.6rem;">${displayName}</div>
                        <div class="hp-bar">
                            <div class="hp-fill" style="width:${Math.max(0, (p.health/(config.INITIAL_HEALTH||100))*100)}%;"></div>
                        </div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    function renderBattleUI() {
        if (!gameState) return;

        const myId = auth.currentUser.id;
        const myState = gameState.players[myId];
        if (!myState) return;

        document.getElementById('my-health').textContent = myState.health;
        document.getElementById('my-gold').textContent = myState.gold;
        document.getElementById('shop-level').textContent = myState.shopLevel;
        document.getElementById('round-num').textContent = gameState.round;
        document.getElementById('phase-info').textContent = 
            gameState.phase === 'prepare' ? '🛒 准备阶段' : 
            gameState.phase === 'battle' ? '⚔️ 战斗阶段' : '📊 结算阶段';

        renderBoard('my-board', myState.board, true);
        renderHand(myState.hand);
        renderShop(myState.shopCards);
        document.getElementById('hand-count').textContent = myState.hand.length;

        const opponentId = Object.keys(gameState.players).find(id => id !== myId);
        if (opponentId) {
            renderBoard('enemy-board', gameState.players[opponentId].board, false);
        }

        const isBot = myState.isBot;
        const isMyTurn = gameState.phase === 'prepare';
        const endBtn = document.getElementById('end-prepare-btn');
        const refreshBtn = document.getElementById('refresh-shop-btn');
        const buyExpBtn = document.getElementById('buy-exp-btn');
        
        if (isBot) {
            endBtn.style.display = 'none';
            if (refreshBtn) refreshBtn.style.display = 'none';
            if (buyExpBtn) buyExpBtn.style.display = 'none';
        } else {
            endBtn.style.display = isMyTurn ? 'block' : 'none';
            if (refreshBtn) refreshBtn.style.display = isMyTurn ? 'block' : 'none';
            if (buyExpBtn) buyExpBtn.style.display = isMyTurn ? 'block' : 'none';
        }

        renderPlayerStatus();

        const isPrepare = gameState.phase === 'prepare';
        document.body.classList.toggle('battle-view-mode', !isPrepare);
    }

    function renderBoard(containerId, cards, isSelf) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const card = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.dataset.index = i;
            if (card) {
                slot.innerHTML = `<div class="card"><div class="card-name">${card.name}</div><div class="card-stats">⚔️${card.atk} 🛡️${card.hp}</div>${card.star > 0 ? '<div class="card-star">★</div>' : ''}</div>`;
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
            }
            if (isSelf && gameState.phase === 'prepare') {
                slot.addEventListener('click', () => handleBoardSlotClick(i));
            }
            container.appendChild(slot);
        }
    }

    function renderHand(cards) {
        const container = document.getElementById('hand-container');
        if (!container) return;
        container.innerHTML = '';
        cards.forEach((card, index) => {
            if (!card) return;
            const el = createCardElement(card);
            el.addEventListener('click', () => handleHandCardClick(card, index));
            container.appendChild(el);
        });
    }

    function renderShop(cards) {
        const container = document.getElementById('shop-container');
        if (!container) return;
        container.innerHTML = '';
        cards.forEach((card, index) => {
            if (!card) return;
            const el = createCardElement(card);
            el.addEventListener('click', () => handleShopCardClick(card, index));
            container.appendChild(el);
        });
    }

    function createCardElement(card) {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `<div class="card-name">${card.name}</div><div class="card-stats">⚔️${card.atk} 🛡️${card.hp}</div><div class="card-price">💰${getCardPrice(card)}</div>${card.star > 0 ? '<div class="card-star">★</div>' : ''}`;
        return div;
    }

    function getCardPrice(card) {
        const prices = config.ECONOMY?.CARD_PRICE || { Common: { buy: 1 }, Rare: { buy: 2 }, Epic: { buy: 3 }, Legendary: { buy: 5 } };
        return prices[card.rarity]?.buy || 1;
    }

    function handleHandCardClick(card, index) {
        if (gameState.phase !== 'prepare') { log('⚠️ 只能在准备阶段操作', true); return; }
        selectedCard = { type: 'hand', card, index };
        document.querySelectorAll('.hand .card').forEach(c => c.classList.remove('selected'));
        document.querySelectorAll('.hand .card')[index]?.classList.add('selected');
    }

    async function handleShopCardClick(card, index) {
        if (gameState.phase !== 'prepare') return;
        const myState = gameState.players[auth.currentUser.id];
        const price = getCardPrice(card);
        if (myState.gold < price) { log('❌ 金币不足', true); return; }
        if (myState.hand.length >= config.HAND_MAX_COUNT) { log('❌ 手牌已满', true); return; }
        myState.gold -= price;
        myState.hand.push({ ...card, id: utils.uuid() });
        myState.shopCards.splice(index, 1);
        await updateGameState();
    }

    async function handleBoardSlotClick(slotIndex) {
        if (!selectedCard || selectedCard.type !== 'hand') { log('⚠️ 请先选择一张手牌', true); return; }
        const myState = gameState.players[auth.currentUser.id];
        const handIndex = selectedCard.index;
        const card = myState.hand[handIndex];
        const existingCard = myState.board[slotIndex];
        myState.board[slotIndex] = card;
        myState.hand.splice(handIndex, 1);
        if (existingCard) myState.hand.push(existingCard);
        selectedCard = null;
        document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
        await updateGameState();
    }

    async function refreshShop() {
        if (gameState.phase !== 'prepare') return;
        const myState = gameState.players[auth.currentUser.id];
        if (myState.gold < config.ECONOMY.REFRESH_COST) { log('❌ 金币不足', true); return; }
        myState.gold -= config.ECONOMY.REFRESH_COST;
        myState.shopCards = utils.generateShopCards(myState.shopLevel);
        await updateGameState();
    }

    async function buyExp() {
        if (gameState.phase !== 'prepare') return;
        const myState = gameState.players[auth.currentUser.id];
        const cost = 1;
        if (myState.gold < cost) { log('❌ 金币不足', true); return; }
        myState.gold -= cost;
        myState.exp += config.ECONOMY.GOLD_TO_EXP_RATE;
        const expNeeded = Object.values(config.ECONOMY.SHOP_LEVEL_EXP);
        while (myState.shopLevel < config.MAX_SHOP_LEVEL && myState.exp >= expNeeded[myState.shopLevel]) {
            myState.shopLevel++;
            log(`🎉 商店升级到 Lv.${myState.shopLevel}`);
        }
        await updateGameState();
    }

    async function endPreparePhase() {
        if (gameState.phase !== 'prepare') return;
        if (phaseTimer) clearTimeout(phaseTimer);
        if (timerInterval) clearInterval(timerInterval);
        await onPhaseEnd('prepare');
    }

    async function simulateBattle() {
        const players = Object.keys(gameState.players);
        if (players.length < 2) {
            log('⚠️ 玩家数量不足，跳过战斗');
            return;
        }

        for (let i = 0; i < players.length; i += 2) {
            if (i + 1 >= players.length) break;
            const p1 = players[i], p2 = players[i + 1];
            const winner = Math.random() > 0.5 ? p1 : p2;
            const loser = winner === p1 ? p2 : p1;
            const damage = 5 + Math.floor(Math.random() * 10);
            gameState.players[loser].health = Math.max(0, gameState.players[loser].health - damage);
            log(`⚔️ ${winner.slice(0,6)} 击败 ${loser.slice(0,6)}，造成 ${damage} 点伤害`);
        }

        players.forEach(pid => {
            if (gameState.players[pid].health <= 0) {
                log(`💀 玩家 ${pid.slice(0,6)} 被淘汰`);
            }
        });

        await updateGameState();
    }

    async function distributeRoundRewards() {
        const players = gameState.players;
        const round = gameState.round;
        const goldFunc = config.ECONOMY?.GOLD_PER_ROUND || function(r) {
            if (r === 1) return 1;
            if (r === 2) return 2;
            return (r - 1) * 2;
        };
        const goldToAdd = typeof goldFunc === 'function' ? goldFunc(round) : goldFunc[round] || 5;
        const expToAdd = config.ECONOMY?.EXP_PER_ROUND || 2;

        for (const pid in players) {
            const p = players[pid];
            p.gold += goldToAdd;
            p.exp += expToAdd;
            const expNeeded = Object.values(config.ECONOMY?.SHOP_LEVEL_EXP || {1:0,2:4,3:8,4:14,5:20});
            while (p.shopLevel < config.MAX_SHOP_LEVEL && p.exp >= expNeeded[p.shopLevel]) {
                p.shopLevel++;
            }
        }
        await updateGameState();
        log(`💰 回合 ${round} 奖励已发放: 金币 +${goldToAdd}, 经验 +${expToAdd}`);
    }

    function refreshAllShops() {
        for (const pid in gameState.players) {
            const p = gameState.players[pid];
            p.shopCards = utils.generateShopCards(p.shopLevel);
        }
    }

    function checkGameOver() {
        const players = gameState.players;
        const aliveReal = Object.values(players).filter(p => !p.isBot && p.health > 0);
        if (aliveReal.length <= 1) {
            return { isOver: true, winner: aliveReal[0]?.player_id || 'bot' };
        }
        return { isOver: false };
    }

    function endGame(winnerId) {
        log(`🏆 游戏结束！胜利者: ${winnerId}`);
        alert(`游戏结束！胜利者: ${winnerId}`);
        setTimeout(() => {
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            if (gameSubscription) {
                gameSubscription.unsubscribe();
                gameSubscription = null;
            }
            gameState = null;
            currentRoomId = null;
        }, 3000);
    }

    function startBotAutoPlay() {
        if (autoBotTimer) clearInterval(autoBotTimer);
        autoBotTimer = setInterval(async () => {
            if (!gameState || gameState.phase !== 'prepare') return;
            const myId = auth.currentUser?.id;
            if (!myId) return;
            const myState = gameState.players[myId];
            if (!myState || !myState.isBot) return;

            if (myState.gold >= 1 && myState.shopLevel < config.MAX_SHOP_LEVEL) {
                myState.gold--;
                myState.exp++;
                const expNeeded = Object.values(config.ECONOMY?.SHOP_LEVEL_EXP || {1:0,2:4,3:8,4:14,5:20});
                while (myState.shopLevel < config.MAX_SHOP_LEVEL && myState.exp >= expNeeded[myState.shopLevel]) {
                    myState.shopLevel++;
                }
                await updateGameState();
            }
        }, 2000);
    }

    function bindBattleEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShop);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click', refreshShop);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExp);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExp);
        document.getElementById('end-prepare-btn')?.addEventListener('click', endPreparePhase);

        document.getElementById('leave-battle-btn')?.addEventListener('click', async () => {
            if (!confirm('确定退出对局？')) return;
            if (phaseTimer) clearTimeout(phaseTimer);
            if (timerInterval) clearInterval(timerInterval);
            if (autoBotTimer) clearInterval(autoBotTimer);
            if (window.YYCardMatchmaking?.cancel) await window.YYCardMatchmaking.cancel();
            if (gameSubscription) gameSubscription.unsubscribe();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = null;
            currentRoomId = null;
            log('🚪 已退出对局，返回大厅');
        });

        document.getElementById('settings-btn')?.addEventListener('click', () => {
            alert('设置功能开发中...');
        });
    }

    return {
        enterBattle: enterBattle,
        getState: () => gameState
    };
})();

console.log('✅ battle.js 加载完成（阶段切换加固版）');

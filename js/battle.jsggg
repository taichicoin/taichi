// ==================== 对战系统（完整计时器 + 悠悠牌UI + 人机托管） ====================
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

    // ===== 计时器相关 =====
    let phaseTimer = null;           // 阶段切换的 setTimeout
    let timerInterval = null;        // UI倒计时更新的 setInterval
    let currentPhaseStartTime = 0;   // 当前阶段开始的时间戳（毫秒）
    let currentPhaseDuration = 0;    // 当前阶段总时长（秒）

    // 日志
    function log(msg, isError = false) {
        if (auth && typeof auth.log === 'function') {
            auth.log(msg, isError);
        } else {
            console.log(msg);
        }
    }

    // ===== 回合时长计算 =====
    function getPrepareDuration(round) {
        return 25 + (round - 1) * 10;
    }

    function getBattleDuration(round) {
        return 30 + (round - 1) * 5;
    }

    const SETTLE_DURATION = 3; // 结算固定3秒

    // ===== 计时器核心 =====
    function startPhaseTimer(phase, duration) {
        if (phaseTimer) clearTimeout(phaseTimer);
        if (timerInterval) clearInterval(timerInterval);

        currentPhaseDuration = duration;
        currentPhaseStartTime = Date.now();
        updateTimerDisplay(duration);

        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - currentPhaseStartTime) / 1000);
            const remaining = Math.max(0, currentPhaseDuration - elapsed);
            updateTimerDisplay(remaining);
        }, 100);

        phaseTimer = setTimeout(() => {
            clearInterval(timerInterval);
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

    // ===== 阶段结束处理 =====
    async function onPhaseEnd(phase) {
        if (!gameState || !currentRoomId) return;

        if (phase === 'prepare') {
            // 准备阶段结束 → 进入战斗阶段
            gameState.phase = 'battle';
            await updateGameState();
            renderBattleUI();

            const battleDuration = getBattleDuration(gameState.round);
            startPhaseTimer('battle', battleDuration);
            log(`⚔️ 进入战斗阶段，时长 ${battleDuration} 秒`);

            // 执行战斗模拟
            await simulateBattle();

        } else if (phase === 'battle') {
            // 战斗阶段结束 → 进入结算阶段
            gameState.phase = 'settle';
            await updateGameState();
            renderBattleUI();

            startPhaseTimer('settle', SETTLE_DURATION);
            log(`📊 进入结算阶段，时长 ${SETTLE_DURATION} 秒`);

        } else if (phase === 'settle') {
            // 结算阶段结束 → 发放奖励、检查淘汰、进入下一回合
            await distributeRoundRewards();

            const gameOver = checkGameOver();
            if (gameOver.isOver) {
                endGame(gameOver.winner);
                return;
            }

            // 进入下一回合准备阶段
            gameState.round++;
            gameState.phase = 'prepare';
            await updateGameState();
            renderBattleUI();

            // 刷新所有玩家的商店
            refreshAllShops();

            const prepareDuration = getPrepareDuration(gameState.round);
            startPhaseTimer('prepare', prepareDuration);
            log(`🛒 进入第 ${gameState.round} 回合准备阶段，时长 ${prepareDuration} 秒`);
        }
    }

    // ===== 进入对战视图 =====
    async function enterBattle(roomId) {
        currentRoomId = roomId;
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        
        log('🎮 进入对战视图');
        
        subscribeToGame(roomId);
        bindBattleEvents();
        startBotAutoPlay();

        // 等待状态加载后，启动第一回合计时器
        const waitForState = setInterval(() => {
            if (gameState && gameState.phase === 'prepare') {
                clearInterval(waitForState);
                const duration = getPrepareDuration(gameState.round);
                startPhaseTimer('prepare', duration);
                log(`🛒 第 ${gameState.round} 回合准备阶段，时长 ${duration} 秒`);
            }
        }, 100);
    }

    // ===== 订阅游戏状态 =====
    function subscribeToGame(roomId) {
        if (gameSubscription) {
            gameSubscription.unsubscribe();
        }

        gameSubscription = supabase
            .channel(`game:${roomId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'game_states',
                filter: `room_id=eq.${roomId}`
            }, (payload) => {
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

    // ===== 渲染8名玩家状态栏 =====
    function renderPlayerStatus() {
        const container = document.getElementById('player-status-list');
        if (!container || !gameState) return;
        
        const players = gameState.players;
        const myId = auth.currentUser.id;
        let html = '';
        
        for (const [pid, p] of Object.entries(players)) {
            const isMe = (pid === myId);
            const displayName = isMe ? '我' : (p.display_name || pid.slice(0,6));
            const avatarUrl = p.avatar_url || 'assets/default-avatar.png';
            
            html += `
                <div class="player-status-item">
                    <img src="${avatarUrl}" onerror="this.src='assets/default-avatar.png'">
                    <div style="flex:1;">
                        <div style="font-size:0.6rem;">${displayName}</div>
                        <div class="hp-bar">
                            <div class="hp-fill" style="width:${Math.max(0, (p.health/100)*100)}%;"></div>
                        </div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    // 渲染UI
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

        // 控制准备/战斗特有元素的显隐
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
        const prices = { 'Common': 1, 'Rare': 2, 'Epic': 3, 'Legendary': 5 };
        return prices[card.rare] || 1;
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
        if (myState.hand.length >= 15) { log('❌ 手牌已满', true); return; }
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
        if (myState.gold < 1) { log('❌ 金币不足', true); return; }
        myState.gold--;
        myState.shopCards = utils.generateShopCards(myState.shopLevel);
        await updateGameState();
    }

    async function buyExp() {
        if (gameState.phase !== 'prepare') return;
        const myState = gameState.players[auth.currentUser.id];
        if (myState.gold < 1) { log('❌ 金币不足', true); return; }
        myState.gold--;
        myState.exp++;
        const expNeeded = [0, 4, 8, 14, 20];
        while (myState.shopLevel < 5 && myState.exp >= expNeeded[myState.shopLevel]) {
            myState.shopLevel++;
            log(`🎉 商店升级到 Lv.${myState.shopLevel}`);
        }
        await updateGameState();
    }

    // 玩家手动结束准备（由计时器统一管理，这里只做校验和跳转）
    async function endPreparePhase() {
        if (gameState.phase !== 'prepare') return;
        // 手动结束准备：清除当前计时器，直接触发阶段结束
        if (phaseTimer) {
            clearTimeout(phaseTimer);
            phaseTimer = null;
        }
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        await onPhaseEnd('prepare');
    }

    // ===== 战斗模拟（只负责扣血和淘汰标记，不处理奖励和回合递增） =====
    async function simulateBattle() {
        const players = Object.keys(gameState.players);
        if (players.length < 2) return;

        for (let i = 0; i < players.length; i += 2) {
            if (i + 1 >= players.length) break;
            const p1 = players[i], p2 = players[i + 1];
            const winner = Math.random() > 0.5 ? p1 : p2;
            const loser = winner === p1 ? p2 : p1;
            const damage = 5 + Math.floor(Math.random() * 10);
            gameState.players[loser].health = Math.max(0, gameState.players[loser].health - damage);
            log(`⚔️ ${winner} 击败 ${loser}，造成 ${damage} 点伤害`);
        }

        players.forEach(pid => {
            if (gameState.players[pid].health <= 0) {
                log(`💀 玩家 ${pid} 被淘汰`);
            }
        });

        await updateGameState();
    }

    // ===== 发放回合奖励 =====
    async function distributeRoundRewards() {
        const players = gameState.players;
        for (const pid in players) {
            const p = players[pid];
            p.gold += config.BASE_GOLD_PER_ROUND(gameState.round);
            p.exp += config.BASE_EXP_PER_ROUND;
            const expNeeded = [0, 4, 8, 14, 20];
            while (p.shopLevel < 5 && p.exp >= expNeeded[p.shopLevel]) {
                p.shopLevel++;
            }
        }
        await updateGameState();
    }

    // ===== 刷新所有玩家商店 =====
    function refreshAllShops() {
        for (const pid in gameState.players) {
            const p = gameState.players[pid];
            p.shopCards = utils.generateShopCards(p.shopLevel);
        }
    }

    // ===== 检查游戏结束 =====
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
        // 清理并返回大厅
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

    // ===== 人机托管（只负责自动购买经验，不主动结束准备） =====
    function startBotAutoPlay() {
        if (autoBotTimer) clearInterval(autoBotTimer);
        autoBotTimer = setInterval(async () => {
            if (!gameState || gameState.phase !== 'prepare') return;
            const myId = auth.currentUser?.id;
            if (!myId) return;
            const myState = gameState.players[myId];
            if (!myState || !myState.isBot) return;

            if (myState.gold >= 1 && myState.shopLevel < 5) {
                myState.gold--;
                myState.exp++;
                const expNeeded = [0, 4, 8, 14, 20];
                while (myState.shopLevel < 5 && myState.exp >= expNeeded[myState.shopLevel]) {
                    myState.shopLevel++;
                }
                await updateGameState();
            }
        }, 2000);
    }

    function bindBattleEvents() {
        // 刷新商店（两个按钮）
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShop);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click', refreshShop);
        // 购买经验（两个按钮）
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExp);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExp);
        // 结束准备
        document.getElementById('end-prepare-btn')?.addEventListener('click', endPreparePhase);

        // 退出按钮：停止计时器，清理房间，返回大厅
        document.getElementById('leave-battle-btn')?.addEventListener('click', async () => {
            if (!confirm('确定退出对局？')) return;
            
            // 1. 停止所有计时器
            if (phaseTimer) clearTimeout(phaseTimer);
            if (timerInterval) clearInterval(timerInterval);
            if (autoBotTimer) clearInterval(autoBotTimer);
            
            // 2. 清理房间数据
            if (window.YYCardMatchmaking && typeof window.YYCardMatchmaking.cancel === 'function') {
                await window.YYCardMatchmaking.cancel();
            }
            
            // 3. 取消游戏状态订阅
            if (gameSubscription) {
                gameSubscription.unsubscribe();
                gameSubscription = null;
            }
            
            // 4. 切换视图
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            
            // 5. 重置全局变量
            gameState = null;
            currentRoomId = null;
            selectedCard = null;
            
            log('🚪 已退出对局，返回大厅');
        });

        // 设置按钮（暂时占位）
        document.getElementById('settings-btn')?.addEventListener('click', () => {
            alert('设置功能开发中...');
        });
    }

    return {
        enterBattle: enterBattle,
        getState: () => gameState
    };
})();

console.log('✅ battle.js 加载完成（含完整计时器）');

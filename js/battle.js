// ==================== 对战系统（完整功能版：计时器+商店+战斗+人机托管） ====================
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

    // ===== 手机调试面板 =====
    function initMobileDebugPanel() {
        const oldPanel = document.getElementById('mobile-debug-panel');
        if (oldPanel) oldPanel.remove();
        const panel = document.createElement('div');
        panel.id = 'mobile-debug-panel';
        panel.style.cssText = `
            position: fixed; bottom: 0; left: 0; right: 0; max-height: 120px; overflow-y: auto;
            background: rgba(0,0,0,0.8); color: #0f0; font-size: 10px; padding: 6px 10px;
            z-index: 9999; border-top: 1px solid #f5d76e; font-family: monospace; pointer-events: none;
        `;
        document.body.appendChild(panel);
        return panel;
    }

    function logToScreen(msg, isError = false) {
        const panel = document.getElementById('mobile-debug-panel') || initMobileDebugPanel();
        const line = document.createElement('div');
        line.style.color = isError ? '#ff7b7b' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
        panel.appendChild(line);
        panel.scrollTop = panel.scrollHeight;
        while (panel.children.length > 30) panel.removeChild(panel.firstChild);
    }

    function log(msg, isError = false) {
        if (auth && typeof auth.log === 'function') auth.log(msg, isError);
        else console.log(msg);
        logToScreen(msg, isError);
    }

    // ===== 安全的 DOM 操作 =====
    function safeSetText(id, value) {
        try { const el = document.getElementById(id); if (el) el.textContent = value; } catch (e) {}
    }

    // ===== 回合时长 =====
    function getPrepareDuration(round) { return 25 + (round - 1) * 10; }
    function getBattleDuration(round) { return 30 + (round - 1) * 5; }
    const SETTLE_DURATION = 3;

    // ===== 计时器 =====
    function startPhaseTimer(phase, duration) {
        if (phaseTimer) clearTimeout(phaseTimer);
        if (timerInterval) clearInterval(timerInterval);
        currentPhaseDuration = duration;
        currentPhaseStartTime = Date.now();
        updateTimerDisplay(duration);
        log(`⏱️ 启动计时器: ${phase} / ${duration}秒`);
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - currentPhaseStartTime) / 1000);
            const remaining = Math.max(0, currentPhaseDuration - elapsed);
            updateTimerDisplay(remaining);
        }, 100);
        phaseTimer = setTimeout(() => {
            clearInterval(timerInterval);
            log(`⏰ 计时器到期: ${phase}`);
            onPhaseEnd(phase);
        }, duration * 1000);
    }

    function updateTimerDisplay(seconds) {
        try {
            const timerEl = document.getElementById('phase-timer');
            if (timerEl) {
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        } catch (e) {}
    }

    // ===== 阶段结束处理 =====
    async function onPhaseEnd(phase) {
        log(`🔄 阶段结束: ${phase}`);
        if (!gameState || !currentRoomId) return;
        try {
            if (phase === 'prepare') {
                gameState.phase = 'battle';
                await updateGameState();
                applyUIMode(false);
                safeRenderBattleUI();
                startPhaseTimer('battle', getBattleDuration(gameState.round));
                await simulateBattle();
            } else if (phase === 'battle') {
                gameState.phase = 'settle';
                await updateGameState();
                applyUIMode(false);
                safeRenderBattleUI();
                startPhaseTimer('settle', SETTLE_DURATION);
            } else if (phase === 'settle') {
                await distributeRoundRewards();
                const gameOver = checkGameOver();
                if (gameOver.isOver) { endGame(gameOver.winner); return; }
                gameState.round++;
                gameState.phase = 'prepare';
                await updateGameState();
                applyUIMode(true);
                safeRenderBattleUI();
                await refreshAllShops();
                startPhaseTimer('prepare', getPrepareDuration(gameState.round));
            }
        } catch (e) {
            log(`❌ onPhaseEnd 出错: ${e.message}`, true);
        }
    }

    // ===== UI 模式 =====
    function applyUIMode(isPrepare) {
        try {
            document.body.classList.toggle('battle-view-mode', !isPrepare);
        } catch (e) {}
    }

    // ===== 进入对战 =====
    async function enterBattle(roomId) {
        currentRoomId = roomId;
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initMobileDebugPanel();
        log('🎮 进入对战视图，房间: ' + roomId);
        subscribeToGame(roomId);
        bindBattleEvents();
        startBotAutoPlay();

        const waitForState = setInterval(() => {
            if (!gameState) { log('⏳ 等待游戏状态加载...'); return; }
            clearInterval(waitForState);
            let phase = gameState.phase;
            const round = gameState.round;
            if (round === 1 && phase !== 'prepare') {
                phase = 'prepare';
                gameState.phase = 'prepare';
                updateGameState();
            }
            log(`📋 当前状态: 回合 ${round}, 阶段 ${phase}`);
            applyUIMode(phase === 'prepare');
            safeRenderBattleUI();
            if (phase === 'prepare') startPhaseTimer('prepare', getPrepareDuration(round));
            else if (phase === 'battle') startPhaseTimer('battle', getBattleDuration(round));
            else if (phase === 'settle') startPhaseTimer('settle', SETTLE_DURATION);
        }, 100);
    }

    function subscribeToGame(roomId) {
        if (gameSubscription) gameSubscription.unsubscribe();
        gameSubscription = supabase
            .channel(`game:${roomId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_states', filter: `room_id=eq.${roomId}` }, (payload) => {
                gameState = payload.new.state;
                applyUIMode(gameState.phase === 'prepare');
                safeRenderBattleUI();
            })
            .subscribe();
        supabase.from('game_states').select('state').eq('room_id', roomId).single().then(({ data }) => {
            if (data) { gameState = data.state; applyUIMode(gameState.phase === 'prepare'); safeRenderBattleUI(); }
        });
    }

    async function updateGameState() {
        if (!currentRoomId || !gameState) return;
        await supabase.from('game_states').update({ state: gameState }).eq('room_id', currentRoomId);
    }

    function safeRenderBattleUI() {
        try { renderBattleUI(); } catch (e) { log(`❌ renderBattleUI 出错: ${e.message}`, true); }
    }

    // ===== 渲染 UI =====
    function renderBattleUI() {
        if (!gameState) return;
        const myId = auth.currentUser.id;
        const myState = gameState.players[myId];
        if (!myState) return;

        safeSetText('my-health', myState.health);
        safeSetText('my-gold', myState.gold);
        safeSetText('shop-level', myState.shopLevel);
        safeSetText('round-num', gameState.round);
        safeSetText('hand-count', myState.hand.length);

        renderBoard('my-board', myState.board, true);
        renderHand(myState.hand);
        renderShop(myState.shopCards);

        const opponentId = Object.keys(gameState.players).find(id => id !== myId);
        if (opponentId) renderBoard('enemy-board', gameState.players[opponentId].board, false);

        const isBot = myState.isBot;
        const isMyTurn = gameState.phase === 'prepare';
        const endBtn = document.getElementById('end-prepare-btn');
        const refreshBtn = document.getElementById('refresh-shop-btn');
        const buyExpBtn = document.getElementById('buy-exp-btn');
        if (endBtn) endBtn.style.display = (isBot || !isMyTurn) ? 'none' : 'block';
        if (refreshBtn) refreshBtn.style.display = (isBot || !isMyTurn) ? 'none' : 'inline-block';
        if (buyExpBtn) buyExpBtn.style.display = (isBot || !isMyTurn) ? 'none' : 'inline-block';

        renderPlayerStatus();
    }

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

    function renderBoard(containerId, cards, isSelf) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const card = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            if (card) {
                slot.innerHTML = `<div class="card" data-rarity="${card.rarity}"><div class="card-name">${card.name}</div><div class="card-stats">⚔️${card.atk} 🛡️${card.hp}</div>${card.star > 0 ? '<div class="card-star">★</div>' : ''}</div>`;
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
        div.setAttribute('data-rarity', card.rarity);
        div.innerHTML = `<div class="card-name">${card.name}</div><div class="card-stats">⚔️${card.atk} 🛡️${card.hp}</div><div class="card-price">💰${getCardPrice(card)}</div>${card.star > 0 ? '<div class="card-star">★</div>' : ''}`;
        return div;
    }

    function getCardPrice(card) {
        const prices = config.ECONOMY?.CARD_PRICE || { Common: { buy: 1 }, Rare: { buy: 2 }, Epic: { buy: 3 }, Legendary: { buy: 5 } };
        return prices[card.rarity]?.buy || 1;
    }

    // ===== 交互 =====
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
        myState.shopCards = await utils.generateShopCards(myState.shopLevel);
        await updateGameState();
    }

    async function buyExp() {
        if (gameState.phase !== 'prepare') return;
        const myState = gameState.players[auth.currentUser.id];
        if (myState.gold < 1) { log('❌ 金币不足', true); return; }
        myState.gold--;
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

    // ===== 战斗模拟 =====
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
            log(`⚔️ ${winner.slice(0,6)} 击败 ${loser.slice(0,6)}，伤害 ${damage}`);
        }
        await updateGameState();
    }

    async function distributeRoundRewards() {
        const players = gameState.players;
        const round = gameState.round;
        const goldFunc = config.ECONOMY?.GOLD_PER_ROUND || ((r) => r === 1 ? 1 : r === 2 ? 2 : (r-1)*2);
        const goldToAdd = typeof goldFunc === 'function' ? goldFunc(round) : goldFunc[round] || 5;
        const expToAdd = config.ECONOMY?.EXP_PER_ROUND || 2;
        for (const pid in players) {
            const p = players[pid];
            p.gold += goldToAdd;
            p.exp += expToAdd;
            const expNeeded = Object.values(config.ECONOMY?.SHOP_LEVEL_EXP || {1:0,2:4,3:8,4:14,5:20});
            while (p.shopLevel < config.MAX_SHOP_LEVEL && p.exp >= expNeeded[p.shopLevel]) p.shopLevel++;
        }
        await updateGameState();
        log(`💰 回合奖励: 金币 +${goldToAdd}, 经验 +${expToAdd}`);
    }

    async function refreshAllShops() {
        for (const pid in gameState.players) {
            const p = gameState.players[pid];
            p.shopCards = await utils.generateShopCards(p.shopLevel);
        }
    }

    function checkGameOver() {
        const aliveReal = Object.values(gameState.players).filter(p => !p.isBot && p.health > 0);
        return aliveReal.length <= 1 ? { isOver: true, winner: aliveReal[0]?.player_id || 'bot' } : { isOver: false };
    }

    function endGame(winnerId) {
        log(`🏆 游戏结束！胜利者: ${winnerId}`);
        alert(`游戏结束！胜利者: ${winnerId}`);
        setTimeout(() => {
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            if (gameSubscription) gameSubscription.unsubscribe();
            gameState = null; currentRoomId = null;
        }, 3000);
    }

    function startBotAutoPlay() {
        if (autoBotTimer) clearInterval(autoBotTimer);
        autoBotTimer = setInterval(async () => {
            if (!gameState || gameState.phase !== 'prepare') return;
            const myState = gameState.players[auth.currentUser?.id];
            if (!myState || !myState.isBot) return;
            if (myState.gold >= 1 && myState.shopLevel < config.MAX_SHOP_LEVEL) {
                myState.gold--;
                myState.exp++;
                const expNeeded = Object.values(config.ECONOMY?.SHOP_LEVEL_EXP || {1:0,2:4,3:8,4:14,5:20});
                while (myState.shopLevel < config.MAX_SHOP_LEVEL && myState.exp >= expNeeded[myState.shopLevel]) myState.shopLevel++;
                await updateGameState();
                log(`🤖 人机购买了经验`);
            } else {
                // 人机自动结束准备
                if (phaseTimer) clearTimeout(phaseTimer);
                if (timerInterval) clearInterval(timerInterval);
                await onPhaseEnd('prepare');
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
            gameState = null; currentRoomId = null;
            log('🚪 已退出对局');
        });
    }

    return { enterBattle };
})();
console.log('✅ battle.js 加载完成（完整功能版）');

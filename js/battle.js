// ==================== 对战系统（新卡牌布局：图片填满 + 属性内部分布 + 金币外置） ====================
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
    let enterGuard = false;

    // ===== 手机调试面板 =====
    function initMobileDebugPanel() {
        const old = document.getElementById('mobile-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'mobile-debug-panel';
        p.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.9);color:#0f0;font-size:11px;padding:8px 10px;z-index:99999;border-top:2px solid #f5d76e;font-family:monospace;pointer-events:none;';
        document.body.appendChild(p);
        return p;
    }

    function logToScreen(msg, isError = false) {
        const p = document.getElementById('mobile-debug-panel') || initMobileDebugPanel();
        const line = document.createElement('div');
        line.style.color = isError ? '#ff7b7b' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
        p.appendChild(line);
        p.scrollTop = p.scrollHeight;
        while (p.children.length > 40) p.removeChild(p.firstChild);
    }

    window.addEventListener('error', (e) => {
        logToScreen(`❌ 全局错误: ${e.message}`, true);
    });

    function log(msg, isError = false) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        logToScreen(msg, isError);
    }

    function safeSetText(id, val) {
        try { const el = document.getElementById(id); if (el) el.textContent = val; } catch (e) {}
    }

    function getPrepareDuration(r) { return 25 + (r-1)*10; }
    function getBattleDuration(r) { return 30 + (r-1)*5; }
    const SETTLE_DURATION = 3;

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
            const el = document.getElementById('phase-timer');
            if (el) {
                const m = Math.floor(seconds/60).toString().padStart(2,'0');
                const s = (seconds%60).toString().padStart(2,'0');
                el.textContent = `${m}:${s}`;
            }
        } catch (e) {}
    }

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
                const over = checkGameOver();
                if (over.isOver) { endGame(over.winner); return; }
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

    function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch (e) {}
    }

    async function enterBattle(roomId) {
        if (enterGuard) { log('⚠️ 已在进入流程中，跳过重复调用'); return; }
        enterGuard = true;
        currentRoomId = roomId;
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initMobileDebugPanel();
        log('🎮 进入对战视图，房间: ' + roomId);
        subscribeToGame(roomId);
        bindBattleEvents();
        startBotAutoPlay();

        const wait = setInterval(() => {
            if (!gameState) { log('⏳ 等待游戏状态...'); return; }
            clearInterval(wait);
            let phase = gameState.phase;
            const round = gameState.round;
            if (round === 1 && phase !== 'prepare') {
                log(`⚠️ 状态异常 (${phase})，强制改为 prepare`, true);
                phase = 'prepare';
                gameState.phase = 'prepare';
                updateGameState();
            }
            log(`📋 回合 ${round}, 阶段 ${phase}`);
            applyUIMode(phase === 'prepare');
            safeRenderBattleUI();
            if (phase === 'prepare') startPhaseTimer('prepare', getPrepareDuration(round));
            else if (phase === 'battle') startPhaseTimer('battle', getBattleDuration(round));
            else startPhaseTimer('settle', SETTLE_DURATION);
            enterGuard = false;
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
        try { 
            renderBattleUI(); 
        } catch (e) { 
            log(`❌ renderBattleUI 出错: ${e.message}`, true); 
            logToScreen(`详细错误: ${e.stack}`, true);
        }
    }

    function renderBattleUI() {
        if (!gameState) return;
        const my = gameState.players[auth.currentUser.id];
        if (!my) return;
        safeSetText('my-health', my.health);
        safeSetText('my-gold', my.gold);
        safeSetText('shop-level', my.shopLevel);
        safeSetText('round-num', gameState.round);
        safeSetText('hand-count', my.hand.length);
        renderBoard('my-board', my.board, true);
        renderHand(my.hand);
        renderShop(my.shopCards);
        const opp = Object.keys(gameState.players).find(id => id !== auth.currentUser.id);
        if (opp) renderBoard('enemy-board', gameState.players[opp].board, false);
        const isBot = my.isBot;
        const isMyTurn = gameState.phase === 'prepare';
        const endBtn = document.getElementById('end-prepare-btn');
        const refreshBtn = document.getElementById('refresh-shop-btn');
        const buyExpBtn = document.getElementById('buy-exp-btn');
        if (endBtn) endBtn.style.display = (isBot || !isMyTurn) ? 'none' : 'block';
        if (refreshBtn) refreshBtn.style.display = (isBot || !isMyTurn) ? 'none' : 'inline-block';
        if (buyExpBtn) buyExpBtn.style.display = (isBot || !isMyTurn) ? 'none' : 'inline-block';
    }

    function renderBoard(containerId, cards, isSelf) {
        const cont = document.getElementById(containerId);
        if (!cont) return;
        cont.innerHTML = '';
        for (let i=0; i<6; i++) {
            const c = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            if (c) {
                slot.appendChild(createCardElement(c));
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
            }
            if (isSelf && gameState.phase==='prepare') {
                slot.addEventListener('click', ()=>handleBoardSlotClick(i));
            }
            cont.appendChild(slot);
        }
    }

    function renderHand(cards) {
        const cont = document.getElementById('hand-container');
        if (!cont) return;
        cont.innerHTML = '';
        cards.forEach((c,i) => {
            if(c) {
                const el = createCardElement(c);
                el.addEventListener('click', ()=>handleHandCardClick(c,i));
                cont.appendChild(el);
            }
        });
    }

    function renderShop(cards) {
        const cont = document.getElementById('shop-container');
        if (!cont) return;
        cont.innerHTML = '';
        if (!cards || cards.length === 0) {
            log('⚠️ 商店卡牌数组为空', true);
            cont.innerHTML = '<div style="color:#aaa;padding:10px;">商店刷新中...</div>';
            return;
        }
        cards.forEach((c,i) => {
            if(c) {
                const el = createCardElement(c);
                el.addEventListener('click', ()=>handleShopCardClick(c,i));
                cont.appendChild(el);
            }
        });
    }

    // ===== 新版卡牌布局：图片填满，攻击/生命在左下/右下，金币在外部下方 =====
    function createCardElement(card) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity);
        
        const imgPath = card.image || card.icon || `/assets/card/${card.cardId || card.id || 'default'}.png`;
        const price = getCardPrice(card);
        
        d.innerHTML = `
            <div class="card-icon">
                <img src="${imgPath}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'">
            </div>
            <div class="card-name">${card.name}</div>
            <div class="card-stats">
                <span class="card-atk">⚔️${card.atk}</span>
                <span class="card-hp">❤️${card.hp}</span>
            </div>
            <div class="card-price">💰${price}</div>
            ${card.star > 0 ? '<div class="card-star">★</div>' : ''}
        `;
        return d;
    }

    function getCardPrice(c) {
        const p = config.ECONOMY?.CARD_PRICE || { Common:{buy:1}, Rare:{buy:2}, Epic:{buy:3}, Legendary:{buy:5} };
        return p[c.rarity]?.buy || 1;
    }

    function handleHandCardClick(card, idx) {
        if (gameState.phase!=='prepare') { log('⚠️ 准备阶段才可操作', true); return; }
        selectedCard = { type:'hand', card, index: idx };
        document.querySelectorAll('.hand .card').forEach(el=>el.classList.remove('selected'));
        document.querySelectorAll('.hand .card')[idx]?.classList.add('selected');
    }

    async function handleShopCardClick(card, idx) {
        if (gameState.phase!=='prepare') return;
        const my = gameState.players[auth.currentUser.id];
        const price = getCardPrice(card);
        if (my.gold < price) { log('❌ 金币不足', true); return; }
        if (my.hand.length >= (config.HAND_MAX_COUNT||15)) { log('❌ 手牌已满', true); return; }
        my.gold -= price;
        my.hand.push({...card, id: utils.uuid() });
        my.shopCards.splice(idx,1);
        await updateGameState();
    }

    async function handleBoardSlotClick(idx) {
        if (!selectedCard || selectedCard.type!=='hand') { log('⚠️ 请先选择手牌', true); return; }
        const my = gameState.players[auth.currentUser.id];
        const handIdx = selectedCard.index;
        const card = my.hand[handIdx];
        const old = my.board[idx];
        my.board[idx] = card;
        my.hand.splice(handIdx,1);
        if (old) my.hand.push(old);
        selectedCard = null;
        document.querySelectorAll('.card.selected').forEach(el=>el.classList.remove('selected'));
        await updateGameState();
    }

    async function refreshShop() {
        if (gameState.phase!=='prepare') return;
        const my = gameState.players[auth.currentUser.id];
        const cost = config.ECONOMY?.REFRESH_COST || 1;
        if (my.gold < cost) { log('❌ 金币不足', true); return; }
        my.gold -= cost;
        my.shopCards = await utils.generateShopCards(my.shopLevel);
        await updateGameState();
    }

    async function buyExp() {
        if (gameState.phase!=='prepare') return;
        const my = gameState.players[auth.currentUser.id];
        if (my.gold < 1) { log('❌ 金币不足', true); return; }
        my.gold--;
        my.exp += config.ECONOMY?.GOLD_TO_EXP_RATE || 1;
        const expNeeded = Object.values(config.ECONOMY?.SHOP_LEVEL_EXP || {1:0,2:4,3:8,4:14,5:20});
        while (my.shopLevel < (config.MAX_SHOP_LEVEL||5) && my.exp >= expNeeded[my.shopLevel]) {
            my.shopLevel++;
            log(`🎉 商店升级到 Lv.${my.shopLevel}`);
        }
        await updateGameState();
    }

    async function endPreparePhase() {
        if (gameState.phase!=='prepare') return;
        if (phaseTimer) clearTimeout(phaseTimer);
        if (timerInterval) clearInterval(timerInterval);
        await onPhaseEnd('prepare');
    }

    async function simulateBattle() {
        const players = Object.keys(gameState.players);
        if (players.length<2) return;
        for (let i=0; i<players.length; i+=2) {
            if (i+1>=players.length) break;
            const p1=players[i], p2=players[i+1];
            const win = Math.random()>0.5?p1:p2;
            const lose = win===p1?p2:p1;
            const dmg = 5 + Math.floor(Math.random()*10);
            gameState.players[lose].health = Math.max(0, gameState.players[lose].health - dmg);
            log(`⚔️ ${win.slice(0,6)} 击败 ${lose.slice(0,6)}，伤害 ${dmg}`);
        }
        await updateGameState();
    }

    async function distributeRoundRewards() {
        const round = gameState.round;
        const goldFunc = config.ECONOMY?.GOLD_PER_ROUND || (r=> r===1?1: r===2?2: (r-1)*2);
        const goldAdd = typeof goldFunc==='function'? goldFunc(round): (goldFunc[round]||5);
        const expAdd = config.ECONOMY?.EXP_PER_ROUND || 2;
        for (const pid in gameState.players) {
            const p = gameState.players[pid];
            p.gold += goldAdd;
            p.exp += expAdd;
            const expNeeded = Object.values(config.ECONOMY?.SHOP_LEVEL_EXP || {1:0,2:4,3:8,4:14,5:20});
            while (p.shopLevel < (config.MAX_SHOP_LEVEL||5) && p.exp >= expNeeded[p.shopLevel]) p.shopLevel++;
        }
        await updateGameState();
        log(`💰 回合奖励: 金币 +${goldAdd}, 经验 +${expAdd}`);
    }

    async function refreshAllShops() {
        for (const pid in gameState.players) {
            try {
                gameState.players[pid].shopCards = await utils.generateShopCards(gameState.players[pid].shopLevel);
            } catch (e) {
                log(`❌ 刷新 ${pid} 商店失败: ${e.message}`, true);
            }
        }
    }

    function checkGameOver() {
        const alive = Object.values(gameState.players).filter(p=>!p.isBot && p.health>0);
        return alive.length<=1 ? { isOver: true, winner: alive[0]?.player_id || 'bot' } : { isOver: false };
    }

    function endGame(winnerId) {
        log(`🏆 游戏结束！胜利者: ${winnerId}`);
        alert(`游戏结束！胜利者: ${winnerId}`);
        setTimeout(() => {
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            if (gameSubscription) gameSubscription.unsubscribe();
            gameState = currentRoomId = null;
        }, 3000);
    }

    function startBotAutoPlay() {
        if (autoBotTimer) clearInterval(autoBotTimer);
        autoBotTimer = setInterval(async () => {
            if (!gameState || gameState.phase!=='prepare') return;
            const my = gameState.players[auth.currentUser?.id];
            if (!my || !my.isBot) return;
            if (my.gold>=1 && my.shopLevel<(config.MAX_SHOP_LEVEL||5)) {
                my.gold--;
                my.exp++;
                const expNeeded = Object.values(config.ECONOMY?.SHOP_LEVEL_EXP || {1:0,2:4,3:8,4:14,5:20});
                while (my.shopLevel < (config.MAX_SHOP_LEVEL||5) && my.exp >= expNeeded[my.shopLevel]) my.shopLevel++;
                await updateGameState();
                log(`🤖 人机购买了经验`);
            }
        }, 2000);
    }

    function bindBattleEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShop);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click', refreshShop);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExp);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExp);
        document.getElementById('end-prepare-btn')?.addEventListener('click', endPreparePhase);
        document.getElementById('leave-battle-btn')?.addEventListener('click', async ()=>{
            if(!confirm('确定退出对局？')) return;
            if(phaseTimer) clearTimeout(phaseTimer);
            if(timerInterval) clearInterval(timerInterval);
            if(autoBotTimer) clearInterval(autoBotTimer);
            if(window.YYCardMatchmaking?.cancel) await window.YYCardMatchmaking.cancel();
            if(gameSubscription) gameSubscription.unsubscribe();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
            log('🚪 已退出对局');
        });
    }

    return { enterBattle };
})();

console.log('✅ battle.js 加载完成（新卡牌布局版）');

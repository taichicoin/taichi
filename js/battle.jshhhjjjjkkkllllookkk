// ==================== 对战系统【100%适配新布局 + 全功能兼容修复版】 ====================
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

    // ===== 手机调试面板（完全保留） =====
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

    // ===== 【修复】安全设置文本，同步所有关联ID =====
    function safeSetText(id, val) {
        try { 
            // 同步主ID和顶部显示ID
            const syncMap = {
                'round-num': ['round-num', 'round-num-top'],
                'my-health': ['my-health', 'my-health-top'],
                'my-gold': ['my-gold'],
                'shop-level': ['shop-level'],
                'hand-count': ['hand-count'],
                'phase-timer': ['phase-timer', 'phase-timer-battle']
            };
            const targetIds = syncMap[id] || [id];
            targetIds.forEach(targetId => {
                const el = document.getElementById(targetId);
                if (el) el.textContent = val;
            });
        } catch (e) {
            log(`safeSetText 警告: ${e.message}`, true);
        }
    }

    // ===== 回合时长配置（完全保留原有规则） =====
    function getPrepareDuration(r) { return 25 + (r-1)*10; }
    function getBattleDuration(r) { return 30 + (r-1)*5; }
    const SETTLE_DURATION = 3;

    // ===== 【修复】分阶段更新定时器显示 =====
    function startPhaseTimer(phase, duration) {
        if (phaseTimer) clearTimeout(phaseTimer);
        if (timerInterval) clearInterval(timerInterval);
        currentPhaseDuration = duration;
        currentPhaseStartTime = Date.now();
        updateTimerDisplay(duration, phase);
        log(`⏱️ 启动计时器: ${phase} / ${duration}秒`);
        
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - currentPhaseStartTime) / 1000);
            const remaining = Math.max(0, currentPhaseDuration - elapsed);
            updateTimerDisplay(remaining, phase);
        }, 100);
        
        phaseTimer = setTimeout(() => {
            clearInterval(timerInterval);
            log(`⏰ 计时器到期: ${phase}`);
            onPhaseEnd(phase);
        }, duration * 1000);
    }

    // ===== 【修复】分阶段更新对应定时器元素，格式适配截图 =====
    function updateTimerDisplay(seconds, phase) {
        try {
            // 准备阶段：显示MM:SS格式，适配紫色圆形按钮
            if (phase === 'prepare') {
                const m = Math.floor(seconds/60).toString().padStart(2,'0');
                const s = (seconds%60).toString().padStart(2,'0');
                safeSetText('phase-timer', `${m}:${s}`);
            }
            // 战斗阶段：显示纯秒数，适配战斗布局
            else if (phase === 'battle') {
                safeSetText('phase-timer-battle', seconds);
            }
            // 结算阶段：不显示倒计时
        } catch (e) {}
    }

    async function onPhaseEnd(phase) {
        log(`🔄 阶段结束: ${phase}`);
        if (!gameState || !currentRoomId) return;
        try {
            if (phase === 'prepare') {
                gameState.phase = 'battle';
                await updateGameState();
                applyUIMode(false); // 切换战斗模式
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
                applyUIMode(true); // 切换准备模式
                safeRenderBattleUI();
                await refreshAllShops();
                startPhaseTimer('prepare', getPrepareDuration(gameState.round));
            }
        } catch (e) {
            log(`❌ onPhaseEnd 出错: ${e.message}`, true);
        }
    }

    // ============ 【修复】视图切换核心函数，完全适配CSS类控制 ============
    function applyUIMode(isPrepare) {
        try {
            if(isPrepare){
                document.body.classList.remove('battle-view-mode');
            }else{
                document.body.classList.add('battle-view-mode');
            }
            log(`📱 UI模式切换: ${isPrepare ? '准备阶段' : '战斗阶段'}`);
        } catch (e) {
            log(`applyUIMode 出错: ${e.message}`, true);
        }
    }

    // ============ 【修复】进入对局核心函数，适配新布局初始化 ============
    async function enterBattle(roomId) {
        if (enterGuard) { log('⚠️ 已在进入流程中，跳过重复调用'); return; }
        enterGuard = true;
        currentRoomId = roomId;
        
        // 视图切换
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initMobileDebugPanel();
        log('🎮 进入对战视图，房间: ' + roomId);
        
        // 初始化订阅和事件
        subscribeToGame(roomId);
        bindBattleEvents();
        startBotAutoPlay();

        // 等待游戏状态加载
        let attempts = 0;
        const MAX_ATTEMPTS = 15;
        const waitForState = async () => {
            if (gameState) {
                startGameWithState();
                return;
            }
            if (attempts < MAX_ATTEMPTS) {
                attempts++;
                log(`⏳ 等待游戏状态... (${attempts}/${MAX_ATTEMPTS})`);
                const { data } = await supabase
                    .from('game_states')
                    .select('state')
                    .eq('room_id', roomId)
                    .maybeSingle();
                if (data?.state) {
                    gameState = data.state;
                    startGameWithState();
                    return;
                }
                setTimeout(waitForState, 200);
            } else {
                log('❌ 等待游戏状态超时，请返回大厅重新匹配', true);
                alert('游戏状态加载失败，请重试');
                document.getElementById('battle-view').style.display = 'none';
                document.getElementById('lobby-view').style.display = 'block';
                if (gameSubscription) gameSubscription.unsubscribe();
                enterGuard = false;
            }
        };

        // 游戏状态初始化
        const startGameWithState = () => {
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
            // 按阶段启动对应计时器
            if (phase === 'prepare') startPhaseTimer('prepare', getPrepareDuration(round));
            else if (phase === 'battle') startPhaseTimer('battle', getBattleDuration(round));
            else startPhaseTimer('settle', SETTLE_DURATION);
            enterGuard = false;
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
                safeRenderBattleUI();
            })
            .subscribe();
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

    // ============ 【修复】UI渲染核心函数，完全适配新布局 ============
    function renderBattleUI() {
        if (!gameState) return;
        const myId = auth.currentUser.id;
        const my = gameState.players[myId];
        if (!my) return;

        // 1. 同步核心数值（自动同步顶部和原有ID）
        safeSetText('my-health', my.health);
        safeSetText('my-gold', my.gold);
        safeSetText('shop-level', my.shopLevel);
        safeSetText('round-num', gameState.round);
        safeSetText('hand-count', my.hand.length);

        // 2. 渲染棋盘（准备阶段3行2列/战斗阶段2行3列，CSS自动适配布局）
        renderBoard('my-board', my.board, true);

        // 3. 渲染手牌（准备阶段显示，战斗阶段CSS自动隐藏）
        renderHand(my.hand);

        // 4. 渲染商店（准备阶段显示，战斗阶段CSS自动隐藏）
        renderShop(my.shopCards);

        // 5. 渲染敌方棋盘（战斗阶段显示，准备阶段CSS自动隐藏）
        const oppId = Object.keys(gameState.players).find(id => id !== myId);
        if (oppId) renderBoard('enemy-board', gameState.players[oppId].board, false);

        // 6. 渲染玩家状态列表（左侧垂直头像，适配双阶段）
        renderPlayerStatusList();

        // 7. 按钮权限控制
        const isBot = my.isBot;
        const isMyTurn = gameState.phase === 'prepare';
        const endBtn = document.getElementById('end-prepare-btn');
        if (endBtn) endBtn.style.pointerEvents = (isBot || !isMyTurn) ? 'none' : 'auto';
    }

    // ============ 【新增】玩家状态列表渲染，适配双阶段布局 ============
    function renderPlayerStatusList() {
        const container = document.getElementById('player-status-list');
        if (!container || !gameState) return;
        container.innerHTML = '';

        Object.values(gameState.players).forEach(player => {
            const item = document.createElement('div');
            item.className = 'player-status-item';
            
            // 头像
            const avatar = document.createElement('img');
            avatar.src = player.avatar || '/assets/default-avatar.png';
            avatar.alt = player.username;
            avatar.onerror = () => { avatar.src = '/assets/default-avatar.png'; };
            
            // 等级
            const level = document.createElement('div');
            level.className = 'player-level';
            level.textContent = player.level || 1;
            
            // 血条（战斗阶段显示，准备阶段CSS自动隐藏）
            const hpBar = document.createElement('div');
            hpBar.className = 'hp-bar';
            const hpFill = document.createElement('div');
            hpFill.className = 'hp-fill';
            hpFill.style.width = `${Math.max(0, Math.min(100, (player.health / 100) * 100))}%`;
            hpBar.appendChild(hpFill);

            item.appendChild(avatar);
            item.appendChild(level);
            item.appendChild(hpBar);
            container.appendChild(item);
        });
    }

    // ============ 棋盘渲染（完全保留原有逻辑，适配新布局） ============
    function renderBoard(containerId, cards, isSelf) {
        const cont = document.getElementById(containerId);
        if (!cont) return;
        cont.innerHTML = '';
        // 固定6个棋盘格，CSS自动控制准备/战斗阶段的行列布局
        for (let i=0; i<6; i++) {
            const c = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            if (c) {
                slot.appendChild(createCardElement(c));
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
            }
            // 仅准备阶段可点击棋盘
            if (isSelf && gameState.phase==='prepare') {
                slot.addEventListener('click', ()=>handleBoardSlotClick(i));
            }
            cont.appendChild(slot);
        }
    }

    // ============ 手牌渲染（完全保留原有逻辑） ============
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

    // ============ 商店渲染（适配3张卡牌布局，完全保留原有逻辑） ============
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

    // ============ 卡牌元素创建（100%保留原有样式和逻辑） ============
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
                <span class="card-hp">🛡️${card.hp}</span>
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

    // ============ 手牌点击事件（完全保留原有逻辑） ============
    function handleHandCardClick(card, idx) {
        if (gameState.phase!=='prepare') { log('⚠️ 准备阶段才可操作', true); return; }
        selectedCard = { type:'hand', card, index: idx };
        document.querySelectorAll('.hand .card').forEach(el=>el.classList.remove('selected'));
        document.querySelectorAll('.hand .card')[idx]?.classList.add('selected');
    }

    // ============ 商店卡牌点击事件（完全保留原有逻辑） ============
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

    // ============ 棋盘格子点击事件（完全保留原有逻辑） ============
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

    // ============ 刷新商店按钮事件（完全保留原有逻辑） ============
    async function refreshShop() {
        if (gameState.phase!=='prepare') return;
        const my = gameState.players[auth.currentUser.id];
        const cost = config.ECONOMY?.REFRESH_COST || 1;
        if (my.gold < cost) { log('❌ 金币不足', true); return; }
        my.gold -= cost;
        my.shopCards = await utils.generateShopCards(my.shopLevel);
        await updateGameState();
    }

    // ============ 购买经验按钮事件（完全保留原有逻辑） ============
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

    // ============ 结束准备阶段按钮事件（完全保留原有逻辑） ============
    async function endPreparePhase() {
        if (gameState.phase!=='prepare') return;
        if (phaseTimer) clearTimeout(phaseTimer);
        if (timerInterval) clearInterval(timerInterval);
        await onPhaseEnd('prepare');
    }

    // ============ 战斗模拟（完全保留原有逻辑） ============
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

    // ============ 回合奖励发放（完全保留原有逻辑） ============
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

    // ============ 全玩家商店刷新（完全保留原有逻辑） ============
    async function refreshAllShops() {
        for (const pid in gameState.players) {
            try {
                gameState.players[pid].shopCards = await utils.generateShopCards(gameState.players[pid].shopLevel);
            } catch (e) {
                log(`❌ 刷新 ${pid} 商店失败: ${e.message}`, true);
            }
        }
    }

    // ============ 游戏结束判断（完全保留原有逻辑） ============
    function checkGameOver() {
        const alive = Object.values(gameState.players).filter(p=>!p.isBot && p.health>0);
        return alive.length<=1 ? { isOver: true, winner: alive[0]?.player_id || 'bot' } : { isOver: false };
    }

    // ============ 游戏结束处理（完全保留原有逻辑） ============
    function endGame(winnerId) {
        log(`🏆 游戏结束！胜利者: ${winnerId}`);
        alert(`游戏结束！胜利者: ${winnerId}`);
        setTimeout(() => {
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            if (gameSubscription) gameSubscription.unsubscribe();
            if (phaseTimer) clearTimeout(phaseTimer);
            if (timerInterval) clearInterval(timerInterval);
            if (autoBotTimer) clearInterval(autoBotTimer);
            gameState = currentRoomId = null;
        }, 3000);
    }

    // ============ 人机自动操作（完全保留原有逻辑） ============
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

    // ============ 【修复】事件绑定，适配新HTML的按钮ID ============
    function bindBattleEvents() {
        // 清除旧事件，避免重复绑定
        const clearEvent = (id, event) => {
            const el = document.getElementById(id);
            if (el) {
                const newEl = el.cloneNode(true);
                el.parentNode.replaceChild(newEl, el);
                return newEl;
            }
            return null;
        };

        // 刷新商店按钮
        const refreshBtn = clearEvent('refresh-shop-btn', 'click');
        if (refreshBtn) refreshBtn.addEventListener('click', refreshShop);
        
        // 购买经验按钮
        const buyExpBtn = clearEvent('buy-exp-btn', 'click');
        if (buyExpBtn) buyExpBtn.addEventListener('click', buyExp);
        
        // 结束准备按钮（紫色圆形内的透明按钮）
        const endBtn = clearEvent('end-prepare-btn', 'click');
        if (endBtn) endBtn.addEventListener('click', endPreparePhase);
        
        // 退出对局按钮
        const leaveBtn = clearEvent('leave-battle-btn', 'click');
        if (leaveBtn) {
            leaveBtn.addEventListener('click', async () => {
                if(!confirm('确定退出对局？')) return;
                // 清除所有定时器
                if(phaseTimer) clearTimeout(phaseTimer);
                if(timerInterval) clearInterval(timerInterval);
                if(autoBotTimer) clearInterval(autoBotTimer);
                // 清理匹配和订阅
                if(window.YYCardMatchmaking?.cancel) await window.YYCardMatchmaking.cancel();
                if(gameSubscription) gameSubscription.unsubscribe();
                // 切换视图
                document.getElementById('battle-view').style.display = 'none';
                document.getElementById('lobby-view').style.display = 'block';
                // 重置状态
                gameState = currentRoomId = null;
                log('🚪 已退出对局');
            });
        }

        // 设置按钮（保留原有ID，可扩展功能）
        const settingsBtn = clearEvent('settings-btn', 'click');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                alert('设置功能开发中');
            });
        }
    }

    return { enterBattle };
})();

console.log('✅ battle.js 加载完成【100%适配新布局 + 全功能兼容修复版】');

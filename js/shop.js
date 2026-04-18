// ==================== 商店与交互系统（后端驱动版-完整修复版） ====================
window.YYCardShop = (function() {
    // 依赖容错处理，避免未加载时报错
    const utils = window.YYCardUtils || {};
    const config = window.YYCardConfig || {
        MAX_SHOP_LEVEL: 5,
        ECONOMY: {
            CARD_PRICE: {
                Common: { buy: 1, sell: 0 },
                Rare: { buy: 2, sell: 1 },
                Epic: { buy: 3, sell: 1 },
                Legendary: { buy: 4, sell: 2 }
            }
        }
    };
    
    // 核心状态变量
    let currentPhase = 'prepare';
    let toastTimer = null;
    let currentRoomId = null;  // 从 battle.js 获取

    // 拖拽状态管理
    let dragState = {
        active: false,
        type: null,         // 'hand', 'board', 'shop'
        card: null,
        index: -1,
        sourceElement: null,
        cloneElement: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0
    };

    // ==================== 调试面板与日志系统 ====================
    function initDebugPanel() {
        const old = document.getElementById('shop-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'shop-debug-panel';
        p.style.cssText = `
            position:fixed; top:0; left:0; right:0; max-height:120px; overflow-y:auto;
            color:#0f0; font-size:11px; padding:4px 8px;
            z-index:100000;
            font-family:monospace; pointer-events:none; text-shadow:0 0 4px black;
            background: transparent;
            border: none;
        `;
        document.body.appendChild(p);
        return p;
    }

    function logToScreen(msg, isError = false) {
        const p = document.getElementById('shop-debug-panel') || initDebugPanel();
        const line = document.createElement('div');
        line.style.color = isError ? '#ff7b7b' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
        p.appendChild(line);
        p.scrollTop = p.scrollHeight;
        while (p.children.length > 30) p.removeChild(p.firstChild);
    }

    function log(msg, isError = false) {
        console[isError ? 'error' : 'log'](`[YYCardShop] ${msg}`);
        logToScreen(msg, isError);
    }

    function toast(message, isError = false, duration = 2000) {
        const oldToast = document.getElementById('shop-toast');
        if (oldToast) oldToast.remove();
        if (toastTimer) clearTimeout(toastTimer);
        
        const toastEl = document.createElement('div');
        toastEl.id = 'shop-toast';
        toastEl.style.cssText = `
            position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
            background:${isError ? 'rgba(200,50,50,0.9)' : 'rgba(30,40,60,0.95)'};
            color:white; font-size:14px; padding:10px 20px; border-radius:30px;
            z-index:100001; border:1px solid ${isError ? '#ff7b7b' : '#f5d76e'};
            box-shadow:0 4px 12px rgba(0,0,0,0.3); font-weight:bold;
            backdrop-filter:blur(4px); pointer-events:none; white-space:nowrap;
        `;
        toastEl.textContent = message;
        document.body.appendChild(toastEl);
        
        toastTimer = setTimeout(() => {
            if (toastEl.parentNode) toastEl.remove();
            toastTimer = null;
        }, duration);
    }

    // ==================== 核心辅助函数 ====================
    function getCurrentUserId() {
        return window.YYCardAuth?.currentUser?.id || null;
    }

    function getGameState() {
        return window.YYCardBattle?.getGameState?.() || null;
    }

    // 设置房间ID（由 battle.js 调用）
    function setRoomId(roomId) {
        currentRoomId = roomId;
        log(`房间ID已设置: ${roomId}`);
    }

    // ==================== UI渲染核心 ====================
    function renderMyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players?.[userId];
        if (!my) return;
        renderBoard('my-board', my.board || [], true);
    }

    function renderEnemyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        let oppId = null;

        // 优先取对战配对的对手
        if (gameState.phase === 'battle' && gameState.battlePairs) {
            for (const [p1, p2] of gameState.battlePairs) {
                if (p1 === userId && p2) { oppId = p2; break; }
                if (p2 === userId && p1) { oppId = p1; break; }
            }
        }

        // 兜底取存活玩家
        if (!oppId) {
            const aliveHumans = Object.entries(gameState.players || {}).filter(([id, p]) => 
                id !== userId && !p.isBot && p.health > 0 && !p.isEliminated
            );
            if (aliveHumans.length > 0) oppId = aliveHumans[0][0];
        }
        if (!oppId) {
            const aliveAny = Object.entries(gameState.players || {}).find(([id, p]) => 
                id !== userId && p.health > 0 && !p.isEliminated
            );
            if (aliveAny) oppId = aliveAny[0];
        }
        if (!oppId) oppId = Object.keys(gameState.players || {})[0];

        // 渲染对手棋盘（镜像翻转）
        if (oppId && gameState.players[oppId]) {
            const originalBoard = gameState.players[oppId].board || [];
            const enemyDisplayBoard = [
                originalBoard[3], originalBoard[4], originalBoard[5],
                originalBoard[0], originalBoard[1], originalBoard[2]
            ];
            renderBoard('enemy-board', enemyDisplayBoard, false);
        }
    }

    function renderHand() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players?.[userId];
        if (!my) return;

        const container = document.getElementById('hand-container');
        if (!container) return;
        container.innerHTML = '';

        const handList = my.hand || [];
        handList.forEach((card, i) => {
            if (card) {
                const el = createCardElement(card);
                el.setAttribute('data-hand-index', i);
                el.setAttribute('data-card-type', 'hand');
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'hand', card, i, el));
                container.appendChild(el);
            }
        });

        const countEl = document.getElementById('hand-count');
        if (countEl) countEl.textContent = handList.filter(c => c).length;
    }

    function renderShop() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players?.[userId];
        if (!my) return;

        const container = document.getElementById('shop-container');
        if (!container) return;
        container.innerHTML = '';

        const shopCards = my.shopCards || [];
        if (shopCards.length === 0) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">商店暂无卡牌</div>';
            return;
        }

        shopCards.forEach((card, i) => {
            if (card) {
                const el = createCardElement(card);
                el.setAttribute('data-shop-index', i);
                el.setAttribute('data-card-type', 'shop');
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'shop', card, i, el));
                container.appendChild(el);
            }
        });
    }

    function refreshAllUI() {
        log('刷新全部UI');
        renderMyBoard();
        renderEnemyBoard();
        renderHand();
        renderShop();

        const gameState = getGameState();
        if (gameState) {
            const userId = getCurrentUserId();
            const my = gameState.players?.[userId];
            if (my) {
                // 更新玩家状态
                const healthEls = [
                    document.getElementById('my-health'),
                    document.getElementById('my-health-top')
                ];
                healthEls.forEach(el => el && (el.textContent = my.health || 0));

                const goldEl = document.getElementById('my-gold');
                goldEl && (goldEl.textContent = my.gold || 0);

                const shopLevelEl = document.getElementById('shop-level');
                shopLevelEl && (shopLevelEl.textContent = my.shopLevel || 1);

                // 更新回合数
                const roundEls = [
                    document.getElementById('round-num'),
                    document.getElementById('round-num-top')
                ];
                roundEls.forEach(el => el && (el.textContent = gameState.round || 1));

                updateBuyExpButtonState();
            }
        }
    }

    function updateBuyExpButtonState() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players?.[userId];
        if (!my) return;

        const isMaxLevel = my.shopLevel >= (config.MAX_SHOP_LEVEL || 5);
        const isMyTurn = gameState.phase === 'prepare';
        const shouldDisable = my.isBot || !isMyTurn || isMaxLevel;

        ['buy-exp-btn', 'buy-exp-btn-bottom'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.textContent = isMaxLevel ? '📈 已满级' : '📈 升级';
                btn.disabled = shouldDisable;
                btn.style.pointerEvents = shouldDisable ? 'none' : 'auto';
                btn.style.opacity = shouldDisable ? '0.6' : '1';
            }
        });
    }

    function renderBoard(containerId, cards, isSelf) {
        const cont = document.getElementById(containerId);
        if (!cont) return;
        cont.innerHTML = '';

        for (let i = 0; i < 6; i++) {
            const c = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.setAttribute('data-slot-index', i);
            
            if (c) {
                const el = createCardElement(c);
                if (isSelf) {
                    el.setAttribute('data-board-index', i);
                    el.setAttribute('data-card-type', 'board');
                    el.addEventListener('pointerdown', (e) => onDragStart(e, 'board', c, i, el));
                }
                slot.appendChild(el);
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
            }
            cont.appendChild(slot);
        }
    }

    function createCardElement(card) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity || 'Common');
        
        const imgPath = card.image || card.icon || `/assets/card/${card.cardId || card.id || 'default'}.png`;
        const price = (config.ECONOMY.CARD_PRICE?.[card.rarity]?.buy) || 1;
        
        d.innerHTML = `
            <div class="card-icon">
                <img src="${imgPath}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'">
            </div>
            <div class="card-name">${card.name}</div>
            <div class="card-stats">
                <span class="card-atk">⚔️${card.atk || 0}</span>
                <span class="card-hp">🛡️${card.hp || 0}</span>
            </div>
            <div class="card-price">💰${price}</div>
            ${card.star > 0 ? '<div class="card-star">★</div>' : ''}
        `;
        d.querySelector('img').draggable = false;
        return d;
    }

    // ==================== 拖拽核心逻辑（完整修复） ====================
    function onDragStart(e, type, card, index, element) {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare' || currentPhase === 'buffering') {
            toast('当前阶段无法操作', true);
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        element.setPointerCapture(e.pointerId);

        const clientX = e.clientX;
        const clientY = e.clientY;

        // 创建拖拽克隆体
        const clone = element.cloneNode(true);
        clone.classList.add('card-drag-clone');
        clone.style.cssText = `
            position: fixed;
            z-index: 99999;
            left: ${clientX - element.offsetWidth / 2}px;
            top: ${clientY - element.offsetHeight / 2}px;
            width: ${element.offsetWidth}px;
            height: ${element.offsetHeight}px;
            opacity: 0.85;
            transform: scale(1.05);
            box-shadow: 0 8px 20px rgba(0,0,0,0.5);
            pointer-events: none;
            transition: none;
        `;
        document.body.appendChild(clone);
        element.style.opacity = '0.3';

        // 初始化拖拽状态
        dragState = {
            active: true,
            type, card, index,
            sourceElement: element,
            cloneElement: clone,
            startX: clientX, startY: clientY,
            currentX: clientX, currentY: clientY
        };

        // 绑定拖拽事件
        document.addEventListener('pointermove', onDragMove);
        document.addEventListener('pointerup', onDragEnd);
        document.addEventListener('pointercancel', onDragEnd);
    }

    function onDragMove(e) {
        if (!dragState.active) return;
        e.preventDefault();

        const clientX = e.clientX;
        const clientY = e.clientY;
        dragState.currentX = clientX;
        dragState.currentY = clientY;

        // 更新克隆体位置
        const clone = dragState.cloneElement;
        clone.style.left = (clientX - clone.offsetWidth / 2) + 'px';
        clone.style.top = (clientY - clone.offsetHeight / 2) + 'px';

        // 出售区域高亮
        if (dragState.type === 'hand' || dragState.type === 'board') {
            const shopContainer = document.getElementById('shop-container');
            if (shopContainer) {
                const shopArea = shopContainer.closest('.shop-area');
                if (shopArea) {
                    const rect = shopArea.getBoundingClientRect();
                    const isOverShop = clientX >= rect.left && clientX <= rect.right &&
                                       clientY >= rect.top && clientY <= rect.bottom;
                    shopArea.classList.toggle('drop-target', isOverShop);
                }
            }
        }
    }

    function onDragEnd(e) {
        if (!dragState.active) return;
        e.preventDefault();

        const { type, card, index, sourceElement, cloneElement, currentX, currentY } = dragState;

        // 清理DOM
        cloneElement.remove();
        sourceElement.style.opacity = '';
        sourceElement.releasePointerCapture?.(e.pointerId);

        // 清理高亮
        const shopArea = document.querySelector('.shop-area');
        if (shopArea) shopArea.classList.remove('drop-target');

        // 解绑事件
        document.removeEventListener('pointermove', onDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);

        // 获取落点
        const targetElement = document.elementFromPoint(currentX, currentY);
        const dropResult = targetElement ? getDropTarget(targetElement) : null;

        // 执行落地操作
        if (dropResult) {
            executeDropAction(type, index, card, dropResult);
        }

        // 重置拖拽状态
        dragState = {
            active: false,
            type: null,
            card: null,
            index: -1,
            sourceElement: null,
            cloneElement: null,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0
        };
    }

    function getDropTarget(element) {
        let el = element;
        while (el && el !== document.body) {
            // 棋盘落点
            if (el.classList.contains('card-slot')) {
                const boardContainer = el.closest('.board');
                const boardId = boardContainer?.id;
                const slotIndex = el.getAttribute('data-slot-index');
                if (boardId === 'my-board' && slotIndex !== null) {
                    return { zone: 'board', index: parseInt(slotIndex) };
                }
            }
            // 手牌落点
            if (el.id === 'hand-container' || el.closest('#hand-container')) {
                return { zone: 'hand' };
            }
            // 商店（出售）落点
            if (el.id === 'shop-container' || el.closest('#shop-container')) {
                return { zone: 'shop' };
            }
            el = el.parentElement;
        }
        return null;
    }

    // 【核心补全】拖拽落地执行逻辑
    async function executeDropAction(sourceType, sourceIndex, card, dropTarget) {
        const { zone, index: targetIndex } = dropTarget;
        log(`拖拽操作: ${sourceType}#${sourceIndex} -> ${zone}${targetIndex !== undefined ? '#'+targetIndex : ''}`);

        try {
            // 1. 商店卡牌 -> 棋盘（购买并放置）
            if (sourceType === 'shop' && zone === 'board') {
                await handleBuyAndPlace(sourceIndex, targetIndex);
                return;
            }

            // 2. 商店卡牌 -> 手牌（购买到手牌）
            if (sourceType === 'shop' && zone === 'hand') {
                await handleBuyCard(sourceIndex);
                return;
            }

            // 3. 手牌 -> 棋盘（放置到战场）
            if (sourceType === 'hand' && zone === 'board') {
                await handleHandToBoard(sourceIndex, targetIndex);
                return;
            }

            // 4. 棋盘 -> 棋盘（交换位置）
            if (sourceType === 'board' && zone === 'board') {
                await handleBoardSwap(sourceIndex, targetIndex);
                return;
            }

            // 5. 棋盘/手牌 -> 商店（出售卡牌）
            if ((sourceType === 'hand' || sourceType === 'board') && zone === 'shop') {
                await handleSell(sourceType, sourceIndex);
                return;
            }

            // 6. 棋盘 -> 手牌（收回手牌）
            if (sourceType === 'board' && zone === 'hand') {
                await handleBoardToHand(sourceIndex);
                return;
            }
        } catch (err) {
            log(`操作执行失败: ${err.message}`, true);
            toast('操作失败', true);
        }
    }

    // ==================== 后端接口调用（完整修复） ====================
    async function callEdgeFunction(funcName, body = {}) {
        // 1. 校验Supabase客户端
        const supabase = window.supabase;
        if (!supabase) {
            const errMsg = 'Supabase客户端未初始化';
            toast(errMsg, true);
            log(errMsg, true);
            return { error: errMsg };
        }

        // 2. 校验房间ID
        if (!currentRoomId) {
            const errMsg = '未进入对局，房间ID为空';
            toast(errMsg, true);
            log(errMsg, true);
            return { error: errMsg };
        }

        // 3. 统一传参
        const requestBody = {
            roomId: currentRoomId,
            userId: getCurrentUserId(),
            ...body
        };

        log(`调用接口 ${funcName}，参数:`, JSON.stringify(requestBody));

        try {
            const { data, error } = await supabase.functions.invoke(funcName, {
                body: requestBody
            });

            // 4. 错误处理
            if (error) {
                const errMsg = error.message || `调用${funcName}失败`;
                log(`接口报错: ${errMsg}`, true);
                toast(errMsg, true);
                return { error: errMsg };
            }

            if (!data?.success) {
                const errMsg = data?.error || '操作执行失败';
                log(`后端返回错误: ${errMsg}`, true);
                toast(errMsg, true);
                return { error: errMsg };
            }

            // 5. 成功返回
            log(`接口 ${funcName} 调用成功`, JSON.stringify(data));
            return { success: true, data };

        } catch (err) {
            const errMsg = `网络异常: ${err.message}`;
            log(errMsg, true);
            toast('网络异常，请重试', true);
            return { error: errMsg };
        }
    }

    // ==================== 业务操作函数 ====================
    // 刷新商店
    async function handleRefreshShop() {
        if (currentPhase === 'buffering') {
            toast('缓冲期无法操作', true);
            return;
        }

        const result = await callEdgeFunction('refresh-shop', {});
        if (result.success) {
            refreshAllUI();
            log(`🔄 商店已刷新，剩余金币 ${result.data.gold}`);
            toast('商店刷新成功');
        }
    }

    // 购买卡牌到手牌
    async function handleBuyCard(shopIndex) {
        const result = await callEdgeFunction('buy-card', { shopIndex });
        if (result.success) {
            refreshAllUI();
            log(`✅ 购买卡牌成功，剩余金币 ${result.data.gold}`);
            toast('购买成功');
        }
    }

    // 购买并直接放置到棋盘
    async function handleBuyAndPlace(shopIndex, boardIndex) {
        const result = await callEdgeFunction('buy-and-place', { 
            shopIndex, 
            targetBoardIndex: boardIndex 
        });
        if (result.success) {
            refreshAllUI();
            log(`✅ 购买并放置成功，剩余金币 ${result.data.gold}`);
            toast('放置成功');
        }
    }

    // 出售卡牌
    async function handleSell(type, index) {
        const result = await callEdgeFunction('sell-card', { type, index });
        if (result.success) {
            refreshAllUI();
            log(`💰 出售成功，获得金币`);
            toast('出售成功');
        }
    }

    // 移动卡牌
    async function handleMoveCard(moveType, from, to) {
        const result = await callEdgeFunction('move-card', { moveType, from, to });
        if (result.success) {
            refreshAllUI();
            log(`✅ 卡牌移动成功`);
        }
    }

    // 购买经验升级商店
    async function handleBuyExp() {
        if (currentPhase === 'buffering') {
            toast('缓冲期无法操作', true);
            return;
        }

        const result = await callEdgeFunction('buy-exp', {});
        if (result.success) {
            refreshAllUI();
            log(`📈 购买经验成功，商店等级 ${result.data.shopLevel}`);
            toast('升级成功');
        }
    }

    // 手牌 -> 棋盘
    async function handleHandToBoard(handIdx, boardIdx) {
        await handleMoveCard('handToBoard', { index: handIdx }, { index: boardIdx });
    }

    // 棋盘位置交换
    async function handleBoardSwap(idxA, idxB) {
        if (idxA === idxB) return;
        await handleMoveCard('swapBoard', { index: idxA }, { index: idxB });
    }

    // 棋盘 -> 手牌
    async function handleBoardToHand(boardIdx) {
        await handleMoveCard('boardToHand', { index: boardIdx }, {});
    }

    // 按钮绑定动作
    async function refreshShopAction() {
        await handleRefreshShop();
    }

    async function buyExpAction() {
        await handleBuyExp();
    }

    // ==================== 通用工具函数 ====================
    function updateTimerDisplay(seconds, phase) {
        const timerEl = document.getElementById('phase-timer');
        if (timerEl) {
            if (phase === 'buffering') {
                timerEl.textContent = `⏳ ${seconds}`;
                return;
            }
            const m = Math.floor(seconds/60).toString().padStart(2,'0');
            const s = (seconds%60).toString().padStart(2,'0');
            timerEl.textContent = `${m}:${s}`;
        }

        const battleTimerEl = document.getElementById('phase-timer-battle');
        if (battleTimerEl) {
            battleTimerEl.textContent = phase === 'battle' ? seconds : '00:00';
        }
    }

    function setPhase(phase) {
        currentPhase = phase;
        if (phase === 'buffering') {
            document.body.classList.add('buffering-mode');
        } else {
            document.body.classList.remove('buffering-mode');
        }
        log(`阶段已切换为: ${phase}`);
    }

    // ==================== UI事件绑定 ====================
    function bindUIEvents() {
        // 刷新商店按钮
        const refreshBtns = [
            document.getElementById('refresh-shop-btn'),
            document.getElementById('refresh-shop-btn-bottom')
        ];
        refreshBtns.forEach(btn => {
            if (btn) {
                btn.replaceWith(btn.cloneNode(true)); // 清除旧事件
                const newBtn = document.getElementById(btn.id);
                newBtn.addEventListener('click', refreshShopAction);
            }
        });

        // 购买经验按钮
        const expBtns = [
            document.getElementById('buy-exp-btn'),
            document.getElementById('buy-exp-btn-bottom')
        ];
        expBtns.forEach(btn => {
            if (btn) {
                btn.replaceWith(btn.cloneNode(true)); // 清除旧事件
                const newBtn = document.getElementById(btn.id);
                newBtn.addEventListener('click', buyExpAction);
            }
        });

        log('UI事件绑定完成');
    }

    // ==================== 样式注入 ====================
    function injectStyles() {
        const styleId = 'yycard-shop-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .card {
                touch-action: none;
                user-select: none;
                -webkit-user-select: none;
                -webkit-touch-callout: none;
                transition: all 0.2s ease;
            }
            .card-drag-clone {
                pointer-events: none !important;
                will-change: left, top;
            }
            .shop-area.drop-target {
                box-shadow: 0 0 0 4px #ff4444 !important;
                transition: box-shadow 0.1s;
            }
            .buffering-mode .card,
            .buffering-mode .btn,
            .buffering-mode .shop-area,
            .buffering-mode .hand-area {
                pointer-events: none !important;
                opacity: 0.6;
            }
            .empty-slot {
                display: flex;
                align-items: center;
                justify-content: center;
                color: #444;
                font-size: 12px;
                opacity: 0.5;
            }
        `;
        document.head.appendChild(style);
        log('样式注入完成');
    }

    // ==================== 初始化入口 ====================
    function init() {
        injectStyles();
        initDebugPanel();
        bindUIEvents();
        refreshAllUI();
        log('✅ 商店交互模块已启动（完整修复版）');
    }

    // 对外暴露接口
    return {
        init,
        refreshAllUI,
        updateTimerDisplay,
        setPhase,
        setRoomId,
        log,
        toast
    };
})();

console.log('✅ shop.js 加载完成（完整修复版）');

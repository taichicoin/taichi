// ==================== 商店与交互系统（后端刷新商店 + 后端购买/交换 + 后端出售 + 调试弹窗） ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let currentPhase = 'prepare';
    let toastTimer = null;

    // 拖拽状态
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

    // 后端函数 URL
    const REFRESH_SHOP_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/refresh-shop';
    const BUY_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/buy-card';
    const SWAP_BOARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/swap-board';
    const SELL_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/sell-card';  // 新增出售函数

    // 调试面板
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
        console.log(msg);
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

    // ===== 辅助 =====
    function getCurrentUserId() {
        return window.YYCardAuth?.currentUser?.id || null;
    }

    function getGameState() {
        return window.YYCardBattle?.getGameState();
    }

    function getCurrentRoomId() {
        if (window.YYCardBattle?.getCurrentRoomId) {
            return window.YYCardBattle.getCurrentRoomId();
        }
        return window._currentRoomId || null;
    }

    function getSupabaseClient() {
        return window.supabase;
    }

    // 通用：强制刷新UI（从数据库拉取最新状态）
    async function syncFromBackend() {
        if (window.YYCardBattle?.forceRefreshState) {
            await window.YYCardBattle.forceRefreshState();
        } else {
            await window.YYCardBattle?.updateGameState();
        }
        refreshAllUI();
    }

    // 渲染函数（保持不变）
    function renderMyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        renderBoard('my-board', my.board, true);
    }

    function renderEnemyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        let oppId = null;

        if (gameState.phase === 'battle' && gameState.battlePairs) {
            for (const [p1, p2] of gameState.battlePairs) {
                if (p1 === userId && p2) { oppId = p2; break; }
                if (p2 === userId && p1) { oppId = p1; break; }
            }
        }
        
        if (!oppId) {
            const aliveHumans = Object.entries(gameState.players).filter(([id, p]) => 
                id !== userId && !p.isBot && p.health > 0 && !p.isEliminated
            );
            if (aliveHumans.length > 0) oppId = aliveHumans[0][0];
        }
        
        if (!oppId) {
            const aliveAny = Object.entries(gameState.players).find(([id, p]) => 
                id !== userId && p.health > 0 && !p.isEliminated
            );
            if (aliveAny) oppId = aliveAny[0];
        }
        
        if (!oppId) oppId = Object.keys(gameState.players).find(id => id !== userId);

        if (oppId && gameState.players[oppId]) {
            const originalBoard = gameState.players[oppId].board;
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
        const my = gameState.players[userId];
        if (!my) return;
        const container = document.getElementById('hand-container');
        if (!container) return;
        container.innerHTML = '';
        my.hand.forEach((card, i) => {
            if (card) {
                const el = createCardElement(card);
                el.setAttribute('data-hand-index', i);
                el.setAttribute('data-card-type', 'hand');
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'hand', card, i, el));
                container.appendChild(el);
            }
        });
        const countEl = document.getElementById('hand-count');
        if (countEl) countEl.textContent = my.hand.filter(c => c).length;
    }

    function renderShop() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const container = document.getElementById('shop-container');
        if (!container) return;
        container.innerHTML = '';
        const shopCards = my.shopCards || [];
        if (shopCards.length === 0) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;">商店刷新中...</div>';
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
        renderMyBoard();
        renderEnemyBoard();
        renderHand();
        renderShop();
        const gameState = getGameState();
        if (gameState) {
            const userId = getCurrentUserId();
            const my = gameState.players[userId];
            if (my) {
                document.getElementById('my-health').textContent = my.health;
                document.getElementById('my-gold').textContent = my.gold;
                document.getElementById('shop-level').textContent = my.shopLevel;
                const healthTop = document.getElementById('my-health-top');
                if (healthTop) healthTop.textContent = my.health;
            }
            document.getElementById('round-num').textContent = gameState.round;
            const roundTop = document.getElementById('round-num-top');
            if (roundTop) roundTop.textContent = gameState.round;
            updateBuyExpButtonState();
        }
    }

    function updateBuyExpButtonState() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
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
        d.setAttribute('data-rarity', card.rarity);
        const imgPath = card.image || card.icon || `/assets/card/${card.cardId || card.id || 'default'}.png`;
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
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
        d.querySelector('img').draggable = false;
        return d;
    }

    // ==================== 手动拖拽核心 ====================
    function onDragStart(e, type, card, index, element) {
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare' || currentPhase === 'buffering') {
            toast('现在不能操作', true);
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        
        element.setPointerCapture(e.pointerId);

        const clientX = e.clientX;
        const clientY = e.clientY;

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

        dragState = {
            active: true,
            type,
            card,
            index,
            sourceElement: element,
            cloneElement: clone,
            startX: clientX,
            startY: clientY,
            currentX: clientX,
            currentY: clientY
        };

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

        const clone = dragState.cloneElement;
        clone.style.left = (clientX - clone.offsetWidth / 2) + 'px';
        clone.style.top = (clientY - clone.offsetHeight / 2) + 'px';

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

        cloneElement.remove();
        sourceElement.style.opacity = '';
        
        const shopArea = document.querySelector('.shop-area');
        if (shopArea) shopArea.classList.remove('drop-target');

        sourceElement.releasePointerCapture?.(e.pointerId);

        document.removeEventListener('pointermove', onDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);

        const targetElement = document.elementFromPoint(currentX, currentY);
        if (!targetElement) {
            dragState.active = false;
            return;
        }

        const dropResult = getDropTarget(targetElement);
        if (dropResult) {
            executeDropAction(type, index, card, dropResult);
        }

        dragState.active = false;
    }

    function getDropTarget(element) {
        let el = element;
        while (el && el !== document.body) {
            if (el.classList.contains('card-slot')) {
                const boardContainer = el.closest('.board');
                const boardId = boardContainer?.id;
                const slotIndex = el.getAttribute('data-slot-index');
                if (boardId === 'my-board' && slotIndex !== null) {
                    return { zone: 'board', index: parseInt(slotIndex) };
                }
            }
            if (el.id === 'hand-container' || el.closest('#hand-container')) {
                return { zone: 'hand' };
            }
            if (el.id === 'shop-container' || el.closest('#shop-container')) {
                return { zone: 'shop' };
            }
            el = el.parentElement;
        }
        return null;
    }

    async function executeDropAction(type, index, card, dropResult) {
        if (type === 'hand') {
            if (dropResult.zone === 'board') {
                await handleHandToBoard(index, dropResult.index);
            } else if (dropResult.zone === 'shop') {
                await handleSell('hand', index);
            }
        } else if (type === 'board') {
            if (dropResult.zone === 'board') {
                await handleBoardSwap(index, dropResult.index);
            } else if (dropResult.zone === 'hand') {
                await handleBoardToHand(index);
            } else if (dropResult.zone === 'shop') {
                await handleSell('board', index);
            }
        } else if (type === 'shop') {
            if (dropResult.zone === 'board') {
                await handleShopToBoard(card, index, dropResult.index);
            } else if (dropResult.zone === 'hand') {
                await handleShopToHand(card, index);
            }
        }
    }

    // ===== 业务操作（全部改为调用后端 Edge Function） =====

    // 放置手牌到棋盘（仍可保留原直连方式，但为了统一，也可以调用后端，但放置操作不涉及金币，简单交换可保留前端）
    async function handleHandToBoard(handIdx, boardIdx) {
        const success = await window.YYCardBattle.placeCardAction(handIdx, boardIdx);
        if (success) refreshAllUI();
        else toast('放置失败', true);
    }

    // 购买并放置到棋盘（支持交换：如果目标格子有卡，则旧卡回手牌）
    async function handleShopToBoard(card, shopIdx, boardIdx) {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        try {
            const supabaseClient = getSupabaseClient();
            const { data: { session } } = await supabaseClient.auth.getSession();
            const accessToken = session?.access_token;
            if (!accessToken) { toast('未登录', true); return; }

            const response = await fetch(BUY_CARD_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    roomId,
                    userId,
                    shopIndex: shopIdx,
                    targetBoardIndex: boardIdx
                })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                toast(data.error || '购买失败', true);
                return;
            }
            await syncFromBackend();
            toast(data.exchanged ? '购买并交换成功' : '购买成功');
        } catch (err) {
            console.error(err);
            toast('网络错误', true);
        }
    }

    // 普通购买到手牌（不指定目标格子）
    async function handleShopToHand(card, shopIdx) {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        try {
            const supabaseClient = getSupabaseClient();
            const { data: { session } } = await supabaseClient.auth.getSession();
            const accessToken = session?.access_token;
            if (!accessToken) { toast('未登录', true); return; }

            const response = await fetch(BUY_CARD_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    roomId,
                    userId,
                    shopIndex: shopIdx
                })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                toast(data.error || '购买失败', true);
                return;
            }
            await syncFromBackend();
            toast('购买成功');
        } catch (err) {
            console.error(err);
            toast('网络错误', true);
        }
    }

    // 交换棋盘两个位置
    async function handleBoardSwap(idxA, idxB) {
        if (idxA === idxB) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        try {
            const supabaseClient = getSupabaseClient();
            const { data: { session } } = await supabaseClient.auth.getSession();
            const accessToken = session?.access_token;
            if (!accessToken) { toast('未登录', true); return; }

            const response = await fetch(SWAP_BOARD_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    roomId,
                    userId,
                    indexA: idxA,
                    indexB: idxB
                })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                toast(data.error || '交换失败', true);
                return;
            }
            await syncFromBackend();
        } catch (err) {
            console.error(err);
            toast('网络错误', true);
        }
    }

    // 棋盘卡牌移回手牌（仍可使用原有 battle.js 方法，因为不涉及金币且简单）
    async function handleBoardToHand(boardIdx) {
        const success = await window.YYCardBattle.boardToHandAction(boardIdx);
        if (success) refreshAllUI();
        else toast('手牌已满', true);
    }

    // ===== 出售（改为调用后端 sell-card 函数） =====
    async function handleSell(type, index) {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        try {
            const supabaseClient = getSupabaseClient();
            const { data: { session } } = await supabaseClient.auth.getSession();
            const accessToken = session?.access_token;
            if (!accessToken) { toast('未登录', true); return; }

            const response = await fetch(SELL_CARD_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ roomId, userId, type, index })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                toast(data.error || '出售失败', true);
                return;
            }
            await syncFromBackend();
            toast('出售成功');
            log(`💰 出售成功，剩余金币 ${data.gold}`);
        } catch (err) {
            console.error(err);
            toast('网络错误', true);
        }
    }

    // ===== 按钮操作 =====
    async function refreshShopAction() {
        if (currentPhase === 'buffering') {
            toast('缓冲期无法操作', true);
            return;
        }
        const gameState = getGameState();
        if (!gameState || gameState.phase !== 'prepare') {
            toast('只能在准备阶段刷新', true);
            return;
        }
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        
        if (!roomId) { toast('房间信息缺失', true); return; }
        if (!userId) { toast('用户信息缺失', true); return; }

        try {
            const supabaseClient = getSupabaseClient();
            const { data: { session } } = await supabaseClient.auth.getSession();
            const accessToken = session?.access_token;
            if (!accessToken) { toast('未登录', true); return; }

            const response = await fetch(REFRESH_SHOP_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ roomId, userId })
            });

            const data = await response.json();

            // 🔍 手机调试弹窗
            alert('后端返回：\n' + JSON.stringify(data, null, 2));

            if (!response.ok || !data.success) {
                toast(data.error || '刷新失败', true);
                return;
            }

            await syncFromBackend();
            toast('刷新成功');
            log(`🔄 商店已刷新，剩余金币 ${data.gold}`);
        } catch (err) {
            console.error(err);
            toast('网络错误，刷新失败', true);
        }
    }

    async function buyExpAction() {
        if (currentPhase === 'buffering') {
            toast('缓冲期无法操作', true);
            return;
        }
        const success = await window.YYCardBattle.buyExpAction();
        if (success) refreshAllUI();
    }

    function updateTimerDisplay(seconds, phase) {
        const timerEl = document.getElementById('phase-timer');
        if (timerEl) {
            if (phase === 'buffering') { timerEl.textContent = `⏳ ${seconds}`; return; }
            const m = Math.floor(seconds/60).toString().padStart(2,'0');
            const s = (seconds%60).toString().padStart(2,'0');
            timerEl.textContent = `${m}:${s}`;
        }
        const battleTimerEl = document.getElementById('phase-timer-battle');
        if (battleTimerEl) battleTimerEl.textContent = (phase === 'battle') ? seconds : '00:00';
    }

    function setPhase(phase) {
        currentPhase = phase;
        if (phase === 'buffering') document.body.classList.add('buffering-mode');
        else document.body.classList.remove('buffering-mode');
    }

    function bindUIEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }

    function injectStyles() {
        const styleId = 'yycard-manual-drag';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .card { touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
            .card-drag-clone { pointer-events: none !important; will-change: left, top; }
            .shop-area.drop-target { box-shadow: 0 0 0 4px #ff4444 !important; transition: box-shadow 0.1s; }
            .buffering-mode .card, .buffering-mode .btn, .buffering-mode .shop-area, .buffering-mode .hand-area { pointer-events: none !important; opacity: 0.6; }
        `;
        document.head.appendChild(style);
    }

    function init() {
        injectStyles();
        initDebugPanel();
        bindUIEvents();
        refreshAllUI();
        log('✅ 商店交互模块已启动（后端刷新 + 购买/交换 + 出售 + 弹窗调试）');
    }

    return {
        init,
        refreshAllUI,
        updateTimerDisplay,
        setPhase,
        log,
        toast
    };
})();

console.log('✅ shop.js 加载完成（后端刷新商店 + 后端购买/交换 + 后端出售 + 弹窗调试）');

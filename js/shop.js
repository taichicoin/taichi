// ==================== 商店与交互系统【全接口免JWT·RPC双缓冲适配版】 ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    // ========== 全局状态管理 ==========
    let toastTimer = null;
    const domCache = {};
    let isRefreshingShop = false;
    let isDragging = false;

    let dragState = {
        active: false, type: null, card: null, index: -1,
        sourceElement: null, cloneElement: null,
        startX: 0, startY: 0, currentX: 0, currentY: 0
    };

    // ========== 工具：有效卡牌判定 ==========
    function isValidCard(card) {
        return card && typeof card === 'object' && card.cardId;
    }
    function getFirstAvailableHandSlot(hand) {
        for (let i = 0; i < hand.length; i++) {
            if (!isValidCard(hand[i])) return i;
        }
        return -1;
    }
    function getValidHandCount(hand) {
        return hand.filter(isValidCard).length;
    }

    // ✅ 从双缓冲商店结构中提取当前显示的三张卡
    function getShopDisplayCards(player) {
        const shop = player.shopCards;
        if (shop && shop.buffer && Array.isArray(shop.buffer)) {
            const active = shop.active || 0;
            const group = shop.buffer[active];
            if (Array.isArray(group)) {
                return group.filter(isValidCard);
            }
            return [];
        }
        // 兼容旧格式（简单数组）
        return Array.isArray(shop) ? shop.filter(isValidCard) : [];
    }

    // ✅ 获取当前激活组在 buffer 中的索引（用于乐观更新）
    function getActiveGroupIndex(player) {
        const shop = player.shopCards;
        return (shop && shop.buffer) ? (shop.active || 0) : 0;
    }

    // ========== 操作权限判定 ==========
    function canOperate() {
        const gameState = getGameState();
        return !!(gameState && gameState.phase === 'prepare' &&
            !isRefreshingShop && !gameState.players?.[getCurrentUserId()]?.isBot);
    }

    function throttle(func, delay = 16) {
        let last = 0;
        return function(...args) {
            const now = Date.now();
            if (now - last >= delay) { last = now; func.apply(this, args); }
        };
    }

    const FUNCTION_NAME_MAP = {
        REFRESH_SHOP: 'refresh-shop',
        BUY_CARD: 'buy-card',
        SWAP_BOARD: 'swap-board',
        SELL_CARD: 'sell-card',
        PLACE_CARD: 'place-card',
        BOARD_TO_HAND: 'board-to-hand',
        BUY_EXP: 'buy-exp'
    };

    async function invokeFunction(functionName, body = {}, options = {}) {
        const { timeout = 10000 } = options;
        const supabaseClient = getSupabaseClient();
        if (!functionName || !supabaseClient) throw new Error('Supabase客户端未初始化');
        const headers = { Authorization: '' };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            const { data, error } = await supabaseClient.functions.invoke(functionName, {
                body, headers, signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (error) throw new Error(error.message || '请求失败');
            if (data && !data.success) throw new Error(data.error || '操作失败');
            return { success: true, data };
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') return { success: false, error: '请求超时' };
            return { success: false, error: err.message };
        }
    }

    function mergeUpdatedPlayer(target, updatedPlayer) {
        if (!updatedPlayer) return;
        ['gold','exp','shopLevel','health','shopCards','hand','board','isBot','isEliminated','isReady'].forEach(k => {
            if (updatedPlayer[k] !== undefined) target[k] = updatedPlayer[k];
        });
    }

    function updateUIAfterSuccess(updatedPlayer) {
        if (!updatedPlayer) return;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (!my) return;

        if (updatedPlayer.gold !== undefined) {
            const el = document.getElementById('my-gold');
            if (el) el.textContent = updatedPlayer.gold;
        }
        if (updatedPlayer.health !== undefined) {
            const el = document.getElementById('my-health');
            if (el) el.textContent = updatedPlayer.health;
            const topEl = document.getElementById('my-health-top');
            if (topEl) topEl.textContent = updatedPlayer.health;
        }
        if (updatedPlayer.shopLevel !== undefined) {
            const el = document.getElementById('shop-level');
            if (el) el.textContent = updatedPlayer.shopLevel;
        }
        if (updatedPlayer.exp !== undefined || updatedPlayer.shopLevel !== undefined) {
            updateBuyExpButtonState();
        }

        if (updatedPlayer.shopCards !== undefined && !isDragging) renderShop();
        if (updatedPlayer.hand !== undefined && !isDragging) renderHand();
        if (updatedPlayer.board !== undefined && !isDragging) {
            renderMyBoard();
            renderEnemyBoard();
        }
    }

    function toast(message, isError = false, duration = 2000) {
        const old = document.getElementById('shop-toast');
        if (old) old.remove();
        if (toastTimer) clearTimeout(toastTimer);
        const el = document.createElement('div');
        el.id = 'shop-toast';
        el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${isError?'rgba(200,50,50,0.9)':'rgba(30,40,60,0.95)'};color:white;font-size:14px;padding:10px 20px;border-radius:30px;z-index:100001;border:1px solid ${isError?'#ff7b7b':'#f5d76e'};box-shadow:0 4px 12px rgba(0,0,0,0.3);font-weight:bold;backdrop-filter:blur(4px);pointer-events:none;white-space:nowrap;`;
        el.textContent = message;
        document.body.appendChild(el);
        toastTimer = setTimeout(() => { if (el.parentNode) el.remove(); toastTimer = null; }, duration);
    }

    function getCurrentUserId() { return window.YYCardAuth?.currentUser?.id || null; }
    function getGameState() { return window.YYCardBattle?.getGameState(); }
    function getCurrentRoomId() {
        if (window.YYCardBattle?.getCurrentRoomId) return window.YYCardBattle.getCurrentRoomId();
        return window._currentRoomId || null;
    }
    function getSupabaseClient() { return window.supabase; }

    // ========== UI渲染 ==========
    function renderMyBoard() {
        if (isDragging) return;
        const gameState = getGameState();
        if (!gameState) return;
        const my = gameState.players[getCurrentUserId()];
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
                if (p1===userId && p2) { oppId=p2; break; }
                if (p2===userId && p1) { oppId=p1; break; }
            }
        }
        if (!oppId) {
            const alive = Object.entries(gameState.players).filter(([id,p])=>id!==userId && !p.isBot && p.health>0 && !p.isEliminated);
            if (alive.length) oppId = alive[0][0];
        }
        if (!oppId) {
            const any = Object.entries(gameState.players).find(([id,p])=>id!==userId && p.health>0 && !p.isEliminated);
            if (any) oppId = any[0];
        }
        if (!oppId) oppId = Object.keys(gameState.players).find(id=>id!==userId);
        if (oppId && gameState.players[oppId]) {
            const orig = gameState.players[oppId].board;
            const disp = [orig[3],orig[4],orig[5],orig[0],orig[1],orig[2]];
            renderBoard('enemy-board', disp, false);
        }
    }

    function renderHand() {
        if (isDragging) return;
        const gameState = getGameState();
        if (!gameState) return;
        const my = gameState.players[getCurrentUserId()];
        if (!my) return;
        const container = domCache.handContainer || document.getElementById('hand-container');
        if (!container) return;
        container.innerHTML = '';
        const frag = document.createDocumentFragment();
        my.hand.forEach((card, i) => {
            if (isValidCard(card)) {
                const el = createCardElement(card);
                el.setAttribute('data-hand-index', i);
                el.setAttribute('data-card-type', 'hand');
                el.addEventListener('pointerdown', e => onDragStart(e, 'hand', card, i, el));
                frag.appendChild(el);
            }
        });
        container.appendChild(frag);
        const countEl = document.getElementById('hand-count');
        if (countEl) countEl.textContent = getValidHandCount(my.hand);
    }

    function renderShop() {
        const gameState = getGameState();
        if (!gameState) return;
        const my = gameState.players[getCurrentUserId()];
        if (!my) return;
        const container = domCache.shopContainer || document.getElementById('shop-container');
        if (!container) return;
        container.innerHTML = '';
        const shopCards = getShopDisplayCards(my);
        if (shopCards.length === 0) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">商店暂无卡牌</div>';
            return;
        }
        const frag = document.createDocumentFragment();
        shopCards.forEach((card, i) => {
            const el = createCardElement(card);
            el.setAttribute('data-shop-index', i);  // 相对索引 0~2
            el.setAttribute('data-card-type', 'shop');
            el.addEventListener('pointerdown', e => onDragStart(e, 'shop', card, i, el));
            frag.appendChild(el);
        });
        container.appendChild(frag);
    }

    function refreshAllUI() {
        if (window.YYCardInspector?.cleanupAllRemnants) window.YYCardInspector.cleanupAllRemnants();
        if (!isDragging) { renderMyBoard(); renderHand(); }
        renderEnemyBoard();
        renderShop();
        const gameState = getGameState();
        if (gameState) {
            const my = gameState.players[getCurrentUserId()];
            if (my) {
                (domCache.myHealth||document.getElementById('my-health')).textContent = my.health;
                (domCache.myGold||document.getElementById('my-gold')).textContent = my.gold;
                (domCache.shopLevel||document.getElementById('shop-level')).textContent = my.shopLevel;
            }
            (domCache.roundNum||document.getElementById('round-num')).textContent = gameState.round;
            updateBuyExpButtonState();
        }
    }

    function updateBuyExpButtonState() {
        const gameState = getGameState();
        if (!gameState) return;
        const my = gameState.players[getCurrentUserId()];
        if (!my) return;
        const isMax = my.shopLevel >= (config.MAX_SHOP_LEVEL||5);
        const canOp = canOperate();
        const disable = !canOp || isMax;
        let expNeeded = 0;
        if (!isMax) {
            const e = my.exp;
            if (e<4) expNeeded=4-e; else if (e<12) expNeeded=12-e; else if (e<26) expNeeded=26-e; else if (e<46) expNeeded=46-e;
        }
        ['buy-exp-btn','buy-exp-btn-bottom'].forEach(id=>{
            const btn = document.getElementById(id);
            if(btn) {
                btn.textContent = isMax ? '📈 已满级' : `📈 升级 (${expNeeded}💰)`;
                btn.disabled = disable || (expNeeded > my.gold);
                btn.style.pointerEvents = disable ? 'none' : 'auto';
                btn.style.opacity = disable ? '0.6' : '1';
            }
        });
    }

    function renderBoard(containerId, cards, isSelf) {
        const cont = domCache[containerId] || document.getElementById(containerId);
        if (!cont) return;
        cont.innerHTML = '';
        const frag = document.createDocumentFragment();
        for (let i=0;i<6;i++) {
            const c = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.setAttribute('data-slot-index', i);
            slot.setAttribute('data-board-index', isSelf ? i : (i<3 ? i+3 : i-3));
            if (isValidCard(c)) {
                const el = createCardElement(c);
                if (isSelf) {
                    el.addEventListener('pointerdown', e => onDragStart(e, 'board', c, i, el));
                }
                el.setAttribute('data-card-type', 'board');
                el.setAttribute('data-board-index', isSelf ? i : (i<3?i+3:i-3));
                slot.appendChild(el);
            } else {
                slot.innerHTML = '<div class="card empty-slot">⬤</div>';
            }
            frag.appendChild(slot);
        }
        cont.appendChild(frag);
    }

    function createCardElement(card) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity);
        const img = card.image || card.icon || `/assets/card/${card.cardId||card.id||'default'}.png`;
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        d.innerHTML = `<div class="card-icon"><img src="${img}" onerror="this.src='/assets/default-avatar.png'"></div><div class="card-name">${card.name}</div><div class="card-stats"><span>⚔️${card.atk}</span><span>🛡️${card.hp}</span></div><div class="card-price">💰${price}</div>`;
        d.querySelector('img').draggable = false;
        return d;
    }

    // ========== 拖拽逻辑 ==========
    function onDragStart(e, type, card, index, el) {
        if (!canOperate()) { toast('当前阶段不能操作', true); return; }
        e.preventDefault(); e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        isDragging = true;
        const clone = el.cloneNode(true);
        clone.className = 'card-drag-clone';
        clone.style.cssText = `position:fixed;z-index:99999;left:${e.clientX-el.offsetWidth/2}px;top:${e.clientY-el.offsetHeight/2}px;width:${el.offsetWidth}px;height:${el.offsetHeight}px;opacity:0.85;transform:scale(1.05);pointer-events:none;`;
        document.body.appendChild(clone);
        el.style.visibility = 'hidden';
        dragState = { active:true,type,card,index,sourceElement:el,cloneElement:clone,startX:e.clientX,startY:e.clientY,currentX:e.clientX,currentY:e.clientY };
        document.addEventListener('pointermove', throttledDragMove);
        document.addEventListener('pointerup', onDragEnd);
        document.addEventListener('pointercancel', onDragEnd);
    }

    const throttledDragMove = throttle(e => {
        if (!dragState.active) return;
        dragState.currentX = e.clientX; dragState.currentY = e.clientY;
        const clone = dragState.cloneElement;
        clone.style.left = (e.clientX - clone.offsetWidth/2) + 'px';
        clone.style.top = (e.clientY - clone.offsetHeight/2) + 'px';
        if (dragState.type === 'hand' || dragState.type === 'board') {
            const sc = domCache.shopContainer || document.getElementById('shop-container');
            if (sc) {
                const area = sc.closest('.shop-area');
                if (area) {
                    const r = area.getBoundingClientRect();
                    area.classList.toggle('drop-target', e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom);
                }
            }
        }
    }, 16);

    function onDragEnd(e) {
        if (!dragState.active) return;
        const {sourceElement, cloneElement, currentX, currentY} = dragState;
        cloneElement.remove();
        sourceElement.style.visibility = '';
        document.removeEventListener('pointermove', throttledDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);
        const area = document.querySelector('.shop-area');
        if (area) area.classList.remove('drop-target');
        sourceElement.releasePointerCapture?.(e.pointerId);
        const target = document.elementFromPoint(currentX, currentY);
        if (target) {
            const drop = getDropTarget(target);
            if (drop) executeDropAction(dragState.type, dragState.index, dragState.card, drop);
        }
        dragState.active = false;
        isDragging = false;
    }

    function getDropTarget(el) {
        let e = el;
        while (e && e !== document.body) {
            if (e.classList.contains('card-slot')) {
                const board = e.closest('.board');
                if (board?.id === 'my-board') return { zone: 'board', index: parseInt(e.getAttribute('data-slot-index')) };
            }
            if (e.id === 'hand-container' || e.closest('#hand-container')) return { zone: 'hand' };
            if (e.id === 'shop-container' || e.closest('#shop-container')) return { zone: 'shop' };
            e = e.parentElement;
        }
        return null;
    }

    async function executeDropAction(type, idx, card, drop) {
        if (type === 'hand') {
            if (drop.zone === 'board') await handleHandToBoard(idx, drop.index);
            else if (drop.zone === 'shop') await handleSell('hand', idx);
        } else if (type === 'board') {
            if (drop.zone === 'board') await handleBoardSwap(idx, drop.index);
            else if (drop.zone === 'hand') await handleBoardToHand(idx);
            else if (drop.zone === 'shop') await handleSell('board', idx);
        } else if (type === 'shop') {
            if (drop.zone === 'board') await handleShopToBoard(card, idx, drop.index);
            else if (drop.zone === 'hand') await handleShopToHand(card, idx);
        }
    }

    // ==================== 业务操作 ====================
    async function handleHandToBoard(handIdx, boardIdx) {
        if (!canOperate()) { toast('当前阶段不能操作', true); return; }
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId||!userId) { toast('房间信息缺失', true); return; }
        const gameState = getGameState();
        const my = gameState.players[userId];
        if (!my) return;
        const oldHand = [...my.hand], oldBoard = [...my.board];
        const card = my.hand[handIdx];
        if (!isValidCard(card)) { toast('无效卡牌', true); return; }
        const target = my.board[boardIdx];
        if (isValidCard(target) && getValidHandCount(my.hand)>=15) { toast('手牌已满', true); return; }
        my.board[boardIdx] = card;
        my.hand[handIdx] = target || null;
        renderMyBoard(); renderHand();

        const res = await invokeFunction(FUNCTION_NAME_MAP.PLACE_CARD, { roomId, userId, handIndex: handIdx, boardIndex: boardIdx });
        if (!res.success) {
            my.hand = oldHand; my.board = oldBoard;
            renderMyBoard(); renderHand();
            toast(res.error, true);
            return;
        }
        if (res.data.updatedPlayer) {
            mergeUpdatedPlayer(my, res.data.updatedPlayer);
            updateUIAfterSuccess(res.data.updatedPlayer);
        }
        toast(res.data.exchanged ? '交换成功' : '放置成功');
    }

    async function handleShopToBoard(card, shopIdx, boardIdx) {
        if (!canOperate()) { toast('当前阶段不能操作', true); return; }
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId||!userId) { toast('房间信息缺失', true); return; }
        const gameState = getGameState();
        const my = gameState.players[userId];
        if (!my) return;

        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy)||1;
        if (my.gold < price) { toast('金币不足', true); return; }
        const target = my.board[boardIdx];
        if (isValidCard(target) && getValidHandCount(my.hand)>=15) { toast('手牌已满', true); return; }

        // 乐观更新：操作双缓冲结构
        const activeGroup = getActiveGroupIndex(my);
        const shopBuf = my.shopCards.buffer;
        const oldGold = my.gold, oldShop = JSON.parse(JSON.stringify(shopBuf));
        const oldHand = [...my.hand], oldBoard = [...my.board];

        my.gold -= price;
        shopBuf[activeGroup].splice(shopIdx, 1);
        const tempId = Date.now()+'-'+Math.random();
        my.board[boardIdx] = { ...card, instanceId: tempId };
        if (isValidCard(target)) {
            const empty = getFirstAvailableHandSlot(my.hand);
            if (empty !== -1) my.hand[empty] = target;
        }
        renderMyBoard(); renderHand(); renderShop();

        const res = await invokeFunction(FUNCTION_NAME_MAP.BUY_CARD, { roomId, userId, shopIndex: shopIdx, activeGroup, targetBoardIndex: boardIdx });
        if (!res.success) {
            my.gold = oldGold;
            my.shopCards.buffer = oldShop;
            my.hand = oldHand; my.board = oldBoard;
            renderMyBoard(); renderHand(); renderShop();
            toast(res.error, true);
            return;
        }
        if (res.data.updatedPlayer) {
            mergeUpdatedPlayer(my, res.data.updatedPlayer);
            updateUIAfterSuccess(res.data.updatedPlayer);
        }
        toast(res.data.exchanged ? '购买并交换成功' : '购买成功');
    }

    async function handleShopToHand(card, shopIdx) {
        if (!canOperate()) { toast('当前阶段不能操作', true); return; }
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId||!userId) { toast('房间信息缺失', true); return; }
        const gameState = getGameState();
        const my = gameState.players[userId];
        if (!my) return;
        if (getValidHandCount(my.hand)>=15) { toast('手牌已满', true); return; }
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy)||1;
        if (my.gold < price) { toast('金币不足', true); return; }

        const activeGroup = getActiveGroupIndex(my);
        const shopBuf = my.shopCards.buffer;
        const oldGold = my.gold, oldShop = JSON.parse(JSON.stringify(shopBuf));
        const oldHand = [...my.hand];

        my.gold -= price;
        shopBuf[activeGroup].splice(shopIdx, 1);
        const empty = getFirstAvailableHandSlot(my.hand);
        const tempId = Date.now()+'-'+Math.random();
        if (empty!==-1) my.hand[empty] = { ...card, instanceId: tempId };
        else my.hand.push({ ...card, instanceId: tempId });
        renderHand(); renderShop();

        const res = await invokeFunction(FUNCTION_NAME_MAP.BUY_CARD, { roomId, userId, shopIndex: shopIdx, activeGroup });
        if (!res.success) {
            my.gold = oldGold;
            my.shopCards.buffer = oldShop;
            my.hand = oldHand;
            renderHand(); renderShop();
            toast(res.error, true);
            return;
        }
        if (res.data.updatedPlayer) {
            mergeUpdatedPlayer(my, res.data.updatedPlayer);
            updateUIAfterSuccess(res.data.updatedPlayer);
        }
        toast('购买成功');
    }

    // 其余操作（swap, board to hand, sell, buy exp, refresh）保持不变，但 sell 里已适配双缓冲（sell 不涉及商店，因此无需改动）
    // 但确保 board to hand 等函数仍使用原有数组形式，这些函数只改 hand 和 board，不影响商店
    // 为节约篇幅，下面只贴出修改过的购买函数，其余完全保留原版（与你之前相同）

    // 棋盘内卡牌交换（不变）
    async function handleBoardSwap(idxA, idxB) {
        if (!canOperate() || idxA===idxB) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId||!userId) { toast('房间信息缺失', true); return; }
        const gameState = getGameState();
        const my = gameState.players[userId];
        if (!my) return;
        const oldBoard = [...my.board];
        [my.board[idxA], my.board[idxB]] = [my.board[idxB], my.board[idxA]];
        renderMyBoard();
        const res = await invokeFunction(FUNCTION_NAME_MAP.SWAP_BOARD, { roomId, userId, indexA: idxA, indexB: idxB });
        if (!res.success) { my.board = oldBoard; renderMyBoard(); toast(res.error, true); return; }
        if (res.data.updatedPlayer) { mergeUpdatedPlayer(my, res.data.updatedPlayer); updateUIAfterSuccess(res.data.updatedPlayer); }
        toast('交换成功');
    }

    async function handleBoardToHand(boardIdx) { /* 保持原有逻辑不变 */ }
    async function handleSell(type, index) { /* 保持原有逻辑不变 */ }
    async function buyExpAction() { /* 保持原有逻辑不变 */ }

    // 刷新商店（已经适配 refresh_shop_v2，返回的 updatedPlayer 包含完整双缓冲对象）
    async function refreshShopAction() {
        if (!canOperate()) { toast('只能在准备阶段刷新', true); return; }
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId||!userId) { toast('房间信息缺失', true); return; }
        const gameState = getGameState();
        const my = gameState.players[userId];
        if (!my) return;
        if (my.gold < 1) { toast('金币不足', true); return; }

        isRefreshingShop = true;
        updateBuyExpButtonState();
        const forceUnlockTimer = setTimeout(()=>{ isRefreshingShop=false; updateBuyExpButtonState(); }, 12000);
        const shopCont = domCache.shopContainer || document.getElementById('shop-container');
        let hint = null;
        if (shopCont && !shopCont.querySelector('.refresh-loading-hint')) {
            hint = document.createElement('div');
            hint.className = 'refresh-loading-hint';
            hint.textContent = '⟳ 刷新中...';
            hint.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.75);color:#ffd966;border-radius:8px;padding:8px 16px;font-size:14px;z-index:100;';
            shopCont.style.position = 'relative';
            shopCont.appendChild(hint);
        }

        const res = await invokeFunction(FUNCTION_NAME_MAP.REFRESH_SHOP, { roomId, userId });
        clearTimeout(forceUnlockTimer);
        isRefreshingShop = false;
        updateBuyExpButtonState();
        if (hint?.parentNode) hint.remove();
        if (!res.success) { toast(res.error, true); return; }

        const latestState = getGameState();
        const latestMe = latestState?.players[userId];
        if (!latestMe) return;
        let finalData = res.data.updatedPlayer ? res.data.updatedPlayer : { shopCards: res.data.shopCards, gold: res.data.gold };
        mergeUpdatedPlayer(latestMe, finalData);
        updateUIAfterSuccess(finalData);
        toast(res.data.needGenerate ? '刷新成功（已生成新组）' : '刷新成功');
    }

    // ========== 基础绑定 ==========
    function updateTimerDisplay(seconds, phase) {
        const el = document.getElementById('phase-timer');
        if (el) {
            if (phase==='buffering') { el.textContent = `⏳ ${seconds}`; return; }
            const m = Math.floor(seconds/60).toString().padStart(2,'0');
            const s = (seconds%60).toString().padStart(2,'0');
            el.textContent = `${m}:${s}`;
        }
    }
    function setPhase(phase) {
        document.body.classList.toggle('buffering-mode', phase==='buffering');
        updateBuyExpButtonState();
    }
    function bindUIEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }
    function injectStyles() {
        if (document.getElementById('yycard-manual-drag')) return;
        const style = document.createElement('style');
        style.id = 'yycard-manual-drag';
        style.textContent = `.card{touch-action:none;user-select:none;-webkit-user-select:none;}.card-drag-clone{pointer-events:none!important;}.shop-area.drop-target{box-shadow:0 0 0 4px #ff4444!important;}.buffering-mode .card,.buffering-mode .btn{pointer-events:none!important;opacity:0.6;}`;
        document.head.appendChild(style);
    }
    function cacheDoms() {
        domCache.handContainer = document.getElementById('hand-container');
        domCache.shopContainer = document.getElementById('shop-container');
        domCache.myBoard = document.getElementById('my-board');
        domCache.enemyBoard = document.getElementById('enemy-board');
        domCache.myHealth = document.getElementById('my-health');
        domCache.myGold = document.getElementById('my-gold');
        domCache.shopLevel = document.getElementById('shop-level');
        domCache.roundNum = document.getElementById('round-num');
    }
    function init() { injectStyles(); cacheDoms(); bindUIEvents(); refreshAllUI(); console.log('✅ 双缓冲商店适配完成'); }

    return { init, refreshAllUI, updateTimerDisplay, setPhase, toast };
})();

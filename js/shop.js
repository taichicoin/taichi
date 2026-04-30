// ==================== 商店与交互系统【双缓冲秒刷 + 全部接口免JWT·RPC】 ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    // ========== 全局状态管理 ==========
    let toastTimer = null;
    let cachedAccessToken = null;
    let tokenCacheTimer = null;
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

    // ========== 双缓冲商店：提取当前显示卡牌 ==========
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
        // 兼容旧版简单数组
        return Array.isArray(shop) ? shop.filter(isValidCard) : [];
    }

    // 将双缓冲对象退化为当前组数组（供购买等老 RPC 使用）
    function degradeShopToActiveArray(player) {
        const shop = player.shopCards;
        if (shop && shop.buffer) {
            const active = shop.active || 0;
            const group = shop.buffer[active] || [];
            player.shopCards = group.filter(isValidCard);
        }
    }

    // ========== 权限判定 ==========
    function canOperate() {
        const gs = getGameState();
        return !!(gs && gs.phase === 'prepare' && !isRefreshingShop && !gs.players?.[getCurrentUserId()]?.isBot);
    }

    function throttle(fn, delay = 16) {
        let last = 0;
        return function(...args) {
            const now = Date.now();
            if (now - last >= delay) { last = now; fn.apply(this, args); }
        };
    }

    const FUNC = {
        REFRESH_SHOP: 'refresh-shop',
        BUY_CARD: 'buy-card',
        SWAP_BOARD: 'swap-board',
        SELL_CARD: 'sell-card',
        PLACE_CARD: 'place-card',
        BOARD_TO_HAND: 'board-to-hand',
        BUY_EXP: 'buy-exp'
    };

    async function invokeFunction(name, body = {}, opts = {}) {
        const { timeout = 10000 } = opts;
        const client = getSupabaseClient();
        if (!name) throw new Error('函数名不能为空');
        if (!client) throw new Error('Supabase客户端未初始化');
        const ctrl = new AbortController();
        const id = setTimeout(() => ctrl.abort(), timeout);
        try {
            const { data, error } = await client.functions.invoke(name, {
                body,
                headers: { Authorization: '' },
                signal: ctrl.signal
            });
            clearTimeout(id);
            if (error) {
                if (error.message.includes('404')) throw new Error('函数未部署');
                if (error.message.includes('500')) throw new Error('服务器内部错误');
                throw new Error(error.message || '操作失败');
            }
            if (data && !data.success) throw new Error(data.error || '操作失败');
            return { success: true, data };
        } catch (e) {
            let msg = '网络错误，操作失败';
            if (e.name === 'AbortError') msg = '请求超时，请重试';
            else if (e.message) msg = e.message;
            console.error(`[${name}]`, e);
            return { success: false, error: msg };
        }
    }

    function getValidAccessToken() { return null; }

    function mergeUpdatedPlayer(target, updatedPlayer) {
        if (!updatedPlayer) return;
        const fields = ['gold','exp','shopLevel','health','shopCards','isBot','isEliminated','isReady','hand','board'];
        fields.forEach(k => { if (updatedPlayer[k] !== undefined) target[k] = updatedPlayer[k]; });
    }

    function updateUIAfterSuccess(up) {
        if (!up) return;
        const gs = getGameState();
        const uid = getCurrentUserId();
        const my = gs?.players[uid];
        if (!my) return;
        if (up.gold !== undefined) {
            const el = document.getElementById('my-gold'); if (el) el.textContent = up.gold;
        }
        if (up.health !== undefined) {
            const el = document.getElementById('my-health'); if (el) el.textContent = up.health;
            const topEl = document.getElementById('my-health-top'); if (topEl) topEl.textContent = up.health;
        }
        if (up.shopLevel !== undefined) {
            const el = document.getElementById('shop-level'); if (el) el.textContent = up.shopLevel;
        }
        if (up.exp !== undefined || up.shopLevel !== undefined) updateBuyExpButtonState();
        if (up.shopCards !== undefined && !isDragging) renderShop();
        if (up.hand !== undefined && !isDragging) renderHand();
        if (up.board !== undefined && !isDragging) { renderMyBoard(); renderEnemyBoard(); }
    }

    function toast(msg, isErr = false, dur = 2000) {
        const old = document.getElementById('shop-toast');
        if (old) old.remove();
        if (toastTimer) clearTimeout(toastTimer);
        const el = document.createElement('div');
        el.id = 'shop-toast';
        el.style.cssText = `
            position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
            background:${isErr?'rgba(200,50,50,0.9)':'rgba(30,40,60,0.95)'};
            color:white; font-size:14px; padding:10px 20px; border-radius:30px;
            z-index:100001; border:1px solid ${isErr?'#ff7b7b':'#f5d76e'};
            box-shadow:0 4px 12px rgba(0,0,0,0.3); font-weight:bold;
            backdrop-filter:blur(4px); pointer-events:none; white-space:nowrap;
        `;
        el.textContent = msg;
        document.body.appendChild(el);
        toastTimer = setTimeout(() => { if (el.parentNode) el.remove(); toastTimer = null; }, dur);
    }

    function getCurrentUserId() { return window.YYCardAuth?.currentUser?.id || null; }
    function getGameState() { return window.YYCardBattle?.getGameState(); }
    function getCurrentRoomId() {
        if (window.YYCardBattle?.getCurrentRoomId) return window.YYCardBattle.getCurrentRoomId();
        return window._currentRoomId || null;
    }
    function getSupabaseClient() { return window.supabase; }

    // ========== 渲染 ==========
    function renderMyBoard() {
        if (isDragging) return;
        const gs = getGameState(); if (!gs) return;
        const uid = getCurrentUserId(); const my = gs.players[uid]; if (!my) return;
        renderBoard('my-board', my.board, true);
        const el = document.getElementById('my-board'); if (el) el.setAttribute('data-player-id', uid);
    }
    function renderEnemyBoard() {
        const gs = getGameState(); if (!gs) return;
        const uid = getCurrentUserId(); let oppId = null;
        if (gs.phase === 'battle' && gs.battlePairs) {
            for (const [p1,p2] of gs.battlePairs) { if (p1===uid && p2) { oppId=p2; break; } if (p2===uid && p1) { oppId=p1; break; } }
        }
        if (!oppId) {
            const humans = Object.entries(gs.players).filter(([id,p]) => id!==uid && !p.isBot && p.health>0 && !p.isEliminated);
            if (humans.length>0) oppId = humans[0][0];
        }
        if (!oppId) {
            const anyAlive = Object.entries(gs.players).find(([id,p]) => id!==uid && p.health>0 && !p.isEliminated);
            if (anyAlive) oppId = anyAlive[0];
        }
        if (!oppId) oppId = Object.keys(gs.players).find(id => id!==uid);
        if (oppId && gs.players[oppId]) {
            const orig = gs.players[oppId].board;
            const disp = [orig[3],orig[4],orig[5],orig[0],orig[1],orig[2]];
            renderBoard('enemy-board', disp, false);
            const el = document.getElementById('enemy-board'); if (el) el.setAttribute('data-player-id', oppId);
        }
    }
    function renderHand() {
        if (isDragging) return;
        const gs = getGameState(); if (!gs) return;
        const uid = getCurrentUserId(); const my = gs.players[uid]; if (!my) return;
        const cont = domCache.handContainer || document.getElementById('hand-container');
        if (!cont) return;
        cont.innerHTML = '';
        const frag = document.createDocumentFragment();
        my.hand.forEach((c,i) => {
            if (isValidCard(c)) {
                const el = createCardElement(c);
                el.setAttribute('data-hand-index', i);
                el.setAttribute('data-card-type', 'hand');
                el.addEventListener('pointerdown', e => onDragStart(e, 'hand', c, i, el));
                frag.appendChild(el);
            }
        });
        cont.appendChild(frag);
        const cnt = document.getElementById('hand-count');
        if (cnt) cnt.textContent = getValidHandCount(my.hand);
    }
    function renderShop() {
        const gs = getGameState(); if (!gs) return;
        const uid = getCurrentUserId(); const my = gs.players[uid]; if (!my) return;
        const cont = domCache.shopContainer || document.getElementById('shop-container');
        if (!cont) return;
        cont.innerHTML = '';
        const shopCards = getShopDisplayCards(my);   // ✅ 使用双缓冲提取
        if (shopCards.length === 0) {
            cont.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">商店暂无卡牌</div>';
            return;
        }
        const frag = document.createDocumentFragment();
        shopCards.forEach((c,i) => {
            if (isValidCard(c)) {
                const el = createCardElement(c);
                el.setAttribute('data-shop-index', i);
                el.setAttribute('data-card-type', 'shop');
                el.addEventListener('pointerdown', e => onDragStart(e, 'shop', c, i, el));
                frag.appendChild(el);
            }
        });
        cont.appendChild(frag);
    }
    function refreshAllUI() {
        if (window.YYCardInspector?.cleanupAllRemnants) window.YYCardInspector.cleanupAllRemnants();
        if (!isDragging) { renderMyBoard(); renderHand(); }
        renderEnemyBoard();
        renderShop();
        const gs = getGameState(); if (!gs) return;
        const uid = getCurrentUserId(); const my = gs.players[uid];
        if (my) {
            (domCache.myHealth||document.getElementById('my-health')).textContent = my.health;
            (domCache.myGold||document.getElementById('my-gold')).textContent = my.gold;
            (domCache.shopLevel||document.getElementById('shop-level')).textContent = my.shopLevel;
            const ht = document.getElementById('my-health-top'); if (ht) ht.textContent = my.health;
        }
        (domCache.roundNum||document.getElementById('round-num')).textContent = gs.round;
        const rt = document.getElementById('round-num-top'); if (rt) rt.textContent = gs.round;
        updateBuyExpButtonState();
    }
    function updateBuyExpButtonState() {
        const gs = getGameState(); if (!gs) return;
        const uid = getCurrentUserId(); const my = gs.players[uid]; if (!my) return;
        const maxLv = my.shopLevel >= (config.MAX_SHOP_LEVEL || 5);
        const canOp = canOperate();
        const dis = !canOp || maxLv;
        let need = 0;
        if (!maxLv) {
            const e = my.exp;
            if (e<4) need=4-e; else if (e<12) need=12-e; else if (e<26) need=26-e; else if (e<46) need=46-e;
        }
        ['buy-exp-btn','buy-exp-btn-bottom'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.textContent = maxLv ? '📈 已满级' : `📈 升级 (${need}💰)`;
                btn.disabled = dis || need > my.gold;
                btn.style.pointerEvents = dis ? 'none' : 'auto';
                btn.style.opacity = dis ? '0.6' : '1';
            }
        });
    }
    function renderBoard(contId, cards, isSelf) {
        const cont = domCache[contId] || document.getElementById(contId);
        if (!cont) return;
        cont.innerHTML = '';
        const frag = document.createDocumentFragment();
        for (let i=0; i<6; i++) {
            const c = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.setAttribute('data-slot-index', i);
            let di = isSelf ? i : (i<3 ? i+3 : i-3);
            slot.setAttribute('data-board-index', di);
            if (isValidCard(c)) {
                const el = createCardElement(c);
                if (isSelf) {
                    el.setAttribute('data-board-index', i);
                    el.setAttribute('data-card-type', 'board');
                    el.addEventListener('pointerdown', e => onDragStart(e, 'board', c, i, el));
                } else {
                    el.setAttribute('data-board-index', di);
                }
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
        const imgPath = card.image || card.icon || `/assets/card/${card.cardId||card.id||'default'}.png`;
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        d.innerHTML = `
            <div class="card-icon"><img src="${imgPath}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'"></div>
            <div class="card-name">${card.name}</div>
            <div class="card-stats"><span class="card-atk">⚔️${card.atk}</span><span class="card-hp">🛡️${card.hp}</span></div>
            <div class="card-price">💰${price}</div>
            ${card.star>0?'<div class="card-star">★</div>':''}
        `;
        d.querySelector('img').draggable = false;
        return d;
    }

    // ========== 拖拽 ==========
    function onDragStart(e, type, card, index, element) {
        if (!canOperate()) { toast('当前阶段不能操作', true); return; }
        e.preventDefault(); e.stopPropagation();
        element.setPointerCapture(e.pointerId);
        isDragging = true;
        const cx = e.clientX, cy = e.clientY;
        const clone = element.cloneNode(true);
        clone.classList.add('card-drag-clone');
        clone.style.cssText = `
            position:fixed; z-index:99999; left:${cx-element.offsetWidth/2}px; top:${cy-element.offsetHeight/2}px;
            width:${element.offsetWidth}px; height:${element.offsetHeight}px;
            opacity:0.85; transform:scale(1.05); box-shadow:0 8px 20px rgba(0,0,0,0.5);
            pointer-events:none; transition:none; will-change:left,top;
        `;
        document.body.appendChild(clone);
        element.style.visibility = 'hidden';
        dragState = { active:true, type, card, index, sourceElement:element, cloneElement:clone, startX:cx, startY:cy, currentX:cx, currentY:cy };
        document.addEventListener('pointermove', throttledDragMove);
        document.addEventListener('pointerup', onDragEnd);
        document.addEventListener('pointercancel', onDragEnd);
    }
    const throttledDragMove = throttle(function(e) {
        if (!dragState.active) return;
        e.preventDefault();
        const cx = e.clientX, cy = e.clientY;
        dragState.currentX = cx; dragState.currentY = cy;
        const clone = dragState.cloneElement;
        clone.style.left = (cx - clone.offsetWidth/2) + 'px';
        clone.style.top = (cy - clone.offsetHeight/2) + 'px';
        if (dragState.type==='hand' || dragState.type==='board') {
            const sc = domCache.shopContainer || document.getElementById('shop-container');
            if (sc) {
                const sa = sc.closest('.shop-area');
                if (sa) {
                    const r = sa.getBoundingClientRect();
                    const over = cx>=r.left && cx<=r.right && cy>=r.top && cy<=r.bottom;
                    sa.classList.toggle('drop-target', over);
                }
            }
        }
    }, 16);
    function onDragEnd(e) {
        if (!dragState.active) return;
        e.preventDefault();
        const { type, sourceElement, cloneElement, currentX, currentY } = dragState;
        cloneElement.remove();
        sourceElement.style.visibility = '';
        const sa = document.querySelector('.shop-area'); if (sa) sa.classList.remove('drop-target');
        sourceElement.releasePointerCapture?.(e.pointerId);
        document.removeEventListener('pointermove', throttledDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);
        const target = document.elementFromPoint(currentX, currentY);
        if (!target) { dragState.active = false; isDragging = false; return; }
        const drop = getDropTarget(target);
        if (drop) executeDropAction(dragState.type, dragState.index, dragState.card, drop);
        dragState.active = false;
        isDragging = false;
    }
    function getDropTarget(el) {
        let cur = el;
        while (cur && cur !== document.body) {
            if (cur.classList.contains('card-slot')) {
                const bc = cur.closest('.board');
                const bid = bc?.id;
                const si = cur.getAttribute('data-slot-index');
                if (bid==='my-board' && si!==null) return { zone:'board', index:parseInt(si) };
            }
            if (cur.id==='hand-container' || cur.closest('#hand-container')) return { zone:'hand' };
            if (cur.id==='shop-container' || cur.closest('#shop-container')) return { zone:'shop' };
            cur = cur.parentElement;
        }
        return null;
    }
    async function executeDropAction(type, index, card, drop) {
        if (type==='hand') {
            if (drop.zone==='board') await handleHandToBoard(index, drop.index);
            else if (drop.zone==='shop') await handleSell('hand', index);
        } else if (type==='board') {
            if (drop.zone==='board') await handleBoardSwap(index, drop.index);
            else if (drop.zone==='hand') await handleBoardToHand(index);
            else if (drop.zone==='shop') await handleSell('board', index);
        } else if (type==='shop') {
            if (drop.zone==='board') await handleShopToBoard(card, index, drop.index);
            else if (drop.zone==='hand') await handleShopToHand(card, index);
        }
    }

    // ==================== 业务操作 ====================
    async function handleHandToBoard(handIdx, boardIdx) { /* 保持原有，略... */ 
        if (!canOperate()) { toast('当前阶段不能操作', true); return; }
        const userId = getCurrentUserId(), roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }
        const gs = getGameState(), my = gs?.players[userId];
        if (!my) return;
        const oldHand = [...my.hand], oldBoard = [...my.board];
        const card = my.hand[handIdx];
        if (!isValidCard(card)) { toast('卡牌不存在', true); return; }
        const oldTarget = my.board[boardIdx];
        if (isValidCard(oldTarget) && getValidHandCount(my.hand) >= 15) { toast('手牌已满，无法交换', true); return; }
        my.board[boardIdx] = card; my.hand[handIdx] = oldTarget || null;
        renderMyBoard(); renderHand();
        const res = await invokeFunction(FUNC.PLACE_CARD, { roomId, userId, handIndex:handIdx, boardIndex:boardIdx });
        if (!res.success) { my.hand = oldHand; my.board = oldBoard; renderMyBoard(); renderHand(); toast(res.error, true); return; }
        if (res.data.updatedPlayer) { mergeUpdatedPlayer(my, res.data.updatedPlayer); updateUIAfterSuccess(res.data.updatedPlayer); }
        toast(res.data.exchanged ? '交换成功' : '放置成功');
    }

    // ✅ 购买操作：自动退化为当前组数组，兼容老 RPC
    async function handleShopToBoard(card, shopIdx, boardIdx) {
        if (!canOperate()) { toast('当前阶段不能操作', true); return; }
        const userId = getCurrentUserId(), roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }
        const gs = getGameState(), my = gs?.players[userId];
        if (!my) return;
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        if (my.gold < price) { toast('金币不足', true); return; }
        const oldGold = my.gold, oldShopCards = [...my.shopCards], oldHand = [...my.hand], oldBoard = [...my.board];
        const targetCard = my.board[boardIdx];
        if (isValidCard(targetCard) && getValidHandCount(my.hand) >= 15) { toast('手牌已满，无法交换', true); return; }

        // 退化为当前组数组，保证后端购买操作正确
        degradeShopToActiveArray(my);
        my.gold -= price;
        my.shopCards.splice(shopIdx, 1);
        const tempId = Date.now() + '-' + Math.random();
        my.board[boardIdx] = { ...card, instanceId: tempId };
        if (isValidCard(targetCard)) {
            const eIdx = getFirstAvailableHandSlot(my.hand);
            if (eIdx !== -1) my.hand[eIdx] = targetCard;
        }
        renderMyBoard(); renderHand(); renderShop();
        const res = await invokeFunction(FUNC.BUY_CARD, { roomId, userId, shopIndex:shopIdx, targetBoardIndex:boardIdx });
        if (!res.success) {
            my.gold = oldGold; my.shopCards = oldShopCards; my.hand = oldHand; my.board = oldBoard;
            renderMyBoard(); renderHand(); renderShop(); toast(res.error, true); return;
        }
        if (res.data.updatedPlayer) { mergeUpdatedPlayer(my, res.data.updatedPlayer); updateUIAfterSuccess(res.data.updatedPlayer); }
        toast(res.data.exchanged ? '购买并交换成功' : '购买成功');
    }

    async function handleShopToHand(card, shopIdx) {
        if (!canOperate()) { toast('当前阶段不能操作', true); return; }
        const userId = getCurrentUserId(), roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }
        const gs = getGameState(), my = gs?.players[userId];
        if (!my) return;
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        if (my.gold < price) { toast('金币不足', true); return; }
        if (getValidHandCount(my.hand) >= 15) { toast('手牌已满', true); return; }
        const oldGold = my.gold, oldShopCards = [...my.shopCards], oldHand = [...my.hand];

        degradeShopToActiveArray(my);   // 退化
        my.gold -= price;
        my.shopCards.splice(shopIdx, 1);
        const tempId = Date.now() + '-' + Math.random();
        const eIdx = getFirstAvailableHandSlot(my.hand);
        if (eIdx !== -1) my.hand[eIdx] = { ...card, instanceId: tempId };
        else my.hand.push({ ...card, instanceId: tempId });
        renderHand(); renderShop();
        const res = await invokeFunction(FUNC.BUY_CARD, { roomId, userId, shopIndex:shopIdx });
        if (!res.success) { my.gold = oldGold; my.shopCards = oldShopCards; my.hand = oldHand; renderHand(); renderShop(); toast(res.error, true); return; }
        if (res.data.updatedPlayer) { mergeUpdatedPlayer(my, res.data.updatedPlayer); updateUIAfterSuccess(res.data.updatedPlayer); }
        toast('购买成功');
    }

    async function handleBoardSwap(idxA, idxB) { /* 略 */ 
        if (!canOperate() || idxA===idxB) return;
        const userId = getCurrentUserId(), roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }
        const gs = getGameState(), my = gs?.players[userId];
        if (!my) return;
        const oldBoard = [...my.board];
        [my.board[idxA], my.board[idxB]] = [my.board[idxB], my.board[idxA]];
        renderMyBoard();
        const res = await invokeFunction(FUNC.SWAP_BOARD, { roomId, userId, indexA:idxA, indexB:idxB });
        if (!res.success) { my.board = oldBoard; renderMyBoard(); toast(res.error, true); return; }
        if (res.data.updatedPlayer) { mergeUpdatedPlayer(my, res.data.updatedPlayer); updateUIAfterSuccess(res.data.updatedPlayer); }
        toast('交换成功');
    }
    async function handleBoardToHand(boardIdx) { /* 略 */ 
        if (!canOperate()) { toast('当前阶段不能操作', true); return; }
        const userId = getCurrentUserId(), roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }
        const gs = getGameState(), my = gs?.players[userId];
        if (!my) return;
        const card = my.board[boardIdx];
        if (!isValidCard(card)) { toast('该位置无卡牌', true); return; }
        if (getValidHandCount(my.hand) >= 15) { toast('手牌已满', true); return; }
        const oldBoard = [...my.board], oldHand = [...my.hand];
        my.board[boardIdx] = null;
        const eIdx = getFirstAvailableHandSlot(my.hand);
        if (eIdx !== -1) my.hand[eIdx] = card; else my.hand.push(card);
        renderMyBoard(); renderHand();
        const res = await invokeFunction(FUNC.BOARD_TO_HAND, { roomId, userId, boardIndex:boardIdx });
        if (!res.success) { my.board = oldBoard; my.hand = oldHand; renderMyBoard(); renderHand(); toast(res.error, true); return; }
        if (res.data.updatedPlayer) { mergeUpdatedPlayer(my, res.data.updatedPlayer); updateUIAfterSuccess(res.data.updatedPlayer); }
        toast('已移回手牌');
    }
    async function handleSell(type, idx) { /* 略 */ 
        if (!canOperate()) { toast('当前阶段不能操作', true); return; }
        const userId = getCurrentUserId(), roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }
        const gs = getGameState(), my = gs?.players[userId];
        if (!my) return;
        const card = type==='hand' ? my.hand[idx] : my.board[idx];
        if (!isValidCard(card)) { toast('卡牌不存在', true); return; }
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.sell) || 1;
        const oldGold = my.gold, oldHand = [...my.hand], oldBoard = [...my.board];
        if (type==='hand') my.hand[idx] = null; else my.board[idx] = null;
        my.gold += price;
        renderMyBoard(); renderHand();
        const res = await invokeFunction(FUNC.SELL_CARD, { roomId, userId, type, index:idx });
        if (!res.success) { my.gold = oldGold; my.hand = oldHand; my.board = oldBoard; renderMyBoard(); renderHand(); toast(res.error, true); return; }
        if (res.data.updatedPlayer) { mergeUpdatedPlayer(my, res.data.updatedPlayer); updateUIAfterSuccess(res.data.updatedPlayer); }
        toast('出售成功');
    }
    async function buyExpAction() { /* 略 */ 
        if (!canOperate()) { toast('当前阶段不能操作', true); return; }
        const userId = getCurrentUserId(), roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }
        const gs = getGameState(), my = gs?.players[userId];
        if (!my) return;
        if (my.shopLevel >= (config.MAX_SHOP_LEVEL||5)) { toast('已满级', true); return; }
        if (my.gold < 1) { toast('金币不足', true); return; }
        const oldGold = my.gold;
        my.gold -= 1;
        const res = await invokeFunction(FUNC.BUY_EXP, { roomId, userId });
        if (!res.success) { my.gold = oldGold; toast(res.error, true); return; }
        if (res.data.updatedPlayer) { mergeUpdatedPlayer(my, res.data.updatedPlayer); updateUIAfterSuccess(res.data.updatedPlayer); }
        toast('升级成功');
    }

    // ✅ 刷新商店（无改动，后端已切到双缓冲秒刷）
    async function refreshShopAction() {
        if (!canOperate()) { toast('只能在准备阶段刷新', true); return; }
        const userId = getCurrentUserId(), roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }
        const gs = getGameState(), my = gs?.players[userId];
        if (!my) return;
        if (my.gold < 1) { toast('金币不足', true); return; }
        isRefreshingShop = true; updateBuyExpButtonState();
        const forceTimer = setTimeout(() => { isRefreshingShop = false; updateBuyExpButtonState(); }, 12000);
        const sc = domCache.shopContainer || document.getElementById('shop-container');
        let hint = null;
        if (sc && !sc.querySelector('.refresh-loading-hint')) {
            hint = document.createElement('div'); hint.className = 'refresh-loading-hint'; hint.textContent = '⟳ 刷新中...';
            hint.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.75); color:#ffd966; border-radius:8px; padding:8px 16px; font-size:14px; z-index:100; pointer-events:none;';
            sc.style.position = 'relative'; sc.appendChild(hint);
        }
        const res = await invokeFunction(FUNC.REFRESH_SHOP, { roomId, userId });
        clearTimeout(forceTimer); isRefreshingShop = false; updateBuyExpButtonState();
        if (hint?.parentNode) hint.remove();
        if (!res.success) { toast(res.error, true); return; }
        const latestGS = getGameState(), latestMy = latestGS?.players[userId];
        if (!latestMy) { toast('玩家状态异常', true); return; }
        let finalData = {};
        if (res.data.updatedPlayer) { finalData = res.data.updatedPlayer; }
        else { finalData = { shopCards: res.data.shopCards || latestMy.shopCards, gold: res.data.gold !== undefined ? res.data.gold : latestMy.gold }; }
        mergeUpdatedPlayer(latestMy, finalData);
        updateUIAfterSuccess(finalData);
        toast('刷新成功');
    }

    // ========== 基础UI绑定 ==========
    function updateTimerDisplay(sec, phase) {
        const el = document.getElementById('phase-timer');
        if (el) {
            if (phase==='buffering') { el.textContent = `⏳ ${sec}`; return; }
            const m = Math.floor(sec/60).toString().padStart(2,'0'), s = (sec%60).toString().padStart(2,'0');
            el.textContent = `${m}:${s}`;
        }
        const btel = document.getElementById('phase-timer-battle');
        if (btel) btel.textContent = (phase==='battle') ? sec : '00:00';
    }
    function setPhase(phase) {
        if (phase==='buffering') document.body.classList.add('buffering-mode');
        else document.body.classList.remove('buffering-mode');
        updateBuyExpButtonState();
    }
    function bindUIEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }
    function injectStyles() {
        const id = 'yycard-manual-drag';
        if (document.getElementById(id)) return;
        const s = document.createElement('style'); s.id = id;
        s.textContent = `
            .card { touch-action:none; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; will-change:transform; }
            .card-drag-clone { pointer-events:none!important; will-change:left,top; transform:translateZ(0); }
            .shop-area.drop-target { box-shadow:0 0 0 4px #ff4444!important; transition:box-shadow 0.1s; }
            .buffering-mode .card,.buffering-mode .btn,.buffering-mode .shop-area,.buffering-mode .hand-area { pointer-events:none!important; opacity:0.6; }
            .card-slot,.card { contain:layout style paint; }
        `;
        document.head.appendChild(s);
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
    function init() {
        injectStyles(); cacheDoms(); bindUIEvents(); refreshAllUI();
        console.log('✅ 全接口免JWT·RPC + 双缓冲秒刷版 初始化完成');
    }
    return { init, refreshAllUI, updateTimerDisplay, setPhase, toast };
})();

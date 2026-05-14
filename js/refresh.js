// ==================== 商店刷新/升级/渲染模块 (refresh.js) ====================
window.YYCardShopRefresh = (function() {
    const config = window.YYCardConfig;

    // 请求序号
    let refreshSeq = 0;
    let isRefreshingShop = false;
    let isBusy = false;
    let lastRefreshTime = 0;

    // 依赖注入
    let _canOperate, _mergeUpdatedPlayer, _updateUIAfterSuccess;
    let _renderHand, _renderMyBoard, _updateBuyExpButtonState;
    let _getGameState, _getCurrentUserId, _getCurrentRoomId;
    let _toast;

    // ★ 事件发射器（供音效等使用）
    const _listeners = {};
    function _emit(event, detail) {
        if (_listeners[event]) {
            _listeners[event].forEach(fn => { try { fn(detail); } catch (e) {} });
        }
    }

    // 基础工具（不再依赖 shop.js）
    function isValidCard(card) {
        return card && typeof card === 'object' && (card.cardId || card.card_id);
    }

    function setDeps(deps) {
        _canOperate = deps.canOperate;
        _mergeUpdatedPlayer = deps.mergeUpdatedPlayer;
        _updateUIAfterSuccess = deps.updateUIAfterSuccess;
        _renderHand = deps.renderHand;
        _renderMyBoard = deps.renderMyBoard;
        _updateBuyExpButtonState = deps.updateBuyExpButtonState;
        _getGameState = deps.getGameState;
        _getCurrentUserId = deps.getCurrentUserId;
        _getCurrentRoomId = deps.getCurrentRoomId;
        _toast = deps.toast;
    }

    function getGameState() { return _getGameState ? _getGameState() : null; }
    function getCurrentUserId() { return _getCurrentUserId ? _getCurrentUserId() : null; }
    function getCurrentRoomId() { return _getCurrentRoomId ? _getCurrentRoomId() : null; }
    function canOperate() { return _canOperate ? _canOperate() : false; }

    // ========== 商店渲染（从 shop.js 搬过来） ==========
    function createCardElement(card, cardType = 'shop') {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity);
        d.setAttribute('data-card-type', cardType);
        const imgPath = card.image || card.icon || `/assets/card/${card.cardId || card.id || 'default'}.png`;
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        const atkDisplay = `⚔️${card.atk}`;
        const hpDisplay = `🛡️${card.hp}`;
        const priceHtml = `<div class="card-price">💰${price}</div>`;
        d.innerHTML = `
            <div class="card-icon"><img src="${imgPath}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'"></div>
            <div class="card-name">${card.name}</div>
            <div class="card-stats"><span class="card-atk">${atkDisplay}</span><span class="card-hp">${hpDisplay}</span></div>
            ${priceHtml}
            ${card.star > 0 ? '<div class="card-star">★</div>' : ''}
        `;
        d.querySelector('img').draggable = false;
        return d;
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

        const shop = my.shopCards;
        if (!shop?.buffer) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">商店暂无卡牌</div>';
            return;
        }

        const active = shop.active ?? 0;
        const sub = shop.subIndex ?? 0;
        const group = shop.buffer[active];
        if (!Array.isArray(group) || group.length < 15) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">商店数据异常</div>';
            return;
        }

        const start = sub * 3;
        let hasAnyCard = false;
        const fragment = document.createDocumentFragment();

        for (let i = start; i < start + 3; i++) {
            const card = group[i];
            if (isValidCard(card)) {
                hasAnyCard = true;
                const el = createCardElement(card, 'shop');
                el.setAttribute('data-shop-index', i);
                el.setAttribute('data-card-type', 'shop');
                // 拖拽事件仍然委托给 shop.js 处理（通过全局函数或事件代理）
                el.addEventListener('pointerdown', (e) => {
                    // 调用 shop.js 的 onDragStart（假设已暴露）
                    if (window.YYCardShop && window.YYCardShop._startDrag) {
                        window.YYCardShop._startDrag(e, 'shop', card, i, el);
                    }
                });
                fragment.appendChild(el);
            } else {
                const placeholder = document.createElement('div');
                placeholder.className = 'card empty-slot';
                placeholder.setAttribute('data-shop-index', i);
                placeholder.style.visibility = 'hidden';
                placeholder.innerHTML = '';
                fragment.appendChild(placeholder);
            }
        }

        if (!hasAnyCard) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">商店暂无卡牌</div>';
        } else {
            container.innerHTML = '';
            container.appendChild(fragment);
        }
    }

    // ========== 本地翻页逻辑（从 shop.js 搬过来） ==========
    function isLocalFlipSafe() {
        const my = getGameState()?.players[getCurrentUserId()];
        if (!my) return false;
        const shop = my.shopCards;
        if (!shop?.buffer) return false;
        const sub = shop.subIndex ?? 0;
        if (sub < 4) return true;
        const nextActive = 1 - (shop.active ?? 0);
        const targetGroup = shop.buffer[nextActive];
        if (!Array.isArray(targetGroup) || targetGroup.length < 15) return false;
        return isValidCard(targetGroup[0]);
    }

    function performLocalFlip() {
        const gameState = getGameState();
        const my = gameState?.players[getCurrentUserId()];
        if (!my) return;
        const shop = my.shopCards;
        if (!shop?.buffer) return;

        let active = shop.active ?? 0;
        let subIndex = shop.subIndex ?? 0;

        if (subIndex < 4) {
            subIndex += 1;
        } else {
            subIndex = 0;
            active = 1 - active;
        }

        shop.active = active;
        shop.subIndex = subIndex;
        renderShop();
    }

    // ========== 刷新按钮显示 ==========
    function updateRefreshButtonDisplay() {
        const btn = document.getElementById('refresh-shop-btn');
        if (!btn) return;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players?.[userId];
        if (!my) return;
        const free = my.freeRefresh || 0;
        btn.textContent = free > 0 ? '🔄 刷新 (0💰)' : '🔄 刷新 (1💰)';
    }

    // ========== 网络调用 ==========
    async function invokeFunction(functionName, body = {}, timeout = 10000) {
        const supabase = window.supabase;
        if (!supabase) return { success: false, error: 'Supabase未初始化' };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            const { data, error } = await supabase.functions.invoke(functionName, {
                body,
                headers: { Authorization: '' },
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (error) throw new Error(error.message);
            if (data && !data.success) throw new Error(data.error || '操作失败');
            return { success: true, data };
        } catch (err) {
            clearTimeout(timeoutId);
            console.error(`[${functionName}] 调用异常:`, err);
            return { success: false, error: err.message };
        }
    }

    // ========== 刷新动作 ==========
    async function refreshShopAction() {
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!gameState || !userId || !roomId) return;

        const my = gameState.players?.[userId];
        if (!my) return;

        const freeRefresh = my.freeRefresh || 0;
        const gold = my.gold || 0;
        if (freeRefresh === 0 && gold < 1) {
            _toast?.('金币不足', true);
            return;
        }

        if (isBusy) return;
        if (Date.now() - lastRefreshTime < 300) return;
        lastRefreshTime = Date.now();
        if (isRefreshingShop) return;

        const shop = my.shopCards;
        const currentSub = shop.subIndex ?? 0;
        const isSwitchingGroup = (currentSub === 4);

        if (!isLocalFlipSafe()) {
            isRefreshingShop = true;
            const mySeq = ++refreshSeq;
            _updateBuyExpButtonState?.();
            try {
                const result = await invokeFunction('refresh-shop', { roomId, userId });
                if (mySeq !== refreshSeq) return;
                if (!result.success) {
                    _toast?.(result.error || '刷新失败', true);
                    return;
                }
                if (result.data.updatedPlayer) {
                    _mergeUpdatedPlayer?.(my, result.data.updatedPlayer);
                    _updateUIAfterSuccess?.(result.data.updatedPlayer);
                }
            } catch (err) {
                if (mySeq === refreshSeq) _toast?.('网络异常', true);
            } finally {
                if (mySeq === refreshSeq) {
                    isRefreshingShop = false;
                    _updateBuyExpButtonState?.();
                }
            }
            updateRefreshButtonDisplay();
            return;
        }

        // 乐观本地翻页
        if (freeRefresh > 0) {
            my.freeRefresh = freeRefresh - 1;
        } else {
            my.gold -= 1;
        }
        document.getElementById('my-gold').textContent = my.gold;
        performLocalFlip();
        updateRefreshButtonDisplay();
        _emit('refresh');   // 音效事件

        const mySeq = ++refreshSeq;
        invokeFunction('refresh-shop', { roomId, userId })
            .then(result => {
                if (isSwitchingGroup) {
                    if (result.success && result.data.updatedPlayer) {
                        const up = result.data.updatedPlayer;
                        const localActive = my.shopCards.active ?? 0;
                        const inactiveIdx = 1 - localActive;
                        if (up.shopCards?.buffer?.[inactiveIdx]) {
                            my.shopCards.buffer[inactiveIdx] = up.shopCards.buffer[inactiveIdx];
                        }
                        if (up.gold !== undefined) {
                            my.gold = up.gold;
                            document.getElementById('my-gold').textContent = up.gold;
                        }
                        if (up.freeRefresh !== undefined) my.freeRefresh = up.freeRefresh;
                        if (up.exp !== undefined) my.exp = up.exp;
                        if (up.shopLevel !== undefined) my.shopLevel = up.shopLevel;
                        if (up.health !== undefined) my.health = up.health;

                        if (!window.YYCardShop?.isDragging) {
                            if (up.hand) { my.hand = up.hand; _renderHand?.(); }
                            if (up.board) { my.board = up.board; _renderMyBoard?.(); }
                        }
                        if (window.mergeService) {
                            window.mergeService.updateMergeGlow();
                            window.mergeService.envokeMerge();
                        }
                        updateRefreshButtonDisplay();
                    } else if (!result.success) {
                        _toast?.(result.error || '刷新失败', true);
                    }
                } else {
                    if (mySeq !== refreshSeq) return;
                    if (result.success && result.data.updatedPlayer) {
                        const up = result.data.updatedPlayer;
                        if (up.gold !== undefined) {
                            my.gold = up.gold;
                            document.getElementById('my-gold').textContent = up.gold;
                        }
                        if (up.freeRefresh !== undefined) my.freeRefresh = up.freeRefresh;
                        if (up.exp !== undefined) my.exp = up.exp;
                        if (up.shopLevel !== undefined) my.shopLevel = up.shopLevel;
                        if (up.health !== undefined) my.health = up.health;
                        if (!window.YYCardShop?.isDragging) {
                            if (up.hand) { my.hand = up.hand; _renderHand?.(); }
                            if (up.board) { my.board = up.board; _renderMyBoard?.(); }
                        }
                        if (window.mergeService) {
                            window.mergeService.updateMergeGlow();
                            window.mergeService.envokeMerge();
                        }
                        updateRefreshButtonDisplay();
                    } else if (!result.success) {
                        _toast?.(result.error || '刷新失败', true);
                    }
                }
            })
            .catch(() => {});
        _updateBuyExpButtonState?.();
    }

    // ========== 购买经验 ==========
    async function buyExpAction() {
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!gameState || !userId || !roomId) return;

        const my = gameState.players?.[userId];
        if (!my) return;
        if (!canOperate()) return;
        if (my.shopLevel >= (config.MAX_SHOP_LEVEL || 5)) return;
        if (my.gold < 1) return;

        const oldGold = my.gold;
        my.gold -= 1;
        document.getElementById('my-gold').textContent = my.gold;

        const result = await invokeFunction('buy-exp', { roomId, userId });
        if (!result.success) {
            my.gold = oldGold;
            document.getElementById('my-gold').textContent = oldGold;
            return;
        }
        if (result.data.updatedPlayer) {
            _mergeUpdatedPlayer?.(my, result.data.updatedPlayer);
            _updateUIAfterSuccess?.(result.data.updatedPlayer);
            _updateBuyExpButtonState?.();
        }
        _emit('exp');   // 音效事件
    }

    // ========== 按钮绑定 ==========
    function bindEvents() {
        const refreshBtn = document.getElementById('refresh-shop-btn');
        if (refreshBtn) {
            const newBtn = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(newBtn, refreshBtn);
            newBtn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                refreshShopAction();
            });
        }

        ['buy-exp-btn', 'buy-exp-btn-bottom'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                newBtn.addEventListener('click', buyExpAction);
            }
        });

        updateRefreshButtonDisplay();
    }

    // 初始化入口
    function init(deps) {
        setDeps(deps);
        bindEvents();
        // 将商店渲染函数注入给 shop.js，方便购买后刷新商店
        if (window.YYCardShop) {
            window.YYCardShop.renderShop = renderShop;
        }
        console.log('✅ refresh.js 已启动（商店渲染+刷新+升级）');
    }

    return {
        init,
        renderShop,                 // 暴露给外部调用
        refreshShopAction,
        buyExpAction,
        updateRefreshButtonDisplay,
        on: (event, fn) => {
            if (!_listeners[event]) _listeners[event] = [];
            _listeners[event].push(fn);
        },
        get isRefreshing() { return isRefreshingShop; },
        get isBusy() { return isBusy; },
    };
})();

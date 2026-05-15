// ==================== 刷新 & 升级动作模块 (refresh.js) ====================
window.YYCardShopRefresh = (function() {
    const config = window.YYCardConfig;

    let refreshSeq = 0;
    let isRefreshingShop = false;
    let lastRefreshTime = 0;
    let refreshLockTimer = null;

    const _listeners = {};
    function _emit(event, detail) {
        if (_listeners[event]) {
            _listeners[event].forEach(fn => { try { fn(detail); } catch (e) {} });
        }
    }

    let _canOperate, _isLocalFlipSafe, _performLocalFlip;
    let _mergeUpdatedPlayer, _updateUIAfterSuccess;
    let _renderShop, _renderHand, _renderMyBoard, _updateBuyExpButtonState;
    let _getGameState, _getCurrentUserId, _getCurrentRoomId;
    let _toast;

    function setDeps(deps) {
        _canOperate = deps.canOperate;
        _isLocalFlipSafe = deps.isLocalFlipSafe;
        _performLocalFlip = deps.performLocalFlip;
        _mergeUpdatedPlayer = deps.mergeUpdatedPlayer;
        _updateUIAfterSuccess = deps.updateUIAfterSuccess;
        _renderShop = deps.renderShop;
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
    function isLocalFlipSafe() { return _isLocalFlipSafe ? _isLocalFlipSafe() : false; }
    function performLocalFlip() { _performLocalFlip?.(); }

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

    // ========== 动画核心（修改版） ==========
    function injectBuffAnimationStyles() {
        if (document.getElementById('buff-float-keyframes')) return;
        const style = document.createElement('style');
        style.id = 'buff-float-keyframes';
        style.textContent = `
            @keyframes buffFloat {
                0%   { opacity: 1; transform: translateY(0); }
                100% { opacity: 0; transform: translateY(-60px); }
            }
        `;
        document.head.appendChild(style);
    }

    function playBuffOnCard(cardElement, atkBuff, hpBuff) {
        if (!cardElement) return;

        // 1. 找到数值显示元素 .card-atk 和 .card-hp，只放大这些文字
        const atkEl = cardElement.querySelector('.card-atk');
        const hpEl = cardElement.querySelector('.card-hp');

        const doBounce = (el) => {
            if (!el) return;
            el.style.transition = 'transform 0.15s ease-out';
            el.style.transform = 'scale(1.2)';
            setTimeout(() => {
                el.style.transition = 'transform 0.15s ease-in';
                el.style.transform = 'scale(1.0)';
            }, 150);
        };

        if (atkBuff > 0 && atkEl) doBounce(atkEl);
        if (hpBuff > 0 && hpEl) doBounce(hpEl);

        // 2. 飘字（只显示数值，无图标）
        const floatContainer = document.createElement('div');
        floatContainer.className = 'buff-float-container';
        const rect = cardElement.getBoundingClientRect();
        floatContainer.style.cssText = `
            position: fixed;
            left: ${rect.left + rect.width / 2}px;
            top: ${rect.top + rect.height * 0.6}px;
            z-index: 10001;
            pointer-events: none;
            display: flex;
            flex-direction: column;
            align-items: center;
            transform: translateX(-50%);
        `;
        document.body.appendChild(floatContainer);

        if (atkBuff > 0) createFloatText(floatContainer, `+${atkBuff}`, '#4caf50');
        if (hpBuff > 0) createFloatText(floatContainer, `+${hpBuff}`, '#4caf50');

        setTimeout(() => {
            if (floatContainer.parentNode) floatContainer.remove();
        }, 900);
    }

    function createFloatText(container, text, color) {
        const span = document.createElement('span');
        span.textContent = text;
        span.style.cssText = `
            display: block;
            color: ${color};
            font-weight: bold;
            font-size: 1.2em;
            text-shadow: 0 0 6px rgba(0,0,0,0.5);
            animation: buffFloat 0.8s ease-out forwards;
        `;
        container.appendChild(span);
    }

    function triggerBuffAnimations(boardBuffs) {
        if (!boardBuffs || boardBuffs.length === 0) return;

        // 等棋盘 DOM 更新后再触发
        requestAnimationFrame(() => {
            boardBuffs.forEach(({ boardIndex, atkBuff, hpBuff }) => {
                const cardSlot = document.querySelector(`#my-board .card-slot[data-slot-index="${boardIndex}"]`);
                const cardEl = cardSlot?.querySelector('.card');
                if (cardEl) {
                    playBuffOnCard(cardEl, atkBuff || 0, hpBuff || 0);
                }
            });
        });
    }

    // ========== 刷新动作（不变，仅保留动画调用） ==========
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

        if (window.YYCardShop?.isBusy) return;
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
                if (!result.success) { _toast?.(result.error || '刷新失败', true); return; }
                if (result.data.updatedPlayer) {
                    _mergeUpdatedPlayer?.(my, result.data.updatedPlayer);
                    _updateUIAfterSuccess?.(result.data.updatedPlayer);
                    _emit('refresh');
                    triggerBuffAnimations(result.data.boardBuffs);
                }
            } catch (err) {
                if (mySeq === refreshSeq) _toast?.('网络异常', true);
            } finally {
                if (mySeq === refreshSeq) { isRefreshingShop = false; _updateBuyExpButtonState?.(); }
            }
            updateRefreshButtonDisplay();
            return;
        }

        // 乐观本地翻页
        if (freeRefresh > 0) my.freeRefresh = freeRefresh - 1;
        else my.gold -= 1;
        document.getElementById('my-gold').textContent = my.gold;
        performLocalFlip();
        updateRefreshButtonDisplay();
        _emit('refresh');

        const mySeq = ++refreshSeq;
        invokeFunction('refresh-shop', { roomId, userId })
            .then(result => {
                if (isSwitchingGroup) {
                    if (result.success && result.data.updatedPlayer) {
                        const up = result.data.updatedPlayer;
                        if (up.shopCards) {
                            my.shopCards.active = up.shopCards.active;
                            my.shopCards.subIndex = up.shopCards.subIndex;
                            const inactiveIdx = 1 - (up.shopCards.active ?? 0);
                            if (up.shopCards.buffer?.[inactiveIdx]) {
                                my.shopCards.buffer[inactiveIdx] = up.shopCards.buffer[inactiveIdx];
                            }
                        }
                        if (up.gold !== undefined) { my.gold = up.gold; document.getElementById('my-gold').textContent = up.gold; }
                        if (up.freeRefresh !== undefined) my.freeRefresh = up.freeRefresh;
                        if (up.exp !== undefined) my.exp = up.exp;
                        if (up.shopLevel !== undefined) my.shopLevel = up.shopLevel;
                        if (up.health !== undefined) my.health = up.health;

                        if (!window.YYCardShop?.isDragging) {
                            if (up.hand) { my.hand = up.hand; _renderHand?.(); }
                            if (up.board) { my.board = up.board; _renderMyBoard?.(); }
                        }
                        _renderShop?.();
                        if (window.mergeService) {
                            window.mergeService.updateMergeGlow();
                            window.mergeService.envokeMerge();
                        }
                        updateRefreshButtonDisplay();
                        triggerBuffAnimations(result.data.boardBuffs);
                    } else if (!result.success) { _toast?.(result.error || '刷新失败', true); }
                } else {
                    if (mySeq !== refreshSeq) return;
                    if (result.success && result.data.updatedPlayer) {
                        const up = result.data.updatedPlayer;
                        if (up.gold !== undefined) { my.gold = up.gold; document.getElementById('my-gold').textContent = up.gold; }
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
                        triggerBuffAnimations(result.data.boardBuffs);
                    } else if (!result.success) { _toast?.(result.error || '刷新失败', true); }
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
            _emit('exp');
        }
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

    function init(deps) {
        setDeps(deps);
        injectBuffAnimationStyles();
        bindEvents();
        console.log('✅ refresh.js 已启动（含棋盘 buff 动画）');
    }

    return {
        init,
        refreshShopAction,
        buyExpAction,
        updateRefreshButtonDisplay,
        on: (event, fn) => {
            if (!_listeners[event]) _listeners[event] = [];
            _listeners[event].push(fn);
        },
        get isRefreshing() { return isRefreshingShop; },
    };
})();

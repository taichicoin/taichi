// ==================== 刷新 & 升级动作模块 (refresh.js) ====================
window.YYCardShopRefresh = (function() {
    const config = window.YYCardConfig;

    // 请求序号（用于丢弃过期回调）
    let refreshSeq = 0;
    let isRefreshingShop = false;
    let isBusy = false;
    let lastRefreshTime = 0;
    let refreshLockTimer = null;

    // 依赖注入（由 shop.js 在 init 时提供）
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

    // ★ 刷新按钮文字（0金币 / 1金币）
    function updateRefreshButtonDisplay() {
        const btn = document.getElementById('refresh-shop-btn');
        if (!btn) return;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players?.[userId];
        if (!my) return;
        const free = my.freeRefresh || 0;
        if (free > 0) {
            btn.textContent = '🔄 刷新 (0💰)';
        } else {
            btn.textContent = '🔄 刷新 (1💰)';
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

        // 金币不足检查（没有免费次数且金币不够）
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
            // 无法本地翻页（极少情况），加锁等后端
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
            my.freeRefresh = freeRefresh - 1;          // 消耗免费次数
            // 不扣金币
        } else {
            my.gold -= 1;                               // 扣金币
        }
        document.getElementById('my-gold').textContent = my.gold;
        performLocalFlip();
        updateRefreshButtonDisplay();                   // 立刻更新按钮文字

        const mySeq = ++refreshSeq;
        invokeFunction('refresh-shop', { roomId, userId })
            .then(result => {
                if (isSwitchingGroup) {
                    // 切组时强制更新非活跃组
                    if (result.success && result.data.updatedPlayer) {
                        const up = result.data.updatedPlayer;
                        const localActive = my.shopCards.active ?? 0;
                        const inactiveIdx = 1 - localActive;
                        if (up.shopCards?.buffer?.[inactiveIdx]) {
                            my.shopCards.buffer[inactiveIdx] = up.shopCards.buffer[inactiveIdx];
                        }
                        // 同步金币、免费次数等
                        if (up.gold !== undefined) {
                            my.gold = up.gold;
                            document.getElementById('my-gold').textContent = up.gold;
                        }
                        if (up.freeRefresh !== undefined) {
                            my.freeRefresh = up.freeRefresh;
                        }
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
                    // 普通翻页：只同步金币/免费次数/经验等，不更新buffer
                    if (mySeq !== refreshSeq) return;
                    if (result.success && result.data.updatedPlayer) {
                        const up = result.data.updatedPlayer;
                        if (up.gold !== undefined) {
                            my.gold = up.gold;
                            document.getElementById('my-gold').textContent = up.gold;
                        }
                        if (up.freeRefresh !== undefined) {
                            my.freeRefresh = up.freeRefresh;
                        }
                        if (up.exp !== undefined) my.exp = up.exp;
                        if (up.shopLevel !== undefined) my.shopLevel = up.shopLevel;
                        if (up.health !== undefined) my.health = up.health;
                        // 不更新 shopCards buffer
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
    }

    // ========== 按钮绑定 ==========
    function bindEvents() {
        // 刷新按钮
        const refreshBtn = document.getElementById('refresh-shop-btn');
        if (refreshBtn) {
            const newBtn = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(newBtn, refreshBtn);
            newBtn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                refreshShopAction();
            });
        }
        // 升级按钮
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

    // 初始化入口（由 shop.js 调用）
    function init(deps) {
        setDeps(deps);
        bindEvents();
        console.log('✅ refresh.js 已启动（免费刷新显示 & 动作拆分）');
    }

    return {
        init,
        refreshShopAction,
        buyExpAction,
        updateRefreshButtonDisplay,
        get isRefreshing() { return isRefreshingShop; },
    };
})();

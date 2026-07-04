// ==================== 刷新模块 (refresh.js · 无锁序号版) ====================
window.YYCardShopRefresh = (function() {
    const config = window.YYCardConfig;

    let refreshSeq = 0;
    let currentShopPage = 0;
    const PAGE_STORAGE_KEY = 'yycard_shop_page';

    function restorePage() {
        try {
            const saved = sessionStorage.getItem(PAGE_STORAGE_KEY);
            if (saved !== null) {
                const page = parseInt(saved);
                if (!isNaN(page) && page >= 0 && page <= 19) return page;
            }
        } catch (e) {}
        return null;
    }

    function savePage(page) {
        try { sessionStorage.setItem(PAGE_STORAGE_KEY, page); } catch (e) {}
    }

    const _listeners = {};
    function _emit(event, detail) {
        if (_listeners[event]) _listeners[event].forEach(fn => { try { fn(detail); } catch (e) {} });
    }

    // 依赖注入
    let _canOperate, _mergeUpdatedPlayer, _updateUIAfterSuccess;
    let _renderShop, _renderHand, _renderMyBoard, _updateBuyExpButtonState;
    let _getGameState, _getCurrentUserId, _getCurrentRoomId;
    let _toast;

    function setDeps(deps) {
        _canOperate = deps.canOperate;
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

    function getGameState() { return _getGameState?.(); }
    function getCurrentUserId() { return _getCurrentUserId?.(); }
    function getCurrentRoomId() { return _getCurrentRoomId?.(); }
    function canOperate() { return _canOperate?.() ?? false; }

    async function invokeFunction(functionName, body, timeout = 10000) {
        const supabase = window.supabase;
        if (!supabase) return { success: false, error: 'Supabase未初始化' };
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeout);
        try {
            const { data, error } = await supabase.functions.invoke(functionName, {
                body,
                headers: { Authorization: '' },
                signal: controller.signal
            });
            clearTimeout(tid);
            if (error) throw new Error(error.message);
            if (data && !data.success) throw new Error(data.error || '操作失败');
            return { success: true, data };
        } catch (err) {
            clearTimeout(tid);
            console.error(`[${functionName}] 调用异常:`, err);
            return { success: false, error: err.message };
        }
    }

    function updateRefreshButtonDisplay() {
        const btn = document.getElementById('refresh-shop-btn');
        if (!btn) return;
        const my = getGameState()?.players?.[getCurrentUserId()];
        if (!my) return;
        const free = my.freeRefresh || 0;
        btn.textContent = free > 0 ? ' 刷新 0💰' : ' 刷新 1💰';
    }

    // ---- 动画系统（保留） ----
    function injectBuffAnimationStyles() {
        if (document.getElementById('buff-float-keyframes')) return;
        const style = document.createElement('style');
        style.id = 'buff-float-keyframes';
        style.textContent = `
            @keyframes buffFloat {
                0%   { opacity: 1; transform: translateY(0) scale(1); }
                100% { opacity: 0; transform: translateY(-60px) scale(1.1); }
            }
        `;
        document.head.appendChild(style);
    }

    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function applySingleBuff(cardElement, newAtk, newHp, atkBuff, hpBuff) {
        // ... 与之前完全一致 ...
    }

    function createFloatText(container, text) {
        // ... 与之前完全一致 ...
    }

    const animQueue = [];
    let isAnimating = false;

    async function playAllBuffAnimations(boardBuffs) {
        // ... 与之前完全一致 ...
    }

    async function processCardBuffQueue(boardIndex, buffs) {
        // ... 与之前完全一致 ...
    }

    async function runAnimQueue() {
        // ... 与之前完全一致 ...
    }

    function enqueueAnim(boardBuffs) {
        if (!boardBuffs || boardBuffs.length === 0) return;
        animQueue.push(boardBuffs);
        if (!isAnimating) runAnimQueue();
    }

    // ---- 刷新动作 ----
    async function refreshShopAction() {
        // ... 与之前完全一致（翻页、扣金币、请求 refresh-shop）...
    }

    // ---- 按钮绑定（仅刷新按钮） ----
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
        updateRefreshButtonDisplay();
    }

    // 对外暴露重置页码（供升级后调用）
    function resetPage() {
        currentShopPage = 0;
        savePage(0);
    }

    function init(deps) {
        setDeps(deps);
        const savedPage = restorePage();
        if (savedPage !== null) {
            currentShopPage = savedPage;
        } else {
            const gs = getGameState();
            const uid = getCurrentUserId();
            const my = gs?.players?.[uid];
            if (my?.shopCards) {
                const active = my.shopCards.active ?? 0;
                const sub = my.shopCards.subIndex ?? 0;
                currentShopPage = active * 10 + sub;
                savePage(currentShopPage);
            }
        }
        injectBuffAnimationStyles();
        bindEvents();
        console.log('✅ refresh.js 已启动（仅刷新逻辑）');
    }

    return {
        init,
        refreshShopAction,
        resetPage,
        updateRefreshButtonDisplay,
        on: (event, fn) => {
            if (!_listeners[event]) _listeners[event] = [];
            _listeners[event].push(fn);
        },
        get isRefreshing() { return false; }
    };
})();

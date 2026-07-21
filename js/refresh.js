// ==================== 刷新模块 (refresh.js) ====================
// 只负责商店刷新翻页、按钮绑定、buff动画，完全独立于升级功能
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

    // 依赖注入（由 shop.js 提供）
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

    function getGameState() { return _getGameState ? _getGameState() : null; }
    function getCurrentUserId() { return _getCurrentUserId ? _getCurrentUserId() : null; }
    function getCurrentRoomId() { return _getCurrentRoomId ? _getCurrentRoomId() : null; }
    function canOperate() { return _canOperate ? _canOperate() : false; }

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

    // 刷新按钮文字更新
    function updateRefreshButtonDisplay() {
        const btn = document.getElementById('refresh-shop-btn');
        if (!btn) return;
        const my = getGameState()?.players?.[getCurrentUserId()];
        if (!my) return;
        const free = my.freeRefresh || 0;
        btn.textContent = free > 0 ? ' 刷新 0💰' : ' 刷新 1💰';
    }

    // ========== 动画系统 ==========
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
        if (!cardElement) return;
        const atkEl = cardElement.querySelector('.card-atk');
        const hpEl = cardElement.querySelector('.card-hp');
        const scaleUp = (el) => {
            if (!el) return;
            el.style.transition = 'transform 0.15s ease-out';
            el.style.transform = 'scale(1.25)';
        };
        if (atkBuff > 0 && atkEl) scaleUp(atkEl);
        if (hpBuff > 0 && hpEl) scaleUp(hpEl);
        await wait(150);
        if (atkEl) atkEl.textContent = newAtk;
        if (hpEl) hpEl.textContent = newHp;
        const scaleDown = (el) => {
            if (!el) return;
            el.style.transition = 'transform 0.2s ease-in';
            el.style.transform = 'scale(1.0)';
        };
        if (atkEl) scaleDown(atkEl);
        if (hpEl) scaleDown(hpEl);
        const floatContainer = document.createElement('div');
        floatContainer.className = 'buff-float-container';
        const rect = cardElement.getBoundingClientRect();
        floatContainer.style.cssText = `
            position: fixed; left: ${rect.left + rect.width / 2}px; top: ${rect.top + rect.height * 0.6}px;
            z-index: 10001; pointer-events: none; display: flex; flex-direction: row;
            align-items: center; justify-content: center; gap: 12px; transform: translateX(-50%);
        `;
        document.body.appendChild(floatContainer);
        if (atkBuff > 0) createFloatText(floatContainer, `+${atkBuff}`);
        if (hpBuff > 0) createFloatText(floatContainer, `+${hpBuff}`);
        await wait(1000);
        if (floatContainer.parentNode) floatContainer.remove();
        if (atkEl) { atkEl.style.transition = 'none'; atkEl.style.transform = 'scale(1.0)'; }
        if (hpEl) { hpEl.style.transition = 'none'; hpEl.style.transform = 'scale(1.0)'; }
    }

    function createFloatText(container, text) {
        const span = document.createElement('span');
        span.textContent = text;
        span.style.cssText = `
            color: #ffffff; font-weight: bold; font-size: 1.3em;
            text-shadow: 0 0 4px #000, 0 0 4px #000;
            animation: buffFloat 1.0s ease-out forwards; white-space: nowrap;
            font-family: inherit;
        `;
        container.appendChild(span);
    }

    const animQueue = [];
    let isAnimating = false;

    async function playAllBuffAnimations(boardBuffs) {
        if (!boardBuffs || boardBuffs.length === 0) return;
        const groups = {};
        boardBuffs.forEach(b => {
            const idx = b.boardIndex;
            if (!groups[idx]) groups[idx] = [];
            groups[idx].push(b);
        });
        await Promise.all(Object.entries(groups).map(([idx, buffs]) => processCardBuffQueue(parseInt(idx), buffs)));
    }

    async function processCardBuffQueue(boardIndex, buffs) {
        const cardSlot = document.querySelector(`#my-board .card-slot[data-slot-index="${boardIndex}"]`);
        const cardEl = cardSlot?.querySelector('.card');
        if (!cardEl || buffs.length === 0) return;
        const atkEl = cardEl.querySelector('.card-atk');
        const hpEl = cardEl.querySelector('.card-hp');
        if (!atkEl && !hpEl) return;
        let curAtk = parseInt(atkEl?.textContent) || 0;
        let curHp = parseInt(hpEl?.textContent) || 0;
        let totalAtk = 0, totalHp = 0;
        buffs.forEach(b => { totalAtk += b.atkBuff || 0; totalHp += b.hpBuff || 0; });
        const baseAtk = curAtk - totalAtk;
        const baseHp = curHp - totalHp;
        if (atkEl) atkEl.textContent = baseAtk;
        if (hpEl) hpEl.textContent = baseHp;
        curAtk = baseAtk;
        curHp = baseHp;
        for (const buff of buffs) {
            const nextAtk = curAtk + (buff.atkBuff || 0);
            const nextHp = curHp + (buff.hpBuff || 0);
            await applySingleBuff(cardEl, nextAtk, nextHp, buff.atkBuff || 0, buff.hpBuff || 0);
            curAtk = nextAtk;
            curHp = nextHp;
        }
    }

    async function runAnimQueue() {
        if (isAnimating) return;
        isAnimating = true;
        while (animQueue.length > 0) {
            const buffs = animQueue.shift();
            await playAllBuffAnimations(buffs);
        }
        isAnimating = false;
    }

    function enqueueAnim(boardBuffs) {
        if (!boardBuffs || boardBuffs.length === 0) return;
        animQueue.push(boardBuffs);
        if (!isAnimating) runAnimQueue();
    }

    // ========== 刷新动作（核心） ==========
    async function refreshShopAction() {
        const mySeq = ++refreshSeq;
        window.YYCardBattle?.updateLastOperationTime?.();

        try {
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

            // 乐观翻页
            currentShopPage = (currentShopPage + 1) % 20;
            const pageToSend = currentShopPage;
            savePage(currentShopPage);

            if (freeRefresh > 0) {
                my.freeRefresh = freeRefresh - 1;
            } else {
                my.gold -= 1;
            }
            document.getElementById('my-gold').textContent = my.gold;

            my.shopCards.active = Math.floor(pageToSend / 10);
            my.shopCards.subIndex = pageToSend % 10;
            _renderShop?.();
            updateRefreshButtonDisplay();
            _emit('refresh');

            const result = await invokeFunction('refresh-shop', { roomId, userId, page: pageToSend });

            if (mySeq !== refreshSeq) return;
            if (!result.success) {
                _toast?.(result.error || '刷新失败', true);
                return;
            }

            const up = result.data.updatedPlayer;
            if (up) {
                if (up.gold !== undefined) {
                    my.gold = up.gold;
                    document.getElementById('my-gold').textContent = up.gold;
                }
                if (up.freeRefresh !== undefined) my.freeRefresh = up.freeRefresh;
                if (up.exp !== undefined) my.exp = up.exp;
                if (up.shopLevel !== undefined) my.shopLevel = up.shopLevel;
                if (up.health !== undefined) my.health = up.health;
                if (up.hand) { my.hand = up.hand; _renderHand?.(); }
                if (up.board) { my.board = up.board; _renderMyBoard?.(); }
                if (up.shopCards) {
                    my.shopCards = up.shopCards;
                    _renderShop?.();
                }
                // ★★★ 新增：同步 shopBonus（修复刷新后商店加成丢失） ★★★
                if (up.shopBonus !== undefined) {
                    my.shopBonus = up.shopBonus;
                }
                if (result.data.page !== undefined) {
                    currentShopPage = result.data.page;
                    savePage(currentShopPage);
                }
            }
            enqueueAnim(result.data?.boardBuffs);
            _updateBuyExpButtonState?.();
        } catch (err) {
            console.error('刷新异常:', err);
        }
    }

    // ========== 按钮绑定（仅刷新按钮） ==========
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

    // ========== 初始化 ==========
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

    // 供外部（levelup.js）升级后重置页码
    function resetPage() {
        currentShopPage = 0;
        savePage(0);
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

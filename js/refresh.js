// ==================== 刷新 & 升级动作模块 (refresh.js) ====================
window.YYCardShopRefresh = (function() {
    const config = window.YYCardConfig;

    let refreshSeq = 0;
    let isRefreshingShop = false;      // 只在安全翻页失败时上锁
    let lastRefreshTime = 0;

    const _listeners = {};
    function _emit(event, detail) {
        if (_listeners[event]) {
            _listeners[event].forEach(fn => { try { fn(detail); } catch (e) {} });
        }
    }

    // 依赖注入
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

    // ========== 动画系统（队列） ==========
    const animQueue = [];
    let isAnimating = false;

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

        // 飘字
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
            flex-direction: row;
            align-items: center;
            justify-content: center;
            gap: 12px;
            transform: translateX(-50%);
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
            color: #ffffff;
            font-weight: bold;
            font-size: 1.3em;
            text-shadow: 0 0 4px #000, 0 0 4px #000;
            animation: buffFloat 1.0s ease-out forwards;
            white-space: nowrap;
            font-family: inherit;
        `;
        container.appendChild(span);
    }

    async function processCardBuffQueue(boardIndex, buffs) {
        const cardSlot = document.querySelector(`#my-board .card-slot[data-slot-index="${boardIndex}"]`);
        const cardEl = cardSlot?.querySelector('.card');
        if (!cardEl || buffs.length === 0) return;

        const atkEl = cardEl.querySelector('.card-atk');
        const hpEl = cardEl.querySelector('.card-hp');
        if (!atkEl && !hpEl) return;

        let currentAtk = parseInt(atkEl?.textContent) || 0;
        let currentHp = parseInt(hpEl?.textContent) || 0;

        let totalAtk = 0, totalHp = 0;
        buffs.forEach(b => { totalAtk += b.atkBuff || 0; totalHp += b.hpBuff || 0; });
        const baseAtk = currentAtk - totalAtk;
        const baseHp = currentHp - totalHp;

        if (atkEl) atkEl.textContent = baseAtk;
        if (hpEl) hpEl.textContent = baseHp;

        let curAtk = baseAtk;
        let curHp = baseHp;
        for (const buff of buffs) {
            const nextAtk = curAtk + (buff.atkBuff || 0);
            const nextHp = curHp + (buff.hpBuff || 0);
            await applySingleBuff(cardEl, nextAtk, nextHp, buff.atkBuff || 0, buff.hpBuff || 0);
            curAtk = nextAtk;
            curHp = nextHp;
        }
    }

    async function playAllBuffAnimations(boardBuffs) {
        if (!boardBuffs || boardBuffs.length === 0) return;
        const groups = {};
        boardBuffs.forEach(buff => {
            const idx = buff.boardIndex;
            if (!groups[idx]) groups[idx] = [];
            groups[idx].push(buff);
        });
        const tasks = Object.entries(groups).map(([idx, buffs]) => {
            return processCardBuffQueue(parseInt(idx), buffs);
        });
        await Promise.all(tasks);
    }

    async function runAnimQueue() {
        if (isAnimating) return;
        isAnimating = true;
        while (animQueue.length > 0) {
            const buffs = animQueue.shift();
            try { await playAllBuffAnimations(buffs); } catch (e) { console.warn(e); }
        }
        isAnimating = false;
        finalizeBoard();
    }

    function enqueueBuffAnimations(boardBuffs) {
        if (!boardBuffs || boardBuffs.length === 0) return;
        animQueue.push(boardBuffs);
        if (!isAnimating) runAnimQueue();
    }

    function applyUpdateAndRerender(updatedPlayer) {
        if (!updatedPlayer) return;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players?.[userId];
        if (!my) return;

        _mergeUpdatedPlayer?.(my, updatedPlayer);

        if (updatedPlayer.gold !== undefined) {
            my.gold = updatedPlayer.gold;
            document.getElementById('my-gold').textContent = updatedPlayer.gold;
        }
        if (updatedPlayer.freeRefresh !== undefined) my.freeRefresh = updatedPlayer.freeRefresh;
        if (updatedPlayer.exp !== undefined) my.exp = updatedPlayer.exp;
        if (updatedPlayer.shopLevel !== undefined) my.shopLevel = updatedPlayer.shopLevel;
        if (updatedPlayer.health !== undefined) my.health = updatedPlayer.health;

        if (updatedPlayer.hand) {
            my.hand = updatedPlayer.hand;
            _renderHand?.();
        }
    }

    function finalizeBoard() {
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players?.[userId];
        if (!my) return;
        _renderMyBoard?.();
    }

    // ========== 刷新动作（彻底修复：切组也乐观，绝不锁按钮） ==========
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
        if (isRefreshingShop) return;   // 仅在安全翻页失败时才会锁，正常情况下不会

        const shop = my.shopCards;
        const currentSub = shop.subIndex ?? 0;
        const isSwitchingGroup = (currentSub === 4);

        // 检查是否可以安全翻页（目标组有数据）
        if (!isLocalFlipSafe()) {
            // 极少情况：目标组异常为空，必须等后端
            isRefreshingShop = true;
            const mySeq = ++refreshSeq;
            _updateBuyExpButtonState?.();
            try {
                const result = await invokeFunction('refresh-shop', { roomId, userId });
                if (mySeq !== refreshSeq) return;
                if (!result.success) { _toast?.(result.error || '刷新失败', true); return; }
                if (result.data.updatedPlayer) {
                    applyUpdateAndRerender(result.data.updatedPlayer);
                    _renderShop?.();
                    _emit('refresh');
                    enqueueBuffAnimations(result.data.boardBuffs);
                }
            } catch (err) {
                if (mySeq === refreshSeq) _toast?.('网络异常', true);
            } finally {
                if (mySeq === refreshSeq) isRefreshingShop = false;
                _updateBuyExpButtonState?.();
            }
            updateRefreshButtonDisplay();
            return;
        }

        // 乐观本地翻页（包括切组）
        if (freeRefresh > 0) {
            my.freeRefresh = freeRefresh - 1;
        } else {
            my.gold -= 1;
        }
        document.getElementById('my-gold').textContent = my.gold;
        performLocalFlip();          // 切组也会瞬间切换 active
        updateRefreshButtonDisplay();
        _emit('refresh');

        const mySeq = ++refreshSeq;
        invokeFunction('refresh-shop', { roomId, userId })
            .then(result => {
                if (mySeq !== refreshSeq) return;
                if (result.success && result.data.updatedPlayer) {
                    const up = result.data.updatedPlayer;
                    if (isSwitchingGroup) {
                        // 切组回调：更新非活跃组（后端已经补好），并校正 active/subIndex
                        if (up.shopCards) {
                            my.shopCards.active = up.shopCards.active;
                            my.shopCards.subIndex = up.shopCards.subIndex;
                            const inactiveIdx = 1 - (up.shopCards.active ?? 0);
                            if (up.shopCards.buffer?.[inactiveIdx]) {
                                my.shopCards.buffer[inactiveIdx] = up.shopCards.buffer[inactiveIdx];
                            }
                        }
                        _renderShop?.(); // 刷新商店显示新组
                    }
                    applyUpdateAndRerender(up);
                    if (window.mergeService) {
                        window.mergeService.updateMergeGlow();
                        window.mergeService.envokeMerge();
                    }
                    updateRefreshButtonDisplay();
                    enqueueBuffAnimations(result.data.boardBuffs);
                } else if (!result.success) {
                    _toast?.(result.error || '刷新失败', true);
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
        console.log('✅ refresh.js 已启动（切组乐观，绝不卡按钮）');
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

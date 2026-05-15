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

    // ========== 动画核心（排队、放大→改数值→飘字） ==========
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

    // 更新单个卡牌 DOM 上的攻击/生命数字
    function updateCardDomValue(cardEl, atk, hp) {
        if (!cardEl) return;
        const atkEl = cardEl.querySelector('.card-atk');
        const hpEl = cardEl.querySelector('.card-hp');
        if (atkEl) atkEl.textContent = atk;
        if (hpEl) hpEl.textContent = hp;
    }

    // 播放一次：放大 + 数字更新 + 飘字，返回 Promise 等飘字结束
    function playOneBuff(cardEl, newAtk, newHp, atkBuff, hpBuff) {
        return new Promise(resolve => {
            // 1. 放大（0.3 秒）
            cardEl.style.transition = 'transform 0.3s ease-out';
            cardEl.style.transform = 'scale(1.2)';
            // 2. 放大过程中更新数字（延迟 0.15 秒，数字在放大期间改变）
            setTimeout(() => {
                updateCardDomValue(cardEl, newAtk, newHp);
            }, 150);
            // 3. 缩回
            setTimeout(() => {
                cardEl.style.transition = 'transform 0.3s ease-in';
                cardEl.style.transform = 'scale(1.0)';
            }, 300);

            // 4. 飘字（独立，不阻塞排队，但我们要等它结束才 resolve）
            const floatContainer = document.createElement('div');
            floatContainer.className = 'buff-float-container';
            const rect = cardEl.getBoundingClientRect();
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

            // 飘字动画时长 1.0s，结束后清理容器
            setTimeout(() => {
                if (floatContainer.parentNode) floatContainer.remove();
                resolve();   // 通知下一个动画可以开始
            }, 1000);
        });
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

    // 排队处理 buffs（同一张牌多个 buff 依次播放）
    async function triggerBuffAnimations(boardBuffs) {
        if (!boardBuffs || boardBuffs.length === 0) return;

        // 收集每张牌的 buff 列表，保持顺序
        const cardBuffMap = new Map(); // key: boardIndex, value: array of buff objects
        boardBuffs.forEach(b => {
            const idx = b.boardIndex;
            if (!cardBuffMap.has(idx)) cardBuffMap.set(idx, []);
            cardBuffMap.get(idx).push(b);
        });

        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players?.[userId];
        if (!my) return;

        // 遍历每张牌，按顺序播放动画
        for (const [boardIndex, buffs] of cardBuffMap.entries()) {
            const cardSlot = document.querySelector(`#my-board .card-slot[data-slot-index="${boardIndex}"]`);
            const cardEl = cardSlot?.querySelector('.card');
            if (!cardEl) continue;

            // 获取当前卡牌数据（我们会在每次动画前更新 my.board，然后取最新值）
            let currentCard = my.board[boardIndex];
            if (!currentCard || !isValidCard(currentCard)) continue;

            for (const buff of buffs) {
                const atkBuff = buff.atkBuff || 0;
                const hpBuff = buff.hpBuff || 0;

                // 更新本地数据（累加）
                currentCard.atk = (currentCard.atk || 0) + atkBuff;
                currentCard.hp = (currentCard.hp || 0) + hpBuff;
                currentCard.baseAtk = (currentCard.baseAtk || 0) + atkBuff;
                currentCard.baseHp = (currentCard.baseHp || 0) + hpBuff;
                // 同步到 my.board
                my.board[boardIndex] = currentCard;

                // 播放当前 buff 的动画（内部会更新 DOM 数字）
                await playOneBuff(cardEl, currentCard.atk, currentCard.hp, atkBuff, hpBuff);
            }
        }

        // 所有动画结束后，重绘一次棋盘确保 UI 一致
        _renderMyBoard?.();
    }

    function isValidCard(card) {
        return card && typeof card === 'object' && (card.cardId || card.card_id);
    }

    // ★ 处理后端返回，但不立即渲染棋盘（留给动画逐步更新）
    function applyUpdateAndPrepareBuffs(updatedPlayer) {
        if (!updatedPlayer) return;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players?.[userId];
        if (!my) return;

        // 更新所有非 board 字段
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
        // board 数据先更新到本地，但不渲染
        if (updatedPlayer.board) {
            my.board = updatedPlayer.board;
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
                if (!result.success) {
                    _toast?.(result.error || '刷新失败', true);
                    return;
                }
                if (result.data.updatedPlayer) {
                    applyUpdateAndPrepareBuffs(result.data.updatedPlayer);
                    _emit('refresh');
                    // 等待动画全部完成
                    await triggerBuffAnimations(result.data.boardBuffs);
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
        _emit('refresh');

        const mySeq = ++refreshSeq;
        invokeFunction('refresh-shop', { roomId, userId })
            .then(async (result) => {
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
                        applyUpdateAndPrepareBuffs(up);
                        _renderShop?.();
                        if (window.mergeService) {
                            window.mergeService.updateMergeGlow();
                            window.mergeService.envokeMerge();
                        }
                        updateRefreshButtonDisplay();
                        await triggerBuffAnimations(result.data.boardBuffs);
                    } else if (!result.success) {
                        _toast?.(result.error || '刷新失败', true);
                    }
                } else {
                    if (mySeq !== refreshSeq) return;
                    if (result.success && result.data.updatedPlayer) {
                        const up = result.data.updatedPlayer;
                        applyUpdateAndPrepareBuffs(up);
                        if (window.mergeService) {
                            window.mergeService.updateMergeGlow();
                            window.mergeService.envokeMerge();
                        }
                        updateRefreshButtonDisplay();
                        await triggerBuffAnimations(result.data.boardBuffs);
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
        console.log('✅ refresh.js 已启动（排队动画：放大→改数值→飘字）');
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

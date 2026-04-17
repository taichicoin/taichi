// ==================== 商店与交互系统【绝对零失败最终版】====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let currentPhase = 'prepare';
    let toastTimer = null;

    // ============== 【绝对零失败核心】全局操作锁，全程锁死，杜绝并发 ==============
    let isGlobalLocked = false;
    // 帧渲染锁，避免重复渲染
    let isRendering = false;
    // 卡牌图片缓存，纯性能优化，不影响数据
    const cardImageCache = new Map();
    const defaultAvatar = new Image();
    defaultAvatar.src = '/assets/default-avatar.png';

    // 拖拽状态，只存视觉相关数据，绝不存游戏数据，避免和后端不同步
    let dragState = {
        active: false,
        sourceType: '',
        sourceIndex: -1,
        sourceElement: null,
        cloneElement: null,
        cardHalfWidth: 0,
        cardHalfHeight: 0,
        shopAreaRect: null,
        startX: 0,
        startY: 0
    };

    // ============== 工具函数，100%以后端数据为准 ==============
    // 永远拿后端最新的游戏状态，绝不做本地缓存
    function getLatestGameState() {
        const state = window.YYCardBattle?.getGameState();
        if (!state) console.error('❌ 无法获取后端游戏状态');
        return state;
    }

    function getCurrentUserId() {
        const userId = window.YYCardAuth?.currentUser?.id;
        if (!userId) console.error('❌ 无法获取当前用户ID');
        return userId;
    }

    function getCurrentUserData() {
        const state = getLatestGameState();
        const userId = getCurrentUserId();
        if (!state || !userId) return null;
        return state.players[userId];
    }

    // 卡牌图片预加载
    function preloadCardImage(card) {
        if (!card) return defaultAvatar;
        const imgPath = card.image || card.icon || `/assets/card/${card.cardId || card.id || 'default'}.png`;
        if (cardImageCache.has(imgPath)) return cardImageCache.get(imgPath);
        
        const img = new Image();
        img.src = imgPath;
        img.onerror = () => { img.src = defaultAvatar.src; };
        img.draggable = false;
        cardImageCache.set(imgPath, img);
        return img;
    }

    // ============== 调试&提示 ==============
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

    function log(msg, isError = false) {
        console[isError ? 'error' : 'log'](`[商店系统] ${msg}`);
        // 非阻塞写入调试面板
        requestAnimationFrame(() => {
            const p = document.getElementById('shop-debug-panel') || initDebugPanel();
            const line = document.createElement('div');
            line.style.color = isError ? '#ff7b7b' : '#7bffb1';
            line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            p.appendChild(line);
            p.scrollTop = p.scrollHeight;
            while (p.children.length > 30) p.removeChild(p.firstChild);
        });
    }

    function toast(message, isError = false, duration = 2500) {
        const oldToast = document.getElementById('shop-toast');
        if (oldToast) oldToast.remove();
        if (toastTimer) clearTimeout(toastTimer);
        const toastEl = document.createElement('div');
        toastEl.id = 'shop-toast';
        toastEl.style.cssText = `
            position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
            background:${isError ? 'rgba(200,50,50,0.95)' : 'rgba(30,40,60,0.95)'};
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

    // ============== 【零失败保障】渲染函数，只基于后端最新数据，绝不私自修改 ==============
    function createCardDOM(card, type, index) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity);
        d.setAttribute(`data-${type}-index`, index);
        d.setAttribute('data-card-type', type);
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        const img = preloadCardImage(card);

        d.innerHTML = `
            <div class="card-icon"></div>
            <div class="card-name">${card.name}</div>
            <div class="card-stats">
                <span class="card-atk">⚔️${card.atk}</span>
                <span class="card-hp">🛡️${card.hp}</span>
            </div>
            <div class="card-price">💰${price}</div>
            ${card.star > 0 ? '<div class="card-star">★</div>' : ''}
        `;
        d.querySelector('.card-icon').appendChild(img.cloneNode());
        // 绑定拖拽事件，索引100%精准绑定
        d.addEventListener('pointerdown', (e) => onDragStart(e, type, index, d));
        return d;
    }

    // 渲染棋盘
    function renderMyBoard() {
        const userData = getCurrentUserData();
        const container = document.getElementById('my-board');
        if (!userData || !container) return;

        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < 6; i++) {
            const card = userData.board[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.setAttribute('data-slot-index', i);
            
            if (card) {
                slot.appendChild(createCardDOM(card, 'board', i));
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
            }
            fragment.appendChild(slot);
        }
        container.appendChild(fragment);
    }

    // 渲染敌方棋盘
    function renderEnemyBoard() {
        const isBattleView = document.body.classList.contains('battle-view-mode');
        const state = getLatestGameState();
        const userId = getCurrentUserId();
        if (!isBattleView || !state || state.phase !== 'battle' || !userId) return;

        let oppId = null;
        // 优先找战斗配对的对手
        if (state.battlePairs) {
            for (const [p1, p2] of state.battlePairs) {
                if (p1 === userId && p2) { oppId = p2; break; }
                if (p2 === userId && p1) { oppId = p1; break; }
            }
        }
        // 回退逻辑
        if (!oppId) {
            const alivePlayers = Object.entries(state.players).filter(([id, p]) => 
                id !== userId && p.health > 0 && !p.isEliminated
            );
            if (alivePlayers.length > 0) oppId = alivePlayers[0][0];
            else oppId = Object.keys(state.players).find(id => id !== userId);
        }

        if (oppId && state.players[oppId]) {
            const originalBoard = state.players[oppId].board;
            // 敌方棋盘上下颠倒显示
            const enemyDisplayBoard = [
                originalBoard[3], originalBoard[4], originalBoard[5],
                originalBoard[0], originalBoard[1], originalBoard[2]
            ];
            const container = document.getElementById('enemy-board');
            if (!container) return;

            container.innerHTML = '';
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < 6; i++) {
                const card = enemyDisplayBoard[i];
                const slot = document.createElement('div');
                slot.className = 'card-slot';
                if (card) {
                    slot.appendChild(createCardDOM(card, 'enemy', i));
                } else {
                    slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
                }
                fragment.appendChild(slot);
            }
            container.appendChild(fragment);
        }
    }

    // 渲染手牌
    function renderHand() {
        const userData = getCurrentUserData();
        const container = document.getElementById('hand-container');
        if (!userData || !container) return;

        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        userData.hand.forEach((card, i) => {
            if (card) {
                fragment.appendChild(createCardDOM(card, 'hand', i));
            }
        });
        container.appendChild(fragment);

        // 更新手牌数量
        requestAnimationFrame(() => {
            const countEl = document.getElementById('hand-count');
            if (countEl) countEl.textContent = userData.hand.filter(c => c).length;
        });
    }

    // 渲染商店
    function renderShop() {
        const userData = getCurrentUserData();
        const container = document.getElementById('shop-container');
        if (!userData || !container) return;

        const shopCards = userData.shopCards || [];
        container.innerHTML = '';
        if (shopCards.length === 0) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">商店暂无卡牌</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        shopCards.forEach((card, i) => {
            if (card) {
                fragment.appendChild(createCardDOM(card, 'shop', i));
            }
        });
        container.appendChild(fragment);
    }

    // 渲染顶部数值
    function renderTopInfo() {
        const userData = getCurrentUserData();
        const state = getLatestGameState();
        if (!userData || !state) return;

        // 血量、金币、等级
        document.getElementById('my-health').textContent = userData.health;
        document.getElementById('my-gold').textContent = userData.gold;
        document.getElementById('shop-level').textContent = userData.shopLevel;
        // 顶部备用数值
        const healthTop = document.getElementById('my-health-top');
        if (healthTop) healthTop.textContent = userData.health;
        const roundNum = document.getElementById('round-num');
        if (roundNum) roundNum.textContent = state.round;
        const roundTop = document.getElementById('round-num-top');
        if (roundTop) roundTop.textContent = state.round;

        // 更新按钮状态
        updateButtonState();
    }

    // 全量刷新UI，只在回合切换/操作成功后调用
    function refreshAllUI() {
        if (isRendering) return;
        isRendering = true;

        requestAnimationFrame(() => {
            renderMyBoard();
            renderHand();
            renderShop();
            renderEnemyBoard();
            renderTopInfo();
            isRendering = false;
        });
    }

    // 更新按钮状态，同步全局锁
    function updateButtonState() {
        const userData = getCurrentUserData();
        const state = getLatestGameState();
        // 按钮禁用条件：全局锁、非准备阶段、机器人、已满级
        const isDisabled = isGlobalLocked || !state || state.phase !== 'prepare' || currentPhase === 'buffering' || userData?.isBot;
        const isMaxLevel = userData?.shopLevel >= (config.MAX_SHOP_LEVEL || 5);

        // 升级按钮
        ['buy-exp-btn', 'buy-exp-btn-bottom'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.textContent = isMaxLevel ? '📈 已满级' : '📈 升级';
            btn.disabled = isDisabled || isMaxLevel;
            btn.style.pointerEvents = (isDisabled || isMaxLevel) ? 'none' : 'auto';
            btn.style.opacity = (isDisabled || isMaxLevel) ? '0.6' : '1';
        });

        // 刷新按钮
        ['refresh-shop-btn', 'refresh-shop-btn-bottom'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.disabled = isDisabled;
            btn.style.pointerEvents = isDisabled ? 'none' : 'auto';
            btn.style.opacity = isDisabled ? '0.6' : '1';
        });
    }

    // ============== 【零失败保障】拖拽核心逻辑 ==============
    // 拖拽开始
    function onDragStart(e, type, index, element) {
        // 全局锁开启时，禁止任何拖拽
        if (isGlobalLocked) {
            toast('操作进行中，请稍候', true);
            return;
        }
        // 校验阶段合法性
        const state = getLatestGameState();
        if (!state || state.phase !== 'prepare' || currentPhase === 'buffering') {
            toast('当前阶段无法操作', true);
            return;
        }
        // 校验卡牌合法性
        const userData = getCurrentUserData();
        let sourceCard = null;
        if (type === 'hand') sourceCard = userData?.hand[index];
        if (type === 'board') sourceCard = userData?.board[index];
        if (type === 'shop') sourceCard = userData?.shopCards[index];
        if (!sourceCard) {
            log(`❌ 拖拽失败：${type}${index} 卡牌不存在`, true);
            return;
        }

        // 阻止默认行为，锁定指针
        e.preventDefault();
        e.stopPropagation();
        element.setPointerCapture(e.pointerId);

        // 一次性获取所有视觉参数，拖拽中不再查询DOM
        const clientX = e.clientX;
        const clientY = e.clientY;
        const cardRect = element.getBoundingClientRect();
        const cardWidth = cardRect.width;
        const cardHeight = cardRect.height;
        const shopArea = document.querySelector('.shop-area');
        const shopAreaRect = shopArea ? shopArea.getBoundingClientRect() : null;

        // 创建拖拽克隆体，GPU加速，仅用于视觉跟随
        const clone = element.cloneNode(true);
        clone.classList.add('card-drag-clone');
        clone.style.cssText = `
            position: fixed;
            z-index: 99999;
            left: 0;
            top: 0;
            width: ${cardWidth}px;
            height: ${cardHeight}px;
            opacity: 0.85;
            transform: translate3d(${clientX - cardWidth/2}px, ${clientY - cardHeight/2}px, 0);
            transform-origin: center center;
            box-shadow: 0 8px 20px rgba(0,0,0,0.5);
            pointer-events: none;
            transition: none;
            will-change: transform;
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
        `;
        document.body.appendChild(clone);

        // 原卡片半透明
        element.style.opacity = '0.3';

        // 填充拖拽状态，只存视觉数据
        dragState = {
            active: true,
            sourceType: type,
            sourceIndex: index,
            sourceElement: element,
            cloneElement: clone,
            cardHalfWidth: cardWidth / 2,
            cardHalfHeight: cardHeight / 2,
            shopAreaRect,
            startX: clientX,
            startY: clientY
        };

        // 绑定拖拽事件，passive=true解决手机端触摸延迟
        document.addEventListener('pointermove', onDragMove, { passive: true });
        document.addEventListener('pointerup', onDragEnd);
        document.addEventListener('pointercancel', onDragEnd);

        log(`✅ 开始拖拽：${type}${index} ${sourceCard.name}`);
    }

    // 拖拽移动，仅做视觉跟随，绝不碰游戏数据
    function onDragMove(e) {
        if (!dragState.active) return;

        const clientX = e.clientX;
        const clientY = e.clientY;
        // GPU加速更新位置，零重排，丝滑跟手
        dragState.cloneElement.style.transform = `translate3d(${clientX - dragState.cardHalfWidth}px, ${clientY - dragState.cardHalfHeight}px, 0)`;

        // 商店出售高亮
        if ((dragState.sourceType === 'hand' || dragState.sourceType === 'board') && dragState.shopAreaRect) {
            const isOverShop = clientX >= dragState.shopAreaRect.left && clientX <= dragState.shopAreaRect.right &&
                               clientY >= dragState.shopAreaRect.top && clientY <= dragState.shopAreaRect.bottom;
            document.querySelector('.shop-area')?.classList.toggle('drop-target', isOverShop);
        }
    }

    // 拖拽结束，【零失败核心】先校验→发请求→等后端成功→再刷新UI
    function onDragEnd(e) {
        if (!dragState.active) return;

        // 1. 立刻清理拖拽视觉元素
        const { sourceType, sourceIndex, sourceElement, cloneElement, startX, startY } = dragState;
        cloneElement.remove();
        sourceElement.style.opacity = '';
        document.querySelector('.shop-area')?.classList.remove('drop-target');
        sourceElement.releasePointerCapture?.(e.pointerId);

        // 2. 解绑事件
        document.removeEventListener('pointermove', onDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);

        // 3. 重置拖拽状态
        const endX = e.clientX;
        const endY = e.clientY;
        const dragStateTemp = { ...dragState };
        dragState = { active: false };

        // 4. 防误触：移动距离小于5px，视为点击，不执行操作
        const moveDistance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        if (moveDistance < 5) {
            log('ℹ️ 拖拽距离过短，取消操作');
            return;
        }

        // 5. 落点检测
        const targetElement = document.elementFromPoint(endX, endY);
        const dropTarget = getDropTarget(targetElement);
        if (!dropTarget) {
            log('ℹ️ 无效落点，取消操作');
            return;
        }

        // 6. 【核心】开启全局锁，禁止任何操作，直到当前请求完成
        isGlobalLocked = true;
        updateButtonState();
        log(`🔒 全局锁已开启，执行操作：${sourceType}${sourceIndex} → ${dropTarget.zone}${dropTarget.index || ''}`);

        // 7. 执行业务操作
        executeOperation(dragStateTemp, dropTarget)
            .catch(err => {
                log(`❌ 操作异常：${err.message}`, true);
                toast('操作异常，请重试', true);
            })
            .finally(() => {
                // 无论成功失败，最终都解锁
                isGlobalLocked = false;
                updateButtonState();
                log(`🔓 全局锁已释放`);
            });
    }

    // 落点检测
    function getDropTarget(element) {
        let el = element;
        // 最多遍历10层，提前终止无效循环
        for (let i = 0; i < 10 && el && el !== document.body; i++) {
            // 棋盘格子
            if (el.classList.contains('card-slot')) {
                const boardId = el.closest('.board')?.id;
                const slotIndex = el.getAttribute('data-slot-index');
                if (boardId === 'my-board' && slotIndex !== null) {
                    return { zone: 'board', index: parseInt(slotIndex) };
                }
            }
            // 手牌区
            if (el.id === 'hand-container') return { zone: 'hand' };
            // 商店区
            if (el.id === 'shop-container') return { zone: 'shop' };
            el = el.parentElement;
        }
        return null;
    }

    // ============== 【零失败核心】业务操作执行，100%先等后端成功再动UI ==============
    async function executeOperation(dragInfo, dropTarget) {
        const { sourceType, sourceIndex } = dragInfo;
        const { zone: targetZone, index: targetIndex } = dropTarget;
        const userData = getCurrentUserData();
        if (!userData) throw new Error('无法获取用户数据');

        // ==================== 1. 手牌操作 ====================
        if (sourceType === 'hand') {
            const sourceCard = userData.hand[sourceIndex];
            if (!sourceCard) throw new Error('手牌卡牌不存在');

            // 手牌 → 棋盘（放置）
            if (targetZone === 'board') {
                // 前置合法性校验，和后端规则完全对齐
                if (userData.board[targetIndex] !== null) {
                    toast('目标格子已有单位', true);
                    throw new Error('目标格子已有单位');
                }
                log(`📤 执行：手牌${sourceIndex} → 棋盘${targetIndex}`);
                // 等后端执行成功
                const success = await window.YYCardBattle.placeCardAction(sourceIndex, targetIndex);
                if (!success) {
                    toast('放置失败', true);
                    throw new Error('后端返回放置失败');
                }
                // 成功了才刷新UI
                refreshAllUI();
                toast('放置成功');
                log('✅ 放置成功');
                return;
            }

            // 手牌 → 商店（出售）
            if (targetZone === 'shop') {
                log(`💰 执行：出售手牌${sourceIndex}`);
                const success = await window.YYCardBattle.sellCardAction('hand', sourceIndex);
                if (!success) {
                    toast('出售失败', true);
                    throw new Error('后端返回出售失败');
                }
                refreshAllUI();
                toast('出售成功');
                log('✅ 出售成功');
                return;
            }
        }

        // ==================== 2. 棋盘操作 ====================
        if (sourceType === 'board') {
            const sourceCard = userData.board[sourceIndex];
            if (!sourceCard) throw new Error('棋盘卡牌不存在');

            // 棋盘 → 棋盘（互换）
            if (targetZone === 'board') {
                if (sourceIndex === targetIndex) throw new Error('相同位置，无需操作');
                log(`🔄 执行：棋盘${sourceIndex} ↔ 棋盘${targetIndex}`);
                const success = await window.YYCardBattle.swapBoardAction(sourceIndex, targetIndex);
                if (!success) {
                    toast('交换失败', true);
                    throw new Error('后端返回交换失败');
                }
                refreshAllUI();
                log('✅ 交换成功');
                return;
            }

            // 棋盘 → 手牌（收回）
            if (targetZone === 'hand') {
                const hasEmptyHand = userData.hand.some(c => c === null);
                if (!hasEmptyHand) {
                    toast('手牌已满', true);
                    throw new Error('手牌已满');
                }
                log(`📥 执行：棋盘${sourceIndex} → 手牌`);
                const success = await window.YYCardBattle.boardToHandAction(sourceIndex);
                if (!success) {
                    toast('收回手牌失败', true);
                    throw new Error('后端返回收回失败');
                }
                refreshAllUI();
                log('✅ 收回成功');
                return;
            }

            // 棋盘 → 商店（出售）
            if (targetZone === 'shop') {
                log(`💰 执行：出售棋盘${sourceIndex}`);
                const success = await window.YYCardBattle.sellCardAction('board', sourceIndex);
                if (!success) {
                    toast('出售失败', true);
                    throw new Error('后端返回出售失败');
                }
                refreshAllUI();
                toast('出售成功');
                log('✅ 出售成功');
                return;
            }
        }

        // ==================== 3. 商店操作 ====================
        if (sourceType === 'shop') {
            const sourceCard = userData.shopCards[sourceIndex];
            if (!sourceCard) throw new Error('商店卡牌不存在');
            const cardPrice = (config.ECONOMY?.CARD_PRICE?.[sourceCard.rarity]?.buy) || 1;

            // 商店 → 棋盘（购买并放置）
            if (targetZone === 'board') {
                if (userData.gold < cardPrice) {
                    toast('金币不足', true);
                    throw new Error('金币不足');
                }
                if (userData.board[targetIndex] !== null) {
                    toast('目标格子已有单位', true);
                    throw new Error('目标格子已有单位');
                }
                log(`🛒 执行：购买商店${sourceIndex} → 棋盘${targetIndex}`);
                const success = await window.YYCardBattle.buyAndPlaceAction(sourceCard, sourceIndex, targetIndex);
                if (!success) {
                    toast('购买放置失败', true);
                    throw new Error('后端返回购买失败');
                }
                refreshAllUI();
                log('✅ 购买放置成功');
                return;
            }

            // 商店 → 手牌（购买）
            if (targetZone === 'hand') {
                if (userData.gold < cardPrice) {
                    toast('金币不足', true);
                    throw new Error('金币不足');
                }
                const hasEmptyHand = userData.hand.some(c => c === null);
                if (!hasEmptyHand) {
                    toast('手牌已满', true);
                    throw new Error('手牌已满');
                }
                log(`🛒 执行：购买商店${sourceIndex} → 手牌`);
                const success = await window.YYCardBattle.buyCardAction(sourceCard, sourceIndex);
                if (!success) {
                    toast('购买失败', true);
                    throw new Error('后端返回购买失败');
                }
                refreshAllUI();
                log('✅ 购买成功');
                return;
            }
        }

        // 无匹配操作
        throw new Error(`不支持的操作：${sourceType} → ${targetZone}`);
    }

    // ============== 按钮操作 ==============
    // 刷新商店
    async function refreshShopAction() {
        if (isGlobalLocked) {
            toast('操作进行中，请稍候', true);
            return;
        }
        const userData = getCurrentUserData();
        const refreshCost = (config.ECONOMY?.REFRESH_SHOP_COST) || 1;
        if (!userData || userData.gold < refreshCost) {
            toast('刷新金币不足', true);
            return;
        }

        // 加锁
        isGlobalLocked = true;
        updateButtonState();
        const shopContainer = document.getElementById('shop-container');
        if (shopContainer) shopContainer.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">刷新中...</div>';

        try {
            log(`🔄 执行：刷新商店`);
            const success = await window.YYCardBattle.refreshShopAction();
            if (!success) throw new Error('后端返回刷新失败');
            refreshAllUI();
            log('✅ 商店刷新成功');
        } catch (err) {
            toast(err.message, true);
            log(`❌ 刷新失败：${err.message}`, true);
            renderShop();
        } finally {
            isGlobalLocked = false;
            updateButtonState();
        }
    }

    // 购买经验
    async function buyExpAction() {
        if (isGlobalLocked) {
            toast('操作进行中，请稍候', true);
            return;
        }
        isGlobalLocked = true;
        updateButtonState();

        try {
            log(`📈 执行：购买经验`);
            const success = await window.YYCardBattle.buyExpAction();
            if (!success) throw new Error('后端返回升级失败');
            refreshAllUI();
            log('✅ 购买经验成功');
        } catch (err) {
            toast(err.message, true);
            log(`❌ 升级失败：${err.message}`, true);
        } finally {
            isGlobalLocked = false;
            updateButtonState();
        }
    }

    // 计时器更新
    function updateTimerDisplay(seconds, phase) {
        const timerEl = document.getElementById('phase-timer');
        if (timerEl) {
            timerEl.textContent = phase === 'buffering' ? `⏳ ${seconds}` : `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
        }
        const battleTimerEl = document.getElementById('phase-timer-battle');
        if (battleTimerEl) {
            battleTimerEl.textContent = phase === 'battle' ? seconds : '00:00';
        }
    }

    // 阶段切换
    function setPhase(phase) {
        currentPhase = phase;
        document.body.classList.toggle('buffering-mode', phase === 'buffering');
        // 阶段切换全量刷新UI
        refreshAllUI();
    }

    // 事件绑定
    function bindEvents() {
        // 按钮事件
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }

    // CSS性能优化注入
    function injectStyles() {
        const styleId = 'yycard-zero-fail-style';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .card {
                touch-action: none;
                user-select: none;
                -webkit-user-select: none;
                -webkit-touch-callout: none;
                will-change: transform;
                transform: translateZ(0);
                backface-visibility: hidden;
                -webkit-backface-visibility: hidden;
            }
            .shop-cards, .hand, .board {
                contain: strict;
                will-change: contents;
                transform: translateZ(0);
            }
            .card-drag-clone {
                pointer-events: none !important;
                will-change: transform;
                z-index: 99999;
            }
            .shop-area.drop-target {
                box-shadow: 0 0 0 4px #ff4444 !important;
                transition: box-shadow 0.1s;
            }
            .buffering-mode .card,
            .buffering-mode .btn,
            .buffering-mode .shop-area,
            .buffering-mode .hand-area {
                pointer-events: none !important;
                opacity: 0.6;
            }
            html, body {
                overscroll-behavior: none;
                -webkit-overflow-scrolling: touch;
            }
        `;
        document.head.appendChild(style);
    }

    // 初始化
    function init() {
        injectStyles();
        initDebugPanel();
        bindEvents();
        refreshAllUI();
        log('✅ 商店系统初始化完成【绝对零失败最终版】');
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

console.log('✅ shop.js 加载完成【绝对零失败最终版】');

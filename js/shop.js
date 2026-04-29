// ==================== 商店与交互系统【终极修复版：根治接口解析失败+锁死+阶段错乱】 ====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    // ========== 全局状态管理 ==========
    let toastTimer = null;
    let cachedAccessToken = null;
    let tokenCacheTimer = null;
    const domCache = {};
    let isRefreshingShop = false; // 刷新商店防重锁

    // 拖拽状态管理
    let dragState = {
        active: false,
        type: null,
        card: null,
        index: -1,
        sourceElement: null,
        cloneElement: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0
    };

    // ========== 【修复1：统一操作权限判定，所有操作只走这一个判断，彻底解决乱拦截】 ==========
    function canOperate() {
        const gameState = getGameState();
        // 只有准备阶段、不在刷新中、不是机器人，才能操作
        return !!(
            gameState && 
            gameState.phase === 'prepare' && 
            !isRefreshingShop && 
            !gameState.players?.[getCurrentUserId()]?.isBot
        );
    }

    // 节流函数，优化拖拽性能
    function throttle(func, delay = 16) {
        let last = 0;
        return function(...args) {
            const now = Date.now();
            if (now - last >= delay) {
                last = now;
                func.apply(this, args);
            }
        };
    }

    // ========== 【修复2：核心根治！统一Supabase函数调用封装，彻底解决网页解析失败】 ==========
    // 函数名映射表：确保和你部署的Edge Function文件夹名完全一致（大小写敏感！！！）
    const FUNCTION_NAME_MAP = {
        REFRESH_SHOP: 'refresh-shop',
        BUY_CARD: 'buy-card',
        SWAP_BOARD: 'swap-board',
        SELL_CARD: 'sell-card',
        PLACE_CARD: 'place-card',
        BOARD_TO_HAND: 'board-to-hand',
        BUY_EXP: 'buy-exp'
    };

    /**
     * 统一调用Supabase Edge Function
     * @param {string} functionName 函数名（对应部署的文件夹名）
     * @param {object} body 请求参数
     * @param {object} options 配置项
     * @param {boolean} options.needAuth 是否需要鉴权（默认true，刷新商店设为false）
     * @param {number} options.timeout 超时时间（默认10秒）
     * @returns {Promise<{success: boolean, data?: any, error?: string}>}
     */
    async function invokeFunction(functionName, body = {}, options = {}) {
        const { needAuth = true, timeout = 10000 } = options;
        const supabaseClient = getSupabaseClient();

        try {
            // 基础校验
            if (!functionName) throw new Error('函数名不能为空');
            if (!supabaseClient) throw new Error('Supabase客户端未初始化');
            
            // 鉴权处理：需要鉴权的接口实时获取有效token
            const headers = {};
            if (needAuth) {
                const accessToken = await getValidAccessToken();
                if (!accessToken) throw new Error('未登录，无操作权限');
                headers.Authorization = `Bearer ${accessToken}`;
            } else {
                // 免鉴权接口清空Authorization头，避免和--no-verify-jwt冲突
                headers.Authorization = '';
            }

            // 超时控制
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            // 【核心】官方invoke方法，自动处理跨域、URL、响应解析，绝不会返回HTML错误页
            const { data, error } = await supabaseClient.functions.invoke(
                functionName,
                {
                    body,
                    headers,
                    signal: controller.signal
                }
            );

            clearTimeout(timeoutId);

            // 错误拦截
            if (error) {
                console.error(`函数[${functionName}]调用失败：`, error);
                // 精准错误提示
                if (error.message.includes('404')) throw new Error(`函数未部署，请检查${functionName}是否已部署到Supabase`);
                if (error.message.includes('401')) throw new Error('鉴权失败，请检查登录状态或函数JWT配置');
                if (error.message.includes('500')) throw new Error('服务器内部错误，请查看函数日志');
                throw new Error(error.message || '操作执行失败');
            }

            // 业务逻辑校验
            if (data && !data.success) {
                throw new Error(data.error || '操作执行失败');
            }

            return { success: true, data };
        } catch (err) {
            // 友好错误处理
            let errorMsg = '网络错误，操作失败';
            if (err.name === 'AbortError') errorMsg = '请求超时，请重试';
            else if (err.message) errorMsg = err.message;
            
            console.error(`函数[${functionName}]调用异常：`, err);
            return { success: false, error: errorMsg };
        }
    }

    // ========== 【修复3：获取有效AccessToken，解决缓存过期导致的鉴权失败】 ==========
    async function getValidAccessToken() {
        const supabaseClient = getSupabaseClient();
        if (!supabaseClient) return null;
        
        // 实时获取session，不用过期缓存
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.access_token) {
            cachedAccessToken = null;
            return null;
        }

        // 缓存token，5分钟后自动过期
        cachedAccessToken = session.access_token;
        clearTimeout(tokenCacheTimer);
        tokenCacheTimer = setTimeout(() => cachedAccessToken = null, 300000);
        
        return cachedAccessToken;
    }

    // 玩家数据合并工具
    function mergeUpdatedPlayer(target, updatedPlayer) {
        if (!updatedPlayer) return;
        const fields = ['gold', 'exp', 'shopLevel', 'health', 'shopCards', 'isBot', 'isEliminated', 'isReady', 'hand', 'board'];
        fields.forEach(key => {
            if (updatedPlayer[key] !== undefined) target[key] = updatedPlayer[key];
        });
    }

    // 操作成功后统一更新UI
    function updateUIAfterSuccess(updatedPlayer) {
        if (!updatedPlayer) return;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (!my) return;

        if (updatedPlayer.gold !== undefined) {
            const goldEl = document.getElementById('my-gold');
            if (goldEl) goldEl.textContent = updatedPlayer.gold;
        }
        if (updatedPlayer.exp !== undefined || updatedPlayer.shopLevel !== undefined) {
            updateBuyExpButtonState();
        }
        if (updatedPlayer.shopLevel !== undefined) {
            const levelEl = document.getElementById('shop-level');
            if (levelEl) levelEl.textContent = updatedPlayer.shopLevel;
        }
        if (updatedPlayer.health !== undefined) {
            const healthEl = document.getElementById('my-health');
            if (healthEl) healthEl.textContent = updatedPlayer.health;
            const healthTop = document.getElementById('my-health-top');
            if (healthTop) healthTop.textContent = updatedPlayer.health;
        }
        if (updatedPlayer.shopCards !== undefined || updatedPlayer.hand !== undefined || updatedPlayer.board !== undefined) {
            refreshAllUI();
        }
    }

    // 全局提示工具
    function toast(message, isError = false, duration = 2000) {
        const oldToast = document.getElementById('shop-toast');
        if (oldToast) oldToast.remove();
        if (toastTimer) clearTimeout(toastTimer);
        
        const toastEl = document.createElement('div');
        toastEl.id = 'shop-toast';
        toastEl.style.cssText = `
            position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
            background:${isError ? 'rgba(200,50,50,0.9)' : 'rgba(30,40,60,0.95)'};
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

    // ========== 基础工具函数 ==========
    function getCurrentUserId() {
        return window.YYCardAuth?.currentUser?.id || null;
    }

    function getGameState() {
        return window.YYCardBattle?.getGameState();
    }

    function getCurrentRoomId() {
        if (window.YYCardBattle?.getCurrentRoomId) {
            return window.YYCardBattle.getCurrentRoomId();
        }
        return window._currentRoomId || null;
    }

    function getSupabaseClient() {
        return window.supabase;
    }

    // ========== UI渲染逻辑（保留原有业务，无破坏性修改） ==========
    function renderMyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        renderBoard('my-board', my.board, true);
        const boardEl = document.getElementById('my-board');
        if (boardEl) boardEl.setAttribute('data-player-id', userId);
    }

    function renderEnemyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        let oppId = null;

        // 优先取对战配对的对手
        if (gameState.phase === 'battle' && gameState.battlePairs) {
            for (const [p1, p2] of gameState.battlePairs) {
                if (p1 === userId && p2) { oppId = p2; break; }
                if (p2 === userId && p1) { oppId = p1; break; }
            }
        }
        
        // 无配对时取活人玩家
        if (!oppId) {
            const aliveHumans = Object.entries(gameState.players).filter(([id, p]) => 
                id !== userId && !p.isBot && p.health > 0 && !p.isEliminated
            );
            if (aliveHumans.length > 0) oppId = aliveHumans[0][0];
        }
        
        // 兜底取任意存活玩家
        if (!oppId) {
            const aliveAny = Object.entries(gameState.players).find(([id, p]) => 
                id !== userId && p.health > 0 && !p.isEliminated
            );
            if (aliveAny) oppId = aliveAny[0];
        }
        
        // 最终兜底取第一个其他玩家
        if (!oppId) oppId = Object.keys(gameState.players).find(id => id !== userId);

        // 渲染对手棋盘（镜像翻转）
        if (oppId && gameState.players[oppId]) {
            const originalBoard = gameState.players[oppId].board;
            const enemyDisplayBoard = [
                originalBoard[3], originalBoard[4], originalBoard[5],
                originalBoard[0], originalBoard[1], originalBoard[2]
            ];
            renderBoard('enemy-board', enemyDisplayBoard, false);
            const boardEl = document.getElementById('enemy-board');
            if (boardEl) boardEl.setAttribute('data-player-id', oppId);
        }
    }

    function renderHand() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const container = domCache.handContainer || document.getElementById('hand-container');
        if (!container) return;
        
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        my.hand.forEach((card, i) => {
            if (card) {
                const el = createCardElement(card);
                el.setAttribute('data-hand-index', i);
                el.setAttribute('data-card-type', 'hand');
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'hand', card, i, el));
                fragment.appendChild(el);
            }
        });
        container.appendChild(fragment);
        
        // 更新手牌数量
        const countEl = document.getElementById('hand-count');
        if (countEl) countEl.textContent = my.hand.filter(c => c).length;
    }

    function renderShop() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const container = domCache.shopContainer || document.getElementById('shop-container');
        if (!container) return;
        
        container.innerHTML = '';
        const shopCards = my.shopCards || [];
        // 空商店提示
        if (shopCards.length === 0) {
            container.innerHTML = '<div style="color:#aaa;padding:10px;text-align:center;width:100%;">商店暂无卡牌</div>';
            return;
        }
        
        const fragment = document.createDocumentFragment();
        shopCards.forEach((card, i) => {
            if (card) {
                const el = createCardElement(card);
                el.setAttribute('data-shop-index', i);
                el.setAttribute('data-card-type', 'shop');
                el.addEventListener('pointerdown', (e) => onDragStart(e, 'shop', card, i, el));
                fragment.appendChild(el);
            }
        });
        container.appendChild(fragment);
    }

    // 全量刷新UI
    function refreshAllUI() {
        // 清理拖拽残留
        if (window.YYCardInspector?.cleanupAllRemnants) {
            window.YYCardInspector.cleanupAllRemnants();
        }

        // 重渲染所有区域
        renderMyBoard();
        renderEnemyBoard();
        renderHand();
        renderShop();

        // 更新顶部状态
        const gameState = getGameState();
        if (gameState) {
            const userId = getCurrentUserId();
            const my = gameState.players[userId];
            if (my) {
                (domCache.myHealth || document.getElementById('my-health')).textContent = my.health;
                (domCache.myGold || document.getElementById('my-gold')).textContent = my.gold;
                (domCache.shopLevel || document.getElementById('shop-level')).textContent = my.shopLevel;
                const healthTop = document.getElementById('my-health-top');
                if (healthTop) healthTop.textContent = my.health;
            }
            (domCache.roundNum || document.getElementById('round-num')).textContent = gameState.round;
            const roundTop = document.getElementById('round-num-top');
            if (roundTop) roundTop.textContent = gameState.round;
            updateBuyExpButtonState();
        }
    }

    // 更新升级按钮状态
    function updateBuyExpButtonState() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;

        const isMaxLevel = my.shopLevel >= (config.MAX_SHOP_LEVEL || 5);
        const canOp = canOperate();
        const shouldDisable = !canOp || isMaxLevel;

        // 计算升级所需经验
        let expNeeded = 0;
        if (!isMaxLevel) {
            const exp = my.exp;
            if (exp < 4) expNeeded = 4 - exp;
            else if (exp < 12) expNeeded = 12 - exp;
            else if (exp < 26) expNeeded = 26 - exp;
            else if (exp < 46) expNeeded = 46 - exp;
        }

        // 同步更新两个升级按钮
        ['buy-exp-btn', 'buy-exp-btn-bottom'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.textContent = isMaxLevel ? '📈 已满级' : `📈 升级 (${expNeeded}💰)`;
                btn.disabled = shouldDisable || (expNeeded > my.gold);
                btn.style.pointerEvents = shouldDisable ? 'none' : 'auto';
                btn.style.opacity = shouldDisable ? '0.6' : '1';
            }
        });
    }

    // 棋盘渲染通用方法
    function renderBoard(containerId, cards, isSelf) {
        const cont = domCache[containerId] || document.getElementById(containerId);
        if (!cont) return;
        cont.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        for (let i = 0; i < 6; i++) {
            const c = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.setAttribute('data-slot-index', i);
            
            // 处理对手棋盘的索引映射
            let dataIndex = isSelf ? i : (i < 3 ? i + 3 : i - 3);
            slot.setAttribute('data-board-index', dataIndex);
            
            // 渲染卡牌/空槽
            if (c) {
                const el = createCardElement(c);
                if (isSelf) {
                    el.setAttribute('data-board-index', i);
                    el.setAttribute('data-card-type', 'board');
                    el.addEventListener('pointerdown', (e) => onDragStart(e, 'board', c, i, el));
                } else {
                    el.setAttribute('data-board-index', dataIndex);
                }
                slot.appendChild(el);
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
            }
            fragment.appendChild(slot);
        }
        cont.appendChild(fragment);
    }

    // 卡牌元素创建
    function createCardElement(card) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity);
        const imgPath = card.image || card.icon || `/assets/card/${card.cardId || card.id || 'default'}.png`;
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        
        d.innerHTML = `
            <div class="card-icon">
                <img src="${imgPath}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'">
            </div>
            <div class="card-name">${card.name}</div>
            <div class="card-stats">
                <span class="card-atk">⚔️${card.atk}</span>
                <span class="card-hp">🛡️${card.hp}</span>
            </div>
            <div class="card-price">💰${price}</div>
            ${card.star > 0 ? '<div class="card-star">★</div>' : ''}
        `;
        d.querySelector('img').draggable = false;
        return d;
    }

    // ========== 【修复4：拖拽逻辑优化，加固权限判断+移动端兼容性】 ==========
    function onDragStart(e, type, card, index, element) {
        // 统一权限判断，杜绝非操作阶段的拖拽
        if (!canOperate()) {
            toast('当前阶段不能操作', true);
            return;
        }

        // 阻止默认行为，避免移动端页面滚动
        e.preventDefault();
        e.stopPropagation();
        element.setPointerCapture(e.pointerId);

        const clientX = e.clientX;
        const clientY = e.clientY;

        // 创建拖拽克隆体
        const clone = element.cloneNode(true);
        clone.classList.add('card-drag-clone');
        clone.style.cssText = `
            position: fixed;
            z-index: 99999;
            left: ${clientX - element.offsetWidth / 2}px;
            top: ${clientY - element.offsetHeight / 2}px;
            width: ${element.offsetWidth}px;
            height: ${element.offsetHeight}px;
            opacity: 0.85;
            transform: scale(1.05);
            box-shadow: 0 8px 20px rgba(0,0,0,0.5);
            pointer-events: none;
            transition: none;
            will-change: left, top;
        `;
        document.body.appendChild(clone);

        // 隐藏原卡牌，避免视觉重叠
        element.style.visibility = 'hidden';

        // 更新拖拽状态
        dragState = {
            active: true,
            type,
            card,
            index,
            sourceElement: element,
            cloneElement: clone,
            startX: clientX,
            startY: clientY,
            currentX: clientX,
            currentY: clientY
        };

        // 绑定拖拽事件
        document.addEventListener('pointermove', throttledDragMove);
        document.addEventListener('pointerup', onDragEnd);
        document.addEventListener('pointercancel', onDragEnd);
    }

    // 节流拖拽移动事件
    const throttledDragMove = throttle(function(e) {
        if (!dragState.active) return;
        e.preventDefault();

        const clientX = e.clientX;
        const clientY = e.clientY;

        // 更新拖拽坐标
        dragState.currentX = clientX;
        dragState.currentY = clientY;

        // 移动克隆体
        const clone = dragState.cloneElement;
        clone.style.left = (clientX - clone.offsetWidth / 2) + 'px';
        clone.style.top = (clientY - clone.offsetHeight / 2) + 'px';

        // 出售区域高亮
        if (dragState.type === 'hand' || dragState.type === 'board') {
            const shopContainer = domCache.shopContainer || document.getElementById('shop-container');
            if (shopContainer) {
                const shopArea = shopContainer.closest('.shop-area');
                if (shopArea) {
                    const rect = shopArea.getBoundingClientRect();
                    const isOverShop = clientX >= rect.left && clientX <= rect.right &&
                                       clientY >= rect.top && clientY <= rect.bottom;
                    shopArea.classList.toggle('drop-target', isOverShop);
                }
            }
        }
    }, 16);

    // 拖拽结束处理
    function onDragEnd(e) {
        if (!dragState.active) return;
        e.preventDefault();

        const { type, sourceElement, cloneElement, currentX, currentY } = dragState;

        // 清理克隆体和样式
        cloneElement.remove();
        sourceElement.style.visibility = '';
        
        // 移除出售区域高亮
        const shopArea = document.querySelector('.shop-area');
        if (shopArea) shopArea.classList.remove('drop-target');

        // 释放指针捕获
        sourceElement.releasePointerCapture?.(e.pointerId);

        // 解绑事件
        document.removeEventListener('pointermove', throttledDragMove);
        document.removeEventListener('pointerup', onDragEnd);
        document.removeEventListener('pointercancel', onDragEnd);

        // 获取落点
        const targetElement = document.elementFromPoint(currentX, currentY);
        if (!targetElement) {
            dragState.active = false;
            return;
        }

        // 解析落点区域
        const dropResult = getDropTarget(targetElement);
        if (dropResult) {
            executeDropAction(dragState.type, dragState.index, dragState.card, dropResult);
        }

        // 重置拖拽状态
        dragState.active = false;
    }

    // 解析落点目标区域
    function getDropTarget(element) {
        let el = element;
        while (el && el !== document.body) {
            // 棋盘落点
            if (el.classList.contains('card-slot')) {
                const boardContainer = el.closest('.board');
                const boardId = boardContainer?.id;
                const slotIndex = el.getAttribute('data-slot-index');
                if (boardId === 'my-board' && slotIndex !== null) {
                    return { zone: 'board', index: parseInt(slotIndex) };
                }
            }
            // 手牌落点
            if (el.id === 'hand-container' || el.closest('#hand-container')) {
                return { zone: 'hand' };
            }
            // 商店（出售）落点
            if (el.id === 'shop-container' || el.closest('#shop-container')) {
                return { zone: 'shop' };
            }
            el = el.parentElement;
        }
        return null;
    }

    // 执行拖拽落点动作
    async function executeDropAction(type, index, card, dropResult) {
        if (type === 'hand') {
            if (dropResult.zone === 'board') {
                await handleHandToBoard(index, dropResult.index);
            } else if (dropResult.zone === 'shop') {
                await handleSell('hand', index);
            }
        } else if (type === 'board') {
            if (dropResult.zone === 'board') {
                await handleBoardSwap(index, dropResult.index);
            } else if (dropResult.zone === 'hand') {
                await handleBoardToHand(index);
            } else if (dropResult.zone === 'shop') {
                await handleSell('board', index);
            }
        } else if (type === 'shop') {
            if (dropResult.zone === 'board') {
                await handleShopToBoard(card, index, dropResult.index);
            } else if (dropResult.zone === 'hand') {
                await handleShopToHand(card, index);
            }
        }
    }

    // ==================== 【修复5：业务操作全量改用统一invoke，彻底解决接口异常】 ====================
    // 手牌→棋盘放置
    async function handleHandToBoard(handIdx, boardIdx) {
        if (!canOperate()) {
            toast('当前阶段不能操作', true);
            return;
        }
        // 基础参数校验
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        // 本地预更新（乐观更新）
        const oldHand = [...my.hand];
        const oldBoard = [...my.board];
        const card = my.hand[handIdx];
        if (!card) { toast('卡牌不存在', true); return; }
        const oldTarget = my.board[boardIdx];

        my.board[boardIdx] = card;
        my.hand[handIdx] = oldTarget || null;
        refreshAllUI();

        // 调用后端接口
        const result = await invokeFunction(FUNCTION_NAME_MAP.PLACE_CARD, {
            roomId, userId, handIndex: handIdx, boardIndex: boardIdx
        });

        // 失败回滚
        if (!result.success) {
            my.hand = oldHand;
            my.board = oldBoard;
            refreshAllUI();
            toast(result.error, true);
            return;
        }

        // 成功更新
        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
        toast(result.data.exchanged ? '交换成功' : '放置成功');
    }

    // 商店→棋盘购买
    async function handleShopToBoard(card, shopIdx, boardIdx) {
        if (!canOperate()) {
            toast('当前阶段不能操作', true);
            return;
        }
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        // 金币校验
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        if (my.gold < price) { toast('金币不足', true); return; }

        // 本地预更新
        const oldGold = my.gold;
        const oldShopCards = [...my.shopCards];
        const oldHand = [...my.hand];
        const oldBoard = [...my.board];
        const targetCard = my.board[boardIdx];

        my.gold -= price;
        my.shopCards.splice(shopIdx, 1);
        const tempInstanceId = Date.now() + '-' + Math.random();
        my.board[boardIdx] = { ...card, instanceId: tempInstanceId };
        // 目标位置有卡牌则移到手牌
        if (targetCard) {
            const emptyHandIdx = my.hand.findIndex(c => c === null);
            if (emptyHandIdx !== -1) my.hand[emptyHandIdx] = targetCard;
        }
        refreshAllUI();

        // 调用接口
        const result = await invokeFunction(FUNCTION_NAME_MAP.BUY_CARD, {
            roomId, userId, shopIndex: shopIdx, targetBoardIndex: boardIdx
        });

        // 失败回滚
        if (!result.success) {
            my.gold = oldGold;
            my.shopCards = oldShopCards;
            my.hand = oldHand;
            my.board = oldBoard;
            refreshAllUI();
            toast(result.error, true);
            return;
        }

        // 成功更新
        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
        toast(result.data.exchanged ? '购买并交换成功' : '购买成功');
    }

    // 商店→手牌购买
    async function handleShopToHand(card, shopIdx) {
        if (!canOperate()) {
            toast('当前阶段不能操作', true);
            return;
        }
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        // 金币&手牌容量校验
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy) || 1;
        if (my.gold < price) { toast('金币不足', true); return; }
        const emptyIdx = my.hand.findIndex(c => c === null);
        if (emptyIdx === -1) { toast('手牌已满', true); return; }

        // 本地预更新
        const oldGold = my.gold;
        const oldShopCards = [...my.shopCards];
        const oldHand = [...my.hand];

        my.gold -= price;
        my.shopCards.splice(shopIdx, 1);
        const tempInstanceId = Date.now() + '-' + Math.random();
        my.hand[emptyIdx] = { ...card, instanceId: tempInstanceId };
        refreshAllUI();

        // 调用接口
        const result = await invokeFunction(FUNCTION_NAME_MAP.BUY_CARD, {
            roomId, userId, shopIndex: shopIdx
        });

        // 失败回滚
        if (!result.success) {
            my.gold = oldGold;
            my.shopCards = oldShopCards;
            my.hand = oldHand;
            refreshAllUI();
            toast(result.error, true);
            return;
        }

        // 成功更新
        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
        toast('购买成功');
    }

    // 棋盘内卡牌交换
    async function handleBoardSwap(idxA, idxB) {
        if (!canOperate() || idxA === idxB) return;
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        // 本地预更新
        const oldBoard = [...my.board];
        [my.board[idxA], my.board[idxB]] = [my.board[idxB], my.board[idxA]];
        refreshAllUI();

        // 调用接口
        const result = await invokeFunction(FUNCTION_NAME_MAP.SWAP_BOARD, {
            roomId, userId, indexA: idxA, indexB: idxB
        });

        // 失败回滚
        if (!result.success) {
            my.board = oldBoard;
            refreshAllUI();
            toast(result.error, true);
            return;
        }

        // 成功更新
        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
        toast('交换成功');
    }

    // 棋盘→手牌移回
    async function handleBoardToHand(boardIdx) {
        if (!canOperate()) {
            toast('当前阶段不能操作', true);
            return;
        }
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        // 卡牌&手牌容量校验
        const card = my.board[boardIdx];
        if (!card) { toast('该位置无卡牌', true); return; }
        const maxHand = config.HAND_MAX_COUNT || 15;
        const handCount = my.hand.filter(c => c !== null).length;
        if (handCount >= maxHand) { toast('手牌已满', true); return; }
        const emptyIdx = my.hand.findIndex(c => c === null);
        if (emptyIdx === -1) { toast('手牌已满', true); return; }

        // 本地预更新
        const oldBoard = [...my.board];
        const oldHand = [...my.hand];
        my.board[boardIdx] = null;
        my.hand[emptyIdx] = card;
        refreshAllUI();

        // 调用接口
        const result = await invokeFunction(FUNCTION_NAME_MAP.BOARD_TO_HAND, {
            roomId, userId, boardIndex: boardIdx
        });

        // 失败回滚
        if (!result.success) {
            my.board = oldBoard;
            my.hand = oldHand;
            refreshAllUI();
            toast(result.error, true);
            return;
        }

        // 成功更新
        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
        toast('已移回手牌');
    }

    // 出售卡牌（手牌/棋盘）
    async function handleSell(type, index) {
        if (!canOperate()) {
            toast('当前阶段不能操作', true);
            return;
        }
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        // 卡牌校验
        let card = null;
        if (type === 'hand') card = my.hand[index];
        else card = my.board[index];
        if (!card) { toast('卡牌不存在', true); return; }
        const price = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.sell) || 1;

        // 本地预更新
        const oldGold = my.gold;
        const oldHand = [...my.hand];
        const oldBoard = [...my.board];

        if (type === 'hand') my.hand[index] = null;
        else my.board[index] = null;
        my.gold += price;
        refreshAllUI();

        // 调用接口
        const result = await invokeFunction(FUNCTION_NAME_MAP.SELL_CARD, {
            roomId, userId, type, index
        });

        // 失败回滚
        if (!result.success) {
            my.gold = oldGold;
            my.hand = oldHand;
            my.board = oldBoard;
            refreshAllUI();
            toast(result.error, true);
            return;
        }

        // 成功更新
        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
        toast('出售成功');
    }

    // 购买经验升级
    async function buyExpAction() {
        if (!canOperate()) {
            toast('当前阶段不能操作', true);
            return;
        }
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) { toast('房间信息缺失', true); return; }

        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;

        // 等级&金币校验
        if (my.shopLevel >= (config.MAX_SHOP_LEVEL || 5)) { toast('已满级', true); return; }
        if (my.gold < 1) { toast('金币不足', true); return; }

        // 本地预更新
        const oldGold = my.gold;
        my.gold -= 1;
        refreshAllUI();

        // 调用接口
        const result = await invokeFunction(FUNCTION_NAME_MAP.BUY_EXP, {
            roomId, userId
        });

        // 失败回滚
        if (!result.success) {
            my.gold = oldGold;
            refreshAllUI();
            toast(result.error, true);
            return;
        }

        // 成功更新
        if (result.data.updatedPlayer) {
            mergeUpdatedPlayer(my, result.data.updatedPlayer);
            updateUIAfterSuccess(result.data.updatedPlayer);
        }
        toast('升级成功');
    }

    // ========== 【修复6：刷新商店逻辑优化，根治锁死+接口异常】 ==========
    async function refreshShopAction() {
        if (!canOperate()) {
            toast('只能在准备阶段刷新', true);
            return;
        }

        // 基础参数校验
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!roomId || !userId) {
            toast('房间信息缺失', true);
            return;
        }
        const gameState = getGameState();
        const my = gameState?.players[userId];
        if (!my) return;
        if (my.gold < 1) {
            toast('金币不足', true);
            return;
        }

        // 加锁+强制解锁兜底（12秒超时自动解锁，杜绝永久锁死）
        isRefreshingShop = true;
        updateBuyExpButtonState();
        const forceUnlockTimer = setTimeout(() => {
            isRefreshingShop = false;
            updateBuyExpButtonState();
        }, 12000);

        // 加载提示
        const shopContainer = domCache.shopContainer || document.getElementById('shop-container');
        let loadingHint = null;
        if (shopContainer && !shopContainer.querySelector('.refresh-loading-hint')) {
            loadingHint = document.createElement('div');
            loadingHint.className = 'refresh-loading-hint';
            loadingHint.textContent = '⟳ 刷新中...';
            loadingHint.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.75); color:#ffd966; border-radius:8px; padding:8px 16px; font-size:14px; z-index:100; pointer-events:none;';
            shopContainer.style.position = 'relative';
            shopContainer.appendChild(loadingHint);
        }

        // 【核心】调用免鉴权的刷新商店接口
        const result = await invokeFunction(
            FUNCTION_NAME_MAP.REFRESH_SHOP,
            { roomId, userId },
            { needAuth: false } // 关闭鉴权，和部署时的--no-verify-jwt匹配
        );

        // 清理资源
        clearTimeout(forceUnlockTimer);
        isRefreshingShop = false;
        updateBuyExpButtonState();
        if (loadingHint && loadingHint.parentNode) loadingHint.remove();

        // 失败处理
        if (!result.success) {
            toast(result.error, true);
            return;
        }

        // 成功更新玩家数据
        const latestGameState = getGameState();
        const latestMy = latestGameState?.players[userId];
        if (!latestMy) {
            toast('玩家状态异常', true);
            return;
        }

        // 合并更新数据
        let finalUpdatedData = {};
        if (result.data.updatedPlayer) {
            finalUpdatedData = result.data.updatedPlayer;
        } else {
            finalUpdatedData = {
                shopCards: result.data.shopCards || latestMy.shopCards,
                gold: result.data.gold !== undefined ? result.data.gold : latestMy.gold
            };
        }

        mergeUpdatedPlayer(latestMy, finalUpdatedData);
        updateUIAfterSuccess(finalUpdatedData);
        toast('刷新成功');
    }

    // 阶段倒计时显示
    function updateTimerDisplay(seconds, phase) {
        const timerEl = document.getElementById('phase-timer');
        if (timerEl) {
            if (phase === 'buffering') { timerEl.textContent = `⏳ ${seconds}`; return; }
            const m = Math.floor(seconds/60).toString().padStart(2,'0');
            const s = (seconds%60).toString().padStart(2,'0');
            timerEl.textContent = `${m}:${s}`;
        }
        const battleTimerEl = document.getElementById('phase-timer-battle');
        if (battleTimerEl) battleTimerEl.textContent = (phase === 'battle') ? seconds : '00:00';
    }

    // 阶段同步（和battle.js完全对齐，杜绝阶段错乱）
    function setPhase(phase) {
        // 同步缓冲模式样式
        if (phase === 'buffering') {
            document.body.classList.add('buffering-mode');
        } else {
            document.body.classList.remove('buffering-mode');
        }
        // 阶段变化时刷新按钮状态
        updateBuyExpButtonState();
    }

    // UI事件绑定
    function bindUIEvents() {
        document.getElementById('refresh-shop-btn')?.addEventListener('click', refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click', buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click', buyExpAction);
    }

    // 注入全局样式
    function injectStyles() {
        const styleId = 'yycard-manual-drag';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .card { touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; will-change: transform; }
            .card-drag-clone { pointer-events: none !important; will-change: left, top; transform: translateZ(0); }
            .shop-area.drop-target { box-shadow: 0 0 0 4px #ff4444 !important; transition: box-shadow 0.1s; }
            .buffering-mode .card, .buffering-mode .btn, .buffering-mode .shop-area, .buffering-mode .hand-area { pointer-events: none !important; opacity: 0.6; }
            .card-slot, .card { contain: layout style paint; }
        `;
        document.head.appendChild(style);
    }

    // DOM缓存，优化性能
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

    // 初始化入口
    function init() {
        injectStyles();
        cacheDoms();
        bindUIEvents();
        refreshAllUI();
        console.log('✅ shop.js 终极修复版初始化完成，接口异常问题已根治');
    }

    // 对外暴露方法
    return {
        init,
        refreshAllUI,
        updateTimerDisplay,
        setPhase,
        toast
    };
})();

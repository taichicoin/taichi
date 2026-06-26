// ==================== 渲染模块：负责 UI 绘制，恢复名字/攻防/价格/护盾 ====================
window.YYCardRender = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    let cardConfig = {};

    // ----- 工具函数（渲染专用） -----
    function isValidCard(card) {
        return card && typeof card === 'object' && (card.cardId || card.card_id);
    }
    function getValidHandCount(hand) {
        return hand.filter(isValidCard).length;
    }
    function getRarityColor(rarity) {
        switch (rarity) {
            case 'Common': return '#94a3b8';
            case 'Rare': return '#22c55e';
            case 'Epic': return '#8b5cf6';
            case 'Legendary': return '#f59e0b';
            default: return '#94a3b8';
        }
    }

    function isDragging() {
        return (window.YYCardDrag && window.YYCardDrag.isDragging) || window._consumableDragging;
    }

    function getGameState() {
        return window.YYCardBattle?.getGameState ? window.YYCardBattle.getGameState() : null;
    }
    function getCurrentUserId() {
        return window.YYCardAuth?.currentUser?.id || null;
    }
    function canOperate() {
        const gameState = getGameState();
        return !!(
            gameState &&
            gameState.phase === 'prepare' &&
            !gameState.players?.[getCurrentUserId()]?.isBot
        );
    }

    // ----- 卡牌配置加载 -----
    async function loadCardConfig() {
        try {
            const res = await fetch('/data/image.json');
            if (res.ok) {
                cardConfig = await res.json();
            } else {
                console.warn('无法加载卡牌展示配置: /data/image.json');
            }
        } catch (e) {
            console.warn('加载卡牌展示配置出错:', e);
        }
    }

    function getCardDisplay(card) {
        const id = card.card_id || card.cardId;
        const cfg = cardConfig[id] || {};
        return {
            name: cfg.name || card.name || id || '未知',
            image: cfg.image || card.image || `/assets/card/${id}.png`
        };
    }

    // ----- 卡牌元素创建（完整结构，图片 108%，含护盾） -----
    function createCardElement(card, cardType = 'board', isBoard = false) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity || 'Common');
        d.setAttribute('data-card-type', cardType);
        d.setAttribute('data-star', card.star || 0);

        // 容器样式：相对定位，允许护盾等溢出
        d.style.cssText = `
            position: relative;
            overflow: visible !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            border-radius: 0 !important;
            display: block;
        `;

        // ---------- 消耗牌特殊渲染 ----------
        if (card.type === 'consumable' || card.isConsumable) {
            d.style.background = getRarityColor(card.rarity);
            d.style.border = `2px solid ${getRarityColor(card.rarity)}`;
            d.style.display = 'flex';
            d.style.flexDirection = 'column';
            d.style.alignItems = 'center';
            d.style.justifyContent = 'center';
            d.style.padding = '1vh 2vw';
            const descEl = document.createElement('div');
            descEl.className = 'card-desc';
            descEl.textContent = card.name || '消耗牌';
            descEl.style.cssText = `
                color: white; font-weight: bold;
                font-size: clamp(0.6rem, 1.8vw, 0.8rem);
                text-align: center; line-height: 1.3;
                text-shadow: 0 0 4px rgba(0,0,0,0.8);
            `;
            d.appendChild(descEl);
            return d;
        }

        // ---------- 普通卡牌：放大图片 + 文字叠加层 ----------
        const display = getCardDisplay(card);
        const imgPath = display.image;

        // 1. 图片层（保持比例，放大至 108%，不裁切）
        const iconDiv = document.createElement('div');
        iconDiv.className = 'card-icon';
        iconDiv.style.cssText = `
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: center;
            overflow: visible;
            pointer-events: none;
        `;
        const img = document.createElement('img');
        img.src = imgPath;
        img.alt = display.name;
        img.onerror = () => img.src = '/assets/default-avatar.png';
        img.draggable = false;
        img.style.cssText = `
            width: 108%;
            height: 108%;
            object-fit: contain;
            display: block;
            border: none;
            position: relative;
            top: 0%;
            left: 0%;
        `;
        iconDiv.appendChild(img);
        d.appendChild(iconDiv);

        // 2. 名字层（商店显示，棋盘/手牌由 CSS 隐藏）
        const nameDiv = document.createElement('div');
        nameDiv.className = 'card-name';
        nameDiv.textContent = display.name;
        d.appendChild(nameDiv);

        // 3. 攻防数值层（棋盘/手牌显示）
        const statsDiv = document.createElement('div');
        statsDiv.className = 'card-stats';
        const atk = card.atk !== undefined ? card.atk : (card.base_atk || 0);
        const hp = card.hp !== undefined ? card.hp : (card.base_hp || 0);
        statsDiv.innerHTML = `<span class="card-atk">${atk}</span><span class="card-hp">${hp}</span>`;
        d.appendChild(statsDiv);

        // 4. 价格层（仅商店卡牌显示）
        const priceDiv = document.createElement('div');
        priceDiv.className = 'card-price';
        const buyPrice = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy);
        priceDiv.textContent = buyPrice ? `${buyPrice}💰` : '';
        d.appendChild(priceDiv);

        // ★ 5. 护盾显示（永久护盾 + 临时护盾）
        const totalShield = (card.shield || 0) + (card.tempShield || 0);
        if (totalShield > 0) {
            const shieldDiv = document.createElement('div');
            shieldDiv.className = 'card-shield';
            shieldDiv.innerHTML = `<span>${totalShield}</span>`;
            d.appendChild(shieldDiv);
        }

        return d;
    }

    // ========== 各区域渲染 ==========
    function renderMyBoard() {
        if (isDragging()) return;
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        renderBoard('my-board', my.board, true);
        document.getElementById('my-board').setAttribute('data-player-id', userId);
    }

    // ----- 终极修复版：强制使用物理索引，保证100%可拖动 -----
    function renderHand() {
        if (isDragging()) return;
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        
        const container = document.getElementById('hand-container');
        if (!container) return;
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();

        const total = getValidHandCount(my.hand);
        const CONTAINER_WIDTH_VW = 98;
        const CARD_WIDTH_VW = 23;
        const PADDING_LEFT_VW = 2;
        const PADDING_RIGHT_VW = 2;

        // 统一强制使用 Flex 布局，保持拖拽库正常工作
        container.style.display = 'flex';
        container.style.flexWrap = 'nowrap';
        container.style.alignItems = 'flex-end';
        container.style.paddingLeft = PADDING_LEFT_VW + 'vw';
        container.style.paddingRight = PADDING_RIGHT_VW + 'vw';

        // ========== 核心修改：使用 my.hand.forEach 循环，传递物理索引 i ==========
        // ========== 分支1：4张或4张以内，使用原有横向平铺排列 ==========
        if (total <= 4) {
            my.hand.forEach((card, i) => {
                if (isValidCard(card)) {
                    const el = createCardElement(card, 'hand');
                    el.setAttribute('data-hand-index', i); // 传递物理索引！
                    el.setAttribute('data-card-type', 'hand');
                    el.setAttribute('data-instance-id', card.instanceId || '');

                    el.style.width = CARD_WIDTH_VW + 'vw';
                    el.style.flex = '0 0 ' + CARD_WIDTH_VW + 'vw';
                    el.style.margin = '0';
                    el.style.transform = 'none';
                    el.style.zIndex = '';

                    // 计算标准平铺间距
                    let marginRightVW = 0;
                    const slotWidth = CONTAINER_WIDTH_VW / total;
                    marginRightVW = slotWidth - CARD_WIDTH_VW;
                    // 判断是否为最后一张有效牌（底层物理索引最后一张）
                    let isLastValidCard = true;
                    for (let j = i + 1; j < my.hand.length; j++) {
                        if (isValidCard(my.hand[j])) {
                            isLastValidCard = false;
                            break;
                        }
                    }
                    if (isLastValidCard) marginRightVW = 0;
                    el.style.marginRight = marginRightVW + 'vw';
                    fragment.appendChild(el);
                }
            });
            container.appendChild(fragment);
            document.getElementById('hand-count').textContent = total;
            return;
        }

        // ========== 分支2：5张及以上，使用负Margin实现重叠，Transform实现扇形 ==========
        const n = total;
        // 1. 计算每个牌的步进步伐
        const availableX = CONTAINER_WIDTH_VW - PADDING_LEFT_VW - PADDING_RIGHT_VW - CARD_WIDTH_VW;
        const stepX = availableX / (n - 1);

        // 2. 扇形圆环弧度参数
        const arcHeightVW = 4.2;       
        const maxRotateAngle = 12;     

        let visualIdx = 0; // 用于处理扇形位置的视觉索引
        my.hand.forEach((card, i) => {
            if (isValidCard(card)) {
                const el = createCardElement(card, 'hand');
                el.setAttribute('data-hand-index', i); // ★ 必须设置物理索引 i，防止点击无效！
                el.setAttribute('data-card-type', 'hand');
                el.setAttribute('data-instance-id', card.instanceId || '');

                // 强制固定牌宽
                el.style.width = CARD_WIDTH_VW + 'vw';
                el.style.flex = '0 0 ' + CARD_WIDTH_VW + 'vw';
                el.style.position = 'relative'; 
                el.style.margin = '0';

                // 核心：通过负 MarginRight 紧密叠放，物理最后一张边距为 0
                const marginRight = visualIdx === n - 1 ? 0 : -(CARD_WIDTH_VW - stepX);
                el.style.marginRight = marginRight + 'vw';

                // 扇形倾斜与弧形高度
                const t = visualIdx / (n - 1); // 0 ~ 1
                const yOffset = Math.sin(t * Math.PI) * arcHeightVW;
                const angle = -maxRotateAngle + t * (2 * maxRotateAngle);
                el.style.transform = `translateY(-${yOffset}vw) rotate(${angle}deg)`;
                
                // 提升层级
                el.style.zIndex = visualIdx + 1;

                fragment.appendChild(el);
                visualIdx++;
            }
        });
        container.appendChild(fragment);
        document.getElementById('hand-count').textContent = total;
    }

    // ★ 商店渲染：转发给独立模块
    function renderShop() {
        if (window.YYCardShopRender) {
            window.YYCardShopRender.renderShop();
        }
    }

    function renderBoard(containerId, cards, isSelf) {
        const cont = document.getElementById(containerId);
        if (!cont) return;
        cont.innerHTML = '';
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < 6; i++) {
            const c = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.setAttribute('data-slot-index', i);
            let dataIndex = isSelf ? i : (i < 3 ? i + 3 : i - 3);
            slot.setAttribute('data-board-index', dataIndex);
            if (isValidCard(c)) {
                const el = createCardElement(c, isSelf ? 'board' : 'enemy', isSelf);
                if (isSelf) {
                    el.setAttribute('data-board-index', i);
                    el.setAttribute('data-instance-id', c.instanceId || '');
                    el.setAttribute('data-card-type', 'board');
                } else {
                    el.setAttribute('data-board-index', dataIndex);
                }
                slot.appendChild(el);
            } else {
                slot.innerHTML = '<div class="card empty-slot">⬤</div>';
            }
            fragment.appendChild(slot);
        }
        cont.appendChild(fragment);
    }

    // ★ 获取商店展示卡牌：转发给独立模块
    function getShopDisplayCards(player) {
        if (window.YYCardShopRender) {
            return window.YYCardShopRender.getShopDisplayCards(player);
        }
        return [];
    }

    function refreshAllUI() {
        if (isDragging()) return;
        if (window.YYCardShopRefresh?.isRefreshing) return;
        if (window.YYCardInspector?.cleanupAllRemnants) {
            window.YYCardInspector.cleanupAllRemnants();
        }

        renderMyBoard();
        renderHand();
        renderShop();

        const gameState = getGameState();
        if (gameState) {
            const userId = getCurrentUserId();
            const my = gameState.players[userId];
            if (my) {
                document.getElementById('my-health').textContent = my.health;
                document.getElementById('my-gold').textContent = my.gold;
                document.getElementById('shop-level').textContent = my.shopLevel;
                const healthTop = document.getElementById('my-health-top');
                if (healthTop) healthTop.textContent = my.health;
            }
            updateBuyExpButtonState();
        }

        if (window.mergeService) {
            window.mergeService.updateMergeGlow();
            window.mergeService.envokeMerge();
        }
    }

    function updateBuyExpButtonState() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;

        const isMaxLevel = my.shopLevel >= (config.MAX_SHOP_LEVEL || 5);
        const canOp = canOperate();
        const shouldDisable = !canOp || isMaxLevel;
        let expNeeded = 0;
        if (!isMaxLevel) {
            const exp = my.exp;
            if (exp < 4) expNeeded = 4 - exp;
            else if (exp < 12) expNeeded = 12 - exp;
            else if (exp < 26) expNeeded = 26 - exp;
            else if (exp < 46) expNeeded = 46 - exp;
        }
        ['buy-exp-btn', 'buy-exp-btn-bottom'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.textContent = isMaxLevel ? ' 已满级' : ` 升级 (${expNeeded}💰)`;
                btn.disabled = shouldDisable || (expNeeded > my.gold);
                btn.style.pointerEvents = shouldDisable ? 'none' : 'auto';
                btn.style.opacity = shouldDisable ? '0.6' : '1';
            }
        });
    }

    function injectStyles() {
        const styleId = 'yycard-manual-drag';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .card { touch-action: none; user-select: none; -webkit-user-select: none; contain: none; }
            .card-drag-clone { pointer-events: none !important; will-change: left, top; transform: translateZ(0); }
            .drop-target { box-shadow: 0 0 0 4px #ff4444 !important; transition: box-shadow 0.1s; }
            .card[data-card-type="shop"] .card-price {
                display: block !important; position: absolute !important; bottom: -18px; left: 0; right: 0;
                text-align: center; font-weight: bold; font-size: 0.8rem; color: #fff;
                text-shadow: 0 0 4px #000; z-index: 999; background: transparent; border: none;
            }
        `;
        document.head.appendChild(style);
    }

    // 公开 API
    return {
        loadCardConfig,
        getCardDisplay,
        createCardElement,
        renderMyBoard,
        renderHand,
        renderShop,
        renderBoard,
        getShopDisplayCards,
        refreshAllUI,
        updateBuyExpButtonState,
        injectStyles,
        isDragging,
        isValidCard,
        getValidHandCount
    };
})();

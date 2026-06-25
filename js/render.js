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

    // ----- 卡牌元素创建（完整结构，图片放大至120%且不裁切） -----
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

        // 1. 图片层（保持比例，放大至120%，不裁切）
        const iconDiv = document.createElement('div');
        iconDiv.className = 'card-icon';
        iconDiv.style.cssText = `
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: center;
            overflow: visible;       /* 允许图片放大后溢出容器 */
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
            object-fit: contain;     /* 保持比例，不拉伸变形 */
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

        // 4. 价格层（仅商店卡牌显示，靠 CSS 控制）
        const priceDiv = document.createElement('div');
        priceDiv.className = 'card-price';
        const buyPrice = (config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy);
        priceDiv.textContent = buyPrice ? `${buyPrice}💰` : '';
        d.appendChild(priceDiv);

        // 5. 护盾占位（由 buffs.js 动态添加，overflow:visible 保证不裁剪）
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

        const validCards = my.hand.filter(isValidCard);
        const total = validCards.length;
        const containerWidthVW = 98;
        const cardWidthVW = 23;

        my.hand.forEach((card, i) => {
            if (isValidCard(card)) {
                const el = createCardElement(card, 'hand');
                el.setAttribute('data-hand-index', i);
                el.setAttribute('data-card-type', 'hand');
                el.setAttribute('data-instance-id', card.instanceId || '');

                // 拖拽事件由 drag.js 绑定，这里只设置属性

                let marginRightVW = 0;
                if (total > 0) {
                    const slotWidth = containerWidthVW / total;
                    marginRightVW = slotWidth - cardWidthVW;
                }
                if (i === total - 1) marginRightVW = 0;
                el.style.marginRight = marginRightVW + 'vw';

                fragment.appendChild(el);
            }
        });
        container.appendChild(fragment);
        document.getElementById('hand-count').textContent = getValidHandCount(my.hand);
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
        if (!Array.isArray(group) || group.length < 30) {
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

    function getShopDisplayCards(player) {
        const shop = player.shopCards;
        if (shop?.buffer && Array.isArray(shop.buffer)) {
            const active = shop.active ?? 0;
            const sub = shop.subIndex ?? 0;
            const group = shop.buffer[active];
            if (Array.isArray(group) && group.length >= 30) {
                const start = sub * 3;
                return group.slice(start, start + 3).filter(isValidCard);
            }
        }
        return Array.isArray(shop) ? shop.filter(isValidCard) : [];
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

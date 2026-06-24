// ==================== 纯渲染模块 (render.js) ====================
window.YYCardRender = (function() {
    const config = window.YYCardConfig;

    // ========== 基础依赖与辅助函数 ==========
    function getCurrentUserId() { return window.YYCardAuth?.currentUser?.id || null; }
    function getGameState() { return window.YYCardBattle?.getGameState(); }
    
    function isValidCard(card) {
        return card && typeof card === 'object' && (card.cardId || card.card_id);
    }

    function getValidHandCount(hand) {
        return hand.filter(isValidCard).length;
    }

    // 辅助函数：获取稀有度对应颜色（用于消耗牌）
    function getRarityColor(rarity) {
        switch (rarity) {
            case 'Common': return '#94a3b8';
            case 'Rare': return '#22c55e';
            case 'Epic': return '#8b5cf6';
            case 'Legendary': return '#f59e0b';
            default: return '#94a3b8';
        }
    }

    // ========== 卡牌展示配置（从 /data/image.json 加载） ==========
    let cardConfig = {};

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

    // ========== 核心卡牌渲染（终极清空边框，避免任何闪烁） ==========
    function createCardElement(card, cardType = 'board', isBoard = false) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity || 'Common');
        d.setAttribute('data-card-type', cardType);

        // ★ 消耗牌保留原样
        if (card.type === 'consumable' || card.isConsumable) {
            const color = getRarityColor(card.rarity);
            d.style.background = color;
            d.style.border = `2px solid ${color}`;
            d.style.display = 'flex';
            d.style.flexDirection = 'column';
            d.style.alignItems = 'center';
            d.style.justifyContent = 'center';
            d.style.padding = '1vh 2vw';

            const descEl = document.createElement('div');
            descEl.className = 'card-desc';
            descEl.textContent = card.name || '消耗牌';
            descEl.style.cssText = `
                color: white;
                font-weight: bold;
                font-size: clamp(0.6rem, 1.8vw, 0.8rem);
                text-align: center;
                line-height: 1.3;
                text-shadow: 0 0 4px rgba(0,0,0,0.8);
            `;
            d.appendChild(descEl);
            return d;
        }

        // ========== ★ 普通卡牌：完美居中自适应大小 + 再放大5% ==========
        const display = getCardDisplay(card);
        const imgPath = display.image;

        // ★ 彻底断绝任何CSS边框的干扰，连 outline (外轮廓) 也一并清空！
        d.style.cssText = `
            background: transparent !important;
            border: 0 solid transparent !important;
            border-style: none !important;
            outline: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important; 
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 0 !important;
            position: relative;
        `;

        // ★【缩放改动】在 translate 后面增加了 scale(1.05)，实现尺寸等比放大5%
        d.innerHTML = `
            <img src="${imgPath}" 
                 alt="${display.name}" 
                 onerror="this.src='/assets/default-avatar.png'"
                 style="
                    display: block; 
                    border: none; 
                    margin: 0; 
                    padding: 0;
                    position: absolute; 
                    top: 50%; 
                    left: 50%; 
                    transform: translate(-50%, -50%) scale(1.05);
                    width: 100%; 
                    height: 100%; 
                    object-fit: contain;
                 ">
        `;

        d.setAttribute('data-star', card.star || 0);
        // 防止图片被拖拽走
        d.querySelector('img').draggable = false;
        return d;
    }

    // ========== 具体区域渲染 ==========
    
    // 辅助函数：获取当前商店展示的卡牌（提取出来方便renderShop使用）
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

    function renderMyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        renderBoard('my-board', my.board, true);
        document.getElementById('my-board').setAttribute('data-player-id', userId);
    }

    function renderHand() {
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

                let marginRightVW = 0;
                if (total > 0) {
                    const slotWidth = containerWidthVW / total;
                    marginRightVW = slotWidth - cardWidthVW;
                }
                if (i === total - 1) {
                    marginRightVW = 0;
                }
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

    // ========== 界面状态更新（升级按钮等） ==========
    function updateBuyExpButtonState() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;

        // 注意：这里依赖于外部的 config 和 canOperate 获取，能在业务层（shop.js）直接传参调用。
        // 但为了保持纯渲染独立性，这里直接计算
        const isMaxLevel = my.shopLevel >= (config.MAX_SHOP_LEVEL || 5);
        const canOp = (gameState.phase === 'prepare' && !my.isBot);
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

    // ========== 全量刷新 UI ==========
    function refreshAllUI() {
        // 排除拖拽和各种外部状态干扰
        if (window._consumableDragging) return;
        if (window.YYCardShopRefresh?.isRefreshing) return;

        if (window.YYCardInspector?.cleanupAllRemnants) {
            window.YYCardInspector.cleanupAllRemnants();
        }

        // 绘制界面
        renderMyBoard();
        renderHand();
        renderShop();

        // 更新顶部面板状态
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

        // 触发合成模块检查
        if (window.mergeService) {
            window.mergeService.updateMergeGlow();
            window.mergeService.envokeMerge();
        }
    }

    // ========== 模块暴露接口 ==========
    return {
        loadCardConfig,
        createCardElement,
        renderMyBoard,
        renderHand,
        renderShop,
        renderBoard,
        refreshAllUI,
        updateBuyExpButtonState,
        getCardDisplay
    };
})();

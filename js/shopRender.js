// ==================== 商店渲染子模块（含技能描述 + 攻防左右分开） ====================
window.YYCardShopRender = (function() {
    const render = window.YYCardRender;

    // 技能数据缓存
    let skillMap = {};
    let skillsLoaded = false;

    // 加载技能数据
    async function loadSkills() {
        if (skillsLoaded) return;
        try {
            const res = await fetch('/data/characters.json');
            if (!res.ok) throw new Error('加载失败');
            const cards = await res.json();
            cards.forEach(card => {
                if (card.skill) {
                    try {
                        skillMap[card.card_id] = JSON.parse(card.skill);
                    } catch {
                        skillMap[card.card_id] = { skillName: '', skill_describe: card.skill };
                    }
                }
            });
            skillsLoaded = true;
        } catch (e) {
            console.warn('商店技能数据加载失败:', e);
            skillsLoaded = true;
        }
    }

    // ========== 商店专属样式（攻防左右分开 + 技能描述） ==========
    function injectShopStyles() {
        if (document.getElementById('yycard-shop-styles')) return;
        const style = document.createElement('style');
        style.id = 'yycard-shop-styles';
        style.textContent = `
            /* ---------- 攻防数值容器：占据卡片下方百分比高度 ---------- */
            .card[data-card-type="shop"] .card-stats {
                position: absolute !important;
                top: 67% !important;            /* ← 上下位置：用百分比，78% 表示从卡片顶部往下 78% */
                left: 0 !important;
                width: 100% !important;
                height: 0 !important;
                z-index: 2;
                pointer-events: none;
            }

            /* ---------- 攻击力：固定在左侧 ---------- */
            .card[data-card-type="shop"] .card-atk {
                position: absolute;
                left: 7%;                      /* ← 距左边距离：可改为 5%, 10% 等 */
                top: 67%;
                transform: translateY(-50%);   /* 垂直居中 */
                color: #fff;
                font-weight: bold;
                text-shadow: 0 0 4px #000;
                font-size: 1em;
            }

            /* ---------- 生命值：固定在右侧 ---------- */
            .card[data-card-type="shop"] .card-hp {
                position: absolute;
                right: 7%;                     /* ← 距右边距离：可改为 5%, 10% 等 */
                top: 67%;
                transform: translateY(-50%);
                color: #fff;
                font-weight: bold;
                text-shadow: 0 0 4px #000;
                font-size: 1em;
            }

            /* ---------- 技能描述面板 ---------- */
            .card-skill-desc {
                position: absolute;
                bottom: 0;
                left: 2%;
                width: 95%;
                height: 30%;                  /* 占卡片高度的20% */
                background: rgba(0, 0, 0, 0.75);
                color: #fff;
                font-size: 0.8em;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                text-align: center;
                padding: 2px 4px;
                box-sizing: border-box;
                z-index: 1;
                border-radius: 0 0 4px 4px;
                line-height: 1.2;
                text-shadow: 1px 1px 2px black;
                pointer-events: none;
            }

            /* 护盾层级 */
            .card[data-card-type="shop"] .card-shield {
                z-index: 3;
            }
        `;
        document.head.appendChild(style);
    }

    // 给卡片添加技能描述
    function addSkillDesc(cardElement, card) {
        if (!card || card.type === 'consumable' || card.isConsumable) return;
        const skillData = skillMap[card.card_id || card.cardId];
        if (!skillData) return;
        const descText = skillData.skill_describe || skillData.skillName || '';
        if (!descText) return;

        const descDiv = document.createElement('div');
        descDiv.className = 'card-skill-desc';
        descDiv.textContent = descText;
        cardElement.appendChild(descDiv);
    }

    // 商店渲染主函数
    function renderShop() {
        const gameState = window.YYCardBattle?.getGameState();
        if (!gameState) return;
        const userId = window.YYCardAuth?.currentUser?.id;
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
            if (render.isValidCard(card)) {
                hasAnyCard = true;
                const el = render.createCardElement(card, 'shop');
                el.setAttribute('data-shop-index', i);
                el.setAttribute('data-card-type', 'shop');

                // 追加技能描述
                addSkillDesc(el, card);

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

    function getShopDisplayCards(player) {
        const shop = player.shopCards;
        if (shop?.buffer && Array.isArray(shop.buffer)) {
            const active = shop.active ?? 0;
            const sub = shop.subIndex ?? 0;
            const group = shop.buffer[active];
            if (Array.isArray(group) && group.length >= 30) {
                const start = sub * 3;
                return group.slice(start, start + 3).filter(render.isValidCard);
            }
        }
        return Array.isArray(shop) ? shop.filter(render.isValidCard) : [];
    }

    // 初始化
    injectShopStyles();
    loadSkills();

    return {
        renderShop,
        getShopDisplayCards
    };
})();

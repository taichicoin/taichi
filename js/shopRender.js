// ==================== 商店渲染子模块（技能描述自适应 + 攻防左右分色） ====================
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

    // ========== 商店专属样式 ==========
    function injectShopStyles() {
        if (document.getElementById('yycard-shop-styles')) return;
        const style = document.createElement('style');
        style.id = 'yycard-shop-styles';
        style.textContent = `
            /* 攻防数值容器 */
            .card[data-card-type="shop"] .card-stats {
                position: absolute !important;
                top: 65% !important;
                left: 0 !important;
                width: 100% !important;
                height: 0 !important;
                z-index: 2;
                pointer-events: none;
            }

            /* 攻击力：红色，左侧 */
            .card[data-card-type="shop"] .card-atk {
                position: absolute;
                left: 6%;
                top: 65%;
                transform: translateY(-50%);
                color: #ff4d4d;          /* 红色 */
                font-weight: bold;
                text-shadow: 0 0 4px #000;
                font-size: 1.1em;        /* 增大10% */
            }

            /* 生命值：绿色，右侧 */
            .card[data-card-type="shop"] .card-hp {
                position: absolute;
                right: 6%;
                top: 65%;
                transform: translateY(-50%);
                color: #4dff4d;          /* 绿色 */
                font-weight: bold;
                text-shadow: 0 0 4px #000;
                font-size: 1.1em;
            }

            /* 技能描述面板 */
            .card-skill-desc {
                position: absolute;
                bottom: -2%;
                left: 3%;
                width: 93%;
                height: 30%;
                background: rgba(0, 0, 0, 0.75);
                color: #fff;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: flex-start;   /* 左对齐 */
                text-align: left;
                padding: 2px 4px;
                box-sizing: border-box;
                z-index: 1;
                border-radius: 0 0 4px 4px;
                line-height: 1.2;
                text-shadow: 1px 1px 2px black;
                pointer-events: none;
                word-break: break-word;        /* 自动换行 */
                overflow: hidden;
            }

            /* 护盾层级 */
            .card[data-card-type="shop"] .card-shield {
                z-index: 3;
            }
        `;
        document.head.appendChild(style);
    }

    // 根据文本长度动态计算字号（使长文本缩小，短文本放大）
    function calcSkillFontSize(text) {
        const len = text.length;
        if (len <= 5) return '0.8em';
        if (len <= 6) return '0.75em';
        if (len <= 7) return '0.7em';
        if (len <= 8) return '0.65em';
        if (len <= 9) return '0.65em';
        if (len <= 10) return '0.65em';
        if (len <= 15) return '0.5em';
        if (len <= 20) return '0.5em';
        if (len <= 25) return '0.4em';
        return '0.5em';
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

        // 动态自适应字号
        descDiv.style.fontSize = calcSkillFontSize(descText);

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

                // 追加自适应技能描述
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

// ==================== 商店渲染子模块（内置价格表，仅商店显示价格，叠加shopBonus） ====================
window.YYCardShopRender = (function() {
    const render = window.YYCardRender;

    const CARD_PRICE = {
        Common: { buy: 1, sell: 1 },
        Rare: { buy: 2, sell: 2 },
        Epic: { buy: 3, sell: 3 },
        Legendary: { buy: 4, sell: 4 }
    };

    let skillMap = {};
    let skillsLoaded = false;

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

    function injectShopStyles() {
        if (document.getElementById('yycard-shop-styles')) return;
        const style = document.createElement('style');
        style.id = 'yycard-shop-styles';
        style.textContent = `
            .card[data-card-type="shop"] .card-stats {
                position: absolute !important;
                top: 65% !important;
                left: 0 !important;
                width: 100% !important;
                height: 0 !important;
                z-index: 2;
                pointer-events: none;
            }
            .card[data-card-type="shop"] .card-atk {
                position: absolute;
                left: 6%;
                top: 65%;
                transform: translateY(-50%);
                color: #ff4d4d;
                font-weight: bold;
                text-shadow: 0 0 4px #000;
                font-size: 1.1em;
            }
            .card[data-card-type="shop"] .card-hp {
                position: absolute;
                right: 6%;
                top: 65%;
                transform: translateY(-50%);
                color: #4dff4d;
                font-weight: bold;
                text-shadow: 0 0 4px #000;
                font-size: 1.1em;
            }
            .card-skill-desc {
                position: absolute;
                bottom: -3%;
                left: 5%;
                width: 90%;
                height: 30%;
                background: rgba(0, 0, 0, 0.75);
                color: #fff;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: flex-start;
                text-align: left;
                padding: 2px 4px;
                box-sizing: border-box;
                z-index: 1;
                border-radius: 0 0 4px 4px;
                line-height: 1.2;
                text-shadow: 1px 1px 2px black;
                pointer-events: none;
                word-break: break-word;
                overflow: hidden;
            }
            .card[data-card-type="shop"] .card-shield {
                z-index: 3;
            }
        `;
        document.head.appendChild(style);
    }

    function calcSkillFontSize(text) {
        const len = text.length;
        if (len <= 5) return '0.8em';
        if (len <= 6) return '0.75em';
        if (len <= 7) return '0.7em';
        if (len <= 8) return '0.65em';
        if (len <= 9) return '0.65em';
        if (len <= 10) return '0.65em';
        if (len <= 15) return '0.6em';
        if (len <= 20) return '0.55em';
        if (len <= 25) return '0.5em';
        return '0.5em';
    }

    function addSkillDesc(cardElement, card) {
        if (!card || card.type === 'consumable' || card.isConsumable) return;
        const skillData = skillMap[card.card_id || card.cardId];
        if (!skillData) return;
        const descText = skillData.skill_describe || skillData.skillName || '';
        if (!descText) return;
        const descDiv = document.createElement('div');
        descDiv.className = 'card-skill-desc';
        descDiv.textContent = descText;
        descDiv.style.fontSize = calcSkillFontSize(descText);
        cardElement.appendChild(descDiv);
    }

    function addPriceTag(cardElement, rarity) {
        const buyPrice = CARD_PRICE[rarity]?.buy;
        if (!buyPrice) return;
        const priceDiv = document.createElement('div');
        priceDiv.className = 'card-price';
        priceDiv.textContent = `${buyPrice}💰`;
        cardElement.appendChild(priceDiv);
    }

    // 判断是否应该享受商店加成（角色牌，且不是武器/道具/消耗品）
    function canApplyShopBonus(card) {
        if (!card) return false;
        const t = card.type;
        if (t === 'weapon' || t === 'item' || t === 'consumable' || card.isConsumable) return false;
        return true;
    }

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

        // ★ 直接取 shopBonus，不存在则用 0
        const bonus = my.shopBonus || { atk: 0, hp: 0 };
        const bonusAtk = Number(bonus.atk) || 0;
        const bonusHp  = Number(bonus.hp) || 0;

        const start = sub * 3;
        let hasAnyCard = false;
        const fragment = document.createDocumentFragment();

        for (let i = start; i < start + 3; i++) {
            const original = group[i];
            if (!render.isValidCard(original)) {
                const placeholder = document.createElement('div');
                placeholder.className = 'card empty-slot';
                placeholder.setAttribute('data-shop-index', i);
                placeholder.style.visibility = 'hidden';
                placeholder.innerHTML = '';
                fragment.appendChild(placeholder);
                continue;
            }

            hasAnyCard = true;

            // 构造显示用的卡牌数据（不动原始数据）
            let displayCard = original;
            if (canApplyShopBonus(original) && (bonusAtk > 0 || bonusHp > 0)) {
                displayCard = {
                    ...original,
                    atk: (original.atk || 0) + bonusAtk,
                    hp:  (original.hp  || 0) + bonusHp
                };
            }

            const el = render.createCardElement(displayCard, 'shop');
            el.setAttribute('data-shop-index', i);
            el.setAttribute('data-card-type', 'shop');

            addSkillDesc(el, original);
            addPriceTag(el, original.rarity);

            fragment.appendChild(el);
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
        if (!shop?.buffer) return [];
        const active = shop.active ?? 0;
        const sub = shop.subIndex ?? 0;
        const group = shop.buffer[active];
        if (!Array.isArray(group) || group.length < 30) return [];
        const start = sub * 3;
        const bonus = player.shopBonus || { atk: 0, hp: 0 };
        const bonusAtk = Number(bonus.atk) || 0;
        const bonusHp  = Number(bonus.hp) || 0;
        return group.slice(start, start + 3).filter(render.isValidCard).map(card => {
            if (canApplyShopBonus(card) && (bonusAtk > 0 || bonusHp > 0)) {
                return {
                    ...card,
                    atk: (card.atk || 0) + bonusAtk,
                    hp:  (card.hp  || 0) + bonusHp
                };
            }
            return card;
        });
    }

    injectShopStyles();
    loadSkills();

    return {
        renderShop,
        getShopDisplayCards
    };
})();

// ==================== 商店渲染子模块（带诊断的 shopBonus 加成） ====================
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

    function isCharacterCard(card) {
        if (!card) return false;
        const t = card.type;
        return !(t === 'weapon' || t === 'item' || t === 'consumable' || card.isConsumable);
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

        // ★★★ 诊断：如果 shopBonus 不存在或为 0，控制台会告诉你 ★★★
        if (my.shopBonus === undefined) {
            console.warn('⚠️ shopBonus 字段不存在！请检查后端是否写入了该字段。');
        } else {
            console.log('✅ shopBonus 值为:', JSON.stringify(my.shopBonus));
        }

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

        const bonus = my.shopBonus || { atk: 0, hp: 0 };
        const bonusAtk = Number(bonus.atk) || 0;
        const bonusHp  = Number(bonus.hp)  || 0;

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

                // 在这里加上加成
                if (isCharacterCard(card) && (bonusAtk > 0 || bonusHp > 0)) {
                    const atkSpan = el.querySelector('.card-atk');
                    const hpSpan  = el.querySelector('.card-hp');
                    if (atkSpan) atkSpan.textContent = (parseInt(atkSpan.textContent, 10) || 0) + bonusAtk;
                    if (hpSpan)  hpSpan.textContent  = (parseInt(hpSpan.textContent, 10)  || 0) + bonusHp;
                }

                addSkillDesc(el, card);
                addPriceTag(el, card.rarity);
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
        if (!shop?.buffer) return [];
        const active = shop.active ?? 0;
        const sub = shop.subIndex ?? 0;
        const group = shop.buffer[active];
        if (!Array.isArray(group) || group.length < 30) return [];
        const start = sub * 3;
        const bonus = player.shopBonus || { atk: 0, hp: 0 };
        const bonusAtk = Number(bonus.atk) || 0;
        const bonusHp  = Number(bonus.hp)  || 0;
        return group.slice(start, start + 3).filter(render.isValidCard).map(card => {
            if (!isCharacterCard(card)) return { ...card };
            const baseAtk = card.atk !== undefined ? card.atk : (card.base_atk || 0);
            const baseHp  = card.hp  !== undefined ? card.hp  : (card.base_hp  || 0);
            return { ...card, atk: baseAtk + bonusAtk, hp: baseHp + bonusHp };
        });
    }

    injectShopStyles();
    loadSkills();

    return {
        renderShop,
        getShopDisplayCards
    };
})();

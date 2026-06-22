// ==================== 卡牌查看系统（名字/图片从 /data/image.json 获取，技能描述从 /data/characters.json 获取） ====================
window.YYCardInspector = (function() {

    // ---------- 卡牌展示配置（名字/图片） ----------
    let cardConfig = {};

    async function loadCardConfig() {
        try {
            const res = await fetch('/data/image.json');
            if (res.ok) {
                cardConfig = await res.json();
            }
        } catch (e) {}
    }

    // ---------- 角色技能配置 ----------
    let charactersData = null;

    async function loadCharactersConfig() {
        try {
            const res = await fetch('/data/characters.json');
            if (res.ok) {
                charactersData = await res.json();
            }
        } catch (e) {
            console.warn('无法加载 characters.json，技能描述可能不可用');
        }
    }

    function getCardDisplay(card) {
        const id = card?.card_id || card?.cardId || '';
        const cfg = cardConfig[id] || {};
        return {
            name: cfg.name || card?.name || id || '未知',
            image: cfg.image || card?.image || `/assets/card/${id}.png`
        };
    }

    // ---------- 清理所有残留弹窗 ----------
    function cleanupAllRemnants() {
        document.querySelectorAll('.card-inspect-popup').forEach(el => el.remove());
    }

    // ---------- 模板查找（从 characters.json 的数据） ----------
    function findTemplate(card) {
        if (!card || !charactersData) return null;
        const tryKeys = [card.card_id, card.cardId, card.id, card.name].filter(k => k);
        for (const key of tryKeys) {
            if (charactersData[key]) return charactersData[key];
        }
        // 如果 charactersData 是数组，也尝试遍历查找
        const all = Array.isArray(charactersData) ? charactersData : Object.values(charactersData);
        for (const key of tryKeys) {
            const found = all.find(t => t.card_id === key || t.id === key || t.name === key);
            if (found) return found;
        }
        return null;
    }

    // ---------- 技能描述读取（优先卡牌自身，其次从 characters.json） ----------
    function getSkillFromCard(card) {
        if (!card) return null;
        // 1) 卡牌自身有 skill 字段
        if (card.skill) {
            try {
                const s = typeof card.skill === 'string' ? JSON.parse(card.skill) : card.skill;
                if (s && (s.skillName || s.name)) {
                    return {
                        name: s.skillName || s.name,
                        desc: s.skill_describe || s.desc || ''
                    };
                }
            } catch(e) {}
        }
        // 2) 卡牌自身有 abilities 数组，取第一个有 name/desc 的对象
        if (card.abilities && Array.isArray(card.abilities) && card.abilities.length > 0) {
            const ab = card.abilities.find(a => a && (a.name || a.desc || a.skillName));
            if (ab) {
                return {
                    name: ab.skillName || ab.name || '技能',
                    desc: ab.skill_describe || ab.desc || ''
                };
            }
        }
        // 3) 从 characters.json 中查找
        const tpl = findTemplate(card);
        if (tpl) {
            // 模板可能有 skill 字段
            if (tpl.skill) {
                try {
                    const s = typeof tpl.skill === 'string' ? JSON.parse(tpl.skill) : tpl.skill;
                    if (s && (s.skillName || s.name)) {
                        return {
                            name: s.skillName || s.name,
                            desc: s.skill_describe || s.desc || ''
                        };
                    }
                } catch(e) {}
            }
            // 模板可能有 abilities 字段
            if (tpl.abilities && Array.isArray(tpl.abilities) && tpl.abilities.length > 0) {
                const ab = tpl.abilities.find(a => a && (a.name || a.desc || a.skillName));
                if (ab) {
                    return {
                        name: ab.skillName || ab.name || '技能',
                        desc: ab.skill_describe || ab.desc || ''
                    };
                }
            }
        }
        return null;
    }

    // ---------- 效果描述（用于增益列表） ----------
    function describeEffect(effect, category) {
        const catMap = {
            enlightenment: '悟道',
            on_kill_effects: '消灭',
            deathrattle: '遗言',
            divine_blessing: '神助'
        };
        const prefix = catMap[category] || '效果';
        if (!effect || typeof effect !== 'object') return prefix + ': 未知';
        switch (effect.type) {
            case 'gain_attack': return `${prefix} 攻击 +${effect.value}`;
            case 'gain_health': return `${prefix} 生命 +${effect.value}`;
            case 'gain_gold':   return `${prefix} 金币 +${effect.value}`;
            case 'gain_attack_health': return `${prefix} 攻击 +${effect.attack || 0} 生命 +${effect.health || 0}`;
            case 'gain_chi':    return `${prefix} 内力 +${effect.value}`;
            case 'gain_shield': return `${prefix} 护盾 +${effect.value}`;
            default: return `${prefix} 未知效果`;
        }
    }

    function collectBuffs(card) {
        const buffs = [];
        const fields = ['enlightenment', 'on_kill_effects', 'deathrattle', 'divine_blessing'];
        fields.forEach(field => {
            const arr = card[field];
            if (Array.isArray(arr)) {
                arr.forEach(eff => buffs.push(describeEffect(eff, field)));
            }
        });
        return buffs;
    }

    // ---------- 弹窗 ----------
    function showCardDetail(card, boardIndex, element, isOwn) {
        cleanupAllRemnants();
        let showEquipment = true;

        const display = getCardDisplay(card);

        function buildCardHTML(currentCard) {
            const d = getCardDisplay(currentCard);
            const imgPath = d.image;
            const atk = currentCard.atk ?? currentCard.base_atk ?? currentCard.baseAtk ?? 0;
            const hp = currentCard.hp ?? currentCard.base_hp ?? currentCard.baseHp ?? 0;
            const shield = currentCard.shield || 0;
            return `
                <div class="card" data-rarity="${currentCard.rarity || 'Common'}" data-star="${currentCard.star || 0}" style="width:23.6vw; height:29.1vw; flex-shrink:0; margin:0; position:relative;">
                    <div class="card-frame"></div>
                    <div class="card-icon"><img src="${imgPath}" alt="${d.name}" onerror="this.src='/assets/default-avatar.png'"></div>
                    <div class="card-stats"><span class="card-atk">${atk}</span><span class="card-hp">${hp}</span></div>
                    ${shield > 0 ? `<div class="card-shield"><span>${shield}</span></div>` : ''}
                </div>
            `;
        }

        function buildSkillHTML(currentCard) {
            const d = getCardDisplay(currentCard);
            const name = d.name;
            const skillInfo = getSkillFromCard(currentCard);
            const faction = currentCard.faction || '中立';
            const rarity = currentCard.rarity || 'Common';
            const chi = currentCard.chi || 0;

            let skillFontSize = '14px';
            if (skillInfo?.desc) {
                const len = skillInfo.desc.length;
                if (len > 120) skillFontSize = '10px';
                else if (len > 80) skillFontSize = '12px';
            }

            return `
                <div style="display:flex; flex-direction:column; height:100%;">
                    <div>
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                            <span style="font-size: clamp(1rem, 4vw, 1.5rem); font-weight: bold; word-break: break-all;">${name}</span>
                            <span style="background:#444; padding:2px 8px; border-radius:8px; font-size:2.5vw;">${rarity}</span>
                            <span style="background:#444; padding:2px 8px; border-radius:8px; font-size:2.5vw;">${faction}</span>
                            ${chi > 0 ? `<span style="display:inline-block; border:1px solid #ffd700; border-radius:10px; padding:0 6px; font-size:11px; color:#ffd700;">Chi ${chi}</span>` : ''}
                        </div>
                        ${!isOwn ? '<div style="color:#ffd966; font-size:12px;">👁️ 敌方卡牌</div>' : ''}
                    </div>
                    ${skillInfo ? `
                    <div class="inspect-skill" style="background:rgba(255,255,255,0.08); border-radius:8px; padding:4px; margin-top:4px; flex:1; overflow-y:auto;">
                        <div style="font-weight:bold; color:#ffd966; font-size:13px;">✨ ${skillInfo.name}</div>
                        <div style="font-size:${skillFontSize}; color:#ddd; line-height:1.3;">${skillInfo.desc}</div>
                    </div>` : `
                    <div style="color:#aaa; margin-top:8px; flex:1; display:flex; align-items:center; justify-content:center;">无技能</div>`}
                </div>
            `;
        }

        function buildEquipBuffHTML(currentCard, showEquip) {
            const weapon = currentCard.weapon || null;
            const item1 = currentCard.item1 || null;
            const item2 = currentCard.item2 || null;

            function renderSlot(slotKey, equip, label) {
                const baseStyle = 'display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.1); padding:5px 7px; border-radius:4px; margin:2px 0; min-height:50px; height:50px; line-height:1.4;';
                if (equip) {
                    const d = getCardDisplay(equip);
                    return `
                        <div class="equip-row" style="${baseStyle}">
                            <div style="display:flex; align-items:center; gap:5px;">
                                <img src="${d.image}" style="width:36px; height:36px; border-radius:4px;" onerror="this.src='/assets/default-avatar.png'">
                                <div>
                                    <div style="font-weight:bold; font-size:13px;">${d.name}</div>
                                    <div style="font-size:11px; color:#ccc;">${equip.type === 'weapon' ? '⚔️' : '💊'} +${equip.atk||0} / +${equip.hp||0}</div>
                                </div>
                            </div>
                            ${isOwn ? `<button class="unequip-btn" data-slot="${slotKey}" style="background:#c44; color:#fff; border:none; border-radius:3px; padding:2px 8px; font-size:11px; cursor:pointer;">✕</button>` : ''}
                        </div>
                    `;
                } else {
                    return `
                        <div class="equip-row empty-slot" style="${baseStyle} color:#aaa; font-size:12px;">
                            <div style="display:flex; align-items:center; gap:5px;">
                                <div style="width:36px; height:36px; border-radius:4px; background:rgba(255,255,255,0.1);"></div>
                                <span>${label}待装配</span>
                            </div>
                        </div>
                    `;
                }
            }

            const buffs = collectBuffs(currentCard);
            const buffsHtml = buffs.length > 0
                ? buffs.map(b => `<div style="padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.1);">${b}</div>`).join('')
                : '<div style="color:#aaa; text-align:center; padding:10px;">暂无增益效果</div>';

            return `
                <div style="border-top:1px solid rgba(255,255,255,0.2); padding-top:8px; margin-top:8px;">
                    <div style="display:flex; gap:8px; margin-bottom:8px;">
                        <button class="inspector-toggle-btn ${showEquip ? 'active' : ''}" data-view="equip" style="flex:1; background:${showEquip ? '#3a5a8a' : '#2a3a5a'}; color:#fff; border:none; border-radius:4px; padding:5px;">装备</button>
                        <button class="inspector-toggle-btn ${!showEquip ? 'active' : ''}" data-view="buff" style="flex:1; background:${!showEquip ? '#3a5a8a' : '#2a3a5a'}; color:#fff; border:none; border-radius:4px; padding:5px;">增益</button>
                    </div>
                    <div style="height:180px; overflow-y:auto;">
                        ${showEquip ? `
                            ${renderSlot('weapon', weapon, '武器')}
                            ${renderSlot('item1', item1, '道具①')}
                            ${renderSlot('item2', item2, '道具②')}
                        ` : buffsHtml}
                    </div>
                </div>
            `;
        }

        const popupEl = document.createElement('div');
        popupEl.className = 'card-inspect-popup';
        Object.assign(popupEl.style, {
            position: 'fixed', top: '0', left: '0', right: '0',
            maxHeight: '90vh', overflowY: 'auto',
            background: 'rgba(20,30,50,0.95)', backdropFilter: 'blur(8px)',
            borderRadius: '0 0 16px 16px', padding: '10% 10%',   // ★ 左右内边距改为 20%
            zIndex: '100002', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            border: 'none'
        });

        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex; gap:12px; align-items:flex-start;';

        const cardContainer = document.createElement('div');
        cardContainer.style.flexShrink = '0';
        cardContainer.innerHTML = buildCardHTML(card);

        const skillContainer = document.createElement('div');
        skillContainer.style.cssText = 'flex:1; min-width:0; height:29.1vw; display:flex; flex-direction:column;';
        skillContainer.innerHTML = buildSkillHTML(card);

        topRow.appendChild(cardContainer);
        topRow.appendChild(skillContainer);

        const bottomRow = document.createElement('div');
        bottomRow.innerHTML = buildEquipBuffHTML(card, showEquipment);

        popupEl.appendChild(topRow);
        popupEl.appendChild(bottomRow);
        document.body.appendChild(popupEl);

        popupEl.addEventListener('click', async (e) => {
            const toggleBtn = e.target.closest('.inspector-toggle-btn');
            if (toggleBtn) {
                showEquipment = toggleBtn.getAttribute('data-view') === 'equip';
                bottomRow.innerHTML = buildEquipBuffHTML(card, showEquipment);
                return;
            }

            if (isOwn) {
                const unequipBtn = e.target.closest('.unequip-btn');
                if (unequipBtn) {
                    e.stopPropagation();
                    const slot = unequipBtn.getAttribute('data-slot');
                    if (window.YYCardShop?.handleUnequip) {
                        await window.YYCardShop.handleUnequip(boardIndex, slot);
                        const gameState = window.YYCardBattle?.getGameState?.();
                        const uid = window.YYCardAuth?.currentUser?.id;
                        const updatedCard = gameState?.players?.[uid]?.board?.[boardIndex];
                        if (updatedCard) {
                            cardContainer.innerHTML = buildCardHTML(updatedCard);
                            skillContainer.innerHTML = buildSkillHTML(updatedCard);
                            bottomRow.innerHTML = buildEquipBuffHTML(updatedCard, showEquipment);
                        } else {
                            popupEl.remove();
                        }
                    }
                }
            }
        });

        const closeHandler = (e) => {
            if (!popupEl.contains(e.target)) {
                popupEl.remove();
                document.removeEventListener('pointerdown', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('pointerdown', closeHandler), 0);
    }

    // ---------- 长按/点击 ----------
    let pressTimer = null, startX = 0, startY = 0, hasMoved = false;
    const MOVE_THRESHOLD = 5, LONG_PRESS_DELAY = 300;

    function onPointerDownCapture(e) {
        const target = e.target.closest('.card');
        if (!target) return;
        const slot = target.closest('.card-slot');
        const board = target.closest('.board');
        if (!slot || !board) return;
        if (target.classList.contains('empty-slot')) return;
        if (board.id !== 'my-board' && board.id !== 'enemy-board') return;

        startX = e.clientX; startY = e.clientY; hasMoved = false;
        clearTimeout(pressTimer);

        pressTimer = setTimeout(() => {
            if (!hasMoved) {
                const boardIndex = parseInt(slot.getAttribute('data-board-index'));
                const playerId = board.getAttribute('data-player-id');
                const gameState = window.YYCardBattle?.getGameState?.();
                const card = gameState?.players?.[playerId]?.board?.[boardIndex];
                if (card) {
                    const isOwn = playerId === window.YYCardAuth?.currentUser?.id;
                    showCardDetail(card, boardIndex, target, isOwn);
                }
            }
            pressTimer = null;
        }, LONG_PRESS_DELAY);

        document.addEventListener('pointermove', onPointerMoveCapture, true);
        document.addEventListener('pointerup', onPointerUpCapture, true);
        document.addEventListener('pointercancel', onPointerUpCapture, true);
    }

    function onPointerMoveCapture(e) {
        if (pressTimer && (Math.abs(e.clientX - startX) > MOVE_THRESHOLD || Math.abs(e.clientY - startY) > MOVE_THRESHOLD)) {
            hasMoved = true; clearTimeout(pressTimer); pressTimer = null;
            removeCaptureListeners();
        }
    }

    function onPointerUpCapture(e) {
        if (pressTimer) {
            clearTimeout(pressTimer); pressTimer = null;
            if (!hasMoved) {
                const target = e.target.closest('.card');
                const slot = target?.closest('.card-slot');
                const board = target?.closest('.board');
                if (slot && board && (board.id === 'my-board' || board.id === 'enemy-board') && !target.classList.contains('empty-slot')) {
                    const boardIndex = parseInt(slot.getAttribute('data-board-index'));
                    const playerId = board.getAttribute('data-player-id');
                    const gameState = window.YYCardBattle?.getGameState?.();
                    const card = gameState?.players?.[playerId]?.board?.[boardIndex];
                    if (card) {
                        const isOwn = playerId === window.YYCardAuth?.currentUser?.id;
                        showCardDetail(card, boardIndex, target, isOwn);
                    }
                }
            }
            removeCaptureListeners();
        }
    }

    function removeCaptureListeners() {
        document.removeEventListener('pointermove', onPointerMoveCapture, true);
        document.removeEventListener('pointerup', onPointerUpCapture, true);
        document.removeEventListener('pointercancel', onPointerUpCapture, true);
    }

    async function init() {
        cleanupAllRemnants();
        await Promise.all([loadCardConfig(), loadCharactersConfig()]);
        document.addEventListener('pointerdown', onPointerDownCapture, true);
        console.log('✅ 卡牌查看系统已启动（名字/图片从 image.json，技能从 characters.json）');
    }

    return { init, cleanupAllRemnants };
})();

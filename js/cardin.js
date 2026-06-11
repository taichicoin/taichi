// ==================== 卡牌查看系统（支持增益效果查看、装备/增益切换） ====================
window.YYCardInspector = (function() {

    // ---------- 清理所有残留弹窗 ----------
    function cleanupAllRemnants() {
        document.querySelectorAll('.card-inspect-popup').forEach(el => el.remove());
    }

    // ---------- 模板查找 ----------
    function findTemplate(card) {
        if (!card) return null;
        const templates = window.cardTemplates;
        if (!templates) return null;
        const tryKeys = [card.card_id, card.cardId, card.id, card.name].filter(k => k);
        for (const key of tryKeys) {
            if (templates[key]) return templates[key];
        }
        const all = Object.values(templates);
        for (const key of tryKeys) {
            const found = all.find(t => t.card_id === key || t.id === key || t.name === key);
            if (found) return found;
        }
        return null;
    }

    function getSkillFromCard(card) {
        if (!card) return null;
        let skillObj = null;
        if (card.skill) {
            try { skillObj = (typeof card.skill === 'string') ? JSON.parse(card.skill) : card.skill; } catch(e) {}
        }
        if (!skillObj) {
            const tpl = findTemplate(card);
            if (tpl?.skill) {
                try { skillObj = (typeof tpl.skill === 'string') ? JSON.parse(tpl.skill) : tpl.skill; } catch(e) {}
            }
        }
        if (!skillObj) return null;
        return {
            name: skillObj.skillName || skillObj.name || '未知技能',
            desc: skillObj.skill_describe || '暂无描述'
        };
    }

    function getFaction(card) {
        if (card.faction) return card.faction;
        const tpl = findTemplate(card);
        return tpl ? (tpl.faction || '中立') : '中立';
    }

    function getImage(card) {
        return card.image || card.icon || (findTemplate(card)?.image) || '/assets/default-avatar.png';
    }

    function getAttack(card) {
        return card.atk ?? card.base_atk ?? card.baseAtk ?? 0;
    }
    function getHealth(card) {
        return card.hp ?? card.base_hp ?? card.baseHp ?? 0;
    }

    // ---------- 效果描述生成 ----------
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
                arr.forEach(eff => {
                    buffs.push(describeEffect(eff, field));
                });
            }
        });
        return buffs;
    }

    // ---------- 弹窗（顶部展开，上：左卡右技能；下：装备/增益栏） ----------
    function showCardDetail(card, boardIndex, element, isOwn) {
        cleanupAllRemnants();

        let showEquipment = true;

        // 生成左侧卡牌 HTML（去掉名字，添加 data-star）
        function buildCardHTML(currentCard) {
            const imgPath = getImage(currentCard);
            const atkDisplay = `${getAttack(currentCard)}`;
            const hpDisplay = `${getHealth(currentCard)}`;
            const shield = currentCard.shield || 0;
            return `
                <div class="card" data-rarity="${currentCard.rarity || 'Common'}" data-star="${currentCard.star || 0}" style="width:23.6vw; height:29.1vw; flex-shrink:0; margin:0; position:relative;">
                    <div class="card-frame"></div>
                    <div class="card-icon"><img src="${imgPath}" alt="${currentCard.name}" onerror="this.src='/assets/default-avatar.png'"></div>
                    <div class="card-stats"><span class="card-atk">${atkDisplay}</span><span class="card-hp">${hpDisplay}</span></div>
                    ${shield > 0 ? `<div class="card-shield"><span>${shield}</span></div>` : ''}
                </div>
            `;
        }

        // 生成右侧详情 HTML（名字阵营稀有度内力同一行，技能区域填充剩余高度）
        function buildSkillHTML(currentCard) {
            const name = currentCard.name || '未知';
            const skillInfo = getSkillFromCard(currentCard);
            const faction = getFaction(currentCard);
            const rarity = currentCard.rarity || 'Common';
            const chi = currentCard.chi || 0;

            let skillFontSize = '14px';
            if (skillInfo && skillInfo.desc) {
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
                            ${chi > 0 ? `<span style="display:inline-block; border:1px solid #ffd700; border-radius:10px; padding:0 6px; font-size:11px; color:#ffd700;">⚡${chi}</span>` : ''}
                        </div>
                        ${!isOwn ? '<div style="color:#ffd966; font-size:12px;">👁️ 敌方卡牌</div>' : ''}
                    </div>
                    ${skillInfo ? `
                    <div class="inspect-skill" style="background:rgba(255,255,255,0.08); border-radius:8px; padding:8px; margin-top:8px; flex:1; overflow-y:auto;">
                        <div style="font-weight:bold; color:#ffd966; font-size:13px;">✨ ${skillInfo.name}</div>
                        <div style="font-size:${skillFontSize}; color:#ddd; line-height:1.3;">${skillInfo.desc}</div>
                    </div>` : `
                    <div style="color:#aaa; margin-top:8px; flex:1; display:flex; align-items:center; justify-content:center;">无技能</div>`}
                </div>
            `;
        }

        // 生成下部装备/增益栏 HTML（固定行高，图片36x36）
        function buildEquipBuffHTML(currentCard, showEquip) {
            const weapon = currentCard.weapon || null;
            const item1 = currentCard.item1 || null;
            const item2 = currentCard.item2 || null;

            function renderSlot(slotKey, equip, label) {
                const baseStyle = 'display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.1); padding:5px 7px; border-radius:4px; margin:2px 0; min-height:50px; height:50px; line-height:1.4;';
                if (equip) {
                    return `
                        <div class="equip-row" style="${baseStyle}">
                            <div style="display:flex; align-items:center; gap:5px;">
                                <img src="${equip.image || '/assets/default-avatar.png'}" style="width:36px; height:36px; border-radius:4px;" onerror="this.src='/assets/default-avatar.png'">
                                <div>
                                    <div style="font-weight:bold; font-size:13px;">${equip.name}</div>
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

        // 主容器
        const popupEl = document.createElement('div');
        popupEl.className = 'card-inspect-popup';
        Object.assign(popupEl.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            maxHeight: '90vh',
            overflowY: 'auto',
            background: 'rgba(20,30,50,0.95)',
            backdropFilter: 'blur(8px)',
            borderRadius: '0 0 16px 16px',
            padding: '12px 5%',
            zIndex: '100002',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            border: 'none'
        });

        // 上半部分：左卡牌 + 右详情（高度对齐）
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex; gap:12px; align-items:flex-start;';

        const cardContainer = document.createElement('div');
        cardContainer.style.flexShrink = '0';
        cardContainer.innerHTML = buildCardHTML(card);

        const skillContainer = document.createElement('div');
        // 高度设置为与左侧卡牌相同 (29.1vw)，内部 flex 布局填充
        skillContainer.style.cssText = 'flex:1; min-width:0; height:29.1vw; display:flex; flex-direction:column;';
        skillContainer.innerHTML = buildSkillHTML(card);

        topRow.appendChild(cardContainer);
        topRow.appendChild(skillContainer);

        // 下半部分：装备/增益栏
        const bottomRow = document.createElement('div');
        bottomRow.innerHTML = buildEquipBuffHTML(card, showEquipment);

        popupEl.appendChild(topRow);
        popupEl.appendChild(bottomRow);
        document.body.appendChild(popupEl);

        // 事件处理（切换视图、卸下装备）
        popupEl.addEventListener('click', async (e) => {
            const toggleBtn = e.target.closest('.inspector-toggle-btn');
            if (toggleBtn) {
                const view = toggleBtn.getAttribute('data-view');
                showEquipment = (view === 'equip');
                bottomRow.innerHTML = buildEquipBuffHTML(card, showEquipment);
                return;
            }

            if (isOwn) {
                const unequipBtn = e.target.closest('.unequip-btn');
                if (unequipBtn) {
                    e.stopPropagation();
                    const slot = unequipBtn.getAttribute('data-slot');
                    if (window.YYCardShop && typeof window.YYCardShop.handleUnequip === 'function') {
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

        // 点击外部关闭
        const closeHandler = (e) => {
            if (!popupEl.contains(e.target)) {
                popupEl.remove();
                document.removeEventListener('pointerdown', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('pointerdown', closeHandler), 0);
    }

    // ---------- 长按/点击分离（保持不变） ----------
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
                    const isOwn = (playerId === window.YYCardAuth?.currentUser?.id);
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
                        const isOwn = (playerId === window.YYCardAuth?.currentUser?.id);
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

    function init() {
        cleanupAllRemnants();
        document.addEventListener('pointerdown', onPointerDownCapture, true);
        console.log('✅ 卡牌查看系统已启动（高度对齐、一星边框生效）');
    }

    return {
        init,
        cleanupAllRemnants
    };
})();

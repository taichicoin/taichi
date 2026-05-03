// ==================== 卡牌查看系统（支持装备显示与卸下、点击外部关闭） ====================
window.YYCardInspector = (function() {

    // ---------- 清理所有残留弹窗和拖拽克隆 ----------
    function cleanupAllRemnants() {
        document.querySelectorAll('.card-inspect-popup').forEach(el => el.remove());
        document.querySelectorAll('.card-drag-clone').forEach(el => el.remove());
    }

    // ---------- 模板查找（原有逻辑）----------
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

    // ---------- 弹窗（包含装备栏、卸下按钮、点击外部关闭）----------
    function showCardDetail(card, boardIndex, element, isOwn) {
        cleanupAllRemnants();

        const skillInfo = getSkillFromCard(card);
        const faction = getFaction(card);
        const rarity = card.rarity || 'Common';
        const atk = getAttack(card);
        const hp = getHealth(card);
        const imgSrc = getImage(card);

        // 装备槽数据
        const weapon = card.weapon || null;
        const item1 = card.item1 || null;
        const item2 = card.item2 || null;

        // 生成每个槽的HTML —— 增高20%：min-height 40px，padding/图标微调
        function renderSlot(slotKey, equip, label) {
            const baseStyle = 'display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.1); padding:5px 7px; border-radius:4px; margin:1px 0; min-height:40px; line-height:1.4; border-bottom:1px dashed rgba(255,255,255,0.2);';

            if (equip) {
                return `
                    <div class="equip-row" style="${baseStyle}">
                        <div style="display:flex; align-items:center; gap:5px;">
                            <img src="${equip.image || '/assets/default-avatar.png'}" style="width:28px; height:28px; border-radius:4px;" onerror="this.src='/assets/default-avatar.png'">
                            <div>
                                <div style="font-weight:bold; font-size:13px;">${equip.name}</div>
                                <div style="font-size:11px; color:#ccc;">${equip.type === 'weapon' ? '⚔️' : '💊'} +${equip.atk||0} / +${equip.hp||0}</div>
                            </div>
                        </div>
                        ${isOwn ? `<button class="unequip-btn" data-slot="${slotKey}" style="background:#c44; color:#fff; border:none; border-radius:3px; padding:2px 10px; font-size:11px; cursor:pointer;">✕</button>` : ''}
                    </div>
                `;
            } else {
                return `
                    <div class="equip-row empty-slot" style="${baseStyle} color:#ddd; font-size:12px;">
                        <div style="display:flex; align-items:center; gap:5px;">
                            <div style="width:28px; height:28px; border-radius:4px; background:rgba(255,255,255,0.1); flex-shrink:0;"></div>
                            <span>${label}待装配</span>
                        </div>
                    </div>
                `;
            }
        }

        const popupEl = document.createElement('div');
        popupEl.className = 'card-inspect-popup';
        popupEl.innerHTML = `
            <div class="inspect-header">
                <img src="${imgSrc}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'">
                <div>
                    <h3>${card.name}</h3>
                    <span class="rarity-tag rarity-${rarity}">${rarity}</span>
                    <span class="faction-tag">${faction}</span>
                </div>
            </div>
            <div class="inspect-stats">
                <span>⚔️ 攻击 ${atk}</span>
                <span>🛡️ 生命 ${hp}</span>
                ${!isOwn ? '<span style="color:#ffd966;">👁️ 敌方</span>' : ''}
            </div>
            ${skillInfo ? `
            <div class="inspect-skill">
                <div class="skill-title">✨ ${skillInfo.name}</div>
                <div class="skill-desc">${skillInfo.desc}</div>
            </div>` : '<div class="inspect-skill">无技能</div>'}
            <div class="inspect-equipment" style="margin-top:6px; border-top:1px solid #444; padding-top:4px;">
                <div style="font-weight:bold; margin-bottom:4px;">🛡️ 装备</div>
                ${renderSlot('weapon', weapon, '武器')}
                ${renderSlot('item1', item1, '道具①')}
                ${renderSlot('item2', item2, '道具②')}
            </div>
        `;

        // ---------- 弹窗样式：左右拉满，内容左右内边距12% ----------
        Object.assign(popupEl.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            maxHeight: '90vh',
            overflowY: 'auto',
            background: 'rgba(20,30,50,0.6)',
            color: '#fff',
            borderRadius: '0 0 16px 16px',
            padding: '12px 12%',   // 左右内边距改为12%
            zIndex: '100002',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            border: '1px solid #ffd966',
            backdropFilter: 'blur(8px)',
            fontFamily: 'sans-serif'
        });

        document.body.appendChild(popupEl);

        // 卸下按钮事件
        if (isOwn) {
            popupEl.querySelectorAll('.unequip-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const slot = btn.getAttribute('data-slot');
                    if (window.YYCardShop && typeof window.YYCardShop.handleUnequip === 'function') {
                        window.YYCardShop.handleUnequip(boardIndex, slot);
                        popupEl.remove();
                    } else {
                        console.error('handleUnequip 不可用');
                    }
                });
            });
        }

        // 点击外部关闭
        function closeHandler(e) {
            if (!popupEl.contains(e.target)) {
                popupEl.remove();
                document.removeEventListener('pointerdown', closeHandler);
            }
        }
        setTimeout(() => {
            document.addEventListener('pointerdown', closeHandler);
        }, 0);
    }

    // ---------- 长按/点击分离 ----------
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
                e.stopImmediatePropagation(); e.preventDefault();
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
                e.stopImmediatePropagation(); e.preventDefault();
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
        console.log('✅ 卡牌查看系统已启动（装备/卸下支持）');
    }

    return {
        init,
        cleanupAllRemnants
    };
})();

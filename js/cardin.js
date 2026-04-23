// ==================== 卡牌查看系统（万能模板匹配 + 敌我双方 + 技能/阵营自动补齐） ====================
window.YYCardInspector = (function() {

    // ---------- 辅助：从模板库中智能查找卡牌模板 ----------
    function findTemplate(card) {
        if (!card) return null;
        const templates = window.cardTemplates;
        if (!templates) {
            console.warn('⚠️ window.cardTemplates 不存在，无法补全技能');
            return null;
        }

        // 尝试的键（按优先级）
        const tryKeys = [
            card.card_id,
            card.cardId,
            card.id,
            card.name,           // 最后可以用名字碰碰运气
        ].filter(k => k !== undefined && k !== null);

        // 先直接用这些键作为对象 key 查找
        for (const key of tryKeys) {
            if (templates[key]) {
                console.log(`🔍 模板匹配成功: 键="${key}"`);
                return templates[key];
            }
        }

        // 如果上面没找到，遍历所有模板按 card_id / id / name 匹配
        const allTemplates = Object.values(templates);
        for (const key of tryKeys) {
            const found = allTemplates.find(t =>
                t.card_id === key || t.id === key || t.name === key
            );
            if (found) {
                console.log(`🔍 模板匹配成功(遍历): 键="${key}"`);
                return found;
            }
        }

        console.warn(`⚠️ 未找到卡牌模板: card_id="${card.card_id}", cardId="${card.cardId}", name="${card.name}"`);
        return null;
    }

    // ---------- 从卡牌对象或模板提取技能 ----------
    function getSkillFromCard(card) {
        if (!card) return null;
        let skillObj = null;

        // 1. 卡牌自带的 skill（可能是字符串或对象）
        if (card.skill) {
            try {
                skillObj = (typeof card.skill === 'string') ? JSON.parse(card.skill) : card.skill;
            } catch (e) {
                console.warn('解析卡牌自带技能失败', card.name);
            }
        }

        // 2. 从模板补充
        if (!skillObj) {
            const tpl = findTemplate(card);
            if (tpl && tpl.skill) {
                try {
                    skillObj = (typeof tpl.skill === 'string') ? JSON.parse(tpl.skill) : tpl.skill;
                } catch (e) {}
            }
        }

        if (!skillObj) return null;
        return {
            name: skillObj.skillName || skillObj.name || '未知技能',
            desc: skillObj.skill_describe || '暂无描述'
        };
    }

    // 阵营
    function getFaction(card) {
        if (card.faction) return card.faction;
        const tpl = findTemplate(card);
        return tpl ? (tpl.faction || '中立') : '中立';
    }

    // 图片
    function getImage(card) {
        return card.image || card.icon || (findTemplate(card)?.image) || '/assets/default-avatar.png';
    }

    // 攻击/生命
    function getAttack(card) {
        return card.atk ?? card.base_atk ?? card.baseAtk ?? 0;
    }
    function getHealth(card) {
        return card.hp ?? card.base_hp ?? card.baseHp ?? 0;
    }

    // ---------- 弹窗 ----------
    let popupEl = null;

    function showCardDetail(card, boardIndex, element, isOwn) {
        if (popupEl) popupEl.remove();

        const skillInfo = getSkillFromCard(card);
        const faction = getFaction(card);
        const rarity = card.rarity || 'Common';
        const atk = getAttack(card);
        const hp = getHealth(card);
        const imgSrc = getImage(card);

        popupEl = document.createElement('div');
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
        `;

        Object.assign(popupEl.style, {
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'rgba(20,30,50,0.95)', color: '#fff', borderRadius: '16px',
            padding: '20px', zIndex: '100002', width: '280px', maxWidth: '90vw',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)', border: '1px solid #ffd966',
            backdropFilter: 'blur(8px)', fontFamily: 'sans-serif'
        });
        document.body.appendChild(popupEl);

        const closeHandler = (e) => {
            if (!popupEl.contains(e.target)) {
                popupEl.remove();
                popupEl = null;
                document.removeEventListener('pointerdown', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('pointerdown', closeHandler), 0);
    }

    // ---------- 长按/点击分离 (支持敌我双方) ----------
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
        document.addEventListener('pointerdown', onPointerDownCapture, true);
        console.log('✅ 卡牌查看系统已启动（万能模板匹配，敌方可见）');
    }

    return { init };
})();

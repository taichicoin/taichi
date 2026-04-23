// ==================== 卡牌查看系统（支持敌我双方，自动从模板补充技能、阵营） ====================
window.YYCardInspector = (function() {

    // 从卡牌对象或全局模板中提取技能
    function getSkillFromCard(card) {
        if (!card) return null;
        let skillObj = null;

        // 1. 卡牌自带的 skill
        if (card.skill) {
            try {
                skillObj = (typeof card.skill === 'string') ? JSON.parse(card.skill) : card.skill;
            } catch (e) {}
        }

        // 2. 没有？去全局模板找
        if (!skillObj) {
            const tpl = findTemplate(card);
            if (tpl && tpl.skill) {
                skillObj = tpl.skill; // 模板里的 skill 已经是对象
            }
        }

        if (!skillObj) return null;
        return {
            name: skillObj.skillName || skillObj.name || '未知技能',
            desc: skillObj.skill_describe || '暂无描述'
        };
    }

    // 获取阵营
    function getFaction(card) {
        if (card.faction) return card.faction;
        const tpl = findTemplate(card);
        return tpl ? (tpl.faction || '中立') : '中立';
    }

    // 获取图片
    function getImage(card) {
        return card.image || card.icon || (findTemplate(card)?.image) || '/assets/default-avatar.png';
    }

    // 通过 cardId 或 card_id 查找模板
    function findTemplate(card) {
        const templates = window.cardTemplates;
        if (!templates) return null;
        return templates[card.cardId] || templates[card.card_id] || null;
    }

    // ---------- 弹窗（通用）----------
    let popupEl = null;

    function showCardDetail(card, boardIndex, element, isOwn) {
        if (popupEl) popupEl.remove();

        const skillInfo = getSkillFromCard(card);
        const faction = getFaction(card);
        const rarity = card.rarity || 'Common';
        const atk = card.atk ?? card.base_atk ?? 0;
        const hp = card.hp ?? card.base_hp ?? 0;
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

    // ---------- 事件捕获（支持敌我双方棋盘）----------
    let pressTimer = null, startX = 0, startY = 0, hasMoved = false;
    const MOVE_THRESHOLD = 5, LONG_PRESS_DELAY = 300;

    function onPointerDownCapture(e) {
        const target = e.target.closest('.card');
        if (!target) return;

        const slot = target.closest('.card-slot');
        const board = target.closest('.board');
        if (!slot || !board) return;
        if (target.classList.contains('empty-slot')) return;

        // 允许查看我方棋盘 (my-board) 和 敌方棋盘 (enemy-board)
        if (board.id !== 'my-board' && board.id !== 'enemy-board') return;

        startX = e.clientX; startY = e.clientY; hasMoved = false;
        clearTimeout(pressTimer);

        pressTimer = setTimeout(() => {
            if (!hasMoved) {
                e.stopImmediatePropagation(); e.preventDefault();

                // 获取卡牌数据
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
        console.log('✅ 卡牌查看系统已启动（敌我双方，点击详情）');
    }

    return { init };
})();

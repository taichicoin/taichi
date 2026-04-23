// ==================== 卡牌查看系统（直接读取 card.skill 中的描述 + 阵营） ====================
window.YYCardInspector = (function() {

    // ---------- 从卡牌数据中获取技能信息 ----------
    function getSkillFromCard(card) {
        if (!card) return null;
        let skillObj = null;
        try {
            if (typeof card.skill === 'string') {
                skillObj = JSON.parse(card.skill);
            } else if (typeof card.skill === 'object') {
                skillObj = card.skill;
            }
        } catch (e) {
            console.warn('解析技能JSON失败', card.name);
            return null;
        }
        if (!skillObj) return null;
        return {
            name: skillObj.skillName || skillObj.name || '未知技能',
            desc: skillObj.skill_describe || '暂无描述'
        };
    }

    // ---------- 详情弹窗 ----------
    let popupEl = null;

    function showCardDetail(card, boardIndex, element) {
        if (popupEl) popupEl.remove();

        const skillInfo = getSkillFromCard(card);
        const faction = card.faction || '中立';
        const rarity = card.rarity || 'common';
        const imgSrc = card.image || card.icon || `/assets/card/${card.id}.png`;

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
                <span>⚔️ 攻击 ${card.atk || card.base_atk || 0}</span>
                <span>🛡️ 生命 ${card.hp || card.base_hp || 0}</span>
            </div>
            ${skillInfo ? `
            <div class="inspect-skill">
                <div class="skill-title">✨ ${skillInfo.name}</div>
                <div class="skill-desc">${skillInfo.desc}</div>
            </div>` : '<div class="inspect-skill">无技能</div>'}
        `;

        popupEl.style.cssText = `
            position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
            background:rgba(20,30,50,0.95); color:#fff; border-radius:16px;
            padding:20px; z-index:100002; width:280px; max-width:90vw;
            box-shadow:0 8px 24px rgba(0,0,0,0.6); border:1px solid #ffd966;
            backdrop-filter:blur(8px); font-family:sans-serif;
        `;
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

    // ---------- 事件拦截（点击/拖拽分离）----------
    let pressTimer = null;
    let startX = 0, startY = 0;
    let hasMoved = false;
    const MOVE_THRESHOLD = 5;
    const LONG_PRESS_DELAY = 300;

    function onPointerDownCapture(e) {
        const target = e.target.closest('.card');
        if (!target) return;

        const slot = target.closest('.card-slot');
        const board = target.closest('.board');
        if (!slot || !board || board.id !== 'my-board') return;
        if (target.classList.contains('empty-slot')) return;

        startX = e.clientX;
        startY = e.clientY;
        hasMoved = false;

        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
            if (!hasMoved) {
                e.stopImmediatePropagation();
                e.preventDefault();

                const boardIndex = parseInt(slot.getAttribute('data-board-index'));
                const userId = window.YYCardAuth?.currentUser?.id;
                const gameState = window.YYCardBattle?.getGameState?.();
                const card = gameState?.players?.[userId]?.board?.[boardIndex];
                if (card) showCardDetail(card, boardIndex, target);
            }
            pressTimer = null;
        }, LONG_PRESS_DELAY);

        document.addEventListener('pointermove', onPointerMoveCapture, true);
        document.addEventListener('pointerup', onPointerUpCapture, true);
        document.addEventListener('pointercancel', onPointerUpCapture, true);
    }

    function onPointerMoveCapture(e) {
        if (pressTimer && (Math.abs(e.clientX - startX) > MOVE_THRESHOLD || Math.abs(e.clientY - startY) > MOVE_THRESHOLD)) {
            hasMoved = true;
            clearTimeout(pressTimer);
            pressTimer = null;
            removeCaptureListeners();
        }
    }

    function onPointerUpCapture(e) {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
            if (!hasMoved) {
                e.stopImmediatePropagation();
                e.preventDefault();
                const target = e.target.closest('.card');
                const slot = target?.closest('.card-slot');
                const board = target?.closest('.board');
                if (slot && board && board.id === 'my-board' && !target.classList.contains('empty-slot')) {
                    const boardIndex = parseInt(slot.getAttribute('data-board-index'));
                    const userId = window.YYCardAuth?.currentUser?.id;
                    const gameState = window.YYCardBattle?.getGameState?.();
                    const card = gameState?.players?.[userId]?.board?.[boardIndex];
                    if (card) showCardDetail(card, boardIndex, target);
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
        console.log('✅ 卡牌查看系统已启动（点击详情，长按拖拽）');
    }

    return { init };
})();

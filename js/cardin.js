// ==================== 卡牌查看系统（严格避免拖拽冲突） ====================
window.YYCardInspector = (function() {

    function cleanupAllRemnants() {
        document.querySelectorAll('.card-inspect-popup').forEach(el => el.remove());
        document.querySelectorAll('.card-drag-clone').forEach(el => el.remove());
    }

    function findTemplate(card) {
        if (!card) return null;
        const templates = window.cardTemplates;
        if (!templates) return null;
        const keys = [card.card_id, card.cardId, card.id, card.name].filter(Boolean);
        for (const key of keys) {
            if (templates[key]) return templates[key];
        }
        const all = Object.values(templates);
        for (const key of keys) {
            const found = all.find(t => t.card_id === key || t.id === key || t.name === key);
            if (found) return found;
        }
        return null;
    }

    function getSkillFromCard(card) {
        if (!card) return null;
        let skillObj = null;
        if (card.skill) {
            try { skillObj = typeof card.skill === 'string' ? JSON.parse(card.skill) : card.skill; } catch(e){}
        }
        if (!skillObj) {
            const tpl = findTemplate(card);
            if (tpl?.skill) {
                try { skillObj = typeof tpl.skill === 'string' ? JSON.parse(tpl.skill) : tpl.skill; } catch(e){}
            }
        }
        if (!skillObj) return null;
        return { name: skillObj.skillName || skillObj.name || '未知技能', desc: skillObj.skill_describe || '暂无描述' };
    }

    function getFaction(card) {
        return card.faction || (findTemplate(card)?.faction) || '中立';
    }

    function getImage(card) {
        return card.image || card.icon || (findTemplate(card)?.image) || '/assets/default-avatar.png';
    }

    function getAttack(card) { return card.atk ?? card.base_atk ?? card.baseAtk ?? 0; }
    function getHealth(card) { return card.hp ?? card.base_hp ?? card.baseHp ?? 0; }

    function showCardDetail(card, boardIndex, element, isOwn) {
        cleanupAllRemnants();
        const skillInfo = getSkillFromCard(card);
        const faction = getFaction(card);
        const rarity = card.rarity || 'Common';
        const atk = getAttack(card);
        const hp = getHealth(card);
        const imgSrc = getImage(card);

        const popup = document.createElement('div');
        popup.className = 'card-inspect-popup';
        popup.innerHTML = `
            <div class="inspect-header">
                <img src="${imgSrc}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'">
                <div><h3>${card.name}</h3><span class="rarity-tag rarity-${rarity}">${rarity}</span><span class="faction-tag">${faction}</span></div>
            </div>
            <div class="inspect-stats"><span>⚔️ ${atk}</span><span>🛡️ ${hp}</span>${!isOwn?'<span style="color:#ffd966;">👁️ 敌方</span>':''}</div>
            ${skillInfo?`<div class="inspect-skill"><div class="skill-title">✨ ${skillInfo.name}</div><div class="skill-desc">${skillInfo.desc}</div></div>`:'<div class="inspect-skill">无技能</div>'}
        `;
        Object.assign(popup.style, {
            position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
            background:'rgba(20,30,50,0.95)',color:'#fff',borderRadius:'16px',
            padding:'20px',zIndex:'100002',width:'280px',maxWidth:'90vw',
            boxShadow:'0 8px 24px rgba(0,0,0,0.6)',border:'1px solid #ffd966',
            backdropFilter:'blur(8px)'
        });
        document.body.appendChild(popup);
        const close = (e) => { if(!popup.contains(e.target)){ popup.remove(); document.removeEventListener('pointerdown',close); } };
        setTimeout(()=> document.addEventListener('pointerdown',close), 0);
    }

    // 完全避免拖拽时触发
    let pressTimer, startX, startY, moved;
    const THRESHOLD = 5, LONG = 300;

    function downHandler(e) {
        if (window.__yyIsDragging) return;                    // 拖拽中直接忽略
        const cardEl = e.target.closest('.card');
        if (!cardEl || cardEl.classList.contains('empty-slot')) return;
        const slot = cardEl.closest('.card-slot');
        const board = cardEl.closest('.board');
        if (!slot || !board || (board.id!=='my-board'&&board.id!=='enemy-board')) return;

        startX = e.clientX; startY = e.clientY; moved = false;
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
            if (!moved && !window.__yyIsDragging) {
                const idx = parseInt(slot.getAttribute('data-board-index'));
                const pid = board.getAttribute('data-player-id');
                const gs = window.YYCardBattle?.getGameState?.();
                const card = gs?.players?.[pid]?.board?.[idx];
                if (card) showCardDetail(card, idx, cardEl, pid === window.YYCardAuth?.currentUser?.id);
            }
        }, LONG);
        document.addEventListener('pointermove', moveHandler, true);
        document.addEventListener('pointerup', upHandler, true);
    }

    function moveHandler(e) {
        if (Math.abs(e.clientX-startX)>THRESHOLD || Math.abs(e.clientY-startY)>THRESHOLD) {
            moved = true; clearTimeout(pressTimer);
            removeListeners();
        }
    }

    function upHandler(e) {
        if (pressTimer && !moved && !window.__yyIsDragging) {
            clearTimeout(pressTimer);
            const cardEl = e.target.closest('.card');
            const slot = cardEl?.closest('.card-slot');
            const board = cardEl?.closest('.board');
            if (slot && board && (board.id==='my-board'||board.id==='enemy-board') && !cardEl.classList.contains('empty-slot')) {
                const idx = parseInt(slot.getAttribute('data-board-index'));
                const pid = board.getAttribute('data-player-id');
                const gs = window.YYCardBattle?.getGameState?.();
                const card = gs?.players?.[pid]?.board?.[idx];
                if (card) showCardDetail(card, idx, cardEl, pid === window.YYCardAuth?.currentUser?.id);
            }
        }
        removeListeners();
    }

    function removeListeners() {
        document.removeEventListener('pointermove', moveHandler, true);
        document.removeEventListener('pointerup', upHandler, true);
    }

    function init() {
        cleanupAllRemnants();
        document.addEventListener('pointerdown', downHandler, true);
        console.log('✅ 卡牌查看系统（拖拽兼容）');
    }

    return { init, cleanupAllRemnants };
})();

// ==================== 战斗工具模块 (aniutils.js) ====================
// 提供调试面板、DOM 查询、浮动文字、属性更新、敌方棋盘渲染、卡牌配置加载等基础功能
window.YYCombatUtils = (function() {
    let _combatLogText = '';

    // ---------- 卡牌展示配置（从 /data/image.json 加载） ----------
    let cardConfig = {};
    let cardConfigPromise = null;

    async function loadCardConfig() {
        if (cardConfigPromise) return cardConfigPromise;
        cardConfigPromise = (async () => {
            try {
                const res = await fetch('/data/image.json');
                if (res.ok) {
                    cardConfig = await res.json();
                    // 同步给 3D 模块（如果存在）
                    if (window.YYCombat3D) {
                        window.YYCombat3D.setCardConfig(cardConfig);
                    }
                }
            } catch (e) {}
        })();
        return cardConfigPromise;
    }

    function getCardDisplay(card) {
        const id = card?.card_id || card?.cardId || '';
        const cfg = cardConfig[id] || {};
        return {
            name: cfg.name || card?.name || id || '未知',
            image: cfg.image || card?.image || `/assets/card/${id}.png`
        };
    }

    // ---------- 调试面板 ----------
    function ensureDebugPanel() {
        if (document.getElementById('combat-debug-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'combat-debug-panel';
        panel.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; max-height: 35vh;
            overflow-y: auto; background: transparent; color: #0f0;
            font-family: monospace; font-size: 11px; padding: 4px 6px;
            z-index: 99999; border: none; pointer-events: auto;
            text-shadow: 0 0 3px #000, 0 0 3px #000;
        `;
        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px;';
        const title = document.createElement('span');
        title.textContent = '🐵 动画调试';
        title.style.cssText = 'font-weight:bold; color:#ff0; text-shadow: 0 0 3px #000;';
        header.appendChild(title);
        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display:flex; gap:6px;';
        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = '▲ 隐藏';
        toggleBtn.style.cssText = `
            background: rgba(0,0,0,0.5); color: #fff; border: 1px solid #555;
            padding: 2px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;
        `;
        const content = document.createElement('div');
        content.id = 'combat-debug-content';
        content.style.cssText = 'margin-top:6px; white-space:pre-wrap; word-break:break-all; background: transparent;';
        toggleBtn.onclick = () => {
            content.style.display = content.style.display === 'none' ? '' : 'none';
            toggleBtn.textContent = content.style.display === 'none' ? '▼ 展开' : '▲ 隐藏';
        };
        btnGroup.appendChild(toggleBtn);
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 复制';
        copyBtn.style.cssText = `
            background: rgba(0,255,0,0.7); color: #000; border: none;
            padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; cursor: pointer;
        `;
        copyBtn.onclick = () => {
            if (!_combatLogText) { alert('无日志'); return; }
            if (navigator.clipboard) {
                navigator.clipboard.writeText(_combatLogText);
            } else {
                const ta = document.createElement('textarea');
                ta.value = _combatLogText;
                ta.style.cssText = 'position:fixed;top:-9999px;';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            copyBtn.textContent = '✅';
            setTimeout(() => { copyBtn.textContent = '📋 复制'; }, 1500);
        };
        btnGroup.appendChild(copyBtn);
        header.appendChild(btnGroup);
        panel.appendChild(header);
        panel.appendChild(content);
        document.body.appendChild(panel);
    }

    function debugLog(msg) {
        _combatLogText += msg + '\n';
        ensureDebugPanel();
        const c = document.getElementById('combat-debug-content');
        if (!c) return;
        const l = document.createElement('div');
        l.textContent = msg;
        c.appendChild(l);
        const panel = document.getElementById('combat-debug-panel');
        if (panel) panel.scrollTop = panel.scrollHeight;
    }

    function clearDebug() {
        _combatLogText = '';
        const c = document.getElementById('combat-debug-content');
        if (c) c.innerHTML = '';
    }

    // ---------- 敌方棋盘位置映射 ----------
    const ENEMY_DATA_TO_VISUAL = { 0:3, 1:4, 2:5, 3:0, 4:1, 5:2 };

    // ---------- DOM 查询 ----------
    function getSlotElement(playerId, dataPos, isEnemy) {
        const board = document.querySelector(`.board[data-player-id="${playerId}"]`);
        if (!board) return null;
        let slot = board.querySelector(`.card-slot[data-board-index="${dataPos}"]`);
        if (slot) return slot;
        if (isEnemy) {
            const v = ENEMY_DATA_TO_VISUAL[dataPos];
            if (v !== undefined) {
                slot = board.querySelector(`.card-slot[data-board-index="${v}"]`);
                if (slot) return slot;
            }
        }
        slot = board.querySelector(`.card-slot[data-slot-index="${dataPos}"]`);
        return slot;
    }

    function getCardElement(playerId, dataPos, isEnemy) {
        const slot = getSlotElement(playerId, dataPos, isEnemy);
        if (!slot) return null;
        return slot.querySelector('.card:not(.empty-slot)');
    }

    async function getCardElementRetry(playerId, dataPos, isEnemy, maxRetries = 5) {
        for (let i = 0; i < maxRetries; i++) {
            const el = getCardElement(playerId, dataPos, isEnemy);
            if (el) return el;
            if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 120));
        }
        return null;
    }

    async function getSlotPositionRetry(playerId, dataPos, isEnemy, maxRetries = 5) {
        for (let i = 0; i < maxRetries; i++) {
            const slot = getSlotElement(playerId, dataPos, isEnemy);
            if (slot) return slot;
            if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 120));
        }
        return null;
    }

    // ---------- 卡牌属性更新 ----------
    function updateCardStats(el, atkGain, hpGain, shieldDelta = 0) {
        const atkEl = el.querySelector('.card-atk');
        const hpEl = el.querySelector('.card-hp');
        if (atkEl && atkGain !== undefined && atkGain !== 0) {
            const cur = parseInt(atkEl.textContent.replace(/\D/g, ''), 10) || 0;
            atkEl.textContent = `${cur + atkGain}`;
        }
        if (hpEl && hpGain !== undefined && hpGain !== 0) {
            const cur = parseInt(hpEl.textContent.replace(/\D/g, ''), 10) || 0;
            hpEl.textContent = `${cur + hpGain}`;
        }
        if (shieldDelta !== 0) {
            const shieldEl = el.querySelector('.card-shield span');
            if (shieldEl) {
                const curShield = parseInt(shieldEl.textContent) || 0;
                const newShield = Math.max(0, curShield + shieldDelta);
                shieldEl.textContent = newShield;
                const shieldContainer = el.querySelector('.card-shield');
                if (shieldContainer && newShield <= 0) shieldContainer.style.display = 'none';
            }
        }
    }

    function clampDisplay(val) {
        if (val > 9999) return '9999';
        return String(val);
    }

    // ---------- 浮动文字 ----------
    function floatingText(el, text, color, duration, offsetYPercent = 0) {
        if (!el) return;
        const d = document.createElement('div');
        d.textContent = text;
        d.style.cssText = `position:absolute; color:${color}; font-size:25px; font-weight:normal; text-shadow:0 0 6px #000; z-index:200; left:50%; top:${30 + offsetYPercent}%; transform:translate(-50%,-50%); animation:damageFloat ${duration}ms forwards; pointer-events:none;`;
        const relativeParent = el.closest('.card, .board, .hand-container, .gold-display');
        if (relativeParent && getComputedStyle(relativeParent).position !== 'static') {
            relativeParent.style.position = 'relative';
            relativeParent.appendChild(d);
        } else {
            el.style.position = 'relative';
            el.appendChild(d);
        }
        setTimeout(() => d.remove(), duration);
    }

    function showFloatTextOnBody(text, color, duration) {
        const div = document.createElement('div');
        div.textContent = text;
        div.style.cssText = `
            position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%);
            color: ${color}; font-size: 32px; font-weight: bold;
            text-shadow: 0 0 8px #000; z-index: 3000; pointer-events: none;
            animation: damageFloat ${duration}ms forwards;
        `;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), duration);
    }

    // ---------- 等待敌方棋盘 ----------
    async function waitForEnemyBoard(oppId) {
        const start = Date.now();
        while (Date.now() - start < 2000) {
            const board = document.querySelector(`.board[data-player-id="${oppId}"]`);
            if (board && board.querySelectorAll('.card-slot').length === 6) {
                await new Promise(r => requestAnimationFrame(r));
                return true;
            }
            await new Promise(r => setTimeout(r, 40));
        }
        return false;
    }

    // ---------- 渲染敌方棋盘（从原始数据）----------
    function renderEnemyBoardFromData(oppId, oppBoardData) {
        const enemyBoard = document.getElementById('enemy-board');
        if (!enemyBoard) return;

        if (window.YYCardRender && typeof window.YYCardRender.renderBoard === 'function') {
            const rawBoard = Array.isArray(oppBoardData) ? oppBoardData.slice(0, 6) : [];
            while (rawBoard.length < 6) rawBoard.push(null);
            const displayBoard = [rawBoard[3], rawBoard[4], rawBoard[5], rawBoard[0], rawBoard[1], rawBoard[2]];
            window.YYCardRender.renderBoard('enemy-board', displayBoard, false);
        } else {
            enemyBoard.setAttribute('data-player-id', oppId);
            enemyBoard.innerHTML = '';
            const board = Array.isArray(oppBoardData) ? oppBoardData.slice(0, 6) : [];
            while (board.length < 6) board.push(null);
            const displayBoard = [board[3], board[4], board[5], board[0], board[1], board[2]];
            for (let i = 0; i < 6; i++) {
                const c = displayBoard[i];
                const slot = document.createElement('div');
                slot.className = 'card-slot';
                slot.setAttribute('data-slot-index', i);
                const dataIndex = i < 3 ? i + 3 : i - 3;
                slot.setAttribute('data-board-index', dataIndex);
                if (c && typeof c === 'object' && (c.card_id || c.cardId) && (c.hp + (c.tempHp || 0)) > 0) {
                    const display = getCardDisplay(c);
                    const el = document.createElement('div');
                    el.className = 'card';
                    el.setAttribute('data-rarity', c.rarity || 'Common');
                    el.setAttribute('data-star', c.star || 0);
                    const totalAtk = (c.atk || 0) + (c.tempAtk || 0);
                    const totalHp = (c.hp || 0) + (c.tempHp || 0);
                    el.innerHTML = `
                        <div class="card-frame"></div>
                        <div class="card-icon"><img src="${display.image}" alt="${display.name}" onerror="this.src='/assets/default-avatar.png'"></div>
                        <div class="card-name">${display.name}</div>
                        <div class="card-stats"><span class="card-atk">${totalAtk}</span><span class="card-hp">${totalHp}</span></div>
                    `;
                    if (c.shield > 0 || (c.tempShield || 0) > 0) {
                        const shieldDiv = document.createElement('div');
                        shieldDiv.className = 'card-shield';
                        shieldDiv.innerHTML = `<span>${c.shield || c.tempShield || 0}</span>`;
                        el.appendChild(shieldDiv);
                    }
                    const img = el.querySelector('img');
                    if (img) img.draggable = false;
                    slot.appendChild(el);
                } else {
                    slot.innerHTML = '<div class="card empty-slot">⬤</div>';
                }
                enemyBoard.appendChild(slot);
            }
        }

        enemyBoard.setAttribute('data-player-id', oppId);
        debugLog(`🔧 敌方棋盘已渲染，对手ID: ${oppId.slice(0,8)}`);
    }

    // 立即加载卡牌配置（但不等待）
    loadCardConfig();

    // 暴露公共 API
    return {
        loadCardConfig,
        getCardDisplay,
        ensureDebugPanel,
        debugLog,
        clearDebug,
        getSlotElement,
        getCardElement,
        getCardElementRetry,
        getSlotPositionRetry,
        updateCardStats,
        clampDisplay,
        floatingText,
        showFloatTextOnBody,
        waitForEnemyBoard,
        renderEnemyBoardFromData,
        ENEMY_DATA_TO_VISUAL, // 常量，方便外部使用
    };
})();

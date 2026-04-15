// ==================== 战斗模拟模块（侧边滚动日志面板） ====================
window.YYCardCombat = (function() {
    const config = window.YYCardConfig;

    // 创建侧边滚动日志面板（保留最近20条战斗记录）
    function ensureLogPanel() {
        let panel = document.getElementById('combat-scroll-log');
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = 'combat-scroll-log';
        panel.style.cssText = `
            position: fixed; top: 60px; right: 10px; width: 300px; max-height: 70vh;
            background: rgba(0, 0, 0, 0.75); color: #0f0; font-size: 12px;
            padding: 10px; border-radius: 8px; border: 1px solid #0f0;
            overflow-y: auto; z-index: 100002; font-family: monospace;
            pointer-events: auto; box-shadow: 0 0 10px rgba(0,0,0,0.5);
            white-space: pre-wrap; line-height: 1.5;
        `;
        panel.innerHTML = '<div style="color:#ff0; text-align:center;">⚔️ 战斗日志 ⚔️</div>';
        document.body.appendChild(panel);
        return panel;
    }

    // 向面板追加一条战斗记录
    function appendLogEntry(text) {
        const panel = ensureLogPanel();
        const entry = document.createElement('div');
        entry.style.cssText = 'border-bottom: 1px solid #333; margin-bottom: 8px; padding-bottom: 8px;';
        entry.innerHTML = text.replace(/\n/g, '<br>');
        panel.appendChild(entry);
        // 自动滚动到底部
        panel.scrollTop = panel.scrollHeight;
        // 保留最近20条
        while (panel.children.length > 21) { // 包括标题行
            panel.removeChild(panel.children[1]);
        }
    }

    // 真人优先配对
    function pairPlayers(players) {
        const entries = Object.entries(players).filter(([id, p]) => p.health > 0 && !p.isEliminated);
        const humans = entries.filter(([id, p]) => !p.isBot);
        const bots = entries.filter(([id, p]) => p.isBot);

        const humanIds = humans.map(([id]) => id);
        for (let i = humanIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [humanIds[i], humanIds[j]] = [humanIds[j], humanIds[i]];
        }

        const botIds = bots.map(([id]) => id);
        for (let i = botIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [botIds[i], botIds[j]] = [botIds[j], botIds[i]];
        }

        const pairs = [];
        for (let i = 0; i < humanIds.length; i += 2) {
            if (i + 1 < humanIds.length) {
                pairs.push([humanIds[i], humanIds[i+1]]);
            } else {
                pairs.push([humanIds[i], botIds.shift() || null]);
            }
        }
        for (let i = 0; i < botIds.length; i += 2) {
            pairs.push([botIds[i], botIds[i+1] || null]);
        }
        return pairs;
    }

    function getCardDamageValue(card) {
        switch (card.rarity) {
            case 'Common': return 1;
            case 'Rare': return 2;
            case 'Epic': return 3;
            case 'Legendary': return 5;
            default: return 1;
        }
    }

    function findTarget(attackerPos, enemyUnits) {
        const tablePos = attackerPos + 1;
        const priority = config.BOARD.ENEMY_PRIORITY[tablePos];
        if (!priority) return null;
        const hasFrontAlive = enemyUnits.some(u => u.position < 3 && u.hp > 0);
        for (const targetPos of priority) {
            const targetIndex = targetPos - 1;
            if (hasFrontAlive && targetIndex >= 3) continue;
            const target = enemyUnits.find(u => u.position === targetIndex && u.hp > 0);
            if (target) return target;
        }
        return null;
    }

    function cloneCard(card) {
        if (!card) return null;
        return {
            ...card,
            hp: Number(card.hp),
            atk: Number(card.atk),
            instanceId: card.instanceId || Math.random().toString(36)
        };
    }

    function fight(board1, board2) {
        const units1 = [], units2 = [];
        for (let i = 0; i < 6; i++) {
            if (board1[i] && board1[i].hp > 0) {
                const c = cloneCard(board1[i]);
                c.position = i;
                units1.push(c);
            }
            if (board2[i] && board2[i].hp > 0) {
                const c = cloneCard(board2[i]);
                c.position = i;
                units2.push(c);
            }
        }

        if (units1.length === 0 && units2.length === 0) return 0;
        if (units1.length === 0) return 2;
        if (units2.length === 0) return 1;

        const board1First = Math.random() >= 0.5;
        let turn = 0;
        let currentAttackerSide = board1First ? 1 : 2;

        while (units1.length > 0 && units2.length > 0 && turn < 200) {
            const attackerUnits = currentAttackerSide === 1 ? units1 : units2;
            const defenderUnits = currentAttackerSide === 1 ? units2 : units1;

            const sorted = [...attackerUnits].sort((a, b) => a.position - b.position);
            const attacker = sorted[0];
            if (!attacker) break;

            const target = findTarget(attacker.position, defenderUnits);
            if (!target) {
                currentAttackerSide = currentAttackerSide === 1 ? 2 : 1;
                turn++;
                continue;
            }

            target.hp -= attacker.atk;
            if (target.hp <= 0) {
                const idx = defenderUnits.findIndex(u => u.instanceId === target.instanceId);
                if (idx !== -1) defenderUnits.splice(idx, 1);
            }

            currentAttackerSide = currentAttackerSide === 1 ? 2 : 1;
            turn++;
        }

        if (units1.length > 0 && units2.length === 0) return 1;
        if (units2.length > 0 && units1.length === 0) return 2;
        return 0;
    }

    async function resolveBattles(gameState, log, updateCallback) {
        const pairs = pairPlayers(gameState.players);
        gameState.battlePairs = pairs;

        // 构建日志文本
        let logText = `【回合 ${gameState.round}】\n`;
        logText += `配对: ${pairs.map(p => p[1] ? `${p[0].slice(0,6)} vs ${p[1].slice(0,6)}` : `${p[0].slice(0,6)} 轮空`).join(' | ')}\n`;

        for (const [p1Id, p2Id] of pairs) {
            const p1 = gameState.players[p1Id];
            if (p2Id === null) continue;
            const p2 = gameState.players[p2Id];

            const board1 = p1.board.map(c => cloneCard(c));
            const board2 = p2.board.map(c => cloneCard(c));

            const isHumanVsHuman = !p1.isBot && !p2.isBot;
            const vsType = isHumanVsHuman ? '★真人vs真人★' : `${p1.isBot?'🤖':'👤'} vs ${p2.isBot?'🤖':'👤'}`;
            logText += `\n${vsType}\n`;
            logText += `A(${p1Id.slice(0,6)}): ${board1.map((c,i)=>c?`${c.name}(${i+1})`:'空').join(' ')}\n`;
            logText += `B(${p2Id.slice(0,6)}): ${board2.map((c,i)=>c?`${c.name}(${i+1})`:'空').join(' ')}\n`;

            const winner = fight(board1, board2);

            if (winner === 0) {
                logText += `→ 平局，各扣2点\n`;
                p1.health = Math.max(0, p1.health - 2);
                p2.health = Math.max(0, p2.health - 2);
                if (p1.health <= 0) p1.isEliminated = true;
                if (p2.health <= 0) p2.isEliminated = true;
                continue;
            }

            const winnerPlayer = winner === 1 ? p1 : p2;
            const loserPlayer = winner === 1 ? p2 : p1;
            const winnerBoard = winner === 1 ? board1 : board2;

            const level = winnerPlayer.shopLevel;
            const survivorBonus = winnerBoard.filter(c => c && c.hp > 0).reduce((s, c) => s + getCardDamageValue(c), 0);
            const damage = level + survivorBonus;

            loserPlayer.health = Math.max(0, loserPlayer.health - damage);
            
            logText += `→ ${winner === 1 ? 'A' : 'B'}胜利，扣血${damage} (等级${level}+额外${survivorBonus})，败方剩${loserPlayer.health}\n`;

            if (loserPlayer.health <= 0) {
                loserPlayer.isEliminated = true;
                logText += `☠️ 淘汰\n`;
            }
        }

        // 输出到侧边面板和控制台
        appendLogEntry(logText);
        console.log(logText);

        if (updateCallback) await updateCallback();
    }

    return { pairPlayers, fight, resolveBattles, getCardDamageValue };
})();
console.log('✅ combat.js 侧边滚动日志面板版');

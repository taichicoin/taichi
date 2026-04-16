// ==================== 战斗模拟模块（修复扣血停止 + 调试日志） ====================
window.YYCardCombat = (function() {
    const config = window.YYCardConfig;

    function ensureLogPanel() {
        let panel = document.getElementById('combat-scroll-log');
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = 'combat-scroll-log';
        panel.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; max-height: 35vh;
            background: transparent; color: #0f0; font-size: 12px;
            padding: 6px 10px; z-index: 100002; font-family: monospace;
            pointer-events: auto; text-shadow: 0 0 4px black;
            overflow-y: auto; white-space: pre-wrap; line-height: 1.4;
            border-bottom: 1px solid #0f0;
        `;
        panel.innerHTML = '<div style="color:#0f0; text-align:center;">⚔️ 战斗日志 (调试模式) ⚔️</div>';
        document.body.appendChild(panel);
        return panel;
    }

    function appendLogEntry(text) {
        const panel = ensureLogPanel();
        const entry = document.createElement('div');
        entry.style.cssText = 'border-bottom: 1px solid #0f0; margin-bottom: 4px; padding-bottom: 4px;';
        entry.innerHTML = text.replace(/\n/g, '<br>');
        panel.appendChild(entry);
        panel.scrollTop = panel.scrollHeight;
        while (panel.children.length > 25) {
            panel.removeChild(panel.children[1]);
        }
    }

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

    function fight(board1, board2, logCallback) {
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
        if (logCallback) logCallback(`🎲 先手: ${board1First ? 'A' : 'B'}`);

        let turn = 0;
        let currentAttackerSide = board1First ? 1 : 2;
        const maxTurns = 200;

        while (units1.length > 0 && units2.length > 0 && turn < maxTurns) {
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
            if (logCallback) {
                logCallback(`  ⚡ ${attacker.name}(${attacker.position+1}) → ${target.name}(${target.position+1}) 伤害${attacker.atk} 剩余${target.hp}`);
            }

            if (target.hp <= 0) {
                const idx = defenderUnits.findIndex(u => u.instanceId === target.instanceId);
                if (idx !== -1) defenderUnits.splice(idx, 1);
                if (logCallback) logCallback(`  💀 ${target.name} 倒下`);
            }

            currentAttackerSide = currentAttackerSide === 1 ? 2 : 1;
            turn++;
        }

        if (units1.length > 0 && units2.length === 0) return 1;
        if (units2.length > 0 && units1.length === 0) return 2;
        return 0;
    }

    async function resolveBattles(gameState, log, updateCallback) {
        // 强制刷新 UI，确保显示最新数据
        if (window.YYCardShop?.refreshAllUI) {
            window.YYCardShop.refreshAllUI();
        }

        const players = gameState.players;
        const pairs = pairPlayers(players);
        gameState.battlePairs = pairs;

        let logText = `【回合 ${gameState.round}】\n配对: ${pairs.map(p => p[1] ? `${p[0].slice(0,6)} vs ${p[1].slice(0,6)}` : `${p[0].slice(0,6)} 轮空`).join(' | ')}\n`;

        for (const [p1Id, p2Id] of pairs) {
            const p1 = players[p1Id];
            if (p2Id === null) {
                logText += `🎲 ${p1Id.slice(0,6)} 轮空\n`;
                continue;
            }
            const p2 = players[p2Id];

            const board1 = p1.board.map(c => cloneCard(c));
            const board2 = p2.board.map(c => cloneCard(c));

            const isHumanVsHuman = !p1.isBot && !p2.isBot;
            const vsType = isHumanVsHuman ? '★真人vs真人★' : `${p1.isBot?'🤖':'👤'} vs ${p2.isBot?'🤖':'👤'}`;
            logText += `\n${vsType}\n`;
            logText += `A(${p1Id.slice(0,6)}): ${board1.map((c,i)=>c?`[${i+1}]${c.name}(${c.hp}/${c.atk})`:`[${i+1}]空`).join(' ')}\n`;
            logText += `B(${p2Id.slice(0,6)}): ${board2.map((c,i)=>c?`[${i+1}]${c.name}(${c.hp}/${c.atk})`:`[${i+1}]空`).join(' ')}\n`;

            const winner = fight(board1, board2, (msg) => logText += msg + '\n');

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

            // 调试日志：打印存活单位及额外伤害明细
            const survivors = winnerBoard.filter(c => c && c.hp > 0);
            logText += `🏆 胜方存活: ${survivors.map(c => `${c.name}(${getCardDamageValue(c)})`).join(' ') || '无'}\n`;
            logText += `💥 伤害 = 等级${level} + 额外${survivorBonus} = ${damage}\n`;

            loserPlayer.health = Math.max(0, loserPlayer.health - damage);
            logText += `💔 ${loserPlayer === p1 ? p1Id.slice(0,6) : p2Id.slice(0,6)} 剩余血量: ${loserPlayer.health}\n`;

            if (loserPlayer.health <= 0) {
                loserPlayer.isEliminated = true;
                logText += `☠️ 淘汰\n`;
            }
        }

        appendLogEntry(logText);
        console.log(logText);

        if (updateCallback) await updateCallback();
    }

    return { pairPlayers, fight, resolveBattles, getCardDamageValue };
})();
console.log('✅ combat.js 调试版（查看扣血细节）');

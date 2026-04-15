// ==================== 战斗模拟模块（极简日志版） ====================
window.YYCardCombat = (function() {
    const config = window.YYCardConfig;

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

        for (const [p1Id, p2Id] of pairs) {
            const p1 = gameState.players[p1Id];
            if (p2Id === null) continue;
            const p2 = gameState.players[p2Id];

            const board1 = p1.board.map(c => cloneCard(c));
            const board2 = p2.board.map(c => cloneCard(c));

            // ===== 极简日志：只显示双方棋盘 =====
            const isHumanVsHuman = !p1.isBot && !p2.isBot;
            if (isHumanVsHuman) {
                log(`═══════════════════════════════════`);
                log(`⚔️ 真人 vs 真人 ⚔️`);
            } else {
                log(`───────────────────────────────`);
                log(`⚔️ ${p1.isBot ? '人机' : '真人'} vs ${p2.isBot ? '人机' : '真人'}`);
            }

            // 显示我方棋盘
            const myBoardStr = board1.map((c, i) => c ? `${c.name}(${i+1}) ${c.hp}/${c.atk}` : `空(${i+1})`).join(' | ');
            log(`📊 我方: ${myBoardStr}`);

            // 显示敌方棋盘
            const enemyBoardStr = board2.map((c, i) => c ? `${c.name}(${i+1}) ${c.hp}/${c.atk}` : `空(${i+1})`).join(' | ');
            log(`📊 敌方: ${enemyBoardStr}`);

            const winner = fight(board1, board2);

            if (winner === 0) {
                log(`💔 结果: 平局，各扣2点`);
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
            
            const winnerName = winner === 1 ? '我方' : '敌方';
            const loserName = winner === 1 ? '敌方' : '我方';
            log(`🏆 结果: ${winnerName}胜利，扣血 ${damage} (等级${level}+额外${survivorBonus})`);
            log(`💔 ${loserName}剩余血量: ${loserPlayer.health}`);

            if (loserPlayer.health <= 0) {
                loserPlayer.isEliminated = true;
                log(`☠️ ${loserName}淘汰`);
            }
        }
        if (updateCallback) await updateCallback();
    }

    return { pairPlayers, fight, resolveBattles, getCardDamageValue };
})();
console.log('✅ combat.js 极简日志版');

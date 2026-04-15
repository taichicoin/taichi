// ==================== 战斗模拟模块（真人强制配对版） ====================
window.YYCardCombat = (function() {
    const config = window.YYCardConfig;

    // 配对：强制真人优先互相对战
    function pairPlayers(players) {
        const entries = Object.entries(players).filter(([id, p]) => p.health > 0 && !p.isEliminated);
        const humans = entries.filter(([id, p]) => !p.isBot);
        const bots = entries.filter(([id, p]) => p.isBot);

        // 真人随机打乱
        const humanIds = humans.map(([id]) => id);
        for (let i = humanIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [humanIds[i], humanIds[j]] = [humanIds[j], humanIds[i]];
        }

        // 机器人随机打乱
        const botIds = bots.map(([id]) => id);
        for (let i = botIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [botIds[i], botIds[j]] = [botIds[j], botIds[i]];
        }

        // 构建配对：真人两两配对，剩余与人机或轮空
        const pairs = [];
        for (let i = 0; i < humanIds.length; i += 2) {
            if (i + 1 < humanIds.length) {
                pairs.push([humanIds[i], humanIds[i+1]]);
            } else {
                if (botIds.length > 0) {
                    pairs.push([humanIds[i], botIds.shift()]);
                } else {
                    pairs.push([humanIds[i], null]);
                }
            }
        }

        // 剩余机器人配对
        for (let i = 0; i < botIds.length; i += 2) {
            pairs.push([botIds[i], botIds[i+1] || null]);
        }

        // 输出真人配对结果便于验证
        const humanPairs = pairs.filter(p => {
            const p1Human = humans.some(([id]) => id === p[0]);
            const p2Human = p[1] && humans.some(([id]) => id === p[1]);
            return p1Human && p2Human;
        });
        console.log('👥 真人配对结果:', humanPairs);

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

        console.log('🔍 棋盘1:', board1.map(c => c ? `${c.name}(${c.hp})` : '空'));
        console.log('🔍 棋盘2:', board2.map(c => c ? `${c.name}(${c.hp})` : '空'));

        if (units1.length === 0 && units2.length === 0) return 0;
        if (units1.length === 0) return 2;
        if (units2.length === 0) return 1;

        const board1First = Math.random() >= 0.5;
        if (logCallback) {
            logCallback(`🎲 先手: ${board1First ? '我方' : '敌方'}`);
            logCallback(`📊 我方(${units1.length}): ${units1.map(u => `${u.name}(${u.position+1}) HP:${u.hp} ATK:${u.atk}`).join(' | ')}`);
            logCallback(`📊 敌方(${units2.length}): ${units2.map(u => `${u.name}(${u.position+1}) HP:${u.hp} ATK:${u.atk}`).join(' | ')}`);
        }

        let turn = 0;
        let currentAttackerSide = board1First ? 1 : 2;

        while (units1.length > 0 && units2.length > 0) {
            const attackerUnits = currentAttackerSide === 1 ? units1 : units2;
            const defenderUnits = currentAttackerSide === 1 ? units2 : units1;

            const sorted = [...attackerUnits].sort((a, b) => a.position - b.position);
            const attacker = sorted[0];
            if (!attacker) break;

            const target = findTarget(attacker.position, defenderUnits);
            if (!target) {
                currentAttackerSide = currentAttackerSide === 1 ? 2 : 1;
                turn++;
                if (turn > 200) break;
                continue;
            }

            target.hp -= attacker.atk;
            if (logCallback) {
                logCallback(`  ⚡ [${currentAttackerSide === 1 ? '我方' : '敌方'}] ${attacker.name}(${attacker.position+1}) → ${target.name}(${target.position+1}) 伤害 ${attacker.atk}，剩余 ${target.hp}`);
            }

            if (target.hp <= 0) {
                const idx = defenderUnits.findIndex(u => u.instanceId === target.instanceId);
                if (idx !== -1) defenderUnits.splice(idx, 1);
                if (logCallback) logCallback(`  💀 ${target.name} 倒下`);
            }

            currentAttackerSide = currentAttackerSide === 1 ? 2 : 1;
            turn++;
            if (turn > 200) break;
        }

        if (units1.length > 0 && units2.length === 0) return 1;
        if (units2.length > 0 && units1.length === 0) return 2;
        return 0;
    }

    async function resolveBattles(gameState, log, updateCallback) {
        const pairs = pairPlayers(gameState.players);
        gameState.battlePairs = pairs;
        log(`🔄 本回合配对: ${JSON.stringify(pairs)}`);

        for (const [p1Id, p2Id] of pairs) {
            const p1 = gameState.players[p1Id];
            if (p2Id === null) { log(`🎲 ${p1Id} 轮空`); continue; }
            const p2 = gameState.players[p2Id];

            const board1 = p1.board.map(c => cloneCard(c));
            const board2 = p2.board.map(c => cloneCard(c));

            log(`⚔️ ${p1Id} vs ${p2Id}`);
            const winner = fight(board1, board2, (msg) => log(msg));

            if (winner === 0) {
                log(`💔 平局，各扣2点`);
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
            log(`💥 伤害 = 等级${level} + 额外${survivorBonus} = ${damage}，${loserPlayer === p1 ? p1Id : p2Id} 剩余血量 ${loserPlayer.health}`);
            if (loserPlayer.health <= 0) { loserPlayer.isEliminated = true; log(`☠️ 淘汰`); }
        }
        if (updateCallback) await updateCallback();
    }

    return { pairPlayers, fight, resolveBattles, getCardDamageValue };
})();
console.log('✅ combat.js 真人强制配对版');

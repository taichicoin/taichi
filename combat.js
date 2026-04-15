// ==================== 战斗模拟模块（最终加固版） ====================
window.YYCardCombat = (function() {
    const config = window.YYCardConfig;

    // 随机配对存活玩家
    function pairPlayers(players) {
        const alive = Object.entries(players)
            .filter(([id, p]) => p.health > 0 && !p.isEliminated)
            .map(([id]) => id);
        
        for (let i = alive.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [alive[i], alive[j]] = [alive[j], alive[i]];
        }
        
        const pairs = [];
        for (let i = 0; i < alive.length; i += 2) {
            if (i + 1 < alive.length) {
                pairs.push([alive[i], alive[i + 1]]);
            } else {
                pairs.push([alive[i], null]);
            }
        }
        return pairs;
    }

    // 稀有度扣血值
    function getCardDamageValue(card) {
        switch (card.rarity) {
            case 'Common': return 1;
            case 'Rare': return 2;
            case 'Epic': return 3;
            case 'Legendary': return 5;
            default: return 1;
        }
    }

    // 寻敌（前排阻挡 + 总纲优先级）
    function findTarget(attackerPos, enemyUnits) {
        const priority = config.BOARD.ENEMY_PRIORITY[attackerPos];
        if (!priority) return null;
        const hasFrontAlive = enemyUnits.some(u => u.position < 3 && u.hp > 0);
        for (const targetPos of priority) {
            if (hasFrontAlive && targetPos >= 3) continue;
            const target = enemyUnits.find(u => u.position === targetPos && u.hp > 0);
            if (target) return target;
        }
        return null;
    }

    // 单场战斗
    function fight(board1, board2, logCallback = null) {
        const units1 = [], units2 = [];
        for (let i = 0; i < 6; i++) {
            if (board1[i] && board1[i].hp > 0) {
                units1.push({ ...board1[i], position: i, instanceId: board1[i].instanceId || Math.random().toString() });
            }
            if (board2[i] && board2[i].hp > 0) {
                units2.push({ ...board2[i], position: i, instanceId: board2[i].instanceId || Math.random().toString() });
            }
        }
        if (units1.length === 0 && units2.length === 0) return 0;
        if (units1.length === 0) return 2;
        if (units2.length === 0) return 1;

        const board1First = Math.random() >= 0.5;
        if (logCallback) logCallback(`🎲 先手: ${board1First ? '我方' : '敌方'}`);

        let turn = 0;
        const maxTurns = 200;
        while (units1.length > 0 && units2.length > 0 && turn < maxTurns) {
            const isBoard1Turn = (board1First && turn % 2 === 0) || (!board1First && turn % 2 === 1);
            const attackerUnits = isBoard1Turn ? units1 : units2;
            const defenderUnits = isBoard1Turn ? units2 : units1;

            const attacker = [...attackerUnits].sort((a, b) => a.position - b.position)[0];
            if (!attacker) break;

            const target = findTarget(attacker.position, defenderUnits);
            if (!target) { turn++; continue; }

            target.hp -= attacker.atk;
            if (logCallback) logCallback(`  ⚡ ${attacker.name}(${attacker.position+1}) → ${target.name}(${target.position+1})，伤害 ${attacker.atk}，剩余 ${target.hp}`);

            if (target.hp <= 0) {
                const idx = defenderUnits.findIndex(u => u.instanceId === target.instanceId);
                if (idx !== -1) defenderUnits.splice(idx, 1);
                if (logCallback) logCallback(`  💀 ${target.name} 倒下`);
            }
            turn++;
        }
        if (units1.length > 0 && units2.length === 0) return 1;
        if (units2.length > 0 && units1.length === 0) return 2;
        return 0;
    }

    // 整局战斗
    async function resolveBattles(gameState, log, updateCallback) {
        // 确保有配对数据
        if (!gameState.battlePairs || gameState.battlePairs.length === 0) {
            log('⚠️ battlePairs 缺失，动态生成');
            gameState.battlePairs = pairPlayers(gameState.players);
        }
        const pairs = gameState.battlePairs;
        log(`🔄 本回合配对: ${JSON.stringify(pairs)}`);

        for (const [p1Id, p2Id] of pairs) {
            const p1 = gameState.players[p1Id];
            if (p2Id === null) {
                log(`🎲 ${p1Id} 轮空`);
                continue;
            }
            const p2 = gameState.players[p2Id];
            const board1 = p1.board.map(c => c ? { ...c, hp: c.hp } : null);
            const board2 = p2.board.map(c => c ? { ...c, hp: c.hp } : null);

            log(`⚔️ ${p1Id} vs ${p2Id}`);
            const winner = fight(board1, board2, (msg) => log(msg));

            if (winner === 0) {
                log(`💔 同归于尽，各扣2点`);
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
            const bonus = winnerBoard.filter(c => c && c.hp > 0).reduce((s, c) => s + getCardDamageValue(c), 0);
            const damage = level + bonus;

            loserPlayer.health = Math.max(0, loserPlayer.health - damage);
            log(`💥 伤害 = 等级${level} + 存活单位${bonus} = ${damage}，${loserPlayer === p1 ? p1Id : p2Id} 剩余 ${loserPlayer.health}`);

            if (loserPlayer.health <= 0) {
                loserPlayer.isEliminated = true;
                log(`☠️ ${loserPlayer === p1 ? p1Id : p2Id} 淘汰`);
            }
        }
        if (updateCallback) await updateCallback();
    }

    return { pairPlayers, fight, resolveBattles, getCardDamageValue };
})();
console.log('✅ combat.js 最终加固版');

// ==================== 战斗模拟模块（完整版：配对兜底、寻敌、真实对战） ====================
window.YYCardCombat = (function() {
    const config = window.YYCardConfig;

    // ---------- 随机配对存活玩家 ----------
    function pairPlayers(players) {
        const alive = Object.entries(players)
            .filter(([id, p]) => p.health > 0 && !p.isEliminated)
            .map(([id]) => id);
        
        // Fisher–Yates 洗牌
        for (let i = alive.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [alive[i], alive[j]] = [alive[j], alive[i]];
        }
        
        const pairs = [];
        for (let i = 0; i < alive.length; i += 2) {
            if (i + 1 < alive.length) {
                pairs.push([alive[i], alive[i + 1]]);
            } else {
                pairs.push([alive[i], null]); // 轮空
            }
        }
        return pairs;
    }

    // ---------- 卡牌稀有度扣血值 ----------
    function getCardDamageValue(card) {
        switch (card.rarity) {
            case 'Common': return 1;
            case 'Rare': return 2;
            case 'Epic': return 3;
            case 'Legendary': return 5;
            default: return 1;
        }
    }

    // ---------- 寻敌函数（前排阻挡 + 总纲优先级）----------
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

    // ---------- 执行单场战斗（返回胜利方：1 表示 board1 胜，2 表示 board2 胜，0 平局）----------
    function fight(board1, board2, logCallback = null) {
        const units1 = [];
        const units2 = [];
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
        if (logCallback) logCallback(`🎲 先手判定: ${board1First ? '我方' : '敌方'}先行动`);
        
        const allUnits = [...units1, ...units2].sort((a, b) => a.position - b.position);
        
        let turn = 0;
        const maxTurns = 200;
        
        while (units1.length > 0 && units2.length > 0 && turn < maxTurns) {
            const isBoard1Turn = (board1First && turn % 2 === 0) || (!board1First && turn % 2 === 1);
            const attackerUnits = isBoard1Turn ? units1 : units2;
            const defenderUnits = isBoard1Turn ? units2 : units1;
            
            const sortedAttackers = [...attackerUnits].sort((a, b) => a.position - b.position);
            const attacker = sortedAttackers[0];
            if (!attacker) break;
            
            const target = findTarget(attacker.position, defenderUnits);
            if (!target) { turn++; continue; }
            
            const damage = attacker.atk;
            target.hp -= damage;
            if (logCallback) logCallback(`  ⚡ ${attacker.name}(${attacker.position+1}) 攻击 ${target.name}(${target.position+1})，造成 ${damage} 伤害，剩余 ${target.hp}`);
            
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

    // ---------- 执行整局战斗（处理所有配对，直接修改玩家状态）----------
    async function resolveBattles(gameState, log, updateCallback) {
        // ===== 兜底：如果没有 battlePairs，则当场生成 =====
        if (!gameState.battlePairs || gameState.battlePairs.length === 0) {
            log('⚠️ battlePairs 缺失，动态生成配对');
            gameState.battlePairs = pairPlayers(gameState.players);
        }
        
        const pairs = gameState.battlePairs;
        log(`🔄 本回合对战配对: ${JSON.stringify(pairs)}`);
        
        for (const [p1Id, p2Id] of pairs) {
            const p1 = gameState.players[p1Id];
            
            if (p2Id === null) {
                log(`🎲 玩家 ${p1Id} 轮空，直接获胜`);
                continue;
            }
            
            const p2 = gameState.players[p2Id];
            
            const board1 = p1.board.map(c => c ? { ...c, hp: c.hp } : null);
            const board2 = p2.board.map(c => c ? { ...c, hp: c.hp } : null);
            
            log(`⚔️ 战斗开始: ${p1Id} vs ${p2Id}`);
            
            const winner = fight(board1, board2, (msg) => log(msg));
            
            if (winner === 0) {
                log(`⚔️ 双方同归于尽，各扣 2 点伤害`);
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
            const survivorBonus = winnerBoard
                .filter(c => c && c.hp > 0)
                .reduce((sum, c) => sum + getCardDamageValue(c), 0);
            const damage = level + survivorBonus;
            
            loserPlayer.health = Math.max(0, loserPlayer.health - damage);
            log(`💥 胜利方等级 ${level} + 存活单位额外伤害 ${survivorBonus} = ${damage} 点伤害`);
            log(`💔 ${loserPlayer === p1 ? p1Id : p2Id} 剩余血量: ${loserPlayer.health}`);
            
            if (loserPlayer.health <= 0) {
                loserPlayer.isEliminated = true;
                log(`☠️ 玩家已被淘汰`);
            }
        }
        
        if (updateCallback) await updateCallback();
    }

    return {
        pairPlayers,
        fight,
        resolveBattles,
        getCardDamageValue
    };
})();

console.log('✅ combat.js 加载完成（兜底配对 + 真实战斗）');

// ==================== 战斗模拟模块（动画支持版） ====================
window.YYCardCombat = (function() {
    const config = window.YYCardConfig;

    // 日志面板（调试用）
    function ensureLogPanel() { /* 保持原样 */ }
    function appendLogEntry(text) { /* 保持原样 */ }

    // 配对玩家（优先真人）
    function pairPlayers(players) { /* 保持原样 */ }

    // 根据稀有度计算额外伤害值
    function getCardDamageValue(card) { /* 保持原样 */ }

    // 根据攻击位置和敌方单位查找目标（遵循优先级表）
    function findTarget(attackerPos, enemyUnits) { /* 保持原样 */ }

    // 克隆卡牌（用于模拟）
    function cloneCard(card) { /* 保持原样 */ }

    // ========== 新增：生成攻击事件序列（不修改原血量，只计算） ==========
    function generateAttackEvents(board1, board2) {
        // 克隆单位列表
        const units1 = [], units2 = [];
        for (let i = 0; i < 6; i++) {
            if (board1[i] && board1[i].hp > 0) {
                units1.push({
                    ...board1[i],
                    pos: i,
                    hp: board1[i].hp,
                    atk: board1[i].atk,
                    name: board1[i].name,
                    instanceId: board1[i].instanceId
                });
            }
            if (board2[i] && board2[i].hp > 0) {
                units2.push({
                    ...board2[i],
                    pos: i,
                    hp: board2[i].hp,
                    atk: board2[i].atk,
                    name: board2[i].name,
                    instanceId: board2[i].instanceId
                });
            }
        }

        if (units1.length === 0 && units2.length === 0) return { events: [], winner: 0 };
        if (units1.length === 0) return { events: [], winner: 2 };
        if (units2.length === 0) return { events: [], winner: 1 };

        // 随机先手
        let currentSide = Math.random() >= 0.5 ? 1 : 2;
        let turn = 0;
        const maxTurns = 200;
        const events = [];

        while (units1.length > 0 && units2.length > 0 && turn < maxTurns) {
            const attackerUnits = currentSide === 1 ? units1 : units2;
            const defenderUnits = currentSide === 1 ? units2 : units1;

            // 按位置从小到大排序（前排先攻击）
            const sorted = [...attackerUnits].sort((a, b) => a.pos - b.pos);
            const attacker = sorted[0];
            if (!attacker) break;

            const target = findTarget(attacker.pos, defenderUnits);
            if (!target) {
                // 没有合法目标，切换攻击方
                currentSide = currentSide === 1 ? 2 : 1;
                turn++;
                continue;
            }

            const damage = attacker.atk;
            const oldHp = target.hp;
            const newHp = Math.max(0, target.hp - damage);
            const targetDead = newHp <= 0;

            events.push({
                attackerSide: currentSide,
                attacker: {
                    id: attacker.instanceId,
                    name: attacker.name,
                    pos: attacker.pos,
                    atk: attacker.atk,
                    hp: attacker.hp
                },
                target: {
                    id: target.instanceId,
                    name: target.name,
                    pos: target.pos,
                    hp: oldHp,
                    atk: target.atk
                },
                damage,
                oldHp,
                newHp,
                targetDead
            });

            // 应用伤害
            target.hp = newHp;

            if (targetDead) {
                const idx = defenderUnits.findIndex(u => u.instanceId === target.instanceId);
                if (idx !== -1) defenderUnits.splice(idx, 1);
            }

            // 切换攻击方
            currentSide = currentSide === 1 ? 2 : 1;
            turn++;
        }

        const winner = units1.length > 0 ? 1 : (units2.length > 0 ? 2 : 0);
        return { events, winner };
    }

    // ========== 保留原有同步战斗逻辑（用于非动画回退） ==========
    function fight(board1, board2, logCallback) {
        // ... 保持原样（略）...
    }

    // ========== 新的异步结算（生成事件，不修改血量，供外部播放动画） ==========
    async function resolveBattlesWithEvents(gameState) {
        const players = gameState.players;
        const pairs = pairPlayers(players);
        gameState.battlePairs = pairs;

        const allEvents = []; // 存储所有配对的事件序列，以及配对信息

        for (const [p1Id, p2Id] of pairs) {
            const p1 = players[p1Id];
            if (p2Id === null) {
                // 轮空，没有战斗事件
                allEvents.push({ p1Id, p2Id: null, events: [], winner: 1 });
                continue;
            }
            const p2 = players[p2Id];
            const board1 = p1.board.map(c => cloneCard(c));
            const board2 = p2.board.map(c => cloneCard(c));
            const { events, winner } = generateAttackEvents(board1, board2);
            allEvents.push({
                p1Id, p2Id,
                events,
                winner,
                // 保留初始血量，用于最终更新
                p1InitialHealth: p1.health,
                p2InitialHealth: p2.health,
                p1Board: board1,
                p2Board: board2
            });
        }

        // 返回事件序列，供外部播放动画
        return allEvents;
    }

    // ========== 根据事件序列和最终胜负，更新玩家血量 ==========
    function applyCombatResult(gameState, combatEvents) {
        const players = gameState.players;
        for (const pair of combatEvents) {
            const { p1Id, p2Id, winner, p1Board, p2Board } = pair;
            if (p2Id === null) continue;

            const p1 = players[p1Id];
            const p2 = players[p2Id];
            if (winner === 0) {
                // 平局各扣2点
                p1.health = Math.max(0, p1.health - 2);
                p2.health = Math.max(0, p2.health - 2);
            } else {
                const winnerPlayer = winner === 1 ? p1 : p2;
                const loserPlayer = winner === 1 ? p2 : p1;
                const winnerBoard = winner === 1 ? p1Board : p2Board;
                const level = winnerPlayer.shopLevel;
                const survivorBonus = winnerBoard.filter(c => c && c.hp > 0).reduce((s, c) => s + getCardDamageValue(c), 0);
                const damage = level + survivorBonus;
                loserPlayer.health = Math.max(0, loserPlayer.health - damage);
                if (loserPlayer.health <= 0) loserPlayer.isEliminated = true;
            }
        }
    }

    // ========== 保留原同步结算接口（兼容旧代码） ==========
    async function resolveBattles(gameState, log, updateCallback) {
        // 强制刷新 UI
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();

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

    // 导出新接口
    return {
        pairPlayers,
        fight,
        resolveBattles,
        getCardDamageValue,
        generateAttackEvents,      // 新：生成攻击事件序列
        resolveBattlesWithEvents,  // 新：返回事件序列，不修改血量
        applyCombatResult          // 新：根据事件序列和最终胜负更新血量
    };
})();
console.log('✅ combat.js 动画支持版加载完成');

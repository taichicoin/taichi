// ==================== 战斗模拟模块（终极稳定版） ====================
window.YYCardCombat = (function() {
    const config = window.YYCardConfig;

    function panelLog(msg, isError = false) {
        console.log(msg);
        const panel = document.getElementById('battle-debug-panel');
        if (!panel) return;
        const line = document.createElement('div');
        line.style.color = isError ? '#ff6666' : '#7bffb1';
        line.textContent = `[C] ${msg}`;
        panel.insertBefore(line, panel.firstChild);
        while (panel.children.length > 80) panel.removeChild(panel.lastChild);
    }

    panelLog('✅ combat.js 终极稳定版已加载');

    if (!config) {
        panelLog('❌ YYCardConfig 未定义', true);
        return {};
    }

    // 通过 data-board-index 查找卡牌（仅当卡牌存在时返回元素）
    function getCardElement(boardId, dataPos) {
        const board = document.getElementById(boardId);
        if (!board) return null;
        const slot = board.querySelector(`.card-slot[data-board-index="${dataPos}"]`);
        if (!slot) return null;
        // 返回卡牌元素，如果格子为空则返回 null
        return slot.querySelector('.card:not(.empty-slot)') || slot.querySelector('img');
    }

    function cloneCard(card, forcedPosition) {
        if (!card) return null;
        const hp = Number(card.hp);
        const atk = Number(card.atk);
        if (isNaN(hp) || isNaN(atk) || hp <= 0) return null;
        return {
            ...card,
            hp: hp,
            atk: atk,
            instanceId: card.instanceId || Math.random().toString(36).substring(2),
            position: forcedPosition
        };
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

    function fightWithLog(board1, board2, owner1, owner2) {
        const units1 = [], units2 = [];
        const b1 = Array.isArray(board1) ? board1 : [];
        const b2 = Array.isArray(board2) ? board2 : [];

        // 只收集 hp > 0 的有效卡牌
        for (let i = 0; i < 6; i++) {
            if (b1[i] && b1[i].hp > 0) {
                const c = cloneCard(b1[i], i);
                if (c) { c.ownerId = owner1; c.side = 1; units1.push(c); }
            }
            if (b2[i] && b2[i].hp > 0) {
                const c = cloneCard(b2[i], i);
                if (c) { c.ownerId = owner2; c.side = 2; units2.push(c); }
            }
        }

        const combatLog = [];
        if (units1.length === 0 || units2.length === 0) {
            return { winner: units1.length ? 1 : 2, combatLog };
        }

        const side1First = Math.random() >= 0.5;
        let currentSide = side1First ? 1 : 2;
        let turn = 0;
        const maxTurns = 200;

        while (units1.length > 0 && units2.length > 0 && turn < maxTurns) {
            const attackers = currentSide === 1 ? units1 : units2;
            const defenders = currentSide === 1 ? units2 : units1;

            const sorted = [...attackers].sort((a, b) => a.position - b.position);
            const attacker = sorted[0];
            if (!attacker) break;

            const target = findTarget(attacker.position, defenders);
            if (!target) {
                currentSide = currentSide === 1 ? 2 : 1;
                turn++;
                continue;
            }

            const damage = attacker.atk;
            if (isNaN(damage) || damage < 0) break;
            target.hp -= damage;

            const aPos = attacker.position;
            const dPos = target.position;

            combatLog.push({
                attackerSide: currentSide,
                defenderSide: currentSide === 1 ? 2 : 1,
                attackerPos: aPos,
                defenderPos: dPos,
                damage,
                defenderHpAfter: target.hp,
                isFatal: target.hp <= 0
            });

            // 如果目标死亡，从防守方列表中移除
            if (target.hp <= 0) {
                const idx = defenders.findIndex(u => u.instanceId === target.instanceId);
                if (idx !== -1) defenders.splice(idx, 1);
            }

            currentSide = currentSide === 1 ? 2 : 1;
            turn++;
        }

        const winner = units1.length > 0 ? 1 : 2;
        return { winner, combatLog };
    }

    let animQueue = [];
    let isAnimPlaying = false;
    let animAbortFlag = false;

    function playAttackAnim(action) {
        return new Promise(resolve => {
            if (animAbortFlag) { resolve(); return; }

            const $attacker = getCardElement(action.attackerBoard, action.attackerPos);
            const $defender = getCardElement(action.defenderBoard, action.defenderPos);

            // 如果任一卡牌不存在（已被移出或死亡），跳过动画
            if (!$attacker || !$defender) {
                panelLog(`⏭️ 跳过 (${action.attackerBoard}[${action.attackerPos}] → ${action.defenderBoard}[${action.defenderPos}])`, true);
                resolve();
                return;
            }

            panelLog(`⚔️ ${action.attackerBoard}[${action.attackerPos}] → ${action.defenderBoard}[${action.defenderPos}]`);

            const aRect = $attacker.getBoundingClientRect();
            const dRect = $defender.getBoundingClientRect();
            const deltaX = dRect.left - aRect.left;
            const deltaY = dRect.top - aRect.top;

            $attacker.style.transition = 'transform 0.2s ease-out';
            $attacker.style.transform = `translate(${deltaX * 0.7}px, ${deltaY * 0.7}px)`;
            $attacker.style.zIndex = '100';

            setTimeout(() => {
                if (animAbortFlag) { resolve(); return; }
                $defender.style.transition = 'transform 0.1s';
                $defender.style.transform = 'scale(0.9)';

                const $dmg = document.createElement('div');
                $dmg.textContent = `-${action.damage}`;
                $dmg.style.cssText = `
                    position: absolute; color: #ff4444; font-weight: bold; font-size: 28px;
                    text-shadow: 0 0 8px black; pointer-events: none; z-index: 200;
                    animation: damageFloat 0.8s forwards;
                    left: 50%; top: 40%; transform: translate(-50%, -50%);
                `;
                $defender.style.position = 'relative';
                $defender.appendChild($dmg);
                setTimeout(() => $dmg.remove(), 800);

                const hpSpan = $defender.querySelector('.card-hp');
                if (hpSpan) hpSpan.textContent = `🛡️${action.defenderHpAfter}`;

                setTimeout(() => {
                    if (animAbortFlag) { resolve(); return; }
                    $attacker.style.transition = 'transform 0.15s';
                    $attacker.style.transform = 'translate(0,0)';
                    $attacker.style.zIndex = '';
                    $defender.style.transform = 'scale(1)';

                    if (action.isFatal) {
                        $defender.style.transition = 'opacity 0.3s, transform 0.3s';
                        $defender.style.opacity = '0';
                        $defender.style.transform = 'scale(0.5)';
                        setTimeout(() => {
                            $defender.remove();
                            resolve();
                        }, 300);
                    } else {
                        setTimeout(resolve, 150);
                    }
                }, 150);
            }, 200);
        });
    }

    async function playCombatLog(logs) {
        panelLog(`▶️ 播放动画，共 ${logs.length} 步`);
        if (isAnimPlaying) return;
        isAnimPlaying = true;
        animAbortFlag = false;
        animQueue = [...logs];
        try {
            while (animQueue.length > 0 && !animAbortFlag) {
                await playAttackAnim(animQueue.shift());
            }
        } catch (err) {
            panelLog(`❌ 动画异常: ${err.message}`, true);
        }
        isAnimPlaying = false;
        panelLog(`✅ 动画播放完毕`);
    }

    async function resolveBattlesWithAnimation(gameState, log, updateCallback) {
        panelLog('🎬 开始战斗结算');
        if (!gameState?.players) return;

        await new Promise(r => setTimeout(r, 300));

        const currentUserId = window.YYCardAuth?.currentUser?.id;
        if (!currentUserId) {
            panelLog('❌ 无法获取当前用户ID', true);
            return;
        }

        const players = gameState.players;
        const pairs = pairPlayers(players);
        gameState.battlePairs = pairs;
        panelLog(`👥 配对完成，共 ${pairs.length} 组`);

        for (const [p1Id, p2Id] of pairs) {
            if (!p2Id) continue;
            const p1 = players[p1Id], p2 = players[p2Id];
            if (!p1 || !p2) continue;

            const { winner, combatLog } = fightWithLog(p1.board || [], p2.board || [], p1Id, p2Id);

            // 确定棋盘映射：p1 对应 side 1，p2 对应 side 2
            const p1IsSelf = (p1Id === currentUserId);
            const attackerBoardMap = {
                1: p1IsSelf ? 'my-board' : 'enemy-board',
                2: p1IsSelf ? 'enemy-board' : 'my-board'
            };
            const defenderBoardMap = {
                1: p1IsSelf ? 'enemy-board' : 'my-board',
                2: p1IsSelf ? 'my-board' : 'enemy-board'
            };

            const mappedLog = combatLog.map(entry => ({
                attackerBoard: entry.attackerSide === 1 ? attackerBoardMap[1] : attackerBoardMap[2],
                defenderBoard: entry.defenderSide === 1 ? defenderBoardMap[1] : defenderBoardMap[2],
                attackerPos: entry.attackerPos,
                defenderPos: entry.defenderPos,
                damage: entry.damage,
                defenderHpAfter: entry.defenderHpAfter,
                isFatal: entry.isFatal
            }));

            panelLog(`📊 ${p1Id.slice(0,6)} vs ${p2Id.slice(0,6)}：${mappedLog.length} 步`);
            log(`⚔️ 对战: ${p1Id.slice(0,6)} vs ${p2Id.slice(0,6)}`);
            await playCombatLog(mappedLog);
        }

        panelLog('🏁 战斗动画流程结束');
        if (updateCallback) await updateCallback();
    }

    return {
        pairPlayers,
        fight: fightWithLog,
        resolveBattles: resolveBattlesWithAnimation,
        playCombatLog,
        abortAnimation: () => { animAbortFlag = true; }
    };
})();

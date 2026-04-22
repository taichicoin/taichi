// ==================== 战斗模拟模块（修复位置越界） ====================
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

    panelLog('✅ combat.js 已加载（修复版）');

    if (!config) {
        panelLog('❌ YYCardConfig 未定义', true);
        return {};
    }

    // 安全克隆卡牌，固定位置
    function cloneCard(card, forcedPosition) {
        if (!card) return null;
        const hp = Number(card.hp);
        const atk = Number(card.atk);
        if (isNaN(hp) || isNaN(atk) || hp <= 0) {
            panelLog(`⚠️ 卡牌数据异常: ${card.name}`, true);
            return null;
        }
        return {
            ...card,
            hp: hp,
            atk: atk,
            instanceId: card.instanceId || Math.random().toString(36).substring(2),
            position: forcedPosition !== undefined ? forcedPosition : card.position
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
            if (target) {
                // 确保目标对象包含正确的位置和ownerId
                if (target.position === undefined || target.ownerId === undefined) {
                    panelLog(`⚠️ 目标数据异常: pos=${target.position} owner=${target.ownerId}`, true);
                    continue;
                }
                return target;
            }
        }
        return null;
    }

    function fightWithLog(board1, board2, owner1, owner2) {
        const units1 = [], units2 = [];
        const b1 = Array.isArray(board1) ? board1 : [];
        const b2 = Array.isArray(board2) ? board2 : [];
        for (let i = 0; i < 6; i++) {
            if (b1[i]) {
                const c = cloneCard(b1[i], i);
                if (c && c.hp > 0) {
                    c.ownerId = owner1;
                    c.side = 1;
                    units1.push(c);
                }
            }
            if (b2[i]) {
                const c = cloneCard(b2[i], i);
                if (c && c.hp > 0) {
                    c.ownerId = owner2;
                    c.side = 2;
                    units2.push(c);
                }
            }
        }

        const combatLog = [];
        if (units1.length === 0 || units2.length === 0) {
            return { winner: units1.length ? 1 : 2, combatLog };
        }

        const board1First = Math.random() >= 0.5;
        let currentSide = board1First ? 1 : 2;
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
            if (isNaN(damage) || damage < 0) {
                panelLog(`❌ 攻击力无效: ${attacker.name}`, true);
                break;
            }
            target.hp -= damage;

            // 严格校验位置合法性
            const attackerPos = Number(attacker.position);
            const defenderPos = Number(target.position);
            if (isNaN(attackerPos) || attackerPos < 0 || attackerPos > 5 ||
                isNaN(defenderPos) || defenderPos < 0 || defenderPos > 5) {
                panelLog(`❌ 位置越界: ${attackerPos} → ${defenderPos}，跳过`, true);
                currentSide = currentSide === 1 ? 2 : 1;
                turn++;
                continue;
            }

            combatLog.push({
                attacker: {
                    ownerId: attacker.ownerId,
                    pos: attackerPos,
                    instanceId: attacker.instanceId,
                    atk: attacker.atk
                },
                defender: {
                    ownerId: target.ownerId,
                    pos: defenderPos,
                    instanceId: target.instanceId,
                    hpAfter: target.hp
                },
                damage,
                isFatal: target.hp <= 0
            });

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

    // 动画播放器
    let animQueue = [];
    let isAnimPlaying = false;
    let animAbortFlag = false;

    function findCardElement(ownerId, position) {
        return document.querySelector(`.card-slot[data-player="${ownerId}"][data-position="${position}"] .card`);
    }

    function playAttackAnim(action) {
        return new Promise(resolve => {
            if (animAbortFlag) { resolve(); return; }
            const aPos = action.attacker.pos;
            const dPos = action.defender.pos;
            panelLog(`⚔️ 攻击动画: ${aPos} → ${dPos}`);
            const $attacker = findCardElement(action.attacker.ownerId, aPos);
            const $defender = findCardElement(action.defender.ownerId, dPos);
            if (!$attacker || !$defender) {
                panelLog(`⚠️ 找不到卡牌DOM (${action.attacker.ownerId.slice(0,6)}:${aPos} → ${action.defender.ownerId.slice(0,6)}:${dPos})`, true);
                resolve();
                return;
            }
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
                if (hpSpan) hpSpan.textContent = `🛡️${action.defender.hpAfter}`;
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
                const action = animQueue.shift();
                await playAttackAnim(action);
            }
        } catch (err) {
            panelLog(`❌ 动画异常: ${err.message}`, true);
        }
        isAnimPlaying = false;
        panelLog(`✅ 动画播放完毕`);
    }

    function abortAnimation() {
        animAbortFlag = true;
        animQueue = [];
        isAnimPlaying = false;
    }

    async function resolveBattlesWithAnimation(gameState, log, updateCallback) {
        panelLog('🎬 开始战斗结算');
        if (!gameState || !gameState.players) {
            panelLog('❌ gameState 无效', true);
            return;
        }
        const players = gameState.players;
        const pairs = pairPlayers(players);
        gameState.battlePairs = pairs;
        panelLog(`👥 配对完成，共 ${pairs.length} 组`);

        const battleSessions = [];
        let totalSteps = 0;

        for (const [p1Id, p2Id] of pairs) {
            if (!p2Id) continue;
            const p1 = players[p1Id];
            const p2 = players[p2Id];
            if (!p1 || !p2) continue;
            try {
                const { winner, combatLog } = fightWithLog(p1.board || [], p2.board || [], p1Id, p2Id);
                // 过滤掉可能混入的无效攻击（位置越界）
                const validLog = combatLog.filter(a => 
                    a.attacker.pos >= 0 && a.attacker.pos <= 5 &&
                    a.defender.pos >= 0 && a.defender.pos <= 5
                );
                if (validLog.length !== combatLog.length) {
                    panelLog(`⚠️ 过滤了 ${combatLog.length - validLog.length} 条无效攻击`, true);
                }
                panelLog(`📊 ${p1Id.slice(0,6)} vs ${p2Id.slice(0,6)}：${validLog.length} 步`);
                battleSessions.push({ p1Id, p2Id, winner, combatLog: validLog });
                totalSteps += validLog.length;
            } catch (err) {
                panelLog(`❌ 对战计算失败: ${err.message}`, true);
            }
        }

        if (totalSteps === 0) {
            panelLog('⚠️ 无有效攻击序列，跳过动画');
        } else {
            for (const session of battleSessions) {
                log(`⚔️ 对战: ${session.p1Id.slice(0,6)} vs ${session.p2Id.slice(0,6)}`);
                await playCombatLog(session.combatLog);
            }
        }

        panelLog('🏁 战斗动画流程结束');
        if (updateCallback) await updateCallback();
    }

    return {
        pairPlayers,
        fight: fightWithLog,
        fightWithLog,
        resolveBattles: resolveBattlesWithAnimation,
        playCombatLog,
        abortAnimation
    };
})();

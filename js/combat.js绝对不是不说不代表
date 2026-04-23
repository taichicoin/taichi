// ==================== 战斗模拟模块（最终稳定版：禁止动画期间刷新 + 死亡移除 + 慢速动画 + 轮流攻击） ====================
window.YYCardCombat = (function() {
    const config = window.YYCardConfig;
    
    // 全局动画状态标志（供外部检查）
    let isAnimating = false;

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

    panelLog('✅ combat.js 最终稳定版 (轮流攻击+死亡移除+慢速)');

    // 通过玩家ID和棋盘数据索引获取卡牌元素
    function getCardElementByPlayerId(playerId, dataPos) {
        const board = document.querySelector(`.board[data-player-id="${playerId}"]`);
        if (!board) return null;
        const slot = board.querySelector(`.card-slot[data-board-index="${dataPos}"]`);
        if (!slot) return null;
        return slot.querySelector('.card:not(.empty-slot)');
    }

    function cloneCard(card, pos) {
        if (!card) return null;
        const hp = Number(card.hp), atk = Number(card.atk);
        if (isNaN(hp) || isNaN(atk) || hp <= 0) return null;
        return { ...card, hp, atk, instanceId: card.instanceId || Math.random().toString(36).substring(2), position: pos };
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

    function findTarget(attackerPos, enemyUnits) {
        const priority = config.BOARD.ENEMY_PRIORITY[attackerPos];
        if (!priority) return null;
        const hasFront = enemyUnits.some(u => u.position < 3 && u.hp > 0);
        for (const targetPos of priority) {
            if (hasFront && targetPos >= 3) continue;
            const t = enemyUnits.find(u => u.position === targetPos && u.hp > 0);
            if (t) return t;
        }
        return null;
    }

    // ========== 轮流攻击版 fightWithLog ==========
    function fightWithLog(board1, board2, owner1, owner2) {
        const units1 = [], units2 = [];
        const b1 = Array.isArray(board1) ? board1 : [];
        const b2 = Array.isArray(board2) ? board2 : [];
        for (let i = 0; i < 6; i++) {
            if (b1[i] && b1[i].hp > 0) { const c = cloneCard(b1[i], i); if (c) { c.ownerId = owner1; c.side = 1; units1.push(c); } }
            if (b2[i] && b2[i].hp > 0) { const c = cloneCard(b2[i], i); if (c) { c.ownerId = owner2; c.side = 2; units2.push(c); } }
        }
        const combatLog = [];
        if (units1.length === 0 || units2.length === 0) return { winner: units1.length ? 1 : 2, combatLog };

        // 按位置排序（0~5，越小越先动）
        units1.sort((a, b) => a.position - b.position);
        units2.sort((a, b) => a.position - b.position);

        const side1First = Math.random() >= 0.5;
        let curSide = side1First ? 1 : 2;
        let turn = 0;

        // 双方各自的行动索引（指向 units 数组）
        let idx1 = 0, idx2 = 0;

        panelLog(`🎲 先手: side${curSide}`);

        while (units1.length > 0 && units2.length > 0 && turn < 200) {
            let attacker = null;
            
            if (curSide === 1) {
                // 从当前索引开始循环找第一个存活单位
                let startIdx = idx1 % units1.length;
                for (let i = 0; i < units1.length; i++) {
                    const checkIdx = (startIdx + i) % units1.length;
                    if (units1[checkIdx] && units1[checkIdx].hp > 0) {
                        attacker = units1[checkIdx];
                        idx1 = (checkIdx + 1) % units1.length; // 下次从下一个开始
                        break;
                    }
                }
            } else {
                let startIdx = idx2 % units2.length;
                for (let i = 0; i < units2.length; i++) {
                    const checkIdx = (startIdx + i) % units2.length;
                    if (units2[checkIdx] && units2[checkIdx].hp > 0) {
                        attacker = units2[checkIdx];
                        idx2 = (checkIdx + 1) % units2.length;
                        break;
                    }
                }
            }

            if (!attacker) break; // 理论上不会发生

            const defenders = curSide === 1 ? units2 : units1;
            const target = findTarget(attacker.position, defenders);
            if (!target) {
                // 没有合法目标，换边继续
                curSide = curSide === 1 ? 2 : 1;
                turn++;
                continue;
            }

            const dmg = attacker.atk;
            if (isNaN(dmg)) break;
            target.hp -= dmg;
            combatLog.push({
                attackerOwnerId: attacker.ownerId,
                defenderOwnerId: target.ownerId,
                attackerPos: attacker.position,
                defenderPos: target.position,
                damage: dmg,
                defenderHpAfter: target.hp,
                isFatal: target.hp <= 0
            });

            if (target.hp <= 0) {
                const deadIdx = defenders.findIndex(u => u.instanceId === target.instanceId);
                if (deadIdx !== -1) {
                    defenders.splice(deadIdx, 1);
                    // 如果删除的单位在对方行动索引之前，调整索引避免跳过单位
                    if (curSide === 1) {
                        // 敌方死亡，不影响 idx1，但需要调整 idx2（因为 defenders 是 units2）
                        if (deadIdx <= idx2) idx2 = Math.max(0, idx2 - 1);
                    } else {
                        // 我方死亡，调整 idx1
                        if (deadIdx <= idx1) idx1 = Math.max(0, idx1 - 1);
                    }
                }
            }

            curSide = curSide === 1 ? 2 : 1;
            turn++;

            if (turn % 10 === 0) {
                panelLog(`🔄 回合${turn}  side1剩余:${units1.length}  side2剩余:${units2.length}`);
            }
        }

        panelLog(`🏆 战斗结束 胜者: side${units1.length ? 1 : 2}  总回合: ${turn}`);
        return { winner: units1.length ? 1 : 2, combatLog };
    }

    // 动画播放（慢速版 + 死亡彻底清除 + 每步再慢100ms）
    let animQueue = [], isPlaying = false, abortFlag = false;
    function playAttackAnim(a) {
        return new Promise(resolve => {
            if (abortFlag) return resolve();
            const $att = getCardElementByPlayerId(a.attackerOwnerId, a.attackerPos);
            const $def = getCardElementByPlayerId(a.defenderOwnerId, a.defenderPos);
            if (!$att || !$def) {
                panelLog(`⏭️ 跳过 ${a.attackerOwnerId?.slice(0,6)}[${a.attackerPos}]→${a.defenderOwnerId?.slice(0,6)}[${a.defenderPos}]`, true);
                return resolve();
            }
            panelLog(`⚔️ ${a.attackerOwnerId.slice(0,6)}[${a.attackerPos}]→${a.defenderOwnerId.slice(0,6)}[${a.defenderPos}]`);
            const ar = $att.getBoundingClientRect(), dr = $def.getBoundingClientRect();
            const dx = dr.left - ar.left, dy = dr.top - ar.top;
            $att.style.transition = 'transform 0.35s ease-out';
            $att.style.transform = `translate(${dx*0.7}px, ${dy*0.7}px)`;
            $att.style.zIndex = '100';

            setTimeout(() => {
                if (abortFlag) return resolve();
                // 受击抖动
                $def.style.transition = 'transform 0.15s';
                $def.style.transform = 'scale(0.85)';
                // 伤害数字
                const dmgDiv = document.createElement('div');
                dmgDiv.textContent = `-${a.damage}`;
                dmgDiv.style.cssText = 'position:absolute; color:#f44; font-size:32px; font-weight:bold; text-shadow:0 0 8px #000; z-index:200; left:50%; top:40%; transform:translate(-50%,-50%); animation:damageFloat 1s forwards; pointer-events:none;';
                $def.style.position = 'relative';
                $def.appendChild(dmgDiv);
                setTimeout(() => dmgDiv.remove(), 1000);

                // 更新血量显示
                const hpSpan = $def.querySelector('.card-hp');
                if (hpSpan) hpSpan.textContent = `🛡️${a.defenderHpAfter}`;

                setTimeout(() => {
                    if (abortFlag) return resolve();
                    // 攻击者归位
                    $att.style.transition = 'transform 0.25s';
                    $att.style.transform = 'translate(0,0)';
                    $att.style.zIndex = '';
                    $def.style.transform = 'scale(1)';

                    if (a.isFatal) {
                        // 死亡动画
                        $def.style.transition = 'opacity 0.35s, transform 0.35s';
                        $def.style.opacity = '0';
                        $def.style.transform = 'scale(0.5)';
                        setTimeout(() => {
                            // 彻底清空槽位并插入空卡牌
                            const slot = $def.parentNode;
                            if (slot && slot.classList.contains('card-slot')) {
                                slot.innerHTML = '';
                                const emptyCard = document.createElement('div');
                                emptyCard.className = 'card empty-slot';
                                emptyCard.textContent = '⬤';
                                slot.appendChild(emptyCard);
                            } else {
                                $def.remove();
                            }
                            resolve();
                        }, 350);
                    } else {
                        setTimeout(resolve, 250);
                    }
                }, 230); // 受击停顿
            }, 350); // 攻击前摇
        });
    }

    async function playLog(logs) {
        panelLog(`▶️ 播放 ${logs.length} 步`);
        if (isPlaying) {
            panelLog('⚠️ 动画已在播放，忽略重复调用', true);
            return;
        }
        isPlaying = true;
        isAnimating = true; // 设置全局动画标志
        abortFlag = false;
        animQueue = [...logs];
        
        try {
            while (animQueue.length && !abortFlag) {
                const step = animQueue.shift();
                try {
                    await playAttackAnim(step);
                    // 每步之间额外停顿 100ms (0.1秒)
                    await new Promise(r => setTimeout(r, 100));
                } catch (e) {
                    panelLog(`❌ 单步动画异常: ${e.message}`, true);
                }
            }
        } catch (e) {
            panelLog(`❌ 动画主循环异常: ${e.message}`, true);
        }
        
        isPlaying = false;
        isAnimating = false; // 清除全局动画标志
        panelLog(`✅ 播放完毕`);
    }

    async function resolveBattles(gameState, log, updateCallback) {
        panelLog('🎬 开始结算');
        if (!gameState?.players) return;
        await new Promise(r => setTimeout(r, 300));
        const players = gameState.players;
        const pairs = pairPlayers(players);
        gameState.battlePairs = pairs;
        panelLog(`👥 ${pairs.length} 组 (真人优先)`);

        for (const [p1, p2] of pairs) {
            if (!p2) continue;
            const u1 = players[p1], u2 = players[p2];
            if (!u1 || !u2) continue;
            const { winner, combatLog } = fightWithLog(u1.board||[], u2.board||[], p1, p2);
            panelLog(`📊 ${p1.slice(0,6)} vs ${p2.slice(0,6)}: ${combatLog.length}步`);
            log(`⚔️ 对战: ${p1.slice(0,6)} vs ${p2.slice(0,6)}`);
            await playLog(combatLog);
        }
        panelLog('🏁 结束');
        
        // 重要：动画全部结束后再调用更新回调
        if (updateCallback) await updateCallback();
    }

    return {
        pairPlayers,
        fight: fightWithLog,
        resolveBattles,
        playCombatLog: playLog,
        abortAnimation: () => { abortFlag = true; },
        isAnimating: () => isAnimating  // 暴露动画状态供外部检查
    };
})();

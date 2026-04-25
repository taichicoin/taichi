// ==================== 战斗模拟模块（本地模拟 + 动画播放 + 滑步重连） ====================
window.YYCardCombat = (function() {
    const config = window.YYCardConfig;
    let isAnimating = false;
    const AVG_STEP_MS = 500;

    // ---------- DOM 查找 ----------
    function getCardElementByPlayerId(playerId, dataPos) {
        const board = document.querySelector(`.board[data-player-id="${playerId}"]`);
        if (!board) return null;
        const slot = board.querySelector(`.card-slot[data-board-index="${dataPos}"]`);
        if (!slot) return null;
        return slot.querySelector('.card:not(.empty-slot)');
    }

    function showFloatingText(element, text, color, duration) {
        const div = document.createElement('div');
        div.textContent = text;
        div.style.cssText = `
            position:absolute; color:${color}; font-size:28px; font-weight:bold;
            text-shadow:0 0 6px #000; z-index:200; left:50%; top:30%;
            transform:translate(-50%,-50%); animation:damageFloat ${duration}ms forwards;
            pointer-events:none;
        `;
        element.style.position = 'relative';
        element.appendChild(div);
        setTimeout(() => div.remove(), duration);
    }

    // ---------- 本地技能处理（山海经） ----------
    function parseSkill(card) {
        if (!card?.skill) return null;
        return typeof card.skill === 'string' ? JSON.parse(card.skill) : card.skill;
    }

    function getTargets(board, scope, pos) {
        const targets = [];
        if (scope === 'self') { if (board[pos]) targets.push({ card: board[pos], pos }); }
        else if (scope === 'all') board.forEach((c, i) => { if (c) targets.push({ card: c, pos: i }); });
        else if (scope === 'sameRow') {
            const start = pos < 3 ? 0 : 3;
            for (let i = start; i < start + 3; i++) if (board[i]) targets.push({ card: board[i], pos: i });
        }
        return targets;
    }

    function applyBattleStartSkills(players) {
        const buffEvents = [];
        for (const pid in players) {
            const board = players[pid].board;
            if (!board) continue;
            for (let pos = 0; pos < 6; pos++) {
                const card = board[pos];
                if (!card) continue;
                const skill = parseSkill(card);
                if (!skill || skill.trigger !== 'onBattleStart') continue;
                if (skill.type === 'enlightenment') {
                    let gainA = 0, gainH = 0;
                    if (skill.skillId === 'skill_xianshi_tianhai') {
                        if (typeof card.enlightenLevel !== 'number') card.enlightenLevel = 0;
                        card.enlightenLevel++;
                        const lv = card.enlightenLevel;
                        gainA = (skill.effect.baseValue || 1) + lv * (skill.effect.enlightenBonus || 1);
                        gainH = gainA;
                    } else {
                        gainA = skill.effect.baseValue || 1;
                        gainH = skill.effect.baseValue || 1;
                    }
                    const targets = getTargets(board, skill.scope, pos);
                    targets.forEach(({ card: tCard, pos: tPos }) => {
                        tCard.atk = (tCard.atk || 0) + gainA;
                        tCard.hp = (tCard.hp || 0) + gainH;
                        buffEvents.push({ type: 'buff', playerId: pid, position: tPos, atkGain: gainA, hpGain: gainH, sourceCard: card.name });
                    });
                    // 反应技能（白泽/穷奇）简化：仅记录，实际数值直接修改
                    // 白泽、穷奇在触发时也立即生效
                }
                if (skill.skillId === 'skill_divine_blessing_trigger_enlightenment') {
                    // 九尾狐：触发同排悟道一次
                    const start = pos < 3 ? 0 : 3;
                    for (let i = start; i < start + 3; i++) {
                        const ally = board[i];
                        if (!ally || ally === card) continue;
                        const allySkill = parseSkill(ally);
                        if (allySkill && allySkill.type === 'enlightenment') {
                            // 递归调用（简化：直接增加属性）
                            let aGain = 0, hGain = 0;
                            if (allySkill.skillId === 'skill_xianshi_tianhai') {
                                if (typeof ally.enlightenLevel !== 'number') ally.enlightenLevel = 0;
                                ally.enlightenLevel++;
                                const lv = ally.enlightenLevel;
                                aGain = (allySkill.effect.baseValue || 1) + lv * (allySkill.effect.enlightenBonus || 1);
                                hGain = aGain;
                            } else {
                                aGain = allySkill.effect.baseValue || 1;
                                hGain = allySkill.effect.baseValue || 1;
                            }
                            const aTargets = getTargets(board, allySkill.scope, i);
                            aTargets.forEach(({ card: tCard, pos: tPos }) => {
                                tCard.atk = (tCard.atk || 0) + aGain;
                                tCard.hp = (tCard.hp || 0) + hGain;
                                buffEvents.push({ type: 'buff', playerId: pid, position: tPos, atkGain: aGain, hpGain: hGain, sourceCard: ally.name });
                            });
                        }
                    }
                }
            }
        }
        return buffEvents;
    }

    // ---------- 战斗模拟（本地） ----------
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
        for (let i = 0; i < humanIds.length; i += 2) pairs.push([humanIds[i], humanIds[i+1] || botIds.shift() || null]);
        for (let i = 0; i < botIds.length; i += 2) pairs.push([botIds[i], botIds[i+1] || null]);
        return pairs;
    }

    function findTarget(attackerPos, enemyUnits) {
        const priority = config.BOARD.ENEMY_PRIORITY[attackerPos];
        if (!priority) return null;
        const hasFront = enemyUnits.some(u => u.position < 3 && u.hp > 0);
        for (const tPos of priority) {
            if (hasFront && tPos >= 3) continue;
            const t = enemyUnits.find(u => u.position === tPos && u.hp > 0);
            if (t) return t;
        }
        return null;
    }

    function simulateFight(board1, board2, owner1, owner2) {
        const units1 = [], units2 = [];
        for (let i = 0; i < 6; i++) {
            if (board1[i] && board1[i].hp > 0) units1.push({ ...board1[i], position: i, ownerId: owner1, side: 1, instanceId: board1[i].instanceId || Math.random().toString(36) });
            if (board2[i] && board2[i].hp > 0) units2.push({ ...board2[i], position: i, ownerId: owner2, side: 2, instanceId: board2[i].instanceId || Math.random().toString(36) });
        }
        const combatLog = [];
        if (!units1.length || !units2.length) return { winner: units1.length ? 1 : 2, combatLog };

        units1.sort((a,b) => a.position - b.position);
        units2.sort((a,b) => a.position - b.position);
        let curSide = Math.random() >= 0.5 ? 1 : 2, turn = 0, idx1 = 0, idx2 = 0;

        while (units1.length && units2.length && turn < 200) {
            const attackers = curSide === 1 ? units1 : units2, defenders = curSide === 1 ? units2 : units1;
            let attacker = null;
            if (curSide === 1) {
                let start = idx1 % units1.length;
                for (let i = 0; i < units1.length; i++) {
                    const ci = (start + i) % units1.length;
                    if (units1[ci].hp > 0) { attacker = units1[ci]; idx1 = (ci + 1) % units1.length; break; }
                }
            } else {
                let start = idx2 % units2.length;
                for (let i = 0; i < units2.length; i++) {
                    const ci = (start + i) % units2.length;
                    if (units2[ci].hp > 0) { attacker = units2[ci]; idx2 = (ci + 1) % units2.length; break; }
                }
            }
            if (!attacker) break;
            const target = findTarget(attacker.position, defenders);
            if (!target) { curSide = curSide === 1 ? 2 : 1; turn++; continue; }
            const dmg = attacker.atk;
            target.hp -= dmg;
            combatLog.push({
                type: 'attack',
                attackerOwnerId: attacker.ownerId, defenderOwnerId: target.ownerId,
                attackerPos: attacker.position, defenderPos: target.position,
                damage: dmg, defenderHpAfter: target.hp, isFatal: target.hp <= 0
            });
            if (target.hp <= 0) {
                const di = defenders.findIndex(u => u.instanceId === target.instanceId);
                if (di >= 0) {
                    defenders.splice(di, 1);
                    if (curSide === 1) { if (di <= idx2) idx2 = Math.max(0, idx2 - 1); }
                    else { if (di <= idx1) idx1 = Math.max(0, idx1 - 1); }
                }
            }
            curSide = curSide === 1 ? 2 : 1;
            turn++;
        }
        return { winner: units1.length ? 1 : 2, combatLog };
    }

    // ---------- 动画播放 ----------
    let animQueue = [], isPlaying = false, abortFlag = false;

    function playBuffAnim(buff) {
        return new Promise(resolve => {
            const cardEl = getCardElementByPlayerId(buff.playerId, buff.position);
            if (!cardEl) return resolve();
            const gainText = `+${buff.atkGain || 0}/+${buff.hpGain || 0}`;
            showFloatingText(cardEl, gainText, '#7bffb1', 1000);
            setTimeout(resolve, 300);
        });
    }

    function playAttackAnim(a) {
        return new Promise(resolve => {
            if (abortFlag) return resolve();
            const $att = getCardElementByPlayerId(a.attackerOwnerId, a.attackerPos);
            const $def = getCardElementByPlayerId(a.defenderOwnerId, a.defenderPos);
            if (!$att || !$def) return resolve();

            const ar = $att.getBoundingClientRect(), dr = $def.getBoundingClientRect();
            const dx = dr.left - ar.left, dy = dr.top - ar.top;
            $att.style.transition = 'transform 0.35s ease-out';
            $att.style.transform = `translate(${dx * 0.7}px, ${dy * 0.7}px)`;
            $att.style.zIndex = '100';

            setTimeout(() => {
                if (abortFlag) return resolve();
                $def.style.transition = 'transform 0.15s';
                $def.style.transform = 'scale(0.85)';
                const dmgDiv = document.createElement('div');
                dmgDiv.textContent = `-${a.damage}`;
                dmgDiv.style.cssText = 'position:absolute; color:#f44; font-size:32px; font-weight:bold; text-shadow:0 0 8px #000; z-index:200; left:50%; top:40%; transform:translate(-50%,-50%); animation:damageFloat 1s forwards; pointer-events:none;';
                $def.style.position = 'relative';
                $def.appendChild(dmgDiv);
                setTimeout(() => dmgDiv.remove(), 1000);

                const hpSpan = $def.querySelector('.card-hp');
                if (hpSpan) hpSpan.textContent = `🛡️${a.defenderHpAfter}`;

                setTimeout(() => {
                    if (abortFlag) return resolve();
                    $att.style.transition = 'transform 0.25s';
                    $att.style.transform = 'translate(0,0)';
                    $att.style.zIndex = '';
                    $def.style.transform = 'scale(1)';

                    if (a.isFatal) {
                        $def.style.transition = 'opacity 0.35s, transform 0.35s';
                        $def.style.opacity = '0';
                        $def.style.transform = 'scale(0.5)';
                        setTimeout(() => {
                            const slot = $def.parentNode;
                            if (slot && slot.classList.contains('card-slot')) {
                                slot.innerHTML = '';
                                const emptyCard = document.createElement('div');
                                emptyCard.className = 'card empty-slot';
                                emptyCard.textContent = '⬤';
                                slot.appendChild(emptyCard);
                            } else { $def.remove(); }
                            resolve();
                        }, 350);
                    } else { setTimeout(resolve, 250); }
                }, 230);
            }, 350);
        });
    }

    async function playLog(logs) {
        if (isPlaying) return;
        isPlaying = true;
        isAnimating = true;
        abortFlag = false;
        animQueue = [...logs];
        try {
            while (animQueue.length && !abortFlag) {
                const step = animQueue.shift();
                if (step.type === 'buff') await playBuffAnim(step);
                else await playAttackAnim(step);
                await new Promise(r => setTimeout(r, 80));
            }
        } catch (e) {
            console.error('[Combat] 动画异常:', e);
        }
        isPlaying = false;
        isAnimating = false;
    }

    // ---------- 主入口：完全本地模拟 ----------
    async function resolveBattles(gameState, log, updateCallback) {
        if (!gameState?.players) return;
        try {
            // 深拷贝一份玩家数据用于模拟，不影响原 gameState（动画结束后会用后端数据覆盖，目前无后端则直接保留）
            const simPlayers = JSON.parse(JSON.stringify(gameState.players));

            // 1. 技能增益（直接修改 simPlayers 的属性，生成 buffEvents）
            const buffEvents = applyBattleStartSkills(simPlayers);

            // 2. 配对与战斗
            const pairs = pairPlayers(simPlayers);
            const combatLogs = [];
            for (const [p1, p2] of pairs) {
                if (!p2) continue;
                const u1 = simPlayers[p1], u2 = simPlayers[p2];
                if (!u1 || !u2) continue;
                const result = simulateFight(u1.board || [], u2.board || [], p1, p2);
                combatLogs.push(...result.combatLog);
            }

            // 3. 合并动画步骤
            const allSteps = [...buffEvents, ...combatLogs];
            // 4. 快进重连估算（基于本轮第一次调用时间）
            const now = Date.now();
            if (!resolveBattles._startTime) resolveBattles._startTime = now;
            const elapsed = now - resolveBattles._startTime;
            const skipCount = Math.min(Math.floor(elapsed / AVG_STEP_MS), allSteps.length);
            const remainingSteps = allSteps.slice(skipCount);

            // 5. 播放剩余动画
            if (remainingSteps.length > 0) {
                await playLog(remainingSteps);
            }
            resolveBattles._startTime = undefined; // 重置

            // 6. 由于无后端，暂时不更新 players，由后续 settlement 刷新
            // 但我们要将技能增益写回原 gameState，以便结算伤害时用
            for (const pid in simPlayers) {
                const orig = gameState.players[pid];
                if (orig) orig.board = simPlayers[pid].board; // 更新攻击/生命，但可能被后续 refresh 覆盖
            }
        } catch (e) {
            console.error('[Combat] 模拟异常:', e);
        } finally {
            if (updateCallback) await updateCallback();
        }
    }

    return {
        resolveBattles,
        playCombatLog: playLog,
        abortAnimation: () => { abortFlag = true; },
        isAnimating: () => isAnimating
    };
})();

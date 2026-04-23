// ==================== 战斗模拟模块（完整版：山海经技能 + 轮流攻击 + 死亡移除 + 慢速动画） ====================
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

    panelLog('✅ combat.js 完整版 (山海经技能+轮流攻击+死亡移除+慢速)');

    // ---------- 辅助函数 ----------
    function parseSkill(card) {
        if (!card?.skill) return null;
        if (typeof card.skill === 'string') {
            try { return JSON.parse(card.skill); }
            catch (e) { panelLog(`❌ 技能JSON解析失败: ${card.name}`, true); return null; }
        }
        return card.skill;
    }

    function getTargetCards(board, scope, sourcePos) {
        const targets = [];
        if (scope === 'self') {
            if (board[sourcePos]) targets.push({ card: board[sourcePos], pos: sourcePos });
        } else if (scope === 'all') {
            board.forEach((card, idx) => { if (card) targets.push({ card, pos: idx }); });
        } else if (scope === 'sameRow') {
            const rowStart = sourcePos < 3 ? 0 : 3;
            for (let i = rowStart; i < rowStart + 3; i++) {
                if (board[i]) targets.push({ card: board[i], pos: i });
            }
        }
        return targets;
    }

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

    // ---------- 技能处理（战斗开始）强化版 ----------
    function applyBattleStartSkills(gameState) {
        const buffEvents = [];
        
        for (const playerId in gameState.players) {
            const player = gameState.players[playerId];
            const board = player.board;
            if (!board) continue;
            
            for (let pos = 0; pos < 6; pos++) {
                const card = board[pos];
                if (!card) continue;
                const skill = parseSkill(card);
                if (!skill || skill.trigger !== 'onBattleStart') continue;
                
                if (skill.type === 'enlightenment') {
                    processEnlightenment(card, skill, playerId, pos, board, buffEvents, gameState);
                } else if (skill.skillId === 'skill_divine_blessing_trigger_enlightenment') {
                    processJiuWeiHu(card, skill, playerId, pos, board, buffEvents, gameState);
                }
            }
        }
        
        return buffEvents;
    }

    function processEnlightenment(card, skill, playerId, pos, board, buffEvents, gameState) {
        // 毕方暂不处理
        if (skill.skillId === 'skill_xianhuo_shoufa') {
            panelLog(`🃏 毕方技能待实现：生成神火符`);
            return;
        }
        
        let gainAtk = 0, gainHp = 0;
        const isJingwei = (skill.skillId === 'skill_xianshi_tianhai');
        
        if (isJingwei) {
            if (typeof card.enlightenLevel !== 'number') card.enlightenLevel = 0;
            card.enlightenLevel += 1;
            const level = card.enlightenLevel;
            const base = skill.effect.baseValue || 1;
            const bonus = skill.effect.enlightenBonus || 1;
            gainAtk = base + level * bonus;
            gainHp = base + level * bonus;
            panelLog(`✨ 精卫悟道层数: ${level}，全体增益 +${gainAtk}/+${gainHp}`);
        } else {
            gainAtk = skill.effect.baseValue || 1;
            gainHp = skill.effect.baseValue || 1;
        }
        
        const targets = getTargetCards(board, skill.scope, pos);
        targets.forEach(({ card: targetCard, pos: targetPos }) => {
            targetCard.atk = (targetCard.atk || 0) + gainAtk;
            targetCard.hp = (targetCard.hp || 0) + gainHp;
            buffEvents.push({
                type: 'buff',
                playerId: playerId,
                position: targetPos,
                atkGain: gainAtk,
                hpGain: gainHp,
                sourceCard: card.name
            });
        });
        
        triggerReactionSkills(gameState, playerId, card, pos, board, buffEvents);
    }

    function processJiuWeiHu(card, skill, playerId, pos, board, buffEvents, gameState) {
        const rowStart = pos < 3 ? 0 : 3;
        const times = skill.effect.times || 1;
        for (let t = 0; t < times; t++) {
            for (let i = rowStart; i < rowStart + 3; i++) {
                const ally = board[i];
                if (!ally || ally === card) continue;
                const allySkill = parseSkill(ally);
                if (allySkill && allySkill.type === 'enlightenment') {
                    panelLog(`🦊 九尾狐触发 ${ally.name} 的悟道`);
                    processEnlightenment(ally, allySkill, playerId, i, board, buffEvents, gameState);
                }
            }
        }
    }

    function triggerReactionSkills(gameState, playerId, sourceCard, sourcePos, board, buffEvents) {
        for (let i = 0; i < 6; i++) {
            const card = board[i];
            if (!card) continue;
            const skill = parseSkill(card);
            if (!skill || skill.trigger !== 'onEnlightenmentTriggered') continue;
            
            if (skill.skillId === 'skill_jinglei') {
                const gainAtk = skill.effect.value.atk || 2;
                const gainHp = skill.effect.value.hp || 5;
                card.atk = (card.atk || 0) + gainAtk;
                card.hp = (card.hp || 0) + gainHp;
                buffEvents.push({
                    type: 'buff',
                    playerId: playerId,
                    position: i,
                    atkGain: gainAtk,
                    hpGain: gainHp,
                    sourceCard: card.name
                });
                panelLog(`⚡ 白泽惊雷触发，自身 +${gainAtk}/+${gainHp}`);
            }
            else if (skill.skillId === 'skill_chengshan_yange') {
                const gainAtk = skill.effect.value.atk || 1;
                const gainHp = skill.effect.value.hp || 2;
                
                card.atk = (card.atk || 0) + gainAtk;
                card.hp = (card.hp || 0) + gainHp;
                buffEvents.push({
                    type: 'buff',
                    playerId: playerId,
                    position: i,
                    atkGain: gainAtk,
                    hpGain: gainHp,
                    sourceCard: card.name
                });
                
                sourceCard.atk = (sourceCard.atk || 0) + gainAtk;
                sourceCard.hp = (sourceCard.hp || 0) + gainHp;
                buffEvents.push({
                    type: 'buff',
                    playerId: playerId,
                    position: sourcePos,
                    atkGain: gainAtk,
                    hpGain: gainHp,
                    sourceCard: card.name
                });
                panelLog(`👹 穷奇惩善扬恶触发，自身与${sourceCard.name}各 +${gainAtk}/+${gainHp}`);
            }
        }
    }

    // ---------- 真人优先配对 ----------
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

    // ---------- 战斗模拟（轮流攻击） ----------
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

        units1.sort((a, b) => a.position - b.position);
        units2.sort((a, b) => a.position - b.position);

        const side1First = Math.random() >= 0.5;
        let curSide = side1First ? 1 : 2;
        let turn = 0;
        let idx1 = 0, idx2 = 0;

        panelLog(`🎲 先手: side${curSide}`);

        while (units1.length > 0 && units2.length > 0 && turn < 200) {
            let attacker = null;
            
            if (curSide === 1) {
                let startIdx = idx1 % units1.length;
                for (let i = 0; i < units1.length; i++) {
                    const checkIdx = (startIdx + i) % units1.length;
                    if (units1[checkIdx] && units1[checkIdx].hp > 0) {
                        attacker = units1[checkIdx];
                        idx1 = (checkIdx + 1) % units1.length;
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

            if (!attacker) break;

            const defenders = curSide === 1 ? units2 : units1;
            const target = findTarget(attacker.position, defenders);
            if (!target) {
                curSide = curSide === 1 ? 2 : 1;
                turn++;
                continue;
            }

            const dmg = attacker.atk;
            if (isNaN(dmg)) break;
            target.hp -= dmg;
            combatLog.push({
                type: 'attack',
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
                    if (curSide === 1) {
                        if (deadIdx <= idx2) idx2 = Math.max(0, idx2 - 1);
                    } else {
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

    // ---------- 动画播放 ----------
    let animQueue = [], isPlaying = false, abortFlag = false;

    function playBuffAnim(buff) {
        return new Promise(resolve => {
            const cardEl = getCardElementByPlayerId(buff.playerId, buff.position);
            if (!cardEl) {
                panelLog(`⏭️ 跳过增益动画，找不到卡牌`, true);
                return resolve();
            }
            const gainText = `+${buff.atkGain || 0}/+${buff.hpGain || 0}`;
            showFloatingText(cardEl, gainText, '#7bffb1', 1200);
            setTimeout(resolve, 400);
        });
    }

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
                            } else {
                                $def.remove();
                            }
                            resolve();
                        }, 350);
                    } else {
                        setTimeout(resolve, 250);
                    }
                }, 230);
            }, 350);
        });
    }

    async function playLog(logs) {
        panelLog(`▶️ 播放 ${logs.length} 步`);
        if (isPlaying) {
            panelLog('⚠️ 动画已在播放，忽略重复调用', true);
            return;
        }
        isPlaying = true;
        isAnimating = true;
        abortFlag = false;
        animQueue = [...logs];
        
        try {
            while (animQueue.length && !abortFlag) {
                const step = animQueue.shift();
                try {
                    if (step.type === 'buff') {
                        await playBuffAnim(step);
                    } else {
                        await playAttackAnim(step);
                    }
                    await new Promise(r => setTimeout(r, 100));
                } catch (e) {
                    panelLog(`❌ 单步动画异常: ${e.message}`, true);
                }
            }
        } catch (e) {
            panelLog(`❌ 动画主循环异常: ${e.message}`, true);
        }
        
        isPlaying = false;
        isAnimating = false;
        panelLog(`✅ 播放完毕`);
    }

    async function resolveBattles(gameState, log, updateCallback) {
        panelLog('🎬 开始结算');
        if (!gameState?.players) return;
        await new Promise(r => setTimeout(r, 300));
        
        // --- 1. 战斗开始前技能增益 ---
        const buffEvents = applyBattleStartSkills(gameState);
        if (buffEvents.length > 0) {
            panelLog(`✨ 播放技能增益动画 (${buffEvents.length} 个)`);
            for (const ev of buffEvents) {
                await playBuffAnim(ev);
                await new Promise(r => setTimeout(r, 150));
            }
            if (window.YYCardShop?.refreshAllUI) {
                window.YYCardShop.refreshAllUI();
            }
            await new Promise(r => setTimeout(r, 500));
        }
        
        // --- 2. 玩家配对与战斗 ---
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
        
        if (updateCallback) await updateCallback();
    }

    return {
        pairPlayers,
        fight: fightWithLog,
        resolveBattles,
        playCombatLog: playLog,
        abortAnimation: () => { abortFlag = true; },
        isAnimating: () => isAnimating
    };
})();

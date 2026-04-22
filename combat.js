// ==================== 战斗模拟模块（动画驱动版） ====================
window.YYCardCombat = (function() {
    const config = window.YYCardConfig;

    // 克隆卡牌（用于模拟战斗，不修改原数据）
    function cloneCard(card) {
        if (!card) return null;
        return {
            ...card,
            hp: Number(card.hp),
            atk: Number(card.atk),
            instanceId: card.instanceId || Math.random().toString(36).substring(2)
        };
    }

    // 配对玩家
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

    // 卡牌伤害值（用于结算，动画中暂不用）
    function getCardDamageValue(card) {
        switch (card.rarity) {
            case 'Common': return 1;
            case 'Rare': return 2;
            case 'Epic': return 3;
            case 'Legendary': return 5;
            default: return 1;
        }
    }

    // 寻找攻击目标（严格按 config 寻敌表）
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

    // 战斗模拟并记录攻击序列（核心）
    function fightWithLog(board1, board2, owner1, owner2) {
        const units1 = [], units2 = [];
        for (let i = 0; i < 6; i++) {
            if (board1[i] && board1[i].hp > 0) {
                const c = cloneCard(board1[i]);
                c.position = i;
                c.ownerId = owner1;
                c.side = 1;
                units1.push(c);
            }
            if (board2[i] && board2[i].hp > 0) {
                const c = cloneCard(board2[i]);
                c.position = i;
                c.ownerId = owner2;
                c.side = 2;
                units2.push(c);
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
            target.hp -= damage;

            combatLog.push({
                attacker: {
                    ownerId: attacker.ownerId,
                    pos: attacker.position,
                    instanceId: attacker.instanceId,
                    atk: attacker.atk
                },
                defender: {
                    ownerId: target.ownerId,
                    pos: target.position,
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

    // ========== 动画播放器（内嵌） ==========
    let animQueue = [];
    let isAnimPlaying = false;
    let animAbortFlag = false;

    function findCardElement(ownerId, position) {
        return document.querySelector(`.card-slot[data-player="${ownerId}"][data-position="${position}"] .card`);
    }

    function playAttackAnim(action) {
        return new Promise(resolve => {
            if (animAbortFlag) { resolve(); return; }

            const $attacker = findCardElement(action.attacker.ownerId, action.attacker.pos);
            const $defender = findCardElement(action.defender.ownerId, action.defender.pos);

            if (!$attacker || !$defender) {
                console.warn('动画跳过：找不到卡牌DOM', action);
                resolve();
                return;
            }

            const aRect = $attacker.getBoundingClientRect();
            const dRect = $defender.getBoundingClientRect();
            const deltaX = dRect.left - aRect.left;
            const deltaY = dRect.top - aRect.top;

            // 攻击方冲刺
            $attacker.style.transition = 'transform 0.2s ease-out';
            $attacker.style.transform = `translate(${deltaX * 0.7}px, ${deltaY * 0.7}px)`;
            $attacker.style.zIndex = '100';

            setTimeout(() => {
                if (animAbortFlag) { resolve(); return; }

                // 受击反馈
                $defender.style.transition = 'transform 0.1s';
                $defender.style.transform = 'scale(0.9)';

                // 伤害数字
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

                // 更新血量显示
                const hpSpan = $defender.querySelector('.card-hp');
                if (hpSpan) hpSpan.textContent = `🛡️${action.defender.hpAfter}`;

                setTimeout(() => {
                    if (animAbortFlag) { resolve(); return; }

                    // 归位
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
        if (isAnimPlaying) return;
        isAnimPlaying = true;
        animAbortFlag = false;
        animQueue = [...logs];
        while (animQueue.length > 0 && !animAbortFlag) {
            const action = animQueue.shift();
            await playAttackAnim(action);
        }
        isAnimPlaying = false;
    }

    function abortAnimation() {
        animAbortFlag = true;
        animQueue = [];
        isAnimPlaying = false;
    }

    // 注入动画样式（只执行一次）
    if (!document.getElementById('combat-anim-style')) {
        const style = document.createElement('style');
        style.id = 'combat-anim-style';
        style.textContent = `
            @keyframes damageFloat {
                0% { opacity: 1; transform: translate(-50%, 0); }
                100% { opacity: 0; transform: translate(-50%, -40px); }
            }
        `;
        document.head.appendChild(style);
    }

    // ========== 动画版战斗结算（供 battle.js 调用） ==========
    async function resolveBattlesWithAnimation(gameState, log, updateCallback) {
        const players = gameState.players;
        const pairs = pairPlayers(players);
        gameState.battlePairs = pairs;

        const battleSessions = [];

        // 1. 后台计算所有对战，收集 combatLog
        for (const [p1Id, p2Id] of pairs) {
            if (!p2Id) {
                log(`🎲 ${p1Id.slice(0,6)} 轮空`);
                continue;
            }
            const p1 = players[p1Id];
            const p2 = players[p2Id];

            const board1 = p1.board.map(c => cloneCard(c));
            const board2 = p2.board.map(c => cloneCard(c));

            const { winner, combatLog } = fightWithLog(board1, board2, p1Id, p2Id);

            battleSessions.push({
                p1Id, p2Id, winner,
                combatLog,
                p1Survivors: board1.filter(c => c.hp > 0).length,
                p2Survivors: board2.filter(c => c.hp > 0).length
            });
        }

        // 2. 播放动画（按对战组顺序）
        for (const session of battleSessions) {
            log(`⚔️ 对战: ${session.p1Id.slice(0,6)} vs ${session.p2Id.slice(0,6)}`);
            await playCombatLog(session.combatLog);
        }

        // 3. 动画结束后，暂时不扣真实血量（仅演示动画）
        // 如需扣血，取消下面注释
        /*
        for (const session of battleSessions) {
            const p1 = players[session.p1Id];
            const p2 = players[session.p2Id];
            if (!p1 || !p2) continue;

            if (session.winner === 0) {
                p1.health = Math.max(0, p1.health - 2);
                p2.health = Math.max(0, p2.health - 2);
            } else {
                const loser = session.winner === 1 ? p2 : p1;
                const winnerPlayer = session.winner === 1 ? p1 : p2;
                const survivorCount = session.winner === 1 ? session.p1Survivors : session.p2Survivors;
                const damage = winnerPlayer.shopLevel + survivorCount * (config.BATTLE.DAMAGE_PER_SURVIVAL || 1);
                loser.health = Math.max(0, loser.health - damage);
            }
            if (p1.health <= 0) p1.isEliminated = true;
            if (p2.health <= 0) p2.isEliminated = true;
        }
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        */

        if (updateCallback) await updateCallback();
    }

    // 公开接口
    return {
        pairPlayers,
        fight: fightWithLog,                    // 兼容旧调用
        fightWithLog,
        getCardDamageValue,
        resolveBattles: resolveBattlesWithAnimation,
        playCombatLog,
        abortAnimation
    };
})();

console.log('✅ combat.js 加载完成（动画驱动版）');

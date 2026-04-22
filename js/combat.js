// ==================== 战斗模拟模块（增强容错版 + 可视化调试） ====================

function debugScreen(msg, color = '#7bffb1') {
    const debugDiv = document.getElementById('mobile-combat-debug') || (() => {
        const d = document.createElement('div');
        d.id = 'mobile-combat-debug';
        d.style.cssText = 'position:fixed; top:10px; left:10px; background:rgba(0,0,0,0.85); color:#0f0; padding:10px 16px; border-radius:12px; z-index:99999; font-size:16px; max-width:90%; pointer-events:none; border-left:4px solid #0f0; box-shadow:0 4px 12px rgba(0,0,0,0.5);';
        document.body.appendChild(d);
        return d;
    })();
    debugDiv.innerHTML = msg;
    debugDiv.style.color = color;
    console.log(msg);
}

debugScreen('🔥 combat.js 开始加载', 'orange');

window.YYCardCombat = (function() {
    debugScreen('📦 进入 combat 模块', '#0ff');
    
    const config = window.YYCardConfig;
    debugScreen('📦 config 存在：' + (config ? '✅是' : '❌否'), config ? '#0f0' : '#f00');
    
    if (!config) {
        debugScreen('❌ 致命错误：YYCardConfig 未定义', '#f00');
        return {};
    }

    // 安全克隆卡牌（防御无效数据）
    function cloneCard(card) {
        if (!card) return null;
        const hp = Number(card.hp);
        const atk = Number(card.atk);
        if (isNaN(hp) || isNaN(atk) || hp <= 0) {
            debugScreen(`⚠️ 卡牌数据异常: ${card.name} hp=${card.hp} atk=${card.atk}`, '#f80');
            return null;
        }
        return {
            ...card,
            hp: hp,
            atk: atk,
            instanceId: card.instanceId || Math.random().toString(36).substring(2)
        };
    }

    function pairPlayers(players) {
        const entries = Object.entries(players).filter(([id, p]) => p.health > 0 && !p.isEliminated);
        const humans = entries.filter(([id, p]) => !p.isBot);
        const bots = entries.filter(([id, p]) => p.isBot);
        // ... 配对逻辑保持不变 ...
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

    function fightWithLog(board1, board2, owner1, owner2) {
        const units1 = [], units2 = [];
        for (let i = 0; i < 6; i++) {
            if (board1[i]) {
                const c = cloneCard(board1[i]);
                if (c && c.hp > 0) {
                    c.position = i;
                    c.ownerId = owner1;
                    c.side = 1;
                    units1.push(c);
                }
            }
            if (board2[i]) {
                const c = cloneCard(board2[i]);
                if (c && c.hp > 0) {
                    c.position = i;
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
                debugScreen(`❌ 攻击力无效: ${attacker.name} atk=${attacker.atk}`, '#f00');
                break;
            }
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

    // 动画播放器（不变）
    let animQueue = [];
    let isAnimPlaying = false;
    let animAbortFlag = false;

    function findCardElement(ownerId, position) {
        return document.querySelector(`.card-slot[data-player="${ownerId}"][data-position="${position}"] .card`);
    }

    function playAttackAnim(action) {
        return new Promise(resolve => {
            if (animAbortFlag) { resolve(); return; }
            debugScreen(`⚔️ 攻击: pos${action.attacker.pos} → pos${action.defender.pos}`, '#f0f');
            // ... 动画代码不变 ...
            const $attacker = findCardElement(action.attacker.ownerId, action.attacker.pos);
            const $defender = findCardElement(action.defender.ownerId, action.defender.pos);
            if (!$attacker || !$defender) {
                debugScreen(`⚠️ 找不到卡牌DOM`, '#f80');
                resolve();
                return;
            }
            // ... 后续动画 ...
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
        debugScreen(`▶️ 播放动画，共 ${logs.length} 步`, '#ff0');
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
            debugScreen(`❌ 动画播放异常: ${err.message}`, '#f00');
        }
        isAnimPlaying = false;
        debugScreen(`✅ 动画播放完毕`, '#0f0');
    }

    function abortAnimation() {
        animAbortFlag = true;
        animQueue = [];
        isAnimPlaying = false;
    }

    if (!document.getElementById('combat-anim-style')) {
        const style = document.createElement('style');
        style.id = 'combat-anim-style';
        style.textContent = `@keyframes damageFloat { 0% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -40px); } }`;
        document.head.appendChild(style);
    }

    async function resolveBattlesWithAnimation(gameState, log, updateCallback) {
        debugScreen('🎬 开始战斗结算', '#0ff');
        const players = gameState.players;
        const pairs = pairPlayers(players);
        gameState.battlePairs = pairs;
        debugScreen(`👥 配对完成，共 ${pairs.length} 组`, '#0f0');

        const battleSessions = [];
        for (const [p1Id, p2Id] of pairs) {
            if (!p2Id) continue;
            const p1 = players[p1Id];
            const p2 = players[p2Id];
            if (!p1 || !p2) continue;
            const board1 = p1.board.map(c => cloneCard(c)).filter(c => c !== null);
            const board2 = p2.board.map(c => cloneCard(c)).filter(c => c !== null);
            try {
                const { winner, combatLog } = fightWithLog(board1, board2, p1Id, p2Id);
                debugScreen(`📊 对战 ${p1Id.slice(0,6)} vs ${p2Id.slice(0,6)}，攻击序列 ${combatLog.length} 步`, '#0ff');
                battleSessions.push({ p1Id, p2Id, winner, combatLog });
            } catch (err) {
                debugScreen(`❌ 对战计算失败: ${err.message}`, '#f00');
            }
        }

        for (const session of battleSessions) {
            log(`⚔️ 对战: ${session.p1Id.slice(0,6)} vs ${session.p2Id.slice(0,6)}`);
            await playCombatLog(session.combatLog);
        }

        debugScreen('🏁 战斗动画流程结束', '#0f0');
        if (updateCallback) await updateCallback();
    }

    debugScreen('✅ combat 模块即将导出', '#0f0');
    return {
        pairPlayers,
        fight: fightWithLog,
        fightWithLog,
        getCardDamageValue,
        resolveBattles: resolveBattlesWithAnimation,
        playCombatLog,
        abortAnimation
    };
})();

console.log('✅ combat.js 加载完成（增强容错版）');
debugScreen('✅ combat.js 加载完成', '#0f0');

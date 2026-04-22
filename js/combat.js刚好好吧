// ==================== 战斗模拟模块（最终稳定版：基于玩家ID定位棋盘 + 死亡移除） ====================
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

    panelLog('✅ combat.js 最终稳定版');

    // 通过玩家ID和棋盘数据索引获取卡牌元素
    function getCardElementByPlayerId(playerId, dataPos) {
        // 查找 data-player-id 匹配的棋盘容器
        const board = document.querySelector(`.board[data-player-id="${playerId}"]`);
        if (!board) return null;
        const slot = board.querySelector(`.card-slot[data-board-index="${dataPos}"]`);
        if (!slot) return null;
        return slot.querySelector('.card:not(.empty-slot)') || slot.querySelector('img');
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

        const side1First = Math.random() >= 0.5;
        let curSide = side1First ? 1 : 2, turn = 0;
        while (units1.length && units2.length && turn < 200) {
            const attackers = curSide === 1 ? units1 : units2;
            const defenders = curSide === 1 ? units2 : units1;
            const sorted = [...attackers].sort((a, b) => a.position - b.position);
            const att = sorted[0];
            if (!att) break;
            const target = findTarget(att.position, defenders);
            if (!target) { curSide = curSide === 1 ? 2 : 1; turn++; continue; }
            const dmg = att.atk;
            if (isNaN(dmg)) break;
            target.hp -= dmg;
            combatLog.push({
                attackerOwnerId: att.ownerId,
                defenderOwnerId: target.ownerId,
                attackerPos: att.position,
                defenderPos: target.position,
                damage: dmg,
                defenderHpAfter: target.hp,
                isFatal: target.hp <= 0
            });
            if (target.hp <= 0) {
                const idx = defenders.findIndex(u => u.instanceId === target.instanceId);
                if (idx !== -1) defenders.splice(idx, 1);
            }
            curSide = curSide === 1 ? 2 : 1;
            turn++;
        }
        return { winner: units1.length ? 1 : 2, combatLog };
    }

    // 动画播放
    let animQueue = [], isPlaying = false, abortFlag = false;
    function playAttackAnim(a) {
        return new Promise(resolve => {
            if (abortFlag) return resolve();
            const $att = getCardElementByPlayerId(a.attackerOwnerId, a.attackerPos);
            const $def = getCardElementByPlayerId(a.defenderOwnerId, a.defenderPos);
            if (!$att || !$def) {
                panelLog(`⏭️ 跳过 ${a.attackerOwnerId.slice(0,6)}[${a.attackerPos}]→${a.defenderOwnerId.slice(0,6)}[${a.defenderPos}]`, true);
                return resolve();
            }
            panelLog(`⚔️ ${a.attackerOwnerId.slice(0,6)}[${a.attackerPos}]→${a.defenderOwnerId.slice(0,6)}[${a.defenderPos}]`);
            const ar = $att.getBoundingClientRect(), dr = $def.getBoundingClientRect();
            const dx = dr.left - ar.left, dy = dr.top - ar.top;
            $att.style.transition = 'transform 0.2s';
            $att.style.transform = `translate(${dx*0.7}px, ${dy*0.7}px)`;
            $att.style.zIndex = '100';
            setTimeout(() => {
                if (abortFlag) return resolve();
                $def.style.transition = 'transform 0.1s';
                $def.style.transform = 'scale(0.9)';
                const dmgDiv = document.createElement('div');
                dmgDiv.textContent = `-${a.damage}`;
                dmgDiv.style.cssText = 'position:absolute; color:#f44; font-size:28px; font-weight:bold; text-shadow:0 0 8px #000; z-index:200; left:50%; top:40%; transform:translate(-50%,-50%); animation:damageFloat 0.8s forwards;';
                $def.style.position = 'relative';
                $def.appendChild(dmgDiv);
                setTimeout(() => dmgDiv.remove(), 800);
                const hpSpan = $def.querySelector('.card-hp');
                if (hpSpan) hpSpan.textContent = `🛡️${a.defenderHpAfter}`;
                setTimeout(() => {
                    if (abortFlag) return resolve();
                    $att.style.transition = 'transform 0.15s';
                    $att.style.transform = 'translate(0,0)';
                    $att.style.zIndex = '';
                    $def.style.transform = 'scale(1)';
                    if (a.isFatal) {
                        $def.style.transition = 'opacity 0.3s, transform 0.3s';
                        $def.style.opacity = '0';
                        $def.style.transform = 'scale(0.5)';
                        setTimeout(() => {
                            $def.remove(); // 从DOM中移除死亡卡牌
                            resolve();
                        }, 300);
                    } else {
                        setTimeout(resolve, 150);
                    }
                }, 150);
            }, 200);
        });
    }

    async function playLog(logs) {
        panelLog(`▶️ 播放 ${logs.length} 步`);
        if (isPlaying) return;
        isPlaying = true;
        abortFlag = false;
        animQueue = [...logs];
        try { while (animQueue.length && !abortFlag) await playAttackAnim(animQueue.shift()); }
        catch (e) { panelLog(`❌ 动画异常: ${e.message}`, true); }
        isPlaying = false;
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
            await playLog(combatLog); // 直接传入原始记录，内部通过 ownerId 定位
        }
        panelLog('🏁 结束');
        if (updateCallback) await updateCallback();
    }

    return {
        pairPlayers,
        fight: fightWithLog,
        resolveBattles,
        playCombatLog: playLog,
        abortAnimation: () => { abortFlag = true; }
    };
})();

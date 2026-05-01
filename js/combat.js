// ==================== 战斗模拟模块（调试面板置顶 + 一键复制日志） ====================
window.YYCardCombat = (function() {
    let isAnimating = false;
    const AVG_STEP_MS = 480;

    // 保存日志，用于一键复制
    let _combatLogText = '';

    const ENEMY_DATA_TO_VISUAL = { 0:3, 1:4, 2:5, 3:0, 4:1, 5:2 };

    // ================== 可视化调试面板（屏幕顶部） ==================
    function ensureDebugPanel() {
        if (document.getElementById('combat-debug-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'combat-debug-panel';
        panel.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; max-height: 35vh;
            overflow-y: auto; background: rgba(0,0,0,0.92); color: #0f0;
            font-family: monospace; font-size: 11px; padding: 8px 10px;
            z-index: 99999; border-bottom: 2px solid #0f0;
        `;

        // 标题栏
        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
        const title = document.createElement('span');
        title.textContent = '🐵 西游技能调试面板';
        title.style.cssText = 'font-weight:bold; color:#ff0;';
        header.appendChild(title);

        // 复制按钮
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 一键复制日志';
        copyBtn.style.cssText = `
            background:#0f0; color:#000; border:none; padding:4px 10px;
            border-radius:4px; font-weight:bold; font-size:11px; cursor:pointer;
        `;
        copyBtn.onclick = () => {
            if (!_combatLogText) {
                alert('暂无日志可复制');
                return;
            }
            if (navigator.clipboard) {
                navigator.clipboard.writeText(_combatLogText).then(() => {
                    copyBtn.textContent = '✅ 已复制!';
                    setTimeout(() => { copyBtn.textContent = '📋 一键复制日志'; }, 1500);
                });
            } else {
                // 降级：创建临时文本框
                const ta = document.createElement('textarea');
                ta.value = _combatLogText;
                ta.style.cssText = 'position:fixed;top:-9999px;';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                copyBtn.textContent = '✅ 已复制!';
                setTimeout(() => { copyBtn.textContent = '📋 一键复制日志'; }, 1500);
            }
        };
        header.appendChild(copyBtn);
        panel.appendChild(header);

        const content = document.createElement('div');
        content.id = 'combat-debug-content';
        content.style.cssText = 'margin-top:6px; white-space:pre-wrap; word-break:break-all;';
        panel.appendChild(content);
        document.body.appendChild(panel);
    }

    function debugLog(msg) {
        _combatLogText += msg + '\n';
        ensureDebugPanel();
        const content = document.getElementById('combat-debug-content');
        if (!content) return;
        const line = document.createElement('div');
        line.textContent = msg;
        content.appendChild(line);
        const panel = document.getElementById('combat-debug-panel');
        if (panel) panel.scrollTop = panel.scrollHeight;
    }

    function debugBoard(playerId, players) {
        const player = players[playerId];
        if (!player) {
            debugLog(`玩家 ${playerId.slice(0,8)} 不存在`);
            return;
        }
        debugLog(`------ 玩家 ${playerId.slice(0,8)} 棋盘 ------`);
        debugLog(`斩妖除魔层数: ${player.demonSlayerLevel ?? 0}`);
        if (!player.board || !Array.isArray(player.board)) {
            debugLog('棋盘为空');
            return;
        }
        player.board.forEach((card, idx) => {
            if (card) {
                debugLog(`位置${idx}: ${card.card_id || '无ID'} | 阵营:${card.faction || '无'} | HP:${card.hp} | ATK:${card.atk} | 名称:${card.name || ''}`);
            } else {
                debugLog(`位置${idx}: 空`);
            }
        });
        debugLog('---------------------------');
    }

    function clearDebug() {
        _combatLogText = '';
        const content = document.getElementById('combat-debug-content');
        if (content) content.innerHTML = '';
    }

    // ================== 动画相关函数 ==================
    function getCardElement(playerId, dataPos, isEnemy) {
        const board = document.querySelector(`.board[data-player-id="${playerId}"]`);
        if (!board) return null;
        let slot = board.querySelector(`.card-slot[data-board-index="${dataPos}"]`);
        if (slot) return slot.querySelector('.card:not(.empty-slot)');
        if (isEnemy) {
            const visual = ENEMY_DATA_TO_VISUAL[dataPos];
            if (visual !== undefined) {
                slot = board.querySelector(`.card-slot[data-board-index="${visual}"]`);
                if (slot) return slot.querySelector('.card:not(.empty-slot)');
            }
        }
        const allSlots = board.querySelectorAll('.card-slot');
        for (const s of allSlots) {
            const idx = s.getAttribute('data-board-index');
            if (idx == dataPos) {
                const card = s.querySelector('.card:not(.empty-slot)');
                if (card) return card;
            }
        }
        return null;
    }

    function floatingText(el, text, color, duration) {
        const d = document.createElement('div');
        d.textContent = text;
        d.style.cssText = `position:absolute; color:${color}; font-size:28px; font-weight:bold; text-shadow:0 0 6px #000; z-index:200; left:50%; top:30%; transform:translate(-50%,-50%); animation:damageFloat ${duration}ms forwards; pointer-events:none;`;
        el.style.position = 'relative';
        el.appendChild(d);
        setTimeout(() => d.remove(), duration);
    }

    let abortFlag = false;

    function buffAnim(buff) {
        return new Promise(resolve => {
            const myId = window.YYCardAuth?.currentUser?.id;
            const isEnemy = buff.playerId !== myId;
            const el = getCardElement(buff.playerId, buff.position, isEnemy);
            if (!el) {
                debugLog(`⚠️ 增益动画未找到元素: player=${buff.playerId.slice(0,8)} pos=${buff.position} buff=${buff.sourceCard || ''} ${buff.desc || ''}`);
                return resolve();
            }
            floatingText(el, `+${buff.atkGain || 0}/+${buff.hpGain || 0}`, '#7bffb1', 1000);
            setTimeout(resolve, 300);
        });
    }

    function attackAnim(a) {
        return new Promise(resolve => {
            if (abortFlag) return resolve();
            const attBoard = document.querySelector(`.board[data-player-id="${a.attackerOwnerId}"]`);
            const defBoard = document.querySelector(`.board[data-player-id="${a.defenderOwnerId}"]`);
            if (!attBoard || !defBoard) return resolve();
            const attSlot = attBoard.querySelector(`.card-slot[data-board-index="${a.attackerPos}"]`);
            const defSlot = defBoard.querySelector(`.card-slot[data-board-index="${a.defenderPos}"]`);
            if (!attSlot || !defSlot) return resolve();
            const att = attSlot.querySelector('.card:not(.empty-slot)');
            const def = defSlot.querySelector('.card:not(.empty-slot)');
            if (!att || !def) return resolve();

            const ar = att.getBoundingClientRect(), dr = def.getBoundingClientRect();
            const dx = (dr.left - ar.left) * 0.7, dy = (dr.top - ar.top) * 0.7;
            att.style.transition = 'transform 0.35s ease-out';
            att.style.transform = `translate(${dx}px, ${dy}px)`;
            att.style.zIndex = '100';

            setTimeout(() => {
                if (abortFlag) return resolve();
                def.style.transition = 'transform 0.15s';
                def.style.transform = 'scale(0.85)';
                const dmgDiv = document.createElement('div');
                dmgDiv.textContent = `-${a.damage}`;
                dmgDiv.style.cssText = 'position:absolute; color:#f44; font-size:32px; font-weight:bold; text-shadow:0 0 8px #000; z-index:200; left:50%; top:40%; transform:translate(-50%,-50%); animation:damageFloat 1s forwards; pointer-events:none;';
                def.style.position = 'relative';
                def.appendChild(dmgDiv);
                setTimeout(() => dmgDiv.remove(), 1000);
                const hpSpan = def.querySelector('.card-hp');
                if (hpSpan) hpSpan.textContent = `🛡️${a.defenderHpAfter}`;

                setTimeout(() => {
                    if (abortFlag) return resolve();
                    att.style.transition = 'transform 0.25s';
                    att.style.transform = 'translate(0,0)';
                    att.style.zIndex = '';
                    def.style.transform = 'scale(1)';
                    if (a.isFatal) {
                        def.style.transition = 'opacity 0.35s, transform 0.35s';
                        def.style.opacity = '0';
                        def.style.transform = 'scale(0.5)';
                        setTimeout(() => {
                            const slot = def.parentNode;
                            if (slot && slot.classList.contains('card-slot')) {
                                slot.innerHTML = '';
                                const empty = document.createElement('div');
                                empty.className = 'card empty-slot';
                                empty.textContent = '⬤';
                                slot.appendChild(empty);
                            } else def.remove();
                            resolve();
                        }, 350);
                    } else setTimeout(resolve, 250);
                }, 230);
            }, 350);
        });
    }

    async function playSteps(steps) {
        if (isAnimating) return;
        isAnimating = true;
        abortFlag = false;
        for (const step of steps) {
            if (abortFlag) break;
            if (step.type === 'buff') await buffAnim(step);
            else await attackAnim(step);
            await new Promise(r => setTimeout(r, 80));
        }
        isAnimating = false;
    }

    async function resolveBattles(gameState, log, onComplete) {
        if (!gameState?.players) { onComplete?.(); return; }
        const roomId = window.YYCardBattle?.getCurrentRoomId();
        if (!roomId) {
            debugLog('[Combat] 无房间ID');
            onComplete?.();
            return;
        }

        const myId = window.YYCardAuth?.currentUser?.id;
        clearDebug();
        debugLog('🔍 ====== 战斗结算开始 ======');

        if (myId) {
            debugLog('📤 发送结算请求前');
            debugBoard(myId, gameState.players);
        }

        let data;
        try {
            const supabase = window.supabase;
            const { data: { session } } = await supabase.auth.getSession();
            const resp = await fetch(
                'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settle-battle',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ roomId, gameState })
                }
            );
            data = await resp.json();
            if (!data.success) {
                debugLog('[Combat] 后端结算失败: ' + data.error);
                if (onComplete) onComplete();
                return;
            }
        } catch (err) {
            debugLog('[Combat] 调用后端异常: ' + err.message);
            if (onComplete) onComplete();
            return;
        }

        if (data.demonSlayerLevels) {
            debugLog('🔢 后端返回层数: ' + JSON.stringify(data.demonSlayerLevels));
        }

        const buffEvents = data.buffEvents || [];
        const combatResults = data.combatResults || [];

        // 记录动画步骤概要
        debugLog(`🎬 动画步骤总数: buffEvents=${buffEvents.length}`);
        combatResults.forEach((cr, i) => {
            const logCount = cr.combatLog ? cr.combatLog.length : 0;
            debugLog(`  对战${i+1}: ${cr.p1.slice(0,8)} vs ${cr.p2.slice(0,8)}, 胜者=${cr.winner}, 事件=${logCount}`);
        });

        const allSteps = [...buffEvents];
        combatResults.forEach(cr => { if (cr.combatLog) allSteps.push(...cr.combatLog); });

        const animStart = data.animStartTime ? new Date(data.animStartTime).getTime() : Date.now();
        const elapsed = Math.max(0, Date.now() - animStart);
        const skipCount = Math.min(Math.floor(elapsed / AVG_STEP_MS), allSteps.length);
        const remaining = allSteps.slice(skipCount);

        if (skipCount > 0) debugLog(`⏭️ 跳过 ${skipCount} 个已过时步骤`);
        debugLog(`▶️ 播放 ${remaining.length} 个步骤`);

        if (remaining.length > 0) {
            await playSteps(remaining);
        }

        if (data.updatedPlayers) {
            const oldPlayers = gameState.players;
            gameState.players = data.updatedPlayers;
            for (const pid in oldPlayers) {
                if (gameState.players[pid]) {
                    gameState.players[pid].gold = oldPlayers[pid]?.gold ?? 0;
                    gameState.players[pid].exp = oldPlayers[pid]?.exp ?? 0;
                    gameState.players[pid].shopLevel = oldPlayers[pid]?.shopLevel ?? 1;
                    gameState.players[pid].shopCards = oldPlayers[pid]?.shopCards ?? [];
                    gameState.players[pid].hand = oldPlayers[pid]?.hand ?? [];
                    gameState.players[pid].isReady = oldPlayers[pid]?.isReady ?? false;
                }
            }

            if (myId) {
                debugLog('📥 结算完成后');
                debugBoard(myId, gameState.players);
            }
        }

        debugLog('✅ ====== 战斗结算结束 ======');

        if (window.YYCardShop?.refreshAllUI) {
            window.YYCardShop.refreshAllUI();
        }
        if (onComplete) onComplete();
    }

    ensureDebugPanel();

    return {
        resolveBattles,
        abortAnimation: () => { abortFlag = true; },
        isAnimating: () => isAnimating
    };
})();

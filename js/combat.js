// ==================== 战斗模拟模块（修复淘汰后动画消失 + 增益/战斗分离） ====================
window.YYCardCombat = (function() {
    let isAnimating = false;
    const AVG_STEP_MS = 480;

    // 敌方数据索引 → 视觉索引映射
    const ENEMY_DATA_TO_VISUAL = { 0:3, 1:4, 2:5, 3:0, 4:1, 5:2 };

    function getCardElement(playerId, dataPos, isEnemy) {
        const board = document.querySelector(`.board[data-player-id="${playerId}"]`);
        if (!board) return null;

        // 尝试1：data-board-index 直接匹配
        let slot = board.querySelector(`.card-slot[data-board-index="${dataPos}"]`);
        if (slot) return slot.querySelector('.card:not(.empty-slot)');

        // 尝试2：敌方镜像映射
        if (isEnemy) {
            const visual = ENEMY_DATA_TO_VISUAL[dataPos];
            if (visual !== undefined) {
                slot = board.querySelector(`.card-slot[data-board-index="${visual}"]`);
                if (slot) return slot.querySelector('.card:not(.empty-slot)');
            }
        }

        // 尝试3：遍历所有 card-slot
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
                // 淘汰后可能没有DOM，不卡住，直接略过
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

    // 播放一系列步骤（供内部使用，不再对外直接暴露 playSteps）
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

    // 播放增益动画列表（暴露给外部）
    async function flushBuffEvents(buffEvents) {
        if (!buffEvents || buffEvents.length === 0) return;
        if (isAnimating) {
            await new Promise(resolve => {
                const check = () => {
                    if (!isAnimating) resolve();
                    else setTimeout(check, 100);
                };
                check();
            });
        }
        isAnimating = true;
        abortFlag = false;
        try {
            for (const step of buffEvents) {
                if (abortFlag) break;
                if (step.type === 'buff') await buffAnim(step);
                await new Promise(r => setTimeout(r, 80));
            }
        } finally {
            isAnimating = false;
        }
    }

    // 核心结算函数：调用后端，返回动画数据和更新后的游戏状态
    async function resolveBattles(gameState, log, onComplete) {
        if (!gameState?.players) { onComplete?.(); return null; }
        const roomId = window.YYCardBattle?.getCurrentRoomId();
        if (!roomId) {
            console.error('[Combat] 无房间ID');
            onComplete?.();
            return null;
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
                console.error('[Combat] 后端结算失败:', data.error);
                if (onComplete) onComplete();
                return null;
            }
        } catch (err) {
            console.error('[Combat] 调用后端异常:', err);
            if (onComplete) onComplete();
            return null;
        }

        // 更新玩家数据（不在此处播放动画）
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
        }

        if (window.YYCardShop?.refreshAllUI) {
            window.YYCardShop.refreshAllUI();
        }

        if (onComplete) onComplete();

        // 返回动画数据供调用方按顺序播放
        return {
            buffEvents: data.buffEvents || [],
            combatResults: data.combatResults || [],
            animStartTime: data.animStartTime
        };
    }

    // 播放所有战斗动画（增益+逐对战斗），带有跳过已过期动画的逻辑
    async function playAllAnimations(animData) {
        if (!animData) return;
        const { buffEvents, combatResults, animStartTime } = animData;

        // 1. 播放增益动画
        if (buffEvents && buffEvents.length > 0) {
            await flushBuffEvents(buffEvents);
        }

        // 2. 逐对播放战斗动画
        if (!combatResults || combatResults.length === 0) return;

        const animStart = animStartTime ? new Date(animStartTime).getTime() : Date.now();
        for (const cr of combatResults) {
            if (!cr.combatLog || cr.combatLog.length === 0) continue;
            const elapsed = Math.max(0, Date.now() - animStart);
            const skipCount = Math.min(Math.floor(elapsed / AVG_STEP_MS), cr.combatLog.length);
            const remaining = cr.combatLog.slice(skipCount);

            // 播放本场战斗剩余步骤
            if (remaining.length > 0) {
                await playSteps(remaining);
            }
        }
    }

    return {
        resolveBattles,      // 获取后端数据 + 更新状态（不播放动画）
        flushBuffEvents,     // 单独播放增益动画
        playAllAnimations,   // 按顺序播放所有动画（增益 → 逐场战斗）
        abortAnimation: () => { abortFlag = true; },
        isAnimating: () => isAnimating
    };
})();

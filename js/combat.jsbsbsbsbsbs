// ==================== 战斗模拟模块（最终稳定版：跳过无法攻击 + 增益动画强查找） ====================
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
            // 留下调试线索（即使控制台不可见，也不影响）
            if (!el) {
                console.warn(`[Combat] 增益动画未找到元素: playerId=${buff.playerId.slice(0,8)} pos=${buff.position} isEnemy=${isEnemy}`);
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
            console.error('[Combat] 无房间ID');
            onComplete?.();
            return;
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
                return;
            }
        } catch (err) {
            console.error('[Combat] 调用后端异常:', err);
            if (onComplete) onComplete();
            return;
        }

        const buffEvents = data.buffEvents || [];
        const combatResults = data.combatResults || [];
        const allSteps = [...buffEvents];
        combatResults.forEach(cr => { if (cr.combatLog) allSteps.push(...cr.combatLog); });

        const animStart = data.animStartTime ? new Date(data.animStartTime).getTime() : Date.now();
        const elapsed = Math.max(0, Date.now() - animStart);
        const skipCount = Math.min(Math.floor(elapsed / AVG_STEP_MS), allSteps.length);
        const remaining = allSteps.slice(skipCount);

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
        }

        if (window.YYCardShop?.refreshAllUI) {
            window.YYCardShop.refreshAllUI();
        }
        if (onComplete) onComplete();
    }

    return {
        resolveBattles,
        abortAnimation: () => { abortFlag = true; },
        isAnimating: () => isAnimating
    };
})();

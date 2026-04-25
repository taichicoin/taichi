// ==================== 战斗模拟模块（后端日志驱动 + 快进重连 + 死亡保护） ====================
window.YYCardCombat = (function() {
    let isAnimating = false;
    const AVG_STEP_MS = 480; // 每步动画平均耗时 (buff约300+80, attack约580+80)

    function getCardElement(playerId, dataPos) {
        const board = document.querySelector(`.board[data-player-id="${playerId}"]`);
        if (!board) return null;
        const slot = board.querySelector(`.card-slot[data-board-index="${dataPos}"]`);
        if (!slot) return null;
        return slot.querySelector('.card:not(.empty-slot)');
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
            const el = getCardElement(buff.playerId, buff.position);
            if (!el) return resolve();
            floatingText(el, `+${buff.atkGain || 0}/+${buff.hpGain || 0}`, '#7bffb1', 1000);
            setTimeout(resolve, 300);
        });
    }

    function attackAnim(a) {
        return new Promise(resolve => {
            if (abortFlag) return resolve();
            const att = getCardElement(a.attackerOwnerId, a.attackerPos);
            const def = getCardElement(a.defenderOwnerId, a.defenderPos);
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

    // ★ 核心：调用后端 settled-battle，获取动画日志并播放
    async function resolveBattles(gameState, log, onComplete) {
        if (!gameState?.players) {
            if (onComplete) onComplete();
            return;
        }
        const roomId = window.YYCardBattle?.getCurrentRoomId();
        if (!roomId) {
            console.error('[Combat] 无房间ID');
            if (onComplete) onComplete();
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

        // 合并动画步骤 (buff 在前，攻击在后)
        const buffEvents = data.buffEvents || [];
        const combatResults = data.combatResults || [];
        const allSteps = [...buffEvents];
        combatResults.forEach(cr => {
            if (cr.combatLog) allSteps.push(...cr.combatLog);
        });

        // 重连快进
        const animStart = data.animStartTime ? new Date(data.animStartTime).getTime() : Date.now();
        const elapsed = Math.max(0, Date.now() - animStart);
        const skipCount = Math.min(Math.floor(elapsed / AVG_STEP_MS), allSteps.length);
        const remaining = allSteps.slice(skipCount);

        // 播放剩余动画
        if (remaining.length > 0) {
            await playSteps(remaining);
        }

        // 用后端返回的最新数据更新本地 gameState (可先保留旧的经济数据)
        if (data.updatedPlayers) {
            const oldPlayers = gameState.players;
            gameState.players = data.updatedPlayers;
            // 经济数据后端可能没返回，需要合并回来
            for (const pid in oldPlayers) {
                if (gameState.players[pid]) {
                    gameState.players[pid].gold = oldPlayers[pid].gold;
                    gameState.players[pid].exp = oldPlayers[pid].exp;
                    gameState.players[pid].shopLevel = oldPlayers[pid].shopLevel;
                    gameState.players[pid].shopCards = oldPlayers[pid].shopCards;
                    gameState.players[pid].hand = oldPlayers[pid].hand;
                    gameState.players[pid].isReady = oldPlayers[pid].isReady;
                }
            }
        }

        // 刷新 UI（动画结束后，后端数据已包含阵亡单位，刷新后死亡卡牌消失）
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

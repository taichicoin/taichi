// ==================== 战斗模拟模块（后端结算 + 动画播放 + 快进重连） ====================
window.YYCardCombat = (function() {
    let isAnimating = false;

    const AVG_STEP_MS = 500; // 每步动画平均耗时（用于重连快进估算）

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
            console.error('[Combat] 动画播放异常:', e);
        }
        isPlaying = false;
        isAnimating = false;
    }

    // ---------- 调用后端结算 ----------
    async function resolveBattles(gameState, log, updateCallback) {
        if (!gameState?.players) return;
        const roomId = window.YYCardBattle?.getCurrentRoomId();
        if (!roomId) {
            console.error('[Combat] 无房间ID');
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
                // 即使失败也尝试更新UI (可能后端有问题但数据没变)
                if (updateCallback) await updateCallback();
                return;
            }
        } catch (err) {
            console.error('[Combat] 调用后端异常:', err);
            if (updateCallback) await updateCallback();
            return;
        }

        // ★ 合并动画日志：技能增益 + 战斗记录 ★
        const buffEvents = data.buffEvents || [];
        const combatResults = data.combatResults || [];
        const allSteps = [...buffEvents];
        combatResults.forEach(cr => {
            if (cr.combatLog) allSteps.push(...cr.combatLog);
        });

        console.log('[Combat] 动画总步数:', allSteps.length);

        // ★ 重连快进 ★
        const animStartTime = data.animStartTime ? new Date(data.animStartTime).getTime() : Date.now();
        const elapsed = Math.max(0, Date.now() - animStartTime);
        const skipCount = Math.min(Math.floor(elapsed / AVG_STEP_MS), allSteps.length);
        const remainingSteps = allSteps.slice(skipCount);
        console.log(`[Combat] 动画已过 ${elapsed}ms, 跳过 ${skipCount} 步, 剩余 ${remainingSteps.length} 步`);

        // ★ 播放剩余动画 ★
        if (remainingSteps.length > 0) {
            await playLog(remainingSteps);
        }

        // ★ 用后端返回的最新数据更新 gameState ★
        if (data.updatedPlayers) {
            gameState.players = data.updatedPlayers;
            console.log('[Combat] 已用后端数据更新 players');
        }

        // 刷新 UI
        if (window.YYCardShop?.refreshAllUI) {
            window.YYCardShop.refreshAllUI();
        }
        if (updateCallback) await updateCallback();
    }

    return {
        resolveBattles,
        playCombatLog: playLog,
        abortAnimation: () => { abortFlag = true; },
        isAnimating: () => isAnimating
    };
})();

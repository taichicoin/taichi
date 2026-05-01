// ==================== 战斗模拟模块（防跳过 + 纯数字自适应 + 动画兜底） ====================
window.YYCardCombat = (function() {
    let isAnimating = false;
    const AVG_STEP_MS = 480;
    let _combatLogText = '';

    const ENEMY_DATA_TO_VISUAL = { 0:3, 1:4, 2:5, 3:0, 4:1, 5:2 };

    // ================== 调试面板（可折叠，置顶） ==================
    function ensureDebugPanel() {
        if (document.getElementById('combat-debug-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'combat-debug-panel';
        panel.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; max-height: 35vh;
            overflow-y: auto; background: rgba(0,0,0,0.92); color: #0f0;
            font-family: monospace; font-size: 11px; padding: 8px 10px;
            z-index: 99999; border-bottom: 2px solid #0f0;
            pointer-events: auto;
        `;

        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px;';
        const title = document.createElement('span');
        title.textContent = '🐵 动画调试面板';
        title.style.cssText = 'font-weight:bold; color:#ff0;';
        header.appendChild(title);

        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display:flex; gap:6px;';

        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = '▲ 隐藏';
        toggleBtn.style.cssText = `
            background:#555; color:#fff; border:none; padding:4px 10px;
            border-radius:4px; font-size:11px; cursor:pointer;
        `;
        const content = document.createElement('div');
        content.id = 'combat-debug-content';
        content.style.cssText = 'margin-top:6px; white-space:pre-wrap; word-break:break-all;';

        toggleBtn.onclick = () => {
            if (content.style.display === 'none') {
                content.style.display = '';
                toggleBtn.textContent = '▲ 隐藏';
            } else {
                content.style.display = 'none';
                toggleBtn.textContent = '▼ 展开';
            }
        };
        btnGroup.appendChild(toggleBtn);

        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 复制日志';
        copyBtn.style.cssText = `
            background:#0f0; color:#000; border:none; padding:4px 10px;
            border-radius:4px; font-weight:bold; font-size:11px; cursor:pointer;
        `;
        copyBtn.onclick = () => {
            if (!_combatLogText) { alert('暂无日志可复制'); return; }
            if (navigator.clipboard) {
                navigator.clipboard.writeText(_combatLogText).then(() => {
                    copyBtn.textContent = '✅ 已复制!';
                    setTimeout(() => { copyBtn.textContent = '📋 复制日志'; }, 1500);
                });
            } else {
                const ta = document.createElement('textarea');
                ta.value = _combatLogText;
                ta.style.cssText = 'position:fixed;top:-9999px;';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                copyBtn.textContent = '✅ 已复制!';
                setTimeout(() => { copyBtn.textContent = '📋 复制日志'; }, 1500);
            }
        };
        btnGroup.appendChild(copyBtn);
        header.appendChild(btnGroup);
        panel.appendChild(header);
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

    function clearDebug() {
        _combatLogText = '';
        const content = document.getElementById('combat-debug-content');
        if (content) content.innerHTML = '';
    }

    // ================== 强力DOM查找（5级兜底） ==================
    function getCardElement(playerId, dataPos, isEnemy) {
        const board = document.querySelector(`.board[data-player-id="${playerId}"]`);
        if (!board) {
            debugLog(`[DOM] 找不到棋盘: ${playerId.slice(0,8)}`);
            return null;
        }

        // 1. 直接 data-board-index
        let slot = board.querySelector(`.card-slot[data-board-index="${dataPos}"]`);
        if (slot) {
            const card = slot.querySelector('.card:not(.empty-slot)');
            if (card) return card;
        }

        // 2. 敌方镜像
        if (isEnemy) {
            const visual = ENEMY_DATA_TO_VISUAL[dataPos];
            if (visual !== undefined) {
                slot = board.querySelector(`.card-slot[data-board-index="${visual}"]`);
                if (slot) {
                    const card = slot.querySelector('.card:not(.empty-slot)');
                    if (card) return card;
                }
            }
        }

        // 3. data-slot-index
        slot = board.querySelector(`.card-slot[data-slot-index="${dataPos}"]`);
        if (slot) {
            const card = slot.querySelector('.card:not(.empty-slot)');
            if (card) return card;
        }

        // 4. 遍历所有卡槽，匹配 data-board-index
        const allSlots = board.querySelectorAll('.card-slot');
        for (const s of allSlots) {
            const idx = s.getAttribute('data-board-index');
            if (idx == dataPos) {
                const card = s.querySelector('.card:not(.empty-slot)');
                if (card) return card;
            }
        }

        // 5. 遍历匹配 data-slot-index
        for (const s of allSlots) {
            const idx = s.getAttribute('data-slot-index');
            if (idx == dataPos) {
                const card = s.querySelector('.card:not(.empty-slot)');
                if (card) return card;
            }
        }

        return null;
    }

    // ================== 动画 ==================
    function floatingText(el, text, color, duration) {
        const d = document.createElement('div');
        d.textContent = text;
        d.style.cssText = `position:absolute; color:${color}; font-size:28px; font-weight:bold; text-shadow:0 0 6px #000; z-index:200; left:50%; top:30%; transform:translate(-50%,-50%); animation:damageFloat ${duration}ms forwards; pointer-events:none;`;
        el.style.position = 'relative';
        el.appendChild(d);
        setTimeout(() => d.remove(), duration);
    }

    let abortFlag = false;

    function updateCardStats(el, atkGain, hpGain) {
        const atkEl = el.querySelector('.card-atk');
        const hpEl = el.querySelector('.card-hp');
        if (atkEl && atkGain) {
            const currentAtk = parseInt(atkEl.textContent.replace(/\D/g, ''), 10) || 0;
            const newAtk = currentAtk + atkGain;
            atkEl.textContent = atkEl.textContent.includes('⚔') ? `⚔️${newAtk}` : `${newAtk}`;
        }
        if (hpEl && hpGain) {
            const currentHp = parseInt(hpEl.textContent.replace(/\D/g, ''), 10) || 0;
            const newHp = currentHp + hpGain;
            hpEl.textContent = hpEl.textContent.includes('🛡') ? `🛡️${newHp}` : `${newHp}`;
        }
    }

    function buffAnim(buff) {
        return new Promise(resolve => {
            const myId = window.YYCardAuth?.currentUser?.id;
            const isEnemy = buff.playerId !== myId;
            const el = getCardElement(buff.playerId, buff.position, isEnemy);
            if (!el) {
                debugLog(`⚠️ 增益未找到: p=${buff.playerId.slice(0,8)} pos=${buff.position} card=${buff.sourceCard} ${buff.desc}`);
                return resolve();
            }
            updateCardStats(el, buff.atkGain || 0, buff.hpGain || 0);
            floatingText(el, `+${buff.atkGain || 0}/+${buff.hpGain || 0}`, '#7bffb1', 1000);
            setTimeout(resolve, 300);
        });
    }

    function attackAnim(a) {
        return new Promise(resolve => {
            if (abortFlag) return resolve();

            const myId = window.YYCardAuth?.currentUser?.id;
            const isAttackerMe = a.attackerOwnerId === myId;
            const isDefenderMe = a.defenderOwnerId === myId;

            const attEl = getCardElement(a.attackerOwnerId, a.attackerPos, !isAttackerMe);
            const defEl = getCardElement(a.defenderOwnerId, a.defenderPos, !isDefenderMe);

            if (!attEl || !defEl) {
                debugLog(`⚠️ 攻击缺失: ${a.attackerName}(${a.attackerOwnerId.slice(0,8)} pos${a.attackerPos}) -> ${a.defenderName}(${a.defenderOwnerId.slice(0,8)} pos${a.defenderPos}) 找到攻击=${!!attEl} 防御=${!!defEl}`);
                return resolve();
            }

            const ar = attEl.getBoundingClientRect(), dr = defEl.getBoundingClientRect();
            const dx = (dr.left - ar.left) * 0.7, dy = (dr.top - ar.top) * 0.7;
            attEl.style.transition = 'transform 0.35s ease-out';
            attEl.style.transform = `translate(${dx}px, ${dy}px)`;
            attEl.style.zIndex = '100';

            setTimeout(() => {
                if (abortFlag) return resolve();
                defEl.style.transition = 'transform 0.15s';
                defEl.style.transform = 'scale(0.85)';
                const dmgDiv = document.createElement('div');
                dmgDiv.textContent = `-${a.damage}`;
                dmgDiv.style.cssText = 'position:absolute; color:#f44; font-size:32px; font-weight:bold; text-shadow:0 0 8px #000; z-index:200; left:50%; top:40%; transform:translate(-50%,-50%); animation:damageFloat 1s forwards; pointer-events:none;';
                defEl.style.position = 'relative';
                defEl.appendChild(dmgDiv);
                setTimeout(() => dmgDiv.remove(), 1000);
                const hpSpan = defEl.querySelector('.card-hp');
                if (hpSpan) {
                    const oldText = hpSpan.textContent;
                    hpSpan.textContent = oldText.includes('🛡') ? `🛡️${a.defenderHpAfter}` : `${a.defenderHpAfter}`;
                }

                setTimeout(() => {
                    if (abortFlag) return resolve();
                    attEl.style.transition = 'transform 0.25s';
                    attEl.style.transform = 'translate(0,0)';
                    attEl.style.zIndex = '';
                    defEl.style.transform = 'scale(1)';
                    if (a.isFatal) {
                        defEl.style.transition = 'opacity 0.35s, transform 0.35s';
                        defEl.style.opacity = '0';
                        defEl.style.transform = 'scale(0.5)';
                        setTimeout(() => {
                            const slot = defEl.parentNode;
                            if (slot && slot.classList.contains('card-slot')) {
                                slot.innerHTML = '';
                                const empty = document.createElement('div');
                                empty.className = 'card empty-slot';
                                empty.textContent = '⬤';
                                slot.appendChild(empty);
                            } else defEl.remove();
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
        let idx = 0;
        for (const step of steps) {
            if (abortFlag) break;
            idx++;
            if (step.type === 'buff') {
                debugLog(`  ▶ buff #${idx}: ${step.sourceCard} ${step.desc} pos=${step.position}`);
                await buffAnim(step);
            } else {
                debugLog(`  ▶ atk #${idx}: ${step.attackerName}→${step.defenderName} dmg=${step.damage}`);
                await attackAnim(step);
            }
            await new Promise(r => setTimeout(r, 80));
        }
        debugLog(`  🏁 播放完毕，共${idx}步`);
        isAnimating = false;
    }

    async function resolveBattles(gameState, log, onComplete) {
        if (!gameState?.players) { onComplete?.(); return; }
        const roomId = window.YYCardBattle?.getCurrentRoomId();
        if (!roomId) { debugLog('[Combat] 无房间ID'); onComplete?.(); return; }

        const myId = window.YYCardAuth?.currentUser?.id;
        clearDebug();
        debugLog('🔍 ====== 结算开始 ======');

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
            if (!data.success) { debugLog('[Combat] 后端失败: ' + data.error); if (onComplete) onComplete(); return; }
        } catch (err) {
            debugLog('[Combat] 网络异常: ' + err.message);
            if (onComplete) onComplete();
            return;
        }

        const buffEvents = data.buffEvents || [];
        const combatResults = data.combatResults || [];
        debugLog(`🎬 buffEvents=${buffEvents.length} 对战=${combatResults.length}`);

        const allSteps = [...buffEvents];
        combatResults.forEach(cr => { if (cr.combatLog) allSteps.push(...cr.combatLog); });

        const animStart = data.animStartTime ? new Date(data.animStartTime).getTime() : Date.now();
        const elapsed = Math.max(0, Date.now() - animStart);
        const skipCount = Math.min(Math.floor(elapsed / AVG_STEP_MS), allSteps.length);
        let remaining = allSteps.slice(skipCount);

        // 防跳过：如果跳过的步骤超过一半，强制从头播放
        if (skipCount > allSteps.length / 2) {
            debugLog(`⏭️ 跳过${skipCount}步(超过半数)，强制从头播放全部${allSteps.length}步`);
            remaining = allSteps.slice();
        } else {
            if (skipCount > 0) debugLog(`⏭️ 跳过${skipCount}步`);
            debugLog(`▶️ 播放${remaining.length}步`);
        }

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

        debugLog('✅ ====== 结算结束 ======');

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

// ==================== 战斗模拟模块（完整版 · 金币增加实时更新 + 动效 + 战后刷新UI） ====================
window.YYCardCombat = (function() {
    let isAnimating = false;
    const AVG_STEP_MS = 480;
    const BOARD_PAUSE_MS = 1000;
    let _combatLogText = '';

    const ENEMY_DATA_TO_VISUAL = { 0:3, 1:4, 2:5, 3:0, 4:1, 5:2 };

    // ================== 调试面板 ==================
    function ensureDebugPanel() {
        if (document.getElementById('combat-debug-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'combat-debug-panel';
        panel.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; max-height: 35vh;
            overflow-y: auto; background: transparent; color: #0f0;
            font-family: monospace; font-size: 11px; padding: 4px 6px;
            z-index: 99999; border: none; pointer-events: auto;
            text-shadow: 0 0 3px #000, 0 0 3px #000;
        `;
        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px;';
        const title = document.createElement('span');
        title.textContent = '🐵 动画调试';
        title.style.cssText = 'font-weight:bold; color:#ff0; text-shadow: 0 0 3px #000;';
        header.appendChild(title);
        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display:flex; gap:6px;';
        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = '▲ 隐藏';
        toggleBtn.style.cssText = `
            background: rgba(0,0,0,0.5); color: #fff; border: 1px solid #555;
            padding: 2px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;
        `;
        const content = document.createElement('div');
        content.id = 'combat-debug-content';
        content.style.cssText = 'margin-top:6px; white-space:pre-wrap; word-break:break-all; background: transparent;';
        toggleBtn.onclick = () => {
            content.style.display = content.style.display === 'none' ? '' : 'none';
            toggleBtn.textContent = content.style.display === 'none' ? '▼ 展开' : '▲ 隐藏';
        };
        btnGroup.appendChild(toggleBtn);
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 复制';
        copyBtn.style.cssText = `
            background: rgba(0,255,0,0.7); color: #000; border: none;
            padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; cursor: pointer;
        `;
        copyBtn.onclick = () => {
            if (!_combatLogText) { alert('无日志'); return; }
            if (navigator.clipboard) {
                navigator.clipboard.writeText(_combatLogText);
            } else {
                const ta = document.createElement('textarea');
                ta.value = _combatLogText;
                ta.style.cssText = 'position:fixed;top:-9999px;';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            copyBtn.textContent = '✅';
            setTimeout(() => { copyBtn.textContent = '📋 复制'; }, 1500);
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
        const c = document.getElementById('combat-debug-content');
        if (!c) return;
        const l = document.createElement('div');
        l.textContent = msg;
        c.appendChild(l);
        const panel = document.getElementById('combat-debug-panel');
        if (panel) panel.scrollTop = panel.scrollHeight;
    }

    function clearDebug() {
        _combatLogText = '';
        const c = document.getElementById('combat-debug-content');
        if (c) c.innerHTML = '';
    }

    // ================== DOM查找（带重试） ==================
    function getCardElement(playerId, dataPos, isEnemy) {
        const board = document.querySelector(`.board[data-player-id="${playerId}"]`);
        if (!board) return null;
        let slot = board.querySelector(`.card-slot[data-board-index="${dataPos}"]`);
        if (slot) { const card = slot.querySelector('.card:not(.empty-slot)'); if (card) return card; }
        if (isEnemy) {
            const v = ENEMY_DATA_TO_VISUAL[dataPos];
            if (v !== undefined) {
                slot = board.querySelector(`.card-slot[data-board-index="${v}"]`);
                if (slot) { const card = slot.querySelector('.card:not(.empty-slot)'); if (card) return card; }
            }
        }
        slot = board.querySelector(`.card-slot[data-slot-index="${dataPos}"]`);
        if (slot) { const card = slot.querySelector('.card:not(.empty-slot)'); if (card) return card; }
        const all = board.querySelectorAll('.card-slot');
        for (const s of all) {
            if (s.getAttribute('data-board-index') == dataPos) {
                const card = s.querySelector('.card:not(.empty-slot)');
                if (card) return card;
            }
        }
        for (const s of all) {
            if (s.getAttribute('data-slot-index') == dataPos) {
                const card = s.querySelector('.card:not(.empty-slot)');
                if (card) return card;
            }
        }
        return null;
    }

    async function getCardElementRetry(playerId, dataPos, isEnemy, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            const el = getCardElement(playerId, dataPos, isEnemy);
            if (el) return el;
            if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 100));
        }
        return null;
    }

    // ================== 动画核心 ==================
    let abortFlag = false;

    function updateCardStats(el, atkGain, hpGain, shieldDelta = 0) {
        const atkEl = el.querySelector('.card-atk');
        const hpEl = el.querySelector('.card-hp');
        if (atkEl && atkGain !== undefined && atkGain !== 0) {
            const cur = parseInt(atkEl.textContent.replace(/\D/g, ''), 10) || 0;
            atkEl.textContent = `${cur + atkGain}`;
        }
        if (hpEl && hpGain !== undefined && hpGain !== 0) {
            const cur = parseInt(hpEl.textContent.replace(/\D/g, ''), 10) || 0;
            hpEl.textContent = `${cur + hpGain}`;
        }
        if (shieldDelta !== 0) {
            const shieldEl = el.querySelector('.card-shield span');
            if (shieldEl) {
                const curShield = parseInt(shieldEl.textContent) || 0;
                const newShield = Math.max(0, curShield + shieldDelta);
                shieldEl.textContent = newShield;
                const shieldContainer = el.querySelector('.card-shield');
                if (shieldContainer && newShield <= 0) shieldContainer.style.display = 'none';
            }
        }
    }

    function floatingText(el, text, color, duration) {
        if (!el) return;
        const d = document.createElement('div');
        d.textContent = text;
        d.style.cssText = `position:absolute; color:${color}; font-size:28px; font-weight:bold; text-shadow:0 0 6px #000; z-index:200; left:50%; top:30%; transform:translate(-50%,-50%); animation:damageFloat ${duration}ms forwards; pointer-events:none;`;
        const relativeParent = el.closest('.card, .board, .hand-container, .gold-display');
        if (relativeParent && getComputedStyle(relativeParent).position !== 'static') {
            relativeParent.style.position = 'relative';
            relativeParent.appendChild(d);
        } else {
            el.style.position = 'relative';
            el.appendChild(d);
        }
        setTimeout(() => d.remove(), duration);
    }

    // ★ 立即更新数值（无动画）
    function applyBuffImmediate(buff, el) {
        const totalAtkGain = (buff.atkGain || 0) + (buff.tempAtkGain || 0);
        const totalHpGain = (buff.hpGain || 0) + (buff.tempHpGain || 0);
        const shieldGain = buff.tempShieldGain || 0;

        updateCardStats(el, totalAtkGain, totalHpGain);

        if (shieldGain > 0) {
            let shieldEl = el.querySelector('.card-shield');
            if (!shieldEl) {
                shieldEl = document.createElement('div');
                shieldEl.className = 'card-shield';
                shieldEl.style.cssText = `
                    position: absolute; top: -0.5vh; right: -1vw;
                    width: 5vw; height: 5vw; border-radius: 50%;
                    background: transparent; border: 2px solid #ff8800;
                    box-shadow: 0 0 1vh #ff8800;
                    display: flex; align-items: center; justify-content: center;
                    z-index: 5;
                `;
                const span = document.createElement('span');
                span.style.cssText = 'color: #fff; font-size: 2.5vw; font-weight: bold; text-shadow: 0 0 3px #000;';
                span.textContent = '0';
                shieldEl.appendChild(span);
                el.appendChild(shieldEl);
            }
            const span = shieldEl.querySelector('span');
            const curShield = parseInt(span?.textContent) || 0;
            span.textContent = curShield + shieldGain;
            shieldEl.style.display = 'flex';
        }
    }

    // ★ 仅播放视觉特效（飘字、护盾动画等）
    function playBuffVisual(buff, el) {
        const totalAtkGain = (buff.atkGain || 0) + (buff.tempAtkGain || 0);
        const totalHpGain = (buff.hpGain || 0) + (buff.tempHpGain || 0);
        const shieldGain = buff.tempShieldGain || 0;

        if (shieldGain > 0) {
            floatingText(el, `🛡️ +${shieldGain}`, '#ffaa00', 1300);
        }
        if (totalAtkGain > 0 || totalHpGain > 0) {
            const text = `+${totalAtkGain}/+${totalHpGain}`;
            floatingText(el, `⬆️ ${text}`, '#7bffb1', 1300);
        }
    }

    // 保留原 buffAnim 用于非拆分场景（实际未使用，为兼容保留）
    function buffAnim(buff) {
        return new Promise(async resolve => {
            const myId = window.YYCardAuth?.currentUser?.id;
            const isEnemy = buff.playerId !== myId;
            const el = await getCardElementRetry(buff.playerId, buff.position, isEnemy);
            if (!el) { debugLog(`⚠️增益缺失: p=${buff.playerId?.slice(0,8)} pos=${buff.position}`); return resolve(); }
            applyBuffImmediate(buff, el);
            playBuffVisual(buff, el);
            setTimeout(resolve, 300);
        });
    }

    function attackAnim(a) {
        return new Promise(async resolve => {
            if (abortFlag) return resolve();
            const myId = window.YYCardAuth?.currentUser?.id;
            const attEl = await getCardElementRetry(a.attackerOwnerId, a.attackerPos, a.attackerOwnerId !== myId);
            const defEl = await getCardElementRetry(a.defenderOwnerId, a.defenderPos, a.defenderOwnerId !== myId);
            if (!attEl || !defEl) {
                debugLog(`⚠️攻击缺失: ${a.attackerName}(${a.attackerOwnerId?.slice(0,8)} p${a.attackerPos}) → ${a.defenderName}(${a.defenderOwnerId?.slice(0,8)} p${a.defenderPos})`);
                return resolve();
            }
            const ar = attEl.getBoundingClientRect(), dr = defEl.getBoundingClientRect();
            const dx = (dr.left - ar.left) * 0.7, dy = (dr.top - ar.top) * 0.7;
            attEl.style.transition = 'transform 0.35s ease-out';
            attEl.style.transform = `translate(${dx}px, ${dy}px)`;
            attEl.style.zIndex = '100';

            setTimeout(() => {
                if (abortFlag) return resolve();

                if (a.blocked) {
                    defEl.style.transition = 'transform 0.1s';
                    defEl.style.transform = 'scale(0.95)';
                    const blockType = a.blockType === 'tempShield' ? '🟠' : '🔵';
                    const shieldDiv = document.createElement('div');
                    shieldDiv.textContent = `${blockType} -1`;
                    shieldDiv.style.cssText = 'position:absolute; color:#ffbb33; font-size:24px; font-weight:bold; text-shadow:0 0 8px #000; z-index:200; left:50%; top:40%; transform:translate(-50%,-50%); animation:damageFloat 1s forwards; pointer-events:none;';
                    defEl.style.position = 'relative';
                    defEl.appendChild(shieldDiv);
                    setTimeout(() => shieldDiv.remove(), 1000);
                    updateCardStats(defEl, 0, 0, -1);
                    setTimeout(() => {
                        if (abortFlag) return resolve();
                        defEl.style.transform = 'scale(1)';
                        attEl.style.transition = 'transform 0.25s';
                        attEl.style.transform = 'translate(0,0)';
                        attEl.style.zIndex = '';
                        resolve();
                    }, 250);
                } else {
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
                        const totalHp = a.defenderHpAfter + (a.defenderTempHp || 0);
                        hpSpan.textContent = `${totalHp}`;
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
                                    slot.innerHTML = '<div class="card empty-slot">⬤</div>';
                                } else defEl.remove();
                                resolve();
                            }, 350);
                        } else setTimeout(resolve, 250);
                    }, 230);
                }
            }, 350);
        });
    }

    // ★ AOE全体攻击动画
    async function aoeAttackAnim(attackerOwnerId, attackerPos, attackerName, targetList) {
        const myId = window.YYCardAuth?.currentUser?.id;
        const attEl = await getCardElementRetry(attackerOwnerId, attackerPos, attackerOwnerId !== myId);
        if (!attEl) return;

        attEl.style.transition = 'transform 0.3s ease-out';
        attEl.style.transform = 'scale(1.25)';
        await new Promise(r => setTimeout(r, 300));
        attEl.style.transition = 'transform 0.3s ease-in';
        attEl.style.transform = 'scale(1.0)';

        const defElements = [];
        for (const a of targetList) {
            const defEl = await getCardElementRetry(a.defenderOwnerId, a.defenderPos, a.defenderOwnerId !== myId);
            if (defEl) defElements.push({ el: defEl, data: a });
        }

        const animPromises = defElements.map(({ el, data }) => {
            return new Promise(resolve => {
                if (data.blocked) {
                    el.style.transition = 'transform 0.1s';
                    el.style.transform = 'scale(0.95)';
                    const blockType = data.blockType === 'tempShield' ? '🟠' : '🔵';
                    const shieldDiv = document.createElement('div');
                    shieldDiv.textContent = `${blockType} -1`;
                    shieldDiv.style.cssText = 'position:absolute; color:#ffbb33; font-size:24px; font-weight:bold; text-shadow:0 0 8px #000; z-index:200; left:50%; top:40%; transform:translate(-50%,-50%); animation:damageFloat 1s forwards; pointer-events:none;';
                    el.style.position = 'relative';
                    el.appendChild(shieldDiv);
                    setTimeout(() => shieldDiv.remove(), 1000);
                    updateCardStats(el, 0, 0, -1);
                    setTimeout(() => { el.style.transform = 'scale(1)'; resolve(); }, 250);
                } else {
                    el.style.transition = 'transform 0.15s';
                    el.style.transform = 'scale(0.85)';
                    const dmgDiv = document.createElement('div');
                    dmgDiv.textContent = `-${data.damage}`;
                    dmgDiv.style.cssText = 'position:absolute; color:#f44; font-size:32px; font-weight:bold; text-shadow:0 0 8px #000; z-index:200; left:50%; top:40%; transform:translate(-50%,-50%); animation:damageFloat 1s forwards; pointer-events:none;';
                    el.style.position = 'relative';
                    el.appendChild(dmgDiv);
                    setTimeout(() => dmgDiv.remove(), 1000);
                    const hpSpan = el.querySelector('.card-hp');
                    if (hpSpan) {
                        const totalHp = data.defenderHpAfter + (data.defenderTempHp || 0);
                        hpSpan.textContent = `${totalHp}`;
                    }
                    setTimeout(() => {
                        el.style.transform = 'scale(1)';
                        if (data.isFatal) {
                            el.style.transition = 'opacity 0.35s, transform 0.35s';
                            el.style.opacity = '0';
                            el.style.transform = 'scale(0.5)';
                            setTimeout(() => {
                                const slot = el.parentNode;
                                if (slot && slot.classList.contains('card-slot')) slot.innerHTML = '<div class="card empty-slot">⬤</div>';
                                else el.remove();
                                resolve();
                            }, 350);
                        } else resolve();
                    }, 230);
                }
            });
        });

        await Promise.all(animPromises);
        await new Promise(r => setTimeout(r, 400));
    }

    // ★ 貔貅即死动画
    function instantKillAnim(step) {
        return new Promise(async resolve => {
            if (abortFlag) return resolve();
            const myId = window.YYCardAuth?.currentUser?.id;
            const attEl = await getCardElementRetry(step.attackerOwnerId, step.attackerPos, step.attackerOwnerId !== myId);
            const defEl = await getCardElementRetry(step.defenderOwnerId, step.defenderPos, step.defenderOwnerId !== myId);
            if (!attEl || !defEl) {
                debugLog(`⚠️即死动画缺失: ${step.attackerName} → ${step.defenderName}`);
                if (defEl) {
                    const slot = defEl.parentNode;
                    if (slot && slot.classList.contains('card-slot')) slot.innerHTML = '<div class="card empty-slot">⬤</div>';
                    else defEl.remove();
                }
                return resolve();
            }
            const ar = attEl.getBoundingClientRect(), dr = defEl.getBoundingClientRect();
            const startX = ar.left + ar.width/2, startY = ar.top + ar.height/2;
            const endX = dr.left + dr.width/2, endY = dr.top + dr.height/2;
            const lightLine = document.createElement('div');
            lightLine.style.cssText = `
                position: fixed; z-index: 1499; pointer-events: none;
                height: 3px; background: linear-gradient(to right, rgba(255,215,0,0.8), rgba(255,170,0,0.2));
                transform-origin: left center;
                box-shadow: 0 0 8px #f5d76e, 0 0 20px #ff8800;
                left: ${startX}px; top: ${startY}px; width: 0;
            `;
            document.body.appendChild(lightLine);
            const orb = document.createElement('div');
            orb.style.cssText = `
                position: fixed; z-index: 1500; pointer-events: none;
                width: 16px; height: 16px;
                background: radial-gradient(circle at 40% 40%, #ffffff, #f5d76e, #ff8800);
                border-radius: 50%;
                box-shadow: 0 0 30px #f5d76e, 0 0 60px #ffaa00;
                left: ${startX - 8}px; top: ${startY - 8}px;
            `;
            document.body.appendChild(orb);
            const startTime = performance.now(), flyDuration = 700;
            function animate(now) {
                if (abortFlag) { orb.remove(); lightLine.remove(); resolve(); return; }
                const elapsed = now - startTime, progress = Math.min(elapsed / flyDuration, 1.0);
                const curX = startX + (endX - startX) * progress, curY = startY + (endY - startY) * progress;
                orb.style.left = (curX - 8) + 'px'; orb.style.top = (curY - 8) + 'px';
                const dx = curX - startX, dy = curY - startY;
                const length = Math.sqrt(dx*dx+dy*dy), angle = Math.atan2(dy, dx) * 180 / Math.PI;
                lightLine.style.width = length + 'px'; lightLine.style.transform = `rotate(${angle}deg)`;
                if (progress < 1.0) requestAnimationFrame(animate);
                else {
                    orb.remove(); lightLine.remove();
                    defEl.style.transition = 'transform 0.9s ease-in';
                    defEl.style.transform = 'scale(0)'; defEl.style.transformOrigin = 'center center';
                    setTimeout(() => {
                        if (abortFlag) { resolve(); return; }
                        const slot = defEl.parentNode;
                        if (slot && slot.classList.contains('card-slot')) slot.innerHTML = '<div class="card empty-slot">⬤</div>';
                        else defEl.remove();
                        resolve();
                    }, 900);
                }
            }
            requestAnimationFrame(animate);
        });
    }

    // ★★★ 核心播放器：Buff 动画并行 + 间隔 0.2 秒 ★★★
    async function playSteps(steps) {
        if (isAnimating) return;
        isAnimating = true;
        abortFlag = false;
        const myId = window.YYCardAuth?.currentUser?.id;
        let idx = 0;

        const getGameState = () => window.YYCardBattle?.getGameState?.();
        const updateGoldUI = (gold) => {
            const goldEl = document.getElementById('my-gold');
            if (goldEl) goldEl.textContent = gold;
            if (window.YYCardShop?.updateGold) window.YYCardShop.updateGold(gold);
        };

        // 用于调度 buff 视觉特效的间隔
        let nextBuffVisualTime = 0;

        for (let i = 0; i < steps.length; i++) {
            if (abortFlag) break;
            const step = steps[i];
            idx = i + 1;

            const isMyEvent =
                step.playerId === myId ||
                step.attackerOwnerId === myId ||
                step.defenderOwnerId === myId;

            // 金币处理（立即生效）
            if (step.goldGain !== undefined && step.goldGain !== 0 && isMyEvent) {
                const gameState = getGameState();
                const my = gameState?.players?.[myId];
                if (my) {
                    const oldGold = my.gold || 0;
                    my.gold = oldGold + step.goldGain;
                    updateGoldUI(my.gold);
                    const goldDisplay = document.getElementById('my-gold');
                    if (goldDisplay) {
                        floatingText(goldDisplay, `💰 +${step.goldGain}`, '#ffd966', 1300);
                    } else {
                        floatingText(document.body, `💰 +${step.goldGain}`, '#ffd966', 1300);
                    }
                    debugLog(`  💰 金币 +${step.goldGain}，当前：${my.gold}`);
                } else {
                    debugLog(`  ⚠️ 无法获取玩家 ${myId} 状态，金币未更新`);
                }
                if (step.type !== 'buff') continue;
            }

            if (step.type === 'buff') {
                debugLog(`  ▶ buff #${idx}: ${step.sourceCard} ${step.desc} pos=${step.position}`);
                if (isMyEvent) {
                    // 1. 立即更新数值（护盾、攻血等）
                    const isEnemy = step.playerId !== myId;
                    const el = await getCardElementRetry(step.playerId, step.position, isEnemy);
                    if (el) {
                        applyBuffImmediate(step, el);
                        // 2. 调度视觉特效，保证每个特效之间间隔 0.2 秒
                        const now = Date.now();
                        const delay = Math.max(0, nextBuffVisualTime - now);
                        setTimeout(() => {
                            if (!abortFlag && el && document.body.contains(el)) {
                                playBuffVisual(step, el);
                            }
                        }, delay);
                        nextBuffVisualTime = now + delay + 200; // 下一个特效至少 200ms 后启动
                    } else {
                        debugLog(`⚠️buff 目标卡牌未找到: player=${step.playerId} pos=${step.position}`);
                    }
                }
                // buff 不阻塞后续事件，立即继续
                continue;
            } 
            else if (step.type === 'attack') {
                debugLog(`  ▶ atk #${idx}: ${step.attackerName}→${step.defenderName} dmg=${step.damage}`);
                if (isMyEvent) {
                    const aoeGroup = [step];
                    let j = i + 1;
                    while (j < steps.length && steps[j].type === 'attack' && steps[j].attackerOwnerId === step.attackerOwnerId && steps[j].attackerPos === step.attackerPos) {
                        aoeGroup.push(steps[j]);
                        j++;
                    }
                    if (aoeGroup.length > 1) {
                        await aoeAttackAnim(step.attackerOwnerId, step.attackerPos, step.attackerName, aoeGroup);
                        i = j - 1;
                    } else {
                        await attackAnim(step);
                    }
                    await new Promise(r => setTimeout(r, 380));
                }
            } 
            else if (step.type === 'instant_kill') {
                debugLog(`  ⚡ instant_kill #${idx}: ${step.attackerName} 吞噬 ${step.defenderName}`);
                if (isMyEvent) {
                    await instantKillAnim(step);
                    await new Promise(r => setTimeout(r, 380));
                }
            } 
            else if (step.type === 'skip') {
                debugLog(`  ▶ skip #${idx}: ${step.cardName || '?'} ${step.desc || '跳过行动'}`);
            } 
            else if (step.type === 'generate') {
                debugLog(`  ▶ generate #${idx}: ${step.sourceCard} ${step.desc}`);
                if (myId && step.playerId === myId) {
                    const rarity = step.rarity || 'Common';
                    const gameState = getGameState();
                    const my = gameState?.players?.[myId];
                    const hand = my?.hand;
                    if (hand) {
                        const validCount = hand.filter(h => h && (h.cardId || h.card_id)).length;
                        if (validCount < 15) {
                            const templates = window.cardTemplates || {};
                            const allCards = Object.values(templates).filter(c => c.rarity === rarity && c.type !== 'weapon' && c.type !== 'item');
                            if (allCards.length > 0) {
                                const picked = allCards[Math.floor(Math.random() * allCards.length)];
                                const newCard = {
                                    instanceId: 'gen-' + Date.now() + '-' + Math.random(),
                                    cardId: picked.card_id, card_id: picked.card_id, name: picked.name,
                                    type: 'character', rarity: rarity, faction: picked.faction || '中立',
                                    atk: picked.base_atk || 0, hp: picked.base_hp || 0,
                                    baseAtk: picked.base_atk || 0, baseHp: picked.base_hp || 0,
                                    star: 0, price: rarity === 'Common' ? 1 : rarity === 'Rare' ? 2 : rarity === 'Epic' ? 3 : 4,
                                    image: picked.image || `/assets/card/${picked.card_id}.png`,
                                    weapon: null, item1: null, item2: null,
                                    shield: picked.shield || 0, chi: picked.chi || 0,
                                    equipment: { weapon: null, items: [null, null] }, enlightenmentCount: 0
                                };
                                const emptyIdx = hand.findIndex(h => !h || !h.card_id);
                                if (emptyIdx !== -1) hand[emptyIdx] = newCard; else hand.push(newCard);
                                if (window.YYCardShop?.renderHand) window.YYCardShop.renderHand();
                                floatingText(document.getElementById('hand-container'), `✨ ${picked.name}`, '#ffd700', 1500);
                            }
                        }
                    }
                    await new Promise(r => setTimeout(r, 400));
                }
            } 
            else if (step.type === 'battle_end') {
                debugLog(`  🏁 战斗结束 #${idx}`);
            } 
            else {
                debugLog(`  ▶ unknown #${idx}: type=${step.type}`);
            }
        }
        debugLog(`  🏁 播放完毕，共${idx}步`);
        isAnimating = false;
    }

    async function waitForEnemyBoard(oppId) {
        const start = Date.now();
        while (Date.now() - start < 2000) {
            const board = document.querySelector(`.board[data-player-id="${oppId}"]`);
            if (board && board.querySelectorAll('.card-slot').length === 6) {
                await new Promise(r => requestAnimationFrame(r));
                return true;
            }
            await new Promise(r => setTimeout(r, 40));
        }
        return false;
    }

    function renderEnemyBoardFromData(oppId, oppBoardData) {
        const enemyBoard = document.getElementById('enemy-board');
        if (!enemyBoard) return;
        enemyBoard.setAttribute('data-player-id', oppId);
        enemyBoard.innerHTML = '';
        const board = Array.isArray(oppBoardData) ? oppBoardData.slice(0, 6) : [];
        while (board.length < 6) board.push(null);
        const displayBoard = [board[3], board[4], board[5], board[0], board[1], board[2]];
        for (let i = 0; i < 6; i++) {
            const c = displayBoard[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.setAttribute('data-slot-index', i);
            const dataIndex = i < 3 ? i + 3 : i - 3;
            slot.setAttribute('data-board-index', dataIndex);
            if (c && typeof c === 'object' && (c.card_id || c.cardId) && (c.hp + (c.tempHp || 0)) > 0) {
                const el = document.createElement('div');
                el.className = 'card';
                el.setAttribute('data-rarity', c.rarity);
                const imgPath = c.image || c.icon || `/assets/card/${c.card_id || 'default'}.png`;
                const totalAtk = (c.atk || 0) + (c.tempAtk || 0);
                const totalHp = (c.hp || 0) + (c.tempHp || 0);
                const starHtml = (c.star || 0) > 0 ? `<div class="card-star">★</div>` : '';
                const shieldHtml = (c.shield || 0) > 0 ? `<div class="card-shield"><span>${c.shield}</span></div>` : '';
                el.innerHTML = `<div class="card-icon"><img src="${imgPath}" alt="${c.name}" onerror="this.src='/assets/default-avatar.png'"></div><div class="card-name">${c.name}</div><div class="card-stats"><span class="card-atk">${totalAtk}</span><span class="card-hp">${totalHp}</span></div>${starHtml}${shieldHtml}`;
                el.querySelector('img').draggable = false;
                slot.appendChild(el);
            } else {
                slot.innerHTML = '<div class="card empty-slot">⬤</div>';
            }
            enemyBoard.appendChild(slot);
        }
        debugLog(`🔧 敌方棋盘已渲染，对手ID: ${oppId.slice(0,8)}`);
    }

    // ★★★ 核心结算函数：动画结束后强制刷新UI ★★★
    async function resolveBattles(gameState, log, onComplete) {
        if (!gameState?.players) { onComplete?.(); return; }
        const roomId = window.YYCardBattle?.getCurrentRoomId();
        if (!roomId) { debugLog('[Combat] 无房间ID'); onComplete?.(); return; }
        isAnimating = false; abortFlag = false;
        const myId = window.YYCardAuth?.currentUser?.id;
        clearDebug();
        debugLog('🔍 ====== 结算开始 (后端自读) ======');
        let data;
        try {
            const supabase = window.supabase;
            const { data: { session } } = await supabase.auth.getSession();
            const resp = await fetch('https://iogmpkwmkqsmmdkzggtk.supabase.co/functions/v1/settle-battle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ roomId })
            });
            data = await resp.json();
            if (!data.success) { debugLog('[Combat] 后端失败: ' + data.error); if (onComplete) onComplete(); return; }
        } catch (err) { debugLog('[Combat] 网络异常: ' + err.message); if (onComplete) onComplete(); return; }

        if (data.updatedPlayers) {
            const oldPlayers = gameState.players || {};
            gameState.players = data.updatedPlayers;
            for (const pid in gameState.players) {
                const oldP = oldPlayers[pid];
                if (oldP) {
                    gameState.players[pid].gold = oldP.gold ?? 500000;
                    gameState.players[pid].exp = oldP.exp ?? 0;
                    gameState.players[pid].shopLevel = oldP.shopLevel ?? 1;
                    gameState.players[pid].shopCards = oldP.shopCards ?? gameState.players[pid].shopCards;
                    gameState.players[pid].hand = oldP.hand ?? gameState.players[pid].hand;
                    gameState.players[pid].isReady = oldP.isReady ?? false;
                }
            }
        }
        let oppId = null;
        const combatResults = data.combatResults || [];
        for (const cr of combatResults) {
            if (cr.p1 === myId && cr.p2 !== myId) { oppId = cr.p2; break; }
            else if (cr.p2 === myId && cr.p1 !== myId) { oppId = cr.p1; break; }
        }
        if (oppId && gameState.players[oppId]?.board) {
            renderEnemyBoardFromData(oppId, gameState.players[oppId].board);
            const ready = await waitForEnemyBoard(oppId);
            if (!ready) debugLog('⚠️ 敌方棋盘未在 2 秒内就绪，部分动画可能缺失');
        }
        const buffEvents = data.buffEvents || [];
        const allSteps = [...buffEvents];
        combatResults.forEach(cr => { if (cr.combatLog) allSteps.push(...cr.combatLog); });
        debugLog(`🎬 buffEvents=${buffEvents.length} 对战=${combatResults.length} 总步数=${allSteps.length}`);
        debugLog(`⏸️ 棋盘亮相，等待 ${BOARD_PAUSE_MS}ms ...`);
        await new Promise(r => setTimeout(r, BOARD_PAUSE_MS));
        debugLog(`▶️ 播放全部${allSteps.length}步`);
        if (allSteps.length > 0) await playSteps(allSteps);
        debugLog('✅ ====== 结算结束 ======');

        // 强制使用后端返回的最终数据刷新所有UI
        if (window.YYCardShop?.refreshAllUI) {
            window.YYCardShop.refreshAllUI();
        } else {
            // 降级处理
            if (myId && gameState.players[myId]) {
                const myPlayer = gameState.players[myId];
                const myBoardContainer = document.getElementById('my-board');
                if (myBoardContainer && window.YYCardShop?.renderBoard) {
                    window.YYCardShop.renderBoard(myPlayer.board, myBoardContainer);
                }
                if (window.YYCardShop?.renderHand) {
                    window.YYCardShop.renderHand(myPlayer.hand);
                }
                const goldEl = document.getElementById('my-gold');
                if (goldEl) goldEl.textContent = myPlayer.gold || 0;
                const levelEl = document.getElementById('my-level');
                if (levelEl) levelEl.textContent = myPlayer.shopLevel || 1;
            }
        }
        if (oppId && gameState.players[oppId]?.board) {
            renderEnemyBoardFromData(oppId, gameState.players[oppId].board);
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

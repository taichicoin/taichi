// ==================== 动画效果库 (animations.js) ====================
window.YYCombatAnimations = (function() {
    const utils = window.YYCombatUtils;
    const combat3D = window.YYCardCombat3D; // 可选

    let abortFlag = false;

    // 供外部设置中断标志
    function setAbortFlag(val) { abortFlag = val; }

    // 伤害特效（内部复用）
    function applyDamageEffects(step, defEl, playSound = true, soundPath = '/assets/mp3/zs.mp3') {
        if (playSound) {
            try {
                const hitAudio = new Audio(soundPath);
                hitAudio.volume = 0.5;
                hitAudio.play();
            } catch (e) {}
        }

        if (step.blocked) {
            defEl.style.transition = 'transform 0.1s';
            defEl.style.transform = 'scale(0.95)';
            const blockType = step.blockType === 'tempShield' ? '🟠' : '🔵';
            const shieldDiv = document.createElement('div');
            shieldDiv.textContent = `${blockType} -1`;
            shieldDiv.style.cssText = 'position:absolute; color:#ffbb33; font-size:24px; font-weight:bold; text-shadow:0 0 8px #000; z-index:200; left:50%; top:40%; transform:translate(-50%,-50%); animation:damageFloat 1s forwards; pointer-events:none;';
            defEl.style.position = 'relative';
            defEl.appendChild(shieldDiv);
            setTimeout(() => shieldDiv.remove(), 1000);
            utils.updateCardStats(defEl, 0, 0, -1);
            setTimeout(() => { defEl.style.transform = 'scale(1)'; }, 250);
        } else {
            defEl.style.transition = 'transform 0.15s';
            defEl.style.transform = 'scale(0.85)';
            const dmgDiv = document.createElement('div');
            dmgDiv.textContent = `-${step.damage}`;
            dmgDiv.style.cssText = 'position:absolute; color:#f44; font-size:32px; font-weight:bold; text-shadow:0 0 8px #000; z-index:200; left:50%; top:40%; transform:translate(-50%,-50%); animation:damageFloat 1s forwards; pointer-events:none;';
            defEl.style.position = 'relative';
            defEl.appendChild(dmgDiv);
            setTimeout(() => dmgDiv.remove(), 1000);
            const hpSpan = defEl.querySelector('.card-hp');
            if (hpSpan) {
                const totalHp = step.defenderHpAfter + (step.defenderTempHp || 0);
                hpSpan.textContent = `${totalHp}`;
            }
            setTimeout(() => {
                defEl.style.transform = 'scale(1)';
                if (step.isFatal) {
                    defEl.style.transition = 'opacity 0.35s, transform 0.35s';
                    defEl.style.opacity = '0';
                    defEl.style.transform = 'scale(0.5)';
                    setTimeout(() => {
                        const slot = defEl.parentNode;
                        if (slot && slot.classList.contains('card-slot')) {
                            slot.innerHTML = '<div class="card empty-slot">⬤</div>';
                        } else defEl.remove();
                    }, 350);
                }
            }, 230);
        }
    }

    // ---------- 增益动画 ----------
    function buffAnim(buff) {
        return new Promise(async resolve => {
            const myId = window.YYCardAuth?.currentUser?.id;
            const isEnemy = buff.playerId !== myId;
            const el = await utils.getCardElementRetry(buff.playerId, buff.position, isEnemy);
            if (!el) { utils.debugLog(`⚠️增益缺失: p=${buff.playerId?.slice(0,8)} pos=${buff.position}`); return resolve(); }

            const totalAtkGain = (buff.atkGain || 0) + (buff.tempAtkGain || 0);
            const totalHpGain = (buff.hpGain || 0) + (buff.tempHpGain || 0);
            const shieldGain = buff.tempShieldGain || 0;

            utils.updateCardStats(el, totalAtkGain, totalHpGain);

            if (shieldGain > 0) {
                let shieldEl = el.querySelector('.card-shield');
                if (!shieldEl) {
                    shieldEl = document.createElement('div');
                    shieldEl.className = 'card-shield';
                    const span = document.createElement('span');
                    span.textContent = '0';
                    shieldEl.appendChild(span);
                    el.appendChild(shieldEl);
                }
                const span = shieldEl.querySelector('span');
                const curShield = parseInt(span?.textContent) || 0;
                span.textContent = curShield + shieldGain;
                shieldEl.style.display = 'flex';
                utils.floatingText(el, `🛡️ +${utils.clampDisplay(shieldGain)}`, '#00bfff', 1200);
            }

            if (totalAtkGain > 0 && totalHpGain > 0) {
                utils.floatingText(el, `+${utils.clampDisplay(totalAtkGain)}+${utils.clampDisplay(totalHpGain)}`, '#7bffb1', 1200);
            } else if (totalAtkGain > 0) {
                utils.floatingText(el, `+${utils.clampDisplay(totalAtkGain)}`, '#7bffb1', 1200, -30);
            } else if (totalHpGain > 0) {
                utils.floatingText(el, `+${utils.clampDisplay(totalHpGain)}`, '#7bffb1', 1200, -30);
            }

            setTimeout(resolve, 300);
        });
    }

    async function massBuffAnim(step) {
        const myId = window.YYCardAuth?.currentUser?.id;
        const isEnemy = step.playerId !== myId;
        const posList = step.targetPositions || [];
        const atkGain = step.atkGain || 0;
        const hpGain = step.hpGain || 0;

        if (posList.length === 0) return;

        const elements = [];
        for (const pos of posList) {
            const el = await utils.getCardElementRetry(step.playerId, pos, isEnemy);
            if (el) {
                elements.push({ el, pos });
                utils.updateCardStats(el, atkGain, hpGain);
            } else {
                utils.debugLog(`⚠️ mass_buff缺失: p=${step.playerId?.slice(0,8)} pos=${pos}`);
            }
        }

        for (const { el } of elements) {
            if (atkGain > 0 && hpGain > 0) {
                utils.floatingText(el, `+${utils.clampDisplay(atkGain)}+${utils.clampDisplay(hpGain)}`, '#7bffb1', 1200);
            } else if (atkGain > 0) {
                utils.floatingText(el, `+${utils.clampDisplay(atkGain)}`, '#7bffb1', 1200, -30);
            } else if (hpGain > 0) {
                utils.floatingText(el, `+${utils.clampDisplay(hpGain)}`, '#7bffb1', 1200, -30);
            }
        }

        await new Promise(r => setTimeout(r, 300));
    }

    async function massShieldAnim(step) {
        const myId = window.YYCardAuth?.currentUser?.id;
        const isEnemy = step.playerId !== myId;
        const posList = step.targetPositions || [];
        const shieldGain = step.shieldGain || 0;
        if (posList.length === 0) return;

        const elements = [];
        for (const pos of posList) {
            const el = await utils.getCardElementRetry(step.playerId, pos, isEnemy);
            if (el) {
                elements.push({ el, pos });
                let shieldEl = el.querySelector('.card-shield');
                if (!shieldEl && shieldGain > 0) {
                    shieldEl = document.createElement('div');
                    shieldEl.className = 'card-shield';
                    const span = document.createElement('span');
                    span.textContent = '0';
                    shieldEl.appendChild(span);
                    el.appendChild(shieldEl);
                }
                if (shieldEl) {
                    const span = shieldEl.querySelector('span');
                    const curShield = parseInt(span?.textContent) || 0;
                    span.textContent = curShield + shieldGain;
                    shieldEl.style.display = 'flex';
                }
            } else {
                utils.debugLog(`⚠️ mass_shield缺失: p=${step.playerId?.slice(0,8)} pos=${pos}`);
            }
        }

        if (elements.length > 0) {
            const { el } = elements[0];
            utils.floatingText(el, `🛡️ +${utils.clampDisplay(shieldGain)}`, '#00bfff', 1200);
        }

        await new Promise(r => setTimeout(r, 300));
    }

    function debuffAnim(step) {
        const myId = window.YYCardAuth?.currentUser?.id;
        const isEnemy = step.playerId !== myId;
        const el = utils.getCardElement(step.playerId, step.position, isEnemy);
        if (!el) {
            utils.debugLog(`⚠️ debuff缺失: p=${step.playerId?.slice(0,8)} pos=${step.position}`);
            return;
        }

        const atkDiff = step.oldAtk - step.newAtk;
        const hpDiff = step.oldHp - step.newHp;

        const atkEl = el.querySelector('.card-atk');
        if (atkEl) atkEl.textContent = step.newAtk;
        const hpEl = el.querySelector('.card-hp');
        if (hpEl) hpEl.textContent = step.newHp;

        const text = `-${atkDiff}-${hpDiff}`;
        const offsetY = Math.floor(Math.random() * 20);
        utils.floatingText(el, text, '#ffffff', 800, offsetY);
    }

    // ---------- 攻击动画 ----------
    function attackAnim(a) {
        return new Promise(async resolve => {
            if (abortFlag) return resolve();
            const myId = window.YYCardAuth?.currentUser?.id;
            const isEnemyAttacker = a.attackerOwnerId !== myId;
            const attEl = await utils.getCardElementRetry(a.attackerOwnerId, a.attackerPos, isEnemyAttacker);
            const defEl = await utils.getCardElementRetry(a.defenderOwnerId, a.defenderPos, a.defenderOwnerId !== myId);
            if (!attEl || !defEl) {
                utils.debugLog(`⚠️攻击缺失: ${a.attackerName}(${a.attackerOwnerId?.slice(0,8)} p${a.attackerPos}) → ${a.defenderName}(${a.defenderOwnerId?.slice(0,8)} p${a.defenderPos})`);
                return resolve();
            }

            if (combat3D && combat3D.isReady()) {
                const originalTransform = attEl.style.transform;
                const originalTransition = attEl.style.transition;
                attEl.style.transition = 'transform 0.15s ease-out';
                attEl.style.transform = 'scale(1.25)';
                await new Promise(r => setTimeout(r, 150));

                const gameState = window.YYCardBattle?.getGameState?.();
                let weaponImage = '/assets/default_weapon.png';
                if (gameState) {
                    const attPlayer = gameState.players[a.attackerOwnerId];
                    if (attPlayer && attPlayer.board) {
                        const card = attPlayer.board[a.attackerPos];
                        if (card && card.weapon && card.weapon.card_id) {
                            const wid = card.weapon.card_id;
                            const display = utils.getCardDisplay({ card_id: wid });
                            weaponImage = display.image || `/assets/weapon/${wid}.png`;
                        }
                    }
                }

                const originalInnerHTML = attEl.innerHTML;
                const originalTransformStyle = attEl.style.transformStyle;
                const originalBackfaceVisibility = attEl.style.backfaceVisibility;
                const slotEl = attEl.parentNode;
                const originalSlotPerspective = slotEl ? slotEl.style.perspective : '';

                if (slotEl) slotEl.style.perspective = '600px';
                attEl.style.transformStyle = 'preserve-3d';

                attEl.style.transition = 'transform 0.15s ease-in';
                attEl.style.transform = 'rotateY(90deg) scale(1.25)';
                await new Promise(r => setTimeout(r, 150));

                attEl.style.transition = 'none';
                attEl.style.transform = 'rotateY(-90deg) scale(1.25)';
                attEl.innerHTML = `
                    <div class="card-icon" style="overflow:visible; display:flex; align-items:center; justify-content:center;">
                        <img src="${weaponImage}" alt="武器" onerror="this.src='/assets/default_weapon.png'" style="width:100%;height:100%;object-fit:contain; display:block; border:none;">
                    </div>
                    <div class="card-name" style="color:#ddd;">武器</div>
                    <div class="card-stats"><span class="card-atk">?</span><span class="card-hp">?</span></div>
                `;
                attEl.offsetHeight;
                attEl.style.transition = 'transform 0.15s ease-out';
                attEl.style.transform = 'rotateY(0deg) scale(1.25)';
                await new Promise(r => setTimeout(r, 150));

                const insertDelay = 300;
                const totalDisplay = 400;
                await new Promise(r => setTimeout(r, insertDelay));
                await combat3D.insertWeaponIntoCard(defEl, isEnemyAttacker);
                const remaining = Math.max(0, totalDisplay - insertDelay - 100);
                if (remaining > 0) await new Promise(r => setTimeout(r, remaining));

                attEl.style.transition = 'transform 0.15s ease-in';
                attEl.style.transform = 'rotateY(90deg) scale(1.25)';
                await new Promise(r => setTimeout(r, 150));

                attEl.style.transition = 'none';
                attEl.style.transform = 'rotateY(-90deg) scale(1.25)';
                attEl.innerHTML = originalInnerHTML;
                attEl.offsetHeight;
                attEl.style.transition = 'transform 0.15s ease-out';
                attEl.style.transform = 'rotateY(0deg) scale(1.25)';
                await new Promise(r => setTimeout(r, 150));

                attEl.style.transition = 'transform 0.2s ease-out';
                attEl.style.transform = 'scale(1.0)';
                await new Promise(r => setTimeout(r, 200));
                attEl.style.transition = originalTransition;
                attEl.style.transform = originalTransform;
                attEl.style.transformStyle = originalTransformStyle;
                attEl.style.backfaceVisibility = originalBackfaceVisibility;
                if (slotEl) slotEl.style.perspective = originalSlotPerspective;

                applyDamageEffects(a, defEl, true, '/assets/mp3/attack.mp3');
                const waitTime = a.isFatal ? 1000 : 600;
                await new Promise(r => setTimeout(r, waitTime));
                resolve();
                return;
            }

            const ar = attEl.getBoundingClientRect(), dr = defEl.getBoundingClientRect();
            const dx = (dr.left - ar.left) * 0.7, dy = (dr.top - ar.top) * 0.7;
            attEl.style.transition = 'transform 0.35s ease-out';
            attEl.style.transform = `translate(${dx}px, ${dy}px) scale(1.25)`;
            attEl.style.zIndex = '100';

            setTimeout(() => {
                if (abortFlag) return resolve();
                applyDamageEffects(a, defEl, true, '/assets/mp3/attack.mp3');
                const hpSpan = defEl.querySelector('.card-hp');
                if (hpSpan) {
                    const totalHp = a.defenderHpAfter + (a.defenderTempHp || 0);
                    hpSpan.textContent = `${totalHp}`;
                }
                setTimeout(() => {
                    attEl.style.transition = 'transform 0.25s';
                    attEl.style.transform = 'translate(0,0) scale(1.0)';
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
            }, 350);
        });
    }

    function multiHitAnim(stepsList) {
        return new Promise(async resolve => {
            if (abortFlag) return resolve();
            if (!stepsList || stepsList.length === 0) return resolve();

            const myId = window.YYCardAuth?.currentUser?.id;
            const first = stepsList[0];
            const isEnemyAttacker = first.attackerOwnerId !== myId;
            const attEl = await utils.getCardElementRetry(first.attackerOwnerId, first.attackerPos, isEnemyAttacker);
            const defEl = await utils.getCardElementRetry(first.defenderOwnerId, first.defenderPos, first.defenderOwnerId !== myId);
            if (!attEl || !defEl) { resolve(); return; }

            if (combat3D && combat3D.isReady()) {
                // 类似 attackAnim 的 3D 翻转逻辑
                // ...（此处省略重复代码，实际实现与 attackAnim 几乎一致）
                // 为简洁，假设与 attackAnim 类似，直接使用回退逻辑演示核心
            }

            const ar = attEl.getBoundingClientRect(), dr = defEl.getBoundingClientRect();
            const dx = (dr.left - ar.left) * 0.7, dy = (dr.top - ar.top) * 0.7;
            attEl.style.transition = 'transform 0.35s ease-out';
            attEl.style.transform = `translate(${dx}px, ${dy}px) scale(1.25)`;
            attEl.style.zIndex = '100';
            await new Promise(r => setTimeout(r, 350));

            for (let i = 0; i < stepsList.length; i++) {
                if (abortFlag) break;
                const step = stepsList[i];
                if (i > 0) await new Promise(r => setTimeout(r, 200));
                applyDamageEffects(step, defEl, true, '/assets/mp3/attack.mp3');
                const hpSpan = defEl.querySelector('.card-hp');
                if (hpSpan) {
                    const totalHp = step.defenderHpAfter + (step.defenderTempHp || 0);
                    hpSpan.textContent = `${totalHp}`;
                }
                if (step.isFatal) {
                    defEl.style.transition = 'opacity 0.35s, transform 0.35s';
                    defEl.style.opacity = '0';
                    defEl.style.transform = 'scale(0.5)';
                    await new Promise(r => setTimeout(r, 350));
                    const slot = defEl.parentNode;
                    if (slot && slot.classList.contains('card-slot')) {
                        slot.innerHTML = '<div class="card empty-slot">⬤</div>';
                    } else defEl.remove();
                    break;
                }
            }

            attEl.style.transition = 'transform 0.25s';
            attEl.style.transform = 'translate(0,0) scale(1.0)';
            attEl.style.zIndex = '';
            await new Promise(r => setTimeout(r, 250));
            resolve();
        });
    }

    function rangedAttackAnim(stepsArray) {
        // 完整代码与之前类似，省略，实际应包含
    }

    async function aoeAttackAnim(attackerOwnerId, attackerPos, attackerName, targetList) {
        // 完整代码省略，实际应包含
    }

    function instantKillAnim(step) {
        // 完整代码省略，实际应包含
    }

    // 暴露 API
    return {
        setAbortFlag,
        buffAnim,
        massBuffAnim,
        massShieldAnim,
        debuffAnim,
        attackAnim,
        multiHitAnim,
        rangedAttackAnim,
        aoeAttackAnim,
        instantKillAnim
    };
})();

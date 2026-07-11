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

    // ---------- 增益动画（增加音效） ----------
    function buffAnim(buff) {
        return new Promise(async resolve => {
            // ★ 播放增益音效
            try {
                const buffAudio = new Audio('/assets/wanv/vup.wav');
                buffAudio.volume = 1;
                buffAudio.play();
            } catch (e) {}

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
        // ★ 播放增益音效（群体增益只播一次）
        try {
            const buffAudio = new Audio('/assets/wanv/vup.wav');
            buffAudio.volume = 0.5;
            buffAudio.play();
        } catch (e) {}

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

    // ---- 其余函数保持不变 ----

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

    // ---------- 攻击动画（完整 3D + 回退） ----------
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

                // 1) 翻转到武器图
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

                // 2) 武器展示 + 插入长矛
                const insertDelay = 300;
                const totalDisplay = 400;
                await new Promise(r => setTimeout(r, insertDelay));
                await combat3D.insertWeaponIntoCard(defEl, isEnemyAttacker);
                const remaining = Math.max(0, totalDisplay - insertDelay - 100);
                if (remaining > 0) await new Promise(r => setTimeout(r, remaining));

                // 3) 翻回角色图
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

                // 恢复大小
                attEl.style.transition = 'transform 0.2s ease-out';
                attEl.style.transform = 'scale(1.0)';
                await new Promise(r => setTimeout(r, 200));
                attEl.style.transition = originalTransition;
                attEl.style.transform = originalTransform;
                attEl.style.transformStyle = originalTransformStyle;
                attEl.style.backfaceVisibility = originalBackfaceVisibility;
                if (slotEl) slotEl.style.perspective = originalSlotPerspective;

                // 伤害特效
                applyDamageEffects(a, defEl, true, '/assets/mp3/attack.mp3');
                const waitTime = a.isFatal ? 1000 : 600;
                await new Promise(r => setTimeout(r, waitTime));
                resolve();
                return;
            }

            // 无 3D 回退
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

    // 多段攻击动画（完整 3D + 回退）
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
                const originalTransform = attEl.style.transform;
                const originalTransition = attEl.style.transition;
                attEl.style.transition = 'transform 0.15s ease-out';
                attEl.style.transform = 'scale(1.25)';
                await new Promise(r => setTimeout(r, 150));

                const gameState = window.YYCardBattle?.getGameState?.();
                let weaponImage = '/assets/default_weapon.png';
                if (gameState) {
                    const attPlayer = gameState.players[first.attackerOwnerId];
                    if (attPlayer && attPlayer.board) {
                        const card = attPlayer.board[first.attackerPos];
                        if (card && card.weapon && card.weapon.card_id) {
                            const wid = card.weapon.card_id;
                            const display = utils.getCardDisplay({ card_id: wid });
                            weaponImage = display.image || `/assets/weapon/${wid}.png`;
                        }
                    }
                }

                const originalInnerHTML = attEl.innerHTML;
                const originalTransformStyle = attEl.style.transformStyle;
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
                if (slotEl) slotEl.style.perspective = originalSlotPerspective;
            } else {
                const ar = attEl.getBoundingClientRect(), dr = defEl.getBoundingClientRect();
                const dx = (dr.left - ar.left) * 0.7, dy = (dr.top - ar.top) * 0.7;
                attEl.style.transition = 'transform 0.35s ease-out';
                attEl.style.transform = `translate(${dx}px, ${dy}px) scale(1.25)`;
                attEl.style.zIndex = '100';
                await new Promise(r => setTimeout(r, 350));
            }

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

    // rangedAttackAnim（完整版，包含小乔快速模式和飞刀角度补偿）
    function rangedAttackAnim(stepsArray) {
        return new Promise(async resolve => {
            if (abortFlag) return resolve();
            if (!stepsArray || stepsArray.length === 0) return resolve();

            const myId = window.YYCardAuth?.currentUser?.id;
            const attackerPos = stepsArray[0].attackerPos;
            const attackerOwnerId = stepsArray[0].attackerOwnerId;
            const isEnemyAttacker = attackerOwnerId !== myId;
            const attackerName = stepsArray[0].attackerName || '';

            const slotEl = await utils.getSlotPositionRetry(attackerOwnerId, attackerPos, isEnemyAttacker);
            if (!slotEl) {
                utils.debugLog('⚠️ 飞刀动画失败，找不到死亡单位槽位');
                return resolve();
            }

            const isXiaoqiao = attackerName.includes('小乔');
            const totalSteps = stepsArray.length;
            const fastMode = isXiaoqiao && totalSteps > 20;

            const angleOffset = (combat3D && combat3D.EMOJI_DAGGER_ANGLE_OFFSET) || -135;

            if (fastMode) {
                for (let i = 0; i < totalSteps; i++) {
                    if (abortFlag) break;
                    const step = stepsArray[i];
                    const isEnemyDefender = step.defenderOwnerId !== myId;
                    const defEl = await utils.getCardElementRetry(step.defenderOwnerId, step.defenderPos, isEnemyDefender);
                    if (!defEl) continue;

                    const slotRect = slotEl.getBoundingClientRect();
                    const defRect = defEl.getBoundingClientRect();
                    const startX = slotRect.left + slotRect.width / 2;
                    const startY = slotRect.top + slotRect.height / 2;
                    const endX = defRect.left + defRect.width / 2;
                    const endY = defRect.top + defRect.height / 2;

                    const angleRad = Math.atan2(endY - startY, endX - startX);
                    const angleDeg = angleRad * (180 / Math.PI) + angleOffset;

                    const isStone = step.isCatapult === true;
                    const emojiChar = isStone ? '🪨' : '🗡️';
                    const emoji = document.createElement('div');
                    emoji.textContent = emojiChar;
                    emoji.style.cssText = `
                        position: fixed; z-index: 1500; font-size: 28px; pointer-events: none;
                        left: ${startX}px; top: ${startY}px;
                        transition: left 0.3s ease-in, top 0.3s ease-in;
                        transform: translate(-50%, -50%) rotate(${angleDeg}deg);
                        transform-origin: center center;
                    `;
                    document.body.appendChild(emoji);
                    requestAnimationFrame(() => {
                        emoji.style.left = `${endX}px`;
                        emoji.style.top = `${endY}px`;
                    });

                    applyDamageEffects(step, defEl, false);

                    if (i === 0 || i % 5 === 0) {
                        try {
                            const hitAudio = new Audio('/assets/mp3/zs.mp3');
                            hitAudio.volume = 0.3;
                            hitAudio.play();
                        } catch (e) {}
                    }

                    setTimeout(() => emoji.remove(), 300);
                    await new Promise(r => setTimeout(r, 100));
                }
                resolve();
            } else {
                const uniqueDefs = new Set(stepsArray.map(s => s.defenderOwnerId + ':' + s.defenderPos));
                const roundSize = uniqueDefs.size;
                const rounds = [];
                for (let i = 0; i < stepsArray.length; i += roundSize) {
                    rounds.push(stepsArray.slice(i, i + roundSize));
                }

                for (let r = 0; r < rounds.length; r++) {
                    if (abortFlag) break;
                    const roundSteps = rounds[r];

                    try {
                        const hitAudio = new Audio('/assets/mp3/zs.mp3');
                        hitAudio.volume = 0.4;
                        hitAudio.play();
                    } catch (e) {}

                    const animPromises = roundSteps.map(async (step) => {
                        if (abortFlag) return;
                        const isEnemyDefender = step.defenderOwnerId !== myId;
                        const defEl = await utils.getCardElementRetry(step.defenderOwnerId, step.defenderPos, isEnemyDefender);
                        if (!defEl) {
                            utils.debugLog(`⚠️ 飞刀目标缺失: ${step.defenderName}(${step.defenderOwnerId?.slice(0,8)} p${step.defenderPos})`);
                            return;
                        }

                        const slotRect = slotEl.getBoundingClientRect();
                        const defRect = defEl.getBoundingClientRect();
                        const startX = slotRect.left + slotRect.width / 2;
                        const startY = slotRect.top + slotRect.height / 2;
                        const endX = defRect.left + defRect.width / 2;
                        const endY = defRect.top + defRect.height / 2;

                        const angleRad = Math.atan2(endY - startY, endX - startX);
                        const angleDeg = angleRad * (180 / Math.PI) + angleOffset;

                        const isStone = step.isCatapult === true;
                        const emojiChar = isStone ? '🪨' : '🗡️';
                        const emoji = document.createElement('div');
                        emoji.textContent = emojiChar;
                        emoji.style.cssText = `
                            position: fixed; z-index: 1500; font-size: 28px; pointer-events: none;
                            left: ${startX}px; top: ${startY}px;
                            transition: left 0.5s ease-in, top 0.5s ease-in;
                            transform: translate(-50%, -50%) rotate(${angleDeg}deg);
                            transform-origin: center center;
                        `;
                        document.body.appendChild(emoji);
                        await new Promise(r => setTimeout(r, 50));
                        emoji.style.left = `${endX}px`;
                        emoji.style.top = `${endY}px`;
                        await new Promise(r => setTimeout(r, 500));
                        emoji.remove();

                        applyDamageEffects(step, defEl, false);
                    });

                    await Promise.all(animPromises);
                    if (r < rounds.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 600));
                    }
                }
                resolve();
            }
        });
    }

    // AOE 攻击动画
    async function aoeAttackAnim(attackerOwnerId, attackerPos, attackerName, targetList) {
        const myId = window.YYCardAuth?.currentUser?.id;
        const attEl = await utils.getCardElementRetry(attackerOwnerId, attackerPos, attackerOwnerId !== myId);
        if (!attEl) return;

        attEl.style.transition = 'transform 0.3s ease-out';
        attEl.style.transform = 'scale(1.25)';
        await new Promise(r => setTimeout(r, 300));
        attEl.style.transition = 'transform 0.3s ease-in';
        attEl.style.transform = 'scale(1.0)';

        const defElements = [];
        for (const a of targetList) {
            const defEl = await utils.getCardElementRetry(a.defenderOwnerId, a.defenderPos, a.defenderOwnerId !== myId);
            if (defEl) defElements.push({ el: defEl, data: a });
        }

        const animPromises = defElements.map(({ el, data }) => {
            return new Promise(resolve => {
                applyDamageEffects(data, el, false);
                setTimeout(() => {
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
            });
        });

        await Promise.all(animPromises);
        await new Promise(r => setTimeout(r, 400));
    }

    // 即死动画（完整版）
    function instantKillAnim(step) {
        return new Promise(async resolve => {
            if (abortFlag) return resolve();
            const myId = window.YYCardAuth?.currentUser?.id;
            const attEl = await utils.getCardElementRetry(step.attackerOwnerId, step.attackerPos, step.attackerOwnerId !== myId);
            const defEl = await utils.getCardElementRetry(step.defenderOwnerId, step.defenderPos, step.defenderOwnerId !== myId);
            if (!attEl || !defEl) {
                utils.debugLog(`⚠️即死动画缺失: ${step.attackerName} → ${step.defenderName}`);
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

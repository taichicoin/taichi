// ==================== 战斗模拟模块（3D 武器攻击版） ====================
window.YYCardCombat = (function() {
    let isAnimating = false;
    const BOARD_PAUSE_MS = 1000;
    let _combatLogText = '';

    // ==================== 3D 武器模块 ====================
    let _3DReady = false;
    let _threeModule = null;
    let _swordGLB = null;
    let _scene, _camera, _renderer;

    async function init3D() {
        if (_3DReady) return;
        try {
            const THREE = await import('three');
            const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
            _threeModule = THREE;

            _scene = new THREE.Scene();
            _camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
            _camera.position.z = 8;

            _renderer = new THREE.WebGLRenderer({ alpha: true });
            _renderer.setSize(window.innerWidth, window.innerHeight);
            _renderer.setClearColor(0x000000, 0);
            const canvas = _renderer.domElement;
            canvas.id = 'combat-3d-canvas';
            canvas.style.position = 'fixed';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '9999';
            document.body.appendChild(canvas);

            _scene.add(new THREE.AmbientLight(0xffffff, 0.8));
            const dir = new THREE.DirectionalLight(0xffffff, 0.6);
            dir.position.set(1, 1, 1);
            _scene.add(dir);

            function animate() {
                requestAnimationFrame(animate);
                _renderer.render(_scene, _camera);
            }
            animate();

            const loader = new GLTFLoader();
            const modelUrl = '/3d/autumn_sword.glb';
            const gltf = await new Promise((resolve, reject) => {
                loader.load(modelUrl, resolve, undefined, reject);
            });
            _swordGLB = gltf.scene;
            _swordGLB.scale.set(0.03, 0.03, 0.03);

            _3DReady = true;
            debugLog('⚔️ 3D 武器系统就绪');
        } catch (e) {
            debugLog('⚠️ 3D 武器加载失败，将使用旧版动画: ' + e.message);
            _3DReady = false;
        }
    }

    function domToWorld(el) {
        const THREE = _threeModule;
        if (!el || !THREE) return new THREE.Vector3(0,0,0);
        const rect = el.getBoundingClientRect();
        const x = (rect.left + rect.width/2) / window.innerWidth * 2 - 1;
        const y = -(rect.top + rect.height/2) / window.innerHeight * 2 + 1;
        const vec = new THREE.Vector3(x, y, 0.5);
        vec.unproject(_camera);
        return vec;
    }

    // 在卡牌上生成武器：剑尖朝上（我方）或朝下（敌方），宽面朝屏幕
    function spawnWeaponOnCard(cardEl, isEnemy) {
        const THREE = _threeModule;
        if (!_3DReady || !_swordGLB || !THREE) return null;
        const weapon = _swordGLB.clone();
        weapon.position.copy(domToWorld(cardEl));

        // 剑尖方向：我方朝上 (+Y)，敌方朝下 (-Y)
        const tipY = isEnemy ? -1 : 1;
        const tipAxis = new THREE.Vector3(0, tipY, 0);
        // 宽面朝向相机 (+Z)
        const faceAxis = new THREE.Vector3(0, 0, 1);
        // 右向量 = face × tip
        const rightAxis = new THREE.Vector3().crossVectors(faceAxis, tipAxis).normalize();
        // 构建旋转矩阵：局部X = right, 局部Y = tip, 局部Z = face
        const rotMat = new THREE.Matrix4().makeBasis(rightAxis, tipAxis, faceAxis);
        weapon.quaternion.setFromRotationMatrix(rotMat);

        _scene.add(weapon);
        return weapon;
    }

    // 武器飞行：剑尖指向目标，宽面尽量朝屏幕，无旋转
    function flyWeaponToTarget(weapon, startPos, defEl) {
        const THREE = _threeModule;
        if (!weapon || !THREE) return Promise.resolve();
        return new Promise(resolve => {
            const endPos = domToWorld(defEl);
            weapon.position.copy(startPos);

            // 飞行方向
            const flyDir = new THREE.Vector3().copy(endPos).sub(startPos).normalize();
            const camDir = new THREE.Vector3(0, 0, 1);
            const rightDir = new THREE.Vector3().crossVectors(camDir, flyDir).normalize();
            const rotMat = new THREE.Matrix4().makeBasis(rightDir, flyDir, camDir);
            weapon.quaternion.setFromRotationMatrix(rotMat);

            const duration = 400;
            const startTime = performance.now();
            let done = false;

            function fly(now) {
                if (done) return;
                const elapsed = now - startTime;
                let t = elapsed / duration;
                if (t >= 1) t = 1;
                weapon.position.lerpVectors(startPos, endPos, t);
                if (t < 1) {
                    requestAnimationFrame(fly);
                } else {
                    done = true;
                    if (weapon.parent) _scene.remove(weapon);
                    resolve();
                }
            }
            requestAnimationFrame(fly);

            // 超时保护
            setTimeout(() => {
                if (!done) {
                    done = true;
                    if (weapon.parent) _scene.remove(weapon);
                    resolve();
                }
            }, 2000);
        });
    }

    function applyDamageEffects(step, defEl) {
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
            updateCardStats(defEl, 0, 0, -1);
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

    // ================== 原有常量与工具 ==================
    const ENEMY_DATA_TO_VISUAL = { 0:3, 1:4, 2:5, 3:0, 4:1, 5:2 };

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

    function getCardElement(playerId, dataPos, isEnemy) {
        const board = document.querySelector(`.board[data-player-id="${playerId}"]`);
        if (!board) return null;
        const slot = board.querySelector(`.card-slot[data-board-index="${dataPos}"]`);
        if (slot) {
            const card = slot.querySelector('.card:not(.empty-slot)');
            if (card) return card;
        }
        const slotBySlotIndex = board.querySelector(`.card-slot[data-slot-index="${dataPos}"]`);
        if (slotBySlotIndex) {
            const card = slotBySlotIndex.querySelector('.card:not(.empty-slot)');
            if (card) return card;
        }
        return null;
    }

    async function getCardElementRetry(playerId, dataPos, isEnemy, maxRetries = 5) {
        for (let i = 0; i < maxRetries; i++) {
            const el = getCardElement(playerId, dataPos, isEnemy);
            if (el) return el;
            if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 120));
        }
        return null;
    }

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

    function buffAnim(buff) {
        return new Promise(async resolve => {
            const myId = window.YYCardAuth?.currentUser?.id;
            const isEnemy = buff.playerId !== myId;
            const el = await getCardElementRetry(buff.playerId, buff.position, isEnemy);
            if (!el) { debugLog(`⚠️增益缺失: p=${buff.playerId?.slice(0,8)} pos=${buff.position}`); return resolve(); }

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
                        width: 5vw; height: 5vw; border-radius: 20%;
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
                floatingText(el, `🛡️ +${shieldGain}`, '#ffaa00', 1200);
            }

            if (totalAtkGain > 0 || totalHpGain > 0) {
                const text = `+${totalAtkGain}+${totalHpGain}`;
                floatingText(el, ` ${text}`, '#7bffb1', 1200);
            }
            setTimeout(resolve, 300);
        });
    }

    // ★★★ 攻击动画（3D 优先，降级原版） ★★★
    function attackAnim(a) {
        return new Promise(async resolve => {
            if (abortFlag) return resolve();
            const myId = window.YYCardAuth?.currentUser?.id;
            const isEnemyAttacker = a.attackerOwnerId !== myId;
            const attEl = await getCardElementRetry(a.attackerOwnerId, a.attackerPos, isEnemyAttacker);
            const defEl = await getCardElementRetry(a.defenderOwnerId, a.defenderPos, a.defenderOwnerId !== myId);
            if (!attEl || !defEl) {
                debugLog(`⚠️攻击缺失: ${a.attackerName}(${a.attackerOwnerId?.slice(0,8)} p${a.attackerPos}) → ${a.defenderName}(${a.defenderOwnerId?.slice(0,8)} p${a.defenderPos})`);
                return resolve();
            }

            if (_3DReady) {
                const startPos = domToWorld(attEl);
                // 生成武器在卡牌上
                const weapon = spawnWeaponOnCard(attEl, isEnemyAttacker);
                if (!weapon) { resolve(); return; }

                // 卡牌放大，武器同时存在 0.8 秒
                attEl.style.transition = 'transform 0.25s ease-out';
                attEl.style.transform = 'scale(1.25)';
                await new Promise(r => setTimeout(r, 800));

                // 卡牌缩小，同时武器飞出
                attEl.style.transition = 'transform 0.25s ease-in';
                attEl.style.transform = 'scale(1.0)';
                await flyWeaponToTarget(weapon, startPos, defEl);
                if (abortFlag) return resolve();

                applyDamageEffects(a, defEl);
                const waitTime = a.isFatal ? 1000 : 600;
                await new Promise(r => setTimeout(r, waitTime));
                resolve();
                return;
            }

            // ====== 原版 DOM 动画（降级） ======
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

    // AOE 攻击动画保留原版
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

    // 即死动画保留原版
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

    async function massBuffAnim(step) {
        const myId = window.YYCardAuth?.currentUser?.id;
        const isEnemy = step.playerId !== myId;
        const posList = step.targetPositions || [];
        const atkGain = step.atkGain || 0;
        const hpGain = step.hpGain || 0;

        if (posList.length === 0) return;

        const elements = [];
        for (const pos of posList) {
            const el = await getCardElementRetry(step.playerId, pos, isEnemy);
            if (el) {
                elements.push({ el, pos });
                updateCardStats(el, atkGain, hpGain);
            } else {
                debugLog(`⚠️ mass_buff缺失: p=${step.playerId?.slice(0,8)} pos=${pos}`);
            }
        }

        for (const { el } of elements) {
            const text = `+${atkGain}/+${hpGain}`;
            floatingText(el, ` ${text}`, '#7bffb1', 1200);
        }

        await new Promise(r => setTimeout(r, 300));
    }

    async function playSteps(steps, myId, oppId) {
        if (isAnimating) return;
        isAnimating = true;
        abortFlag = false;
        let idx = 0;

        const getGameState = () => window.YYCardBattle?.getGameState?.();
        const updateGoldUI = (gold) => {
            const goldEl = document.getElementById('my-gold');
            if (goldEl) goldEl.textContent = gold;
            if (window.YYCardShop?.updateGold) window.YYCardShop.updateGold(gold);
        };

        for (let i = 0; i < steps.length; i++) {
            if (abortFlag) break;
            const step = steps[i];
            idx = i + 1;

            if (step.goldGain !== undefined && step.goldGain !== 0) {
                if (step.playerId === myId || step.attackerOwnerId === myId) {
                    const gameState = getGameState();
                    const my = gameState?.players?.[myId];
                    if (my) {
                        const oldGold = my.gold || 0;
                        my.gold = oldGold + step.goldGain;
                        updateGoldUI(my.gold);
                        const goldDisplay = document.getElementById('my-gold');
                        if (goldDisplay) {
                            floatingText(goldDisplay, `💰 +${step.goldGain}`, '#ffd966', 1200);
                        } else {
                            floatingText(document.body, `💰 +${step.goldGain}`, '#ffd966', 1200);
                        }
                        debugLog(`  💰 金币 +${step.goldGain}，当前：${my.gold}`);
                    }
                }
                if (step.type !== 'buff') continue;
            }

            if (step.type === 'buff') {
                debugLog(`  ▶ buff #${idx}: ${step.sourceCard} ${step.desc} pos=${step.position}`);
                await buffAnim(step);
                await new Promise(r => setTimeout(r, 100));
            } 
            else if (step.type === 'mass_buff') {
                debugLog(`  ▶ mass_buff #${idx}: ${step.sourceCard} ${step.desc} 目标=${step.targetPositions?.length || 0}个`);
                await massBuffAnim(step);
                await new Promise(r => setTimeout(r, 100));
            }
            else if (step.type === 'attack') {
                debugLog(`  ▶ atk #${idx}: ${step.attackerName}→${step.defenderName} dmg=${step.damage}`);
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
            else if (step.type === 'instant_kill') {
                debugLog(`  ⚡ instant_kill #${idx}: ${step.attackerName} 吞噬 ${step.defenderName}`);
                await instantKillAnim(step);
                await new Promise(r => setTimeout(r, 380));
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

    // ★★★ 主入口 ★★★
    async function resolveBattles(gameState, onComplete) {
        if (!gameState?.players) { onComplete?.(); return; }

        isAnimating = false;
        abortFlag = false;
        const myId = window.YYCardAuth?.currentUser?.id;
        clearDebug();
        debugLog('🔍 ====== 结算开始 (使用已缓存数据) ======');

        if (!_3DReady) {
            await init3D().catch(e => debugLog('3D 初始化异常: ' + e));
        }

        const buffEvents = gameState._buffEvents || [];
        const combatResults = gameState._combatResults || [];

        let myCombat = null;
        let oppId = null;
        for (const cr of combatResults) {
            if (cr.p1 === myId) {
                myCombat = cr;
                oppId = cr.p2;
                break;
            } else if (cr.p2 === myId) {
                myCombat = cr;
                oppId = cr.p1;
                break;
            }
        }

        if (oppId && gameState.players[oppId]?.board) {
            renderEnemyBoardFromData(oppId, gameState.players[oppId].board);
            const ready = await waitForEnemyBoard(oppId);
            if (!ready) debugLog('⚠️ 敌方棋盘未在 2 秒内就绪，部分动画可能缺失');
        }

        const allSteps = [...buffEvents];
        if (myCombat?.combatLog) {
            allSteps.push(...myCombat.combatLog);
        }

        debugLog(`🎬 buffEvents=${buffEvents.length} 我的战斗=${myCombat ? '是' : '无'} 总步数=${allSteps.length}`);
        debugLog(`⏸️ 棋盘亮相，等待 ${BOARD_PAUSE_MS}ms ...`);
        await new Promise(r => setTimeout(r, BOARD_PAUSE_MS));
        debugLog(`▶️ 播放全部${allSteps.length}步`);
        if (allSteps.length > 0) {
            await playSteps(allSteps, myId, oppId);
        }
        debugLog('✅ ====== 结算结束 ======');

        if (onComplete) onComplete();
    }

    ensureDebugPanel();
    return {
        resolveBattles,
        abortAnimation: () => { abortFlag = true; },
        isAnimating: () => isAnimating
    };
})();

// ==================== 战斗模拟模块（3D 武器攻击版 · 卡牌翻转动画 · 受击音效 · 遗言飞刀 · 刀尖朝向修复 · 曹操全体护盾优化 · 遗言金币处理 · 共工减半debuff动画 · 连续buff支持 · 亡魂召唤 · 内力连击动画 · 小乔飞刀加速 · 亡魂碎片快速生成 · 召唤护盾显示） ====================
window.YYCardCombat = (function() {
    let isAnimating = false;
    const BOARD_PAUSE_MS = 1000;
    let _combatLogText = '';

    // ==================== 3D 武器模块 ====================
    let _3DReady = false;
    let _threeModule = null;
    let _swordGLB = null;
    let _daggerGLB = null;
    let _scene, _camera, _renderer;

    const SWORD_Z_OFFSET = 0;

    // ★ 表情飞刀刀尖方向补偿
    const EMOJI_DAGGER_ANGLE_OFFSET = -135;

    // ---------- 卡牌展示配置（从 /data/image.json 加载） ----------
    let cardConfig = {};
    let cardConfigPromise = null;

    async function loadCardConfig() {
        if (cardConfigPromise) return cardConfigPromise;
        cardConfigPromise = (async () => {
            try {
                const res = await fetch('/data/image.json');
                if (res.ok) {
                    cardConfig = await res.json();
                }
            } catch (e) {}
        })();
        return cardConfigPromise;
    }

    function getCardDisplay(card) {
        const id = card?.card_id || card?.cardId || '';
        const cfg = cardConfig[id] || {};
        return {
            name: cfg.name || card?.name || id || '未知',
            image: cfg.image || card?.image || `/assets/card/${id}.png`
        };
    }

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

            const swordPromise = new Promise((resolve, reject) => {
                loader.load('/3d/autumn_sword.glb', resolve, undefined, reject);
            });
            const daggerPromise = new Promise((resolve) => {
                loader.load('/3d/dagger.glb', 
                    (gltf) => resolve(gltf), 
                    undefined, 
                    () => resolve(null)
                );
            });

            const [swordGltf, daggerGltf] = await Promise.all([swordPromise, daggerPromise]);
            _swordGLB = swordGltf.scene;
            const swordBox = new THREE.Box3().setFromObject(_swordGLB);
            const swordSize = new THREE.Vector3();
            swordBox.getSize(swordSize);
            const swordTargetHeight = 0.003;
            const swordScale = swordTargetHeight / (swordSize.y || 1);
            _swordGLB.scale.set(swordScale, swordScale, swordScale);

            if (daggerGltf) {
                _daggerGLB = daggerGltf.scene;
                const daggerBox = new THREE.Box3().setFromObject(_daggerGLB);
                const daggerSize = new THREE.Vector3();
                daggerBox.getSize(daggerSize);
                const daggerTargetHeight = 0.03;
                const daggerScale = daggerTargetHeight / (daggerSize.y || 1);
                _daggerGLB.scale.set(daggerScale, daggerScale, daggerScale);
                debugLog('⚔️ 3D 武器系统就绪 (剑 + 匕首)');
            } else {
                debugLog('⚔️ 3D 武器系统就绪 (仅剑，匕首将使用表情符号)');
            }

            _3DReady = true;
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

    function makeSwordRotation(tipDir, faceDir) {
        const THREE = _threeModule;
        const tip = tipDir.clone().normalize();
        const face = faceDir.clone().normalize();
        const right = new THREE.Vector3().crossVectors(face, tip).normalize();
        const rotMat = new THREE.Matrix4().makeBasis(right, tip, face);
        const quat = new THREE.Quaternion().setFromRotationMatrix(rotMat);
        const zAxis = new THREE.Vector3(0, 0, 1);
        const offsetQuat = new THREE.Quaternion().setFromAxisAngle(zAxis, SWORD_Z_OFFSET);
        quat.multiply(offsetQuat);
        return new THREE.Matrix4().makeRotationFromQuaternion(quat);
    }

    // ★ 长矛插入目标卡牌动画（放慢至 0.3 秒）
    function insertWeaponIntoCard(defEl, isEnemy) {
        const THREE = _threeModule;
        if (!_3DReady || !THREE || !defEl) return Promise.resolve();

        const weapon = _swordGLB.clone();
        const rect = defEl.getBoundingClientRect();

        const startEdgeY = isEnemy ? rect.top : rect.bottom;
        const endEdgeY = isEnemy ? rect.bottom : rect.top;
        const centerX = rect.left + rect.width / 2;

        const toWorld = (edgeY) => {
            const x_ndc = (centerX / window.innerWidth) * 2 - 1;
            const y_ndc = -(edgeY / window.innerHeight) * 2 + 1;
            const vec = new THREE.Vector3(x_ndc, y_ndc, 0.5);
            vec.unproject(_camera);
            return vec;
        };

        const startPos = toWorld(startEdgeY);
        const endPos = toWorld(endEdgeY);
        weapon.position.copy(startPos);

        const tipDir = new THREE.Vector3(0, isEnemy ? -1 : 1, 0);
        const faceDir = new THREE.Vector3(0, 0, 1);
        const rotMat = makeSwordRotation(tipDir, faceDir);
        const rotQuat = new THREE.Quaternion().setFromRotationMatrix(rotMat);
        const correctionAngle = isEnemy ? -Math.PI / 2 : Math.PI / 2;
        const spearCorrection = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0), correctionAngle
        );
        weapon.quaternion.copy(rotQuat).multiply(spearCorrection);

        _scene.add(weapon);

        return new Promise(resolve => {
            const duration = 300;
            const startTime = performance.now();
            let done = false;

            function animate(now) {
                if (done) return;
                const elapsed = now - startTime;
                let t = Math.min(elapsed / duration, 1.0);
                weapon.position.lerpVectors(startPos, endPos, t);
                if (t < 1) {
                    requestAnimationFrame(animate);
                } else {
                    done = true;
                    if (weapon.parent) _scene.remove(weapon);
                    resolve();
                }
            }
            requestAnimationFrame(animate);

            setTimeout(() => {
                if (!done) {
                    done = true;
                    if (weapon.parent) _scene.remove(weapon);
                    resolve();
                }
            }, 500);
        });
    }

    function spawnWeaponOnCard(cardEl, isEnemy, model = null) {
        const THREE = _threeModule;
        if (!_3DReady || !THREE) return null;
        const weaponModel = model || _swordGLB;
        if (!weaponModel) return null;
        const weapon = weaponModel.clone();

        const rect = cardEl.getBoundingClientRect();
        const edgeY = isEnemy ? rect.bottom : rect.top;
        const edgeX = rect.left + rect.width / 2;
        const x_ndc = (edgeX / window.innerWidth) * 2 - 1;
        const y_ndc = -(edgeY / window.innerHeight) * 2 + 1;
        const edgeWorld = new THREE.Vector3(x_ndc, y_ndc, 0.5);
        edgeWorld.unproject(_camera);
        weapon.position.copy(edgeWorld);

        const tipDir = new THREE.Vector3(0, isEnemy ? -1 : 1, 0);
        const faceDir = new THREE.Vector3(0, 0, 1);
        const rotMat = makeSwordRotation(tipDir, faceDir);
        const rotQuat = new THREE.Quaternion().setFromRotationMatrix(rotMat);

        const correctionAngle = isEnemy ? -Math.PI / 2 : Math.PI / 2;
        const spearCorrection = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0), correctionAngle
        );
        weapon.quaternion.copy(rotQuat).multiply(spearCorrection);

        _scene.add(weapon);
        return weapon;
    }

    function flyWeaponToTarget(weapon, startPos, defEl, isEnemy) {
        return Promise.resolve();
    }

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

    function getSlotElement(playerId, dataPos, isEnemy) {
        const board = document.querySelector(`.board[data-player-id="${playerId}"]`);
        if (!board) return null;
        let slot = board.querySelector(`.card-slot[data-board-index="${dataPos}"]`);
        if (slot) return slot;
        if (isEnemy) {
            const v = ENEMY_DATA_TO_VISUAL[dataPos];
            if (v !== undefined) {
                slot = board.querySelector(`.card-slot[data-board-index="${v}"]`);
                if (slot) return slot;
            }
        }
        slot = board.querySelector(`.card-slot[data-slot-index="${dataPos}"]`);
        return slot;
    }

    function getCardElement(playerId, dataPos, isEnemy) {
        const slot = getSlotElement(playerId, dataPos, isEnemy);
        if (!slot) return null;
        return slot.querySelector('.card:not(.empty-slot)');
    }

    async function getCardElementRetry(playerId, dataPos, isEnemy, maxRetries = 5) {
        for (let i = 0; i < maxRetries; i++) {
            const el = getCardElement(playerId, dataPos, isEnemy);
            if (el) return el;
            if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 120));
        }
        return null;
    }

    async function getSlotPositionRetry(playerId, dataPos, isEnemy, maxRetries = 5) {
        for (let i = 0; i < maxRetries; i++) {
            const slot = getSlotElement(playerId, dataPos, isEnemy);
            if (slot) return slot;
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

    // ==================== 数值显示上限 ====================
    function clampDisplay(val) {
        if (val > 9999) return '9999';
        return String(val);
    }

    // ==================== 通用浮动文字（字体缩小 10%，不加粗） ====================
    function floatingText(el, text, color, duration, offsetYPercent = 0) {
        if (!el) return;
        const d = document.createElement('div');
        d.textContent = text;
        d.style.cssText = `position:absolute; color:${color}; font-size:25px; font-weight:normal; text-shadow:0 0 6px #000; z-index:200; left:50%; top:${30 + offsetYPercent}%; transform:translate(-50%,-50%); animation:damageFloat ${duration}ms forwards; pointer-events:none;`;
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

    function showFloatTextOnBody(text, color, duration) {
        const div = document.createElement('div');
        div.textContent = text;
        div.style.cssText = `
            position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%);
            color: ${color}; font-size: 32px; font-weight: bold;
            text-shadow: 0 0 8px #000; z-index: 3000; pointer-events: none;
            animation: damageFloat ${duration}ms forwards;
        `;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), duration);
    }

    function createSpiritCard(slotEl, spiritAtk, spiritHp, spiritImage, spiritName, star = 0, tempShield = 0) {
        slotEl.innerHTML = '';
        const card = document.createElement('div');
        card.className = 'card card-spirit';
        card.setAttribute('data-star', star);
        card.style.border = '4px solid #c0c0c0';
        card.style.boxShadow = '0 0 8px rgba(192,192,192,0.8)';
        card.style.background = 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)';
        card.innerHTML = `
            <div class="card-frame" style="border-color: #c0c0c0;"></div>
            <div class="card-icon"><img src="${spiritImage}" alt="${spiritName}" onerror="this.src='/assets/default-avatar.png'" style="width:100%;height:100%;object-fit:cover;"></div>
            <div class="card-name" style="color:#ddd;">${spiritName}</div>
            <div class="card-stats"><span class="card-atk">${spiritAtk}</span><span class="card-hp">${spiritHp}</span></div>
        `;
        if (tempShield > 0) {
            const shieldDiv = document.createElement('div');
            shieldDiv.className = 'card-shield';
            shieldDiv.innerHTML = `<span>${tempShield}</span>`;
            card.appendChild(shieldDiv);
        }
        const img = card.querySelector('img');
        if (img) img.draggable = false;
        slotEl.appendChild(card);
    }

    // ★★★ 单个增益动画（攻击/生命分开飘字，上限 9999） ★★★
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

            // 护盾
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
                floatingText(el, `🛡️ +${clampDisplay(shieldGain)}`, '#00bfff', 1200);
            }

            // 攻击单独飘字
            if (totalAtkGain > 0) {
                const atkEl = el.querySelector('.card-atk');
                floatingText(atkEl || el, `+${clampDisplay(totalAtkGain)}`, '#7bffb1', 1200, -30);
            }

            // 生命单独飘字
            if (totalHpGain > 0) {
                const hpEl = el.querySelector('.card-hp');
                floatingText(hpEl || el, `+${clampDisplay(totalHpGain)}`, '#7bffb1', 1200, -30);
            }

            setTimeout(resolve, 300);
        });
    }

    // ★★★ 攻击动画（卡牌真实翻转版） ★★★
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
                const gameState = window.YYCardBattle?.getGameState?.();
                let weaponImage = '/assets/default_weapon.png';
                if (gameState) {
                    const attPlayer = gameState.players[a.attackerOwnerId];
                    if (attPlayer && attPlayer.board) {
                        const card = attPlayer.board[a.attackerPos];
                        if (card && card.weapon && card.weapon.card_id) {
                            const wid = card.weapon.card_id;
                            const cfg = cardConfig[wid];
                            weaponImage = cfg && cfg.image ? cfg.image : `/assets/weapon/${wid}.png`;
                        }
                    }
                }

                const originalInnerHTML = attEl.innerHTML;
                const originalTransform = attEl.style.transform;
                const originalTransition = attEl.style.transition;
                const originalTransformStyle = attEl.style.transformStyle;
                const originalBackfaceVisibility = attEl.style.backfaceVisibility;
                const slotEl = attEl.parentNode;
                const originalSlotPerspective = slotEl ? slotEl.style.perspective : '';

                if (slotEl) slotEl.style.perspective = '600px';
                attEl.style.transformStyle = 'preserve-3d';

                // 1) 角色图翻转到 90°（消失）
                attEl.style.transition = 'transform 0.15s ease-in';
                attEl.style.transform = 'rotateY(90deg)';
                await new Promise(r => setTimeout(r, 150));

                // 2) 替换为武器图，并立即设为 -90°（背面），然后翻转到 0°（出现）
                attEl.style.transition = 'none';
                attEl.style.transform = 'rotateY(-90deg)';
                attEl.innerHTML = `
                    <div class="card-icon" style="overflow:visible; display:flex; align-items:center; justify-content:center;">
                        <img src="${weaponImage}" alt="武器" onerror="this.src='/assets/default_weapon.png'" style="width:100%;height:100%;object-fit:contain; display:block; border:none;">
                    </div>
                    <div class="card-name" style="color:#ddd;">武器</div>
                    <div class="card-stats"><span class="card-atk">?</span><span class="card-hp">?</span></div>
                `;
                attEl.offsetHeight;
                attEl.style.transition = 'transform 0.15s ease-out';
                attEl.style.transform = 'rotateY(0deg)';
                await new Promise(r => setTimeout(r, 150));

                // 3) 武器图展示 0.6s，第 0.3s 开始插入长矛
                const insertDelay = 300;
                const displayDuration = 600;
                const insertPromise = (async () => {
                    await new Promise(r => setTimeout(r, insertDelay));
                    await insertWeaponIntoCard(defEl, isEnemyAttacker);
                })();
                await new Promise(r => setTimeout(r, displayDuration));
                await insertPromise;

                // 4) 武器图翻转到 90°（消失）
                attEl.style.transition = 'transform 0.15s ease-in';
                attEl.style.transform = 'rotateY(90deg)';
                await new Promise(r => setTimeout(r, 150));

                // 5) 替换回角色图，从 -90° 翻转到 0°（出现）
                attEl.style.transition = 'none';
                attEl.style.transform = 'rotateY(-90deg)';
                attEl.innerHTML = originalInnerHTML;
                attEl.offsetHeight;
                attEl.style.transition = 'transform 0.15s ease-out';
                attEl.style.transform = 'rotateY(0deg)';
                await new Promise(r => setTimeout(r, 150));

                // 恢复原始样式
                attEl.style.transition = originalTransition;
                attEl.style.transform = originalTransform;
                attEl.style.transformStyle = originalTransformStyle;
                attEl.style.backfaceVisibility = originalBackfaceVisibility;
                if (slotEl) slotEl.style.perspective = originalSlotPerspective;

                // 6) 伤害特效
                applyDamageEffects(a, defEl, true, '/assets/mp3/attack.mp3');
                const waitTime = a.isFatal ? 1000 : 600;
                await new Promise(r => setTimeout(r, waitTime));
                resolve();
                return;
            }

            // 无 3D 时回退动画
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

    // 多段攻击动画（同样使用卡牌翻转）
    function multiHitAnim(stepsList) {
        return new Promise(async resolve => {
            if (abortFlag) return resolve();
            if (!stepsList || stepsList.length === 0) return resolve();

            const myId = window.YYCardAuth?.currentUser?.id;
            const first = stepsList[0];
            const isEnemyAttacker = first.attackerOwnerId !== myId;
            const attEl = await getCardElementRetry(first.attackerOwnerId, first.attackerPos, isEnemyAttacker);
            const defEl = await getCardElementRetry(first.defenderOwnerId, first.defenderPos, first.defenderOwnerId !== myId);
            if (!attEl || !defEl) { resolve(); return; }

            if (_3DReady) {
                const gameState = window.YYCardBattle?.getGameState?.();
                let weaponImage = '/assets/default_weapon.png';
                if (gameState) {
                    const attPlayer = gameState.players[first.attackerOwnerId];
                    if (attPlayer && attPlayer.board) {
                        const card = attPlayer.board[first.attackerPos];
                        if (card && card.weapon && card.weapon.card_id) {
                            const wid = card.weapon.card_id;
                            const cfg = cardConfig[wid];
                            weaponImage = cfg && cfg.image ? cfg.image : `/assets/weapon/${wid}.png`;
                        }
                    }
                }

                const originalInnerHTML = attEl.innerHTML;
                const originalTransform = attEl.style.transform;
                const originalTransition = attEl.style.transition;
                const originalTransformStyle = attEl.style.transformStyle;
                const slotEl = attEl.parentNode;
                const originalSlotPerspective = slotEl ? slotEl.style.perspective : '';

                if (slotEl) slotEl.style.perspective = '600px';
                attEl.style.transformStyle = 'preserve-3d';

                // 1) 角色图翻转到 90°
                attEl.style.transition = 'transform 0.15s ease-in';
                attEl.style.transform = 'rotateY(90deg)';
                await new Promise(r => setTimeout(r, 150));

                // 2) 替换武器图，-90° → 0°
                attEl.style.transition = 'none';
                attEl.style.transform = 'rotateY(-90deg)';
                attEl.innerHTML = `
                    <div class="card-icon" style="overflow:visible; display:flex; align-items:center; justify-content:center;">
                        <img src="${weaponImage}" alt="武器" onerror="this.src='/assets/default_weapon.png'" style="width:100%;height:100%;object-fit:contain; display:block; border:none;">
                    </div>
                    <div class="card-name" style="color:#ddd;">武器</div>
                    <div class="card-stats"><span class="card-atk">?</span><span class="card-hp">?</span></div>
                `;
                attEl.offsetHeight;
                attEl.style.transition = 'transform 0.15s ease-out';
                attEl.style.transform = 'rotateY(0deg)';
                await new Promise(r => setTimeout(r, 150));

                // 3) 武器展示 + 插入长矛
                const insertDelay = 300;
                await new Promise(r => setTimeout(r, insertDelay));
                await insertWeaponIntoCard(defEl, isEnemyAttacker);
                const remaining = Math.max(0, 600 - (insertDelay + 300));
                if (remaining > 0) await new Promise(r => setTimeout(r, remaining));

                // 4) 武器图翻转到 90°
                attEl.style.transition = 'transform 0.15s ease-in';
                attEl.style.transform = 'rotateY(90deg)';
                await new Promise(r => setTimeout(r, 150));

                // 5) 替换回角色图，-90° → 0°
                attEl.style.transition = 'none';
                attEl.style.transform = 'rotateY(-90deg)';
                attEl.innerHTML = originalInnerHTML;
                attEl.offsetHeight;
                attEl.style.transition = 'transform 0.15s ease-out';
                attEl.style.transform = 'rotateY(0deg)';
                await new Promise(r => setTimeout(r, 150));

                // 恢复
                attEl.style.transition = originalTransition;
                attEl.style.transform = originalTransform;
                attEl.style.transformStyle = originalTransformStyle;
                if (slotEl) slotEl.style.perspective = originalSlotPerspective;
            } else {
                const ar = attEl.getBoundingClientRect(), dr = defEl.getBoundingClientRect();
                const dx = (dr.left - ar.left) * 0.7, dy = (dr.top - ar.top) * 0.7;
                attEl.style.transition = 'transform 0.35s ease-out';
                attEl.style.transform = `translate(${dx}px, ${dy}px)`;
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
            attEl.style.transform = 'translate(0,0)';
            attEl.style.zIndex = '';
            await new Promise(r => setTimeout(r, 250));
            resolve();
        });
    }

    // rangedAttackAnim（不变）
    function rangedAttackAnim(stepsArray) {
        return new Promise(async resolve => {
            if (abortFlag) return resolve();
            if (!stepsArray || stepsArray.length === 0) return resolve();

            const myId = window.YYCardAuth?.currentUser?.id;
            const attackerPos = stepsArray[0].attackerPos;
            const attackerOwnerId = stepsArray[0].attackerOwnerId;
            const isEnemyAttacker = attackerOwnerId !== myId;
            const attackerName = stepsArray[0].attackerName || '';

            const slotEl = await getSlotPositionRetry(attackerOwnerId, attackerPos, isEnemyAttacker);
            if (!slotEl) {
                debugLog('⚠️ 飞刀动画失败，找不到死亡单位槽位');
                return resolve();
            }

            const isXiaoqiao = attackerName.includes('小乔');
            const totalSteps = stepsArray.length;
            const fastMode = isXiaoqiao && totalSteps > 20;

            if (fastMode) {
                for (let i = 0; i < totalSteps; i++) {
                    if (abortFlag) break;
                    const step = stepsArray[i];
                    const isEnemyDefender = step.defenderOwnerId !== myId;
                    const defEl = await getCardElementRetry(step.defenderOwnerId, step.defenderPos, isEnemyDefender);
                    if (!defEl) continue;

                    const slotRect = slotEl.getBoundingClientRect();
                    const defRect = defEl.getBoundingClientRect();
                    const startX = slotRect.left + slotRect.width / 2;
                    const startY = slotRect.top + slotRect.height / 2;
                    const endX = defRect.left + defRect.width / 2;
                    const endY = defRect.top + defRect.height / 2;

                    const angleRad = Math.atan2(endY - startY, endX - startX);
                    const angleDeg = angleRad * (180 / Math.PI) + EMOJI_DAGGER_ANGLE_OFFSET;

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
                        const defEl = await getCardElementRetry(step.defenderOwnerId, step.defenderPos, isEnemyDefender);
                        if (!defEl) {
                            debugLog(`⚠️ 飞刀目标缺失: ${step.defenderName}(${step.defenderOwnerId?.slice(0,8)} p${step.defenderPos})`);
                            return;
                        }

                        const slotRect = slotEl.getBoundingClientRect();
                        const defRect = defEl.getBoundingClientRect();
                        const startX = slotRect.left + slotRect.width / 2;
                        const startY = slotRect.top + slotRect.height / 2;
                        const endX = defRect.left + defRect.width / 2;
                        const endY = defRect.top + defRect.height / 2;

                        const angleRad = Math.atan2(endY - startY, endX - startX);
                        const angleDeg = angleRad * (180 / Math.PI) + EMOJI_DAGGER_ANGLE_OFFSET;

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

    // aoeAttackAnim（不变）
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

    // instantKillAnim（不变）
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

    // ★★★ 群体增益动画（攻击/生命分开飘字，上限 9999） ★★★
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
            if (atkGain > 0) {
                const atkEl = el.querySelector('.card-atk');
                floatingText(atkEl || el, `+${clampDisplay(atkGain)}`, '#7bffb1', 1200, -30);
            }
            if (hpGain > 0) {
                const hpEl = el.querySelector('.card-hp');
                floatingText(hpEl || el, `+${clampDisplay(hpGain)}`, '#7bffb1', 1200, -30);
            }
        }

        await new Promise(r => setTimeout(r, 300));
    }

    // massShieldAnim（不变，但字体已跟随全局缩小）
    async function massShieldAnim(step) {
        const myId = window.YYCardAuth?.currentUser?.id;
        const isEnemy = step.playerId !== myId;
        const posList = step.targetPositions || [];
        const shieldGain = step.shieldGain || 0;
        if (posList.length === 0) return;

        const elements = [];
        for (const pos of posList) {
            const el = await getCardElementRetry(step.playerId, pos, isEnemy);
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
                debugLog(`⚠️ mass_shield缺失: p=${step.playerId?.slice(0,8)} pos=${pos}`);
            }
        }

        if (elements.length > 0) {
            const { el } = elements[0];
            floatingText(el, `🛡️ +${clampDisplay(shieldGain)}`, '#00bfff', 1200);
        }

        await new Promise(r => setTimeout(r, 300));
    }

    // debuffAnim（不变）
    function debuffAnim(step) {
        const myId = window.YYCardAuth?.currentUser?.id;
        const isEnemy = step.playerId !== myId;
        const el = getCardElement(step.playerId, step.position, isEnemy);
        if (!el) {
            debugLog(`⚠️ debuff缺失: p=${step.playerId?.slice(0,8)} pos=${step.position}`);
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
        floatingText(el, text, '#ffffff', 800, offsetY);
    }

    // playSteps（不变）
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
                if (step.type === 'gold') {
                    debugLog(`  💰 遗言金币 #${idx}: ${step.sourceCard} +${step.goldGain}`);
                    continue;
                }
            }

            if (step.type === 'summon_spirit') {
                debugLog(`  ▶ summon_spirit #${idx}: ${step.sourceCard} ${step.desc}`);
                const isEnemy = step.playerId !== myId;

                if (step.atkGain > 0 || step.hpGain > 0) {
                    if (step.summoned) {
                        const slotEl = getSlotElement(step.playerId, step.position, isEnemy);
                        if (slotEl) {
                            const cardEl = slotEl.querySelector('.card:not(.empty-slot)');
                            if (cardEl) {
                                floatingText(cardEl, `+${step.atkGain}+${step.hpGain}`, '#7bffb1', 1200, 0);
                            }
                        }
                    } else {
                        showFloatTextOnBody(`亡魂 +${step.atkGain}/${step.hpGain}`, '#7bffb1', 1500);
                    }
                }

                if (step.summoned && step.position >= 0) {
                    const slotEl = getSlotElement(step.playerId, step.position, isEnemy);
                    if (slotEl) {
                        const isBoss = (step.sourceCard === 'MEME羁绊');
                        const image = isBoss ? '/assets/card/zjz.png' : '/assets/card/daodun1.png';
                        const star = isBoss ? 1 : 0;
                        const shield = Number(step.tempShield) || 0;
                        createSpiritCard(slotEl, step.spiritAtk, step.spiritHp, image, '亡魂', star, shield);
                    } else {
                        debugLog(`⚠️ 召唤槽位缺失: pos=${step.position}`);
                    }
                }
                await new Promise(r => setTimeout(r, 400));
            }

            else if (step.type === 'buff' && step.continuous) {
                const batchId = step.batchId;
                const batch = [];
                let j = i;
                while (j < steps.length && steps[j].type === 'buff' && steps[j].continuous && steps[j].batchId === batchId) {
                    batch.push(steps[j]);
                    j++;
                }
                batch.sort((a, b) => (a.index || 0) - (b.index || 0));
                debugLog(`  ▶ continuous buff #${idx}-${idx + batch.length - 1}: batch=${batchId} count=${batch.length}`);
                for (const bstep of batch) {
                    if (abortFlag) break;
                    await buffAnim(bstep);
                    await new Promise(r => setTimeout(r, 150));
                }
                i = j - 1;
                continue;
            }

            else if (step.type === 'buff') {
                if (step.desc && step.desc.startsWith('吴国羁绊')) {
                    debugLog(`  ▶ buff #${idx}: ${step.sourceCard} ${step.desc} (跳过动画)`);
                    continue;
                }
                debugLog(`  ▶ buff #${idx}: ${step.sourceCard} ${step.desc} pos=${step.position}`);
                await buffAnim(step);
                await new Promise(r => setTimeout(r, 100));
            }

            else if (step.type === 'mass_buff') {
                debugLog(`  ▶ mass_buff #${idx}: ${step.sourceCard} ${step.desc} 目标=${step.targetPositions?.length || 0}个`);
                await massBuffAnim(step);
                await new Promise(r => setTimeout(r, 100));
            }

            else if (step.type === 'mass_shield') {
                debugLog(`  ▶ mass_shield #${idx}: ${step.sourceCard} ${step.desc} 目标=${step.targetPositions?.length || 0}个`);
                await massShieldAnim(step);
                await new Promise(r => setTimeout(r, 100));
            }

            else if (step.type === 'debuff') {
                debugLog(`  ▶ debuff #${idx}: ${step.sourceCard} -> ${step.targetName} ${step.desc}`);
                debuffAnim(step);
                await new Promise(r => setTimeout(r, 300));
            }

            else if (step.type === 'attack') {
                if (step.isRanged) {
                    const rangedGroup = [];
                    let j = i;
                    const firstKey = step.attackerOwnerId + ':' + step.attackerPos;
                    while (j < steps.length && steps[j].type === 'attack' && steps[j].isRanged) {
                        const curKey = steps[j].attackerOwnerId + ':' + steps[j].attackerPos;
                        if (curKey !== firstKey) break;
                        rangedGroup.push(steps[j]);
                        j++;
                    }
                    debugLog(`  ▶ ranged #${idx}: 飞刀 ×${rangedGroup.length} (来自 ${step.attackerName})`);
                    await rangedAttackAnim(rangedGroup);
                    i = j - 1;
                } else {
                    const attackGroup = [step];
                    let j = i + 1;
                    while (j < steps.length && steps[j].type === 'attack' && !steps[j].isRanged &&
                           steps[j].attackerOwnerId === step.attackerOwnerId &&
                           steps[j].attackerPos === step.attackerPos) {
                        attackGroup.push(steps[j]);
                        j++;
                    }

                    const firstDefKey = step.defenderOwnerId + ':' + step.defenderPos;
                    const allSameTarget = attackGroup.every(s => (s.defenderOwnerId + ':' + s.defenderPos) === firstDefKey);

                    if (allSameTarget) {
                        debugLog(`  ▶ multi-hit #${idx}: ${step.attackerName}→${step.defenderName} ×${attackGroup.length}`);
                        await multiHitAnim(attackGroup);
                        i = j - 1;
                    } else {
                        debugLog(`  ▶ aoe #${idx}: ${step.attackerName}→${attackGroup.map(s => s.defenderName).join(',')}`);
                        await aoeAttackAnim(step.attackerOwnerId, step.attackerPos, step.attackerName, attackGroup);
                        i = j - 1;
                    }
                    await new Promise(r => setTimeout(r, 380));
                }
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

                if (step.generator === 'bifang' || step.generator === 'shawujing' || step.generator === 'weapon_attack') {
                    if (myId && step.playerId === myId) {
                        const gameState = getGameState();
                        const my = gameState?.players?.[myId];
                        const hand = my?.hand;
                        if (hand) {
                            const validCount = hand.filter(h => h && (h.cardId || h.card_id)).length;
                            if (validCount < 15) {
                                const newCard = {
                                    instanceId: 'cons-' + Date.now() + '-' + Math.random(),
                                    card_id: step.card_id || 'unknown',
                                    name: step.cardName || '消耗牌',
                                    type: 'consumable',
                                    rarity: step.rarity || 'Common',
                                    isConsumable: true,
                                    atk: 0, hp: 0, shield: 0, chi: 0, star: 0, faction: '',
                                    tempAtk: 0, tempHp: 0, tempShield: 0,
                                    weapon: null, item1: null, item2: null
                                };
                                const emptyIdx = hand.findIndex(h => !h || !h.card_id);
                                if (emptyIdx !== -1) hand[emptyIdx] = newCard;
                                else hand.push(newCard);
                                if (window.YYCardShop?.renderHand) window.YYCardShop.renderHand();
                            }
                        }
                    }
                    await new Promise(r => setTimeout(r, 200));
                    continue;
                }

                if (myId && step.playerId === myId) {
                    const gameState = getGameState();
                    const my = gameState?.players?.[myId];
                    const hand = my?.hand;
                    if (!hand) continue;
                    const validCount = hand.filter(h => h && (h.cardId || h.card_id)).length;
                    if (validCount >= 15) continue;

                    if (step.generator === 'spirit_loot') {
                        const newCard = {
                            instanceId: 'loot-' + Date.now() + '-' + Math.random(),
                            cardId: 'token_spirit_loot',
                            card_id: 'token_spirit_loot',
                            name: step.cardName || '亡魂碎片',
                            type: 'loot',
                            rarity: 'Common',
                            faction: '中立',
                            atk: step.lootAtk || 0,
                            hp: step.lootHp || 0,
                            baseAtk: step.lootAtk || 0,
                            baseHp: step.lootHp || 0,
                            star: 0,
                            shield: 0,
                            chi: 0,
                            image: '/assets/card/daodun1.png',
                            weapon: null,
                            item1: null,
                            item2: null,
                            equipment: { weapon: null, items: [null, null] },
                            enlightenmentCount: 0,
                            tempAtk: 0,
                            tempHp: 0,
                            tempShield: 0
                        };
                        const emptyIdx = hand.findIndex(h => !h || !h.card_id);
                        if (emptyIdx !== -1) hand[emptyIdx] = newCard;
                        else hand.push(newCard);
                        if (window.YYCardShop?.renderHand) window.YYCardShop.renderHand();
                        await new Promise(r => setTimeout(r, 100));
                    } else if (step.sourceCard === '女娲' && step.cardName && step.card_id) {
                        const newCard = {
                            instanceId: 'gen-' + Date.now() + '-' + Math.random(),
                            cardId: step.card_id,
                            card_id: step.card_id,
                            name: step.cardName,
                            type: 'character',
                            rarity: step.rarity || 'Common',
                            faction: '中立',
                            atk: step.atk || 0,
                            hp: step.hp || 0,
                            baseAtk: step.atk || 0,
                            baseHp: step.hp || 0,
                            star: 0,
                            shield: 0,
                            chi: 0,
                            image: step.image || `/assets/card/${step.card_id}.png`,
                            weapon: null,
                            item1: null,
                            item2: null,
                            equipment: { weapon: null, items: [null, null] },
                            enlightenmentCount: 0,
                            tempAtk: 0,
                            tempHp: 0,
                            tempShield: 0
                        };
                        const emptyIdx = hand.findIndex(h => !h || !h.card_id);
                        if (emptyIdx !== -1) hand[emptyIdx] = newCard;
                        else hand.push(newCard);
                        if (window.YYCardShop?.renderHand) window.YYCardShop.renderHand();
                        await new Promise(r => setTimeout(r, 400));
                    } else {
                        const rarity = step.rarity || 'Common';
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
                        }
                        await new Promise(r => setTimeout(r, 400));
                    }
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

        if (window.YYCardRender && typeof window.YYCardRender.renderBoard === 'function') {
            const rawBoard = Array.isArray(oppBoardData) ? oppBoardData.slice(0, 6) : [];
            while (rawBoard.length < 6) rawBoard.push(null);
            const displayBoard = [rawBoard[3], rawBoard[4], rawBoard[5], rawBoard[0], rawBoard[1], rawBoard[2]];
            window.YYCardRender.renderBoard('enemy-board', displayBoard, false);
        } else {
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
                    const display = getCardDisplay(c);
                    const el = document.createElement('div');
                    el.className = 'card';
                    el.setAttribute('data-rarity', c.rarity || 'Common');
                    el.setAttribute('data-star', c.star || 0);
                    const totalAtk = (c.atk || 0) + (c.tempAtk || 0);
                    const totalHp = (c.hp || 0) + (c.tempHp || 0);
                    el.innerHTML = `
                        <div class="card-frame"></div>
                        <div class="card-icon"><img src="${display.image}" alt="${display.name}" onerror="this.src='/assets/default-avatar.png'"></div>
                        <div class="card-name">${display.name}</div>
                        <div class="card-stats"><span class="card-atk">${totalAtk}</span><span class="card-hp">${totalHp}</span></div>
                    `;
                    if (c.shield > 0 || (c.tempShield || 0) > 0) {
                        const shieldDiv = document.createElement('div');
                        shieldDiv.className = 'card-shield';
                        shieldDiv.innerHTML = `<span>${c.shield || c.tempShield || 0}</span>`;
                        el.appendChild(shieldDiv);
                    }
                    const img = el.querySelector('img');
                    if (img) img.draggable = false;
                    slot.appendChild(el);
                } else {
                    slot.innerHTML = '<div class="card empty-slot">⬤</div>';
                }
                enemyBoard.appendChild(slot);
            }
        }

        enemyBoard.setAttribute('data-player-id', oppId);
        debugLog(`🔧 敌方棋盘已渲染，对手ID: ${oppId.slice(0,8)}`);
    }

    async function resolveBattles(gameState, onComplete) {
        if (!gameState?.players) { onComplete?.(); return; }

        isAnimating = false;
        abortFlag = false;
        const myId = window.YYCardAuth?.currentUser?.id;
        clearDebug();
        debugLog('🔍 ====== 结算开始 (使用已缓存数据) ======');

        await loadCardConfig();

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
    loadCardConfig();

    return {
        resolveBattles,
        abortAnimation: () => { abortFlag = true; },
        isAnimating: () => isAnimating
    };
})();

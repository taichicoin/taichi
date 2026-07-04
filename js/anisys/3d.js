// ==================== 3D 武器系统 (3d.js) ====================
window.YYCardCombat3D = (function() {
    let ready = false;
    let threeModule = null;
    let swordGLB = null;
    let daggerGLB = null;
    let scene, camera, renderer;

    const SWORD_Z_OFFSET = 0;
    const EMOJI_DAGGER_ANGLE_OFFSET = -135;

    // 卡牌配置（从 image.json 加载，由外部 combat 初始化时传入）
    let cardConfig = {};

    function setCardConfig(cfg) {
        cardConfig = cfg || {};
    }

    function isReady() {
        return ready;
    }

    // 初始化 Three.js
    async function init() {
        if (ready) return;
        try {
            const THREE = await import('three');
            const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
            threeModule = THREE;

            scene = new THREE.Scene();
            camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
            camera.position.z = 8;

            renderer = new THREE.WebGLRenderer({ alpha: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setClearColor(0x000000, 0);
            const canvas = renderer.domElement;
            canvas.id = 'combat-3d-canvas';
            canvas.style.position = 'fixed';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '9999';
            document.body.appendChild(canvas);

            scene.add(new THREE.AmbientLight(0xffffff, 0.8));
            const dir = new THREE.DirectionalLight(0xffffff, 0.6);
            dir.position.set(1, 1, 1);
            scene.add(dir);

            function animate() {
                requestAnimationFrame(animate);
                renderer.render(scene, camera);
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
            swordGLB = swordGltf.scene;
            const swordBox = new THREE.Box3().setFromObject(swordGLB);
            const swordSize = new THREE.Vector3();
            swordBox.getSize(swordSize);
            const swordTargetHeight = 0.003;
            const swordScale = swordTargetHeight / (swordSize.y || 1);
            swordGLB.scale.set(swordScale, swordScale, swordScale);

            if (daggerGltf) {
                daggerGLB = daggerGltf.scene;
                const daggerBox = new THREE.Box3().setFromObject(daggerGLB);
                const daggerSize = new THREE.Vector3();
                daggerBox.getSize(daggerSize);
                const daggerTargetHeight = 0.03;
                const daggerScale = daggerTargetHeight / (daggerSize.y || 1);
                daggerGLB.scale.set(daggerScale, daggerScale, daggerScale);
            }

            ready = true;
            return true;
        } catch (e) {
            console.error('3D 武器初始化失败:', e);
            ready = false;
            return false;
        }
    }

    // DOM 坐标转世界坐标
    function domToWorld(el) {
        const THREE = threeModule;
        if (!el || !THREE) return new THREE.Vector3(0,0,0);
        const rect = el.getBoundingClientRect();
        const x = (rect.left + rect.width/2) / window.innerWidth * 2 - 1;
        const y = -(rect.top + rect.height/2) / window.innerHeight * 2 + 1;
        const vec = new THREE.Vector3(x, y, 0.5);
        vec.unproject(camera);
        return vec;
    }

    // 生成旋转矩阵（剑尖方向）
    function makeSwordRotation(tipDir, faceDir) {
        const THREE = threeModule;
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

    // 长矛插入目标卡牌动画
    function insertWeaponIntoCard(defEl, isEnemy) {
        return new Promise(resolve => {
            const THREE = threeModule;
            if (!ready || !THREE || !defEl || !swordGLB) return resolve();

            const weapon = swordGLB.clone();
            const rect = defEl.getBoundingClientRect();

            const startEdgeY = isEnemy ? rect.top : rect.bottom;
            const endEdgeY = isEnemy ? rect.bottom : rect.top;
            const centerX = rect.left + rect.width / 2;

            const toWorld = (edgeY) => {
                const x_ndc = (centerX / window.innerWidth) * 2 - 1;
                const y_ndc = -(edgeY / window.innerHeight) * 2 + 1;
                const vec = new THREE.Vector3(x_ndc, y_ndc, 0.5);
                vec.unproject(camera);
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

            scene.add(weapon);

            const duration = 100; // 0.1秒
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
                    if (weapon.parent) scene.remove(weapon);
                    resolve();
                }
            }
            requestAnimationFrame(animate);

            setTimeout(() => {
                if (!done) {
                    done = true;
                    if (weapon.parent) scene.remove(weapon);
                    resolve();
                }
            }, 200); // 超时保护
        });
    }

    // 在卡牌位置生成武器模型（剑或匕首）
    function spawnWeaponOnCard(cardEl, isEnemy, model = null) {
        const THREE = threeModule;
        if (!ready || !THREE) return null;
        const weaponModel = model || swordGLB;
        if (!weaponModel) return null;
        const weapon = weaponModel.clone();

        const rect = cardEl.getBoundingClientRect();
        const edgeY = isEnemy ? rect.bottom : rect.top;
        const edgeX = rect.left + rect.width / 2;
        const x_ndc = (edgeX / window.innerWidth) * 2 - 1;
        const y_ndc = -(edgeY / window.innerHeight) * 2 + 1;
        const edgeWorld = new THREE.Vector3(x_ndc, y_ndc, 0.5);
        edgeWorld.unproject(camera);
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

        scene.add(weapon);
        return weapon;
    }

    // 武器飞行（暂时保留空实现，以备后用）
    function flyWeaponToTarget(weapon, startPos, defEl, isEnemy) {
        return Promise.resolve();
    }

    return {
        init,
        isReady,
        setCardConfig,
        spawnWeaponOnCard,
        insertWeaponIntoCard,
        flyWeaponToTarget,
        domToWorld,
        makeSwordRotation,
        // 暴露常量供外部使用（如飞刀角度）
        EMOJI_DAGGER_ANGLE_OFFSET,
    };
})();

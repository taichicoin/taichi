// ==================== 玩家头像状态栏渲染（纯内联样式，不依赖任何外部CSS） ====================
window.YYCardPlayerRender = (function() {

    function renderPlayerStatus() {
        const container = document.getElementById('player-status-list');
        if (!container) return;

        const myId = window.YYCardAuth?.currentUser?.id;
        const gameState = window.YYCardBattle?.getGameState();
        const players = gameState?.players;
        if (!players) return;

        const pairs = gameState.battlePairs || [];
        const myPair = pairs.find(p => p.p1 === myId || p.p2 === myId);
        let opponentId = null;
        let iAmFirstMover = false;
        let opponentIsFirstMover = false;
        if (myPair) {
            opponentId = myPair.p1 === myId ? myPair.p2 : myPair.p1;
            if (myPair.firstMover === 'p1') {
                iAmFirstMover = (myPair.p1 === myId);
                opponentIsFirstMover = !iAmFirstMover;
            } else if (myPair.firstMover === 'p2') {
                iAmFirstMover = (myPair.p2 === myId);
                opponentIsFirstMover = !iAmFirstMover;
            }
        }

        // 清空容器
        container.innerHTML = '';
        const fragment = document.createDocumentFragment();

        // 先确保外层容器样式正确（如果 battle.css 干扰，强制内联覆盖）
        const bar = container.closest('.players-status-bar');
        if (bar) {
            bar.style.position = 'fixed';
            bar.style.top = '7vh';
            bar.style.left = '2vw';
            bar.style.zIndex = '99';
            bar.style.width = '9.1vw';
            bar.style.height = '35.5vh';
            bar.style.padding = '0';
            bar.style.border = 'none';
            bar.style.boxShadow = 'none';
            bar.style.overflowY = 'auto';
            // 战斗模式偏移
            if (document.body.classList.contains('battle-view-mode')) {
                bar.style.left = '0.8vw';
                bar.style.width = '9.1vw';
            }
        }

        const orderedIds = Object.keys(players).sort((a, b) => {
            if (a === myId) return -1;
            if (b === myId) return 1;
            return 0;
        });

        orderedIds.forEach(pid => {
            const p = players[pid];
            if (!p) return;

            const item = document.createElement('div');
            item.className = 'player-status-item';
            // 内联样式确保 item 占满宽度，flex 布局等比例
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.justifyContent = 'center';
            item.style.position = 'relative';
            item.style.width = '100%';
            item.style.flex = '1';

            const avatarUrl = p.avatar || '/assets/default-avatar.png';
            const health = p.health || 0;
            const level = p.shopLevel || 1;

            // 头像容器
            const avatarContainer = document.createElement('div');
            avatarContainer.className = 'avatar-container';
            avatarContainer.style.position = 'relative';
            avatarContainer.style.width = '100%';
            avatarContainer.style.aspectRatio = '1/1';
            avatarContainer.style.maxHeight = '100%';
            avatarContainer.style.flexShrink = '0';
            avatarContainer.style.borderBottom = '0.3vh solid #ffffff';

            // 头像图片
            const img = document.createElement('img');
            img.src = avatarUrl;
            img.alt = 'avatar';
            img.onerror = function() { this.src = '/assets/default-avatar.png'; };
            img.style.display = 'block';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.borderRadius = '0';
            img.style.border = '1px solid #f5d76e';
            img.style.background = '#2a3a5c';
            img.style.objectFit = 'cover';

            // 等级标签
            const levelSpan = document.createElement('span');
            levelSpan.className = 'player-level';
            levelSpan.textContent = 'Lv' + level;
            levelSpan.style.position = 'absolute';
            levelSpan.style.top = '0.1vh';
            levelSpan.style.left = '0.1vw';
            levelSpan.style.background = '#1a2a4a';
            levelSpan.style.border = '1px solid #f5d76e';
            levelSpan.style.borderRadius = '50%';
            levelSpan.style.width = '4.2vw';
            levelSpan.style.height = '4.2vw';
            levelSpan.style.display = 'flex';
            levelSpan.style.alignItems = 'center';
            levelSpan.style.justifyContent = 'center';
            levelSpan.style.fontSize = '1.8vw';
            levelSpan.style.fontWeight = 'bold';
            levelSpan.style.color = '#f5d76e';
            levelSpan.style.zIndex = '2';
            levelSpan.style.padding = '0';
            levelSpan.style.lineHeight = '1';

            // 血量数字
            const hpSpan = document.createElement('span');
            hpSpan.className = 'hp-text';
            hpSpan.textContent = health;
            hpSpan.style.position = 'absolute';
            hpSpan.style.bottom = '0';
            hpSpan.style.right = '0.2vw';
            hpSpan.style.width = '43%';
            hpSpan.style.height = '36%';
            hpSpan.style.display = 'flex';
            hpSpan.style.alignItems = 'flex-end';
            hpSpan.style.justifyContent = 'flex-end';
            hpSpan.style.fontSize = '3vw';
            hpSpan.style.fontWeight = 'bold';
            hpSpan.style.color = '#1a1a2e';
            hpSpan.style.textAlign = 'right';
            hpSpan.style.clipPath = 'polygon(28% 0%, 100% 0%, 100% 100%, 0% 100%)';
            hpSpan.style.background = '#ffffff';
            hpSpan.style.zIndex = '2';
            hpSpan.style.lineHeight = '1';
            hpSpan.style.textShadow = 'none';

            avatarContainer.appendChild(img);
            avatarContainer.appendChild(levelSpan);
            avatarContainer.appendChild(hpSpan);

            // 先/后手标记
            if (pid === myId || pid === opponentId) {
                let isFirst = false;
                if (pid === myId) {
                    isFirst = iAmFirstMover;
                } else {
                    isFirst = opponentIsFirstMover;
                }
                const markText = isFirst ? '先' : '后';
                const markBg = isFirst ? '#e94560' : '#3b82f6';
                const markSpan = document.createElement('span');
                markSpan.textContent = markText;
                markSpan.style.position = 'absolute';
                markSpan.style.top = '0.1vh';
                markSpan.style.right = '0.1vw';
                markSpan.style.background = markBg;
                markSpan.style.color = 'white';
                markSpan.style.borderRadius = '50%';
                markSpan.style.width = '4.2vw';
                markSpan.style.height = '4.2vw';
                markSpan.style.display = 'flex';
                markSpan.style.alignItems = 'center';
                markSpan.style.justifyContent = 'center';
                markSpan.style.fontSize = '2.2vw';
                markSpan.style.fontWeight = 'bold';
                markSpan.style.zIndex = '2';
                markSpan.style.lineHeight = '1';
                markSpan.style.border = '1px solid #fff';
                avatarContainer.appendChild(markSpan);
            }

            item.appendChild(avatarContainer);
            fragment.appendChild(item);
        });

        container.appendChild(fragment);
    }

    return { renderPlayerStatus };
})();

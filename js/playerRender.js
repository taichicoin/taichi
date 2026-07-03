// ==================== 玩家头像状态栏渲染（样式内联版） ====================
window.YYCardPlayerRender = (function() {
    // 样式注入（只注入一次）
    let stylesInjected = false;
    function injectStyles() {
        if (stylesInjected) return;
        stylesInjected = true;
        const style = document.createElement('style');
        style.textContent = `
            /* ===== 玩家头像状态栏样式 ===== */
            .players-status-bar {
                position: fixed;
                top: 7vh !important;
                left: 2vw;
                z-index: 99;
                width: 9.1vw;
                border-radius: 0;
                padding: 0vh 0.1vw;
                border: 1px solid rgba(255, 215, 0, 0);
                box-shadow: 0 4px 10px rgba(0,0,0,0);
                height: 35.5vh;
                overflow-y: auto;
            }
            .battle-view-mode .players-status-bar {
                width: 9.1vw;
                left: 0.8vw;
            }
            .player-status-list {
                display: flex;
                flex-direction: column;
                gap: 0.1vh !important;
                width: 100%;
                height: 100%;
            }
            .player-status-item {
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                width: 100%;
                flex: 1;
            }
            .avatar-container {
                position: relative;
                width: 100%;
                aspect-ratio: 1 / 1;
                max-height: 100%;
                flex-shrink: 0;
                border-bottom: 0.3vh solid #ffffff;
            }
            .avatar-container img {
                display: block !important;
                width: 100%;
                height: 100%;
                border-radius: 0;
                border: 1px solid #f5d76e;
                background: #2a3a5c;
                object-fit: cover;
            }
            .player-level {
                position: absolute;
                top: 0.1vh;
                left: 0.1vw;
                background: #1a2a4a;
                border: 1px solid #f5d76e;
                border-radius: 50%;
                width: 4.2vw;
                height: 4.2vw;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.8vw;
                font-weight: bold;
                color: #f5d76e;
                z-index: 2;
                padding: 0;
                line-height: 1;
            }
            .hp-text {
                position: absolute;
                bottom: 0vh !important;
                right: 0.2vw !important;
                width: 43%;
                height: 36%;
                display: flex;
                align-items: flex-end;
                justify-content: flex-end;
                padding: 0 0vw 0vh 0;
                font-size: 3vw;
                font-weight: bold;
                color: #1a1a2e;
                text-align: right;
                clip-path: polygon(28% 0%, 100% 0%, 100% 100%, 0% 100%);
                background: #ffffff;
                z-index: 2;
                line-height: 1;
                text-shadow: none;
            }
            .player-status-item > img,
            .player-status-item > .hp-bar,
            .player-status-item > .hp-fill {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    function renderPlayerStatus() {
        injectStyles(); // 确保样式存在

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

        container.innerHTML = '';
        const fragment = document.createDocumentFragment();

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
            item.setAttribute('data-player-id', pid);

            const avatarUrl = p.avatar || '/assets/default-avatar.png';
            const health = p.health || 0;
            const level = p.shopLevel || 1;

            let inner = `
                <div class="avatar-container">
                    <img src="${avatarUrl}" alt="avatar" onerror="this.src='/assets/default-avatar.png'">
                    <span class="player-level">Lv${level}</span>
                    <span class="hp-text">${health}</span>`;

            if (pid === myId || pid === opponentId) {
                let isFirst = false;
                if (pid === myId) {
                    isFirst = iAmFirstMover;
                } else {
                    isFirst = opponentIsFirstMover;
                }
                const markText = isFirst ? '先' : '后';
                const markBg = isFirst ? '#e94560' : '#3b82f6';
                inner += `<span style="
                    position: absolute;
                    top: 0.1vh;
                    right: 0.1vw;
                    background: ${markBg};
                    color: white;
                    border-radius: 50%;
                    width: 4.2vw;
                    height: 4.2vw;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 2.2vw;
                    font-weight: bold;
                    z-index: 2;
                    line-height: 1;
                    border: 1px solid #fff;
                ">${markText}</span>`;
            }

            inner += `</div>`;
            item.innerHTML = inner;
            fragment.appendChild(item);
        });

        container.appendChild(fragment);
    }

    return { renderPlayerStatus };
})();

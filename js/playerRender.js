// ==================== 玩家头像状态栏渲染 ====================
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

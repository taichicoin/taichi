// ==================== 匹配房间模块 ====================
window.YYCardCreateRoom = (function() {
    const auth = window.YYCardAuth;
    const matchmaking = window.YYCardMatchmaking;

    // 元素引用
    const matchRoomView = document.getElementById('match-room-view');
    const gameArea = document.getElementById('game-area');
    const enterBtn = document.getElementById('enter-match-room-btn');
    const backBtn = document.getElementById('back-to-lobby-btn');
    const startBtn = document.getElementById('start-match-btn');
    const cancelBtn = document.getElementById('cancel-match-btn');

    // 显示房间
    function showRoom() {
        // 如果正在战斗中，不允许进入
        const battleView = document.getElementById('battle-view');
        if (battleView && battleView.style.display !== 'none') {
            auth.log('正在对战中，无法进入匹配房间');
            return;
        }

        gameArea.style.display = 'none';
        matchRoomView.style.display = 'flex';
        document.querySelector('.bottom-nav')?.style?.setProperty('display', 'none');

        // 重置按钮状态（根据是否设置游戏ID）
        if (auth.currentProfile?.username) {
            startBtn.disabled = false;
            startBtn.textContent = '⚡ 开始匹配';
        } else {
            startBtn.disabled = true;
            startBtn.textContent = '请先设置游戏ID';
        }
        cancelBtn.style.display = 'none';
        document.getElementById('match-status').textContent = '';
        auth.log('📂 进入匹配房间');
    }

    // 隐藏房间（返回大厅）
    async function hideRoom() {
        // 如果正在匹配，先取消
        if (cancelBtn.style.display === 'inline-block') {
            auth.log('正在匹配中，自动取消...');
            await matchmaking.cancel();
        }
        matchRoomView.style.display = 'none';
        gameArea.style.display = 'block';
        document.querySelector('.bottom-nav')?.style?.setProperty('display', '');
        auth.log('📂 返回大厅');
    }

    // 绑定事件
    function bindEvents() {
        enterBtn.addEventListener('click', showRoom);
        backBtn.addEventListener('click', hideRoom);

        // 开始匹配按钮沿用 matchmaking 的 start
        startBtn.addEventListener('click', () => {
            if (matchmaking.start) matchmaking.start();
        });

        // 取消匹配按钮沿用 matchmaking 的 cancel
        cancelBtn.addEventListener('click', () => {
            if (matchmaking.cancel) matchmaking.cancel();
        });
    }

    // 当战斗开始时自动隐藏房间（可选）
    function onBattleEnter() {
        matchRoomView.style.display = 'none';
        gameArea.style.display = 'block';
        document.querySelector('.bottom-nav')?.style?.setProperty('display', '');
    }

    // 暴露 hideRoom 给外部调用（比如离开战斗返回大厅时）
    function init() {
        bindEvents();
        // 如果 matchmaking 成功进入战斗会调用 YYCardBattle.enterBattle，
        // 可以在 enterBattle 内调用 onBattleEnter 隐藏房间。
        // 这里挂一个钩子，不影响原有逻辑。
        const origEnterBattle = window.YYCardBattle?.enterBattle;
        if (origEnterBattle) {
            window.YYCardBattle.enterBattle = function(roomId) {
                origEnterBattle(roomId);
                onBattleEnter();
            };
        } else {
            // 如果 battle 模块晚于本模块加载，可以在 battle.js 中调用
            window.__createRoomOnBattleEnter = onBattleEnter;
        }
    }

    return { init, showRoom, hideRoom, onBattleEnter };
})();

// ==================== 匹配房间模块 ====================
window.YYCardCreateRoom = (function() {
    const auth = window.YYCardAuth;
    const matchmaking = window.YYCardMatchmaking;

    const matchRoomView = document.getElementById('match-room-view');
    const gameArea = document.getElementById('game-area');
    const enterBtn = document.getElementById('enter-match-room-btn');
    const backBtn = document.getElementById('back-to-lobby-btn');
    const startBtn = document.getElementById('start-match-btn');
    const cancelBtn = document.getElementById('cancel-match-btn');
    const bottomNav = document.querySelector('.bottom-nav');

    // 显示房间
    function showRoom() {
        const battleView = document.getElementById('battle-view');
        if (battleView && battleView.style.display !== 'none') {
            auth.log('正在对战中，无法进入匹配房间');
            return;
        }
        gameArea.style.display = 'none';
        matchRoomView.style.display = 'flex';
        if (bottomNav) bottomNav.style.display = 'none';

        // 根据是否有游戏ID重置按钮状态
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
        if (cancelBtn.style.display === 'inline-block' && matchmaking?.cancel) {
            auth.log('正在匹配中，自动取消...');
            await matchmaking.cancel();
        }
        matchRoomView.style.display = 'none';
        gameArea.style.display = 'block';
        if (bottomNav) bottomNav.style.display = '';       // 回到大厅，显示导航
        auth.log('📂 返回大厅');
    }

    // 战斗开始时自动隐藏房间 + 隐藏底部导航
    function onBattleEnter() {
        matchRoomView.style.display = 'none';
        gameArea.style.display = 'none';                   // 战斗是全屏的，大厅也要隐藏
        if (bottomNav) bottomNav.style.display = 'none';   // ★ 关键：战斗时不显示导航
        auth.log('⚔️ 进入战斗，已退出匹配房间');
    }

    // 绑定事件 + 初始化钩子
    function init() {
        if (!enterBtn || !backBtn || !startBtn || !cancelBtn) {
            console.error('匹配房间元素缺失，初始化失败');
            return;
        }
        enterBtn.onclick = showRoom;
        backBtn.onclick = hideRoom;
        startBtn.onclick = () => matchmaking?.start();
        cancelBtn.onclick = () => matchmaking?.cancel();

        // 钩子：战斗模块进入战斗时自动处理
        const origEnterBattle = window.YYCardBattle?.enterBattle;
        if (origEnterBattle) {
            window.YYCardBattle.enterBattle = function(roomId) {
                origEnterBattle.call(window.YYCardBattle, roomId);
                onBattleEnter();
            };
        } else {
            window.__createRoomOnBattleEnter = onBattleEnter;
        }
    }

    return { init, showRoom, hideRoom, onBattleEnter };
})();

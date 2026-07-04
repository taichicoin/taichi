// /js/createRoom.js (完整整合版，替换原文件)
window.YYCardCreateRoom = (function() {
    const auth = window.YYCardAuth;
    const matchmaking = window.YYCardMatchmaking;

    // DOM 元素（在 init 中赋值，确保已加载）
    let matchRoomView, gameArea, battleView, bottomNav;
    let enterBtn, backBtn, startBtn, cancelBtn;
    let statusEl, timerEl, onlineCountEl;
    let matchAvatar, playerNameEl, playerRankEl;

    // 状态机
    const ROOM_STATE = { IDLE: 'idle', READY: 'ready', MATCHING: 'matching', FOUND: 'found', BATTLE: 'battle' };
    let roomState = ROOM_STATE.IDLE;

    // 匹配计时
    let matchSeconds = 0;
    let timerInterval = null;
    let onlineCount = 0;

    // 保存原始战斗入口，避免递归
    let originalEnterBattle = null;

    // 防抖锁
    let actionLock = false;

    // ==================== UI 工具 ====================
    function setStatus(text) {
        if (statusEl) statusEl.textContent = text;
    }

    function setState(state) {
        roomState = state;
        if (matchRoomView) {
            matchRoomView.classList.remove('idle', 'matching', 'found', 'battle');
            matchRoomView.classList.add(state);
        }
    }

    function showStartButton(show) {
        if (startBtn) startBtn.style.display = show ? 'block' : 'none';
    }

    function showCancelButton(show) {
        if (cancelBtn) cancelBtn.style.display = show ? 'block' : 'none';
    }

    function lockUI(lock) {
        if (startBtn) startBtn.disabled = lock;
    }

    // ==================== 玩家信息 ====================
    function updatePlayerInfo() {
        const name = auth?.currentProfile?.username || '未命名玩家';
        if (playerNameEl) playerNameEl.textContent = name;
        if (matchAvatar && auth?.currentProfile?.avatar_url) {
            matchAvatar.src = auth.currentProfile.avatar_url;
        }
    }

    // ==================== 在线人数 ====================
    function updateOnlineCount() {
        onlineCount = Math.floor(1200 + Math.random() * 800);
        if (onlineCountEl) onlineCountEl.textContent = onlineCount;
    }

    // ==================== 计时器 ====================
    function startTimer() {
        stopTimer();
        matchSeconds = 0;
        if (timerEl) timerEl.style.display = 'block';
        timerInterval = setInterval(() => {
            matchSeconds++;
            if (timerEl) {
                timerEl.textContent = matchSeconds < 10 ? `00:0${matchSeconds}` : `00:${matchSeconds}`;
            }
            if (matchSeconds === 3) setStatus('正在寻找对手...');
            if (matchSeconds === 6) setStatus('匹配范围扩大...');
            if (matchSeconds === 10) setStatus('等待其他玩家进入...');
            if (matchSeconds > 15) setStatus('正在匹配高活跃玩家...');
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (timerEl) timerEl.style.display = 'none';
    }

    // ==================== 匹配操作 ====================
    async function startMatch() {
        if (roomState !== ROOM_STATE.READY) return;
        setState(ROOM_STATE.MATCHING);
        showStartButton(false);
        showCancelButton(true);
        setStatus('正在匹配对手...');
        startTimer();
        updateOnlineCount();
        updatePlayerInfo();
        lockUI(true);
        if (matchRoomView) matchRoomView.classList.add('matching');
        if (matchmaking?.start) matchmaking.start();
    }

    async function cancelMatch() {
        if (roomState !== ROOM_STATE.MATCHING) return;
        setStatus('已取消匹配');
        stopTimer();
        setState(ROOM_STATE.READY);
        showStartButton(true);
        showCancelButton(false);
        lockUI(false);
        if (matchRoomView) matchRoomView.classList.remove('matching');
        if (matchmaking?.cancel) await matchmaking.cancel();
    }

    // ==================== 匹配成功 & 战斗过渡 ====================
    function playMatchSuccessFX() {
        if (matchRoomView && matchRoomView.dataset.fxPlayed === '1') return;
        if (matchRoomView) matchRoomView.dataset.fxPlayed = '1';
        const flash = document.createElement('div');
        flash.style.cssText = 'position:fixed;inset:0;background:white;opacity:0;z-index:9999;transition:opacity 0.2s';
        document.body.appendChild(flash);
        requestAnimationFrame(() => { flash.style.opacity = '0.9'; });
        setTimeout(() => { flash.style.opacity = '0'; }, 120);
        setTimeout(() => flash.remove(), 400);
    }

    function enterBattleTransition(roomId) {
        setState(ROOM_STATE.BATTLE);
        stopTimer();
        if (matchRoomView) {
            matchRoomView.style.transition = 'all 0.6s ease';
            matchRoomView.style.transform = 'scale(1.08)';
            matchRoomView.style.opacity = '0';
        }
        setTimeout(() => {
            if (matchRoomView) {
                matchRoomView.style.display = 'none';
                matchRoomView.style.transform = 'scale(1)';
                matchRoomView.style.opacity = '1';
            }
            if (gameArea) gameArea.style.display = 'none';
            if (bottomNav) bottomNav.style.display = 'none';
            // 调用原始战斗入口（避免递归）
            if (originalEnterBattle) {
                originalEnterBattle(roomId);
            } else if (window.YYCardBattle?.enterBattle) {
                window.YYCardBattle.enterBattle(roomId);
            }
            auth?.log?.('⚔️ 进入战斗场景');
        }, 600);
    }

    function onMatchSuccess(roomId) {
        if (roomState !== ROOM_STATE.MATCHING) return;
        setState(ROOM_STATE.FOUND);
        setStatus('⚡ 匹配成功！');
        stopTimer();
        showCancelButton(false);
        playMatchSuccessFX();
        if (matchRoomView) {
            matchRoomView.classList.remove('matching');
            matchRoomView.classList.add('found');
        }
        setTimeout(() => {
            enterBattleTransition(roomId);
        }, 900);
    }

    // ==================== 安全包装（防抖） ====================
    function safeStartMatch() {
        if (actionLock) return;
        actionLock = true;
        startMatch();
        setTimeout(() => { actionLock = false; }, 1000);
    }

    async function safeCancelMatch() {
        if (actionLock) return;
        actionLock = true;
        await cancelMatch();
        setTimeout(() => { actionLock = false; }, 800);
    }

    // ==================== 房间显示/隐藏 ====================
    function showRoom() {
        if (battleView && battleView.style.display !== 'none') {
            auth?.log?.('正在对战中，无法进入匹配房间');
            return;
        }
        if (gameArea) gameArea.style.display = 'none';
        if (matchRoomView) matchRoomView.style.display = 'flex';
        if (bottomNav) bottomNav.style.display = 'none';
        setState(ROOM_STATE.READY);
        matchSeconds = 0;
        setStatus('准备开始匹配');
        showStartButton(true);
        showCancelButton(false);
        lockUI(false);
        if (startBtn) {
            startBtn.textContent = auth?.currentProfile?.username ? '⚡ 开始匹配' : '请先设置游戏ID';
            startBtn.disabled = !auth?.currentProfile?.username;
        }
        if (matchRoomView) matchRoomView.dataset.fxPlayed = '0';
        updateOnlineCount();
        updatePlayerInfo();
    }

    async function hideRoom() {
        if (roomState === ROOM_STATE.MATCHING && matchmaking?.cancel) {
            await matchmaking.cancel();
        }
        stopTimer();
        if (matchRoomView) matchRoomView.style.display = 'none';
        if (gameArea) gameArea.style.display = 'block';
        if (bottomNav) bottomNav.style.display = '';
        setState(ROOM_STATE.IDLE);
    }

    // 心跳
    function startRoomHeartbeat() {
        setInterval(() => {
            if (roomState === ROOM_STATE.MATCHING) updateOnlineCount();
        }, 3000);
    }

    // 销毁清理
    function destroyRoom() {
        stopTimer();
        if (matchRoomView) {
            matchRoomView.classList.remove('matching', 'found');
            matchRoomView.dataset.fxPlayed = '0';
        }
        setState(ROOM_STATE.IDLE);
    }

    // ==================== 初始化 ====================
    function init() {
        // 获取所有DOM元素
        matchRoomView = document.getElementById('match-room-view');
        gameArea = document.getElementById('game-area');
        battleView = document.getElementById('battle-view');
        bottomNav = document.querySelector('.bottom-nav');

        enterBtn = document.getElementById('enter-match-room-btn');
        backBtn = document.getElementById('back-to-lobby-btn');
        startBtn = document.getElementById('start-match-btn');
        cancelBtn = document.getElementById('cancel-match-btn');

        statusEl = document.getElementById('match-status');
        timerEl = document.getElementById('match-timer');
        onlineCountEl = document.getElementById('online-count');
        matchAvatar = document.getElementById('match-avatar');
        playerNameEl = document.getElementById('match-player-name');
        playerRankEl = document.querySelector('.player-rank');

        if (!enterBtn || !backBtn || !startBtn || !cancelBtn) {
            console.error('❌ 匹配房间关键元素缺失');
            return;
        }

        // 绑定事件
        enterBtn.onclick = showRoom;
        backBtn.onclick = hideRoom;
        startBtn.onclick = safeStartMatch;
        cancelBtn.onclick = safeCancelMatch;

        // 保存原始战斗入口，用于过渡动画安全调用
        if (window.YYCardBattle?.enterBattle) {
            originalEnterBattle = window.YYCardBattle.enterBattle;
            // 替换为带过渡动画的版本（任何地方调用 enterBattle 都会走房间退出动画）
            window.YYCardBattle.enterBattle = function(roomId) {
                // 如果当前在房间内，执行过渡；否则直接战斗
                if (roomState === ROOM_STATE.MATCHING || roomState === ROOM_STATE.FOUND || roomState === ROOM_STATE.READY) {
                    enterBattleTransition(roomId);
                } else {
                    originalEnterBattle(roomId);
                }
            };
        }

        updateOnlineCount();
        startRoomHeartbeat();
        setState(ROOM_STATE.IDLE);
        auth?.log?.('🎮 匹配房间模块初始化完成');
    }

    // 暴露API
    return {
        init,
        showRoom,
        hideRoom,
        onBattleEnter: enterBattleTransition,   // 兼容旧接口
        onMatchFound: onMatchSuccess,           // 匹配成功回调
        _debug: {
            getState: () => roomState,
            forceMatch: onMatchSuccess
        }
    };
})();

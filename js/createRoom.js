// /js/createRoom.js (最终稳定版 - 纯原生 display 控制)
window.YYCardCreateRoom = (function() {
    const auth = window.YYCardAuth;
    const matchmaking = window.YYCardMatchmaking;

    let matchRoomView, gameArea, battleView, bottomNav;
    let enterBtn, backBtn, startBtn, cancelBtn;
    let statusEl, timerEl, onlineCountEl;
    let matchAvatar, playerNameEl, playerRankEl;

    const ROOM_STATE = { IDLE: 'idle', READY: 'ready', MATCHING: 'matching', FOUND: 'found', BATTLE: 'battle' };
    let roomState = ROOM_STATE.IDLE;

    let matchSeconds = 0;
    let timerInterval = null;
    let onlineCount = 0;
    let originalEnterBattle = null;

    function setStatus(text) { if (statusEl) statusEl.textContent = text; }
    function setState(state) {
        roomState = state;
        if (matchRoomView) {
            matchRoomView.classList.remove('idle', 'matching', 'found', 'battle');
            matchRoomView.classList.add(state);
        }
    }
    function showStartButton(show) { if (startBtn) startBtn.style.display = show ? 'block' : 'none'; }
    function showCancelButton(show) { if (cancelBtn) cancelBtn.style.display = show ? 'block' : 'none'; }
    function lockUI(lock) { if (startBtn) startBtn.disabled = lock; }

    function updatePlayerInfo() {
        const name = auth?.currentProfile?.username || '未命名玩家';
        if (playerNameEl) playerNameEl.textContent = name;
        if (matchAvatar && auth?.currentProfile?.avatar_url) matchAvatar.src = auth.currentProfile.avatar_url;
    }
    function updateOnlineCount() {
        onlineCount = Math.floor(1200 + Math.random() * 800);
        if (onlineCountEl) onlineCountEl.textContent = onlineCount;
    }

    function startTimer() {
        stopTimer();
        matchSeconds = 0;
        if (timerEl) timerEl.style.display = 'block';
        timerInterval = setInterval(() => {
            matchSeconds++;
            if (timerEl) timerEl.textContent = matchSeconds < 10 ? `00:0${matchSeconds}` : `00:${matchSeconds}`;
            if (matchSeconds === 3) setStatus('正在寻找对手...');
            if (matchSeconds === 6) setStatus('匹配范围扩大...');
            if (matchSeconds === 10) setStatus('等待其他玩家进入...');
            if (matchSeconds > 15) setStatus('正在匹配高活跃玩家...');
        }, 1000);
    }
    function stopTimer() {
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (timerEl) timerEl.style.display = 'none';
    }

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
            if (originalEnterBattle) originalEnterBattle(roomId);
            else if (window.YYCardBattle?.enterBattle) window.YYCardBattle.enterBattle(roomId);
        }, 600);
    }

    function startMatch() { if (roomState === ROOM_STATE.READY) matchmaking.start(); }
    async function cancelMatch() { if (roomState === ROOM_STATE.MATCHING) await matchmaking.cancel(); }

    function showRoom() {
        if (battleView && battleView.style.display !== 'none') return;
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
        if (roomState === ROOM_STATE.MATCHING) await matchmaking.cancel();
        stopTimer();
        if (matchRoomView) matchRoomView.style.display = 'none';
        if (gameArea) gameArea.style.display = 'block';
        if (bottomNav) bottomNav.style.display = '';
        setState(ROOM_STATE.IDLE);
    }

    function startRoomHeartbeat() {
        setInterval(() => { if (roomState === ROOM_STATE.MATCHING) updateOnlineCount(); }, 3000);
    }

    function injectUICallbacks() {
        if (!matchmaking?.setUICallbacks) return;
        matchmaking.setUICallbacks({
            onStartMatching: () => {
                setState(ROOM_STATE.MATCHING);
                showStartButton(false);
                showCancelButton(true);
                setStatus('正在寻找对手...');
                startTimer();
                lockUI(true);
                if (matchRoomView) matchRoomView.classList.add('matching');
            },
            onCancelMatching: () => {
                stopTimer();
                setState(ROOM_STATE.READY);
                showStartButton(true);
                showCancelButton(false);
                lockUI(false);
                setStatus('准备开始匹配');
                if (matchRoomView) matchRoomView.classList.remove('matching');
            },
            onStatusUpdate: (text) => setStatus(text),
            onMatchFound: (roomId) => {
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
                setTimeout(() => enterBattleTransition(roomId), 900);
            },
            onCleanup: () => {
                stopTimer();
                setState(ROOM_STATE.READY);
                showStartButton(true);
                showCancelButton(false);
                lockUI(false);
                setStatus('准备开始匹配');
                if (matchRoomView) {
                    matchRoomView.classList.remove('matching', 'found');
                    matchRoomView.style.display = 'none';
                }
                if (gameArea) gameArea.style.display = 'block';
                if (bottomNav) bottomNav.style.display = '';
            }
        });
    }

    function init() {
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

        if (!enterBtn || !backBtn || !startBtn || !cancelBtn) return;

        enterBtn.onclick = showRoom;
        backBtn.onclick = hideRoom;
        startBtn.onclick = startMatch;
        cancelBtn.onclick = cancelMatch;

        if (window.YYCardBattle?.enterBattle) {
            originalEnterBattle = window.YYCardBattle.enterBattle;
            window.YYCardBattle.enterBattle = function(roomId) {
                if (roomState === ROOM_STATE.MATCHING || roomState === ROOM_STATE.FOUND || roomState === ROOM_STATE.READY) {
                    enterBattleTransition(roomId);
                } else originalEnterBattle(roomId);
            };
        }

        injectUICallbacks();
        updateOnlineCount();
        startRoomHeartbeat();
        setState(ROOM_STATE.IDLE);

        const clickSound = new Audio("/assets/mp3/wodedaodun.mp3");
        clickSound.volume = 0.5;
        document.addEventListener("click", function(e) {
            if (e.target.id === "start-match-btn") {
                clickSound.currentTime = 0;
                clickSound.play().catch(()=>{});
            }
        });

        auth?.log?.('🎮 匹配房间模块初始化完成');
    }

    return { init, showRoom, hideRoom, onBattleEnter: enterBattleTransition };
})();

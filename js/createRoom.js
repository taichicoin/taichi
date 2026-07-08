// /js/createRoom.js (配合解耦版 matchmaking，集中控制 UI —— 中英双语版)
window.YYCardCreateRoom = (function() {
    const auth = window.YYCardAuth;
    const matchmaking = window.YYCardMatchmaking;
    const L = window.YYCardLobbyLang;  // 大厅语言包

    // DOM 元素（延迟初始化）
    let matchRoomView, gameArea, battleView, bottomNav;
    let enterBtn, backBtn, startBtn, cancelBtn;
    let statusEl, timerEl, onlineCountEl;
    let matchAvatar, playerNameEl, playerRankEl;

    // 状态机
    const ROOM_STATE = { IDLE: 'idle', READY: 'ready', MATCHING: 'matching', FOUND: 'found', BATTLE: 'battle' };
    let roomState = ROOM_STATE.IDLE;

    // 计时器
    let matchSeconds = 0;
    let timerInterval = null;
    let onlineCount = 0;
    let actionLock = false;

    // 保存原始战斗入口
    let originalEnterBattle = null;

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

    function updatePlayerInfo() {
        const name = auth?.currentProfile?.username || L.t('room_no_name');
        if (playerNameEl) playerNameEl.textContent = name;
        if (matchAvatar && auth?.currentProfile?.avatar_url) {
            matchAvatar.src = auth.currentProfile.avatar_url;
        }
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
            if (timerEl) {
                timerEl.textContent = matchSeconds < 10 ? `00:0${matchSeconds}` : `00:${matchSeconds}`;
            }
            // 匹配中的文字变化
            if (matchSeconds === 3) setStatus(L.t('room_status_searching'));
            if (matchSeconds === 6) setStatus(L.t('room_status_expanding'));
            if (matchSeconds === 10) setStatus(L.t('room_status_waiting'));
            if (matchSeconds > 15) setStatus(L.t('room_status_high_active'));
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (timerEl) timerEl.style.display = 'none';
    }

    // ==================== 匹配成功动画及战斗过渡 ====================
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
            // 进入战斗
            if (originalEnterBattle) {
                originalEnterBattle(roomId);
            } else if (window.YYCardBattle?.enterBattle) {
                window.YYCardBattle.enterBattle(roomId);
            }
            auth?.log?.('⚔️ 进入战斗场景');
        }, 600);
    }

    // ==================== 匹配操作（调用 matchmaking） ====================
    function startMatch() {
        if (roomState !== ROOM_STATE.READY) return;
        matchmaking.start();
    }

    async function cancelMatch() {
        if (roomState !== ROOM_STATE.MATCHING) return;
        await matchmaking.cancel();
    }

    // ==================== 房间显示/隐藏 ====================
    function showRoom() {
        if (battleView && battleView.style.display !== 'none') {
            auth?.log?.(L.t('room_in_battle'));
            return;
        }
        if (gameArea) gameArea.style.display = 'none';
        if (matchRoomView) matchRoomView.style.display = 'flex';
        if (bottomNav) bottomNav.style.display = 'none';

        setState(ROOM_STATE.READY);
        matchSeconds = 0;
        setStatus(L.t('room_status_ready'));
        showStartButton(true);
        showCancelButton(false);
        lockUI(false);
        if (startBtn) {
            startBtn.textContent = auth?.currentProfile?.username
                ? L.t('match_btn_ready')   // '⚡ 开始匹配'
                : L.t('match_btn_no_id');   // '请先设置游戏ID'
            startBtn.disabled = !auth?.currentProfile?.username;
        }
        if (matchRoomView) matchRoomView.dataset.fxPlayed = '0';
        updateOnlineCount();
        updatePlayerInfo();
    }

    async function hideRoom() {
        if (roomState === ROOM_STATE.MATCHING) {
            await matchmaking.cancel();
        }
        stopTimer();
        if (matchRoomView) matchRoomView.style.display = 'none';
        if (gameArea) gameArea.style.display = 'block';
        // ★ 必须恢复为 flex，保持横向排列
        if (bottomNav) bottomNav.style.display = 'flex';
        setState(ROOM_STATE.IDLE);
    }

    // 心跳（模拟在线人数变化）
    function startRoomHeartbeat() {
        setInterval(() => {
            if (roomState === ROOM_STATE.MATCHING) updateOnlineCount();
        }, 3000);
    }

    // ==================== 注入 matchmaking 回调 ====================
    function injectUICallbacks() {
        if (!matchmaking || !matchmaking.setUICallbacks) return;
        matchmaking.setUICallbacks({
            onStartMatching: () => {
                setState(ROOM_STATE.MATCHING);
                showStartButton(false);
                showCancelButton(true);
                setStatus(L.t('room_status_searching'));
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
                setStatus(L.t('room_status_ready'));
                if (matchRoomView) matchRoomView.classList.remove('matching');
            },
            onStatusUpdate: (text) => {
                setStatus(text); // 此处 text 已经是外部传进来的翻译后文本，所以不需要再 t()
            },
            onMatchFound: (roomId) => {
                if (roomState !== ROOM_STATE.MATCHING) return;
                setState(ROOM_STATE.FOUND);
                setStatus(L.t('room_match_success'));
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
            },
            onCleanup: () => {
                stopTimer();
                setState(ROOM_STATE.READY);
                showStartButton(true);
                showCancelButton(false);
                lockUI(false);
                setStatus(L.t('room_match_failed'));
                if (matchRoomView) matchRoomView.classList.remove('matching', 'found');
            }
        });
    }

    // ==================== 初始化 ====================
    function init() {
        // 获取 DOM
        matchRoomView = document.getElementById('match-room-view');
        gameArea = document.getElementById('game-area');
        battleView = document.getElementById('battle-view');
        bottomNav = document.getElementById('yy-nav');

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
        startBtn.onclick = startMatch;
        cancelBtn.onclick = cancelMatch;

        // 保存原始战斗入口
        if (window.YYCardBattle?.enterBattle) {
            originalEnterBattle = window.YYCardBattle.enterBattle;
            window.YYCardBattle.enterBattle = function(roomId) {
                if (roomState === ROOM_STATE.MATCHING || roomState === ROOM_STATE.FOUND || roomState === ROOM_STATE.READY) {
                    enterBattleTransition(roomId);
                } else {
                    originalEnterBattle(roomId);
                }
            };
        }

        injectUICallbacks();
        updateOnlineCount();
        startRoomHeartbeat();
        setState(ROOM_STATE.IDLE);

        // ========== 匹配按钮音效 ==========
        const clickSound = new Audio("/assets/mp3/wodedaodun.mp3");
        clickSound.volume = 0.5;
        document.addEventListener("click", function(e) {
            if (e.target.id === "start-match-btn") {
                clickSound.currentTime = 0;
                clickSound.play().catch(() => {});
            }
        });

        auth?.log?.('🎮 匹配房间模块初始化完成');
    }

    return {
        init,
        showRoom,
        hideRoom,
        onBattleEnter: enterBattleTransition
    };
})();

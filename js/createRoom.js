// ==================== YY CARD 匹配房间（V2重构） ====================
window.YYCardCreateRoom = (function() {

    const auth = window.YYCardAuth;
    const matchmaking = window.YYCardMatchmaking;

    const matchRoomView = document.getElementById('match-room-view');
    const gameArea = document.getElementById('game-area');
    const battleView = document.getElementById('battle-view');

    const enterBtn = document.getElementById('enter-match-room-btn');
    const backBtn = document.getElementById('back-to-lobby-btn');
    const startBtn = document.getElementById('start-match-btn');
    const cancelBtn = document.getElementById('cancel-match-btn');
    const bottomNav = document.querySelector('.bottom-nav');

    const statusEl = document.getElementById('match-status');

    // ==================== 房间状态机 ====================
    const ROOM_STATE = {
        IDLE: "idle",          // 空闲
        READY: "ready",        // 已进入房间
        MATCHING: "matching",  // 匹配中
        FOUND: "found",        // 找到对手
        BATTLE: "battle"       // 进入战斗
    };

    let roomState = ROOM_STATE.IDLE;

    let matchTimer = null;
    let matchSeconds = 0;

    // ==================== UI工具 ====================
    function setStatus(text) {
        if (statusEl) statusEl.textContent = text;
    }

    function setState(state) {
        roomState = state;

        matchRoomView?.classList.remove("idle", "matching", "found", "battle");
        matchRoomView?.classList.add(state);

        auth?.log?.("房间状态 => " + state);
    }

    function showStartButton(show) {
        if (!startBtn) return;
        startBtn.style.display = show ? "block" : "none";
    }

    function showCancelButton(show) {
        if (!cancelBtn) return;
        cancelBtn.style.display = show ? "block" : "none";
    }

    function lockUI(lock) {
        if (startBtn) startBtn.disabled = lock;
    }

    // ==================== 进入房间 ====================
    function showRoom() {

        if (battleView && battleView.style.display !== 'none') {
            auth.log('正在对战中，无法进入匹配房间');
            return;
        }

        gameArea.style.display = 'none';
        matchRoomView.style.display = 'flex';

        if (bottomNav) bottomNav.style.display = 'none';

        setState(ROOM_STATE.READY);

        matchSeconds = 0;

        setStatus("准备开始匹配");

        showStartButton(true);
        showCancelButton(false);

        lockUI(false);

        startBtn.textContent = auth.currentProfile?.username
            ? "⚡ 开始匹配"
            : "请先设置游戏ID";

        startBtn.disabled = !auth.currentProfile?.username;

        auth.log('📂 进入匹配房间');
    }

    // ==================== 返回大厅 ====================
    async function hideRoom() {

        if (roomState === ROOM_STATE.MATCHING && matchmaking?.cancel) {
            auth.log('正在匹配中，自动取消...');
            await matchmaking.cancel();
        }

        stopTimer();

        matchRoomView.style.display = 'none';
        gameArea.style.display = 'block';

        if (bottomNav) bottomNav.style.display = '';

        setState(ROOM_STATE.IDLE);

        auth.log('📂 返回大厅');
    }

    // ==================== 战斗进入 ====================
    function onBattleEnter() {

        stopTimer();

        matchRoomView.style.display = 'none';
        gameArea.style.display = 'none';

        if (bottomNav) bottomNav.style.display = 'none';

        setState(ROOM_STATE.BATTLE);

        auth.log('⚔️ 进入战斗');
    }

    // ==================== 初始化 ====================
    function init() {

        if (!enterBtn || !backBtn || !startBtn || !cancelBtn) {
            console.error('匹配房间元素缺失，初始化失败');
            return;
        }

        enterBtn.onclick = showRoom;
        backBtn.onclick = hideRoom;

        startBtn.onclick = startMatch;
        cancelBtn.onclick = cancelMatch;

        // battle hook
        const origEnterBattle = window.YYCardBattle?.enterBattle;

        if (origEnterBattle) {
            window.YYCardBattle.enterBattle = function(roomId) {
                origEnterBattle.call(window.YYCardBattle, roomId);
                onBattleEnter();
            };
        } else {
            window.__createRoomOnBattleEnter = onBattleEnter;
        }

        setState(ROOM_STATE.IDLE);
        auth.log("🎮 匹配房间模块初始化完成");
    }

    return {
        init,
        showRoom,
        hideRoom,
        onBattleEnter
    };

})();
// ==================== 房间数据 ====================
let onlineCount = 0;
let timerInterval = null;

// ==================== 玩家信息渲染 ====================
function updatePlayerInfo() {
    const name = auth?.currentProfile?.username || "未命名玩家";

    const nameEl = document.getElementById("match-player-name");
    if (nameEl) nameEl.textContent = name;

    const avatarEl = document.querySelector(".match-avatar");
    if (avatarEl && auth?.currentProfile?.avatar_url) {
        avatarEl.src = auth.currentProfile.avatar_url;
    }
}

// ==================== 在线人数（模拟 + 可扩展） ====================
function updateOnlineCount() {

    // 👉 这里以后可以接 Supabase / websocket
    // 现在先做“游戏感模拟”

    onlineCount = Math.floor(1200 + Math.random() * 800);

    const el = document.getElementById("online-count");
    if (el) el.textContent = onlineCount;
}

// ==================== 匹配计时器 ====================
function startTimer() {

    stopTimer();

    matchSeconds = 0;

    timerInterval = setInterval(() => {

        matchSeconds++;

        const timerEl = document.getElementById("match-timer");

        if (timerEl) {
            timerEl.textContent = matchSeconds < 10
                ? `00:0${matchSeconds}`
                : `00:${matchSeconds}`;
        }

        // 🔥 匹配越久UI越“紧张”
        if (matchSeconds === 3) setStatus("正在寻找对手...");
        if (matchSeconds === 6) setStatus("匹配范围扩大...");
        if (matchSeconds === 10) setStatus("等待其他玩家进入...");
        if (matchSeconds > 15) setStatus("正在匹配高活跃玩家...");

    }, 1000);
}

// ==================== 停止计时 ====================
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// ==================== 开始匹配 ====================
function startMatch() {

    if (roomState !== ROOM_STATE.READY) return;

    setState(ROOM_STATE.MATCHING);

    showStartButton(false);
    showCancelButton(true);

    setStatus("正在匹配对手...");

    startTimer();

    updateOnlineCount();

    updatePlayerInfo();

    lockUI(true);

    // 🎬 房间进入“能量模式”
    matchRoomView.classList.add("matching");

    // 👉 调用真实匹配
    if (matchmaking?.start) {
        matchmaking.start();
    }
}

// ==================== 取消匹配 ====================
async function cancelMatch() {

    if (roomState !== ROOM_STATE.MATCHING) return;

    setStatus("已取消匹配");

    stopTimer();

    setState(ROOM_STATE.READY);

    showStartButton(true);
    showCancelButton(false);

    lockUI(false);

    matchRoomView.classList.remove("matching");

    if (matchmaking?.cancel) {
        await matchmaking.cancel();
    }
}

// ==================== 匹配成功（UI层） ====================
function onMatchFound() {

    stopTimer();

    setState(ROOM_STATE.FOUND);

    setStatus("⚡ 匹配成功！");

    matchRoomView.classList.add("found");

    showCancelButton(false);

    // 🌟 强反馈（下一段会做更炸的动画）
    setTimeout(() => {
        setStatus("即将进入战斗...");
    }, 1200);
}

// ==================== 房间动画心跳 ====================
function startRoomHeartbeat() {

    setInterval(() => {

        if (roomState === ROOM_STATE.MATCHING) {
            updateOnlineCount();
        }

    }, 3000);
}

// ==================== 暴露给外部 ====================
window.__YYCardRoom = {
    onMatchFound
};

// ==================== 匹配成功动画 ====================
function playMatchSuccessFX() {

    // 防重复触发
    if (matchRoomView.dataset.fxPlayed === "1") return;
    matchRoomView.dataset.fxPlayed = "1";

    // 整体闪白
    const flash = document.createElement("div");
    flash.style.position = "fixed";
    flash.style.inset = "0";
    flash.style.background = "white";
    flash.style.opacity = "0";
    flash.style.zIndex = "9999";
    flash.style.transition = "opacity 0.2s";

    document.body.appendChild(flash);

    requestAnimationFrame(() => {
        flash.style.opacity = "0.9";
    });

    setTimeout(() => {
        flash.style.opacity = "0";
    }, 120);

    setTimeout(() => {
        flash.remove();
    }, 400);
}

// ==================== 进入战斗过渡动画 ====================
function enterBattleTransition(roomId) {

    setState(ROOM_STATE.BATTLE);

    stopTimer();

    // 🔥 缩放退出
    matchRoomView.style.transition = "all 0.6s ease";
    matchRoomView.style.transform = "scale(1.08)";
    matchRoomView.style.opacity = "0";

    setTimeout(() => {

        matchRoomView.style.display = "none";
        matchRoomView.style.transform = "scale(1)";
        matchRoomView.style.opacity = "1";

        gameArea.style.display = "none";

        if (bottomNav) bottomNav.style.display = "none";

        // 👉 真正进入战斗
        if (window.YYCardBattle?.enterBattle) {
            window.YYCardBattle.enterBattle(roomId);
        }

        auth.log("⚔️ 进入战斗场景");

    }, 600);
}

// ==================== 外部匹配成功入口 ====================
function onMatchSuccess(roomId) {

    if (roomState !== ROOM_STATE.MATCHING) return;

    setState(ROOM_STATE.FOUND);

    setStatus("⚡ 匹配成功！");

    stopTimer();

    showCancelButton(false);

    playMatchSuccessFX();

    matchRoomView.classList.remove("matching");
    matchRoomView.classList.add("found");

    // 延迟进入战斗（给玩家反馈时间）
    setTimeout(() => {
        enterBattleTransition(roomId);
    }, 900);
}

// ==================== 防抖保护 ====================
let actionLock = false;

function safeStartMatch() {

    if (actionLock) return;
    actionLock = true;

    startMatch();

    setTimeout(() => {
        actionLock = false;
    }, 1000);
}

function safeCancelMatch() {

    if (actionLock) return;
    actionLock = true;

    cancelMatch().finally(() => {
        setTimeout(() => {
            actionLock = false;
        }, 800);
    });
}

// ==================== 生命周期收尾 ====================
function destroyRoom() {

    stopTimer();

    matchRoomView.classList.remove("matching", "found");

    setState(ROOM_STATE.IDLE);

    matchRoomView.dataset.fxPlayed = "0";
}

// ==================== 初始化增强绑定 ====================
function initEnhanced() {

    init();

    // 替换按钮行为（安全增强）
    if (startBtn) startBtn.onclick = safeStartMatch;
    if (cancelBtn) cancelBtn.onclick = safeCancelMatch;

    // 初始在线人数
    updateOnlineCount();

    // 心跳系统
    startRoomHeartbeat();
}

// ==================== 最终暴露接口 ====================
return {

    init: initEnhanced,

    showRoom,
    hideRoom,
    onBattleEnter,

    // 🔥 外部可调用
    onMatchFound: onMatchSuccess,

    // 调试用
    _debug: {
        getState: () => roomState,
        forceMatch: onMatchSuccess
    }
};

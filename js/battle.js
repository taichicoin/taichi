// ==================== 纯时间驱动对战系统（平滑倒计时 + 阶段稳定） ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YCardAuth;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;               // { players, round, gameStartTime }
    let gameSubscription = null;
    let pollingInterval = null;
    let mainTimer = null;
    let enterGuard = false;

    // 缓存当前阶段的结束时间戳（服务器秒数）
    let currentPhaseEndSec = 0;
    let currentPhase = 'prepare';
    let currentRound = 1;

    // 时间公式
    const BUFFER_DURATION = 3;
    function getPrepareDuration(round) { return 27 + (round - 1) * 10; }
    function getBattleDuration(round)  { return 30 + (round - 1) * 5; }

    const SETTLEMENT_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

    // 获取服务器时间（秒）
    async function getServerTime() {
        try {
            const { data, error } = await supabase.rpc('get_server_time');
            if (error) throw error;
            return data;
        } catch (e) {
            console.warn('获取服务器时间失败，使用本地时间', e);
            return Math.floor(Date.now() / 1000);
        }
    }

    // 根据 gameStartTime 和 round，计算当前应该处于哪个阶段，并返回该阶段的结束时间戳（服务器秒）
    async function computePhaseEndTime() {
        if (!gameState || !gameState.gameStartTime) return null;
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const nowSec = await getServerTime();
        let round = gameState.round;
        let elapsed = nowSec - startSec;
        if (elapsed < 0) elapsed = 0;

        const prep = getPrepareDuration(round);
        const buf = BUFFER_DURATION;
        const bat = getBattleDuration(round);
        const totalRound = prep + buf + bat;

        // 跳过已完成的完整回合
        while (elapsed >= totalRound && round < 100) {
            elapsed -= totalRound;
            round++;
        }

        let phase, phaseEndSec;
        if (elapsed < prep) {
            phase = 'prepare';
            phaseEndSec = startSec + (round - 1) * totalRound + prep;
        } else if (elapsed < prep + buf) {
            phase = 'buffering';
            phaseEndSec = startSec + (round - 1) * totalRound + prep + buf;
        } else {
            phase = 'battle';
            phaseEndSec = startSec + round * totalRound; // 战斗结束就是回合结束
        }

        return { phase, phaseEndSec, round };
    }

    // 刷新缓存的阶段结束时间（在阶段切换或重连时调用）
    async function refreshPhaseCache() {
        const info = await computePhaseEndTime();
        if (info) {
            currentPhase = info.phase;
            currentPhaseEndSec = info.phaseEndSec;
            currentRound = info.round;
            // 同步到 gameState.round（可能后端已经推进）
            if (info.round > gameState.round) {
                gameState.round = info.round;
                await updateGameStateToDB();
            }
            // 更新 UI 阶段样式
            if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(currentPhase);
            applyUIMode(currentPhase === 'prepare');
            log(`📡 阶段同步: ${currentPhase}, 结束时间戳=${currentPhaseEndSec}`);
        }
    }

    // 全局计时器（每秒递减，平滑倒计时）
    async function tick() {
        if (!gameState || !currentPhaseEndSec) return;

        const nowSec = await getServerTime();
        let remaining = Math.max(0, currentPhaseEndSec - nowSec);

        // 更新 UI 倒计时
        if (window.YYCardShop?.updateTimerDisplay) {
            window.YYCardShop.updateTimerDisplay(remaining, currentPhase);
        }

        // 阶段结束
        if (remaining <= 0) {
            log(`⏰ 阶段 ${currentPhase} 结束`);
            clearInterval(mainTimer); // 暂停计时器

            if (currentPhase === 'battle') {
                // 战斗结束 → 调用结算接口
                await callSettlement();
                // 结算后重新拉取游戏状态（round 可能已增加）
                await refreshGameState();
                // 重新计算阶段缓存
                await refreshPhaseCache();
            } else {
                // 准备阶段或缓冲阶段结束 → 自动进入下一阶段（无需调用后端）
                await refreshPhaseCache();
            }
            // 重启计时器
            startGlobalTimer();
        }
    }

    function startGlobalTimer() {
        if (mainTimer) clearInterval(mainTimer);
        mainTimer = setInterval(tick, 1000);
    }

    // 调用后端结算
    async function callSettlement() {
        log("⚔️ 战斗阶段结束，调用结算接口...");
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { log("❌ 无会话", true); return false; }
            const res = await fetch(SETTLEMENT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.error);
            log(`✅ 结算成功，新回合: ${result.newRound || result.round}`);
            return true;
        } catch (err) {
            log(`❌ 结算失败: ${err.message}`, true);
            return false;
        }
    }

    // ========== 数据层 ==========
    async function fetchGameState() {
        if (!currentRoomId) return null;
        const { data, error } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', currentRoomId)
            .maybeSingle();
        if (error || !data?.state) return null;
        const s = data.state;
        return { players: s.players, round: s.round || 1, gameStartTime: s.gameStartTime };
    }

    async function refreshGameState() {
        const newState = await fetchGameState();
        if (newState) {
            gameState = newState;
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        }
    }

    async function updateGameStateToDB() {
        if (!currentRoomId || !gameState) return;
        const payload = { players: gameState.players, round: gameState.round, gameStartTime: gameState.gameStartTime };
        await supabase.from('game_states').update({ state: payload }).eq('room_id', currentRoomId);
    }

    // ========== UI ==========
    function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch(e) {}
        const pt = document.getElementById('phase-timer');
        const bt = document.getElementById('phase-timer-battle');
        if (pt) pt.style.display = isPrepare ? 'block' : 'none';
        if (bt) bt.style.display = isPrepare ? 'none' : 'block';
    }

    // ========== 订阅与轮询 ==========
    function subscribeGameState() {
        if (gameSubscription) gameSubscription.unsubscribe();
        gameSubscription = supabase.channel(`game:${currentRoomId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_states', filter: `room_id=eq.${currentRoomId}` }, async (payload) => {
                const newState = payload.new.state;
                if (newState) {
                    gameState.players = newState.players;
                    if (newState.round) gameState.round = newState.round;
                    if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                    // 注意：不主动刷新阶段缓存，避免干扰倒计时；只在重连时刷新
                }
            })
            .subscribe();
    }

    function startPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(async () => {
            if (!currentRoomId) return;
            const { data } = await supabase.from('game_states').select('state').eq('room_id', currentRoomId).maybeSingle();
            if (data?.state) {
                gameState.players = data.state.players;
                if (data.state.round) gameState.round = data.state.round;
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            }
        }, 2000);
    }

    // ========== 进入战斗 ==========
    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;

        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initDebugPanel();

        // 加载状态
        for (let i = 0; i < 20; i++) {
            const state = await fetchGameState();
            if (state) { gameState = state; break; }
            await new Promise(r => setTimeout(r, 200));
        }
        if (!gameState) { toast("加载失败"); enterGuard = false; return; }

        if (!gameState.gameStartTime) {
            gameState.gameStartTime = new Date().toISOString();
            await updateGameStateToDB();
        }

        // 初始化缓存阶段结束时间
        await refreshPhaseCache();

        if (window.YYCardShop?.init) window.YYCardShop.init();
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();

        subscribeGameState();
        startPolling();
        startGlobalTimer();
        bindLeaveButton();

        enterGuard = false;
        log("✅ 战斗界面加载完成（平滑倒计时）");
    }

    function bindLeaveButton() {
        const btn = document.getElementById('leave-battle-btn');
        if (!btn) return;
        btn.onclick = async () => {
            if (!confirm("确定退出？")) return;
            clearInterval(mainTimer);
            clearInterval(pollingInterval);
            if (gameSubscription) gameSubscription.unsubscribe();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
        };
    }

    function initDebugPanel() {
        const old = document.getElementById('battle-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'battle-debug-panel';
        p.style.cssText = `position:fixed; top:0; left:0; right:0; bottom:0; overflow-y:auto; color:#7bffb1; font-size:12px; padding:8px; z-index:100000; font-family:monospace; pointer-events:none; background:transparent; display:flex; flex-direction:column-reverse;`;
        document.body.appendChild(p);
    }

    function log(msg, isError = false) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        const panel = document.getElementById('battle-debug-panel');
        if (!panel) return;
        const line = document.createElement('div');
        line.style.color = isError ? '#ff6666' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        panel.insertBefore(line, panel.firstChild);
        while (panel.children.length > 100) panel.removeChild(panel.lastChild);
    }

    function toast(msg) {
        if (window.YYCardShop?.toast) window.YYCardShop.toast(msg);
        else alert(msg);
    }

    return {
        enterBattle,
        getGameState: () => gameState,
        getCurrentRoomId: () => currentRoomId,
        forceRefreshState: refreshGameState,
        fetchGameState
    };
})();

console.log('✅ battle.js 平滑倒计时版加载完成');

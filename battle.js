// ==================== 纯时间驱动对战系统（稳定倒计时版） ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YCardAuth;
    const config = window.YCardConfig;

    let currentRoomId = null;
    let gameState = null;
    let gameSubscription = null;
    let pollingInterval = null;
    let mainTimer = null;
    let enterGuard = false;

    // 本地倒计时状态
    let currentPhase = null;      // 'prepare', 'buffering', 'battle'
    let currentRemaining = 0;     // 当前阶段剩余秒数
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

    // 根据 gameStartTime 和 round 计算当前应该处于的阶段和剩余秒数（仅在初始化或刷新时调用一次）
    async function computeInitialPhase() {
        if (!gameState || !gameState.gameStartTime) return null;
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const nowSec = await getServerTime();
        let elapsed = Math.max(0, nowSec - startSec);
        let round = gameState.round || 1;
        while (true) {
            const prep = getPrepareDuration(round);
            const buf = BUFFER_DURATION;
            const bat = getBattleDuration(round);
            const totalRoundSec = prep + buf + bat;
            if (elapsed >= totalRoundSec) {
                elapsed -= totalRoundSec;
                round++;
            } else {
                if (elapsed < prep) {
                    return { round, phase: 'prepare', remaining: prep - elapsed };
                } else if (elapsed < prep + buf) {
                    return { round, phase: 'buffering', remaining: prep + buf - elapsed };
                } else {
                    return { round, phase: 'battle', remaining: prep + buf + bat - elapsed };
                }
            }
        }
    }

    // 重新设置本地倒计时（不依赖外部定时器重算）
    function setLocalTimer(round, phase, remaining) {
        currentRound = round;
        currentPhase = phase;
        currentRemaining = remaining;
        // 立即更新UI
        if (window.YYCardShop?.updateTimerDisplay) {
            window.YYCardShop.updateTimerDisplay(remaining, phase);
        }
        if (window.YYCardShop?.setPhase) {
            window.YYCardShop.setPhase(phase);
        }
        applyUIMode(phase === 'prepare');
    }

    // 每秒执行一次，减少本地剩余秒数
    async function tick() {
        if (currentRemaining <= 0) {
            // 当前阶段结束，需要切换
            await onPhaseEnd();
            return;
        }
        currentRemaining--;
        // 更新UI
        if (window.YYCardShop?.updateTimerDisplay) {
            window.YYCardShop.updateTimerDisplay(currentRemaining, currentPhase);
        }
        // 倒计时显示不需要重新计算阶段，保持平滑
    }

    // 阶段结束处理
    async function onPhaseEnd() {
        if (currentPhase === 'prepare') {
            // 准备阶段结束 → 进入缓冲期
            log("准备阶段结束，进入缓冲期");
            setLocalTimer(currentRound, 'buffering', BUFFER_DURATION);
        } else if (currentPhase === 'buffering') {
            // 缓冲期结束 → 进入战斗阶段
            log("缓冲期结束，进入战斗阶段");
            const battleDur = getBattleDuration(currentRound);
            setLocalTimer(currentRound, 'battle', battleDur);
            // 触发战斗模拟（可选）
            simulateBattle();
        } else if (currentPhase === 'battle') {
            // 战斗阶段结束 → 调用结算接口
            log("战斗阶段结束，调用结算接口");
            const success = await callSettlement();
            if (success) {
                // 结算成功后，重新拉取最新状态（round 已增加，商店已刷新）
                await refreshGameState();
                // 重新初始化本地倒计时（根据最新的 round 和 gameStartTime）
                const init = await computeInitialPhase();
                if (init) {
                    setLocalTimer(init.round, init.phase, init.remaining);
                }
            } else {
                // 结算失败，重试一次（延迟2秒后重新调用本函数）
                log("结算失败，2秒后重试", true);
                setTimeout(() => onPhaseEnd(), 2000);
            }
        }
    }

    // 战斗模拟
    async function simulateBattle() {
        try {
            if (!window.YYCardCombat) return;
            await window.YYCardCombat.resolveBattles(gameState, log, async () => {
                if (currentRoomId && gameState) {
                    await updateGameStateToDB();
                }
            });
        } catch (e) {
            log(`战斗模拟出错: ${e.message}`, true);
        }
    }

    // 调用后端结算
    async function callSettlement(retry = 0) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("无会话");
            const res = await fetch(SETTLEMENT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.error || "结算失败");
            log("结算成功");
            return true;
        } catch (err) {
            log(`结算失败: ${err.message}`, true);
            if (retry < 2) {
                await new Promise(r => setTimeout(r, 1000));
                return callSettlement(retry + 1);
            }
            return false;
        }
    }

    // 数据同步
    async function fetchGameState() {
        if (!currentRoomId) return null;
        const { data, error } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', currentRoomId)
            .maybeSingle();
        if (error || !data?.state) return null;
        return {
            players: data.state.players,
            round: data.state.round || 1,
            gameStartTime: data.state.gameStartTime
        };
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
        const payload = {
            players: gameState.players,
            round: gameState.round,
            gameStartTime: gameState.gameStartTime
        };
        await supabase
            .from('game_states')
            .update({ state: payload })
            .eq('room_id', currentRoomId);
    }

    function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch(e) {}
        const prepTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepTimer) prepTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
    }

    // 订阅和轮询（仅同步玩家数据）
    function subscribeGameState() {
        if (gameSubscription) gameSubscription.unsubscribe();
        gameSubscription = supabase.channel(`game:${currentRoomId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_states', filter: `room_id=eq.${currentRoomId}` }, async (payload) => {
                const newState = payload.new.state;
                if (newState) {
                    gameState.players = newState.players;
                    if (newState.round) gameState.round = newState.round;
                    if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                }
            })
            .subscribe();
    }

    function startPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(async () => {
            if (!currentRoomId) return;
            const { data } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', currentRoomId)
                .maybeSingle();
            if (data?.state) {
                gameState.players = data.state.players;
                if (data.state.round) gameState.round = data.state.round;
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            }
        }, 2000);
    }

    // 进入战斗
    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;

        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initDebugPanel();

        // 加载游戏状态
        let loaded = false;
        for (let i = 0; i < 20; i++) {
            const state = await fetchGameState();
            if (state) {
                gameState = state;
                loaded = true;
                break;
            }
            await new Promise(r => setTimeout(r, 200));
        }
        if (!loaded) {
            toast("游戏状态加载失败", true);
            enterGuard = false;
            return;
        }

        if (!gameState.gameStartTime) {
            gameState.gameStartTime = new Date().toISOString();
            await updateGameStateToDB();
        }

        // 计算初始阶段和剩余时间
        const init = await computeInitialPhase();
        if (init) {
            setLocalTimer(init.round, init.phase, init.remaining);
        } else {
            setLocalTimer(1, 'prepare', getPrepareDuration(1));
        }

        // 启动定时器
        if (mainTimer) clearInterval(mainTimer);
        mainTimer = setInterval(tick, 1000);

        // 初始化商店UI
        if (window.YYCardShop?.init) window.YYCardShop.init();
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();

        subscribeGameState();
        startPolling();
        bindLeaveButton();

        enterGuard = false;
        log("✅ 战斗界面加载完成，倒计时稳定模式");
    }

    function bindLeaveButton() {
        const btn = document.getElementById('leave-battle-btn');
        if (!btn) return;
        btn.onclick = async () => {
            if (!confirm("确定退出战斗？")) return;
            clearInterval(mainTimer);
            clearInterval(pollingInterval);
            if (gameSubscription) gameSubscription.unsubscribe();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
        };
    }

    // 调试
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

    function toast(msg, isError = false) {
        if (window.YYCardShop?.toast) window.YYCardShop.toast(msg, isError);
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

console.log('✅ battle.js 加载完成（稳定倒计时版，无跳秒）');

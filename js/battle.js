// ==================== 纯时间驱动对战系统（无前端商店操作） ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;          // 只包含 players, gameStartTime, round
    let gameSubscription = null;
    let pollingInterval = null;
    let mainTimer = null;
    let enterGuard = false;
    let eliminationOrder = [];

    // 时间公式（与后端 settlement 完全一致）
    const BUFFER_DURATION = 3;
    function getPrepareDuration(round) { return 27 + (round - 1) * 10; }
    function getBattleDuration(round)  { return 30 + (round - 1) * 5; }

    const SETTLEMENT_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

    // ========== 服务器时间 ==========
    async function getServerTime() {
        try {
            const { data, error } = await supabase.rpc('get_server_time');
            if (error) throw error;
            return data; // 秒级时间戳
        } catch (e) {
            console.warn('获取服务器时间失败，使用本地时间', e);
            return Math.floor(Date.now() / 1000);
        }
    }

    // ========== 核心：根据 gameStartTime 和当前回合计算当前阶段 ==========
    function calculatePhaseInfo(gameStartTimeSec, currentRound, nowSec) {
        let round = currentRound;
        let elapsed = nowSec - gameStartTimeSec;
        // 跳过已经完成的回合
        while (true) {
            const prep = getPrepareDuration(round);
            const buf = BUFFER_DURATION;
            const bat = getBattleDuration(round);
            const total = prep + buf + bat;
            if (elapsed >= total) {
                elapsed -= total;
                round++;
                if (round > 100) break;
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
        return { round: 1, phase: 'prepare', remaining: getPrepareDuration(1) };
    }

    // ========== 从数据库获取游戏数据 ==========
    async function fetchGameState() {
        if (!currentRoomId) return null;
        const { data, error } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', currentRoomId)
            .maybeSingle();
        if (error) {
            log(`❌ 拉取状态失败: ${error.message}`, true);
            return null;
        }
        if (!data?.state) return null;
        const state = data.state;
        return {
            players: state.players,
            gameStartTime: state.gameStartTime,
            round: state.round || 1
        };
    }

    // ========== 更新玩家数据到数据库（只更新 players 和 round） ==========
    async function updateGameStateToDB() {
        if (!currentRoomId || !gameState) return;
        const payload = {
            players: gameState.players,
            round: gameState.round,
            gameStartTime: gameState.gameStartTime
        };
        const { error } = await supabase
            .from('game_states')
            .update({ state: payload })
            .eq('room_id', currentRoomId);
        if (error) log(`❌ 更新状态失败: ${error.message}`, true);
    }

    // ========== 调用后端结算接口 ==========
    async function callSettlement() {
        log("⚔️ 战斗阶段结束，调用结算接口...");
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                log("❌ 无会话，无法结算", true);
                return false;
            }
            const res = await fetch(SETTLEMENT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.error || '结算失败');
            }
            log(`✅ 结算成功，新回合: ${result.newRound || result.round}`);
            // 重新拉取最新状态（round 已增加，商店已刷新）
            await refreshGameState();
            return true;
        } catch (err) {
            log(`❌ 结算失败: ${err.message}`, true);
            return false;
        }
    }

    async function refreshGameState() {
        const newState = await fetchGameState();
        if (newState) {
            gameState = newState;
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        }
    }

    // ========== 全局计时器（每秒执行） ==========
    let lastPhase = null;
    async function tick() {
        if (!gameState || !gameState.gameStartTime) return;

        const nowSec = await getServerTime();
        const gameStartSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const { round, phase, remaining } = calculatePhaseInfo(gameStartSec, gameState.round, nowSec);

        // 如果计算出的回合比本地存储的大，同步本地 round（结算后后端已更新）
        if (round > gameState.round) {
            gameState.round = round;
            await updateGameStateToDB();
        }

        // 更新 UI 倒计时和阶段样式
        if (window.YYCardShop?.updateTimerDisplay) {
            window.YYCardShop.updateTimerDisplay(remaining, phase);
        }
        if (window.YYCardShop?.setPhase) {
            window.YYCardShop.setPhase(phase);
        }
        applyUIMode(phase === 'prepare');

        // 检测战斗阶段结束（从战斗变为其他阶段或剩余时间≤0）
        if (lastPhase === 'battle' && (remaining <= 0 || phase !== 'battle')) {
            log("⚡ 战斗阶段结束，触发结算");
            clearInterval(mainTimer);   // 暂停计时器，避免重复触发
            await callSettlement();
            startGlobalTimer();         // 重启计时器
        }
        lastPhase = phase;
    }

    function startGlobalTimer() {
        if (mainTimer) clearInterval(mainTimer);
        mainTimer = setInterval(tick, 1000);
    }

    // ========== UI 辅助 ==========
    function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch(e) {}
        const prepareTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
    }

    // ========== 数据同步（订阅 + 轮询） ==========
    function subscribeGameState() {
        if (gameSubscription) gameSubscription.unsubscribe();
        gameSubscription = supabase.channel(`game:${currentRoomId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'game_states',
                filter: `room_id=eq.${currentRoomId}`
            }, async (payload) => {
                const newState = payload.new.state;
                if (newState) {
                    // 只同步玩家数据和 round，不覆盖本地时间计算
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

    // ========== 进入战斗 ==========
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
            toast("游戏状态加载失败，请刷新页面重试", true);
            enterGuard = false;
            return;
        }

        // 确保 gameStartTime 存在（第一次初始化时写入）
        if (!gameState.gameStartTime) {
            gameState.gameStartTime = new Date().toISOString();
            await updateGameStateToDB();
        }

        // 初始化商店 UI（shop.js 已独立处理）
        if (window.YYCardShop?.init) window.YYCardShop.init();
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();

        subscribeGameState();
        startPolling();
        startGlobalTimer();
        bindLeaveButton();

        enterGuard = false;
        log("✅ 战斗界面加载完成，纯时间驱动");
    }

    function bindLeaveButton() {
        const btn = document.getElementById('leave-battle-btn');
        if (btn) {
            btn.onclick = () => {
                if (!confirm("确定退出战斗？")) return;
                clearInterval(mainTimer);
                clearInterval(pollingInterval);
                if (gameSubscription) gameSubscription.unsubscribe();
                document.getElementById('battle-view').style.display = 'none';
                document.getElementById('lobby-view').style.display = 'block';
                gameState = currentRoomId = null;
            };
        }
    }

    // 调试面板
    function initDebugPanel() {
        const old = document.getElementById('battle-debug-panel');
        if (old) old.remove();
        const el = document.createElement('div');
        el.id = 'battle-debug-panel';
        el.style.cssText = `position:fixed; top:0; left:0; right:0; bottom:0; color:#7bffb1; font-size:12px; padding:8px; z-index:100000; font-family:monospace; pointer-events:none; background:transparent; display:flex; flex-direction:column-reverse;`;
        document.body.appendChild(el);
    }

    function log(msg, isError = false) {
        console.log(msg);
        const panel = document.getElementById('battle-debug-panel');
        if (!panel) return;
        const line = document.createElement('div');
        line.style.color = isError ? '#ff7b7b' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        panel.insertBefore(line, panel.firstChild);
        while (panel.children.length > 100) panel.removeChild(panel.lastChild);
    }

    function toast(msg, isError = false) {
        if (window.YYCardShop?.toast) window.YYCardShop.toast(msg, isError);
        else alert(msg);
    }

    // 导出必要接口供 shop.js 使用
    return {
        enterBattle,
        getGameState: () => gameState,
        getCurrentRoomId: () => currentRoomId,
        forceRefreshState: refreshGameState,
        fetchGameState: fetchGameState
    };
})();

console.log('✅ battle.js 加载完成（纯时间驱动，无前端商店操作）');

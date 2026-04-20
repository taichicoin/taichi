// ==================== 纯时间驱动对战系统（动态 phase 供 shop 使用） ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;               // 包含 players, gameStartTime, round (从后端同步), 以及动态 phase, remaining
    let gameSubscription = null;
    let pollingInterval = null;
    let mainTimer = null;
    let enterGuard = false;
    let isSettling = false;

    // 时间公式（与后端 settlement 完全一致）
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

    // 核心计算：根据 gameStartTime 和当前服务器时间，返回 round, phase, remaining
    function calculatePhaseInfo(gameStartSec, nowSec) {
        let elapsed = nowSec - gameStartSec;
        if (elapsed < 0) elapsed = 0;
        let round = 1;
        while (true) {
            const prep = getPrepareDuration(round);
            const buf = BUFFER_DURATION;
            const bat = getBattleDuration(round);
            const totalRound = prep + buf + bat;
            if (elapsed >= totalRound) {
                elapsed -= totalRound;
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

    // 从数据库拉取必要数据（只读 players 和 gameStartTime，以及后端更新的 round）
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
        const s = data.state;
        return {
            players: s.players,
            round: s.round || 1,
            gameStartTime: s.gameStartTime
        };
    }

    // 更新玩家数据到数据库（仅 players 和 round，不涉及阶段）
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

    // 刷新本地 gameState（从数据库拉取，并补充动态 phase/remaining）
    async function refreshGameState() {
        const newState = await fetchGameState();
        if (!newState) return false;
        // 合并：保留原有 gameStartTime，更新 players 和 round
        gameState = {
            ...gameState,
            players: newState.players,
            round: newState.round,
            gameStartTime: newState.gameStartTime
        };
        // 立即计算一次动态 phase 并挂载
        await updateDynamicPhase();
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        return true;
    }

    // 更新 gameState 中的动态 phase 和 remaining（供 shop.js 使用）
    async function updateDynamicPhase() {
        if (!gameState || !gameState.gameStartTime) return;
        const nowSec = await getServerTime();
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const { round, phase, remaining } = calculatePhaseInfo(startSec, nowSec);
        gameState.round = round;          // 同步 round（可能比数据库中的大，但以后端为准，这里覆盖）
        gameState.phase = phase;          // 动态 phase
        gameState.remaining = remaining;  // 供调试
    }

    // 调用后端结算接口（带重试）
    async function callSettlement(retry = 0) {
        if (isSettling) return false;
        isSettling = true;
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
            // 结算成功后，重新拉取最新数据（玩家金币、商店等）
            await refreshGameState();
            return true;
        } catch (err) {
            log(`❌ 结算失败: ${err.message}`, true);
            if (retry < 2) {
                await new Promise(r => setTimeout(r, 2000));
                return callSettlement(retry + 1);
            }
            return false;
        } finally {
            isSettling = false;
        }
    }

    // 全局计时器（每秒执行）
    let lastPhase = null;
    async function tick() {
        if (!gameState || !gameState.gameStartTime) return;

        const nowSec = await getServerTime();
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const { round, phase, remaining } = calculatePhaseInfo(startSec, nowSec);
        
        // 更新本地 gameState 中的动态字段
        gameState.round = round;
        gameState.phase = phase;
        gameState.remaining = remaining;

        // 更新 UI 倒计时和阶段样式
        if (window.YYCardShop?.updateTimerDisplay) {
            window.YYCardShop.updateTimerDisplay(remaining, phase);
        }
        if (window.YYCardShop?.setPhase) {
            window.YYCardShop.setPhase(phase);
        }
        applyUIMode(phase === 'prepare');

        // 检测战斗阶段结束（从战斗变为非战斗，且剩余<=0）
        if (lastPhase === 'battle' && (remaining <= 0 || phase !== 'battle')) {
            log("⚡ 战斗阶段结束，触发结算");
            clearInterval(mainTimer);   // 暂停计时器，避免重复触发
            await callSettlement();
            startGlobalTimer();          // 重启计时器
        }
        lastPhase = phase;
    }

    function startGlobalTimer() {
        if (mainTimer) clearInterval(mainTimer);
        mainTimer = setInterval(tick, 1000);
    }

    function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch(e) {}
        const prepareTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
    }

    // 数据订阅（只同步 players 和 round，不覆盖动态 phase）
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
                if (newState && newState.players) {
                    gameState.players = newState.players;
                    if (newState.round) gameState.round = newState.round;
                    // 不覆盖 gameStartTime
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
            if (data?.state && data.state.players) {
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

        // 加载初始状态
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

        // 如果缺少 gameStartTime，则初始化
        if (!gameState.gameStartTime) {
            gameState.gameStartTime = new Date().toISOString();
            await updateGameStateToDB();
        }

        // 计算一次动态 phase 并挂载
        await updateDynamicPhase();

        // 初始化商店 UI
        if (window.YYCardShop?.init) window.YYCardShop.init();
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();

        subscribeGameState();
        startPolling();
        startGlobalTimer();
        bindLeaveButton();

        enterGuard = false;
        log("✅ 战斗界面加载完成，动态 phase 模式");
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

    // 调试面板
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

    // 导出接口
    return {
        enterBattle,
        getGameState: () => gameState,
        getCurrentRoomId: () => currentRoomId,
        forceRefreshState: refreshGameState,
        fetchGameState
    };
})();

console.log('✅ battle.js 加载完成（动态 phase 供 shop 使用，结算重试）');

// ==================== YYCardBattle 修复版 · 解决RLS写入失败问题 ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;

    let mainTimer = null;
    let enterGuard = false;
    let isUpdatingFromLocal = false; // 本地写入锁，防止订阅覆盖

    let gameSubscription = null;
    let pollingInterval = null;
    let autoBotTimer = null;
    let eliminationOrder = [];

    // 时间配置
    const BUFFER = 3;
    function prepareDuration(round) { return 27 + (round - 1) * 10; }
    function battleDuration(round)  { return 30 + (round - 1) * 5; }

    const SETTLEMENT_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

    // 服务器时间（秒）
    async function serverTime() {
        try {
            const { data, error } = await supabase.rpc('get_server_time');
            if (error) throw error;
            return data;
        } catch (e) {
            return Math.floor(Date.now() / 1000);
        }
    }

    // ==================== 核心：纯时间计算，不依赖数据库阶段 ====================
    async function getCurrentPhaseInfo() {
        if (!gameState?.gameStartTime) {
            return { round: 1, phase: 'prepare', remain: prepareDuration(1) };
        }

        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const nowSec = await serverTime();
        let elapsed = Math.max(0, nowSec - startSec);

        let round = 1;
        while (true) {
            const prep = prepareDuration(round);
            const bat = battleDuration(round);
            const totalRound = prep + BUFFER + bat;

            if (elapsed >= totalRound) {
                elapsed -= totalRound;
                round++;
            } else {
                if (elapsed < prep) {
                    return { round, phase: 'prepare', remain: prep - elapsed };
                } else if (elapsed < prep + BUFFER) {
                    return { round, phase: 'buffering', remain: prep + BUFFER - elapsed };
                } else {
                    return { round, phase: 'battle', remain: prep + BUFFER + bat - elapsed };
                }
            }
        }
    }

    // ==================== 全局计时器 · 永不乱跳 ====================
    function startGlobalTimer() {
        clearInterval(mainTimer);
        mainTimer = setInterval(async () => {
            const { round, phase, remain } = await getCurrentPhaseInfo();

            // 永远只显示算出来的东西，不看数据库
            if (window.YYCardShop?.updateTimerDisplay) {
                window.YYCardShop.updateTimerDisplay(remain, phase);
            }
            if (window.YYCardShop?.setPhase) {
                window.YYCardShop.setPhase(phase);
            }

            // UI 切换
            applyUIMode(phase === 'prepare');

            // 战斗阶段结束 → 只在这里调用一次结算
            if (phase === 'battle' && remain <= 0) {
                clearInterval(mainTimer);
                await callSettlement();
                setTimeout(startGlobalTimer, 1000);
            }
        }, 1000);
    }

    // ==================== 结算接口 ====================
    async function callSettlement() {
        log("⚔️ 战斗阶段结束 → 调用结算");
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const res = await fetch(SETTLEMENT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ roomId: currentRoomId })
            });

            const result = await res.json();
            if (res.ok && result.success) {
                log("✅ 结算成功");
            } else {
                log("❌ 结算失败：" + (result.error || ""));
            }
        } catch (e) {
            log("❌ 结算异常：" + e.message);
        }
    }

    // ==================== UI ====================
    function applyUIMode(isPrepare) {
        try {
            document.body.classList.toggle('battle-view-mode', !isPrepare);
        } catch (e) {}

        const prepTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepTimer) prepTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
    }

    // ==================== 安全更新gameState到数据库（修复RLS写入失败的关键） ====================
    async function safeUpdateGameState() {
        if (!currentRoomId || !gameState || isUpdatingFromLocal) return;
        isUpdatingFromLocal = true;
        try {
            // 先拉取最新状态，避免覆盖
            const { data: latestState, error: fetchErr } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', currentRoomId)
                .maybeSingle();
            
            if (fetchErr || !latestState?.state) throw new Error("无法拉取最新状态");

            // 只修改必要字段，不破坏原有结构
            const updatedState = { ...latestState.state };
            updatedState.gameStartTime = gameState.gameStartTime;
            
            const { error: updateErr } = await supabase
                .from('game_states')
                .update({ state: updatedState })
                .eq('room_id', currentRoomId);

            if (updateErr) throw updateErr;
            gameState = updatedState; // 同步本地状态
            log("✅ 游戏状态写入成功");
        } catch (err) {
            log(`❌ 写入失败: ${err.message}`, true);
            // 重试一次
            await new Promise(r => setTimeout(r, 500));
            try {
                const { data: latestState } = await supabase
                    .from('game_states')
                    .select('state')
                    .eq('room_id', currentRoomId)
                    .maybeSingle();
                if (latestState?.state) {
                    const updatedState = { ...latestState.state };
                    updatedState.gameStartTime = gameState.gameStartTime;
                    await supabase
                        .from('game_states')
                        .update({ state: updatedState })
                        .eq('room_id', currentRoomId);
                    gameState = updatedState;
                    log("✅ 重试写入成功");
                }
            } catch (retryErr) {
                log(`❌ 重试写入失败: ${retryErr.message}`, true);
            }
        } finally {
            isUpdatingFromLocal = false;
        }
    }

    // ==================== 进入战斗 ====================
    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;

        currentRoomId = roomId;
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';

        initDebugPanel();
        eliminationOrder = [];

        // 拉取游戏数据（只拿玩家、阵容、血量，不碰阶段）
        let attempts = 0;
        while (attempts < 20) {
            const { data, error } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', roomId)
                .maybeSingle();

            if (error) {
                log(`❌ 拉取状态失败: ${error.message}`, true);
                attempts++;
                await new Promise(r => setTimeout(r, 200));
                continue;
            }

            if (data?.state) {
                gameState = data.state;
                break;
            }

            attempts++;
            await new Promise(r => setTimeout(r, 200));
        }

        if (!gameState) {
            toast("游戏状态加载失败，请重试");
            enterGuard = false;
            return;
        }

        // 第一次进房间 · 设置开局时间（用安全写入方法）
        if (!gameState.gameStartTime) {
            gameState.gameStartTime = new Date().toISOString();
            await safeUpdateGameState();
        }

        subscribeGameState();
        startPolling();
        startGlobalTimer();
        bindLeaveButton();

        enterGuard = false;
    }

    // ==================== 同步游戏数据（修复版：只更新必要字段，不破坏结构）====================
    function subscribeGameState() {
        if (gameSubscription) gameSubscription.unsubscribe();
        gameSubscription = supabase.channel(`game:${currentRoomId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'game_states',
                filter: `room_id=eq.${currentRoomId}`
            }, (payload) => {
                if (isUpdatingFromLocal) return; // 本地写入时不处理订阅事件
                // 只更新玩家、血量、卡牌，绝不碰gameStartTime和阶段
                const newState = payload.new.state;
                if (!newState) return;

                // 安全合并状态，不覆盖原有结构
                gameState = {
                    ...gameState,
                    players: newState.players || gameState.players,
                    yourCards: newState.yourCards || gameState.yourCards,
                    gameStartTime: newState.gameStartTime || gameState.gameStartTime
                };

                if (window.YYCardShop?.refreshAllUI) {
                    window.YYCardShop.refreshAllUI();
                }
            })
            .subscribe();
    }

    function startPolling() {
        clearInterval(pollingInterval);
        pollingInterval = setInterval(async () => {
            if (isUpdatingFromLocal) return;
            const { data } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', currentRoomId)
                .maybeSingle();

            if (data?.state) {
                // 安全合并状态
                gameState = {
                    ...gameState,
                    players: data.state.players || gameState.players,
                    yourCards: data.state.yourCards || gameState.yourCards,
                    gameStartTime: data.state.gameStartTime || gameState.gameStartTime
                };
            }
        }, 2000);
    }

    // ==================== 工具 ====================
    function bindLeaveButton() {
        document.getElementById('leave-battle-btn')?.onclick = () => {
            if (!confirm("确定退出战斗？")) return;
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
        const el = document.createElement('div');
        el.id = 'battle-debug-panel';
        el.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;color:#7bffb1;font-size:12px;padding:8px;z-index:9999;font-family:monospace;pointer-events:none;display:flex;flex-direction:column-reverse`;
        document.body.appendChild(el);
    }

    function log(msg, isError = false) {
        console.log(msg);
        const panel = document.getElementById('battle-debug-panel');
        if (!panel) return;
        const line = document.createElement('div');
        line.style.color = isError ? '#ff6666' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        panel.insertBefore(line, panel.firstChild);
        while (panel.children.length > 80) panel.removeChild(panel.lastChild);
    }

    function toast(msg) {
        if (window.YYCardShop?.toast) window.YYCardShop.toast(msg);
        else alert(msg);
    }

    // ==================== 导出 ====================
    return {
        enterBattle,
        getGameState: () => gameState,
        getCurrentRoomId: () => currentRoomId,
    };
})();

console.log('✅ battle.js 修复版加载完成，已解决RLS写入失败问题');

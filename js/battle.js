// ==================== YY Card 对战系统【服务器时间自动驱动版】====================
// 自动阶段切换完整保留 | 计时基准=Supabase服务器时间 | 到点自动调用结算接口
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;
    let gameSubscription = null;
    let autoBotTimer = null;

    // 服务器时间核心变量
    let currentServerTime = 0;       // 最新服务器时间戳(秒)
    let phaseEndServerTime = 0;      // 阶段结束的服务器时间戳
    let syncServerTimeInterval = null;// 同步服务器时间定时器
    let countDownInterval = null;    // 倒计时定时器

    let isUpdatingFromLocal = false;
    let isInPhaseTransition = false;

    // 轮询相关
    let pollingInterval = null;
    let eliminationOrder = [];

    // 所有时间公式 100% 从 config 读取 → 与后端 settlement 完全对齐
    const BUFFER_DURATION = config.ROUND_TIME.BUFFER;
    function getPrepareDuration(round) {
        return config.ROUND_TIME.PREPARE.BASE + (round - 1) * config.ROUND_TIME.PREPARE.INCREMENT;
    }
    function getBattleDuration(round) {
        return config.ROUND_TIME.BATTLE.BASE + (round - 1) * config.ROUND_TIME.BATTLE.INCREMENT;
    }

    // 结算接口地址
    const SETTLEMENT_API = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

    // ==================== 核心：获取服务器时间戳(秒) ====================
    async function getServerTime() {
        try {
            const { data, error } = await supabase.rpc('get_server_time');
            if (!error && data) {
                currentServerTime = data;
                return data;
            }
        } catch (e) {
            console.error('获取服务器时间失败', e);
        }
        // 兜底用本地时间
        return Math.floor(Date.now() / 1000);
    }

    // 同步服务器时间（每10秒同步一次，防偏差）
    function startSyncServerTime() {
        stopSyncServerTime();
        getServerTime();
        syncServerTimeInterval = setInterval(() => getServerTime(), 10000);
    }
    function stopSyncServerTime() {
        if (syncServerTimeInterval) clearInterval(syncServerTimeInterval);
        syncServerTimeInterval = null;
    }

    // ==================== 调试与提示 ====================
    function initDebugPanel() {
        const old = document.getElementById('battle-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'battle-debug-panel';
        p.style.cssText = `
            position:fixed; top:0; left:0; right:0; bottom:0;
            overflow-y:auto; color:#7bffb1; font-size:12px; padding:8px; z-index:100000;
            font-family:monospace; pointer-events:none; text-shadow:0 0 4px black;
            background:transparent; border:none; display:flex; flex-direction:column-reverse;
        `;
        document.body.appendChild(p);
        return p;
    }
    function logToScreen(msg, isError = false, persistent = false) {
        const p = document.getElementById('battle-debug-panel') || initDebugPanel();
        const line = document.createElement('div');
        line.style.color = isError ? '#ff7b7b' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
        p.insertBefore(line, p.firstChild);
        while (p.children.length > 100) p.removeChild(p.lastChild);
        if (persistent) {
            setTimeout(() => line.remove(), 60000);
        }
    }
    function toast(msg, isError = false) {
        if (window.YYCardShop?.toast) window.YYCardShop.toast(msg, isError);
        else alert(msg);
    }
    function log(msg, isError = false, persistent = false) {
        console.log(msg);
        logToScreen(msg, isError, persistent);
    }

    // ==================== 游戏状态操作 ====================
    function getGameState() { return gameState; }
    function getCurrentRoomId() { return currentRoomId; }

    async function updateGameState() {
        if (!currentRoomId || !gameState) return;
        const { data: fresh, error } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', currentRoomId)
            .single();
        if (error || !fresh?.state) return;

        const latest = fresh.state;
        const myId = auth.currentUser?.id;
        if (myId && latest.players[myId]) {
            latest.players[myId] = gameState.players[myId];
        }
        latest.round = gameState.round;
        latest.phase = gameState.phase;
        latest.gameStartTime = gameState.gameStartTime;
        gameState = latest;

        isUpdatingFromLocal = true;
        await supabase.from('game_states').update({ state: gameState }).eq('room_id', currentRoomId);
        isUpdatingFromLocal = false;
        window.YYCardShop?.refreshAllUI();
    }

    function getShopLevelByExp(exp) {
        if (exp >= 46) return 5;
        if (exp >= 26) return 4;
        if (exp >= 12) return 3;
        if (exp >= 4) return 2;
        return 1;
    }

    // ==================== 清空所有定时器 ====================
    function clearAllTimers() {
        if (countDownInterval) clearInterval(countDownInterval);
        if (syncServerTimeInterval) clearInterval(syncServerTimeInterval);
        if (pollingInterval) clearInterval(pollingInterval);
        if (autoBotTimer) clearInterval(autoBotTimer);
        countDownInterval = syncServerTimeInterval = pollingInterval = autoBotTimer = null;
    }

    // ==================== 基于服务器时间的倒计时启动 ====================
    function startPhaseCountDown(phase, durationSec) {
        stopPhaseCountDown();
        // 用服务器时间计算结束时间
        currentServerTime = currentServerTime || Math.floor(Date.now()/1000);
        phaseEndServerTime = currentServerTime + durationSec;

        // 更新UI显示
        gameState.phase = phase;
        gameState.phaseStartTime = new Date().toISOString();
        updateGameState();
        window.YYCardShop?.setPhase(phase);

        // 每秒刷新倒计时
        countDownInterval = setInterval(async () => {
            await getServerTime();
            const remain = Math.max(0, phaseEndServerTime - currentServerTime);
            window.YYCardShop?.updateTimerDisplay(remain, phase);

            // 时间到 → 自动切阶段
            if (remain <= 0) {
                stopPhaseCountDown();
                onPhaseEnd(phase);
            }
        }, 1000);
    }
    function stopPhaseCountDown() {
        if (countDownInterval) clearInterval(countDownInterval);
        countDownInterval = null;
    }

    // ==================== 缓冲期 ====================
    async function startBuffering(targetPhase) {
        log(`⏳ 缓冲期 ${BUFFER_DURATION}s → ${targetPhase}`);
        window.YYCardShop?.setPhase('buffering');
        startPhaseCountDown('buffering', BUFFER_DURATION);
        await new Promise(r => setTimeout(r, BUFFER_DURATION * 1000));
    }

    // ==================== 阶段结束自动切换 ====================
    async function onPhaseEnd(phase) {
        if (isInPhaseTransition || !gameState) return;
        isInPhaseTransition = true;

        log(`🔄 阶段结束：${phase}`);
        try {
            if (phase === 'prepare') {
                // 准备→缓冲→战斗
                await startBuffering('battle');
                await applyUIMode(false);
                startPhaseCountDown('battle', getBattleDuration(gameState.round));
                await simulateBattle();
            } 
            else if (phase === 'battle' || phase === 'buffering') {
                // 战斗结束 → 调用后端结算接口
                await callSettlementApi();
                // 检查游戏是否结束
                const over = checkGameOver();
                if (over.isOver) {
                    endGame(over.winner);
                    isInPhaseTransition = false;
                    return;
                }
                // 进入新回合准备阶段
                const prepDur = getPrepareDuration(gameState.round);
                log(`🔁 第${gameState.round}回合准备阶段(${prepDur}s)`);
                await applyUIMode(true);
                startPhaseCountDown('prepare', prepDur);
            }
        } catch (e) {
            log(`❌ 阶段切换错误：${e.message}`, true);
        } finally {
            isInPhaseTransition = false;
        }
    }

    // ==================== 调用后端结算接口 ====================
    async function callSettlementApi() {
        if (!currentRoomId) return;
        try {
            log(`📤 调用结算接口`);
            const res = await fetch(SETTLEMENT_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            const data = await res.json();
            if (data.success) {
                // 同步最新游戏状态
                const { data: fresh } = await supabase
                    .from('game_states')
                    .select('state')
                    .eq('room_id', currentRoomId)
                    .single();
                if (fresh?.state) {
                    gameState = fresh.state;
                    log(`✅ 结算完成 | 回合：${gameState.round}`);
                    window.YYCardShop?.refreshAllUI();
                }
            } else {
                log(`❌ 结算失败：${data.error}`, true);
            }
        } catch (e) {
            log(`❌ 结算接口调用失败：${e.message}`, true);
        }
    }

    // ==================== 战斗模拟 ====================
    async function simulateBattle() {
        try {
            const { data: fresh } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', currentRoomId)
                .single();
            if (fresh?.state) gameState = fresh.state;
            if (window.YYCardCombat) {
                await window.YYCardCombat.resolveBattles(gameState, log, updateGameState);
            }
        } catch (e) {
            log(`❌ 战斗错误`, true);
        }
    }

    // ==================== UI模式切换 ====================
    async function applyUIMode(isPrepare) {
        document.body.classList.toggle('battle-view-mode', !isPrepare);
        window.YYCardShop?.setPhase(isPrepare ? 'prepare' : 'battle');
        const t1 = document.getElementById('phase-timer');
        const t2 = document.getElementById('phase-timer-battle');
        if (t1) t1.style.display = isPrepare ? 'block' : 'none';
        if (t2) t2.style.display = isPrepare ? 'none' : 'block';
    }

    // ==================== 淘汰与胜负 ====================
    function checkGameOver() {
        const players = gameState.players;
        const alive = Object.values(players).filter(p => p.health > 0 && !p.isEliminated);

        Object.entries(players).forEach(([id, p]) => {
            if (p.health <= 0 && !p.isEliminated) {
                p.isEliminated = true;
                eliminationOrder.push(id);
                const rank = Object.keys(players).length - eliminationOrder.length + 1;
                log(`☠️ 第${rank}名：${id.slice(0,8)}`, false, true);
            }
        });

        if (alive.length <= 1) {
            const winner = alive[0] 
                ? Object.keys(players).find(id => players[id] === alive[0]) 
                : eliminationOrder.at(-1);
            eliminationOrder.push(winner);
            log(`🏆 第一名：${winner.slice(0,8)}`, false, true);
            return { isOver: true, winner };
        }
        return { isOver: false };
    }

    function endGame(winnerId) {
        clearAllTimers();
        toast(`游戏结束！胜者：${winnerId.slice(0,8)}`);
        if (gameSubscription) gameSubscription.unsubscribe();
        setTimeout(() => {
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
        }, 3000);
    }

    // ==================== 重连校准（服务器时间） ====================
    async function fastForwardByServerTime() {
        if (!gameState?.gameStartTime) return;
        await getServerTime();
        const gameStart = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        let elapsed = currentServerTime - gameStart;
        if (elapsed < 0) elapsed = 0;

        let round = 1;
        while (round < 100) {
            const prep = getPrepareDuration(round);
            const battle = getBattleDuration(round);
            const total = prep + BUFFER_DURATION + battle;
            if (elapsed >= total) {
                elapsed -= total;
                round++;
            } else break;
        }

        gameState.round = round;
        await updateGameState();
        const prepDur = getPrepareDuration(round);
        await applyUIMode(true);
        startPhaseCountDown('prepare', prepDur);
    }

    // ==================== 进入游戏 ====================
    async function enterBattle(roomId) {
        currentRoomId = roomId;
        clearAllTimers();
        eliminationOrder = [];

        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initDebugPanel();
        window.YYCardShop?.init();

        // 订阅游戏状态 + 轮询 + 同步服务器时间
        subscribeToGame(roomId);
        startPolling();
        startSyncServerTime();

        // 加载游戏状态
        const loadState = async () => {
            const { data } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', roomId)
                .maybeSingle();
            if (data?.state) {
                gameState = data.state;
                if (!gameState.gameStartTime) {
                    gameState.gameStartTime = new Date().toISOString();
                    await updateGameState();
                }
                await fastForwardByServerTime();
                window.YYCardShop?.refreshAllUI();
                return;
            }
            setTimeout(loadState, 300);
        };
        loadState();
    }

    // ==================== 订阅与轮询 ====================
    function subscribeToGame(roomId) {
        if (gameSubscription) gameSubscription.unsubscribe();
        gameSubscription = supabase.channel(`game:${roomId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'game_states',
                filter: `room_id=eq.${roomId}`
            }, payload => {
                if (isUpdatingFromLocal) return;
                gameState = payload.new.state;
                window.YYCardShop?.refreshAllUI();
            })
            .subscribe();
    }

    function startPolling() {
        stopPolling();
        pollingInterval = setInterval(async () => {
            if (!currentRoomId) return;
            const { data } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', currentRoomId)
                .single();
            if (data?.state) {
                gameState = data.state;
                window.YYCardShop?.refreshAllUI();
            }
        }, 2000);
    }
    function stopPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = null;
    }

    // ==================== 机器人自动升级 ====================
    function startBotAutoPlay() {
        if (autoBotTimer) clearInterval(autoBotTimer);
        autoBotTimer = setInterval(async () => {
            if (!gameState || gameState.phase !== 'prepare') return;
            const uid = auth.currentUser?.id;
            const me = gameState.players[uid];
            if (!me?.isBot || me.shopLevel >= 5) return;
            if (me.gold >= 1) {
                me.gold--; me.exp++;
                me.shopLevel = getShopLevelByExp(me.exp);
                await updateGameState();
            }
        }, 2000);
    }

    // ==================== 对外暴露方法 ====================
    return {
        enterBattle,
        getGameState,
        getCurrentRoomId,
        updateGameState
    };
})();

console.log('✅ battle.js 加载完成（服务器时间自动驱动+自动阶段切换）');

// ==================== 对战系统（绝对时间驱动，阶段自动切换，结算重试） ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;
    let gameSubscription = null;
    let autoBotTimer = null;

    let phaseTimer = null;
    let timerInterval = null;
    let enterGuard = false;

    let isUpdatingFromLocal = false;
    let isInPhaseTransition = false;

    let pollingInterval = null;
    let eliminationOrder = [];

    // 固定时长（秒）
    const BUFFER_DURATION = 3;      // 缓冲期 3 秒
    const SETTLE_DURATION = 3;      // 结算期 3 秒

    // 递增时长公式
    function getPrepareDuration(round) { return 25 + (round - 1) * 10; }
    function getBattleDuration(round) { return 30 + (round - 1) * 5; }

    // ========== 根据游戏开始时间计算当前理论阶段 ==========
    function getCurrentPhaseInfo(gameStartTime, currentRound) {
        const start = new Date(gameStartTime).getTime();
        const now = Date.now();
        let elapsed = Math.floor((now - start) / 1000);
        let round = 1;
        while (true) {
            const prep = getPrepareDuration(round);
            const buf = BUFFER_DURATION;
            const bat = getBattleDuration(round);
            const set = SETTLE_DURATION;
            const total = prep + buf + bat + set;
            if (elapsed >= total) {
                elapsed -= total;
                round++;
            } else {
                if (elapsed < prep) return { round, phase: 'prepare', remaining: prep - elapsed };
                if (elapsed < prep + buf) return { round, phase: 'buffering', remaining: prep + buf - elapsed };
                if (elapsed < prep + buf + bat) return { round, phase: 'battle', remaining: prep + buf + bat - elapsed };
                return { round, phase: 'settle', remaining: total - elapsed };
            }
            if (round > currentRound + 20) break;
        }
        return { round: currentRound, phase: 'prepare', remaining: 0 };
    }

    // 调试面板（保留原样）
    function initDebugPanel() {
        const old = document.getElementById('battle-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'battle-debug-panel';
        p.style.cssText = `
            position:fixed; top:0; left:0; right:0; bottom:0;
            overflow-y:auto;
            color:#7bffb1; font-size:12px; padding:8px; z-index:100000;
            font-family:monospace; pointer-events:none; text-shadow:0 0 4px black;
            background: transparent; border: none;
            display: flex; flex-direction: column-reverse;
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
            setTimeout(() => {
                if (line.parentNode) {
                    line.style.transition = 'opacity 0.5s';
                    line.style.opacity = '0';
                    setTimeout(() => line.remove(), 500);
                }
            }, 60000);
        }
    }

    function toast(msg, isError = false) {
        if (window.YYCardShop?.toast) window.YYCardShop.toast(msg, isError);
        else alert(msg);
    }

    function getGameState() { return gameState; }
    function getCurrentRoomId() { return currentRoomId; }

    async function updateGameState() {
        if (!currentRoomId || !gameState) return;
        const { data: fresh, error } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', currentRoomId)
            .single();
        if (error) return;
        if (fresh?.state) {
            const latestState = fresh.state;
            const myId = auth.currentUser?.id;
            if (myId && gameState.players[myId]) {
                latestState.players[myId] = gameState.players[myId];
            }
            latestState.round = gameState.round;
            latestState.phase = gameState.phase;
            latestState.phaseStartTime = gameState.phaseStartTime;
            latestState.gameStartTime = gameState.gameStartTime;
            gameState = latestState;
        }
        isUpdatingFromLocal = true;
        const { error: updateError } = await supabase
            .from('game_states')
            .update({ state: gameState })
            .eq('room_id', currentRoomId);
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        setTimeout(() => { isUpdatingFromLocal = false; }, 100);
    }

    async function forceRefreshState() {
        if (!currentRoomId) return;
        const { data, error } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', currentRoomId)
            .single();
        if (!error && data?.state) {
            gameState = data.state;
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        }
    }

    function log(msg, isError = false, persistent = false) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        logToScreen(msg, isError, persistent);
    }

    function getShopLevelByExp(exp) {
        if (exp >= 46) return 5;
        if (exp >= 26) return 4;
        if (exp >= 12) return 3;
        if (exp >= 4) return 2;
        return 1;
    }

    function clearAllTimers() {
        if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    }

    // 核心：根据理论剩余时间启动下一阶段切换定时器，并每秒刷新UI倒计时
    function startPhaseTimerFromTheory() {
        if (!gameState || !gameState.gameStartTime) return;
        const info = getCurrentPhaseInfo(gameState.gameStartTime, gameState.round);
        const remaining = Math.max(0, info.remaining);
        // 更新UI倒计时
        if (window.YYCardShop?.updateTimerDisplay) {
            window.YYCardShop.updateTimerDisplay(remaining, info.phase);
        }
        // 清除旧定时器
        if (phaseTimer) clearTimeout(phaseTimer);
        if (timerInterval) clearInterval(timerInterval);
        // 每秒刷新倒计时显示
        timerInterval = setInterval(() => {
            if (!gameState || !gameState.gameStartTime) return;
            const newInfo = getCurrentPhaseInfo(gameState.gameStartTime, gameState.round);
            if (window.YYCardShop?.updateTimerDisplay) {
                window.YYCardShop.updateTimerDisplay(Math.max(0, newInfo.remaining), newInfo.phase);
            }
        }, 200);
        // 设置到期定时器，自动进入下一阶段
        phaseTimer = setTimeout(async () => {
            clearInterval(timerInterval);
            timerInterval = null;
            phaseTimer = null;
            const currentInfo = getCurrentPhaseInfo(gameState.gameStartTime, gameState.round);
            await onPhaseEnd(currentInfo.phase);
        }, remaining * 1000);
    }

    // 结算重试函数：在结算阶段不断调用后端直到成功
    async function callSettlementWithRetry() {
        const maxRetries = 30; // 最多重试 15 秒
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const info = getCurrentPhaseInfo(gameState.gameStartTime, gameState.round);
            if (info.phase !== 'settle') {
                log(`⏭️ 理论阶段已是 ${info.phase}，停止结算调用`, false);
                return;
            }
            if (info.remaining > 0) {
                await new Promise(r => setTimeout(r, 500));
                continue;
            }
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const response = await fetch('https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                    body: JSON.stringify({ roomId: currentRoomId })
                });
                const data = await response.json();
                if (response.ok && data.success) {
                    log(`✅ 结算成功，新回合: ${data.round}`, false);
                    await forceRefreshState();
                    return;
                } else if (data.alreadyProcessed) {
                    log(`✅ 回合已处理，无需重复`, false);
                    await forceRefreshState();
                    return;
                } else {
                    log(`⚠️ 结算失败 (${data.error})，重试 ${attempt+1}`, true);
                }
            } catch (err) {
                log(`❌ 结算异常: ${err.message}，重试 ${attempt+1}`, true);
            }
            await new Promise(r => setTimeout(r, 500));
        }
        log(`❌ 结算重试超时，强制刷新状态`, true);
        await forceRefreshState();
    }

    async function onPhaseEnd(phase) {
        if (isInPhaseTransition) { log(`⚠️ 阶段切换被锁拦截: ${phase}`, true); return; }
        if (!gameState || !currentRoomId) return;
        isInPhaseTransition = true;
        const lockTimeout = setTimeout(() => {
            if (isInPhaseTransition) { log(`⚠️ 阶段切换锁超时，强制释放`, true); isInPhaseTransition = false; }
        }, 12000);
        log(`🔄 阶段结束: ${phase}`);
        try {
            if (phase === 'prepare') {
                // 准备阶段结束，进入缓冲期（UI 禁用操作）
                if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase('buffering');
                // 等待缓冲期结束（固定3秒）
                await new Promise(resolve => setTimeout(resolve, BUFFER_DURATION * 1000));
                // 切换到战斗阶段
                gameState.phase = 'battle';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                await applyUIMode(false);
                startPhaseTimerFromTheory();
                simulateBattle(); // 异步执行战斗模拟
            } else if (phase === 'battle') {
                // 战斗阶段结束，进入结算阶段
                gameState.phase = 'settle';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                await applyUIMode(false);
                startPhaseTimerFromTheory();
            } else if (phase === 'settle') {
                // 结算阶段结束，调用后端发放奖励
                await callSettlementWithRetry();
                const over = checkGameOver();
                if (over.isOver) {
                    endGame(over.winner);
                    clearTimeout(lockTimeout);
                    return;
                }
                // 后端已将 round++ 和 phase 改为 prepare，直接进入准备阶段
                await applyUIMode(true);
                startPhaseTimerFromTheory();
            }
        } catch (e) {
            log(`❌ onPhaseEnd 出错: ${e.message}`, true);
        } finally {
            clearTimeout(lockTimeout);
            isInPhaseTransition = false;
        }
    }

    async function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch(e) {}
        if (window.YYCardShop?.setPhase) {
            window.YYCardShop.setPhase(isPrepare ? 'prepare' : (gameState?.phase === 'settle' ? 'settle' : 'battle'));
        }
        const prepareTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
        if (!isPrepare) {
            const { data: fresh, error } = await supabase.from('game_states').select('state').eq('room_id', currentRoomId).single();
            if (!error && fresh?.state) { gameState = fresh.state; log(`🔄 进入战斗/结算，已同步最新数据`); }
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        }
    }

    async function simulateBattle() {
        try {
            const { data: freshState, error } = await supabase.from('game_states').select('state').eq('room_id', currentRoomId).single();
            if (freshState?.state) gameState = freshState.state;
            if (!window.YYCardCombat) { await updateGameState(); return; }
            await window.YYCardCombat.resolveBattles(gameState, log, updateGameState);
        } catch(e) { await updateGameState(); }
    }

    function checkGameOver() {
        const players = gameState.players;
        const alive = Object.values(players).filter(p => p.health > 0 && !p.isEliminated);
        Object.entries(players).forEach(([id, p]) => {
            if (p.health <= 0 && !p.isEliminated) {
                p.isEliminated = true;
                if (!eliminationOrder.includes(id)) {
                    eliminationOrder.push(id);
                    const totalPlayers = Object.keys(players).length;
                    const rank = totalPlayers - eliminationOrder.length + 1;
                    log(`☠️ 玩家 ${id.slice(0,8)} 被淘汰，获得第 ${rank} 名`, false, true);
                }
            }
        });
        if (alive.length <= 1) {
            const winner = alive[0] ? Object.keys(players).find(id => players[id] === alive[0]) : eliminationOrder[eliminationOrder.length - 1];
            if (alive[0] && !eliminationOrder.includes(winner)) {
                eliminationOrder.push(winner);
                log(`🏆 玩家 ${winner.slice(0,8)} 获得第 1 名`, false, true);
            }
            return { isOver: true, winner };
        }
        return { isOver: false };
    }

    function endGame(winnerId) {
        stopPolling();
        isInPhaseTransition = false;
        const rankings = [...eliminationOrder].reverse();
        let rankMsg = `📋 最终排名：\n`;
        rankings.forEach((id, index) => { rankMsg += `  第${index+1}名: ${id.slice(0,8)}\n`; });
        log(rankMsg, false, true);
        toast(`游戏结束！胜利者: ${winnerId}`);
        clearAllTimers();
        if (autoBotTimer) clearInterval(autoBotTimer);
        if (gameSubscription) gameSubscription.unsubscribe();
        eliminationOrder = [];
        setTimeout(() => {
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
            enterGuard = false;
        }, 3000);
    }

    async function fastForwardAndResume() {
        if (!gameState || !gameState.gameStartTime) return false;
        const info = getCurrentPhaseInfo(gameState.gameStartTime, gameState.round);
        gameState.round = info.round;
        gameState.phase = info.phase;
        // 注意：不补发奖励，因为结算由后端负责
        await updateGameState();
        await applyUIMode(info.phase === 'prepare');
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        clearAllTimers();
        startPhaseTimerFromTheory();
        return true;
    }

    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initDebugPanel();
        eliminationOrder = [];
        let shopReady = false;
        for (let i = 0; i < 30; i++) {
            if (window.YYCardShop && typeof window.YYCardShop.init === 'function') {
                window.YYCardShop.init();
                shopReady = true;
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        if (!shopReady && window.YYCardShop) window.YYCardShop.init();
        subscribeToGame(roomId);
        startPolling();
        bindBattleEvents();
        startBotAutoPlay();
        let attempts = 0; const MAX = 15;
        const wait = async () => {
            if (gameState) {
                if (!gameState.gameStartTime) {
                    gameState.gameStartTime = new Date().toISOString();
                    await updateGameState();
                }
                await fastForwardAndResume();
                return;
            }
            if (attempts < MAX) {
                attempts++;
                const { data } = await supabase.from('game_states').select('state').eq('room_id', roomId).maybeSingle();
                if (data?.state) {
                    gameState = data.state;
                    if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                }
                setTimeout(wait, 200);
            } else { toast('状态加载失败', true); enterGuard = false; }
        };
        wait();
    }

    function subscribeToGame(roomId) {
        if (gameSubscription) gameSubscription.unsubscribe();
        gameSubscription = supabase.channel(`game:${roomId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_states', filter: `room_id=eq.${roomId}` }, (payload) => {
                if (isUpdatingFromLocal) return;
                gameState = payload.new.state;
                applyUIMode(gameState.phase === 'prepare');
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            })
            .subscribe();
    }

    function startPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(async () => {
            if (!currentRoomId || isInPhaseTransition) return;
            const { data, error } = await supabase.from('game_states').select('state').eq('room_id', currentRoomId).single();
            if (error) return;
            if (data?.state) {
                gameState = data.state;
                applyUIMode(gameState.phase === 'prepare');
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            }
        }, 2000);
    }

    function stopPolling() {
        if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    }

    function startBotAutoPlay() {
        if (autoBotTimer) clearInterval(autoBotTimer);
        const bought = {};
        autoBotTimer = setInterval(async () => {
            if (!gameState || gameState.phase !== 'prepare') return;
            const uid = auth.currentUser?.id;
            const my = gameState.players[uid];
            if (!my || !my.isBot) return;
            if (bought[uid] === gameState.round) return;
            if (my.shopLevel >= 5) return;
            if (my.gold >= 1) {
                my.gold--; my.exp++;
                const lvl = getShopLevelByExp(my.exp);
                if (lvl > my.shopLevel) my.shopLevel = lvl;
                await updateGameState();
                bought[uid] = gameState.round;
            }
        }, 2000);
    }

    function bindBattleEvents() {
        document.getElementById('leave-battle-btn')?.addEventListener('click', async () => {
            if(!confirm('确定退出？')) return;
            clearAllTimers();
            stopPolling();
            if (autoBotTimer) clearInterval(autoBotTimer);
            if(window.YYCardMatchmaking?.cancel) await window.YYCardMatchmaking.cancel();
            if(gameSubscription) gameSubscription.unsubscribe();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
            enterGuard = false;
        });
    }

    // 已删除所有玩家操作函数（迁移至 shop.js 调用 Edge Functions）

    return {
        enterBattle,
        getGameState,
        getCurrentRoomId,
        forceRefreshState,
        updateGameState,
    };
})();

console.log('✅ battle.js 加载完成（绝对时间驱动，缓冲期3秒，结算重试）');

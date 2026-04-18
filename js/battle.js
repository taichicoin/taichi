// ==================== 对战系统（后端驱动版：只保留回合状态机、重连、战斗模拟） ====================
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
    let currentPhaseStartTime = 0;
    let currentPhaseDuration = 0;
    let enterGuard = false;

    let isUpdatingFromLocal = false;
    let isInPhaseTransition = false;
    let pollingInterval = null;
    let eliminationOrder = [];

    const BUFFER_DURATION = 2;
    const SETTLE_DURATION = 3;

    function getPrepareDuration(round) { return 25 + (round - 1) * 10; }
    function getBattleDuration(round) { return 30 + (round - 1) * 5; }

    // 调试面板（与原代码相同，省略）
    function initDebugPanel() { /* ... 保持不变 ... */ }
    function logToScreen(msg, isError, persistent) { /* ... 保持不变 ... */ }
    function log(msg, isError, persistent) { /* ... 保持不变 ... */ }
    function toast(msg, isError) { if (window.YYCardShop?.toast) window.YYCardShop.toast(msg, isError); else alert(msg); }
    function getGameState() { return gameState; }

    // 简化版 updateGameState：只用于重连和初始拉取，不自动刷新 UI
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
        if (updateError) log(`写入状态失败: ${updateError.message}`, true);
        setTimeout(() => { isUpdatingFromLocal = false; }, 100);
    }

    function getShopLevelByExp(exp) {
        if (exp >= 46) return 5;
        if (exp >= 26) return 4;
        if (exp >= 12) return 3;
        if (exp >= 4) return 2;
        return 1;
    }

    // 清除计时器
    function clearAllTimers() {
        if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    }

    let safetyTimer = null;
    function startPhaseTimer(phase, duration, skipStateUpdate = false) {
        if (!duration || isNaN(duration) || duration <= 0) {
            let fallback = 0;
            if (phase === 'prepare') fallback = getPrepareDuration(gameState?.round || 1);
            else if (phase === 'battle') fallback = getBattleDuration(gameState?.round || 1);
            else if (phase === 'settle') fallback = SETTLE_DURATION;
            else fallback = 3;
            log(`⚠️ startPhaseTimer 收到无效 duration=${duration}，使用后备值 ${fallback}`, true);
            duration = fallback;
        }
        clearAllTimers();
        currentPhaseDuration = duration;
        if (!skipStateUpdate) {
            gameState.phaseStartTime = new Date().toISOString();
            currentPhaseStartTime = Date.now();
            updateGameState();
        } else {
            currentPhaseStartTime = Date.now() - (getPhaseDuration(phase, gameState.round) - duration) * 1000;
        }
        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(duration, phase);
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - currentPhaseStartTime) / 1000);
            const remaining = Math.max(0, currentPhaseDuration - elapsed);
            if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(remaining, phase);
        }, 100);
        phaseTimer = setTimeout(() => {
            if (safetyTimer) clearTimeout(safetyTimer);
            clearInterval(timerInterval);
            timerInterval = null;
            phaseTimer = null;
            onPhaseEnd(phase);
        }, duration * 1000);
        safetyTimer = setTimeout(() => {
            if (phaseTimer) {
                log(`⚠️ 阶段 ${phase} 超时未响应，强制结束`, true);
                clearTimeout(phaseTimer);
                phaseTimer = null;
                clearInterval(timerInterval);
                timerInterval = null;
                onPhaseEnd(phase);
            }
        }, (duration + 2) * 1000);
    }

    async function startBuffering(targetPhase) {
        log(`⏳ 进入缓冲期 ${BUFFER_DURATION} 秒，准备切换到 ${targetPhase} 阶段`);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase('buffering');
        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(BUFFER_DURATION, 'buffering');
        await new Promise(resolve => setTimeout(resolve, BUFFER_DURATION * 1000));
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(targetPhase);
    }

    async function onPhaseEnd(phase) {
        if (isInPhaseTransition) { log(`⚠️ 阶段切换被锁拦截: ${phase}`, true); return; }
        if (!gameState || !currentRoomId) return;
        isInPhaseTransition = true;
        const lockTimeout = setTimeout(() => { if (isInPhaseTransition) { log(`⚠️ 阶段切换锁超时，强制释放`, true); isInPhaseTransition = false; } }, 12000);
        log(`🔄 阶段结束: ${phase}`);
        try {
            if (phase === 'prepare') {
                await startBuffering('battle');
                gameState.phase = 'battle';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                await applyUIMode(false);
                startPhaseTimer('battle', getBattleDuration(gameState.round));
                await simulateBattle();
            } else if (phase === 'battle') {
                gameState.phase = 'settle';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                await applyUIMode(false);
                startPhaseTimer('settle', SETTLE_DURATION);
            } else if (phase === 'settle') {
                await distributeRoundRewards();
                const over = checkGameOver();
                if (over.isOver) {
                    endGame(over.winner);
                    clearTimeout(lockTimeout);
                    return;
                }
                gameState.round++;
                gameState.phase = 'prepare';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                await applyUIMode(true);
                // 注意：不再调用 refreshAllShops（商店刷新由后端函数控制）
                const newPrepareDur = getPrepareDuration(gameState.round);
                log(`🔁 进入第 ${gameState.round} 回合准备阶段，时长 ${newPrepareDur} 秒`);
                startPhaseTimer('prepare', newPrepareDur);
            }
        } catch (e) {
            log(`❌ onPhaseEnd 出错: ${e.message}`, true);
        } finally {
            clearTimeout(lockTimeout);
            isInPhaseTransition = false;
        }
    }

    async function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch (e) {}
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(isPrepare ? 'prepare' : (gameState?.phase === 'settle' ? 'settle' : 'battle'));
        const prepareTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
        if (!isPrepare) {
            const { data: fresh, error } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', currentRoomId)
                .single();
            if (!error && fresh?.state) {
                gameState = fresh.state;
                log(`🔄 进入战斗/结算，已同步最新数据`);
            }
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        }
    }

    async function simulateBattle() {
        try {
            const { data: freshState } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', currentRoomId)
                .single();
            if (freshState?.state) gameState = freshState.state;
            if (!window.YYCardCombat) {
                await updateGameState();
                return;
            }
            await window.YYCardCombat.resolveBattles(gameState, log, updateGameState);
        } catch (e) {
            log(`❌ 战斗模拟出错: ${e.message}`, true);
        }
    }

    async function distributeRoundRewards() {
        const round = gameState.round;
        const goldAdd = config.ECONOMY.GOLD_PER_ROUND(round);
        const expAdd = config.ECONOMY.EXP_PER_ROUND;
        for (const pid in gameState.players) {
            const p = gameState.players[pid];
            p.gold += goldAdd;
            p.exp += expAdd;
            const newLevel = getShopLevelByExp(p.exp);
            if (newLevel > p.shopLevel) p.shopLevel = newLevel;
        }
        await updateGameState();
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
        rankings.forEach((id, index) => { rankMsg += `  第${index + 1}名: ${id.slice(0,8)}\n`; });
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
        const start = new Date(gameState.gameStartTime).getTime();
        const now = Date.now();
        let elapsed = Math.floor((now - start) / 1000);
        let round = 1, phase = 'prepare', remaining = 0;
        while (true) {
            const prep = getPrepareDuration(round);
            const buf = BUFFER_DURATION;
            const bat = getBattleDuration(round);
            const set = SETTLE_DURATION;
            const total = prep + buf + bat + set;
            if (elapsed >= total) { elapsed -= total; round++; }
            else {
                if (elapsed < prep) { phase = 'prepare'; remaining = prep - elapsed; }
                else if (elapsed < prep + buf) { phase = 'buffering'; remaining = prep + buf - elapsed; }
                else if (elapsed < prep + buf + bat) { phase = 'battle'; remaining = prep + buf + bat - elapsed; }
                else { phase = 'settle'; remaining = total - elapsed; }
                break;
            }
        }
        const oldRound = gameState.round;
        if (round > oldRound) {
            for (let r = oldRound; r < round; r++) {
                const gold = config.ECONOMY.GOLD_PER_ROUND(r);
                const exp = config.ECONOMY.EXP_PER_ROUND;
                for (const pid in gameState.players) {
                    const p = gameState.players[pid];
                    p.gold += gold; p.exp += exp;
                    const lvl = getShopLevelByExp(p.exp);
                    if (lvl > p.shopLevel) p.shopLevel = lvl;
                }
            }
        }
        gameState.round = round;
        gameState.phase = phase;
        gameState.phaseStartTime = new Date(now - (getPhaseDuration(phase, round) - remaining) * 1000).toISOString();
        await updateGameState();
        await applyUIMode(phase === 'prepare');
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        clearAllTimers();
        startPhaseTimer(phase, remaining);
        return true;
    }

    function getPhaseDuration(phase, round) {
        if (phase === 'prepare') return getPrepareDuration(round);
        if (phase === 'buffering') return BUFFER_DURATION;
        if (phase === 'battle') return getBattleDuration(round);
        if (phase === 'settle') return SETTLE_DURATION;
        return 3;
    }

    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;
        // 告诉 shop.js 当前房间 ID
        if (window.YYCardShop?.setRoomId) window.YYCardShop.setRoomId(roomId);
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
                const resumed = await fastForwardAndResume();
                if (!resumed) {
                    const phase = gameState.phase, round = gameState.round;
                    await applyUIMode(phase === 'prepare');
                    if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                    if (gameState.phaseStartTime) {
                        const st = new Date(gameState.phaseStartTime).getTime();
                        const el = Math.floor((Date.now() - st) / 1000);
                        const total = getPhaseDuration(phase, round);
                        const rem = Math.max(0, total - el);
                        if (rem <= 0) onPhaseEnd(phase);
                        else { currentPhaseStartTime = st; startPhaseTimer(phase, rem, true); }
                    } else startPhaseTimer(phase, getPhaseDuration(phase, round));
                }
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
            } else {
                toast('状态加载失败', true);
                enterGuard = false;
            }
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
            const { data, error } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', currentRoomId)
                .single();
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

    // 机器人自动操作（暂时保留原有逻辑，后续可改为调用后端接口）
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

    // 对外暴露的接口（只保留必要的）
    return {
        enterBattle,
        getGameState,
        // 注意：不再暴露任何操作函数（如 buyExpAction 等）
    };
})();

console.log('✅ battle.js 加载完成（后端驱动版，操作已迁移至 Edge Functions）');

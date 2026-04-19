// ==================== 对战系统【纯时间驱动 + 后端结算 + 移除所有本地卡牌操作】 ====================
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

    // 轮询相关
    let pollingInterval = null;
    
    // 淘汰顺序
    let eliminationOrder = [];

    // 固定时长
    const BUFFER_DURATION = 2;
    const SETTLE_DURATION = 3;
    const SETTLEMENT_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

    // 递增时长公式
    function getPrepareDuration(round) { return 25 + (round - 1) * 10; }
    function getBattleDuration(round) { return 30 + (round - 1) * 5; }

    // 调试面板
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

    // 强制从后端拉取最新状态（shop.js调用）
    async function forceRefreshState() {
        if (!currentRoomId) return;
        const { data: fresh, error } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', currentRoomId)
            .single();
        if (!error && fresh?.state) {
            gameState = fresh.state;
        }
    }

    // 仅同步最新状态，不本地修改
    async function updateGameState() {
        if (!currentRoomId) return;
        await forceRefreshState();
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
    }

    function log(msg, isError = false, persistent = false) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        logToScreen(msg, isError, persistent);
    }

    // 清除所有计时器
    function clearAllTimers() {
        if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    }

    // 安全计时器
    let safetyTimer = null;
    function startPhaseTimer(phase, duration, skipStateUpdate = false) {
        if (!duration || isNaN(duration) || duration <= 0) {
            let fallback = 0;
            if (phase === 'prepare') fallback = getPrepareDuration(gameState?.round || 1);
            else if (phase === 'battle') fallback = getBattleDuration(gameState?.round || 1);
            else if (phase === 'settle') fallback = SETTLE_DURATION;
            else fallback = 3;
            log(`⚠️ 无效时长，使用后备值 ${fallback}`, true);
            duration = fallback;
        }
        
        clearAllTimers();
        
        currentPhaseDuration = duration;
        if (!skipStateUpdate) {
            gameState.phaseStartTime = new Date().toISOString();
            currentPhaseStartTime = Date.now();
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
            clearInterval(timerInterval);
            timerInterval = null;
            phaseTimer = null;
            onPhaseEnd(phase);
        }, duration * 1000);
        
        safetyTimer = setTimeout(() => {
            if (phaseTimer) {
                log(`⚠️ 阶段超时强制结束`, true);
                clearTimeout(phaseTimer);
                phaseTimer = null;
                clearInterval(timerInterval);
                timerInterval = null;
                onPhaseEnd(phase);
            }
        }, (duration + 2) * 1000);
    }

    // 缓冲期
    async function startBuffering(targetPhase) {
        log(`⏳ 缓冲期 ${BUFFER_DURATION}s → ${targetPhase}`);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase('buffering');
        if (window.YYCardShop?.updateTimerDisplay) {
            window.YYCardShop.updateTimerDisplay(BUFFER_DURATION, 'buffering');
        }
        await new Promise(resolve => setTimeout(resolve, BUFFER_DURATION * 1000));
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(targetPhase);
    }

    // 调用后端结算接口
    async function callSettlement() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) return false;

            const res = await fetch(SETTLEMENT_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            const data = await res.json();
            if (data.success) {
                log(`✅ 后端结算完成，回合已推进`);
                await updateGameState();
                return true;
            } else {
                log(`❌ 结算失败：${data.error}`, true);
                return false;
            }
        } catch (e) {
            log(`❌ 结算接口异常：${e.message}`, true);
            return false;
        }
    }

    // 阶段结束
    async function onPhaseEnd(phase) {
        if (isInPhaseTransition || !gameState || !currentRoomId) return;
        isInPhaseTransition = true;
        
        const lockTimeout = setTimeout(() => { isInPhaseTransition = false; }, 12000);
        log(`🔄 阶段结束：${phase}`);
        
        try {
            if (phase === 'prepare') {
                await startBuffering('battle');
                gameState.phase = 'battle';
                await updateGameState();
                await applyUIMode(false);
                startPhaseTimer('battle', getBattleDuration(gameState.round));
                await simulateBattle();
            } 
            else if (phase === 'battle') {
                gameState.phase = 'settle';
                await updateGameState();
                await applyUIMode(false);
                startPhaseTimer('settle', SETTLE_DURATION);
            } 
            else if (phase === 'settle') {
                // 全部交给后端结算：奖励+等级+商店+回合
                await callSettlement();
                const over = checkGameOver();
                if (over.isOver) {
                    endGame(over.winner);
                    clearTimeout(lockTimeout);
                    isInPhaseTransition = false;
                    return;
                }
                await applyUIMode(true);
                startPhaseTimer('prepare', getPrepareDuration(gameState.round));
            }
        } catch (e) {
            log(`❌ 阶段切换错误：${e.message}`, true);
        } finally {
            clearTimeout(lockTimeout);
            isInPhaseTransition = false;
        }
    }

    // UI模式切换
    async function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch (e) {}
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(isPrepare ? 'prepare' : (gameState?.phase === 'settle' ? 'settle' : 'battle'));
        
        const prepareTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
        
        if (!isPrepare) await updateGameState();
    }

    // 战斗模拟
    async function simulateBattle() {
        try {
            await updateGameState();
            if (window.YYCardCombat) {
                await window.YYCardCombat.resolveBattles(gameState, log, updateGameState);
            }
        } catch (e) {
            log(`❌ 战斗异常：${e.message}`, true);
        }
    }

    // 淘汰检测
    function checkGameOver() {
        const players = gameState.players;
        const alive = Object.values(players).filter(p => p.health > 0 && !p.isEliminated);
        
        Object.entries(players).forEach(([id, p]) => {
            if (p.health <= 0 && !p.isEliminated) {
                p.isEliminated = true;
                if (!eliminationOrder.includes(id)) {
                    eliminationOrder.push(id);
                    const total = Object.keys(players).length;
                    const rank = total - eliminationOrder.length + 1;
                    log(`☠️ ${id.slice(0,8)} 淘汰，第${rank}名`, false, true);
                }
            }
        });
        
        if (alive.length <= 1) {
            const winner = alive[0] ? Object.keys(players).find(id => players[id] === alive[0]) : eliminationOrder.at(-1);
            if (winner && !eliminationOrder.includes(winner)) {
                eliminationOrder.push(winner);
                log(`🏆 ${winner.slice(0,8)} 第一名`, false, true);
            }
            return { isOver: true, winner };
        }
        return { isOver: false };
    }

    // 游戏结束
    function endGame(winnerId) {
        stopPolling();
        isInPhaseTransition = false;
        clearAllTimers();
        
        const ranks = [...eliminationOrder].reverse();
        let str = '📋 最终排名：\n';
        ranks.forEach((id, i) => str += `  第${i+1}名: ${id.slice(0,8)}\n`);
        log(str, false, true);
        
        toast(`游戏结束！胜者：${winnerId}`);
        if (autoBotTimer) clearInterval(autoBotTimer);
        if (gameSubscription) gameSubscription.unsubscribe();
        
        setTimeout(() => {
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
            enterGuard = false;
            eliminationOrder = [];
        }, 3000);
    }

    // 重连快进
    async function fastForwardAndResume() {
        if (!gameState?.gameStartTime) return false;
        const start = new Date(gameState.gameStartTime).getTime();
        const now = Date.now();
        let elapsed = Math.floor((now - start) / 1000);
        let round = 1, phase = 'prepare', rem = 0;

        while (true) {
            const prep = getPrepareDuration(round);
            const buf = BUFFER_DURATION;
            const bat = getBattleDuration(round);
            const set = SETTLE_DURATION;
            const total = prep + buf + bat + set;
            if (elapsed >= total) { elapsed -= total; round++; }
            else {
                if (elapsed < prep) { phase = 'prepare'; rem = prep - elapsed; }
                else if (elapsed < prep+buf) { phase = 'buffering'; rem = prep+buf - elapsed; }
                else if (elapsed < prep+buf+bat) { phase = 'battle'; rem = prep+buf+bat - elapsed; }
                else { phase = 'settle'; rem = total - elapsed; }
                break;
            }
        }

        gameState.round = round;
        gameState.phase = phase;
        await updateGameState();
        await applyUIMode(phase === 'prepare');
        clearAllTimers();
        startPhaseTimer(phase, rem, true);
        return true;
    }

    function getPhaseDuration(phase, round) {
        if (phase === 'prepare') return getPrepareDuration(round);
        if (phase === 'buffering') return BUFFER_DURATION;
        if (phase === 'battle') return getBattleDuration(round);
        if (phase === 'settle') return SETTLE_DURATION;
        return 3;
    }

    // 进入对局
    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;
        
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initDebugPanel();
        eliminationOrder = [];

        // 初始化商店UI
        for (let i=0; i<30; i++) {
            if (window.YYCardShop) { window.YYCardShop.init(); break; }
            await new Promise(r => setTimeout(r, 100));
        }

        subscribeToGame(roomId);
        startPolling();
        bindBattleEvents();

        // 加载状态
        let att = 0;
        const load = async () => {
            if (gameState) {
                if (!gameState.gameStartTime) {
                    gameState.gameStartTime = new Date().toISOString();
                }
                await fastForwardAndResume();
                enterGuard = false;
                return;
            }
            if (att++ >= 15) { toast('加载失败'); enterGuard = false; return; }
            const { data } = await supabase.from('game_states').select('state').eq('room_id', roomId).maybeSingle();
            if (data?.state) {
                gameState = data.state;
                await updateGameState();
            }
            setTimeout(load, 200);
        };
        load();
    }

    // 实时订阅
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
                updateGameState();
            })
            .subscribe();
    }

    // 轮询保底
    function startPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(async () => {
            if (!currentRoomId || isInPhaseTransition) return;
            await updateGameState();
        }, 2000);
    }

    function stopPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = null;
    }

    // BOT自动升级
    function startBotAutoPlay() {
        if (autoBotTimer) clearInterval(autoBotTimer);
        autoBotTimer = setInterval(async () => {
            if (!gameState || gameState.phase !== 'prepare') return;
            const uid = auth.currentUser?.id;
            const me = gameState.players[uid];
            if (!me?.isBot) return;
        }, 2000);
    }

    // 退出按钮
    function bindBattleEvents() {
        document.getElementById('leave-battle-btn')?.addEventListener('click', () => {
            if(!confirm('确定退出？')) return;
            clearAllTimers();
            stopPolling();
            if (autoBotTimer) clearInterval(autoBotTimer);
            if (gameSubscription) gameSubscription.unsubscribe();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
            enterGuard = false;
        });
    }

    return {
        enterBattle,
        getGameState,
        getCurrentRoomId,
        updateGameState,
        forceRefreshState
    };
})();

console.log('✅ battle.js 加载完成（后端结算 + 无本地卡牌操作）');

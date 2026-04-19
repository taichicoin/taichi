// ==================== 对战系统【基于 gameStartTime 推算 + 状态机根治锁 + 强制同步UI + 轮询保底 + 缓冲期 + 淘汰名次 + 重连修复 + 递增回合+固定缓冲/结算】 ====================
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

    const SETTLEMENT_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

    // 调试面板（保持不变）
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

    async function fetchGameState() {
        if (!currentRoomId) return null;
        const { data, error } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', currentRoomId)
            .single();
        if (error) {
            log(`❌ 拉取状态失败: ${error.message}`, true);
            return null;
        }
        gameState = data.state;
        return gameState;
    }

    async function updatePhaseToDB() {
        if (!currentRoomId || !gameState) return;
        const { error } = await supabase
            .from('game_states')
            .update({ state: gameState })
            .eq('room_id', currentRoomId);
        if (error) log(`❌ 更新阶段失败: ${error.message}`, true);
    }

    async function forceRefreshState() {
        await fetchGameState();
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
    }

    function log(msg, isError = false, persistent = false) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        logToScreen(msg, isError, persistent);
    }

    let safetyTimer = null;
    function clearAllTimers() {
        if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    }

    function startPhaseTimer(phase, duration, skipStateUpdate = false) {
        if (!duration || isNaN(duration) || duration <= 0) {
            let fallback = 0;
            if (phase === 'prepare') fallback = getPrepareDuration(gameState?.round || 1);
            else if (phase === 'battle') fallback = getBattleDuration(gameState?.round || 1);
            else if (phase === 'settle') fallback = SETTLE_DURATION;
            else fallback = 3;
            log(`⚠️ startPhaseTimer 无效 duration，使用后备 ${fallback}`, true);
            duration = fallback;
        }
        clearAllTimers();
        currentPhaseDuration = duration;
        if (!skipStateUpdate) {
            gameState.phaseStartTime = new Date().toISOString();
            currentPhaseStartTime = Date.now();
            updatePhaseToDB();
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
                log(`⚠️ 阶段 ${phase} 超时强制结束`, true);
                clearTimeout(phaseTimer);
                phaseTimer = null;
                clearInterval(timerInterval);
                timerInterval = null;
                onPhaseEnd(phase);
            }
        }, (duration + 2) * 1000);
    }

    async function startBuffering(targetPhase) {
        log(`⏳ 缓冲期 ${BUFFER_DURATION} 秒 → ${targetPhase}`);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase('buffering');
        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(BUFFER_DURATION, 'buffering');
        await new Promise(resolve => setTimeout(resolve, BUFFER_DURATION * 1000));
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(targetPhase);
    }

    async function callSettlement() {
        if (!currentRoomId) return false;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const accessToken = session?.access_token;
            if (!accessToken) { log('❌ 无 access token', true); return false; }
            const response = await fetch(SETTLEMENT_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            const result = await response.json();
            if (!response.ok || !result.success) { log(`❌ settlement 失败: ${result.error}`, true); return false; }
            log(`✅ settlement 成功，新回合: ${result.round}`);
            return true;
        } catch (err) { log(`❌ settlement 异常: ${err.message}`, true); return false; }
    }

    async function onPhaseEnd(phase) {
        if (isInPhaseTransition) { log(`⚠️ 阶段切换被锁: ${phase}`, true); return; }
        if (!gameState || !currentRoomId) return;
        isInPhaseTransition = true;
        const lockTimeout = setTimeout(() => { if (isInPhaseTransition) { log(`⚠️ 阶段切换锁超时强制释放`, true); isInPhaseTransition = false; } }, 12000);
        log(`🔄 阶段结束: ${phase}`);
        try {
            if (phase === 'prepare') {
                await startBuffering('battle');
                gameState.phase = 'battle';
                gameState.phaseStartTime = new Date().toISOString();
                await updatePhaseToDB();
                await applyUIMode(false);
                startPhaseTimer('battle', getBattleDuration(gameState.round));
                await simulateBattle();
            } else if (phase === 'battle') {
                gameState.phase = 'settle';
                gameState.phaseStartTime = new Date().toISOString();
                await updatePhaseToDB();
                await applyUIMode(false);
                startPhaseTimer('settle', SETTLE_DURATION);
            } else if (phase === 'settle') {
                const success = await callSettlement();
                if (!success) await fetchGameState();
                else await fetchGameState();
                const over = checkGameOver();
                if (over.isOver) { endGame(over.winner); clearTimeout(lockTimeout); return; }
                if (gameState.phase !== 'prepare') {
                    gameState.phase = 'prepare';
                    gameState.phaseStartTime = new Date().toISOString();
                    await updatePhaseToDB();
                }
                await applyUIMode(true);
                const newPrepareDur = getPrepareDuration(gameState.round);
                log(`🔁 第 ${gameState.round} 回合准备阶段，时长 ${newPrepareDur} 秒`);
                startPhaseTimer('prepare', newPrepareDur);
            }
        } catch (e) { log(`❌ onPhaseEnd 出错: ${e.message}`, true); }
        finally { clearTimeout(lockTimeout); isInPhaseTransition = false; }
    }

    async function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch(e) {}
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(isPrepare ? 'prepare' : (gameState?.phase === 'settle' ? 'settle' : 'battle'));
        const prepareTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
        if (!isPrepare) {
            await fetchGameState();
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        }
    }

    async function simulateBattle() {
        try {
            await fetchGameState();
            if (!window.YYCardCombat) { log('❌ 战斗模块未加载', true); return; }
            await window.YYCardCombat.resolveBattles(gameState, log, async () => {
                if (currentRoomId && gameState) {
                    await supabase.from('game_states').update({ state: gameState }).eq('room_id', currentRoomId);
                }
            });
        } catch (e) { log(`❌ 战斗模拟出错: ${e.message}`, true); }
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

    // ==================== 核心修复：完全基于 gameStartTime 推算 ====================
    function getPhaseDuration(phase, round) {
        if (phase === 'prepare') return getPrepareDuration(round);
        if (phase === 'buffering') return BUFFER_DURATION;
        if (phase === 'battle') return getBattleDuration(round);
        if (phase === 'settle') return SETTLE_DURATION;
        return 3;
    }

    // 给定起始时间戳（毫秒），计算当前应该处于哪个回合、哪个阶段、剩余秒数
    function calculateCurrentPhase(gameStartTimeMs) {
        const now = Date.now();
        let elapsed = Math.floor((now - gameStartTimeMs) / 1000);
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
                if (elapsed < prep) {
                    return { round, phase: 'prepare', remaining: prep - elapsed };
                } else if (elapsed < prep + buf) {
                    return { round, phase: 'buffering', remaining: prep + buf - elapsed };
                } else if (elapsed < prep + buf + bat) {
                    return { round, phase: 'battle', remaining: prep + buf + bat - elapsed };
                } else {
                    return { round, phase: 'settle', remaining: total - elapsed };
                }
            }
            if (round > 100) break;
        }
        return { round: 1, phase: 'prepare', remaining: getPrepareDuration(1) };
    }

    async function fastForwardAndResume() {
        if (!gameState || !gameState.gameStartTime) {
            log('❌ fastForwardAndResume: 缺少 gameStartTime', true);
            return false;
        }
        const gameStartTimeMs = new Date(gameState.gameStartTime).getTime();
        const { round: targetRound, phase: targetPhase, remaining } = calculateCurrentPhase(gameStartTimeMs);
        
        log(`📡 重连计算: 当前应处于 第${targetRound}回合 ${targetPhase} 阶段, 剩余${remaining}秒`);
        
        // 如果推算出的回合数大于本地存储的回合数，说明错过了结算，需要拉取最新状态（后端已推进）
        if (targetRound > gameState.round) {
            log(`⏩ 回合落后 (本地${gameState.round} -> 实际${targetRound})，拉取最新状态`);
            await fetchGameState();
            // 拉取后重新计算（因为 gameState.round 已更新，且可能 phaseStartTime 已修正）
            if (gameState.gameStartTime) {
                const newCalc = calculateCurrentPhase(new Date(gameState.gameStartTime).getTime());
                if (newCalc.round !== targetRound || newCalc.phase !== targetPhase) {
                    // 如果仍有差异，直接使用最新推算
                    gameState.round = newCalc.round;
                    gameState.phase = newCalc.phase;
                    gameState.phaseStartTime = new Date(Date.now() - (getPhaseDuration(newCalc.phase, newCalc.round) - newCalc.remaining) * 1000).toISOString();
                    await updatePhaseToDB();
                }
            }
        } else {
            // 回合一致，直接更新本地阶段信息（避免依赖数据库中可能过时的 phaseStartTime）
            gameState.round = targetRound;
            gameState.phase = targetPhase;
            // 根据剩余时间反推 phaseStartTime（用于计时器显示）
            const phaseDuration = getPhaseDuration(targetPhase, targetRound);
            const now = Date.now();
            gameState.phaseStartTime = new Date(now - (phaseDuration - remaining) * 1000).toISOString();
            await updatePhaseToDB();
        }
        
        // 刷新 UI
        await applyUIMode(gameState.phase === 'prepare');
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        clearAllTimers();
        
        if (remaining <= 0) {
            log(`⏩ 阶段 ${gameState.phase} 已过期，立即触发切换`, false);
            onPhaseEnd(gameState.phase);
        } else {
            log(`⏱️ 启动计时器: 阶段=${gameState.phase}, 剩余=${remaining}秒`);
            startPhaseTimer(gameState.phase, remaining, true);
        }
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
                    await updatePhaseToDB();
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
        autoBotTimer = setInterval(async () => {}, 2000);
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

    return {
        enterBattle,
        getGameState,
        getCurrentRoomId,
        forceRefreshState,
        fetchGameState,
    };
})();

console.log('✅ battle.js 加载完成（重连完全基于 gameStartTime 推算，修复战斗阶段刷新从头开始的问题）');

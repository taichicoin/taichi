// ==================== 对战系统【服务器时间驱动 + 后端结算 + 强制推进】 ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;
    let gameSubscription = null;
    let autoBotTimer = null;

    let phaseTimer = null;
    let timerInterval = null;
    let currentPhaseEndServerTime = 0;
    let enterGuard = false;

    let isUpdatingFromLocal = false;
    let isInPhaseTransition = false;

    let pollingInterval = null;
    let eliminationOrder = [];

    const BUFFER_DURATION = 3;
    function getPrepareDuration(round) { return 27 + (round - 1) * 10; }
    function getBattleDuration(round) { return 30 + (round - 1) * 5; }

    const SETTLEMENT_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

    function getGameState() { return gameState; }
    function getCurrentRoomId() { return currentRoomId; }

    async function getServerTimeSeconds() {
        try {
            const { data, error } = await supabase.rpc('get_server_time');
            if (error) throw error;
            return data;
        } catch (err) {
            console.error('获取服务器时间失败，使用本地时间', err);
            return Math.floor(Date.now() / 1000);
        }
    }
    async function getServerTimeMs() { return (await getServerTimeSeconds()) * 1000; }

    async function fetchGameState() {
        if (!currentRoomId) return null;
        const { data, error } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', currentRoomId)
            .maybeSingle();
        if (error) { log(`❌ 拉取状态失败: ${error.message}`, true); return null; }
        if (!data?.state) { log(`⚠️ 未找到游戏状态`, true); return null; }
        gameState = data.state;
        return gameState;
    }

    async function updatePhaseToDB() {
        if (!currentRoomId || !gameState) return;
        isUpdatingFromLocal = true;
        const { error } = await supabase
            .from('game_states')
            .update({ state: gameState })
            .eq('room_id', currentRoomId);
        isUpdatingFromLocal = false;
        if (error) log(`❌ 更新阶段失败: ${error.message}`, true);
    }

    async function forceRefreshState() {
        await fetchGameState();
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
    }

    let safetyTimer = null;
    function clearAllTimers() {
        if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    }

    async function startPhaseTimerFromEndTime(phaseEndTimeMs) {
        const nowServer = await getServerTimeMs();
        let remaining = Math.max(0, Math.floor((phaseEndTimeMs - nowServer) / 1000));
        const phase = gameState.phase;
        if (remaining <= 0) {
            log(`⏱️ 阶段 ${phase} 剩余时间 ≤0，立即触发结束`, false);
            onPhaseEnd(phase);
            return;
        }
        clearAllTimers();
        currentPhaseEndServerTime = phaseEndTimeMs;
        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(remaining, phase);
        timerInterval = setInterval(async () => {
            const now = await getServerTimeMs();
            const rem = Math.max(0, Math.floor((currentPhaseEndServerTime - now) / 1000));
            if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(rem, phase);
        }, 1000);
        phaseTimer = setTimeout(() => {
            if (safetyTimer) clearTimeout(safetyTimer);
            clearInterval(timerInterval);
            timerInterval = null;
            phaseTimer = null;
            onPhaseEnd(phase);
        }, remaining * 1000);
        safetyTimer = setTimeout(() => {
            if (phaseTimer) {
                log(`⚠️ 阶段 ${phase} 超时强制结束`, true);
                clearTimeout(phaseTimer);
                phaseTimer = null;
                clearInterval(timerInterval);
                timerInterval = null;
                onPhaseEnd(phase);
            }
        }, (remaining + 2) * 1000);
    }

    async function calculateCurrentPhaseFromStart() {
        if (!gameState || !gameState.gameStartTime) return null;
        const gameStartSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const nowSec = await getServerTimeSeconds();
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
                let phase, remaining;
                if (elapsed < prep) { phase = 'prepare'; remaining = prep - elapsed; }
                else if (elapsed < prep + buf) { phase = 'buffering'; remaining = prep + buf - elapsed; }
                else { phase = 'battle'; remaining = prep + buf + bat - elapsed; }
                return { round, phase, remaining };
            }
        }
        return { round: 1, phase: 'prepare', remaining: getPrepareDuration(1) };
    }

    async function fastForwardAndResume() {
        if (!gameState || !gameState.gameStartTime) return false;

        // 只读取，不覆盖！！！这是修复核心
        const { round, phase, remaining } = await calculateCurrentPhaseFromStart();
        log(`📡 重连计算: 第${round}回合 ${phase} 剩余${remaining}秒`);

        await applyUIMode(gameState.phase === 'prepare');
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();

        clearAllTimers();

        if (gameState.phaseEndTime) {
            const endTimeMs = new Date(gameState.phaseEndTime).getTime();
            await startPhaseTimerFromEndTime(endTimeMs);
        } else {
            const nowServer = await getServerTimeMs();
            const dur = getPhaseDuration(gameState.phase, gameState.round);
            await startPhaseTimerFromEndTime(nowServer + dur * 1000);
        }

        return true;
    }

    function getPhaseDuration(phase, round) {
        if (phase === 'prepare') return getPrepareDuration(round);
        if (phase === 'buffering') return BUFFER_DURATION;
        if (phase === 'battle') return getBattleDuration(round);
        return 3;
    }

    async function callSettlement(retry = 0) {
        if (!currentRoomId) return false;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { log('❌ 无 session，无法调用结算', true); return false; }
            const res = await fetch(SETTLEMENT_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.error || '结算失败');
            log(`✅ settlement 成功，新回合: ${result.newRound || result.round}`);
            return true;
        } catch (err) {
            log(`❌ settlement 失败 (尝试 ${retry+1}/3): ${err.message}`, true);
            if (retry < 2) {
                await new Promise(r => setTimeout(r, 1000));
                return callSettlement(retry + 1);
            }
            return false;
        }
    }

    async function startBuffering(targetPhase) {
        log(`⏳ 缓冲期 ${BUFFER_DURATION}s → ${targetPhase}`);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase('buffering');
        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(BUFFER_DURATION, 'buffering');
        await new Promise(resolve => setTimeout(resolve, BUFFER_DURATION * 1000));
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(targetPhase);
    }

    async function onPhaseEnd(phase) {
        if (isInPhaseTransition) { log(`⚠️ 阶段切换被锁: ${phase}`, true); return; }
        if (!gameState || !currentRoomId) return;
        isInPhaseTransition = true;
        const lockTimeout = setTimeout(() => {
            if (isInPhaseTransition) { log(`⚠️ 阶段切换锁超时强制释放`, true); isInPhaseTransition = false; }
        }, 12000);
        log(`🔄 阶段结束: ${phase}`);

        try {
            if (phase === 'prepare') {
                await startBuffering('battle');
                gameState.phase = 'battle';
                const nowServer = await getServerTimeMs();
                const battleDur = getBattleDuration(gameState.round);
                const phaseEndTime = nowServer + battleDur * 1000;
                gameState.phaseStartTime = new Date(nowServer).toISOString();
                gameState.phaseEndTime = new Date(phaseEndTime).toISOString();
                await updatePhaseToDB();
                await applyUIMode(false);
                await startPhaseTimerFromEndTime(phaseEndTime);
                await simulateBattle();
            } else if (phase === 'battle') {
                log(`⚔️ 战斗阶段结束，调用结算接口...`);
                const settled = await callSettlement();
                await fetchGameState();
                const over = checkGameOver();
                if (over.isOver) { endGame(over.winner); clearTimeout(lockTimeout); return; }

                if (gameState.phase === 'prepare') {
                    await applyUIMode(true);
                    if (gameState.phaseEndTime) {
                        await startPhaseTimerFromEndTime(new Date(gameState.phaseEndTime).getTime());
                    } else {
                        const nowServer = await getServerTimeMs();
                        const prepareDur = getPrepareDuration(gameState.round);
                        const phaseEndTime = nowServer + prepareDur * 1000;
                        await startPhaseTimerFromEndTime(phaseEndTime);
                    }
                } else {
                    // 结算失败时，不再乱改回合，只停在当前
                    log(`⚠️ 结算接口未更新状态，等待后端同步`, true);
                    const nowServer = await getServerTimeMs();
                    await startPhaseTimerFromEndTime(nowServer + 5000);
                    if (window.YYCardShop?.toast) window.YYCardShop.toast('结算异常，等待同步', true);
                }
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
            await fetchGameState();
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        }
    }

    async function simulateBattle() {
        try {
            await fetchGameState();
            if (!window.YYCardCombat) { log('❌ 战斗模块未加载', true); return; }
            await window.YYCardCombat.resolveBattles(gameState, log, async () => {
                if (currentRoomId && gameState) await updatePhaseToDB();
            });
        } catch (e) {
            log(`❌ 战斗模拟出错: ${e.message}`, true);
        }
    }

    function checkGameOver() {
        if (!gameState?.players) return { isOver: false };
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
                enterGuard = false;
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
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'game_states',
                filter: `room_id=eq.${roomId}`
            }, (payload) => {
                if (isUpdatingFromLocal) return;
                if (isInPhaseTransition) return;

                const oldPhase = gameState?.phase;
                gameState = payload.new.state;

                // 只有阶段真正变化时才刷新UI，不闪屏
                if (gameState.phase !== oldPhase) {
                    applyUIMode(gameState.phase === 'prepare');
                    clearAllTimers();
                    if (gameState.phaseEndTime) {
                        startPhaseTimerFromEndTime(new Date(gameState.phaseEndTime).getTime());
                    }
                }

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
                .maybeSingle();
            if (error || !data?.state) return;
            if (isUpdatingFromLocal) return;

            const oldPhase = gameState?.phase;
            gameState = data.state;

            if (gameState.phase !== oldPhase) {
                applyUIMode(gameState.phase === 'prepare');
                clearAllTimers();
                if (gameState.phaseEndTime) {
                    startPhaseTimerFromEndTime(new Date(gameState.phaseEndTime).getTime());
                }
            }

            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        }, 2000);
    }

    function stopPolling() { if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; } }
    function startBotAutoPlay() { if (autoBotTimer) clearInterval(autoBotTimer); autoBotTimer = setInterval(async () => {}, 2000); }
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

    function initDebugPanel() {
        const old = document.getElementById('battle-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'battle-debug-panel';
        p.style.cssText = `position:fixed; top:0; left:0; right:0; bottom:0; overflow-y:auto; color:#7bffb1; font-size:12px; padding:8px; z-index:100000; font-family:monospace; pointer-events:none; text-shadow:0 0 4px black; background:transparent; border:none; display:flex; flex-direction:column-reverse;`;
        document.body.appendChild(p);
        return p;
    }
    function logToScreen(msg, isError, persistent) {
        const p = document.getElementById('battle-debug-panel') || initDebugPanel();
        const line = document.createElement('div');
        line.style.color = isError ? '#ff7b7b' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
        p.insertBefore(line, p.firstChild);
        while (p.children.length > 100) p.removeChild(p.lastChild);
        if (persistent) setTimeout(() => { if (line.parentNode) { line.style.transition = 'opacity 0.5s'; line.style.opacity = '0'; setTimeout(() => line.remove(), 500); } }, 60000);
    }
    function toast(msg, isError) {
        if (window.YYCardShop?.toast) window.YYCardShop.toast(msg, isError);
        else alert(msg);
    }
    function log(msg, isError, persistent) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        logToScreen(msg, isError, persistent);
    }

    return {
        enterBattle,
        getGameState,
        getCurrentRoomId,
        forceRefreshState,
        fetchGameState,
    };
})();

console.log('✅ battle.js 加载完成（强制推进 + 结算失败保底）');

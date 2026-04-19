// ==================== 对战系统【纯时间驱动版 + 状态机根治锁 + 强制同步UI + 轮询保底 + 缓冲期 + 淘汰名次 + 重连修复 + 递增回合+固定缓冲/结算】 ====================
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

    // 轮询相关变量
    let pollingInterval = null;
    
    // 淘汰顺序记录
    let eliminationOrder = [];

    // 固定缓冲期和结算期（秒）
    const BUFFER_DURATION = 2;
    const SETTLE_DURATION = 3;

    // 递增时长公式
    function getPrepareDuration(round) { return 25 + (round - 1) * 10; }
    function getBattleDuration(round) { return 30 + (round - 1) * 5; }

    // 后端 settlement 函数 URL
    const SETTLEMENT_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

    // 调试面板（全屏可滚动）
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

    // ===== 从数据库拉取最新状态（纯读取） =====
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

    // ===== 仅更新阶段信息到数据库（不覆盖玩家数据） =====
    async function updatePhaseToDB() {
        if (!currentRoomId || !gameState) return;
        const { error } = await supabase
            .from('game_states')
            .update({ state: gameState })
            .eq('room_id', currentRoomId);
        if (error) {
            log(`❌ 更新阶段失败: ${error.message}`, true);
        }
    }

    // 强制刷新 UI（供 shop.js 调用）
    async function forceRefreshState() {
        await fetchGameState();
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
    }

    function log(msg, isError = false, persistent = false) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        logToScreen(msg, isError, persistent);
    }

    // 清除所有计时器
    let safetyTimer = null;
    function clearAllTimers() {
        if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    }

    // 安全启动计时器
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
                log(`⚠️ 阶段 ${phase} 超时未响应，强制结束`, true);
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
        log(`⏳ 进入缓冲期 ${BUFFER_DURATION} 秒，准备切换到 ${targetPhase} 阶段`);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase('buffering');
        if (window.YYCardShop?.updateTimerDisplay) {
            window.YYCardShop.updateTimerDisplay(BUFFER_DURATION, 'buffering');
        }
        await new Promise(resolve => setTimeout(resolve, BUFFER_DURATION * 1000));
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(targetPhase);
    }

    // 调用后端 settlement 函数（发放奖励、刷新商店、推进回合）
    async function callSettlement() {
        if (!currentRoomId) return false;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const accessToken = session?.access_token;
            if (!accessToken) {
                log('❌ 无法获取 access token', true);
                return false;
            }
            const response = await fetch(SETTLEMENT_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                log(`❌ settlement 失败: ${result.error}`, true);
                return false;
            }
            log(`✅ settlement 成功，新回合: ${result.round}`);
            return true;
        } catch (err) {
            log(`❌ settlement 调用异常: ${err.message}`, true);
            return false;
        }
    }

    async function onPhaseEnd(phase) {
        if (isInPhaseTransition) {
            log(`⚠️ 阶段切换被锁拦截: ${phase}`, true);
            return;
        }
        if (!gameState || !currentRoomId) return;
        
        isInPhaseTransition = true;
        
        const lockTimeout = setTimeout(() => {
            if (isInPhaseTransition) {
                log(`⚠️ 阶段切换锁超时，强制释放`, true);
                isInPhaseTransition = false;
            }
        }, 12000);
        
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
                // 调用后端结算接口（发放奖励、刷新商店、推进回合）
                const success = await callSettlement();
                if (!success) {
                    log('⚠️ 结算接口失败，稍后重试或手动推进', true);
                    await fetchGameState();
                } else {
                    await fetchGameState(); // 获取最新状态（包括新回合和新商店）
                }
                
                const over = checkGameOver();
                if (over.isOver) {
                    endGame(over.winner);
                    clearTimeout(lockTimeout);
                    return;
                }
                // 后端已经将 round++ 和 phase 改为 prepare，但前端需要确保同步
                if (gameState.phase !== 'prepare') {
                    gameState.phase = 'prepare';
                    gameState.phaseStartTime = new Date().toISOString();
                    await updatePhaseToDB();
                }
                await applyUIMode(true);
                
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
            await fetchGameState();
            if (window.YYCardShop?.refreshAllUI) {
                window.YYCardShop.refreshAllUI();
            }
        }
    }

    async function simulateBattle() {
        try {
            await fetchGameState(); // 确保战斗前数据最新
            if (!window.YYCardCombat) {
                log('❌ 战斗模块未加载，使用简化模拟', true);
                return;
            }
            await window.YYCardCombat.resolveBattles(gameState, log, async () => {
                // 战斗结果写入数据库
                if (currentRoomId && gameState) {
                    await supabase
                        .from('game_states')
                        .update({ state: gameState })
                        .eq('room_id', currentRoomId);
                }
            });
        } catch (e) {
            log(`❌ 战斗模拟出错: ${e.message}`, true);
        }
    }

    // 淘汰记录
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
        rankings.forEach((id, index) => {
            rankMsg += `  第${index + 1}名: ${id.slice(0,8)}\n`;
        });
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

    // ===== 修复重连时间恢复：优先使用数据库中的 phaseStartTime =====
    async function fastForwardAndResume() {
        if (!gameState) return false;
        
        // 1. 先确保有 phaseStartTime
        if (!gameState.phaseStartTime) {
            // 如果没有，说明是旧数据或异常，回退到基于 gameStartTime 的推算
            if (!gameState.gameStartTime) return false;
            return fallbackResumeByGameStart();
        }
        
        // 2. 使用 phaseStartTime 计算剩余时间
        const now = Date.now();
        const phaseStart = new Date(gameState.phaseStartTime).getTime();
        const elapsed = Math.floor((now - phaseStart) / 1000);
        const phaseDuration = getPhaseDuration(gameState.phase, gameState.round);
        let remaining = Math.max(0, phaseDuration - elapsed);
        
        // 3. 如果剩余时间 <= 0，说明阶段已经过期，直接触发阶段结束（但需要防止重复触发）
        if (remaining <= 0) {
            log(`⏩ 阶段 ${gameState.phase} 已超时 ${-remaining} 秒，立即触发切换`, false);
            // 不启动计时器，直接结束阶段
            clearAllTimers();
            onPhaseEnd(gameState.phase);
            return true;
        }
        
        // 4. 正常启动计时器
        log(`🔄 重连恢复：阶段=${gameState.phase}, 剩余=${remaining}秒`);
        await applyUIMode(gameState.phase === 'prepare');
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        clearAllTimers();
        startPhaseTimer(gameState.phase, remaining, true);
        return true;
    }
    
    // 回退方案：基于 gameStartTime 推算（保留原有逻辑，但尽量不使用）
    async function fallbackResumeByGameStart() {
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
            if (elapsed >= total) {
                elapsed -= total;
                round++;
            } else {
                if (elapsed < prep) { phase = 'prepare'; remaining = prep - elapsed; }
                else if (elapsed < prep + buf) { phase = 'buffering'; remaining = prep + buf - elapsed; }
                else if (elapsed < prep + buf + bat) { phase = 'battle'; remaining = prep + buf + bat - elapsed; }
                else { phase = 'settle'; remaining = total - elapsed; }
                break;
            }
        }
        // 如果推算出的回合比当前存储的大，直接拉取最新状态
        if (round > gameState.round) {
            await fetchGameState();
            round = gameState.round;
            phase = gameState.phase;
            const phaseDuration = getPhaseDuration(phase, round);
            const phaseStart = new Date(gameState.phaseStartTime).getTime();
            const elapsedInPhase = Math.floor((now - phaseStart) / 1000);
            remaining = Math.max(0, phaseDuration - elapsedInPhase);
        } else {
            gameState.round = round;
            gameState.phase = phase;
            gameState.phaseStartTime = new Date(now - (getPhaseDuration(phase, round) - remaining) * 1000).toISOString();
            await updatePhaseToDB();
        }
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
        if (!shopReady) {
            if (window.YYCardShop) window.YYCardShop.init();
        }
        
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
                const resumed = await fastForwardAndResume();
                if (!resumed) {
                    // 极端情况：没有 phaseStartTime 且 fallback 也失败，则直接使用当前阶段启动计时器
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
                if (window.YYCardShop?.refreshAllUI) {
                    window.YYCardShop.refreshAllUI();
                }
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
                if (window.YYCardShop?.refreshAllUI) {
                    window.YYCardShop.refreshAllUI();
                }
            }
        }, 2000);
    }

    function stopPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    function startBotAutoPlay() {
        if (autoBotTimer) clearInterval(autoBotTimer);
        // 机器人自动逻辑已移至后端，前端不再需要
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

    // 导出接口
    return {
        enterBattle,
        getGameState,
        getCurrentRoomId,
        forceRefreshState,
        fetchGameState,
    };
})();

console.log('✅ battle.js 加载完成（修复重连时间恢复：优先使用 phaseStartTime）');

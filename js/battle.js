// ==================== 纯时间驱动对战系统（无前端商店操作，无数据库阶段依赖） ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;               // 只存 players, gameStartTime, round
    let gameSubscription = null;
    let pollingInterval = null;
    let mainTimer = null;               // 每秒计时器
    let enterGuard = false;
    let eliminationOrder = [];

    // 时长公式（必须与后端 settlement 完全一致）
    const BUFFER_DURATION = 3;
    function getPrepareDuration(round) { return 27 + (round - 1) * 10; }
    function getBattleDuration(round)  { return 30 + (round - 1) * 5; }

    const SETTLEMENT_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

    // ========== 获取服务器时间（秒） ==========
    async function getServerTime() {
        try {
            const { data, error } = await supabase.rpc('get_server_time');
            if (error) throw error;
            return data; // bigint 秒数
        } catch (e) {
            console.warn('获取服务器时间失败，使用本地时间', e);
            return Math.floor(Date.now() / 1000);
        }
    }

    // ========== 根据 gameStartTime 和 round 计算当前阶段及剩余秒数 ==========
    function calculatePhaseInfo(gameStartTimeSec, currentRound, nowSec) {
        let round = currentRound;
        let elapsed = nowSec - gameStartTimeSec;
        // 扣除已经完成的完整回合
        while (true) {
            const prep = getPrepareDuration(round);
            const bat = getBattleDuration(round);
            const totalRound = prep + BUFFER_DURATION + bat;
            if (elapsed >= totalRound) {
                elapsed -= totalRound;
                round++;
                if (round > 100) break;
            } else {
                break;
            }
        }
        // 在当前回合内定位阶段
        const prep = getPrepareDuration(round);
        const bat = getBattleDuration(round);
        if (elapsed < prep) {
            return { round, phase: 'prepare', remaining: prep - elapsed };
        } else if (elapsed < prep + BUFFER_DURATION) {
            return { round, phase: 'buffering', remaining: prep + BUFFER_DURATION - elapsed };
        } else {
            return { round, phase: 'battle', remaining: prep + BUFFER_DURATION + bat - elapsed };
        }
    }

    // ========== 从数据库拉取必要数据（玩家、round、gameStartTime） ==========
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
        // 只保留我们需要的东西
        return {
            players: s.players,
            round: s.round || 1,
            gameStartTime: s.gameStartTime
        };
    }

    // 仅用于更新玩家数据（血量、金币等），不触碰阶段信息
    async function syncPlayerData() {
        if (!currentRoomId) return;
        const { data, error } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', currentRoomId)
            .maybeSingle();
        if (error || !data?.state) return;
        if (gameState) {
            gameState.players = data.state.players;
            gameState.round = data.state.round;
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        }
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
            // 结算后拉取最新玩家数据
            await syncPlayerData();
            return true;
        } catch (err) {
            log(`❌ 结算失败: ${err.message}`, true);
            return false;
        }
    }

    // ========== 全局计时器（每秒触发） ==========
    let lastPhase = null;
    let lastRemaining = 0;
    async function tick() {
        if (!gameState || !gameState.gameStartTime) return;

        const nowSec = await getServerTime();
        const gameStartSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const { round, phase, remaining } = calculatePhaseInfo(gameStartSec, gameState.round, nowSec);

        // 如果计算出的回合比本地大，同步本地 round（后端可能已推进）
        if (round > gameState.round) {
            gameState.round = round;
        }

        // 更新 UI 倒计时和阶段样式
        if (window.YYCardShop?.updateTimerDisplay) {
            window.YYCardShop.updateTimerDisplay(remaining, phase);
        }
        if (window.YYCardShop?.setPhase) {
            window.YYCardShop.setPhase(phase);
        }
        applyUIMode(phase === 'prepare');

        // 检测战斗阶段结束（剩余 <= 0 且上一秒是战斗阶段）
        if (lastPhase === 'battle' && remaining <= 0) {
            log("⚡ 战斗阶段结束，触发结算");
            clearInterval(mainTimer);           // 先停掉计时器
            await callSettlement();              // 调用后端
            // 重新拉取 gameStartTime 和 round（可能有更新）
            const fresh = await fetchGameState();
            if (fresh) {
                gameState.gameStartTime = fresh.gameStartTime;
                gameState.round = fresh.round;
                gameState.players = fresh.players;
            }
            startGlobalTimer();                  // 重启计时器
        }
        lastPhase = phase;
        lastRemaining = remaining;
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
            }, (payload) => {
                const newState = payload.new.state;
                if (newState && gameState) {
                    gameState.players = newState.players;
                    gameState.round = newState.round;
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
            if (data?.state && gameState) {
                gameState.players = data.state.players;
                gameState.round = data.state.round;
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            }
        }, 2000);
    }

    // ========== 战斗模拟（保留原逻辑） ==========
    async function simulateBattle() {
        if (!window.YYCardCombat) {
            log('❌ 战斗模块未加载', true);
            return;
        }
        await window.YYCardCombat.resolveBattles(gameState, log, async () => {
            // 战斗结果写回数据库（仅更新玩家血量等）
            if (currentRoomId && gameState) {
                const { error } = await supabase
                    .from('game_states')
                    .update({ state: { players: gameState.players, round: gameState.round, gameStartTime: gameState.gameStartTime } })
                    .eq('room_id', currentRoomId);
                if (error) log(`❌ 战斗结果写入失败: ${error.message}`, true);
            }
        });
    }

    // ========== 淘汰与结束 ==========
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
        stopAll();
        const rankings = [...eliminationOrder].reverse();
        let rankMsg = `📋 最终排名：\n`;
        rankings.forEach((id, index) => { rankMsg += `  第${index+1}名: ${id.slice(0,8)}\n`; });
        log(rankMsg, false, true);
        toast(`游戏结束！胜利者: ${winnerId}`);
        setTimeout(() => {
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
            enterGuard = false;
        }, 3000);
    }

    function stopAll() {
        if (mainTimer) clearInterval(mainTimer);
        if (pollingInterval) clearInterval(pollingInterval);
        if (gameSubscription) gameSubscription?.unsubscribe();
    }

    // ========== 进入战斗 ==========
    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;

        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initDebugPanel();
        eliminationOrder = [];

        // 加载游戏状态
        let attempts = 0;
        while (attempts < 20) {
            const state = await fetchGameState();
            if (state) {
                gameState = state;
                break;
            }
            await new Promise(r => setTimeout(r, 200));
            attempts++;
        }
        if (!gameState) {
            toast("游戏状态加载失败，请刷新页面", true);
            enterGuard = false;
            return;
        }

        // 确保 gameStartTime 存在（首次进入时设置）
        if (!gameState.gameStartTime) {
            gameState.gameStartTime = new Date().toISOString();
            const { error } = await supabase
                .from('game_states')
                .update({ state: { players: gameState.players, round: gameState.round, gameStartTime: gameState.gameStartTime } })
                .eq('room_id', roomId);
            if (error) log(`❌ 初始化 gameStartTime 失败: ${error.message}`, true);
        }

        // 初始化商店 UI
        if (window.YYCardShop?.init) window.YYCardShop.init();
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();

        // 启动战斗模拟（如果进入时处于战斗阶段，需要模拟一次？可选，但一般不需要）
        // 启动订阅和计时器
        subscribeGameState();
        startPolling();
        startGlobalTimer();
        bindLeaveButton();

        enterGuard = false;
        log("✅ 战斗界面加载完成，纯时间驱动模式");
    }

    function bindLeaveButton() {
        document.getElementById('leave-battle-btn')?.addEventListener('click', async () => {
            if(!confirm('确定退出？')) return;
            stopAll();
            if(window.YYCardMatchmaking?.cancel) await window.YYCardMatchmaking.cancel();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
            enterGuard = false;
        });
    }

    // ========== 调试面板 ==========
    function initDebugPanel() {
        const old = document.getElementById('battle-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'battle-debug-panel';
        p.style.cssText = `position:fixed; top:0; left:0; right:0; bottom:0; overflow-y:auto; color:#7bffb1; font-size:12px; padding:8px; z-index:100000; font-family:monospace; pointer-events:none; text-shadow:0 0 4px black; background:transparent; border:none; display:flex; flex-direction:column-reverse;`;
        document.body.appendChild(p);
        return p;
    }
    function logToScreen(msg, isError) {
        const p = document.getElementById('battle-debug-panel') || initDebugPanel();
        const line = document.createElement('div');
        line.style.color = isError ? '#ff7b7b' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
        p.insertBefore(line, p.firstChild);
        while (p.children.length > 100) p.removeChild(p.lastChild);
    }
    function toast(msg, isError = false) {
        if (window.YYCardShop?.toast) window.YYCardShop.toast(msg, isError);
        else alert(msg);
    }
    function log(msg, isError = false) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        logToScreen(msg, isError);
    }

    // 导出接口（供 shop.js 使用）
    return {
        enterBattle,
        getGameState: () => gameState,
        getCurrentRoomId: () => currentRoomId,
        forceRefreshState: syncPlayerData,
        fetchGameState: syncPlayerData,
    };
})();

console.log('✅ battle.js 加载完成（纯时间驱动，无前端商店操作，战斗结束调用 settlement）');

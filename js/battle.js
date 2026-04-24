// ==================== 纯时间驱动对战系统（彻底重构版） ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;
    let gameSubscription = null;
    let pollingInterval = null;
    let mainTimer = null;                 // setInterval 句柄
    let enterGuard = false;
    let isSettling = false;               // 结算进行中
    let isAnimPlaying = false;            // 动画播放中

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

    // 根据 gameStartTime 和当前时间计算阶段信息
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
                if (elapsed < prep) return { round, phase: 'prepare', remaining: prep - elapsed };
                else if (elapsed < prep + buf) return { round, phase: 'buffering', remaining: prep + buf - elapsed };
                else return { round, phase: 'battle', remaining: prep + buf + bat - elapsed };
            }
        }
        return { round: 1, phase: 'prepare', remaining: getPrepareDuration(1) };
    }

    // 刷新 UI（动画播放时不刷新，但如果阶段已非 battle 则强制刷新）
    function safeRefreshUI() {
        // 如果当前不在战斗阶段，即使动画标志还亮着，也要允许刷新（因为此时动画应该已经终止或无意义）
        const currentPhase = gameState?.phase;
        if (isAnimPlaying && currentPhase === 'battle') {
            console.log('[Battle] 动画播放中且仍在战斗阶段，跳过 UI 刷新');
            return;
        }
        // 如果 combat 内部还在播放（双重保险）
        if (window.YYCardCombat?.isAnimating && window.YYCardCombat.isAnimating()) {
            console.log('[Battle] Combat 动画播放中，跳过 UI 刷新');
            return;
        }
        if (window.YYCardShop?.refreshAllUI) {
            window.YYCardShop.refreshAllUI();
        }
    }

    // 拉取游戏状态
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
        return { players: s.players, gameStartTime: s.gameStartTime };
    }

    // 更新玩家数据到数据库（仅在初始化游戏时间时使用）
    async function updatePlayersToDB() {
        if (!currentRoomId || !gameState) return;
        const payload = {
            players: gameState.players,
            gameStartTime: gameState.gameStartTime
        };
        const { error } = await supabase
            .from('game_states')
            .update({ state: payload })
            .eq('room_id', currentRoomId);
        if (error) log(`❌ 更新玩家数据失败: ${error.message}`, true);
    }

    // 从数据库刷新本地玩家数据（用于结算后更新金币经验等）
    async function refreshGameState() {
        const newState = await fetchGameState();
        if (newState) {
            const currentUserId = auth?.currentUser?.id;
            if (currentUserId && newState.players[currentUserId]) {
                const myNew = newState.players[currentUserId];
                const myOld = gameState.players[currentUserId];
                myOld.gold = myNew.gold;
                myOld.exp = myNew.exp;
                myOld.shopLevel = myNew.shopLevel;
                myOld.health = myNew.health;
                myOld.isBot = myNew.isBot;
                myOld.isEliminated = myNew.isEliminated;
                myOld.isReady = myNew.isReady;
            } else {
                gameState.players = newState.players;
            }
            gameState.gameStartTime = newState.gameStartTime;
            safeRefreshUI();
        }
    }

    // 调用经验/金币结算接口
    function callSettlement() {
        if (isSettling) {
            log('⏳ 结算已在执行，跳过');
            return;
        }
        isSettling = true;
        log("⚔️ 战斗阶段结束，调用结算接口...");
        (async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) throw new Error("无会话");
                const res = await fetch(SETTLEMENT_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ roomId: currentRoomId })
                });
                const result = await res.json();
                if (!res.ok || !result.success) throw new Error(result.error || '结算失败');
                log(`✅ 结算成功，新回合: ${result.newRound || result.round}`);
                await refreshGameState();
            } catch (err) {
                log(`❌ 结算失败: ${err.message}`, true);
            } finally {
                isSettling = false;
            }
        })();
    }

    // 启动战斗动画（非阻塞）
    function startBattleAnimation() {
        if (isAnimPlaying) {
            log('🎬 动画已在播放中');
            return;
        }
        log('🔥 进入战斗阶段，启动动画');
        isAnimPlaying = true;

        if (window.YYCardCombat?.resolveBattles) {
            window.YYCardCombat.resolveBattles(gameState, log, () => {
                // 动画自然播放完毕的回调（通常只作为保险，实际由阶段切换接管）
                log('🎬 动画播放完成回调');
                isAnimPlaying = false;
                safeRefreshUI();
            }).catch(err => {
                log(`❌ 动画异常: ${err.message}`, true);
                isAnimPlaying = false;
                safeRefreshUI();
            });
        } else {
            log('❌ 战斗动画模块未加载', true);
            isAnimPlaying = false;
        }
    }

    // 强制终止动画并清除标志
    function forceStopAnimation() {
        if (isAnimPlaying) {
            log('🛑 强制终止动画');
            if (window.YYCardCombat?.abortAnimation) {
                window.YYCardCombat.abortAnimation();
            }
            isAnimPlaying = false;
        }
    }

    let lastPhase = null;
    // 每秒 tick
    async function tick() {
        if (!gameState || !gameState.gameStartTime) return;

        const nowSec = await getServerTime();
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const { round, phase, remaining } = calculatePhaseInfo(startSec, nowSec);

        gameState.phase = phase;
        gameState.round = round;

        // 更新计时器与阶段标志（交给 shop 模块处理）
        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(remaining, phase);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(phase);

        // 显示回合数
        const roundEl = document.getElementById('round-num');
        if (roundEl) roundEl.textContent = round;

        // 阶段切换检测
        if (lastPhase !== phase) {
            log(`🔄 阶段切换: ${lastPhase} → ${phase}`);

            // 离开战斗阶段 → 调用结算
            if (lastPhase === 'battle' && phase !== 'battle') {
                log("⚡ 战斗阶段结束，触发结算");
                forceStopAnimation();   // 强制终止动画
                callSettlement();       // 结算经验金币
            }

            // 进入战斗阶段 → 启动动画
            if (phase === 'battle') {
                startBattleAnimation();
            }

            // 更新 UI 模式
            applyUIMode(phase === 'prepare');
        }

        // 如果当前是非战斗阶段，但动画标志仍为 true，强制清除（防止操作锁死）
        if (phase !== 'battle' && isAnimPlaying) {
            forceStopAnimation();
        }

        // 在非战斗阶段，主动刷新 UI，确保商店可用
        if (phase !== 'battle') {
            safeRefreshUI();
        }

        lastPhase = phase;
    }

    function startGlobalTimer() {
        if (mainTimer) clearInterval(mainTimer);
        tick();                               // 立即执行一次
        mainTimer = setInterval(tick, 1000);   // 之后每秒执行
    }

    function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch(e) {}
        const prepareTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
    }

    function mergePlayersData(currentPlayers, newPlayers, currentUserId) {
        const result = { ...currentPlayers };
        for (const [pid, newPlayer] of Object.entries(newPlayers)) {
            if (pid === currentUserId) {
                result[pid] = {
                    ...result[pid],
                    gold: newPlayer.gold,
                    exp: newPlayer.exp,
                    shopLevel: newPlayer.shopLevel,
                    health: newPlayer.health,
                    isBot: newPlayer.isBot,
                    isEliminated: newPlayer.isEliminated,
                    isReady: newPlayer.isReady,
                };
            } else {
                result[pid] = newPlayer;
            }
        }
        return result;
    }

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
                    const currentUserId = auth?.currentUser?.id;
                    if (currentUserId) {
                        gameState.players = mergePlayersData(gameState.players, newState.players, currentUserId);
                    } else {
                        gameState.players = newState.players;
                    }
                    safeRefreshUI();
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
                const currentUserId = auth?.currentUser?.id;
                if (currentUserId) {
                    gameState.players = mergePlayersData(gameState.players, data.state.players, currentUserId);
                } else {
                    gameState.players = data.state.players;
                }
                safeRefreshUI();
            }
        }, 2000);
    }

    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;

        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initDebugPanel();

        let loaded = false;
        for (let i = 0; i < 20; i++) {
            const state = await fetchGameState();
            if (state) {
                gameState = state;
                gameState.phase = 'prepare';
                gameState.round = 1;
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

        if (!gameState.gameStartTime) {
            gameState.gameStartTime = new Date().toISOString();
            await updatePlayersToDB();
        }

        if (window.YYCardShop?.init) window.YYCardShop.init();
        safeRefreshUI();

        if (window.YYCardInspector) window.YYCardInspector.init();

        subscribeGameState();
        startPolling();
        startGlobalTimer();
        bindLeaveButton();

        enterGuard = false;
        log("✅ 战斗界面加载完成");
    }

    function bindLeaveButton() {
        const btn = document.getElementById('leave-battle-btn');
        if (!btn) return;
        btn.onclick = async () => {
            if (!confirm("确定退出战斗？")) return;
            clearInterval(mainTimer);
            clearInterval(pollingInterval);
            if (gameSubscription) gameSubscription.unsubscribe();
            forceStopAnimation();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
        };
    }

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

    return {
        enterBattle,
        getGameState: () => gameState,
        getCurrentRoomId: () => currentRoomId,
        forceRefreshState: refreshGameState,
        fetchGameState
    };
})();

console.log('✅ battle.js 重构版 (彻底修复阶段切换与操作锁死)');

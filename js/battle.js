// ==================== 纯时间驱动对战系统（后端结算 + 同步动画 + 快进重连） ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;
    let gameSubscription = null;
    let pollingInterval = null;
    let mainTimer = null;
    let enterGuard = false;
    let isSettling = false;        // 未使用，保留兼容
    let isPlayingAnimation = false;

    const BUFFER_DURATION = 3;
    function getPrepareDuration(round) { return 27 + (round - 1) * 10; }
    function getBattleDuration(round)  { return 30 + (round - 1) * 5; }

    // 安全刷新 UI（动画期间跳过）
    function safeRefreshUI() {
        if (isPlayingAnimation) {
            console.log('[Battle] 动画播放中，跳过 UI 刷新');
            return;
        }
        if (window.YYCardCombat?.isAnimating && window.YYCardCombat.isAnimating()) {
            console.log('[Battle] Combat 动画播放中，跳过 UI 刷新');
            return;
        }
        if (window.YYCardShop?.refreshAllUI) {
            window.YYCardShop.refreshAllUI();
        }
    }

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

    // 完整刷新游戏状态（从数据库拉取最新）
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

    // 不再使用旧的 callSettlement，因为 settle-battle 已包含所有结算
    // 保留空函数以防旧代码调用
    async function callSettlement() {
        // 新架构下，战斗结算已在进入战斗阶段时由 settle-battle 完成，无需再调用
        log("⚡ 战斗阶段已由后端结算，跳过旧版结算接口");
    }

    function enhanceBoardForAnimation() {
        const myBoard = document.getElementById('my-board');
        const enemyBoard = document.getElementById('enemy-board');
        if (!myBoard || !enemyBoard) return;
        const myId = auth.currentUser?.id;
        if (!myId) return;
        const mySlots = myBoard.querySelectorAll('.card-slot');
        mySlots.forEach((slot, idx) => {
            slot.setAttribute('data-player', myId);
            slot.setAttribute('data-position', idx);
        });
        let oppId = null;
        if (gameState) {
            if (gameState.battlePairs) {
                for (const [p1, p2] of gameState.battlePairs) {
                    if (p1 === myId && p2) { oppId = p2; break; }
                    if (p2 === myId && p1) { oppId = p1; break; }
                }
            }
            if (!oppId) {
                const players = gameState.players;
                const aliveOpp = Object.entries(players).find(([id, p]) => id !== myId && p.health > 0 && !p.isEliminated);
                oppId = aliveOpp ? aliveOpp[0] : Object.keys(players).find(id => id !== myId);
            }
        }
        const enemySlots = enemyBoard.querySelectorAll('.card-slot');
        if (oppId) {
            enemySlots.forEach((slot, idx) => {
                slot.setAttribute('data-player', oppId);
                slot.setAttribute('data-position', idx);
            });
        }
        log(`🏷️ 棋盘属性已添加，我方${mySlots.length}格，敌方${enemySlots.length}格`);
    }

    let currentPhase = null;
    async function tick() {
        if (!gameState || !gameState.gameStartTime) return;

        const nowSec = await getServerTime();
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const { round, phase, remaining } = calculatePhaseInfo(startSec, nowSec);

        gameState.phase = phase;
        gameState.round = round;

        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(remaining, phase);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(phase);

        const roundEl = document.getElementById('round-num');
        if (roundEl) roundEl.textContent = round;
        const roundTopEl = document.getElementById('round-num-top');
        if (roundTopEl) roundTopEl.textContent = round;

        if (currentPhase !== phase) {
            applyUIMode(phase === 'prepare');

            // 进入战斗阶段，启动动画（包含后端结算和播放）
            if (phase === 'battle' && !isPlayingAnimation) {
                log('🔥 进入战斗阶段，准备调用结算并播放动画');
                isPlayingAnimation = true;
                enhanceBoardForAnimation();
                if (window.YYCardCombat?.resolveBattles) {
                    try {
                        await window.YYCardCombat.resolveBattles(gameState, log, async () => {
                            // 动画播放完成回调（此时后端数据已自动更新到 gameState 中）
                            isPlayingAnimation = false;
                            safeRefreshUI();
                        });
                        log('✅ 战斗动画播放完毕');
                    } catch (err) {
                        log(`❌ 战斗动画出错: ${err.message}`, true);
                        isPlayingAnimation = false;
                    }
                } else {
                    log('❌ 战斗动画模块未加载', true);
                    isPlayingAnimation = false;
                }
            }

            // 战斗阶段结束，后端已自动更新状态，只需刷新本地数据
            if (currentPhase === 'battle' && phase !== 'battle') {
                log("⚡ 战斗阶段结束，从数据库刷新最新状态");
                await refreshGameState();
            }

            currentPhase = phase;
        }
    }

    function startGlobalTimer() {
        if (mainTimer) clearInterval(mainTimer);
        mainTimer = setInterval(tick, 1000);
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

        // 🔍 启动卡牌查看系统（如果存在）
        if (window.YYCardInspector) window.YYCardInspector.init();

        subscribeGameState();
        startPolling();
        startGlobalTimer();
        bindLeaveButton();

        enterGuard = false;
        log("✅ 战斗界面加载完成");
    }

    // 此函数现在仅用于初始化游戏时间，不再用于更新玩家数据（由 settle-battle 统一处理）
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

    function bindLeaveButton() {
        const btn = document.getElementById('leave-battle-btn');
        if (!btn) return;
        btn.onclick = async () => {
            if (!confirm("确定退出战斗？")) return;
            clearInterval(mainTimer);
            clearInterval(pollingInterval);
            if (gameSubscription) gameSubscription.unsubscribe();
            if (window.YYCardCombat?.abortAnimation) window.YYCardCombat.abortAnimation();
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

console.log('✅ battle.js 加载完成（后端结算 + 同步动画 + 快进重连）');

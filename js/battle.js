// ==================== 纯时间驱动对战系统（轮询保护 + 缓冲期变暗 + 战斗动画 + 可视化调试） ====================
alert('🔥 battle.js v3 已加载');

function debugScreen(msg, color = '#7bffb1') {
    const debugDiv = document.getElementById('mobile-combat-debug') || (() => {
        const d = document.createElement('div');
        d.id = 'mobile-combat-debug';
        d.style.cssText = 'position:fixed; top:10px; left:10px; background:rgba(0,0,0,0.85); color:#0f0; padding:10px 16px; border-radius:12px; z-index:99999; font-size:16px; max-width:90%; pointer-events:none; border-left:4px solid #0f0; box-shadow:0 4px 12px rgba(0,0,0,0.5);';
        document.body.appendChild(d);
        return d;
    })();
    debugDiv.innerHTML = msg;
    debugDiv.style.color = color;
    console.log(msg);
}

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
    let isSettling = false;
    let isPlayingAnimation = false;

    const BUFFER_DURATION = 3;
    function getPrepareDuration(round) { return 27 + (round - 1) * 10; }
    function getBattleDuration(round)  { return 30 + (round - 1) * 5; }

    const SETTLEMENT_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

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
                if (elapsed < prep) {
                    return { round, phase: 'prepare', remaining: prep - elapsed };
                } else if (elapsed < prep + buf) {
                    return { round, phase: 'buffering', remaining: prep + buf - elapsed };
                } else {
                    return { round, phase: 'battle', remaining: prep + buf + bat - elapsed };
                }
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
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        }
    }

    async function callSettlement() {
        if (isSettling) return;
        isSettling = true;
        log("⚔️ 战斗阶段结束，调用结算接口...");
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                log("❌ 无会话，无法结算", true);
                isSettling = false;
                return;
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
            if (!res.ok || !result.success) throw new Error(result.error || '结算失败');
            log(`✅ 结算成功，新回合: ${result.newRound || result.round}`);
            await refreshGameState();
        } catch (err) {
            log(`❌ 结算失败: ${err.message}`, true);
        } finally {
            isSettling = false;
        }
    }

    function enhanceBoardForAnimation() {
        debugScreen('🏷️ 开始为棋盘添加定位属性', '#0ff');
        const myBoard = document.getElementById('my-board');
        const enemyBoard = document.getElementById('enemy-board');
        if (!myBoard || !enemyBoard) {
            debugScreen('❌ 棋盘元素未找到', '#f00');
            return;
        }

        const myId = auth.currentUser?.id;
        if (!myId) {
            debugScreen('❌ 当前用户ID为空', '#f00');
            return;
        }

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
            debugScreen(`✅ 棋盘属性已添加，我方${mySlots.length}格，敌方${enemySlots.length}格`, '#0f0');
        } else {
            debugScreen(`⚠️ 未找到敌方ID，只设置我方属性`, '#f80');
        }
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

            if (phase === 'battle' && !isPlayingAnimation && !isSettling) {
                debugScreen('🔥 进入战斗阶段，准备触发动画', 'orange');
                isPlayingAnimation = true;

                enhanceBoardForAnimation();

                debugScreen('🔍 检查 YYCardCombat 是否存在: ' + (window.YYCardCombat ? '✅是' : '❌否'), window.YYCardCombat ? '#0f0' : '#f00');
                
                if (window.YYCardCombat && window.YYCardCombat.resolveBattles) {
                    try {
                        debugScreen('🎬 开始调用 resolveBattles', '#0ff');
                        await window.YYCardCombat.resolveBattles(gameState, log, async () => {
                            debugScreen('📌 动画结束回调执行', '#0f0');
                            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                        });
                        debugScreen('✅ resolveBattles 调用完成', '#0f0');
                    } catch (err) {
                        debugScreen(`❌ 战斗动画出错: ${err.message}`, '#f00');
                        log(`❌ 战斗动画出错: ${err.message}`, true);
                    }
                } else {
                    debugScreen('❌ 战斗动画模块未加载或接口缺失', '#f00');
                    log("❌ 战斗动画模块未加载", true);
                }

                isPlayingAnimation = false;
            }

            if (currentPhase === 'battle' && phase !== 'battle' && !isSettling) {
                log("⚡ 战斗阶段结束（阶段切换），触发结算");
                await callSettlement();
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
            if (data?.state && data.state.players) {
                const currentUserId = auth?.currentUser?.id;
                if (currentUserId) {
                    gameState.players = mergePlayersData(gameState.players, data.state.players, currentUserId);
                } else {
                    gameState.players = data.state.players;
                }
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
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
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();

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

console.log('✅ battle.js 加载完成（轮询保护 + 缓冲期变暗 + 战斗动画 + 调试）');

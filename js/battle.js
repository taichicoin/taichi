// ==================== 纯时间驱动对战系统【适配玩家独立行】 ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;         // 保持 { players, gameStartTime, phase, round, battlePairs } 格式
    let gameSubscription = null;
    let pollingInterval = null;
    let mainTimer = null;
    let enterGuard = false;
    let isSettling = false;
    let isAnimPlaying = false;
    let lastPhase = null;
    let thisBattleRound = 0;
    let gameEndShown = false;

    // 特殊 user_id 用于全局行
    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';

    const BUFFER_DURATION = 3;
    function getPrepareDuration(round) { return 27 + (round - 1) * 10; }
    function getBattleDuration(round)  { return 30 + (round - 1) * 5; }

    const SETTLEMENT_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

    function safeRefreshUI() {
        if (document.querySelector('.card-drag-clone')) return;
        if (isAnimPlaying) return;
        if (document.getElementById('eliminated-overlay')) return;
        if (document.querySelector('.card-inspect-popup')) return;
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
    }

    async function getServerTime() {
        try {
            const { data, error } = await supabase.rpc('get_server_time');
            if (error) throw error;
            return data;
        } catch (e) {
            return Math.floor(Date.now() / 1000);
        }
    }

    function calculatePhaseInfo(gameStartSec, nowSec) {
        if (!gameStartSec || isNaN(gameStartSec) || gameStartSec > nowSec) {
            return { round: 1, phase: 'prepare', remaining: getPrepareDuration(1) };
        }
        let elapsed = nowSec - gameStartSec;
        if (elapsed < 0) elapsed = 0;
        let round = 1;
        const MAX_ROUND_LIMIT = 100;
        while (true) {
            const prep = getPrepareDuration(round);
            const buf = BUFFER_DURATION;
            const bat = getBattleDuration(round);
            const totalRound = prep + buf + bat;
            if (elapsed >= totalRound) {
                elapsed -= totalRound;
                round++;
                if (round > MAX_ROUND_LIMIT) break;
            } else {
                if (elapsed < prep) return { round, phase: 'prepare', remaining: prep - elapsed };
                else if (elapsed < prep + buf) return { round, phase: 'buffering', remaining: prep + buf - elapsed };
                else return { round, phase: 'battle', remaining: prep + buf + bat - elapsed };
            }
        }
        return { round: 1, phase: 'prepare', remaining: getPrepareDuration(1) };
    }

    function getCurrentPhaseInfo() {
        if (!gameState || !gameState.gameStartTime) {
            return { phase: 'prepare', round: 1, remaining: getPrepareDuration(1) };
        }
        const nowSec = Math.floor(Date.now() / 1000);
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        return calculatePhaseInfo(startSec, nowSec);
    }

    // ★★★ 重写 fetchGameState：从多行组装成旧格式 ★★★
    async function fetchGameState(roomId) {
        if (!roomId) return null;
        // 1. 读取全局行
        const { data: globalRow, error: globalError } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', roomId)
            .eq('user_id', GLOBAL_USER_ID)
            .maybeSingle();
        if (globalError || !globalRow?.state) {
            log(`❌ 拉取全局状态失败: ${globalError?.message || '无数据'}`, true);
            return null;
        }
        const global = globalRow.state; // { round, phase, gameStartTime, phaseStartTime, battlePairs }

        // 2. 读取所有玩家行
        const { data: playerRows, error: playersError } = await supabase
            .from('game_states')
            .select('user_id, state')
            .eq('room_id', roomId)
            .neq('user_id', GLOBAL_USER_ID);   // 排除全局行
        if (playersError) {
            log(`❌ 拉取玩家状态失败: ${playersError.message}`, true);
            return null;
        }

        // 3. 组装成老格式 players 对象
        const players = {};
        for (const row of playerRows) {
            players[row.user_id] = row.state;
        }

        return {
            players,
            gameStartTime: global.gameStartTime,
            phase: global.phase,
            round: global.round,
            battlePairs: global.battlePairs || []
        };
    }

    // ★ 更新单个玩家行（保留旧接口名，但内部已改）
    async function updatePlayersToDB() {
        // 不再需要此函数，因为每个操作都会单独更新自己的行
        // 保留空实现，避免其他地方调用报错
    }

    // ★ 刷新游戏状态（轮询/订阅调用）
    async function refreshGameState() {
        const newState = await fetchGameState(currentRoomId);
        if (newState) {
            const currentUserId = auth?.currentUser?.id;
            if (currentUserId && newState.players[currentUserId] && gameState?.players?.[currentUserId]) {
                const myNew = newState.players[currentUserId];
                const myOld = gameState.players[currentUserId];
                // 金币保护：3秒内有本地操作则不覆盖
                const lastGoldChange = window.YYCardShop?.getLastGoldChangeTime?.() || 0;
                if (Date.now() - lastGoldChange > 3000) {
                    myOld.gold = myNew.gold;
                }
                myOld.exp = myNew.exp;
                myOld.shopLevel = myNew.shopLevel;
                myOld.health = myNew.health;
                myOld.isBot = myNew.isBot;
                myOld.isEliminated = myNew.isEliminated;
                myOld.isReady = myNew.isReady;
                myOld.rank = myNew.rank;
                // ★ shopCards 不覆盖
            } else {
                // 全新状态或当前用户不在列表中，直接替换
                gameState.players = newState.players;
            }
            gameState.gameStartTime = newState.gameStartTime;
            gameState.phase = newState.phase;
            gameState.round = newState.round;
            safeRefreshUI();
        }
    }

    function callSettlement() {
        if (isSettling) return;
        isSettling = true;
        log("⚔️ 战斗阶段结束，调用结算接口...");
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                log("❌ 无会话，无法结算", true);
                isSettling = false;
                return;
            }
            return fetch(SETTLEMENT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ roomId: currentRoomId })
            });
        }).then(res => res?.json()).then(result => {
            if (result && result.success) {
                log(`✅ 结算成功，新回合: ${result.newRound || result.round}`);
                return refreshGameState();
            } else if (result) {
                log(`❌ 结算失败: ${result.error}`, true);
            }
        }).catch(err => log(`❌ 结算网络错误: ${err.message}`, true))
        .finally(() => { isSettling = false; });
    }

    function launchBattleAnimation() {
        if (isAnimPlaying) return;
        const myPlayer = gameState?.players?.[auth?.currentUser?.id];
        if (myPlayer?.isEliminated) return;
        log('🔥 进入战斗阶段，启动动画');
        isAnimPlaying = true;
        if (window.YYCardCombat?.resolveBattles) {
            window.YYCardCombat.resolveBattles(gameState, log, () => {
                log('🎬 动画自然播放完成');
                isAnimPlaying = false;
                safeRefreshUI();
            });
        } else {
            log('❌ 战斗动画模块未加载', true);
            isAnimPlaying = false;
        }
    }

    function forceStopAnimation() {
        if (isAnimPlaying) {
            if (window.YYCardCombat?.abortAnimation) window.YYCardCombat.abortAnimation();
            isAnimPlaying = false;
        }
    }

    function showGameEndOverlay(rank, isWinner) {
        if (document.getElementById('eliminated-overlay')) return;
        forceStopAnimation();
        document.body.classList.add('buffering-mode');
        const overlay = document.createElement('div');
        overlay.id = 'eliminated-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.85); z-index: 300000;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            color: white; font-family: sans-serif;
        `;
        const title = isWinner ? '🏆 游戏结束' : '💀 游戏结束';
        overlay.innerHTML = `
            <div style="font-size: 56px; margin-bottom: 20px;">${title}</div>
            <div style="font-size: 32px; margin-bottom: 50px;">最终排名：第 ${rank} 名</div>
            <button id="btn-leave-after-eliminated" style="
                padding: 18px 48px; font-size: 24px; font-weight: bold;
                background: #f5d76e; color: #1a1a2e; border: none;
                border-radius: 14px; cursor: pointer;
            ">返回大厅</button>
        `;
        document.body.appendChild(overlay);
        document.getElementById('btn-leave-after-eliminated').onclick = () => {
            clearInterval(mainTimer);
            clearInterval(pollingInterval);
            if (gameSubscription) gameSubscription.unsubscribe();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            overlay.remove();
            document.body.classList.remove('buffering-mode');
            gameState = null;
            currentRoomId = null;
        };
    }

    async function tick() {
        if (!gameState) return;
        const myId = auth?.currentUser?.id;
        const myPlayer = myId ? gameState.players[myId] : null;
        if (myPlayer && !gameEndShown) {
            const allPlayers = Object.values(gameState.players);
            const alivePlayers = allPlayers.filter(p => !p.isEliminated && p.health > 0);
            if (alivePlayers.length === 1 && alivePlayers[0] === myPlayer) {
                gameEndShown = true;
                showGameEndOverlay(myPlayer.rank || 1, true);
                return;
            }
            if (myPlayer.isEliminated) {
                gameEndShown = true;
                showGameEndOverlay(myPlayer.rank || '?', false);
                return;
            }
        }

        const nowSec = await getServerTime();
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const { round, phase, remaining } = calculatePhaseInfo(startSec, nowSec);
        gameState.phase = phase;
        gameState.round = round;

        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(remaining, phase);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(phase);
        const roundEl = document.getElementById('round-num');
        if (roundEl) roundEl.textContent = round;

        if (lastPhase !== phase) {
            log(`🔄 阶段切换: ${lastPhase} → ${phase}`);
            if (lastPhase === 'battle' && phase !== 'battle') {
                log("⚡ 战斗阶段结束，触发结算");
                forceStopAnimation();
                callSettlement();
                thisBattleRound = 0;
            }
            if (phase === 'battle' && thisBattleRound !== round) {
                thisBattleRound = round;
                launchBattleAnimation();
            }
            applyUIMode(phase === 'prepare');
        }

        if (window.YYCardBuff?.tryShowBuffSelection) {
            window.YYCardBuff.tryShowBuffSelection(round, phase);
        }

        if (phase !== 'battle' && isAnimPlaying) forceStopAnimation();
        if (phase !== 'battle') safeRefreshUI();
        lastPhase = phase;
    }

    function startGlobalTimer() {
        if (mainTimer) clearInterval(mainTimer);
        tick();
        mainTimer = setInterval(tick, 1000);
    }

    function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch(e) {}
        const prepareTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
    }

    // 合并玩家数据（保留本地 shopCards）
    function mergePlayersData(currentPlayers, newPlayers, currentUserId) {
        const result = { ...currentPlayers };
        const lastGoldChange = window.YYCardShop?.getLastGoldChangeTime?.() || 0;
        const ignoreGold = (Date.now() - lastGoldChange <= 3000);
        for (const [pid, newPlayer] of Object.entries(newPlayers)) {
            if (pid === currentUserId) {
                result[pid] = {
                    ...result[pid],
                    gold: ignoreGold ? result[pid].gold : newPlayer.gold,
                    exp: newPlayer.exp,
                    shopLevel: newPlayer.shopLevel,
                    health: newPlayer.health,
                    isBot: newPlayer.isBot,
                    isEliminated: newPlayer.isEliminated,
                    isReady: newPlayer.isReady,
                    rank: newPlayer.rank,
                };
            } else {
                result[pid] = newPlayer;
            }
        }
        return result;
    }

    function subscribeGameState() {
        if (gameSubscription) gameSubscription.unsubscribe();
        // 订阅整个房间所有行的变化（包括全局行和所有玩家行）
        gameSubscription = supabase.channel(`game:${currentRoomId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'game_states',
                filter: `room_id=eq.${currentRoomId}`
            }, async () => {
                // 任何行变化都全量刷新（轻量，因为只有8人）
                await refreshGameState();
            })
            .subscribe();
    }

    function startPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(async () => {
            if (!currentRoomId) return;
            await refreshGameState();
        }, 2000);
    }

    // ★★★ 进入战斗（适配新表） ★★★
    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;

        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initDebugPanel();

        const currentUserId = auth?.currentUser?.id;
        const oldShopCards = (gameState?.players?.[currentUserId]?.shopCards) || null;

        let loaded = false;
        for (let i = 0; i < 20; i++) {
            const state = await fetchGameState(roomId);
            if (state) {
                gameState = state;
                const myPlayer = state.players[currentUserId];
                if (myPlayer?.isEliminated) {
                    showGameEndOverlay(myPlayer.rank || '?', false);
                    enterGuard = false;
                    return;
                }
                const aliveCount = Object.values(state.players).filter(p => !p.isEliminated && p.health > 0).length;
                if (aliveCount === 1 && !myPlayer?.isEliminated) {
                    showGameEndOverlay(myPlayer.rank || 1, true);
                    enterGuard = false;
                    return;
                }

                // 恢复商店状态
                if (oldShopCards && gameState.players?.[currentUserId]) {
                    gameState.players[currentUserId].shopCards = oldShopCards;
                }

                loaded = true;
                break;
            }
            await new Promise(r => setTimeout(r, 200));
        }

        if (!loaded) {
            log("❌ 未能从数据库加载游戏状态", true);
            enterGuard = false;
            return;
        }

        if (!gameState.gameStartTime || isNaN(new Date(gameState.gameStartTime).getTime())) {
            gameState.gameStartTime = new Date().toISOString();
            // 更新全局行 gameStartTime 的逻辑暂时略过，实际情况不会进入这里
        }

        if (window.YYCardShop?.init) window.YYCardShop.init();
        safeRefreshUI();
        if (window.YYCardInspector) window.YYCardInspector.init();

        subscribeGameState();
        startPolling();
        startGlobalTimer();
        bindLeaveButton();

        enterGuard = false;
        log("✅ 战斗界面加载完成（已适配玩家独立行）");
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
        getCurrentPhaseInfo,
        forceRefreshState: refreshGameState,
        fetchGameState
    };
})();

console.log('✅ battle.js 已适配玩家独立行表结构');

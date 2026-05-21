// ==================== 纯时间驱动对战系统【适配玩家独立行 · 跳过战斗 · 动画保护】 ====================
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
    let isAnimPlaying = false;
    let lastPhase = null;
    let thisBattleRound = 0;
    let gameEndShown = false;

    let battleStartTime = 0;
    let hasCalledSettleBattle = false;
    let hasCalledSettlement = false;

    let pendingElimination = false;
    let pendingRank = null;
    let pendingIsWinner = false;

    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';

    const BUFFER_DURATION = 3;
    const MAX_INCREASE_ROUND = 18;

    function getPrepareDuration(round) {
        const effectiveRound = Math.min(round, MAX_INCREASE_ROUND);
        return 27 + (effectiveRound - 1) * 10;
    }
    function getBattleDuration(round) {
        const effectiveRound = Math.min(round, MAX_INCREASE_ROUND);
        return 30 + (effectiveRound - 1) * 5;
    }

    const GSETTLEMENT_URL = 'https://iogmpkwmkqsmmdkzggtk.supabase.co/functions/v1/gsettlement';
    const PSETTLEMENT_URL = 'https://iogmpkwmkqsmmdkzggtk.supabase.co/functions/v1/psettlement';
    const SETTLE_BATTLE_URL = 'https://iogmpkwmkqsmmdkzggtk.supabase.co/functions/v1/settle-battle';

    function resetRoundFlags(startSec) {
        battleStartTime = startSec;
        hasCalledSettleBattle = false;
        hasCalledSettlement = false;
        pendingElimination = false;
        pendingRank = null;
        pendingIsWinner = false;
    }

    function checkAndShowElimination() {
        if (pendingElimination && !gameEndShown) {
            gameEndShown = true;
            showGameEndOverlay(pendingRank, pendingIsWinner);
        }
    }

    // ★ 修改：跳过按钮逻辑，简化且加满日志
    function ensureSkipUI() {
        if (document.getElementById('battle-progress-bar')) return;
        const wrapper = document.getElementById('battle-progress-wrapper');
        if (!wrapper) return;

        const track = document.createElement('div');
        track.id = 'battle-progress-track';
        wrapper.appendChild(track);

        const bar = document.createElement('div');
        bar.id = 'battle-progress-bar';
        track.appendChild(bar);

        const skipBtn = document.createElement('button');
        skipBtn.id = 'skip-battle-btn';
        skipBtn.textContent = '⏩ 跳过战斗';
        skipBtn.style.cssText = 'display: none !important;';
        skipBtn.onclick = async () => {
            console.log('🟢 跳过按钮被点击');
            if (!hasCalledSettleBattle) {
                console.warn('🔴 hasCalledSettleBattle=false，弹 alert');
                alert('战斗尚未结算完成，请稍候');
                return;
            }
            if (isSettling) {
                console.warn('🔴 isSettling=true，返回');
                return;
            }

            skipBtn.textContent = '⏳ 结算中...';
            skipBtn.disabled = true;
            console.log('🟡 准备调用 psettlement...');

            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    console.error('🔴 无 session，中断');
                    return;
                }

                const myId = auth.currentUser.id;
                console.log('📤 即将 fetch PSETTLEMENT_URL:', PSETTLEMENT_URL);
                console.log('📤 参数:', { roomId: currentRoomId, userId: myId });

                const resp = await fetch(PSETTLEMENT_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ roomId: currentRoomId, userId: myId })
                });

                console.log('📥 psettlement 响应状态:', resp.status);
                const result = await resp.json();
                console.log('📦 psettlement 返回数据:', result);

                if (result?.success && result.updatedPlayer) {
                    console.log('✅ 结算成功，更新本地数据');
                    if (gameState?.players?.[myId]) {
                        const p = gameState.players[myId];
                        if (result.updatedPlayer.gold !== undefined) p.gold = result.updatedPlayer.gold;
                        if (result.updatedPlayer.exp !== undefined) p.exp = result.updatedPlayer.exp;
                        if (result.updatedPlayer.freeRefresh !== undefined) p.freeRefresh = result.updatedPlayer.freeRefresh;
                        if (result.playerRound !== undefined) p.playerRound = result.playerRound;
                        console.log('📊 更新后本地玩家数据:', { gold: p.gold, exp: p.exp, playerRound: p.playerRound });
                    }
                    // 立即刷新 UI
                    if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                    const roundEl = document.getElementById('round-num');
                    if (roundEl && result.playerRound) roundEl.textContent = result.playerRound;
                } else {
                    console.warn('⚠️ psettlement 返回失败:', result);
                }
            } catch (e) {
                console.error('❌ 跳过战斗请求异常:', e);
            }

            // 无论结果如何，开启绿色通道并切换 UI
            console.log('🟢 开启绿色通道，切换 UI');
            if (window.YYCardShop?.setForcePrepareMode) {
                window.YYCardShop.setForcePrepareMode(true);
            }
            applyUIMode(true);
            safeRefreshUI();
            forceStopAnimation();
            checkAndShowElimination();

            // 最后再全量刷新一次，确保和服务端同步
            await refreshGameState();
            console.log('🏁 跳过流程结束');

            skipBtn.textContent = '⏩ 跳过战斗';
            skipBtn.disabled = false;
        };
        wrapper.appendChild(skipBtn);
    }

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
            return { round: 1, phase: 'prepare', remaining: getPrepareDuration(1), total: getPrepareDuration(1) };
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
                if (elapsed < prep) return { round, phase: 'prepare', remaining: prep - elapsed, total: prep };
                else if (elapsed < prep + buf) return { round, phase: 'buffering', remaining: prep + buf - elapsed, total: buf };
                else return { round, phase: 'battle', remaining: prep + buf + bat - elapsed, total: bat };
            }
        }
        return { round: 1, phase: 'prepare', remaining: getPrepareDuration(1), total: getPrepareDuration(1) };
    }

    function getCurrentPhaseInfo() {
        if (!gameState || !gameState.gameStartTime) {
            return { phase: 'prepare', round: 1, remaining: getPrepareDuration(1), total: getPrepareDuration(1) };
        }
        const nowSec = Math.floor(Date.now() / 1000);
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        return calculatePhaseInfo(startSec, nowSec);
    }

    async function fetchGameState(roomId) {
        if (!roomId) return null;
        const { data: allRows, error } = await supabase
            .from('game_states')
            .select('*')
            .eq('room_id', roomId);
        if (error || !allRows || allRows.length === 0) return null;

        let globalRow = null;
        const players = {};
        for (const row of allRows) {
            if (row.user_id === GLOBAL_USER_ID) {
                globalRow = row.state;
            } else {
                players[row.user_id] = row.state;
            }
        }
        if (!globalRow) return null;

        return {
            players,
            gameStartTime: globalRow.gameStartTime,
            phase: globalRow.phase || 'prepare',
            round: globalRow.round || 1,
            battlePairs: globalRow.battlePairs || []
        };
    }

    async function refreshGameState() {
        const newState = await fetchGameState(currentRoomId);
        if (!newState) return;

        const currentUserId = auth?.currentUser?.id;

        if (isAnimPlaying && currentUserId) {
            for (const pid of Object.keys(newState.players)) {
                if (pid !== currentUserId) {
                    gameState.players[pid] = newState.players[pid];
                }
            }
            gameState.gameStartTime = newState.gameStartTime;
            return;
        }

        if (currentUserId && newState.players[currentUserId] && gameState?.players?.[currentUserId]) {
            const myNew = newState.players[currentUserId];
            const myOld = gameState.players[currentUserId];
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
            myOld.playerRound = myNew.playerRound;
            myOld.freeRefresh = myNew.freeRefresh;
        } else {
            gameState.players = newState.players;
        }
        gameState.gameStartTime = newState.gameStartTime;
        safeRefreshUI();
    }

    async function callSettlement() {
        if (isSettling || hasCalledSettlement) return;
        isSettling = true;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { isSettling = false; return; }
            const resp = await fetch(GSETTLEMENT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            const result = await resp.json();
            if (result?.success) {
                hasCalledSettlement = true;
                await refreshGameState();
            }
        } catch (e) {
            console.error('全局结算失败:', e);
        }
        isSettling = false;
    }

    // ★ 加日志的 settleBattle
    async function callSettleBattle() {
        if (hasCalledSettleBattle) return;
        console.log('📡 调用 settle-battle...');
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const resp = await fetch(SETTLE_BATTLE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            console.log('📡 settle-battle 响应状态:', resp.status);
            hasCalledSettleBattle = true;
            console.log('✅ hasCalledSettleBattle 设置为 true');
        } catch (e) {
            console.error('❌ settle-battle 调用失败:', e);
        }
    }

    function launchBattleAnimation() {
        if (isAnimPlaying) return;
        const myPlayer = gameState?.players?.[auth?.currentUser?.id];
        if (myPlayer?.isEliminated) return;
        isAnimPlaying = true;

        callSettleBattle();

        if (window.YYCardCombat?.resolveBattles) {
            window.YYCardCombat.resolveBattles(gameState, () => {
                isAnimPlaying = false;
                safeRefreshUI();
                callSettlement();
                checkAndShowElimination();
            });
        } else {
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
        overlay.innerHTML = `
            <div style="font-size: 56px; margin-bottom: 20px;">${isWinner ? '🏆 游戏结束' : '💀 游戏结束'}</div>
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
            gameState = currentRoomId = null;
        };
    }

    async function tick() {
        if (!gameState) return;
        const myId = auth?.currentUser?.id;
        const myPlayer = myId ? gameState.players[myId] : null;

        if (myPlayer && !gameEndShown && !pendingElimination) {
            const allPlayers = Object.values(gameState.players);
            const alivePlayers = allPlayers.filter(p => !p.isEliminated && p.health > 0);
            if (alivePlayers.length === 1 && alivePlayers[0] === myPlayer) {
                pendingElimination = true;
                pendingRank = myPlayer.rank || 1;
                pendingIsWinner = true;
            }
        }

        if (myPlayer && myPlayer.isEliminated && !gameEndShown && !pendingElimination) {
            pendingElimination = true;
            pendingRank = myPlayer.rank || '?';
            pendingIsWinner = false;
        }

        const nowSec = await getServerTime();
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const { round, phase, remaining, total } = calculatePhaseInfo(startSec, nowSec);
        gameState.phase = phase;
        gameState.round = round;

        if (phase === 'prepare' && window.YYCardShop?.getForcePrepareMode && window.YYCardShop.getForcePrepareMode()) {
            window.YYCardShop.setForcePrepareMode(false);
        }

        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(remaining, phase);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(phase);

        const roundEl = document.getElementById('round-num');
        if (roundEl) {
            const displayRound = myPlayer?.playerRound || gameState.round || 1;
            roundEl.textContent = displayRound;
        }

        const progressWrapper = document.getElementById('battle-progress-wrapper');
        const progressBar = document.getElementById('battle-progress-bar');
        const skipBtn = document.getElementById('skip-battle-btn');

        if (phase === 'battle') {
            if (progressWrapper) progressWrapper.style.display = 'flex';
            if (progressBar) {
                const remainingPct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
                progressBar.style.clipPath = `inset(0 ${100 - remainingPct}% 0 0)`;
                progressBar.style.width = '100%';
            }
            if (skipBtn) {
                const elapsed = nowSec - battleStartTime;
                skipBtn.style.cssText = elapsed >= 10 ? 'display: block;' : 'display: none !important;';
            }
        } else {
            if (progressWrapper) progressWrapper.style.display = 'none';
            if (skipBtn) skipBtn.style.cssText = 'display: none !important;';
        }

        if (lastPhase !== phase) {
            if (lastPhase === 'battle' && phase !== 'battle') {
                forceStopAnimation();
                callSettlement();
                checkAndShowElimination();
                thisBattleRound = 0;
            }
            if (phase === 'battle' && thisBattleRound !== round) {
                thisBattleRound = round;
                resetRoundFlags(nowSec);
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
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
    }

    function subscribeGameState() {
        if (gameSubscription) gameSubscription.unsubscribe();
        gameSubscription = supabase.channel(`game:${currentRoomId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'game_states',
                filter: `room_id=eq.${currentRoomId}`
            }, async () => {
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

    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;

        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';

        ensureSkipUI();

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

                if (oldShopCards && gameState.players?.[currentUserId]) {
                    gameState.players[currentUserId].shopCards = oldShopCards;
                }

                loaded = true;
                break;
            }
            await new Promise(r => setTimeout(r, 200));
        }

        if (!loaded) {
            enterGuard = false;
            return;
        }

        // 重连自动补发
        if (gameState.players[currentUserId]) {
            const myPlayer = gameState.players[currentUserId];
            const playerRound = myPlayer.playerRound || 1;
            const globalRound = gameState.round || 1;
            const phase = gameState.phase || 'battle';
            if (playerRound < globalRound && phase === 'battle') {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) {
                        const resp = await fetch(PSETTLEMENT_URL, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${session.access_token}`
                            },
                            body: JSON.stringify({ roomId, userId: currentUserId })
                        });
                        const result = await resp.json();
                        if (result?.success && result.updatedPlayer) {
                            if (result.updatedPlayer.gold !== undefined) myPlayer.gold = result.updatedPlayer.gold;
                            if (result.updatedPlayer.exp !== undefined) myPlayer.exp = result.updatedPlayer.exp;
                            if (result.updatedPlayer.freeRefresh !== undefined) myPlayer.freeRefresh = result.updatedPlayer.freeRefresh;
                            if (result.playerRound !== undefined) myPlayer.playerRound = result.playerRound;
                        }
                    }
                } catch (e) {
                    console.error('重连补发失败:', e);
                }
            }
        }

        if (window.YYCardShop?.init) window.YYCardShop.init();
        safeRefreshUI();
        if (window.YYCardInspector) window.YYCardInspector.init();

        subscribeGameState();
        startPolling();
        startGlobalTimer();
        bindLeaveButton();

        enterGuard = false;
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

    return {
        enterBattle,
        getGameState: () => gameState,
        getCurrentRoomId: () => currentRoomId,
        getCurrentPhaseInfo,
        forceRefreshState: refreshGameState,
        fetchGameState
    };
})();

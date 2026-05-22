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

    // 缓存玩家回合，防止跳动
    let lastDisplayedRound = 1;

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

    // 跳过战斗UI及逻辑
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
            if (!hasCalledSettleBattle) {
                alert('战斗尚未结算完成，请稍候');
                return;
            }
            if (isSettling) return;

            skipBtn.textContent = '⏳ 结算中...';
            skipBtn.disabled = true;

            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) throw new Error('无登录会话');

                const myId = auth.currentUser.id;
                const resp = await fetch(PSETTLEMENT_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ roomId: currentRoomId, userId: myId })
                });
                const result = await resp.json();

                if (result?.success && result.updatedPlayer) {
                    if (gameState?.players?.[myId]) {
                        const p = gameState.players[myId];
                        if (result.updatedPlayer.gold !== undefined) p.gold = result.updatedPlayer.gold;
                        if (result.updatedPlayer.exp !== undefined) p.exp = result.updatedPlayer.exp;
                        if (result.updatedPlayer.freeRefresh !== undefined) p.freeRefresh = result.updatedPlayer.freeRefresh;
                        if (result.playerRound !== undefined) {
                            p.playerRound = result.playerRound;
                            lastDisplayedRound = result.playerRound;
                        }
                    }
                    if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                    document.getElementById('round-num').textContent = lastDisplayedRound;
                }
            } catch (e) {
                console.error('跳过战斗失败:', e);
            }

            // 开启绿色通道，切换到准备界面
            if (window.YYCardShop?.setForcePrepareMode) {
                window.YYCardShop.setForcePrepareMode(true);
            }
            applyUIMode(true);
            safeRefreshUI();
            forceStopAnimation();
            checkAndShowElimination();
            await refreshGameState();

            skipBtn.textContent = '⏩ 跳过战斗';
            skipBtn.disabled = false;
        };
        wrapper.appendChild(skipBtn);
    }

    function safeRefreshUI() {
        if (document.querySelector('.card-drag-clone')) return;
        if (isAnimPlaying) return;
        if (window.YYCardCombat?.isAnimating && window.YYCardCombat.isAnimating()) return;
        if (document.getElementById('eliminated-overlay')) return;
        if (document.querySelector('.card-inspect-popup')) return;
        if (window.mergeService?.isMergeLocked && window.mergeService.isMergeLocked()) return;
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

        // 动画或合成锁期间不覆盖自己的数据
        if (currentUserId && (
            isAnimPlaying || 
            (window.mergeService?.isMergeLocked && window.mergeService.isMergeLocked())
        )) {
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

            if (myNew.playerRound !== undefined) {
                lastDisplayedRound = myNew.playerRound;
            }
        } else {
            gameState.players = newState.players;
            if (currentUserId && newState.players[currentUserId]?.playerRound) {
                lastDisplayedRound = newState.players[currentUserId].playerRound;
            }
        }
        gameState.gameStartTime = newState.gameStartTime;
        safeRefreshUI();
    }

    // 全局结算：只防并发，不检查 hasCalledSettlement
    async function callSettlement() {
        console.log('📡 callSettlement 被调用, isSettling:', isSettling);
        if (isSettling) return;
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
            console.log('📦 gsettlement 返回:', result);
            if (result?.success) {
                hasCalledSettlement = true;
                await refreshGameState();
            } else {
                console.warn('[gsettlement] 返回失败:', result);
            }
        } catch (e) {
            console.error('全局结算失败:', e);
        }
        isSettling = false;
    }

    async function callSettleBattle() {
        if (hasCalledSettleBattle) return;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            await fetch(SETTLE_BATTLE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            hasCalledSettleBattle = true;
        } catch (e) {}
    }

    function launchBattleAnimation() {
        if (isAnimPlaying) return;
        const myPlayer = gameState?.players?.[auth?.currentUser?.id];
        if (myPlayer?.isEliminated) return;
        isAnimPlaying = true;

        callSettleBattle();

        if (window.YYCardCombat?.resolveBattles) {
            window.YYCardCombat.resolveBattles(gameState, async () => {
                isAnimPlaying = false;
                safeRefreshUI();

                // 动画自然结束，调用玩家结算
                const myId = auth?.currentUser?.id;
                if (myId) {
                    try {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (session) {
                            const resp = await fetch(PSETTLEMENT_URL, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    Authorization: `Bearer ${session.access_token}`
                                },
                                body: JSON.stringify({ roomId: currentRoomId, userId: myId })
                            });
                            const result = await resp.json();
                            if (result?.success && result.updatedPlayer && gameState?.players?.[myId]) {
                                const p = gameState.players[myId];
                                if (result.updatedPlayer.gold !== undefined) p.gold = result.updatedPlayer.gold;
                                if (result.updatedPlayer.exp !== undefined) p.exp = result.updatedPlayer.exp;
                                if (result.updatedPlayer.freeRefresh !== undefined) p.freeRefresh = result.updatedPlayer.freeRefresh;
                                if (result.playerRound !== undefined) {
                                    p.playerRound = result.playerRound;
                                    lastDisplayedRound = result.playerRound;
                                }
                                document.getElementById('round-num').textContent = lastDisplayedRound;
                                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                            }
                        }
                    } catch (e) {
                        console.error('动画结束后玩家结算失败:', e);
                    }
                }

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
        if (window.YYCardCombat?.isAnimating && window.YYCardCombat.isAnimating()) {
            if (window.YYCardCombat?.abortAnimation) window.YYCardCombat.abortAnimation();
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

        // 存活检测
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

        // 主动追赶全局回合
        if (round > gameState.round && !isSettling) {
            console.warn(`⚠️ 全局回合落后 (时间算得 ${round}, 数据库 ${gameState.round})，调用 gsettlement`);
            callSettlement();
        }

        gameState.phase = phase;
        gameState.round = round;

        if (phase === 'prepare' && window.YYCardShop?.getForcePrepareMode && window.YYCardShop.getForcePrepareMode()) {
            window.YYCardShop.setForcePrepareMode(false);
        }

        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(remaining, phase);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(phase);

        const roundEl = document.getElementById('round-num');
        if (roundEl) {
            if (myPlayer?.playerRound !== undefined) {
                lastDisplayedRound = myPlayer.playerRound;
            }
            roundEl.textContent = lastDisplayedRound;
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

        // ★★★ 核心修复：阶段切换时强制调用全局结算 ★★★
        if (lastPhase !== phase) {
            console.log(`🔄 阶段切换: ${lastPhase} → ${phase}`);
            if (lastPhase === 'battle' && phase !== 'battle') {
                console.log('🔔 战斗阶段结束，强制调用全局结算');
                forceStopAnimation();
                // 清除所有阻碍标记
                hasCalledSettlement = false;
                isSettling = false;
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

        if (isPrepare) {
            const userId = auth?.currentUser?.id;
            if (userId && gameState?.players?.[userId]?.board) {
                if (window.YYCardShop?.renderMyBoard) {
                    window.YYCardShop.renderMyBoard();
                } else if (window.YYCardShop?.refreshAllUI) {
                    window.YYCardShop.refreshAllUI();
                }
            }
        }
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

                if (myPlayer?.playerRound) {
                    lastDisplayedRound = myPlayer.playerRound;
                }

                // 重连同步全局回合
                const nowSec = await getServerTime();
                const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
                const { round: calculatedRound } = calculatePhaseInfo(startSec, nowSec);
                if (calculatedRound > gameState.round) {
                    console.warn(`⚠️ 重连检测全局回合落后 (${calculatedRound} > ${gameState.round})，调用 gsettlement`);
                    await callSettlement();
                }

                // 重连补发个人奖励
                if (myPlayer && myPlayer.playerRound < gameState.round) {
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
                                if (result.playerRound !== undefined) {
                                    myPlayer.playerRound = result.playerRound;
                                    lastDisplayedRound = result.playerRound;
                                }
                            }
                        }
                    } catch (e) {
                        console.error('重连补发失败:', e);
                    }
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

        if (window.YYCardShop?.init) window.YYCardShop.init();
        safeRefreshUI();
        if (window.YYCardInspector) window.YYCardInspector.init();

        // 正确初始化 lastPhase
        const nowSec = await getServerTime();
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const { phase: currentPhase } = calculatePhaseInfo(startSec, nowSec);
        lastPhase = currentPhase;

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

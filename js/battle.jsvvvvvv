// ==================== 纯时间驱动对战系统【精准查询 + 按需加载对手棋盘 + 操作冷却 + 战斗阶段保护】 ====================
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

    let lastDisplayedRound = 1;
    let battleAnimationLock = false;

    // ★ 操作冷却：3 秒内不更新自己
    let lastOperationTime = 0;
    const OPERATION_COOLDOWN = 3000;

    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';
    const BUFFER_DURATION = 4;
    const MAX_INCREASE_ROUND = 20;

    function getPrepareDuration(round) {
        const effectiveRound = Math.min(round, MAX_INCREASE_ROUND);
        return 27 + (effectiveRound - 1) * 7;
    }
    function getBattleDuration(round) {
        const effectiveRound = Math.min(round, MAX_INCREASE_ROUND);
        return 30 + (effectiveRound - 1) * 7;
    }

    const GSETTLEMENT_URL = 'https://kvflbfdqyehtlfmigaxa.supabase.co/functions/v1/gsettlement';
    const PSETTLEMENT_URL = 'https://kvflbfdqyehtlfmigaxa.supabase.co/functions/v1/psettlement';
    const SETTLE_BATTLE_URL = 'https://kvflbfdqyehtlfmigaxa.supabase.co/functions/v1/settle-battle';

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

    async function applyPSettlement() {
        const myId = auth?.currentUser?.id;
        if (!myId || !gameState?.players?.[myId]) return;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
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
                const p = gameState.players[myId];
                if (result.updatedPlayer.gold !== undefined) p.gold = result.updatedPlayer.gold;
                if (result.updatedPlayer.exp !== undefined) p.exp = result.updatedPlayer.exp;
                if (result.updatedPlayer.freeRefresh !== undefined) p.freeRefresh = result.updatedPlayer.freeRefresh;
                if (result.playerRound !== undefined) {
                    p.playerRound = result.playerRound;
                    lastDisplayedRound = result.playerRound;
                }
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                const roundEl = document.getElementById('round-num');
                if (roundEl) roundEl.textContent = lastDisplayedRound;

                if (p.playerRound >= 6 && window.YYCardBuff?.tryShowBuffSelection) {
                    window.YYCardBuff.tryShowBuffSelection(p.playerRound, 'prepare');
                }
            }
        } catch (e) {
            console.error('个人结算失败:', e);
        }
    }

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
            await applyPSettlement();

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
        if (window._consumableDragging) return;
        if (document.querySelector('.card-drag-clone')) return;
        if (isAnimPlaying) return;
        if (window.YYCardCombat?.isAnimating && window.YYCardCombat.isAnimating()) return;
        if (document.getElementById('eliminated-overlay')) return;
        if (document.querySelector('.card-inspect-popup')) return;
        if (window.mergeService?.isMergeLocked && window.mergeService.isMergeLocked()) return;
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        renderPlayerStatus();
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

    async function fetchOpponentBoard(opponentId) {
        if (!opponentId || !currentRoomId) return null;
        const { data, error } = await supabase
            .from('game_states')
            .select('state->board')
            .eq('room_id', currentRoomId)
            .eq('user_id', opponentId)
            .maybeSingle();
        if (error || !data) return null;
        return data.board;
    }

    async function fetchGameState(roomId) {
        if (!roomId) return null;
        const myId = auth?.currentUser?.id;
        if (!myId) return null;

        const { data: coreRows, error: coreError } = await supabase
            .from('game_states')
            .select('user_id, state')
            .eq('room_id', roomId)
            .in('user_id', [GLOBAL_USER_ID, myId]);

        if (coreError || !coreRows || coreRows.length === 0) return null;

        let globalRow = null;
        const players = {};
        for (const row of coreRows) {
            if (row.user_id === GLOBAL_USER_ID) {
                globalRow = row.state;
            } else {
                players[row.user_id] = row.state;
            }
        }
        if (!globalRow) return null;

        // ★ 加入 state->shopLevel
        const { data: otherRows, error: otherError } = await supabase
            .from('game_states')
            .select('user_id, state->health, state->isEliminated, state->rank, state->playerRound, state->shopLevel')
            .eq('room_id', roomId)
            .not('user_id', 'in', `(${GLOBAL_USER_ID},${myId})`);

        if (otherError) {
            console.warn('拉取其他玩家摘要失败:', otherError);
        } else if (otherRows) {
            for (const row of otherRows) {
                players[row.user_id] = {
                    health: row.health,
                    isEliminated: row.isEliminated,
                    rank: row.rank,
                    playerRound: row.playerRound,
                    shopLevel: row.shopLevel || 1,   // ★ 使用数据库里的等级
                    board: null,
                    hand: null,
                    shopCards: null,
                    gold: 0,
                    exp: 0,
                    isBot: false,
                    freeRefresh: 0,
                    avatar: null,
                };
            }
        }

        return {
            players,
            gameStartTime: globalRow.gameStartTime,
            phase: globalRow.phase || 'prepare',
            round: globalRow.round || 1,
            battlePairs: globalRow.battlePairs || [],
            lastSettledRound: globalRow.lastSettledRound || 0
        };
    }

    // ★ 合并其他玩家时，增加 shopLevel，并在战斗阶段跳过血量更新
    function mergeOtherPlayers(newState, isBattlePhase = false) {
        const currentUserId = auth?.currentUser?.id;
        for (const pid of Object.keys(newState.players)) {
            if (pid === currentUserId) continue;
            const newP = newState.players[pid];
            const oldP = gameState.players[pid];
            if (!oldP) {
                gameState.players[pid] = newP;
                continue;
            }
            // 等级始终更新
            if (newP.shopLevel !== undefined) oldP.shopLevel = newP.shopLevel;
            // 战斗阶段不更新血量
            if (!isBattlePhase) {
                if (newP.health !== undefined) oldP.health = newP.health;
            }
            if (newP.isEliminated !== undefined) oldP.isEliminated = newP.isEliminated;
            if (newP.rank !== undefined) oldP.rank = newP.rank;
            if (newP.playerRound !== undefined) oldP.playerRound = newP.playerRound;
        }
    }

    async function refreshGameState() {
        const newState = await fetchGameState(currentRoomId);
        if (!newState) return;

        const currentUserId = auth?.currentUser?.id;
        const isBattlePhase = gameState && gameState.phase === 'battle';

        gameState.gameStartTime = newState.gameStartTime;
        gameState.lastSettledRound = newState.lastSettledRound;
        gameState.battlePairs = newState.battlePairs;

        // ★ 操作冷却：3 秒内有任何操作，只更新其他玩家
        const sinceLastOp = Date.now() - lastOperationTime;
        if (sinceLastOp < OPERATION_COOLDOWN) {
            mergeOtherPlayers(newState, isBattlePhase);
            renderPlayerStatus();
            return;
        }

        // 消耗牌拖拽中
        if (window._consumableDragging) {
            mergeOtherPlayers(newState, isBattlePhase);
            renderPlayerStatus();
            return;
        }

        // 动画/拖拽/商店忙碌中
        if (currentUserId && (
            isAnimPlaying ||
            (window.mergeService?.isMergeLocked && window.mergeService.isMergeLocked()) ||
            (window.YYCardShop?.isDragging && window.YYCardShop.isDragging) ||
            window.YYCardShop?.isBusy
        )) {
            mergeOtherPlayers(newState, isBattlePhase);
            renderPlayerStatus();
            return;
        }

        // 正常合并自己
        if (currentUserId && newState.players[currentUserId]) {
            const myNew = newState.players[currentUserId];
            if (!gameState.players) gameState.players = {};
            if (!gameState.players[currentUserId]) gameState.players[currentUserId] = {};
            const myOld = gameState.players[currentUserId];

            const lastGoldChange = window.YYCardShop?.getLastGoldChangeTime?.() || 0;
            if (Date.now() - lastGoldChange > 3000) {
                myOld.gold = myNew.gold;
            }
            myOld.exp = myNew.exp;
            myOld.shopLevel = myNew.shopLevel;   // 等级总是更新
            myOld.isBot = myNew.isBot;
            myOld.isEliminated = myNew.isEliminated;
            myOld.isReady = myNew.isReady;
            myOld.rank = myNew.rank;
            myOld.playerRound = myNew.playerRound;
            myOld.freeRefresh = myNew.freeRefresh;
            if (myNew.shopCards !== undefined) myOld.shopCards = myNew.shopCards;
            if (myNew.playerRound !== undefined) lastDisplayedRound = myNew.playerRound;

            // ★ 战斗阶段不更新血量、棋盘、手牌
            if (!isBattlePhase) {
                myOld.health = myNew.health;
                myOld.board = myNew.board;
                myOld.hand = myNew.hand;
            }

            mergeOtherPlayers(newState, isBattlePhase);
        } else {
            gameState.players = newState.players;
            if (currentUserId && newState.players[currentUserId]?.playerRound) {
                lastDisplayedRound = newState.players[currentUserId].playerRound;
            }
        }

        safeRefreshUI();
        renderPlayerStatus();
    }

    async function callSettlement() {
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
            if (result?.success) {
                hasCalledSettlement = true;
                await refreshGameState();
            }
        } catch (e) {
            console.error('全局结算失败:', e);
        }
        isSettling = false;
    }

    async function launchBattleAnimation(isReconnect = false) {
        if (isAnimPlaying || battleAnimationLock) return;

        const myPlayer = gameState?.players?.[auth?.currentUser?.id];
        if (myPlayer?.isEliminated) return;

        battleAnimationLock = true;
        isAnimPlaying = true;

        try {
            if (isReconnect) {
                const { data: freshGlobal } = await supabase
                    .from('game_states')
                    .select('state')
                    .eq('room_id', currentRoomId)
                    .eq('user_id', GLOBAL_USER_ID)
                    .maybeSingle();
                if (freshGlobal?.state) {
                    const lastSettled = freshGlobal.state.lastSettledRound || 0;
                    if (lastSettled >= gameState.round) {
                        console.log('⚡ 重连发现已结算，跳过动画');
                        isAnimPlaying = false;
                        battleAnimationLock = false;
                        await applyPSettlement();
                        if (window.YYCardShop?.setForcePrepareMode) {
                            window.YYCardShop.setForcePrepareMode(true);
                        }
                        applyUIMode(true);
                        safeRefreshUI();
                        return;
                    }
                }
            }

            const myId = auth?.currentUser?.id;
            const pairs = gameState.battlePairs || [];
            const myPair = pairs.find(p => p.p1 === myId || p.p2 === myId);
            if (myPair) {
                const oppId = myPair.p1 === myId ? myPair.p2 : myPair.p1;
                if (oppId) {
                    if (!gameState.players[oppId]?.board) {
                        const oppBoard = await fetchOpponentBoard(oppId);
                        if (oppBoard) {
                            if (!gameState.players[oppId]) gameState.players[oppId] = {};
                            gameState.players[oppId].board = oppBoard;
                        }
                    }
                    if (gameState.players[oppId]?.board && window.YYCardCombat?.renderEnemyBoardFromData) {
                        window.YYCardCombat.renderEnemyBoardFromData(oppId, gameState.players[oppId].board);
                    }
                }
            }

            const preBattlePlayers = JSON.parse(JSON.stringify(gameState.players));

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                isAnimPlaying = false;
                battleAnimationLock = false;
                return;
            }

            const resp = await fetch(SETTLE_BATTLE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            const settleData = await resp.json();

            const animGameState = {
                ...gameState,
                players: preBattlePlayers,
                _buffEvents: settleData.buffEvents || [],
                _combatResults: settleData.combatResults || [],
            };

            hasCalledSettleBattle = true;
            gameState.lastSettledRound = gameState.round;

            const onAnimationComplete = async () => {
                if (settleData.updatedPlayers) {
                    for (const pid in settleData.updatedPlayers) {
                        if (gameState.players[pid]) {
                            const u = settleData.updatedPlayers[pid];
                            if (u.health !== undefined) gameState.players[pid].health = u.health;
                            if (u.board !== undefined) gameState.players[pid].board = u.board;
                            if (u.hand !== undefined) gameState.players[pid].hand = u.hand;
                            if (u.isEliminated !== undefined) gameState.players[pid].isEliminated = u.isEliminated;
                            if (u.rank !== undefined) gameState.players[pid].rank = u.rank;
                        }
                    }
                }

                isAnimPlaying = false;
                battleAnimationLock = false;

                await refreshGameState();
                await applyPSettlement();
                if (window.YYCardShop?.setForcePrepareMode) {
                    window.YYCardShop.setForcePrepareMode(true);
                }
                applyUIMode(true);
                safeRefreshUI();
                callSettlement();
                checkAndShowElimination();
            };

            if (window.YYCardCombat?.resolveBattles) {
                window.YYCardCombat.resolveBattles(animGameState, onAnimationComplete);
            } else {
                await onAnimationComplete();
            }
        } catch (e) {
            console.error('❌ 战斗动画启动失败:', e);
            isAnimPlaying = false;
            battleAnimationLock = false;
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
        battleAnimationLock = false;
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

    function renderPlayerStatus() {
        const container = document.getElementById('player-status-list');
        if (!container) return;

        const myId = auth?.currentUser?.id;
        const players = gameState?.players;
        if (!players) return;

        const pairs = gameState.battlePairs || [];
        const myPair = pairs.find(p => p.p1 === myId || p.p2 === myId);
        let opponentId = null;
        let iAmFirstMover = false;
        let opponentIsFirstMover = false;
        if (myPair) {
            opponentId = myPair.p1 === myId ? myPair.p2 : myPair.p1;
            if (myPair.firstMover === 'p1') {
                iAmFirstMover = (myPair.p1 === myId);
                opponentIsFirstMover = !iAmFirstMover;
            } else if (myPair.firstMover === 'p2') {
                iAmFirstMover = (myPair.p2 === myId);
                opponentIsFirstMover = !iAmFirstMover;
            }
        }

        container.innerHTML = '';
        const fragment = document.createDocumentFragment();

        const orderedIds = Object.keys(players).sort((a, b) => {
            if (a === myId) return -1;
            if (b === myId) return 1;
            return 0;
        });

        orderedIds.forEach(pid => {
            const p = players[pid];
            if (!p) return;

            const item = document.createElement('div');
            item.className = 'player-status-item';
            item.setAttribute('data-player-id', pid);

            const avatarUrl = p.avatar || '/assets/default-avatar.png';
            const health = p.health || 0;
            const level = p.shopLevel || 1;

            let inner = `
                <div class="avatar-container">
                    <img src="${avatarUrl}" alt="avatar" onerror="this.src='/assets/default-avatar.png'">
                    <span class="player-level">Lv${level}</span>
                    <span class="hp-text">${health}</span>`;

            if (pid === myId || pid === opponentId) {
                let isFirst = false;
                if (pid === myId) {
                    isFirst = iAmFirstMover;
                } else {
                    isFirst = opponentIsFirstMover;
                }
                const markText = isFirst ? '先' : '后';
                const markBg = isFirst ? '#e94560' : '#3b82f6';
                inner += `<span style="
                    position: absolute;
                    top: 0.1vh;
                    right: 0.1vw;
                    background: ${markBg};
                    color: white;
                    border-radius: 50%;
                    width: 4.2vw;
                    height: 4.2vw;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 2.2vw;
                    font-weight: bold;
                    z-index: 2;
                    line-height: 1;
                    border: 1px solid #fff;
                ">${markText}</span>`;
            }

            inner += `</div>`;
            item.innerHTML = inner;
            fragment.appendChild(item);
        });

        container.appendChild(fragment);
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

        if (round > gameState.round && !isSettling) {
            callSettlement();
        }

        if (window.YYCardShop?.getForcePrepareMode && window.YYCardShop.getForcePrepareMode()) {
            gameState.phase = 'prepare';
            if (phase === 'prepare') {
                window.YYCardShop.setForcePrepareMode(false);
                gameState.round = round;
            }
        } else {
            gameState.phase = phase;
            gameState.round = round;
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

        if (lastPhase !== phase && !(window.YYCardShop?.getForcePrepareMode && window.YYCardShop.getForcePrepareMode())) {
            if (lastPhase === 'battle' && phase !== 'battle') {
                forceStopAnimation();
                hasCalledSettlement = false;
                isSettling = false;
                callSettlement();
                checkAndShowElimination();
                thisBattleRound = 0;
            }
            if (phase === 'battle' && thisBattleRound !== round && !battleAnimationLock && !isAnimPlaying) {
                thisBattleRound = round;
                resetRoundFlags(nowSec);
                launchBattleAnimation(false);
            }
            applyUIMode(phase === 'prepare');
        }

        if (window.YYCardShop?.getForcePrepareMode && window.YYCardShop.getForcePrepareMode()) {
            applyUIMode(true);
        }

        if (window.YYCardBuff?.tryShowBuffSelection) {
            window.YYCardBuff.tryShowBuffSelection(round, phase);
        }

        if (phase !== 'battle' && isAnimPlaying) forceStopAnimation();
        if (phase !== 'battle') safeRefreshUI();

        renderPlayerStatus();

        lastPhase = (window.YYCardShop?.getForcePrepareMode && window.YYCardShop.getForcePrepareMode()) ? 'prepare' : phase;
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
                renderPlayerStatus();
            })
            .subscribe();
    }

    function startPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(async () => {
            if (!currentRoomId) return;
            await refreshGameState();
            renderPlayerStatus();
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

                const nowSec = await getServerTime();
                const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
                const { round: calculatedRound, phase: currentPhase } = calculatePhaseInfo(startSec, nowSec);

                if (calculatedRound > gameState.round) {
                    await callSettlement();
                }

                const globalRound = gameState.round;
                const playerRound = myPlayer?.playerRound || 1;
                if (myPlayer && playerRound < globalRound) {
                    await applyPSettlement();
                }

                applyUIMode(currentPhase === 'prepare');

                if (currentPhase === 'battle' && !myPlayer?.isEliminated) {
                    battleStartTime = nowSec - (getBattleDuration(calculatedRound) - (nowSec - startSec - getPrepareDuration(calculatedRound) - BUFFER_DURATION));
                    launchBattleAnimation(true);
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
        renderPlayerStatus();
        if (window.YYCardInspector) window.YYCardInspector.init();

        if (window.YYCardConsumable && !window.YYCardConsumable._initialized) {
            window.YYCardConsumable._initialized = true;
            window.YYCardConsumable.init({
                getGameState: () => gameState,
                getCurrentUserId: () => auth?.currentUser?.id,
                getCurrentRoomId: () => currentRoomId,
                renderHand: () => window.YYCardShop?.renderHand?.(),
                renderMyBoard: () => window.YYCardShop?.renderMyBoard?.(),
                renderShop: () => window.YYCardShop?.renderShop?.(),
                mergeUpdatedPlayer: (my, updated) => window.YYCardShop?.mergeUpdatedPlayer?.(my, updated),
                toast: (msg, isError) => window.YYCardUtils?.toast?.(msg, isError)
            });
        }

        const nowSec = await getServerTime();
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const { phase: initPhase } = calculatePhaseInfo(startSec, nowSec);
        lastPhase = initPhase;

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
        fetchGameState,
        updateLastOperationTime: () => { lastOperationTime = Date.now(); }
    };
})();

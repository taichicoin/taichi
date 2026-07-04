// ==================== 纯时间驱动对战系统【精简版·预渲染棋盘·修复延迟】 ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;
    let gameSubscription = null;
    let mainTimer = null;
    let enterGuard = false;
    let isSettling = false;
    let isAnimPlaying = false;
    let lastPhase = null;
    let thisBattleRound = 0;
    let gameEndShown = false;

    let battleStartTime = 0;
    let hasCalledSettleBattle = false;

    let pendingElimination = false;
    let pendingRank = null;
    let pendingIsWinner = false;

    let lastDisplayedRound = 1;
    let battleAnimationLock = false;

    let lastOperationTime = 0;
    const OPERATION_COOLDOWN = 3000;

    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';
    const BUFFER_DURATION = 4;
    const MAX_INCREASE_ROUND = 20;

    let serverTimeOffset = 0;

    function getNowServerSec() {
        return Math.floor(Date.now() / 1000) + serverTimeOffset;
    }

    async function calibrateTime() {
        try {
            const serverSec = await getServerTime();
            const localSec = Math.floor(Date.now() / 1000);
            serverTimeOffset = serverSec - localSec;
            return serverSec;
        } catch (e) {
            console.warn('时间校准失败，使用本地时钟');
            return getNowServerSec();
        }
    }

    function getPrepareDuration(round) {
        const effectiveRound = Math.min(round, MAX_INCREASE_ROUND);
        return 27 + (effectiveRound - 1) * 7;
    }
    function getBattleDuration(round) {
        const effectiveRound = Math.min(round, MAX_INCREASE_ROUND);
        return 30 + (effectiveRound - 1) * 7;
    }

    const SETTLE_BATTLE_URL = 'https://kvflbfdqyehtlfmigaxa.supabase.co/functions/v1/settle-battle';

    function resetRoundFlags(startSec) {
        battleStartTime = startSec;
        hasCalledSettleBattle = false;
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
            forceStopAnimation();
            if (window.YYCardShop?.setForcePrepareMode) {
                window.YYCardShop.setForcePrepareMode(true);
            }
            if (gameState) {
                gameState.lastSettledRound = Math.max(gameState.lastSettledRound || 0, gameState.round - 1);
            }
            applyUIMode(true);
            safeRefreshUI();
            checkAndShowElimination();
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
        window.YYCardPlayerRender.renderPlayerStatus();
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
        const nowSec = getNowServerSec();
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

    // ======================== 预渲染双方棋盘（本地数据，不阻塞） ========================
    async function preRenderBattleBoards() {
        const myId = auth?.currentUser?.id;
        if (!myId || !gameState?.players) return;

        // 1. 渲染我方棋盘
        if (window.YYCardShop?.renderMyBoard) {
            window.YYCardShop.renderMyBoard();
        } else if (window.YYCardShop?.refreshAllUI) {
            window.YYCardShop.refreshAllUI();
        }

        // 2. 找到对手
        const pairs = gameState.battlePairs || [];
        const myPair = pairs.find(p => p.p1 === myId || p.p2 === myId);
        if (!myPair) return;
        const oppId = myPair.p1 === myId ? myPair.p2 : myPair.p1;
        if (!oppId) return;

        // 3. 如果本地已有对手棋盘数据，直接渲染；否则异步获取
        if (gameState.players[oppId]?.board) {
            const boardData = gameState.players[oppId].board;
            const utils = window.YYCombatUtils;
            if (utils?.renderEnemyBoardFromData) {
                utils.renderEnemyBoardFromData(oppId, boardData);
            } else {
                // 备用渲染：直接通过 DOM 操作（保证敌方棋盘容器存在）
                const enemyBoard = document.getElementById('enemy-board');
                if (enemyBoard && boardData) {
                    // 简单清空并设置属性
                    enemyBoard.setAttribute('data-player-id', oppId);
                    enemyBoard.innerHTML = '';
                    const board = Array.isArray(boardData) ? boardData.slice(0, 6) : [];
                    while (board.length < 6) board.push(null);
                    // 按视觉顺序重组
                    const displayBoard = [board[3], board[4], board[5], board[0], board[1], board[2]];
                    for (let i = 0; i < 6; i++) {
                        const c = displayBoard[i];
                        const slot = document.createElement('div');
                        slot.className = 'card-slot';
                        slot.setAttribute('data-slot-index', i);
                        const dataIndex = i < 3 ? i + 3 : i - 3;
                        slot.setAttribute('data-board-index', dataIndex);
                        if (c && typeof c === 'object' && (c.card_id || c.cardId) && (c.hp + (c.tempHp || 0)) > 0) {
                            // 构建基本卡牌展示
                            const display = window.YYCombatUtils?.getCardDisplay ? window.YYCombatUtils.getCardDisplay(c) : { name: c.name || '?', image: c.image || '/assets/default-avatar.png' };
                            const el = document.createElement('div');
                            el.className = 'card';
                            el.setAttribute('data-rarity', c.rarity || 'Common');
                            const totalAtk = (c.atk || 0) + (c.tempAtk || 0);
                            const totalHp = (c.hp || 0) + (c.tempHp || 0);
                            el.innerHTML = `
                                <div class="card-frame"></div>
                                <div class="card-icon"><img src="${display.image}" alt="${display.name}" onerror="this.src='/assets/default-avatar.png'"></div>
                                <div class="card-name">${display.name}</div>
                                <div class="card-stats"><span class="card-atk">${totalAtk}</span><span class="card-hp">${totalHp}</span></div>
                            `;
                            slot.appendChild(el);
                        } else {
                            slot.innerHTML = '<div class="card empty-slot">⬤</div>';
                        }
                        enemyBoard.appendChild(slot);
                    }
                }
            }
        } else {
            // 异步获取对手棋盘，拿到后渲染
            fetchOpponentBoard(oppId).then(board => {
                if (board) {
                    if (!gameState.players[oppId]) gameState.players[oppId] = {};
                    gameState.players[oppId].board = board;
                    const utils = window.YYCombatUtils;
                    if (utils?.renderEnemyBoardFromData) {
                        utils.renderEnemyBoardFromData(oppId, board);
                    }
                }
            });
        }
    }

    async function fetchGameState(roomId) {
        if (!roomId) return null;
        const myId = auth?.currentUser?.id;
        if (!myId) return null;

        const { data: globalData, error: gErr } = await supabase
            .from('game_states')
            .select('state->gameStartTime, state->phase, state->round, state->battlePairs, state->lastSettledRound')
            .eq('room_id', roomId)
            .eq('user_id', GLOBAL_USER_ID)
            .single();

        if (gErr || !globalData) return null;

        const { data: myData, error: myErr } = await supabase
            .from('game_states')
            .select(`
                state->gold,
                state->exp,
                state->health,
                state->shopLevel,
                state->shopCards,
                state->hand,
                state->board,
                state->playerRound,
                state->freeRefresh,
                state->isBot,
                state->isEliminated,
                state->isReady,
                state->rank,
                state->pendingConsumables,
                state->activeBuff,
                state->buffRefreshCount
            `)
            .eq('room_id', roomId)
            .eq('user_id', myId)
            .single();

        if (myErr || !myData) return null;

        const { data: otherRows } = await supabase
            .from('game_states')
            .select('user_id, state->health, state->isEliminated, state->rank, state->playerRound, state->shopLevel')
            .eq('room_id', roomId)
            .not('user_id', 'in', `(${GLOBAL_USER_ID},${myId})`);

        const players = {};
        players[myId] = {
            gold: myData.gold,
            exp: myData.exp,
            health: myData.health,
            shopLevel: myData.shopLevel,
            shopCards: myData.shopCards,
            hand: myData.hand,
            board: myData.board,
            playerRound: myData.playerRound,
            freeRefresh: myData.freeRefresh,
            isBot: myData.isBot,
            isEliminated: myData.isEliminated,
            isReady: myData.isReady,
            rank: myData.rank,
            pendingConsumables: myData.pendingConsumables || [],
            activeBuff: myData.activeBuff || null,
            buffRefreshCount: myData.buffRefreshCount || 0,
            _checkedActiveBuff: true
        };

        (otherRows || []).forEach(row => {
            players[row.user_id] = {
                health: row.health,
                isEliminated: row.isEliminated,
                rank: row.rank,
                playerRound: row.playerRound,
                shopLevel: row.shopLevel || 1,
                board: null,
                hand: null,
                shopCards: null,
                gold: 0,
                exp: 0,
                isBot: false,
                freeRefresh: 0,
                avatar: null
            };
        });

        return {
            players,
            gameStartTime: globalData.gameStartTime,
            phase: globalData.phase || 'prepare',
            round: globalData.round || 1,
            battlePairs: globalData.battlePairs || [],
            lastSettledRound: globalData.lastSettledRound || 0
        };
    }

    // ... 其余函数（refreshGameStateLight、mergeOtherPlayers、refreshGameState 等保持不变）
    async function refreshGameStateLight() {
        if (!currentRoomId) return;
        try {
            const { data: globalData } = await supabase
                .from('game_states')
                .select('state->phase, state->round, state->battlePairs, state->lastSettledRound')
                .eq('room_id', currentRoomId)
                .eq('user_id', GLOBAL_USER_ID)
                .single();
            if (globalData) {
                gameState.phase = globalData.phase || gameState.phase;
                gameState.round = globalData.round || gameState.round;
                gameState.battlePairs = globalData.battlePairs || gameState.battlePairs;
                gameState.lastSettledRound = globalData.lastSettledRound || gameState.lastSettledRound;
            }
            const myId = auth?.currentUser?.id;
            const { data: otherRows } = await supabase
                .from('game_states')
                .select('user_id, state->health, state->isEliminated, state->rank, state->playerRound, state->shopLevel')
                .eq('room_id', currentRoomId)
                .not('user_id', 'in', `(${GLOBAL_USER_ID},${myId})`);
            if (otherRows && gameState.players) {
                otherRows.forEach(row => {
                    const p = gameState.players[row.user_id];
                    if (p) {
                        p.health = row.health;
                        p.isEliminated = row.isEliminated;
                        p.rank = row.rank;
                        p.playerRound = row.playerRound;
                        p.shopLevel = row.shopLevel || 1;
                    }
                });
            }
            window.YYCardPlayerRender.renderPlayerStatus();
        } catch(e) {}
    }

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
            if (newP.shopLevel !== undefined) oldP.shopLevel = newP.shopLevel;
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

        const sinceLastOp = Date.now() - lastOperationTime;
        if (sinceLastOp < OPERATION_COOLDOWN) {
            mergeOtherPlayers(newState, isBattlePhase);
            window.YYCardPlayerRender.renderPlayerStatus();
            return;
        }

        if (window._consumableDragging) {
            mergeOtherPlayers(newState, isBattlePhase);
            window.YYCardPlayerRender.renderPlayerStatus();
            return;
        }

        if (currentUserId && (
            isAnimPlaying ||
            (window.mergeService?.isMergeLocked && window.mergeService.isMergeLocked()) ||
            (window.YYCardShop?.isDragging && window.YYCardShop.isDragging) ||
            window.YYCardShop?.isBusy
        )) {
            mergeOtherPlayers(newState, isBattlePhase);
            window.YYCardPlayerRender.renderPlayerStatus();
            return;
        }

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
            myOld.shopLevel = myNew.shopLevel;
            myOld.isBot = myNew.isBot;
            myOld.isEliminated = myNew.isEliminated;
            myOld.isReady = myNew.isReady;
            myOld.rank = myNew.rank;
            myOld.playerRound = myNew.playerRound;
            myOld.freeRefresh = myNew.freeRefresh;
            if (myNew.shopCards !== undefined) myOld.shopCards = myNew.shopCards;

            if (myNew.pendingConsumables !== undefined) {
                myOld.pendingConsumables = myNew.pendingConsumables;
                window.YYCardConsumable?.updateRewardBadge?.();
            }
            if (myNew.activeBuff !== undefined) {
                myOld.activeBuff = myNew.activeBuff;
            }
            if (myNew.buffRefreshCount !== undefined) {
                myOld.buffRefreshCount = myNew.buffRefreshCount;
            }
            myOld._checkedActiveBuff = true;

            if (!isBattlePhase) {
                myOld.health = myNew.health;
                myOld.board = myNew.board;
                myOld.hand = myNew.hand;
            }

            mergeOtherPlayers(newState, isBattlePhase);
        } else {
            gameState.players = newState.players;
        }

        safeRefreshUI();
        window.YYCardPlayerRender.renderPlayerStatus();
    }

    // ====================== 精简版 launchBattleAnimation ======================
    async function launchBattleAnimation(isReconnect = false) {
        if (isAnimPlaying || battleAnimationLock) return;

        const myPlayer = gameState?.players?.[auth?.currentUser?.id];
        if (myPlayer?.isEliminated) return;

        battleAnimationLock = true;
        isAnimPlaying = true;

        try {
            const myId = auth?.currentUser?.id;

            // 棋盘已由 preRenderBattleBoards 渲染，这里不再重复获取和渲染

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

            if (settleData.alreadySettled) {
                console.log('⚡ 战斗已结算，直接同步状态');
                if (settleData.updatedPlayers) {
                    for (const pid in settleData.updatedPlayers) {
                        if (gameState.players[pid]) {
                            const u = settleData.updatedPlayers[pid];
                            if (u.health !== undefined) gameState.players[pid].health = u.health;
                            if (u.board !== undefined) gameState.players[pid].board = u.board;
                            if (u.hand !== undefined) gameState.players[pid].hand = u.hand;
                            if (u.isEliminated !== undefined) gameState.players[pid].isEliminated = u.isEliminated;
                            if (u.rank !== undefined) gameState.players[pid].rank = u.rank;
                            if (u.pendingConsumables !== undefined) {
                                gameState.players[pid].pendingConsumables = u.pendingConsumables;
                            }
                            if (u.activeBuff !== undefined) {
                                gameState.players[pid].activeBuff = u.activeBuff;
                            }
                        }
                    }
                }
                gameState.lastSettledRound = settleData.round || gameState.round;
                hasCalledSettleBattle = true;

                isAnimPlaying = false;
                battleAnimationLock = false;
                if (window.YYCardShop?.setForcePrepareMode) {
                    window.YYCardShop.setForcePrepareMode(true);
                }
                applyUIMode(true);
                safeRefreshUI();
                return;
            }

            const animGameState = {
                ...gameState,
                players: preBattlePlayers,
                _buffEvents: settleData.buffEvents || [],
                _combatResults: settleData.combatResults || [],
            };

            hasCalledSettleBattle = true;
            gameState.lastSettledRound = settleData.round || gameState.round;

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
                            if (u.pendingConsumables !== undefined) {
                                gameState.players[pid].pendingConsumables = u.pendingConsumables;
                                if (pid === auth?.currentUser?.id) {
                                    window.YYCardConsumable?.updateRewardBadge?.();
                                }
                            }
                            if (u.activeBuff !== undefined) {
                                gameState.players[pid].activeBuff = u.activeBuff;
                            }
                            if (u.buffRefreshCount !== undefined) {
                                gameState.players[pid].buffRefreshCount = u.buffRefreshCount;
                            }
                            if (pid === auth?.currentUser?.id) {
                                gameState.players[pid]._checkedActiveBuff = true;
                            }
                        }
                    }
                }

                isAnimPlaying = false;
                battleAnimationLock = false;

                await refreshGameStateLight();
                if (window.YYCardShop?.setForcePrepareMode) {
                    window.YYCardShop.setForcePrepareMode(true);
                }
                applyUIMode(true);
                safeRefreshUI();
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
            if (gameSubscription) gameSubscription.unsubscribe();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            const bottomNav = document.querySelector('.bottom-nav');
            if (bottomNav) bottomNav.style.display = '';
            overlay.remove();
            document.body.classList.remove('buffering-mode');
            gameState = currentRoomId = null;
        };
    }

    // ==================== 调整后的 tick ====================
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

        const nowSec = getNowServerSec();
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const { round, phase, remaining, total } = calculatePhaseInfo(startSec, nowSec);

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
            lastDisplayedRound = gameState.round || round;
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

        // ========== 3D 模型预热 ==========
        if (phase === 'buffering' && window.YYCardCombat3D && !window.YYCardCombat3D.isReady()) {
            window.YYCardCombat3D.init().catch(() => {});
        }

        if (lastPhase !== phase && !(window.YYCardShop?.getForcePrepareMode && window.YYCardShop.getForcePrepareMode())) {
            if (lastPhase === 'battle' && phase !== 'battle') {
                forceStopAnimation();
                thisBattleRound = 0;
            }
            if (phase === 'battle' && thisBattleRound !== round && !battleAnimationLock && !isAnimPlaying) {
                thisBattleRound = round;
                resetRoundFlags(nowSec);
                // ★ 立即渲染棋盘
                preRenderBattleBoards();
                // ★ 发起后端结算
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

        window.YYCardPlayerRender.renderPlayerStatus();

        lastPhase = (window.YYCardShop?.getForcePrepareMode && window.YYCardShop.getForcePrepareMode()) ? 'prepare' : phase;
    }

    // 其余函数保持不变（startGlobalTimer、applyUIMode、subscribeGameState、enterBattle、bindLeaveButton 等）
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
            }, async (payload) => {
                const newState = payload.new.state;
                const changedUserId = payload.new.user_id;

                if (changedUserId === GLOBAL_USER_ID) {
                    if (newState) {
                        if (newState.phase) gameState.phase = newState.phase;
                        if (newState.round) gameState.round = newState.round;
                        if (newState.battlePairs) gameState.battlePairs = newState.battlePairs;
                        if (newState.lastSettledRound !== undefined) gameState.lastSettledRound = newState.lastSettledRound;
                    }
                    safeRefreshUI();
                    window.YYCardPlayerRender.renderPlayerStatus();
                    return;
                }

                if (changedUserId === auth?.currentUser?.id) {
                    const my = gameState.players[changedUserId];
                    if (my && newState) {
                        const fields = ['gold','exp','health','shopLevel','playerRound','freeRefresh','isEliminated','rank'];
                        fields.forEach(k => {
                            if (newState[k] !== undefined) my[k] = newState[k];
                        });
                        if (newState.shopCards) my.shopCards = newState.shopCards;
                        if (newState.pendingConsumables !== undefined) {
                            my.pendingConsumables = newState.pendingConsumables;
                            window.YYCardConsumable?.updateRewardBadge?.();
                        }
                        if (newState.activeBuff !== undefined) {
                            my.activeBuff = newState.activeBuff;
                        }
                        if (newState.buffRefreshCount !== undefined) {
                            my.buffRefreshCount = newState.buffRefreshCount;
                        }
                        my._checkedActiveBuff = true;

                        if (gameState.phase !== 'battle') {
                            if (newState.hand) my.hand = newState.hand;
                            if (newState.board) my.board = newState.board;
                        }
                        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                    }
                } else {
                    const other = gameState.players[changedUserId];
                    if (other && newState) {
                        if (newState.health !== undefined) other.health = newState.health;
                        if (newState.shopLevel !== undefined) other.shopLevel = newState.shopLevel;
                        if (newState.isEliminated !== undefined) other.isEliminated = newState.isEliminated;
                        if (newState.rank !== undefined) other.rank = newState.rank;
                        if (newState.playerRound !== undefined) other.playerRound = newState.playerRound;
                    }
                }
                window.YYCardPlayerRender.renderPlayerStatus();
            })
            .subscribe();
    }

    function startPolling() {}

    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;

        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';

        const bottomNav = document.querySelector('.bottom-nav');
        if (bottomNav) bottomNav.style.display = 'none';

        ensureSkipUI();

        await calibrateTime();

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

                lastDisplayedRound = gameState.round;

                if (gameState.phase !== 'battle' || gameState.lastSettledRound >= gameState.round) {
                    applyUIMode(true);
                    if (window.YYCardShop?.setForcePrepareMode) {
                        window.YYCardShop.setForcePrepareMode(true);
                    }
                } else {
                    applyUIMode(false);
                }

                if (gameState.phase === 'battle' && !myPlayer?.isEliminated) {
                    const nowSec = getNowServerSec();
                    const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
                    battleStartTime = nowSec - (getBattleDuration(gameState.round) - (nowSec - startSec - getPrepareDuration(gameState.round) - BUFFER_DURATION));
                    // 重连时也预渲染棋盘
                    preRenderBattleBoards();
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
        window.YYCardPlayerRender.renderPlayerStatus();
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

        const nowSec = getNowServerSec();
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const { phase: initPhase } = calculatePhaseInfo(startSec, nowSec);
        lastPhase = initPhase;

        subscribeGameState();
        startGlobalTimer();
        bindLeaveButton();

        window.YYCardConsumable?.updateRewardBadge?.();

        if (currentUserId && gameState?.players?.[currentUserId]) {
            gameState.players[currentUserId]._checkedActiveBuff = true;
        }

        enterGuard = false;
    }

    function bindLeaveButton() {
        const btn = document.getElementById('leave-battle-btn');
        if (!btn) return;
        btn.onclick = async () => {
            if (!confirm("确定退出战斗？")) return;
            clearInterval(mainTimer);
            if (gameSubscription) gameSubscription.unsubscribe();
            forceStopAnimation();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            const bottomNav = document.querySelector('.bottom-nav');
            if (bottomNav) bottomNav.style.display = 'flex';
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

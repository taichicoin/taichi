// ==================== 战斗核心数据层 (battle-core.js) ====================
// 职责：时间计算、数据库读取、状态合并、实时订阅
// 不依赖 DOM，不依赖动画模块，写好后基本不动
window.YYCardBattleCore = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const config = window.YYCardConfig;

    let serverTimeOffset = 0;
    const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';
    const MAX_INCREASE_ROUND = 20;
    const BUFFER_DURATION = 4;

    // ---------- 时间系统 ----------
    function getNowServerSec() {
        return Math.floor(Date.now() / 1000) + serverTimeOffset;
    }

    async function calibrateTime() {
        try {
            const { data, error } = await supabase.rpc('get_server_time');
            if (error) throw error;
            const localSec = Math.floor(Date.now() / 1000);
            serverTimeOffset = data - localSec;
            return data;
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

    // ---------- 数据库读取 ----------
    async function fetchOpponentBoard(opponentId, roomId) {
        if (!opponentId || !roomId) return null;
        const { data, error } = await supabase
            .from('game_states')
            .select('state->board')
            .eq('room_id', roomId)
            .eq('user_id', opponentId)
            .maybeSingle();
        if (error || !data) return null;
        return data.board;
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

    async function refreshGameStateLight(currentRoomId, gameState) {
        if (!currentRoomId || !gameState) return;
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
        } catch(e) {}
    }

    function mergeOtherPlayers(gameState, newState, isBattlePhase = false) {
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

    // ---------- 实时订阅 ----------
    function subscribeGameState(currentRoomId, gameState, onPlayerUpdate, onUIUpdate) {
        let subscription = supabase.channel(`game:${currentRoomId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'game_states',
                filter: `room_id=eq.${currentRoomId}`
            }, async (payload) => {
                const newState = payload.new.state;
                const changedUserId = payload.new.user_id;
                const myId = auth?.currentUser?.id;

                if (changedUserId === GLOBAL_USER_ID) {
                    if (newState) {
                        if (newState.phase) gameState.phase = newState.phase;
                        if (newState.round) gameState.round = newState.round;
                        if (newState.battlePairs) gameState.battlePairs = newState.battlePairs;
                        if (newState.lastSettledRound !== undefined) gameState.lastSettledRound = newState.lastSettledRound;
                    }
                    if (onUIUpdate) onUIUpdate();
                    return;
                }

                if (changedUserId === myId) {
                    const my = gameState.players[changedUserId];
                    if (my && newState) {
                        const fields = ['gold','exp','health','shopLevel','playerRound','freeRefresh','isEliminated','rank'];
                        fields.forEach(k => {
                            if (newState[k] !== undefined) my[k] = newState[k];
                        });
                        if (newState.shopCards) my.shopCards = newState.shopCards;
                        if (newState.pendingConsumables !== undefined) {
                            my.pendingConsumables = newState.pendingConsumables;
                            if (onPlayerUpdate) onPlayerUpdate('consumable');
                        }
                        if (newState.activeBuff !== undefined) my.activeBuff = newState.activeBuff;
                        if (newState.buffRefreshCount !== undefined) my.buffRefreshCount = newState.buffRefreshCount;
                        my._checkedActiveBuff = true;

                        if (gameState.phase !== 'battle') {
                            if (newState.hand) my.hand = newState.hand;
                            if (newState.board) my.board = newState.board;
                        }
                        if (onUIUpdate) onUIUpdate();
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
            })
            .subscribe();
        return subscription;
    }

    return {
        calibrateTime,
        getNowServerSec,
        calculatePhaseInfo,
        getPrepareDuration,
        getBattleDuration,
        fetchGameState,
        fetchOpponentBoard,
        refreshGameStateLight,
        mergeOtherPlayers,
        subscribeGameState,
        GLOBAL_USER_ID,
        BUFFER_DURATION,
        MAX_INCREASE_ROUND
    };
})();

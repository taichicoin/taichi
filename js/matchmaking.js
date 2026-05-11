// ==================== 匹配系统【终极修复版 + 棋盘纯角色 + 手牌限一武器 + 商店每组15张 + 初始全普通卡】 ====================
window.YYCardMatchmaking = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    // 核心状态（新增状态锁，防止并发修改）
    let currentRoom = null;
    let roomSubscription = null;
    let matchmakingTimer = null;
    let checkRoomPollTimer = null;
    let isMatching = false;
    let isProcessing = false;
    let subscribeRetryCount = 0;
    const MAX_SUBSCRIBE_RETRY = 3;

    function log(msg, isError = false) {
        if (auth && typeof auth.log === 'function') {
            auth.log(msg, isError);
        } else {
            console[isError ? 'error' : 'log'](`[匹配系统] ${msg}`);
        }
    }

    function updateStatus(text, show = true) {
        const el = document.getElementById('match-status');
        if (el) {
            el.style.display = show ? 'block' : 'none';
            el.textContent = text;
        }
    }

    function resetUI() {
        isMatching = false;
        isProcessing = false;
        subscribeRetryCount = 0;
        const startBtn = document.getElementById('start-match-btn');
        if (startBtn) {
            const hasUsername = auth?.currentProfile?.username;
            startBtn.disabled = !hasUsername;
            startBtn.textContent = hasUsername ? '⚡ 开始匹配' : '请先设置游戏ID';
        }
        updateStatus('', false);
        const cancelBtn = document.getElementById('cancel-match-btn');
        if (cancelBtn) cancelBtn.style.display = 'none';
        log('✅ UI状态已全量重置');
    }

    function cleanup() {
        if (roomSubscription) {
            roomSubscription.unsubscribe();
            roomSubscription = null;
        }
        if (matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
        }
        if (checkRoomPollTimer) {
            clearInterval(checkRoomPollTimer);
            checkRoomPollTimer = null;
        }
        isMatching = false;
        isProcessing = false;
        currentRoom = null;
    }

    async function cleanPlayerResidualRooms(uid, excludeRoomId = null) {
        if (!uid) return;
        let query = supabase.from('room_players').select('room_id').eq('player_id', uid);
        if (excludeRoomId) query = query.neq('room_id', excludeRoomId);
        const { data: myRooms } = await query;
        const roomIds = [...new Set(myRooms?.map(r => r.room_id) || [])];
        if (roomIds.length > 0) {
            let deleteQuery = supabase.from('room_players').delete().eq('player_id', uid);
            if (excludeRoomId) deleteQuery = deleteQuery.neq('room_id', excludeRoomId);
            await deleteQuery;
        }
        for (const roomId of roomIds) {
            await cleanRoomIfEmpty(roomId);
        }
    }

    async function cleanRoomIfEmpty(roomId) {
        const { data: realPlayers } = await supabase
            .from('room_players')
            .select('player_id')
            .eq('room_id', roomId)
            .eq('is_bot', false);
        if (!realPlayers || realPlayers.length === 0) {
            await supabase.from('game_states').delete().eq('room_id', roomId);
            await supabase.from('room_players').delete().eq('room_id', roomId);
            await supabase.from('rooms').delete().eq('id', roomId);
        }
    }

    async function start() {
        if (isProcessing || isMatching) return;
        isProcessing = true;
        const profile = auth?.currentProfile;
        const uid = auth?.currentUser?.id;
        if (!profile?.username || !uid) {
            if (window.YYCardShop?.toast) window.YYCardShop.toast('请先设置游戏ID', true);
            isProcessing = false;
            return;
        }
        cleanup();
        isMatching = true;
        const startBtn = document.getElementById('start-match-btn');
        startBtn.disabled = true;
        startBtn.textContent = '⏳ 匹配中...';
        updateStatus('正在寻找对手...', true);
        document.getElementById('cancel-match-btn').style.display = 'inline-block';
        await cleanPlayerResidualRooms(uid);
        const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
        const matchTimeout = config.MATCHMAKING_TIMEOUT_MS || 15000;
        try {
            let { data: waitingRooms } = await supabase
                .from('rooms')
                .select('*')
                .eq('status', 'waiting')
                .order('created_at', { ascending: true })
                .limit(1);
            let room = waitingRooms?.[0];
            if (!room) {
                const { data: newRoom, error: createError } = await supabase
                    .from('rooms')
                    .insert({ status: 'waiting', max_players: maxPlayers, created_at: new Date().toISOString() })
                    .select('*')
                    .single();
                if (createError) throw createError;
                room = newRoom;
            }
            const { data: existing } = await supabase
                .from('room_players')
                .select('*')
                .eq('room_id', room.id)
                .eq('player_id', uid)
                .maybeSingle();
            if (existing) {
                currentRoom = room;
                startMatchTimers(room.id, matchTimeout);
                subscribeToRoom(room.id);
                isProcessing = false;
                return;
            }
            await supabase.from('room_players').insert({
                room_id: room.id,
                player_id: uid,
                mmr_at_join: profile.mmr || config.INITIAL_MMR,
                health: config.INITIAL_HEALTH || 100,
                is_bot: false,
                is_ready: false,
                joined_at: new Date().toISOString()
            });
            currentRoom = room;
            startMatchTimers(room.id, matchTimeout);
            subscribeToRoom(room.id);
        } catch (err) {
            log(`❌ 匹配失败: ${err.message}`, true);
            cleanup();
            resetUI();
        } finally {
            isProcessing = false;
        }
    }

    function startMatchTimers(roomId, timeoutMs) {
        if (matchmakingTimer) clearTimeout(matchmakingTimer);
        if (checkRoomPollTimer) clearInterval(checkRoomPollTimer);
        matchmakingTimer = setTimeout(() => handleTimeout(roomId), timeoutMs);
        checkRoomPollTimer = setInterval(() => {
            if (!isMatching || !currentRoom) {
                clearInterval(checkRoomPollTimer);
                checkRoomPollTimer = null;
                return;
            }
            checkRoomFull(roomId);
        }, 2000);
    }

    async function cancel() {
        if (isProcessing) return;
        cleanup();
        const uid = auth?.currentUser?.id;
        if (uid) await cleanPlayerResidualRooms(uid, currentRoom?.id);
        resetUI();
    }

    async function leaveAndClean() {
        cleanup();
        const uid = auth?.currentUser?.id;
        if (uid) await cleanPlayerResidualRooms(uid, currentRoom?.id);
        resetUI();
    }

    async function handleTimeout(roomId) {
        if (!currentRoom || currentRoom.id !== roomId || !isMatching || isProcessing) return;
        isProcessing = true;
        try {
            const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
            const { data: existingPlayers } = await supabase
                .from('room_players')
                .select('player_id, is_bot')
                .eq('room_id', roomId);
            const existingIds = existingPlayers?.map(p => p.player_id) || [];
            const realPlayerCount = existingPlayers?.filter(p => !p.is_bot).length || 0;
            const neededBots = maxPlayers - existingIds.length;
            if (realPlayerCount === 0) {
                await cleanRoomIfEmpty(roomId);
                cleanup();
                resetUI();
                return;
            }
            if (neededBots <= 0) {
                await checkRoomFull(roomId);
                return;
            }
            const { data: allBots, error: botError } = await supabase
                .from('profiles')
                .select('id')
                .eq('is_bot', true)
                .limit(200);
            if (botError || !allBots?.length) throw new Error('没有人机');
            const availableBots = allBots.map(b => b.id).filter(id => !existingIds.includes(id)).slice(0, neededBots);
            if (availableBots.length < neededBots) throw new Error('人机不足');
            await supabase.from('room_players').insert(availableBots.map(botId => ({
                room_id: roomId, player_id: botId, mmr_at_join: 1000,
                health: config.INITIAL_HEALTH || 100, is_bot: true, is_ready: true,
                joined_at: new Date().toISOString()
            })));
            let retries = 0;
            while (retries < 3) {
                await new Promise(r => setTimeout(r, 800));
                const { data: latest } = await supabase.from('room_players').select('player_id').eq('room_id', roomId);
                if ((latest?.length || 0) >= maxPlayers) {
                    await checkRoomFull(roomId);
                    return;
                }
                retries++;
            }
            await checkRoomFull(roomId);
        } catch (err) {
            log(`❌ 人机填充失败: ${err.message}`, true);
            cleanup();
            resetUI();
        } finally {
            isProcessing = false;
        }
    }

    function subscribeToRoom(roomId) {
        if (roomSubscription) { roomSubscription.unsubscribe(); roomSubscription = null; }
        roomSubscription = supabase
            .channel(`room:${roomId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, () => {
                if (!isProcessing) checkRoomFull(roomId);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
                if (payload.new.status === 'battle') {
                    cleanup();
                    window.YYCardBattle?.enterBattle?.(roomId);
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    subscribeRetryCount = 0;
                    checkRoomFull(roomId);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    if (subscribeRetryCount < MAX_SUBSCRIBE_RETRY) {
                        subscribeRetryCount++;
                        setTimeout(() => subscribeToRoom(roomId), 1000 * subscribeRetryCount);
                    } else {
                        cleanup();
                        resetUI();
                    }
                }
            });
    }

    async function checkRoomFull(roomId) {
        if (isProcessing || !isMatching || !currentRoom || currentRoom.id !== roomId) return;
        const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
        const { data: players } = await supabase.from('room_players').select('*').eq('room_id', roomId);
        const count = players?.length || 0;
        const realPlayerCount = players?.filter(p => !p.is_bot).length || 0;
        updateStatus(`匹配中... ${count}/${maxPlayers}`);
        if (realPlayerCount === 0) {
            await cleanRoomIfEmpty(roomId);
            cleanup();
            resetUI();
            return;
        }
        if (count >= maxPlayers) {
            isProcessing = true;
            try {
                const { data: updatedRoom, error: updateError } = await supabase
                    .from('rooms')
                    .update({ status: 'battle' })
                    .eq('id', roomId)
                    .eq('status', 'waiting')
                    .select('*')
                    .single();
                if (updateError || !updatedRoom) {
                    cleanup();
                    window.YYCardBattle?.enterBattle?.(roomId);
                    return;
                }
                cleanup();
                await initializeGame(roomId, players);
            } catch (err) {
                log(`❌ 开始游戏失败: ${err.message}`, true);
                isProcessing = false;
            }
        }
    }

    // ========== 初始化游戏（强制全部普通卡） ==========
    async function initializeGame(roomId, players) {
        log('🎮 开始初始化游戏状态（全普通卡 + 每组15张）...');
        try {
            const { data: existing } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', roomId)
                .maybeSingle();
            if (existing) {
                window.YYCardBattle?.enterBattle?.(roomId);
                return;
            }

            await utils.loadCardTemplates();

            const now = new Date().toISOString();
            const state = {
                round: 1,
                phase: 'prepare',
                gameStartTime: now,
                phaseStartTime: now,
                battlePairs: [],
                players: {}
            };

            // 辅助：判断卡牌是否为普通卡（没有稀有度字段或 rarity === 'common' 都算普通）
            function isCommon(card) {
                if (!card) return false;
                return !card.rarity || card.rarity === 'common';
            }

            // 辅助：生成一张普通商店卡牌（重试直到拿到普通卡，最多20次）
            function generateCommonShopCard(shopLevel) {
                for (let i = 0; i < 20; i++) {
                    const card = utils.generateShopCard(shopLevel);
                    if (card && isCommon(card)) return card;
                }
                return null; // 实在刷不出就返回 null
            }

            // 生成一组15张普通商店卡牌
            function buildShopGroup(shopLevel) {
                const group = [];
                for (let i = 0; i < 15; i++) {
                    const card = generateCommonShopCard(shopLevel);
                    group.push(card || null);
                }
                return group;
            }

            for (const p of players) {
                const isBot = p.is_bot;
                let rawDeck = [];
                try {
                    rawDeck = isBot ? utils.getBotDeck() : utils.getDefaultDeck();
                } catch (e) {
                    log(`⚠️ 卡组生成失败: ${e.message}`);
                    rawDeck = [];
                }

                // 强制只保留普通卡
                const commonOnlyDeck = rawDeck.filter(c => c && isCommon(c));

                // 分离角色与武器（全普通）
                const characters = commonOnlyDeck.filter(c => c.type === 'character' || !c.type);
                const weapons = commonOnlyDeck.filter(c => c.type === 'weapon');

                // 棋盘：取前3个普通角色，带装备槽
                const boardCards = characters.slice(0, 3).map(c => ({
                    ...c,
                    star: c.star || 0,
                    weapon: null,
                    item1: null,
                    item2: null
                }));

                // 手牌：剩余普通角色 + 最多一个普通武器（取第一个）
                const remainingChars = characters.slice(3).map(c => ({ ...c, star: c.star || 0 }));
                const handCards = [...remainingChars];
                if (weapons.length > 0) {
                    handCards.push({ ...weapons[0], star: weapons[0].star || 0 });
                }
                while (handCards.length < 15) handCards.push(null);
                const finalHand = handCards.slice(0, 15);

                // 生成全普通商店
                let shopData;
                try {
                    const group1 = buildShopGroup(1);
                    const group2 = buildShopGroup(1);
                    shopData = { buffer: [group1, group2], active: 0, subIndex: 0, next: null };
                } catch (e) {
                    const nulls = new Array(15).fill(null);
                    shopData = { buffer: [nulls, nulls], active: 0, subIndex: 0, next: null };
                }

                state.players[p.player_id] = {
                    health: config.INITIAL_HEALTH || 100,
                    gold: 500000,
                    exp: 0,
                    shopLevel: 1,
                    board: boardCards.concat(new Array(6 - boardCards.length).fill(null)).slice(0, 6),
                    hand: finalHand,
                    shopCards: shopData,
                    isBot: isBot,
                    isReady: false,
                    isEliminated: false
                };
            }

            await supabase.from('game_states').upsert({ room_id: roomId, state }, { onConflict: 'room_id' });
            log('🎉 初始化完成（全普通卡），进入对战！');
            window.YYCardBattle?.enterBattle?.(roomId);
            resetUI();
        } catch (err) {
            log(`❌ 初始化失败: ${err.message}`, true);
            cleanup();
            resetUI();
        }
    }

    function setCurrentRoom(roomId) {
        cleanup();
        currentRoom = { id: roomId };
        isMatching = true;
        startMatchTimers(roomId, config.MATCHMAKING_TIMEOUT_MS || 15000);
        subscribeToRoom(roomId);
    }

    function getCurrentRoomId() {
        return currentRoom?.id || null;
    }

    return {
        start, cancel, setCurrentRoom, subscribeToRoom, leaveAndClean,
        getCurrentRoomId, currentRoom: () => currentRoom
    };
})();

// 音效（保留）
const clickSound = new Audio("/assets/mp3/wodedaodun.mp3");
clickSound.volume = 0.5;
document.addEventListener("click", function(e){
    if(e.target.id === "start-match-btn"){
        clickSound.currentTime = 0;
        clickSound.play().catch(()=>{});
    }
});
console.log('✅ matchmaking.js 加载完成（终极修复 + 全普通初始卡 + 每组15张）');

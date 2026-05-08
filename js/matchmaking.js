// ==================== 匹配系统【终极修复版 + 双缓冲商店v3初始化 + 装备槽初始化 + 初始卡组过滤】 ====================
window.YYCardMatchmaking = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    // 核心状态
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
        if (roomSubscription) { roomSubscription.unsubscribe(); roomSubscription = null; }
        if (matchmakingTimer) { clearTimeout(matchmakingTimer); matchmakingTimer = null; }
        if (checkRoomPollTimer) { clearInterval(checkRoomPollTimer); checkRoomPollTimer = null; }
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
        log('🔍 开始匹配...');

        const startBtn = document.getElementById('start-match-btn');
        startBtn.disabled = true;
        startBtn.textContent = '⏳ 匹配中...';
        updateStatus('正在寻找对手...', true);
        const cancelBtn = document.getElementById('cancel-match-btn');
        cancelBtn.style.display = 'inline-block';

        await cleanPlayerResidualRooms(uid);

        const myMmr = profile.mmr || config.INITIAL_MMR;
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

            const { error: joinError } = await supabase.from('room_players').insert({
                room_id: room.id, player_id: uid, mmr_at_join: myMmr,
                health: config.INITIAL_HEALTH || 100, is_bot: false, is_ready: false,
                joined_at: new Date().toISOString()
            });
            if (joinError) throw joinError;

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
        log('🛑 玩家取消匹配');
        const uid = auth?.currentUser?.id;
        const roomId = currentRoom?.id;
        cleanup();
        if (uid) await cleanPlayerResidualRooms(uid, roomId);
        resetUI();
    }

    async function leaveAndClean() {
        log('🚪 主动退出，执行全量清理...');
        const uid = auth?.currentUser?.id;
        const roomId = currentRoom?.id;
        cleanup();
        if (uid) await cleanPlayerResidualRooms(uid, roomId);
        resetUI();
    }

    async function handleTimeout(roomId) {
        if (!currentRoom || currentRoom.id !== roomId || !isMatching || isProcessing) return;
        isProcessing = true;
        log('⏰ 匹配超时，开始填充人机...');
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
            if (botError || !allBots || allBots.length === 0) throw new Error('数据库中没有预制人机');

            const availableBots = allBots
                .map(b => b.id)
                .filter(id => !existingIds.includes(id))
                .slice(0, neededBots);
            if (availableBots.length < neededBots) throw new Error('可用人机不足');

            const botInserts = availableBots.map(botId => ({
                room_id: roomId, player_id: botId, mmr_at_join: 1000,
                health: config.INITIAL_HEALTH || 100, is_bot: true, is_ready: true,
                joined_at: new Date().toISOString()
            }));
            const { error: insertError } = await supabase.from('room_players').insert(botInserts);
            if (insertError) throw insertError;

            let checkRetry = 0;
            const maxCheckRetry = 3;
            while (checkRetry < maxCheckRetry) {
                await new Promise(resolve => setTimeout(resolve, 800));
                const { data: latestPlayers } = await supabase
                    .from('room_players')
                    .select('player_id')
                    .eq('room_id', roomId);
                if ((latestPlayers?.length || 0) >= maxPlayers) {
                    await checkRoomFull(roomId);
                    return;
                }
                checkRetry++;
            }
            await checkRoomFull(roomId);
        } catch (err) {
            log(`❌ 人机填充失败: ${err.message}`, true);
            if (window.YYCardShop?.toast) window.YYCardShop.toast('匹配超时，人机填充失败，请重试', true);
            cleanup();
            resetUI();
        } finally {
            isProcessing = false;
        }
    }

    function subscribeToRoom(roomId) {
        if (roomSubscription) { roomSubscription.unsubscribe(); roomSubscription = null; }
        roomSubscription = supabase.channel(`room:${roomId}`)
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
                log(`❌ 游戏开始流程失败: ${err.message}`, true);
                isProcessing = false;
            }
        }
    }

    // ========== 修复后的初始化逻辑 ==========
    async function initializeGame(roomId, players) {
        log('🎮 开始初始化游戏状态 (双缓冲商店v3 + 初始卡组过滤) ...');
        try {
            const { data: existing } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', roomId)
                .maybeSingle();
            if (existing) {
                log('⚠️ 游戏状态已存在，直接进入对战');
                window.YYCardBattle?.enterBattle?.(roomId);
                return;
            }

            await utils.loadCardTemplates();
            const templates = window.cardTemplates; // 已经是以 card_id 为 key 的对象

            // 筛选角色卡和武器库
            const allCards = Object.values(templates);
            const characterCards = allCards.filter(c => c.type === 'character');
            const weaponCards = allCards.filter(c => c.type === 'weapon');
            // 如果没有武器则使用空数组，不会报错

            // 帮助函数：随机选择 n 张不重复的角色卡
            function pickRandomCharacters(count) {
                const shuffled = [...characterCards].sort(() => Math.random() - 0.5);
                return shuffled.slice(0, count).map(c => ({
                    ...c,                               // 复制模板属性
                    instanceId: crypto.randomUUID(),    // 生成唯一实例ID
                    cardId: c.card_id,
                    card_id: c.card_id,
                    star: 0,
                    weapon: null,
                    item1: null,
                    item2: null,
                    atk: c.base_atk,
                    hp: c.base_hp,
                    baseAtk: c.base_atk,
                    baseHp: c.base_hp,
                    // 不再携带 skill 字段，前端会从模板中读取
                }));
            }

            // 生成初始卡组：6张角色卡
            const deck = pickRandomCharacters(6);

            // 随机选择一个普通武器（Common 或 Rare），如果没有武器就不给
            let initialWeapon = null;
            const lowRarityWeapons = weaponCards.filter(w => w.rarity === 'Common' || w.rarity === 'Rare');
            if (lowRarityWeapons.length > 0) {
                const picked = lowRarityWeapons[Math.floor(Math.random() * lowRarityWeapons.length)];
                initialWeapon = {
                    ...picked,
                    instanceId: crypto.randomUUID(),
                    cardId: picked.card_id,
                    card_id: picked.card_id,
                    star: 0,
                    atk: picked.base_atk,
                    hp: picked.base_hp,
                    baseAtk: picked.base_atk,
                    baseHp: picked.base_hp,
                    image: picked.image,
                    faction: '',
                };
            }

            // 准备棋盘和手牌
            const rawBoard = deck.slice(0, 3); // 前3张放棋盘
            // 后3张放手牌，然后再用空位补足15
            const handFromDeck = deck.slice(3, 6);
            const hand = handFromDeck.concat(new Array(12).fill(null)).slice(0, 15);

            // 如果有初始武器，则放在手牌的第一个空位 (替换一个 null)
            if (initialWeapon) {
                for (let i = 0; i < hand.length; i++) {
                    if (!hand[i]) {
                        hand[i] = initialWeapon;
                        break;
                    }
                }
            }

            // 组装玩家状态
            const now = new Date().toISOString();
            const state = {
                round: 1,
                phase: 'prepare',
                gameStartTime: now,
                phaseStartTime: now,
                battlePairs: [],
                players: {}
            };

            // 商店生成函数（保持不变）
            function buildShopGroup(shopLevel) {
                const group = [];
                for (let i = 0; i < 6; i++) {
                    const card = utils.generateShopCard(shopLevel);
                    group.push(card || null);
                }
                while (group.length < 6) group.push(null);
                return group;
            }

            for (const p of players) {
                const shopGroup1 = buildShopGroup(1);
                const shopGroup2 = buildShopGroup(1);
                const shopData = {
                    buffer: [shopGroup1, shopGroup2],
                    active: 0,
                    subIndex: 0,
                    next: null
                };

                state.players[p.player_id] = {
                    health: config.INITIAL_HEALTH || 100,
                    gold: 500000,
                    exp: 0,
                    shopLevel: 1,
                    board: rawBoard.map(c => ({ ...c, weapon: null, item1: null, item2: null })), // 确保每个角色都有空装备槽
                    hand: hand.slice(), // 浅拷贝
                    shopCards: shopData,
                    isBot: p.is_bot,
                    isReady: false,
                    isEliminated: false
                };
            }

            const { error } = await supabase.from('game_states').upsert(
                { room_id: roomId, state: state },
                { onConflict: 'room_id' }
            );
            if (error) throw error;

            log('🎉 游戏初始化完成（过滤武器/道具），进入对战！');
            window.YYCardBattle?.enterBattle?.(roomId);
            resetUI();
        } catch (err) {
            log(`❌ 游戏状态写入失败: ${err.message}`, true);
            if (window.YYCardShop?.toast) window.YYCardShop.toast('游戏初始化失败，请重试', true);
            cleanup();
            resetUI();
        }
    }

    // 其余函数不变...
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
        start, cancel, setCurrentRoom, subscribeToRoom,
        leaveAndClean, getCurrentRoomId, currentRoom: () => currentRoom
    };
})();

console.log('✅ matchmaking.js 加载完成（过滤武器/道具，初始手牌最多一把武器）');
const clickSound = new Audio("/assets/mp3/wodedaodun.mp3");
clickSound.volume = 0.5;
document.addEventListener("click", function(e){
    if(e.target.id === "start-match-btn"){
        clickSound.currentTime = 0;
        clickSound.play().catch(()=>{});
    }
});

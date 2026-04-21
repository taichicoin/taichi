// ==================== 匹配系统【最终稳定版】====================
window.YYCardMatchmaking = (function () {
  const supabase = window.supabase;
  const auth = window.YYCardAuth;
  const utils = window.YYCardUtils;
  const config = window.YYCardConfig;

  let currentRoom = null;
  let roomSubscription = null;
  let matchmakingTimer = null;
  let isMatching = false;
  let isChecking = false; // 防并发锁

  function log(msg, isError = false) {
    if (auth && typeof auth.log === 'function') {
      auth.log(msg, isError);
    } else {
      console.log(`[匹配系统] ${msg}`);
    }
  }

  function updateStatus(text, show = true) {
    const el = document.getElementById('match-status');
    if (el) {
      el.style.display = show ? 'block' : 'none';
      el.textContent = text;
    }
  }

  // 重置UI
  function resetUI() {
    isMatching = false;
    const startBtn = document.getElementById('start-match-btn');
    if (startBtn) {
      const hasUsername = auth?.currentProfile?.username;
      startBtn.disabled = !hasUsername;
      startBtn.textContent = hasUsername ? '⚡ 开始匹配' : '请先设置游戏ID';
    }
    updateStatus('', false);
    const cancelBtn = document.getElementById('cancel-match-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (matchmakingTimer) {
      clearTimeout(matchmakingTimer);
      matchmakingTimer = null;
    }
  }

  // 清理订阅和定时器
  function cleanup() {
    if (roomSubscription) {
      roomSubscription.unsubscribe();
      roomSubscription = null;
      log('✅ 旧房间订阅已清理');
    }
    if (matchmakingTimer) {
      clearTimeout(matchmakingTimer);
      matchmakingTimer = null;
      log('✅ 匹配定时器已清理');
    }
    isMatching = false;
    isChecking = false;
  }

  // 清理玩家残留房间
  async function cleanPlayerResidualRooms(uid) {
    if (!uid) return;
    log(`🧹 正在清理玩家 ${uid.slice(0, 8)} 的残留房间...`);

    const { data: myRooms } = await supabase
      .from('room_players')
      .select('room_id')
      .eq('player_id', uid);
    const roomIds = [...new Set(myRooms?.map(r => r.room_id) || [])];

    if (roomIds.length > 0) {
      await supabase.from('room_players').delete().eq('player_id', uid);
      log(`✅ 玩家 ${roomIds.length} 条房间记录已删除`);
    }

    for (const roomId of roomIds) {
      await cleanRoomIfEmpty(roomId);
    }
    log(`✅ 残留房间清理完成`);
  }

  // 清理空房间
  async function cleanRoomIfEmpty(roomId) {
    const { data: realPlayers } = await supabase
      .from('room_players')
      .select('player_id')
      .eq('room_id', roomId)
      .eq('is_bot', false);

    if (!realPlayers || realPlayers.length === 0) {
      log(`🧹 房间 ${roomId.slice(0, 8)} 已无真人，彻底清理`);
      await supabase.from('game_states').delete().eq('room_id', roomId);
      await supabase.from('room_players').delete().eq('room_id', roomId);
      await supabase.from('rooms').delete().eq('id', roomId);
    }
  }

  // 开始匹配
  async function start() {
    if (isMatching) {
      log('⚠️ 匹配已在进行中');
      return;
    }

    const profile = auth?.currentProfile;
    if (!profile?.username) {
      if (window.YYCardShop?.toast) window.YYCardShop.toast('请先设置游戏ID', true);
      return;
    }

    isMatching = true;
    log('🔍 开始匹配...');

    const startBtn = document.getElementById('start-match-btn');
    startBtn.disabled = true;
    startBtn.textContent = '⏳ 匹配中...';
    updateStatus('正在寻找对手...', true);
    document.getElementById('cancel-match-btn').style.display = 'inline-block';

    const uid = auth?.currentUser?.id;
    if (uid) await cleanPlayerResidualRooms(uid);

    const myMmr = profile.mmr || config.INITIAL_MMR;
    const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;

    if (matchmakingTimer) clearTimeout(matchmakingTimer);
    matchmakingTimer = setTimeout(() => handleTimeout(), config.MATCHMAKING_TIMEOUT_MS || 15000);

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
          .insert({
            status: 'waiting',
            max_players: maxPlayers,
            created_at: new Date().toISOString()
          })
          .select('*')
          .single();
        if (createError) throw createError;
        room = newRoom;
        log(`✅ 创建新房间: ${room.id.slice(0, 8)}`);
      }

      const { data: existing } = await supabase
        .from('room_players')
        .select('*')
        .eq('room_id', room.id)
        .eq('player_id', uid)
        .maybeSingle();
      if (existing) {
        log('⚠️ 已在房间中');
        currentRoom = room;
        subscribeToRoom(room.id);
        return;
      }

      await supabase.from('room_players').insert({
        room_id: room.id,
        player_id: uid,
        mmr_at_join: myMmr,
        health: config.INITIAL_HEALTH || 100,
        is_bot: false,
        is_ready: false,
        joined_at: new Date().toISOString()
      });

      currentRoom = room;
      subscribeToRoom(room.id);
    } catch (err) {
      log(`❌ 匹配失败: ${err.message}`, true);
      resetUI();
    }
  }

  // 取消匹配
  async function cancel() {
    log('🛑 取消匹配');
    cleanup();
    const uid = auth?.currentUser?.id;
    if (uid) await cleanPlayerResidualRooms(uid);
    currentRoom = null;
    resetUI();
  }

  // 离开并清理
  async function leaveAndClean() {
    log('🚪 主动退出');
    cleanup();
    const uid = auth?.currentUser?.id;
    if (uid) await cleanPlayerResidualRooms(uid);
    currentRoom = null;
    resetUI();
  }

  // 超时填充人机
  async function handleTimeout() {
    if (!currentRoom || !isMatching) return;
    log('⏰ 匹配超时，填充人机');

    const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
    const { data: existingPlayers } = await supabase
      .from('room_players')
      .select('player_id')
      .eq('room_id', currentRoom.id);
    const existingIds = existingPlayers?.map(p => p.player_id) || [];
    const neededBots = maxPlayers - existingIds.length;

    if (neededBots <= 0) {
      await checkRoomFull(currentRoom.id);
      return;
    }

    const { data: allBots } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_bot', true)
      .limit(200);

    const availableBots = allBots
      ?.map(b => b.id)
      .filter(id => !existingIds.includes(id))
      .slice(0, neededBots) || [];

    if (availableBots.length < neededBots) {
      log('❌ 人机不足');
      resetUI();
      return;
    }

    const botInserts = availableBots.map(botId => ({
      room_id: currentRoom.id,
      player_id: botId,
      mmr_at_join: 1000,
      health: config.INITIAL_HEALTH || 100,
      is_bot: true,
      is_ready: true,
      joined_at: new Date().toISOString()
    }));

    await supabase.from('room_players').insert(botInserts);
    await new Promise(r => setTimeout(r, 500));
    await checkRoomFull(currentRoom.id);
  }

  // 订阅房间
  function subscribeToRoom(roomId) {
    if (roomSubscription) roomSubscription.unsubscribe();

    log(`📡 订阅房间: ${roomId.slice(0, 8)}`);
    roomSubscription = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'room_players',
        filter: `room_id=eq.${roomId}`
      }, () => checkRoomFull(roomId))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`
      }, async (payload) => {
        const newStatus = payload.new.status;
        log(`📡 房间状态更新: ${newStatus}`);

        if (newStatus === 'battle') {
          // ✅ 唯一进入游戏的入口
          cleanup();
          if (window.YYCardBattle?.enterBattle) {
            window.YYCardBattle.enterBattle(roomId);
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          checkRoomFull(roomId);
        }
      });
  }

  // 检查满员（加锁防并发）
  async function checkRoomFull(roomId) {
    if (isChecking) return;
    isChecking = true;

    try {
      const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
      const { data: players } = await supabase
        .from('room_players')
        .select('*')
        .eq('room_id', roomId);
      const count = players?.length || 0;

      updateStatus(`匹配中... ${count}/${maxPlayers}`);

      if (count >= maxPlayers) {
        clearTimeout(matchmakingTimer);

        const { data: room } = await supabase
          .from('rooms')
          .select('status')
          .eq('id', roomId)
          .single();

        if (room?.status === 'waiting') {
          log('✅ 房间满员，开始游戏');
          // 先初始化游戏
          await initializeGame(roomId, players);
          // 再改状态 → 触发订阅进入游戏
          await supabase.from('rooms').update({ status: 'battle' }).eq('id', roomId);
        }
      }
    } catch (e) {
      log(`⚠️ checkRoomFull 异常: ${e.message}`);
    } finally {
      isChecking = false;
    }
  }

  // 初始化游戏（只初始化，不跳转）
  async function initializeGame(roomId, players) {
    const { data: existing } = await supabase
      .from('game_states')
      .select('room_id')
      .eq('room_id', roomId)
      .maybeSingle();
    if (existing) return;

    const now = new Date().toISOString();
    const state = {
      round: 1,
      phase: 'prepare',
      gameStartTime: now,
      phaseStartTime: now,
      battlePairs: [],
      players: {}
    };

    for (const p of players) {
      const isBot = p.is_bot;
      let deck = [];
      try {
        deck = isBot ? utils.getBotDeck() : utils.getDefaultDeck();
      } catch (e) {
        deck = [];
      }

      let shopCards = [];
      try {
        shopCards = await utils.generateShopCards(1);
        if (!Array.isArray(shopCards)) shopCards = [];
      } catch (e) {
        shopCards = [];
      }

      state.players[p.player_id] = {
        health: config.INITIAL_HEALTH || 100,
        gold: 5,
        exp: 0,
        shopLevel: 1,
        board: deck.slice(0, 3).concat(new Array(3).fill(null)).slice(0, 6),
        hand: deck.slice(3, 6).concat(new Array(12).fill(null)).slice(0, config.HAND_MAX_COUNT || 15),
        shopCards: shopCards,
        isBot: isBot,
        isReady: false,
        isEliminated: false
      };
    }

    const { error } = await supabase
      .from('game_states')
      .upsert({ room_id: roomId, state: state }, { onConflict: 'room_id' });

    if (error) {
      log(`❌ 游戏状态写入失败: ${error.message}`, true);
    }
  }

  function setCurrentRoom(roomId) {
    cleanup();
    currentRoom = { id: roomId };
    subscribeToRoom(roomId);
  }

  function getCurrentRoomId() {
    return currentRoom?.id || null;
  }

  return {
    start,
    cancel,
    setCurrentRoom,
    subscribeToRoom,
    leaveAndClean,
    getCurrentRoomId,
    currentRoom: () => currentRoom
  };
})();

console.log('✅ matchmaking.js 加载完成（最终稳定版）');

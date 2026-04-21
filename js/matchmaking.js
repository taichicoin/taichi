// ==================== 匹配系统【8人满员同步版】====================
window.YYCardMatchmaking = (function() {
  const supabase = window.supabase;
  const auth = window.YYCardAuth;
  const utils = window.YYCardUtils;
  const config = window.YYCardConfig;

  let currentRoom = null;
  let roomSubscription = null;
  let matchmakingTimer = null;
  let isMatching = false;

  // 防重复执行锁
  let isRoomLock = false;

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
    isRoomLock = false;

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

  // 清理订阅 & 定时器
  function cleanup() {
    if (roomSubscription) {
      roomSubscription.unsubscribe();
      roomSubscription = null;
      log('✅ 房间订阅已清理');
    }
    if (matchmakingTimer) {
      clearTimeout(matchmakingTimer);
      matchmakingTimer = null;
    }
    isMatching = false;
    isRoomLock = false;
  }

  // 清理玩家残留房间
  async function cleanPlayerResidualRooms(uid) {
    if (!uid) return;
    log(`🧹 清理玩家残留房间 ${uid.slice(0,8)}`);

    const { data: myRooms } = await supabase
      .from('room_players')
      .select('room_id')
      .eq('player_id', uid);

    const roomIds = [...new Set(myRooms?.map(r => r.room_id) || [])];
    if (roomIds.length > 0) {
      await supabase.from('room_players').delete().eq('player_id', uid);
    }

    for (const id of roomIds) {
      await cleanRoomIfEmpty(id);
    }
  }

  // 清理空房间
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
      log(`🧹 空房间已删除 ${roomId.slice(0,8)}`);
    }
  }

  // 开始匹配
  async function start() {
    if (isMatching) return;

    const profile = auth?.currentProfile;
    if (!profile?.username) {
      window.YYCardShop?.toast('请先设置游戏ID', true);
      return;
    }

    isMatching = true;
    log('🔍 开始匹配');

    const startBtn = document.getElementById('start-match-btn');
    startBtn.disabled = true;
    startBtn.textContent = '⏳ 匹配中...';
    updateStatus('寻找对手...', true);
    document.getElementById('cancel-match-btn').style.display = 'inline-block';

    const uid = auth.currentUser.id;
    await cleanPlayerResidualRooms(uid);

    const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;

    // 超时
    matchmakingTimer = setTimeout(() => {
      handleTimeout();
    }, config.MATCHMAKING_TIMEOUT_MS || 18000);

    try {
      // 找等待房间
      let { data: waitingRooms } = await supabase
        .from('rooms')
        .select('*')
        .eq('status', 'waiting')
        .order('created_at', true)
        .limit(1);

      let room = waitingRooms?.[0];

      if (!room) {
        const { data: newRoom } = await supabase
          .from('rooms')
          .insert({
            status: 'waiting',
            max_players: maxPlayers,
            created_at: new Date().toISOString()
          })
          .select()
          .single();
        room = newRoom;
        log(`✅ 新建房间 ${room.id.slice(0,8)}`);
      }

      // 检查是否已在房间
      const { data: existing } = await supabase
        .from('room_players')
        .select()
        .eq('room_id', room.id)
        .eq('player_id', uid)
        .maybeSingle();

      if (existing) {
        currentRoom = room;
        subscribeToRoom(room.id);
        return;
      }

      // 加入房间
      await supabase.from('room_players').insert({
        room_id: room.id,
        player_id: uid,
        mmr_at_join: profile.mmr || 1000,
        health: config.INITIAL_HEALTH || 100,
        is_bot: false,
        is_ready: false,
        joined_at: new Date().toISOString()
      });

      currentRoom = room;
      subscribeToRoom(room.id);

    } catch (err) {
      log(`❌ 匹配失败：${err.message}`, true);
      resetUI();
    }
  }

  // 取消匹配
  async function cancel() {
    log('🛑 取消匹配');
    cleanup();
    await cleanPlayerResidualRooms(auth.currentUser?.id);
    currentRoom = null;
    resetUI();
  }

  // 离开房间
  async function leaveAndClean() {
    cleanup();
    await cleanPlayerResidualRooms(auth.currentUser?.id);
    currentRoom = null;
    resetUI();
  }

  // 超时 → 填充人机
  async function handleTimeout() {
    if (!currentRoom || !isMatching || isRoomLock) return;
    log('⏰ 匹配超时，填充机器人');

    const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;
    const { data: players } = await supabase
      .from('room_players')
      .select('player_id')
      .eq('room_id', currentRoom.id);

    const need = maxPlayers - (players?.length || 0);
    if (need <= 0) {
      checkRoomFull(currentRoom.id);
      return;
    }

    // 取机器人
    const { data: bots } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_bot', true)
      .limit(100);

    const botIds = bots?.map(b => b.id) || [];
    const useBots = botIds.slice(0, need);

    if (useBots.length < need) {
      log('❌ 机器人不足');
      resetUI();
      return;
    }

    const inserts = useBots.map(bid => ({
      room_id: currentRoom.id,
      player_id: bid,
      mmr_at_join: 1000,
      health: config.INITIAL_HEALTH || 100,
      is_bot: true,
      is_ready: true,
      joined_at: new Date().toISOString()
    }));

    await supabase.from('room_players').insert(inserts);
    log(`✅ 插入 ${useBots.length} 机器人`);

    await new Promise(r => setTimeout(r, 600));
    checkRoomFull(currentRoom.id);
  }

  // 订阅房间（核心：必须保持订阅直到满员开战）
  function subscribeToRoom(roomId) {
    if (roomSubscription) roomSubscription.unsubscribe();

    log(`📡 订阅房间 ${roomId.slice(0,8)}`);

    roomSubscription = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'room_players',
        filter: `room_id=eq.${roomId}`
      }, () => {
        // 有人加入/退出 → 重新检查人数
        checkRoomFull(roomId);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`
      }, (payload) => {
        // 房间状态变成 battle → 所有玩家同步进游戏
        if (payload.new.status === 'battle') {
          log('🎉 房间开战，同步进入游戏');
          cleanup();
          window.YYCardBattle?.enterBattle(roomId);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          checkRoomFull(roomId);
        }
      });
  }

  // 【核心】必须满8人才开始
  async function checkRoomFull(roomId) {
    if (isRoomLock) return;

    const maxPlayers = config.MAX_PLAYERS_PER_ROOM || 8;

    const { data: players } = await supabase
      .from('room_players')
      .select('*')
      .eq('room_id', roomId);

    const count = players?.length || 0;
    updateStatus(`匹配中 … ${count}/${maxPlayers}`);

    // ========== 关键逻辑 ==========
    // 不到8人 → 什么都不做
    if (count < maxPlayers) {
      return;
    }

    // 上锁，防止重复执行
    isRoomLock = true;
    clearTimeout(matchmakingTimer);

    try {
      const { data: room } = await supabase
        .from('rooms')
        .select('status')
        .eq('id', roomId)
        .single();

      if (room.status !== 'waiting') {
        return;
      }

      log(`✅ 已满员 ${count}/${maxPlayers}，初始化游戏`);

      // 先初始化游戏数据
      await initializeGame(roomId, players);

      // 再把房间状态改为 battle → 触发所有人进游戏
      await supabase
        .from('rooms')
        .update({ status: 'battle' })
        .eq('id', roomId);

    } catch (e) {
      log(`⚠️ 满员启动失败：${e.message}`, true);
      isRoomLock = false;
    }
  }

  // 初始化游戏状态
  async function initializeGame(roomId, players) {
    const { data: exists } = await supabase
      .from('game_states')
      .select('room_id')
      .eq('room_id', roomId)
      .maybeSingle();

    if (exists) return;

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
      let deck = [];
      try {
        deck = p.is_bot ? utils.getBotDeck() : utils.getDefaultDeck();
      } catch (e) {
        deck = [];
      }

      let shop = [];
      try {
        shop = await utils.generateShopCards(1);
        if (!Array.isArray(shop)) shop = [];
      } catch (e) {
        shop = [];
      }

      state.players[p.player_id] = {
        health: config.INITIAL_HEALTH || 100,
        gold: 5,
        exp: 0,
        shopLevel: 1,
        board: (deck.slice(0, 3) + Array(3).fill(null)).slice(0, 6),
        hand: (deck.slice(3, 6) + Array(12).fill(null)).slice(0, 15),
        shopCards: shop,
        isBot: p.is_bot,
        isReady: false,
        isEliminated: false
      };
    }

    await supabase.from('game_states').upsert(
      { room_id: roomId, state: state },
      { onConflict: 'room_id' }
    );

    log('✅ 游戏状态初始化完成');
  }

  function setCurrentRoom(roomId) {
    cleanup();
    currentRoom = { id: roomId };
    subscribeToRoom(roomId);
  }

  function getCurrentRoomId() {
    return currentRoom?.id;
  }

  return {
    start,
    cancel,
    leaveAndClean,
    setCurrentRoom,
    getCurrentRoomId,
    currentRoom: () => currentRoom
  };
})();

console.log('✅ matchmaking.js 加载完成【8人满员同步版】');

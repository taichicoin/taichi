// 匹配系统（含人机填充）
window.YYCardMatchmaking = {
    currentRoom: null,
    roomSubscription: null,
    matchmakingTimer: null,

    log(msg, isError = false) {
        window.YYCardAuth.log(msg, isError);
    },

    // 更新匹配状态显示
    updateStatus(text, show = true) {
        const el = document.getElementById('match-status');
        if (el) {
            el.style.display = show ? 'block' : 'none';
            el.textContent = text;
        }
    },

    // 开始匹配
    async start() {
        const auth = window.YYCardAuth;
        const supabase = window.supabase;
        const config = window.YYCardConfig;
        const utils = window.YYCardUtils;

        if (!auth.currentProfile || !auth.currentProfile.username) {
            alert('请先设置游戏ID');
            return;
        }

        this.log('🔍 开始匹配...');
        const startBtn = document.getElementById('start-match-btn');
        startBtn.disabled = true;
        startBtn.textContent = '⏳ 匹配中...';
        this.updateStatus('正在寻找对手...', true);

        const myMmr = auth.currentProfile.mmr || 1000;

        // 启动超时计时器
        this.matchmakingTimer = setTimeout(() => {
            this.log('⏰ 匹配超时，将使用人机填充');
            this.handleTimeout();
        }, config.MATCHMAKING_TIMEOUT_MS);

        try {
            // 查找等待中的房间
            let { data: waitingRooms, error } = await supabase
                .from('rooms')
                .select('*')
                .eq('status', 'waiting')
                .limit(1);

            if (error) throw error;

            let room = waitingRooms?.[0];

            if (!room) {
                const { data: newRoom, error: createError } = await supabase
                    .from('rooms')
                    .insert({ status: 'waiting', max_players: config.MAX_PLAYERS })
                    .select('*')
                    .single();

                if (createError) throw createError;
                room = newRoom;
                this.log(`✅ 创建新房间: ${room.id}`);
            } else {
                this.log(`✅ 加入现有房间: ${room.id}`);
            }

            const { error: joinError } = await supabase
                .from('room_players')
                .insert({
                    room_id: room.id,
                    player_id: auth.currentUser.id,
                    mmr_at_join: myMmr,
                    health: 100,
                    is_bot: false
                });

            if (joinError) throw joinError;

            this.currentRoom = room;
            this.subscribeToRoom(room.id);

        } catch (err) {
            this.log(`❌ 匹配失败: ${err.message}`, true);
            this.resetUI();
            clearTimeout(this.matchmakingTimer);
        }
    },

    // 处理超时
    async handleTimeout() {
        if (!this.currentRoom) return;

        const supabase = window.supabase;
        const config = window.YYCardConfig;

        const { data: players } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', this.currentRoom.id);

        const currentCount = players?.length || 0;
        const neededBots = config.MAX_PLAYERS - currentCount;

        if (neededBots <= 0) return;

        this.log(`🤖 需要填充 ${neededBots} 个人机`);

        const botPromises = [];
        for (let i = 0; i < neededBots; i++) {
            botPromises.push(
                supabase.from('room_players').insert({
                    room_id: this.currentRoom.id,
                    player_id: `bot_${Date.now()}_${i}`,
                    mmr_at_join: 1000,
                    health: 100,
                    is_bot: true
                })
            );
        }
        await Promise.all(botPromises);
        this.log(`✅ 已添加 ${neededBots} 个人机`);
    },

    // 订阅房间变化
    subscribeToRoom(roomId) {
        const supabase = window.supabase;
        if (this.roomSubscription) {
            this.roomSubscription.unsubscribe();
        }

        this.roomSubscription = supabase
            .channel(`room:${roomId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'room_players',
                filter: `room_id=eq.${roomId}`
            }, async () => {
                await this.checkRoomFull(roomId);
            })
            .subscribe();

        this.checkRoomFull(roomId);
    },

    // 检查房间是否满员
    async checkRoomFull(roomId) {
        const supabase = window.supabase;
        const config = window.YYCardConfig;

        const { data: players, error } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', roomId);

        if (error) {
            this.log(`❌ 获取房间人数失败: ${error.message}`, true);
            return;
        }

        const playerCount = players?.length || 0;
        this.updateStatus(`匹配中... ${playerCount}/${config.MAX_PLAYERS}`);

        if (playerCount >= config.MAX_PLAYERS) {
            if (this.matchmakingTimer) {
                clearTimeout(this.matchmakingTimer);
                this.matchmakingTimer = null;
            }

            await supabase.from('rooms').update({ status: 'battle' }).eq('id', roomId);

            if (this.roomSubscription) {
                this.roomSubscription.unsubscribe();
                this.roomSubscription = null;
            }

            this.log('🎮 房间已满，开始游戏！');
            this.updateStatus('', false);
            await this.initializeGame(roomId, players);
        }
    },

    // 初始化游戏状态
    async initializeGame(roomId, players) {
        const supabase = window.supabase;
        const utils = window.YYCardUtils;

        const state = {
            round: 1,
            phase: 'prepare',
            players: {}
        };

        players.forEach(p => {
            const isBot = p.is_bot || p.player_id.startsWith('bot_');
            const deck = isBot ? utils.getBotDeck() : utils.getDefaultDeck();

            state.players[p.player_id] = {
                health: 100,
                gold: 5,
                exp: 0,
                shopLevel: 1,
                board: deck.slice(0, 3),
                hand: deck.slice(3, 6),
                shopCards: utils.generateShopCards(1),
                isBot: isBot
            };
        });

        await supabase
            .from('game_states')
            .upsert({ room_id: roomId, state }, { onConflict: 'room_id' });

        this.log('🎉 游戏初始化完成，准备进入对战...');
        alert('游戏开始！对战界面开发中...');
        // 后续这里切换到对战视图
        // window.showBattleView(roomId);
        this.resetUI();
    },

    // 重置UI
    resetUI() {
        const startBtn = document.getElementById('start-match-btn');
        const auth = window.YYCardAuth;
        startBtn.disabled = !auth.currentProfile?.username;
        startBtn.textContent = auth.currentProfile?.username ? '⚡ 开始匹配' : '请先设置游戏ID';
        this.updateStatus('', false);
    }
};

// 绑定开始匹配按钮
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('start-match-btn');
    if (btn) {
        // 移除原有事件，绑定新事件
        btn.onclick = () => window.YYCardMatchmaking.start();
    }
});

console.log('✅ matchmaking.js 加载完成');

window.YYCardBattle = {
  // 当前房间ID
  currentRoomId: null,
  // 当前游戏状态
  currentGameState: null,
  // 当前玩家ID
  myPlayerId: null,
  // 回合计时器
  phaseTimer: null,
  // 战斗动画计时器
  battleTimer: null,
  // 实时订阅
  gameSubscription: null,

  // 进入对局（HTML重连/开局调用）
  async enterBattle(roomId) {
    this.currentRoomId = roomId;
    this.myPlayerId = window.YYCardAuth.currentUser?.id;
    if (!this.myPlayerId) return;

    // 加载游戏状态
    await this.loadGameState();
    // 订阅游戏状态实时更新
    this.subscribeToGameState();
    // 初始化UI
    this.updateGameUI();
    // 启动回合流程
    this.startPhaseLoop();

    console.log('⚔️ 进入对局成功，房间ID：', roomId);
  },

  // 加载游戏状态
  async loadGameState() {
    const { data, error } = await supabase
      .from('game_states')
      .select('state')
      .eq('room_id', this.currentRoomId)
      .single();

    if (error) {
      console.error('❌ 加载游戏状态失败', error);
      return;
    }

    this.currentGameState = data.state;
  },

  // 保存游戏状态到数据库
  async saveGameState() {
    if (!this.currentRoomId || !this.currentGameState) return;

    await supabase
      .from('game_states')
      .update({ state: this.currentGameState })
      .eq('room_id', this.currentRoomId);
  },

  // 订阅游戏状态实时更新
  subscribeToGameState() {
    if (this.gameSubscription) this.gameSubscription.unsubscribe();

    this.gameSubscription = supabase
      .channel(`game:${this.currentRoomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_states', filter: `room_id=eq.${this.currentRoomId}` },
        (payload) => {
          this.currentGameState = payload.new.state;
          this.updateGameUI();
        }
      )
      .subscribe();
  },

  // 获取当前玩家的状态
  getMyState() {
    if (!this.currentGameState || !this.myPlayerId) return null;
    return this.currentGameState.players.find(p => p.playerId === this.myPlayerId);
  },

  // ==================== 回合阶段循环核心 ====================
  async startPhaseLoop() {
    const config = window.YYCardConfig;
    const gameState = this.currentGameState;

    // 清除旧计时器
    this.clearAllTimers();

    // 检查游戏是否结束
    if (this.checkGameOver()) return;

    // 按当前阶段执行
    switch (gameState.currentPhase) {
      case config.GAME_PHASE.PREPARE:
        await this.runPreparePhase();
        break;
      case config.GAME_PHASE.BATTLE:
        await this.runBattlePhase();
        break;
      case config.GAME_PHASE.SETTLE:
        await this.runSettlePhase();
        break;
    }
  },

  // 执行准备阶段
  async runPreparePhase() {
    const config = window.YYCardConfig;
    const gameState = this.currentGameState;
    const roundNum = gameState.roundNum;

    console.log(`📋 第${roundNum}回合 准备阶段开始`);

    // 计算准备阶段时长
    const prepareTime = roundNum === 1 
      ? config.ROUND_BASE.PREPARE.ROUND1 
      : config.ROUND_BASE.PREPARE.BASE + (roundNum - 1) * config.ROUND_BASE.PREPARE.INCREMENT;

    // 刷新所有玩家的商店
    gameState.players.forEach(player => {
      if (player.isEliminated) return;
      window.YYCardShop.generateShopCards(player.shopLevel);
    });

    // 触发回合开始技能
    window.YYCardGameMechanics.triggerSkillType('roundStart', this.getMyState());

    // 启动倒计时
    this.startPhaseTimer(prepareTime, async () => {
      // 准备阶段结束，进入战斗阶段
      gameState.currentPhase = config.GAME_PHASE.BATTLE;
      await this.saveGameState();
      this.startPhaseLoop();
    });

    // 更新UI
    this.updateGameUI();
  },

  // 执行战斗阶段（核心战斗模拟，严格匹配总纲寻敌规则）
  async runBattlePhase() {
    const config = window.YYCardConfig;
    const gameState = this.currentGameState;
    const roundNum = gameState.roundNum;

    console.log(`⚔️ 第${roundNum}回合 战斗阶段开始`);

    // 战斗阶段时长
    const battleTime = roundNum === 1
      ? config.ROUND_BASE.BATTLE.ROUND1
      : config.ROUND_BASE.BATTLE.BASE + (roundNum - 1) * config.ROUND_BASE.BATTLE.INCREMENT;

    // 匹配对手（1v1车轮战）
    const battlePairs = this.matchBattlePairs();
    // 执行战斗模拟
    await this.runBattleSimulation(battlePairs);

    // 启动倒计时（动画展示时间）
    this.startPhaseTimer(battleTime, async () => {
      // 战斗阶段结束，进入结算阶段
      gameState.currentPhase = config.GAME_PHASE.SETTLE;
      await this.saveGameState();
      this.startPhaseLoop();
    });

    this.updateGameUI();
  },

  // 执行结算阶段
  async runSettlePhase() {
    const config = window.YYCardConfig;
    const gameState = this.currentGameState;
    const roundNum = gameState.roundNum;

    console.log(`📊 第${roundNum}回合 结算阶段开始`);

    // 1. 发放回合奖励
    window.YYCardEconomy.grantRoundReward(gameState, roundNum + 1);
    // 2. 检查淘汰玩家
    this.checkEliminatedPlayers();
    // 3. 检查游戏是否结束
    if (this.checkGameOver()) return;

    // 结算倒计时
    this.startPhaseTimer(config.ROUND_BASE.SETTLE, async () => {
      // 进入下一回合
      gameState.roundNum += 1;
      gameState.currentPhase = config.GAME_PHASE.PREPARE;
      await this.saveGameState();
      this.startPhaseLoop();
    });

    this.updateGameUI();
  },

  // ==================== 战斗模拟核心（严格匹配总纲规则）====================
  // 匹配对战对手
  matchBattlePairs() {
    const gameState = this.currentGameState;
    const alivePlayers = gameState.players.filter(p => !p.isEliminated);
    const pairs = [];

    // 简单1v1匹配，后续可优化为天梯匹配
    for (let i = 0; i < alivePlayers.length; i += 2) {
      if (i + 1 < alivePlayers.length) {
        pairs.push([alivePlayers[i], alivePlayers[i + 1]]);
      }
    }
    return pairs;
  },

  // 执行战斗模拟
  async runBattleSimulation(battlePairs) {
    const config = window.YYCardConfig;

    for (const [playerA, playerB] of battlePairs) {
      console.log(`⚔️ 对战：${playerA.playerId} VS ${playerB.playerId}`);

      // 复制棋盘数据，避免修改原数据
      let boardA = [...playerA.board].map(card => card ? { ...card } : null);
      let boardB = [...playerB.board].map(card => card ? { ...card } : null);

      // 战斗循环：直到一方棋盘全灭
      while (this.hasAliveCard(boardA) && this.hasAliveCard(boardB)) {
        // 双方同时攻击
        await this.executeRoundAttack(boardA, boardB);
        // 攻击间隔
        await new Promise(resolve => setTimeout(resolve, config.BATTLE.ATTACK_INTERVAL));
      }

      // 结算胜负
      const aSurvivalCount = this.getAliveCount(boardA);
      const bSurvivalCount = this.getAliveCount(boardB);

      if (aSurvivalCount > 0) {
        // A胜，B扣血
        const damage = window.YYCardEconomy.calculateBattleDamage(aSurvivalCount);
        playerB.health -= damage;
        console.log(`🏆 ${playerA.playerId} 胜利，${playerB.playerId} 扣血${damage}`);
      } else {
        // B胜，A扣血
        const damage = window.YYCardEconomy.calculateBattleDamage(bSurvivalCount);
        playerA.health -= damage;
        console.log(`🏆 ${playerB.playerId} 胜利，${playerA.playerId} 扣血${damage}`);
      }
    }
  },

  // 执行一轮攻击
  async executeRoundAttack(attackerBoard, defenderBoard) {
    const config = window.YYCardConfig;
    const attackPromises = [];

    // 遍历攻击方所有存活卡牌，按位置顺序攻击
    for (let pos = 0; pos < config.BOARD.POSITIONS.length; pos++) {
      const attacker = attackerBoard[pos];
      const attackPos = pos + 1; // 位置1-6

      if (!attacker || attacker.hp <= 0) continue;

      // 按总纲规则寻敌
      const target = this.findTarget(attackPos, attackerBoard, defenderBoard);
      if (!target) continue;

      // 执行攻击
      attackPromises.push(this.executeAttack(attacker, target, attackerBoard, defenderBoard));
    }

    await Promise.all(attackPromises);
  },

  // 寻敌逻辑（严格匹配总纲寻敌优先级表+先打前排规则）
  findTarget(attackPos, attackerBoard, defenderBoard) {
    const config = window.YYCardConfig;
    const priority = config.BOARD.ENEMY_PRIORITY[attackPos];
    const frontRow = config.BOARD.FRONT_ROW;

    // 铁律1：先检查前排是否有存活单位，有则只打前排
    const hasFrontAlive = frontRow.some(pos => {
      const card = defenderBoard[pos - 1];
      return card && card.hp > 0;
    });

    // 过滤优先级：有前排存活则只保留前排位置
    const filteredPriority = hasFrontAlive
      ? priority.filter(pos => frontRow.includes(pos))
      : priority;

    // 按优先级找第一个存活目标
    for (const targetPos of filteredPriority) {
      const targetCard = defenderBoard[targetPos - 1];
      if (targetCard && targetCard.hp > 0) {
        return { card: targetCard, pos: targetPos };
      }
    }

    return null;
  },

  // 执行单次攻击
  async executeAttack(attacker, target, attackerBoard, defenderBoard) {
    // 触发攻击前技能
    window.YYCardGameMechanics.triggerSkillType('beforeAttack', attacker, attackerBoard);

    // 普通攻击
    target.card.hp -= attacker.atk;
    console.log(`⚔️ ${attacker.name} 攻击 ${target.card.name}，造成${attacker.atk}点伤害`);

    // 触发攻击后技能
    window.YYCardGameMechanics.triggerSkillType('afterAttack', attacker, attackerBoard);

    // 目标死亡触发击杀技能
    if (target.card.hp <= 0) {
      window.YYCardGameMechanics.triggerSkillType('onKill', attacker, attackerBoard);
    }
  },

  // ==================== 工具函数 ====================
  hasAliveCard(board) {
    return board.some(card => card && card.hp > 0);
  },

  getAliveCount(board) {
    return board.filter(card => card && card.hp > 0).length;
  },

  // 检查淘汰玩家
  checkEliminatedPlayers() {
    const gameState = this.currentGameState;
    gameState.players.forEach(player => {
      if (player.health <= 0 && !player.isEliminated) {
        player.isEliminated = true;
        console.log(`💀 玩家${player.playerId} 被淘汰`);
      }
    });
  },

  // 检查游戏是否结束
  checkGameOver() {
    const gameState = this.currentGameState;
    const alivePlayers = gameState.players.filter(p => !p.isEliminated);

    if (alivePlayers.length <= 1) {
      const winner = alivePlayers[0];
      console.log(`🎉 游戏结束，胜利者：${winner?.playerId || '无'}`);
      this.clearAllTimers();
      alert(winner ? `恭喜你获得胜利！` : '游戏结束');
      // 更新房间状态
      supabase.from('rooms').update({ status: 'finished' }).eq('id', this.currentRoomId);
      return true;
    }
    return false;
  },

  // 启动阶段倒计时
  startPhaseTimer(duration, onEnd) {
    const timerEl = document.getElementById('phase-timer');
    let remaining = duration;

    this.clearPhaseTimer();
    timerEl.textContent = this.formatTime(remaining);

    this.phaseTimer = setInterval(() => {
      remaining--;
      timerEl.textContent = this.formatTime(remaining);

      if (remaining <= 0) {
        this.clearPhaseTimer();
        onEnd();
      }
    }, 1000);
  },

  // 格式化时间
  formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  },

  // 清除所有计时器
  clearAllTimers() {
    this.clearPhaseTimer();
    if (this.battleTimer) clearInterval(this.battleTimer);
  },

  clearPhaseTimer() {
    if (this.phaseTimer) clearInterval(this.phaseTimer);
  },

  // ==================== UI渲染 ====================
  // 更新游戏全局UI
  updateGameUI() {
    const myState = this.getMyState();
    if (!myState) return;

    // 商店等级、金币
    document.getElementById('shop-level').textContent = myState.shopLevel;
    document.getElementById('my-gold').textContent = myState.gold;
    // 手牌数量、血量、回合数
    document.getElementById('hand-count').textContent = myState.hand.filter(item => item !== null).length;
    document.getElementById('my-health').textContent = myState.health;
    document.getElementById('round-num').textContent = this.currentGameState.roundNum;

    // 阶段显示隐藏
    const prepareOnlyEls = document.querySelectorAll('.prepare-only');
    const battleOnlyEls = document.querySelectorAll('.battle-only');
    const isPrepare = this.currentGameState.currentPhase === window.YYCardConfig.GAME_PHASE.PREPARE;

    prepareOnlyEls.forEach(el => el.style.display = isPrepare ? 'block' : 'none');
    battleOnlyEls.forEach(el => el.style.display = !isPrepare ? 'block' : 'none');

    // 渲染棋盘
    this.renderMyBoard();
    this.renderEnemyBoard();
    // 渲染玩家状态
    this.renderPlayerStatus();
  },

  // 渲染我方棋盘
  renderMyBoard() {
    const myState = this.getMyState();
    const boardEl = document.getElementById('my-board');
    if (!boardEl || !myState) return;

    boardEl.innerHTML = '';
    myState.board.forEach((card, index) => {
      const pos = index + 1;
      const cellEl = document.createElement('div');
      cellEl.className = 'board-cell';
      cellEl.dataset.pos = pos;

      if (card) {
        cellEl.innerHTML = `
          <div class="board-card rarity-${card.rarity.toLowerCase()}">
            <div class="card-icon">
              <img src="${card.icon}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'">
            </div>
            <div class="card-name">${card.name}</div>
            <div class="card-stats">⚔️ ${card.atk} | ❤️ ${card.hp}</div>
          </div>
        `;
      }

      boardEl.appendChild(cellEl);
    });
  },

  // 渲染敌方棋盘
  renderEnemyBoard() {
    const gameState = this.currentGameState;
    const boardEl = document.getElementById('enemy-board');
    if (!boardEl) return;

    // 找当前对战的敌方
    const myId = this.myPlayerId;
    const enemy = gameState.players.find(p => p.playerId !== myId && !p.isEliminated);
    if (!enemy) {
      boardEl.innerHTML = '';
      return;
    }

    boardEl.innerHTML = '';
    enemy.board.forEach((card, index) => {
      const pos = index + 1;
      const cellEl = document.createElement('div');
      cellEl.className = 'board-cell';
      cellEl.dataset.pos = pos;

      if (card) {
        cellEl.innerHTML = `
          <div class="board-card rarity-${card.rarity.toLowerCase()}">
            <div class="card-icon">
              <img src="${card.icon}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'">
            </div>
            <div class="card-name">${card.name}</div>
            <div class="card-stats">⚔️ ${card.atk} | ❤️ ${card.hp}</div>
          </div>
        `;
      }

      boardEl.appendChild(cellEl);
    });
  },

  // 渲染我方手牌
  renderMyHand() {
    const myState = this.getMyState();
    const handEl = document.getElementById('hand-container');
    if (!handEl || !myState) return;

    handEl.innerHTML = '';
    myState.hand.forEach((card, index) => {
      const cellEl = document.createElement('div');
      cellEl.className = 'hand-cell';
      cellEl.dataset.index = index;

      if (card) {
        cellEl.innerHTML = `
          <div class="hand-card rarity-${card.rarity.toLowerCase()}">
            <div class="card-icon">
              <img src="${card.icon}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'">
            </div>
            <div class="card-name">${card.name}</div>
            <div class="card-stats">⚔️ ${card.atk} | ❤️ ${card.hp}</div>
            <button class="sell-btn">💰 出售</button>
          </div>
        `;

        // 出售按钮事件
        cellEl.querySelector('.sell-btn').onclick = (e) => {
          e.stopPropagation();
          window.YYCardShop.sellCard(card.instanceId);
        };
      }

      handEl.appendChild(cellEl);
    });
  },

  // 渲染玩家状态列表
  renderPlayerStatus() {
    const gameState = this.currentGameState;
    const listEl = document.getElementById('player-status-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    gameState.players.forEach(player => {
      const itemEl = document.createElement('div');
      itemEl.className = `player-status-item ${player.isEliminated ? 'eliminated' : ''}`;
      itemEl.innerHTML = `
        <div class="player-avatar">
          <img src="${player.avatarUrl || '/assets/default-avatar.png'}" alt="" onerror="this.src='/assets/default-avatar.png'">
        </div>
        <div class="player-health">❤️ ${player.health}</div>
      `;
      listEl.appendChild(itemEl);
    });
  },

  // 退出对局
  async leaveBattle() {
    this.clearAllTimers();
    if (this.gameSubscription) this.gameSubscription.unsubscribe();

    // 清理房间记录
    await supabase.from('room_players').delete().eq('player_id', this.myPlayerId);

    // 回到大厅
    document.getElementById('battle-view').style.display = 'none';
    document.getElementById('lobby-view').style.display = 'block';

    this.currentRoomId = null;
    this.currentGameState = null;
    this.myPlayerId = null;
  }
};

// 绑定HTML事件
document.addEventListener('DOMContentLoaded', () => {
  // 退出按钮
  document.getElementById('leave-battle-btn').onclick = () => {
    if (confirm('确定要退出对局吗？退出将视为放弃比赛！')) {
      window.YYCardBattle.leaveBattle();
    }
  };

  // 准备结束按钮
  document.getElementById('end-prepare-btn').onclick = () => {
    const battle = window.YYCardBattle;
    if (!battle || !battle.currentGameState) return;

    // 提前结束准备阶段，进入战斗
    battle.clearPhaseTimer();
    battle.currentGameState.currentPhase = window.YYCardConfig.GAME_PHASE.BATTLE;
    battle.saveGameState();
    battle.startPhaseLoop();
  };
});

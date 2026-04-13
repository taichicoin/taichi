window.YYCardGameMechanics = {
  // 卡牌模板缓存
  cardTemplates: [],
  // 全局斩妖除魔计数（孙悟空技能用）
  globalSlayDemonCount: 0,
  // 技能触发事件总线
  skillEventBus: {},

  // ==================== 初始化 ====================
  async init() {
    try {
      const res = await fetch('/yycard/data/characters.json');
      if (!res.ok) throw new Error('卡牌模板加载失败');
      this.cardTemplates = await res.json();
      console.log('✅ 35张卡牌模板加载成功，共', this.cardTemplates.length, '张');
    } catch (err) {
      console.error('❌ 卡牌模板加载失败', err);
      alert('卡牌资源加载失败，请刷新页面重试');
    }
  },

  // ==================== 核心技能触发入口 ====================
  /**
   * 触发指定类型的技能
   * @param {string} triggerType 触发类型（onRoundStart/onShopRefresh/onAttack等）
   * @param {object} playerState 玩家状态（board/hand/shop等）
   * @param {object} context 触发上下文（攻击卡牌/目标卡牌/悟道层数等）
   */
  triggerSkills(triggerType, playerState, context = {}) {
    if (!playerState || !playerState.board) return;

    // 筛选场上符合触发条件的卡牌
    const validCards = playerState.board.filter(card => {
      if (!card || card.hp <= 0) return false;
      const template = this.getCardTemplate(card.cardId);
      if (!template || !template.skill) return false;
      // 匹配触发类型
      return template.skill.trigger === triggerType;
    });

    // 执行每张卡牌的技能
    validCards.forEach(card => {
      this.executeSkill(card, playerState, context);
    });

    // 触发事件总线的监听（用于连锁技能，如舜/白泽/穷奇）
    if (this.skillEventBus[triggerType]) {
      this.skillEventBus[triggerType].forEach(callback => callback(context));
    }
  },

  // ==================== 单张卡牌技能执行 ====================
  executeSkill(card, playerState, context = {}) {
    const template = this.getCardTemplate(card.cardId);
    if (!template || !template.skill) return;

    const skill = template.skill;
    const starMultiplier = card.star >= 1 ? 2 : 1; // 一星效果翻倍
    const skillName = `${template.name} - ${skill.skillName}`;

    console.log(`✨ 触发技能：${skillName}，星级：${card.star + 1}，倍率：${starMultiplier}`);

    // 1. 前置校验（如唐僧在场要求）
    if (skill.requiresTangSeng) {
      const hasTangSeng = playerState.board.some(c => c?.cardId === 'char_tangseng' && c.hp > 0);
      if (!hasTangSeng) {
        console.log(`⚠️ 技能${skillName}未触发：唐僧不在场`);
        return;
      }
    }

    // 2. 技能使用次数校验（如貔貅）
    if (skill.maxUses) {
      card.skillUsedCount = card.skillUsedCount || 0;
      if (card.skillUsedCount >= skill.maxUses * starMultiplier) {
        console.log(`⚠️ 技能${skillName}已达使用上限`);
        return;
      }
      card.skillUsedCount += 1;
    }

    // 3. 筛选技能目标
    const targets = this.getSkillTargets(skill.effect.target, card, playerState, context);
    if (targets.length === 0 && skill.effect.target !== 'hand' && skill.effect.target !== 'shop_cards') {
      console.log(`ℹ️ 技能${skillName}无有效目标`);
      return;
    }

    // 4. 执行技能效果
    this.executeSkillEffect(skill, card, targets, playerState, context, starMultiplier);

    // 5. 触发连锁技能事件
    this.triggerChainEvent(skill, card, context);
  },

  // ==================== 技能目标筛选 ====================
  getSkillTargets(targetType, sourceCard, playerState, context) {
    const board = playerState.board.filter(c => c && c.hp > 0);
    const enemyBoard = context.enemyBoard?.filter(c => c && c.hp > 0) || [];
    const sourcePos = board.findIndex(c => c?.instanceId === sourceCard.instanceId) + 1; // 位置1-6

    switch (targetType) {
      case 'self':
        return [sourceCard];
      case 'shop_cards':
        return window.YYCardShop.currentShopCards || [];
      case 'random_ally':
        return board.length > 0 ? [board[Math.floor(Math.random() * board.length)]] : [];
      case 'random_allies':
        const count = context.targetCount || 2;
        const shuffled = [...board].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
      case 'all_allies':
        return board;
      case 'sameRow_allies':
        const isFrontRow = sourcePos <= 3;
        return board.filter((_, index) => {
          const pos = index + 1;
          return isFrontRow ? pos <= 3 : pos >= 4;
        });
      case 'sameColumn_x_you_allies':
        const columnPos = sourcePos % 3 || 3; // 1/4→1，2/5→2，3/6→3
        const columnPositions = [columnPos, columnPos + 3];
        return board.filter((_, index) => columnPositions.includes(index + 1) && this.getCardTemplate(board[index]?.cardId)?.category === '西游');
      case 'cant_attack_allies':
        return board.filter(c => {
          const template = this.getCardTemplate(c.cardId);
          return template?.skill?.cantAttack === true;
        });
      case 'attack_target':
        return context.targetCard ? [context.targetCard] : [];
      case 'all_enemies':
        return enemyBoard;
      case 'self_and_source':
        const source = context.sourceCard || sourceCard;
        return [sourceCard, source].filter(Boolean);
      default:
        return [];
    }
  },

  // ==================== 技能效果执行 ====================
  executeSkillEffect(skill, sourceCard, targets, playerState, context, starMultiplier) {
    const effect = skill.effect;
    const config = window.YYCardConfig;

    switch (effect.modifyType || effect.action) {
      // 基础属性增减
      case 'add':
        let addAtk = 0, addHp = 0;

        // 固定数值
        if (effect.value) {
          addAtk = effect.value.atk * starMultiplier;
          addHp = effect.value.hp * starMultiplier;
        }

        // 基于自身攻击
        if (effect.valueSource === 'self_atk') {
          const percent = (effect.percent || 100) / 100 * starMultiplier;
          if (effect.stat === 'hp') {
            addHp = Math.floor(sourceCard.atk * percent);
          } else {
            addAtk = Math.floor(sourceCard.atk * percent);
          }
        }

        // 基于悟道层数
        if (effect.valueSource === 'enlightenment_count') {
          const enlightenmentCount = sourceCard.enlightenmentCount || 0;
          const baseAtk = skill.baseValue?.atk || 1;
          const baseHp = skill.baseValue?.hp || 1;
          addAtk = (baseAtk * enlightenmentCount) * starMultiplier;
          addHp = (baseHp * enlightenmentCount) * starMultiplier;
        }

        // 基于商店总属性
        if (effect.valueSource === 'shop_total_stats') {
          const shopCards = window.YYCardShop.currentShopCards || [];
          const totalAtk = shopCards.reduce((sum, card) => sum + card.atk, 0);
          const totalHp = shopCards.reduce((sum, card) => sum + card.hp, 0);
          const percent = (effect.percent || 100) / 100 * starMultiplier;
          addAtk = Math.floor(totalAtk * percent);
          addHp = Math.floor(totalHp * percent);
        }

        // 基于随机商店卡牌
        if (effect.valueSource === 'random_shop_card') {
          const shopCards = window.YYCardShop.currentShopCards || [];
          if (shopCards.length > 0) {
            const randomCard = shopCards[Math.floor(Math.random() * shopCards.length)];
            const percent = (effect.percent || 100) / 100 * starMultiplier;
            addAtk = Math.floor(randomCard.atk * percent);
            addHp = Math.floor(randomCard.hp * percent);
          }
        }

        // 基于斩妖除魔计数
        if (effect.valueSource === 'global_slay_demon_count') {
          const multiplier = (effect.multiplier || 1) * starMultiplier;
          addAtk = this.globalSlayDemonCount * multiplier;
          addHp = this.globalSlayDemonCount * multiplier;
        }

        // 应用属性到目标
        targets.forEach(target => {
          target.atk = Math.max(0, target.atk + addAtk);
          target.hp = Math.max(0, target.hp + addHp);
          console.log(`📊 ${target.name} 获得属性加成：⚔️+${addAtk}，❤️+${addHp}`);
        });

        // 刷新商店UI
        if (effect.target === 'shop_cards') {
          window.YYCardShop.renderShop();
        }
        break;

      // 生成消耗牌
      case 'generate_consumable':
        const count = (effect.count || 1) * starMultiplier;
        for (let i = 0; i < count; i++) {
          const emptyIndex = playerState.hand.findIndex(item => item === null);
          if (emptyIndex === -1) break;

          // 生成神火符
          playerState.hand[emptyIndex] = {
            instanceId: `consumable_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            cardId: `consumable_${effect.consumableType}`,
            name: effect.consumableType === 'shenhuofu' ? '神火符' : '消耗牌',
            type: 'consumable',
            rarity: 'Common',
            icon: `/yycard/assets/consumable/${effect.consumableType}.png`
          };
        }
        window.YYCardBattle.renderMyHand();
        break;

      // 生成随机卡牌
      case 'generate_random_card':
        const cardCount = (effect.count || 1) * starMultiplier;
        const prob = effect.rarityProb || config.SHOP_RARITY_PROBABILITY[5];

        for (let i = 0; i < cardCount; i++) {
          const emptyIndex = playerState.hand.findIndex(item => item === null);
          if (emptyIndex === -1) break;

          // 按概率随机稀有度
          const random = Math.random();
          let cumulative = 0;
          let targetRarity = 'Common';
          for (const [rarity, p] of Object.entries(prob)) {
            cumulative += p;
            if (random <= cumulative) {
              targetRarity = rarity;
              break;
            }
          }

          // 生成卡牌实例
          const rarityCards = this.cardTemplates.filter(card => card.rarity === targetRarity);
          if (rarityCards.length === 0) continue;
          const randomTemplate = rarityCards[Math.floor(Math.random() * rarityCards.length)];
          playerState.hand[emptyIndex] = window.YYCardShop.createCardInstance(randomTemplate);
        }
        window.YYCardBattle.renderMyHand();
        break;

      // 移除目标（貔貅）
      case 'remove':
        targets.forEach(target => {
          target.hp = 0;
          console.log(`💀 ${target.name} 被貔貅直接移除`);
        });
        break;

      // 全场AOE伤害（黑化帝）
      case 'damage':
        let damage = 0;
        if (effect.valueSource === 'primary_target_health') {
          const primaryTarget = context.targetCard;
          const multiplier = (effect.multiplier || 1) * starMultiplier;
          damage = Math.floor(primaryTarget.hp * multiplier);
        }

        targets.forEach(target => {
          target.hp = Math.max(0, target.hp - damage);
          console.log(`💥 黑化帝AOE 对${target.name} 造成${damage}点伤害`);
        });
        break;

      // 触发其他技能
      case 'trigger_skill':
        targets.forEach(target => {
          const targetTemplate = this.getCardTemplate(target.cardId);
          if (!targetTemplate?.skill) return;
          // 过滤技能ID/类型
          if (effect.skillIdFilter && !targetTemplate.skill.skillId.includes(effect.skillIdFilter)) return;
          if (effect.skillTypeFilter && targetTemplate.skill.type !== effect.skillTypeFilter) return;

          // 触发多次
          const times = (effect.times || 1) * starMultiplier;
          for (let i = 0; i < times; i++) {
            this.executeSkill(target, playerState, context);
          }
        });
        break;

      // 触发悟道
      case 'trigger_enlightenment':
        targets.forEach(target => {
          target.enlightenmentCount = (target.enlightenmentCount || 0) + 1;
          const targetTemplate = this.getCardTemplate(target.cardId);
          if (targetTemplate?.skill?.type === 'enlightenment') {
            this.executeSkill(target, playerState, context);
          }
        });
        break;

      // 增加护盾
      case 'grant_shield':
        const shieldCount = (effect.value || 1) * starMultiplier;
        targets.forEach(target => {
          target.shield = (target.shield || 0) + shieldCount;
          console.log(`🛡️ ${target.name} 获得${shieldCount}层护盾`);
        });
        break;
    }
  },

  // ==================== 连锁技能事件 ====================
  triggerChainEvent(skill, sourceCard, context) {
    // 如有神助触发事件
    if (skill.skillId.includes('skill_divine_blessing')) {
      if (this.skillEventBus.onDivineBlessingTriggered) {
        this.skillEventBus.onDivineBlessingTriggered.forEach(callback => callback({ sourceCard, ...context }));
      }
    }

    // 悟道触发事件
    if (skill.type === 'enlightenment') {
      if (this.skillEventBus.onEnlightenmentTriggered) {
        this.skillEventBus.onEnlightenmentTriggered.forEach(callback => callback({ sourceCard, ...context }));
      }
    }

    // 击杀事件
    if (context.isKill) {
      this.globalSlayDemonCount += 1;
      if (this.skillEventBus.onKill) {
        this.skillEventBus.onKill.forEach(callback => callback({ sourceCard, ...context }));
      }
    }
  },

  // ==================== 工具函数 ====================
  // 获取卡牌模板
  getCardTemplate(cardId) {
    return this.cardTemplates.find(template => template.cardId === cardId);
  },

  // 注册技能事件监听
  onSkillEvent(eventType, callback) {
    if (!this.skillEventBus[eventType]) {
      this.skillEventBus[eventType] = [];
    }
    this.skillEventBus[eventType].push(callback);
  },

  // 清除事件监听
  clearSkillEvents() {
    this.skillEventBus = {};
    this.globalSlayDemonCount = 0;
  },

  // ==================== 升星合成系统 ====================
  combineCards(cardInstanceId1, cardInstanceId2, cardInstanceId3, playerState) {
    // 查找三张卡牌
    const cards = [cardInstanceId1, cardInstanceId2, cardInstanceId3].map(id => {
      return playerState.hand.find(card => card?.instanceId === id);
    });

    // 校验三张卡牌是否相同
    const cardId = cards[0]?.cardId;
    const isValid = cards.every(card => card && card.cardId === cardId && card.star === cards[0].star);
    if (!isValid) {
      alert('只能合成3张相同星级、相同的卡牌！');
      return false;
    }

    // 移除三张旧卡牌
    playerState.hand = playerState.hand.map(card => {
      if (cards.find(c => c.instanceId === card?.instanceId)) return null;
      return card;
    });

    // 创建升星后的新卡牌
    const template = this.getCardTemplate(cardId);
    const newCard = window.YYCardShop.createCardInstance(template);
    newCard.star = cards[0].star + 1;
    // 数值翻倍
    newCard.atk = template.baseAtk * Math.pow(2, newCard.star);
    newCard.hp = template.baseHp * Math.pow(2, newCard.star);

    // 放入手牌
    const emptyIndex = playerState.hand.findIndex(item => item === null);
    if (emptyIndex !== -1) {
      playerState.hand[emptyIndex] = newCard;
    }

    // 刷新UI
    window.YYCardBattle.renderMyHand();
    window.YYCardBattle.updateGameUI();
    window.YYCardBattle.saveGameState();

    alert(`合成成功！${newCard.name} 升星到${newCard.star + 1}星！`);
    console.log(`⭐ 合成成功：${newCard.name} ${newCard.star + 1}星`);
    return true;
  },

  // ==================== 悟道系统 ====================
  enlightenmentCard(cardInstanceId, playerState) {
    const card = playerState.hand.find(card => card?.instanceId === cardInstanceId);
    if (!card) return false;

    // 增加悟道层数
    card.enlightenmentCount = (card.enlightenmentCount || 0) + 1;
    // 触发悟道技能
    this.executeSkill(card, playerState, {});

    // 刷新UI
    window.YYCardBattle.renderMyHand();
    window.YYCardBattle.saveGameState();

    console.log(`📖 悟道成功：${card.name}，悟道层数：${card.enlightenmentCount}`);
    return true;
  }
};

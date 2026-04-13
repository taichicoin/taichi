window.YYCardGameMechanics = {
  // 触发指定类型的技能
  triggerSkillType(skillType, triggerSource, board = null) {
    if (!triggerSource) return;

    let skillTargets = [];
    // 区分触发源是玩家还是单张卡牌
    if (triggerSource.hand && triggerSource.board) {
      // 玩家触发，遍历场上所有卡牌
      skillTargets = triggerSource.board.filter(card => card !== null);
    } else if (triggerSource.cardId) {
      // 单张卡牌触发
      skillTargets = [triggerSource];
    }

    // 执行对应类型的技能
    skillTargets.forEach(card => {
      const template = window.YYCardShop.cardTemplates.find(t => t.cardId === card.cardId);
      if (!template || template.skillType !== skillType) return;

      this.executeSkill(card, template, board || triggerSource.board);
    });
  },

  // 执行卡牌技能
  executeSkill(card, template, board) {
    console.log(`✨ 触发技能：${card.name} - ${template.skillName}`);

    // 技能逻辑预留，按卡牌分类实现
    switch (card.cardId) {
      // 示例：元始天尊 大道无形
      case 'char_yuanshi':
        this.skillYuanshi(card, board);
        break;
      // 示例：诸葛亮 鞠躬尽瘁
      case 'char_zhugeliang':
        this.skillZhugeliang(card);
        break;
      // 其他卡牌技能可在此扩展
      default:
        break;
    }
  },

  // 元始天尊技能：在场时商店卡牌+3/+3
  skillYuanshi(card, board) {
    const shopCards = window.YYCardShop.currentShopCards;
    const bonus = card.star >= 1 ? 6 : 3;

    shopCards.forEach(shopCard => {
      shopCard.atk += bonus;
      shopCard.hp += bonus;
    });

    window.YYCardShop.renderShop();
  },

  // 诸葛亮技能：每次攻击永久+1/+1
  skillZhugeliang(card) {
    const bonus = card.star >= 1 ? 2 : 1;
    card.atk += bonus;
    card.hp += bonus;
  },

  // ==================== 升星合成系统 ====================
  // 3张相同卡牌合成升星
  combineCards(cardInstanceId1, cardInstanceId2, cardInstanceId3) {
    const myState = window.YYCardBattle.getMyState();
    if (!myState) return false;

    // 查找三张卡牌
    const cards = [cardInstanceId1, cardInstanceId2, cardInstanceId3].map(id => {
      return myState.hand.find(card => card?.instanceId === id);
    });

    // 校验三张卡牌是否存在且相同
    const cardId = cards[0]?.cardId;
    const isValid = cards.every(card => card && card.cardId === cardId && card.star === cards[0].star);
    if (!isValid) {
      alert('只能合成3张相同星级、相同的卡牌！');
      return false;
    }

    // 移除三张旧卡牌
    myState.hand = myState.hand.map(card => {
      if (cards.find(c => c.instanceId === card?.instanceId)) return null;
      return card;
    });

    // 创建升星后的新卡牌
    const template = window.YYCardShop.cardTemplates.find(t => t.cardId === cardId);
    const newCard = window.YYCardShop.createCardInstance(template);
    newCard.star = cards[0].star + 1;
    // 数值翻倍
    newCard.atk = template.baseAtk * Math.pow(2, newCard.star);
    newCard.hp = template.baseHp * Math.pow(2, newCard.star);

    // 放入手牌
    const emptyIndex = myState.hand.findIndex(item => item === null);
    if (emptyIndex !== -1) {
      myState.hand[emptyIndex] = newCard;
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
  // 卡牌悟道升级
  enlightenmentCard(cardInstanceId) {
    const myState = window.YYCardBattle.getMyState();
    if (!myState) return false;

    // 查找卡牌
    const card = myState.hand.find(card => card?.instanceId === cardInstanceId);
    if (!card) return false;

    // 增加悟道层数
    card.enlightenmentCount += 1;
    // 触发悟道技能
    this.triggerSkillType('enlightenment', card, myState.board);

    // 刷新UI
    window.YYCardBattle.renderMyHand();
    window.YYCardBattle.saveGameState();

    console.log(`📖 悟道成功：${card.name}，悟道层数：${card.enlightenmentCount}`);
    return true;
  }
};

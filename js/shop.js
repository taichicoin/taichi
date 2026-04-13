window.YYCardShop = {
  // 卡牌模板缓存
  cardTemplates: [],
  // 当前商店卡牌
  currentShopCards: [],

  // 初始化加载卡牌模板（HTML主入口已调用）
  async loadTemplates() {
    try {
      // 【仅修正路径匹配你的/y/目录，其他完全不动】
      const res = await fetch('/y/data/characters.json');
      if (!res.ok) throw new Error('卡牌模板加载失败');
      this.cardTemplates = await res.json();
      console.log('✅ 35张卡牌模板加载成功', this.cardTemplates.length);
    } catch (err) {
      console.error('❌ 卡牌模板加载失败', err);
      alert('卡牌资源加载失败，请刷新页面重试');
    }
  },

  // 按商店等级随机生成卡牌（核心概率逻辑，严格匹配总纲）
  generateShopCards(shopLevel) {
    const config = window.YYCardConfig;
    const probability = config.SHOP_RARITY_PROBABILITY[shopLevel];
    const cardCount = config.ECONOMY.SHOP_CARD_COUNT;
    const newShopCards = [];

    for (let i = 0; i < cardCount; i++) {
      // 按概率随机稀有度
      const random = Math.random();
      let cumulative = 0;
      let targetRarity = 'Common';

      for (const [rarity, prob] of Object.entries(probability)) {
        cumulative += prob;
        if (random <= cumulative) {
          targetRarity = rarity;
          break;
        }
      }

      // 筛选对应稀有度的卡牌
      const rarityCards = this.cardTemplates.filter(card => card.rarity === targetRarity);
      if (rarityCards.length === 0) continue;

      // 随机选一张，生成实例
      const randomCard = rarityCards[Math.floor(Math.random() * rarityCards.length)];
      const cardInstance = this.createCardInstance(randomCard);
      newShopCards.push(cardInstance);
    }

    this.currentShopCards = newShopCards;
    this.renderShop();
    return newShopCards;
  },

  // 创建卡牌实例（匹配总纲数据结构）
  createCardInstance(template) {
    return {
      instanceId: `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      cardId: template.cardId,
      name: template.name,
      rarity: template.rarity,
      category: template.category || template.faction,
      atk: template.baseAtk,
      hp: template.baseHp,
      star: 0,
      equipment: [],
      enlightenmentCount: 0,
      skillName: template.skillName,
      skillDesc: template.skillDesc,
      icon: template.icon || template.image || '/y/assets/default-avatar.png'
    };
  },

  // 渲染商店到HTML
  renderShop() {
    const container = document.getElementById('shop-container');
    if (!container) return;

    const config = window.YYCardConfig;
    container.innerHTML = '';

    this.currentShopCards.forEach(card => {
      const price = config.ECONOMY.CARD_PRICE[card.rarity].buy;
      const cardEl = document.createElement('div');
      cardEl.className = `shop-card rarity-${card.rarity.toLowerCase()}`;
      cardEl.dataset.instanceId = card.instanceId;
      cardEl.innerHTML = `
        <div class="card-icon">
          <img src="${card.icon}" alt="${card.name}" onerror="this.src='/y/assets/default-avatar.png'">
        </div>
        <div class="card-name">${card.name}</div>
        <div class="card-stats">⚔️ ${card.atk} | ❤️ ${card.hp}</div>
        <div class="card-price">💰 ${price}</div>
      `;

      // 购买点击事件
      cardEl.onclick = () => this.buyCard(card);
      container.appendChild(cardEl);
    });
  },

  // 购买卡牌逻辑（严格匹配总纲规则）
  buyCard(card) {
    const battle = window.YYCardBattle;
    const config = window.YYCardConfig;
    if (!battle || !battle.currentGameState) return;

    const myState = battle.getMyState();
    const price = config.ECONOMY.CARD_PRICE[card.rarity].buy;

    // 校验金币
    if (myState.gold < price) {
      alert('金币不足！');
      return;
    }

    // 校验手牌上限
    const handEmptyIndex = myState.hand.findIndex(item => item === null);
    if (handEmptyIndex === -1) {
      alert('手牌已满！');
      return;
    }

    // 扣金币，放入手牌
    myState.gold -= price;
    myState.hand[handEmptyIndex] = card;

    // 从商店移除
    this.currentShopCards = this.currentShopCards.filter(item => item.instanceId !== card.instanceId);
    this.renderShop();

    // 刷新UI
    battle.renderMyHand();
    battle.updateGameUI();
    battle.saveGameState();

    console.log(`✅ 购买成功：${card.name}，剩余金币：${myState.gold}`);
  },

  // 刷新商店（消耗1金币，严格匹配总纲）
  refreshShop(shopLevel) {
    const battle = window.YYCardBattle;
    const config = window.YYCardConfig;
    if (!battle || !battle.currentGameState) return;

    const myState = battle.getMyState();
    const refreshCost = config.ECONOMY.REFRESH_COST;

    // 校验金币
    if (myState.gold < refreshCost) {
      alert('金币不足，无法刷新！');
      return;
    }

    // 扣金币，刷新卡牌
    myState.gold -= refreshCost;
    this.generateShopCards(shopLevel);

    // 刷新UI
    battle.updateGameUI();
    battle.saveGameState();

    // 触发刷新相关技能
    if(window.YYCardGameMechanics) {
      window.YYCardGameMechanics.triggerSkillType('refresh', myState);
    }

    console.log(`🔄 商店刷新成功，剩余金币：${myState.gold}`);
  },

  // 出售卡牌（严格匹配总纲卖出价格）
  sellCard(cardInstanceId) {
    const battle = window.YYCardBattle;
    const config = window.YYCardConfig;
    if (!battle || !battle.currentGameState) return;

    const myState = battle.getMyState();
    // 查找手牌中的卡牌
    const cardIndex = myState.hand.findIndex(item => item?.instanceId === cardInstanceId);
    if (cardIndex === -1) return;

    const card = myState.hand[cardIndex];
    const sellPrice = config.ECONOMY.CARD_PRICE[card.rarity].sell;

    // 加金币，移除卡牌
    myState.gold += sellPrice;
    myState.hand[cardIndex] = null;

    // 刷新UI
    battle.renderMyHand();
    battle.updateGameUI();
    battle.saveGameState();

    console.log(`💰 出售成功：${card.name}，获得金币：${sellPrice}`);
  }
};

// 绑定HTML按钮事件
document.addEventListener('DOMContentLoaded', () => {
  // 商店刷新按钮
  document.getElementById('refresh-shop-btn').onclick = () => {
    const battle = window.YYCardBattle;
    if (!battle) return;
    window.YYCardShop.refreshShop(battle.currentGameState.shopLevel);
  };
  // 底部刷新按钮
  document.getElementById('refresh-shop-btn-bottom').onclick = () => {
    const battle = window.YYCardBattle;
    if (!battle) return;
    window.YYCardShop.refreshShop(battle.currentGameState.shopLevel);
  };
});

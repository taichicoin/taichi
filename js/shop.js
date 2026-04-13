window.YYCardShop = {
  // 卡牌模板缓存
  cardTemplates: [],
  // 当前商店卡牌
  currentShopCards: [],

  // 初始化加载卡牌模板（HTML主入口已调用）
  async loadTemplates() {
    try {
      // 【核心修复】匹配你的/y/部署路径，正确加载卡牌JSON
      const res = await fetch('/y/data/characters.json');
      if (!res.ok) throw new Error('卡牌模板加载失败');
      
      this.cardTemplates = await res.json();
      // 模板共享给技能系统，避免重复请求
      if(window.YYCardGameMechanics) {
        window.YYCardGameMechanics.cardTemplates = this.cardTemplates;
      }
      
      console.log(`✅ 商店卡牌模板加载成功，共${this.cardTemplates.length}张`);
      return this.cardTemplates;
    } catch (err) {
      console.error('❌ 卡牌模板加载失败', err);
      alert('卡牌资源加载失败，请刷新页面重试');
      return [];
    }
  },

  // 按商店等级随机生成卡牌（核心概率逻辑，严格匹配总纲）
  generateShopCards(shopLevel) {
    const config = window.YYCardConfig;
    const probability = config.SHOP_RARITY_PROBABILITY[shopLevel];
    const cardCount = config.ECONOMY.SHOP_CARD_COUNT;
    const newShopCards = [];

    // 边界校验：商店等级合法性
    if (!probability) {
      console.error('❌ 商店等级不存在，使用默认1级概率', shopLevel);
      shopLevel = 1;
    }

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
      if (rarityCards.length === 0) {
        console.warn(`⚠️ ${targetRarity}稀有度无可用卡牌，降级为Common`);
        targetRarity = 'Common';
        continue;
      }

      // 随机选一张，生成实例
      const randomCard = rarityCards[Math.floor(Math.random() * rarityCards.length)];
      const cardInstance = this.createCardInstance(randomCard);
      newShopCards.push(cardInstance);
    }

    // 生成卡牌后，自动应用场上的光环类技能
    const battle = window.YYCardBattle;
    if (battle?.currentGameState) {
      const myState = battle.getMyState();
      if(window.YYCardGameMechanics) {
        window.YYCardGameMechanics.triggerSkills('onField', myState, { shopCards: newShopCards });
      }
    }

    // 保存当前商店卡牌并渲染
    this.currentShopCards = newShopCards;
    this.renderShop();
    
    console.log(`🔄 商店刷新完成，等级Lv.${shopLevel}，生成${newShopCards.length}张卡牌`);
    return newShopCards;
  },

  // 创建卡牌实例（100%匹配你的JSON结构）
  createCardInstance(template) {
    const skill = template.skill || {};
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
      skillName: skill.skillName || '',
      skillDesc: skill.skillName || '',
      skill: skill,
      // 【核心修正】图片路径匹配你的/y/部署目录
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
      const price = config.ECONOMY.CARD_PRICE[card.rarity]?.buy || 1;
      const rarityClass = card.rarity.toLowerCase();
      
      const cardEl = document.createElement('div');
      cardEl.className = `shop-card rarity-${rarityClass}`;
      cardEl.dataset.instanceId = card.instanceId;
      cardEl.innerHTML = `
        <div class="card-icon">
          <img src="${card.icon}" alt="${card.name}" onerror="this.src='/y/assets/default-avatar.png'">
        </div>
        <div class="card-name">${card.name}</div>
        <div class="card-stats">⚔️ ${card.atk} | ❤️ ${card.hp}</div>
        <div class="card-skill">${card.skillName}</div>
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
    if (!battle || !battle.currentGameState) {
      alert('对局未初始化，无法购买卡牌');
      return;
    }

    const myState = battle.getMyState();
    const price = config.ECONOMY.CARD_PRICE[card.rarity]?.buy || 1;

    // 1. 校验金币
    if (myState.gold < price) {
      alert('金币不足！');
      return;
    }

    // 2. 校验手牌上限
    const handEmptyIndex = myState.hand.findIndex(item => item === null);
    if (handEmptyIndex === -1) {
      alert('手牌已满（上限15张）！');
      return;
    }

    // 3. 扣金币，放入手牌
    myState.gold -= price;
    myState.hand[handEmptyIndex] = card;

    // 4. 从商店移除
    this.currentShopCards = this.currentShopCards.filter(item => item.instanceId !== card.instanceId);
    this.renderShop();

    // 5. 刷新UI
    battle.renderMyHand();
    battle.updateGameUI();
    battle.saveGameState();

    console.log(`✅ 购买成功：${card.name}，消耗${price}金币，剩余金币：${myState.gold}`);
  },

  // 刷新商店（消耗1金币，严格匹配总纲）
  refreshShop(shopLevel) {
    const battle = window.YYCardBattle;
    const config = window.YYCardConfig;
    if (!battle || !battle.currentGameState) {
      alert('对局未初始化，无法刷新商店');
      return;
    }

    const myState = battle.getMyState();
    const refreshCost = config.ECONOMY.REFRESH_COST;

    // 1. 校验金币
    if (myState.gold < refreshCost) {
      alert('金币不足，无法刷新！');
      return;
    }

    // 2. 扣金币，刷新卡牌
    myState.gold -= refreshCost;
    this.generateShopCards(shopLevel);

    // 3. 刷新UI
    battle.updateGameUI();
    battle.saveGameState();

    // 触发商店刷新相关技能
    if(window.YYCardGameMechanics) {
      window.YYCardGameMechanics.triggerSkills('onShopRefresh', myState);
    }

    console.log(`🔄 商店刷新成功，消耗${refreshCost}金币，剩余金币：${myState.gold}`);
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
    const sellPrice = config.ECONOMY.CARD_PRICE[card.rarity]?.sell || 0;

    // 加金币，移除卡牌
    myState.gold += sellPrice;
    myState.hand[cardIndex] = null;

    // 刷新UI
    battle.renderMyHand();
    battle.updateGameUI();
    battle.saveGameState();

    console.log(`💰 出售成功：${card.name}，获得${sellPrice}金币，当前金币：${myState.gold}`);
  },

  // 升级商店（补全总纲逻辑）
  upgradeShop() {
    const battle = window.YYCardBattle;
    const config = window.YYCardConfig;
    if (!battle || !battle.currentGameState) {
      alert('对局未初始化，无法升级商店');
      return;
    }

    const myState = battle.getMyState();
    const currentLevel = myState.shopLevel;
    const nextLevel = currentLevel + 1;

    // 1. 校验是否已达最高等级
    if (currentLevel >= config.MAX_SHOP_LEVEL) {
      alert('商店已达最高等级！');
      return;
    }

    // 2. 校验升级所需经验/金币
    const needExp = config.ECONOMY.SHOP_LEVEL_EXP[nextLevel];
    const currentExp = myState.shopExp;
    const needGold = needExp - currentExp;

    if (myState.gold < needGold) {
      alert(`金币不足！升级到Lv.${nextLevel}还需${needGold}金币`);
      return;
    }

    // 3. 扣金币，升级商店
    myState.gold -= needGold;
    myState.shopExp = needExp;
    myState.shopLevel = nextLevel;

    // 4. 刷新商店（升级后自动刷新卡牌）
    this.generateShopCards(nextLevel);

    // 5. 刷新UI
    battle.updateGameUI();
    battle.saveGameState();

    console.log(`📈 商店升级成功！当前等级Lv.${nextLevel}，消耗${needGold}金币`);
    alert(`商店升级成功！当前等级Lv.${nextLevel}`);
  }
};

// 绑定HTML按钮事件（容错优化版）
document.addEventListener('DOMContentLoaded', () => {
  // 商店刷新按钮
  const refreshBtn = document.getElementById('refresh-shop-btn');
  const refreshBottomBtn = document.getElementById('refresh-shop-btn-bottom');
  // 商店升级按钮
  const buyExpBtn = document.getElementById('buy-exp-btn');
  const buyExpBottomBtn = document.getElementById('buy-exp-btn-bottom');

  // 刷新按钮事件
  const refreshHandler = () => {
    const battle = window.YYCardBattle;
    if (!battle?.currentGameState) return;
    window.YYCardShop.refreshShop(battle.currentGameState.shopLevel);
  };
  if (refreshBtn) refreshBtn.onclick = refreshHandler;
  if (refreshBottomBtn) refreshBottomBtn.onclick = refreshHandler;

  // 升级按钮事件
  const upgradeHandler = () => {
    window.YYCardShop.upgradeShop();
  };
  if (buyExpBtn) buyExpBtn.onclick = upgradeHandler;
  if (buyExpBottomBtn) buyExpBottomBtn.onclick = upgradeHandler;
});

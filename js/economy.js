window.YYCardEconomy = {
  // 发放回合奖励（总纲规则）
  grantRoundReward(gameState, roundNum) {
    const config = window.YYCardConfig;
    const players = gameState.players;

    players.forEach(player => {
      if (player.isEliminated) return;

      // 1. 发放回合经验
      player.exp += config.ECONOMY.EXP_PER_ROUND;
      // 2. 发放回合金币
      const goldReward = this.getRoundGoldReward(roundNum);
      player.gold += goldReward;

      console.log(`🎁 玩家${player.playerId} 回合${roundNum}奖励：金币+${goldReward}，经验+${config.ECONOMY.EXP_PER_ROUND}`);
    });

    return gameState;
  },

  // 获取回合金币奖励（总纲规则）
  getRoundGoldReward(roundNum) {
    const config = window.YYCardConfig;
    // 前6回合按固定值，之后按递增公式
    if (config.ECONOMY.GOLD_PER_ROUND[roundNum]) {
      return config.ECONOMY.GOLD_PER_ROUND[roundNum];
    }
    // 第6回合后，每回合+2
    return config.ECONOMY.GOLD_PER_ROUND[6] + (roundNum - 6) * config.ECONOMY.GOLD_PER_ROUND_INCREMENT;
  },

  // 商店升级逻辑（总纲经验需求）
  upgradeShop(player) {
    const config = window.YYCardConfig;
    const currentLevel = player.shopLevel;
    const nextLevel = currentLevel + 1;

    // 校验等级上限
    if (nextLevel > config.ECONOMY.SHOP_MAX_LEVEL) {
      alert('商店已达最高等级！');
      return false;
    }

    // 校验经验是否足够
    const expNeeded = config.ECONOMY.SHOP_LEVEL_EXP[nextLevel];
    if (player.exp < expNeeded) {
      // 金币购买经验
      const expNeedToBuy = expNeeded - player.exp;
      const goldNeeded = expNeedToBuy * config.ECONOMY.GOLD_TO_EXP;

      if (player.gold < goldNeeded) {
        alert(`升级需要${expNeedToBuy}经验，还差${expNeedToBuy}，需${goldNeeded}金币，金币不足！`);
        return false;
      }

      // 扣金币，加经验
      player.gold -= goldNeeded;
      player.exp += expNeedToBuy;
      console.log(`📈 购买${expNeedToBuy}经验，消耗${goldNeeded}金币`);
    }

    // 执行升级
    player.shopLevel = nextLevel;
    console.log(`🏪 商店升级成功！当前等级：${nextLevel}`);
    alert(`商店升级到Lv.${nextLevel}！`);
    return true;
  },

  // 计算战斗伤害（总纲公式：失败方扣血 = 2 + 敌方场上存活单位数）
  calculateBattleDamage(survivalCount) {
    const config = window.YYCardConfig;
    return config.BATTLE.BASE_DAMAGE + survivalCount * config.BATTLE.DAMAGE_PER_SURVIVAL;
  }
};

// 绑定HTML升级按钮事件
document.addEventListener('DOMContentLoaded', () => {
  // 商店升级按钮
  document.getElementById('buy-exp-btn').onclick = () => {
    const battle = window.YYCardBattle;
    if (!battle || !battle.currentGameState) return;
    const myState = battle.getMyState();
    const success = window.YYCardEconomy.upgradeShop(myState);
    if (success) {
      battle.updateGameUI();
      battle.saveGameState();
    }
  };
  // 底部升级按钮
  document.getElementById('buy-exp-btn-bottom').onclick = () => {
    const battle = window.YYCardBattle;
    if (!battle || !battle.currentGameState) return;
    const myState = battle.getMyState();
    const success = window.YYCardEconomy.upgradeShop(myState);
    if (success) {
      battle.updateGameUI();
      battle.saveGameState();
    }
  };
});

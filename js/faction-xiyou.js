const XiYouSkills = {
  skill_xy_tangseng: (enemyCards) => {
    if (enemyCards.length === 0) return;
    let max = enemyCards[0];
    enemyCards.forEach(c => {
      if (c.finalAtk > max.finalAtk) max = c;
    });
    max.finalAtk -= 3;
  },
  skill_xy_shaseng: (dmg) => Math.max(0, dmg - 1),
  skill_xy_zhubajie: (cardSaveData, card) => {
    const s = cardSaveData[card.saveKey];
    s.currentHp += 3;
  },
  skill_xy_sunwukong: (atk) => atk + 2,
  skill_xy_bailongma: (grids, cardSaveData, layer) => {
    grids.forEach(g => {
      const s = cardSaveData[g.saveKey];
      s.bonusHp += layer;
    });
  }
};

const FengShenSkills = {
  skill_fs_jiangziya: (grids, cardSaveData) => {
    grids.forEach(g => {
      if (g.faction === 'fengshen') {
        const s = cardSaveData[g.saveKey];
        s.bonusAtk += 1;
        s.bonusHp += 1;
      }
    });
  },
  skill_fs_nezha: () => 2,
  skill_fs_yangjian: (cardSaveData, card) => {
    const s = cardSaveData[card.saveKey];
    s.currentHp += 2;
  },
  skill_fs_daji: () => Math.random() < 0.3,
  skill_fs_leizhenzi: (enemyCards) => {
    enemyCards.forEach(c => c.currentHp -= 1);
  }
};

const ShanHaiJingSkills = {
  skill_sh_yinglong: (grids, cardSaveData, layer) => {
    grids.forEach(g => {
      if (g.faction === 'shanhaijing') {
        const s = cardSaveData[g.saveKey];
        s.bonusAtk += layer * 2;
      }
    });
  },
  skill_sh_baize: (grids, cardSaveData, layer) => {
    grids.forEach(g => {
      if (g.skillId === 'skill_sh_baize') {
        const s = cardSaveData[g.saveKey];
        s.bonusHp += layer;
      }
    });
  },
  skill_sh_jiuweihu: (atk) => atk * 1.5,
  skill_sh_qiongqi: (cardSaveData, card) => {
    const s = cardSaveData[card.saveKey];
    s.bonusAtk += 3;
  },
  skill_sh_jingwei: (grids, cardSaveData, layer) => {
    grids.forEach(g => {
      const s = cardSaveData[g.saveKey];
      s.bonusAtk += layer;
    });
  }
};

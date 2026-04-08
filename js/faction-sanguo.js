const SanGuoSkills = {
  skill_sg_liubei: (grids, cardSaveData) => {
    grids.forEach(g => {
      if (g.faction === 'sanguo') {
        const s = cardSaveData[g.saveKey];
        s.bonusHp += 1;
      }
    });
  },
  skill_sg_guanyu: (atk) => atk + 3,
  skill_sg_zhangfei: (atk) => atk * 2,
  skill_sg_zhaoyun: (card, atk) => card.currentHp < card.maxHp / 2 ? atk * 2 : atk,
  skill_sg_zhugeliang: () => true
};

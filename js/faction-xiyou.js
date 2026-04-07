// ====================== 西游阵营 独立卡牌 ======================
const XiYouCards = [
  {id:301,name:"Tang Seng",faction:"xiyou",skill:"xiyou_ts",image:"assets/card/ts.jpg",baseAtk:2,baseHp:8,cost:1},
  {id:302,name:"Wu Kong",faction:"xiyou",skill:"xiyou_wk",image:"assets/card/wk.jpg",baseAtk:12,baseHp:10,cost:4},
  {id:303,name:"Ba Jie",faction:"xiyou",skill:"xiyou_bj",image:"assets/card/bj.jpg",baseAtk:7,baseHp:14,cost:3},
  {id:304,name:"Sha Seng",faction:"xiyou",skill:"xiyou_ss",image:"assets/card/ss.jpg",baseAtk:5,baseHp:16,cost:2},
  {id:305,name:"Bai Long Ma",faction:"xiyou",skill:"xiyou_blm",image:"assets/card/blm.jpg",baseAtk:4,baseHp:12,cost:2}
];

// 西游空函数（后面写技能直接补这里，不碰主代码）
function calcXiYouSkill(cardSave, gridList, layer){
  // 技能预留位置，现在空着，只占位不生效
}

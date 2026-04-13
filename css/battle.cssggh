/* ==================== 全局重置 & 核心背景（1:1还原参考图深蓝科技质感） ==================== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

body {
  overscroll-behavior: none;
  touch-action: pan-y;
  /* 参考图同款：深蓝渐变+科技暗纹底色，完全匹配右侧截图风格 */
  background: linear-gradient(180deg, #141b33 0%, #0c1122 40%, #080c16 100%);
  background-image: 
    radial-gradient(circle at 20% 15%, rgba(30, 50, 100, 0.4) 0%, transparent 50%),
    radial-gradient(circle at 80% 85%, rgba(60, 30, 120, 0.3) 0%, transparent 50%),
    url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%232a3a5c' fill-opacity='0.1' fill-rule='evenodd'/%3E%3C/svg%3E");
  min-height: 100vh;
  color: #f0f0f0;
  font-family: 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  overflow: hidden;
}

/* ==================== 顶部布局（完全匹配参考图） ==================== */
/* ----- 左上角：退出/设置按钮 ----- */
.top-left-actions {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 100;
  display: flex;
  gap: 8px;
  align-items: center;
}
.top-left-actions .btn {
  background: rgba(22, 32, 55, 0.9);
  backdrop-filter: blur(6px);
  padding: 6px 12px;
  font-size: 0.85rem;
  border: 1px solid rgba(255, 215, 0, 0.25);
  border-radius: 12px;
  color: #f0f0f0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

/* ----- 右上角：8名玩家状态栏（还原参考图侧边玩家列表） ----- */
.players-status-bar {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 100;
  width: 70px;
  background: rgba(12, 18, 35, 0.85);
  backdrop-filter: blur(8px);
  border-radius: 16px;
  padding: 8px 6px;
  border: 1px solid rgba(255, 215, 0, 0.3);
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}
.player-status-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.player-status-item {
  display: flex;
  align-items: center;
  justify-content: center;
}
.player-status-item img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid #f5d76e;
  background: #2a3a5c;
  object-fit: cover;
}

/* ----- 顶部中间：等级&金币显示（参考图顶部5级+金币） ----- */
.top-center-info {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99;
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(18, 26, 45, 0.9);
  backdrop-filter: blur(8px);
  padding: 6px 20px;
  border-radius: 20px;
  border: 1px solid rgba(255, 215, 0, 0.3);
}
.top-center-info .level-badge {
  color: #f5d76e;
  font-weight: bold;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 4px;
}
.top-center-info .gold-badge {
  color: #f5d76e;
  font-weight: bold;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ==================== 顶部商店区（核心！参考图顶部3张卡牌布局） ==================== */
.shop-area {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 100px);
  max-width: 600px;
  z-index: 90;
  background: rgba(15, 22, 40, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 12px 16px;
  border: 1px solid rgba(255, 215, 0, 0.35);
  box-shadow: 0 6px 20px rgba(0,0,0,0.4);
}

/* 商店信息：等级+金币 */
.shop-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 0.95rem;
  font-weight: bold;
  color: #f5d76e;
}

/* 商店卡牌容器：固定3张，等宽排列，完全匹配参考图 */
.shop-cards {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 4px 0;
}
.shop-cards .card {
  flex: 1;
  min-width: 0;
  aspect-ratio: 3 / 4;
}

/* 商店操作按钮：升级（中左）、刷新（中右），完全按你的要求 */
.shop-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding: 0 10px;
}
.shop-actions .btn {
  padding: 8px 20px;
  font-size: 0.9rem;
  border-radius: 12px;
  font-weight: bold;
}
.shop-actions .btn:first-child {
  /* 升级按钮：中左 */
  background: linear-gradient(145deg, #3a4a7a, #2a3a5a);
  border: 1px solid rgba(255,215,0,0.3);
}
.shop-actions .btn:last-child {
  /* 刷新按钮：中右，参考图黄色刷新按钮 */
  background: linear-gradient(145deg, #f5d76e, #f0b34b);
  color: #0b0f1c;
  border: none;
}

/* ==================== 中间对战棋盘区（楚河汉界+倒计时位置） ==================== */
.board-area {
  position: fixed;
  top: 240px;
  bottom: 180px;
  left: 20px;
  right: 90px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  z-index: 80;
}

/* 敌方棋盘（战斗阶段显示） */
.enemy-board-section {
  width: 100%;
}
.board-label {
  font-size: 0.85rem;
  opacity: 0.8;
  margin-bottom: 8px;
  padding-left: 4px;
  color: #aab9d4;
}
.board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
}
.board-slot {
  aspect-ratio: 3 / 4;
  background: rgba(22, 32, 55, 0.4);
  border-radius: 12px;
  border: 1px dashed rgba(255,215,0,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}
.board-slot:hover {
  background: rgba(22, 32, 55, 0.6);
  border-color: rgba(255,215,0,0.4);
}
.board-slot .card {
  width: 100%;
  height: 100%;
}

/* 楚河汉界分割线 + 倒计时（倒计时在中间右边，完全按你的要求） */
.battle-divider-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 12px 0;
}
.battle-divider {
  color: #f5d76e;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(0,0,0,0.8);
  letter-spacing: 2px;
  font-size: 1.1rem;
}
/* 倒计时：屏幕中间右边，完全按你的要求 */
.battle-timer {
  font-size: 1rem;
  font-weight: bold;
  color: #e94560;
  text-shadow: 0 0 6px rgba(233, 69, 96, 0.6);
}

/* 我方棋盘 */
.my-board-section {
  width: 100%;
}

/* ==================== 手牌区（准备阶段显示，参考图底部手牌） ==================== */
.hand-area {
  position: fixed;
  bottom: 110px;
  left: 20px;
  right: 90px;
  z-index: 85;
  background: rgba(15, 22, 40, 0.75);
  backdrop-filter: blur(8px);
  border-radius: 16px;
  padding: 8px 12px;
  border: 1px solid rgba(255,215,0,0.25);
}
.hand-label {
  font-size: 0.75rem;
  margin-bottom: 6px;
  padding-left: 4px;
  color: #aab9d4;
  display: flex;
  gap: 12px;
}
.hand {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;
}
.hand::-webkit-scrollbar {
  display: none;
}
.hand .card {
  min-width: 120px;
  flex-shrink: 0;
  aspect-ratio: 3 / 4;
}

/* ==================== 底部准备按钮区（参考图圆形准备按钮） ==================== */
.prepare-actions {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 90;
  display: flex;
  gap: 12px;
  justify-content: center;
  align-items: center;
}
.prepare-actions .btn {
  padding: 8px 20px;
  font-size: 0.95rem;
  border-radius: 12px;
}
/* 准备按钮：参考图紫色圆形样式 */
.prepare-actions .btn-primary {
  background: linear-gradient(145deg, #9d50bb, #6e48aa);
  color: #fff;
  border: none;
  padding: 0;
  font-size: 1.1rem;
  font-weight: bold;
  border-radius: 50%;
  width: 75px;
  height: 75px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 0 #4a3070;
}
.prepare-actions .btn-primary:active {
  transform: translateY(3px);
  box-shadow: 0 3px 0 #4a3070;
}

/* ==================== 卡牌通用样式（1:1还原参考图卡牌质感） ==================== */
.card {
  background: linear-gradient(145deg, #1a2a4a, #0a0f1a);
  border: 2px solid #3a4a6a;
  border-radius: 12px;
  padding: 6px;
  text-align: center;
  font-size: 0.8rem;
  transition: all 0.15s;
  box-shadow: 0 4px 8px rgba(0,0,0,0.4);
  position: relative;
  overflow: hidden;
}

/* 稀有度边框颜色（完全匹配参考图品质色） */
.card.rarity-Common { border-color: #aab9d4; }
.card.rarity-Rare { border-color: #2ecc71; box-shadow: 0 0 8px rgba(46, 204, 113, 0.3); }
.card.rarity-Epic { border-color: #9b59b6; box-shadow: 0 0 10px rgba(155, 89, 182, 0.4); }
.card.rarity-Legendary { border-color: #f5d76e; box-shadow: 0 0 15px rgba(255, 215, 0, 0.4); }

/* 卡牌立绘 */
.card .card-img {
  width: 100%;
  border-radius: 8px;
  margin-bottom: 4px;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  background: #121927;
}
/* 卡牌名称 */
.card .card-name {
  font-weight: bold;
  color: #f5d76e;
  margin-bottom: 2px;
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 卡牌属性：攻击/血量 */
.card .card-stats {
  font-size: 0.7rem;
  display: flex;
  justify-content: space-around;
  gap: 6px;
  margin-bottom: 4px;
}
.card .card-stats .atk { color: #e94560; font-weight: bold; }
.card .card-stats .hp { color: #2ecc71; font-weight: bold; }
/* 卡牌技能描述 */
.card .card-desc {
  font-size: 0.6rem;
  color: #aab9d4;
  line-height: 1.2;
  margin-bottom: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* 卡牌价格 */
.card .card-price {
  color: #f5d76e;
  font-weight: bold;
  font-size: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
/* 选中状态 */
.card.selected {
  border-color: #f5d76e;
  box-shadow: 0 0 15px rgba(255,215,0,0.6);
  transform: translateY(-4px);
}

/* ==================== 按钮通用样式 ==================== */
.btn {
  background: #2e3f5e;
  color: white;
  border: none;
  padding: 8px 12px;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 3px 0 #121927;
  font-family: inherit;
}
.btn:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 #121927;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ==================== 阶段显示/隐藏控制（和原有JS完全兼容） ==================== */
.prepare-only { display: block; }
.battle-only { display: none; }

body.battle-view-mode .prepare-only { display: none; }
body.battle-view-mode .battle-only { display: block; }

/* ==================== 移动端完美适配（手机DApp浏览器专用） ==================== */
@media (max-width: 768px) {
  .top-left-actions {
    top: 8px;
    left: 8px;
  }
  .top-left-actions .btn {
    padding: 5px 10px;
    font-size: 0.8rem;
  }

  .players-status-bar {
    top: 8px;
    right: 8px;
    width: 60px;
  }
  .player-status-item img {
    width: 32px;
    height: 32px;
  }

  .top-center-info {
    top: 8px;
    padding: 5px 16px;
  }
  .top-center-info .level-badge,
  .top-center-info .gold-badge {
    font-size: 0.9rem;
  }

  .shop-area {
    top: 50px;
    width: calc(100% - 80px);
    padding: 10px 12px;
  }
  .shop-cards {
    gap: 8px;
  }
  .shop-actions .btn {
    padding: 6px 16px;
    font-size: 0.85rem;
  }

  .board-area {
    top: 210px;
    bottom: 160px;
    left: 12px;
    right: 80px;
  }
  .board {
    gap: 8px;
  }

  .hand-area {
    bottom: 90px;
    left: 12px;
    right: 80px;
  }
  .hand .card {
    min-width: 100px;
  }

  .prepare-actions {
    bottom: 15px;
  }
  .prepare-actions .btn-primary {
    width: 65px;
    height: 65px;
    font-size: 1rem;
  }

  .battle-divider {
    font-size: 1rem;
  }
  .battle-timer {
    font-size: 0.9rem;
  }
}

/* ==================== 对局界面样式（悠悠牌最终风格 - 1:1还原截图） ==================== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}
body {
  overscroll-behavior: none;
  touch-action: pan-y;
  /* 截图背景：深蓝渐变+科技感底纹 */
  background: radial-gradient(circle at 20% 20%, #1a2a4a, #0a0f1a 60%, #050810);
  min-height: 100vh;
  color: #f0f0f0;
  font-family: 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  overflow: hidden;
}

/* ----- 右上角8名玩家状态栏（完全还原截图） ----- */
.players-status-bar {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 100;
  width: 140px;
  background: rgba(10, 18, 30, 0.85);
  backdrop-filter: blur(8px);
  border-radius: 20px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 215, 0, 0.3);
  box-shadow: 0 4px 10px rgba(0,0,0,0.5);
}
.player-status-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.player-status-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.player-status-item img {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1.5px solid #f5d76e;
  background: #2a3a5c;
  object-fit: cover;
}
.player-status-item .hp-bar {
  flex: 1;
  height: 6px;
  background: #3a4a6a;
  border-radius: 3px;
  overflow: hidden;
}
.player-status-item .hp-fill {
  height: 100%;
  background: #e94560;
  width: 0%;
  transition: width 0.3s ease;
}
.player-status-item .hp-text {
  font-size: 0.65rem;
  min-width: 20px;
  text-align: right;
  color: #f5d76e;
}

/* ----- 左上角操作区（退出/设置/阵容推荐，还原截图顶部栏） ----- */
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
  background: rgba(20, 28, 48, 0.8);
  backdrop-filter: blur(4px);
  padding: 6px 12px;
  font-size: 0.8rem;
  border: 1px solid rgba(255,215,0,0.2);
  border-radius: 40px;
  color: #f0f0f0;
}
.top-left-actions .level-badge {
  background: linear-gradient(145deg, #2a3a5c, #1a2a4a);
  color: #f5d76e;
  padding: 6px 16px;
  border-radius: 40px;
  font-weight: bold;
  font-size: 0.9rem;
  border: 1px solid rgba(255,215,0,0.3);
}
.top-left-actions .gold-badge {
  position: fixed;
  top: 12px;
  right: 160px;
  background: rgba(20, 28, 48, 0.8);
  backdrop-filter: blur(4px);
  padding: 6px 12px;
  border-radius: 40px;
  border: 1px solid rgba(255,215,0,0.3);
  color: #f5d76e;
  font-weight: bold;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 4px;
}
.top-left-actions .gold-badge img {
  width: 18px;
  height: 18px;
}

/* ----- 准备阶段：商店区域（顶部，完全还原截图） ----- */
.shop-area {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 24px);
  max-width: 700px;
  z-index: 90;
  background: rgba(10, 18, 30, 0.9);
  backdrop-filter: blur(8px);
  border-radius: 16px;
  padding: 12px;
  border: 1px solid rgba(255,215,0,0.3);
  box-shadow: 0 8px 20px rgba(0,0,0,0.4);
}
.shop-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.shop-cards {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 4px 0;
  scrollbar-width: none;
}
.shop-cards::-webkit-scrollbar {
  display: none;
}
.shop-cards .card {
  min-width: 160px;
  flex-shrink: 0;
}
.shop-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 8px;
}
.shop-actions .btn {
  padding: 8px 20px;
  font-size: 0.9rem;
}
.shop-actions .btn-refresh {
  background: linear-gradient(145deg, #f5d76e, #f0b34b);
  color: #0b0f1c;
  border: none;
}
.shop-actions .btn-lock {
  background: rgba(30, 40, 60, 0.9);
  border: 1px solid #f5d76e;
  color: #f0f0f0;
}

/* ----- 准备阶段：操作按钮区（底部，还原截图39/70准备按钮） ----- */
.prepare-actions {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 90;
  display: flex;
  gap: 12px;
  justify-content: center;
}
.prepare-actions .btn-ready {
  background: linear-gradient(145deg, #9d50bb, #6e48aa);
  color: #fff;
  border: none;
  padding: 12px 24px;
  font-size: 1.1rem;
  font-weight: bold;
  border-radius: 50%;
  width: 70px;
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 0 #4a3070;
}
.prepare-actions .btn-ready:active {
  transform: translateY(3px);
  box-shadow: 0 3px 0 #4a3070;
}

/* ----- 手牌区域（准备阶段显示在操作按钮上方，还原截图底部手牌） ----- */
.hand-area {
  position: fixed;
  bottom: 110px;
  left: 20px;
  right: 20px;
  z-index: 89;
  background: rgba(10, 18, 30, 0.7);
  backdrop-filter: blur(8px);
  border-radius: 20px;
  padding: 8px 12px;
  border: 1px solid rgba(255,215,0,0.2);
}
.hand-label {
  font-size: 0.7rem;
  margin-bottom: 4px;
  padding-left: 4px;
  color: #aab9d4;
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
  min-width: 140px;
  flex-shrink: 0;
}

/* ----- 棋盘区域（准备和战斗共用，还原截图2行3列布局） ----- */
.board-area {
  position: fixed;
  top: 180px;
  bottom: 180px;
  left: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 16px;
}
.my-board-section {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 16px;
  padding: 12px;
  border: 1px solid rgba(255,215,0,0.1);
}
.board-label {
  font-size: 0.8rem;
  opacity: 0.7;
  margin-bottom: 8px;
  text-align: left;
  padding-left: 4px;
  color: #aab9d4;
}
.board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.board-slot {
  aspect-ratio: 1 / 1.2;
  background: rgba(20, 28, 48, 0.5);
  border-radius: 12px;
  border: 1px dashed rgba(255,215,0,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}
.board-slot:hover {
  background: rgba(20, 28, 48, 0.7);
  border-color: rgba(255,215,0,0.4);
}
.board-slot .card {
  width: 100%;
  height: 100%;
}
.battle-divider {
  text-align: center;
  margin: 8px 0;
  color: #f5d76e;
  font-weight: bold;
  text-shadow: 0 0 8px #000;
  letter-spacing: 4px;
  font-size: 1.1rem;
}

/* ----- 战斗阶段特有：倒计时/阶段提示 ----- */
.battle-timer {
  text-align: center;
  font-size: 0.9rem;
  color: #e94560;
  margin-top: -8px;
  margin-bottom: 8px;
}

/* ----- 卡牌通用样式（完全还原截图卡牌质感） ----- */
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
/* 卡牌稀有度边框（还原截图黄/紫/绿/蓝品质） */
.card.rarity-common { border-color: #aab9d4; }
.card.rarity-rare { border-color: #2ecc71; }
.card.rarity-epic { border-color: #9b59b6; }
.card.rarity-legendary { border-color: #f5d76e; box-shadow: 0 0 12px rgba(255,215,0,0.3); }

.card .card-img {
  width: 100%;
  border-radius: 8px;
  margin-bottom: 4px;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.card .card-name {
  font-weight: bold;
  color: #f5d76e;
  margin-bottom: 2px;
}
.card .card-stats {
  font-size: 0.75rem;
  display: flex;
  justify-content: space-around;
  gap: 6px;
  margin-bottom: 4px;
}
.card .card-stats .atk { color: #e94560; font-weight: bold; }
.card .card-stats .hp { color: #2ecc71; font-weight: bold; }
.card .card-desc {
  font-size: 0.65rem;
  color: #aab9d4;
  line-height: 1.2;
  margin-bottom: 4px;
}
.card .card-price {
  color: #f5d76e;
  font-weight: bold;
  font-size: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.card .card-price img {
  width: 14px;
  height: 14px;
}
.card.selected {
  border-color: #f5d76e;
  box-shadow: 0 0 15px rgba(255,215,0,0.5);
  transform: translateY(-4px);
}
.card .buff-icon {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  background: rgba(0,0,0,0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f5d76e;
  font-size: 0.6rem;
}

/* ----- 按钮通用样式（还原截图按钮质感） ----- */
.btn {
  background: #2e3f5e;
  color: white;
  border: none;
  padding: 8px 12px;
  border-radius: 40px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 4px 0 #121927;
  font-family: inherit;
}
.btn:active {
  transform: translateY(2px);
  box-shadow: 0 2px 0 #121927;
}
.btn-primary {
  background: linear-gradient(145deg, #f5d76e, #f0b34b);
  color: #0b0f1c;
  box-shadow: 0 4px 0 #a05f20;
}

/* ----- 阶段切换控制 ----- */
.prepare-only { display: block; }
.battle-only { display: none; }
.battle-view-mode .prepare-only { display: none; }
.battle-view-mode .battle-only { display: block; }

/* ----- 移动端适配（完美适配手机DApp浏览器） ----- */
@media (max-width: 768px) {
  .shop-area {
    width: calc(100% - 16px);
    top: 50px;
  }
  .shop-cards .card {
    min-width: 140px;
  }
  .board-area {
    top: 160px;
    bottom: 160px;
    left: 12px;
    right: 12px;
    gap: 12px;
  }
  .board {
    gap: 8px;
  }
  .hand-area {
    bottom: 100px;
    left: 12px;
    right: 12px;
  }
  .hand .card {
    min-width: 120px;
  }
  .players-status-bar {
    width: 120px;
  }
  .gold-badge {
    right: 140px !important;
  }
}

/* ==================== 全局重置与基础配置 ==================== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

:root {
  /* 太极主题配色 */
  --bg-primary: #0a0e27;
  --bg-secondary: #131837;
  --bg-card: #1a1f3a;
  --border-yin: #1a237e;
  --border-yang: #f59e0b;
  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
  --text-muted: #94a3b8;
  --accent-yang: #f59e0b;
  --accent-yin: #3b82f6;
  --danger: #ef4444;
  --success: #22c55e;
  /* 稀有度颜色 */
  --rarity-common: #94a3b8;
  --rarity-rare: #22c55e;
  --rarity-epic: #8b5cf6;
  --rarity-legendary: #f59e0b;
  /* 布局尺寸 */
  --safe-top: env(safe-area-inset-top);
  --safe-bottom: env(safe-area-inset-bottom);
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
  width: 100vw;
  height: 100vh;
  max-width: 100%;
  max-height: 100%;
}

#app {
  width: 100%;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background: linear-gradient(180deg, #0a0e27 0%, #131837 50%, #0a0e27 100%);
  background-image: url('/assets/bg.jpg');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

/* ==================== 顶部信息栏 ==================== */
.top-left-actions {
  position: absolute;
  top: calc(var(--safe-top) + 10px);
  left: 10px;
  display: flex;
  gap: 8px;
  z-index: 100;
}

.top-player-info {
  position: absolute;
  top: calc(var(--safe-top) + 10px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: rgba(26, 31, 58, 0.8);
  border-radius: 50px;
  border: 1px solid var(--border-yin);
  backdrop-filter: blur(10px);
  z-index: 100;
  font-size: 14px;
  font-weight: 600;
}

.top-player-info span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.players-status-bar {
  position: absolute;
  top: calc(var(--safe-top) + 10px);
  right: 10px;
  z-index: 100;
}

.player-status-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.player-status-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: rgba(26, 31, 58, 0.8);
  border-radius: 20px;
  border: 1px solid var(--border-yin);
  backdrop-filter: blur(10px);
}

.player-status-item.eliminated {
  opacity: 0.5;
  filter: grayscale(100%);
}

.player-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--accent-yin);
}

.player-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.player-health {
  font-size: 12px;
  font-weight: 600;
  color: var(--danger);
}

/* ==================== 按钮通用样式 ==================== */
.btn {
  padding: 8px 16px;
  background: rgba(26, 31, 58, 0.9);
  border: 1px solid var(--border-yin);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  backdrop-filter: blur(10px);
}

.btn:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: var(--accent-yin);
  transform: scale(1.05);
}

.btn:active {
  transform: scale(0.98);
}

.btn-primary {
  background: linear-gradient(90deg, var(--accent-yin), var(--accent-yang));
  border: none;
  color: white;
  font-weight: 700;
}

.btn-primary:hover {
  filter: brightness(1.2);
}

/* ==================== 商店区域 ==================== */
.shop-area {
  position: absolute;
  top: calc(var(--safe-top) + 60px);
  left: 50%;
  transform: translateX(-50%);
  width: 95%;
  max-width: 500px;
  z-index: 90;
}

.shop-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: rgba(26, 31, 58, 0.8);
  border-radius: 12px 12px 0 0;
  border: 1px solid var(--border-yin);
  border-bottom: none;
  backdrop-filter: blur(10px);
  font-size: 16px;
  font-weight: 700;
}

.shop-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 12px;
  background: rgba(19, 24, 55, 0.9);
  border-radius: 0 0 12px 12px;
  border: 1px solid var(--border-yin);
  backdrop-filter: blur(10px);
}

.shop-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  background: var(--bg-card);
  border-radius: 8px;
  border: 2px solid var(--rarity-common);
  cursor: pointer;
  transition: all 0.2s ease;
}

.shop-card.rarity-rare {
  border-color: var(--rarity-rare);
  box-shadow: 0 0 10px rgba(34, 197, 94, 0.3);
}

.shop-card.rarity-epic {
  border-color: var(--rarity-epic);
  box-shadow: 0 0 15px rgba(139, 92, 246, 0.4);
}

.shop-card.rarity-legendary {
  border-color: var(--rarity-legendary);
  box-shadow: 0 0 20px rgba(245, 158, 11, 0.5);
  animation: legendaryPulse 2s infinite;
}

@keyframes legendaryPulse {
  0%, 100% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.5); }
  50% { box-shadow: 0 0 30px rgba(245, 158, 11, 0.8); }
}

.shop-card:hover {
  transform: translateY(-5px) scale(1.05);
}

.card-icon {
  width: 100%;
  aspect-ratio: 1/1;
  border-radius: 6px;
  overflow: hidden;
  background: #0a0e27;
}

.card-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-name {
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.card-stats {
  font-size: 10px;
  color: var(--text-secondary);
  text-align: center;
}

.card-price {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-yang);
}

.shop-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
}

/* ==================== 棋盘区域 ==================== */
.board-area {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 95%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.enemy-board-section, .my-board-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.board-label {
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-muted);
}

.board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.board-cell {
  aspect-ratio: 3/4;
  background: rgba(26, 31, 58, 0.3);
  border: 2px dashed rgba(148, 163, 184, 0.3);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.board-card {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: var(--bg-card);
  border-radius: 6px;
  border: 2px solid var(--rarity-common);
}

.board-card.rarity-rare { border-color: var(--rarity-rare); }
.board-card.rarity-epic { border-color: var(--rarity-epic); }
.board-card.rarity-legendary { border-color: var(--rarity-legendary); }

/* 楚河汉界+倒计时 */
.battle-center-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
}

.battle-divider {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent-yang);
  text-shadow: 0 0 10px var(--accent-yang);
}

.battle-timer {
  font-size: 20px;
  font-weight: 700;
  color: var(--danger);
  text-shadow: 0 0 10px var(--danger);
  min-width: 60px;
  text-align: right;
}

/* ==================== 手牌区域 ==================== */
.hand-area {
  position: absolute;
  bottom: calc(var(--safe-bottom) + 120px);
  left: 0;
  width: 100%;
  z-index: 80;
}

.hand-label {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-secondary);
}

.hand {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 0 10px 10px;
  scrollbar-width: none;
}

.hand::-webkit-scrollbar {
  display: none;
}

.hand-cell {
  flex-shrink: 0;
  width: 80px;
  aspect-ratio: 3/4;
}

.hand-card {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px;
  background: var(--bg-card);
  border-radius: 8px;
  border: 2px solid var(--rarity-common);
  position: relative;
}

.hand-card.rarity-rare { border-color: var(--rarity-rare); }
.hand-card.rarity-epic { border-color: var(--rarity-epic); }
.hand-card.rarity-legendary { border-color: var(--rarity-legendary); }

.sell-btn {
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform

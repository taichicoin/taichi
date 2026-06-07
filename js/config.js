// ==================== YY Card 全局配置总纲（0-5索引版）====================
window.YYCardConfig = {
  // ==================== 核心项目配置 ====================
  SUPABASE_URL: 'https://kvflbfdqyehtlfmigaxa.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_1bva7rUXiEuVALlbklyW9w_ZqqCLfvQ',
  BASE_PATH: '/ycardy',
  LOGIN_PAGE_URL: 'https://taichicoin.xyz/ycardy/signup',
  DEFAULT_AVATAR: '/assets/default-avatar.png',
  CARD_ICON_BASE_PATH: '/assets/card/',

  // ==================== 账号系统配置 ====================
  RENAME_COOLDOWN_DAYS: 365,
  AVATAR_COOLDOWN_DAYS: 15,
  USERNAME_MIN_LENGTH: 1,
  USERNAME_MAX_LENGTH: 7,
  WALLET_ADDRESS_LENGTH: 42,

  // ==================== 匹配系统配置 ====================
  MAX_RETRY_COUNT: 3,
  MATCHMAKING_TIMEOUT_MS: 10000,
  MAX_PLAYERS_PER_ROOM: 8,
  INITIAL_MMR: 1000,

  // ==================== 对局基础配置 ====================
  INITIAL_HEALTH: 50,
  HAND_MAX_COUNT: 15,
  BOARD_MAX_COUNT: 6,
  MAX_SHOP_LEVEL: 5,

  // ==================== 回合时长配置 ====================
  ROUND_TIME: {
    PREPARE: {
      ROUND1: 27,
      BASE: 27,
      INCREMENT: 10
    },
    BATTLE: {
      ROUND1: 30,
      BASE: 30,
      INCREMENT: 5
    },
    BUFFER: 3
  },

  // ==================== 经济系统数值 ====================
  ECONOMY: {
    EXP_PER_ROUND: 2,
    GOLD_TO_EXP_RATE: 1,
    REFRESH_COST: 1,
    GOLD_PER_ROUND: (round) => {
      if (round === 1) return 1;
      if (round === 2) return 2;
      if (round === 3) return 4;
      if (round === 4) return 6;
      if (round === 5) return 8;
      if (round === 6) return 10;
      return 10 + (round - 6) * 2;
    },
    CARD_PRICE: {
      Common: { buy: 1, sell: 1 },
      Rare: { buy: 2, sell: 2 },
      Epic: { buy: 3, sell: 3 },
      Legendary: { buy: 4, sell: 4 }
    },
    SHOP_LEVEL_EXP: {
      1: 0,
      2: 4,
      3: 8,
      4: 14,
      5: 20
    },
    SHOP_CARD_COUNT: 3
  },

  // ==================== 商店稀有度概率表 ====================
  SHOP_RARITY_PROBABILITY: {
    1: { Common: 0.75, Rare: 0.25, Epic: 0, Legendary: 0 },
    2: { Common: 0.60, Rare: 0.35, Epic: 0.05, Legendary: 0 },
    3: { Common: 0.45, Rare: 0.40, Epic: 0.14, Legendary: 0.01 },
    4: { Common: 0.30, Rare: 0.40, Epic: 0.25, Legendary: 0.05 },
    5: { Common: 0.20, Rare: 0.35, Epic: 0.35, Legendary: 0.10 }
  },

  // ==================== 棋盘与战斗规则（0-5索引版） ====================
  BOARD: {
    POSITIONS: [0, 1, 2, 3, 4, 5],
    FRONT_ROW: [0, 1, 2],
    BACK_ROW: [3, 4, 5],
    ENEMY_PRIORITY: {
      0: [0, 1, 2, 3, 4, 5],
      1: [1, 0, 2, 3, 4, 5],
      2: [2, 1, 0, 5, 4, 3],
      3: [0, 1, 2, 3, 4, 5],
      4: [1, 0, 2, 3, 4, 5],
      5: [2, 1, 0, 5, 4, 3]
    }
  },

  BATTLE: {
    BASE_DAMAGE: 2,
    DAMAGE_PER_SURVIVAL: 1,
    ATTACK_INTERVAL_MS: 500,
  },

  // ==================== 全局枚举 ====================
  ROOM_STATUS: {
    WAITING: 'waiting',
    BATTLE: 'battle',
    FINISHED: 'finished'
  },
  GAME_PHASE: {
    PREPARE: 'prepare',
    BATTLE: 'battle',
    SETTLE: 'settle'
  },
  RARITY: {
    COMMON: 'Common',
    RARE: 'Rare',
    EPIC: 'Epic',
    LEGENDARY: 'Legendary'
  },
  RARITY_COLOR: {
    Common: '#94a3b8',
    Rare: '#22c55e',
    Epic: '#8b5cf6',
    Legendary: '#f59e0b'
  },
  CARD_CATEGORY: [
    '封神榜',
    '如有神助',
    '山海经',
    '西游',
    '三国',
    '中立'
  ]
};

// ==================== Supabase 客户端初始化 ====================
(function initSupabase() {
  if (typeof supabase === 'undefined' || !supabase.createClient) {
    console.error('❌ Supabase SDK 未加载');
    alert('游戏核心SDK加载失败，请刷新页面重试');
    return;
  }

  window.supabaseClient = supabase.createClient(
    window.YYCardConfig.SUPABASE_URL,
    window.YYCardConfig.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        redirectTo: window.YYCardConfig.LOGIN_PAGE_URL,
        storage: typeof window !== 'undefined' ? window.localStorage : null
      },
      global: {
        headers: {
          'X-Client-Info': 'YY-Card-Game/1.0'
        }
      }
    }
  );

  window.supabase = window.supabaseClient;

  console.log('✅ config.js 加载完成 (0-5索引版)');
  console.log('📦 部署路径：', window.YYCardConfig.BASE_PATH);
})();

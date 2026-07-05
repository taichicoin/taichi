// ==================== YY Card 全局配置总纲（0-5索引版）====================
window.YYCardConfig = {
  // ==================== 核心项目配置 ====================
  SUPABASE_URL: 'https://kvflbfdqyehtlfmigaxa.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_1bva7rUXiEuVALlbklyW9w_ZqqCLfvQ',
  BASE_PATH: '/ycardy',
  LOGIN_PAGE_URL: 'https://taichicoin.xyz/ycardy/',      // ← 改这里：指向 index.html
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
      INCREMENT: 7
    },
    BATTLE: {
      ROUND1: 30,
      BASE: 30,
      INCREMENT: 5
    },
    BUFFER: 4
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
    console.error('❌ Supabase SDK 未加载 (config.js 执行时不可用，将由页面主脚本处理)');
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

  console.log('✅ ');
  console.log('📦 部署路径：', window.YYCardConfig.BASE_PATH);
})();

// ==================== YY Card 全局配置总纲（最终版）====================
// 100%匹配设计文档所有规则、数值、路径，适配taichicoin.xyz部署环境
window.YYCardConfig = {
  // ==================== 核心项目配置（你的原有配置完整保留）====================
  SUPABASE_URL: 'https://sznjaotjoljaiawbvfro.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_iN3D88OfHeUre4ddCaDH7g_rlsQ8LGN',
  // 适配你的部署路径，登录页、资源路径统一收口
  BASE_PATH: '/yycard',
  LOGIN_PAGE_URL: 'https://taichicoin.xyz/yycard/signup',
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
  MATCHMAKING_TIMEOUT_MS: 60000, // 60秒超时填充人机
  MAX_PLAYERS_PER_ROOM: 8,
  INITIAL_MMR: 1000,

  // ==================== 对局基础配置 ====================
  INITIAL_HEALTH: 50, // 初始血量
  HAND_MAX_COUNT: 15, // 手牌上限
  BOARD_MAX_COUNT: 6, // 棋盘最大上阵数
  MAX_SHOP_LEVEL: 5, // 商店最高等级

  // ==================== 回合时长配置（严格匹配总纲公式）====================
  ROUND_TIME: {
    PREPARE: {
      ROUND1: 25,
      BASE: 25,
      INCREMENT: 10 // 第N回合：25 + (N-1)×10 秒
    },
    BATTLE: {
      ROUND1: 30,
      BASE: 30,
      INCREMENT: 5 // 第N回合：30 + (N-1)×5 秒
    },
    SETTLE: 3 // 固定3秒结算
  },

  // ==================== 经济系统数值（最终确认版）====================
  ECONOMY: {
    // 回合基础奖励
    EXP_PER_ROUND: 2, // 每回合固定+2经验
    GOLD_TO_EXP_RATE: 1, // 1金币=1经验
    REFRESH_COST: 1, // 商店刷新固定1金币
    // 回合金币发放规则
    GOLD_PER_ROUND: {
      1: 1,
      2: 2,
      3: 4,
      4: 6,
      5: 8,
      6: 10
    },
    GOLD_PER_ROUND_INCREMENT: 2, // 第6回合后每回合+2金币
    // 卡牌买卖价格
    CARD_PRICE: {
      Common: { buy: 1, sell: 1 },
      Rare: { buy: 2, sell: 2 },
      Epic: { buy: 3, sell: 3 },
      Legendary: { buy: 5, sell: 4 }
    },
    // 商店升级经验需求
    SHOP_LEVEL_EXP: {
      1: 0,
      2: 4,
      3: 8,
      4: 14,
      5: 20
    },
    // 单轮商店刷新卡牌数量
    SHOP_CARD_COUNT: 3
  },

  // ==================== 商店稀有度概率表（严格匹配总纲）====================
  SHOP_RARITY_PROBABILITY: {
    1: { Common: 0.75, Rare: 0.25, Epic: 0, Legendary: 0 },
    2: { Common: 0.60, Rare: 0.35, Epic: 0.05, Legendary: 0 },
    3: { Common: 0.45, Rare: 0.40, Epic: 0.14, Legendary: 0.01 },
    4: { Common: 0.30, Rare: 0.40, Epic: 0.25, Legendary: 0.05 },
    5: { Common: 0.20, Rare: 0.35, Epic: 0.35, Legendary: 0.10 }
  },

  // ==================== 棋盘与战斗规则（严格匹配总纲）====================
  BOARD: {
    // 位置编号：前排1-3，后排4-6
    POSITIONS: [1, 2, 3, 4, 5, 6],
    FRONT_ROW: [1, 2, 3],
    BACK_ROW: [4, 5, 6],
    // 寻敌优先级表（攻击位 → 敌方目标优先级顺序）
    ENEMY_PRIORITY: {
      1: [1, 2, 3, 4, 5, 6],
      2: [2, 1, 3, 4, 5, 6],
      3: [3, 2, 1, 6, 5, 4],
      4: [1, 2, 3, 4, 5, 6],
      5: [2, 1, 3, 4, 5, 6],
      6: [3, 2, 1, 6, 5, 4]
    }
  },

  // 战斗核心规则
  BATTLE: {
    BASE_DAMAGE: 2, // 基础扣血
    DAMAGE_PER_SURVIVAL: 1, // 每个存活单位额外+1伤害
    ATTACK_INTERVAL_MS: 500, // 攻击动画间隔（毫秒）
  },

  // ==================== 全局枚举 ====================
  // 房间状态
  ROOM_STATUS: {
    WAITING: 'waiting',
    BATTLE: 'battle',
    FINISHED: 'finished'
  },
  // 游戏阶段
  GAME_PHASE: {
    PREPARE: 'prepare',
    BATTLE: 'battle',
    SETTLE: 'settle'
  },
  // 卡牌稀有度
  RARITY: {
    COMMON: 'Common',
    RARE: 'Rare',
    EPIC: 'Epic',
    LEGENDARY: 'Legendary'
  },
  // 稀有度对应配色
  RARITY_COLOR: {
    Common: '#94a3b8',
    Rare: '#22c55e',
    Epic: '#8b5cf6',
    Legendary: '#f59e0b'
  },
  // 卡牌分类
  CARD_CATEGORY: [
    '封神榜',
    '如有神助',
    '山海经',
    '西游',
    '三国',
    '中立'
  ]
};

// ==================== Supabase 客户端初始化（优化容错版）====================
(function initSupabase() {
  // 兜底：SDK未加载时的错误处理
  if (typeof supabase === 'undefined' || !supabase.createClient) {
    console.error('❌ Supabase SDK 未加载，请检查CDN网络');
    alert('游戏核心SDK加载失败，请刷新页面重试');
    return;
  }

  // 初始化客户端，优化适配DApp浏览器环境
  window.supabaseClient = supabase.createClient(
    window.YYCardConfig.SUPABASE_URL,
    window.YYCardConfig.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // 适配你的登录重定向
        redirectTo: window.YYCardConfig.LOGIN_PAGE_URL,
        // 适配DApp浏览器的storage
        storage: typeof window !== 'undefined' ? window.localStorage : null
      },
      global: {
        headers: {
          'X-Client-Info': 'YY-Card-Game/1.0'
        }
      }
    }
  );

  // 兼容旧代码的全局引用
  window.supabase = window.supabaseClient;

  // 初始化成功日志
  console.log('✅ config.js 加载完成 | Supabase 客户端初始化成功');
  console.log('📦 游戏配置已生效，部署路径：', window.YYCardConfig.BASE_PATH);
})();

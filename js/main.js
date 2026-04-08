// 全局数据
let allCards = [];
let allSkillsMeta = [];
let allBonds = [];

let currentGold = 2;
let currentTurn = 1;
let cardSaveData = {};

// 游戏核心血量
let playerTotalHp = 30;
let enemyTotalHp = 30;

// 攻击优先级表（完全按你固化规则）
const attackPriority = {
  1: [1,2,3,4,5,6],
  2: [2,1,3,4,5,6],
  3: [3,2,1,6,5,4],
  4: [1,2,3,4,5,6],
  5: [2,1,3,4,5,6],
  6: [3,2,1,6,5,4]
};

// 所有阵营技能（合并）
const allSkillFunctions = {
  ...ShanHaiJingSkills,
  ...XiYouSkills,
  ...SanGuoSkills,
  ...FengShenSkills
};

// 页面完全加载后再执行所有逻辑
window.addEventListener('load', async () => {
  console.log('🚀 游戏启动，开始加载数据...');
  try {
    await loadAllConfig();
    // 确保DOM完全渲染后再初始化
    setTimeout(() => {
      initGame();
      console.log('✅ 游戏初始化完成');
    }, 100);
  } catch (e) {
    console.error('❌ 游戏启动失败:', e);
    alert(`游戏启动失败: ${e.message}\n请检查JSON文件路径和语法`);
  }
});

// 加载所有配置JSON（加完整错误捕获）
async function loadAllConfig() {
  try {
    const [cardRes, skillRes, bondRes] = await Promise.all([
      fetch('config/card.json'),
      fetch('config/skill.json'),
      fetch('config/bond.json')
    ]);

    // 检查HTTP状态
    if (!cardRes.ok) throw new Error(`card.json 加载失败 (${cardRes.status})`);
    if (!skillRes.ok) throw new Error(`skill.json 加载失败 (${skillRes.status})`);
    if (!bondRes.ok) throw new Error(`bond.json 加载失败 (${bondRes.status})`);

    // 解析JSON
    allCards = await cardRes.json();
    allSkillsMeta = await skillRes.json();
    allBonds = await bondRes.json();

    console.log('✅ 数据加载完成:', {
      卡牌数: allCards.length,
      技能数: allSkillsMeta.length,
      羁绊数: allBonds.length
    });

    if (allCards.length === 0) throw new Error('card.json 为空，没有卡牌数据');
  } catch (err) {
    console.error('❌ JSON加载错误:', err);
    throw err; // 向上抛出，终止启动
  }
}

// 初始化游戏
function initGame() {
  // 先刷新商店
  refreshShop();
  // 绑定所有按钮事件
  bindEvents();
  // 初始化拖拽系统
  initDrag();
  // 更新UI
  updateHpUI();
  updateGoldUI();
  updateTurnUI();
}

// ======================
// 刷新商店（完全适配你的CSS）
// ======================
function refreshShop() {
  const shopContainer = document.getElementById('shop-cards');
  if (!shopContainer) {
    console.error('❌ 找不到商店容器 #shop-cards');
    return;
  }

  shopContainer.innerHTML = ''; // 清空旧内容

  if (!allCards || allCards.length === 0) {
    shopContainer.innerHTML = '<p style="color:red; text-align:center; padding:10px;">商店加载失败：卡牌数据为空</p>';
    return;
  }

  // 随机抽5张卡牌
  const shopPool = [...allCards]
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);

  console.log('🎲 本次商店刷新卡牌:', shopPool.map(c => c.name));

  // 生成商店卡牌（完全匹配你的CSS类名）
  shopPool.forEach(card => {
    // 卡牌外层包装（用于放费用）
    const cardWrapper = document.createElement('div');
    cardWrapper.className = 'card-wrapper';

    // 卡牌本体
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.draggable = true; // 可拖拽

    // 存储卡牌所有数据（用于拖拽、战斗）
    cardEl.dataset.id = card.id;
    cardEl.dataset.name = card.name;
    cardEl.dataset.atk = card.baseAttack;
    cardEl.dataset.hp = card.baseHp;
    cardEl.dataset.faction = card.faction;
    cardEl.dataset.skill = card.skillId;
    cardEl.dataset.cost = card.cost;
    cardEl.dataset.img = card.cardImage;

    // 卡牌内部HTML（图片+攻防）
    cardEl.innerHTML = `
      <img src="${card.cardImage}" alt="${card.name}" onerror="this.src='assets/card/default.jpg'">
      <div class="card-stat">
        <span class="atk-red">${card.baseAttack}</span>
        <span style="margin:0 2px;">/</span>
        <span class="hp-green">${card.baseHp}</span>
      </div>
    `;

    // 费用标签（你的CSS类名）
    const costEl = document.createElement('div');
    costEl.className = 'card-cost-external';
    costEl.textContent = card.cost;

    // 组装
    cardWrapper.appendChild(cardEl);
    cardWrapper.appendChild(costEl);
    shopContainer.appendChild(cardWrapper);
  });

  updateGoldUI();
}

// ======================
// 绑定所有按钮事件（核心修复：确保按钮存在再绑定）
// ======================
function bindEvents() {
  // 下回合按钮
  const nextTurnBtn = document.getElementById('next-turn-btn');
  if (nextTurnBtn) {
    nextTurnBtn.addEventListener('click', nextTurn);
    console.log('✅ 绑定下回合按钮');
  } else {
    console.error('❌ 找不到下回合按钮 #next-turn-btn');
  }

  // 刷新商店按钮
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (currentGold >= 1) {
        currentGold--;
        refreshShop();
        updateGoldUI();
      } else {
        alert('金币不足！');
      }
    });
    console.log('✅ 绑定刷新按钮');
  } else {
    console.error('❌ 找不到刷新按钮 #refresh-btn');
  }

  // 开始对战按钮（核心修复）
  const battleBtn = document.getElementById('battle-btn');
  if (battleBtn) {
    battleBtn.addEventListener('click', startBattle);
    console.log('✅ 绑定开始对战按钮');
  } else {
    console.error('❌ 找不到开始对战按钮 #battle-btn');
  }
}

// ======================
// 下一回合逻辑
// ======================
function nextTurn() {
  currentTurn++;
  currentGold += 2; // 每回合+2金币
  updateTurnUI();
  updateGoldUI();
  refreshShop(); // 刷新商店
  addLog(`✅ 第${currentTurn}回合开始，金币+2`);
}

// ======================
// 核心：开始对战（完整逻辑）
// ======================
function startBattle() {
  console.log('⚔️ 开始对战');
  // 1. 获取我方上阵的6张卡牌
  const playerCards = getPlayerBattleCards();
  const alivePlayerCount = playerCards.filter(c => c && c.alive).length;

  if (alivePlayerCount === 0) {
    addLog('❌ 请先上阵卡牌再开始对战！');
    alert('请先从商店拖拽卡牌到你的卡组格子里！');
    return;
  }

  // 2. 生成敌方6张随机属性卡牌
  const enemyCards = generateEnemyCards();
  addLog(`==== 第${currentTurn}回合 对战开始 ====`);
  addLog(`我方上阵${alivePlayerCount}张卡，敌方生成6张随机卡`);

  // 3. 执行完整多回合战斗
  const battleResult = doFullBattle(playerCards, enemyCards);

  // 4. 结算扣血（完全按你的规则：基础2+存活数）
  settleBattleResult(battleResult);

  // 5. 检查游戏是否结束
  checkGameOver();
}

// ======================
// 获取我方上阵卡牌（从格子里读）
// ======================
function getPlayerBattleCards() {
  const slots = document.querySelectorAll('.grid-slot');
  const playerCards = [];

  slots.forEach((slot, index) => {
    const cardEl = slot.querySelector('.card');
    if (!cardEl) {
      // 空格子，存null
      playerCards[index] = null;
      return;
    }

    // 从卡牌dataset读数据
    const baseAtk = Number(cardEl.dataset.atk) || 0;
    const baseHp = Number(cardEl.dataset.hp) || 0;

    // 初始化卡牌战斗数据
    playerCards[index] = {
      pos: index + 1, // 号位1-6
      baseAtk: baseAtk,
      baseHp: baseHp,
      currentAtk: baseAtk, // 最终攻击（后续加buff）
      currentHp: baseHp, // 当前生命
      maxHp: baseHp, // 最大生命
      alive: true // 是否存活
    };
  });

  return playerCards;
}

// ======================
// 生成敌方6张随机卡牌
// ======================
function generateEnemyCards() {
  const enemyCards = [];
  for (let i = 0; i < 6; i++) {
    // 随机属性：攻击3-8，生命4-12
    const randomAtk = Math.floor(Math.random() * 6) + 3;
    const randomHp = Math.floor(Math.random() * 9) + 4;

    enemyCards[i] = {
      pos: i + 1,
      baseAtk: randomAtk,
      baseHp: randomHp,
      currentAtk: randomAtk,
      currentHp: randomHp,
      maxHp: randomHp,
      alive: true
    };
  }

  return enemyCards;
}

// ======================
// 完整多回合战斗流程（按你的攻击顺序）
// ======================
function doFullBattle(player, enemy) {
  let round = 1;
  const MAX_ROUND = 20; // 防止死循环

  while (true) {
    addLog(`--- 战斗第${round}回合 ---`);

    // 1. 我方按1-6号位依次攻击
    for (let i = 0; i < 6; i++) {
      const attacker = player[i];
      if (!attacker || !attacker.alive) continue; // 跳过空/死亡卡牌

      // 按号位找第一个存活目标
      const target = findFirstAlive(enemy, attackPriority[attacker.pos]);
      if (!target) continue; // 没目标跳过

      // 执行伤害：攻击=扣血
      const damage = attacker.currentAtk;
      target.currentHp -= damage;
      addLog(`我方${attacker.pos}号位 攻击 敌方${target.pos}号位，造成${damage}点伤害`);

      // 检查是否击杀
      if (target.currentHp <= 0) {
        target.alive = false;
        addLog(`✅ 敌方${target.pos}号位被击杀！`);
      }
    }

    // 2. 检查敌方是否全灭
    const enemyAllDead = enemy.every(c => !c || !c.alive);
    if (enemyAllDead) {
      const aliveCount = player.filter(c => c && c.alive).length;
      addLog(`🏆 本回合我方获胜！剩余${aliveCount}张存活卡牌`);
      return { winner: 'player', aliveCount: aliveCount };
    }

    // 3. 敌方按1-6号位依次攻击
    for (let i = 0; i < 6; i++) {
      const attacker = enemy[i];
      if (!attacker || !attacker.alive) continue;

      // 按号位找第一个存活目标
      const target = findFirstAlive(player, attackPriority[attacker.pos]);
      if (!target) continue;

      // 执行伤害
      const damage = attacker.currentAtk;
      target.currentHp -= damage;
      addLog(`敌方${attacker.pos}号位 攻击 我方${target.pos}号位，造成${damage}点伤害`);

      // 检查击杀
      if (target.currentHp <= 0) {
        target.alive = false;
        addLog(`❌ 我方${target.pos}号位被击杀！`);
      }
    }

    // 4. 检查我方是否全灭
    const playerAllDead = player.every(c => !c || !c.alive);
    if (playerAllDead) {
      const aliveCount = enemy.filter(c => c && c.alive).length;
      addLog(`💀 本回合我方失败！敌方剩余${aliveCount}张存活卡牌`);
      return { winner: 'enemy', aliveCount: aliveCount };
    }

    // 5. 回合数+1，超过20回合强制结束（平局）
    round++;
    if (round > MAX_ROUND) {
      addLog(`⚠️ 战斗超过${MAX_ROUND}回合，强制平局`);
      return { winner: 'draw', aliveCount: 0 };
    }
  }
}

// ======================
// 按优先级找第一个存活目标
// ======================
function findFirstAlive(team, priority) {
  for (const pos of priority) {
    const card = team[pos - 1]; // 数组0-5对应号位1-6
    if (card && card.alive) return card;
  }
  return null; // 无存活目标
}

// ======================
// 对战结算：扣血规则（完全按你的要求）
// ======================
function settleBattleResult(result) {
  const BASE_DAMAGE = 2; // 基础扣血2
  const extraDamage = result.aliveCount; // 额外扣血=存活数
  const totalDamage = BASE_DAMAGE + extraDamage;

  if (result.winner === 'player') {
    // 我方获胜，敌方扣血
    enemyTotalHp = Math.max(0, enemyTotalHp - totalDamage);
    addLog(`✅ 敌方总血量-${totalDamage}（基础${BASE_DAMAGE}+额外${extraDamage}），剩余${enemyTotalHp}`);
  } else if (result.winner === 'enemy') {
    // 我方失败，我方扣血
    playerTotalHp = Math.max(0, playerTotalHp - totalDamage);
    addLog(`❌ 我方总血量-${totalDamage}（基础${BASE_DAMAGE}+额外${extraDamage}），剩余${playerTotalHp}`);
  } else if (result.winner === 'draw') {
    addLog(`⚖️ 本回合平局，双方不扣血`);
  }

  // 更新血量UI
  updateHpUI();
}

// ======================
// 游戏结束判断
// ======================
function checkGameOver() {
  if (enemyTotalHp <= 0) {
    addLog(`🎉 恭喜！敌方总血量归零，你赢得了整局游戏！`);
    alert('🎉 游戏胜利！');
    disableAllButtons();
  } else if (playerTotalHp <= 0) {
    addLog(`💀 我方总血量归零，游戏失败！`);
    alert('💀 游戏失败！');
    disableAllButtons();
  }
}

// ======================
// 工具函数：UI更新
// ======================
function addLog(text) {
  const logEl = document.getElementById('log-text');
  if (!logEl) return;

  const newLog = document.createElement('div');
  newLog.textContent = text;
  logEl.appendChild(newLog);
  // 自动滚动到底部
  logEl.scrollTop = logEl.scrollHeight;
}

function updateHpUI() {
  const playerHpEl = document.getElementById('player-hp');
  const enemyHpEl = document.getElementById('enemy-hp');
  if (playerHpEl) playerHpEl.textContent = playerTotalHp;
  if (enemyHpEl) enemyHpEl.textContent = enemyTotalHp;
}

function updateGoldUI() {
  const goldEl = document.getElementById('current-gold');
  if (goldEl) goldEl.textContent = currentGold;
}

function updateTurnUI() {
  const turnEl = document.getElementById('current-turn');
  if (turnEl) turnEl.textContent = currentTurn;
}

function disableAllButtons() {
  const buttons = document.querySelectorAll('button');
  buttons.forEach(btn => btn.disabled = true);
}

// ======================
// 拖拽系统（核心修复：实现商店→格子的复制拖拽）
// ======================
function initDrag() {
  const previewEl = document.getElementById('drag-preview');
  let draggingCard = null;
  let draggingWrapper = null;

  // 拖拽开始
  document.addEventListener('dragstart', (e) => {
    const cardEl = e.target.closest('.card');
    if (!cardEl) return;

    // 记录拖拽的卡牌
    draggingCard = cardEl;
    draggingWrapper = cardEl.closest('.card-wrapper');

    // 添加拖拽样式
    cardEl.classList.add('dragging-source');

    // 显示拖拽预览
    previewEl.style.display = 'block';
    previewEl.innerHTML = cardEl.innerHTML;
    previewEl.style.width = cardEl.offsetWidth + 'px';
    previewEl.style.height = cardEl.offsetHeight + 'px';
    previewEl.style.left = e.clientX - cardEl.offsetWidth / 2 + 'px';
    previewEl.style.top = e.clientY - cardEl.offsetHeight / 2 + 'px';

    // 设置拖拽数据
    e.dataTransfer.setData('text/plain', JSON.stringify({
      id: cardEl.dataset.id,
      atk: cardEl.dataset.atk,
      hp: cardEl.dataset.hp,
      faction: cardEl.dataset.faction,
      skill: cardEl.dataset.skill,
      img: cardEl.dataset.img,
      name: cardEl.dataset.name,
      cost: cardEl.dataset.cost
    }));
  });

  // 拖拽过程中更新预览位置
  document.addEventListener('dragover', (e) => {
    e.preventDefault(); // 必须阻止默认行为，才能触发drop
    if (previewEl && draggingCard) {
      previewEl.style.left = e.clientX - draggingCard.offsetWidth / 2 + 'px';
      previewEl.style.top = e.clientY - draggingCard.offsetHeight / 2 + 'px';
    }
  });

  // 拖拽结束
  document.addEventListener('dragend', (e) => {
    if (draggingCard) {
      draggingCard.classList.remove('dragging-source');
    }
    draggingCard = null;
    draggingWrapper = null;
    if (previewEl) previewEl.style.display = 'none';
  });

  // 放置到格子
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const slot = e.target.closest('.grid-slot');
    if (!slot || !draggingCard) return;

    // 读取拖拽数据
    const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));

    // 检查格子里是否已有卡牌
    const existingCard = slot.querySelector('.card');
    if (existingCard) {
      // 交换卡牌（可选，这里直接替换）
      slot.removeChild(existingCard);
    }

    // 创建新的卡牌元素（复制，不是移动，商店里的卡保留）
    const newCardEl = document.createElement('div');
    newCardEl.className = 'card';
    newCardEl.draggable = true;
    newCardEl.dataset.id = dragData.id;
    newCardEl.dataset.atk = dragData.atk;
    newCardEl.dataset.hp = dragData.hp;
    newCardEl.dataset.faction = dragData.faction;
    newCardEl.dataset.skill = dragData.skill;
    newCardEl.dataset.img = dragData.img;
    newCardEl.dataset.name = dragData.name;

    newCardEl.innerHTML = `
      <img src="${dragData.img}" alt="${dragData.name}" onerror="this.src='assets/card/default.jpg'">
      <div class="card-stat">
        <span class="atk-red">${dragData.atk}</span>
        <span style="margin:0 2px;">/</span>
        <span class="hp-green">${dragData.hp}</span>
      </div>
    `;

    // 把新卡牌放到格子里
    slot.appendChild(newCardEl);
    addLog(`✅ 成功上阵 ${dragData.name}`);
  });
}

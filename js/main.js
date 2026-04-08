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

// 所有阵营技能
const allSkillFunctions = {
  ...ShanHaiJingSkills,
  ...XiYouSkills,
  ...SanGuoSkills,
  ...FengShenSkills
};

window.onload = async () => {
  try {
    await loadAllConfig();
    initGame();
  } catch (e) {
    console.error("游戏启动失败", e);
  }
};

// 加载配置
async function loadAllConfig() {
  const [c, s, b] = await Promise.all([
    fetch("config/card.json").then(r => r.json()),
    fetch("config/skill.json").then(r => r.json()),
    fetch("config/bond.json").then(r => r.json())
  ]);
  allCards = c;
  allSkillsMeta = s;
  allBonds = b;
}

// 初始化
function initGame() {
  refreshShop();
  bindEvents();
  initDrag();
  updateHpUI();
}

// 刷新商店
function refreshShop() {
  const shop = document.getElementById("shop-cards");
  shop.innerHTML = "";
  if (!allCards.length) return;
  const pool = [...allCards].sort(() => Math.random() - 0.5).slice(0,5);
  pool.forEach(card => {
    const wrap = document.createElement("div");
    wrap.className = "card-wrapper";
    const el = document.createElement("div");
    el.className = "card";
    el.draggable = true;
    el.dataset.id = card.id;
    el.dataset.atk = card.baseAttack;
    el.dataset.hp = card.baseHp;
    el.dataset.faction = card.faction;
    el.dataset.skill = card.skillId;
    el.dataset.cost = card.cost;
    el.innerHTML = `
      <img src="${card.cardImage}" alt="">
      <div class="card-stat">
        <span class="atk-red">${card.baseAttack}</span>/<span class="hp-green">${card.baseHp}</span>
      </div>
    `;
    const cost = document.createElement("div");
    cost.className = "card-cost-external";
    cost.innerText = card.cost;
    wrap.appendChild(el);
    wrap.appendChild(cost);
    shop.appendChild(wrap);
  });
  updateGoldUI();
}

// 绑定事件
function bindEvents() {
  document.getElementById("next-turn-btn").onclick = nextTurn;
  document.getElementById("refresh-btn").onclick = () => {
    if (currentGold >=1) { currentGold--; refreshShop(); }
  };
  document.getElementById("battle-btn").onclick = startBattle;
}

// 下一回合
function nextTurn() {
  currentTurn++;
  currentGold += 2;
  updateTurnUI();
  updateGoldUI();
  refreshShop();
}

// ======================
// 核心：开始对战
// ======================
function startBattle() {
  // 1. 获取我方场上6张卡
  const playerCards = getPlayerBattleCards();
  if (playerCards.filter(c => c).length === 0) {
    addLog("请先上阵卡牌再对战！");
    return;
  }

  // 2. 生成敌方随机6张卡
  const enemyCards = generateEnemyCards();
  addLog(`==== 第${currentTurn}回合对战开始 ====`);

  // 3. 执行完整战斗
  const battleResult = doFullBattle(playerCards, enemyCards);

  // 4. 扣血结算
  settleBattleResult(battleResult);

  // 5. 判断游戏是否结束
  checkGameOver();
}

// 获取我方上阵卡牌
function getPlayerBattleCards() {
  const slots = document.querySelectorAll(".grid-slot");
  const res = [];
  slots.forEach((slot, idx) => {
    const cardEl = slot.querySelector(".card");
    if (!cardEl) {
      res[idx] = null;
      return;
    }
    res[idx] = {
      pos: idx+1,
      atk: Number(cardEl.dataset.atk),
      hp: Number(cardEl.dataset.hp),
      maxHp: Number(cardEl.dataset.hp),
      alive: true
    };
  });
  return res;
}

// 生成敌方6张随机属性卡牌
function generateEnemyCards() {
  const res = [];
  for(let i=0;i<6;i++){
    const randomAtk = Math.floor(Math.random()*6)+3;
    const randomHp = Math.floor(Math.random()*8)+4;
    res[i] = {
      pos: i+1,
      atk: randomAtk,
      hp: randomHp,
      maxHp: randomHp,
      alive: true
    };
  }
  addLog(`敌方生成6张随机卡牌`);
  return res;
}

// ======================
// 完整战斗流程
// ======================
function doFullBattle(player, enemy) {
  let round = 1;
  // 双方按号位1-6依次攻击
  while(true){
    // 玩家方行动
    for(let i=0;i<6;i++){
      const c = player[i];
      if(!c || !c.alive) continue;
      const target = findFirstAlive(enemy, attackPriority[c.pos]);
      if(target){
        target.hp -= c.atk;
        if(target.hp <=0) target.alive = false;
        addLog(`玩家${c.pos}号位 攻击 敌方${target.pos}号位，造成${c.atk}伤害`);
      }
    }

    // 检查敌方是否全灭
    const enemyAllDead = enemy.every(c => !c || !c.alive);
    if(enemyAllDead) return { winner: "player", aliveCount: player.filter(c=>c&&c.alive).length };

    // 敌方行动
    for(let i=0;i<6;i++){
      const c = enemy[i];
      if(!c || !c.alive) continue;
      const target = findFirstAlive(player, attackPriority[c.pos]);
      if(target){
        target.hp -= c.atk;
        if(target.hp <=0) target.alive = false;
        addLog(`敌方${c.pos}号位 攻击 玩家${target.pos}号位，造成${c.atk}伤害`);
      }
    }

    // 检查玩家是否全灭
    const playerAllDead = player.every(c => !c || !c.alive);
    if(playerAllDead) return { winner: "enemy", aliveCount: enemy.filter(c=>c&&c.alive).length };

    round++;
    if(round>20) break; // 防止死循环
  }
  return { winner: "draw", aliveCount:0 };
}

// 寻找第一个存活目标
function findFirstAlive(team, priority) {
  for(let pos of priority){
    const c = team[pos-1];
    if(c && c.alive) return c;
  }
  return null;
}

// ======================
// 对战结算：扣血规则
// ======================
function settleBattleResult(result) {
  const baseDmg = 2;
  const extraDmg = result.aliveCount;
  const totalDmg = baseDmg + extraDmg;

  if(result.winner === "player"){
    enemyTotalHp = Math.max(0, enemyTotalHp - totalDmg);
    addLog(`✅ 本回合获胜！敌方扣${baseDmg}+${extraDmg}=${totalDmg}血`);
  }else if(result.winner === "enemy"){
    playerTotalHp = Math.max(0, playerTotalHp - totalDmg);
    addLog(`❌ 本回合失败！我方扣${baseDmg}+${extraDmg}=${totalDmg}血`);
  }
  updateHpUI();
}

// 游戏结束判断
function checkGameOver() {
  if(enemyTotalHp <=0){
    addLog(`🎉 恭喜！你击败了敌方，游戏胜利！`);
    disableAllBtn();
  }else if(playerTotalHp <=0){
    addLog(`💀 我方总血量归零，游戏失败！`);
    disableAllBtn();
  }
}

// ======================
// 工具函数
// ======================
function addLog(text) {
  const log = document.getElementById("log-text");
  log.innerHTML += `<br>${text}`;
  log.scrollTop = log.scrollHeight;
}

function updateHpUI() {
  document.getElementById("player-hp").innerText = playerTotalHp;
  document.getElementById("enemy-hp").innerText = enemyTotalHp;
}

function updateGoldUI() {
  document.getElementById("current-gold").innerText = currentGold;
}

function updateTurnUI() {
  document.getElementById("current-turn").innerText = currentTurn;
}

function disableAllBtn() {
  document.getElementById("battle-btn").disabled = true;
  document.getElementById("next-turn-btn").disabled = true;
  document.getElementById("refresh-btn").disabled = true;
}

// 拖拽基础
function initDrag() {
  const preview = document.getElementById("drag-preview");
  let dragging = null;
  document.addEventListener("dragstart", e => {
    if (e.target.classList.contains("card")) {
      dragging = e.target;
      e.target.classList.add("dragging-source");
      preview.style.display = "block";
    }
  });
  document.addEventListener("dragend", e => {
    if (dragging) dragging.classList.remove("dragging-source");
    dragging = null;
    preview.style.display = "none";
  });
  document.addEventListener("dragover", e => e.preventDefault());
  document.addEventListener("drop", e => {
    e.preventDefault();
    const slot = e.target.closest(".grid-slot");
    if(slot && dragging) slot.appendChild(dragging);
  });
}

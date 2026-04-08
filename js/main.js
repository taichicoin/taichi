let allCards = [];
let allSkillsMeta = [];
let allBonds = [];

let currentGold = 2;
let currentTurn = 1;
let cardSaveData = {};

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
    console.error("启动失败", e);
  }
};

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

function initGame() {
  refreshShop();
  bindEvents();
  initDrag();
}

// ======================
// 商店刷新（适配你的CSS）
// ======================
function refreshShop() {
  const shop = document.getElementById("shop-cards");
  shop.innerHTML = "";

  if (!allCards.length) return;

  const pool = [...allCards].sort(() => Math.random() - 0.5).slice(0, 5);

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
        <span class="atk-red">${card.baseAttack}</span>
        <span style="margin:0 2px">/</span>
        <span class="hp-green">${card.baseHp}</span>
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

function nextTurn() {
  currentTurn++;
  currentGold += 2;
  updateTurnUI();
  updateGoldUI();
  refreshShop();
}

function updateGoldUI() {
  document.getElementById("current-gold").innerText = currentGold;
}

function updateTurnUI() {
  document.getElementById("current-turn").innerText = currentTurn;
}

function bindEvents() {
  document.getElementById("next-turn-btn").onclick = nextTurn;
  document.getElementById("refresh-btn").onclick = () => {
    if (currentGold >= 1) {
      currentGold--;
      refreshShop();
    }
  };
}

// ======================
// 拖拽基础（防止报错）
// ======================
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
}

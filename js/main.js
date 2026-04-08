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
  await loadAllConfig();
  initGame();
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
}

function refreshShop() {
  const shop = document.getElementById("shop-cards");
  shop.innerHTML = "";
  const pool = [...allCards].sort(() => Math.random() - 0.5).slice(0, 5);
  pool.forEach(card => {
    const el = document.createElement("div");
    el.className = "shop-card";
    el.innerHTML = `
      <div class="card-name">${card.name}</div>
      <div class="cost">${card.cost}</div>
      <div class="faction">${card.faction}</div>
      <div class="stat">${card.baseAttack}/${card.baseHp}</div>
    `;
    shop.appendChild(el);
  });
  updateGoldUI();
}

function nextTurn() {
  currentTurn++;
  currentGold += 2;
  updateTurnUI();
  updateGoldUI();
  applyAllBuffs();
}

function applyAllBuffs() {
  const grids = getGridCards();
  grids.forEach(g => {
    if (!cardSaveData[g.saveKey]) cardSaveData[g.saveKey] = {
      bonusAtk: 0, bonusHp: 0, currentHp: g.baseHp
    };
    const s = cardSaveData[g.saveKey];
    s.currentHp = g.baseHp + s.bonusHp;
  });
}

function getGridCards() {
  return Array.from(document.querySelectorAll(".grid-slot .card")).map(el => ({
    id: el.dataset.id,
    baseAttack: el.dataset.atk,
    baseHp: el.dataset.hp,
    faction: el.dataset.faction,
    skillId: el.dataset.skill,
    el
  }));
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

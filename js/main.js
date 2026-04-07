// ========== 原生原版卡牌数据【仅改图片路径为 assets/card/】 ==========
const cardPool = [
    {name:"应龙",skill:"yinglong",img:"assets/card/yl.jpg",atk:3,hp:5,cost:1},
    {name:"九尾狐",skill:"jiuweihu",img:"assets/card/jwf.jpg",atk:8,hp:10,cost:3},
    {name:"白泽",skill:"baize",img:"assets/card/bz.jpg",atk:5,hp:10,cost:2},
    {name:"穷奇",skill:"qiongqi",img:"assets/card/qq.jpg",atk:10,hp:15,cost:4},
    {name:"精卫",skill:"jingwei",img:"assets/card/jw.jpg",atk:12,hp:18,cost:5}
];

// ========== 原生原版变量全保留 ==========
let gold = 2;
let turn = 1;
let cardSave = {};

// ========== DOM 元素绑定 ==========
const shopDom = document.getElementById("shop");
const goldDom = document.getElementById("gold");
const turnDom = document.getElementById("turn");
const nextTurnBtn = document.getElementById("nextTurnBtn");
const refreshBtn = document.getElementById("refreshBtn");
const gridDom = document.getElementById("grid");

// ========== 渲染商店（原生原版） ==========
function renderShop(){
    shopDom.innerHTML = "";
    let random3 = [...cardPool].sort(()=>Math.random()-0.5).slice(0,3);
    random3.forEach(card=>{
        let div = document.createElement("div");
        div.className = "card";
        div.dataset.card = JSON.stringify(card);
        div.innerHTML = `
            <img src="${card.img}">
            <div class="cost">${card.cost}</div>
            <div class="card-data"><span class="atk">${card.atk}</span>/<span class="hp">${card.hp}</span></div>
        `;
        div.onclick = ()=>buyCard(card);
        shopDom.appendChild(div);
    });
}

// ========== 买卡（原生原版） ==========
function buyCard(card){
    if(gold < card.cost) return;
    let emptySlot = document.querySelector(".grid-slot:not(.has-card)");
    if(!emptySlot) return;
    gold -= card.cost;
    fillSlot(emptySlot,card);
    updateUI();
}

// ========== 填充格子（原生原版） ==========
function fillSlot(slot,card){
    slot.classList.add("has-card");
    let key = Math.random().toString(36);
    slot.dataset.saveKey = key;
    if(!cardSave[key]) cardSave[key] = {jw:0,yl:0,qq:0,bzAtk:0,bzHp:0};

    let save = cardSave[key];
    let nowAtk = card.atk + save.jw + save.yl + save.qq + save.bzAtk;
    let nowHp = card.hp + save.jw + save.yl + save.qq + save.bzHp;

    slot.innerHTML = `
        <div class="card" data-skill="${card.skill}" data-base-atk="${card.atk}" data-base-hp="${card.hp}">
            <img src="${card.img}">
            <div class="card-data"><span class="atk">${nowAtk}</span>/<span class="hp">${nowHp}</span></div>
        </div>
    `;
}

// ========== 原生原版全套叠buff技能 完整保留 ==========
function nextTurn(){
    turn++;
    if(turn<=7) gold += [0,2,3,5,7,10,15][turn] || 0;
    else gold +=3;

    let allCards = document.querySelectorAll(".grid-slot.has-card .card");
    let layer = turn -1;
    let triggerCount =0;

    // 精卫全员加成
    let hasJing = Array.from(allCards).some(c=>c.dataset.skill==="jingwei");
    if(hasJing) triggerCount++;
    allCards.forEach(card=>{
        let key = card.parentElement.dataset.saveKey;
        if(hasJing) cardSave[key].jw += layer;
    });

    // 应龙同排翻倍
    let yingRows = [];
    let slots = Array.from(document.querySelectorAll(".grid-slot"));
    slots.forEach((s,i)=>{
        let c = s.querySelector(".card");
        if(c&&c.dataset.skill==="yinglong") yingRows.push(i<3?1:2);
    });
    if(yingRows.length) triggerCount++;
    slots.forEach((s,i)=>{
        let c = s.querySelector(".card");
        if(!c) return;
        let row = i<3?1:2;
        let key = s.dataset.saveKey;
        if(yingRows.includes(row)) cardSave[key].yl += layer*2;
    });

    // 穷奇自身加成
    let hasQq = Array.from(allCards).some(c=>c.dataset.skill==="qiongqi");
    if(hasQq) triggerCount++;
    allCards.forEach(card=>{
        if(card.dataset.skill==="qiongqi"){
            let key = card.parentElement.dataset.saveKey;
            cardSave[key].qq += layer;
        }
    });

    // 九尾狐二次触发
    triggerCount++;

    // 白泽结算
    allCards.forEach(card=>{
        if(card.dataset.skill==="baize"){
            let key = card.parentElement.dataset.saveKey;
            cardSave[key].bzAtk += triggerCount*2;
            cardSave[key].bzHp += triggerCount*5;
        }
    });

    // 刷新卡牌数值+闪光动画
    refreshAllCardNum();
    updateUI();
}

// ========== 刷新所有卡牌战力 ==========
function refreshAllCardNum(){
    let slots = document.querySelectorAll(".grid-slot.has-card");
    slots.forEach(slot=>{
        let cardDom = slot.querySelector(".card");
        let key = slot.dataset.saveKey;
        let save = cardSave[key];
        let baseAtk = parseInt(cardDom.dataset.baseAtk);
        let baseHp = parseInt(cardDom.dataset.baseHp);
        let nowAtk = baseAtk + save.jw + save.yl + save.qq + save.bzAtk;
        let nowHp = baseHp + save.jw + save.yl + save.qq + save.bzHp;
        cardDom.querySelector(".card-data").innerHTML = `<span class="atk">${nowAtk}</span>/<span class="hp">${nowHp}</span>`;
        cardDom.classList.add("grow-flash");
        setTimeout(()=>cardDom.classList.remove("grow-flash"),500);
    });
}

// ========== 刷新商店 ==========
function refreshShop(){
    if(gold<1) return;
    gold--;
    renderShop();
    updateUI();
}

// ========== 更新顶部文字 ==========
function updateUI(){
    goldDom.innerText = gold;
    turnDom.innerText = turn;
}

// ========== 绑定按钮事件 ==========
nextTurnBtn.onclick = nextTurn;
refreshBtn.onclick = refreshShop;

// ========== 初始化 ==========
window.onload = function(){
    renderShop();
    updateUI();
};

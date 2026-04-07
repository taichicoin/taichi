// 图片已自动改成 assets/card/ 不影响显示
const allCardsData = [
  {id:1,name:"Ying Dragon",skill:"yinglong",image:"assets/card/yl.jpg",baseAtk:3,baseHp:5,cost:1},
  {id:2,name:"Nine-Tailed Fox",skill:"jiuweihu",image:"assets/card/jwf.jpg",baseAtk:8,baseHp:10,cost:3},
  {id:3,name:"Bai Ze",skill:"baize",image:"assets/card/bz.jpg",baseAtk:5,baseHp:10,cost:2},
  {id:4,name:"Qiong Qi",skill:"qiongqi",image:"assets/card/qq.jpg",baseAtk:10,baseHp:15,cost:4},
  {id:5,name:"Jingwei",skill:"jingwei",image:"assets/card/jw.jpg",baseAtk:12,baseHp:18,cost:5}
];

let currentGold=2,currentTurn=1,isNextTurnDisabled=false;
let cardSaveData = {};
let isDragging = false, draggedCard = null, draggedFromSlot = null, draggedElement = null, shopBottom = 0;

const turnGoldOriginal = [0,2,3,5,7,10,15];
const goldAfterSeven = turnGoldOriginal[6] + 3;

const shopArea = document.getElementById("shop-cards");
const cardGrid = document.getElementById("card-grid");
const dragPreview = document.getElementById("drag-preview");

function getGridCards(){
  const slots = Array.from(document.querySelectorAll(".grid-slot"));
  let list = [];
  slots.forEach((slot,idx)=>{
    const card = slot.querySelector(".card");
    let row = idx < 3 ? 1 : 2;
    if(card){
      list.push({
        idx,row,slot,el:card,
        id:parseInt(card.dataset.cardId),
        skill:card.dataset.skill,
        baseAtk:parseInt(card.dataset.baseAtk),
        baseHp:parseInt(card.dataset.baseHp),
        saveKey: slot.dataset.saveKey
      });
    }
  });
  return list;
}

function refreshShopOnly(){
  shopArea.innerHTML="";
  const sel=[...allCardsData].sort(()=>Math.random()-0.5).slice(0,3);
  sel.forEach(card=>{
    const wrap=document.createElement("div");wrap.className="card-wrapper";
    const el=document.createElement("div");el.className="card";
    el.dataset.cardId = card.id;
    el.dataset.cardName = card.name;
    el.dataset.skill = card.skill;
    el.dataset.image = card.image;
    el.dataset.baseAtk = card.baseAtk;
    el.dataset.baseHp = card.baseHp;
    el.dataset.cost = card.cost;
    if(currentGold<card.cost) el.classList.add("insufficient-funds");
    el.innerHTML=`<img src="${card.image}"><div class="card-stat"><span class="atk-red">${card.baseAtk}</span>/<span class="hp-green">${card.baseHp}</span></div>`;
    const c=document.createElement("div");c.className="card-cost-external";c.innerText=card.cost;
    wrap.append(el,c);shopArea.appendChild(wrap);
    el.addEventListener("touchstart",(e)=>{
      if(currentGold<card.cost) return;
      e.preventDefault();
      const cd={id:card.id,name:card.name,skill:card.skill,image:card.image,baseAtk:card.baseAtk,baseHp:card.baseHp,cost:card.cost};
      startDrag(e.touches[0],cd,null,el);
    });
  });
  shopBottom = shopArea.getBoundingClientRect().bottom;
  updateButtonStates();
}

function createDeckCard(slot, cardData){
  let key = slot.dataset.saveKey || Math.random().toString(36);
  slot.dataset.saveKey = key;
  if(!cardSaveData[key]) cardSaveData[key]={jing:0,ying:0,qiong:0,baizeAtk:0,baizeHp:0};
  let g=cardSaveData[key];
  let atk=cardData.baseAtk+g.jing+g.ying+g.qiong+g.baizeAtk;
  let hp=cardData.baseHp+g.jing+g.ying+g.qiong+g.baizeHp;

  slot.innerHTML="";
  let d=document.createElement("div");
  d.className="card";
  d.dataset.cardId=cardData.id;
  d.dataset.skill=cardData.skill;
  d.dataset.baseAtk=cardData.baseAtk;
  d.dataset.baseHp=cardData.baseHp;
  d.innerHTML=`<img src="${cardData.image}"><div class="card-stat"><span class="atk-red">${atk}</span>/<span class="hp-green">${hp}</span></div>`;
  d.addEventListener("touchstart",e=>{
    e.preventDefault();
    let cd={id:cardData.id,skill:cardData.skill,image:cardData.image,baseAtk:cardData.baseAtk,baseHp:cardData.baseHp,cost:cardData.cost};
    startDrag(e.touches[0],cd,slot,d);
  });
  slot.appendChild(d);
}

function updateCardStatsVisual(){
  const grids=getGridCards();
  const layer=currentTurn-1;
  let totalTriggerCount = 0;

  const hasJing = grids.some(x=>x.skill==="jingwei");
  if(hasJing) totalTriggerCount++;
  grids.forEach(g=>{
    let s=cardSaveData[g.saveKey];
    if(!s) return;
    if(hasJing) s.jing += layer;
  });

  const yingRows = grids.filter(x=>x.skill==="yinglong").map(x=>x.row);
  if(yingRows.length>0) totalTriggerCount++;
  grids.forEach(g=>{
    let s=cardSaveData[g.saveKey];
    if(!s) return;
    if(yingRows.includes(g.row)) s.ying += layer*2;
  });

  const hasQiong = grids.some(x=>x.skill==="qiongqi");
  if(hasQiong) totalTriggerCount++;
  grids.forEach(g=>{
    let s=cardSaveData[g.saveKey];
    if(!s) return;
    if(g.skill==="qiongqi") s.qiong += layer;
  });

  grids.forEach(fox=>{
    if(fox.skill==="jiuweihu"){
      totalTriggerCount++;
      grids.filter(c=>c.row===fox.row).forEach(g=>{
        let s=cardSaveData[g.saveKey];
        if(!s) return;
        if(hasJing) s.jing += layer;
        if(yingRows.includes(g.row)) s.ying += layer*2;
        if(g.skill==="qiongqi") s.qiong += layer;
      });
    }
  });

  grids.forEach(g=>{
    if(g.skill==="baize"){
      let s=cardSaveData[g.saveKey];
      if(!s) return;
      s.baizeAtk += totalTriggerCount * 2;
      s.baizeHp += totalTriggerCount * 5;
    }
  });

  grids.forEach(g=>{
    let s=cardSaveData[g.saveKey];
    if(!s) return;
    let nowAtk = g.baseAtk + s.jing + s.ying + s.qiong + s.baizeAtk;
    let nowHp = g.baseHp + s.jing + s.ying + s.qiong + s.baizeHp;
    g.el.querySelector(".card-stat").innerHTML = `<span class="atk-red">${nowAtk}</span>/<span class="hp-green">${nowHp}</span>`;
    g.el.classList.add("card-grow-flash");
    setTimeout(()=>g.el.classList.remove("card-grow-flash"),600);
  });
}

function startDrag(e,cd,slot,el){
  isDragging=true;draggedCard=cd;draggedFromSlot=slot;draggedElement=el;
  el.classList.add("dragging-source");
  dragPreview.style.display="block";
  dragPreview.innerHTML=`<img src="${cd.image}" style="width:100%;height:100%;">`;
  updateDragPreview(e.clientX,e.clientY);
  document.addEventListener("touchmove",onDragMove);
  document.addEventListener("touchend",onGlobalTouchEnd);
}
function onDragMove(e){
  if(!isDragging)return;e.preventDefault();
  let x=e.touches[0].clientX,y=e.touches[0].clientY;
  updateDragPreview(x,y);
  shopArea.classList.toggle("sell-ready", y+75<=shopBottom);
  document.querySelectorAll(".grid-slot,.card").forEach(n=>n.classList.remove("swap-ready","swap-target"));
  let tCard=document.elementFromPoint(x,y)?.closest(".card");
  if(tCard&&tCard!==draggedElement){tCard.classList.add("swap-target");return;}
  document.querySelectorAll(".grid-slot").forEach(s=>{
    let r=s.getBoundingClientRect();
    if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom&&!s.children.length)s.classList.add("swap-ready");
  });
}
function updateDragPreview(x,y){dragPreview.style.left=(x-55)+"px";dragPreview.style.top=(y-75)+"px";}
function onGlobalTouchEnd(e){
  if(!isDragging)return;e.preventDefault();
  document.removeEventListener("touchmove",onDragMove);document.removeEventListener("touchend",onGlobalTouchEnd);
  dragPreview.style.display="none";
  shopArea.classList.remove("sell-ready");
  document.querySelectorAll(".grid-slot,.card").forEach(n=>n.classList.remove("swap-ready","swap-target"));
  if(draggedElement)draggedElement.classList.remove("dragging-source");

  let x=e.changedTouches[0].clientX,y=e.changedTouches[0].clientY;
  if(draggedFromSlot&&y+75<=shopBottom){
    currentGold+=draggedCard.cost;
    delete cardSaveData[draggedFromSlot.dataset.saveKey];
    draggedFromSlot.innerHTML="";
  }else{
    let tCard=document.elementFromPoint(x,y)?.closest(".card");
    if(tCard&&tCard!==draggedElement){
      let tSlot=tCard.parentElement;
      let temp=cardSaveData[draggedFromSlot.dataset.saveKey];
      cardSaveData[draggedFromSlot.dataset.saveKey]=cardSaveData[tSlot.dataset.saveKey];
      cardSaveData[tSlot.dataset.saveKey]=temp;
      createDeckCard(draggedFromSlot,{id:parseInt(tCard.dataset.cardId),skill:tCard.dataset.skill,image:tCard.querySelector("img").src,baseAtk:parseInt(tCard.dataset.baseAtk),baseHp:parseInt(tCard.dataset.baseHp),cost:0});
      createDeckCard(tSlot,draggedCard);
    }else{
      let tSlot=null;
      document.querySelectorAll(".grid-slot").forEach(s=>{
        let r=s.getBoundingClientRect();
        if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom&&!s.children.length)tSlot=s;
      });
      if(tSlot){
        if(!draggedFromSlot){
          if(currentGold >= draggedCard.cost){
            currentGold -= draggedCard.cost;
            createDeckCard(tSlot, draggedCard);
          }
        }else{
          createDeckCard(tSlot, draggedCard);
          delete cardSaveData[draggedFromSlot.dataset.saveKey];
          draggedFromSlot.innerHTML="";
        }
      }
    }
  }
  updateGameStatus();
  refreshShopOnly();
  isDragging=false;draggedCard=null;draggedFromSlot=null;draggedElement=null;
}

function startNextTurn(){
  if(isNextTurnDisabled)return;
  currentTurn++;
  currentGold += currentTurn<=7 ? (turnGoldOriginal[currentTurn]||0) : goldAfterSeven;

  updateCardStatsVisual();

  if(currentTurn>=15){
    isNextTurnDisabled=true;
    document.getElementById("next-turn-btn").disabled=true;
    document.getElementById("next-turn-btn").innerText="Game Over";
  }
  updateGameStatus();
  refreshShopOnly();
}

document.getElementById("refresh-btn").onclick=()=>{
  if(currentGold>=1){
    currentGold--;
    refreshShopOnly();
    updateGameStatus();
  }
};
function updateGameStatus(){
  document.getElementById("current-gold").innerText=currentGold;
  document.getElementById("current-turn").innerText=currentTurn;
  updateButtonStates();
}
function updateButtonStates(){
  document.getElementById("refresh-btn").disabled=currentGold<1;
}
document.getElementById("next-turn-btn").onclick=startNextTurn;

window.onload=()=>{refreshShopOnly();};
window.addEventListener("resize",()=>{shopBottom=shopArea.getBoundingClientRect().bottom;});

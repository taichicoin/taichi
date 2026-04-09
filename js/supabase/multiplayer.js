import { supabase } from './client.js'
import { getCurrentUser } from './auth.js'

// ========= CF 悠悠牌 全局配置 =========
const CF_CONFIG = {
  maxPlayers: 8,
  initialHp: 100,
  initialGold: 10,
  initialLevel: 1,
  initialExp: 0,
  prepareTime: 30,
  fightTime: 20,
  refreshCost: 2,
  buyExpCost: 4,
  maxInterest: 5,
  interestStep: 10,
  winStreakBonusStart: 3,
  loseStreakBonusStart: 3,
  maxLevel: 9
};

let currentRoom = null;
let currentUser = null;
let unsubscribe = null;
let phaseTimer = null;

// ========= 房间创建 / 加入 =========
export async function createRoom() {
  currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("请先登录");

  const { data: room, error } = await supabase
    .from("rooms")
    .insert({ host_id: currentUser.id, status: "waiting", current_phase: 1 })
    .select()
    .single();

  if (error) throw error;
  currentRoom = room;
  await joinRoom(room.id);
  return room;
}

export async function joinRoom(roomId) {
  currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("请先登录");

  const { count } = await supabase
    .from("room_players")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId);

  if (count >= CF_CONFIG.maxPlayers) throw new Error("房间已满");

  await supabase.from("room_players").insert({
    room_id: roomId,
    user_id: currentUser.id,
    username: currentUser.user_metadata?.name || ("玩家"+currentUser.id.slice(0,6)),
    avatar_url: currentUser.user_metadata?.avatar_url || "",
    hp: CF_CONFIG.initialHp,
    gold: CF_CONFIG.initialGold,
    level: CF_CONFIG.initialLevel,
    exp: CF_CONFIG.initialExp,
    win_streak: 0,
    lose_streak: 0,
    shop: [],
    hand: [],
    board_state: {},
    eliminated: false
  });

  currentRoom = { id: roomId };
  subscribeToRoom();
}

// ========= 实时订阅房间、玩家、对局 =========
export function subscribeToRoom() {
  if(unsubscribe) unsubscribe();

  const roomSub = supabase
    .channel(`room:${currentRoom.id}`)
    .on("postgres_changes",{
      event:"UPDATE",schema:"public",table:"rooms",
      filter:`id=eq.${currentRoom.id}`
    },(payload)=>{
      currentRoom = payload.new;
      handleRoomState(currentRoom.status);
    }).subscribe();

  const playerSub = supabase
    .channel(`players:${currentRoom.id}`)
    .on("postgres_changes",{
      event:"*",schema:"public",table:"room_players",
      filter:`room_id=eq.${currentRoom.id}`
    },()=>{
      if(window.updatePlayersUI) window.updatePlayersUI();
    }).subscribe();

  const battleSub = supabase
    .channel(`battles:${currentRoom.id}`)
    .on("postgres_changes",{
      event:"*",schema:"public",table:"battles",
      filter:`room_id=eq.${currentRoom.id}`
    },()=>{
      checkAllBattleConfirm();
    }).subscribe();

  unsubscribe = () => {
    supabase.removeChannel(roomSub);
    supabase.removeChannel(playerSub);
    supabase.removeChannel(battleSub);
  };
}

// ========= 房间阶段跳转控制 =========
async function handleRoomState(status) {
  clearInterval(phaseTimer);
  switch(status){
    case "waiting":
      if(window.showWaitingUI) window.showWaitingUI();
      break;
    case "preparing":
      startTimer(CF_CONFIG.prepareTime, enterFightPhase);
      if(window.showPrepareUI) window.showPrepareUI(currentRoom.current_phase, CF_CONFIG.prepareTime);
      await freshShopNow();
      break;
    case "fighting":
      startTimer(CF_CONFIG.fightTime, endFightPhase);
      if(window.showFightingUI) window.showFightingUI(CF_CONFIG.fightTime);
      await runAllLocalBattle();
      break;
    case "finished":
      if(window.showGameResultUI) window.showGameResultUI(currentRoom.winner);
      break;
  }
}

// ========= 房主开局 =========
export async function startGame() {
  currentUser = await getCurrentUser();
  if(!currentUser) return;

  await supabase
    .from("rooms")
    .update({ status:"preparing", current_phase:1 })
    .eq("id", currentRoom.id);

  subscribeToRoom();
}

// ========= 准备阶段结束 → 生成对战配对 =========
async function enterFightPhase() {
  const { data: alivePlayers } = await supabase
    .from("room_players")
    .select("user_id,board_state")
    .eq("room_id", currentRoom.id)
    .eq("eliminated",false);

  const pairs = makeRandomPairs(alivePlayers);
  const insertList = pairs.map(p=>{
    return {
      room_id: currentRoom.id,
      phase: currentRoom.current_phase,
      player1_id: p[0].user_id,
      player2_id: p[1]?.user_id ?? null,
      winner_id: null,
      damage:0,
      remaining_units:0,
      confirmed_by:[]
    };
  });

  await supabase.from("battles").insert(insertList);
  await supabase.from("rooms").update({status:"fighting"}).eq("id",currentRoom.id);
}

// 随机两两配对
function makeRandomPairs(list){
  const arr = [...list].sort(()=>Math.random()-0.5);
  const res = [];
  for(let i=0;i<arr.length;i+=2){
    if(i+1 < arr.length){
      res.push([arr[i],arr[i+1]]);
    }else{
      res.push([arr[i],{}]);
    }
  }
  return res;
}

// ========= 本地运行全部战斗 =========
async function runAllLocalBattle() {
  const { data: battles } = await supabase
    .from("battles")
    .select("*")
    .eq("room_id",currentRoom.id)
    .eq("phase",currentRoom.current_phase)
    .is("winner_id",null);

  const { data: allPlys } = await supabase
    .from("room_players")
    .select("user_id,board_state")
    .eq("room_id",currentRoom.id);

  const map = new Map();
  allPlys.forEach(x=>map.set(x.user_id, x.board_state));

  currentUser = await getCurrentUser();

  for(const b of battles){
    const b1 = map.get(b.player1_id) ?? {};
    const b2 = b.player2_id ? (map.get(b.player2_id)??{}) : {};

    if(!window.simulateBattle) continue;
    const ret = window.simulateBattle(b1,b2);

    await supabase.from("battles").update({
      winner_id: ret.winner,
      damage: ret.damage,
      remaining_units: ret.remaining_units,
      confirmed_by: supabase.raw(`array_append(confirmed_by, '${currentUser.id}')`)
    }).eq("id",b.id);
  }
}

async function checkAllBattleConfirm(){}

// ========= 战斗结束 → 扣血、连胜、发钱、下一回合 =========
async function endFightPhase() {
  const { data: battles } = await supabase
    .from("battles")
    .select("player1_id,player2_id,winner_id,remaining_units")
    .eq("room_id",currentRoom.id)
    .eq("phase",currentRoom.current_phase);

  const loseMap = new Map();
  const winList = [];

  for(const b of battles){
    if(!b.winner_id || !b.player2_id) continue;
    let loser = (b.winner_id === b.player1_id) ? b.player2_id : b.player1_id;
    let dmg = b.remaining_units * 2 + 2;
    loseMap.set(loser, (loseMap.get(loser)||0)+dmg);
    winList.push(b.winner_id);
  }

  // 更新血量、连胜
  const { data: allPlayers } = await supabase
    .from("room_players")
    .select("user_id,hp,win_streak,lose_streak,eliminated")
    .eq("room_id",currentRoom.id);

  for(const p of allPlayers){
    let isWin = winList.includes(p.user_id);
    let dmg = loseMap.get(p.user_id) ?? 0;
    let newHp = Math.max(0, p.hp - dmg);

    let ws = isWin ? p.win_streak+1 : 0;
    let ls = !isWin && dmg>0 ? p.lose_streak+1 : 0;

    await supabase.from("room_players").update({
      hp: newHp,
      win_streak: ws,
      lose_streak: ls,
      eliminated: newHp <= 0
    }).eq("user_id",p.user_id);
  }

  // 发下一回合金币：基础5 + 利息 + 连胜奖励
  const { data: alive } = await supabase
    .from("room_players")
    .select("user_id,gold,win_streak,lose_streak")
    .eq("room_id",currentRoom.id)
    .eq("eliminated",false);

  for(const p of alive){
    let base = 5;
    let interest = Math.min(Math.floor(p.gold / CF_CONFIG.interestStep), CF_CONFIG.maxInterest);
    let bonus = 0;
    if(p.win_streak >= CF_CONFIG.winStreakBonusStart) bonus += Math.min(p.win_streak-2,3);
    if(p.lose_streak >= CF_CONFIG.loseStreakBonusStart) bonus += Math.min(p.lose_streak-2,3);

    await supabase.from("room_players")
      .update({gold: p.gold + base + interest + bonus})
      .eq("user_id",p.user_id);
  }

  // 判断游戏结束
  const { count: left } = await supabase
    .from("room_players")
    .select("*",{count:"exact",head:true})
    .eq("room_id",currentRoom.id)
    .eq("eliminated",false);

  if(left <= 1){
    const { data: winner } = await supabase
      .from("room_players")
      .select("user_id")
      .eq("room_id",currentRoom.id)
      .eq("eliminated",false).single();

    await supabase.from("rooms").update({status:"finished", winner: winner.user_id}).eq("id",currentRoom.id);
    return;
  }

  // 新一轮准备
  await supabase.from("rooms").update({
    status:"preparing",
    current_phase: currentRoom.current_phase + 1
  }).eq("id",currentRoom.id);
}

// ========= 商店系统 =========
export async function freshShopNow(){
  currentUser = await getCurrentUser();
  const { data: me } = await supabase
    .from("room_players")
    .select("level")
    .eq("room_id",currentRoom.id)
    .eq("user_id",currentUser.id).single();

  const shop = generateShopByLv(me.level);
  await supabase.from("room_players")
    .update({shop:shop})
    .eq("room_id",currentRoom.id)
    .eq("user_id",currentUser.id);
}

export async function payToRefreshShop(){
  currentUser = await getCurrentUser();
  const { data:me } = await supabase
    .from("room_players")
    .select("gold,level")
    .eq("room_id",currentRoom.id)
    .eq("user_id",currentUser.id).single();

  if(me.gold < CF_CONFIG.refreshCost) return;
  const newShop = generateShopByLv(me.level);

  await supabase.from("room_players")
    .update({gold: me.gold - CF_CONFIG.refreshCost, shop:newShop})
    .eq("room_id",currentRoom.id)
    .eq("user_id",currentUser.id);
}

// 你自己全局要有 window.getRandomCardByLevel
function generateShopByLv(lv){
  let list = [];
  for(let i=0;i<5;i++){
    let c = window.getRandomCardByLevel(lv);
    list.push({...c, star:1});
  }
  return list;
}

// ========= 升级人口 =========
export async function buyExp(){
  currentUser = await getCurrentUser();
  const { data:me } = await supabase
    .from("room_players")
    .select("gold,level,exp")
    .eq("room_id",currentRoom.id)
    .eq("user_id",currentUser.id).single();

  if(me.gold < CF_CONFIG.buyExpCost) return;
  if(me.level >= CF_CONFIG.maxLevel) return;

  const need = getExpNeed(me.level);
  let newExp = me.exp + 4;
  let newLv = me.level;

  if(newExp >= need){
    newExp -= need;
    newLv = me.level + 1;
  }

  await supabase.from("room_players")
    .update({gold:me.gold-4, exp:newExp, level:newLv})
    .eq("room_id",currentRoom.id)
    .eq("user_id",currentUser.id);
}

function getExpNeed(lv){
  const table = [0,2,6,10,16,22,30,40,50];
  return table[lv] ?? 50;
}

// ========= 计时器 =========
function startTimer(sec, endCb){
  let t = sec;
  if(window.updateTimerUI) window.updateTimerUI(t);
  phaseTimer = setInterval(()=>{
    t--;
    if(window.updateTimerUI) window.updateTimerUI(t);
    if(t<=0){
      clearInterval(phaseTimer);
      endCb();
    }
  },1000);
}

// ========= 全局挂载给HTML调用 =========
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.startGame = startGame;
window.payToRefreshShop = payToRefreshShop;
window.buyExp = buyExp;

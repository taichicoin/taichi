// ==================== 对战系统【纯时间驱动 + 状态机 + 后端结算 + 无本地商店操作】 ====================
window.YYCardBattle = (function() {
const supabase = window.supabase;
const auth = window.YYCardAuth;
const utils = window.YYCardUtils;
const config = window.YYCardConfig;

let currentRoomId = null;
let gameState = null;
let gameSubscription = null;
let autoBotTimer = null;

let phaseTimer = null;
let timerInterval = null;
let currentPhaseStartTime = 0;
let currentPhaseDuration = 0;
let enterGuard = false;

let isUpdatingFromLocal = false;
let isInPhaseTransition = false;

// 轮询
let pollingInterval = null;

// 淘汰名次
let eliminationOrder = [];

// 固定缓冲与结算
const BUFFER_DURATION = 2;
const SETTLE_DURATION = 3;

// 回合时长公式
function getPrepareDuration(round) { return 25 + (round - 1) * 10; }
function getBattleDuration(round) { return 30 + (round - 1) * 5; }

// 后端结算函数
const SETTLEMENT_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

// ==================== 调试 ====================
function initDebugPanel() {
const old = document.getElementById('battle-debug-panel');
if (old) old.remove();
const p = document.createElement('div');
p.id = 'battle-debug-panel';
p.style.cssText = `position:fixed; top:0; left:0; right:0; bottom:0; overflow-y:auto; color:#7bffb1; font-size:12px; padding:8px; z-index:100000; font-family:monospace; pointer-events:none; text-shadow:0 0 4px black; background: transparent; border: none; display: flex; flex-direction: column-reverse;`;
document.body.appendChild(p);
return p;
}

function logToScreen(msg, isError = false, persistent = false) {
const p = document.getElementById('battle-debug-panel') || initDebugPanel();
const line = document.createElement('div');
line.style.color = isError ? '#ff7b7b' : '#7bffb1';
line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
p.insertBefore(line, p.firstChild);
while (p.children.length > 100) p.removeChild(p.lastChild);
if (persistent) {
setTimeout(() => {
if (line.parentNode) {
line.style.transition = 'opacity 0.5s';
line.style.opacity = '0';
setTimeout(() => line.remove(), 500);
}
}, 60000);
}
}

function toast(msg, isError = false) {
if (window.YYCardShop?.toast) window.YYCardShop.toast(msg, isError);
else alert(msg);
}

function log(msg, isError = false, persistent = false) {
if (auth?.log) auth.log(msg, isError);
console.log(msg);
logToScreen(msg, isError, persistent);
}

// ==================== 状态 ====================
function getGameState() { return gameState; }
function getCurrentRoomId() { return currentRoomId; }

// 只拉取、不本地修改玩家数据
async function updateGameState() {
if (!currentRoomId || !gameState) return;

const { data: fresh, error } = await supabase
.from('game_states')
.select('state')
.eq('room_id', currentRoomId)
.single();

if (error) return;
if (fresh?.state) {
gameState = fresh.state;
}

isUpdatingFromLocal = true;
await supabase
.from('game_states')
.update({ state: gameState })
.eq('room_id', currentRoomId);

if (window.YYCardShop?.refreshAllUI)
window.YYCardShop.refreshAllUI();

setTimeout(() => { isUpdatingFromLocal = false; }, 100);
}

// 强制刷新（后端操作后调用）
async function forceRefreshState() {
if (!currentRoomId) return;
const { data } = await supabase
.from('game_states')
.select('state')
.eq('room_id', currentRoomId)
.single();
if (data?.state) {
gameState = data.state;
if (window.YYCardShop?.refreshAllUI)
window.YYCardShop.refreshAllUI();
}
}

// ==================== 计时器 ====================
function clearAllTimers() {
if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
}

let safetyTimer = null;
function startPhaseTimer(phase, duration, skipStateUpdate = false) {
if (!duration || isNaN(duration) || duration <= 0) {
let fallback = 3;
if (phase === 'prepare') fallback = getPrepareDuration(gameState?.round || 1);
else if (phase === 'battle') fallback = getBattleDuration(gameState?.round || 1);
else if (phase === 'settle') fallback = SETTLE_DURATION;
log(`⚠️ 无效时长，使用后备值 ${fallback}`, true);
duration = fallback;
}

clearAllTimers();
currentPhaseDuration = duration;

if (!skipStateUpdate) {
gameState.phaseStartTime = new Date().toISOString();
currentPhaseStartTime = Date.now();
updateGameState();
} else {
currentPhaseStartTime = Date.now() - (getPhaseDuration(phase, gameState.round) - duration) * 1000;
}

if (window.YYCardShop?.updateTimerDisplay)
window.YYCardShop.updateTimerDisplay(duration, phase);

timerInterval = setInterval(() => {
const elapsed = Math.floor((Date.now() - currentPhaseStartTime) / 1000);
const remaining = Math.max(0, currentPhaseDuration - elapsed);
if (window.YYCardShop?.updateTimerDisplay)
window.YYCardShop.updateTimerDisplay(remaining, phase);
}, 100);

phaseTimer = setTimeout(() => {
clearTimeout(safetyTimer);
clearInterval(timerInterval);
timerInterval = null;
phaseTimer = null;
onPhaseEnd(phase);
}, duration * 1000);

safetyTimer = setTimeout(() => {
if (phaseTimer) {
log(`⚠️ 阶段 ${phase} 超时强制结束`, true);
clearTimeout(phaseTimer);
phaseTimer = null;
clearInterval(timerInterval);
timerInterval = null;
onPhaseEnd(phase);
}
}, (duration + 2) * 1000);
}

// 缓冲期
async function startBuffering(targetPhase) {
log(`⏳ 缓冲 ${BUFFER_DURATION}s → ${targetPhase}`);
if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase('buffering');
if (window.YYCardShop?.updateTimerDisplay)
window.YYCardShop.updateTimerDisplay(BUFFER_DURATION, 'buffering');
await new Promise(r => setTimeout(r, BUFFER_DURATION * 1000));
if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(targetPhase);
}

// ==================== 阶段结束 ====================
async function onPhaseEnd(phase) {
if (isInPhaseTransition) return;
if (!gameState || !currentRoomId) return;

isInPhaseTransition = true;
const lockTimeout = setTimeout(() => { isInPhaseTransition = false; }, 12000);

try {
if (phase === 'prepare') {
await startBuffering('battle');
gameState.phase = 'battle';
gameState.phaseStartTime = new Date().toISOString();
await updateGameState();
await applyUIMode(false);
startPhaseTimer('battle', getBattleDuration(gameState.round));
await simulateBattle();
}
else if (phase === 'battle') {
gameState.phase = 'settle';
gameState.phaseStartTime = new Date().toISOString();
await updateGameState();
await applyUIMode(false);
startPhaseTimer('settle', SETTLE_DURATION);
}
else if (phase === 'settle') {
// ✅ 前端不再发奖励，全部调用后端 settlement
await callSettlementBackend();

const over = checkGameOver();
if (over.isOver) {
endGame(over.winner);
clearTimeout(lockTimeout);
isInPhaseTransition = false;
return;
}

// 回合、阶段、商店 全部由后端更新
await forceRefreshState();
await applyUIMode(true);

const newPrepare = getPrepareDuration(gameState.round);
log(`🔁 第 ${gameState.round} 回合准备阶段（${newPrepare}s）`);
startPhaseTimer('prepare', newPrepare);
}
} catch (e) {
log(`❌ onPhaseEnd: ${e.message}`, true);
} finally {
clearTimeout(lockTimeout);
isInPhaseTransition = false;
}
}

// 调用后端结算（金币、经验、等级、商店刷新、回合+1）
async function callSettlementBackend() {
try {
const token = (await supabase.auth.getSession()).data.session?.access_token;
if (!token) return;

const res = await fetch(SETTLEMENT_FUNCTION_URL, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': `Bearer ${token}`
},
body: JSON.stringify({ roomId: currentRoomId }),
keepalive: true
});

const data = await res.json();
if (data.success) {
log(`✅ 后端结算完成，新回合：${data.round}`);
} else {
log(`⚠️ 结算：${data.error || '已处理过'}`, true);
}
} catch (e) {
log(`❌ 结算接口失败：${e.message}`, true);
}
}

// ==================== UI模式 ====================
async function applyUIMode(isPrepare) {
try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch (e) {}
if (window.YYCardShop?.setPhase) {
window.YYCardShop.setPhase(isPrepare ? 'prepare' : (gameState?.phase === 'settle' ? 'settle' : 'battle'));
}
const pt = document.getElementById('phase-timer');
const bt = document.getElementById('phase-timer-battle');
if (pt) pt.style.display = isPrepare ? 'block' : 'none';
if (bt) bt.style.display = isPrepare ? 'none' : 'block';

if (!isPrepare) await forceRefreshState();
}

// 战斗模拟
async function simulateBattle() {
try {
await forceRefreshState();
if (window.YYCardCombat) {
await window.YYCardCombat.resolveBattles(gameState, log, updateGameState);
}
} catch (e) {}
}

// ==================== 游戏结束 ====================
function checkGameOver() {
const players = gameState.players;
const alive = Object.values(players).filter(p => p.health > 0 && !p.isEliminated);

Object.entries(players).forEach(([id, p]) => {
if (p.health <= 0 && !p.isEliminated) {
p.isEliminated = true;
if (!eliminationOrder.includes(id)) {
eliminationOrder.push(id);
const total = Object.keys(players).length;
const r = total - eliminationOrder.length + 1;
log(`☠️ 玩家 ${id.slice(0,8)} 第${r}名`, false, true);
}
}
});

if (alive.length <= 1) {
const winner = alive[0]
? Object.keys(players).find(id => players[id] === alive[0])
: eliminationOrder.at(-1);

if (winner && !eliminationOrder.includes(winner)) {
eliminationOrder.push(winner);
log(`🏆 玩家 ${winner.slice(0,8)} 第一名`, false, true);
}
return { isOver: true, winner };
}
return { isOver: false };
}

function endGame(winnerId) {
stopPolling();
isInPhaseTransition = false;
clearAllTimers();

const ranks = [...eliminationOrder].reverse();
let s = '📋 最终排名：\n';
ranks.forEach((id, i) => {
s += `  第${i+1}名: ${id.slice(0,8)}\n`;
});
log(s, false, true);

toast(`游戏结束！胜者：${winnerId}`);

if (autoBotTimer) clearInterval(autoBotTimer);
if (gameSubscription) gameSubscription.unsubscribe();
eliminationOrder = [];

setTimeout(() => {
document.getElementById('battle-view').style.display = 'none';
document.getElementById('lobby-view').style.display = 'block';
gameState = currentRoomId = null;
enterGuard = false;
}, 3000);
}

// ==================== 重连快进 ====================
function getPhaseDuration(phase, round) {
if (phase === 'prepare') return getPrepareDuration(round);
if (phase === 'buffering') return BUFFER_DURATION;
if (phase === 'battle') return getBattleDuration(round);
if (phase === 'settle') return SETTLE_DURATION;
return 3;
}

async function fastForwardAndResume() {
if (!gameState || !gameState.gameStartTime) return false;
const start = new Date(gameState.gameStartTime).getTime();
const now = Date.now();
let elapsed = Math.floor((now - start) / 1000);
let round = 1, phase = 'prepare', rem = 0;

while (true) {
const prep = getPrepareDuration(round);
const buf = BUFFER_DURATION;
const bat = getBattleDuration(round);
const set = SETTLE_DURATION;
const total = prep + buf + bat + set;
if (elapsed >= total) {
elapsed -= total;
round++;
} else {
if (elapsed < prep) { phase = 'prepare'; rem = prep - elapsed; }
else if (elapsed < prep + buf) { phase = 'buffering'; rem = prep + buf - elapsed; }
else if (elapsed < prep + buf + bat) { phase = 'battle'; rem = prep + buf + bat - elapsed; }
else { phase = 'settle'; rem = total - elapsed; }
break;
}
}

gameState.round = round;
gameState.phase = phase;
gameState.phaseStartTime = new Date(now - (getPhaseDuration(phase, round) - rem) * 1000).toISOString();
await updateGameState();
await applyUIMode(phase === 'prepare');
clearAllTimers();
startPhaseTimer(phase, rem, true);
return true;
}

// ==================== 进入游戏 ====================
async function enterBattle(roomId) {
if (enterGuard) return;
enterGuard = true;
currentRoomId = roomId;
document.getElementById('lobby-view').style.display = 'none';
document.getElementById('battle-view').style.display = 'block';
initDebugPanel();
eliminationOrder = [];

subscribeToGame(roomId);
startPolling();
bindBattleEvents();
startBotAutoPlay();

let attempts = 0; const MAX = 15;
const wait = async () => {
if (gameState) {
if (!gameState.gameStartTime) {
gameState.gameStartTime = new Date().toISOString();
await updateGameState();
}
const ok = await fastForwardAndResume();
if (!ok) {
const ph = gameState.phase;
const rd = gameState.round;
await applyUIMode(ph === 'prepare');
const st = new Date(gameState.phaseStartTime).getTime();
const el = Math.floor((Date.now() - st) / 1000);
const tot = getPhaseDuration(ph, rd);
const r = Math.max(0, tot - el);
if (r <= 0) onPhaseEnd(ph);
else { currentPhaseStartTime = st; startPhaseTimer(ph, r, true); }
}
return;
}
if (attempts < MAX) {
attempts++;
const { data } = await supabase
.from('game_states')
.select('state')
.eq('room_id', roomId)
.maybeSingle();
if (data?.state) {
gameState = data.state;
if (window.YYCardShop?.refreshAllUI)
window.YYCardShop.refreshAllUI();
}
setTimeout(wait, 200);
} else {
toast('状态加载失败', true);
enterGuard = false;
}
};
wait();
}

// ==================== 实时同步 ====================
function subscribeToGame(roomId) {
if (gameSubscription) gameSubscription.unsubscribe();
gameSubscription = supabase.channel(`game:${roomId}`)
.on('postgres_changes', {
event: 'UPDATE',
schema: 'public',
table: 'game_states',
filter: `room_id=eq.${roomId}`
}, (p) => {
if (isUpdatingFromLocal) return;
gameState = p.new.state;
applyUIMode(gameState.phase === 'prepare');
if (window.YYCardShop?.refreshAllUI)
window.YYCardShop.refreshAllUI();
})
.subscribe();
}

function startPolling() {
if (pollingInterval) clearInterval(pollingInterval);
pollingInterval = setInterval(async () => {
if (!currentRoomId || isInPhaseTransition) return;
await forceRefreshState();
}, 2000);
}

function stopPolling() {
if (pollingInterval) {
clearInterval(pollingInterval);
pollingInterval = null;
}
}

// AI机器人
function startBotAutoPlay() {
if (autoBotTimer) clearInterval(autoBotTimer);
autoBotTimer = setInterval(async () => {
if (!gameState || gameState.phase !== 'prepare') return;
const uid = auth.currentUser?.id;
const me = gameState.players[uid];
if (!me || !me.isBot) return;
// 机器人逻辑保留（不影响后端）
}, 2000);
}

// 退出
function bindBattleEvents() {
document.getElementById('leave-battle-btn')?.addEventListener('click', async () => {
if (!confirm('确定退出？')) return;
clearAllTimers();
stopPolling();
if (autoBotTimer) clearInterval(autoBotTimer);
if (window.YYCardMatchmaking?.cancel) await window.YYCardMatchmaking.cancel();
if (gameSubscription) gameSubscription.unsubscribe();
document.getElementById('battle-view').style.display = 'none';
document.getElementById('lobby-view').style.display = 'block';
gameState = currentRoomId = null;
enterGuard = false;
});
}

// ==================== 导出 ====================
return {
enterBattle,
getGameState,
getCurrentRoomId,
updateGameState,
forceRefreshState
};
})();

console.log('✅ battle.js 加载完成（纯后端结算 + 无本地商店操作）');

// ==================== 纯时间驱动对战系统（最终修正版：倒计时恢复+动画触发） ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;
    let gameSubscription = null;
    let pollingInterval = null;
    let mainTimer = null;
    let enterGuard = false;
    let isSettling = false;
    let isInPhaseTransition = false;
    let isAnimating = false;

    const BUFFER_DURATION = 3;
    const SETTLE_DURATION = 3;
    function getPrepareDuration(round) { return 27 + (round - 1) * 10; }
    function getBattleDuration(round)  { return 30 + (round - 1) * 5; }

    const SETTLEMENT_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

    async function getServerTime() {
        try {
            const { data, error } = await supabase.rpc('get_server_time');
            if (error) throw error;
            return data;
        } catch (e) {
            console.warn('获取服务器时间失败，使用本地时间', e);
            return Math.floor(Date.now() / 1000);
        }
    }
    async function getServerTimeMs() { return (await getServerTime()) * 1000; }

    function calculatePhaseInfo(gameStartSec, nowSec) {
        let elapsed = nowSec - gameStartSec;
        if (elapsed < 0) elapsed = 0;
        let round = 1;
        while (true) {
            const prep = getPrepareDuration(round);
            const buf = BUFFER_DURATION;
            const bat = getBattleDuration(round);
            const totalRound = prep + buf + bat;
            if (elapsed >= totalRound) {
                elapsed -= totalRound;
                round++;
                if (round > 100) break;
            } else {
                if (elapsed < prep) return { round, phase: 'prepare', remaining: prep - elapsed };
                if (elapsed < prep + buf) return { round, phase: 'buffering', remaining: prep + buf - elapsed };
                return { round, phase: 'battle', remaining: prep + buf + bat - elapsed };
            }
        }
        return { round: 1, phase: 'prepare', remaining: getPrepareDuration(1) };
    }

    function getPhaseDuration(phase, round) {
        if (phase === 'prepare') return getPrepareDuration(round);
        if (phase === 'buffering') return BUFFER_DURATION;
        if (phase === 'battle') return getBattleDuration(round);
        if (phase === 'settle') return SETTLE_DURATION;
        return 3;
    }

    async function fetchGameState() {
        if (!currentRoomId) return null;
        const { data, error } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', currentRoomId)
            .maybeSingle();
        if (error) { log(`❌ 拉取状态失败: ${error.message}`, true); return null; }
        if (!data?.state) return null;
        const s = data.state;
        return { players: s.players, gameStartTime: s.gameStartTime };
    }

    async function updatePlayersToDB() {
        if (!currentRoomId || !gameState) return;
        const payload = { players: gameState.players, gameStartTime: gameState.gameStartTime };
        const { error } = await supabase.from('game_states').update({ state: payload }).eq('room_id', currentRoomId);
        if (error) log(`❌ 更新玩家数据失败: ${error.message}`, true);
    }

    async function updatePhaseToDB() {
        if (!currentRoomId || !gameState) return;
        const { error } = await supabase.from('game_states').update({ state: gameState }).eq('room_id', currentRoomId);
        if (error) log(`❌ 更新阶段失败: ${error.message}`, true);
    }

    async function refreshGameState() {
        const newState = await fetchGameState();
        if (newState) {
            const currentUserId = auth?.currentUser?.id;
            if (currentUserId && newState.players[currentUserId]) {
                const myNew = newState.players[currentUserId];
                const myOld = gameState.players[currentUserId];
                myOld.gold = myNew.gold;
                myOld.exp = myNew.exp;
                myOld.shopLevel = myNew.shopLevel;
                myOld.health = myNew.health;
                myOld.isBot = myNew.isBot;
                myOld.isEliminated = myNew.isEliminated;
                myOld.isReady = myNew.isReady;
            } else {
                gameState.players = newState.players;
            }
            gameState.gameStartTime = newState.gameStartTime;
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        }
    }

    async function callSettlement() {
        if (isSettling) return;
        isSettling = true;
        log("⚔️ 战斗阶段结束，调用结算接口...");
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { log("❌ 无会话，无法结算", true); isSettling = false; return; }
            const res = await fetch(SETTLEMENT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.error || '结算失败');
            log(`✅ 结算成功，新回合: ${result.newRound || result.round}`);
            await refreshGameState();
        } catch (err) { log(`❌ 结算失败: ${err.message}`, true); }
        finally { isSettling = false; }
    }

    // ========== 战斗动画 ==========
    function getBoardElements() {
        const leftBoard = document.getElementById('my-board');
        const rightBoard = document.getElementById('enemy-board');
        if (!leftBoard || !rightBoard) return null;
        const leftCards = [], rightCards = [];
        for (let i = 0; i < 6; i++) {
            const leftSlot = leftBoard.children[i];
            leftCards.push(leftSlot ? leftSlot.querySelector('.card') : null);
            const rightSlot = rightBoard.children[i];
            rightCards.push(rightSlot ? rightSlot.querySelector('.card') : null);
        }
        // 备用选择器
        if (leftCards.every(c => !c) && rightCards.every(c => !c)) {
            const fallbackLeft = leftBoard.querySelectorAll('.card');
            const fallbackRight = rightBoard.querySelectorAll('.card');
            for (let i = 0; i < 6; i++) {
                if (fallbackLeft[i]) leftCards[i] = fallbackLeft[i];
                if (fallbackRight[i]) rightCards[i] = fallbackRight[i];
            }
        }
        return { left: leftCards, right: rightCards };
    }

    function showDamageNumber(element, damage) {
        if (!element) return;
        const div = document.createElement('div');
        div.className = 'damage-number';
        div.textContent = `-${damage}`;
        element.style.position = 'relative';
        element.appendChild(div);
        setTimeout(() => div.remove(), 800);
    }

    function updateCardHp(element, newHp) {
        if (!element) return;
        const hpSpan = element.querySelector('.card-hp');
        if (hpSpan) hpSpan.textContent = newHp;
    }

    async function playAttackEvent(event, boardElements) {
        return new Promise(resolve => {
            const attackerSide = event.attackerSide === 1 ? 'left' : 'right';
            const targetSide = attackerSide === 'left' ? 'right' : 'left';
            const attackerEl = boardElements[attackerSide][event.attacker.pos];
            const targetEl = boardElements[targetSide][event.target.pos];
            if (!attackerEl || !targetEl) {
                console.warn('攻击动画元素缺失', attackerSide, event.attacker.pos, targetSide, event.target.pos);
                resolve();
                return;
            }
            attackerEl.classList.add('attacking');
            setTimeout(() => {
                attackerEl.classList.remove('attacking');
                showDamageNumber(targetEl, event.damage);
                updateCardHp(targetEl, event.newHp);
                if (event.targetDead) targetEl.classList.add('dying');
                setTimeout(resolve, 300);
            }, 200);
        });
    }

    async function playCombatAnimations(combatEvents) {
        isAnimating = true;
        const boardElements = getBoardElements();
        if (!boardElements) {
            log("❌ 无法获取棋盘DOM元素，跳过动画", true);
            isAnimating = false;
            return;
        }
        for (const pair of combatEvents) {
            if (pair.p2Id === null) continue;
            for (const event of pair.events) {
                await playAttackEvent(event, boardElements);
            }
        }
        isAnimating = false;
    }

    async function simulateBattleWithAnimation() {
        if (isAnimating || isSettling) {
            log(`⚠️ 动画被锁，动画中=${isAnimating} 结算中=${isSettling}`);
            return;
        }
        isAnimating = true;
        log("⚔️ 战斗动画启动");
        try {
            if (!window.YYCardCombat) { log('❌ 战斗模块未加载', true); return; }
            await fetchGameState();
            const combatEvents = await window.YYCardCombat.resolveBattlesWithEvents(gameState);
            console.log('📊 战斗事件:', combatEvents);
            if (!combatEvents || combatEvents.length === 0 || !combatEvents.some(p => p.events?.length)) {
                log("⚠️ 没有战斗事件，跳过动画");
                return;
            }
            await new Promise(r => setTimeout(r, 100)); // 确保DOM更新
            await playCombatAnimations(combatEvents);
            window.YYCardCombat.applyCombatResult(gameState, combatEvents);
            await updatePlayersToDB();
            if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            log("✅ 战斗动画完成，血量已更新");
        } catch (e) { log(`❌ 动画执行出错: ${e.message}`, true); }
        finally { isAnimating = false; }
    }

    // ========== 计时器 ==========
    let phaseTimer = null, timerInterval = null, currentPhaseEndServerTime = 0, safetyTimer = null;
    function clearAllTimers() {
        if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
        currentPhaseEndServerTime = 0;
    }

    async function startPhaseTimerFromEndTime(phaseEndTimeMs) {
        clearAllTimers();
        const nowServer = await getServerTimeMs();
        let remaining = Math.max(0, Math.floor((phaseEndTimeMs - nowServer) / 1000));
        const phase = gameState.phase;
        if (remaining <= 0) { onPhaseEnd(phase); return; }
        currentPhaseEndServerTime = phaseEndTimeMs;
        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(remaining, phase);
        timerInterval = setInterval(async () => {
            const now = await getServerTimeMs();
            const rem = Math.max(0, Math.floor((currentPhaseEndServerTime - now) / 1000));
            if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(rem, phase);
        }, 100);
        phaseTimer = setTimeout(() => { clearAllTimers(); onPhaseEnd(phase); }, remaining * 1000);
        safetyTimer = setTimeout(() => { if (phaseTimer) { clearAllTimers(); onPhaseEnd(phase); } }, (remaining + 3) * 1000);
    }

    async function startBuffering(targetPhase) {
        log(`⏳ 缓冲期 ${BUFFER_DURATION}s → ${targetPhase}`);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase('buffering');
        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(BUFFER_DURATION, 'buffering');
        await new Promise(resolve => setTimeout(resolve, BUFFER_DURATION * 1000));
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(targetPhase);
    }

    async function onPhaseEnd(phase) {
        if (isInPhaseTransition) { log(`⚠️ 阶段切换被锁: ${phase}`, true); return; }
        if (!gameState || !currentRoomId) return;
        isInPhaseTransition = true;
        let lockTimeout = setTimeout(() => { if (isInPhaseTransition) { log(`⚠️ 阶段切换锁超时`, true); isInPhaseTransition = false; } }, 15000);
        log(`🔄 阶段结束: ${phase}`);
        try {
            if (phase === 'prepare') {
                await startBuffering('battle');
                await simulateBattleWithAnimation();
                gameState.phase = 'battle';
                const nowServer = await getServerTimeMs();
                const battleDur = getBattleDuration(gameState.round);
                const phaseEndTime = nowServer + battleDur * 1000;
                gameState.phaseStartTime = new Date(nowServer).toISOString();
                gameState.phaseEndTime = new Date(phaseEndTime).toISOString();
                await updatePhaseToDB();
                await applyUIMode(false);
                await startPhaseTimerFromEndTime(phaseEndTime);
            } else if (phase === 'battle') {
                gameState.phase = 'settle';
                const nowServer = await getServerTimeMs();
                const phaseEndTime = nowServer + SETTLE_DURATION * 1000;
                gameState.phaseStartTime = new Date(nowServer).toISOString();
                gameState.phaseEndTime = new Date(phaseEndTime).toISOString();
                await updatePhaseToDB();
                await applyUIMode(false);
                await startPhaseTimerFromEndTime(phaseEndTime);
            } else if (phase === 'settle') {
                await callSettlement();
                await fetchGameState();
                const over = checkGameOver();
                if (over.isOver) { endGame(over.winner); clearTimeout(lockTimeout); return; }
                await applyUIMode(true);
                if (gameState.phaseEndTime) {
                    await startPhaseTimerFromEndTime(new Date(gameState.phaseEndTime).getTime());
                } else {
                    const nowServer = await getServerTimeMs();
                    const prepareDur = getPrepareDuration(gameState.round);
                    const phaseEndTime = nowServer + prepareDur * 1000;
                    await startPhaseTimerFromEndTime(phaseEndTime);
                }
            }
        } catch (e) { log(`❌ onPhaseEnd 出错: ${e.message}`, true); }
        finally { clearTimeout(lockTimeout); isInPhaseTransition = false; }
    }

    async function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch(e) {}
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(isPrepare ? 'prepare' : (gameState?.phase === 'settle' ? 'settle' : 'battle'));
        const prepareTimer = document.getElementById('phase-timer'), battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
        if (!isPrepare) { await fetchGameState(); if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI(); }
    }

    function mergePlayersData(currentPlayers, newPlayers, currentUserId) {
        const result = { ...currentPlayers };
        for (const [pid, newPlayer] of Object.entries(newPlayers)) {
            if (pid === currentUserId) {
                result[pid] = { ...result[pid], gold: newPlayer.gold, exp: newPlayer.exp, shopLevel: newPlayer.shopLevel, health: newPlayer.health, isBot: newPlayer.isBot, isEliminated: newPlayer.isEliminated, isReady: newPlayer.isReady };
            } else { result[pid] = newPlayer; }
        }
        return result;
    }

    function subscribeGameState() {
        if (gameSubscription) gameSubscription.unsubscribe();
        gameSubscription = supabase.channel(`game:${currentRoomId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_states', filter: `room_id=eq.${currentRoomId}` }, async (payload) => {
                const newState = payload.new.state;
                if (newState?.players) {
                    const currentUserId = auth?.currentUser?.id;
                    if (currentUserId) gameState.players = mergePlayersData(gameState.players, newState.players, currentUserId);
                    else gameState.players = newState.players;
                    if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                }
            })
            .subscribe();
    }

    function startPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(async () => {
            if (!currentRoomId) return;
            const { data } = await supabase.from('game_states').select('state').eq('room_id', currentRoomId).maybeSingle();
            if (data?.state?.players) {
                const currentUserId = auth?.currentUser?.id;
                if (currentUserId) gameState.players = mergePlayersData(gameState.players, data.state.players, currentUserId);
                else gameState.players = data.state.players;
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            }
        }, 2000);
    }

    let eliminationOrder = [];
    function checkGameOver() {
        const players = gameState.players;
        const alive = Object.values(players).filter(p => p.health > 0 && !p.isEliminated);
        Object.entries(players).forEach(([id, p]) => {
            if (p.health <= 0 && !p.isEliminated) {
                p.isEliminated = true;
                if (!eliminationOrder.includes(id)) {
                    eliminationOrder.push(id);
                    const totalPlayers = Object.keys(players).length;
                    const rank = totalPlayers - eliminationOrder.length + 1;
                    log(`☠️ 玩家 ${id.slice(0,8)} 被淘汰，获得第 ${rank} 名`, false, true);
                }
            }
        });
        if (alive.length <= 1) {
            const winner = alive[0] ? Object.keys(players).find(id => players[id] === alive[0]) : eliminationOrder[eliminationOrder.length - 1];
            if (alive[0] && !eliminationOrder.includes(winner)) { eliminationOrder.push(winner); log(`🏆 玩家 ${winner.slice(0,8)} 获得第 1 名`, false, true); }
            return { isOver: true, winner };
        }
        return { isOver: false };
    }

    function endGame(winnerId) {
        stopPolling(); isInPhaseTransition = false; isAnimating = false; isSettling = false;
        const rankings = [...eliminationOrder].reverse();
        let rankMsg = `📋 最终排名：\n`; rankings.forEach((id, index) => { rankMsg += `  第${index+1}名: ${id.slice(0,8)}\n`; });
        log(rankMsg, false, true); toast(`游戏结束！胜利者: ${winnerId}`);
        clearAllTimers(); if (autoBotTimer) clearInterval(autoBotTimer); if (mainTimer) clearInterval(mainTimer);
        if (gameSubscription) gameSubscription.unsubscribe(); eliminationOrder = [];
        setTimeout(() => { document.getElementById('battle-view').style.display = 'none'; document.getElementById('lobby-view').style.display = 'block'; gameState = currentRoomId = null; enterGuard = false; }, 3000);
    }

    // ========== 重连恢复（关键修复：倒计时不再从头开始） ==========
    async function fastForwardAndResume() {
        if (!gameState || !gameState.gameStartTime) return false;
        const start = new Date(gameState.gameStartTime).getTime();
        const now = Date.now();
        let elapsed = Math.floor((now - start) / 1000);
        let round = 1, phase = 'prepare', remaining = 0;
        while (true) {
            const prep = getPrepareDuration(round);
            const buf = BUFFER_DURATION;
            const bat = getBattleDuration(round);
            const set = SETTLE_DURATION;
            const total = prep + buf + bat + set;
            if (elapsed >= total) { elapsed -= total; round++; }
            else {
                if (elapsed < prep) { phase = 'prepare'; remaining = prep - elapsed; }
                else if (elapsed < prep + buf) { phase = 'buffering'; remaining = prep + buf - elapsed; }
                else if (elapsed < prep + buf + bat) { phase = 'battle'; remaining = prep + buf + bat - elapsed; }
                else { phase = 'settle'; remaining = total - elapsed; }
                break;
            }
        }
        if (round > gameState.round) {
            for (let r = gameState.round; r < round; r++) {
                const gold = config.ECONOMY.GOLD_PER_ROUND(r), exp = config.ECONOMY.EXP_PER_ROUND;
                for (const pid in gameState.players) {
                    const p = gameState.players[pid];
                    p.gold += gold; p.exp += exp;
                    const lvl = getShopLevelByExp(p.exp);
                    if (lvl > p.shopLevel) p.shopLevel = lvl;
                }
            }
        }
        gameState.round = round;
        gameState.phase = phase;
        const nowServer = await getServerTimeMs();
        // 核心修复：基于当前服务器时间和剩余秒数计算结束时间
        const phaseEndTime = nowServer + remaining * 1000;
        gameState.phaseStartTime = new Date(nowServer - (getPhaseDuration(phase, round) - remaining) * 1000).toISOString();
        gameState.phaseEndTime = new Date(phaseEndTime).toISOString();
        await updatePhaseToDB();
        await applyUIMode(phase === 'prepare');
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        clearAllTimers();
        await startPhaseTimerFromEndTime(phaseEndTime);
        return true;
    }

    function getShopLevelByExp(exp) {
        if (exp >= 46) return 5; if (exp >= 26) return 4; if (exp >= 12) return 3; if (exp >= 4) return 2; return 1;
    }

    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;
        clearAllTimers(); if (mainTimer) clearInterval(mainTimer); if (pollingInterval) clearInterval(pollingInterval);
        if (gameSubscription) gameSubscription.unsubscribe();
        isInPhaseTransition = false; isAnimating = false; isSettling = false; eliminationOrder = [];
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initDebugPanel();

        let loaded = false;
        for (let i = 0; i < 20; i++) {
            const state = await fetchGameState();
            if (state) { gameState = state; gameState.phase = 'prepare'; gameState.round = 1; loaded = true; break; }
            await new Promise(r => setTimeout(r, 200));
        }
        if (!loaded) { toast("游戏状态加载失败，请刷新页面重试", true); enterGuard = false; return; }

        if (!gameState.gameStartTime) { gameState.gameStartTime = new Date().toISOString(); await updatePlayersToDB(); }

        if (window.YYCardShop?.init) window.YYCardShop.init();
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();

        subscribeGameState(); startPolling(); startGlobalTimer(); bindLeaveButton();

        const nowServer = await getServerTimeMs();
        const prepareDur = getPrepareDuration(gameState.round);
        const phaseEndTime = nowServer + prepareDur * 1000;
        gameState.phaseStartTime = new Date(nowServer).toISOString();
        gameState.phaseEndTime = new Date(phaseEndTime).toISOString();
        await startPhaseTimerFromEndTime(phaseEndTime);

        enterGuard = false;
        log("✅ 战斗界面加载完成");
    }

    function startGlobalTimer() { if (mainTimer) clearInterval(mainTimer); mainTimer = setInterval(tick, 1000); }

    async function tick() {
        if (!gameState || !gameState.gameStartTime) return;
        if (isAnimating || isInPhaseTransition || isSettling) return;
        const nowSec = await getServerTime();
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const { round, phase, remaining } = calculatePhaseInfo(startSec, nowSec);
        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(remaining, phase);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(phase);
        const roundEl = document.getElementById('round-num'); if (roundEl) roundEl.textContent = round;
        const roundTopEl = document.getElementById('round-num-top'); if (roundTopEl) roundTopEl.textContent = round;
    }

    function bindLeaveButton() {
        const btn = document.getElementById('leave-battle-btn');
        if (!btn) return;
        btn.onclick = async () => {
            if (!confirm("确定退出战斗？")) return;
            clearAllTimers(); clearInterval(mainTimer); clearInterval(pollingInterval);
            if (gameSubscription) gameSubscription.unsubscribe();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null; enterGuard = false;
        };
    }

    function stopPolling() { if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; } }
    let autoBotTimer = null;
    function startBotAutoPlay() { if (autoBotTimer) clearInterval(autoBotTimer); autoBotTimer = setInterval(async () => {}, 2000); }

    function initDebugPanel() {
        const old = document.getElementById('battle-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'battle-debug-panel';
        p.style.cssText = `position:fixed; top:0; left:0; right:0; bottom:0; overflow-y:auto; color:#7bffb1; font-size:12px; padding:8px; z-index:100000; font-family:monospace; pointer-events:none; background:transparent; display:flex; flex-direction:column-reverse;`;
        document.body.appendChild(p);
    }

    function log(msg, isError = false) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        const panel = document.getElementById('battle-debug-panel');
        if (!panel) return;
        const line = document.createElement('div');
        line.style.color = isError ? '#ff6666' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        panel.insertBefore(line, panel.firstChild);
        while (panel.children.length > 100) panel.removeChild(panel.lastChild);
    }

    function toast(msg, isError = false) {
        if (window.YYCardShop?.toast) window.YYCardShop.toast(msg, isError);
        else alert(msg);
    }

    return {
        enterBattle,
        getGameState: () => gameState,
        getCurrentRoomId: () => currentRoomId,
        forceRefreshState: refreshGameState,
        fetchGameState
    };
})();

console.log('✅ battle.js 加载完成（最终修正版）');

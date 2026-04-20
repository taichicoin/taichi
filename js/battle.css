// ==================== 纯时间驱动对战系统（支持战斗动画） ====================
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
    let isAnimating = false;        // 动画播放中，防止阶段切换

    const BUFFER_DURATION = 3;
    function getPrepareDuration(round) { return 27 + (round - 1) * 10; }
    function getBattleDuration(round)  { return 30 + (round - 1) * 5; }

    const SETTLEMENT_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

    // ========== 服务器时间 ==========
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

    // ========== 阶段计算 ==========
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
                if (elapsed < prep) {
                    return { round, phase: 'prepare', remaining: prep - elapsed };
                } else if (elapsed < prep + buf) {
                    return { round, phase: 'buffering', remaining: prep + buf - elapsed };
                } else {
                    return { round, phase: 'battle', remaining: prep + buf + bat - elapsed };
                }
            }
        }
        return { round: 1, phase: 'prepare', remaining: getPrepareDuration(1) };
    }

    // ========== 数据库操作 ==========
    async function fetchGameState() {
        if (!currentRoomId) return null;
        const { data, error } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', currentRoomId)
            .maybeSingle();
        if (error) {
            log(`❌ 拉取状态失败: ${error.message}`, true);
            return null;
        }
        if (!data?.state) return null;
        const s = data.state;
        return { players: s.players, gameStartTime: s.gameStartTime };
    }

    async function updatePlayersToDB() {
        if (!currentRoomId || !gameState) return;
        const payload = {
            players: gameState.players,
            gameStartTime: gameState.gameStartTime
        };
        const { error } = await supabase
            .from('game_states')
            .update({ state: payload })
            .eq('room_id', currentRoomId);
        if (error) log(`❌ 更新玩家数据失败: ${error.message}`, true);
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

    // ========== 结算接口 ==========
    async function callSettlement() {
        if (isSettling) return;
        isSettling = true;
        log("⚔️ 战斗阶段结束，调用结算接口...");
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                log("❌ 无会话，无法结算", true);
                isSettling = false;
                return;
            }
            const res = await fetch(SETTLEMENT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ roomId: currentRoomId })
            });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.error || '结算失败');
            log(`✅ 结算成功，新回合: ${result.newRound || result.round}`);
            await refreshGameState();
        } catch (err) {
            log(`❌ 结算失败: ${err.message}`, true);
        } finally {
            isSettling = false;
        }
    }

    // ========== 战斗动画播放 ==========
    async function playAttackEvent(event, boardElements) {
        return new Promise(resolve => {
            // 获取攻击者和目标的DOM元素
            const attackerSide = event.attackerSide === 1 ? 'left' : 'right';
            const targetSide = attackerSide === 'left' ? 'right' : 'left';
            const attackerEl = boardElements[attackerSide][event.attacker.pos];
            const targetEl = boardElements[targetSide][event.target.pos];
            if (!attackerEl || !targetEl) {
                resolve();
                return;
            }
            // 高亮攻击者
            attackerEl.classList.add('attacking');
            setTimeout(() => {
                attackerEl.classList.remove('attacking');
                // 显示伤害数字
                showDamageNumber(targetEl, event.damage);
                // 更新目标卡牌血量显示
                updateCardHp(targetEl, event.newHp);
                if (event.targetDead) {
                    targetEl.classList.add('dying');
                }
                setTimeout(resolve, 300);
            }, 200);
        });
    }

    function showDamageNumber(element, damage) {
        const div = document.createElement('div');
        div.className = 'damage-number';
        div.textContent = `-${damage}`;
        element.style.position = 'relative';
        element.appendChild(div);
        setTimeout(() => div.remove(), 800);
    }

    function updateCardHp(element, newHp) {
        const hpSpan = element.querySelector('.card-hp');
        if (hpSpan) hpSpan.textContent = newHp;
    }

    // 获取棋盘所有卡牌DOM元素
    function getBoardElements() {
        const leftBoard = document.getElementById('my-board');    // 我方棋盘
        const rightBoard = document.getElementById('enemy-board'); // 敌方棋盘
        if (!leftBoard || !rightBoard) return null;
        const leftCards = [];
        const rightCards = [];
        for (let i = 0; i < 6; i++) {
            const leftSlot = leftBoard.children[i];
            leftCards.push(leftSlot ? leftSlot.querySelector('.card') : null);
            const rightSlot = rightBoard.children[i];
            rightCards.push(rightSlot ? rightSlot.querySelector('.card') : null);
        }
        return { left: leftCards, right: rightCards };
    }

    // 播放所有配对战斗动画
    async function playCombatAnimations(combatEvents) {
        isAnimating = true;
        const boardElements = getBoardElements();
        if (!boardElements) {
            log("❌ 无法获取棋盘DOM元素，跳过动画", true);
            isAnimating = false;
            return;
        }
        for (const pair of combatEvents) {
            if (pair.p2Id === null) continue; // 轮空
            for (const event of pair.events) {
                await playAttackEvent(event, boardElements);
            }
        }
        isAnimating = false;
    }

    // ========== 战斗模拟（带动画） ==========
    async function simulateBattleWithAnimation() {
        if (!window.YYCardCombat) {
            log('❌ 战斗模块未加载', true);
            return;
        }
        // 获取最新状态
        await fetchGameState();
        // 生成攻击事件序列（不修改血量）
        const combatEvents = await window.YYCardCombat.resolveBattlesWithEvents(gameState);
        // 播放动画
        await playCombatAnimations(combatEvents);
        // 应用战斗结果（修改血量）
        window.YYCardCombat.applyCombatResult(gameState, combatEvents);
        // 写回数据库
        await updatePlayersToDB();
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
        log("⚔️ 战斗动画播放完成，血量已更新");
    }

    // 旧版同步战斗（无动画，回退用）
    async function simulateBattleSync() {
        if (!window.YYCardCombat) return;
        await fetchGameState();
        await window.YYCardCombat.resolveBattles(gameState, log, async () => {
            if (currentRoomId && gameState) await updatePlayersToDB();
        });
    }

    // ========== 全局计时器 ==========
    let currentPhase = null;
    async function tick() {
        if (!gameState || !gameState.gameStartTime) return;

        const nowSec = await getServerTime();
        const startSec = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const { round, phase, remaining } = calculatePhaseInfo(startSec, nowSec);

        gameState.phase = phase;
        gameState.round = round;

        if (window.YYCardShop?.updateTimerDisplay) window.YYCardShop.updateTimerDisplay(remaining, phase);
        if (window.YYCardShop?.setPhase) window.YYCardShop.setPhase(phase);

        const roundEl = document.getElementById('round-num');
        if (roundEl) roundEl.textContent = round;
        const roundTopEl = document.getElementById('round-num-top');
        if (roundTopEl) roundTopEl.textContent = round;

        if (currentPhase !== phase) {
            applyUIMode(phase === 'prepare');
            if (currentPhase === 'battle' && phase !== 'battle' && !isSettling && !isAnimating) {
                log("⚡ 战斗阶段结束（阶段切换），触发结算");
                await callSettlement();
            }
            currentPhase = phase;
        }
    }

    function startGlobalTimer() {
        if (mainTimer) clearInterval(mainTimer);
        mainTimer = setInterval(tick, 1000);
    }

    function applyUIMode(isPrepare) {
        try { document.body.classList.toggle('battle-view-mode', !isPrepare); } catch(e) {}
        const prepareTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';
    }

    // ========== 数据合并（保护乐观更新） ==========
    function mergePlayersData(currentPlayers, newPlayers, currentUserId) {
        const result = { ...currentPlayers };
        for (const [pid, newPlayer] of Object.entries(newPlayers)) {
            if (pid === currentUserId) {
                result[pid] = {
                    ...result[pid],
                    gold: newPlayer.gold,
                    exp: newPlayer.exp,
                    shopLevel: newPlayer.shopLevel,
                    health: newPlayer.health,
                    isBot: newPlayer.isBot,
                    isEliminated: newPlayer.isEliminated,
                    isReady: newPlayer.isReady,
                };
            } else {
                result[pid] = newPlayer;
            }
        }
        return result;
    }

    function subscribeGameState() {
        if (gameSubscription) gameSubscription.unsubscribe();
        gameSubscription = supabase.channel(`game:${currentRoomId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'game_states',
                filter: `room_id=eq.${currentRoomId}`
            }, async (payload) => {
                const newState = payload.new.state;
                if (newState && newState.players) {
                    const currentUserId = auth?.currentUser?.id;
                    if (currentUserId) {
                        gameState.players = mergePlayersData(gameState.players, newState.players, currentUserId);
                    } else {
                        gameState.players = newState.players;
                    }
                    if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
                }
            })
            .subscribe();
    }

    function startPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(async () => {
            if (!currentRoomId) return;
            const { data } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', currentRoomId)
                .maybeSingle();
            if (data?.state && data.state.players) {
                const currentUserId = auth?.currentUser?.id;
                if (currentUserId) {
                    gameState.players = mergePlayersData(gameState.players, data.state.players, currentUserId);
                } else {
                    gameState.players = data.state.players;
                }
                if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            }
        }, 2000);
    }

    // ========== 进入战斗 ==========
    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;
        currentRoomId = roomId;

        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initDebugPanel();

        let loaded = false;
        for (let i = 0; i < 20; i++) {
            const state = await fetchGameState();
            if (state) {
                gameState = state;
                gameState.phase = 'prepare';
                gameState.round = 1;
                loaded = true;
                break;
            }
            await new Promise(r => setTimeout(r, 200));
        }
        if (!loaded) {
            toast("游戏状态加载失败，请刷新页面重试", true);
            enterGuard = false;
            return;
        }

        if (!gameState.gameStartTime) {
            gameState.gameStartTime = new Date().toISOString();
            await updatePlayersToDB();
        }

        if (window.YYCardShop?.init) window.YYCardShop.init();
        if (window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();

        subscribeGameState();
        startPolling();
        startGlobalTimer();
        bindLeaveButton();

        enterGuard = false;
        log("✅ 战斗界面加载完成");
    }

    function bindLeaveButton() {
        const btn = document.getElementById('leave-battle-btn');
        if (!btn) return;
        btn.onclick = async () => {
            if (!confirm("确定退出战斗？")) return;
            clearInterval(mainTimer);
            clearInterval(pollingInterval);
            if (gameSubscription) gameSubscription.unsubscribe();
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            gameState = currentRoomId = null;
        };
    }

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

    // ========== 导出接口 ==========
    return {
        enterBattle,
        getGameState: () => gameState,
        getCurrentRoomId: () => currentRoomId,
        forceRefreshState: refreshGameState,
        fetchGameState
    };
})();

console.log('✅ battle.js 加载完成（支持战斗动画）');

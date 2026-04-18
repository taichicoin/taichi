// ==================== 对战系统（后端驱动版-完整修复版） ====================
window.YYCardBattle = (function() {
    // 依赖容错处理，避免未加载时报错阻断执行
    const supabase = window.supabase;
    const auth = window.YYCardAuth || {};
    const utils = window.YYCardUtils || {};
    const config = window.YYCardConfig || {
        MAX_SHOP_LEVEL: 5,
        ECONOMY: {
            GOLD_PER_ROUND: (round) => Math.min(5 + round, 10),
            EXP_PER_ROUND: 1
        }
    };

    // ==================== 核心状态变量（修复：提前声明所有变量，避免未定义报错） ====================
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
    let pollingInterval = null;
    let eliminationOrder = [];
    let safetyTimer = null; // 修复：提前声明safetyTimer，避免ReferenceError

    // 常量配置
    const BUFFER_DURATION = 2;
    const SETTLE_DURATION = 3;

    // 回合时长计算
    function getPrepareDuration(round) { return 25 + (round - 1) * 10; }
    function getBattleDuration(round) { return 30 + (round - 1) * 5; }

    // ==================== 调试日志系统 ====================
    function initDebugPanel() {
        const old = document.getElementById('battle-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'battle-debug-panel';
        p.style.cssText = `
            position:fixed; top:120px; left:0; right:0; max-height:120px; overflow-y:auto;
            color:#0ff; font-size:11px; padding:4px 8px;
            z-index:100000;
            font-family:monospace; pointer-events:none; text-shadow:0 0 4px black;
            background: transparent;
            border: none;
        `;
        document.body.appendChild(p);
        return p;
    }

    function logToScreen(msg, isError = false, persistent = false) {
        const p = document.getElementById('battle-debug-panel') || initDebugPanel();
        const line = document.createElement('div');
        line.style.color = isError ? '#ff7b7b' : '#7bffff';
        line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
        p.appendChild(line);
        p.scrollTop = p.scrollHeight;
        if (!persistent) {
            while (p.children.length > 30) p.removeChild(p.firstChild);
        }
    }

    function log(msg, isError = false, persistent = false) {
        console[isError ? 'error' : 'log'](`[YYCardBattle] ${msg}`);
        logToScreen(msg, isError, persistent);
    }

    function toast(msg, isError = false) {
        if (window.YYCardShop?.toast) {
            window.YYCardShop.toast(msg, isError);
        } else {
            isError ? console.error(msg) : console.log(msg);
            alert(msg);
        }
    }

    // 对外暴露游戏状态（shop.js依赖）
    function getGameState() {
        return gameState;
    }

    // ==================== 【核心重写】游戏状态同步函数（修复：完全修正数据流向） ====================
    // 正确逻辑：从数据库拉取最新状态 → 更新本地gameState → 通知shop.js刷新UI
    // 彻底废弃原代码用本地旧数据覆盖后端的错误逻辑
    async function syncGameStateFromDB(forceRefreshUI = true) {
        if (!currentRoomId) {
            log('同步状态失败：房间ID为空', true);
            return false;
        }

        try {
            const { data: fresh, error } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', currentRoomId)
                .single();

            if (error) {
                log(`同步状态失败: ${error.message}`, true);
                return false;
            }

            if (fresh?.state) {
                // 修复：用后端最新数据覆盖本地，而不是反过来！
                gameState = fresh.state;
                log(`✅ 已从数据库同步最新游戏状态，回合:${gameState.round}, 阶段:${gameState.phase}`);

                // 强制刷新UI（修复：准备阶段也会刷新商店UI）
                if (forceRefreshUI && window.YYCardShop?.refreshAllUI) {
                    window.YYCardShop.refreshAllUI();
                }

                // 同步阶段状态给shop.js（修复：刷新按钮禁用问题）
                if (window.YYCardShop?.setPhase) {
                    window.YYCardShop.setPhase(gameState.phase);
                }

                return true;
            }
            return false;
        } catch (err) {
            log(`同步状态异常: ${err.message}`, true);
            return false;
        }
    }

    // 【保留仅用于本地修改后写入数据库】本地状态写入数据库（仅阶段切换、战斗结算时使用）
    async function writeGameStateToDB() {
        if (!currentRoomId || !gameState || isUpdatingFromLocal) return;

        isUpdatingFromLocal = true;
        try {
            const { error: updateError } = await supabase
                .from('game_states')
                .update({ state: gameState })
                .eq('room_id', currentRoomId);

            if (updateError) {
                log(`写入状态失败: ${updateError.message}`, true);
                return false;
            }
            log(`✅ 已将本地状态写入数据库`);
            return true;
        } catch (err) {
            log(`写入状态异常: ${err.message}`, true);
            return false;
        } finally {
            setTimeout(() => { isUpdatingFromLocal = false; }, 100);
        }
    }

    // 商店等级计算
    function getShopLevelByExp(exp) {
        if (exp >= 46) return 5;
        if (exp >= 26) return 4;
        if (exp >= 12) return 3;
        if (exp >= 4) return 2;
        return 1;
    }

    // ==================== 计时器管理（修复：清除所有计时器，避免内存泄漏） ====================
    function clearAllTimers() {
        if (phaseTimer) { 
            clearTimeout(phaseTimer); 
            phaseTimer = null; 
        }
        if (timerInterval) { 
            clearInterval(timerInterval); 
            timerInterval = null; 
        }
        if (safetyTimer) { 
            clearTimeout(safetyTimer); 
            safetyTimer = null; 
        }
        log('✅ 所有计时器已清除');
    }

    // 阶段计时器启动（修复：时间计算逻辑，避免倒计时错乱）
    function startPhaseTimer(phase, duration, skipStateUpdate = false) {
        // 时长容错
        if (!duration || isNaN(duration) || duration <= 0) {
            let fallback = 3;
            if (phase === 'prepare') fallback = getPrepareDuration(gameState?.round || 1);
            else if (phase === 'battle') fallback = getBattleDuration(gameState?.round || 1);
            else if (phase === 'settle') fallback = SETTLE_DURATION;
            log(`⚠️ 收到无效时长，使用后备值 ${fallback}s`, true);
            duration = fallback;
        }

        // 先清除旧计时器
        clearAllTimers();
        currentPhaseDuration = duration;

        // 更新阶段状态
        if (!skipStateUpdate) {
            gameState.phaseStartTime = new Date().toISOString();
            currentPhaseStartTime = Date.now();
            writeGameStateToDB();
        } else {
            currentPhaseStartTime = Date.now() - (getPhaseDuration(phase, gameState.round) - duration) * 1000;
        }

        // 同步给shop.js
        if (window.YYCardShop?.updateTimerDisplay) {
            window.YYCardShop.updateTimerDisplay(duration, phase);
        }
        if (window.YYCardShop?.setPhase) {
            window.YYCardShop.setPhase(phase);
        }

        // 倒计时刷新
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - currentPhaseStartTime) / 1000);
            const remaining = Math.max(0, currentPhaseDuration - elapsed);
            if (window.YYCardShop?.updateTimerDisplay) {
                window.YYCardShop.updateTimerDisplay(remaining, phase);
            }
        }, 100);

        // 阶段结束主计时器
        phaseTimer = setTimeout(() => {
            clearAllTimers();
            onPhaseEnd(phase);
        }, duration * 1000);

        // 超时保护计时器
        safetyTimer = setTimeout(() => {
            if (phaseTimer) {
                log(`⚠️ 阶段 ${phase} 超时未响应，强制结束`, true);
                clearAllTimers();
                onPhaseEnd(phase);
            }
        }, (duration + 2) * 1000);

        log(`⏱️ 阶段 ${phase} 计时器启动，时长 ${duration}s`);
    }

    // 缓冲期处理
    async function startBuffering(targetPhase) {
        log(`⏳ 进入缓冲期 ${BUFFER_DURATION} 秒，准备切换到 ${targetPhase} 阶段`);
        if (window.YYCardShop?.setPhase) {
            window.YYCardShop.setPhase('buffering');
        }
        if (window.YYCardShop?.updateTimerDisplay) {
            window.YYCardShop.updateTimerDisplay(BUFFER_DURATION, 'buffering');
        }
        await new Promise(resolve => setTimeout(resolve, BUFFER_DURATION * 1000));
    }

    // ==================== 阶段生命周期管理 ====================
    async function onPhaseEnd(phase) {
        if (isInPhaseTransition) { 
            log(`⚠️ 阶段切换被锁拦截: ${phase}`, true); 
            return; 
        }
        if (!gameState || !currentRoomId) return;

        // 阶段切换锁
        isInPhaseTransition = true;
        const lockTimeout = setTimeout(() => { 
            if (isInPhaseTransition) { 
                log(`⚠️ 阶段切换锁超时，强制释放`, true); 
                isInPhaseTransition = false; 
            } 
        }, 12000);

        log(`🔄 阶段结束: ${phase}`);
        try {
            // 准备阶段 → 战斗阶段
            if (phase === 'prepare') {
                await startBuffering('battle');
                gameState.phase = 'battle';
                gameState.phaseStartTime = new Date().toISOString();
                await writeGameStateToDB();
                await applyUIMode(false);
                startPhaseTimer('battle', getBattleDuration(gameState.round));
                await simulateBattle();
            } 
            // 战斗阶段 → 结算阶段
            else if (phase === 'battle') {
                gameState.phase = 'settle';
                gameState.phaseStartTime = new Date().toISOString();
                await writeGameStateToDB();
                await applyUIMode(false);
                startPhaseTimer('settle', SETTLE_DURATION);
            } 
            // 结算阶段 → 下一回合准备阶段
            else if (phase === 'settle') {
                await distributeRoundRewards();
                const over = checkGameOver();
                if (over.isOver) {
                    endGame(over.winner);
                    clearTimeout(lockTimeout);
                    return;
                }
                // 进入下一回合
                gameState.round++;
                gameState.phase = 'prepare';
                gameState.phaseStartTime = new Date().toISOString();
                await writeGameStateToDB();
                await applyUIMode(true);
                // 通知前端刷新
                const newPrepareDur = getPrepareDuration(gameState.round);
                log(`🔁 进入第 ${gameState.round} 回合准备阶段，时长 ${newPrepareDur} 秒`);
                startPhaseTimer('prepare', newPrepareDur);
            }
        } catch (e) {
            log(`❌ 阶段结束处理出错: ${e.message}`, true);
        } finally {
            clearTimeout(lockTimeout);
            isInPhaseTransition = false;
        }
    }

    // UI模式切换（修复：准备阶段也会同步数据+刷新UI）
    async function applyUIMode(isPrepare) {
        try { 
            document.body.classList.toggle('battle-view-mode', !isPrepare); 
        } catch (e) {
            log(`UI模式切换异常: ${e.message}`, true);
        }

        // 同步阶段给shop.js
        const currentPhase = gameState?.phase || 'prepare';
        if (window.YYCardShop?.setPhase) {
            window.YYCardShop.setPhase(isPrepare ? 'prepare' : currentPhase);
        }

        // 计时器显示切换
        const prepareTimer = document.getElementById('phase-timer');
        const battleTimer = document.getElementById('phase-timer-battle');
        if (prepareTimer) prepareTimer.style.display = isPrepare ? 'block' : 'none';
        if (battleTimer) battleTimer.style.display = isPrepare ? 'none' : 'block';

        // 修复：无论什么阶段，都同步最新数据库数据+刷新UI
        await syncGameStateFromDB(true);
    }

    // 战斗模拟
    async function simulateBattle() {
        try {
            // 先同步最新状态
            await syncGameStateFromDB(false);
            // 调用战斗模块（如果存在）
            if (window.YYCardCombat?.resolveBattles) {
                await window.YYCardCombat.resolveBattles(gameState, log, writeGameStateToDB);
            } else {
                log(`⚠️ 战斗模块未加载，跳过战斗模拟`);
                await writeGameStateToDB();
            }
        } catch (e) {
            log(`❌ 战斗模拟出错: ${e.message}`, true);
        }
    }

    // 回合奖励发放
    async function distributeRoundRewards() {
        const round = gameState.round;
        const goldAdd = config.ECONOMY.GOLD_PER_ROUND(round);
        const expAdd = config.ECONOMY.EXP_PER_ROUND;

        for (const pid in gameState.players) {
            const p = gameState.players[pid];
            p.gold += goldAdd;
            p.exp += expAdd;
            const newLevel = getShopLevelByExp(p.exp);
            if (newLevel > p.shopLevel) p.shopLevel = newLevel;
        }

        await writeGameStateToDB();
        log(`✅ 回合奖励已发放，金币+${goldAdd}，经验+${expAdd}`);
    }

    // 游戏结束检查
    function checkGameOver() {
        const players = gameState.players;
        const alive = Object.values(players).filter(p => p.health > 0 && !p.isEliminated);

        // 记录淘汰信息
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

        // 游戏结束判断
        if (alive.length <= 1) {
            const winner = alive[0] 
                ? Object.keys(players).find(id => players[id] === alive[0]) 
                : eliminationOrder[eliminationOrder.length - 1];
            
            if (alive[0] && !eliminationOrder.includes(winner)) {
                eliminationOrder.push(winner);
                log(`🏆 玩家 ${winner.slice(0,8)} 获得第 1 名`, false, true);
            }
            return { isOver: true, winner };
        }
        return { isOver: false };
    }

    // 游戏结束处理
    function endGame(winnerId) {
        stopPolling();
        isInPhaseTransition = false;
        const rankings = [...eliminationOrder].reverse();
        
        // 输出排名
        let rankMsg = `📋 最终排名：\n`;
        rankings.forEach((id, index) => { 
            rankMsg += `  第${index + 1}名: ${id.slice(0,8)}\n`; 
        });
        log(rankMsg, false, true);
        toast(`游戏结束！胜利者: ${winnerId.slice(0,8)}`);

        // 清理所有资源
        clearAllTimers();
        if (autoBotTimer) { 
            clearInterval(autoBotTimer); 
            autoBotTimer = null; 
        }
        if (gameSubscription) { 
            gameSubscription.unsubscribe(); 
            gameSubscription = null; 
        }
        eliminationOrder = [];

        // 清理shop.js状态
        if (window.YYCardShop?.setRoomId) {
            window.YYCardShop.setRoomId(null);
        }
        if (window.YYCardShop?.setPhase) {
            window.YYCardShop.setPhase('idle');
        }

        // 切换视图
        setTimeout(() => {
            const battleView = document.getElementById('battle-view');
            const lobbyView = document.getElementById('lobby-view');
            if (battleView) battleView.style.display = 'none';
            if (lobbyView) lobbyView.style.display = 'block';
            gameState = null;
            currentRoomId = null;
            enterGuard = false;
        }, 3000);
    }

    // 断线重连快进逻辑
    async function fastForwardAndResume() {
        if (!gameState || !gameState.gameStartTime) return false;
        
        const start = new Date(gameState.gameStartTime).getTime();
        const now = Date.now();
        let elapsed = Math.floor((now - start) / 1000);
        let round = 1, phase = 'prepare', remaining = 0;

        // 计算当前应该处于的回合和阶段
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
                if (elapsed < prep) { 
                    phase = 'prepare'; 
                    remaining = prep - elapsed; 
                } else if (elapsed < prep + buf) { 
                    phase = 'buffering'; 
                    remaining = prep + buf - elapsed; 
                } else if (elapsed < prep + buf + bat) { 
                    phase = 'battle'; 
                    remaining = prep + buf + bat - elapsed; 
                } else { 
                    phase = 'settle'; 
                    remaining = total - elapsed; 
                }
                break;
            }
        }

        // 更新游戏状态
        gameState.round = round;
        gameState.phase = phase;
        gameState.phaseStartTime = new Date(now - (getPhaseDuration(phase, round) - remaining) * 1000).toISOString();
        await writeGameStateToDB();

        // 恢复UI和计时器
        await applyUIMode(phase === 'prepare');
        clearAllTimers();
        startPhaseTimer(phase, remaining, true);

        log(`✅ 断线重连完成，当前回合:${round}, 阶段:${phase}, 剩余时长:${remaining}s`);
        return true;
    }

    // 阶段时长获取
    function getPhaseDuration(phase, round) {
        if (phase === 'prepare') return getPrepareDuration(round);
        if (phase === 'buffering') return BUFFER_DURATION;
        if (phase === 'battle') return getBattleDuration(round);
        if (phase === 'settle') return SETTLE_DURATION;
        return 3;
    }

    // ==================== 【核心修复】进入对局入口（修正房间ID传递时机） ====================
    async function enterBattle(roomId) {
        if (enterGuard) {
            log(`⚠️ 正在进入对局，重复请求被拦截`, true);
            return;
        }
        enterGuard = true;
        currentRoomId = roomId;
        eliminationOrder = [];

        log(`🎮 开始进入对局，房间ID: ${roomId}`);

        // 视图切换
        const lobbyView = document.getElementById('lobby-view');
        const battleView = document.getElementById('battle-view');
        if (lobbyView) lobbyView.style.display = 'none';
        if (battleView) battleView.style.display = 'block';

        // 初始化调试面板
        initDebugPanel();

        // 【修复：先等待shop.js加载完成，再传递房间ID】
        let shopReady = false;
        log(`⏳ 等待shop.js加载完成...`);
        for (let i = 0; i < 50; i++) { // 最多等待5秒
            if (window.YYCardShop && typeof window.YYCardShop.init === 'function') {
                window.YYCardShop.init();
                // 【修复：shop.js初始化完成后，再设置房间ID】
                if (window.YYCardShop.setRoomId) {
                    window.YYCardShop.setRoomId(roomId);
                }
                shopReady = true;
                log(`✅ shop.js加载完成，房间ID已传递`);
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        if (!shopReady) {
            log(`⚠️ shop.js加载超时，部分功能可能异常`, true);
            toast('商店模块加载超时', true);
        }

        // 【修复：先同步数据库初始状态，再启动订阅和轮询】
        let initialLoadSuccess = false;
        let attempts = 0; 
        const MAX_ATTEMPTS = 15;
        while (attempts < MAX_ATTEMPTS) {
            attempts++;
            const { data } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', roomId)
                .maybeSingle();
            
            if (data?.state) {
                gameState = data.state;
                initialLoadSuccess = true;
                log(`✅ 初始游戏状态加载完成，回合:${gameState.round}, 阶段:${gameState.phase}`);
                break;
            }
            await new Promise(r => setTimeout(r, 200));
        }

        if (!initialLoadSuccess) {
            toast('游戏状态加载失败', true);
            enterGuard = false;
            return;
        }

        // 初始化游戏开始时间
        if (!gameState.gameStartTime) {
            gameState.gameStartTime = new Date().toISOString();
            await writeGameStateToDB();
        }

        // 启动数据库实时订阅
        subscribeToGame(roomId);
        // 启动轮询兜底
        startPolling();
        // 绑定事件
        bindBattleEvents();
        // 启动机器人自动操作
        startBotAutoPlay();

        // 断线重连快进
        const resumed = await fastForwardAndResume();
        if (!resumed) {
            const phase = gameState.phase;
            const round = gameState.round;
            await applyUIMode(phase === 'prepare');
            if (gameState.phaseStartTime) {
                const st = new Date(gameState.phaseStartTime).getTime();
                const el = Math.floor((Date.now() - st) / 1000);
                const total = getPhaseDuration(phase, round);
                const rem = Math.max(0, total - el);
                if (rem <= 0) {
                    onPhaseEnd(phase);
                } else {
                    currentPhaseStartTime = st;
                    startPhaseTimer(phase, rem, true);
                }
            } else {
                startPhaseTimer(phase, getPhaseDuration(phase, round));
            }
        }

        enterGuard = false;
        log(`✅ 对局初始化完成`);
    }

    // ==================== 数据库实时订阅（修复：所有阶段都会刷新UI） ====================
    function subscribeToGame(roomId) {
        if (gameSubscription) {
            gameSubscription.unsubscribe();
            gameSubscription = null;
        }

        gameSubscription = supabase.channel(`game:${roomId}`)
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'game_states', 
                filter: `room_id=eq.${roomId}` 
            }, (payload) => {
                // 跳过本地写入触发的更新
                if (isUpdatingFromLocal) return;

                const newState = payload.new.state;
                if (!newState) return;

                // 【修复：更新本地状态，强制刷新UI】
                gameState = newState;
                log(`🔔 收到数据库实时更新，回合:${gameState.round}, 阶段:${gameState.phase}`);

                // 同步阶段给shop.js
                if (window.YYCardShop?.setPhase) {
                    window.YYCardShop.setPhase(gameState.phase);
                }
                // 强制刷新商店UI
                if (window.YYCardShop?.refreshAllUI) {
                    window.YYCardShop.refreshAllUI();
                }
                // 切换UI模式
                applyUIMode(gameState.phase === 'prepare');
            })
            .subscribe();

        log(`✅ 数据库实时订阅已启动`);
    }

    // ==================== 轮询兜底（修复：所有阶段都会同步数据） ====================
    function startPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }

        pollingInterval = setInterval(async () => {
            if (!currentRoomId || isInPhaseTransition || isUpdatingFromLocal) return;
            await syncGameStateFromDB(true);
        }, 2000);

        log(`✅ 状态轮询已启动`);
    }

    function stopPolling() {
        if (pollingInterval) { 
            clearInterval(pollingInterval); 
            pollingInterval = null; 
        }
        log(`✅ 状态轮询已停止`);
    }

    // ==================== 机器人自动操作 ====================
    function startBotAutoPlay() {
        if (autoBotTimer) {
            clearInterval(autoBotTimer);
            autoBotTimer = null;
        }

        const boughtRoundMap = {};
        autoBotTimer = setInterval(async () => {
            if (!gameState || gameState.phase !== 'prepare') return;

            const uid = auth.currentUser?.id;
            const my = gameState.players?.[uid];
            if (!my || !my.isBot) return;

            const currentRound = gameState.round;
            if (boughtRoundMap[uid] === currentRound) return;
            if (my.shopLevel >= config.MAX_SHOP_LEVEL) return;
            if (my.gold >= 1) {
                my.gold--;
                my.exp++;
                const newLevel = getShopLevelByExp(my.exp);
                if (newLevel > my.shopLevel) my.shopLevel = newLevel;
                await writeGameStateToDB();
                boughtRoundMap[uid] = currentRound;
                log(`🤖 机器人玩家已购买经验，当前等级:${my.shopLevel}`);
            }
        }, 2000);

        log(`✅ 机器人自动操作已启动`);
    }

    // ==================== 事件绑定 ====================
    function bindBattleEvents() {
        const leaveBtn = document.getElementById('leave-battle-btn');
        if (leaveBtn) {
            leaveBtn.replaceWith(leaveBtn.cloneNode(true));
            const newLeaveBtn = document.getElementById('leave-battle-btn');
            newLeaveBtn.addEventListener('click', async () => {
                if(!confirm('确定退出对局？退出后将无法重新进入')) return;
                
                // 清理所有资源
                clearAllTimers();
                stopPolling();
                if (autoBotTimer) { 
                    clearInterval(autoBotTimer); 
                    autoBotTimer = null; 
                }
                if (window.YYCardMatchmaking?.cancel) {
                    await window.YYCardMatchmaking.cancel();
                }
                if (gameSubscription) {
                    gameSubscription.unsubscribe();
                    gameSubscription = null;
                }

                // 清理状态
                const battleView = document.getElementById('battle-view');
                const lobbyView = document.getElementById('lobby-view');
                if (battleView) battleView.style.display = 'none';
                if (lobbyView) lobbyView.style.display = 'block';
                
                gameState = null;
                currentRoomId = null;
                enterGuard = false;

                // 清理shop.js
                if (window.YYCardShop?.setRoomId) {
                    window.YYCardShop.setRoomId(null);
                }
            });
        }
        log(`✅ 对局事件绑定完成`);
    }

    // 对外暴露接口
    return {
        enterBattle,
        getGameState
    };
})();

console.log('✅ battle.js 加载完成（完整修复版，已适配shop.js）');

// ==================== 对战核心系统【修复完整版：加回战斗阶段隐藏功能】 ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const config = window.YYCardConfig;
    const combat = window.YYCardCombat;

    // 全局状态
    let currentRoomId = null;
    let gameState = null;
    let gameSubscription = null;
    let phaseTimer = null;
    let isInPhaseTransition = false;
    let isGameOver = false;

    // 常量配置【和后端完全对齐，杜绝错位】
    const BUFFER_DURATION = 2;
    const SETTLE_DURATION = 3;
    const SETTLEMENT_FUNCTION_URL = config.SETTLEMENT_FUNCTION_URL || 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

    // 调试日志
    function log(msg, isError = false) {
        const prefix = `[对战系统] ${msg}`;
        if (auth && typeof auth.log === 'function') {
            auth.log(prefix, isError);
        } else {
            isError ? console.error(prefix) : console.log(prefix);
        }
        // 输出到调试面板
        const debugPanel = document.getElementById('debug-panel');
        if (debugPanel) {
            const line = document.createElement('div');
            line.style.color = isError ? '#ff7b7b' : '#7bffb1';
            line.textContent = `[${new Date().toLocaleTimeString()}] ${prefix}`;
            debugPanel.appendChild(line);
            debugPanel.scrollTop = debugPanel.scrollHeight;
            while (debugPanel.children.length > 40) debugPanel.removeChild(debugPanel.firstChild);
        }
    }

    // 时长公式【和后端100%一致】
    function getPrepareDuration(round) { return 25 + (round - 1) * 10; }
    function getBattleDuration(round) { return 30 + (round - 1) * 5; }

    // 获取当前玩家ID
    function getMyUserId() {
        return auth?.currentUser?.id || null;
    }

    // 清理所有定时器和订阅 + 清除阶段类名
    function cleanup() {
        if (phaseTimer) {
            clearInterval(phaseTimer);
            phaseTimer = null;
            log('✅ 阶段计时器已清理');
        }
        if (gameSubscription) {
            gameSubscription.unsubscribe();
            gameSubscription = null;
            log('✅ 游戏订阅已清理');
        }
        // 清除所有战斗相关的body类名
        document.body.classList.remove('prepare-mode', 'buffering-mode', 'battle-mode', 'settle-mode');
        isInPhaseTransition = false;
        isGameOver = false;
    }

    // 强制刷新游戏状态【修复版：覆盖本地状态，确保和数据库一致】
    async function forceRefreshState() {
        if (!currentRoomId) {
            log('⚠️ 无当前房间ID，无法刷新状态', true);
            return false;
        }
        const { data: fresh, error } = await supabase
            .from('game_states')
            .select('state')
            .eq('room_id', currentRoomId)
            .single();
        if (error || !fresh?.state) {
            log(`❌ 拉取最新状态失败: ${error?.message}`, true);
            return false;
        }
        gameState = fresh.state;
        log(`🔄 已同步数据库最新状态，当前回合：${gameState.round}，阶段：${gameState.phase}`);
        
        // 同步回合/血量到DOM
        const roundEl = document.getElementById('round-num');
        const healthEl = document.getElementById('my-health');
        const myId = getMyUserId();
        if (roundEl) roundEl.textContent = gameState.round;
        if (healthEl && myId && gameState.players[myId]) {
            healthEl.textContent = gameState.players[myId].health;
        }

        // 同步阶段到商店模块
        window.YYCardShop?.setPhase?.(gameState.phase);
        // 同步阶段类名到body，触发CSS显示/隐藏
        updateBodyPhaseClass(gameState.phase);
        // 刷新UI
        window.YYCardShop?.refreshAllUI?.();
        return true;
    }

    // ==================== 核心：更新body阶段类名，控制商店/手牌显示隐藏 ====================
    function updateBodyPhaseClass(phase) {
        // 先清除所有阶段类名
        document.body.classList.remove('prepare-mode', 'buffering-mode', 'battle-mode', 'settle-mode');
        // 添加当前阶段类名
        document.body.classList.add(`${phase}-mode`);
        log(`📌 页面阶段模式已切换为: ${phase}-mode`);
    }

    // 更新游戏状态到数据库
    async function updateGameState() {
        if (!currentRoomId || !gameState) return false;
        const { error } = await supabase
            .from('game_states')
            .update({ state: gameState })
            .eq('room_id', currentRoomId);
        if (error) {
            log(`❌ 更新游戏状态失败: ${error.message}`, true);
            return false;
        }
        return true;
    }

    // 进入对战
    async function enterBattle(roomId) {
        log(`🚀 进入对战房间: ${roomId.slice(0,8)}`);
        
        // 先清理旧状态
        cleanup();
        currentRoomId = roomId;
        isGameOver = false;

        // 切换视图
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';

        // 拉取初始游戏状态
        const initSuccess = await forceRefreshState();
        if (!initSuccess) {
            alert('游戏状态加载失败，请返回大厅重试');
            exitBattle();
            return;
        }

        // 订阅游戏状态更新
        subscribeToGameState(roomId);

        // 初始化UI
        await applyUIMode(gameState.phase);
        startPhaseTimer(gameState.phase, getPhaseRemainingTime());

        // 绑定退出按钮
        document.getElementById('leave-battle-btn').onclick = exitBattle;

        // 初始化商店模块
        window.YYCardShop?.init?.();
        log('✅ 对战初始化完成');
    }

    // 退出对战
    async function exitBattle() {
        log('🚪 玩家退出对战');
        cleanup();
        currentRoomId = null;
        gameState = null;

        // 清理房间记录
        const uid = getMyUserId();
        if (uid) {
            await window.YYCardMatchmaking?.leaveAndClean?.();
        }

        // 切换回大厅
        document.getElementById('battle-view').style.display = 'none';
        document.getElementById('lobby-view').style.display = 'block';
        window.location.reload();
    }

    // 订阅游戏状态
    function subscribeToGameState(roomId) {
        log(`📡 开始订阅游戏状态: ${roomId.slice(0,8)}`);
        gameSubscription = supabase
            .channel(`game:${roomId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'game_states',
                filter: `room_id=eq.${roomId}`
            }, async (payload) => {
                const newState = payload.new.state;
                if (!newState) return;

                // 检测回合/阶段变化
                const oldRound = gameState?.round;
                const oldPhase = gameState?.phase;
                gameState = newState;

                if (oldRound !== newState.round || oldPhase !== newState.phase) {
                    log(`📡 游戏状态更新: 回合${oldRound}→${newState.round}，阶段${oldPhase}→${newState.phase}`);
                    onPhaseChange(newState.phase);
                }

                // 刷新UI
                window.YYCardShop?.refreshAllUI?.();
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    log(`✅ 游戏状态订阅成功`);
                }
            });
    }

    // 阶段变化处理
    async function onPhaseChange(newPhase) {
        if (isInPhaseTransition) return;
        
        // 清理旧计时器
        if (phaseTimer) {
            clearInterval(phaseTimer);
            phaseTimer = null;
        }

        // 同步阶段到商店和页面类名
        window.YYCardShop?.setPhase?.(newPhase);
        updateBodyPhaseClass(newPhase);

        // 切换UI模式
        await applyUIMode(newPhase === 'prepare');

        // 启动新计时器
        startPhaseTimer(newPhase, getPhaseRemainingTime());
    }

    // 计算当前阶段剩余时间
    function getPhaseRemainingTime() {
        if (!gameState) return 0;
        const { round, phase, phaseStartTime, gameStartTime } = gameState;
        const now = Date.now();
        const phaseStart = new Date(phaseStartTime || gameStartTime).getTime();
        const elapsed = Math.floor((now - phaseStart) / 1000);

        let totalDuration = 0;
        switch (phase) {
            case 'prepare': totalDuration = getPrepareDuration(round); break;
            case 'buffering': totalDuration = BUFFER_DURATION; break;
            case 'battle': totalDuration = getBattleDuration(round); break;
            case 'settle': totalDuration = SETTLE_DURATION; break;
            default: return 0;
        }

        return Math.max(0, totalDuration - elapsed);
    }

    // 启动阶段计时器
    function startPhaseTimer(phase, duration) {
        if (phaseTimer) clearInterval(phaseTimer);
        let remaining = Math.floor(duration);

        log(`⏱️ 启动${phase}阶段计时器，剩余${remaining}秒`);
        updateTimerDisplay(remaining, phase);

        phaseTimer = setInterval(() => {
            remaining--;
            updateTimerDisplay(remaining, phase);

            if (remaining <= 0) {
                clearInterval(phaseTimer);
                phaseTimer = null;
                onPhaseEnd(phase);
            }
        }, 1000);
    }

    // 更新计时器显示
    function updateTimerDisplay(seconds, phase) {
        window.YYCardShop?.updateTimerDisplay?.(seconds, phase);
        const battleTimerEl = document.getElementById('phase-timer-battle');
        if (battleTimerEl) {
            battleTimerEl.textContent = phase === 'battle' ? `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}` : '00:00';
        }
    }

    // 阶段结束处理【核心修复：结算逻辑完全对齐后端】
    async function onPhaseEnd(phase) {
        if (isInPhaseTransition || isGameOver) return;
        isInPhaseTransition = true;
        
        // 防死锁超时
        const lockTimeout = setTimeout(() => { 
            isInPhaseTransition = false; 
            log('⚠️ 阶段切换锁超时释放', true);
        }, 15000);

        log(`🔄 阶段结束：${phase}`);
        try {
            // 准备阶段结束 → 缓冲期 → 战斗阶段
            if (phase === 'prepare') {
                await startBuffering('battle');
                gameState.phase = 'battle';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                await applyUIMode(false);
                startPhaseTimer('battle', getBattleDuration(gameState.round));
                // 执行战斗模拟
                await simulateBattle();
            } 
            // 战斗阶段结束 → 结算阶段
            else if (phase === 'battle') {
                gameState.phase = 'settle';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                await applyUIMode(false);
                startPhaseTimer('settle', SETTLE_DURATION);
            } 
            // 结算阶段结束 → 调用后端结算 → 新回合准备阶段
            else if (phase === 'settle') {
                // 【核心修复】等待后端结算完成，再拉取最新状态
                const settleResult = await callSettlement();
                if (!settleResult) {
                    log('⚠️ 首次结算失败，重试一次', true);
                    await callSettlement();
                }
                // 强制拉取后端最新状态，覆盖本地
                await forceRefreshState();
                // 检查游戏是否结束
                const overCheck = checkGameOver();
                if (overCheck.isOver) {
                    endGame(overCheck.winner);
                    clearTimeout(lockTimeout);
                    isInPhaseTransition = false;
                    return;
                }
                // 启动新回合准备阶段
                await applyUIMode(true);
                startPhaseTimer('prepare', getPrepareDuration(gameState.round));
                log(`✅ 第${gameState.round}回合准备阶段启动`);
            }
        } catch (e) {
            log(`❌ 阶段切换错误：${e.message}`, true);
        } finally {
            clearTimeout(lockTimeout);
            isInPhaseTransition = false;
        }
    }

    // 调用后端结算接口【修复版：明确返回成功/失败】
    async function callSettlement() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) {
                log('❌ 无访问令牌，结算失败', true);
                return false;
            }

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
                log(`✅ 后端结算完成，新回合：${data.round}，金币+${data.goldAdd}，经验+${data.expAdd}`);
                return true;
            } else {
                log(`❌ 结算失败：${data.error}`, true);
                return false;
            }
        } catch (e) {
            log(`❌ 结算接口异常：${e.message}`, true);
            return false;
        }
    }

    // 缓冲期处理
    async function startBuffering(nextPhase) {
        log(`⏳ 进入缓冲期，即将进入${nextPhase}阶段`);
        gameState.phase = 'buffering';
        gameState.phaseStartTime = new Date().toISOString();
        await updateGameState();
        // 同步缓冲期类名
        updateBodyPhaseClass('buffering');
        window.YYCardShop?.setPhase?.('buffering');
        await new Promise(resolve => setTimeout(resolve, BUFFER_DURATION * 1000));
    }

    // 战斗模拟
    async function simulateBattle() {
        log('⚔️ 开始战斗模拟');
        const myId = getMyUserId();
        if (!myId || !gameState) return;

        // 生成对战配对
        const alivePlayers = Object.entries(gameState.players)
            .filter(([_, p]) => !p.isEliminated && p.health > 0)
            .map(([id]) => id);
        
        // 简单配对逻辑
        const pairs = [];
        const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
        for (let i = 0; i < shuffled.length; i += 2) {
            if (i + 1 < shuffled.length) {
                pairs.push([shuffled[i], shuffled[i+1]]);
            } else {
                // 轮空玩家
                log(`👤 玩家${shuffled[i].slice(0,8)}本轮轮空`);
            }
        }
        gameState.battlePairs = pairs;
        await updateGameState();

        // 执行每场战斗
        for (const [p1Id, p2Id] of pairs) {
            const p1 = gameState.players[p1Id];
            const p2 = gameState.players[p2Id];
            log(`⚔️ 对战开始: ${p1Id.slice(0,8)} VS ${p2Id.slice(0,8)}`);

            // 调用战斗模拟模块
            const battleResult = combat?.simulateBattle?.(p1.board, p2.board) || { winner: 'draw', p1Damage: 0, p2Damage: 0 };
            
            // 扣血
            p1.health = Math.max(0, p1.health - battleResult.p2Damage);
            p2.health = Math.max(0, p2.health - battleResult.p1Damage);
            
            // 标记淘汰
            if (p1.health <= 0) p1.isEliminated = true;
            if (p2.health <= 0) p2.isEliminated = true;

            log(`⚔️ 对战结束: 胜者${battleResult.winner}，${p1Id.slice(0,8)}扣血${battleResult.p2Damage}，${p2Id.slice(0,8)}扣血${battleResult.p1Damage}`);
        }

        // 更新战斗后的状态
        await updateGameState();
        log('✅ 战斗模拟完成');
    }

    // 检查游戏是否结束
    function checkGameOver() {
        if (!gameState) return { isOver: false, winner: null };
        
        const alivePlayers = Object.entries(gameState.players)
            .filter(([_, p]) => !p.isEliminated && p.health > 0);
        
        if (alivePlayers.length <= 1) {
            const winner = alivePlayers.length === 1 ? alivePlayers[0][0] : null;
            return { isOver: true, winner };
        }
        return { isOver: false, winner: null };
    }

    // 结束游戏
    function endGame(winnerId) {
        isGameOver = true;
        cleanup();
        const myId = getMyUserId();
        const isWin = winnerId === myId;

        log(`🏁 游戏结束，胜者: ${winnerId?.slice(0,8) || '平局'}`);
        alert(isWin ? '🎉 恭喜你获得胜利！' : '💀 游戏结束，再接再厉！');

        // 退出对战
        setTimeout(() => {
            exitBattle();
        }, 2000);
    }

    // 切换UI模式（准备/战斗）
    async function applyUIMode(isPrepare) {
        const prepareElements = document.querySelectorAll('.prepare-only');
        const battleElements = document.querySelectorAll('.battle-only');
        
        prepareElements.forEach(el => {
            el.style.display = isPrepare ? 'block' : 'none';
        });
        battleElements.forEach(el => {
            el.style.display = isPrepare ? 'none' : 'block';
        });

        // 同步商店UI
        window.YYCardShop?.refreshAllUI?.();
    }

    // 对外暴露的方法
    return {
        enterBattle,
        exitBattle,
        forceRefreshState,
        updateGameState,
        getGameState: () => gameState,
        getCurrentRoomId: () => currentRoomId,
        isInBattle: () => !isGameOver && !!currentRoomId
    };
})();

console.log('✅ battle.js 加载完成（修复完整版：加回战斗阶段隐藏商店/手牌）');

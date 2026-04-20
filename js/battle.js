// ==================== YYCardBattle 纯时间驱动版（不跳不循环 最终稳定版）====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;

    let timerInterval = null;
    let enterGuard = false;

    let gameSubscription = null;
    let pollingInterval = null;
    let autoBotTimer = null;
    let eliminationOrder = [];

    // 时间配置
    const BUFFER = 3;
    function prepareDuration(round) { return 27 + (round - 1) * 10; }
    function battleDuration(round)  { return 30 + (round - 1) * 5; }
    function roundTotalDuration(round) {
        return prepareDuration(round) + BUFFER + battleDuration(round);
    }

    const SETTLEMENT_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settlement';

    // 获取服务器时间（秒）
    async function serverTime() {
        try {
            const { data, error } = await supabase.rpc('get_server_time');
            if (error) throw error;
            return data;
        } catch (e) {
            console.warn('使用本地时间');
            return Math.floor(Date.now() / 1000);
        }
    }

    // ==================== 核心：纯时间计算当前阶段 ====================
    async function calcPhase() {
        if (!gameState?.gameStartTime)
            return { round: 1, phase: 'prepare', remain: prepareDuration(1) };

        const start = Math.floor(new Date(gameState.gameStartTime).getTime() / 1000);
        const now = await serverTime();
        let elapsed = Math.max(0, now - start);

        let round = 1;
        while (true) {
            const prep = prepareDuration(round);
            const bat  = battleDuration(round);
            const total = prep + BUFFER + bat;

            if (elapsed >= total) {
                elapsed -= total;
                round++;
            } else {
                if (elapsed < prep) {
                    return { round, phase: 'prepare', remain: prep - elapsed };
                } else if (elapsed < prep + BUFFER) {
                    return { round, phase: 'buffering', remain: prep + BUFFER - elapsed };
                } else {
                    return { round, phase: 'battle', remain: prep + BUFFER + bat - elapsed };
                }
            }
        }
    }

    // ==================== 全局唯一计时器 ====================
    function startTimer() {
        clearInterval(timerInterval);
        timerInterval = setInterval(async () => {
            const { round, phase, remain } = await calcPhase();

            // 同步回合与阶段（只读时间，不冲突）
            gameState.round = round;
            gameState.phase = phase;

            // 更新UI
            if (window.YYCardShop?.updateTimerDisplay)
                window.YYCardShop.updateTimerDisplay(remain, phase);
            if (window.YYCardShop?.setPhase)
                window.YYCardShop.setPhase(phase);

            applyUIMode(phase === 'prepare');

            // 战斗阶段结束 → 调用结算（只调用一次！）
            if (phase === 'battle' && remain <= 0) {
                clearInterval(timerInterval);
                await callSettlement();
                setTimeout(startTimer, 1000); // 结算完继续跑
            }
        }, 1000);
    }

    // ==================== 结算接口 ====================
    async function callSettlement() {
        log('⚔️ 战斗结束，调用结算');
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const res = await fetch(SETTLEMENT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ roomId: currentRoomId })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                log('✅ 结算成功');
            } else {
                log('❌ 结算失败');
            }
        } catch (e) {
            log('❌ 结算异常：' + e.message);
        }
    }

    // ==================== UI ====================
    async function applyUIMode(isPrepare) {
        try {
            document.body.classList.toggle('battle-view-mode', !isPrepare);
        } catch {}

        const pt = document.getElementById('phase-timer');
        const bt = document.getElementById('phase-timer-battle');
        if (pt) pt.style.display = isPrepare ? 'block' : 'none';
        if (bt) bt.style.display = isPrepare ? 'none' : 'block';
    }

    // ==================== 进入战斗 ====================
    async function enterBattle(roomId) {
        if (enterGuard) return;
        enterGuard = true;

        currentRoomId = roomId;
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';

        initDebugPanel();
        eliminationOrder = [];

        // 等待游戏状态
        for (let i = 0; i < 20; i++) {
            const { data } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', roomId)
                .maybeSingle();

            if (data?.state) {
                gameState = data.state;
                break;
            }
            await new Promise(r => setTimeout(r, 200));
        }

        if (!gameState) {
            toast('无法加载游戏状态');
            enterGuard = false;
            return;
        }

        // 没有开始时间则初始化
        if (!gameState.gameStartTime) {
            gameState.gameStartTime = new Date().toISOString();
            await supabase
                .from('game_states')
                .update({ state: gameState })
                .eq('room_id', roomId);
        }

        subscribe();
        startPolling();
        startTimer();
        bindEvents();
        enterGuard = false;
    }

    // ==================== 订阅 & 轮询 ====================
    function subscribe() {
        if (gameSubscription) gameSubscription.unsubscribe();
        gameSubscription = supabase.channel(`game:${currentRoomId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'game_states',
                filter: `room_id=eq.${currentRoomId}`
            }, async payload => {
                gameState = payload.new.state;
                if (window.YYCardShop?.refreshAllUI)
                    window.YYCardShop.refreshAllUI();
            })
            .subscribe();
    }

    function startPolling() {
        clearInterval(pollingInterval);
        pollingInterval = setInterval(async () => {
            const { data } = await supabase
                .from('game_states')
                .select('state')
                .eq('room_id', currentRoomId)
                .maybeSingle();
            if (data?.state) gameState = data.state;
        }, 2000);
    }

    // ==================== 工具 ====================
    function bindEvents() {
        document.getElementById('leave-battle-btn')?.onclick = () => {
            if (!confirm('确定退出？')) return;
            clearInterval(timerInterval);
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
        const div = document.createElement('div');
        div.id = 'battle-debug-panel';
        div.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;color:#7bffb1;font-size:12px;padding:8px;z-index:9999;font-family:monospace;pointer-events:none;display:flex;flex-direction:column-reverse`;
        document.body.appendChild(div);
    }

    function log(msg, err) {
        console.log(msg);
        const p = document.getElementById('battle-debug-panel');
        if (!p) return;
        const line = document.createElement('div');
        line.style.color = err ? '#f66' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        p.insertBefore(line, p.firstChild);
        while (p.children.length > 80) p.removeChild(p.lastChild);
    }

    function toast(t) {
        if (window.YYCardShop?.toast) window.YYCardShop.toast(t);
        else alert(t);
    }

    // ==================== 导出 ====================
    return {
        enterBattle,
        getGameState: () => gameState,
        getCurrentRoomId: () => currentRoomId,
    };
})();

console.log('✅ battle.js 纯时间驱动最终版加载完成');

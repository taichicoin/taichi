// ==================== 增益选择系统 (buffSystem.js) ====================
window.YYCardBuff = (function() {
    const getGameState = () => window.YYCardBattle?.getGameState();
    const getCurrentUserId = () => window.YYCardAuth?.currentUser?.id || null;
    const getCurrentRoomId = () => window.YYCardBattle?.getCurrentRoomId() || window._currentRoomId;

    let hasShown = false;       // 本场战斗是否已经弹出过（避免重复）
    let overlayElement = null;

    // 由 battle.js 的 tick 调用，传入当前 round 和 phase
    function tryShowBuffSelection(round, phase) {
        if (hasShown) return;

        // 只在第6回合准备阶段触发
        if (round !== 6 || phase !== 'prepare') return;

        const gameState = getGameState();
        const userId = getCurrentUserId();
        if (!gameState || !userId) return;
        const my = gameState.players[userId];
        if (!my) return;

        // 如果已经有 activeBuff 则不再弹出
        if (my.activeBuff) return;

        // 如果已经淘汰，不弹
        if (my.isEliminated) return;

        hasShown = true;
        showSelectionPanel();
    }

    function showSelectionPanel() {
        // 找到商店容器区域，创建一个全尺寸覆盖层
        const shopContainer = document.getElementById('shop-container');
        if (!shopContainer) return;

        // 用父容器作为定位参考（通常是 shop-area 或 body）
        const parent = shopContainer.closest('.shop-area') || shopContainer.parentElement;
        parent.style.position = 'relative';

        // 移除旧层（安全）
        if (overlayElement) overlayElement.remove();

        const overlay = document.createElement('div');
        overlay.className = 'buff-selection-overlay';
        overlay.style.cssText = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); z-index: 1000;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            border-radius: inherit;
        `;

        overlay.innerHTML = `
            <div style="color: #f5d76e; font-size: 20px; margin-bottom: 20px; font-weight: bold;">
                ⚡ 选择增益效果
            </div>
            <button class="buff-btn" data-buff="refresh_buff_l1"
                style="margin: 8px; padding: 12px 24px; font-size: 16px; background: #4a6fa5; color: white; border: 2px solid #f5d76e; border-radius: 10px; cursor: pointer;">
                📈 刷新增益 Lv.1<br><small>每刷新1次，商店卡牌 +1/+1</small>
            </button>
            <button class="buff-btn" data-buff="refresh_buff_l2"
                style="margin: 8px; padding: 12px 24px; font-size: 16px; background: #4a6fa5; color: white; border: 2px solid #f5d76e; border-radius: 10px; cursor: pointer;">
                📈 刷新增益 Lv.2<br><small>每刷新1次，商店卡牌 +2/+2</small>
            </button>
        `;

        overlay.querySelectorAll('.buff-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const buffId = e.currentTarget.getAttribute('data-buff');
                overlay.querySelectorAll('.buff-btn').forEach(b => b.disabled = true);
                await selectBuff(buffId);
                // 无论成功失败都关闭
                if (overlayElement) overlayElement.remove();
                overlayElement = null;
            });
        });

        parent.appendChild(overlay);
        overlayElement = overlay;
    }

    async function selectBuff(buffId) {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!userId || !roomId) return;

        try {
            const supabase = window.supabase;
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('未登录');

            const url = `${supabase.supabaseUrl}/functions/v1/select-buff`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ roomId, userId, buffId })
            });
            const result = await resp.json();
            if (!result.success) throw new Error(result.error || '选择失败');

            // 立即更新本地 gameState，使得商店刷新立刻应用增益
            const gameState = getGameState();
            if (gameState?.players?.[userId]) {
                const level = buffId === 'refresh_buff_l1' ? 1 : 2;
                gameState.players[userId].activeBuff = { id: buffId, level };
                gameState.players[userId].buffRefreshCount = 0;   // 初始化计数
            }

            // 可选：提示
            if (window.YYCardShop?.toast) {
                window.YYCardShop.toast('增益已生效！', false, 2000);
            }
        } catch (err) {
            console.error('选择增益失败:', err);
            if (window.YYCardShop?.toast) {
                window.YYCardShop.toast('选择失败，请重试', true, 2000);
            }
        }
    }

    // 暴露给外部
    return {
        tryShowBuffSelection
    };
})();

// ==================== 增益选择系统 (buffSystem.js · 防重连弹窗版) ====================
window.YYCardBuff = (function() {
    const getGameState = () => window.YYCardBattle?.getGameState();
    const getCurrentUserId = () => window.YYCardAuth?.currentUser?.id || null;
    const getCurrentRoomId = () => window.YYCardBattle?.getCurrentRoomId() || window._currentRoomId;

    let hasShown = false;
    let overlayElement = null;

    // ★ 从数据库检查玩家是否已选择过 buff（只需查一次）
    async function checkActiveBuffFromDB() {
        const userId = getCurrentUserId();
        const roomId = getCurrentRoomId();
        if (!userId || !roomId) return null;

        try {
            const supabase = window.supabase;
            const { data, error } = await supabase
                .from('game_states')
                .select('state->activeBuff')
                .eq('room_id', roomId)
                .eq('user_id', userId)
                .maybeSingle();

            if (error || !data) return null;
            return data.activeBuff || null;
        } catch (e) {
            console.warn('检查 activeBuff 失败:', e);
            return null;
        }
    }

    async function tryShowBuffSelection(round, phase) {
        if (hasShown) return;

        const gameState = getGameState();
        const userId = getCurrentUserId();
        if (!gameState || !userId) return;

        const my = gameState.players[userId];
        if (!my) return;

        // 用玩家自己的回合判断
        const playerRound = my.playerRound || gameState.round || 1;
        if (playerRound < 6) return;

        // ★ 检查是否处于可操作状态
        const canOperate = gameState.phase === 'prepare' ||
            (window.YYCardShop?.getForcePrepareMode && window.YYCardShop.getForcePrepareMode());
        if (!canOperate) return;

        // 如果内存中没有 activeBuff，则从数据库查一次（只查一次）
        if (!my.activeBuff && !my._checkedActiveBuff) {
            my._checkedActiveBuff = true;      // 标记已查过，避免重复请求
            const dbBuff = await checkActiveBuffFromDB();
            if (dbBuff) {
                my.activeBuff = dbBuff;        // 注入内存，后续不再查询
                return;                        // 已选过，直接返回不弹窗
            }
        }

        if (my.activeBuff) return;
        if (my.isEliminated) return;

        hasShown = true;
        showSelectionPanel();
    }

    function showSelectionPanel() {
        const shopContainer = document.getElementById('shop-container');
        if (!shopContainer) return;

        const parent = shopContainer.closest('.shop-area') || shopContainer.parentElement;
        parent.style.position = 'relative';

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
            <button class="buff-btn" data-buff="free_refresh_buff_l1"
                style="margin: 8px; padding: 12px 24px; font-size: 16px; background: #5a8f5a; color: white; border: 2px solid #f5d76e; border-radius: 10px; cursor: pointer;">
                🆓 免费刷新 Lv.1<br><small>每回合获得2次免费刷新</small>
            </button>
            <button class="buff-btn" data-buff="free_refresh_buff_l2"
                style="margin: 8px; padding: 12px 24px; font-size: 16px; background: #5a8f5a; color: white; border: 2px solid #f5d76e; border-radius: 10px; cursor: pointer;">
                🆓 免费刷新 Lv.2<br><small>每回合获得3次免费刷新</small>
            </button>
        `;

        overlay.querySelectorAll('.buff-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const buffId = e.currentTarget.getAttribute('data-buff');
                overlay.querySelectorAll('.buff-btn').forEach(b => b.disabled = true);
                await selectBuff(buffId);
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

            const gameState = getGameState();
            if (gameState?.players?.[userId]) {
                if (buffId === 'refresh_buff_l1' || buffId === 'refresh_buff_l2') {
                    const level = buffId === 'refresh_buff_l1' ? 1 : 2;
                    gameState.players[userId].activeBuff = { id: buffId, level };
                    gameState.players[userId].buffRefreshCount = 0;
                } else if (buffId === 'free_refresh_buff_l1' || buffId === 'free_refresh_buff_l2') {
                    const level = buffId === 'free_refresh_buff_l1' ? 1 : 2;
                    const count = level === 1 ? 2 : 3;
                    gameState.players[userId].activeBuff = { id: buffId, level };
                    gameState.players[userId].freeRefresh = count;
                }
                gameState.players[userId]._checkedActiveBuff = true; // 本地也标记
            }

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

    return {
        tryShowBuffSelection
    };
})();

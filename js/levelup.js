// ==================== 独立升级模块 (levelup.js) ====================
// 完全自包含，不依赖 YYCardShop，不依赖 sounds.js，音效直接硬编码
window.YYCardLevelUp = (function() {
    const config = window.YYCardConfig;

    // 简单的防并发标志（点击后未收到回包前不再触发）
    let busy = false;

    // ---------- 基础工具 ----------
    function getGameState() {
        return window.YYCardBattle?.getGameState?.();
    }
    function getCurrentUserId() {
        return window.YYCardAuth?.currentUser?.id || null;
    }
    function getCurrentRoomId() {
        if (window.YYCardBattle?.getCurrentRoomId) return window.YYCardBattle.getCurrentRoomId();
        return window._currentRoomId || null;
    }

    async function invokeFunction(functionName, body, timeout = 10000) {
        const supabase = window.supabase;
        if (!supabase) return { success: false, error: 'Supabase未初始化' };
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeout);
        try {
            const { data, error } = await supabase.functions.invoke(functionName, {
                body,
                headers: { Authorization: '' },
                signal: controller.signal
            });
            clearTimeout(tid);
            if (error) throw new Error(error.message);
            if (data && !data.success) throw new Error(data.error || '操作失败');
            return { success: true, data };
        } catch (err) {
            clearTimeout(tid);
            console.error(`[buy-exp] 调用异常:`, err);
            return { success: false, error: err.message };
        }
    }

    // ---------- 本地状态合并（轻量）----------
    function mergeLocal(my, up) {
        if (!up) return;
        const simpleFields = ['gold', 'exp', 'shopLevel', 'health'];
        simpleFields.forEach(k => {
            if (up[k] !== undefined) my[k] = up[k];
        });
        if (up.pendingConsumables !== undefined) {
            my.pendingConsumables = up.pendingConsumables;
        }
    }

    // ---------- UI 更新 ----------
    function updateBasicUI(up) {
        if (up?.gold !== undefined) {
            const el = document.getElementById('my-gold');
            if (el) el.textContent = up.gold;
        }
        if (up?.shopLevel !== undefined) {
            const el = document.getElementById('shop-level');
            if (el) el.textContent = up.shopLevel;
        }
        if (up?.health !== undefined) {
            const el = document.getElementById('my-health');
            if (el) el.textContent = up.health;
            const topEl = document.getElementById('my-health-top');
            if (topEl) topEl.textContent = up.health;
        }
        // 刷新购买按钮状态（如果渲染模块存在）
        if (window.YYCardRender?.updateBuyExpButtonState) {
            window.YYCardRender.updateBuyExpButtonState();
        }
    }

    // 更完整的刷新（如果渲染模块存在）
    function refreshAllIfPossible() {
        if (window.YYCardRender) {
            if (window.YYCardRender.renderShop) window.YYCardRender.renderShop();
            if (window.YYCardRender.renderHand) window.YYCardRender.renderHand();
            if (window.YYCardRender.renderMyBoard) window.YYCardRender.renderMyBoard();
        }
        if (window.mergeService) {
            window.mergeService.updateMergeGlow?.();
            window.mergeService.envokeMerge?.();
        }
    }

    // ---------- ★ 硬编码音效 ----------
    function playExpSound() {
        try {
            const audio = new Audio('/assets/mp3/exp.mp3');
            audio.volume = 1;
            audio.play().catch(() => {});
        } catch (e) {
            // 静默失败，不影响功能
        }
    }

    // ---------- 核心：购买经验 ----------
    async function buyExpAction() {
        if (busy) return;
        const gs = getGameState();
        const uid = getCurrentUserId();
        const rid = getCurrentRoomId();
        if (!gs || !uid || !rid) return;

        const my = gs.players?.[uid];
        if (!my) return;
        if (my.shopLevel >= (config.MAX_SHOP_LEVEL || 5)) return;
        if (my.gold < 1) return;

        busy = true;

        const oldGold = my.gold;
        const oldLevel = my.shopLevel;

        // 乐观扣金币
        my.gold -= 1;
        const goldEl = document.getElementById('my-gold');
        if (goldEl) goldEl.textContent = my.gold;

        const result = await invokeFunction('buy-exp', { roomId: rid, userId: uid });

        if (!result.success) {
            // 回滚
            my.gold = oldGold;
            if (goldEl) goldEl.textContent = oldGold;
            busy = false;
            return;
        }

        const up = result.data.updatedPlayer;
        if (up) {
            mergeLocal(my, up);
            updateBasicUI(up);

            // 触发消耗品选择
            if (window.YYCardConsumable) {
                window.YYCardConsumable.updateRewardBadge();
                const newLevel = up.shopLevel ?? my.shopLevel;
                if (newLevel > oldLevel) {
                    window.YYCardConsumable.showSelectionPanel();
                }
            }

            // 升级后重置刷新页码
            if (window.YYCardShopRefresh?.resetPage) {
                window.YYCardShopRefresh.resetPage();
            }

            // 刷新棋盘和手牌（如果存在渲染模块）
            refreshAllIfPossible();
        }

        // ★ 播放升级音效
        playExpSound();

        busy = false;
    }

    // ---------- 按钮绑定 ----------
    function bindButtons() {
        ['buy-exp-btn', 'buy-exp-btn-bottom'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            // 移除旧监听，防止重复绑定
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', buyExpAction);
        });
    }

    // ---------- 自启动 ----------
    function init() {
        // 确保 DOM 中有按钮后再绑定
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bindButtons);
        } else {
            bindButtons();
        }
        console.log('✅ levelup.js 已启动（完全独立，含硬编码音效）');
    }

    // 立即执行初始化
    init();

    // 对外暴露，方便其他地方手动调用（比如测试）
    return { buyExpAction };
})();

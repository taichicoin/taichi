// ==================== 独立升级模块 (levelup.js) ====================
// 不依赖 YYCardShop，不依赖任何锁，可独立完成购买经验、升级商店等级
window.YYCardLevelUp = (function() {
    const config = window.YYCardConfig;

    // ---------- 可选外部依赖（用于更细腻的 UI 刷新）----------
    let _mergeUpdatedPlayer;       // function(target, updatedPlayer)
    let _updateUIAfterSuccess;     // function(updatedPlayer)
    let _updateBuyExpButtonState;  // function()

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
            console.error(`[${functionName}] 调用异常:`, err);
            return { success: false, error: err.message };
        }
    }

    // ---------- 纯 UI 更新（仅更新金币、商店等级）----------
    function basicUIUpdate(updatedPlayer) {
        if (!updatedPlayer) return;
        if (updatedPlayer.gold !== undefined) {
            const goldEl = document.getElementById('my-gold');
            if (goldEl) goldEl.textContent = updatedPlayer.gold;
        }
        if (updatedPlayer.shopLevel !== undefined) {
            const lvEl = document.getElementById('shop-level');
            if (lvEl) lvEl.textContent = updatedPlayer.shopLevel;
        }
        // 如果外部提供了按钮状态更新函数，则调用
        if (_updateBuyExpButtonState) {
            _updateBuyExpButtonState();
        }
    }

    // ---------- 核心：购买经验 ----------
    async function buyExpAction() {
        const gs = getGameState();
        const uid = getCurrentUserId();
        const rid = getCurrentRoomId();
        if (!gs || !uid || !rid) return;

        const my = gs.players?.[uid];
        if (!my) return;
        if (my.shopLevel >= (config.MAX_SHOP_LEVEL || 5)) return;
        if (my.gold < 1) return;

        const oldGold = my.gold;
        const oldLevel = my.shopLevel;

        // 乐观扣金币
        my.gold -= 1;
        const goldEl = document.getElementById('my-gold');
        if (goldEl) goldEl.textContent = my.gold;

        const result = await invokeFunction('buy-exp', { roomId: rid, userId: uid });

        if (!result.success) {
            // 回滚金币
            my.gold = oldGold;
            if (goldEl) goldEl.textContent = oldGold;
            return;
        }

        const up = result.data.updatedPlayer;
        if (up) {
            // 合并到本地状态
            if (_mergeUpdatedPlayer) {
                _mergeUpdatedPlayer(my, up);
            } else {
                // 简单合并（不处理复杂字段）
                if (up.gold !== undefined) my.gold = up.gold;
                if (up.exp !== undefined) my.exp = up.exp;
                if (up.shopLevel !== undefined) my.shopLevel = up.shopLevel;
                if (up.health !== undefined) my.health = up.health;
            }

            // 更新 UI
            basicUIUpdate(up);
            if (_updateUIAfterSuccess) _updateUIAfterSuccess(up);

            // 消耗品处理
            if (up.pendingConsumables !== undefined) {
                my.pendingConsumables = up.pendingConsumables;
            }
            if (window.YYCardConsumable) {
                window.YYCardConsumable.updateRewardBadge();
                const newLevel = up.shopLevel ?? my.shopLevel;
                if (newLevel > oldLevel) {
                    window.YYCardConsumable.showSelectionPanel();
                }
            }

            // 通知刷新模块重置页码（如果存在）
            if (window.YYCardShopRefresh?.resetPage) {
                window.YYCardShopRefresh.resetPage();
            }
        }
    }

    // ---------- 绑定两个升级按钮 ----------
    function bindEvents() {
        ['buy-exp-btn', 'buy-exp-btn-bottom'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', buyExpAction);
        });
    }

    // ---------- 初始化入口 ----------
    function init(deps = {}) {
        if (deps.mergeUpdatedPlayer) _mergeUpdatedPlayer = deps.mergeUpdatedPlayer;
        if (deps.updateUIAfterSuccess) _updateUIAfterSuccess = deps.updateUIAfterSuccess;
        if (deps.updateBuyExpButtonState) _updateBuyExpButtonState = deps.updateBuyExpButtonState;
        bindEvents();
        console.log('✅ levelup.js 已启动（完全独立，无锁）');
    }

    // 暴露给外部
    return { init, buyExpAction };
})();

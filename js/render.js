// ==================== 纯渲染模块 (card-render.js) ====================
window.YYCardRender = (function() {
    const config = window.YYCardConfig;

    // 获取全局状态
    function getGameState() { return window.YYCardBattle?.getGameState(); }
    function getCurrentUserId() { return window.YYCardAuth?.currentUser?.id || null; }
    function isValidCard(card) { return card && typeof card === 'object' && (card.cardId || card.card_id); }

    // ========== 卡牌展示配置（从 /data/image.json 加载） ==========
    let cardConfig = {};
    async function loadCardConfig() {
        try {
            const res = await fetch('/data/image.json');
            if (res.ok) cardConfig = await res.json();
        } catch (e) { console.warn('加载卡牌展示配置出错:', e); }
    }
    function getCardDisplay(card) {
        const id = card.card_id || card.cardId;
        const cfg = cardConfig[id] || {};
        return { name: cfg.name || card.name || id || '未知', image: cfg.image || card.image || `/assets/card/${id}.png` };
    }

    // ========== 核心卡牌渲染 ==========
    function createCardElement(card, cardType = 'board') {
        // ... (把你之前写的 createCardElement 完全粘过来，不需要修改任何业务逻辑)
        // 注意：getRarityColor 和 消耗牌的判断需要也移过来
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity || 'Common');
        d.setAttribute('data-card-type', cardType);
        // ... (完整复制之前的 createCardElement 代码) 
        return d;
    }

    // ========== 各区域渲染 ==========
    function renderMyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        _renderBoard('my-board', my.board, true);
        document.getElementById('my-board').setAttribute('data-player-id', userId);
    }

    function renderHand() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        // ...(把你原本的 renderHand 完整复制过来，逻辑不变)
    }

    function renderShop() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        // ...(把你原本的 renderShop 完整复制过来，逻辑不变)
    }

    function _renderBoard(containerId, cards, isSelf) {
        // ...(把你原本的 renderBoard 完整复制过来，逻辑不变)
    }

    function refreshAllUI() {
        // ...(把你原本的 refreshAllUI 完整复制过来，并且会调用上面的 renderMyBoard, renderHand, renderShop)
        if (window.YYCardInspector?.cleanupAllRemnants) window.YYCardInspector.cleanupAllRemnants();
        renderMyBoard();
        renderHand();
        renderShop();
        // ...
    }

    // 暴露给外部
    return {
        loadCardConfig,
        refreshAllUI,
        renderMyBoard,
        renderHand,
        renderShop,
        createCardElement
    };
})();

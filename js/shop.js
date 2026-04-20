// ==================== 商店与交互系统（永久乐观更新 + 绝不弹回 + 禁止后端覆盖棋盘手牌）====================
window.YYCardShop = (function() {
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;
    
    let currentPhase = 'prepare';
    let toastTimer = null;
    let cachedAccessToken = null;
    let tokenCacheTimer = null;
    const domCache = {};

    let dragState = {
        active: false, type: null, card: null, index: -1,
        sourceElement: null, cloneElement: null,
        startX: 0, startY: 0, currentX: 0, currentY: 0
    };

    function throttle(func, delay = 16) {
        let last = 0;
        return function(...args) {
            const now = Date.now();
            if (now - last >= delay) { last = now; func.apply(this, args); }
        };
    }

    const REFRESH_SHOP_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/refresh-shop';
    const BUY_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/buy-card';
    const SWAP_BOARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/swap-board';
    const SELL_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/sell-card';
    const PLACE_CARD_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/place-card';
    const BOARD_TO_HAND_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/board-to-hand';
    const BUY_EXP_FUNCTION_URL = 'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/buy-exp';

    // ========== 【核心修复】永远不合并 board/hand，只同步数值，绝不覆盖本地操作 ==========
    function mergeUpdatedPlayer(target, updatedPlayer) {
        if (!updatedPlayer) return;
        if (updatedPlayer.gold !== undefined) target.gold = updatedPlayer.gold;
        if (updatedPlayer.exp !== undefined) target.exp = updatedPlayer.exp;
        if (updatedPlayer.shopLevel !== undefined) target.shopLevel = updatedPlayer.shopLevel;
        if (updatedPlayer.health !== undefined) target.health = updatedPlayer.health;
        if (updatedPlayer.shopCards !== undefined) target.shopCards = updatedPlayer.shopCards;
        // ✅ 彻底禁止覆盖 board / hand，这是弹回的元凶
        // if (updatedPlayer.board !== undefined) target.board = updatedPlayer.board;
        // if (updatedPlayer.hand !== undefined) target.hand = updatedPlayer.hand;
        if (updatedPlayer.isBot !== undefined) target.isBot = updatedPlayer.isBot;
        if (updatedPlayer.isEliminated !== undefined) target.isEliminated = updatedPlayer.isEliminated;
        if (updatedPlayer.isReady !== undefined) target.isReady = updatedPlayer.isReady;
    }

    // ========== 成功后只更数值，绝不重绘棋盘/手牌，彻底杜绝弹回 ==========
    function updateUIAfterSuccess(updatedPlayer) {
        if (!updatedPlayer) return;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (!my) return;

        if (updatedPlayer.gold !== undefined) {
            const goldEl = document.getElementById('my-gold');
            if (goldEl) goldEl.textContent = updatedPlayer.gold;
        }
        if (updatedPlayer.exp !== undefined || updatedPlayer.shopLevel !== undefined) {
            updateBuyExpButtonState();
        }
        if (updatedPlayer.shopLevel !== undefined) {
            const levelEl = document.getElementById('shop-level');
            if (levelEl) levelEl.textContent = updatedPlayer.shopLevel;
        }
        if (updatedPlayer.health !== undefined) {
            const healthEl = document.getElementById('my-health');
            if (healthEl) healthEl.textContent = updatedPlayer.health;
            const healthTop = document.getElementById('my-health-top');
            if (healthTop) healthTop.textContent = updatedPlayer.health;
        }
        if (updatedPlayer.shopCards !== undefined) {
            renderShop();
        }
        // ✅ 关键：这里不再调用 refreshAllUI，不重绘棋盘手牌
    }

    function initDebugPanel() {
        const old = document.getElementById('shop-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'shop-debug-panel';
        p.style.cssText = `position:fixed; top:0; left:0; right:0; max-height:120px; overflow-y:auto; color:#0f0; font-size:11px; padding:4px 8px; z-index:100000; font-family:monospace; pointer-events:none; text-shadow:0 0 4px black; background: transparent; border: none;`;
        document.body.appendChild(p);
        domCache.debugPanel = p;
        return p;
    }

    function logToScreen(msg, isError = false) {
        const p = domCache.debugPanel || initDebugPanel();
        const line = document.createElement('div');
        line.style.color = isError ? '#ff7b7b' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
        p.appendChild(line); p.scrollTop = p.scrollHeight;
        while (p.children.length > 20) p.removeChild(p.firstChild);
    }
    function log(msg, isError = false) { console.log(msg); logToScreen(msg, isError); }

    function toast(message, isError = false, duration = 2000) {
        const oldToast = document.getElementById('shop-toast');
        if (oldToast) oldToast.remove();
        if (toastTimer) clearTimeout(toastTimer);
        const toastEl = document.createElement('div');
        toastEl.id = 'shop-toast';
        toastEl.style.cssText = `position:fixed; bottom:80px; left:50%; transform:translateX(-50%); background:${isError ? 'rgba(200,50,50,0.9)' : 'rgba(30,40,60,0.95)'}; color:white; font-size:14px; padding:10px 20px; border-radius:30px; z-index:100001; border:1px solid ${isError ? '#ff7b7b' : '#f5d76e'}; box-shadow:0 4px 12px rgba(0,0,0,0.3); font-weight:bold; backdrop-filter:blur(4px); pointer-events:none; white-space:nowrap;`;
        toastEl.textContent = message;
        document.body.appendChild(toastEl);
        toastTimer = setTimeout(() => { if (toastEl.parentNode) toastEl.remove(); }, duration);
    }

    function getCurrentUserId() { return window.YYCardAuth?.currentUser?.id || null; }
    function getGameState() { return window.YYCardBattle?.getGameState(); }
    function getCurrentRoomId() {
        if (window.YYCardBattle?.getCurrentRoomId) return window.YYCardBattle.getCurrentRoomId();
        return window._currentRoomId || null;
    }
    function getSupabaseClient() { return window.supabase; }

    async function getAccessToken() {
        if (cachedAccessToken) return cachedAccessToken;
        const supabaseClient = getSupabaseClient();
        const { data: { session } } = await supabaseClient.auth.getSession();
        cachedAccessToken = session?.access_token;
        clearTimeout(tokenCacheTimer);
        tokenCacheTimer = setTimeout(() => cachedAccessToken = null, 300000);
        return cachedAccessToken;
    }

    // 只同步商店/数值，不同步棋盘手牌
    async function syncFromBackend() {
        requestAnimationFrame(async () => {
            if (window.YYCardBattle?.forceRefreshState) await window.YYCardBattle.forceRefreshState();
            // ✅ 只刷新商店和数值，不刷新棋盘手牌
            renderShop();
            updateBuyExpButtonState();
            const gameState = getGameState();
            const userId = getCurrentUserId();
            const my = gameState?.players[userId];
            if (my) {
                document.getElementById('my-gold').textContent = my.gold;
                document.getElementById('my-health').textContent = my.health;
                document.getElementById('shop-level').textContent = my.shopLevel;
            }
        });
    }

    // ========== 渲染只执行一次，不重复覆盖 ==========
    function renderMyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        renderBoard('my-board', my.board, true);
    }
    function renderEnemyBoard() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        let oppId = null;
        if (gameState.phase === 'battle' && gameState.battlePairs) {
            for (const [p1, p2] of gameState.battlePairs) {
                if (p1 === userId) { oppId = p2; break; }
                if (p2 === userId) { oppId = p1; break; }
            }
        }
        if (!oppId) {
            const alive = Object.entries(gameState.players).find(([id,p])=>id!==userId&&p.health>0);
            if (alive) oppId = alive[0];
        }
        if (oppId && gameState.players[oppId]) {
            const b = gameState.players[oppId].board;
            renderBoard('enemy-board', [b[3],b[4],b[5],b[0],b[1],b[2]], false);
        }
    }
    function renderHand() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const c = domCache.handContainer || document.getElementById('hand-container');
        if (!c) return;
        c.innerHTML = '';
        const f = document.createDocumentFragment();
        my.hand.forEach((card,i)=>{
            if (!card) return;
            const el = createCardElement(card);
            el.dataset.handIndex = i;
            el.dataset.cardType = 'hand';
            el.addEventListener('pointerdown',(e)=>onDragStart(e,'hand',card,i,el));
            f.appendChild(el);
        });
        c.appendChild(f);
        document.getElementById('hand-count').textContent = my.hand.filter(Boolean).length;
    }
    function renderShop() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const c = domCache.shopContainer || document.getElementById('shop-container');
        c.innerHTML = '';
        const cards = my.shopCards||[];
        const f = document.createDocumentFragment();
        cards.forEach((card,i)=>{
            if (!card) return;
            const el = createCardElement(card);
            el.dataset.shopIndex = i;
            el.dataset.cardType = 'shop';
            el.addEventListener('pointerdown',(e)=>onDragStart(e,'shop',card,i,el));
            f.appendChild(el);
        });
        c.appendChild(f);
    }

    // ========== 【关键】只初始化渲染，操作后绝不重绘棋盘/手牌 ==========
    function refreshAllUI() {
        renderMyBoard();
        renderEnemyBoard();
        renderHand();
        renderShop();
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (my) {
            document.getElementById('my-health').textContent = my.health;
            document.getElementById('my-gold').textContent = my.gold;
            document.getElementById('shop-level').textContent = my.shopLevel;
            document.getElementById('my-health-top').textContent = my.health;
        }
        document.getElementById('round-num').textContent = gameState.round;
        document.getElementById('round-num-top').textContent = gameState.round;
        updateBuyExpButtonState();
    }

    function updateBuyExpButtonState() {
        const gameState = getGameState();
        if (!gameState) return;
        const userId = getCurrentUserId();
        const my = gameState.players[userId];
        if (!my) return;
        const max = my.shopLevel >= (config.MAX_SHOP_LEVEL||5);
        const canPlay = gameState.phase === 'prepare';
        const disable = my.isBot || !canPlay || max;
        let need = 0;
        if (!max) {
            const e = my.exp;
            need = e<4?4-e:e<12?12-e:e<26?26-e:e<46?46-e:0;
        }
        ['buy-exp-btn','buy-exp-btn-bottom'].forEach(id=>{
            const b = document.getElementById(id);
            if (!b) return;
            b.textContent = max ? '📈 已满级' : `📈 升级 (${need}💰)`;
            b.disabled = disable || need>my.gold;
            b.style.opacity = disable ? 0.6 : 1;
        });
    }

    function renderBoard(containerId, cards, isSelf) {
        const c = domCache[containerId] || document.getElementById(containerId);
        if (!c) return;
        c.innerHTML = '';
        const f = document.createDocumentFragment();
        for(let i=0;i<6;i++){
            const card = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.dataset.slotIndex = i;
            if (card) {
                const el = createCardElement(card);
                if (isSelf) {
                    el.dataset.boardIndex = i;
                    el.dataset.cardType = 'board';
                    el.addEventListener('pointerdown',(e)=>onDragStart(e,'board',card,i,el));
                }
                slot.appendChild(el);
            } else {
                slot.innerHTML = '<div class="card empty-slot">⬤</div>';
            }
            f.appendChild(slot);
        }
        c.appendChild(f);
    }

    function createCardElement(card) {
        const d = document.createElement('div');
        d.className = 'card';
        d.dataset.rarity = card.rarity;
        const img = card.image||card.icon||`/assets/card/${card.cardId||card.id||'default'}.png`;
        const price = config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy||1;
        d.innerHTML = `<div class="card-icon"><img src="${img}" onerror="this.src='/assets/default-avatar.png'"></div><div class="card-name">${card.name}</div><div class="card-stats"><span class="card-atk">⚔️${card.atk}</span><span class="card-hp">🛡️${card.hp}</span></div><div class="card-price">💰${price}</div>${card.star?'<div class="card-star">★</div>':''}`;
        d.querySelector('img').draggable = false;
        return d;
    }

    // ========== 拖拽逻辑不变 ==========
    function onDragStart(e,type,card,index,el){
        const g = getGameState();
        if (!g || g.phase!=='prepare') { toast('不能操作',true); return; }
        e.preventDefault(); e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        const x = e.clientX, y = e.clientY;
        const clone = el.cloneNode(true);
        clone.classList.add('card-drag-clone');
        clone.style.cssText = `position:fixed;z-index:99999;left:${x-el.offsetWidth/2}px;top:${y-el.offsetHeight/2}px;width:${el.offsetWidth}px;height:${el.offsetHeight}px;opacity:0.85;transform:scale(1.05);box-shadow:0 8px 20px rgba(0,0,0,.5);pointer-events:none;transition:none;will-change:left,top;`;
        document.body.appendChild(clone);
        el.style.opacity = '0.3';
        dragState = {active:true,type,card,index,sourceElement:el,cloneElement:clone,startX:x,startY:y,currentX:x,currentY:y};
        document.addEventListener('pointermove',throttleMove);
        document.addEventListener('pointerup',onDragEnd);
        document.addEventListener('pointercancel',onDragEnd);
    }
    const throttleMove = throttle(function(e){
        if (!dragState.active) return;
        e.preventDefault();
        const x=e.clientX,y=e.clientY;
        dragState.currentX=x; dragState.currentY=y;
        const c=dragState.cloneElement;
        c.style.left = x-c.offsetWidth/2+'px';
        c.style.top = y-c.offsetHeight/2+'px';
    },16);
    function onDragEnd(e){
        if (!dragState.active) return;
        e.preventDefault();
        const {type,card,index,sourceElement,cloneElement,currentX,currentY}=dragState;
        cloneElement.remove(); sourceElement.style.opacity='';
        document.querySelector('.shop-area')?.classList.remove('drop-target');
        sourceElement.releasePointerCapture(e.pointerId);
        document.removeEventListener('pointermove',throttleMove);
        document.removeEventListener('pointerup',onDragEnd);
        const t=document.elementFromPoint(currentX,currentY);
        if (t) executeDropAction(type,index,card,getDropTarget(t));
        dragState.active=false;
    }
    function getDropTarget(el){
        while(el&&el!==document.body){
            if (el.classList.contains('card-slot')&&el.closest('#my-board')){
                return {zone:'board',index:parseInt(el.dataset.slotIndex)};
            }
            if (el.closest('#hand-container')) return {zone:'hand'};
            if (el.closest('#shop-container')) return {zone:'shop'};
            el=el.parentElement;
        }
        return null;
    }
    async function executeDropAction(t,idx,card,d){
        if (t==='hand'){
            if (d.zone==='board') await handleHandToBoard(idx,d.index);
            if (d.zone==='shop') await handleSell('hand',idx);
        }
        if (t==='board'){
            if (d.zone==='board') await handleBoardSwap(idx,d.index);
            if (d.zone==='hand') await handleBoardToHand(idx);
            if (d.zone==='shop') await handleSell('board',idx);
        }
        if (t==='shop'){
            if (d.zone==='board') await handleShopToBoard(card,idx,d.index);
            if (d.zone==='hand') await handleShopToHand(card,idx);
        }
    }

    // ========== 所有操作：本地永久生效，成功不回滚，失败才还原 ==========
    async function handleHandToBoard(handIdx,boardIdx){
        const uid=getCurrentUserId(),rid=getCurrentRoomId();
        if (!rid||!uid) return;
        const g=getGameState(),my=g.players[uid];
        const card=my.hand[handIdx];
        if (!card) return;
        const oldHand=[...my.hand],oldBoard=[...my.board];
        const tar=my.board[boardIdx];
        // 本地永久修改
        my.board[boardIdx]=card; my.hand[handIdx]=tar||null;
        // 只更计数，不重绘整个棋盘
        document.getElementById('hand-count').textContent=my.hand.filter(Boolean).length;

        try{
            const t=await getAccessToken();
            const r=await fetch(PLACE_CARD_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:rid,userId:uid,handIndex:handIdx,boardIndex:boardIdx})
            });
            const d=await r.json();
            if (!r.ok||!d.success) {
                my.hand=oldHand; my.board=oldBoard;
                document.getElementById('hand-count').textContent=my.hand.filter(Boolean).length;
                toast('失败',true); return;
            }
            mergeUpdatedPlayer(my,d.updatedPlayer);
            updateUIAfterSuccess(d.updatedPlayer);
            toast('成功');
        }catch(e){
            my.hand=oldHand; my.board=oldBoard;
            document.getElementById('hand-count').textContent=my.hand.filter(Boolean).length;
            toast('网络错误',true);
        }
    }
    async function handleBoardSwap(a,b){
        if (a===b) return;
        const uid=getCurrentUserId(),rid=getCurrentRoomId();
        const g=getGameState(),my=g.players[uid];
        const old=[...my.board];
        my.board[a]=my.board[b]; my.board[b]=old[a]; // 本地永久交换

        try{
            const t=await getAccessToken();
            const r=await fetch(SWAP_BOARD_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:rid,userId:uid,indexA:a,indexB:b})
            });
            const d=await r.json();
            if (!r.ok||!d.success) {my.board=old;toast('失败',true);return;}
            mergeUpdatedPlayer(my,d.updatedPlayer);
            updateUIAfterSuccess(d.updatedPlayer);
            toast('交换成功');
        }catch(e){my.board=old;toast('网络错误',true);}
    }
    async function handleSell(type,idx){
        const uid=getCurrentUserId(),rid=getCurrentRoomId();
        const g=getGameState(),my=g.players[uid];
        const card=type==='hand'?my.hand[idx]:my.board[idx];
        if (!card) return;
        const oldGold=my.gold,oldHand=[...my.hand],oldBoard=[...my.board];
        const price=config.ECONOMY?.CARD_PRICE?.[card.rarity]?.sell||1;
        // 本地永久删除
        if (type==='hand') my.hand[idx]=null; else my.board[idx]=null;
        my.gold+=price;
        document.getElementById('my-gold').textContent=my.gold;
        document.getElementById('hand-count').textContent=my.hand.filter(Boolean).length;

        try{
            const t=await getAccessToken();
            const r=await fetch(SELL_CARD_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:rid,userId:uid,type,index:idx})
            });
            const d=await r.json();
            if (!r.ok||!d.success) {
                my.gold=oldGold; my.hand=oldHand; my.board=oldBoard;
                document.getElementById('my-gold').textContent=my.gold;
                document.getElementById('hand-count').textContent=my.hand.filter(Boolean).length;
                toast('出售失败',true); return;
            }
            mergeUpdatedPlayer(my,d.updatedPlayer);
            updateUIAfterSuccess(d.updatedPlayer);
            toast('出售成功');
        }catch(e){
            my.gold=oldGold; my.hand=oldHand; my.board=oldBoard;
            document.getElementById('my-gold').textContent=my.gold;
            document.getElementById('hand-count').textContent=my.hand.filter(Boolean).length;
            toast('网络错误',true);
        }
    }
    async function handleBoardToHand(idx){
        const uid=getCurrentUserId(),rid=getCurrentRoomId();
        const g=getGameState(),my=g.players[uid];
        const card=my.board[idx];
        if (!card) return;
        const empty=my.hand.findIndex(c=>!c);
        if (empty===-1) {toast('手牌满');return;}
        const oldHand=[...my.hand],oldBoard=[...my.board];
        // 本地永久移动
        my.board[idx]=null; my.hand[empty]=card;
        document.getElementById('hand-count').textContent=my.hand.filter(Boolean).length;

        try{
            const t=await getAccessToken();
            const r=await fetch(BOARD_TO_HAND_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:rid,userId:uid,boardIndex:idx})
            });
            const d=await r.json();
            if (!r.ok||!d.success) {
                my.hand=oldHand; my.board=oldBoard;
                document.getElementById('hand-count').textContent=my.hand.filter(Boolean).length;
                toast('失败',true); return;
            }
            mergeUpdatedPlayer(my,d.updatedPlayer);
            updateUIAfterSuccess(d.updatedPlayer);
            toast('已移回');
        }catch(e){
            my.hand=oldHand; my.board=oldBoard;
            document.getElementById('hand-count').textContent=my.hand.filter(Boolean).length;
            toast('网络错误',true);
        }
    }
    async function handleShopToBoard(card,shopIdx,boardIdx){
        const uid=getCurrentUserId(),rid=getCurrentRoomId();
        const g=getGameState(),my=g.players[uid];
        const price=config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy||1;
        if (my.gold<price) {toast('金币不足');return;}
        const oldGold=my.gold,oldShop=[...my.shopCards],oldHand=[...my.hand],oldBoard=[...my.board];
        const tar=my.board[boardIdx];
        // 本地永久购买
        my.gold-=price; my.shopCards.splice(shopIdx,1);
        my.board[boardIdx]={...card,instanceId:Date.now()};
        if (tar) {const e=my.hand.findIndex(c=>!c);if(e!==-1)my.hand[e]=tar;}
        document.getElementById('my-gold').textContent=my.gold;
        renderShop();

        try{
            const t=await getAccessToken();
            const r=await fetch(BUY_CARD_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:rid,userId:uid,shopIndex:shopIdx,targetBoardIndex:boardIdx})
            });
            const d=await r.json();
            if (!r.ok||!d.success) {
                my.gold=oldGold; my.shopCards=oldShop; my.hand=oldHand; my.board=oldBoard;
                document.getElementById('my-gold').textContent=my.gold; renderShop();
                toast('失败',true); return;
            }
            mergeUpdatedPlayer(my,d.updatedPlayer);
            updateUIAfterSuccess(d.updatedPlayer);
            toast('购买成功');
        }catch(e){
            my.gold=oldGold; my.shopCards=oldShop; my.hand=oldHand; my.board=oldBoard;
            document.getElementById('my-gold').textContent=my.gold; renderShop();
            toast('网络错误',true);
        }
    }
    async function handleShopToHand(card,shopIdx){
        const uid=getCurrentUserId(),rid=getCurrentRoomId();
        const g=getGameState(),my=g.players[uid];
        const price=config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy||1;
        if (my.gold<price) {toast('金币不足');return;}
        const empty=my.hand.findIndex(c=>!c);
        if (empty===-1) {toast('手牌满');return;}
        const oldGold=my.gold,oldShop=[...my.shopCards],oldHand=[...my.hand];
        // 本地永久购买
        my.gold-=price; my.shopCards.splice(shopIdx,1);
        my.hand[empty]={...card,instanceId:Date.now()};
        document.getElementById('my-gold').textContent=my.gold;
        document.getElementById('hand-count').textContent=my.hand.filter(Boolean).length;
        renderShop();

        try{
            const t=await getAccessToken();
            const r=await fetch(BUY_CARD_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:rid,userId:uid,shopIndex:shopIdx})
            });
            const d=await r.json();
            if (!r.ok||!d.success) {
                my.gold=oldGold; my.shopCards=oldShop; my.hand=oldHand;
                document.getElementById('my-gold').textContent=my.gold;
                document.getElementById('hand-count').textContent=my.hand.filter(Boolean).length;
                renderShop(); toast('失败',true); return;
            }
            mergeUpdatedPlayer(my,d.updatedPlayer);
            updateUIAfterSuccess(d.updatedPlayer);
            toast('购买成功');
        }catch(e){
            my.gold=oldGold; my.shopCards=oldShop; my.hand=oldHand;
            document.getElementById('my-gold').textContent=my.gold;
            document.getElementById('hand-count').textContent=my.hand.filter(Boolean).length;
            renderShop(); toast('网络错误',true);
        }
    }
    async function buyExpAction(){
        const uid=getCurrentUserId(),rid=getCurrentRoomId();
        const g=getGameState(),my=g.players[uid];
        if (my.shopLevel>=(config.MAX_SHOP_LEVEL||5)){toast('满级');return;}
        if (my.gold<1){toast('金币不足');return;}
        const old=my.gold; my.gold-=1;
        document.getElementById('my-gold').textContent=my.gold;
        try{
            const t=await getAccessToken();
            const r=await fetch(BUY_EXP_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:rid,userId:uid})
            });
            const d=await r.json();
            if (!r.ok||!d.success){my.gold=old;document.getElementById('my-gold').textContent=my.gold;toast('失败',true);return;}
            mergeUpdatedPlayer(my,d.updatedPlayer); updateUIAfterSuccess(d.updatedPlayer);
            toast('成功');
        }catch(e){my.gold=old;document.getElementById('my-gold').textContent=my.gold;toast('网络错误',true);}
    }
    async function refreshShopAction(){
        const g=getGameState();
        if (g.phase!=='prepare'){toast('准备阶段才能刷');return;}
        const uid=getCurrentUserId(),rid=getCurrentRoomId();
        const my=g.players[uid];
        if (my.gold<1){toast('金币不足');return;}
        const old=my.gold; my.gold-=1;
        document.getElementById('my-gold').textContent=my.gold;
        const oldShop=[...my.shopCards]; my.shopCards=[]; renderShop();
        try{
            const t=await getAccessToken();
            const r=await fetch(REFRESH_SHOP_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:rid,userId:uid})
            });
            const d=await r.json();
            if (!r.ok||!d.success){my.gold=old;my.shopCards=oldShop;document.getElementById('my-gold').textContent=my.gold;renderShop();toast('失败',true);return;}
            mergeUpdatedPlayer(my,d.updatedPlayer); updateUIAfterSuccess(d.updatedPlayer);
            toast('成功');
        }catch(e){my.gold=old;my.shopCards=oldShop;document.getElementById('my-gold').textContent=my.gold;renderShop();toast('网络错误',true);}
    }

    function updateTimerDisplay(s,p){
        const e=document.getElementById('phase-timer');
        if (e) e.textContent=p==='buffering'?`⏳${s}`:`${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
        const b=document.getElementById('phase-timer-battle');
        if (b) b.textContent=p==='battle'?s:'00:00';
    }
    function setPhase(p){
        currentPhase=p;
        document.body.classList.toggle('buffering-mode',p==='buffering');
    }

    function bindUIEvents(){
        document.getElementById('refresh-shop-btn')?.addEventListener('click',refreshShopAction);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click',refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click',buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click',buyExpAction);
    }
    function injectStyles(){
        if (document.getElementById('drag-css')) return;
        const s=document.createElement('style');s.id='drag-css';
        s.textContent=`.card{touch-action:none;user-select:none}.card-drag-clone{pointer-events:none!important}.shop-area.drop-target{box-shadow:0 0 0 3px #f44}.buffering-mode *{pointer-events:none!important}.card-slot{contain:layout style paint}`;
        document.head.appendChild(s);
    }
    function cacheDoms(){
        domCache.handContainer=document.getElementById('hand-container');
        domCache.shopContainer=document.getElementById('shop-container');
        domCache.myBoard=document.getElementById('my-board');
    }
    function init(){
        injectStyles(); initDebugPanel(); cacheDoms(); bindUIEvents(); refreshAllUI();
        log('✅ 商店已启动（永久乐观，绝不弹回）');
    }

    return { init, refreshAllUI, updateTimerDisplay, setPhase, log, toast };
})();

console.log('✅ shop.js 加载完成（永久乐观更新，绝不弹回原地）');

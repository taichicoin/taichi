// ==================== 商店与交互系统【永久乐观更新 + 绝不弹回】 ====================
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
        startX:0,startY:0,currentX:0,currentY:0
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

    // ========== 只合并数值，绝不覆盖棋盘/手牌/商店卡 ==========
    function mergeUpdatedPlayer(target, updatedPlayer) {
        if (!updatedPlayer) return;
        const numericFields = [
            'gold','exp','shopLevel','health','isBot','isEliminated','isReady'
        ];
        numericFields.forEach(k => {
            if (updatedPlayer[k] !== undefined) target[k] = updatedPlayer[k];
        });
    }

    // ========== 成功后只更UI数值，不碰卡牌布局 ==========
    function updateUIAfterSuccess(updatedPlayer) {
        if (!updatedPlayer) return;
        const gameState = getGameState();
        const userId = getCurrentUserId();
        const my = gameState?.players[userId];
        if (!my) return;

        const goldEl = document.getElementById('my-gold');
        if (goldEl) goldEl.textContent = my.gold;

        const healthEl = document.getElementById('my-health');
        const healthTop = document.getElementById('my-health-top');
        if (healthEl) healthEl.textContent = my.health;
        if (healthTop) healthTop.textContent = my.health;

        const levelEl = document.getElementById('shop-level');
        if (levelEl) levelEl.textContent = my.shopLevel;

        updateBuyExpButtonState();
        if (updatedPlayer.shopCards) renderShop();
    }

    function initDebugPanel() {
        const old = document.getElementById('shop-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'shop-debug-panel';
        p.style.cssText = `position:fixed;top:0;left:0;right:0;max-height:120px;overflow-y:auto;color:#0f0;font-size:11px;padding:4px 8px;z-index:100000;font-family:monospace;pointer-events:none;text-shadow:0 0 4px black;background:transparent;border:none;`;
        document.body.appendChild(p);
        domCache.debugPanel = p;
        return p;
    }

    function logToScreen(msg,isError=false){
        const p = domCache.debugPanel||initDebugPanel();
        const line = document.createElement('div');
        line.style.color = isError?'#ff7b7b':'#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
        p.appendChild(line); p.scrollTop = p.scrollHeight;
        while(p.children.length>20)p.removeChild(p.firstChild);
    }
    function log(msg,isError=false){console.log(msg);logToScreen(msg,isError);}
    function toast(message,isError=false,duration=2000){
        const old=document.getElementById('shop-toast');if(old)old.remove();
        if(toastTimer)clearTimeout(toastTimer);
        const t=document.createElement('div');t.id='shop-toast';
        t.style.cssText=`position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${isError?'rgba(200,50,50,0.9)':'rgba(30,40,60,0.95)'};color:white;font-size:14px;padding:10px 20px;border-radius:30px;z-index:100001;border:1px solid ${isError?'#ff7b7b':'#f5d76e'};box-shadow:0 4px 12px rgba(0,0,0,0.3);font-weight:bold;backdrop-filter:blur(4px);pointer-events:none;white-space:nowrap;`;
        t.textContent=message;document.body.appendChild(t);
        toastTimer=setTimeout(()=>{if(t.parentNode)t.remove();toastTimer=null;},duration);
    }
    function getCurrentUserId(){return window.YYCardAuth?.currentUser?.id||null;}
    function getGameState(){return window.YYCardBattle?.getGameState();}
    function getCurrentRoomId(){return window.YYCardBattle?.getCurrentRoomId()||window._currentRoomId||null;}
    function getSupabaseClient(){return window.supabase;}
    async function getAccessToken(){
        if(cachedAccessToken)return cachedAccessToken;
        const {data:{session}}=await getSupabaseClient().auth.getSession();
        cachedAccessToken=session?.access_token;
        clearTimeout(tokenCacheTimer);
        tokenCacheTimer=setTimeout(()=>cachedAccessToken=null,300000);
        return cachedAccessToken;
    }

    // ========== 渲染 ==========
    function renderMyBoard(){
        const g=getGameState();if(!g)return;
        const uid=getCurrentUserId();const me=g.players[uid];if(!me)return;
        renderBoard('my-board',me.board,true);
    }
    function renderEnemyBoard(){
        const g=getGameState();if(!g)return;const uid=getCurrentUserId();let opp=null;
        if(g.phase==='battle'&&g.battlePairs){
            for(const [a,b]of g.battlePairs){
                if(a===uid){opp=b;break;}if(b===uid){opp=a;break;}
            }
        }
        if(!opp){
            const hs=Object.entries(g.players).filter(([id,p])=>id!==uid&&!p.isBot&&p.health>0&&!p.isEliminated);
            if(hs.length>0)opp=hs[0][0];
        }
        if(!opp){
            const any=Object.entries(g.players).find(([id,p])=>id!==uid&&p.health>0&&!p.isEliminated);
            if(any)opp=any[0];
        }
        if(!opp)opp=Object.keys(g.players).find(id=>id!==uid);
        if(opp&&g.players[opp]){
            const b=g.players[opp].board;
            renderBoard('enemy-board',[b[3],b[4],b[5],b[0],b[1],b[2]],false);
        }
    }
    function renderHand(){
        const g=getGameState();if(!g)return;const uid=getCurrentUserId();const me=g.players[uid];if(!me)return;
        const c=domCache.handContainer||document.getElementById('hand-container');if(!c)return;c.innerHTML='';
        const f=document.createDocumentFragment();
        me.hand.forEach((card,i)=>{
            if(!card)return;
            const el=createCardElement(card);
            el.dataset.handIndex=i;el.dataset.cardType='hand';
            el.addEventListener('pointerdown',e=>onDragStart(e,'hand',card,i,el));
            f.appendChild(el);
        });
        c.appendChild(f);
        const cnt=document.getElementById('hand-count');
        if(cnt)cnt.textContent=me.hand.filter(Boolean).length;
    }
    function renderShop(){
        const g=getGameState();if(!g)return;const uid=getCurrentUserId();const me=g.players[uid];if(!me)return;
        const c=domCache.shopContainer||document.getElementById('shop-container');if(!c)return;c.innerHTML='';
        const cards=me.shopCards||[];
        if(!cards.length){c.innerHTML='<div style="color:#aaa;padding:10px;">商店为空</div>';return;}
        const f=document.createDocumentFragment();
        cards.forEach((card,i)=>{
            const el=createCardElement(card);
            el.dataset.shopIndex=i;el.dataset.cardType='shop';
            el.addEventListener('pointerdown',e=>onDragStart(e,'shop',card,i,el));
            f.appendChild(el);
        });
        c.appendChild(f);
    }
    function refreshAllUI(){
        renderMyBoard();renderEnemyBoard();renderHand();renderShop();
        const g=getGameState();if(!g)return;const uid=getCurrentUserId();const me=g.players[uid];if(!me)return;
        if(domCache.myHealth)domCache.myHealth.textContent=me.health;
        if(domCache.myGold)domCache.myGold.textContent=me.gold;
        if(domCache.shopLevel)domCache.shopLevel.textContent=me.shopLevel;
        const ht=document.getElementById('my-health-top');if(ht)ht.textContent=me.health;
        if(domCache.roundNum)domCache.roundNum.textContent=g.round;
        const rt=document.getElementById('round-num-top');if(rt)rt.textContent=g.round;
        updateBuyExpButtonState();
    }
    function updateBuyExpButtonState(){
        const g=getGameState();if(!g)return;const uid=getCurrentUserId();const me=g.players[uid];if(!me)return;
        const max=me.shopLevel>=(config.MAX_SHOP_LEVEL||5);
        const canOp=g.phase==='prepare';
        const dis=me.isBot||!canOp||max;
        let need=0;
        if(!max){
            const e=me.exp;
            if(e<4)need=4-e;else if(e<12)need=12-e;else if(e<26)need=26-e;else if(e<46)need=46-e;
        }
        ['buy-exp-btn','buy-exp-btn-bottom'].forEach(id=>{
            const b=document.getElementById(id);if(!b)return;
            b.textContent=max?'📈 已满级':`📈 升级 (${need}💰)`;
            b.disabled=dis||need>me.gold;
            b.style.opacity=dis?0.6:1;
        });
    }
    function renderBoard(containerId,cards,isSelf){
        const ct=domCache[containerId]||document.getElementById(containerId);if(!ct)return;ct.innerHTML='';
        const f=document.createDocumentFragment();
        for(let i=0;i<6;i++){
            const slot=document.createElement('div');slot.className='card-slot';slot.dataset.slotIndex=i;
            const c=cards[i];
            if(c){
                const el=createCardElement(c);
                if(isSelf){el.dataset.boardIndex=i;el.dataset.cardType='board';el.addEventListener('pointerdown',e=>onDragStart(e,'board',c,i,el));}
                slot.appendChild(el);
            }else{
                slot.innerHTML='<div class="card empty-slot">⬤</div>';
            }
            f.appendChild(slot);
        }
        ct.appendChild(f);
    }
    function createCardElement(card){
        const d=document.createElement('div');d.className='card';d.dataset.rarity=card.rarity;
        const img=card.image||card.icon||`/assets/card/${card.cardId||card.id||'default'}.png`;
        const pri=config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy||1;
        d.innerHTML=`<div class="card-icon"><img src="${img}" onerror="this.src='/assets/default-avatar.png'"></div><div class="card-name">${card.name}</div><div class="card-stats"><span class="card-atk">⚔️${card.atk}</span><span class="card-hp">🛡️${card.hp}</span></div><div class="card-price">💰${pri}</div>${card.star>0?'<div class="card-star">★</div>':''}`;
        d.querySelector('img').draggable=false;return d;
    }

    // ========== 拖拽 ==========
    function onDragStart(e,type,card,idx,el){
        const g=getGameState();
        if(!g||g.phase!=='prepare'){toast('只能在准备阶段操作',true);return;}
        e.preventDefault();e.stopPropagation();el.setPointerCapture(e.pointerId);
        const x=e.clientX,y=e.clientY;
        const clone=el.cloneNode(true);clone.classList.add('card-drag-clone');
        clone.style.cssText=`position:fixed;z-index:99999;left:${x-el.offsetWidth/2}px;top:${y-el.offsetHeight/2}px;width:${el.offsetWidth}px;height:${el.offsetHeight}px;opacity:0.85;transform:scale(1.05);box-shadow:0 8px 20px rgba(0,0,0,0.5);pointer-events:none;transition:none;will-change:left,top;`;
        document.body.appendChild(clone);el.style.opacity='0.3';
        dragState={active:true,type,card,index:idx,sourceElement:el,cloneElement:clone,startX:x,startY:y,currentX:x,currentY:y};
        document.addEventListener('pointermove',throttledDragMove);
        document.addEventListener('pointerup',onDragEnd);
        document.addEventListener('pointercancel',onDragEnd);
    }
    const throttledDragMove=throttle(e=>{
        if(!dragState.active)return;e.preventDefault();
        const x=e.clientX,y=e.clientY;
        dragState.currentX=x;dragState.currentY=y;
        const c=dragState.cloneElement;
        c.style.left=(x-c.offsetWidth/2)+'px';
        c.style.top=(y-c.offsetHeight/2)+'px';
        const shop=document.querySelector('.shop-area');
        if(shop){
            const r=shop.getBoundingClientRect();
            shop.classList.toggle('drop-target',x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom);
        }
    },16);
    function onDragEnd(e){
        if(!dragState.active)return;e.preventDefault();
        const {type,index,card,sourceElement,cloneElement,currentX,currentY}=dragState;
        cloneElement.remove();sourceElement.style.opacity='';
        const shop=document.querySelector('.shop-area');if(shop)shop.classList.remove('drop-target');
        sourceElement.releasePointerCapture?.(e.pointerId);
        document.removeEventListener('pointermove',throttledDragMove);
        document.removeEventListener('pointerup',onDragEnd);
        document.removeEventListener('pointercancel',onDragEnd);
        const tar=document.elementFromPoint(currentX,currentY);
        if(tar)executeDropAction(type,index,card,getDropTarget(tar));
        dragState.active=false;
    }
    function getDropTarget(el){
        let e=el;while(e&&e!==document.body){
            if(e.classList.contains('card-slot')){
                const b=e.closest('#my-board');
                if(b)return{zone:'board',index:parseInt(e.dataset.slotIndex)};
            }
            if(e.closest('#hand-container'))return{zone:'hand'};
            if(e.closest('#shop-container'))return{zone:'shop'};
            e=e.parentElement;
        }
        return null;
    }
    async function executeDropAction(type,idx,card,res){
        if(!res)return;
        if(type==='hand'){
            if(res.zone==='board')await handleHandToBoard(idx,res.index);
            if(res.zone==='shop')await handleSell('hand',idx);
        }
        if(type==='board'){
            if(res.zone==='board')await handleBoardSwap(idx,res.index);
            if(res.zone==='hand')await handleBoardToHand(idx);
            if(res.zone==='shop')await handleSell('board',idx);
        }
        if(type==='shop'){
            if(res.zone==='board')await handleShopToBoard(card,idx,res.index);
            if(res.zone==='hand')await handleShopToHand(card,idx);
        }
    }

    // ==================== 核心：永久乐观更新，绝不弹回 ====================
    async function handleHandToBoard(handIdx,boardIdx){
        const uid=getCurrentUserId(),room=getCurrentRoomId();
        const g=getGameState();const me=g?.players[uid];if(!me||!room)return;
        const card=me.hand[handIdx];if(!card)return;

        // 本地直接修改，永久生效
        const tar=me.board[boardIdx];
        me.board[boardIdx]=card;
        me.hand[handIdx]=tar||null;
        refreshAllUI();

        // 后端只同步，失败也不回滚
        try{
            const t=await getAccessToken();
            const r=await fetch(PLACE_CARD_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:room,userId:uid,handIndex:handIdx,boardIndex:boardIdx})
            });
            const d=await r.json();
            if(d.success&&d.updatedPlayer)mergeUpdatedPlayer(me,d.updatedPlayer);
            toast(d.exchanged?'交换成功':'放置成功');
        }catch(e){
            toast('同步失败，但位置已保留',true);
        }
    }

    async function handleShopToBoard(card,shopIdx,boardIdx){
        const uid=getCurrentUserId(),room=getCurrentRoomId();
        const g=getGameState();const me=g?.players[uid];if(!me||!room)return;
        const pri=config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy||1;
        if(me.gold<pri){toast('金币不足',true);return;}

        me.gold-=pri;
        me.shopCards.splice(shopIdx,1);
        const tar=me.board[boardIdx];
        me.board[boardIdx]={...card,instanceId:Date.now()};
        if(tar){
            const emp=me.hand.findIndex(c=>!c);
            if(emp!==-1)me.hand[emp]=tar;
        }
        refreshAllUI();

        try{
            const t=await getAccessToken();
            const r=await fetch(BUY_CARD_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:room,userId:uid,shopIndex:shopIdx,targetBoardIndex:boardIdx})
            });
            const d=await r.json();
            if(d.success&&d.updatedPlayer)mergeUpdatedPlayer(me,d.updatedPlayer);
            toast('购买成功');
        }catch(e){
            toast('同步失败',true);
        }
    }

    async function handleShopToHand(card,shopIdx){
        const uid=getCurrentUserId(),room=getCurrentRoomId();
        const g=getGameState();const me=g?.players[uid];if(!me||!room)return;
        const pri=config.ECONOMY?.CARD_PRICE?.[card.rarity]?.buy||1;
        if(me.gold<pri){toast('金币不足',true);return;}
        const emp=me.hand.findIndex(c=>!c);
        if(emp===-1){toast('手牌已满',true);return;}

        me.gold-=pri;
        me.shopCards.splice(shopIdx,1);
        me.hand[emp]={...card,instanceId:Date.now()};
        refreshAllUI();

        try{
            const t=await getAccessToken();
            const r=await fetch(BUY_CARD_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:room,userId:uid,shopIndex:shopIdx})
            });
            const d=await r.json();
            if(d.success&&d.updatedPlayer)mergeUpdatedPlayer(me,d.updatedPlayer);
            toast('购买成功');
        }catch(e){
            toast('同步失败',true);
        }
    }

    async function handleBoardSwap(a,b){
        if(a===b)return;
        const uid=getCurrentUserId(),room=getCurrentRoomId();
        const g=getGameState();const me=g?.players[uid];if(!me||!room)return;

        [me.board[a],me.board[b]]=[me.board[b],me.board[a]];
        refreshAllUI();

        try{
            const t=await getAccessToken();
            const r=await fetch(SWAP_BOARD_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:room,userId:uid,indexA:a,indexB:b})
            });
            const d=await r.json();
            if(d.success&&d.updatedPlayer)mergeUpdatedPlayer(me,d.updatedPlayer);
            toast('交换成功');
        }catch(e){
            toast('同步失败',true);
        }
    }

    async function handleBoardToHand(idx){
        const uid=getCurrentUserId(),room=getCurrentRoomId();
        const g=getGameState();const me=g?.players[uid];if(!me||!room)return;
        const card=me.board[idx];if(!card)return;
        const emp=me.hand.findIndex(c=>!c);
        if(emp===-1){toast('手牌已满',true);return;}

        me.board[idx]=null;
        me.hand[emp]=card;
        refreshAllUI();

        try{
            const t=await getAccessToken();
            const r=await fetch(BOARD_TO_HAND_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:room,userId:uid,boardIndex:idx})
            });
            const d=await r.json();
            if(d.success&&d.updatedPlayer)mergeUpdatedPlayer(me,d.updatedPlayer);
            toast('已移回手牌');
        }catch(e){
            toast('同步失败',true);
        }
    }

    async function handleSell(type,idx){
        const uid=getCurrentUserId(),room=getCurrentRoomId();
        const g=getGameState();const me=g?.players[uid];if(!me||!room)return;
        const card=type==='hand'?me.hand[idx]:me.board[idx];
        if(!card)return;const pri=config.ECONOMY?.CARD_PRICE?.[card.rarity]?.sell||1;

        me.gold+=pri;
        if(type==='hand')me.hand[idx]=null;else me.board[idx]=null;
        refreshAllUI();

        try{
            const t=await getAccessToken();
            const r=await fetch(SELL_CARD_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:room,userId:uid,type,index:idx})
            });
            const d=await r.json();
            if(d.success&&d.updatedPlayer)mergeUpdatedPlayer(me,d.updatedPlayer);
            toast('出售成功');
        }catch(e){
            toast('同步失败',true);
        }
    }

    async function buyExpAction(){
        const g=getGameState();if(!g||g.phase!=='prepare'){toast('只能准备阶段升级',true);return;}
        const uid=getCurrentUserId(),room=getCurrentRoomId();const me=g?.players[uid];if(!me||!room)return;
        if(me.shopLevel>=(config.MAX_SHOP_LEVEL||5)){toast('已满级',true);return;}
        if(me.gold<1){toast('金币不足',true);return;}

        me.gold-=1;
        refreshAllUI();

        try{
            const t=await getAccessToken();
            const r=await fetch(BUY_EXP_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:room,userId:uid})
            });
            const d=await r.json();
            if(d.success&&d.updatedPlayer)mergeUpdatedPlayer(me,d.updatedPlayer);
            toast('升级成功');
        }catch(e){
            toast('同步失败',true);
        }
    }

    async function refreshShopAction(){
        const g=getGameState();if(!g||g.phase!=='prepare'){toast('只能准备阶段刷新',true);return;}
        const uid=getCurrentUserId(),room=getCurrentRoomId();const me=g?.players[uid];if(!me||!room)return;
        if(me.gold<1){toast('金币不足',true);return;}

        me.gold-=1;
        const old=me.shopCards;
        me.shopCards=[];
        refreshAllUI();

        try{
            const t=await getAccessToken();
            const r=await fetch(REFRESH_SHOP_FUNCTION_URL,{
                method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
                body:JSON.stringify({roomId:room,userId:uid})
            });
            const d=await r.json();
            if(d.success&&d.updatedPlayer){
                mergeUpdatedPlayer(me,d.updatedPlayer);
                me.shopCards=d.updatedPlayer.shopCards||old;
                renderShop();
            }
            toast('刷新成功');
        }catch(e){
            me.shopCards=old;
            renderShop();
            toast('刷新失败',true);
        }
    }

    function updateTimerDisplay(s,p){
        const t=document.getElementById('phase-timer');
        if(t)t.textContent=p==='buffering'?`⏳ ${s}`:`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
        const bt=document.getElementById('phase-timer-battle');
        if(bt)bt.textContent=p==='battle'?s:'00:00';
    }
    function setPhase(p){currentPhase=p;document.body.classList.toggle('buffering-mode',p==='buffering');}
    function bindUIEvents(){
        document.getElementById('refresh-shop-btn')?.addEventListener('click',refreshShopAction);
        document.getElementById('refresh-shop-btn-bottom')?.addEventListener('click',refreshShopAction);
        document.getElementById('buy-exp-btn')?.addEventListener('click',buyExpAction);
        document.getElementById('buy-exp-btn-bottom')?.addEventListener('click',buyExpAction);
    }
    function injectStyles(){
        if(document.getElementById('yycard-drag-style'))return;
        const s=document.createElement('style');s.id='yycard-drag-style';
        s.textContent=`.card{touch-action:none;user-select:none}.card-drag-clone{pointer-events:none!important}.shop-area.drop-target{box-shadow:0 0 0 3px #ff44}.buffering-mode *{pointer-events:none!important;opacity:0.6}`;
        document.head.appendChild(s);
    }
    function cacheDoms(){
        domCache.handContainer=document.getElementById('hand-container');
        domCache.shopContainer=document.getElementById('shop-container');
        domCache.myBoard=document.getElementById('my-board');
        domCache.enemyBoard=document.getElementById('enemy-board');
        domCache.myHealth=document.getElementById('my-health');
        domCache.myGold=document.getElementById('my-gold');
        domCache.shopLevel=document.getElementById('shop-level');
        domCache.roundNum=document.getElementById('round-num');
    }
    function init(){injectStyles();initDebugPanel();cacheDoms();bindUIEvents();refreshAllUI();log('✅ 商店已加载：永久乐观不弹回');}
    return {init,refreshAllUI,updateTimerDisplay,setPhase,log,toast};
})();
console.log('✅ shop.js 永久不弹回版加载完成');

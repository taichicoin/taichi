// ==================== 对战系统【满级禁止升级 + 累计经验阈值 + 全局时间戳重连】 ====================
window.YYCardBattle = (function() {
    const supabase = window.supabase;
    const auth = window.YYCardAuth;
    const utils = window.YYCardUtils;
    const config = window.YYCardConfig;

    let currentRoomId = null;
    let gameState = null;
    let gameSubscription = null;
    let selectedCard = null;
    let autoBotTimer = null;

    let phaseTimer = null;
    let timerInterval = null;
    let currentPhaseStartTime = 0;
    let currentPhaseDuration = 0;
    let enterGuard = false;

    // 根据累计总经验计算应得商店等级
    function getShopLevelByExp(exp) {
        if (exp >= 46) return 5;
        if (exp >= 26) return 4;
        if (exp >= 12) return 3;
        if (exp >= 4) return 2;
        return 1;
    }

    // ===== 手机调试面板 - 半透明 =====
    function initMobileDebugPanel() {
        const old = document.getElementById('mobile-debug-panel');
        if (old) old.remove();
        const p = document.createElement('div');
        p.id = 'mobile-debug-panel';
        p.style.cssText = `
            position:fixed;
            top:0;
            left:0;
            right:0;
            max-height:120px;
            overflow-y:auto;
            background:rgba(0,0,0,0.5);
            color:#0f0;
            font-size:11px;
            padding:4px 8px;
            z-index:100000;
            border-bottom:1px solid rgba(245,215,110,0.5);
            font-family:monospace;
            pointer-events:none;
            text-shadow:0 0 4px black;
            line-height:1.4;
        `;
        document.body.appendChild(p);
        return p;
    }

    function logToScreen(msg, isError = false) {
        const p = document.getElementById('mobile-debug-panel') || initMobileDebugPanel();
        const line = document.createElement('div');
        line.style.color = isError ? '#ff7b7b' : '#7bffb1';
        line.textContent = `[${new Date().toLocaleTimeString()}] ` + msg;
        p.appendChild(line);
        p.scrollTop = p.scrollHeight;
        while (p.children.length > 30) p.removeChild(p.firstChild);
    }

    window.addEventListener('error', (e) => {
        logToScreen(`❌ 全局错误: ${e.message}`, true);
    });

    function log(msg, isError = false) {
        if (auth?.log) auth.log(msg, isError);
        console.log(msg);
        logToScreen(msg, isError);
    }

    function safeSetText(id, val) {
        try { 
            const syncMap = {
                'round-num': ['round-num', 'round-num-top'],
                'my-health': ['my-health', 'my-health-top'],
                'my-gold': ['my-gold'],
                'shop-level': ['shop-level'],
                'hand-count': ['hand-count'],
                'phase-timer': ['phase-timer', 'phase-timer-battle']
            };
            const targetIds = syncMap[id] || [id];
            targetIds.forEach(targetId => {
                const el = document.getElementById(targetId);
                if (el) el.textContent = val;
            });
        } catch (e) {
            log(`safeSetText 警告: ${e.message}`, true);
        }
    }

    function getPrepareDuration(r) { return 25 + (r-1)*10; }
    function getBattleDuration(r) { return 30 + (r-1)*5; }
    const SETTLE_DURATION = 3;

    function getPhaseDuration(phase, round) {
        if (phase === 'prepare') return getPrepareDuration(round);
        if (phase === 'battle') return getBattleDuration(round);
        return SETTLE_DURATION;
    }

    function startPhaseTimer(phase, duration, skipStateUpdate = false) {
        if (phaseTimer) clearTimeout(phaseTimer);
        if (timerInterval) clearInterval(timerInterval);
        currentPhaseDuration = duration;
        
        if (!skipStateUpdate) {
            gameState.phaseStartTime = new Date().toISOString();
            currentPhaseStartTime = Date.now();
            updateGameState();
        } else {
            currentPhaseStartTime = Date.now() - (getPhaseDuration(phase, gameState.round) - duration) * 1000;
        }
        
        log(`⏱️ 启动计时器: ${phase} / ${duration}秒`);
        
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - currentPhaseStartTime) / 1000);
            const remaining = Math.max(0, currentPhaseDuration - elapsed);
            updateTimerDisplay(remaining, phase);
        }, 100);
        
        phaseTimer = setTimeout(() => {
            clearInterval(timerInterval);
            log(`⏰ 计时器到期: ${phase}`);
            onPhaseEnd(phase);
        }, duration * 1000);
    }

    function updateTimerDisplay(seconds, phase) {
        try {
            if (phase === 'prepare') {
                const m = Math.floor(seconds/60).toString().padStart(2,'0');
                const s = (seconds%60).toString().padStart(2,'0');
                safeSetText('phase-timer', `${m}:${s}`);
            }
            else if (phase === 'battle') {
                safeSetText('phase-timer-battle', seconds);
            }
        } catch (e) {}
    }

    // ===== 快速推进到当前回合（基于 gameStartTime） =====
    function fastForwardToCurrentRound() {
        if (!gameState || !gameState.gameStartTime) return false;

        const startTime = new Date(gameState.gameStartTime).getTime();
        const now = Date.now();
        let elapsed = Math.floor((now - startTime) / 1000);
        
        let currentRound = 1;
        let currentPhase = 'prepare';
        let remainingSeconds = 0;
        
        while (elapsed > 0) {
            const prepareDur = getPrepareDuration(currentRound);
            const battleDur = getBattleDuration(currentRound);
            const settleDur = SETTLE_DURATION;
            const totalRoundTime = prepareDur + battleDur + settleDur;
            
            if (elapsed >= totalRoundTime) {
                elapsed -= totalRoundTime;
                currentRound++;
            } else {
                if (elapsed < prepareDur) {
                    currentPhase = 'prepare';
                    remainingSeconds = prepareDur - elapsed;
                } else if (elapsed < prepareDur + battleDur) {
                    currentPhase = 'battle';
                    remainingSeconds = prepareDur + battleDur - elapsed;
                } else {
                    currentPhase = 'settle';
                    remainingSeconds = totalRoundTime - elapsed;
                }
                break;
            }
        }
        
        const oldRound = gameState.round;
        if (currentRound > oldRound) {
            log(`⏩ 快速推进: 从回合 ${oldRound} 到 ${currentRound}`);
            for (let r = oldRound; r < currentRound; r++) {
                const goldAdd = config.ECONOMY.GOLD_PER_ROUND(r);
                const expAdd = config.ECONOMY.EXP_PER_ROUND;
                for (const pid in gameState.players) {
                    const p = gameState.players[pid];
                    p.gold += goldAdd;
                    p.exp += expAdd;
                    const newLevel = getShopLevelByExp(p.exp);
                    if (newLevel > p.shopLevel) {
                        p.shopLevel = newLevel;
                        log(`🎉 玩家 ${pid.slice(0,6)} 商店升级到 Lv.${p.shopLevel} (补发奖励)`);
                    }
                }
                log(`💰 补发回合 ${r} 奖励: 金币 +${goldAdd}, 经验 +${expAdd}`);
            }
        }
        
        gameState.round = currentRound;
        gameState.phase = currentPhase;
        gameState.phaseStartTime = new Date(Date.now() - (getPhaseDuration(currentPhase, currentRound) - remainingSeconds) * 1000).toISOString();
        
        refreshAllShops().then(() => {
            applyUIMode(currentPhase === 'prepare');
            safeRenderBattleUI();
            startPhaseTimer(currentPhase, remainingSeconds);
        });
        
        return true;
    }

    async function onPhaseEnd(phase) {
        log(`🔄 阶段结束: ${phase}`);
        if (!gameState || !currentRoomId) return;
        try {
            if (phase === 'prepare') {
                gameState.phase = 'battle';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                applyUIMode(false);
                safeRenderBattleUI();
                currentPhaseStartTime = Date.now();
                startPhaseTimer('battle', getBattleDuration(gameState.round));
                await simulateBattle();
            } else if (phase === 'battle') {
                gameState.phase = 'settle';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                applyUIMode(false);
                safeRenderBattleUI();
                currentPhaseStartTime = Date.now();
                startPhaseTimer('settle', SETTLE_DURATION);
            } else if (phase === 'settle') {
                await distributeRoundRewards();
                const over = checkGameOver();
                if (over.isOver) { endGame(over.winner); return; }
                gameState.round++;
                gameState.phase = 'prepare';
                gameState.phaseStartTime = new Date().toISOString();
                await updateGameState();
                applyUIMode(true);
                safeRenderBattleUI();
                await refreshAllShops();
                currentPhaseStartTime = Date.now();
                startPhaseTimer('prepare', getPrepareDuration(gameState.round));
            }
        } catch (e) {
            log(`❌ onPhaseEnd 出错: ${e.message}`, true);
        }
    }

    function applyUIMode(isPrepare) {
        try {
            if(isPrepare){
                document.body.classList.remove('battle-view-mode');
            }else{
                document.body.classList.add('battle-view-mode');
            }
            log(`📱 UI模式切换: ${isPrepare ? '准备阶段' : '战斗阶段'}`);
        } catch (e) {
            log(`applyUIMode 出错: ${e.message}`, true);
        }
    }

    async function enterBattle(roomId) {
        if (enterGuard) {
            log('⚠️ 已在进入流程中，跳过重复调用');
            return;
        }
        enterGuard = true;
        log('🚪 enterBattle 入口，房间: ' + roomId);

        currentRoomId = roomId;
        document.getElementById('lobby-view').style.display = 'none';
        document.getElementById('battle-view').style.display = 'block';
        initMobileDebugPanel();
        
        subscribeToGame(roomId);
        bindBattleEvents();
        startBotAutoPlay();

        let attempts = 0;
        const MAX_ATTEMPTS = 15;
        
        const waitForState = async () => {
            if (gameState) {
                startGameWithState();
                return;
            }
            if (attempts < MAX_ATTEMPTS) {
                attempts++;
                log(`⏳ 等待游戏状态... (${attempts}/${MAX_ATTEMPTS})`);
                const { data } = await supabase
                    .from('game_states')
                    .select('state')
                    .eq('room_id', roomId)
                    .maybeSingle();
                if (data?.state) {
                    gameState = data.state;
                    startGameWithState();
                    return;
                }
                setTimeout(waitForState, 200);
            } else {
                log('❌ 等待游戏状态超时，请返回大厅重新匹配', true);
                alert('游戏状态加载失败，请重试');
                document.getElementById('battle-view').style.display = 'none';
                document.getElementById('lobby-view').style.display = 'block';
                if (gameSubscription) {
                    gameSubscription.unsubscribe();
                    gameSubscription = null;
                }
                currentRoomId = null;
                enterGuard = false;
            }
        };

        const startGameWithState = () => {
            if (!gameState.gameStartTime) {
                gameState.gameStartTime = new Date().toISOString();
                updateGameState();
            }
            
            const fastForwarded = fastForwardToCurrentRound();
            if (fastForwarded) return;
            
            const phase = gameState.phase;
            const round = gameState.round;
            log(`📋 回合 ${round}, 阶段 ${phase}`);
            applyUIMode(phase === 'prepare');
            safeRenderBattleUI();
            
            if (gameState.phaseStartTime) {
                const startTime = new Date(gameState.phaseStartTime).getTime();
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const total = getPhaseDuration(phase, round);
                const remaining = Math.max(0, total - elapsed);
                if (remaining <= 0) {
                    onPhaseEnd(phase);
                } else {
                    currentPhaseStartTime = startTime;
                    startPhaseTimer(phase, remaining, true);
                }
            } else {
                startPhaseTimer(phase, getPhaseDuration(phase, round));
            }
        };

        waitForState();
    }

    function subscribeToGame(roomId) {
        if (gameSubscription) gameSubscription.unsubscribe();
        gameSubscription = supabase
            .channel(`game:${roomId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_states', filter: `room_id=eq.${roomId}` }, (payload) => {
                gameState = payload.new.state;
                applyUIMode(gameState.phase === 'prepare');
                safeRenderBattleUI();
            })
            .subscribe();
    }

    async function updateGameState() {
        if (!currentRoomId || !gameState) return;
        await supabase.from('game_states').update({ state: gameState }).eq('room_id', currentRoomId);
    }

    function safeRenderBattleUI() {
        try { 
            renderBattleUI(); 
        } catch (e) { 
            log(`❌ renderBattleUI 出错: ${e.message}`, true);
            logToScreen(`详细错误: ${e.stack}`, true);
        }
    }

    function renderBattleUI() {
        if (!gameState) return;
        const myId = auth.currentUser.id;
        const my = gameState.players[myId];
        if (!my) return;

        safeSetText('my-health', my.health);
        safeSetText('my-gold', my.gold);
        safeSetText('shop-level', my.shopLevel);
        safeSetText('round-num', gameState.round);
        safeSetText('hand-count', my.hand.length);

        renderBoard('my-board', my.board, true);
        renderHand(my.hand);
        renderShop(my.shopCards);

        const oppId = Object.keys(gameState.players).find(id => id !== myId);
        if (oppId) renderBoard('enemy-board', gameState.players[oppId].board, false);

        renderPlayerStatusList();

        const isBot = my.isBot;
        const isMyTurn = gameState.phase === 'prepare';
        const endBtn = document.getElementById('end-prepare-btn');
        if (endBtn) endBtn.style.pointerEvents = (isBot || !isMyTurn) ? 'none' : 'auto';

        // ===== 处理升级按钮状态（满级禁用） =====
        const buyExpBtn = document.getElementById('buy-exp-btn');
        const buyExpBtnBottom = document.getElementById('buy-exp-btn-bottom');
        const isMaxLevel = my.shopLevel >= (config.MAX_SHOP_LEVEL || 5);
        const shouldDisable = isBot || !isMyTurn || isMaxLevel;
        
        [buyExpBtn, buyExpBtnBottom].forEach(btn => {
            if (btn) {
                if (isMaxLevel) {
                    btn.textContent = '📈 已满级';
                } else {
                    btn.textContent = '📈 升级';
                }
                btn.disabled = shouldDisable;
                btn.style.pointerEvents = shouldDisable ? 'none' : 'auto';
                btn.style.opacity = shouldDisable ? '0.6' : '1';
            }
        });
    }

    function renderPlayerStatusList() {
        const container = document.getElementById('player-status-list');
        if (!container || !gameState) return;
        container.innerHTML = '';

        Object.values(gameState.players).forEach(player => {
            const item = document.createElement('div');
            item.className = 'player-status-item';
            
            const avatar = document.createElement('img');
            avatar.src = player.avatar || '/assets/default-avatar.png';
            avatar.alt = player.username;
            avatar.onerror = () => { avatar.src = '/assets/default-avatar.png'; };
            
            const level = document.createElement('div');
            level.className = 'player-level';
            level.textContent = player.level || 1;
            
            const hpBar = document.createElement('div');
            hpBar.className = 'hp-bar';
            const hpFill = document.createElement('div');
            hpFill.className = 'hp-fill';
            hpFill.style.width = `${Math.max(0, Math.min(100, (player.health / 100) * 100))}%`;
            hpBar.appendChild(hpFill);

            item.appendChild(avatar);
            item.appendChild(level);
            item.appendChild(hpBar);
            container.appendChild(item);
        });
    }

    function renderBoard(containerId, cards, isSelf) {
        const cont = document.getElementById(containerId);
        if (!cont) return;
        cont.innerHTML = '';
        for (let i=0; i<6; i++) {
            const c = cards[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            if (c) {
                slot.appendChild(createCardElement(c));
            } else {
                slot.innerHTML = `<div class="card empty-slot">⬤</div>`;
            }
            if (isSelf && gameState.phase==='prepare') {
                slot.addEventListener('click', ()=>handleBoardSlotClick(i));
            }
            cont.appendChild(slot);
        }
    }

    function renderHand(cards) {
        const cont = document.getElementById('hand-container');
        if (!cont) return;
        cont.innerHTML = '';
        cards.forEach((c,i) => {
            if(c) {
                const el = createCardElement(c);
                el.addEventListener('click', ()=>handleHandCardClick(c,i));
                cont.appendChild(el);
            }
        });
    }

    function renderShop(cards) {
        const cont = document.getElementById('shop-container');
        if (!cont) return;
        cont.innerHTML = '';
        if (!cards || cards.length === 0) {
            log('⚠️ 商店卡牌数组为空', true);
            cont.innerHTML = '<div style="color:#aaa;padding:10px;">商店刷新中...</div>';
            return;
        }
        cards.forEach((c,i) => {
            if(c) {
                const el = createCardElement(c);
                el.addEventListener('click', ()=>handleShopCardClick(c,i));
                cont.appendChild(el);
            }
        });
    }

    function createCardElement(card) {
        const d = document.createElement('div');
        d.className = 'card';
        d.setAttribute('data-rarity', card.rarity);
        
        const imgPath = card.image || card.icon || `/assets/card/${card.cardId || card.id || 'default'}.png`;
        const price = getCardPrice(card);
        
        d.innerHTML = `
            <div class="card-icon">
                <img src="${imgPath}" alt="${card.name}" onerror="this.src='/assets/default-avatar.png'">
            </div>
            <div class="card-name">${card.name}</div>
            <div class="card-stats">
                <span class="card-atk">⚔️${card.atk}</span>
                <span class="card-hp">🛡️${card.hp}</span>
            </div>
            <div class="card-price">💰${price}</div>
            ${card.star > 0 ? '<div class="card-star">★</div>' : ''}
        `;
        return d;
    }

    function getCardPrice(c) {
        const p = config.ECONOMY?.CARD_PRICE || { Common:{buy:1}, Rare:{buy:2}, Epic:{buy:3}, Legendary:{buy:5} };
        return p[c.rarity]?.buy || 1;
    }

    function handleHandCardClick(card, idx) {
        if (gameState.phase!=='prepare') { log('⚠️ 准备阶段才可操作', true); return; }
        selectedCard = { type:'hand', card, index: idx };
        document.querySelectorAll('.hand .card').forEach(el=>el.classList.remove('selected'));
        document.querySelectorAll('.hand .card')[idx]?.classList.add('selected');
    }

    async function handleShopCardClick(card, idx) {
        if (gameState.phase!=='prepare') return;
        const my = gameState.players[auth.currentUser.id];
        const price = getCardPrice(card);
        if (my.gold < price) { log('❌ 金币不足', true); return; }
        if (my.hand.length >= (config.HAND_MAX_COUNT||15)) { log('❌ 手牌已满', true); return; }
        my.gold -= price;
        my.hand.push({...card, id: utils.uuid() });
        my.shopCards.splice(idx,1);
        await updateGameState();
    }

    async function handleBoardSlotClick(idx) {
        if (!selectedCard || selectedCard.type!=='hand') { log('⚠️ 请先选择手牌', true); return; }
        const my = gameState.players[auth.currentUser.id];
        const handIdx = selectedCard.index;
        const card = my.hand[handIdx];
        const old = my.board[idx];
        my.board[idx] = card;
        my.hand.splice(handIdx,1);
        if (old) my.hand.push(old);
        selectedCard = null;
        document.querySelectorAll('.card.selected').forEach(el=>el.classList.remove('selected'));
        await updateGameState();
    }

    async function refreshShop() {
        if (gameState.phase!=='prepare') return;
        const my = gameState.players[auth.currentUser.id];
        const cost = config.ECONOMY?.REFRESH_COST || 1;
        if (my.gold < cost) { log('❌ 金币不足', true); return; }
        my.gold -= cost;
        my.shopCards = await utils.generateShopCards(my.shopLevel);
        await updateGameState();
    }

    // ===== 手动购买经验：满级禁止 =====
    async function buyExp() {
        if (gameState.phase!=='prepare') return;
        const my = gameState.players[auth.currentUser.id];
        if (my.isBot) return;
        
        // 检查是否已满级
        if (my.shopLevel >= (config.MAX_SHOP_LEVEL || 5)) {
            log('⚠️ 商店已满级，无法继续升级', true);
            return;
        }
        
        if (my.gold < 1) { log('❌ 金币不足', true); return; }
        const oldExp = my.exp;
        my.gold--;
        my.exp += config.ECONOMY?.GOLD_TO_EXP_RATE || 1;
        log(`📈 手动购买经验: ${oldExp} → ${my.exp} (消耗1金币)`);
        
        const newLevel = getShopLevelByExp(my.exp);
        if (newLevel > my.shopLevel) {
            my.shopLevel = newLevel;
            log(`🎉 商店升级到 Lv.${my.shopLevel}`);
        }
        await updateGameState();
        safeRenderBattleUI(); // 立即刷新按钮状态
    }

    async function endPreparePhase() {
        if (gameState.phase!=='prepare') return;
        if (phaseTimer) clearTimeout(phaseTimer);
        if (timerInterval) clearInterval(timerInterval);
        await onPhaseEnd('prepare');
    }

    async function simulateBattle() {
        const players = Object.keys(gameState.players);
        if (players.length < 2) return;
        for (let i = 0; i < players.length; i += 2) {
            if (i + 1 >= players.length) break;
            const p1Id = players[i];
            const p2Id = players[i + 1];
            const p1 = gameState.players[p1Id];
            const p2 = gameState.players[p2Id];
            const p1Units = p1.board.filter(c => c !== null).length;
            const p2Units = p2.board.filter(c => c !== null).length;
            let winnerId, loserId, winnerUnits;
            if (p1Units > p2Units) {
                winnerId = p1Id; loserId = p2Id; winnerUnits = p1Units;
            } else if (p2Units > p1Units) {
                winnerId = p2Id; loserId = p1Id; winnerUnits = p2Units;
            } else {
                const randomWinner = Math.random() > 0.5 ? p1Id : p2Id;
                winnerId = randomWinner;
                loserId = randomWinner === p1Id ? p2Id : p1Id;
                winnerUnits = p1Units;
            }
            const loser = gameState.players[loserId];
            const damage = config.BATTLE.BASE_DAMAGE + winnerUnits * config.BATTLE.DAMAGE_PER_SURVIVAL;
            loser.health = Math.max(0, loser.health - damage);
            log(`⚔️ ${winnerId.slice(0,6)} 击败 ${loserId.slice(0,6)}，存活单位 ${winnerUnits}，伤害 ${damage}`);
        }
        await updateGameState();
    }

    // ===== 回合奖励：使用累计经验阈值升级 =====
    async function distributeRoundRewards() {
        const round = gameState.round;
        const goldAdd = config.ECONOMY.GOLD_PER_ROUND(round);
        const expAdd = config.ECONOMY.EXP_PER_ROUND;
        for (const pid in gameState.players) {
            const p = gameState.players[pid];
            p.gold += goldAdd;
            p.exp += expAdd;
            log(`📊 玩家 ${pid.slice(0,6)}: 经验 ${p.exp - expAdd} → ${p.exp} (回合奖励)`);
            
            const newLevel = getShopLevelByExp(p.exp);
            if (newLevel > p.shopLevel) {
                p.shopLevel = newLevel;
                log(`🎉 玩家 ${pid.slice(0,6)} 商店升级到 Lv.${p.shopLevel} (经验 ${p.exp})`);
            }
        }
        await updateGameState();
        log(`💰 回合奖励: 金币 +${goldAdd}, 经验 +${expAdd}`);
    }

    async function refreshAllShops() {
        for (const pid in gameState.players) {
            try {
                gameState.players[pid].shopCards = await utils.generateShopCards(gameState.players[pid].shopLevel);
            } catch (e) {
                log(`❌ 刷新 ${pid} 商店失败: ${e.message}`, true);
            }
        }
    }

    function checkGameOver() {
        const players = Object.entries(gameState.players);
        const alive = players.filter(([id, p]) => p.health > 0);
        log(`👥 存活玩家总数: ${alive.length}`);
        if (alive.length <= 1) {
            const winnerId = alive.length === 1 ? alive[0][0] : 'bot';
            return { isOver: true, winner: winnerId };
        }
        return { isOver: false };
    }

    function endGame(winnerId) {
        log(`🏆 游戏结束！胜利者: ${winnerId}`);
        alert(`游戏结束！胜利者: ${winnerId}`);
        setTimeout(() => {
            document.getElementById('battle-view').style.display = 'none';
            document.getElementById('lobby-view').style.display = 'block';
            if (gameSubscription) {
                gameSubscription.unsubscribe();
                gameSubscription = null;
            }
            if (phaseTimer) clearTimeout(phaseTimer);
            if (timerInterval) clearInterval(timerInterval);
            if (autoBotTimer) clearInterval(autoBotTimer);
            gameState = null;
            currentRoomId = null;
            enterGuard = false;
        }, 3000);
    }

    function startBotAutoPlay() {
        if (autoBotTimer) clearInterval(autoBotTimer);
        const hasBoughtExpThisRound = {};
        autoBotTimer = setInterval(async () => {
            if (!gameState || gameState.phase !== 'prepare') return;
            const myId = auth.currentUser?.id;
            const my = gameState.players[myId];
            if (!my || !my.isBot) return;
            const currentRound = gameState.round;
            if (hasBoughtExpThisRound[myId] === currentRound) return;
            
            // 人机满级后不再购买经验
            if (my.shopLevel >= (config.MAX_SHOP_LEVEL || 5)) return;
            
            if (my.gold >= 1) {
                my.gold--;
                my.exp++;
                log(`🤖 人机购买经验，当前经验 ${my.exp}`);
                
                const newLevel = getShopLevelByExp(my.exp);
                if (newLevel > my.shopLevel) {
                    my.shopLevel = newLevel;
                    log(`🤖 人机商店升级到 Lv.${my.shopLevel}`);
                }
                await updateGameState();
                hasBoughtExpThisRound[myId] = currentRound;
            }
        }, 2000);
    }

    function bindBattleEvents() {
        const clearEvent = (id, event) => {
            const el = document.getElementById(id);
            if (el) {
                const newEl = el.cloneNode(true);
                el.parentNode.replaceChild(newEl, el);
                return newEl;
            }
            return null;
        };
        const refreshBtn = clearEvent('refresh-shop-btn', 'click');
        if (refreshBtn) refreshBtn.addEventListener('click', refreshShop);
        const buyExpBtn = clearEvent('buy-exp-btn', 'click');
        if (buyExpBtn) buyExpBtn.addEventListener('click', buyExp);
        const endBtn = clearEvent('end-prepare-btn', 'click');
        if (endBtn) endBtn.addEventListener('click', endPreparePhase);
        const leaveBtn = clearEvent('leave-battle-btn', 'click');
        if (leaveBtn) {
            leaveBtn.addEventListener('click', async () => {
                if(!confirm('确定退出对局？')) return;
                if(phaseTimer) clearTimeout(phaseTimer);
                if(timerInterval) clearInterval(timerInterval);
                if(autoBotTimer) clearInterval(autoBotTimer);
                if(window.YYCardMatchmaking?.cancel) await window.YYCardMatchmaking.cancel();
                if(gameSubscription) {
                    gameSubscription.unsubscribe();
                    gameSubscription = null;
                }
                document.getElementById('battle-view').style.display = 'none';
                document.getElementById('lobby-view').style.display = 'block';
                gameState = null;
                currentRoomId = null;
                enterGuard = false;
                log('🚪 已退出对局');
            });
        }
        const settingsBtn = clearEvent('settings-btn', 'click');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                alert('设置功能开发中');
            });
        }
    }

    return { enterBattle };
})();

console.log('✅ battle.js 加载完成【满级禁止升级 + 累计经验阈值版】');

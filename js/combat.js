// ==================== 战斗模拟模块（后端完全自读数据 + 貔貅即死动画 1s 光球） ====================
window.YYCardCombat = (function() {
    let isAnimating = false;
    const AVG_STEP_MS = 480;
    const BOARD_PAUSE_MS = 1000;
    let _combatLogText = '';

    const ENEMY_DATA_TO_VISUAL = { 0:3, 1:4, 2:5, 3:0, 4:1, 5:2 };

    // ================== 调试面板（纯透明，不遮挡游戏画面） ==================
    function ensureDebugPanel() {
        if (document.getElementById('combat-debug-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'combat-debug-panel';
        panel.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; max-height: 35vh;
            overflow-y: auto; background: transparent; color: #0f0;
            font-family: monospace; font-size: 11px; padding: 4px 6px;
            z-index: 99999; border: none;
            pointer-events: auto;
            text-shadow: 0 0 3px #000, 0 0 3px #000;
        `;
        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px;';
        const title = document.createElement('span');
        title.textContent = '🐵 动画调试';
        title.style.cssText = 'font-weight:bold; color:#ff0; text-shadow: 0 0 3px #000;';
        header.appendChild(title);
        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display:flex; gap:6px;';
        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = '▲ 隐藏';
        toggleBtn.style.cssText = `
            background: rgba(0,0,0,0.5); color: #fff; border: 1px solid #555;
            padding: 2px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;
        `;
        const content = document.createElement('div');
        content.id = 'combat-debug-content';
        content.style.cssText = 'margin-top:6px; white-space:pre-wrap; word-break:break-all; background: transparent;';
        toggleBtn.onclick = () => {
            content.style.display = content.style.display === 'none' ? '' : 'none';
            toggleBtn.textContent = content.style.display === 'none' ? '▼ 展开' : '▲ 隐藏';
        };
        btnGroup.appendChild(toggleBtn);
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 复制';
        copyBtn.style.cssText = `
            background: rgba(0,255,0,0.7); color: #000; border: none;
            padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; cursor: pointer;
        `;
        copyBtn.onclick = () => {
            if (!_combatLogText) { alert('无日志'); return; }
            if (navigator.clipboard) {
                navigator.clipboard.writeText(_combatLogText);
            } else {
                const ta = document.createElement('textarea');
                ta.value = _combatLogText;
                ta.style.cssText = 'position:fixed;top:-9999px;';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            copyBtn.textContent = '✅';
            setTimeout(() => { copyBtn.textContent = '📋 复制'; }, 1500);
        };
        btnGroup.appendChild(copyBtn);
        header.appendChild(btnGroup);
        panel.appendChild(header);
        panel.appendChild(content);
        document.body.appendChild(panel);
    }

    function debugLog(msg) {
        _combatLogText += msg + '\n';
        ensureDebugPanel();
        const c = document.getElementById('combat-debug-content');
        if (!c) return;
        const l = document.createElement('div');
        l.textContent = msg;
        c.appendChild(l);
        const panel = document.getElementById('combat-debug-panel');
        if (panel) panel.scrollTop = panel.scrollHeight;
    }

    function clearDebug() {
        _combatLogText = '';
        const c = document.getElementById('combat-debug-content');
        if (c) c.innerHTML = '';
    }

    // ================== DOM查找（5级兜底） ==================
    function getCardElement(playerId, dataPos, isEnemy) {
        const board = document.querySelector(`.board[data-player-id="${playerId}"]`);
        if (!board) return null;
        let slot = board.querySelector(`.card-slot[data-board-index="${dataPos}"]`);
        if (slot) { const card = slot.querySelector('.card:not(.empty-slot)'); if (card) return card; }
        if (isEnemy) {
            const v = ENEMY_DATA_TO_VISUAL[dataPos];
            if (v !== undefined) {
                slot = board.querySelector(`.card-slot[data-board-index="${v}"]`);
                if (slot) { const card = slot.querySelector('.card:not(.empty-slot)'); if (card) return card; }
            }
        }
        slot = board.querySelector(`.card-slot[data-slot-index="${dataPos}"]`);
        if (slot) { const card = slot.querySelector('.card:not(.empty-slot)'); if (card) return card; }
        const all = board.querySelectorAll('.card-slot');
        for (const s of all) {
            if (s.getAttribute('data-board-index') == dataPos) {
                const card = s.querySelector('.card:not(.empty-slot)');
                if (card) return card;
            }
        }
        for (const s of all) {
            if (s.getAttribute('data-slot-index') == dataPos) {
                const card = s.querySelector('.card:not(.empty-slot)');
                if (card) return card;
            }
        }
        return null;
    }

    // ================== 动画核心 ==================
    let abortFlag = false;

    function updateCardStats(el, atkGain, hpGain, shieldDelta = 0) {
        const atkEl = el.querySelector('.card-atk');
        const hpEl = el.querySelector('.card-hp');

        if (atkEl && atkGain !== undefined && atkGain !== 0) {
            const cur = parseInt(atkEl.textContent.replace(/\D/g, ''), 10) || 0;
            atkEl.textContent = `${cur + atkGain}`;
        }
        if (hpEl && hpGain !== undefined && hpGain !== 0) {
            const cur = parseInt(hpEl.textContent.replace(/\D/g, ''), 10) || 0;
            hpEl.textContent = `${cur + hpGain}`;
        }

        // 护盾层数变化（用于攻击消耗护盾时）
        if (shieldDelta !== 0) {
            const shieldEl = el.querySelector('.card-shield span');
            if (shieldEl) {
                const curShield = parseInt(shieldEl.textContent) || 0;
                const newShield = Math.max(0, curShield + shieldDelta);
                shieldEl.textContent = newShield;
                const shieldContainer = el.querySelector('.card-shield');
                if (shieldContainer && newShield <= 0) {
                    shieldContainer.style.display = 'none';
                }
            }
        }
    }

    function floatingText(el, text, color, duration) {
        const d = document.createElement('div');
        d.textContent = text;
        d.style.cssText = `position:absolute; color:${color}; font-size:28px; font-weight:bold; text-shadow:0 0 6px #000; z-index:200; left:50%; top:30%; transform:translate(-50%,-50%); animation:damageFloat ${duration}ms forwards; pointer-events:none;`;
        el.style.position = 'relative';
        el.appendChild(d);
        setTimeout(() => d.remove(), duration);
    }

    function buffAnim(buff) {
        return new Promise(resolve => {
            const myId = window.YYCardAuth?.currentUser?.id;
            const isEnemy = buff.playerId !== myId;
            const el = getCardElement(buff.playerId, buff.position, isEnemy);
            if (!el) { debugLog(`⚠️增益缺失: p=${buff.playerId.slice(0,8)} pos=${buff.position}`); return resolve(); }

            const totalAtkGain = (buff.atkGain || 0) + (buff.tempAtkGain || 0);
            const totalHpGain = (buff.hpGain || 0) + (buff.tempHpGain || 0);
            const shieldGain = buff.tempShieldGain || 0;

            updateCardStats(el, totalAtkGain, totalHpGain);

            // 处理临时护盾增益
            if (shieldGain > 0) {
                let shieldEl = el.querySelector('.card-shield');
                if (!shieldEl) {
                    shieldEl = document.createElement('div');
                    shieldEl.className = 'card-shield';
                    shieldEl.style.cssText = `
                        position: absolute; top: -0.5vh; right: -1vw;
                        width: 5vw; height: 5vw; border-radius: 50%;
                        background: transparent; border: 2px solid #ff8800;
                        box-shadow: 0 0 1vh #ff8800;
                        display: flex; align-items: center; justify-content: center;
                        z-index: 5;
                    `;
                    const span = document.createElement('span');
                    span.style.cssText = 'color: #fff; font-size: 2.5vw; font-weight: bold; text-shadow: 0 0 3px #000;';
                    span.textContent = '0';
                    shieldEl.appendChild(span);
                    el.appendChild(shieldEl);
                }
                const span = shieldEl.querySelector('span');
                const curShield = parseInt(span?.textContent) || 0;
                span.textContent = curShield + shieldGain;
                shieldEl.style.display = 'flex';
                floatingText(el, `🛡️ +${shieldGain}`, '#ffaa00', 1200);
            }

            if (totalAtkGain > 0 || totalHpGain > 0) {
                const text = `+${totalAtkGain}/+${totalHpGain}`;
                floatingText(el, `⬆️ ${text}`, '#7bffb1', 1200);
            }

            setTimeout(resolve, 400);
        });
    }

    function attackAnim(a) {
        return new Promise(resolve => {
            if (abortFlag) return resolve();
            const myId = window.YYCardAuth?.currentUser?.id;
            const attEl = getCardElement(a.attackerOwnerId, a.attackerPos, a.attackerOwnerId !== myId);
            const defEl = getCardElement(a.defenderOwnerId, a.defenderPos, a.defenderOwnerId !== myId);
            if (!attEl || !defEl) {
                debugLog(`⚠️攻击缺失: ${a.attackerName}(${a.attackerOwnerId.slice(0,8)} p${a.attackerPos}) → ${a.defenderName}(${a.defenderOwnerId.slice(0,8)} p${a.defenderPos})`);
                return resolve();
            }
            const ar = attEl.getBoundingClientRect(), dr = defEl.getBoundingClientRect();
            const dx = (dr.left - ar.left) * 0.7, dy = (dr.top - ar.top) * 0.7;
            attEl.style.transition = 'transform 0.35s ease-out';
            attEl.style.transform = `translate(${dx}px, ${dy}px)`;
            attEl.style.zIndex = '100';

            setTimeout(() => {
                if (abortFlag) return resolve();

                if (a.blocked) {
                    // 护盾格挡动画
                    defEl.style.transition = 'transform 0.1s';
                    defEl.style.transform = 'scale(0.95)';

                    const blockType = a.blockType === 'tempShield' ? '🟠' : '🔵';
                    const shieldDiv = document.createElement('div');
                    shieldDiv.textContent = `${blockType} -1`;
                    shieldDiv.style.cssText = 'position:absolute; color:#ffbb33; font-size:24px; font-weight:bold; text-shadow:0 0 8px #000; z-index:200; left:50%; top:40%; transform:translate(-50%,-50%); animation:damageFloat 1s forwards; pointer-events:none;';
                    defEl.style.position = 'relative';
                    defEl.appendChild(shieldDiv);
                    setTimeout(() => shieldDiv.remove(), 1000);

                    updateCardStats(defEl, 0, 0, -1);

                    setTimeout(() => {
                        if (abortFlag) return resolve();
                        defEl.style.transform = 'scale(1)';
                        attEl.style.transition = 'transform 0.25s';
                        attEl.style.transform = 'translate(0,0)';
                        attEl.style.zIndex = '';
                        resolve();
                    }, 250);
                } else {
                    // 正常扣血动画
                    defEl.style.transition = 'transform 0.15s';
                    defEl.style.transform = 'scale(0.85)';
                    const dmgDiv = document.createElement('div');
                    dmgDiv.textContent = `-${a.damage}`;
                    dmgDiv.style.cssText = 'position:absolute; color:#f44; font-size:32px; font-weight:bold; text-shadow:0 0 8px #000; z-index:200; left:50%; top:40%; transform:translate(-50%,-50%); animation:damageFloat 1s forwards; pointer-events:none;';
                    defEl.style.position = 'relative';
                    defEl.appendChild(dmgDiv);
                    setTimeout(() => dmgDiv.remove(), 1000);
                    const hpSpan = defEl.querySelector('.card-hp');
                    if (hpSpan) {
                        const totalHp = a.defenderHpAfter + (a.defenderTempHp || 0);
                        hpSpan.textContent = `${totalHp}`;
                    }
                    setTimeout(() => {
                        if (abortFlag) return resolve();
                        attEl.style.transition = 'transform 0.25s';
                        attEl.style.transform = 'translate(0,0)';
                        attEl.style.zIndex = '';
                        defEl.style.transform = 'scale(1)';
                        if (a.isFatal) {
                            defEl.style.transition = 'opacity 0.35s, transform 0.35s';
                            defEl.style.opacity = '0';
                            defEl.style.transform = 'scale(0.5)';
                            setTimeout(() => {
                                const slot = defEl.parentNode;
                                if (slot && slot.classList.contains('card-slot')) {
                                    slot.innerHTML = '<div class="card empty-slot">⬤</div>';
                                } else defEl.remove();
                                resolve();
                            }, 350);
                        } else setTimeout(resolve, 250);
                    }, 230);
                }
            }, 350);
        });
    }

    // ★ 貔貅即死动画：金色光球飞行 1s + 目标坍缩 1.2s
    function instantKillAnim(step) {
        return new Promise(resolve => {
            if (abortFlag) return resolve();

            const myId = window.YYCardAuth?.currentUser?.id;
            const attEl = getCardElement(step.attackerOwnerId, step.attackerPos, step.attackerOwnerId !== myId);
            const defEl = getCardElement(step.defenderOwnerId, step.defenderPos, step.defenderOwnerId !== myId);

            if (!attEl || !defEl) {
                debugLog(`⚠️即死动画缺失: ${step.attackerName} → ${step.defenderName}`);
                if (defEl) {
                    const slot = defEl.parentNode;
                    if (slot && slot.classList.contains('card-slot')) {
                        slot.innerHTML = '<div class="card empty-slot">⬤</div>';
                    } else defEl.remove();
                }
                return resolve();
            }

            const ar = attEl.getBoundingClientRect();
            const dr = defEl.getBoundingClientRect();

            // 创建金色光球
            const beam = document.createElement('div');
            beam.style.cssText = `
                position: fixed; z-index: 1500; pointer-events: none;
                width: 16px; height: 16px;
                background: radial-gradient(circle at 40% 40%, #ffffff, #f5d76e, #ff8800);
                border-radius: 50%;
                box-shadow: 0 0 30px #f5d76e, 0 0 60px #ffaa00;
                left: ${ar.left + ar.width/2 - 8}px;
                top: ${ar.top + ar.height/2 - 8}px;
                transition: left 1.0s ease-in, top 1.0s ease-in;
            `;
            document.body.appendChild(beam);

            // 触发飞行
            requestAnimationFrame(() => {
                beam.style.left = (dr.left + dr.width/2 - 8) + 'px';
                beam.style.top = (dr.top + dr.height/2 - 8) + 'px';
            });

            // 1.0秒后光球到达，移除光球并开始坍缩
            setTimeout(() => {
                beam.remove();
                if (abortFlag) return resolve();

                // 目标卡牌坍缩动画（中心缩小）
                defEl.style.transition = 'transform 1.2s ease-in, opacity 1.2s ease-in';
                defEl.style.transform = 'scale(0)';
                defEl.style.opacity = '0';
                defEl.style.transformOrigin = 'center center';

                // 1.2秒后清除卡牌
                setTimeout(() => {
                    if (abortFlag) return resolve();
                    const slot = defEl.parentNode;
                    if (slot && slot.classList.contains('card-slot')) {
                        slot.innerHTML = '<div class="card empty-slot">⬤</div>';
                    } else defEl.remove();
                    resolve();
                }, 1200);
            }, 1000);
        });
    }

    // ★★★ 核心播放器：处理 buff、攻击、跳过、女娲造人（只对当前玩家生效） ★★★
    async function playSteps(steps) {
        if (isAnimating) return;
        isAnimating = true;
        abortFlag = false;
        let idx = 0;
        for (const step of steps) {
            if (abortFlag) break;
            idx++;
            if (step.type === 'buff') {
                debugLog(`  ▶ buff #${idx}: ${step.sourceCard} ${step.desc} pos=${step.position}`);
                await buffAnim(step);
            } else if (step.type === 'attack') {
                debugLog(`  ▶ atk #${idx}: ${step.attackerName}→${step.defenderName} dmg=${step.damage}`);
                await attackAnim(step);
            } else if (step.type === 'instant_kill') {
                debugLog(`  ⚡ instant_kill #${idx}: ${step.attackerName} 吞噬 ${step.defenderName} (剩余${step.remainingCharges})`);
                await instantKillAnim(step);
            } else if (step.type === 'skip') {
                debugLog(`  ▶ skip #${idx}: ${step.cardName || '?'} ${step.desc || '跳过行动'}`);
            } else if (step.type === 'generate') {
                debugLog(`  ▶ generate #${idx}: ${step.sourceCard} ${step.desc}`);
                const currentPlayerId = window.YYCardAuth?.currentUser?.id;
                if (currentPlayerId && step.playerId === currentPlayerId) {
                    const rarity = step.rarity || 'Common';
                    const gameState = window.YYCardBattle?.getGameState?.();
                    const uid = currentPlayerId;
                    const my = gameState?.players?.[uid];
                    const hand = my?.hand;

                    if (!hand) {
                        debugLog(`  ⚠️ generate 失败：手牌数据不存在`);
                    } else {
                        const validCount = hand.filter(h => h && (h.cardId || h.card_id)).length;
                        if (validCount >= 15) {
                            debugLog(`  ⚠️ 手牌已满，无法生成`);
                        } else {
                            const templates = window.cardTemplates || {};
                            const allCards = Object.values(templates).filter(c =>
                                c.rarity === rarity &&
                                c.type !== 'weapon' &&
                                c.type !== 'item'
                            );

                            if (allCards.length > 0) {
                                const picked = allCards[Math.floor(Math.random() * allCards.length)];

                                const newCard = {
                                    instanceId: 'gen-' + Date.now() + '-' + Math.random(),
                                    cardId: picked.card_id,
                                    card_id: picked.card_id,
                                    name: picked.name,
                                    type: 'character',
                                    rarity: rarity,
                                    faction: picked.faction || '中立',
                                    atk: picked.base_atk || 0,
                                    hp: picked.base_hp || 0,
                                    baseAtk: picked.base_atk || 0,
                                    baseHp: picked.base_hp || 0,
                                    star: 0,
                                    price: rarity === 'Common' ? 1 : rarity === 'Rare' ? 2 : rarity === 'Epic' ? 3 : 4,
                                    image: picked.image || `/assets/card/${picked.card_id}.png`,
                                    weapon: null,
                                    item1: null,
                                    item2: null,
                                    shield: picked.shield || 0,
                                    chi: picked.chi || 0,
                                    equipment: { weapon: null, items: [null, null] },
                                    enlightenmentCount: 0
                                };

                                const emptyIdx = hand.findIndex(h => !h || !h.card_id);
                                if (emptyIdx !== -1) {
                                    hand[emptyIdx] = newCard;
                                } else {
                                    hand.push(newCard);
                                }

                                if (window.YYCardShop?.renderHand) {
                                    window.YYCardShop.renderHand();
                                }

                                floatingText(
                                    document.getElementById('hand-container'),
                                    `✨ ${picked.name}`,
                                    '#ffd700',
                                    1500
                                );

                                debugLog(`  ✅ 生成 ${picked.name}（${rarity}）到手牌`);
                            } else {
                                debugLog(`  ⚠️ 未找到${rarity}角色牌模板`);
                            }
                        }
                    }
                    await new Promise(r => setTimeout(r, 400));
                }
            } else {
                debugLog(`  ▶ unknown #${idx}: type=${step.type}`);
            }
            await new Promise(r => setTimeout(r, 80));
        }
        debugLog(`  🏁 播放完毕，共${idx}步`);
        isAnimating = false;
    }

    async function waitForEnemyBoard(oppId) {
        const start = Date.now();
        while (Date.now() - start < 2000) {
            const board = document.querySelector(`.board[data-player-id="${oppId}"]`);
            if (board && board.querySelectorAll('.card-slot').length === 6) {
                await new Promise(r => requestAnimationFrame(r));
                return true;
            }
            await new Promise(r => setTimeout(r, 40));
        }
        return false;
    }

    function renderEnemyBoardFromData(oppId, oppBoardData) {
        const enemyBoard = document.getElementById('enemy-board');
        if (!enemyBoard) return;
        enemyBoard.setAttribute('data-player-id', oppId);
        enemyBoard.innerHTML = '';

        const board = Array.isArray(oppBoardData) ? oppBoardData.slice(0, 6) : [];
        while (board.length < 6) {
            board.push(null);
        }

        const displayBoard = [
            board[3], board[4], board[5],
            board[0], board[1], board[2]
        ];

        for (let i = 0; i < 6; i++) {
            const c = displayBoard[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.setAttribute('data-slot-index', i);
            const dataIndex = i < 3 ? i + 3 : i - 3;
            slot.setAttribute('data-board-index', dataIndex);

            if (c && typeof c === 'object' && (c.card_id || c.cardId) && (c.hp + (c.tempHp || 0)) > 0) {
                const el = document.createElement('div');
                el.className = 'card';
                el.setAttribute('data-rarity', c.rarity);
                const imgPath = c.image || c.icon || `/assets/card/${c.card_id || 'default'}.png`;
                const totalAtk = (c.atk || 0) + (c.tempAtk || 0);
                const totalHp = (c.hp || 0) + (c.tempHp || 0);
                const starHtml = (c.star || 0) > 0 ? `<div class="card-star">★</div>` : '';
                const shieldHtml = (c.shield || 0) > 0 ? `<div class="card-shield"><span>${c.shield}</span></div>` : '';
                el.innerHTML = `
                    <div class="card-icon"><img src="${imgPath}" alt="${c.name}" onerror="this.src='/assets/default-avatar.png'"></div>
                    <div class="card-name">${c.name}</div>
                    <div class="card-stats"><span class="card-atk">${totalAtk}</span><span class="card-hp">${totalHp}</span></div>
                    ${starHtml}
                    ${shieldHtml}
                `;
                el.querySelector('img').draggable = false;
                slot.appendChild(el);
            } else {
                slot.innerHTML = '<div class="card empty-slot">⬤</div>';
            }
            enemyBoard.appendChild(slot);
        }
        debugLog(`🔧 敌方棋盘已渲染，对手ID: ${oppId.slice(0,8)}`);
    }

    async function resolveBattles(gameState, log, onComplete) {
        if (!gameState?.players) { onComplete?.(); return; }
        const roomId = window.YYCardBattle?.getCurrentRoomId();
        if (!roomId) { debugLog('[Combat] 无房间ID'); onComplete?.(); return; }

        isAnimating = false;
        abortFlag = false;

        const myId = window.YYCardAuth?.currentUser?.id;
        clearDebug();
        debugLog('🔍 ====== 结算开始 (后端自读) ======');

        let data;
        try {
            const supabase = window.supabase;
            const { data: { session } } = await supabase.auth.getSession();
            const resp = await fetch(
                'https://iogmpkwmkqsmmdkzggtk.supabase.co/functions/v1/settle-battle',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ roomId })
                }
            );
            data = await resp.json();
            if (!data.success) { debugLog('[Combat] 后端失败: ' + data.error); if (onComplete) onComplete(); return; }
        } catch (err) {
            debugLog('[Combat] 网络异常: ' + err.message);
            if (onComplete) onComplete();
            return;
        }

        if (data.updatedPlayers) {
            const oldPlayers = gameState.players || {};
            gameState.players = data.updatedPlayers;
            for (const pid in gameState.players) {
                const oldP = oldPlayers[pid];
                if (oldP) {
                    gameState.players[pid].gold = oldP.gold ?? 500000;
                    gameState.players[pid].exp = oldP.exp ?? 0;
                    gameState.players[pid].shopLevel = oldP.shopLevel ?? 1;
                    gameState.players[pid].shopCards = oldP.shopCards ?? gameState.players[pid].shopCards;
                    gameState.players[pid].hand = oldP.hand ?? gameState.players[pid].hand;
                    gameState.players[pid].isReady = oldP.isReady ?? false;
                }
            }
        }

        let oppId = null;
        const combatResults = data.combatResults || [];
        for (const cr of combatResults) {
            if (cr.p1 === myId && cr.p2 !== myId) { oppId = cr.p2; break; }
            else if (cr.p2 === myId && cr.p1 !== myId) { oppId = cr.p1; break; }
        }

        if (oppId && gameState.players[oppId]?.board) {
            renderEnemyBoardFromData(oppId, gameState.players[oppId].board);
            const ready = await waitForEnemyBoard(oppId);
            if (!ready) debugLog('⚠️ 敌方棋盘未在 2 秒内就绪，部分动画可能缺失');
        } else {
            debugLog('⚠️ 无有效对手数据，跳过敌方棋盘渲染');
        }

        const buffEvents = data.buffEvents || [];
        const allSteps = [...buffEvents];
        combatResults.forEach(cr => { if (cr.combatLog) allSteps.push(...cr.combatLog); });

        debugLog(`🎬 buffEvents=${buffEvents.length} 对战=${combatResults.length} 总步数=${allSteps.length}`);

        debugLog(`⏸️ 棋盘亮相，等待 ${BOARD_PAUSE_MS}ms ...`);
        await new Promise(r => setTimeout(r, BOARD_PAUSE_MS));
        debugLog(`▶️ 播放全部${allSteps.length}步`);

        if (allSteps.length > 0) {
            await playSteps(allSteps);
        }

        debugLog('✅ ====== 结算结束 ======');
        if (window.YYCardShop?.refreshAllUI) {
            window.YYCardShop.refreshAllUI();
        }
        if (onComplete) onComplete();
    }

    ensureDebugPanel();

    return {
        resolveBattles,
        abortAnimation: () => { abortFlag = true; },
        isAnimating: () => isAnimating
    };
})();

// ==================== 战斗模拟模块（终极修复：攻击缺失 + 无跳过 + 纯数字自适应） ====================
window.YYCardCombat = (function() {
    let isAnimating = false;
    const AVG_STEP_MS = 480;
    let _combatLogText = '';

    const ENEMY_DATA_TO_VISUAL = { 0:3, 1:4, 2:5, 3:0, 4:1, 5:2 };

    // ================== 调试面板（可折叠，置顶） ==================
    function ensureDebugPanel() {
        if (document.getElementById('combat-debug-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'combat-debug-panel';
        panel.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; max-height: 35vh;
            overflow-y: auto; background: rgba(0,0,0,0.92); color: #0f0;
            font-family: monospace; font-size: 11px; padding: 8px 10px;
            z-index: 99999; border-bottom: 2px solid #0f0;
            pointer-events: auto;
        `;
        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px;';
        const title = document.createElement('span');
        title.textContent = '🐵 动画调试';
        title.style.cssText = 'font-weight:bold; color:#ff0;';
        header.appendChild(title);
        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display:flex; gap:6px;';
        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = '▲ 隐藏';
        toggleBtn.style.cssText = `
            background:#555; color:#fff; border:none; padding:4px 10px;
            border-radius:4px; font-size:11px; cursor:pointer;
        `;
        const content = document.createElement('div');
        content.id = 'combat-debug-content';
        content.style.cssText = 'margin-top:6px; white-space:pre-wrap; word-break:break-all;';
        toggleBtn.onclick = () => {
            content.style.display = content.style.display === 'none' ? '' : 'none';
            toggleBtn.textContent = content.style.display === 'none' ? '▼ 展开' : '▲ 隐藏';
        };
        btnGroup.appendChild(toggleBtn);
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 复制';
        copyBtn.style.cssText = `
            background:#0f0; color:#000; border:none; padding:4px 10px;
            border-radius:4px; font-weight:bold; font-size:11px; cursor:pointer;
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

    function updateCardStats(el, atkGain, hpGain) {
        const atkEl = el.querySelector('.card-atk');
        const hpEl = el.querySelector('.card-hp');
        if (atkEl && atkGain) {
            const cur = parseInt(atkEl.textContent.replace(/\D/g, ''), 10) || 0;
            atkEl.textContent = atkEl.textContent.includes('⚔') ? `⚔️${cur + atkGain}` : `${cur + atkGain}`;
        }
        if (hpEl && hpGain) {
            const cur = parseInt(hpEl.textContent.replace(/\D/g, ''), 10) || 0;
            hpEl.textContent = hpEl.textContent.includes('🛡') ? `🛡️${cur + hpGain}` : `${cur + hpGain}`;
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
            updateCardStats(el, buff.atkGain || 0, buff.hpGain || 0);
            floatingText(el, `+${buff.atkGain || 0}/+${buff.hpGain || 0}`, '#7bffb1', 1000);
            setTimeout(resolve, 300);
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
                    hpSpan.textContent = hpSpan.textContent.includes('🛡') ? `🛡️${a.defenderHpAfter}` : `${a.defenderHpAfter}`;
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
            }, 350);
        });
    }

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
            } else {
                debugLog(`  ▶ atk #${idx}: ${step.attackerName}→${step.defenderName} dmg=${step.damage}`);
                await attackAnim(step);
            }
            await new Promise(r => setTimeout(r, 80));
        }
        debugLog(`  🏁 播放完毕，共${idx}步`);
        isAnimating = false;
    }

    // 直接渲染敌方棋盘到原有的 #enemy-board 容器中，保证位置正确
    function ensureEnemyBoard(oppId, oppBoardData) {
        let enemyBoard = document.getElementById('enemy-board');
        if (!enemyBoard) {
            // 如果原有的 enemy-board 不存在，就根据 #my-board 的结构创建一个
            const myBoard = document.getElementById('my-board');
            if (!myBoard) return;
            enemyBoard = document.createElement('div');
            enemyBoard.id = 'enemy-board';
            enemyBoard.className = 'board';
            enemyBoard.setAttribute('data-player-id', oppId);
            myBoard.parentNode.appendChild(enemyBoard);
        }
        // 设置正确的 data-player-id
        enemyBoard.setAttribute('data-player-id', oppId);
        // 清空并重新填充
        enemyBoard.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const c = oppBoardData[i];
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            slot.setAttribute('data-slot-index', i);
            const visualPos = ENEMY_DATA_TO_VISUAL[i];
            slot.setAttribute('data-board-index', visualPos);
            if (c && c.hp > 0) {
                const el = document.createElement('div');
                el.className = 'card';
                el.setAttribute('data-rarity', c.rarity);
                const imgPath = c.image || c.icon || `/assets/card/${c.card_id || 'default'}.png`;
                el.innerHTML = `
                    <div class="card-icon"><img src="${imgPath}" alt="${c.name}" onerror="this.src='/assets/default-avatar.png'"></div>
                    <div class="card-name">${c.name}</div>
                    <div class="card-stats"><span class="card-atk">${c.atk}</span><span class="card-hp">${c.hp}</span></div>
                `;
                el.querySelector('img').draggable = false;
                slot.appendChild(el);
            } else {
                slot.innerHTML = '<div class="card empty-slot">⬤</div>';
            }
            enemyBoard.appendChild(slot);
        }
        debugLog(`🔧 敌方棋盘已填充，对手ID: ${oppId.slice(0,8)}`);
    }

    async function resolveBattles(gameState, log, onComplete) {
        if (!gameState?.players) { onComplete?.(); return; }
        const roomId = window.YYCardBattle?.getCurrentRoomId();
        if (!roomId) { debugLog('[Combat] 无房间ID'); onComplete?.(); return; }

        const myId = window.YYCardAuth?.currentUser?.id;
        clearDebug();
        debugLog('🔍 ====== 结算开始 ======');

        let data;
        try {
            const supabase = window.supabase;
            const { data: { session } } = await supabase.auth.getSession();
            const resp = await fetch(
                'https://sznjaotjoljaiawbvfro.supabase.co/functions/v1/settle-battle',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ roomId, gameState })
                }
            );
            data = await resp.json();
            if (!data.success) { debugLog('[Combat] 后端失败: ' + data.error); if (onComplete) onComplete(); return; }
        } catch (err) {
            debugLog('[Combat] 网络异常: ' + err.message);
            if (onComplete) onComplete();
            return;
        }

        // 更新玩家状态（包含最新棋盘与属性）
        if (data.updatedPlayers) {
            const oldPlayers = gameState.players;
            gameState.players = data.updatedPlayers;
            for (const pid in oldPlayers) {
                if (gameState.players[pid]) {
                    gameState.players[pid].gold = oldPlayers[pid]?.gold ?? 0;
                    gameState.players[pid].exp = oldPlayers[pid]?.exp ?? 0;
                    gameState.players[pid].shopLevel = oldPlayers[pid]?.shopLevel ?? 1;
                    gameState.players[pid].shopCards = oldPlayers[pid]?.shopCards ?? [];
                    gameState.players[pid].hand = oldPlayers[pid]?.hand ?? [];
                    gameState.players[pid].isReady = oldPlayers[pid]?.isReady ?? false;
                }
            }
        }

        // 找出自己的对手
        let oppId = null;
        const combatResults = data.combatResults || [];
        for (const cr of combatResults) {
            if (cr.p1 === myId && cr.p2 !== myId) { oppId = cr.p2; break; }
            else if (cr.p2 === myId && cr.p1 !== myId) { oppId = cr.p1; break; }
        }

        // 渲染敌方棋盘（使用更新后的敌方棋盘数据）
        if (oppId && gameState.players[oppId]?.board) {
            ensureEnemyBoard(oppId, gameState.players[oppId].board);
        } else {
            debugLog('⚠️ 无有效对手数据，跳过敌方棋盘渲染');
        }

        const buffEvents = data.buffEvents || [];
        const allSteps = [...buffEvents];
        combatResults.forEach(cr => { if (cr.combatLog) allSteps.push(...cr.combatLog); });

        debugLog(`🎬 buffEvents=${buffEvents.length} 对战=${combatResults.length} 总步数=${allSteps.length}`);
        debugLog(`▶️ 播放全部${allSteps.length}步（无跳过）`);

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

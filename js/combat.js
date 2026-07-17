// ==================== 战斗核心 (combat.js) ====================
// 动画效果已拆分至 anisys/animations.js，工具在 anisys/aniutils.js，3D 在 anisys/3d.js
window.YYCardCombat = (function() {
    const utils = window.YYCombatUtils;
    const anims = window.YYCombatAnimations;
    const combat3D = window.YYCardCombat3D;

    let isAnimating = false;
    let _aborted = false;
    const BOARD_PAUSE_MS = 1000;

    // ★ 临时去重：记录最近一次 buff 的标识，防止 200ms 内重复播放
    let _lastBuffKey = '';
    let _lastBuffTime = 0;

    function updateGoldUI(gold) {
        const goldEl = document.getElementById('my-gold');
        if (goldEl) goldEl.textContent = gold;
        if (window.YYCardShop?.updateGold) window.YYCardShop.updateGold(gold);
    }

    function getGameState() {
        return window.YYCardBattle?.getGameState?.();
    }

    function getAttackerCardId(ownerId, pos) {
        const gs = getGameState();
        if (!gs || !gs.players) return '';
        const player = gs.players[ownerId];
        if (!player || !player.board) return '';
        const card = player.board[pos];
        if (!card) return '';
        return card.card_id || card.cardId || '';
    }

    async function playAttackVideo() {
        utils.debugLog(`🎬 播放黑化帝攻击动画`);
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.9);z-index:10000;display:flex;align-items:center;justify-content:center;';
            const video = document.createElement('video');
            video.src = '/assets/video/hhd.mp4';
            video.style.cssText = 'max-width:90vw;max-height:90vh;';
            video.muted = true;
            video.playsInline = true;
            overlay.appendChild(video);
            document.body.appendChild(overlay);

            let resolved = false;
            const cleanup = () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    overlay.remove();
                    resolve();
                }
            };

            video.onended = cleanup;
            video.onerror = () => {
                utils.debugLog('⚠️ 黑化帝视频播放失败，跳过');
                cleanup();
            };

            const timer = setTimeout(() => {
                utils.debugLog('⚠️ 黑化帝视频播放超时，跳过');
                cleanup();
            }, 4000);

            video.play().then(() => {
                utils.debugLog('✅ 黑化帝视频开始播放');
            }).catch(e => {
                utils.debugLog('⚠️ 黑化帝视频自动播放失败: ' + e.message);
                cleanup();
            });
        });
    }

    async function playSteps(steps, myId, oppId) {
        if (isAnimating) return;
        isAnimating = true;
        _aborted = false;
        anims.setAbortFlag(false);
        let idx = 0;
        const videoPlayedFor = new Set();

        for (let i = 0; i < steps.length; i++) {
            if (_aborted) break;
            const step = steps[i];
            idx = i + 1;

            // 金币增益处理
            if (step.goldGain !== undefined && step.goldGain !== 0) {
                if (step.playerId === myId || step.attackerOwnerId === myId) {
                    const gs = getGameState();
                    const my = gs?.players?.[myId];
                    if (my) {
                        const oldGold = my.gold || 0;
                        my.gold = oldGold + step.goldGain;
                        updateGoldUI(my.gold);
                        const goldDisplay = document.getElementById('my-gold');
                        if (goldDisplay) {
                            utils.floatingText(goldDisplay, `💰 +${step.goldGain}`, '#ffd966', 1200);
                        } else {
                            utils.floatingText(document.body, `💰 +${step.goldGain}`, '#ffd966', 1200);
                        }
                        utils.debugLog(`  💰 金币 +${step.goldGain}，当前：${my.gold}`);
                    }
                }
                if (step.type === 'gold') {
                    utils.debugLog(`  💰 遗言金币 #${idx}: ${step.sourceCard} +${step.goldGain}`);
                    continue;
                }
            }

            // 亡魂召唤
            if (step.type === 'summon_spirit') {
                utils.debugLog(`  ▶ summon_spirit #${idx}: ${step.sourceCard} ${step.desc}`);

                try {
                    const spiritSounds = ['/assets/wanv/daodun.wav', '/assets/wanv/daodun1.wav'];
                    const randomSound = spiritSounds[Math.floor(Math.random() * spiritSounds.length)];
                    const audio = new Audio(randomSound);
                    audio.volume = 1.0;
                    audio.play();
                } catch(e) {}
                await new Promise(r => setTimeout(r, 200));

                const isEnemy = step.playerId !== myId;

                if (step.atkGain > 0 || step.hpGain > 0) {
                    if (step.summoned) {
                        const slotEl = utils.getSlotElement(step.playerId, step.position, isEnemy);
                        if (slotEl) {
                            const cardEl = slotEl.querySelector('.card:not(.empty-slot)');
                            if (cardEl) {
                                utils.floatingText(cardEl, `+${step.atkGain}+${step.hpGain}`, '#7bffb1', 1200, 0);
                            }
                        }
                    } else {
                        utils.showFloatTextOnBody(`亡魂 +${step.atkGain}/${step.hpGain}`, '#7bffb1', 1500);
                    }
                }

                if (step.summoned && step.position >= 0) {
                    const slotEl = utils.getSlotElement(step.playerId, step.position, isEnemy);
                    if (slotEl) {
                        const isBoss = (step.sourceCard === 'MEME羁绊');
                        const image = isBoss ? '/assets/card/zjz.webp' : '/assets/card/daodun1.webp';
                        const uniqueId = 'spirit_' + Date.now() + '_' + Math.random();
                        const cardObj = {
                            card_id: uniqueId,
                            cardId: uniqueId,
                            name: '亡魂',
                            type: 'character',
                            rarity: 'Common',
                            atk: step.spiritAtk,
                            hp: step.spiritHp,
                            base_atk: step.spiritAtk,
                            base_hp: step.spiritHp,
                            image: image,
                            star: isBoss ? 1 : 0,
                            shield: 0,
                            tempShield: Number(step.tempShield) || 0,
                            faction: '',
                            weapon: null,
                            item1: null,
                            item2: null
                        };
                        const newCardEl = window.YYCardRender.createCardElement(cardObj, 'board', true);
                        newCardEl.setAttribute('data-board-index', step.position);
                        newCardEl.setAttribute('data-card-type', 'board');
                        slotEl.innerHTML = '';
                        slotEl.appendChild(newCardEl);

                        if (window.YYCardItemRender && window.YYCardItemRender.applyEffects) {
                            window.YYCardItemRender.applyEffects(newCardEl, cardObj);
                        }
                    } else {
                        utils.debugLog(`⚠️ 召唤槽位缺失: pos=${step.position}`);
                    }
                }
                await new Promise(r => setTimeout(r, 400));
            }

            // 连续增益（buffAnim 内部已含 500ms 等待，不再额外延时）
            else if (step.type === 'buff' && step.continuous) {
                const batchId = step.batchId;
                const batch = [];
                let j = i;
                while (j < steps.length && steps[j].type === 'buff' && steps[j].continuous && steps[j].batchId === batchId) {
                    batch.push(steps[j]);
                    j++;
                }
                batch.sort((a, b) => (a.index || 0) - (b.index || 0));
                utils.debugLog(`  ▶ continuous buff #${idx}-${idx + batch.length - 1}: batch=${batchId} count=${batch.length}`);
                for (const bstep of batch) {
                    if (_aborted) break;
                    await anims.buffAnim(bstep);
                }
                i = j - 1;
                continue;
            }

            // 单体增益（带短时去重）
            else if (step.type === 'buff') {
                if (step.desc && step.desc.startsWith('吴国羁绊')) {
                    utils.debugLog(`  ▶ buff #${idx}: ${step.sourceCard} ${step.desc} (跳过动画)`);
                    continue;
                }

                const buffKey = `${step.playerId}_${step.position}_${step.sourceCard}_${step.atkGain}_${step.hpGain}_${step.tempAtkGain}_${step.tempHpGain}_${step.desc}`;
                const now = Date.now();
                if (_lastBuffKey === buffKey && (now - _lastBuffTime) < 200) {
                    utils.debugLog(`  ▶ buff #${idx}: ${step.sourceCard} ${step.desc} (重复跳过动画)`);
                    const myId2 = window.YYCardAuth?.currentUser?.id;
                    const isEnemy2 = step.playerId !== myId2;
                    const el2 = await utils.getCardElementRetry(step.playerId, step.position, isEnemy2);
                    if (el2) {
                        const totalAtkGain2 = (step.atkGain || 0) + (step.tempAtkGain || 0);
                        const totalHpGain2 = (step.hpGain || 0) + (step.tempHpGain || 0);
                        utils.updateCardStats(el2, totalAtkGain2, totalHpGain2);
                    }
                    _lastBuffTime = now;
                    continue;
                }
                _lastBuffKey = buffKey;
                _lastBuffTime = now;

                utils.debugLog(`  ▶ buff #${idx}: ${step.sourceCard} ${step.desc} pos=${step.position}`);
                await anims.buffAnim(step);
            }

            // 群体增益：收集连续区块，按角色分组合并
            else if (step.type === 'mass_buff') {
                const block = [];
                let j = i;
                while (j < steps.length && steps[j].type === 'mass_buff') {
                    block.push(steps[j]);
                    j++;
                }
                const groupMap = new Map();
                for (const s of block) {
                    const key = s.sourceCard + '|' + (s.triggerPos ?? 'none');
                    if (!groupMap.has(key)) {
                        groupMap.set(key, []);
                    }
                    groupMap.get(key).push(s);
                }
                const orderedKeys = [];
                for (const s of block) {
                    const key = s.sourceCard + '|' + (s.triggerPos ?? 'none');
                    if (!orderedKeys.includes(key)) {
                        orderedKeys.push(key);
                    }
                }
                for (const key of orderedKeys) {
                    const group = groupMap.get(key);
                    if (group.length > 1) {
                        utils.debugLog(`  ▶ merged ${group[0].sourceCard} (pos ${group[0].triggerPos}) ×${group.length}`);
                        await anims.mergedMassBuffAnim(group);
                    } else {
                        utils.debugLog(`  ▶ mass_buff #${idx}: ${group[0].sourceCard} ${group[0].desc}`);
                        await anims.massBuffAnim(group[0]);
                    }
                }
                i = j - 1;
            }

            // 群体护盾
            else if (step.type === 'mass_shield') {
                utils.debugLog(`  ▶ mass_shield #${idx}: ${step.sourceCard} ${step.desc} 目标=${step.targetPositions?.length || 0}个`);
                await anims.massShieldAnim(step);
            }

            // 减益
            else if (step.type === 'debuff') {
                utils.debugLog(`  ▶ debuff #${idx}: ${step.sourceCard} -> ${step.targetName} ${step.desc}`);
                anims.debuffAnim(step);
                await new Promise(r => setTimeout(r, 300));
            }

            // AOE 攻击
            else if (step.type === 'aoe_attack') {
                const attackerKey = step.attackerOwnerId + ':' + step.attackerPos;
                const cardId = step.sourceCard || step.attackerCardId || getAttackerCardId(step.attackerOwnerId, step.attackerPos);

                if (!videoPlayedFor.has(attackerKey) && cardId.includes('heihua')) {
                    videoPlayedFor.add(attackerKey);
                    await playAttackVideo();
                    if (_aborted) break;
                }

                utils.debugLog(`  ▶ aoe_attack #${idx}: ${step.attackerName || step.sourceCard}→${step.targets.length}个目标`);

                const formattedTargets = step.targets.map(t => ({
                    attackerOwnerId: step.attackerOwnerId,
                    attackerPos: step.attackerPos,
                    attackerName: step.attackerName || step.sourceCard,
                    defenderOwnerId: t.defenderOwnerId,
                    defenderPos: t.defenderPos,
                    defenderName: t.defenderName,
                    damage: t.damage,
                    defenderHpAfter: t.defenderHpAfter,
                    defenderTempHp: t.defenderTempHp,
                    isFatal: t.isFatal,
                    blocked: t.blocked,
                    blockType: t.blockType
                }));

                await anims.aoeAttackAnim(step.attackerOwnerId, step.attackerPos, step.attackerName || step.sourceCard, formattedTargets);
                await new Promise(r => setTimeout(r, 300));
            }

            // 攻击（远程 / 多段 / 单体）
            else if (step.type === 'attack') {
                const attackerKey = step.attackerOwnerId + ':' + step.attackerPos;

                if (!step.isRanged && !videoPlayedFor.has(attackerKey)) {
                    const cardId = getAttackerCardId(step.attackerOwnerId, step.attackerPos);
                    if (cardId && cardId.includes('heihua')) {
                        videoPlayedFor.add(attackerKey);
                        await playAttackVideo();
                        if (_aborted) break;
                    }
                }

                if (step.isRanged) {
                    const rangedGroup = [];
                    let j = i;
                    const firstKey = step.attackerOwnerId + ':' + step.attackerPos;
                    while (j < steps.length && steps[j].type === 'attack' && steps[j].isRanged) {
                        const curKey = steps[j].attackerOwnerId + ':' + steps[j].attackerPos;
                        if (curKey !== firstKey) break;
                        rangedGroup.push(steps[j]);
                        j++;
                    }
                    utils.debugLog(`  ▶ ranged #${idx}: 飞刀 ×${rangedGroup.length} (来自 ${step.sourceCard || step.attackerName || getAttackerCardId(step.attackerOwnerId, step.attackerPos)})`);
                    await anims.rangedAttackAnim(rangedGroup);
                    i = j - 1;
                } else {
                    const attackGroup = [step];
                    let j = i + 1;
                    while (j < steps.length && steps[j].type === 'attack' && !steps[j].isRanged &&
                           steps[j].attackerOwnerId === step.attackerOwnerId &&
                           steps[j].attackerPos === step.attackerPos) {
                        attackGroup.push(steps[j]);
                        j++;
                    }

                    const firstDefKey = step.defenderOwnerId + ':' + step.defenderPos;
                    const allSameTarget = attackGroup.every(s => (s.defenderOwnerId + ':' + s.defenderPos) === firstDefKey);

                    if (allSameTarget) {
                        utils.debugLog(`  ▶ multi-hit #${idx}: ${step.sourceCard || step.attackerName || getAttackerCardId(step.attackerOwnerId, step.attackerPos)}→${step.defenderName} ×${attackGroup.length}`);
                        await anims.multiHitAnim(attackGroup);
                        i = j - 1;
                    } else {
                        utils.debugLog(`  ▶ aoe #${idx}: ${step.sourceCard || step.attackerName || getAttackerCardId(step.attackerOwnerId, step.attackerPos)}→${attackGroup.map(s => s.defenderName).join(',')}`);
                        await anims.aoeAttackAnim(step.attackerOwnerId, step.attackerPos, step.sourceCard || step.attackerName || getAttackerCardId(step.attackerOwnerId, step.attackerPos), attackGroup);
                        i = j - 1;
                    }
                    await new Promise(r => setTimeout(r, 300));
                }
            }

            // 即死
            else if (step.type === 'instant_kill') {
                utils.debugLog(`  ⚡ instant_kill #${idx}: ${step.attackerName} 吞噬 ${step.defenderName}`);
                await anims.instantKillAnim(step);
                await new Promise(r => setTimeout(r, 300));
            }

            // 跳过行动
            else if (step.type === 'skip') {
                utils.debugLog(`  ▶ skip #${idx}: ${step.cardName || '?'} ${step.desc || '跳过行动'}`);
            }

            // 生成卡牌/消耗牌
            else if (step.type === 'generate') {
                utils.debugLog(`  ▶ generate #${idx}: ${step.sourceCard} ${step.desc}`);

                if (step.generator === 'bifang' || step.generator === 'shawujing' || step.generator === 'weapon_attack') {
                    if (myId && step.playerId === myId) {
                        const gs = getGameState();
                        const my = gs?.players?.[myId];
                        const hand = my?.hand;
                        if (hand) {
                            const validCount = hand.filter(h => h && (h.cardId || h.card_id)).length;
                            if (validCount < 15) {
                                const newCard = {
                                    instanceId: 'cons-' + Date.now() + '-' + Math.random(),
                                    card_id: step.card_id || 'unknown',
                                    name: step.cardName || '消耗牌',
                                    type: 'consumable',
                                    rarity: step.rarity || 'Common',
                                    isConsumable: true,
                                    atk: 0, hp: 0, shield: 0, chi: 0, star: 0, faction: '',
                                    tempAtk: 0, tempHp: 0, tempShield: 0,
                                    weapon: null, item1: null, item2: null
                                };
                                const emptyIdx = hand.findIndex(h => !h || !h.card_id);
                                if (emptyIdx !== -1) hand[emptyIdx] = newCard;
                                else hand.push(newCard);
                                if (window.YYCardShop?.renderHand) window.YYCardShop.renderHand();
                            }
                        }
                    }
                    await new Promise(r => setTimeout(r, 200));
                    continue;
                }

                if (myId && step.playerId === myId) {
                    const gs = getGameState();
                    const my = gs?.players?.[myId];
                    const hand = my?.hand;
                    if (!hand) continue;
                    const validCount = hand.filter(h => h && (h.cardId || h.card_id)).length;
                    if (validCount >= 15) continue;

                    if (step.generator === 'spirit_loot') {
                        const newCard = {
                            instanceId: 'loot-' + Date.now() + '-' + Math.random(),
                            cardId: 'token_spirit_loot',
                            card_id: 'token_spirit_loot',
                            name: step.cardName || '亡魂碎片',
                            type: 'loot',
                            rarity: 'Common',
                            faction: '中立',
                            atk: step.lootAtk || 0,
                            hp: step.lootHp || 0,
                            baseAtk: step.lootAtk || 0,
                            baseHp: step.lootHp || 0,
                            star: 0,
                            shield: 0,
                            chi: 0,
                            image: '/assets/card/daodun1.webp',
                            weapon: null,
                            item1: null,
                            item2: null,
                            equipment: { weapon: null, items: [null, null] },
                            enlightenmentCount: 0,
                            tempAtk: 0,
                            tempHp: 0,
                            tempShield: 0
                        };
                        const emptyIdx = hand.findIndex(h => !h || !h.card_id);
                        if (emptyIdx !== -1) hand[emptyIdx] = newCard;
                        else hand.push(newCard);
                        if (window.YYCardShop?.renderHand) window.YYCardShop.renderHand();
                        await new Promise(r => setTimeout(r, 100));
                    } else if (step.sourceCard === '女娲' && step.cardName && step.card_id) {
                        const newCard = {
                            instanceId: 'gen-' + Date.now() + '-' + Math.random(),
                            cardId: step.card_id,
                            card_id: step.card_id,
                            name: step.cardName,
                            type: 'character',
                            rarity: step.rarity || 'Common',
                            faction: '中立',
                            atk: step.atk || 0,
                            hp: step.hp || 0,
                            baseAtk: step.atk || 0,
                            baseHp: step.hp || 0,
                            star: 0,
                            shield: 0,
                            chi: 0,
                            image: step.image || `/assets/card/${step.card_id}.png`,
                            weapon: null,
                            item1: null,
                            item2: null,
                            equipment: { weapon: null, items: [null, null] },
                            enlightenmentCount: 0,
                            tempAtk: 0,
                            tempHp: 0,
                            tempShield: 0
                        };
                        const emptyIdx = hand.findIndex(h => !h || !h.card_id);
                        if (emptyIdx !== -1) hand[emptyIdx] = newCard;
                        else hand.push(newCard);
                        if (window.YYCardShop?.renderHand) window.YYCardShop.renderHand();
                        await new Promise(r => setTimeout(r, 400));
                    } else {
                        const rarity = step.rarity || 'Common';
                        const templates = window.cardTemplates || {};
                        const allCards = Object.values(templates).filter(c => c.rarity === rarity && c.type !== 'weapon' && c.type !== 'item');
                        if (allCards.length > 0) {
                            const picked = allCards[Math.floor(Math.random() * allCards.length)];
                            const newCard = {
                                instanceId: 'gen-' + Date.now() + '-' + Math.random(),
                                cardId: picked.card_id, card_id: picked.card_id, name: picked.name,
                                type: 'character', rarity: rarity, faction: picked.faction || '中立',
                                atk: picked.base_atk || 0, hp: picked.base_hp || 0,
                                baseAtk: picked.base_atk || 0, baseHp: picked.base_hp || 0,
                                star: 0, price: rarity === 'Common' ? 1 : rarity === 'Rare' ? 2 : rarity === 'Epic' ? 3 : 4,
                                image: picked.image || `/assets/card/${picked.card_id}.png`,
                                weapon: null, item1: null, item2: null,
                                shield: picked.shield || 0, chi: picked.chi || 0,
                                equipment: { weapon: null, items: [null, null] }, enlightenmentCount: 0
                            };
                            const emptyIdx = hand.findIndex(h => !h || !h.card_id);
                            if (emptyIdx !== -1) hand[emptyIdx] = newCard; else hand.push(newCard);
                            if (window.YYCardShop?.renderHand) window.YYCardShop.renderHand();
                        }
                        await new Promise(r => setTimeout(r, 400));
                    }
                }
            }

            // 战斗结束标记
            else if (step.type === 'battle_end') {
                utils.debugLog(`  🏁 战斗结束 #${idx}`);
            }

            else {
                utils.debugLog(`  ▶ unknown #${idx}: type=${step.type}`);
            }
        }
        utils.debugLog(`  🏁 播放完毕，共${idx}步`);
        isAnimating = false;
    }

    async function resolveBattles(gameState, onComplete) {
        if (!gameState?.players) { onComplete?.(); return; }

        isAnimating = false;
        _aborted = false;
        anims.setAbortFlag(false);
        const myId = window.YYCardAuth?.currentUser?.id;
        utils.clearDebug();
        utils.debugLog('🔍 ====== 结算开始 (使用已缓存数据) ======');

        await utils.loadCardConfig();

        if (combat3D && !combat3D.isReady()) {
            await combat3D.init().catch(e => utils.debugLog('3D 初始化异常: ' + e));
        }

        const buffEvents = gameState._buffEvents || [];
        const combatResults = gameState._combatResults || [];

        let myCombat = null;
        let oppId = null;
        for (const cr of combatResults) {
            if (cr.p1 === myId) {
                myCombat = cr;
                oppId = cr.p2;
                break;
            } else if (cr.p2 === myId) {
                myCombat = cr;
                oppId = cr.p1;
                break;
            }
        }

        if (oppId && gameState.players[oppId]?.board) {
            utils.renderEnemyBoardFromData(oppId, gameState.players[oppId].board);
            const ready = await utils.waitForEnemyBoard(oppId);
            if (!ready) utils.debugLog('⚠️ 敌方棋盘未在 2 秒内就绪，部分动画可能缺失');
        }

        const allSteps = [...buffEvents];
        if (myCombat?.combatLog) {
            allSteps.push(...myCombat.combatLog);
        }

        utils.debugLog(`🎬 buffEvents=${buffEvents.length} 我的战斗=${myCombat ? '是' : '无'} 总步数=${allSteps.length}`);
        utils.debugLog(`⏸️ 棋盘亮相，等待 ${BOARD_PAUSE_MS}ms ...`);
        await new Promise(r => setTimeout(r, BOARD_PAUSE_MS));
        utils.debugLog(`▶️ 播放全部${allSteps.length}步`);
        if (allSteps.length > 0) {
            await playSteps(allSteps, myId, oppId);
        }
        utils.debugLog('✅ ====== 结算结束 ======');

        if (onComplete) onComplete();
    }

    utils.ensureDebugPanel();
    utils.loadCardConfig();

    return {
        resolveBattles,
        abortAnimation: () => {
            _aborted = true;
            anims.setAbortFlag(true);
        },
        isAnimating: () => isAnimating
    };
})();

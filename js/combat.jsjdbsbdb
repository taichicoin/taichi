// ==================== 战斗模拟模块（死亡保留 + 本地模拟动画） ====================
window.YYCardCombat = (function() {
    const config = window.YYCardConfig;
    let isAnimating = false;

    // 技能定义（与后端同步）
    const SKILLS = {
        skill_xianshi_tianhai:{ target:'all_allies', baseValue:1, enlightenBonus:1 },
        skill_xingyun_buyu:{ target:'sameRow_allies', baseValue:1 },
        skill_yuyue_yuyuan:{ target:'self', baseValue:1 },
        skill_divine_blessing_trigger_enlightenment:{ target:'sameRow', times:1 },
        skill_jinglei:{ atkGain:2, hpGain:5 },
        skill_chengshan_yange:{ atkGain:1, hpGain:2 }
    };

    function parseSkill(card) {
        if (!card?.skill) return null;
        return typeof card.skill === 'string' ? JSON.parse(card.skill) : card.skill;
    }

    function getTargets(board, scope, pos) {
        const t = [];
        if (scope==='self') { if(board[pos]) t.push({card:board[pos],pos}); }
        else if (scope==='all_allies') { board.forEach((c,i)=>{if(c) t.push({card:c,pos:i});}); }
        else if (scope==='sameRow_allies'||scope==='sameRow') {
            const start = pos<3?0:3;
            for(let i=start;i<start+3;i++) if(board[i]) t.push({card:board[i],pos:i});
        }
        return t;
    }

    function applySkillBuffs(players) {
        const buffs = [];
        for (const pid in players) {
            const board = players[pid].board;
            if (!board) continue;
            for (let pos=0; pos<6; pos++) {
                const card = board[pos];
                if (!card) continue;
                const skill = parseSkill(card);
                if (!skill || skill.trigger!=='onBattleStart') continue;
                if (skill.type==='enlightenment') {
                    let ga=0, gh=0;
                    if (skill.skillId==='skill_xianshi_tianhai') {
                        if (typeof card.enlightenLevel!=='number') card.enlightenLevel=0;
                        card.enlightenLevel++;
                        const lv = card.enlightenLevel;
                        ga = skill.effect.baseValue + lv*skill.effect.enlightenBonus;
                        gh = ga;
                    } else {
                        ga = skill.effect.baseValue||1; gh = ga;
                    }
                    const targets = getTargets(board, skill.scope, pos);
                    targets.forEach(({card:c,pos:p})=>{
                        c.atk = (c.atk||0)+ga; c.hp = (c.hp||0)+gh;
                        buffs.push({type:'buff',playerId:pid,position:p,atkGain:ga,hpGain:gh,sourceCard:card.name});
                    });
                    // 反应技能
                    for (let i=0;i<6;i++) {
                        const rc = board[i];
                        if (!rc) continue;
                        const rSkill = parseSkill(rc);
                        if (!rSkill||rSkill.trigger!=='onEnlightenmentTriggered') continue;
                        if (rSkill.skillId==='skill_jinglei') {
                            rc.atk = (rc.atk||0)+SKILLS.skill_jinglei.atkGain;
                            rc.hp = (rc.hp||0)+SKILLS.skill_jinglei.hpGain;
                            buffs.push({type:'buff',playerId:pid,position:i,atkGain:SKILLS.skill_jinglei.atkGain,hpGain:SKILLS.skill_jinglei.hpGain,sourceCard:rc.name});
                        } else if (rSkill.skillId==='skill_chengshan_yange') {
                            rc.atk = (rc.atk||0)+SKILLS.skill_chengshan_yange.atkGain;
                            rc.hp = (rc.hp||0)+SKILLS.skill_chengshan_yange.hpGain;
                            buffs.push({type:'buff',playerId:pid,position:i,atkGain:SKILLS.skill_chengshan_yange.atkGain,hpGain:SKILLS.skill_chengshan_yange.hpGain,sourceCard:rc.name});
                            if (card.instanceId!==rc.instanceId) {
                                card.atk = (card.atk||0)+SKILLS.skill_chengshan_yange.atkGain;
                                card.hp = (card.hp||0)+SKILLS.skill_chengshan_yange.hpGain;
                                buffs.push({type:'buff',playerId:pid,position:pos,atkGain:SKILLS.skill_chengshan_yange.atkGain,hpGain:SKILLS.skill_chengshan_yange.hpGain,sourceCard:rc.name});
                            }
                        }
                    }
                }
                if (skill.skillId==='skill_divine_blessing_trigger_enlightenment') {
                    const start = pos<3?0:3;
                    for (let i=start;i<start+3;i++) {
                        const ally = board[i];
                        if (!ally||ally===card) continue;
                        const aSkill = parseSkill(ally);
                        if (aSkill&&aSkill.type==='enlightenment') {
                            let ga=0,gh=0;
                            if (aSkill.skillId==='skill_xianshi_tianhai') {
                                if (typeof ally.enlightenLevel!=='number') ally.enlightenLevel=0;
                                ally.enlightenLevel++;
                                ga = aSkill.effect.baseValue + ally.enlightenLevel*aSkill.effect.enlightenBonus;
                                gh = ga;
                            } else { ga = aSkill.effect.baseValue||1; gh=ga; }
                            const aTargets = getTargets(board, aSkill.scope, i);
                            aTargets.forEach(({card:c,pos:p})=>{
                                c.atk=(c.atk||0)+ga; c.hp=(c.hp||0)+gh;
                                buffs.push({type:'buff',playerId:pid,position:p,atkGain:ga,hpGain:gh,sourceCard:ally.name});
                            });
                        }
                    }
                }
            }
        }
        return buffs;
    }

    // 战斗模拟（本地）
    function pairPlayers(players) {
        const entries = Object.entries(players).filter(([,p])=>p.health>0&&!p.isEliminated);
        const humans=entries.filter(([,p])=>!p.isBot), bots=entries.filter(([,p])=>p.isBot);
        const hIds=humans.map(([id])=>id), bIds=bots.map(([id])=>id);
        for(let i=hIds.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [hIds[i],hIds[j]]=[hIds[j],hIds[i]]; }
        for(let i=bIds.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [bIds[i],bIds[j]]=[bIds[j],bIds[i]]; }
        const pairs=[];
        for(let i=0;i<hIds.length;i+=2) pairs.push([hIds[i],hIds[i+1]||bIds.shift()||null]);
        for(let i=0;i<bIds.length;i+=2) pairs.push([bIds[i],bIds[i+1]||null]);
        return pairs;
    }

    function simulateFight(board1, board2, owner1, owner2) {
        const u1=[], u2=[];
        for(let i=0;i<6;i++){
            if(board1[i]?.hp>0) u1.push({...board1[i], position:i, ownerId:owner1, side:1});
            if(board2[i]?.hp>0) u2.push({...board2[i], position:i, ownerId:owner2, side:2});
        }
        const log=[];
        if(!u1.length||!u2.length) return {winner:u1.length?1:2, combatLog:log};
        u1.sort((a,b)=>a.position-b.position); u2.sort((a,b)=>a.position-b.position);
        let cur=Math.random()>=0.5?1:2, turn=0, i1=0,i2=0;
        while(u1.length&&u2.length&&turn<200){
            const attackers=cur===1?u1:u2, defenders=cur===1?u2:u1;
            let att=null;
            if(cur===1){
                let start=i1%u1.length;
                for(let i=0;i<u1.length;i++){ const ci=(start+i)%u1.length; if(u1[ci].hp>0){att=u1[ci]; i1=(ci+1)%u1.length; break;}}
            }else{
                let start=i2%u2.length;
                for(let i=0;i<u2.length;i++){ const ci=(start+i)%u2.length; if(u2[ci].hp>0){att=u2[ci]; i2=(ci+1)%u2.length; break;}}
            }
            if(!att) break;
            const target = findTarget(att.position, defenders);
            if(!target){cur=cur===1?2:1; turn++; continue;}
            const dmg=att.atk;
            target.hp-=dmg;
            log.push({type:'attack', attackerOwnerId:att.ownerId, defenderOwnerId:target.ownerId, attackerPos:att.position, defenderPos:target.position, damage:dmg, defenderHpAfter:target.hp, isFatal:target.hp<=0});
            if(target.hp<=0){
                const di=defenders.findIndex(u=>u.instanceId===target.instanceId);
                if(di>=0){ defenders.splice(di,1); if(cur===1){if(di<=i2)i2=Math.max(0,i2-1);}else{if(di<=i1)i1=Math.max(0,i1-1);}}
            }
            cur=cur===1?2:1; turn++;
        }
        return {winner:u1.length?1:2, combatLog:log};
    }

    function findTarget(attackerPos, enemyUnits) {
        const priority = config.BOARD.ENEMY_PRIORITY[attackerPos];
        if(!priority) return null;
        const hasFront = enemyUnits.some(u=>u.position<3&&u.hp>0);
        for(const tPos of priority){
            if(hasFront&&tPos>=3) continue;
            const t = enemyUnits.find(u=>u.position===tPos&&u.hp>0);
            if(t) return t;
        }
        return null;
    }

    // 动画
    let abortFlag = false;
    function getCardElement(playerId, dataPos) {
        const board = document.querySelector(`.board[data-player-id="${playerId}"]`);
        if(!board) return null;
        const slot = board.querySelector(`.card-slot[data-board-index="${dataPos}"]`);
        if(!slot) return null;
        return slot.querySelector('.card:not(.empty-slot)');
    }

    function floatingText(el, text, color, duration) {
        const d = document.createElement('div');
        d.textContent = text;
        d.style.cssText = `position:absolute; color:${color}; font-size:28px; font-weight:bold; text-shadow:0 0 6px #000; z-index:200; left:50%; top:30%; transform:translate(-50%,-50%); animation:damageFloat ${duration}ms forwards; pointer-events:none;`;
        el.style.position = 'relative';
        el.appendChild(d);
        setTimeout(()=>d.remove(), duration);
    }

    function buffAnim(buff) {
        return new Promise(resolve=>{
            const el = getCardElement(buff.playerId, buff.position);
            if(!el) return resolve();
            floatingText(el, `+${buff.atkGain||0}/+${buff.hpGain||0}`, '#7bffb1', 1000);
            setTimeout(resolve, 300);
        });
    }

    function attackAnim(a) {
        return new Promise(resolve=>{
            if(abortFlag) return resolve();
            const att = getCardElement(a.attackerOwnerId, a.attackerPos);
            const def = getCardElement(a.defenderOwnerId, a.defenderPos);
            if(!att||!def) return resolve();
            const ar = att.getBoundingClientRect(), dr = def.getBoundingClientRect();
            att.style.transition = 'transform 0.35s ease-out';
            att.style.transform = `translate(${(dr.left-ar.left)*0.7}px, ${(dr.top-ar.top)*0.7}px)`;
            att.style.zIndex = '100';
            setTimeout(()=>{
                if(abortFlag) return resolve();
                def.style.transition = 'transform 0.15s';
                def.style.transform = 'scale(0.85)';
                const dmgDiv = document.createElement('div');
                dmgDiv.textContent = `-${a.damage}`;
                dmgDiv.style.cssText = 'position:absolute; color:#f44; font-size:32px; font-weight:bold; z-index:200; left:50%; top:40%; transform:translate(-50%,-50%); animation:damageFloat 1s forwards;';
                def.style.position = 'relative';
                def.appendChild(dmgDiv);
                setTimeout(()=>dmgDiv.remove(), 1000);
                const hpSpan = def.querySelector('.card-hp');
                if(hpSpan) hpSpan.textContent = `🛡️${a.defenderHpAfter}`;
                setTimeout(()=>{
                    if(abortFlag) return resolve();
                    att.style.transition = 'transform 0.25s';
                    att.style.transform = 'translate(0,0)';
                    att.style.zIndex = '';
                    def.style.transform = 'scale(1)';
                    if(a.isFatal){
                        def.style.transition = 'opacity 0.35s, transform 0.35s';
                        def.style.opacity = '0';
                        def.style.transform = 'scale(0.5)';
                        setTimeout(()=>{
                            const slot = def.parentNode;
                            if(slot && slot.classList.contains('card-slot')){
                                slot.innerHTML = '';
                                const empty = document.createElement('div');
                                empty.className = 'card empty-slot';
                                empty.textContent = '⬤';
                                slot.appendChild(empty);
                            } else def.remove();
                            resolve();
                        }, 350);
                    } else setTimeout(resolve, 250);
                }, 230);
            }, 350);
        });
    }

    async function playSteps(steps) {
        if(isAnimating) return;
        isAnimating = true;
        abortFlag = false;
        for(const s of steps){
            if(abortFlag) break;
            if(s.type==='buff') await buffAnim(s);
            else await attackAnim(s);
            await new Promise(r=>setTimeout(r,80));
        }
        isAnimating = false;
    }

    // 主入口：不再调用后端，完全本地模拟
    async function resolveBattles(gameState, log, onComplete) {
        if(!gameState?.players) return onComplete?.();
        try {
            const sim = JSON.parse(JSON.stringify(gameState.players));
            const buffs = applySkillBuffs(sim);
            const pairs = pairPlayers(sim);
            const combatLogs = [];
            for(const [p1,p2] of pairs){
                if(!p2) continue;
                const u1=sim[p1], u2=sim[p2];
                if(!u1||!u2) continue;
                const res = simulateFight(u1.board||[], u2.board||[], p1, p2);
                combatLogs.push(...res.combatLog);
            }
            const allSteps = [...buffs, ...combatLogs];
            if(allSteps.length){
                await playSteps(allSteps);
            }
            // 将模拟结果同步回原 gameState，供后续结算血量（实际血量结算由 settle-battle 后端负责，这里仅更新本地显示）
            for(const pid in sim){
                const orig = gameState.players[pid];
                if(orig) orig.board = sim[pid].board.map((c,i)=>{
                    if(!c) return null;
                    // 保留原始对象引用，只更新数值
                    const origCard = orig.board[i];
                    if(origCard){
                        origCard.atk = c.atk;
                        origCard.hp = c.hp;
                        origCard.enlightenLevel = c.enlightenLevel;
                    }
                    return origCard;
                });
            }
        } catch(e){
            console.error('[Combat] 模拟异常:', e);
        } finally {
            if(window.YYCardShop?.refreshAllUI) window.YYCardShop.refreshAllUI();
            if(onComplete) onComplete();
        }
    }

    return {
        resolveBattles,
        abortAnimation: ()=>{ abortFlag=true; },
        isAnimating: ()=>isAnimating
    };
})();

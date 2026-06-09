// settle-battle (模块化版·武器星级独立·三国羁绊·张飞监听·分身处理·遗言系统·飞刀支援·杨戬技能版·华佗破盾监听)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { executeOnKillEffects } from './on-kill.ts';
import { executeEnlightenment } from './enlightenment.ts';
import { executeDivineBlessing } from './divine-blessing.ts';
import { executeDeathrattle } from './deathrattle.ts';
import { calculateSanGuoBond, applySanGuoBond } from './three-kingdoms.ts';
import { cloneCard, deepCloneBoard, hasItem, findTarget, findTargetInFront, calculateXiYouBond, getEffectStar } from './utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const GLOBAL_USER_ID = '00000000-0000-0000-0000-000000000000';

// ========== 辅助常量 ==========
const RARITY_DAMAGE = { Common:1, Rare:2, Epic:3, Legendary:4 };
const SHOP_LEVEL_4_PROB = [
  { rarity: 'Common',    prob: 0.15 },
  { rarity: 'Rare',      prob: 0.40 },
  { rarity: 'Epic',      prob: 0.30 },
  { rarity: 'Legendary', prob: 0.15 }
];

// ========== 条件检查工具 ==========
function checkCondition(condition: any, context: Record<string, any>): boolean {
  if (!condition) return true;
  if (condition.type === 'field') {
    const val = context[condition.field];
    if (val === undefined) return false;
    switch (condition.op) {
      case 'eq': return val === condition.value;
      case 'lt': return val < condition.value;
      case 'gt': return val > condition.value;
      case 'lte': return val <= condition.value;
      case 'gte': return val >= condition.value;
      case 'neq': return val !== condition.value;
      default: return false;
    }
  }
  return false;
}

// ========== 张飞监听 ==========
function triggerZhangFeiEffect(board: any[], ownerId: string, combatLog: any[]) {
  if (!board) return;
  for (const card of board) {
    if (!card || card.card_id !== 'char_zhangfei') continue;
    const effect = card.abilities?.find(
      (a: any) => a.trigger === 'on_ally_atk_gain'
    );
    if (!effect) continue;
    const star = getEffectStar(effect, card);
    const hpGain = (effect.effect.health_per_trigger || 2) + 
                    (star >= 1 ? (effect.effect.star_bonus_health_per_trigger || 2) : 0);
    card.hp = (card.hp || 0) + hpGain;
    if (card.baseHp !== undefined) card.baseHp = (card.baseHp || 0) + hpGain;
    combatLog.push({
      type: 'buff',
      playerId: ownerId,
      position: card.position,
      hpGain: hpGain,
      sourceCard: card.name,
      desc: `燕人咆哮 · 永久生命 +${hpGain}`
    });
  }
}

// ========== 通用效果处理器 ==========
function calculateBuffAmount(amountDef: any, sourceCard: any): number {
  if (!amountDef || !sourceCard) return 0;
  if (amountDef.source === 'self_total_attack') {
    const totalAtk = (sourceCard.atk || 0) + (sourceCard.tempAtk || 0);
    const star = sourceCard.star || 0;
    const multiplier = star >= 1 ? 1 + (amountDef.star_multiplier || 0) : 1;
    return Math.floor(totalAtk * multiplier);
  }
  if (amountDef.source === 'self_current_percent') {
    let currentVal = 0;
    if (amountDef.stat === 'attack' || amountDef.stat === undefined) {
      currentVal = (sourceCard.atk || 0) + (sourceCard.tempAtk || 0);
    } else if (amountDef.stat === 'health') {
      currentVal = (sourceCard.hp || 0) + (sourceCard.tempHp || 0);
    }
    const star = sourceCard.star || 0;
    const percent = amountDef.percent + (star >= 1 ? (amountDef.star_multiplier || 0) : 0);
    return Math.floor(currentVal * percent);
  }
  if (amountDef.fixed !== undefined) return amountDef.fixed;
  return 0;
}

function applyPermanentBuff(targetCard: any, atkGain: number, hpGain: number, combatLog: any[], ownerId: string, sourceCard: any, desc: string, board?: any[]) {
  if (atkGain !== 0) {
    targetCard.atk = (targetCard.atk || 0) + atkGain;
    if (targetCard.baseAtk !== undefined) targetCard.baseAtk = (targetCard.baseAtk || 0) + atkGain;
  }
  if (hpGain !== 0) {
    targetCard.hp = (targetCard.hp || 0) + hpGain;
    if (targetCard.baseHp !== undefined) targetCard.baseHp = (targetCard.baseHp || 0) + hpGain;
  }
  combatLog.push({
    type: 'buff',
    playerId: ownerId,
    position: targetCard.position,
    atkGain: atkGain,
    hpGain: hpGain,
    sourceCard: sourceCard.name || sourceCard.card_id,
    desc: desc
  });

  if (atkGain > 0 && board && ownerId) {
    triggerZhangFeiEffect(board, ownerId, combatLog);
  }
}

function applyEffect(sourceCard: any, targetCard: any, effect: any, combatLog: any[], ownerId: string, board?: any[]) {
  if (!effect || !sourceCard || !targetCard) return;
  switch (effect.type) {
    case 'gain_attack': {
      const atkGain = Number(effect.value) || 0;
      const star = getEffectStar(effect, sourceCard);
      const extraAtk = star >= 1 ? (effect.star_bonus || 0) : 0;
      const totalAtk = atkGain + extraAtk;
      applyPermanentBuff(targetCard, totalAtk, 0, combatLog, ownerId, sourceCard, `永久攻击 +${totalAtk}`, board);
      break;
    }
    case 'gain_health': {
      const hpGain = Number(effect.value) || 0;
      const star = getEffectStar(effect, sourceCard);
      const extraHp = star >= 1 ? (effect.star_bonus || 0) : 0;
      const totalHp = hpGain + extraHp;
      applyPermanentBuff(targetCard, 0, totalHp, combatLog, ownerId, sourceCard, `永久生命 +${totalHp}`, board);
      break;
    }
    case 'gain_attack_health': {
      const atkGain = Number(effect.attack) || 0;
      const hpGain = Number(effect.health) || 0;
      const star = getEffectStar(effect, sourceCard);
      const extraAtk = star >= 1 ? (effect.star_bonus_attack || 0) : 0;
      const extraHp = star >= 1 ? (effect.star_bonus_health || 0) : 0;
      const totalAtk = atkGain + extraAtk;
      const totalHp = hpGain + extraHp;
      applyPermanentBuff(targetCard, totalAtk, totalHp, combatLog, ownerId, sourceCard, `永久攻击 +${totalAtk} 生命 +${totalHp}`, board);
      break;
    }
    case 'gain_gold': {
      const goldGain = Number(effect.value) || 0;
      combatLog.push({
        type: 'buff',
        playerId: ownerId,
        position: targetCard.position,
        goldGain: goldGain,
        sourceCard: sourceCard.name || sourceCard.card_id,
        desc: `金币 +${goldGain}`
      });
      break;
    }
    case 'grant_buff': {
      const savedStar = sourceCard.star;
      const effectiveStar = getEffectStar(effect, sourceCard);
      sourceCard.star = effectiveStar;
      const amount = calculateBuffAmount(effect.amount, sourceCard);
      sourceCard.star = savedStar;

      if (effect.stat === 'tempAtk') {
        targetCard.tempAtk = (targetCard.tempAtk || 0) + amount;
        combatLog.push({
          type: 'buff',
          playerId: ownerId,
          position: targetCard.position,
          tempAtkGain: amount,
          sourceCard: sourceCard.name || sourceCard.card_id,
          desc: (effect.desc_template || '').replace('{value}', amount)
        });
        if (board && ownerId && amount > 0) {
          triggerZhangFeiEffect(board, ownerId, combatLog);
        }
      } else if (effect.stat === 'tempHp') {
        targetCard.tempHp = (targetCard.tempHp || 0) + amount;
        combatLog.push({
          type: 'buff',
          playerId: ownerId,
          position: targetCard.position,
          tempHpGain: amount,
          sourceCard: sourceCard.name || sourceCard.card_id,
          desc: (effect.desc_template || '').replace('{value}', amount)
        });
      } else if (effect.stat === 'tempShield') {
        targetCard.tempShield = (targetCard.tempShield || 0) + amount;
        combatLog.push({
          type: 'buff',
          playerId: ownerId,
          position: targetCard.position,
          tempShieldGain: amount,
          sourceCard: sourceCard.name || sourceCard.card_id,
          desc: (effect.desc_template || '').replace('{value}', amount)
        });
      }
      break;
    }
  }
}

// ========== 女娲造人 ==========
function generateNvwaCards(board: any[], hand: any[], attackerPos: number, ownerId: string, combatLog: any[]) {
  const rowStart = attackerPos < 3 ? 0 : 3;
  const rowEnd = rowStart + 2;

  for (let i = rowStart; i <= rowEnd; i++) {
    const card = board[i];
    if (!card || !card.card_id || (card.hp + (card.tempHp || 0)) <= 0) continue;
    if (card.card_id !== 'char_nvwa') continue;

    const star = Number(card.star) || 0;
    const count = star >= 1 ? 2 : 1;

    for (let c = 0; c < count; c++) {
      const validHandCount = hand.filter(h => h && (h.card_id || h.cardId)).length;
      if (validHandCount >= 15) {
        combatLog.push({
          type: 'generate',
          playerId: ownerId,
          position: i,
          sourceCard: '女娲',
          cardName: '手牌已满',
          rarity: '',
          desc: '手牌已满，无法生成'
        });
        break;
      }

      const rand = Math.random();
      let selectedRarity = 'Common';
      let cumulative = 0;
      for (const entry of SHOP_LEVEL_4_PROB) {
        cumulative += entry.prob;
        if (rand <= cumulative) {
          selectedRarity = entry.rarity;
          break;
        }
      }

      combatLog.push({
        type: 'generate',
        playerId: ownerId,
        position: i,
        sourceCard: '女娲',
        rarity: selectedRarity,
        cardName: '',
        desc: `造人 · 生成${selectedRarity}角色牌`
      });
    }
  }
}

// ========== 通用飞刀效果（全场AOE） ==========
function executeRangedAOE(
  card: any,
  ownerId: string,
  board: any[],
  enemyBoard: any[],
  enemyOwnerId: string,
  damage: number,
  combatLog: any[],
  times: number = 1,
  onShieldBreak?: (board: any[], ownerId: string) => void
) {
  if (damage <= 0) return;

  for (let t = 0; t < times; t++) {
    const targets: { unit: any; isAlly: boolean }[] = [];
    for (const c of board) {
      if (c && c.card_id && (c.hp + (c.tempHp || 0)) > 0) targets.push({ unit: c, isAlly: true });
    }
    for (const c of enemyBoard) {
      if (c && c.card_id && (c.hp + (c.tempHp || 0)) > 0) targets.push({ unit: c, isAlly: false });
    }

    for (const { unit: target, isAlly } of targets) {
      const defOwnerId = isAlly ? ownerId : enemyOwnerId;
      const targetBoard = isAlly ? board : enemyBoard;

      if (target.tempShield > 0) {
        target.tempShield -= 1;
        combatLog.push({
          type: 'attack', attackerOwnerId: ownerId, defenderOwnerId: defOwnerId,
          attackerPos: card.position, defenderPos: target.position,
          damage: 0, blocked: true, blockType: 'tempShield',
          isRanged: true, attackerName: card.name || card.card_id,
          defenderName: target.name || target.card_id, totalAtk: damage
        });
        onShieldBreak?.(targetBoard, defOwnerId);
      } else if (target.shield > 0) {
        target.shield -= 1;
        combatLog.push({
          type: 'attack', attackerOwnerId: ownerId, defenderOwnerId: defOwnerId,
          attackerPos: card.position, defenderPos: target.position,
          damage: 0, blocked: true, blockType: 'permanent',
          isRanged: true, attackerName: card.name || card.card_id,
          defenderName: target.name || target.card_id, totalAtk: damage
        });
        onShieldBreak?.(targetBoard, defOwnerId);
      } else {
        target.hp = Math.max(0, target.hp - damage);
        combatLog.push({
          type: 'attack', attackerOwnerId: ownerId, defenderOwnerId: defOwnerId,
          attackerPos: card.position, defenderPos: target.position,
          damage: damage, defenderHpAfter: target.hp, defenderTempHp: target.tempHp,
          isFatal: target.hp + (target.tempHp || 0) <= 0, blocked: false,
          isRanged: true, attackerName: card.name || card.card_id,
          defenderName: target.name || target.card_id, totalAtk: damage
        });
      }
    }
  }
}

// ========== 通用单体飞刀（对随机敌方单位，可多轮） ==========
function executeRangedSingle(
  card: any,
  ownerId: string,
  enemyBoard: any[],
  enemyOwnerId: string,
  damage: number,
  times: number,
  combatLog: any[],
  onShieldBreak?: (board: any[], ownerId: string) => void
) {
  for (let t = 0; t < times; t++) {
    const candidates = enemyBoard.filter(c => c && c.card_id && (c.hp + (c.tempHp || 0)) > 0);
    if (candidates.length === 0) break;
    const target = candidates[Math.floor(Math.random() * candidates.length)];

    if (target.tempShield > 0) {
      target.tempShield -= 1;
      combatLog.push({
        type: 'attack', attackerOwnerId: ownerId, defenderOwnerId: enemyOwnerId,
        attackerPos: card.position, defenderPos: target.position,
        damage: 0, blocked: true, blockType: 'tempShield',
        isRanged: true, attackerName: card.name || card.card_id,
        defenderName: target.name || target.card_id, totalAtk: damage
      });
      onShieldBreak?.(enemyBoard, enemyOwnerId);
    } else if (target.shield > 0) {
      target.shield -= 1;
      combatLog.push({
        type: 'attack', attackerOwnerId: ownerId, defenderOwnerId: enemyOwnerId,
        attackerPos: card.position, defenderPos: target.position,
        damage: 0, blocked: true, blockType: 'permanent',
        isRanged: true, attackerName: card.name || card.card_id,
        defenderName: target.name || target.card_id, totalAtk: damage
      });
      onShieldBreak?.(enemyBoard, enemyOwnerId);
    } else {
      target.hp = Math.max(0, target.hp - damage);
      combatLog.push({
        type: 'attack', attackerOwnerId: ownerId, defenderOwnerId: enemyOwnerId,
        attackerPos: card.position, defenderPos: target.position,
        damage: damage, defenderHpAfter: target.hp, defenderTempHp: target.tempHp,
        isFatal: target.hp + (target.tempHp || 0) <= 0, blocked: false,
        isRanged: true, attackerName: card.name || card.card_id,
        defenderName: target.name || target.card_id, totalAtk: damage
      });
    }
  }
}

// ========== 杨戬飞刀：对同一目标，基于攻击力百分比，目标死亡停止 ==========
function executeRangedSingleTarget(
  attacker: any,
  ownerId: string,
  target: any,
  targetBoard: any[],
  targetOwnerId: string,
  damage: number,
  times: number,
  combatLog: any[],
  onShieldBreak?: (board: any[], ownerId: string) => void
) {
  for (let i = 0; i < times; i++) {
    if ((target.hp + (target.tempHp || 0)) <= 0) break;

    if (target.tempShield > 0) {
      target.tempShield -= 1;
      combatLog.push({
        type: 'attack', attackerOwnerId: ownerId, defenderOwnerId: targetOwnerId,
        attackerPos: attacker.position, defenderPos: target.position,
        damage: 0, blocked: true, blockType: 'tempShield',
        isRanged: true, attackerName: attacker.name, defenderName: target.name,
        totalAtk: damage
      });
      onShieldBreak?.(targetBoard, targetOwnerId);
    } else if (target.shield > 0) {
      target.shield -= 1;
      combatLog.push({
        type: 'attack', attackerOwnerId: ownerId, defenderOwnerId: targetOwnerId,
        attackerPos: attacker.position, defenderPos: target.position,
        damage: 0, blocked: true, blockType: 'permanent',
        isRanged: true, attackerName: attacker.name, defenderName: target.name,
        totalAtk: damage
      });
      onShieldBreak?.(targetBoard, targetOwnerId);
    } else {
      target.hp = Math.max(0, target.hp - damage);
      const isFatal = target.hp + (target.tempHp || 0) <= 0;
      combatLog.push({
        type: 'attack', attackerOwnerId: ownerId, defenderOwnerId: targetOwnerId,
        attackerPos: attacker.position, defenderPos: target.position,
        damage: damage, defenderHpAfter: target.hp, defenderTempHp: target.tempHp,
        isFatal: isFatal, blocked: false, isRanged: true,
        attackerName: attacker.name, defenderName: target.name, totalAtk: damage
      });
      if (isFatal) break;
    }
  }
}

// ========== 倍数计算 ==========
function calcDivineMultiplier(board: any[], card: any): number {
  let multiplier = 1;
  let huangdiMaxStar = -1;
  for (const unit of board) {
    if (unit && unit.card_id === 'char_huangdi' && (unit.hp + (unit.tempHp || 0)) > 0) {
      huangdiMaxStar = Math.max(huangdiMaxStar, unit.star || 0);
    }
  }
  if (huangdiMaxStar >= 0) {
    multiplier += huangdiMaxStar >= 1 ? 3 : 2;
  }
  if (card.weapon?.card_id === 'weapon_didaozhijian') {
    const weaponStar = card.weapon.star || 0;
    multiplier += weaponStar >= 1 ? 2 : 1;
  }
  return multiplier;
}

function calcEnlightenmentMultiplier(board: any[], card: any): number {
  let multiplier = 1;
  let fuxiMaxStar = -1;
  for (const unit of board) {
    if (unit && unit.card_id === 'char_fuxi' && (unit.hp + (unit.tempHp || 0)) > 0) {
      fuxiMaxStar = Math.max(fuxiMaxStar, unit.star || 0);
    }
  }
  if (fuxiMaxStar >= 0) {
    multiplier += fuxiMaxStar >= 1 ? 3 : 2;
  }
  if (card.weapon?.card_id === 'weapon_wendaojian') {
    const weaponStar = card.weapon.star || 0;
    multiplier += weaponStar >= 1 ? 2 : 1;
  }
  return multiplier;
}

// ========== 盘古技能 ==========
function triggerSameRowDivineBlessing(
  attacker: any,
  board: any[],
  ownerId: string,
  combatLog: any[],
  times: number,
  players: Record<string, any>,
  bondMap: Record<string, {atk: number; hp: number}>,
  deps: any
) {
  const rowStart = attacker.position < 3 ? 0 : 3;
  for (let r = 0; r < times; r++) {
    for (let i = rowStart; i < rowStart + 3; i++) {
      if (i === attacker.position) continue;
      const ally = board[i];
      if (ally && ally.card_id && (ally.hp + (ally.tempHp || 0)) > 0) {
        const mult = calcDivineMultiplier(board, ally);
        executeDivineBlessing(ally, board, ownerId, combatLog, players, bondMap, mult, deps);
      }
    }
  }
}

// ========== 核心战斗模拟 ==========
function simulateFight(board1: any[], board2: any[], owner1: string, owner2: string, players: Record<string, any>, bondMap: Record<string, {atk: number; hp: number}>, options: any = { isMirror: false }) {
  const combatLog: any[] = [];
  const { isMirror } = options;

  const leftBoard = deepCloneBoard(board1);
  const rightBoard = isMirror ? deepCloneBoard(board1) : deepCloneBoard(board2);

  if (!rightBoard.some((c: any) => c && c.card_id && (c.hp + (c.tempHp || 0)) > 0)) {
    for (let i = 0; i < 6; i++) {
      if (leftBoard[i] && leftBoard[i].card_id) {
        rightBoard[i] = cloneCard(leftBoard[i], i, leftBoard[i]);
      }
    }
  }
  if (!leftBoard.some((c: any) => c && c.card_id && (c.hp + (c.tempHp || 0)) > 0)) {
    return { winner: 2, combatLog: [{ type: 'battle_end', reason: '攻方无存活单位', winner: 2 }], leftBoard, rightBoard };
  }

  // ★ 注入装备的动态字段，并标记武器星级
  const allBoardsInit = [leftBoard, rightBoard];
  for (const board of allBoardsInit) {
    for (const card of board) {
      if (!card || !card.card_id) continue;
      
      const equipSlots = [card.weapon, card.item1, card.item2];
      for (const equip of equipSlots) {
        if (!equip) continue;
        const equipStar = equip.star || 0;

        if (equip.abilities?.length) {
          card.abilities = [...(card.abilities || []), ...equip.abilities.map((eff: any) => ({
            ...eff, _equipStar: equipStar,
            effect: eff.effect ? { ...eff.effect, _equipStar: equipStar } : eff.effect
          }))];
        }
        if (equip.on_kill_effects?.length) {
          card.on_kill_effects = [...(card.on_kill_effects || []), ...equip.on_kill_effects.map((eff: any) => ({
            ...eff, _equipStar: equipStar,
            effect: eff.effect ? { ...eff.effect, _equipStar: equipStar } : eff.effect
          }))];
        }
        if (equip.deathrattle?.length) {
          card.deathrattle = [...(card.deathrattle || []), ...equip.deathrattle.map((eff: any) => ({
            ...eff, _equipStar: equipStar,
            effect: eff.effect ? { ...eff.effect, _equipStar: equipStar } : eff.effect
          }))];
        }
        if (equip.divine_blessing?.length) {
          card.divine_blessing = [...(card.divine_blessing || []), ...equip.divine_blessing.map((eff: any) => ({
            ...eff, _equipStar: equipStar,
            effect: eff.effect ? { ...eff.effect, _equipStar: equipStar } : eff.effect
          }))];
        }
        if (equip.enlightenment?.length) {
          card.enlightenment = [...(card.enlightenment || []), ...equip.enlightenment.map((eff: any) => ({
            ...eff, _equipStar: equipStar,
            effect: eff.effect ? { ...eff.effect, _equipStar: equipStar } : eff.effect
          }))];
        }
      }

      for (const ability of (card.abilities || [])) {
        if (ability.trigger === 'on_attack' && ability.effect.type === 'instant_kill') {
          const charges = ability.effect.charges || { base: 1, star_bonus: 0 };
          const star = card.star || 0;
          card._killCharges = charges.base + (star >= 1 ? charges.star_bonus : 0);
        }
      }
    }
  }

  // ★★★★★ 华佗破盾监听 ★★★★★
  function triggerHuaTuo(board: any[], ownerId: string) {
    const huaTuos = board.filter(c => c && c.card_id === 'char_huatuo' && (c.hp + (c.tempHp || 0)) > 0);
    if (huaTuos.length === 0) return;
    
    const allies = board.filter(c => c && c.card_id && (c.hp + (c.tempHp || 0)) > 0);
    if (allies.length === 0) return;

    for (const huaTuo of huaTuos) {
      const star = huaTuo.star || 0;
      const gain = star >= 1 ? 8 : 4;
      
      const targetPositions: number[] = [];
      for (const ally of allies) {
        ally.atk = (ally.atk || 0) + gain;
        ally.hp = (ally.hp || 0) + gain;
        if (ally.baseAtk !== undefined) ally.baseAtk = (ally.baseAtk || 0) + gain;
        if (ally.baseHp !== undefined) ally.baseHp = (ally.baseHp || 0) + gain;
        targetPositions.push(ally.position);
      }

      combatLog.push({
        type: 'mass_buff',
        playerId: ownerId,
        targetPositions: targetPositions,
        atkGain: gain,
        hpGain: gain,
        sourceCard: huaTuo.name || huaTuo.card_id,
        desc: `华佗·青囊 +${gain}/+${gain} (破盾触发)`
      });

      if (gain > 0) {
        triggerZhangFeiEffect(board, ownerId, combatLog);
      }
    }
  }

  const onShieldBreak = (board: any[], ownerId: string) => triggerHuaTuo(board, ownerId);

  const divineDeps = {
    applyEffect: (sourceCard: any, targetCard: any, effect: any, combatLog: any[], ownerId: string, board?: any[]) =>
      applyEffect(sourceCard, targetCard, effect, combatLog, ownerId, board),
    applyPermanentBuff: (targetCard: any, atkGain: number, hpGain: number, combatLog: any[], ownerId: string, sourceCard: any, desc: string, board?: any[]) =>
      applyPermanentBuff(targetCard, atkGain, hpGain, combatLog, ownerId, sourceCard, desc, board),
    getEffectStar,
    executeOnKillEffects: (card: any, ownerId: string, board: any[], players: Record<string, any>, combatLog: any[], bondMap: Record<string, {atk: number; hp: number}>, times: number, deps: any) =>
      executeOnKillEffects(card, ownerId, board, players, combatLog, bondMap, times, deps),
    executeEnlightenment: (card: any, board: any[], ownerId: string, combatLog: any[], players: Record<string, any>, bondMap: Record<string, {atk: number; hp: number}>, times: number, enlightenmentMultiplier: number, deps: any) =>
      executeEnlightenment(card, board, ownerId, combatLog, players, bondMap, times, enlightenmentMultiplier, deps),
    calcEnlightenmentMultiplier,
    onAtkGain: (board: any[], ownerId: string) => triggerZhangFeiEffect(board, ownerId, combatLog),

    getEnemyInfo: (ownerId: string) => {
      if (ownerId === owner1) return { enemyBoard: rightBoard, enemyOwnerId: owner2 };
      return { enemyBoard: leftBoard, enemyOwnerId: owner1 };
    },
    executeRangedSingle: (card: any, ownerId: string, enemyBoard: any[], enemyOwnerId: string, damage: number, times: number, combatLog: any[]) =>
      executeRangedSingle(card, ownerId, enemyBoard, enemyOwnerId, damage, times, combatLog),
    executeRangedAOE: (card: any, ownerId: string, board: any[], enemyBoard: any[], enemyOwnerId: string, damage: number, combatLog: any[], times: number = 1) =>
      executeRangedAOE(card, ownerId, board, enemyBoard, enemyOwnerId, damage, combatLog, times),
  };

  const allBoards = [
    { board: leftBoard, owner: owner1 },
    { board: rightBoard, owner: owner2 },
  ];
  for (const { board, owner } of allBoards) {
    const alive = board.filter(c => c && c.card_id && (c.hp + (c.tempHp || 0)) > 0).sort((a, b) => a.position - b.position);
    for (const card of alive) {
      const elMult = calcEnlightenmentMultiplier(board, card);
      executeEnlightenment(card, board, owner, combatLog, players, bondMap, 1, elMult, {
        applyEffect: (sourceCard: any, targetCard: any, effect: any, combatLog: any[], ownerId: string) =>
          applyEffect(sourceCard, targetCard, effect, combatLog, ownerId, board),
        applyPermanentBuff: (targetCard: any, atkGain: number, hpGain: number, combatLog: any[], ownerId: string, sourceCard: any, desc: string) =>
          applyPermanentBuff(targetCard, atkGain, hpGain, combatLog, ownerId, sourceCard, desc, board),
        getEffectStar,
        onAtkGain: (boardRef: any[], ownerId: string) => triggerZhangFeiEffect(boardRef, ownerId, combatLog),
      });
      const mult = calcDivineMultiplier(board, card);
      executeDivineBlessing(card, board, owner, combatLog, players, bondMap, mult, divineDeps);
    }
  }

  let turn = 0;
  const MAX_TURN = 1000;
  let currentAttackerSide = Math.random() >= 0.5 ? 1 : 2;
  const getBoardBySide = (side: number) => side === 1 ? leftBoard : rightBoard;
  const getAliveUnitsBySide = (side: number) => {
    const b = getBoardBySide(side);
    return b.filter(c => c && c.card_id && (c.hp + (c.tempHp || 0)) > 0).sort((a, b) => a.position - b.position);
  };
  const leftHand = players[owner1]?.hand || [];
  const rightHand = players[owner2]?.hand || [];
  let leftNextPos = 0;
  let rightNextPos = 0;

  while (turn < MAX_TURN) {
    const leftAlive = getAliveUnitsBySide(1);
    const rightAlive = getAliveUnitsBySide(2);
    if (leftAlive.length === 0 || rightAlive.length === 0) break;

    const currentAlive = currentAttackerSide === 1 ? leftAlive : rightAlive;
    const currentOwnerId = currentAttackerSide === 1 ? owner1 : owner2;
    const currentBoard = getBoardBySide(currentAttackerSide);
    let nextPos = currentAttackerSide === 1 ? leftNextPos : rightNextPos;

    const skipSet = new Set();
    for (const unit of currentAlive) {
      for (const ability of (unit.abilities || [])) {
        if (ability.trigger !== 'on_turn_start') continue;
        if (!checkCondition(ability.condition, { card_id: unit.card_id })) continue;
        if (ability.effect.type === 'skip_turn') {
          skipSet.add(unit.instanceId);
          combatLog.push({
            type: 'skip',
            playerId: currentOwnerId,
            position: unit.position,
            cardName: unit.name || unit.card_id,
            desc: ability.effect.desc_template || '跳过行动'
          });
        }
      }
    }

    let attacker: any = null;
    let searchAttempts = 0;
    const maxSearchAttempts = currentAlive.length;
    while (!attacker && searchAttempts < maxSearchAttempts) {
      const candidate = currentAlive.find(u => u.position >= nextPos && !skipSet.has(u.instanceId))
                     || currentAlive.find(u => !skipSet.has(u.instanceId));
      if (!candidate) break;
      nextPos = (candidate.position + 1) % 6;
      attacker = candidate;
    }
    if (currentAttackerSide === 1) leftNextPos = nextPos;
    else rightNextPos = nextPos;
    if (!attacker) {
      currentAttackerSide = currentAttackerSide === 1 ? 2 : 1;
      turn++;
      continue;
    }

    const attackerBoard = getBoardBySide(currentAttackerSide);
    const attackerHasSniper = hasItem(attacker, 'item_02');

    // 盘古技能
    for (const ability of (attacker.abilities || [])) {
      if (ability.trigger === 'before_ally_attack' && ability.effect.type === 'trigger_divine_blessing') {
        const repeat = ability.effect.repeat || { base: 1, star_bonus: 0 };
        const star = getEffectStar(ability.effect, attacker);
        const times = repeat.base + (star >= 1 ? repeat.star_bonus : 0);
        triggerSameRowDivineBlessing(attacker, attackerBoard, currentOwnerId, combatLog, times, players, bondMap, divineDeps);
      }
    }

    // 刘备仁德
    for (const unit of getAliveUnitsBySide(currentAttackerSide)) {
      for (const ability of (unit.abilities || [])) {
        if (ability.trigger === 'before_ally_attack' && ability.effect.type === 'grant_buff') {
          const eff = ability.effect;
          const sourceTotalAtk = (unit.atk || 0) + (unit.tempAtk || 0);
          const star = Number(unit.star) || 0;
          const multiplier = star >= 1 ? 1 + (eff.amount.star_multiplier || 0) : 1;
          const gain = Math.floor(sourceTotalAtk * multiplier);
          attacker.tempAtk = (attacker.tempAtk || 0) + gain;
          combatLog.push({
            type: 'buff',
            playerId: currentAttackerSide === 1 ? owner1 : owner2,
            position: attacker.position,
            tempAtkGain: gain,
            sourceCard: unit.name || unit.card_id,
            desc: (eff.desc_template || '仁德').replace('{value}', gain)
          });
          if (gain > 0) triggerZhangFeiEffect(attackerBoard, currentOwnerId, combatLog);
        }
      }
    }

    const enemyUnits = getAliveUnitsBySide(currentAttackerSide === 1 ? 2 : 1);
    let target = findTarget(attacker.position, enemyUnits, attackerHasSniper);
    if (!target) { currentAttackerSide = currentAttackerSide === 1 ? 2 : 1; turn++; continue; }

    // 黑化帝
    for (const ability of (attacker.abilities || [])) {
      if (ability.trigger !== 'before_own_attack') continue;
      const ctx = { has_weapon: attacker.weapon?.card_id || '' };
      if (!checkCondition(ability.condition, ctx)) continue;
      if (ability.effect.type === 'convert_target_hp_to_attack') {
        const star = getEffectStar(ability.effect, attacker);
        const percent = ability.effect.percent + (star >= 1 ? (ability.effect.star_multiplier || 0) : 0);
        const targetHp = (target.hp || 0) + (target.tempHp || 0);
        const gainAmount = Math.floor(targetHp * percent);
        attacker.tempAtk = (attacker.tempAtk || 0) + gainAmount;
        combatLog.push({
          type: 'buff',
          playerId: currentOwnerId,
          position: attacker.position,
          tempAtkGain: gainAmount,
          sourceCard: attacker.name,
          desc: `汲取 +${gainAmount} 攻击`
        });
        if (gainAmount > 0) triggerZhangFeiEffect(attackerBoard, currentOwnerId, combatLog);
      }
    }

    let isAoe = false;
    for (const ability of (attacker.abilities || [])) {
      const ctx = { has_weapon: attacker.weapon?.card_id || '' };
      if (ability.trigger === 'before_own_attack' && ability.effect.type === 'aoe_modifier' && checkCondition(ability.condition, ctx)) {
        isAoe = true;
        break;
      }
    }

    let instantKilled = false;
    if (attacker._killCharges > 0) {
      for (const ability of (attacker.abilities || [])) {
        if (ability.trigger === 'on_attack' && ability.effect.type === 'instant_kill') {
          attacker._killCharges--;
          target.hp = 0; target.tempHp = 0; target.tempShield = 0; target.shield = 0;
          instantKilled = true;
          combatLog.push({
            type: 'instant_kill',
            attackerOwnerId: currentAttackerSide === 1 ? owner1 : owner2,
            defenderOwnerId: currentAttackerSide === 1 ? owner2 : owner1,
            attackerPos: attacker.position, defenderPos: target.position,
            attackerName: attacker.name, defenderName: target.name,
            remainingCharges: attacker._killCharges
          });
          break;
        }
      }
    }

    if (instantKilled) {
      const currentHand = currentAttackerSide === 1 ? leftHand : rightHand;
      generateNvwaCards(currentBoard, currentHand, attacker.position, currentOwnerId, combatLog);
      executeOnKillEffects(attacker, currentOwnerId, currentBoard, players, combatLog, bondMap, 1, {
        ...divineDeps,
        applyEffect: (sourceCard: any, targetCard: any, effect: any, combatLog: any[], ownerId: string, board?: any[]) =>
          applyEffect(sourceCard, targetCard, effect, combatLog, ownerId, currentBoard),
      });
      currentAttackerSide = currentAttackerSide === 1 ? 2 : 1;
      turn++;
      continue;
    }

    const totalAtk = Number(attacker.atk) + Number(attacker.tempAtk || 0);
    const chi = Math.max(0, Number(attacker.chi) || 0);
    const totalSegments = 1 + chi;
    const targets = isAoe ? getAliveUnitsBySide(currentAttackerSide === 1 ? 2 : 1) : [target];
    let anyKill = false;
    let isFirstAoeTarget = true;

    for (const currentTarget of targets) {
      let isLethal = false;
      for (let seg = 0; seg < totalSegments; seg++) {
        if ((currentTarget.hp + (currentTarget.tempHp || 0)) <= 0) break;
        const segType = seg === 0 ? 'main' : 'chi';
        const tempShield = Number(currentTarget.tempShield) || 0;
        const shield = Number(currentTarget.shield) || 0;

        let attackEvent: any = null;

        // ★★★ 攻击段（先记录攻击事件，再触发华佗）
        if (tempShield > 0) {
          currentTarget.tempShield = tempShield - 1;
          attackEvent = {
            type: 'attack', attackerOwnerId: currentAttackerSide === 1 ? owner1 : owner2,
            defenderOwnerId: currentAttackerSide === 1 ? owner2 : owner1,
            attackerPos: attacker.position, defenderPos: currentTarget.position,
            damage: 0, defenderHpAfter: currentTarget.hp, defenderTempHp: currentTarget.tempHp,
            isFatal: false, blocked: true, blockType: 'tempShield',
            attackerName: attacker.name, defenderName: currentTarget.name,
            totalAtk: totalAtk, attackType: segType,
          };
          if (isAoe && isFirstAoeTarget) {
            attackEvent.isAoe = true;
            isFirstAoeTarget = false;
          }
          combatLog.push(attackEvent);
          const defenderBoard = getBoardBySide(currentAttackerSide === 1 ? 2 : 1);
          const defenderOwnerId = currentAttackerSide === 1 ? owner2 : owner1;
          onShieldBreak(defenderBoard, defenderOwnerId);
        } else if (shield > 0) {
          currentTarget.shield = shield - 1;
          attackEvent = {
            type: 'attack', attackerOwnerId: currentAttackerSide === 1 ? owner1 : owner2,
            defenderOwnerId: currentAttackerSide === 1 ? owner2 : owner1,
            attackerPos: attacker.position, defenderPos: currentTarget.position,
            damage: 0, defenderHpAfter: currentTarget.hp, defenderTempHp: currentTarget.tempHp,
            isFatal: false, blocked: true, blockType: 'permanent',
            attackerName: attacker.name, defenderName: currentTarget.name,
            totalAtk: totalAtk, attackType: segType,
          };
          if (isAoe && isFirstAoeTarget) {
            attackEvent.isAoe = true;
            isFirstAoeTarget = false;
          }
          combatLog.push(attackEvent);
          const defenderBoard = getBoardBySide(currentAttackerSide === 1 ? 2 : 1);
          const defenderOwnerId = currentAttackerSide === 1 ? owner2 : owner1;
          onShieldBreak(defenderBoard, defenderOwnerId);
        } else {
          let remainingDmg = Math.max(0, totalAtk);
          const currentTempHp = Number(currentTarget.tempHp) || 0;
          if (currentTempHp > 0) {
            if (remainingDmg <= currentTempHp) {
              currentTarget.tempHp = currentTempHp - remainingDmg;
              remainingDmg = 0;
            } else {
              remainingDmg -= currentTempHp;
              currentTarget.tempHp = 0;
            }
          }
          if (remainingDmg > 0) {
            currentTarget.hp = Math.max(0, currentTarget.hp - remainingDmg);
          }
          isLethal = (currentTarget.hp + (currentTarget.tempHp || 0)) <= 0;
          attackEvent = {
            type: 'attack', attackerOwnerId: currentAttackerSide === 1 ? owner1 : owner2,
            defenderOwnerId: currentAttackerSide === 1 ? owner2 : owner1,
            attackerPos: attacker.position, defenderPos: currentTarget.position,
            damage: remainingDmg > 0 ? remainingDmg : 0,
            defenderHpAfter: currentTarget.hp, defenderTempHp: currentTarget.tempHp,
            isFatal: isLethal, blocked: false,
            attackerName: attacker.name, defenderName: currentTarget.name,
            totalAtk: totalAtk, attackType: segType,
          };
          if (isAoe && isFirstAoeTarget) {
            attackEvent.isAoe = true;
            isFirstAoeTarget = false;
          }
          combatLog.push(attackEvent);
        }

        // ★★★ 三国羁绊
        if (attackEvent.damage > 0 && !attackEvent.blocked && currentTarget.faction === '三国') {
          const defenderBoard = getBoardBySide(currentAttackerSide === 1 ? 2 : 1);
          const defenderOwnerId = currentAttackerSide === 1 ? owner2 : owner1;
          const sanGuoBond = calculateSanGuoBond(defenderBoard);
          if (sanGuoBond.hp > 0) {
            applySanGuoBond(defenderBoard, defenderOwnerId, combatLog, sanGuoBond.hp);
          }
        }

        // on_attack 技能
        if (seg === 0) {
          for (const ability of (attacker.abilities || [])) {
            if (ability.trigger !== 'on_attack') continue;
            if (!checkCondition(ability.condition, { attack_type: 'main' })) continue;

            const eff = ability.effect;
            if (ability._equipStar !== undefined) {
              (eff as any)._equipStar = ability._equipStar;
            }
            if (eff.type === 'lifesteal') {
              const star = getEffectStar(eff, attacker);
              const factor = eff.factor + (star >= 1 ? (eff.star_bonus || 0) : 0);
              const lifeGain = Math.floor(totalAtk * factor);
              if (lifeGain > 0) {
                attacker.tempHp = (attacker.tempHp || 0) + lifeGain;
                combatLog.push({
                  type: 'buff', playerId: currentAttackerSide === 1 ? owner1 : owner2,
                  position: attacker.position, tempHpGain: lifeGain,
                  sourceCard: attacker.name || attacker.card_id,
                  desc: (eff.desc_template || '吸血').replace('{value}', lifeGain).replace('{percent}', Math.floor(factor * 100))
                });
              }
            } else {
              applyEffect(attacker, attacker, eff, combatLog, currentOwnerId, attackerBoard);
            }
          }
        }
      }
      if (isLethal) anyKill = true;
    }

    if (targets.length === 1) {
      attacker._lastTarget = targets[0];
      attacker._lastTargetOwnerId = currentAttackerSide === 1 ? owner2 : owner1;
    } else {
      attacker._lastTarget = null;
    }

    const currentHand = currentAttackerSide === 1 ? leftHand : rightHand;
    generateNvwaCards(currentBoard, currentHand, attacker.position, currentOwnerId, combatLog);

    if (anyKill) {
      executeOnKillEffects(attacker, currentOwnerId, currentBoard, players, combatLog, bondMap, 1, {
        ...divineDeps,
        applyEffect: (sourceCard: any, targetCard: any, effect: any, combatLog: any[], ownerId: string, board?: any[]) =>
          applyEffect(sourceCard, targetCard, effect, combatLog, ownerId, currentBoard),
      });

      const defenderBoard = getBoardBySide(currentAttackerSide === 1 ? 2 : 1);
      const defenderOwnerId = currentAttackerSide === 1 ? owner2 : owner1;
      const enemyBoard = getBoardBySide(currentAttackerSide);
      const enemyOwnerId = currentAttackerSide === 1 ? owner1 : owner2;

      for (const t of targets) {
        if ((t.hp + (t.tempHp || 0)) <= 0) {
          executeDeathrattle(
            t,
            defenderOwnerId,
            defenderBoard,
            enemyBoard,
            enemyOwnerId,
            players,
            combatLog,
            {
              applyEffect: (sourceCard: any, targetCard: any, effect: any, combatLog: any[], ownerId: string) =>
                applyEffect(sourceCard, targetCard, effect, combatLog, ownerId, defenderBoard),
              getEffectStar,
              triggerHuaTuo
            }
          );

          for (const effect of t.deathrattle || []) {
            if (effect.type !== 'ranged_single') continue;
            const star = getEffectStar(effect, t);
            const dmg = Number(effect.damage) || 0;
            let count = Number(effect.count) || 1;
            if (star >= 1 && effect.star_bonus_count !== undefined) count += Number(effect.star_bonus_count);
            if (dmg <= 0) continue;
            executeRangedSingle(t, defenderOwnerId, enemyBoard, enemyOwnerId, dmg, count, combatLog, onShieldBreak);
          }
        }
      }
    }

    // after_attack
    for (const ability of (attacker.abilities || [])) {
      if (ability.trigger !== 'after_attack') continue;
      const eff = ability.effect;

      if (eff.type === 'grant_buff') {
        const allies = getAliveUnitsBySide(currentAttackerSide);
        const pool = allies.filter(c => c.instanceId !== attacker.instanceId);
        const count = Math.min(eff.count || 2, pool.length);
        const selectedTargets = [];
        for (let i = 0; i < count; i++) {
          const idx = Math.floor(Math.random() * pool.length);
          selectedTargets.push(pool.splice(idx, 1)[0]);
        }
        selectedTargets.forEach(ally => {
          applyEffect(attacker, ally, eff, combatLog, currentOwnerId, attackerBoard);
        });
      } else if (eff.type === 'ranged_aoe') {
        const star = getEffectStar(eff, attacker);
        const dmg = Number(eff.damage) || 1;
        let baseCount = Number(eff.count) || 1;
        if (star >= 1 && eff.star_bonus_count !== undefined) baseCount += Number(eff.star_bonus_count);
        const times = baseCount;

        const currentSide = currentAttackerSide;
        const allyBoard = getBoardBySide(currentSide);
        const opponentBoard = getBoardBySide(currentSide === 1 ? 2 : 1);
        const allyOwnerId = currentSide === 1 ? owner1 : owner2;
        const opponentOwnerId = currentSide === 1 ? owner2 : owner1;

        executeRangedAOE(attacker, allyOwnerId, allyBoard, opponentBoard, opponentOwnerId, dmg, combatLog, times, onShieldBreak);
      } else if (eff.type === 'ranged_single') {
        const star = getEffectStar(eff, attacker);
        const dmg = Number(eff.damage) || 0;
        let count = Number(eff.count) || 1;
        if (star >= 1 && eff.star_bonus_count !== undefined) count += Number(eff.star_bonus_count);
        if (dmg <= 0) continue;

        const enemyBoard = getBoardBySide(currentAttackerSide === 1 ? 2 : 1);
        const enemyOwnerId = currentAttackerSide === 1 ? owner2 : owner1;
        executeRangedSingle(attacker, currentOwnerId, enemyBoard, enemyOwnerId, dmg, count, combatLog, onShieldBreak);
      } else if (eff.type === 'ranged_single_target') {
        const target = attacker._lastTarget;
        if (!target || (target.hp + (target.tempHp || 0)) <= 0) continue;

        const star = getEffectStar(eff, attacker);
        const percent = (eff.attack_percent || 0) + (star >= 1 ? (eff.star_bonus_attack_percent || 0) : 0);
        const totalAtk = (attacker.atk || 0) + (attacker.tempAtk || 0);
        const damage = Math.floor(totalAtk * percent);
        if (damage <= 0) continue;

        let count = eff.count || 1;
        if (star >= 1 && eff.star_bonus_count) count += eff.star_bonus_count;

        const targetOwnerId = currentAttackerSide === 1 ? owner2 : owner1;
        const targetBoard = getBoardBySide(currentAttackerSide === 1 ? 2 : 1);
        executeRangedSingleTarget(attacker, currentOwnerId, target, targetBoard, targetOwnerId, damage, count, combatLog, onShieldBreak);
      } else if (eff.type === 'trigger_self_kill_effects') {
        const star = getEffectStar(eff, attacker);
        const times = (eff.times || 1) + (star >= 1 ? (eff.star_bonus_times || 0) : 0);
        executeOnKillEffects(attacker, currentOwnerId, attackerBoard, players, combatLog, bondMap, times, {
          ...divineDeps,
          applyEffect: (sourceCard: any, targetCard: any, effect: any, combatLog: any[], ownerId: string, board?: any[]) =>
            applyEffect(sourceCard, targetCard, effect, combatLog, ownerId, attackerBoard),
        });
      }
    }

    // 唐僧光环
    for (const unit of getAliveUnitsBySide(currentAttackerSide)) {
      for (const ability of (unit.abilities || [])) {
        if (ability.trigger !== 'after_ally_attack') continue;
        if (ability.effect.type !== 'trigger_kill_effects') continue;
        const star = getEffectStar(ability.effect, unit);
        const times = (ability.effect.times || 1) + (star >= 1 ? (ability.effect.star_bonus_times || 0) : 0);
        executeOnKillEffects(attacker, currentOwnerId, currentBoard, players, combatLog, bondMap, times, {
          ...divineDeps,
          applyEffect: (sourceCard: any, targetCard: any, effect: any, combatLog: any[], ownerId: string, board?: any[]) =>
            applyEffect(sourceCard, targetCard, effect, combatLog, ownerId, currentBoard),
        });
      }
    }

    currentAttackerSide = currentAttackerSide === 1 ? 2 : 1;
    turn++;
  }

  const finalLeftAlive = getAliveUnitsBySide(1).length > 0;
  const winner = finalLeftAlive ? 1 : 2;
  combatLog.push({ type: 'battle_end', reason: turn >= MAX_TURN ? '达到最大回合数' : '一方全灭', winner, totalTurn: turn });
  return { winner, combatLog, leftBoard, rightBoard };
}

// ========== 辅助计算函数 ==========
function calculateSurvivalDamage(tempBoard: any[]) {
  return tempBoard.reduce((sum, card) => sum + (card && card.card_id && (card.hp + (card.tempHp || 0)) > 0 ? (RARITY_DAMAGE[card.rarity] || 0) : 0), 0);
}

function calculateRankings(players: Record<string, any>) {
  const entries = Object.entries(players);
  const alive = entries.filter(([,p])=>!p.isEliminated && p.health>0);
  const eliminated = entries.filter(([,p])=>p.isEliminated || p.health<=0);
  eliminated.sort((a,b)=>{
    const ta = a[1].eliminatedAt ? new Date(a[1].eliminatedAt).getTime() : 0;
    const tb = b[1].eliminatedAt ? new Date(b[1].eliminatedAt).getTime() : 0;
    if(ta !== tb) return tb - ta;
    return (b[1].health||0) - (a[1].health||0);
  });
  const result: Record<string, number> = {};
  let rank = 1;
  alive.forEach(([id])=>{ result[id] = rank++; });
  eliminated.forEach(([id])=>{ result[id] = rank++; });
  return result;
}

// ========== 主服务 ==========
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { roomId } = await req.json();
    if (!roomId) throw new Error('缺少 roomId');

    const supabaseUrl = Deno.env.get('URL');
    const supabaseServiceKey = Deno.env.get('SECRET_KEY');
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('环境变量缺失');

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const { data: globalRow, error: globalError } = await supabase
      .from('game_states')
      .select('state')
      .eq('room_id', roomId)
      .eq('user_id', GLOBAL_USER_ID)
      .maybeSingle();

    if (globalError || !globalRow?.state) throw new Error('全局行不存在');

    const globalState = globalRow.state;
    const currentRound = globalState.round || 1;
    const now = new Date().toISOString();

    if ((globalState.lastSettledRound || 0) >= currentRound) {
      const { data: playerRows } = await supabase
        .from('game_states')
        .select('user_id, state')
        .eq('room_id', roomId)
        .neq('user_id', GLOBAL_USER_ID);
      
      const players: Record<string, any> = {};
      if (playerRows) {
        for (const row of playerRows) {
          players[row.user_id] = row.state;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        alreadySettled: true,
        animStartTime: globalState.battleAnimStartTime || new Date().toISOString(),
        updatedPlayers: players,
        buffEvents: globalState.buffEvents || [],
        combatResults: globalState.combatResults || [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: lockOk, error: lockErr } = await supabase.rpc('try_lock_settle_battle', {
      p_room_id: roomId,
      p_round: currentRound
    });
    if (lockErr || !lockOk) {
      console.log(`[结算] 未获取锁，回合 ${currentRound} 可能已被其他请求处理`);
      const { data: retryGlobalRow } = await supabase
        .from('game_states')
        .select('state')
        .eq('room_id', roomId)
        .eq('user_id', GLOBAL_USER_ID)
        .maybeSingle();

      const retryPlayers: Record<string, any> = {};
      const { data: retryPlayerRows } = await supabase
        .from('game_states')
        .select('user_id, state')
        .eq('room_id', roomId)
        .neq('user_id', GLOBAL_USER_ID);
      if (retryPlayerRows) {
        for (const row of retryPlayerRows) {
          retryPlayers[row.user_id] = row.state;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        alreadySettled: true,
        animStartTime: retryGlobalRow?.state.battleAnimStartTime || now,
        updatedPlayers: retryPlayers,
        buffEvents: retryGlobalRow?.state.buffEvents || [],
        combatResults: retryGlobalRow?.state.combatResults || [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: playerRows, error: playersError } = await supabase
      .from('game_states')
      .select('user_id, state')
      .eq('room_id', roomId)
      .neq('user_id', GLOBAL_USER_ID);

    if (playersError) throw new Error(`读取玩家行失败: ${playersError.message}`);

    const { data: templates, error: tmplErr } = await supabase
      .from('card_templates')
      .select('card_id, abilities, enlightenment, on_kill_effects, deathrattle, divine_blessing');

    const templateMap: Record<string, any> = {};
    if (templates) {
      for (const t of templates) {
        let ab = t.abilities || [];
        if (typeof ab === 'string') { try { ab = JSON.parse(ab); } catch(e) { ab = []; } }
        let enl = t.enlightenment || [];
        if (typeof enl === 'string') { try { enl = JSON.parse(enl); } catch(e) { enl = []; } }
        let oke = t.on_kill_effects || [];
        if (typeof oke === 'string') { try { oke = JSON.parse(oke); } catch(e) { oke = []; } }
        let dr = t.deathrattle || [];
        if (typeof dr === 'string') { try { dr = JSON.parse(dr); } catch(e) { dr = []; } }
        let db = t.divine_blessing || [];
        if (typeof db === 'string') { try { db = JSON.parse(db); } catch(e) { db = []; } }

        templateMap[t.card_id] = {
          abilities: Array.isArray(ab) ? ab : [],
          enlightenment: Array.isArray(enl) ? enl : [],
          on_kill_effects: Array.isArray(oke) ? oke : [],
          deathrattle: Array.isArray(dr) ? dr : [],
          divine_blessing: Array.isArray(db) ? db : []
        };
      }
    }

    const dbPlayers: Record<string, any> = {};
    for (const row of playerRows || []) {
      const p = row.state;
      if (typeof p.slayCount !== 'number') p.slayCount = 0;
      if (typeof p.firstMoverCount !== 'number') p.firstMoverCount = 0;
      
      if (p.board && Array.isArray(p.board)) {
        for (const card of p.board) {
          if (card && card.card_id && templateMap[card.card_id]) {
            const tmpl = templateMap[card.card_id];
            card.abilities = tmpl.abilities;
            if (!card.enlightenment || (Array.isArray(card.enlightenment) && card.enlightenment.length === 0)) {
              card.enlightenment = tmpl.enlightenment;
            }
            if (!card.on_kill_effects || (Array.isArray(card.on_kill_effects) && card.on_kill_effects.length === 0)) {
              card.on_kill_effects = tmpl.on_kill_effects;
            }
            if (!card.deathrattle || (Array.isArray(card.deathrattle) && card.deathrattle.length === 0)) {
              card.deathrattle = tmpl.deathrattle;
            }
            if (!card.divine_blessing || (Array.isArray(card.divine_blessing) && card.divine_blessing.length === 0)) {
              card.divine_blessing = tmpl.divine_blessing;
            }
          } else if (card && card.card_id) {
            card.abilities = card.abilities || [];
            card.enlightenment = card.enlightenment || [];
            card.on_kill_effects = card.on_kill_effects || [];
            card.deathrattle = card.deathrattle || [];
            card.divine_blessing = card.divine_blessing || [];
          }
          if (card && card.card_id === 'char_jingwei' && !('enlightenmentTriggerCount' in card)) {
            card.enlightenmentTriggerCount = 0;
          }
        }
      }
      dbPlayers[row.user_id] = p;
    }

    const gameState = {
      ...globalState,
      players: dbPlayers,
    };

    const battlePairs = globalState.battlePairs || [];
    if (battlePairs.length === 0) {
      await supabase.rpc('unlock_settle_battle', { p_room_id: roomId, p_round: currentRound });
      console.warn('没有可用的 battlePairs');
      return new Response(JSON.stringify({ success: false, error: '没有对战信息' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const bondMap: Record<string, { atk: number; hp: number }> = {};
    for (const pid in gameState.players) {
      bondMap[pid] = calculateXiYouBond(gameState.players[pid]?.board);
    }

    const buffEvents: any[] = [];
    const combatResults: any[] = [];

    for (const pair of battlePairs) {
      const p1 = pair.p1;
      const p2 = pair.p2;
      const pairOptions = {
        isMirror: pair.isMirror || false,
        firstMover: pair.firstMover || 'p1',
        phantom: pair.phantom || false,
        phantomOwner: pair.phantomOwner || null
      };

      if (!p1) continue;
      const p1Obj = gameState.players[p1];
      let p2Obj = p2 ? gameState.players[p2] : null;
      if (!p1Obj) continue;

      let phantomOriginalState = null;
      if (pairOptions.phantom && p2Obj) {
        phantomOriginalState = JSON.parse(JSON.stringify(p2Obj));
      }

      const b1 = deepCloneBoard(p1Obj.board || []);
      const b2 = p2Obj ? deepCloneBoard(p2Obj.board || []) : [];

      let result;
      try {
        result = simulateFight(b1, b2, p1, p2 || p1, gameState.players, bondMap, pairOptions);
      } catch (simError) {
        console.error('战斗模拟异常:', simError);
        result = {
          winner: 0,
          combatLog: [{ type: 'battle_end', reason: '战斗模拟错误: ' + simError.message, winner: 0, totalTurn: 0 }],
          leftBoard: b1,
          rightBoard: b2
        };
      }
      
      function syncJingweiCounter(originalBoard: any[], clonedBoard: any[]) {
        if (!originalBoard || !clonedBoard) return;
        const countMap: Record<string, number> = {};
        for (const card of clonedBoard) {
          if (card && card.card_id === 'char_jingwei' && card.instanceId) {
            countMap[card.instanceId] = card.enlightenmentTriggerCount ?? 0;
          }
        }
        for (const card of originalBoard) {
          if (card && card.card_id === 'char_jingwei' && card.instanceId) {
            if (countMap.hasOwnProperty(card.instanceId)) {
              card.enlightenmentTriggerCount = countMap[card.instanceId];
            }
          }
        }
      }
      syncJingweiCounter(gameState.players[p1]?.board, result.leftBoard);
      if (p2 && gameState.players[p2] && !pairOptions.phantom) {
        syncJingweiCounter(gameState.players[p2]?.board, result.rightBoard);
      }

      combatResults.push({
        p1, p2: p2 || p1,
        winner: result.winner,
        combatLog: result.combatLog,
        totalTurn: result.combatLog.find(e => e.type === 'battle_end')?.totalTurn || 0
      });

      for (const evt of result.combatLog) {
        if (evt.type === 'generate' && evt.playerId && evt.sourceCard === '女娲' && evt.desc && evt.desc.startsWith('造人 · 生成')) {
          if (pairOptions.phantom && evt.playerId === pairOptions.phantomOwner) continue;
          
          const player = gameState.players[evt.playerId];
          if (!player || !player.hand) continue;

          const validHandCount = player.hand.filter(h => h && (h.card_id || h.cardId)).length;
          if (validHandCount >= 15) continue;

          const rarityMatch = evt.desc.match(/生成(Common|Rare|Epic|Legendary)角色牌/);
          if (!rarityMatch) continue;
          const rarity = rarityMatch[1];

          const { data: tpls, error: tErr } = await supabase
            .from('card_templates')
            .select('*')
            .eq('rarity', rarity)
            .not('type', 'in', '("weapon","item")')
            .limit(50);

          if (tErr || !tpls || tpls.length === 0) continue;

          const picked = tpls[Math.floor(Math.random() * tpls.length)];

          const newCard: any = {
            instanceId: crypto.randomUUID(),
            cardId: picked.card_id,
            card_id: picked.card_id,
            name: picked.name,
            type: 'character',
            rarity: rarity,
            faction: picked.faction || '中立',
            atk: picked.base_atk,
            hp: picked.base_hp,
            baseAtk: picked.base_atk,
            baseHp: picked.base_hp,
            star: 0,
            price: rarity === 'Common' ? 1 : rarity === 'Rare' ? 2 : rarity === 'Epic' ? 3 : 4,
            image: picked.image || `/assets/card/${picked.card_id}.png`,
            weapon: null,
            item1: null,
            item2: null,
            shield: picked.shield || 0,
            chi: picked.chi || 0,
            equipment: { weapon: null, items: [null, null] },
            enlightenmentCount: 0,
            slayCount: 0,
            enlightenmentTriggerCount: 0,
          };

          const emptyIdx = player.hand.findIndex(h => !h || !h.card_id);
          if (emptyIdx !== -1) {
            player.hand[emptyIdx] = newCard;
          } else {
            player.hand.push(newCard);
          }
        }
      }

      for (const evt of result.combatLog) {
        if (pairOptions.phantom && evt.playerId === pairOptions.phantomOwner) continue;
        
        if (evt.type === 'buff' && evt.playerId && evt.sourceCard !== '女娲') {
          if (evt.position !== undefined) {
            const player = gameState.players[evt.playerId];
            if (player?.board) {
              const card = player.board[evt.position];
              if (card && card.card_id) {
                if (evt.atkGain) {
                  card.atk = Number(card.atk) + Number(evt.atkGain);
                  if (card.baseAtk !== undefined) card.baseAtk = (card.baseAtk || 0) + Number(evt.atkGain);
                }
                if (evt.hpGain) {
                  card.hp = Number(card.hp) + Number(evt.hpGain);
                  if (card.baseHp !== undefined) card.baseHp = (card.baseHp || 0) + Number(evt.hpGain);
                }
              }
            }
          }
          if (evt.goldGain) {
            const player = gameState.players[evt.playerId];
            if (player) player.gold = (player.gold || 0) + Number(evt.goldGain);
          }
        }
        
        if (evt.type === 'mass_buff' && evt.playerId) {
          const player = gameState.players[evt.playerId];
          if (player?.board && evt.targetPositions && Array.isArray(evt.targetPositions)) {
            const atkGain = Number(evt.atkGain) || 0;
            const hpGain = Number(evt.hpGain) || 0;
            for (const pos of evt.targetPositions) {
              const card = player.board[pos];
              if (card && card.card_id) {
                if (atkGain !== 0) {
                  card.atk = (Number(card.atk) || 0) + atkGain;
                  if (card.baseAtk !== undefined) card.baseAtk = (card.baseAtk || 0) + atkGain;
                }
                if (hpGain !== 0) {
                  card.hp = (Number(card.hp) || 0) + hpGain;
                  if (card.baseHp !== undefined) card.baseHp = (card.baseHp || 0) + hpGain;
                }
              }
            }
          }
        }
      }

      if (pairOptions.phantom && phantomOriginalState && gameState.players[pairOptions.phantomOwner]) {
        gameState.players[pairOptions.phantomOwner] = phantomOriginalState;
      }

      if (!pairOptions.isMirror) {
        const wId = result.winner === 1 ? p1 : p2;
        const lId = result.winner === 1 ? p2 : p1;
        
        if (pairOptions.phantom) {
          const soloPlayer = gameState.players[p1];
          if (lId === p1 && soloPlayer && !soloPlayer.isEliminated) {
            const winnerPlayer = gameState.players[wId];
            const shopDmg = winnerPlayer?.shopLevel || 1;
            const survBoard = result.winner === 1 ? result.rightBoard : result.leftBoard;
            const cardDmg = calculateSurvivalDamage(survBoard);
            soloPlayer.health = Math.max(0, Number(soloPlayer.health || 0) - (shopDmg + cardDmg));
            if (soloPlayer.health <= 0) {
              soloPlayer.isEliminated = true;
              soloPlayer.eliminatedAt = soloPlayer.eliminatedAt || now;
            }
          }
        } else {
          const winner = gameState.players[wId];
          const loser = gameState.players[lId];
          if (loser && !loser.isEliminated) {
            const shopDmg = winner?.shopLevel || 1;
            const survBoard = result.winner === 1 ? result.leftBoard : result.rightBoard;
            const cardDmg = calculateSurvivalDamage(survBoard);
            loser.health = Math.max(0, Number(loser.health || 0) - (shopDmg + cardDmg));
            if (loser.health <= 0) {
              loser.isEliminated = true;
              loser.eliminatedAt = loser.eliminatedAt || now;
            }
          }
        }
      }
    }

    const rankings = calculateRankings(gameState.players);
    for (const [pid, rank] of Object.entries(rankings)) {
      if (gameState.players[pid]) gameState.players[pid].rank = rank;
    }

    for (const pid in gameState.players) {
      const board = gameState.players[pid].board;
      if (board && Array.isArray(board)) {
        for (let i = 0; i < board.length; i++) {
          const slot = board[i];
          if (slot && typeof slot === 'object') {
            slot.tempAtk = 0;
            slot.tempHp = 0;
            slot.tempShield = 0;
          }
        }
      }
    }

    gameState.lastSettledRound = currentRound;
    gameState.battleAnimStartTime = now;
    gameState.buffEvents = buffEvents;
    gameState.combatResults = combatResults;
    gameState.shopBonus = gameState.shopBonus || { atk:0, hp:0 };

    for (const pid in gameState.players) {
      const newPlayerState = gameState.players[pid];
      const { error: updateErr } = await supabase
        .from('game_states')
        .update({ state: newPlayerState })
        .eq('room_id', roomId)
        .eq('user_id', pid);
      if (updateErr) console.error(`[结算] 更新玩家 ${pid} 失败: ${updateErr.message}`);
    }

    const newGlobalState = {
      round: gameState.round,
      phase: gameState.phase || 'prepare',
      gameStartTime: gameState.gameStartTime || now,
      phaseStartTime: gameState.phaseStartTime || now,
      phaseEndTime: gameState.phaseEndTime || null,
      battlePairs: gameState.battlePairs,
      lastSettledRound: currentRound,
      battleAnimStartTime: now,
      buffEvents,
      combatResults,
      shopBonus: gameState.shopBonus || { atk:0, hp:0 },
    };

    await supabase
      .from('game_states')
      .update({ state: newGlobalState })
      .eq('room_id', roomId)
      .eq('user_id', GLOBAL_USER_ID);

    await supabase.rpc('unlock_settle_battle', { p_room_id: roomId, p_round: currentRound });

    return new Response(JSON.stringify({
      success: true,
      round: currentRound,
      animStartTime: now,
      updatedPlayers: gameState.players,
      buffEvents,
      combatResults,
      slayCounts: Object.fromEntries(
        Object.entries(gameState.players).map(([id, p]) => [id, (p as any).slayCount])
      ),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('结算错误:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

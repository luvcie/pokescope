import { Dex } from '@pkmn/sim';
import { bold } from '../ansi';

export function cmdStatcalc(args: string[]): void {
  if (!args.length) {
    console.log('Usage: statcalc [level] [pokemon or base stat] [stat] [ivs] [evs] [nature] [modifier]');
    console.log('  e.g. statcalc lv50 garchomp spe 252+ scarf');
    console.log('       statcalc 100 252ev positive +1');
    console.log('       statcalc lc 45 atk uninvested');
    return;
  }

  const targets = args.join(' ').split(' ');

  let lvlSet = false, natureSet = false, ivSet = false, evSet = false;
  let baseSet = false, modSet = false, realSet = false;
  let pokemon: Record<string, number> | null = null;
  let useStat = '';
  let level = 100, nature = 1.0, iv = 31, ev = 252, baseStat = -1;
  let modifier = 0, positiveMod = true, realStat = 0, calcHP = false;

  for (const arg of targets) {
    const lc = arg.toLowerCase();

    if (!lvlSet) {
      if (lc === 'lc') { level = 5; lvlSet = true; continue; }
      if (lc === 'vgc') { level = 50; lvlSet = true; continue; }
      if (lc.startsWith('lv') || lc.startsWith('level')) {
        level = parseInt(arg.replace(/\D/g, ''));
        if (isNaN(level) || level < 1 || level > 9999) {
          console.error('invalid level: ' + arg); return;
        }
        lvlSet = true; continue;
      }
    }

    if (!useStat) {
      if (lc === 'hp' || lc === 'hitpoints') { calcHP = true; useStat = 'hp'; continue; }
      if (lc === 'atk' || lc === 'attack') { useStat = 'atk'; continue; }
      if (lc === 'def' || lc === 'defense') { useStat = 'def'; continue; }
      if (lc === 'spa') { useStat = 'spa'; continue; }
      if (lc === 'spd' || lc === 'sdef') { useStat = 'spd'; continue; }
      if (lc === 'spe' || lc === 'speed') { useStat = 'spe'; continue; }
    }

    if (!natureSet) {
      if (lc === 'boosting' || lc === 'positive') { nature = 1.1; natureSet = true; continue; }
      if (lc === 'negative' || lc === 'inhibiting') { nature = 0.9; natureSet = true; continue; }
      if (lc === 'neutral') { continue; }
    }

    if (!pokemon) {
      const p = Dex.species.get(arg);
      if (p.exists) { pokemon = p.baseStats; baseSet = true; continue; }
    }

    if (!ivSet && (lc.endsWith('iv') || lc.endsWith('ivs'))) {
      iv = parseInt(arg);
      if (isNaN(iv)) { console.error('invalid ivs: ' + arg); return; }
      ivSet = true; continue;
    }

    if (!evSet) {
      if (lc === 'invested' || lc === 'max') {
        if (lc === 'max' && !natureSet) { nature = 1.1; natureSet = true; }
        evSet = true; continue;
      }
      if (lc === 'uninvested') { ev = 0; evSet = true; continue; }
      if (lc.endsWith('ev') || lc.endsWith('evs') || lc.endsWith('+') || lc.endsWith('-')) {
        ev = parseInt(arg);
        if (isNaN(ev) || ev < 0 || ev > 255) { console.error('invalid evs: ' + arg); return; }
        if (!natureSet) {
          if (arg.includes('+')) { nature = 1.1; natureSet = true; }
          else if (arg.includes('-')) { nature = 0.9; natureSet = true; }
        }
        evSet = true; continue;
      }
    }

    if (!modSet) {
      if (['band', 'scarf', 'specs'].includes(lc)) { modifier = 1; modSet = true; }
      else if (arg.startsWith('+')) { modifier = parseInt(arg.charAt(1)); modSet = true; }
      else if (arg.startsWith('-')) { positiveMod = false; modifier = parseInt(arg.charAt(1)); modSet = true; }
      if (isNaN(modifier) || modifier > 6) { console.error('invalid modifier: ' + arg); return; }
      if (modSet) continue;
    }

    const tempStat = parseInt(arg);
    if (!realSet && lc.endsWith('real')) {
      realStat = tempStat;
      if (isNaN(realStat) || realStat < 0) { console.error('invalid real stat: ' + arg); return; }
      realSet = true; continue;
    }
    if (!isNaN(tempStat) && !baseSet && tempStat > 0 && tempStat < 256) {
      baseStat = tempStat; baseSet = true;
    }
  }

  if (pokemon) {
    if (useStat) { baseStat = pokemon[useStat]; }
    else { console.error('no stat specified (e.g. atk, spe, hp)'); return; }
  }

  if (realSet) {
    if (!baseSet) {
      if (calcHP) {
        baseStat = Math.ceil((100 * realStat - 10 - level * (Math.floor(ev / 4) + iv + 100)) / (2 * level));
      } else {
        realStat *= positiveMod ? 2 / (2 + modifier) : (2 + modifier) / 2;
        baseStat = Math.ceil((100 * Math.ceil(realStat) - nature * (level * (Math.floor(ev / 4) + iv) + 500)) / (2 * level * nature));
      }
      if (baseStat < 0) { console.error('no valid base stat possible with those parameters'); return; }
    } else if (!evSet) {
      if (calcHP) {
        ev = Math.ceil(100 * (realStat - 10) / level - 2 * (baseStat + 50));
      } else {
        realStat *= positiveMod ? 2 / (2 + modifier) : (2 + modifier) / 2;
        ev = Math.ceil(-1 * (2 * (nature * (baseStat * level + 250) - 50 * Math.ceil(realStat))) / (level * nature));
      }
      ev -= 31;
      if (ev < 0) iv += ev;
      ev *= 4;
      if (iv < 0 || ev > 255) { console.error('no valid ev/iv combo possible, maybe try a different nature'); return; }
    } else {
      console.error('too many parameters, nothing to calculate'); return;
    }
  } else if (baseStat < 0) {
    console.error('no base stat found'); return;
  }

  let output: number;
  if (calcHP) {
    output = Math.floor(((iv + (2 * baseStat) + Math.floor(ev / 4) + 100) * level) / 100) + 10;
  } else {
    output = Math.floor(nature * Math.floor((((iv + (2 * baseStat) + Math.floor(ev / 4)) * level) / 100) + 5));
    output = Math.floor(output * (positiveMod ? (2 + modifier) / 2 : 2 / (2 + modifier)));
  }

  const natStr = nature === 1.1 ? '+' : nature === 0.9 ? '-' : '';
  const modStr = modifier > 0 && !calcHP ? ` at ${positiveMod ? '+' : '-'}${modifier}` : '';
  console.log(`\nBase ${baseStat}${calcHP ? ' HP' : ''} | Lv${level} | ${iv} IVs | ${ev}${natStr} EVs${modStr}: ${bold(String(Math.floor(output)))}\n`);
}

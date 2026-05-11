import { Dex } from 'pokemon-showdown';
import { bold, dim } from '../ansi';
import { cmdData } from './data';

export function cmdItemsearch(args: string[]): void {
  if (!args.length) {
    console.log('Usage: itemsearch <description words>');
    console.log('  e.g. itemsearch raises speed in sandstorm');
    console.log('       itemsearch restores hp');
    console.log('       itemsearch fling 90');
    console.log('       itemsearch natural gift fire');
    return;
  }

  let raw = args.join(' ').toLowerCase().replace(/-/g, ' ').replace(/[^a-z0-9.\s/]/g, '');

  let gen = 0;
  let maxGen = 0;
  raw = raw.replace(/\bmaxgen\s*([1-9])\b/g, (_, n) => { maxGen = parseInt(n); return ''; });
  raw = raw.replace(/\bgen\s*([1-9])\b/g, (_, n) => { gen = parseInt(n); return ''; });

  let showAll = false;
  raw = raw.replace(/\ball\b/g, () => { showAll = true; return ''; });

  const dex = gen ? Dex.mod(`gen${gen}` as any) : maxGen ? Dex.mod(`gen${maxGen}` as any) : Dex;

  const STOP = new Set(['a','an','is','it','its','the','that','which','user','holder','holders']);

  const SYNONYMS: Record<string, string> = {
    opponent: 'attacker', flung: 'fling',
    heal: 'restores', heals: 'restores', recovers: 'restores',
    boost: 'raises', boosts: 'raises',
    weakens: 'halves', more: 'increases',
    burns: 'burn', poisons: 'poison',
    spatk: 'specialattack', spa: 'specialattack',
    spd: 'specialdefense', spdef: 'specialdefense',
  };

  const rawWords = raw.trim().split(/\s+/).filter(Boolean);
  const searchedWords: string[] = [];

  for (let i = 0; i < rawWords.length; i++) {
    let w = rawWords[i];
    if (isNaN(parseFloat(w))) w = w.replace(/\.$/, '');
    if (!w) continue;
    if (STOP.has(w)) continue;
    if (SYNONYMS[w]) { w = SYNONYMS[w]; }
    else if (w === 'super' && rawWords[i + 1] === 'effective') { w = 'supereffective'; }
    else if (w === 'special' && rawWords[i + 1] === 'defense') { w = 'specialdefense'; }
    else if (w === 'special' && rawWords[i + 1] === 'attack') { w = 'specialattack'; }
    else if ((w === 'atk' || w === 'attack') && ['sp','special'].includes(rawWords[i - 1] ?? '')) { continue; }
    else if ((w === 'def' || w === 'defense') && ['sp','special'].includes(rawWords[i - 1] ?? '')) { continue; }
    else if (/^x[\d.]+$/.test(w)) { w = w.slice(1) + 'x'; }
    if (!w || searchedWords.includes(w)) continue;
    searchedWords.push(w);
  }

  if (!searchedWords.length && !gen && !maxGen) {
    console.error('No distinguishing words. Try a more specific search.');
    return;
  }

  let foundItems: string[] = [];

  if (searchedWords.includes('fling')) {
    let bp = 0;
    let effect = '';
    for (let w of searchedWords) {
      if (w === 'fling') continue;
      const statusMap: Record<string, string> = {
        burn: 'brn', brn: 'brn', paralyze: 'par', par: 'par',
        poison: 'psn', psn: 'psn', toxic: 'tox', tox: 'tox',
        badly: 'tox', flinch: 'flinch', flinches: 'flinch',
      };
      if (statusMap[w]) { effect = statusMap[w]; continue; }
      if (w.endsWith('bp')) w = w.slice(0, -2);
      const n = parseInt(w);
      if (!isNaN(n)) bp = n;
    }
    for (const item of dex.items.all()) {
      if (!item.fling) continue;
      if (/^(tm|tr)\d+$/.test(item.id)) continue;
      if (bp && item.fling.basePower !== bp) continue;
      if (effect && item.fling.status !== effect && (item.fling as any).volatileStatus !== effect) continue;
      foundItems.push(item.name);
    }

  } else if (raw.includes('natural gift') || raw.includes('naturalgift')) {
    let bp = 0;
    let type = '';
    for (let w of searchedWords) {
      if (w === 'natural' || w === 'gift' || w === 'naturalgift') continue;
      if (dex.types.get(w).exists) { type = dex.types.get(w).name; continue; }
      if (w.endsWith('bp')) w = w.slice(0, -2);
      const n = parseInt(w);
      if (!isNaN(n)) bp = n;
    }
    for (const item of dex.items.all()) {
      if (!item.isBerry || !item.naturalGift) continue;
      if (bp && item.naturalGift.basePower !== bp) continue;
      if (type && item.naturalGift.type !== type) continue;
      foundItems.push(item.name);
    }

  } else {
    const searchingForTMTR = searchedWords.some(w => w === 'tm' || w === 'tr');
    let bestScore = 0;
    for (const item of dex.items.all()) {
      if (item.isNonstandard === 'CAP' || item.isNonstandard === 'LGPE' || item.isNonstandard === 'Future') continue;
      if (/^(tm|tr)\d+$/.test(item.id) && !searchingForTMTR) continue;

      let desc = item.desc || item.shortDesc || '';
      if (/[1-9.]+x/.test(desc)) desc += ' increases';
      if (item.isBerry) desc += ' berry';
      desc = desc.replace(/super[-\s]effective/g, 'supereffective');
      if (/can evolve/i.test(desc)) desc += ' not fully evolved';
      if (/cannot evolve/i.test(desc)) desc += ' fully evolved not cannot';
      const descWords = desc.toLowerCase().replace(/-/g, ' ').replace(/[^a-z0-9\s/]/g, '').split(/\s+/);

      const nameWords = item.name.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
      const allWords = new Set([...descWords, ...nameWords]);

      let score = 0;
      for (const w of searchedWords) {
        if (w === 'specialattack') {
          const idx = descWords.indexOf('sp');
          if (idx >= 0 && descWords[idx + 1] === 'atk') score++;
        } else if (w === 'specialdefense') {
          const idx = descWords.indexOf('sp');
          if (idx >= 0 && descWords[idx + 1] === 'def') score++;
        } else if (allWords.has(w)) {
          score++;
        }
      }

      const threshold = searchedWords.length * 3 / 5;
      if (score >= threshold) {
        if (score > bestScore) { foundItems = [item.name]; bestScore = score; }
        else if (score === bestScore) { foundItems.push(item.name); }
      }
    }
  }

  foundItems.sort();

  if (foundItems.length === 0) {
    console.log('\nNo items found. Try a more general search.\n');
    return;
  }

  if (foundItems.length === 1) {
    cmdData([foundItems[0]]);
    return;
  }

  const total = foundItems.length;
  const display = showAll ? foundItems : foundItems.slice(0, 100);
  console.log(`\n${display.map(n => bold(n)).join(', ')}`);
  if (!showAll && total > 100) {
    console.log(dim(`...and ${total - 100} more. Use 'all' to see everything.`));
  }
  const genLabel = gen ? dim(` [gen${gen}]`) : maxGen ? dim(` [maxgen${maxGen}]`) : '';
  console.log(dim(`${total} result${total !== 1 ? 's' : ''}${genLabel}`));
  console.log();
}

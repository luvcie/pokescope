import { Dex, TeamValidator } from 'pokemon-showdown';
import type { Species } from 'pokemon-showdown/dist/sim/dex-species';
import { bold, dim } from '../ansi';
import { parseGenPrefix } from '../gen';
import { splitFilterTokens } from '../filter-tokens';
import { calcTypeEff } from '../type-eff';
import { cmdData } from './data';

type Direction = 'less' | 'greater' | 'equal';

interface DexSearchGroup {
  types: Record<string, boolean>;
  abilities: Record<string, boolean>;
  tiers: Record<string, boolean>;
  doublesTiers: Record<string, boolean>;
  colors: Record<string, boolean>;
  eggGroups: Record<string, boolean>;
  gens: Record<string, boolean>;
  moves: Record<string, boolean>;
  resists: Record<string, boolean>;
  weak: Record<string, boolean>;
  formes: Record<string, boolean>;
  stats: Record<string, Record<Direction, Record<string, number | boolean>>>;
  flags: Record<string, boolean>;
  skip: boolean;
}

export function cmdDexsearch(args: string[], poolOnly = false): Species[] | void {
  if (!args.length) {
    if (!poolOnly) console.log('Usage: dexsearch [gen] <filter>[, filter, ...]');
    return;
  }

  const SINGLES_TIER_ORDER: Record<string, number> = {
    lc: 0, nfe: 1, zu: 2, zubl: 3, pu: 4, publ: 5, nu: 6, nubl: 7, ru: 8, rubl: 9,
    uu: 10, uubl: 11, ou: 12, uber: 13, ubers: 13, ag: 14, anythinggoes: 14,
  };

  const SINGLES_TIER_NAMES: Record<string, string> = {
    lc: 'LC', nfe: 'NFE', zu: 'ZU', zubl: 'ZUBL', pu: 'PU', publ: 'PUBL',
    nu: 'NU', nubl: 'NUBL', ru: 'RU', rubl: 'RUBL', uu: 'UU', uubl: 'UUBL',
    ou: 'OU', uber: 'Uber', ubers: 'Uber', ag: 'AG', anythinggoes: 'AG',
  };

  const DOUBLES_TIER_NAMES: Record<string, string> = {
    dou: 'DOU', doublesou: 'DOU', dbl: 'DBL', doublesuubl: 'DBL',
    duu: 'DUU', doublesuu: 'DUU', duber: 'DUber', doublesuber: 'DUber',
    dnu: 'DNU',
  };

  const COLORS = new Set(['green', 'red', 'blue', 'white', 'brown', 'yellow', 'purple', 'pink', 'gray', 'black']);

  const EGG_GROUP_ALIASES: Record<string, string> = {
    'humanlike': 'Human-Like', 'human-like': 'Human-Like',
    'water1': 'Water 1', 'water2': 'Water 2', 'water3': 'Water 3',
    'amorphous': 'Amorphous', 'bug': 'Bug', 'ditto': 'Ditto', 'dragon': 'Dragon',
    'fairy': 'Fairy', 'field': 'Field', 'flying': 'Flying', 'grass': 'Grass',
    'mineral': 'Mineral', 'monster': 'Monster', 'undiscovered': 'Undiscovered',
  };

  const STAT_ALIASES: Record<string, string> = {
    attack: 'atk', defense: 'def',
    specialattack: 'spa', spatk: 'spa', spc: 'spa', special: 'spa',
    specialdefense: 'spd', spdef: 'spd',
    speed: 'spe',
    wt: 'weight', ht: 'height',
    generation: 'gen',
  };

  const SORTABLE_STATS = new Set(['hp', 'atk', 'def', 'spa', 'spd', 'spe', 'bst', 'weight', 'height', 'gen', 'num', 'tier', 'dtier']);

  const RECOVERY_MOVES = new Set([
    'healorder', 'junglehealing', 'lifedew', 'milkdrink', 'moonlight', 'morningsun',
    'recover', 'roost', 'shoreup', 'slackoff', 'softboiled', 'strengthsap', 'synthesis', 'wish',
  ]);

  const raw = args.join(' ');
  const { genMod: genModOrNull, rest } = parseGenPrefix(raw);
  const genMod = genModOrNull ?? 'gen9';
  const dex = Dex.mod(genMod);

  let showAll = false;
  let natdexSearch = false;
  let unreleasedSearch = false;
  let capSearch = false;
  let gmaxSearch = false;
  let tierWasSearched = false;
  let monoSearch = false;
  let megaSearch = false;
  let feSearch = false;
  let restrictedSearch = false;
  let recoverySearch = false;
  let prioritySearch = false;
  let pivotSearch = false;
  let sortStat = '';
  let sortDir: 'asc' | 'desc' = 'asc';

  const filterGroups: DexSearchGroup[][] = [];

  const makeGroup = (): DexSearchGroup => ({
    types: {}, abilities: {}, tiers: {}, doublesTiers: {}, colors: {}, eggGroups: {},
    gens: {}, moves: {}, resists: {}, weak: {}, formes: {}, stats: {}, flags: {}, skip: false,
  });

  const commaGroups = splitFilterTokens(rest);

  for (const commaGroup of commaGroups) {
    const alternatives = commaGroup.split('|').map(s => s.trim()).filter(Boolean).slice(0, 3);
    const groups: DexSearchGroup[] = alternatives.map(() => makeGroup());

    for (let ai = 0; ai < alternatives.length; ai++) {
      const alt = alternatives[ai];
      const grp = groups[ai];
      const lc = alt.toLowerCase().replace(/\s+/g, '');

      if (lc === 'all') { showAll = true; continue; }
      if (lc === 'natdex') { natdexSearch = true; continue; }
      if (lc === 'unreleased') { unreleasedSearch = true; continue; }

      let negate = false;
      let token = alt.trim();
      if (token.startsWith('!')) {
        negate = true;
        token = token.slice(1).trim();
      }
      const tlc = token.toLowerCase();
      const tlcNoSpace = tlc.replace(/\s+/g, '');

      if (tlcNoSpace === 'gmax' || tlcNoSpace === 'gigantamax') {
        if (!negate) { gmaxSearch = true; } else { grp.flags['gmax'] = false; }
        continue;
      }
      if (tlcNoSpace === 'monotype' || tlcNoSpace === 'mono') {
        grp.flags['monotype'] = !negate;
        if (!negate) monoSearch = true;
        continue;
      }
      if (tlcNoSpace === 'mega') {
        grp.flags['mega'] = !negate;
        if (!negate) megaSearch = true;
        continue;
      }
      if (tlcNoSpace === 'fullyevolved' || tlcNoSpace === 'fe') {
        grp.flags['fe'] = !negate;
        if (!negate) feSearch = true;
        continue;
      }
      if (tlcNoSpace === 'restrictedlegendary' || tlcNoSpace === 'restricted') {
        grp.flags['restricted'] = !negate;
        if (!negate) restrictedSearch = true;
        continue;
      }
      if (tlcNoSpace === 'recovery') {
        grp.flags['recovery'] = !negate;
        if (!negate) recoverySearch = true;
        continue;
      }
      if (tlcNoSpace === 'priority') {
        grp.flags['priority'] = !negate;
        if (!negate) prioritySearch = true;
        continue;
      }
      if (tlcNoSpace === 'pivot') {
        grp.flags['pivot'] = !negate;
        if (!negate) pivotSearch = true;
        continue;
      }

      const sortMatch = tlc.match(/^([a-z]+)\s+(asc|desc)$/);
      if (sortMatch) {
        const sStat = STAT_ALIASES[sortMatch[1].replace(/\s/g, '')] ?? sortMatch[1].replace(/\s/g, '');
        if (SORTABLE_STATS.has(sStat)) {
          sortStat = sStat;
          sortDir = sortMatch[2] as 'asc' | 'desc';
          continue;
        }
      }

      const leftStatMatch = tlc.match(/^([a-z]+(?:\s*[a-z]*)?)\s*(>=|<=|!=|>|<|=)\s*(.+)$/);
      const rightStatMatch = tlc.match(/^(-?[\d.]+)\s*(>=|<=|!=|>|<)\s*([a-z]+)$/);

      if (leftStatMatch) {
        const rawStat = leftStatMatch[1].trim().replace(/\s+/g, '');
        const op = leftStatMatch[2];
        const valStr = leftStatMatch[3].trim();
        const statName = STAT_ALIASES[rawStat] ?? rawStat;

        if (statName === 'tier') {
          const tierAlias = valStr.replace(/\s+/g, '').toLowerCase();
          const tierOrd = SINGLES_TIER_ORDER[tierAlias];
          if (tierOrd !== undefined) {
            tierWasSearched = true;
            grp.stats['tier'] = grp.stats['tier'] ?? {};
            let dir: Direction;
            if (op === '>' || op === '>=') dir = 'greater';
            else if (op === '<' || op === '<=') dir = 'less';
            else dir = 'equal';
            grp.stats['tier'][dir] = grp.stats['tier'][dir] ?? {};
            (grp.stats['tier'][dir] as Record<string, number | boolean>)[tierAlias] = negate ? false : tierOrd;
            if (op === '>=' || op === '<=') {
              grp.stats['tier']['equal'] = grp.stats['tier']['equal'] ?? {};
              (grp.stats['tier']['equal'] as Record<string, number | boolean>)[tierAlias] = negate ? false : tierOrd;
            }
            continue;
          }
        }

        const otherStatName = STAT_ALIASES[valStr.replace(/\s+/g, '')] ?? valStr.replace(/\s+/g, '');
        const numVal = parseFloat(valStr);

        if (['hp','atk','def','spa','spd','spe','bst','weight','height','gen','num'].includes(statName)) {
          grp.stats[statName] = grp.stats[statName] ?? {};
          if (!isNaN(numVal)) {
            let dir: Direction;
            if (op === '>' || op === '>=') dir = 'greater';
            else if (op === '<' || op === '<=') dir = 'less';
            else dir = 'equal';
            grp.stats[statName][dir] = grp.stats[statName][dir] ?? {};
            (grp.stats[statName][dir] as Record<string, number | boolean>)['__val'] = negate ? false : numVal;
            if (op === '>=' || op === '<=') {
              grp.stats[statName]['equal'] = grp.stats[statName]['equal'] ?? {};
              (grp.stats[statName]['equal'] as Record<string, number | boolean>)['__val'] = negate ? false : numVal;
            }
            continue;
          } else if (['hp','atk','def','spa','spd','spe','bst','weight','height','gen','num'].includes(otherStatName)) {
            grp.stats[statName] = grp.stats[statName] ?? {};
            let dir: Direction;
            if (op === '>' || op === '>=') dir = 'greater';
            else if (op === '<' || op === '<=') dir = 'less';
            else dir = 'equal';
            grp.stats[statName][dir] = grp.stats[statName][dir] ?? {};
            (grp.stats[statName][dir] as Record<string, number | boolean>)['__stat'] = otherStatName as unknown as number;
            if (op === '>=' || op === '<=') {
              grp.stats[statName]['equal'] = grp.stats[statName]['equal'] ?? {};
              (grp.stats[statName]['equal'] as Record<string, number | boolean>)['__stat'] = otherStatName as unknown as number;
            }
            continue;
          }
        }
      }

      if (rightStatMatch) {
        const numVal = parseFloat(rightStatMatch[1]);
        const opRaw = rightStatMatch[2];
        const rawStat = rightStatMatch[3].replace(/\s+/g, '');
        const statName = STAT_ALIASES[rawStat] ?? rawStat;
        if (['hp','atk','def','spa','spd','spe','bst','weight','height','gen','num'].includes(statName)) {
          const op = opRaw === '<' ? '>' : opRaw === '<=' ? '>=' : opRaw === '>' ? '<' : opRaw === '>=' ? '<=' : opRaw;
          grp.stats[statName] = grp.stats[statName] ?? {};
          let dir: Direction;
          if (op === '>' || op === '>=') dir = 'greater';
          else if (op === '<' || op === '<=') dir = 'less';
          else dir = 'equal';
          grp.stats[statName][dir] = grp.stats[statName][dir] ?? {};
          (grp.stats[statName][dir] as Record<string, number | boolean>)['__val'] = negate ? false : numVal;
          if (op === '>=' || op === '<=') {
            grp.stats[statName]['equal'] = grp.stats[statName]['equal'] ?? {};
            (grp.stats[statName]['equal'] as Record<string, number | boolean>)['__val'] = negate ? false : numVal;
          }
          continue;
        }
      }

      const genNumMatch = tlcNoSpace.match(/^g(?:en)?([1-9])$/);
      if (genNumMatch) {
        grp.gens[genNumMatch[1]] = !negate;
        continue;
      }

      if (['alola', 'galar', 'hisui', 'paldea', 'primal', 'therian', 'totem'].includes(tlcNoSpace)) {
        grp.formes[tlcNoSpace] = !negate;
        continue;
      }

      const resistsMatch = tlc.match(/^resists?\s+(.+)$/);
      if (resistsMatch) {
        grp.resists[resistsMatch[1].trim()] = !negate;
        continue;
      }

      const weakMatch = tlc.match(/^weak(?:ness)?\s+(.+)$/i);
      if (weakMatch) {
        grp.weak[weakMatch[1].trim()] = !negate;
        continue;
      }

      const eggGroupSuffixMatch = tlc.match(/^(.+?)\s+group$/);
      if (eggGroupSuffixMatch) {
        const egName = eggGroupSuffixMatch[1].replace(/\s+/g, '').toLowerCase();
        const canonical = EGG_GROUP_ALIASES[egName];
        if (canonical) { grp.eggGroups[canonical] = !negate; continue; }
      }
      const eggGroupPrefixMatch = tlc.match(/^egg\s+group\s+(.+)$/);
      if (eggGroupPrefixMatch) {
        const egName = eggGroupPrefixMatch[1].replace(/\s+/g, '').toLowerCase();
        const canonical = EGG_GROUP_ALIASES[egName];
        if (canonical) { grp.eggGroups[canonical] = !negate; continue; }
      }

      if (COLORS.has(tlcNoSpace)) {
        grp.colors[tlcNoSpace.charAt(0).toUpperCase() + tlcNoSpace.slice(1)] = !negate;
        continue;
      }

      const dtier = DOUBLES_TIER_NAMES[tlcNoSpace];
      if (dtier) {
        tierWasSearched = true;
        grp.doublesTiers[dtier] = !negate;
        continue;
      }

      const stierCanon = SINGLES_TIER_NAMES[tlcNoSpace];
      if (stierCanon) {
        tierWasSearched = true;
        grp.tiers[stierCanon] = !negate;
        continue;
      }

      if (tlcNoSpace === 'cap' || tlcNoSpace === 'capnfe' || tlcNoSpace === 'caplc') {
        capSearch = true;
        const capTierMap: Record<string, string> = { cap: 'CAP', capnfe: 'CAP NFE', caplc: 'CAP LC' };
        grp.tiers[capTierMap[tlcNoSpace]] = !negate;
        tierWasSearched = true;
        continue;
      }

      const typeSuffixMatch = tlc.match(/^(.+?)\s+type$/);
      const typeToken = typeSuffixMatch ? typeSuffixMatch[1].trim() : tlc;
      const typeObj = dex.types.get(typeToken);
      if (typeObj.exists) {
        grp.types[typeObj.name] = !negate;
        continue;
      }

      const abilityObj = dex.abilities.get(token);
      if (abilityObj.exists) {
        grp.abilities[abilityObj.id] = !negate;
        continue;
      }

      const moveObj = dex.moves.get(token);
      if (moveObj.exists) {
        grp.moves[moveObj.id] = !negate;
        continue;
      }

      const egNoSpace = tlcNoSpace;
      const egCanonical = EGG_GROUP_ALIASES[egNoSpace];
      if (egCanonical) {
        grp.eggGroups[egCanonical] = !negate;
        continue;
      }

      if (tlcNoSpace === 'fullyevolved') { feSearch = true; continue; }
      if (tlcNoSpace === 'restrictedlegendary') { restrictedSearch = true; continue; }

      grp.skip = true;
      console.error(`Unrecognized filter: '${token}'`);
    }

    filterGroups.push(groups);
  }

  function getStat(species: Species, stat: string): number {
    if (stat === 'bst') return species.bst;
    if (stat === 'weight') return species.weighthg / 10;
    if (stat === 'height') return species.heightm;
    if (stat === 'gen') return species.gen;
    if (stat === 'num') return species.num;
    return species.baseStats[stat as 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'] ?? 0;
  }

  const TIER_STRING_ORDER: Record<string, number> = {
    LC: 0, NFE: 1, ZU: 2, ZUBL: 3, PU: 4, PUBL: 5, NU: 6, NUBL: 7, RU: 8, RUBL: 9,
    UU: 10, UUBL: 11, OU: 12, Uber: 13, AG: 14,
  };

  const validator = TeamValidator.get(`${genMod}ou`);

  const pool: Species[] = [];
  for (const species of dex.species.all()) {
    if (species.gen > dex.gen) continue;
    const effectiveTier = natdexSearch ? species.natDexTier : species.tier;
    if (natdexSearch) {
      if (effectiveTier === 'Illegal') continue;
    } else {
      if (species.tier === 'Illegal') continue;
      if (!unreleasedSearch && species.isNonstandard === 'Future') continue;
      if (!unreleasedSearch && species.isNonstandard === 'Unobtainable') continue;
      if (!capSearch && (species.isNonstandard === 'CAP' || (species.tier as string).startsWith('CAP'))) continue;
      if (species.isNonstandard === 'Gigantamax' && !gmaxSearch && !tierWasSearched) continue;
      if (species.isNonstandard === 'Past') continue;
      if (species.isNonstandard === 'LGPE') continue;
    }
    pool.push(species);
  }

  function getAttackingType(target: string): { source: ReturnType<typeof dex.moves.get> | string; typeName: string } | null {
    const moveObj = dex.moves.get(target);
    if (moveObj.exists) return { source: moveObj, typeName: moveObj.type };
    const typeObj = dex.types.get(target);
    if (typeObj.exists) return { source: typeObj.name, typeName: typeObj.name };
    return null;
  }

  function matchesOneGroup(species: Species, grp: DexSearchGroup): boolean {
    if (grp.skip) return true;
    const effectiveTier = natdexSearch ? species.natDexTier : species.tier;

    for (const [typeName, want] of Object.entries(grp.types)) {
      if (species.types.includes(typeName) !== want) return false;
    }
    for (const [abilId, want] of Object.entries(grp.abilities)) {
      const ab = species.abilities;
      const has = Object.values(ab).some(a => a && dex.abilities.get(a).id === abilId);
      if (has !== want) return false;
    }
    for (const [tierName, want] of Object.entries(grp.tiers)) {
      if ((effectiveTier === tierName) !== want) return false;
    }
    for (const [dtierName, want] of Object.entries(grp.doublesTiers)) {
      if ((species.doublesTier === dtierName) !== want) return false;
    }
    for (const [colorName, want] of Object.entries(grp.colors)) {
      if ((species.color === colorName) !== want) return false;
    }
    for (const [egName, want] of Object.entries(grp.eggGroups)) {
      if (species.eggGroups.includes(egName) !== want) return false;
    }
    for (const [genNum, want] of Object.entries(grp.gens)) {
      if ((species.gen === parseInt(genNum)) !== want) return false;
    }
    for (const [formeName, want] of Object.entries(grp.formes)) {
      if (species.forme.toLowerCase().includes(formeName) !== want) return false;
    }
    for (const [moveId, want] of Object.entries(grp.moves)) {
      const moveObj = dex.moves.get(moveId);
      if (!moveObj.exists) { if (want) return false; break; }
      const canLearn = !validator.checkCanLearn(moveObj, species, validator.allSources(species));
      if (canLearn !== want) return false;
    }
    for (const [resistTarget, want] of Object.entries(grp.resists)) {
      const atk = getAttackingType(resistTarget);
      if (!atk) { if (want) return false; break; }
      const eff = calcTypeEff(dex, atk.source, species.types);
      const resisted = eff === 0 || Math.log2(eff) < 0;
      if (resisted !== want) return false;
    }
    for (const [weakTarget, want] of Object.entries(grp.weak)) {
      const atk = getAttackingType(weakTarget);
      if (!atk) { if (want) return false; break; }
      const eff = calcTypeEff(dex, atk.source, species.types);
      const isWeak = eff !== 0 && Math.log2(eff) >= 1;
      if (isWeak !== want) return false;
    }

    for (const [statName, dirMap] of Object.entries(grp.stats)) {
      if (statName === 'tier') {
        const tierOrd = TIER_STRING_ORDER[effectiveTier as string] ?? -1;
        let anyDirPassed = false;
        for (const [dir, valMap] of Object.entries(dirMap)) {
          for (const [, val] of Object.entries(valMap as Record<string, number | boolean>)) {
            if (typeof val !== 'number') continue;
            if (dir === 'greater' && tierOrd > val) anyDirPassed = true;
            else if (dir === 'less' && tierOrd < val) anyDirPassed = true;
            else if (dir === 'equal' && tierOrd === val) anyDirPassed = true;
          }
        }
        if (!anyDirPassed) return false;
      } else {
        const sv = getStat(species, statName);
        let anyDirPassed = false;
        for (const [dir, valMap] of Object.entries(dirMap)) {
          let dirPassed = true;
          for (const [key, val] of Object.entries(valMap as Record<string, number | boolean | string>)) {
            const compareVal = key === '__stat' ? getStat(species, val as string)
              : typeof val === 'number' ? val : null;
            if (compareVal === null) continue;
            if (dir === 'greater' && !(sv > compareVal)) { dirPassed = false; break; }
            else if (dir === 'less' && !(sv < compareVal)) { dirPassed = false; break; }
            else if (dir === 'equal' && sv !== compareVal) { dirPassed = false; break; }
          }
          if (dirPassed) { anyDirPassed = true; break; }
        }
        if (!anyDirPassed) return false;
      }
    }

    if ('monotype' in grp.flags && (species.types.length === 1) !== grp.flags['monotype']) return false;
    if ('mega' in grp.flags && species.name.includes('-Mega') !== grp.flags['mega']) return false;
    if ('gmax' in grp.flags && (species.isNonstandard === 'Gigantamax') !== grp.flags['gmax']) return false;
    if ('fe' in grp.flags && (!species.nfe) !== grp.flags['fe']) return false;
    if ('restricted' in grp.flags && species.tags.includes('Restricted Legendary') !== grp.flags['restricted']) return false;

    return true;
  }

  function matchesFilters(species: Species): boolean {
    for (const orGroups of filterGroups) {
      if (!orGroups.some(grp => matchesOneGroup(species, grp))) return false;
    }
    return true;
  }

  let results = pool.filter(species => {
    if (monoSearch && species.types.length !== 1) return false;
    if (megaSearch && !species.name.includes('-Mega')) return false;
    if (gmaxSearch && species.isNonstandard !== 'Gigantamax') return false;
    if (feSearch && species.nfe) return false;
    if (restrictedSearch && !species.tags.includes('Restricted Legendary')) return false;
    if (recoverySearch) {
      const allSrc = validator.allSources(species);
      const hasRecovery = [...RECOVERY_MOVES].some(mid => {
        const mv = dex.moves.get(mid);
        return mv.exists && !validator.checkCanLearn(mv, species, allSrc);
      });
      if (!hasRecovery) return false;
    }
    if (prioritySearch) {
      let hasPriority = false;
      for (const move of dex.moves.all()) {
        if (move.priority <= 0) continue;
        if (move.category === 'Status') continue;
        if (move.id === 'bide') continue;
        const allSrc = validator.allSources(species);
        if (!validator.checkCanLearn(move, species, allSrc)) { hasPriority = true; break; }
      }
      if (!hasPriority) return false;
    }
    if (pivotSearch) {
      let hasPivot = false;
      for (const move of dex.moves.all()) {
        if (!move.selfSwitch) continue;
        if (move.id === 'revivalblessing') continue;
        if (move.id === 'batonpass') continue;
        const allSrc = validator.allSources(species);
        if (!validator.checkCanLearn(move, species, allSrc)) { hasPivot = true; break; }
      }
      if (!hasPivot) return false;
    }
    return matchesFilters(species);
  });

  const seenBase = new Map<string, number>();
  function getSortVal(species: Species): number | string {
    if (sortStat === 'tier') return TIER_STRING_ORDER[species.tier] ?? -1;
    if (sortStat === 'dtier') return TIER_STRING_ORDER[species.doublesTier] ?? -1;
    if (sortStat) return getStat(species, sortStat);
    return 0;
  }

  results = results.filter(species => {
    const isRegionalForme = ['Alola', 'Galar', 'Hisui', 'Paldea'].some(r => species.forme.startsWith(r));
    if (species.forme.endsWith('Tera')) {
      const baseName = species.baseSpecies;
      const baseSv = seenBase.get(baseName.toLowerCase());
      if (baseSv !== undefined) {
        const thisVal = getSortVal(species);
        if (typeof thisVal === 'number' ? thisVal === baseSv : true) return false;
      }
      const thisVal = getSortVal(species);
      seenBase.set(species.name.toLowerCase(), typeof thisVal === 'number' ? thisVal : 0);
      return true;
    }
    if (species.baseSpecies === 'Ogerpon' && !species.forme.endsWith('Tera')) {
      seenBase.set(species.name.toLowerCase(), 0);
      return true;
    }
    if (isRegionalForme) {
      seenBase.set(species.name.toLowerCase(), 0);
      return true;
    }
    if (species.baseSpecies && species.baseSpecies !== species.name) {
      const baseName = species.baseSpecies;
      const baseSv = seenBase.get(baseName.toLowerCase());
      if (baseSv !== undefined) {
        const thisVal = getSortVal(species);
        const thisNum = typeof thisVal === 'number' ? thisVal : 0;
        if (thisNum === baseSv) return false;
      }
    }
    const thisVal = getSortVal(species);
    seenBase.set(species.name.toLowerCase(), typeof thisVal === 'number' ? thisVal : 0);
    return true;
  });

  if (sortStat) {
    results.sort((a, b) => {
      let av: number, bv: number;
      if (sortStat === 'tier') {
        av = TIER_STRING_ORDER[a.tier] ?? -1;
        bv = TIER_STRING_ORDER[b.tier] ?? -1;
      } else if (sortStat === 'dtier') {
        av = TIER_STRING_ORDER[a.doublesTier] ?? -1;
        bv = TIER_STRING_ORDER[b.doublesTier] ?? -1;
      } else {
        av = getStat(a, sortStat);
        bv = getStat(b, sortStat);
      }
      if (av !== bv) return sortDir === 'asc' ? av - bv : bv - av;
      return a.name.localeCompare(b.name);
    });
  } else {
    results.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (poolOnly) return results;

  const genLabel = genMod !== 'gen9' ? dim(` [${genMod}]`) : '';

  if (results.length === 0) {
    console.log(`\nNo Pokemon found.${genLabel}\n`);
    return;
  }

  if (results.length === 1) {
    cmdData([results[0].name]);
    return;
  }

  const total = results.length;
  const display = showAll ? results : results.slice(0, 100);
  const names = display.map(s => bold(s.name)).join(', ');

  console.log(`\n${names}`);
  if (!showAll && total > 100) {
    console.log(dim(`...and ${total - 100} more. Use 'all' to see everything.`));
  }
  console.log(dim(`${total} result${total !== 1 ? 's' : ''}${genLabel}`));
  console.log();

}

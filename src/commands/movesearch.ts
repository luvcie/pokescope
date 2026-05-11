import { Dex, TeamValidator } from 'pokemon-showdown';
import type { Move } from 'pokemon-showdown/dist/sim/dex-moves';
import { bold, dim } from '../ansi';
import { parseGenPrefix } from '../gen';
import { splitFilterTokens } from '../filter-tokens';
import { cmdData } from './data';

interface MoveSearchGroup {
  types: Record<string, boolean>;
  categories: Record<string, boolean>;
  flags: Record<string, boolean>;
  gens: Record<string, boolean>;
  props: Record<string, { less?: number; greater?: number; equal?: number }>;
  boosts: Record<string, boolean>;
  lowers: Record<string, boolean>;
  zboosts: Record<string, boolean>;
  status: Record<string, boolean>;
  volatileStatus: Record<string, boolean>;
  other: Record<string, boolean>;
  skip: boolean;
}

export function cmdMovesearch(args: string[], poolOnly = false): Move[] | void {
  if (!args.length) {
    if (!poolOnly) {
      console.log('Usage: movesearch [gen] <filter>[, filter, ...]');
      console.log('  e.g. movesearch fire, physical, bp > 80');
      console.log('       movesearch contact, priority+');
      console.log('       movesearch boosts atk, special');
      console.log('       movesearch garchomp');
    }
    return;
  }

  const ALL_FLAGS = new Set([
    'allyanim', 'bypasssub', 'bite', 'bullet', 'cantusetwice', 'charge', 'contact', 'dance',
    'defrost', 'distance', 'failcopycat', 'failencore', 'failinstruct', 'failmefirst', 'failmimic',
    'futuremove', 'gravity', 'heal', 'metronome', 'mirror', 'mustpressure', 'noassist', 'nonsky',
    'noparentalbond', 'nosketch', 'nosleeptalk', 'pledgecombo', 'powder', 'protect', 'pulse',
    'punch', 'recharge', 'reflectable', 'slicing', 'snatch', 'sound', 'wind',
    'secondary', 'highcrit', 'multihit', 'ohko', 'protection', 'zmove', 'maxmove', 'gmaxmove',
  ]);

  const STAT_BOOST_IDS = new Set(['hp', 'atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion']);

  const STAT_ALIASES_MS: Record<string, string> = {
    attack: 'atk', defense: 'def',
    specialattack: 'spa', spatk: 'spa',
    specialdefense: 'spd', spdef: 'spd',
    speed: 'spe', acc: 'accuracy', evasiveness: 'evasion',
  };

  const PROP_ALIASES: Record<string, string> = {
    basepower: 'basePower', bp: 'basePower', power: 'basePower',
    acc: 'accuracy', pp: 'pp', priority: 'priority',
  };

  const STATUS_ALIASES: Record<string, string> = {
    toxic: 'tox', poison: 'psn', burn: 'brn',
    paralyze: 'par', freeze: 'frz', sleep: 'slp',
    confuse: 'confusion', partiallytrap: 'partiallytrapped',
    flinche: 'flinch', trap: 'trapped', trapping: 'trapped',
  };

  const raw = args.join(' ');
  const { genMod: genModOrNull, rest } = parseGenPrefix(raw);
  const genMod = genModOrNull ?? 'gen9';
  const dex = Dex.mod(genMod);
  const validator = TeamValidator.get(`${genMod}ou`);

  let showAll = false;
  let natdexSearch = false;
  let sortProp = '';
  let sortDir: 'asc' | 'desc' = 'asc';

  const targetMons: { species: ReturnType<typeof dex.species.get>; exclude: boolean }[] = [];
  const filterGroups: MoveSearchGroup[][] = [];

  const makeGroup = (): MoveSearchGroup => ({
    types: {}, categories: {}, flags: {}, gens: {}, props: {},
    boosts: {}, lowers: {}, zboosts: {}, status: {}, volatileStatus: {}, other: {}, skip: false,
  });

  for (const commaGroup of splitFilterTokens(rest)) {
    const alternatives = commaGroup.split('|').map(s => s.trim()).filter(Boolean).slice(0, 3);
    const groups: MoveSearchGroup[] = alternatives.map(() => makeGroup());

    for (let ai = 0; ai < alternatives.length; ai++) {
      const alt = alternatives[ai];
      const grp = groups[ai];
      const lc = alt.toLowerCase().trim();
      const lcid = lc.replace(/\s+/g, '');

      if (lcid === 'all') { showAll = true; grp.skip = true; continue; }
      if (lcid === 'natdex') { natdexSearch = true; grp.skip = true; continue; }

      let negate = false;
      let token = alt.trim();
      if (token.startsWith('!')) { negate = true; token = token.slice(1).trim(); }
      const tlc = token.toLowerCase().trim();
      const tlcid = tlc.replace(/\s+/g, '');

      const typeToken = tlc.endsWith(' type') ? tlc.slice(0, -5).trim() : tlc;
      const typeObj = dex.types.get(typeToken);
      if (typeObj.exists) {
        grp.types[typeObj.name] = !negate;
        continue;
      }

      if (['physical', 'special', 'status'].includes(tlcid)) {
        const cat = tlcid.charAt(0).toUpperCase() + tlcid.slice(1);
        grp.categories[cat] = !negate;
        continue;
      }

      const sortMatch = tlc.match(/^(bp|basepower|power|accuracy|acc|pp|priority)\s+(asc|desc)$/);
      if (sortMatch) {
        const p = PROP_ALIASES[sortMatch[1].replace(/\s/g, '')] ?? sortMatch[1];
        sortProp = p;
        sortDir = sortMatch[2] as 'asc' | 'desc';
        grp.skip = true;
        continue;
      }

      const ineqMatch = tlc.match(/^([a-z]+)\s*(>=|<=|!=|>|<|=)\s*([\d.]+)$/) ||
                        tlc.match(/^([\d.]+)\s*(>=|<=|!=|>|<)\s*([a-z]+)$/);
      if (ineqMatch) {
        let propRaw: string, valStr: string, opRaw: string;
        const isReversed = !isNaN(parseFloat(ineqMatch[1]));
        if (isReversed) {
          valStr = ineqMatch[1]; opRaw = ineqMatch[2]; propRaw = ineqMatch[3];
          opRaw = opRaw === '<' ? '>' : opRaw === '<=' ? '>=' : opRaw === '>' ? '<' : opRaw === '>=' ? '<=' : opRaw;
        } else {
          propRaw = ineqMatch[1]; opRaw = ineqMatch[2]; valStr = ineqMatch[3];
        }
        const prop = PROP_ALIASES[propRaw.replace(/\s/g, '')] ?? propRaw.replace(/\s/g, '');
        const num = parseFloat(valStr);
        if (['basePower', 'accuracy', 'pp', 'priority'].includes(prop) && !isNaN(num)) {
          if (!grp.props[prop]) grp.props[prop] = {};
          if (opRaw === '>' || opRaw === '>=') grp.props[prop].greater = num;
          if (opRaw === '<' || opRaw === '<=') grp.props[prop].less = num;
          if (opRaw === '=' || opRaw === '>=' || opRaw === '<=') grp.props[prop].equal = num;
          if (opRaw === '!=') { grp.props[prop].greater = num; grp.props[prop].less = num; }
          continue;
        }
      }

      const priorityShorthand = tlcid.match(/^priority([+-]?)$/);
      if (priorityShorthand) {
        const sign = priorityShorthand[1];
        grp.props['priority'] = grp.props['priority'] ?? {};
        if (sign === '+' || sign === '') grp.props['priority'].greater = 0;
        else grp.props['priority'].less = 0;
        continue;
      }

      const boostMatch = tlc.match(/^(boosts?|lowers?|zboosts?)\s+(.+)$/);
      if (boostMatch) {
        const kind = boostMatch[1].replace(/s$/, '');
        const rawStat = boostMatch[2].replace(/\s/g, '');
        const statId = STAT_ALIASES_MS[rawStat] ?? rawStat;
        if (STAT_BOOST_IDS.has(statId)) {
          if (kind === 'boost') grp.boosts[statId] = !negate;
          else if (kind === 'lower') grp.lowers[statId] = !negate;
          else if (kind === 'zboost') grp.zboosts[statId] = !negate;
          continue;
        }
      }

      const statusNorm = STATUS_ALIASES[tlcid.replace(/s$/, '')] ?? STATUS_ALIASES[tlcid] ?? tlcid;
      if (['psn', 'tox', 'brn', 'par', 'frz', 'slp'].includes(statusNorm)) {
        grp.status[statusNorm] = !negate;
        continue;
      }
      if (['flinch', 'confusion', 'partiallytrapped', 'trapped'].includes(statusNorm)) {
        grp.volatileStatus[statusNorm] = !negate;
        continue;
      }

      if (tlcid === 'recovery') { grp.other['recovery'] = !negate; continue; }
      if (tlcid === 'recoil') { grp.other['recoil'] = !negate; continue; }
      if (tlcid === 'zrecovery') { grp.other['zrecovery'] = !negate; continue; }
      if (tlcid === 'pivot') { grp.other['pivot'] = !negate; continue; }

      const genNum = tlcid.match(/^g(?:en)?([1-9])$/);
      if (genNum) { grp.gens[genNum[1]] = !negate; continue; }

      let flagId = tlcid;
      if (flagId === 'bypassessubstitute') flagId = 'bypasssub';
      if (flagId === 'z') flagId = 'zmove';
      if (flagId === 'max') flagId = 'maxmove';
      if (flagId === 'gmax') flagId = 'gmaxmove';
      if (flagId === 'multi' || flagId === 'multihit') flagId = 'multihit';
      if (flagId === 'crit' || flagId === 'highcrit') flagId = 'highcrit';
      if (['thaw', 'thaws', 'melt', 'melts', 'defrosts'].includes(flagId)) flagId = 'defrost';
      if (flagId === 'slices' || flagId === 'slice') flagId = 'slicing';
      if (flagId === 'sheerforce') flagId = 'secondary';
      if (flagId === 'bounceable' || flagId === 'magiccoat' || flagId === 'magicbounce') flagId = 'reflectable';
      if (ALL_FLAGS.has(flagId)) {
        grp.flags[flagId] = !negate;
        continue;
      }

      const speciesObj = dex.species.get(token);
      if (speciesObj.exists) {
        targetMons.push({ species: speciesObj, exclude: negate });
        grp.skip = true;
        continue;
      }

      grp.skip = true;
      console.error(`Unrecognized movesearch filter: '${token}'`);
    }

    filterGroups.push(groups);
  }

  const pool = new Map<string, ReturnType<typeof dex.moves.get>>();
  for (const move of dex.moves.all()) {
    if (move.gen > dex.gen) continue;
    if (!natdexSearch && move.isNonstandard && move.isNonstandard !== 'Gigantamax') continue;
    if (natdexSearch && move.isNonstandard && !['Gigantamax', 'Past', 'Unobtainable'].includes(move.isNonstandard)) continue;
    if (move.isMax && dex.gen !== 8) continue;
    pool.set(move.id, move);
  }

  for (const { species, exclude } of targetMons) {
    const allSrc = validator.allSources(species);
    if (exclude) {
      for (const [mid, move] of pool) {
        const canLearn = !validator.checkCanLearn(move, species, allSrc);
        if (canLearn) pool.delete(mid);
      }
    } else {
      for (const [mid, move] of pool) {
        const canLearn = !validator.checkCanLearn(move, species, allSrc);
        if (!canLearn) pool.delete(mid);
      }
    }
  }

  function checkProp(moveVal: number | boolean | undefined, constraint: { less?: number; greater?: number; equal?: number }): boolean {
    const n = typeof moveVal === 'boolean' ? (moveVal ? 1 : 0) : (moveVal ?? 0);
    if (constraint.greater !== undefined && n > constraint.greater) return true;
    if (constraint.less !== undefined && n < constraint.less) return true;
    if (constraint.equal !== undefined && n === constraint.equal) return true;
    return false;
  }

  function matchesOneGroup(move: ReturnType<typeof dex.moves.get>, grp: MoveSearchGroup): boolean {
    if (grp.skip) return true;

    for (const [typeName, want] of Object.entries(grp.types)) {
      if ((move.type === typeName) !== want) return false;
    }
    for (const [cat, want] of Object.entries(grp.categories)) {
      if ((move.category === cat) !== want) return false;
    }
    for (const [genNum, want] of Object.entries(grp.gens)) {
      if ((move.gen === parseInt(genNum)) !== want) return false;
    }

    for (const [prop, constraint] of Object.entries(grp.props)) {
      const mv = move[prop as keyof typeof move] as number | boolean | undefined;
      if (!checkProp(mv, constraint)) return false;
    }

    for (const [flag, want] of Object.entries(grp.flags)) {
      let has: boolean;
      if (flag === 'secondary') {
        has = !!(move.secondary || move.secondaries || (move as any).hasSheerForceBoost);
      } else if (flag === 'zmove') {
        has = !!move.isZ;
      } else if (flag === 'highcrit') {
        has = !!(move.willCrit || (move.critRatio && move.critRatio > 1));
      } else if (flag === 'multihit') {
        has = !!move.multihit;
      } else if (flag === 'maxmove') {
        has = typeof move.isMax === 'boolean' && move.isMax;
      } else if (flag === 'gmaxmove') {
        has = typeof move.isMax === 'string';
      } else if (flag === 'protection') {
        has = !!(move.stallingMove && move.id !== 'endure');
      } else if (flag === 'ohko') {
        has = !!move.ohko;
      } else {
        has = flag in move.flags;
        if (flag === 'protect' && has) {
          has = !['all', 'allyTeam', 'allySide', 'foeSide', 'self'].includes(move.target);
        }
      }
      if (has !== want) return false;
    }

    for (const [stat, want] of Object.entries(grp.boosts)) {
      const boostVal = move.boosts?.[stat as 'atk'] ??
                       move.secondary?.self?.boosts?.[stat as 'atk'] ??
                       (move as any).selfBoost?.boosts?.[stat as 'atk'] ?? 0;
      const has = boostVal > 0;
      if (has !== want) return false;
    }
    for (const [stat, want] of Object.entries(grp.lowers)) {
      const lowerVal = move.boosts?.[stat as 'atk'] ??
                       move.secondary?.boosts?.[stat as 'atk'] ??
                       (move as any).self?.boosts?.[stat as 'atk'] ?? 0;
      const has = lowerVal < 0;
      if (has !== want) return false;
    }
    for (const [stat, want] of Object.entries(grp.zboosts)) {
      const zVal = (move.zMove as any)?.boost?.[stat] ?? 0;
      const has = zVal > 0;
      if (has !== want) return false;
    }

    for (const [st, want] of Object.entries(grp.status)) {
      let has = move.status === st ||
        !!(move.secondaries?.some((s: any) => s.status === st));
      if (st === 'slp') has = has || move.id === 'yawn';
      if (st === 'brn' || st === 'frz' || st === 'par') has = has || move.id === 'triattack';
      if (has !== want) return false;
    }

    for (const [vs, want] of Object.entries(grp.volatileStatus)) {
      const has = !!(
        (move.secondary && (move.secondary as any).volatileStatus === vs) ||
        move.secondaries?.some((s: any) => s.volatileStatus === vs) ||
        move.volatileStatus === vs ||
        (vs === 'trapped' && (move.id === 'fairylock' || move.id === 'octolock')) ||
        (vs === 'partiallytrapped' && (move.id === 'gmaxcentiferno' || move.id === 'gmaxsandblast'))
      );
      if (has !== want) return false;
    }

    for (const [kind, want] of Object.entries(grp.other)) {
      let has: boolean;
      if (kind === 'recovery') has = !!(move.drain || move.flags.heal);
      else if (kind === 'zrecovery') has = (move.zMove as any)?.effect === 'heal';
      else if (kind === 'recoil') has = !!(move.recoil || (move as any).hasCrashDamage);
      else if (kind === 'pivot') has = !!(move.selfSwitch && move.id !== 'revivalblessing' && move.id !== 'batonpass');
      else has = false;
      if (has !== want) return false;
    }

    return true;
  }

  for (const [mid, move] of pool) {
    const passes = filterGroups.every(orGroups => orGroups.some(grp => matchesOneGroup(move, grp)));
    if (!passes) pool.delete(mid);
  }

  let results = [...pool.values()];

  if (sortProp) {
    results.sort((a, b) => {
      const av = typeof a[sortProp as keyof typeof a] === 'boolean' ? (a[sortProp as keyof typeof a] ? 1 : 0) :
                 (a[sortProp as keyof typeof a] as number ?? 0);
      const bv = typeof b[sortProp as keyof typeof b] === 'boolean' ? (b[sortProp as keyof typeof b] ? 1 : 0) :
                 (b[sortProp as keyof typeof b] as number ?? 0);
      if (av !== bv) return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
      return a.name.localeCompare(b.name);
    });
  } else {
    results.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (poolOnly) return results;

  const genLabel = genMod !== 'gen9' ? dim(` [${genMod}]`) : '';

  if (results.length === 0) {
    console.log(`\nNo moves found.${genLabel}\n`);
    return;
  }

  if (results.length === 1) {
    cmdData([results[0].name]);
    return;
  }

  const total = results.length;
  const display = showAll ? results : results.slice(0, 100);

  const lines: string[] = [];
  for (const move of display) {
    let suffix = '';
    if (sortProp) {
      const v = move[sortProp as keyof typeof move];
      suffix = dim(` (${v === true ? '-' : v})`);
    }
    lines.push(bold(move.name) + suffix);
  }

  console.log(`\n${lines.join(', ')}`);
  if (!showAll && total > 100) {
    console.log(dim(`...and ${total - 100} more. Use 'all' to see everything.`));
  }
  console.log(dim(`${total} result${total !== 1 ? 's' : ''}${genLabel}`));
  console.log();
}

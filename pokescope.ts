#!/usr/bin/env node
'use strict';

import * as readline from 'readline';
import { Dex, TeamValidator } from 'pokemon-showdown';
import type { ModdedDex } from 'pokemon-showdown/dist/sim/dex';
import type { Move } from 'pokemon-showdown/dist/sim/dex-moves';
import type { Species } from 'pokemon-showdown/dist/sim/dex-species';

// ansi escape codes for terminal colors
const R = '\x1b[0m';
const B = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const WHITE = '\x1b[37m';
const CYAN = '\x1b[36m';
const BLUE = '\x1b[38;2;37;150;190m';

const bold  = (s: string): string => `${B}${s}${R}`;
const dim   = (s: string): string => `${DIM}${s}${R}`;
const red   = (s: string): string => `${RED}${s}${R}`;
const green = (s: string): string => `${GREEN}${s}${R}`;
const yellow = (s: string): string => `${YELLOW}${s}${R}`;
const cyan  = (s: string): string => `${CYAN}${s}${R}`;
const blue  = (s: string): string => `${BLUE}${s}${R}`;

const GEN_ALIASES: Record<string, string> = {
  rby: 'gen1', rb: 'gen1',
  gsc: 'gen2', gs: 'gen2',
  adv: 'gen3', rs: 'gen3',
  dpp: 'gen4', dp: 'gen4',
  bw: 'gen5', bw2: 'gen5',
  oras: 'gen6', xy: 'gen6',
  usum: 'gen7', sm: 'gen7',
  ss: 'gen8',
  sv: 'gen9',
};
const GEN_PATTERN = /^(gen[1-9]|rby|rb|gsc|gs|adv|rs|dpp|dp|bw2?|oras|xy|usum|sm|ss|sv)$/;

// splits a filter string into tokens with smart merging for multi-word patterns.
// commas separate independent filters; within each comma group, spaces are smart-split.
function splitFilterTokens(raw: string): string[] {
  const result: string[] = [];
  for (const group of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    if (!group.includes(' ')) { result.push(group); continue; }
    const words = group.split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < words.length) {
      const w = words[i].toLowerCase();
      const next = words[i + 1] ?? '';
      const nextlc = next.toLowerCase();
      const after = words[i + 2] ?? '';
      if (next && /^(>=|<=|!=|>|<|=)$/.test(next) && after) { result.push(words[i] + ' ' + next + ' ' + after); i += 3; continue; }
      if (nextlc === 'asc' || nextlc === 'desc') { result.push(words[i] + ' ' + next); i += 2; continue; }
      if ((w === 'resists' || w === 'resist' || w === 'weak' || w === 'weakness') && next) { result.push(words[i] + ' ' + next); i += 2; continue; }
      if ((w === 'boosts' || w === 'boost' || w === 'lowers' || w === 'lower' || w === 'zboosts' || w === 'zboost') && next) { result.push(words[i] + ' ' + next); i += 2; continue; }
      if (w === 'egg' && nextlc === 'group' && after) { result.push(words[i] + ' ' + next + ' ' + after); i += 3; continue; }
      if (w === 'fully' && nextlc === 'evolved') { result.push(words[i] + ' ' + next); i += 2; continue; }
      result.push(words[i]); i++;
    }
  }
  return result;
}

// splits gen prefix out of comma/slash-separated args, returns gen-specific dex and remaining targets
function splitGen(args: string[]): { dex: ModdedDex; targets: string[] } {
  let raw = args.join(' ');
  let dex: ModdedDex = Dex;
  // allow gen prefix with or without a following comma: "gen3 ice beam" or "gen3, ice beam"
  const genPrefix = raw.match(/^(gen[1-9]|rby|rb|gsc|gs|adv|rs|dpp|dp|bw2?|oras|xy|usum|sm|ss|sv)\s*,?\s*/i);
  if (genPrefix) {
    dex = Dex.mod(GEN_ALIASES[genPrefix[1].toLowerCase()] ?? genPrefix[1].toLowerCase());
    raw = raw.slice(genPrefix[0].length);
  }
  const targets = raw.split(/[,/]/).map(s => s.trim()).filter(Boolean);
  return { dex, targets };
}

// calculates type effectiveness accounting for onEffectiveness overrides (Freeze-Dry, Flying Press, etc.)
function calcTypeEff(dex: ModdedDex, source: Move | string, defTypes: string[]): number {
  const immune = dex.getImmunity(source, { types: defTypes });
  const isMove = typeof source !== 'string';
  const ignoreImm = isMove && source.ignoreImmunity &&
    (source.ignoreImmunity === true ||
      (typeof source.ignoreImmunity === 'object' && source.ignoreImmunity[source.type]));
  if (!immune && !ignoreImm) return 0;
  let totalTypeMod = 0;
  const isStatus = isMove && source.category === 'Status';
  const hasNoPower = isMove && !source.basePower && !source.basePowerCallback;
  if (!isStatus && !hasNoPower) {
    for (const type of defTypes) {
      const baseMod = dex.getEffectiveness(source, type);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const moveMod = isMove ? (source as any).onEffectiveness?.call({ dex }, baseMod, null, type, source) : undefined;
      totalTypeMod += typeof moveMod === 'number' ? moveMod : baseMod;
    }
  }
  return 2 ** totalTypeMod;
}

// strips html tags and entities from showdown's output so it's readable in a terminal
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#10003;/g, '✓')
    .replace(/&#10007;/g, '✗');
}

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

function cmdWeakness(args: string[]): void {
  if (!args.length) {
    console.log('Usage: weakness [gen] <pokemon|type[,type2]> [inverse]');
    return;
  }

  // strip trailing "inverse" before any other parsing
  let isInverse = false;
  let raw = args.join(' ').trim();
  if (/\binverse$/i.test(raw)) {
    isInverse = true;
    raw = raw.replace(/[,\s]+inverse$/i, '').trim();
  }

  const { dex, targets } = splitGen(raw.split(/\s+/));

  if (!targets.length) {
    console.log('Usage: weakness [gen] <pokemon|type[,type2]> [inverse]');
    return;
  }

  const types: string[] = [];
  let label = '';
  let isSpecies = false;

  // for first target: try exact species, exact type, then fuzzy (matching Showdown priority)
  const firstSpecies = dex.species.get(targets[0]);
  const firstType = dex.types.get(targets[0]);

  if (firstSpecies.exists) {
    isSpecies = true;
    for (const t of firstSpecies.types) types.push(t);
    label = firstSpecies.name;
    for (let i = 1; i < targets.length; i++) {
      let extra = dex.types.get(targets[i]);
      if (!extra.exists) {
        const fuzzy = dex.dataSearch(targets[i], ['TypeChart']);
        if (fuzzy?.length) extra = dex.types.get(fuzzy[0].name as string);
      }
      if (extra.exists && !types.includes(extra.name)) {
        types.push(extra.name);
        label += '/' + extra.name;
      }
    }
  } else if (firstType.exists) {
    types.push(firstType.name);
    label = firstType.name;
    for (let i = 1; i < targets.length; i++) {
      let extra = dex.types.get(targets[i]);
      if (!extra.exists) {
        const fuzzy = dex.dataSearch(targets[i], ['TypeChart']);
        if (fuzzy?.length) extra = dex.types.get(fuzzy[0].name as string);
      }
      if (extra.exists && !types.includes(extra.name)) {
        types.push(extra.name);
        label += '/' + extra.name;
      }
    }
  } else {
    // fuzzy: try species first, then type
    const fuzzySpecies = dex.dataSearch(targets[0], ['Pokedex']);
    const fuzzyType = dex.dataSearch(targets[0], ['TypeChart']);
    if (fuzzySpecies?.length) {
      const sp = dex.species.get(fuzzySpecies[0].name as string);
      if (sp.exists) {
        isSpecies = true;
        for (const t of sp.types) types.push(t);
        label = sp.name;
      }
    } else if (fuzzyType?.length) {
      const t = dex.types.get(fuzzyType[0].name as string);
      if (t.exists) { types.push(t.name); label = t.name; }
    }
  }

  if (types.length === 0) {
    console.error(`'${targets.join(', ')}' is not a recognized Pokemon or type${dex !== Dex ? ' in ' + dex.currentMod : ''}.`);
    return;
  }

  const weaknesses: string[] = [], resistances: string[] = [], immunities: string[] = [];
  const statuses: Record<string, string> = {
    brn: 'Burn', frz: 'Frozen', hail: 'Hail damage', par: 'Paralysis',
    powder: 'Powder moves', prankster: 'Prankster',
    sandstorm: 'Sandstorm damage', tox: 'Toxic', trapped: 'Trapping',
  };

  for (const type of dex.types.names()) {
    const notImmune = dex.getImmunity(type, types);
    if (notImmune || isInverse) {
      let typeMod = (!notImmune && isInverse) ? 1 : 0;
      typeMod += (isInverse ? -1 : 1) * dex.getEffectiveness(type, types);
      if (typeMod === 1) weaknesses.push(type);
      else if (typeMod === 2) weaknesses.push(bold(type) + yellow(' (4x)'));
      else if (typeMod >= 3) weaknesses.push(bold(type) + red(' (8x)'));
      else if (typeMod === -1) resistances.push(type);
      else if (typeMod === -2) resistances.push(bold(type) + dim(' (0.25x)'));
      else if (typeMod <= -3) resistances.push(bold(type) + dim(' (0.125x)'));
    } else {
      immunities.push(type);
    }
  }

  for (const status in statuses) {
    if (!dex.getImmunity(status, types)) {
      immunities.push(dim(statuses[status]));
    }
  }

  const genLabel = dex !== Dex ? dim(` [${dex.currentMod}]`) : '';
  const ignLabel = isSpecies ? dim(' (ignoring abilities)') : '';
  const invLabel = isInverse ? ' [Inverse]' : '';
  console.log(`\n${bold(label)}${ignLabel}${genLabel}${invLabel}`);
  console.log(`${red('Weaknesses')}:   ${weaknesses.join(', ') || dim('None')}`);
  console.log(`${green('Resistances')}: ${resistances.join(', ') || dim('None')}`);
  console.log(`${cyan('Immunities')}:  ${immunities.join(', ') || dim('None')}`);
  console.log();
}

function cmdEffectiveness(args: string[]): void {
  if (!args.length) {
    console.log('Usage: eff [gen] <move|type>, <pokemon|type>');
    return;
  }

  const { dex, targets } = splitGen(args);
  if (targets.length !== 2) {
    console.log('Usage: eff [gen] <move|type>, <pokemon|type>');
    return;
  }

  let source: Move | string;
  let atkName: string;
  let defName: string;
  let defTypes: string[];

  const srcMove = dex.moves.get(targets[0]);
  const srcType = dex.types.get(targets[0]);
  if (srcMove.exists) {
    source = srcMove;
    atkName = srcMove.name;
  } else if (srcType.exists) {
    source = srcType.name;
    atkName = srcType.name;
  } else {
    console.error(`'${targets[0]}' is not a recognized move or type.`);
    return;
  }

  const defSpecies = dex.species.get(targets[1]);
  const defType = dex.types.get(targets[1]);
  if (defSpecies.exists) {
    defTypes = defSpecies.types;
    defName = `${defSpecies.name} (not counting abilities)`;
  } else if (defType.exists) {
    defTypes = [defType.name];
    defName = defType.name;
  } else {
    console.error(`'${targets[1]}' is not a recognized Pokemon or type.`);
    return;
  }

  const factor = calcTypeEff(dex, source, defTypes);

  let factorStr: string;
  if (factor === 0) factorStr = cyan('0x (immune)');
  else if (factor > 1) factorStr = red(`${factor}x`);
  else if (factor < 1) factorStr = green(`${factor}x`);
  else factorStr = `${factor}x`;

  const genLabel = dex !== Dex ? dim(` [${dex.currentMod}]`) : '';
  console.log(`\n${bold(atkName)} → ${bold(defName)}${genLabel}: ${factorStr}`);

  if (typeof source !== 'string' && source.id === 'thousandarrows' && defTypes.includes('Flying')) {
    console.log(dim('  (Thousand Arrows is 1x on the first hit against Flying types)'));
  }

  console.log();
}

function cmdCoverage(args: string[]): void {
  if (!args.length) {
    console.log('Usage: coverage [gen] <move1[,move2,move3,move4]>');
    return;
  }

  const { dex, targets } = splitGen(args);

  if (targets.length > 4) {
    console.error('Specify a maximum of 4 moves or types.');
    return;
  }

  const sources: string[] = [];
  const bestCoverage: Record<string, number> = {};
  for (const type of dex.types.names()) bestCoverage[type] = -5;

  for (const arg of targets) {
    const argType = arg.charAt(0).toUpperCase() + arg.slice(1).toLowerCase();
    if (dex.types.isName(argType)) {
      sources.push(argType);
      for (const type in bestCoverage) {
        if (!dex.getImmunity(argType, type)) continue;
        const eff = dex.getEffectiveness(argType, type);
        if (eff > bestCoverage[type]) bestCoverage[type] = eff;
      }
      continue;
    }

    const move = dex.moves.get(arg);
    if (!move.exists) {
      console.error(`Type or move '${arg}' not found.`);
      return;
    }
    if (move.gen > dex.gen) {
      console.error(`Move '${move.name}' is not available in ${dex.currentMod}.`);
      return;
    }
    if (!move.basePower && !move.basePowerCallback) continue;
    if (move.id === 'struggle') continue;
    sources.push(move.name);
    for (const type in bestCoverage) {
      const immune = dex.getImmunity(move.type, type);
      const ignoreImm = move.ignoreImmunity &&
        (move.ignoreImmunity === true ||
          (typeof move.ignoreImmunity === 'object' && move.ignoreImmunity[move.type]));
      if (!immune && !ignoreImm) continue;
      const baseMod = dex.getEffectiveness(move, type);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const moveMod = (move as any).onEffectiveness?.call({ dex }, baseMod, null, type, move);
      const eff = typeof moveMod === 'number' ? moveMod : baseMod;
      if (eff > bestCoverage[type]) bestCoverage[type] = eff;
    }
  }

  if (sources.length === 0) {
    console.error('No valid moves or types specified.');
    return;
  }

  for (const type in bestCoverage) {
    bestCoverage[type] = bestCoverage[type] === -5 ? 0 : 2 ** bestCoverage[type];
  }

  const superEff: string[] = [], neutral: string[] = [], resists: string[] = [], immune: string[] = [];
  for (const type in bestCoverage) {
    const v = bestCoverage[type];
    if (v === 0) immune.push(type);
    else if (v > 1) superEff.push(type);
    else if (v < 1) resists.push(type);
    else neutral.push(type);
  }

  const genLabel = dex !== Dex ? dim(` [${dex.currentMod}]`) : '';
  console.log(`\n${bold('Coverage for ' + sources.join(' + '))}${genLabel}:`);
  console.log(`${red('Super Effective')}: ${superEff.join(', ') || dim('None')}`);
  console.log(`${WHITE}Neutral${R}:         ${neutral.join(', ') || dim('None')}`);
  console.log(`${green('Resisted')}:        ${resists.join(', ') || dim('None')}`);
  console.log(`${cyan('Immune')}:          ${immune.join(', ') || dim('None')}`);
  console.log();
}

function cmdData(args: string[]): void {
  if (!args.length) {
    console.log('Usage: data [gen] <pokemon|move|item|ability>');
    return;
  }

  const { dex, targets } = splitGen(args);
  let target = targets.join(', ').trim();

  if (!target) {
    console.log('Usage: data [gen] <pokemon|move|item|ability>');
    return;
  }

  // dex number lookup: "data 248" -> Tyranitar
  const targetNum = parseInt(target);
  if (!isNaN(targetNum) && String(targetNum) === target.trim()) {
    const found = Dex.species.all().find(s => s.num === targetNum);
    if (found) target = found.baseSpecies;
  }

  const results = dex.dataSearch(target);

  if (!results || results.length === 0) {
    console.error(`'${target}' doesn't match any Pokemon, item, move, ability, or nature${dex !== Dex ? ' in ' + dex.currentMod : ''}.`);
    return;
  }

  const genLabel = dex !== Dex ? dim(` [${dex.currentMod}]`) : '';

  for (const result of results) {
    if (result.isInexact) {
      console.log(dim(`No exact match for '${target}'. Showing: ${result.name as string}`));
    }
    switch (result.searchType) {
    case 'pokemon': {
      const p = dex.species.get(result.name as string);
      const stats = p.baseStats;
      const bst = stats.hp + stats.atk + stats.def + stats.spa + stats.spd + stats.spe;
      console.log(`\n${bold(p.name)} ${dim(`#${p.num}`)}${genLabel}`);
      console.log(`Type:       ${p.types.join(' / ')}`);
      console.log(`Abilities:  ${p.abilities[0]}${p.abilities[1] ? ' | ' + p.abilities[1] : ''}${p.abilities.H ? ' | ' + dim(p.abilities.H + ' (H)') : ''}`);
      console.log(`Stats:      HP ${stats.hp} | Atk ${stats.atk} | Def ${stats.def} | SpA ${stats.spa} | SpD ${stats.spd} | Spe ${stats.spe}  ${dim('(BST ' + bst + ')')}`);
      if (p.tier) console.log(`Tier:       ${p.tier}`);
      if (p.prevo && Dex.species.get(p.prevo).gen <= dex.gen) console.log(`Pre-evo:    ${p.prevo}`);
      if (p.evos?.length) {
        const evos = p.evos.filter(e => Dex.species.get(e).gen <= dex.gen);
        if (evos.length) console.log(`Evolves:    ${evos.join(', ')}`);
      }
      if (p.eggGroups?.length) console.log(`Egg Groups: ${p.eggGroups.join(', ')}`);
      console.log();
      break;
    }
    case 'move': {
      const m = dex.moves.get(result.name as string);
      const bp = m.basePower || (m.basePowerCallback ? '(variable)' : '-');
      const acc = m.accuracy === true ? '-' : m.accuracy;
      console.log(`\n${bold(m.name)}${genLabel}`);
      console.log(`Type: ${m.type} | Cat: ${m.category} | BP: ${bp} | Acc: ${acc} | PP: ${m.pp}`);
      if (m.desc || m.shortDesc) console.log(stripHtml(m.desc || m.shortDesc));
      console.log();
      break;
    }
    case 'item': {
      const item = dex.items.get(result.name as string);
      console.log(`\n${bold(item.name)}${genLabel}`);
      if (item.desc || item.shortDesc) console.log(stripHtml(item.desc || item.shortDesc));
      if (item.fling) console.log(`Fling BP: ${item.fling.basePower}`);
      console.log();
      break;
    }
    case 'ability': {
      const ab = dex.abilities.get(result.name as string);
      console.log(`\n${bold(ab.name)}${genLabel}`);
      if (ab.desc || ab.shortDesc) console.log(stripHtml(ab.desc || ab.shortDesc));
      console.log();
      break;
    }
    case 'nature': {
      const nat = Dex.natures.get(result.name as string);
      console.log(`\n${bold(nat.name)} nature`);
      if (nat.plus) {
        console.log(`+10% ${Dex.stats.names[nat.plus]}, -10% ${Dex.stats.names[nat.minus!]}`);
      } else {
        console.log('No effect.');
      }
      console.log();
      break;
    }
    }
  }
}

// parses a learnset source code like "9L24" or "8M" into a readable string
function parseSource(source: string): string {
  const gen = source.charAt(0);
  const method = source.charAt(1);
  const extra = source.slice(2);
  const methods: Record<string, string> = {
    L: `level-up${extra ? ' (' + extra + ')' : ''}`,
    M: 'TM/HM', T: 'tutor', E: 'egg', S: 'event', D: 'dream world', V: 'virtual console transfer',
  };
  return `Gen ${gen} ${methods[method] ?? method}`;
}

// walks the full prevo chain and collects all learnset sources for a move
function findLearnSources(speciesId: string, moveId: string): { sources: string[]; learnedBy: string } | null {
  let current = Dex.species.get(speciesId);
  const allSources: string[] = [];
  let learnedBy: string | null = null;
  while (current.exists) {
    const data = Dex.species.getLearnsetData(current.id);
    const sources = data.learnset?.[moveId];
    if (sources && sources.length) {
      if (!learnedBy) learnedBy = current.name;
      for (const s of sources) {
        if (!allSources.includes(s)) allSources.push(s);
      }
    }
    if (!current.prevo) break;
    current = Dex.species.get(current.prevo);
  }
  if (!allSources.length) return null;
  return { sources: allSources, learnedBy: learnedBy! };
}

function cmdLearn(args: string[]): void {
  if (!args.length) {
    console.log('Usage: learn [gen] <pokemon>, <move>[, <move2>, ...]');
    console.log('  e.g. learn pikachu, thunderbolt');
    console.log('       learn gen6, togekiss, nasty plot');
    console.log('       learn gen8, umbreon, wish');
    return;
  }

  const raw = args.join(' ');
  let genMod = 'gen9';
  let rest = raw;

  // check for gen prefix like "gen6, ..." or "gen6 ..."
  const genMatch = raw.match(/^(gen[1-9]|rby|rb|gsc|gs|adv|rs|dpp|dp|bw2?|oras|xy|usum|sm|ss|sv)\s*,?\s*/i);
  if (genMatch) {
    const rawGen = genMatch[1].toLowerCase();
    genMod = GEN_ALIASES[rawGen] ?? rawGen;
    rest = raw.slice(genMatch[0].length);
  }

  // check for lc (level 5) flag
  let level = 100;
  if (rest.match(/\blc\b/i)) {
    level = 5;
    rest = rest.replace(/\blc\b/i, '').replace(/,\s*,/, ',').trim().replace(/^,|,$/, '').trim();
  }

  let pokemonName: string;
  let moveNames: string[];

  if (rest.includes(',')) {
    const parts = rest.split(',').map(s => s.trim());
    pokemonName = parts[0];
    moveNames = parts.slice(1);
  } else {
    // no comma: try each split to find valid pokemon + valid move
    const tokens = rest.split(' ');
    let found = false;
    pokemonName = tokens[0];
    moveNames = [tokens.slice(1).join(' ')];
    for (let i = 1; i < tokens.length; i++) {
      const testPoke = Dex.species.get(tokens.slice(0, i).join(' '));
      const testMove = Dex.moves.get(tokens.slice(i).join(' '));
      if (testPoke.exists && testMove.exists) {
        pokemonName = tokens.slice(0, i).join(' ');
        moveNames = [tokens.slice(i).join(' ')];
        found = true;
        break;
      }
    }
    if (!found) {
      pokemonName = tokens[0];
      moveNames = [tokens.slice(1).join(' ')];
    }
  }

  if (!moveNames[0]) {
    console.error('specify at least one move, e.g. learn pikachu thunderbolt');
    return;
  }

  const dex = Dex.mod(genMod);
  const species = dex.species.get(pokemonName);
  if (!species.exists) {
    console.error(`'${pokemonName}' is not a recognized pokemon`);
    return;
  }

  const moves = moveNames.map(m => dex.moves.get(m));
  for (const m of moves) {
    if (!m.exists) { console.error(`'${m.id}' is not a recognized move`); return; }
  }

  const formatId = `${genMod}ou`;
  const validator = TeamValidator.get(formatId);
  const setSources = validator.allSources(species);
  const problems = validator.validateMoves(species, moves.map(m => m.name), setSources, { name: species.name, species: species.name, level });

  const canLearn = problems.length === 0;
  const combo = moves.map(m => m.name).join(' + ');
  const genLabel = genMod !== 'gen9' ? dim(` [${genMod}]`) : '';
  console.log(`\n${bold(species.name)}${genLabel} ${canLearn ? green('can') : red("can't")} learn ${bold(combo)}`);

  const genNum = genMod.replace('gen', '');
  for (const move of moves) {
    const found = findLearnSources(species.id, move.id);
    if (!found) {
      console.log(`  ${move.name}: ${dim('not in learnset')}`);
      continue;
    }
    const { sources, learnedBy } = found;
    const relevant = sources.filter(s => parseInt(s.charAt(0)) <= parseInt(genNum));
    const display = relevant.slice(0, 5).map(parseSource);
    const origin = learnedBy !== species.name ? dim(` (via ${learnedBy})`) : '';
    let srcStr: string;
    if (display.length) {
      srcStr = display.join(', ') + (relevant.length > 5 ? dim(' ...') : '');
    } else if (canLearn) {
      srcStr = dim('available (no source records for this gen)');
    } else {
      srcStr = dim('not available in this gen');
    }
    console.log(`  ${move.name}${origin}: ${srcStr}`);
  }

  if (problems.length) {
    console.log(`\n  ${red('issues:')}`);
    for (const p of problems) console.log(`  ${dim(p)}`);
  }

  console.log();
}

function cmdDexsearch(args: string[], poolOnly = false): Species[] | void {
  if (!args.length) {
    if (!poolOnly) console.log('Usage: dexsearch [gen] <filter>[, filter, ...]');
    return;
  }

  // --- tier ordering for inequality comparisons ---
  const SINGLES_TIER_ORDER: Record<string, number> = {
    lc: 0, nfe: 1, zu: 2, zubl: 3, pu: 4, publ: 5, nu: 6, nubl: 7, ru: 8, rubl: 9,
    uu: 10, uubl: 11, ou: 12, uber: 13, ubers: 13, ag: 14, anythinggoes: 14,
  };

  // canonical tier name map (alias -> official)
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

  // --- parse gen prefix ---
  const raw = args.join(' ');
  let genMod = 'gen9';
  let rest = raw;
  const genMatch = raw.match(/^(gen[1-9]|rby|rb|gsc|gs|adv|rs|dpp|dp|bw2?|oras|xy|usum|sm|ss|sv)\s*,?\s*/i);
  if (genMatch) {
    const rawGen = genMatch[1].toLowerCase();
    genMod = GEN_ALIASES[rawGen] ?? rawGen;
    rest = raw.slice(genMatch[0].length);
  }
  const dex = Dex.mod(genMod);

  // --- global flags ---
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

  // --- parse filters into AND groups, each group has OR alternatives ---
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

      // all flag (no negation)
      if (lc === 'all') { showAll = true; continue; }
      // natdex (no negation)
      if (lc === 'natdex') { natdexSearch = true; continue; }
      // unreleased (no negation)
      if (lc === 'unreleased') { unreleasedSearch = true; continue; }

      // negation
      let negate = false;
      let token = alt.trim();
      if (token.startsWith('!')) {
        negate = true;
        token = token.slice(1).trim();
      }
      const tlc = token.toLowerCase();
      const tlcNoSpace = tlc.replace(/\s+/g, '');

      // gmax — negatable (per-group when negated, global when positive)
      if (tlcNoSpace === 'gmax' || tlcNoSpace === 'gigantamax') {
        if (!negate) { gmaxSearch = true; } else { grp.flags['gmax'] = false; }
        continue;
      }
      // monotype — negatable per-group
      if (tlcNoSpace === 'monotype' || tlcNoSpace === 'mono') {
        grp.flags['monotype'] = !negate;
        if (!negate) monoSearch = true;
        continue;
      }
      // mega — negatable per-group
      if (tlcNoSpace === 'mega') {
        grp.flags['mega'] = !negate;
        if (!negate) megaSearch = true;
        continue;
      }
      // fully evolved — negatable per-group
      if (tlcNoSpace === 'fullyevolved' || tlcNoSpace === 'fe') {
        grp.flags['fe'] = !negate;
        if (!negate) feSearch = true;
        continue;
      }
      // restricted legendary — negatable per-group
      if (tlcNoSpace === 'restrictedlegendary' || tlcNoSpace === 'restricted') {
        grp.flags['restricted'] = !negate;
        if (!negate) restrictedSearch = true;
        continue;
      }
      // recovery — negatable per-group
      if (tlcNoSpace === 'recovery') {
        grp.flags['recovery'] = !negate;
        if (!negate) recoverySearch = true;
        continue;
      }
      // priority — negatable per-group
      if (tlcNoSpace === 'priority') {
        grp.flags['priority'] = !negate;
        if (!negate) prioritySearch = true;
        continue;
      }
      // pivot — negatable per-group
      if (tlcNoSpace === 'pivot') {
        grp.flags['pivot'] = !negate;
        if (!negate) pivotSearch = true;
        continue;
      }

      // stat sort: "spe asc", "bst desc", "tier asc", "dtier desc"
      const sortMatch = tlc.match(/^([a-z]+)\s+(asc|desc)$/);
      if (sortMatch) {
        const sStat = STAT_ALIASES[sortMatch[1].replace(/\s/g, '')] ?? sortMatch[1].replace(/\s/g, '');
        if (SORTABLE_STATS.has(sStat)) {
          sortStat = sStat;
          sortDir = sortMatch[2] as 'asc' | 'desc';
          continue;
        }
      }

      // stat/tier inequality: "spe > 100", "bst >= 500", "tier > uu", "100 < spe"
      const statIneqMatch = tlc.match(/^([a-z]+)\s*(>=|<=|!=|>|<|=)\s*(.+)$/) ||
                             tlc.match(/^(.+)\s*(>=|<=|!=|>|<)\s*([a-z]+)$/) && tlc.match(/^(.+)\s*(>=|<=|!=|>|<)\s*([a-z]+)$/);
      // try stat on left: "spe > 100"
      const leftStatMatch = tlc.match(/^([a-z]+(?:\s*[a-z]*)?)\s*(>=|<=|!=|>|<|=)\s*(.+)$/);
      // try value on left: "100 < spe"
      const rightStatMatch = tlc.match(/^(-?[\d.]+)\s*(>=|<=|!=|>|<)\s*([a-z]+)$/);

      if (leftStatMatch) {
        const rawStat = leftStatMatch[1].trim().replace(/\s+/g, '');
        const op = leftStatMatch[2];
        const valStr = leftStatMatch[3].trim();
        const statName = STAT_ALIASES[rawStat] ?? rawStat;

        if (statName === 'tier') {
          // tier inequality
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
              // include equal
              grp.stats['tier']['equal'] = grp.stats['tier']['equal'] ?? {};
              (grp.stats['tier']['equal'] as Record<string, number | boolean>)[tierAlias] = negate ? false : tierOrd;
            }
            continue;
          }
        }

        // compare stat vs another stat name
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
            // stat vs stat comparison
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
          // flip operator: "100 < spe" => spe > 100
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

      // generation: gen1..gen9 or g1..g9
      const genNumMatch = tlcNoSpace.match(/^g(?:en)?([1-9])$/);
      if (genNumMatch) {
        grp.gens[genNumMatch[1]] = !negate;
        continue;
      }

      // forme keywords: alola/galar/hisui/paldea/primal/therian/totem
      if (['alola', 'galar', 'hisui', 'paldea', 'primal', 'therian', 'totem'].includes(tlcNoSpace)) {
        grp.formes[tlcNoSpace] = !negate;
        continue;
      }

      // resists <type|move>
      const resistsMatch = tlc.match(/^resists?\s+(.+)$/);
      if (resistsMatch) {
        const resistTarget = resistsMatch[1].trim();
        grp.resists[resistTarget] = !negate;
        continue;
      }

      // weak <type|move>
      const weakMatch = tlc.match(/^weak(?:ness)?\s+(.+)$/i);
      if (weakMatch) {
        const weakTarget = weakMatch[1].trim();
        grp.weak[weakTarget] = !negate;
        continue;
      }

      // egg group: "grass group", "egg group grass", or just "grass" (handled below after type/ability/move)
      // check for explicit "group" suffix first: "grass group"
      const eggGroupSuffixMatch = tlc.match(/^(.+?)\s+group$/);
      if (eggGroupSuffixMatch) {
        const egName = eggGroupSuffixMatch[1].replace(/\s+/g, '').toLowerCase();
        const canonical = EGG_GROUP_ALIASES[egName];
        if (canonical) {
          grp.eggGroups[canonical] = !negate;
          continue;
        }
      }
      // check for "egg group <name>" prefix form
      const eggGroupPrefixMatch = tlc.match(/^egg\s+group\s+(.+)$/);
      if (eggGroupPrefixMatch) {
        const egName = eggGroupPrefixMatch[1].replace(/\s+/g, '').toLowerCase();
        const canonical = EGG_GROUP_ALIASES[egName];
        if (canonical) {
          grp.eggGroups[canonical] = !negate;
          continue;
        }
      }

      // color
      if (COLORS.has(tlcNoSpace)) {
        grp.colors[tlcNoSpace.charAt(0).toUpperCase() + tlcNoSpace.slice(1)] = !negate;
        continue;
      }

      // doubles tier
      const dtier = DOUBLES_TIER_NAMES[tlcNoSpace];
      if (dtier) {
        tierWasSearched = true;
        grp.doublesTiers[dtier] = !negate;
        continue;
      }

      // singles tier
      const stierCanon = SINGLES_TIER_NAMES[tlcNoSpace];
      if (stierCanon) {
        tierWasSearched = true;
        grp.tiers[stierCanon] = !negate;
        continue;
      }

      // CAP tier keywords
      if (tlcNoSpace === 'cap' || tlcNoSpace === 'capnfe' || tlcNoSpace === 'caplc') {
        capSearch = true;
        const capTierMap: Record<string, string> = { cap: 'CAP', capnfe: 'CAP NFE', caplc: 'CAP LC' };
        grp.tiers[capTierMap[tlcNoSpace]] = !negate;
        tierWasSearched = true;
        continue;
      }

      // type: "fire", "fire type", "!water"
      const typeSuffixMatch = tlc.match(/^(.+?)\s+type$/);
      const typeToken = typeSuffixMatch ? typeSuffixMatch[1].trim() : tlc;
      const typeObj = dex.types.get(typeToken);
      if (typeObj.exists) {
        grp.types[typeObj.name] = !negate;
        continue;
      }

      // ability
      const abilityObj = dex.abilities.get(token);
      if (abilityObj.exists) {
        grp.abilities[abilityObj.id] = !negate;
        continue;
      }

      // move (learnset check)
      const moveObj = dex.moves.get(token);
      if (moveObj.exists) {
        grp.moves[moveObj.id] = !negate;
        continue;
      }

      // egg group (no "group" suffix, after type/ability/move checks)
      const egNoSpace = tlcNoSpace;
      const egCanonical = EGG_GROUP_ALIASES[egNoSpace];
      if (egCanonical) {
        grp.eggGroups[egCanonical] = !negate;
        continue;
      }

      // fully evolved (spaced variant)
      if (tlcNoSpace === 'fullyevolved') { feSearch = true; continue; }
      if (tlcNoSpace === 'restrictedlegendary') { restrictedSearch = true; continue; }

      grp.skip = true;
      console.error(`Unrecognized filter: '${token}'`);
    }

    filterGroups.push(groups);
  }

  // --- helper: get a numeric stat from a species ---
  function getStat(species: Species, stat: string): number {
    if (stat === 'bst') return species.bst;
    if (stat === 'weight') return species.weighthg / 10;
    if (stat === 'height') return species.heightm;
    if (stat === 'gen') return species.gen;
    if (stat === 'num') return species.num;
    return species.baseStats[stat as 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'] ?? 0;
  }

  // --- helper: singles tier order for a species ---
  const TIER_STRING_ORDER: Record<string, number> = {
    LC: 0, NFE: 1, ZU: 2, ZUBL: 3, PU: 4, PUBL: 5, NU: 6, NUBL: 7, RU: 8, RUBL: 9,
    UU: 10, UUBL: 11, OU: 12, Uber: 13, AG: 14,
  };

  // --- set up TeamValidator for move learnset checks ---
  const validator = TeamValidator.get(`${genMod}ou`);

  // --- build the pool ---
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

  // --- helpers for resists/weak ---
  function getAttackingType(target: string): { source: Move | string; typeName: string } | null {
    const moveObj = dex.moves.get(target);
    if (moveObj.exists) return { source: moveObj, typeName: moveObj.type };
    const typeObj = dex.types.get(target);
    if (typeObj.exists) return { source: typeObj.name, typeName: typeObj.name };
    return null;
  }

  // --- check one species against a single filter group ---
  function matchesOneGroup(species: Species, grp: DexSearchGroup): boolean {
    if (grp.skip) return true;

    const effectiveTier = natdexSearch ? species.natDexTier : species.tier;

    // types
    for (const [typeName, want] of Object.entries(grp.types)) {
      if (species.types.includes(typeName) !== want) return false;
    }

    // abilities
    for (const [abilId, want] of Object.entries(grp.abilities)) {
      const ab = species.abilities;
      const has = Object.values(ab).some(a => a && dex.abilities.get(a).id === abilId);
      if (has !== want) return false;
    }

    // tiers (singles)
    for (const [tierName, want] of Object.entries(grp.tiers)) {
      if ((effectiveTier === tierName) !== want) return false;
    }

    // doubles tiers
    for (const [dtierName, want] of Object.entries(grp.doublesTiers)) {
      if ((species.doublesTier === dtierName) !== want) return false;
    }

    // colors
    for (const [colorName, want] of Object.entries(grp.colors)) {
      if ((species.color === colorName) !== want) return false;
    }

    // egg groups
    for (const [egName, want] of Object.entries(grp.eggGroups)) {
      if (species.eggGroups.includes(egName) !== want) return false;
    }

    // generations
    for (const [genNum, want] of Object.entries(grp.gens)) {
      if ((species.gen === parseInt(genNum)) !== want) return false;
    }

    // formes
    for (const [formeName, want] of Object.entries(grp.formes)) {
      if (species.forme.toLowerCase().includes(formeName) !== want) return false;
    }

    // moves (learnset check)
    for (const [moveId, want] of Object.entries(grp.moves)) {
      const moveObj = dex.moves.get(moveId);
      if (!moveObj.exists) { if (want) return false; break; }
      const canLearn = !validator.checkCanLearn(moveObj, species, validator.allSources(species));
      if (canLearn !== want) return false;
    }

    // resists
    for (const [resistTarget, want] of Object.entries(grp.resists)) {
      const atk = getAttackingType(resistTarget);
      if (!atk) { if (want) return false; break; }
      const eff = calcTypeEff(dex, atk.source, species.types);
      const resisted = eff === 0 || Math.log2(eff) < 0;
      if (resisted !== want) return false;
    }

    // weak
    for (const [weakTarget, want] of Object.entries(grp.weak)) {
      const atk = getAttackingType(weakTarget);
      if (!atk) { if (want) return false; break; }
      const eff = calcTypeEff(dex, atk.source, species.types);
      const isWeak = eff !== 0 && Math.log2(eff) >= 1;
      if (isWeak !== want) return false;
    }

    // stat comparisons
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
        // OR across dirs: >= stores both 'greater' and 'equal'; species passes if any dir passes
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

    // per-group boolean flags
    if ('monotype' in grp.flags && (species.types.length === 1) !== grp.flags['monotype']) return false;
    if ('mega' in grp.flags && species.name.includes('-Mega') !== grp.flags['mega']) return false;
    if ('gmax' in grp.flags && (species.isNonstandard === 'Gigantamax') !== grp.flags['gmax']) return false;
    if ('fe' in grp.flags && (!species.nfe) !== grp.flags['fe']) return false;
    if ('restricted' in grp.flags && species.tags.includes('Restricted Legendary') !== grp.flags['restricted']) return false;

    return true;
  }

  // --- AND across comma groups, OR across alternatives within each comma group ---
  function matchesFilters(species: Species): boolean {
    for (const orGroups of filterGroups) {
      if (!orGroups.some(grp => matchesOneGroup(species, grp))) return false;
    }
    return true;
  }

  // --- apply global flags and filter pool ---
  let results = pool.filter(species => {
    // monotype
    if (monoSearch && species.types.length !== 1) return false;
    // mega
    if (megaSearch && !species.name.includes('-Mega')) return false;
    // gmax
    if (gmaxSearch && species.isNonstandard !== 'Gigantamax') return false;
    // fully evolved
    if (feSearch && species.nfe) return false;
    // restricted legendary
    if (restrictedSearch && !species.tags.includes('Restricted Legendary')) return false;
    // recovery
    if (recoverySearch) {
      const allSrc = validator.allSources(species);
      const hasRecovery = [...RECOVERY_MOVES].some(mid => {
        const mv = dex.moves.get(mid);
        return mv.exists && !validator.checkCanLearn(mv, species, allSrc);
      });
      if (!hasRecovery) return false;
    }
    // priority (damaging priority move)
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
    // pivot
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

  // --- deduplication ---
  const seenBase = new Map<string, number>();
  function getSortVal(species: Species): number | string {
    if (sortStat === 'tier') return TIER_STRING_ORDER[species.tier] ?? -1;
    if (sortStat === 'dtier') return TIER_STRING_ORDER[species.doublesTier] ?? -1;
    if (sortStat) return getStat(species, sortStat);
    return 0;
  }

  results = results.filter(species => {
    const isRegionalForme = ['Alola', 'Galar', 'Hisui', 'Paldea'].some(r => species.forme.startsWith(r));
    // Tera formes: skip if base is in results
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
    // Ogerpon formes not ending in Tera: keep
    if (species.baseSpecies === 'Ogerpon' && !species.forme.endsWith('Tera')) {
      seenBase.set(species.name.toLowerCase(), 0);
      return true;
    }
    // Regional formes: always keep
    if (isRegionalForme) {
      seenBase.set(species.name.toLowerCase(), 0);
      return true;
    }
    // Normal formes: deduplicate against base
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

  // --- sort ---
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

  // --- output ---
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

function cmdMovesearch(args: string[], poolOnly = false): Move[] | void {
  if (!args.length) {
    if (!poolOnly) console.log('Usage: movesearch [gen] <filter>[, filter, ...]');
    console.log('  e.g. movesearch fire, physical, bp > 80');
    console.log('       movesearch contact, priority+');
    console.log('       movesearch boosts atk, special');
    console.log('       movesearch garchomp');
    return;
  }

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

  // gen prefix
  const raw = args.join(' ');
  let genMod = 'gen9';
  let rest = raw;
  const genMatch = raw.match(/^(gen[1-9]|rby|rb|gsc|gs|adv|rs|dpp|dp|bw2?|oras|xy|usum|sm|ss|sv)\s*,?\s*/i);
  if (genMatch) {
    const rawGen = genMatch[1].toLowerCase();
    genMod = GEN_ALIASES[rawGen] ?? rawGen;
    rest = raw.slice(genMatch[0].length);
  }
  const dex = Dex.mod(genMod);
  const validator = TeamValidator.get(`${genMod}ou`);

  let showAll = false;
  let natdexSearch = false;
  let sortProp = '';
  let sortDir: 'asc' | 'desc' = 'asc';

  // pokemon learnset filters: each entry restricts the move pool
  const targetMons: { species: ReturnType<typeof dex.species.get>; exclude: boolean }[] = [];

  // AND groups, each with OR alternatives
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

      // type: "fire", "fire type"
      const typeToken = tlc.endsWith(' type') ? tlc.slice(0, -5).trim() : tlc;
      const typeObj = dex.types.get(typeToken);
      if (typeObj.exists) {
        grp.types[typeObj.name] = !negate;
        continue;
      }

      // category: physical, special, status
      if (['physical', 'special', 'status'].includes(tlcid)) {
        const cat = tlcid.charAt(0).toUpperCase() + tlcid.slice(1);
        grp.categories[cat] = !negate;
        continue;
      }

      // sort: "bp asc", "accuracy desc", "priority desc"
      const sortMatch = tlc.match(/^(bp|basepower|power|accuracy|acc|pp|priority)\s+(asc|desc)$/);
      if (sortMatch) {
        const p = PROP_ALIASES[sortMatch[1].replace(/\s/g, '')] ?? sortMatch[1];
        sortProp = p;
        sortDir = sortMatch[2] as 'asc' | 'desc';
        grp.skip = true;
        continue;
      }

      // property inequality: "bp > 80", "accuracy >= 90", "100 < bp"
      const ineqMatch = tlc.match(/^([a-z]+)\s*(>=|<=|!=|>|<|=)\s*([\d.]+)$/) ||
                        tlc.match(/^([\d.]+)\s*(>=|<=|!=|>|<)\s*([a-z]+)$/);
      if (ineqMatch) {
        let propRaw: string, valStr: string, opRaw: string;
        const isReversed = !isNaN(parseFloat(ineqMatch[1]));
        if (isReversed) {
          valStr = ineqMatch[1]; opRaw = ineqMatch[2]; propRaw = ineqMatch[3];
          // flip: "100 < bp" → bp > 100
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

      // priority+ / priority-
      const priorityShorthand = tlcid.match(/^priority([+-]?)$/);
      if (priorityShorthand) {
        const sign = priorityShorthand[1];
        grp.props['priority'] = grp.props['priority'] ?? {};
        if (sign === '+' || sign === '') grp.props['priority'].greater = 0;
        else grp.props['priority'].less = 0;
        continue;
      }

      // boosts <stat>, lowers <stat>, zboosts <stat>
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

      // status conditions
      const statusNorm = STATUS_ALIASES[tlcid.replace(/s$/, '')] ?? STATUS_ALIASES[tlcid] ?? tlcid;
      if (['psn', 'tox', 'brn', 'par', 'frz', 'slp'].includes(statusNorm)) {
        grp.status[statusNorm] = !negate;
        continue;
      }
      if (['flinch', 'confusion', 'partiallytrapped', 'trapped'].includes(statusNorm)) {
        grp.volatileStatus[statusNorm] = !negate;
        continue;
      }

      // other: recovery, recoil, zrecovery, pivot
      if (tlcid === 'recovery') { grp.other['recovery'] = !negate; continue; }
      if (tlcid === 'recoil') { grp.other['recoil'] = !negate; continue; }
      if (tlcid === 'zrecovery') { grp.other['zrecovery'] = !negate; continue; }
      if (tlcid === 'pivot') { grp.other['pivot'] = !negate; continue; }

      // gen: gen1..gen9, g1..g9
      const genNum = tlcid.match(/^g(?:en)?([1-9])$/);
      if (genNum) { grp.gens[genNum[1]] = !negate; continue; }

      // flag aliases
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
      if (flagId === 'protection') flagId = 'protection';
      if (ALL_FLAGS.has(flagId)) {
        grp.flags[flagId] = !negate;
        continue;
      }

      // pokemon learnset
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

  // build move pool
  const pool = new Map<string, ReturnType<typeof dex.moves.get>>();
  for (const move of dex.moves.all()) {
    if (move.gen > dex.gen) continue;
    if (!natdexSearch && move.isNonstandard && move.isNonstandard !== 'Gigantamax') continue;
    if (natdexSearch && move.isNonstandard && !['Gigantamax', 'Past', 'Unobtainable'].includes(move.isNonstandard)) continue;
    if (move.isMax && dex.gen !== 8) continue;
    pool.set(move.id, move);
  }

  // apply pokemon learnset filters
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

  // filter group matching
  function checkProp(moveVal: number | boolean | undefined, constraint: { less?: number; greater?: number; equal?: number }): boolean {
    const n = typeof moveVal === 'boolean' ? (moveVal ? 1 : 0) : (moveVal ?? 0);
    // OR across directions (supports >= which sets both greater and equal)
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

  // filter the pool
  for (const [mid, move] of pool) {
    const passes = filterGroups.every(orGroups => orGroups.some(grp => matchesOneGroup(move, grp)));
    if (!passes) pool.delete(mid);
  }

  let results = [...pool.values()];

  // sort
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

function cmdItemsearch(args: string[]): void {
  if (!args.length) {
    console.log('Usage: itemsearch <description words>');
    console.log('  e.g. itemsearch raises speed in sandstorm');
    console.log('       itemsearch restores hp');
    console.log('       itemsearch fling 90');
    console.log('       itemsearch natural gift fire');
    return;
  }

  // normalize raw input: lowercase, strip punctuation except . in numbers and /
  let raw = args.join(' ').toLowerCase().replace(/-/g, ' ').replace(/[^a-z0-9.\s/]/g, '');

  // gen / maxgen extraction
  let gen = 0;
  let maxGen = 0;
  raw = raw.replace(/\bmaxgen\s*([1-9])\b/g, (_, n) => { maxGen = parseInt(n); return ''; });
  raw = raw.replace(/\bgen\s*([1-9])\b/g, (_, n) => { gen = parseInt(n); return ''; });

  // 'all' flag
  let showAll = false;
  raw = raw.replace(/\ball\b/g, () => { showAll = true; return ''; });

  const dex = gen ? Dex.mod(`gen${gen}` as any) : maxGen ? Dex.mod(`gen${maxGen}` as any) : Dex;

  // stopwords to strip
  const STOP = new Set(['a','an','is','it','its','the','that','which','user','holder','holders']);

  // synonym normalisation (mirrors Showdown's itemsearch)
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
    // strip trailing dot from non-numbers
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

  // --- special case: fling ---
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

  // --- special case: natural gift ---
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

  // --- general: score by description + name word matches ---
  } else {
    const searchingForTMTR = searchedWords.some(w => w === 'tm' || w === 'tr');
    let bestScore = 0;
    for (const item of dex.items.all()) {
      if (item.isNonstandard === 'CAP' || item.isNonstandard === 'LGPE' || item.isNonstandard === 'Future') continue;
      // filter TMs/TRs unless explicitly searching for them
      if (/^(tm|tr)\d+$/.test(item.id) && !searchingForTMTR) continue;

      let desc = item.desc || item.shortDesc || '';
      if (/[1-9.]+x/.test(desc)) desc += ' increases';
      if (item.isBerry) desc += ' berry';
      desc = desc.replace(/super[-\s]effective/g, 'supereffective');
      // augment description with alternate phrasings for common concepts
      if (/can evolve/i.test(desc)) desc += ' not fully evolved';
      if (/cannot evolve/i.test(desc)) desc += ' fully evolved not cannot';
      const descWords = desc.toLowerCase().replace(/-/g, ' ').replace(/[^a-z0-9\s/]/g, '').split(/\s+/);

      // include item name words so e.g. "choice" matches Choice Band
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

function cmdStatcalc(args: string[]): void {
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

function cmdRandomPokemon(args: string[]): void {
  let count = 1;
  let filterArgs = args;
  if (args.length && /^\d+$/.test(args[0])) {
    count = Math.min(parseInt(args[0]), 10);
    filterArgs = args.slice(1);
  }

  let pool: Species[];
  if (!filterArgs.length) {
    pool = Dex.species.all().filter(s => s.exists && !s.isNonstandard && s.num > 0);
  } else {
    const result = cmdDexsearch(filterArgs, true) as Species[] | undefined;
    if (!result?.length) {
      console.log('\nNo Pokémon match those filters.\n');
      return;
    }
    pool = result;
  }

  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const p = pool[Math.floor(Math.random() * pool.length)];
    lines.push(`${bold(p.name)} — ${p.types.join('/')} ${dim('#' + p.num)}`);
  }
  console.log('\n' + lines.join('\n') + '\n');
}

function cmdRandomMove(args: string[]): void {
  let count = 1;
  let filterArgs = args;
  if (args.length && /^\d+$/.test(args[0])) {
    count = Math.min(parseInt(args[0]), 10);
    filterArgs = args.slice(1);
  }

  let pool: Move[];
  if (!filterArgs.length) {
    pool = Dex.moves.all().filter(m => m.exists && !m.isNonstandard && m.id !== 'struggle');
  } else {
    const result = cmdMovesearch(filterArgs, true) as Move[] | undefined;
    if (!result?.length) {
      console.log('\nNo moves match those filters.\n');
      return;
    }
    pool = result;
  }

  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const m = pool[Math.floor(Math.random() * pool.length)];
    const bp = m.basePower || (m.basePowerCallback ? '(variable)' : '—');
    lines.push(`${bold(m.name)} — ${m.type} ${m.category} BP:${bp}`);
  }
  console.log('\n' + lines.join('\n') + '\n');
}

function showHelp(): void {
  console.log(`
${blue('weakness')} [gen] <pokemon|type[,type2]> [inverse]
  Weaknesses, resistances, and immunities.
  e.g. weakness charizard
       weakness fire,flying
       weakness water inverse
       weakness gen6, charizard

${blue('eff')} [gen] <move|type>, <pokemon|type>
  Type effectiveness of a move or type against a defender.
  e.g. eff earthquake, charizard
       eff freeze-dry, vaporeon
       eff gen4, water, fire

${blue('data')} [gen] <name|dex number>
  Pokedex entry for a Pokemon, move, item, ability, or nature.
  e.g. data garchomp
       data 248
       data earthquake
       data gen6, choice band

${blue('coverage')} [gen] <move1[,move2,move3,move4]>
  Best type coverage for a set of up to 4 moves or types.
  e.g. coverage surf,thunderbolt,icebeam,earthquake
       coverage gen5, freeze-dry, flying press

${blue('learn')} [gen] <pokemon>, <move>[, move2, ...]
  Check if a pokemon can learn a move (or combination), and how.
  e.g. learn pikachu, thunderbolt
       learn gen6, togekiss, nasty plot

${blue('dexsearch')} [gen] <filter>[, filter, ...]
  Search for Pokemon matching criteria.
  e.g. dexsearch fire, ou
       dexsearch dragon, spe > 100
       dexsearch intimidate, !mega
       dexsearch grass, egg group grass, fully evolved
       dexsearch resists ground, weak ice, ou
       dexsearch earthquake, spe asc

${blue('movesearch')} [gen] <filter>[, filter, ...]
  Search for moves matching criteria. Aliases: ms
  Filters: type, physical/special/status, contact, sound, punch, bullet, bite,
  dance, heal, recharge, protect, pulse, slicing, wind, powder, secondary,
  highcrit, multihit, ohko, priority+/-, bp/accuracy/pp/priority > N,
  boosts/lowers/zboosts <stat>, status (psn/tox/brn/par/frz/slp), flinch,
  confusion, recovery, recoil, pivot, gen1..gen9, <pokemon> (learnset filter)
  e.g. movesearch fire, physical, bp > 80
       movesearch contact, priority+
       movesearch boosts atk, special
       movesearch sound, !status
       movesearch garchomp

${blue('itemsearch')} <description words>  Alias: is
  Search items by description text. Special keywords: fling <bp>, natural gift <type>.
  e.g. itemsearch raises speed in sandstorm
       itemsearch restores hp
       itemsearch fling 90
       itemsearch natural gift fire
       itemsearch berry, gen4

${blue('statcalc')} [level] [pokemon or base stat] [stat] [ivs] [evs] [nature] [modifier]
  Calculate the final value of a stat.
  note: level must use lv prefix (lv50, lv1), bare numbers are treated as base stats.
  e.g. statcalc lv50 garchomp spe 252+ scarf
       statcalc 100 252ev positive +1
       statcalc lc 45 atk uninvested

${blue('randompokemon')} [count] [filters]  Alias: rp
  Random Pokémon, optionally filtered by dexsearch criteria.
  e.g. randompokemon
       randompokemon 3
       randompokemon fire, ou
       randompokemon 3 dragon, spe > 100

${blue('randommove')} [count] [filters]  Alias: rm
  Random move, optionally filtered by movesearch criteria.
  e.g. randommove
       randommove 5
       randommove water, special
       randommove 3 bp > 90, contact

${blue('help')}  Show this help.
${blue('exit')}  Exit the program.  ${dim('(REPL mode only)')}
`);
}

function dispatch(cmd: string, args: string[]): void {
  if (cmd.startsWith('/')) cmd = cmd.slice(1);
  switch (cmd.toLowerCase()) {
  case 'weakness':
  case 'weak':
  case 'weaknesses':
  case 'resist':
    cmdWeakness(args);
    break;
  case 'eff':
  case 'effectiveness':
  case 'type':
  case 'matchup':
    cmdEffectiveness(args);
    break;
  case 'data':
  case 'dex':
  case 'dt':
    cmdData(args);
    break;
  case 'coverage':
  case 'cover':
    cmdCoverage(args);
    break;
  case 'learn':
  case 'learnset':
    cmdLearn(args);
    break;
  case 'dexsearch':
  case 'ds':
  case 'nds':
    cmdDexsearch(args);
    break;
  case 'movesearch':
  case 'ms':
    cmdMovesearch(args);
    break;
  case 'itemsearch':
  case 'is':
    cmdItemsearch(args);
    break;
  case 'statcalc':
    cmdStatcalc(args);
    break;
  case 'randompokemon':
  case 'randpoke':
  case 'rollpokemon':
    cmdRandomPokemon(args);
    break;
  case 'randommove':
  case 'randmove':
  case 'rollmove':
    cmdRandomMove(args);
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    console.error(`Unknown command: ${cmd}. Type ${cyan('help')} to see available commands.`);
  }
}

const argv = process.argv.slice(2);

if (argv.length > 0) {
  // one-shot mode: pokescope weakness charizard
  const [cmd, ...rest] = argv;
  dispatch(cmd, rest);
} else {
  // repl mode: stays open and reads commands line by line
  console.log(`${bold('pokescope')} — type ${cyan('help')} to see available commands, ${cyan('exit')} to quit.\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${B}${CYAN}›${R} `,
  });

  rl.prompt();

  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }
    if (trimmed === 'exit' || trimmed === 'quit') {
      process.exit(0);
    }
    const [cmd] = trimmed.split(/\s+/);
    const rawArgs = trimmed.slice(cmd.length).trim();
    dispatch(cmd, rawArgs ? rawArgs.split(/\s+/) : []);
    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

#!/usr/bin/env node
'use strict';

const readline = require('readline');
const { Dex, TeamValidator } = require('pokemon-showdown');

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

const bold = s => `${B}${s}${R}`;
const dim = s => `${DIM}${s}${R}`;
const red = s => `${RED}${s}${R}`;
const green = s => `${GREEN}${s}${R}`;
const yellow = s => `${YELLOW}${s}${R}`;
const cyan = s => `${CYAN}${s}${R}`;
const blue = s => `${BLUE}${s}${R}`;

const GEN_ALIASES = { rby: 'gen1', gsc: 'gen2', adv: 'gen3', dpp: 'gen4', bw: 'gen5', bw2: 'gen5', oras: 'gen6', usum: 'gen7', ss: 'gen8', sv: 'gen9' };

// splits gen prefix out of comma/slash-separated args, returns gen-specific dex and remaining targets
function splitGen(args) {
  const parts = args.join(' ').split(/[,/]/).map(s => s.trim()).filter(Boolean);
  let dex = Dex;
  const targets = [];
  for (const part of parts) {
    const id = part.toLowerCase().replace(/\s+/g, '');
    const m = id.match(/^(gen[1-9]|rby|gsc|adv|dpp|bw2?|oras|usum|ss|sv)$/);
    if (m) {
      dex = Dex.mod(GEN_ALIASES[m[1]] || m[1]);
    } else {
      targets.push(part);
    }
  }
  return { dex, targets };
}

// calculates type effectiveness accounting for onEffectiveness overrides (Freeze-Dry, Flying Press, etc.)
function calcTypeEff(dex, source, defTypes) {
  const immune = dex.getImmunity(source, { types: defTypes });
  const ignoreImm = source.ignoreImmunity && (source.ignoreImmunity === true || source.ignoreImmunity[source.type]);
  if (!immune && !ignoreImm) return 0;
  let totalTypeMod = 0;
  const isStatus = source.effectType === 'Move' && source.category === 'Status';
  const hasNoPower = source.effectType === 'Move' && !source.basePower && !source.basePowerCallback;
  if (!isStatus && !hasNoPower) {
    for (const type of defTypes) {
      const baseMod = dex.getEffectiveness(source, type);
      const moveMod = source.onEffectiveness?.call({ dex }, baseMod, null, type, source);
      totalTypeMod += typeof moveMod === 'number' ? moveMod : baseMod;
    }
  }
  return 2 ** totalTypeMod;
}

// strips html tags and entities from showdown's output so it's readable in a terminal
function stripHtml(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#10003;/g, '✓')
    .replace(/&#10007;/g, '✗');
}

function cmdWeakness(args) {
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

  const types = [];
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
        if (fuzzy?.length) extra = dex.types.get(fuzzy[0].name);
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
        if (fuzzy?.length) extra = dex.types.get(fuzzy[0].name);
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
      const sp = dex.species.get(fuzzySpecies[0].name);
      if (sp.exists) {
        isSpecies = true;
        for (const t of sp.types) types.push(t);
        label = sp.name;
      }
    } else if (fuzzyType?.length) {
      const t = dex.types.get(fuzzyType[0].name);
      if (t.exists) { types.push(t.name); label = t.name; }
    }
  }

  if (types.length === 0) {
    console.error(`'${targets.join(', ')}' is not a recognized Pokemon or type${dex !== Dex ? ' in ' + dex.currentMod : ''}.`);
    return;
  }

  const weaknesses = [], resistances = [], immunities = [];
  const statuses = {
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

function cmdEffectiveness(args) {
  if (!args.length) {
    console.log('Usage: eff [gen] <move|type>, <pokemon|type>');
    return;
  }

  const { dex, targets } = splitGen(args);
  if (targets.length !== 2) {
    console.log('Usage: eff [gen] <move|type>, <pokemon|type>');
    return;
  }

  let source, atkName, defender, defName;

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
    defender = defSpecies;
    defName = `${defSpecies.name} (not counting abilities)`;
  } else if (defType.exists) {
    defender = { types: [defType.name] };
    defName = defType.name;
  } else {
    console.error(`'${targets[1]}' is not a recognized Pokemon or type.`);
    return;
  }

  const factor = calcTypeEff(dex, source, defender.types);

  let factorStr;
  if (factor === 0) factorStr = cyan('0x (immune)');
  else if (factor > 1) factorStr = red(`${factor}x`);
  else if (factor < 1) factorStr = green(`${factor}x`);
  else factorStr = `${factor}x`;

  const genLabel = dex !== Dex ? dim(` [${dex.currentMod}]`) : '';
  console.log(`\n${bold(atkName)} → ${bold(defName)}${genLabel}: ${factorStr}`);

  if (source.id === 'thousandarrows' && defender.types.includes('Flying')) {
    console.log(dim('  (Thousand Arrows is 1x on the first hit against Flying types)'));
  }

  console.log();
}

function cmdCoverage(args) {
  if (!args.length) {
    console.log('Usage: coverage [gen] <move1[,move2,move3,move4]>');
    return;
  }

  const { dex, targets } = splitGen(args);

  if (targets.length > 4) {
    console.error('Specify a maximum of 4 moves or types.');
    return;
  }

  const sources = [];
  const bestCoverage = {};
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
      const ignoreImm = move.ignoreImmunity && (move.ignoreImmunity === true || move.ignoreImmunity[move.type]);
      if (!immune && !ignoreImm) continue;
      const baseMod = dex.getEffectiveness(move, type);
      const moveMod = move.onEffectiveness?.call({ dex }, baseMod, null, type, move);
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

  const superEff = [], neutral = [], resists = [], immune = [];
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

function cmdData(args) {
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
      console.log(dim(`No exact match for '${target}'. Showing: ${result.name}`));
    }
    switch (result.searchType) {
    case 'pokemon': {
      const p = dex.species.get(result.name);
      const stats = p.baseStats;
      const bst = Object.values(stats).reduce((a, b) => a + b, 0);
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
      const m = dex.moves.get(result.name);
      const bp = m.basePower || (m.basePowerCallback ? '(variable)' : '-');
      const acc = m.accuracy === true ? '-' : m.accuracy;
      console.log(`\n${bold(m.name)}${genLabel}`);
      console.log(`Type: ${m.type} | Cat: ${m.category} | BP: ${bp} | Acc: ${acc} | PP: ${m.pp}`);
      if (m.desc || m.shortDesc) console.log(stripHtml(m.desc || m.shortDesc));
      console.log();
      break;
    }
    case 'item': {
      const item = dex.items.get(result.name);
      console.log(`\n${bold(item.name)}${genLabel}`);
      if (item.desc || item.shortDesc) console.log(stripHtml(item.desc || item.shortDesc));
      if (item.fling) console.log(`Fling BP: ${item.fling.basePower}`);
      console.log();
      break;
    }
    case 'ability': {
      const ab = dex.abilities.get(result.name);
      console.log(`\n${bold(ab.name)}${genLabel}`);
      if (ab.desc || ab.shortDesc) console.log(stripHtml(ab.desc || ab.shortDesc));
      console.log();
      break;
    }
    case 'nature': {
      const nat = Dex.natures.get(result.name);
      console.log(`\n${bold(nat.name)} nature`);
      if (nat.plus) {
        console.log(`+10% ${Dex.stats.names[nat.plus]}, -10% ${Dex.stats.names[nat.minus]}`);
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
// takes: source (string)
// returns: string like "Gen 9 level-up (24)" or "Gen 8 TM"
function parseSource(source) {
  const gen = source.charAt(0);
  const method = source.charAt(1);
  const extra = source.slice(2);
  const methods = { L: `level-up${extra ? ' (' + extra + ')' : ''}`, M: 'TM/HM', T: 'tutor', E: 'egg', S: 'event', D: 'dream world', V: 'virtual console transfer' };
  return `Gen ${gen} ${methods[method] || method}`;
}

// walks the full prevo chain and collects all learnset sources for a move
// takes: speciesId (string), moveId (string)
// returns: { sources: string[], learnedBy: string } or null if not found anywhere
function findLearnSources(speciesId, moveId) {
  let current = Dex.species.get(speciesId);
  const allSources = [];
  let learnedBy = null;
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
  return { sources: allSources, learnedBy };
}

function cmdLearn(args) {
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
  const genMatch = raw.match(/^(gen[1-9]|rby|gsc|adv|dpp|bw2?|oras|usum|ss|sv)\s*,?\s*/i);
  if (genMatch) {
    const genAliases = { rby: 'gen1', gsc: 'gen2', adv: 'gen3', dpp: 'gen4', bw: 'gen5', bw2: 'gen5', oras: 'gen6', usum: 'gen7', ss: 'gen8', sv: 'gen9' };
    const rawGen = genMatch[1].toLowerCase();
    genMod = genAliases[rawGen] || rawGen;
    rest = raw.slice(genMatch[0].length);
  }

  // check for lc (level 5) flag
  let level = 100;
  if (rest.match(/\blc\b/i)) {
    level = 5;
    rest = rest.replace(/\blc\b/i, '').replace(/,\s*,/, ',').trim().replace(/^,|,$/, '').trim();
  }

  let pokemonName, moveNames;

  if (rest.includes(',')) {
    const parts = rest.split(',').map(s => s.trim());
    pokemonName = parts[0];
    moveNames = parts.slice(1);
  } else {
    // no comma: try each split to find valid pokemon + valid move
    const tokens = rest.split(' ');
    let found = false;
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

  if (!moveNames || !moveNames[0]) {
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
    // filter to relevant gen and earlier
    const relevant = sources.filter(s => parseInt(s.charAt(0)) <= parseInt(genNum));
    const display = relevant.slice(0, 5).map(parseSource);
    const origin = learnedBy !== species.name ? dim(` (via ${learnedBy})`) : '';
    let srcStr;
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

function cmdStatcalc(args) {
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
  let pokemon;
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

  let output;
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

// takes: args (string[]) — optional number for how many to return
// returns: nothing, prints random pokemon
function cmdRandomPokemon(args) {
  const count = Math.min(parseInt(args[0]) || 1, 10);
  const pool = Dex.species.all().filter(s => s.exists && !s.isNonstandard && s.num > 0);
  for (let i = 0; i < count; i++) {
    const p = pool[Math.floor(Math.random() * pool.length)];
    console.log(`${bold(p.name)} — ${p.types.join('/')} ${dim('#' + p.num)}`);
  }
  console.log();
}

// takes: args (string[]) — optional number for how many to return
// returns: nothing, prints random moves
function cmdRandomMove(args) {
  const count = Math.min(parseInt(args[0]) || 1, 10);
  const pool = Dex.moves.all().filter(m => m.exists && !m.isNonstandard && m.id !== 'struggle');
  for (let i = 0; i < count; i++) {
    const m = pool[Math.floor(Math.random() * pool.length)];
    const bp = m.basePower || (m.basePowerCallback ? '(variable)' : '—');
    console.log(`${bold(m.name)} — ${m.type} ${m.category} BP:${bp}`);
  }
  console.log();
}

function showHelp() {
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

${blue('statcalc')} [level] [pokemon or base stat] [stat] [ivs] [evs] [nature] [modifier]
  Calculate the final value of a stat.
  note: level must use lv prefix (lv50, lv1), bare numbers are treated as base stats.
  e.g. statcalc lv50 garchomp spe 252+ scarf
       statcalc 100 252ev positive +1
       statcalc lc 45 atk uninvested

${blue('randompokemon')} [count]
  Random pokemon. optionally pass a number to get multiple.
  e.g. randompokemon
       randompokemon 3

${blue('randommove')} [count]
  Random move. optionally pass a number to get multiple.
  e.g. randommove
       randommove 5

${blue('help')}  Show this help.
${blue('exit')}  Exit the program.  ${dim('(REPL mode only)')}
`);
}

// routes a command string and its args to the right handler
// takes: cmd (string), args (string[])
// returns: nothing, side effects only
function dispatch(cmd, args) {
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

const args = process.argv.slice(2);

if (args.length > 0) {
  // one-shot mode: pokescope weakness charizard
  const [cmd, ...rest] = args;
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

  rl.on('line', line => {
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

  // ctrl+d
  rl.on('close', () => {
    process.exit(0);
  });
}

#!/usr/bin/env node
'use strict';

const readline = require('readline');
const { Dex } = require('pokemon-showdown');

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

// strips html tags and entities from showdown's output so it's readable in a terminal
// takes: s (string) — raw html string from showdown
// returns: plain text string
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
    console.log('Usage: weakness <pokemon|type[,type2]> [inverse]');
    return;
  }

  const raw = args.join(' ');
  const parts = raw.split(/[,/]/).map(s => s.trim());
  let isInverse = false;

  if (parts[parts.length - 1].toLowerCase() === 'inverse') {
    isInverse = true;
    parts.pop();
  }

  const types = [];
  let label = '';

  const species = Dex.species.get(parts[0]);
  if (species.exists) {
    for (const t of species.types) types.push(t);
    label = species.name;
    for (let i = 1; i < parts.length; i++) {
      const extra = Dex.types.get(parts[i]);
      if (extra.exists && !types.includes(extra.name)) {
        types.push(extra.name);
        label += '/' + extra.name;
      }
    }
  } else {
    for (const p of parts) {
      const t = Dex.types.get(p);
      if (t.exists) {
        types.push(t.name);
        label = label ? label + '/' + t.name : t.name;
      }
    }
  }

  if (types.length === 0) {
    console.error(`'${raw}' is not a recognized Pokémon or type.`);
    return;
  }

  const weaknesses = [], resistances = [], immunities = [];
  const statuses = {
    brn: 'Burn', frz: 'Frozen', hail: 'Hail damage', par: 'Paralysis',
    powder: 'Powder moves', prankster: 'Prankster',
    sandstorm: 'Sandstorm damage', tox: 'Toxic', trapped: 'Trapping',
  };

  for (const type of Dex.types.names()) {
    const notImmune = Dex.getImmunity(type, types);
    if (notImmune || isInverse) {
      let typeMod = (!notImmune && isInverse) ? 1 : 0;
      typeMod += (isInverse ? -1 : 1) * Dex.getEffectiveness(type, types);
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
    if (!Dex.getImmunity(status, types)) {
      immunities.push(dim(statuses[status]));
    }
  }

  const title = isInverse ? `${label} [Inverse]` : label;
  console.log(`\n${bold(title)}`);
  console.log(`${red('Weaknesses')}:   ${weaknesses.join(', ') || dim('None')}`);
  console.log(`${green('Resistances')}: ${resistances.join(', ') || dim('None')}`);
  console.log(`${cyan('Immunities')}:  ${immunities.join(', ') || dim('None')}`);
  console.log();
}

function cmdEffectiveness(args) {
  const raw = args.join(' ');
  const parts = raw.split(',').map(s => s.trim());
  if (parts.length !== 2) {
    console.log('Usage: eff <move|type>, <pokemon|type>');
    return;
  }

  let source, atkName, defender, defName;

  const srcMove = Dex.moves.get(parts[0]);
  const srcType = Dex.types.get(parts[0]);
  if (srcMove.exists) {
    source = srcMove;
    atkName = srcMove.name;
  } else if (srcType.exists) {
    source = srcType.name;
    atkName = srcType.name;
  } else {
    console.error(`'${parts[0]}' is not a recognized move or type.`);
    return;
  }

  const defSpecies = Dex.species.get(parts[1]);
  const defType = Dex.types.get(parts[1]);
  if (defSpecies.exists) {
    defender = defSpecies;
    defName = `${defSpecies.name} (ignoring abilities)`;
  } else if (defType.exists) {
    defender = { types: [defType.name] };
    defName = defType.name;
  } else {
    console.error(`'${parts[1]}' is not a recognized Pokémon or type.`);
    return;
  }

  let factor = 0;
  if (Dex.getImmunity(source, defender)) {
    let totalTypeMod = 0;
    const isStatus = source.effectType === 'Move' && source.category === 'Status';
    const hasNoPower = source.effectType === 'Move' && !source.basePower && !source.basePowerCallback;
    if (!isStatus && !hasNoPower) {
      for (const type of defender.types) {
        totalTypeMod += Dex.getEffectiveness(source, type);
      }
    }
    factor = 2 ** totalTypeMod;
  }

  let factorStr;
  if (factor === 0) factorStr = cyan('0x (immune)');
  else if (factor > 1) factorStr = red(`${factor}x`);
  else if (factor < 1) factorStr = green(`${factor}x`);
  else factorStr = `${factor}x`;

  console.log(`\n${bold(atkName)} → ${bold(defName)}: ${factorStr}\n`);
}

function cmdCoverage(args) {
  if (!args.length) {
    console.log('Usage: coverage <move1[,move2,move3,move4]>');
    return;
  }

  const raw = args.join(' ');
  const parts = raw.split(/[,+]/).map(s => s.trim()).filter(Boolean);

  if (parts.length > 4) {
    console.error('Specify a maximum of 4 moves or types.');
    return;
  }

  const sources = [];
  const bestCoverage = {};
  for (const type of Dex.types.names()) bestCoverage[type] = -5;

  for (const arg of parts) {
    const argType = arg.charAt(0).toUpperCase() + arg.slice(1);
    if (Dex.types.isName(argType)) {
      sources.push(argType);
      for (const type in bestCoverage) {
        if (!Dex.getImmunity(argType, type)) continue;
        const eff = Dex.getEffectiveness(argType, type);
        if (eff > bestCoverage[type]) bestCoverage[type] = eff;
      }
      continue;
    }

    const move = Dex.moves.get(arg);
    if (!move.exists) {
      console.error(`Type or move '${arg}' not found.`);
      return;
    }
    if (!move.basePower && !move.basePowerCallback) continue;
    sources.push(move.name);
    for (const type in bestCoverage) {
      if (!Dex.getImmunity(move.type, type) && !move.ignoreImmunity) continue;
      const eff = Dex.getEffectiveness(move.type, type);
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

  console.log(`\n${bold('Coverage for ' + sources.join(' + '))}:`);
  console.log(`${red('Super Effective')}: ${superEff.join(', ') || dim('None')}`);
  console.log(`${WHITE}Neutral${R}:         ${neutral.join(', ') || dim('None')}`);
  console.log(`${green('Resisted')}:        ${resists.join(', ') || dim('None')}`);
  console.log(`${cyan('Immune')}:          ${immune.join(', ') || dim('None')}`);
  console.log();
}

function cmdData(args) {
  if (!args.length) {
    console.log('Usage: data <pokemon|move|item|ability>');
    return;
  }

  const target = args.join(' ').trim();
  const results = Dex.dataSearch(target);

  if (!results || results.length === 0) {
    console.error(`'${target}' doesn't match any Pokémon, item, move, ability, or nature.`);
    return;
  }

  for (const result of results) {
    if (result.isInexact) {
      console.log(dim(`No exact match for '${target}'. Showing: ${result.name}`));
    }
    switch (result.searchType) {
    case 'pokemon': {
      const p = Dex.species.get(result.name);
      const stats = p.baseStats;
      const bst = Object.values(stats).reduce((a, b) => a + b, 0);
      console.log(`\n${bold(p.name)} ${dim(`#${p.num}`)}`);
      console.log(`Type:       ${p.types.join(' / ')}`);
      console.log(`Abilities:  ${p.abilities[0]}${p.abilities[1] ? ' | ' + p.abilities[1] : ''}${p.abilities.H ? ' | ' + dim(p.abilities.H + ' (H)') : ''}`);
      console.log(`Stats:      HP ${stats.hp} | Atk ${stats.atk} | Def ${stats.def} | SpA ${stats.spa} | SpD ${stats.spd} | Spe ${stats.spe}  ${dim('(BST ' + bst + ')')}`);
      if (p.tier) console.log(`Tier:       ${p.tier}`);
      if (p.prevo) console.log(`Pre-evo:    ${p.prevo}`);
      if (p.evos?.length) console.log(`Evolves→:   ${p.evos.join(', ')}`);
      if (p.eggGroups?.length) console.log(`Egg Groups: ${p.eggGroups.join(', ')}`);
      console.log();
      break;
    }
    case 'move': {
      const m = Dex.moves.get(result.name);
      const bp = m.basePower || (m.basePowerCallback ? '(variable)' : '—');
      const acc = m.accuracy === true ? '—' : m.accuracy;
      console.log(`\n${bold(m.name)}`);
      console.log(`Type: ${m.type} | Cat: ${m.category} | BP: ${bp} | Acc: ${acc} | PP: ${m.pp}`);
      if (m.desc || m.shortDesc) console.log(stripHtml(m.desc || m.shortDesc));
      console.log();
      break;
    }
    case 'item': {
      const item = Dex.items.get(result.name);
      console.log(`\n${bold(item.name)}`);
      if (item.desc || item.shortDesc) console.log(stripHtml(item.desc || item.shortDesc));
      if (item.fling) console.log(`Fling BP: ${item.fling.basePower}`);
      console.log();
      break;
    }
    case 'ability': {
      const ab = Dex.abilities.get(result.name);
      console.log(`\n${bold(ab.name)}`);
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
        console.log('No stat effect');
      }
      console.log();
      break;
    }
    }
  }
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
${blue('weakness')} <pokemon|type[,type2]> [inverse]
  Weaknesses, resistances, and immunities.
  e.g. weakness charizard
       weakness fire,flying
       weakness water inverse

${blue('eff')} <move|type>, <pokemon|type>
  Type effectiveness of a move or type against a defender.
  e.g. eff earthquake, charizard
       eff water, fire

${blue('data')} <name>
  Pokédex entry for a Pokémon, move, item, ability, or nature.
  e.g. data garchomp
       data earthquake
       data choice band

${blue('coverage')} <move1[,move2,move3,move4]>
  Best type coverage for a set of up to 4 moves or types.
  e.g. coverage surf,thunderbolt,icebeam,earthquake

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

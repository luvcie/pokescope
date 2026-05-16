import * as readline from 'readline';
import { Dex } from '@pkmn/sim';
import { bold, cyan, blue, B, CYAN, R } from './ansi';
import { showHelp } from './help';
import { cmdWeakness } from './commands/weakness';
import { cmdEffectiveness } from './commands/effectiveness';
import { cmdCoverage } from './commands/coverage';
import { cmdData } from './commands/data';
import { cmdLearn } from './commands/learn';
import { cmdDexsearch } from './commands/dexsearch';
import { cmdMovesearch } from './commands/movesearch';
import { cmdItemsearch } from './commands/itemsearch';
import { cmdStatcalc } from './commands/statcalc';
import { cmdRandomPokemon, cmdRandomMove, cmdRandomQuote } from './commands/random';
import { cmdEv } from './commands/ev';
import { cmdNature } from './commands/nature';

const COMMANDS = [
  'weakness', 'weak', 'weaknesses', 'resist',
  'eff', 'effectiveness', 'type', 'matchup',
  'data', 'dex', 'dt',
  'coverage', 'cover',
  'learn', 'learnset',
  'dexsearch', 'ds', 'nds',
  'movesearch', 'ms',
  'itemsearch', 'is',
  'statcalc',
  'randompokemon', 'randpoke', 'rollpokemon', 'rp',
  'randommove', 'randmove', 'rollmove', 'rm',
  'evyield',
  'nature',
  'randomquote', 'rq',
  'help', 'exit', 'quit',
];

let speciesCache: string[] | null = null;
function getSpecies(): string[] {
  if (!speciesCache) {
    speciesCache = Dex.species.all()
      .filter((s) => s.exists && s.num > 0 && s.isNonstandard !== 'Custom' && s.isNonstandard !== 'LGPE')
      .map((s) => s.name.toLowerCase());
  }
  return speciesCache;
}

function completer(line: string): [string[], string] {
  if (!line.includes(' ')) {
    const slash = line.startsWith('/');
    const word = slash ? line.slice(1) : line;
    const hits = COMMANDS.filter((c) => c.startsWith(word)).map(c => slash ? '/' + c : c);
    return [hits, line];
  }
  const sepIdx = Math.max(line.lastIndexOf(','), line.lastIndexOf('/'), line.indexOf(' '));
  const word = line.slice(sepIdx + 1).replace(/^\s+/, '').toLowerCase();
  if (!word) return [[], line];
  const hits = getSpecies().filter((s) => s.startsWith(word));
  return [hits, word];
}

const KAOMOJI = [
  '(^w^)7',
  '(>﹏<)ゝ',
  'ᓚ₍⑅^..^₎',
  '/(-3-)',
  "_( '/3\\' )_",
  '<❪❪꒰˶ᵔ ᵕ ᵔ˶꒱❫❫>',
  '@(@~@)@',
  "++(' _ ')++",
  '(\\/) ( ;,,;)(\\/)',
];
const randKaomoji = (): string => KAOMOJI[Math.floor(Math.random() * KAOMOJI.length)];

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
  case 'evyield':
  case 'ev':
    cmdEv(args);
    break;
  case 'nature':
    cmdNature(args);
    break;
  case 'randompokemon':
  case 'randpoke':
  case 'rollpokemon':
  case 'rp':
    cmdRandomPokemon(args);
    break;
  case 'randommove':
  case 'randmove':
  case 'rollmove':
  case 'rm':
    cmdRandomMove(args);
    break;
  case 'randomquote':
  case 'rq':
    cmdRandomQuote();
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
  const [cmd, ...rest] = argv;
  dispatch(cmd, rest);
} else {
  console.log(`${bold('pokescope')} ${randKaomoji()} type ${blue('help')} to see available commands, ${blue('exit')} to quit.\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${B}${CYAN}›${R} `,
    completer,
  });

  rl.prompt();

  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }
    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log(`Goodbye! ${randKaomoji()}`);
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

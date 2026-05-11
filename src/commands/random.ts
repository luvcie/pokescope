import { Dex } from 'pokemon-showdown';
import type { Move } from 'pokemon-showdown/dist/sim/dex-moves';
import type { Species } from 'pokemon-showdown/dist/sim/dex-species';
import { bold, dim } from '../ansi';
import { cmdDexsearch } from './dexsearch';
import { cmdMovesearch } from './movesearch';

export function cmdRandomPokemon(args: string[]): void {
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

export function cmdRandomMove(args: string[]): void {
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

export function cmdRandomQuote(): void {
  const QUOTES: { text: string; by: string }[] = [
    {
      text: "Together you and your Pokémon overcame all the challenges you faced, however difficult. It means that you've triumphed over any personal weaknesses, too. The power you learned, I feel it emanating from you.",
      by: "Cynthia",
    },
    {
      text: "The circumstances of one's birth are irrelevant. It's what you chose to do with the gift of life that determines who you are.",
      by: "Mewtwo — Pokémon: The First Movie",
    },
    {
      text: "Strong Pokémon. Weak Pokémon. That is only the selfish perception of people. Truly skilled trainers should try to win with their favorites.",
      by: "Karen — Indigo Elite Four",
    },
    {
      text: "It's one thing to enjoy leisurely battles, but real battles can be a severe trial. Truly strong Trainers sometimes must be prepared to choose Pokémon that can win rather than their favorite Pokémon.",
      by: "Gentleman — Gen III/ORAS",
    },
    {
      text: "There are bad ways to win — and good ways to lose. What's interesting and troubling is that it's not always clear which is which. A flipped coin doesn't always land heads or tails. Sometimes it may never land at all...",
      by: "Grimsley — Pokémon Black/White",
    },
    {
      text: "A beautiful loss is still a loss, and an ugly win is still a win!",
      by: "",
    },
    {
      text: "I'll use my frying pan as a drying pan!",
      by: "Brock — Pokémon anime",
    },
    {
      text: "Heheh! This gym is great! It is full of women!",
      by: "Old man outside Erika's Gym",
    },
    {
      text: "Y'know what? Ice is both extremely hard and terribly fragile at the same time. You know what that means? Depending on which Pokémon you choose and what moves they use, I could be your most challenging opponent yet or I could be a total pushover. But that's all right. That's how it should be! Anyway, enough of my rambling! Let's get this show on the road!",
      by: "Wulfric — Pokémon X/Y",
    },
    {
      text: "The important thing is not how long you live, it's what you accomplish with your life. When I live, I want to shine. I want to prove that I exist. If I could do something really important… that would definitely carry on into the future.",
      by: "Grovyle — Pokémon Mystery Dungeon",
    },
    {
      text: "Our boss went to jack a submarine. Where did he go? Ha, I'd never tell you such an important secret!\nOur boss went to Slateport. Why did he go there? Ha, I'd never tell you such an important secret!",
      by: "Team Aqua Grunts — Pokémon Ruby/Sapphire",
    },
    {
      text: "We do have a lot in common. The same earth, the same air, the same sky. Maybe if we started looking at what's the same instead of always looking at what's different... well, who knows?",
      by: "Meowth — Pokémon: The First Movie",
    },
    {
      text: "It's not by rejecting different ideas, but by accepting different ideas that the world creates a chemical reaction. This is truly the formula for changing the world.",
      by: "N — Pokémon Black/White",
    },
    {
      text: "You wanna know what I do when some machine messes up? The first thing I do is give it a nice hard smack! I mean, most of the time I smash it to pieces, but hey, what can you do? Now let's see if I can't fix you!",
      by: "Guzma — Pokémon Sun/Moon",
    },
    {
      text: "If I'm wearing a bikini... where do I put my Poké Balls? Teehee... woman's secret!",
      by: "Swimmer Kylie — Pokémon Ruby/Sapphire",
    },
  ];

  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  console.log(`\n"${q.text}"`);
  if (q.by) console.log(dim(`  — ${q.by}`));
  console.log();
}

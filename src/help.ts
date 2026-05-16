import { blue, dim } from './ansi';

export function showHelp(): void {
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

${blue('evyield')} <pokemon>  Alias: ev
  EV yield when defeating a Pokemon.
  e.g. evyield blissey
       evyield nidoran-m

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

${blue('randomquote')}  Alias: rq
  Print a random Pokémon quote.

${blue('help')}  Show this help.
${blue('exit')}  Exit the program.  ${dim('(REPL mode only)')}
`);
}

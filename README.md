# Pokescope

I liked the lookup commands in [Pokemon Showdown](https://github.com/smogon/pokemon-showdown)'s chat and wanted them in my terminal, mainly for using while I play PokeMMO.

It's made in TypeScript because it uses the [`pokemon-showdown`](https://www.npmjs.com/package/pokemon-showdown) npm package directly, all the data (type charts, learnsets, tier info, move descriptions) comes from there, so updating the dependency is enough to get new Pokemon, tier changes, etc that pokemon showdown might add in the future.

Why not Go, Rust, Gleam, etc.? Because I don't want to rewrite everything that's already in the pokemon-showdown package.

Runs on [Bun](https://bun.sh), which executes TypeScript directly with no build step. The Nix package ships the source and a small wrapper that invokes `bun run`.

Also thanks to my fren William for helping me choose the name. :)

**Nix:**

```
nix run github:luvcie/pokescope
```

**From source:**
```
git clone https://github.com/luvcie/pokescope
cd pokescope
bun install
bun link
```

## Usage

Interactive REPL:
```
pokescope
```

Or directly:
```
pokescope weakness charizard
pokescope dexsearch fire, ou
```

## Commands

| command | description |
|---|---|
| `weakness` | weaknesses, resistances, and immunities for a Pokemon or type combo |
| `eff` | type effectiveness of a move or type against a target |
| `coverage` | best type coverage for up to 4 moves |
| `data` | Pokedex entry for a Pokemon, move, item, ability, or nature |
| `learn` | check if a Pokemon can learn a move (or combo), and how |
| `dexsearch` | search Pokemon by type, tier, stats, ability, moves, egg group, and more |
| `movesearch` | search moves by type, category, BP, flags, boosts, and more |
| `itemsearch` | search items by description keywords |
| `statcalc` | calculate a final stat value from base stat, EVs, IVs, nature, and modifier |
| `randompokemon` | random Pokemon, optionally filtered by dexsearch criteria |
| `randommove` | random move, optionally filtered by movesearch criteria |
| `randomquote` | a random Pokemon quote (not from Showdown, just something I added) |

All commands support a `[gen]` prefix (e.g. `gen4`, `adv`, `bw`) to query older generations. Type `help` inside the REPL for full usage and examples.

Might add more commands in the future, like the `randomquote` one which is not from pokemon showdown.

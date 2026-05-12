# Pokescope

I liked the lookup commands in [Pokemon Showdown](https://github.com/smogon/pokemon-showdown)'s chat and wanted them in my terminal, mainly for using while I play PokeMMO.

It's made in TypeScript because it uses the [`pokemon-showdown`](https://www.npmjs.com/package/pokemon-showdown) npm package directly, all the data (type charts, learnsets, tier info, move descriptions) comes from there, so updating the dependency is enough to get new Pokemon, tier changes, etc that pokemon showdown might add in the future.

Why not Go, Rust, Gleam, etc.? Because pokemon-showdown isn't just data on pokemon, moves, items, etc., there's also a lot of logic (learnset validation, format rules, type effectiveness with abilities and items, etc.), and reimplementing all that and keeping it in sync with every Showdown update is way more work than just letting `bun update` handle it.

Runs on [Bun](https://bun.sh), which executes TypeScript directly with no build step. The Nix package ships the source and a small wrapper that invokes `bun run`.

Also thanks to my fren William for helping me choose the name. :)

## Install

**From source:**
```
git clone https://github.com/luvcie/pokescope
cd pokescope
bun install
bun link
```

**Nix:**

Run temporarily, without installing:
```
nix run github:luvcie/pokescope
```

To install permanently:
```
nix profile install github:luvcie/pokescope
```

Or add to your flake:
```nix
inputs.pokescope.url = "github:luvcie/pokescope";

# then in environment.systemPackages / home.packages:
inputs.pokescope.packages.${system}.default
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

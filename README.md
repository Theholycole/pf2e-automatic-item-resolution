# PF2e Automatic Item Resolution

A Foundry VTT module (id `pf2e-automatic-item-resolution`) that automates Pathfinder 2e items. It works in live play and, through the [PF2e Resolution Core](https://github.com/Theholycole/PF2e-Automation-Core), in the PF2e Combat Simulator. Consumables come first: potions, elixirs and mutagens; then poisons and bombs; then talismans, oils and snares. Activated permanent items come later.

Spell-casting items (scrolls, wands, staves, catalysts) belong to PF2e Automatic Spell Resolution.

**Status (2026-10-15): batch 1 (potions, elixirs, mutagens) and the start of batch 2 (bombs, injury poisons) are built and tested offline against a stand-in for Foundry. Not checked in Foundry yet.** See [docs/design.md](docs/design.md) and [docs/census.md](docs/census.md). Not published on GitHub yet.

- **The compiler** (`src/compiler/`) turns a consumable into a plan for the core. It reads the text with PF2e Automatic Ability Resolution's compiler, and adds what the item's own data says:
  - who drinks it;
  - the healing PF2e rolls for it;
  - its linked PF2e Effect, or a spell's Effect at the item's rank;
  - what the text plainly does to the drinker;
  - a note Effect for the rest.

  695 of the 1,487 consumables it handles compile to a plan the core resolves with no gaps, plus 64 snares whose save plans it resolves inside the ability module's zones. 272 more get only a note, and 5 are partial.
- **Cards after PF2e's own Use** (`scripts/live.js`): the item's confirmation card. It names the drinker: the user, or a creature next to them to feed it to. The item's owner or the GM applies it.
  - Healing uses PF2e's own roll, and PF2e's buttons are hidden on that message so nothing is healed twice.
  - Effects are made at the item's grade.
- **Bombs** (`scripts/bombs.js`): after PF2e's damage roll, a card for the splash on the creatures within 5 feet of the target and the riders on a hit or a critical hit.
- **Injury poisons** (`scripts/poisons.js`): coat a weapon. Its next hit posts the poison's save card (the ability module's); a critical miss wastes it.
- **Bomb saves:** the bomb card also posts the ability module's save card, for whoever the bomb's text says saves.
- **Casts** (`scripts/casts.js`): an item that casts a spell PF2e has no Effect for gets a card. Apply has the spell module cast it through PF2e.
- **Other poisons and saves:** a card that exposes, or asks a save of, the creatures the presser targets. Breath potions get it kept open for later.
- **Snares and lasting areas** (`scripts/zones.js`): the ability module's zones, placed by the GM. A snare goes off once, for the first creature to enter its square.

In all, 1,062 of the 1,487 consumables this module handles get a card in play (the census's "Played live" table).
- In Foundry it also registers the consumable compiler with the core (`registry.planFor(item)`).

## Requirements

Foundry 14 with the PF2e system 8.5 or later, plus:

- [PF2e Resolution Core](https://github.com/Theholycole/PF2e-Automation-Core), which resolves the plans;
- [PF2e Automatic Ability Resolution](https://github.com/Theholycole/pf2e-automatic-ability-resolution), whose compiler reads the item text.

## Development

- Tests: `node --test --test-isolation=none test/*.test.js`. The live layer runs against a stand-in for Foundry (`test/support/fake-foundry.mjs`) with PF2e's real items and Effects from its packs.
- Census: `node tools/census.mjs`. It reads the PF2e system's packs straight from LevelDB, with no Foundry login, and rewrites `reports/census.json` and `docs/census.md`.
- Imports reach the sibling modules by their ids (`../../pf2e-resolution-core/…`, `../../pf2e-automatic-ability-resolution/…`). In Foundry those are the module folders. On disk they are aliases next to this folder.

MIT licensed (see [LICENSE](LICENSE)). The Pathfinder rules text it reads comes from the PF2e system under Paizo's ORC license.

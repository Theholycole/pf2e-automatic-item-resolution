# PF2e Automatic Item Resolution

A Foundry VTT module (id `pf2e-automatic-item-resolution`) that automates Pathfinder 2e items. It works in live play and, through the [PF2e Resolution Core](https://github.com/Theholycole/PF2e-Automation-Core), in the PF2e Combat Simulator. Consumables come first: potions, elixirs and mutagens; then poisons and bombs; then talismans, oils and snares. Activated permanent items come later.

Spell-casting items (scrolls, wands, staves, catalysts) belong to PF2e Automatic Spell Resolution.

**Status (2026-10-15): set up; batch 1 (potions, elixirs, mutagens) designed, not live yet.** See [docs/design.md](docs/design.md) and [docs/census.md](docs/census.md). Not published on GitHub yet.

- The compiler (`src/compiler/`) turns a consumable into a plan for the core. It reads the text with PF2e Automatic Ability Resolution's compiler, and adds what the item's own data says:
  - who drinks it;
  - the healing PF2e rolls for it;
  - its linked PF2e Effect.
- 732 of the 1,508 consumables it handles compile to a plan the core resolves with no gaps.
- In Foundry it registers that compiler with the core (`registry.planFor(item)`). The live confirmation cards come with batch 1.

## Requirements

Foundry 14 with the PF2e system 8.5 or later, plus:

- [PF2e Resolution Core](https://github.com/Theholycole/PF2e-Automation-Core), which resolves the plans;
- [PF2e Automatic Ability Resolution](https://github.com/Theholycole/pf2e-automatic-ability-resolution), whose compiler reads the item text.

## Development

- Tests: `node --test --test-isolation=none test/*.test.js`
- Census: `node tools/census.mjs`. It reads the PF2e system's packs straight from LevelDB, with no Foundry login, and rewrites `reports/census.json` and `docs/census.md`.
- Imports reach the sibling modules by their ids (`../../pf2e-resolution-core/…`, `../../pf2e-automatic-ability-resolution/…`). In Foundry those are the module folders. On disk they are aliases next to this folder.

MIT licensed (see [LICENSE](LICENSE)). The Pathfinder rules text it reads comes from the PF2e system under Paizo's ORC license.

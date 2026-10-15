# PF2e Automatic Item Resolution

A Foundry VTT module (id `pf2e-automatic-item-resolution`) that automates Pathfinder 2e items. It works in live play and, through the [PF2e Resolution Core](https://github.com/Theholycole/PF2e-Automation-Core), in the PF2e Combat Simulator. Consumables come first: potions, elixirs, mutagens, bombs, poisons, talismans, oils and snares. Activated permanent items follow.

Spell-casting items (scrolls, wands, staves, catalysts, spellhearts) belong to PF2e Automatic Spell Resolution.

**Status (2026-10-15): built and tested offline against a stand-in for Foundry; not yet checked in Foundry.** See [docs/design.md](docs/design.md), [docs/census.md](docs/census.md) and [docs/census-permanent.md](docs/census-permanent.md). Not published on GitHub yet.

## In play

Use an item as PF2e always does: its **Use** button, a bomb's **Strike**, or posting an item to chat. A confirmation card follows in the chat, and nothing changes until someone presses its button. The item's owner can press it, or the GM; a player's press is carried out by the GM's client.

- **Potions, elixirs, mutagens:** the card says what drinking does: "Heals 6 Hit Points (PF2e's roll of 1d8)", "Effect: Elixir of Life", "concealed for 5 minutes".
  - Pick the **drinker**: yourself, or a creature next to you to feed it to. Apply heals them and makes the Effects at the item's grade.
  - Healing uses PF2e's own roll. PF2e's apply buttons on that roll are taken away so nothing is healed twice, and a dying creature healed to 1 HP or more stops dying.
- **Bombs:** after PF2e's damage roll, the card lists the creatures within 5 feet of the target, all ticked; untick any the splash shouldn't reach.
  - Apply gives them PF2e's own splash and puts the riders on the target ("off-guard until the start of your next turn", "frightened 2" on a critical hit).
  - When the bomb calls for a save, it posts the save card for whoever has to save.
- **Injury poisons:** the card asks which piercing or slashing weapon to coat. The coated weapon's next hit posts the poison's save card for the target; a miss keeps the poison, and a critical miss wastes it.
- **Contact, inhaled and ingested poisons, drugs, and other items with a save** (Spark Wafer, Pyronite): target the creatures, then press the card's button. Each gets its save card. A breath potion's card stays open until the breath is used, and for its whole hour when it can breathe again after a recharge.
- **Items that cast a spell** (Invisibility Potion, Fade Band, Truesight Potion): the spell module casts it, on the drinker, on you, or at the creatures you target.
- **Items used by Striking** (Fear Gem, Duelist's Beacon, Aurochs' Might Tattoo): Apply readies your next Strike this turn. When PF2e's attack roll hits, the riders for its degree go on the target ("frightened 1, or frightened 2 on a critical hit"), and a save the Strike calls for gets its save card. A miss spends it.
- **Rerolls** (Lucky Rabbit's Foot, Starfaring Cloak, Mail of Luck): after the roll that triggers it, Apply has PF2e reroll it, keeping the new, the higher or the lower result as the item says.
- **Snares and lasting areas** (Cryomister, Pheromone Flare): the GM places the area. A snare goes off once, for the first creature to enter its square.
- **Permanent items:** post the item to chat and a card lists its activations, each with an Activate button. One that gives a Focus Point (a Specialist's Ring, a Bloodline Robe) adds it up to the pool's maximum, and in an encounter an unspent point is taken back at the end of the turn. A "once per day" activation is counted, with a warning if it's used again; the GM decides. This trigger is a proposal still to confirm.
- **Anything else with a duration:** a note Effect on the creature with the item's text, for that time.

The census counts what's played: 1,066 of the 1,486 consumables this module handles get a card.

## Requirements

Foundry 14 with the PF2e system 8.5 or later, plus:

- [PF2e Resolution Core](https://github.com/Theholycole/PF2e-Automation-Core), which resolves the plans;
- [PF2e Automatic Ability Resolution](https://github.com/Theholycole/pf2e-automatic-ability-resolution), whose compiler reads the item text and whose save cards and zones the item cards use.

[PF2e Automatic Spell Resolution](https://github.com/Theholycole/pf2e-automatic-spell-resolution) casts the spells items cast, and the items it acts on itself (its `claims`) are left to it. [Pseudo Afflictions](https://foundryvtt.com/packages/pseudo-afflictions) runs a poison's stages once its save card hands them on.

## Development

- **The compiler** (`src/compiler/`, pure) turns an item into a plan for the core. It reads the text with the ability module's compiler and adds what the item's own data says: who drinks it, the healing PF2e rolls, its linked PF2e Effect or a spell's Effect at the item's rank, its own row, or a note.
  - `bombs.js`: splash, riders and saves.
  - `snares.js`: zones.
  - `permanent.js`: activations; `focus.js`: Focus Points; `strikes.js`: items used by Striking; `rerolls.js`: rerolls.
- **Live play** (`scripts/`): `live.js` (the Use hook and the item card), `bombs.js`, `poisons.js`, `casts.js`, `zones.js`, `activations.js`, `focus.js`, `strikes.js`, `rerolls.js`, and `foundry.js` (shared helpers). Pure card state and HTML live in `src/live/`, and `src/live/route.js` decides which card an item gets.
- **Tests:** `node --test --test-isolation=none test/*.test.js`. The live layer runs against a stand-in for Foundry (`test/support/fake-foundry.mjs`) with PF2e's real items and Effects from its packs.
- **Live check** in the disposable world pftest: `tools/live-check.mjs`, imported in the browser. It uses its own "PFTEST ITEM" data and cleans up only that.
- **Censuses:** `node tools/census.mjs` (consumables) and `node tools/census-permanent.mjs` (activations). Both read the PF2e system's packs straight from LevelDB, with no Foundry login.
- Imports reach the sibling modules by their ids (`../../pf2e-resolution-core/…`, `../../pf2e-automatic-ability-resolution/…`). In Foundry those are the module folders; on disk they are aliases next to this folder.
- `api` (`game.modules.get("pf2e-automatic-item-resolution").api`):
  - `compileItem(item)` and `handlesItem(item)`;
  - `live.apply(messageId, choices)` applies a card from code.

MIT licensed (see [LICENSE](LICENSE)). The Pathfinder rules text it reads comes from the PF2e system under Paizo's ORC license.

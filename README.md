# PF2e Automatic Item Resolution

A Foundry VTT module (id `pf2e-automatic-item-resolution`) that automates Pathfinder 2e items. It works in live play and, through the [PF2e Resolution Core](https://github.com/Theholycole/PF2e-Automation-Core), in the PF2e Combat Simulator. Consumables come first: potions, elixirs, mutagens, bombs, poisons, talismans, oils and snares. Activated permanent items follow.

Spell-casting items (scrolls, wands, staves, catalysts, spellhearts) belong to PF2e Automatic Spell Resolution.

**Status (2026-10-19): built, tested offline against a stand-in for Foundry, and live-checked in the disposable world pftest (all 260 cases of `tools/live-check.mjs` pass on Foundry 14.367 and PF2e 8.6.1).** See [docs/design.md](docs/design.md), [docs/census.md](docs/census.md), [docs/census-permanent.md](docs/census-permanent.md) and [docs/census-third-party.md](docs/census-third-party.md).

## Install

In Foundry's setup screen, **Add-on Modules → Install Module**, paste this manifest URL:

```
https://github.com/Theholycole/pf2e-automatic-item-resolution/releases/latest/download/module.json
```

Foundry offers to install the modules it requires (the core and the ability module) too. Enable it in the world with them.

## In play

Use an item as PF2e always does (its **Use** button, a bomb's **Strike**), or a permanent item's Activate button on the sheet. A confirmation card follows in the chat, and nothing changes until someone presses its button. The item's owner can press it, or the GM; a player's press is carried out by the GM's client.

- **Potions, elixirs, mutagens:** the card says what drinking does: "Heals 6 Hit Points (PF2e's roll of 1d8)", "Effect: Elixir of Life", "concealed for 5 minutes".
  - Pick the **drinker**: yourself, or a creature next to you to feed it to. Apply heals them and makes the Effects at the item's grade.
  - A tea's card has a **Tea Ceremony** tick: ticked, the tea lasts the ceremony's longer time and does what it adds (Longnight Tea removes fatigued).
  - Healing uses PF2e's own roll. PF2e's apply buttons on that roll are taken away so nothing is healed twice, and a dying creature healed to 1 HP or more stops dying.
- **Counteracting potions** (Surging Serum, Bottled Catharsis, Panacea, Fu Water): pick who drank it, and the card lists what it can counteract on them, with the DC and rank PF2e knows; the GM fills in any it doesn't. Apply rolls the item's counteract check for each one ticked and ends what it counteracts.
- **Bombs:** after PF2e's damage roll, the card lists the creatures within 5 feet of the target, all ticked; untick any the splash shouldn't reach.
  - Apply gives them PF2e's own splash and puts the riders on the target ("off-guard until the start of your next turn", "frightened 2" on a critical hit).
  - When the bomb calls for a save, it posts the save card for whoever has to save.
  - Any other Strike with splash gets the same card: Elemental Ammunition, whose own PF2e rules add its damage and splash to the Strike that fires it.
- **Injury poisons:** the card asks which piercing or slashing weapon to coat. The coated weapon's next hit posts the poison's save card for the target; a miss keeps the poison, and a critical miss wastes it.
- **Contact, inhaled and ingested poisons, drugs, and other items with a save** (Spark Wafer, Pyronite): target the creatures, then press the card's button. Each gets its save card. A breath potion's card stays open until the breath is used, and for its whole hour when it can breathe again after a recharge.
- **Items that cast a spell** (Invisibility Potion, Fade Band, Truesight Potion, Crystal Ball's Scrying, Mask of the Mantis): the spell module casts it, on the drinker, on you, or at the creatures you target. When the item offers several spells, the card has a picker.
- **Items used by Striking** (Fear Gem, Duelist's Beacon, Aurochs' Might Tattoo): Apply readies your next Strike this turn. When PF2e's attack roll hits, the riders for its degree go on the target ("frightened 1, or frightened 2 on a critical hit", Battering Ammunition's push), and a save the Strike calls for gets its save card. A miss spends it. A Strike that deals more (Mantle of the Tikbalang's "an additional 4d6 mental damage", Pick of Arcane Accuracy's "+1 status bonus to this Strike") gets PF2e's own damage dice and bonus for that Strike, spent by its damage roll.
- **Rerolls** (Lucky Rabbit's Foot, Starfaring Cloak, Mail of Luck): after the roll that triggers it, Apply has PF2e reroll it, keeping the new, the higher or the lower result as the item says. A reroll with a bonus (Redsand Hourglass's +4) is rolled by the card itself, with its degree against the same DC; the GM uses that result.
- **Spellguns** (Torrent, Sparking, Moonlit): pick your spell attack or firearm attack on the card, target the creature, and the ability module's card rolls it against its AC, with the damage and what each degree adds.
- **Damage outright** (Forge Warden, Kortos Diamond, Murderer's Knot): the card's button sends it to the creatures you target, through the ability module's card, which rolls it and applies it with PF2e's resistances.
- **Rune oils** (Burial Oil, Oil of Swiftness): pick the weapon on the card, and it has the rune for the item's time (PF2e's own AdjustStrike, as its Wounding Oil).
- **Lowering a condition** (Lion Badge, Pepper Poultice, Coin of Comfort): the item card lowers your frightened or sickened as the item says. When you pick one of several (Golden-Souled Yang Na), the card has a picker. When it's an ally's or a creature's (Fearless Sash, Banner of Common Cause, Fearcutter), target them first.
- **Effects for allies or another creature** (Warpipes, Constant Crosier, Therapeutic Snap Peas, Commander's Signet's "a creature you touch", Chatterer of Follies' adjacent foe): target the creatures it's for, your own token too when it helps you, and Apply gives each the Effect or the healing.
- **A new Speed or sense** (Umbral Wings' fly Speed, Buoyant Buckle's swim Speed, darkvision): an Effect with PF2e's own BaseSpeed or Sense rule for the item's time.
- **An item's own toggle** (Four-Ways Dogslicer's Gem Twist, Pharasmin Visor, Broadleaf Shield): pick the way on the card, and Set switches PF2e's toggle for the item to it. The weapon has to be wielded, the item worn or invested.
- **Necklace of Fireballs:** pick the bead on the card; its button sends a basic Reflex save in a 20-foot burst to the creatures you target.
- **Buffs for you and your allies in an area** (Knight Captain's Lance, Snare of Speed): target them, and the card's button gives each the bonus.
- **Ending persistent damage** (Quenching Potion, Antivenom Potion, Ring of Torag, Cauterizing Torch): the item card rolls PF2e's own flat check to end your persistent damage of the item's types, at DC 10 when the item counts as particularly appropriate help.
- **Resistance** (Armorskin Robes' 5 to slashing and piercing for 10 minutes): the item card gives you an Effect with PF2e's own Resistance rules. Resistance against the one hit that triggered it (Deflecting Parry, Ferrofluid Urchin) is a bonus for a moment, below.
- **Bonuses against a creature or an effect** (Night Sky Elixir's +1 to saves against devils' effects, Scholar's Drop's against being fatigued, Trusty Helmet's AC against ranged attacks): PF2e's own modifier, only for those rolls.
- **Rolling twice** (Sunweave, Kinetic Wraps of Strength, Gorum's Tear): before the roll, Apply gives you an Effect with PF2e's own "roll twice and take the better" rule for that roll (your initiative, an Athletics check to Shove, your next attack roll). PF2e removes it after that roll. A bonus for a moment (Eclipse's +2 to the Stealth check, Sparkwarden's +1 to AC and saves for the turn, Shacklebreaker's Fortitude DC) is the same card: PF2e's own modifier on you for that roll or that long.
- **Skill actions with an item** (Onyx Panther's Sneak, Crying Angel Pendant's First Aid, Coldstar Pistols' Feint): target the creature when the action is aimed at one, then Apply rolls PF2e's own action with the item's bonus. Trip, Grapple, Demoralize, Feint and the other basic actions then put their result on the target.
- **Snares and lasting areas** (Cryomister, Pheromone Flare): the GM places the area. A snare goes off once, for the first creature to enter its square.
- **Permanent items:** on the character sheet's inventory, an item with activations gets an Activate button (a bolt) for each, after its name; its tooltip says the actions, how often and how many uses are left. Pressing it posts that activation's card. One that gives a Focus Point (a Specialist's Ring, a Bloodline Robe) adds it up to the pool's maximum, and in an encounter an unspent point is taken back at the end of the turn. A "once per day" activation is counted; used again, the GM gets a warning and decides.
- **Runes:**
  - **Etching from a runestone:** a rune item in an inventory (Vorpal, Striking, Reinforcing Rune…) has an Etch button (a hammer) instead of its rune's own buttons. Its dialog lists the owner's weapons, armor or shields the rune fits (by its usage: a melee weapon, a slashing one, heavy armor…), and an Energy-Resistant rune's energy. Tick the Crafting check when a character etches it themselves: the rune's level-based DC, etched only on a success; untick it for a rune etched for them. A fundamental rune upgrades the item's; a property rune takes a free slot (its potency rune's, or PF2e's own under Automatic Bonus Progression) or replaces its lesser grade. The runestone is used up.
  - **An etched rune's activations** (Vorpal's Snicker-Snack, Hauling, Bolka's Blessing, Deathless) get Activate buttons on the weapon or armor they're etched onto, named for the rune.
  - **On a critical hit** (PF2e only notes these): after PF2e's attack roll crits, each rune's card goes to the creature hit. Thundering, Frost and Brilliant get their save; Impactful's push is the wielder's choice. Crushing, Fearsome, Flickering, Merciful and Nightmare apply with no roll. Vitalizing is only against undead, Giant-Killing only against giants (the greater one with its save), Bloodthirsty only against a bleeding target. A specific weapon's own critical-hit text works the same way (Gluttonous Spear, Tidal Crossbow). PF2e rolls the runes' damage itself.
- **Spellstrike Ammunition:** its Activate opens a dialog of your spells that target another creature, at each rank up to the ammunition's maximum. PF2e spends the slot, and one piece is split off and named for the spell. When the Strike that fires it hits, the spell module casts the spell at the creature hit, the hit as its spell attack and your spell DC for its save. A miss loses it.
- **Saves against your own DC** (The Avalanche, Penultimate Heartbeat, Chroma Kaleidoscope, Lung Bloodstone's Admonish): the card's DC is your class DC or spell DC, as the item says. With neither, the GM is told to roll it.
  - **Setting "Item DCs from their user"** (world, off by default): every save another creature attempts against an item's own DC uses the user's class DC or spell DC instead, when that's higher. So do the DCs of spells an item casts. It covers consumables, activations, bombs' saves, poisons, snares, Strike riders and etched runes. The card says when it raised a DC. A save the item makes its own user attempt keeps the item's DC. NPCs have a class DC from their level, so an NPC's item DCs rise to at least that.
- **Anything else with a duration:** a note Effect on the creature with the item's text, for that time.
- **Mythic Points:** a use whose effect spends a Mythic Point (Chromatic Robe, the Mythic runes, Timeflaying Blade), and an item's cast of a spell with the mythic trait, spend one of its user's Mythic Points when its card applies. A user with none left gets a refusal and the card stays open. A line in the chat says what was spent. Mythic Resilient and Mythic Armor Potency have two buttons, for a mythic source and for any other. Mythic Striking rerolls the damage and keeps the higher total. Mythic Weapon Potency rerolls the attack at mythic proficiency (level + 10).
  - **Setting "Hero Points instead of Mythic Points"** (world, off by default): those costs are paid with the user's Hero Points.
  - **A Mythic Point spent for more** (the Day's Breath potions, Vortex Pouch, Shield of Snakes, Sorshen's Scintillating Garment and Sinuous Guisarme): the card has two buttons, "As it is" and "Spending a Mythic Point". The second is the upgraded use, which costs the point. The breaths last 7 days, 30 days or a year, and the guisarme's spell has DC 50. Where the module can't do the upgrade itself, its text is a note on the card.

The census counts what's played: 1,132 of the 1,486 consumables this module handles get a card, and 1,617 of the 2,593 activations of permanent items. Third-party modules' items (Alchemists+, Tian Xia+…) go through the same readers; their census counts them by module. A module's own linked Effect is applied only when its rules match the item's text; otherwise the creature gets a note of the text. The exception is the 12 Effects you chose to have applied anyway. Their items' text would otherwise give only a note: the Effect is a grade off, or the check can't read its rules. Items whose text the module plays itself keep that.

## The module's own items

The module's compendium, **PF2e Automatic Item Resolution**, has two items that ask what they are when they first go into a creature's inventory. The picker opens for whoever put the item there. Close it without picking, and the item's sheet has a button to open it again.

- **Generic Spellgun:** pick a spell (type its name, or drop one onto the picker) and a rank, from the spell's own rank to 10. It becomes that spell's spellgun, such as "Fireball Spellgun (Rank 5)", at a scroll's level and price for that rank. It works like PF2e's spellguns: pick your spell attack or firearm attack on the card, target one creature within its 30-foot range increment, and the ability module's card rolls the attack against its AC.
  - A hit affects the target as if it had failed its save against the spell, and a critical hit as if it had critically failed. Fear's hit leaves it frightened 2; Fear's critical hit, frightened 3 and fleeing.
  - For a spell that makes a spell attack (Ray of Frost), the spell's own hit and critical hit apply.
  - A spellgun's Activate is 2 actions, so the spell is cast as with 2 actions: Disorienting Flash's 2d10, Heal's 30-foot version, and Force Barrage's 2 shards (4 at rank 3), all at the target with their damage combined.
  - A spell with damage and neither a save nor an attack deals its damage on a hit and double on a critical hit; the rest of it is the GM's. A healing spell's healing isn't damage, so those aren't offered.
  - The spell is heightened to the rank picked, and an area spell affects only the one target. A spell a hit can't carry, such as Banishment, isn't loaded: pick another.
  - Used before a spell is loaded, it comes back to the inventory, and nothing happens.
- **Gun Staff:** pick a two-handed firearm (Arquebus, Flintlock Musket, Blunderbuss…) and a staff. It becomes one item like PF2e's Musket Staff of Force, for example "Arquebus Staff of Fire":
  - a +1 firearm of that kind (or the staff's runes, if they're better);
  - a Reinforced Stock attached, with its own Strike and the gun staff's runes, which follow any rune etched later;
  - the staff's spells, which PF2e Dailies prepares as for any staff.
  - Its level is the staff's (one higher for the added +1) or the firearm's, whichever is higher. Its price is the staff's, the firearm's and the +1's, so a Staff of Fire with a Flintlock Musket is 4th level and 100 gp, as the Musket Staff is.
  - One-handed firearms aren't offered. Until it's merged, it's a flintlock musket.

## Requirements

Foundry 14 with the PF2e system 8.5 or later, plus:

- [PF2e Resolution Core](https://github.com/Theholycole/PF2e-Automation-Core) v0.7.1 or later, which resolves the plans (and keeps damage materials such as silver, and a creature's Perception check against an item's DC);
- [PF2e Automatic Ability Resolution](https://github.com/Theholycole/pf2e-automatic-ability-resolution) v0.8.4 or later, whose compiler reads the item text and whose save cards, conjured creatures, zones (and the areas snares leave, and saves or damage only for creatures with some traits), condition floors and conditions that last as long as a persistent damage the item cards use.

[PF2e Automatic Spell Resolution](https://github.com/Theholycole/pf2e-automatic-spell-resolution) (v0.10.0 or later) casts the spells items cast, and the items it acts on itself (its `claims`) are left to it. On an item it claims only for an item spellshape or an item cast, its other activations are this module's. Without it, a cast card says to cast the spell by hand. [Pseudo Afflictions](https://foundryvtt.com/packages/pseudo-afflictions) runs a poison's stages once its save card hands them on.

## Development

- **The compiler** (`src/compiler/`, pure) turns an item into a plan for the core. It reads the text with the ability module's compiler and adds what the item's own data says: who drinks it, the healing PF2e rolls, its linked PF2e Effect or a spell's Effect at the item's rank, its own row, or a note.
  - `bombs.js`: splash, riders and saves.
  - `snares.js`: zones.
  - `generic-spellgun.js`: a spell's plan on a spellgun's hit, heightened to its rank; `gun-staff.js`: a firearm and a staff merged.
  - `runes.js`: etched runes' activations; `rune-strikes.js`: runes on a critical hit; `etching.js`: a runestone's rune onto an item; `save-or.js`: a save or death, a push or a pull.
  - `permanent.js`: activations; `focus.js`: Focus Points; `strikes.js`: items used by Striking; `rerolls.js`: rerolls; `fortune.js`: rolling twice; `cast-words.js`: casts in words; `strike-damage.js`: what a Strike adds; `item-actions.js`: skill actions; `counteract.js`: counteracts; `tea.js`: the Tea Ceremony.
- **Live play** (`scripts/`): `live.js` (the Use hook and the item card), `bombs.js`, `poisons.js`, `casts.js`, `zones.js`, `activations.js`, `focus.js`, `strikes.js`, `rerolls.js`, `fortune.js`, `item-actions.js`, `counteract.js`, `toggle.js`, `generic-items.js` (the module's own items' pickers), `etching.js` (the Etch button), `rune-strikes.js` (runes on a critical hit), and `foundry.js` (shared helpers). Pure card state and HTML live in `src/live/`, and `src/live/route.js` decides which card an item gets.
- **Mechanics you can give more items:** [docs/mechanics.md](docs/mechanics.md) lists the mechanics a few items needed (a rune lent to a weapon, a choice of PF2e actions, a condition until the end of a rage, all of an item's linked Effects at once…), which items use them, and the table in each where another item can be added.
- **The compendium** is built from `packs/_source/items/*.json` with `node tools/build-packs.mjs`, using Foundry's own LevelDB library, with no world using the pack.
- **Tests:** `node --test --test-isolation=none test/*.test.js`. The live layer runs against a stand-in for Foundry (`test/support/fake-foundry.mjs`) with PF2e's real items and Effects from its packs.
- **Live check** in the disposable world pftest: `tools/live-check.mjs`, imported in the browser. It uses its own "PFTEST ITEM" data and cleans up only that.
- **Censuses:** `node tools/census.mjs` (consumables) and `node tools/census-permanent.mjs` (activations) read the PF2e system's packs straight from LevelDB, with no Foundry login. `node tools/census-third-party.mjs` reads the installed modules' packs the same way; it commits counts only and keeps the rows in `.cache/`, which git ignores.
- Imports reach the sibling modules by their ids (`../../pf2e-resolution-core/…`, `../../pf2e-automatic-ability-resolution/…`). In Foundry those are the module folders; on disk they are aliases next to this folder.
- `api` (`game.modules.get("pf2e-automatic-item-resolution").api`):
  - `compileItem(item)` and `handlesItem(item)`;
  - `live.apply(messageId, choices)` applies a card from code;
  - `live.activate(itemUuid, index)` activates a permanent item's activation, as its sheet button does (an etched rune's: index `"rune:<key>:<n>"`);
  - `live.etch(runeItem, targetItem, { craft, energy })` etches a runestone's rune, as its Etch dialog does.

MIT licensed (see [LICENSE](LICENSE)). The Pathfinder rules text it reads comes from the PF2e system under Paizo's ORC license.

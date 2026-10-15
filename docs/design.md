# Design: the module's shape, batch 1 (potions, elixirs, mutagens) and batch 2 (bombs, poisons)

Status, 2026-10-15: the user answered the design's questions the same day (the recommendations). Everything marked *built* is built and tested offline. The live cards are written but **not yet checked in Foundry**: pftest was busy (a user was logged in, with no Holder).

## Where things stand

From [census.md](census.md) (PF2e 8.6.1 packs):

- **1,724** consumables. **216** are the spell module's (scrolls, wands, catalysts, spell gems), so this module handles **1,508**.
- **745** (49%) compile to a plan the core resolves with no gaps. It was 532 with the ability compiler alone; the item's own readings below added the rest. **5** more are partial and **272** (18%) get only a note Effect; both are counted apart. **25** are casts, for the spell module.
- **171** bombs are `weapon` items (group `bomb`). PF2e already Strikes with them (batch 2).
- Batch 1 covers **400** items: potion 183, elixir 149, mutagen 68. When the design was proposed, 236 of them resolved, 35 were builtins and 129 had no plan. [census.md](census.md) has today's counts.

## What PF2e does itself when a consumable is used (8.6.1, `ConsumablePF2e#consume`)

- Scrolls, wands and spell gems cast their spell (the spell module's).
- Anything else posts a "uses X" message flagged `flags.pf2e.origin = { uuid, sourceId, type: "consumable" }`. When the item has `system.damage` (28 healing items, 53 damage ones), that message is a PF2e damage roll of it, with PF2e's own apply buttons. PF2e rolls a potion's healing, but never applies it on its own.
- It then takes off a use or a dose, and deletes the item at 0. So by the time a hook sees the message, the last dose's item may be gone: the live layer keeps a copy as the item is deleted, and falls back to its `sourceId` in the compendium.
- It **never applies the linked Effects**. All 196 Effect items that the uncovered items link exist and carry PF2e rules (ChoiceSet, FlatModifier, Resistance, Sense, TempHP…). Applying the Effect automates the item as far as PF2e's rules go, and PF2e asks its ChoiceSets (Potion of Resistance's damage type) when the Effect is created.
- Only third-party ("+") consumables are claimed by the spell module's item readers today (item casts, the focus bun, counteract features, backfire ammo), never a PF2e system one. When third-party items come, ask the spell session for a `claims(item)` export, so the two modules never both act on one Use.

## The compiler (pure; `src/compiler/`)

- `compileItem(item)` reads the text with the ability module's compiler, as an action with the item's own activation (`activation.js`: glyphs, minutes, named activations). Then `consumables.js` fits the plan to the item:
  - **built:** *who it's for*: `item.recipient` is `"drinker"` for potions, elixirs, mutagens, drugs and anything drunk or eaten, otherwise `"user"`. A drinker item's Effects go to the plan's target (the drinker: the user, or an adjacent creature they feed it to), not always to the user.
  - **built:** *PF2e's healing*: `system.damage` of kind healing → `resolution.native.healing` (the core's healing family; with an Effect, the effect family heals too, as Soothe does). `item.pf2eRoll` tells live play that PF2e has rolled it already.
  - **built:** *the one linked Effect* the ability compiler didn't read → an `effect` plan. Items linking an Effect per stage or degree (Crackling Bubble Gum, Grit) are left to readings that know which one applies.
  - **built:** "gains the effects of a 2nd-rank *Oaken Resilience* for 10 minutes": PF2e's own Spell Effect at that rank and for that time, when the spell-effects pack has one. Otherwise it stays the ability compiler's cast, which is the spell module's to cast.
  - **built:** *the item's own row* (`rows.js`, the core's check family with `roll: "automatic"`): a condition the text puts on the drinker with its own time ("making you concealed for 5 minutes"). The reader is deliberately strict: not from a trigger, a later event, a failed check, stages, an item with a choice of uses, or one that links PF2e Effects. Bonuses and penalties are read only with plain selectors, so "to Balance" or "against diseases" are left out. Temporary Hit Points and healing are read only when stated plainly.
  - **built:** *note only*: an item with a time and nothing else the module reads gets a note Effect with its text for that time. That's the user's note-Effect rule for spells, and the census counts these apart. The time can be written "Duration 1 minute", "The duration is 1 hour", "with a duration of 10 minutes" or rolled ("for 2d4 rounds").
  - **built:** *partial*: a row that reads only part of the text also carries the note and is counted apart ("Effect + note"). Immovable Potion's "DC to move you is 40" and Megaphone Mutagen's auditory benefit are like this. A sentence restating PF2e's usual rule ("As usual …") doesn't count.
- Next readings for batch 1, by size:
  1. Counteracting potions (Surging Serum, Bottled Catharsis, Potion of Stable Form): the core's affliction-care family (counteract), with the item's counteract modifier and rank. This needs live code of its own (pick the Effect to counteract, roll the check), so it waits until it can be checked in Foundry.
  2. Resistance to a chosen type with no Effect (Potion of Resistance, Mutagenic Renovator): an Effect made with PF2e's Resistance rule, the type picked on the card.
  3. Items with two activations (the teas' Tea Ceremony): one option each.
  4. Out of combat (Disguise, Gender Transformation, Ration Tonic, Bookthief Brew): the GM's, as the ability module's "no-effect" with a reason.

## Live play (built; the user's answers of 2026-10-15)

`scripts/live.js` (Foundry) and `src/live/card.js` (pure, tested):

1. PF2e's Use message → on the active GM's client, the item's **confirmation card** right after it. Nothing changes until Apply.
   - The used item is read live if it's still there. Otherwise from the copy kept as PF2e deleted it (the last dose), else from its compendium source.
   - Plans played on the card: healing, PF2e Effects, and the item's own automatic row.
2. The card says what Apply will do: "Heals 6 Hit Points (PF2e's roll of 1d8)", "Effect: Elixir of Life", "concealed for 5 minutes".
   - It has a **drinker** choice: the user by default, or a creature within 5 feet to feed it to.
3. **Healing:** the card heals with PF2e's own rolled total. PF2e's apply buttons are taken off that one Use message (`flags.pf2e.suppressDamageButtons`, with the `.damage-application` section removed as it renders), so it can't be healed twice.
   - The heal goes through PF2e's `applyDamage`, so its healing bonuses apply and its healed message comes with undo.
   - Dying then ends and Wounded rises, through the core's `api.dying`.
4. **Apply:** the item's owner or the GM. A player's press goes by socket (`module.pf2e-automatic-item-resolution`) to the active GM's client, which checks that the player owns the user's actor and makes the changes. Feeding an ally the player doesn't own works too.
5. **Apply code is reused, not copied.** PF2e Effects are made here, because their grade, rank and time are the item's:
   - the shared equipment Effects' ChoiceSet is preset from the item's slug or compendium source, so there's no prompt once the last dose is gone;
   - a Spell Effect gets its `system.level` and the item's time.
   Every other change (temporary HP, timed conditions, modifiers, note Effects, the affliction hand-off) goes through the ability module's `api.live.applyChange`.

## Batch 2: bombs and poisons (built offline, 2026-10-15)

**Bombs** (`src/compiler/bombs.js`, `src/live/bomb-card.js`, `scripts/bombs.js`). PF2e Strikes with a bomb and rolls its damage, persistent damage and splash. Since 8.6.1 it adds one splash-only roll per damage type to the damage message. After that message, the module's card:
- **Splash:** lists the creatures within 5 feet of the target, all ticked; the user or the GM can untick any. The amount is PF2e's own splash roll, so the thrower's splash feats are in it.
  - On a hit, PF2e's main roll already includes the target's splash, so only the others are listed.
  - On a miss, the target is listed too. A critical miss posts nothing.
  - The splash-only rolls' apply buttons come off PF2e's message (the healing rule), but its main damage stays PF2e's.
- **Riders** for the Strike's degree, read strictly: "On a hit, the target becomes off-guard until the start of your next turn", "Frightened 1, or Frightened 2 on a critical hit", Speed and other penalties, "On a critical hit … prone". That's 38 of 171 bombs.
  - "its next turn" is the target's turn: anchor "target-turn", which the ability module's applyChange counts on the target's turns.
  - Saves (Skunk Bomb, Blasting Stone), weaknesses and lingering clouds are left for later.

**Injury poisons** (`src/live/poison-card.js`, `scripts/poisons.js`), 45 items. PF2e leaves these to the table.
1. Using one posts a card: which piercing or slashing weapon to coat, held ones first.
2. Apply puts an Effect on the user that marks the weapon, one poison per weapon.
3. That weapon's next Strike that hits posts the poison's save card on the target, through the ability module's `api.live.postCard`; its affliction goes to Pseudo Afflictions as monster venom does. A miss keeps the poison. A critical miss wastes it ("expend it as normal for an injury poison by either hitting a target or critically failing an attack roll").
- Contact, inhaled and ingested poisons are later. The ability compiler reads them as Strike riders too, which fits only injury.

**Casts:** an item that grants a spell PF2e has no Effect for (Fade Band's Invisibility, Truesight Potion with its counteract +25) compiles to the ability compiler's cast-spell builtin. Live play waits for a cast-from-item export, asked of the spell session: casting through PF2e without leaving an entry on a PC's sheet.

## The simulator (the auto-combat session's)

The plans were handed over on 2026-10-15. That session checked their shapes, and is waiting for the user's policy on when PCs use consumables before building it. Once built, it reads a PC's consumables through `registry.planFor(item)`, with their quantity and uses. Its planner then decides when to drink: healing when low, buffs as the fight starts, the action it costs, and whether to feed an adjacent ally. Its snapshot's "consumable" gaps then shrink.

## Asks of the other sessions

- **Ability module:** done 2026-10-15:
  - ability 1cd0e31 and a54d84b: `compileAbility` kept stable; `api.live.applyChange(change, state)` exported; the readZone crash fixed (Cold Comfort, Hampering Snare);
  - ef25d65: `api.live.postCard` and the "target-turn" duration anchor; readConditions, STAGE_CONDITIONS and readPenalties kept stable.
- **Core:** done 2026-10-15:
  - `api.dying` (f8e5d41), moved from the spell module;
  - `check.roll: "automatic"` accepted by saveGaps and CHECK_ROLLS (3875c84).
- **Spell module:** asked 2026-10-15 for `castFromItem` (the casts above). Later, `claims(item)` for the third-party ones.
- **Simulator:** the hand-off above, once the cards are live-checked.

# Design: the module's shape and batch 1 (potions, elixirs, mutagens)

Status: proposal, 2026-10-15. The compiler parts marked *built* are done offline; the live parts wait for the user's OK.

## Where things stand

From [census.md](census.md) (PF2e 8.6.1 packs):

- **1,724** consumables. **216** are the spell module's (scrolls, wands, catalysts, spell gems), so this module handles **1,508**.
- **732** (49%) compile to a plan the core resolves with no gaps. It was 532 with the ability compiler alone; the item's own linked Effect and PF2e's healing data added 200.
- **171** bombs are `weapon` items (group `bomb`). PF2e already Strikes with them (batch 2).
- Batch 1 covers **400** items: potion 183, elixir 149, mutagen 68. **236** of them resolve now, **35** are builtins and **129** have no plan.

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
  - **built:** *note only*: an item with a time and nothing else the module reads gets a note Effect with its text for that time. That's the user's note-Effect rule for spells, and the census counts these apart.
- Next readings for batch 1, by size:
  1. Counteracting potions (Surging Serum, Bottled Catharsis, Potion of Stable Form): the core's affliction-care family (counteract), with the item's counteract modifier and rank.
  2. Resistance to a chosen type with no Effect (Potion of Resistance, Mutagenic Renovator): an Effect made with PF2e's Resistance rule, the type picked on the card.
  3. Items with two activations (the teas' Tea Ceremony): one option each.
  4. Out of combat (Disguise, Gender Transformation, Ration Tonic, Bookthief Brew): the GM's, as the ability module's "no-effect" with a reason.

## Live play (needs the user's OK)

1. PF2e's Use message → on the active GM's client, the module's **confirmation card** right after it. Like the ability module's cards, nothing changes until Apply.
2. The card names the item and says what Apply will do: "heals 6 (PF2e's roll above)", "Effect: Elixir of Life".
   - It has a **drinker** choice: the user by default, or a creature next to them (5 feet) to feed it to. This follows PF2e: feeding a potion to an adjacent creature is the same action.
   - Effects go on the drinker. Healing goes to the drinker unless it has void healing.
3. **Healing: question 1.** PF2e's roll message already has apply-healing buttons, and the card would heal too.
4. **Who presses Apply: question 2.** The ability module's cards are GM-only (monsters are the GM's), but potions are mostly the players'.
5. **Cards and apply code are reused, not copied**: the ability module's card state, its apply of each change (heal, temporary HP, PF2e Effects, timed conditions, affliction hand-off, follow-ups, zones) and its card styles. Its session is asked for a stable export of those (the user's answer 2, 2026-10-15). The item module adds only what is item-specific: the drinker choice, PF2e's own roll, and keeping the deleted item.

## The simulator (the auto-combat session's)

Once batch 1 is live, its session is handed the plans. It reads a PC's consumables through `registry.planFor(item)`, with their quantity and uses. Its planner then decides when to drink: healing when low, buffs as the fight starts, the action it costs, and whether to feed an adjacent ally. Its snapshot's "consumable" gaps then shrink.

## Asks of the other sessions

- **Ability module** (its compiler and live cards):
  - keep `compileAbility` from `src/compiler/index.js` stable for this module's import;
  - export its card and apply code;
  - two texts throw in its compiler: Cold Comfort (Lesser) and (Greater), "Cannot read properties of null (reading '2')".
- **Spell module:** nothing for PF2e's own items. Later, `claims(item)` for the third-party ones, and the casting export for items that cast a spell (the user's answer 4).
- **Core:** nothing yet. The healing, effect, save and affliction-care families cover batch 1's plans.

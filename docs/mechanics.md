# Item mechanics you can give more items

Some items needed a mechanic of their own, which the module now has. Each mechanic finds its items by their wording. When an item's wording differs, you can still give it the mechanic by adding it to that mechanic's **EXTRA** table, keyed by the item's PF2e slug (the `system.slug` field, such as `burial-oil`). A table entry takes precedence over the wording.

After adding an entry, run `node --test --test-isolation=none test/*.test.js` and `node tools/census.mjs` (or `tools/census-permanent.mjs` for a permanent item's activation), and the item's row should change.

## A weapon lent a property rune for a while

- **What it does:** the item card lists its user's weapons. Apply gives the user an Effect with PF2e's own AdjustStrike rule, which adds the rune to the weapon picked for the item's time. This is how PF2e's own Wounding Oil works. For a weapon that lends itself the rune, there's no picker.
- **Items now:** Burial Oil, Burial Oil (Greater) (Vitalizing, Greater Vitalizing), Oil of Swiftness (Quickstrike).
- **Wording read:** "… the benefits of a Vitalizing rune for 1 minute", "gains the effects of a Greater Frost rune", and "Until the end of your turn". Items that link PF2e's own Effect for it keep that Effect (Wounding Oil, Ghost Oil, Oil of Keen Edges).
- **Add an item:** `src/compiler/rune-loans.js`, `EXTRA`:

  ```js
  export const EXTRA = Object.freeze({
      "my-oil": { name: "Ghost Touch", duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start" }, own: false }
  });
  ```

  `name` is the rune's English name as PF2e shows it. Live play finds PF2e's key from it (Vitalizing is PF2e's `disrupting`, Quickstrike `speed`). `own: true` gives the item itself the rune when it's a weapon.

## One of several PF2e actions, picked on the card

- **What it does:** the card picks the action. Apply rolls PF2e's own action, with the item's bonus and with a skill in place of the usual one, then puts that action's result on the target.
- **Items now:** The Bear (Grapple, Shove or Trip, +2 status), Blade of the Rabbit Prince (Trip or Disarm using Thievery, its potency as an item bonus).
- **Wording read:** "You attempt to Grapple, Shove, or Trip the creature …", "You gain a +2 status bonus to your check", "using Thievery instead of Athletics", "add the …'s item bonus to the check".
- **Add an item:** `src/compiler/item-actions.js`, `EXTRA`:

  ```js
  export const EXTRA = Object.freeze({
      "my-whip": { slugs: ["trip", "disarm"], bonus: { value: 1, type: "item" }, statistic: "acrobatics" }
  });
  ```

## An action at the item's modifier, when that's higher than its user's

- **What it does:** PF2e's own action, plus an untyped modifier of the difference when the user's skill is lower than the item's.
- **Items now:** the third-party Splitting Tree Splatters and the Lesser Ravenous Flytrap.
- **Wording read:** "You can use a +5 Athletics modifier for your Shove instead of your Athletics modifier if it is higher than your own".
- **Add an item:** the same `EXTRA` in `src/compiler/item-actions.js`:

  ```js
  "my-vine": { slug: "grapple", minimum: { value: 7, skill: "athletics" } }
  ```

## A condition until the end of its user's rage

- **What it does:** while its user is raging, the item card gives them an Effect that grants the condition (PF2e's GrantItem) for at most a minute. When the user's Rage Effect ends, the module removes it. If the user isn't raging, the card says so.
- **Items now:** the Barbarians+ Instinct Crowns (Wildblood, Elemental, Bloodrager): quickened.
- **Wording read:** "You become quickened until the end of your rage". What the extra action may be used for stays a note.
- **Add an item:** `src/compiler/rage-time.js`, `EXTRA`:

  ```js
  export const EXTRA = Object.freeze({
      "my-crown": { conditions: [{ slug: "quickened", value: null }] }
  });
  ```

  A valued condition takes its value (`{ slug: "frightened", value: 1 }`).

## All of an item's own linked PF2e Effects at once

- **What it does:** when an item links several PF2e Effects named for itself, the item card usually applies only the one matching the item and lists the others as notes. With this mechanic it applies all of them.
- **Items now:** Thorn of Milani (Lesser): its Spirit Damage and Unholy Weakness Effects.
- **Wording read:** every link is "Effect: <item> (…)", none names a degree or a choice, and the text says one, then the other ("You then gain …").
- **Add an item:** `src/compiler/consumables.js`, `EXTRA_ALL_LINKS`, a list of slugs:

  ```js
  export const EXTRA_ALL_LINKS = Object.freeze(["my-talisman"]);
  ```

## The module's own items: a spell on a spellgun's hit, a firearm merged with a staff

These two belong to the module's own items (`packs/_source/items`), not to PF2e's, so no wording is read: each item asks for what it is when it first goes into an inventory (`scripts/generic-items.js`).

- **A spell's results on a spellgun's hit** (`spellgunFromSpell` in `src/compiler/generic-spellgun.js`): the spell module's plan for the spell, heightened to a rank, moved under an attack against AC. A save spell's failure is the hit, and its critical failure the critical hit. A spell attack spell keeps its own rows. A spell with neither deals its data's damage (not a healing spell's healing). The spell is its 2-action version (`ACTIONS`, a spellgun's Activate): PF2e's action variants through the core's `planWithActions`, and Force Barrage's shards through its `missileCount`. The plan is kept on the item, so compileItem, live play and the Combat Simulator need neither module again. Another item that holds a picked spell could use the same function: `spellgunFromSpell(spellPlan, { spell, rank })`, then `loadedUpdate(spell, rank, plan)` for its name, level, price and description.
- **A firearm merged with a staff** (`gunStaffUpdate` in `src/compiler/gun-staff.js`): the firearm's data, the staff's spell list, traits, rules and runes (at least +1), and a Reinforced Stock attached that keeps the runes. `isBaseFirearm` holds the limit to two-handed firearms; to allow others, widen it and `firearmProblem` together.

## Runes

- **Etched runes' activations** (`src/compiler/runes.js`): a rune key on a weapon or armor (`system.runes.property`) is matched to PF2e's rune item by its slug ("extending-greater" → "greaterExtending"). The runes PF2e renamed keep their old keys in `RENAMED` (Quickstrike `speed`, Vitalizing `disrupting`, Spell Reservoir `spellStoring`, Animated `dancing`): add a rune there if its key doesn't match.
- **Runes on a critical hit** (`src/compiler/rune-strikes.js`): each "On a critical hit …" sentence of a rune's text is read by the ability compiler. Who it's for is in `FOR` ("the undead", "the giant", a bleeding target): add a pattern there for another rune that names its creatures.
- **Etching** (`src/compiler/etching.js`): the fundamental runes by slug are in `FUNDAMENTAL`; which items a rune fits, by its usage, in `fitProblem`.

## Read from the wording only

These mechanics have no table yet. An item gets one when its text uses the same words. To give one a table, follow the pattern above, or ask me.

- **Spellguns** (`src/compiler/spellguns.js`): "making your choice of a spell attack roll or a firearm attack roll against the target's AC" (or a defense's DC), then the damage the text links and its degree rows. The card offers the user's spell attack and firearm attack. Reaper's Spellgun's damage in its critical success's row is read too.
- **One of two maneuvers at the item's modifier** (`src/compiler/own-checks.js`): "attempting to Disarm or Trip (your choice) … with a total of +9 to the Athletics check" (Twisting Twine).
- **Warriors that Strike at the item's modifier** (`src/compiler/own-checks.js`): "Two warriors manifest with a +11 attack modifier", each "makes a Strike for 2d6 force" (Spiritual Warhorn).
- **Damage to a creature that touches the drinker** (`retaliationPlan` in `src/compiler/direct-damage.js`): "a creature that touches you … takes fire damage. The aura deals 1d4 fire damage" (the Retaliation potions). The card stays open for the item's time.
- **Damage a successful save negates** (`negatingSavePlan` in `src/compiler/direct-damage.js`): "dealing 1d6 persistent poison damage to all creatures …; a successful … save negates the damage" (Mycoweave Shield).
- **Effects for allies or another creature** (`grantsOthers` in `src/compiler/consumables.js`): "You and all allies within a 60-foot emanation gain …", "a creature you touch", "Choose an adjacent creature …".
- **Conditions lowered on others, one of several, or to 0** (`src/compiler/reduce.js`): "Reduce the ally's frightened condition by 1", "your clumsy, enfeebled, frightened, or stupefied condition by 1", "Reduce your doomed value to 0".
- **A spell cast at the creature the Strike hits** (`castOnHit` in `src/compiler/strikes.js`): "the target is also affected by a 4th-rank Vision of Death with a spell DC of 28" (Tiger's Claw), "A creature hit by an activated stone bullet is subject to the effects of a 6th-rank Petrify spell (DC 34 Fortitude)" (Stone Bullet). On the hit, the spell module casts it at that creature, with the spell's own save at the item's DC. A save of the item's own before the spell ("… unless it succeeds at a DC 25 Will save", Silencing Shot) uses castFromItem's `saveFirst`. The hit standing in for the spell's attack ("subject to a Disintegrate spell requiring a … save", Disintegration Bolt) uses its `attackDegree`. Both options are in the spell module's working tree, not its release yet; until a release has them, the card says to do it by hand.
- **Runes for the Strike that fires it** (`src/compiler/strike-damage.js`): "For the Strike with which you consume the ammunition, the weapon is a +1 striking weapon" (Weapon Shot).
- **Splash from any Strike** (`scripts/bombs.js`): a Strike whose damage has PF2e's splash-only rolls (Elemental Ammunition) gets the bomb card's splash.
- **An item's attack at its modifier or its user's, the higher** (`HIGHER_ATTACK` in `src/compiler/own-checks.js`): "Attempt a spell attack roll against the target's AC, using a modifier of +15 or your own spell attack modifier, whichever is higher" (Urn of Ashes). The card uses the user's spell attack when it's higher, else the item's.
- **One check at every creature of a kind in an area** (`src/compiler/item-actions.js`): "Make an Intimidation check to Demoralize against all creatures with the undead or unholy trait in a 30-foot emanation" (Horn of Exorcism). The card rolls once against each targeted creature's DC.
- **A condition only for creatures with a trait** (`traitGated` in `src/compiler/guards.js`): "if the creature has the ghost trait, it becomes Stupefied 1" (Lacquered Waist Drum). This isn't applied to every creature that saves. A note on the row says who it's for.
- **An Effect's opening flavor** (`src/compiler/flavor.js`): when the ability compiler can't read an Effect, it tries again without the first sentence, if that sentence has no link, number or rule word ("You strike an intimidating pose …", Suit of False Impression).
- **Amounts that grow with the owner's level** (`byOwnerLevel` in `src/compiler/item-data.js`): "The damage increases to 8d6 … if you're at least 15th level, to 9d6 … if you're at least 17th level" (The Desert, The Trumpet, The Midwife's healing). Live play uses the step for the owner's level.
- **An activation named for one of the item's PF2e toggles** (`src/compiler/option-on.js`): when the item has a toggle named like the activation (Glacier Hammer's Grow Icicles → `grow-icicles`), the toggle card switches it on. It turns off at the end of the turn ("Until the end of your turn"), or after the item's next damage roll ("The next attack … deals"). If the text says "extend or shorten", it flips instead.
- **A damage type picked by what's loaded** (`src/compiler/type-choice.js`): "the damage type depends on the type of coins you've loaded. Copper coins deal acid damage, silver coins deal electricity damage …" (Fortune Cord). The card picks the type.

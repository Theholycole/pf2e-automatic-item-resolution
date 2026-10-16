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
- **Wording read:** "use a +N Athletics modifier for your <action> instead of your Athletics modifier if it is higher than your own" (the item's modifier for that action, in place of the user's when higher).
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
- **The owner's own numbers** (`withOwnerNumbers` in `src/compiler/item-data.js`): "@actor.abilities.str.mod" and "@actor.level" in an item's text become the owner's values in live play (Wolf Fang's Strength damage). An action's damage on a success ("If you succeed, … dealing … damage. If you critically succeeded, the damage is equal to double …", Bracers of Strength's Bear Hug) gets its own card after PF2e's roll.
- **A Requirements line set aside** (`src/compiler/permanent.js`): an activation the ability compiler can't read is tried again without its Trigger and Requirements lines ("Your last action was a successful Strike …", Catoblepas Maul).
- **"gain the X condition for a time"** (`selfConditions` in `src/compiler/rows.js`): "You stomp three times and gain the Quickened condition for 1 minute" (Propulsive Boots).
- **One check at each enemy within a distance, with a degree's extra condition** (`src/compiler/item-actions.js`): "Attempt a check to Demoralize each enemy within 30 feet of you. On a critical success, the target is also Fleeing for 1 round" (Lion's Armor). The condition is added to that degree's row of PF2e's action.
- **A worse condition for a creature already in one** (`alreadyGated` in `src/compiler/guards.js`): "on a critical failure, if the creature is already slowed, it's permanently petrified" (Stony Hag Eye) becomes the core's escalate on that row's Slowed. Live play applies Petrified to a creature that's already slowed.
- **An area in words, a save made rather than succeeded at** (`withItemData` in `src/compiler/item-data.js`): "All enemies within a 40-feet emanation must make a … save or be Dazzled for 1 minute (or Blinded … on critical failure)" (Golden Gloves). What the save's text also does and no row holds (a penalty for some creatures, a counteract on the user) goes in the notes (`saveExtras` in `src/compiler/guards.js`).
- **Healing for the owner's level in words** (`withOwnerNumbers`): "You regain Hit Points equal to twice your level" (The Rakshasa).
- **A save link with no DC after its user's spell** (`withItemData`): "Your last action was to cast a spell …, who must attempt a @Check[fortitude] save" (Maw of Hungry Shadows) is against the user's spell DC.
- **Drained, doomed and wounded last until reduced** (`lastingConditions` in `src/compiler/guards.js`): "Blinded for 1 round and Drained 1" doesn't give Drained the round, unless its own words give it a time.
- **A degree row's damage by its type** (`withItemData`): "The target takes half the fire damage", "takes the full fire damage" (Blast Lance) are read as half and full damage.
- **A degree row's own linked Effect** (`src/compiler/degree-effects.js`): "Effect: Crackling Bubble Gum (Failure)" after its row goes on that row as PF2e's Effect. This only happens when the Effect lasts as long as the row says (PF2e's equipment-effects durations, `equipmentEffectIndex`). Stonethroat Ammunition's "For 1 round" doesn't match its Effect's unlimited duration, so it stays with the GM.
- **Temporary Hit Points for another creature, or with their time after** (`tempHitPoints` in `src/compiler/rows.js`): "You touch an adjacent creature, granting them 3d8 temporary Hit Points for 1 hour" (Razmiri Wayfinder) goes to the creature picked on the card. In "You also gain 15 temporary Hit Points. You lose any remaining temporary Hit Points after 1 minute" (Bangles of Crowns), the later sentence gives the time.
- **A penalty "imposed" on its user** (`modifiersOf`): "the calming urges impose a -1 status penalty to your attack rolls" (Aeon Stone (Olivine Pendeloque)). The rest of that sentence stays a note.
- **A bonus to a listed skill and to one its user picked** (`modifiersOf`): "+1 item bonus to Diplomacy checks and checks of the skill associated with your phrase" (Words of Wisdom). Diplomacy is applied; the other skill is a note.
- **Resistance to the type its Trigger names** (`ownRow`): "Trigger You would take mental, poison, or spirit damage Effect You gain resistance 5 to the triggering damage type" (Safeguarding). The card picks one of those types.
- **What waits for something later** (`withoutLater` in `src/compiler/flavor.js`): an activation the ability compiler can't read is tried again without a "whenever …" sentence ("Additionally, for the next minute, whenever a creature touches you …", Thunder Mail). That sentence becomes a note.
- **Healing a feat of its owner's changes** (`withItemData`): "you regain 2d6 Hit Points. If you have the Battle Medicine feat, you instead regain 2d6+7 Hit Points" (Lover's Knot) uses the owner's feats in live play (`ownerOf` in `scripts/foundry.js` gives them). The census's stand-in owner has none.
- **A lowered condition beside a note** (`src/compiler/index.js`, `src/compiler/permanent.js`): when an item lowers a condition and its other words are only a note (Serene Smelling Salts' immunity), the plan is partial instead of note-only. The card lowers the condition.
- **A damage type its user writes** (`src/compiler/type-choice.js`): "The tenor of what you write … determines the damage type …: acid for a caustic inscription, cold for an aloof one, …" (Explosive Missive) becomes the save card's damage picker. Damage "of the same type" is a note.
- **Thrown to explode** (`withItemData`): an item that "can be thrown up to 30 feet, causing it to explode" has no Strike. Its area's save is read (Blindpepper Bomb). "Blinded for 1 round and then Dazzled for 1 round" becomes Dazzled for both rounds. A condition that lasts "until it removes the sickened condition" is applied with no time and a note (`untilRemoved` in `src/compiler/guards.js`).
- **A save "or be overcome" with a penalty for a time** (`withItemData`): "must succeed at a … save or be overcome with embarrassment for 1 hour, taking a –1 status penalty to Deception, Diplomacy, Intimidation, and Performance checks" (Stage Fright Missive) becomes that save's failure row.
- **A by-hand row that is one penalty** (`manualPenalties` in `src/compiler/guards.js`): the ability compiler leaves rows like "The target takes a –1 status penalty to Deception … checks for 1 hour" to the GM because its reader doesn't know skills. The item module reads that penalty with its own selectors, and also reads "As success, but a –2 penalty" (Captivating Rosebud). A critical failure with no row of its own copies the failure's.
- **Quickened and what its extra action is for** (`selfConditions` in `src/compiler/rows.js`): in "You become Quickened for 1 minute … and can use the extra action to …" (Mariner's Mien), the clause after "and can use the extra action" isn't the condition's. Quickened is applied and that clause is a note.
- **A banner's ally** (`ownRow`): "An ally within the banner's aura becomes Quickened for 1 round" (Zealous Banner, Quickened Standard) goes to the ally the presser targets.
- **After its user's own action succeeds** (`withItemData`): "On a successful Feint, the target is Dazzled for 1 round" (Glamorous Buckler) goes on the target, with a note to apply it only after the Feint succeeds.
- **A hit's condition after a flavor sentence** (`withItemData`): "On a hit, the creature becomes covered in … The creature becomes Slowed 1 for 1 round" (Growth Gun) is read as one rider.
- **An area that forces a save** (`withItemData`): "… in a 30-foot emanation, forcing hostile creatures in the area to make a … save or be Blinded for 1 round" (Eye of the Moonwarden).
- **A snare that moves its creature a square** (`withItemData`, `src/compiler/snares.js`): "save or be moved into an adjacent square (chosen by you when you craft the snare)" (Expulsion Snare) is a 5-foot push, with a note that the crafter chose the square.
- **A called creature's Strike with its damage in the next sentence** (`readOwnCheck` in `src/compiler/own-checks.js`): a released creature's attack modifier, with its damage in the next sentence ("On a successful Strike it deals …"), is read as one sentence (third-party bottled creatures).
- **A save "or become" with its worse result after it** (`withItemData`): a save to avoid a condition for a time, with a worse value for a critical failure at the end of the sentence, becomes "save or become X (Y on a critical failure)".
- **A flight's line that saves or takes damage** (`withItemData`): creatures along a released creature's flight that save or take damage are a line as long as the flight. Another damage "instead" for some creatures is a note (`saveExtras`).
- **One check at the target and the enemies around it** (`src/compiler/item-actions.js`): "attempt to Demoralize the target as well as each enemy within 30 feet of the target" (Shrieking Skull). The skill-action form also reads "… and attempting an Intimidation check to Demoralize that creature" (Wrestler's Armbands).
- **A banner's damage at each hurt enemy in its aura** (`withItemData`, `whoTargeted` in `src/compiler/guards.js`): "The magical banner deals 1d4 persistent bleed damage to any enemy within the banner's aura that has been dealt damage since the end of your last turn" (Banner of Piercing Shards). The damage goes to each creature targeted, and which ones count is a note.
- **A moment's resistance with its type first** (`readied-bonus.js`): "gaining fire resistance 20 against the triggering effect" (Sparkshade Parasol). A parenthesis is its own sentence, so a later "For the next 1 minute, …, letting you use …" about another activation isn't the resistance's time.
- **A companion's Speed** (`speedsOf` in `src/compiler/rows.js`): "granting your companion a swim Speed of 30 feet for 10 minutes" (Waverider Barding) goes to the companion the presser targets.
- **A mount's damage and condition** (`withItemData`, `directDamageOver` in `src/compiler/direct-damage.js`): "Your mount takes 2d6 bleed and gains the quickened condition for 1 minute or until the persistent bleed damage ends" (Heedless Spurs) goes to the targeted mount. The item's outright reading is used over the ability compiler's when it reads more (the quickened beside the bleed), and the bomb rider reader now knows "is quickened for …".
- **Conditions a row gives later** (`delayedConditions` in `src/compiler/guards.js`): "At the end of their next turn, they fall Prone and fall Unconscious for 1 minute" (Nap Gas Dispenser) isn't applied at once. Those conditions come off the row (and off "As failure, but …"), and a note on the creature says when they come. A by-hand penalty beside a condition the row already holds ("takes a –2 status penalty to Perception checks and is Slowed 1 for 1 round") is read too.
- **A condition a row names only under "if", "when" or "after"** (`conditionalOnly` in `src/compiler/guards.js`): Heart of Sarnax's "When it recovers from being stunned, it is Slowed 2 for 1 minute" and Hex Blaster's "If the target falls Unconscious from damage …" aren't applied with the rest of the row. They're notes for the GM. ("Until …, the creature is also Confused" is Confused now.)
- **"As success, but …" rows keep the success's conditions** (`asRowCopies`): The Waxworks' failure is Confused as its success is. Wintershot's copied Dazzled takes the row's own "the light affects the creature for 1 minute", and a critical failure "As failure" gets what the failure got. "The duration of the blinded condition is 1 minute" (Lamentation of the Faithless) gives Blinded that time.
- **A condition's time in its own sentence** (`sentenceTimes`): "For the next minute, it is Stupefied 1 …" (Liar's Bangle) and "Stupefied 4 for 1 day" get those times, not forever. An "As failure, but Clumsy 2" row (Floppy Rag Doll) keeps its failure's time for the condition it names again.
- **One of several runes lent, picked on the card** (`src/compiler/rune-loans.js`, `src/live/card.js`): "granting the weapon the effects of either a Decaying weapon rune, Grievous weapon rune, or Wounding weapon rune for 1 minute" (Boughshatter). plan.item.rune.choices lists them, the card's "Rune" picker chooses one (`runeChoice`), and the first is the default.
- **One action at every creature in a burst, each its own roll** (`src/compiler/item-actions.js`, `scripts/item-actions.js`): "attempt a ranged Trip against all creatures in a 5-foot burst … Roll a separate Athletics check for each target" (Windlass Bola). action.separate makes PF2e's action roll once per targeted creature, each with its own row.

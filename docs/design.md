# Design: the module's shape, batch 1 (potions, elixirs, mutagens) and batch 2 (bombs, poisons)

Status, 2026-10-15: the user answered the design's questions the same day (the recommendations). Everything marked *built* is built and tested offline, and the live check passed in pftest the same evening (all 13 cases).

The first live run found three things the stand-in hadn't:
- PF2e's reroll replaces the message rather than updating it (a harness fix).
- Giving an item with a ChoiceSet stops for PF2e's prompt (the harness presets it).
- `game.combat` is the encounter the GM views, which may not be the creature's. The module now finds the started encounter the creature is in (`encounterOf` in `scripts/foundry.js`), for Focus Points, encounter-period uses and Effect start times.

The sheet's Activate button now sits right after the item's name.

## Where things stand

From [census.md](census.md) (PF2e 8.6.1 packs):

- **1,724** consumables. **237** are the spell module's (scrolls, wands, catalysts, spell gems, and the 20 catalysts filed as "other"), so this module handles **1,487**.
- **759** (50%) compile to a plan the core resolves with no gaps. It was 532 with the ability compiler alone; the item's own readings below added the rest. **5** more are partial and **272** (18%) get only a note Effect; both are counted apart. **25** are casts, for the spell module.
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
  - **built:** *the item's own row* (`rows.js`, the core's check family with `roll: "automatic"`): a condition the text puts on the drinker with its own time ("making you concealed for 5 minutes"). The reader is deliberately strict: not from a later event, a failed check, stages, a roll on a table, an item with a choice of uses, or one that links PF2e Effects. A talisman's or an activation's Trigger, Requirements and Frequency only say when it's used, so they're stripped and what follows is read (Guardian Rose's enfeebled 1). A condition "to" someone ("invisible to scrying magic", "Invisible to creatures with the fiend … trait") isn't the condition, so it isn't read.
    - Bonuses and penalties: plain selectors, plus scopes PF2e has a roll option for, as predicates. These are:
      - against a trait ("against fear effects"; "against afflictions" is a curse, a disease or a poison);
      - against what a creature makes, by its origin's trait ("against effects created by devils and divine spells cast by devils", Night Sky Elixir: `origin:trait:devil`);
      - against what an effect gives ("against effects that could render you Fatigued", Scholar's Drop: `inflicts:fatigued`; "being petrified"; "forced movement");
      - AC against ranged or melee attacks ("against physical ranged attacks": `item:ranged` with `item:damage:category:physical`);
      - checks to an action ("Athletics checks to High Jump or Long Jump");
      - Speeds ("a +10-foot status bonus to your Speed", "a -5-foot status penalty to all Speeds").

      Scopes with no roll option ("against the triggering attack", "against those creatures") and a choice of settings (Magnetic Suit) are left out. The list stops at ", which", "but", "unless", "if". "While the effect lasts," / "While activated," before it only say its time, and "you gain … but take a -5-foot status penalty" is the same "you". An introduction's bonus with no number ("you also gain a status bonus against inhaled threats") isn't a note when the number is read.
    - Resistance for the item's time ("For 10 minutes, you gain resistance 5 to slashing and piercing damage", Armorskin Robes; "you gain resistance 5 to all damage"): `plan.item.resist` `[{ type, value, duration }]`. It sits outside `resolution`, as `plan.item.reduce` does, because the core has no resistance change. The item card gives it after its row as an Effect with PF2e's Resistance rules. Not one with exceptions, a type to choose ("the chosen damage type", "the attuned energy type"), one against a single hit, or another creature's. A sentence that says more after it ("… and take no fall damage") stays a note too.
    - Temporary Hit Points and healing are read only when stated plainly. A sentence that also says "instead" (Immortal Bastion's "You drop to 1 Hit Point instead of being reduced to 0 HP …, and you gain 100 temporary Hit Points") gives the temporary Hit Points and stays on the note for the rest. Six items keep their user at 1 Hit Point like this (Immortal Bastion, The Survivor, False Death Vials, Locket of Love Left Behind, Final Stand); a "stay at 1 HP" effect would need the core.
  - **built:** *note only*: an item with a time and nothing else the module reads gets a note Effect with its text for that time. That's the user's note-Effect rule for spells, and the census counts these apart. The time can be written "Duration 1 minute", "The duration is 1 hour", "with a duration of 10 minutes" or rolled ("for 2d4 rounds").
  - **built:** *partial*: a row that reads only part of the text also carries the note and is counted apart ("Effect + note"). Immovable Potion's "DC to move you is 40" and Megaphone Mutagen's auditory benefit are like this. A sentence restating PF2e's usual rule ("As usual …") doesn't count.
- Next readings for batch 1, by size:
  1. Counteracting consumables are **built** (`src/compiler/counteract.js`, `src/live/counteract-card.js`, `scripts/counteract.js`; the user's answer of 2026-10-15). 28 PF2e consumables: Surging Serum, Bottled Catharsis, Panacea, Contagion Metabolizer, Fu Water, Salve of Antiparalysis, Dragon's Blood Pudding and others.
     - `plan.item.counteract` holds `{ modifier, rank, conditions, traits, afflictions, pick, reduce?, notes? }`. With no rank stated, the rank is half the item's level, rounded up.
     - The card has two steps. Step 1 picks the drinker (the user or a creature next to them) and finds what the item counteracts on them. That's each Effect with the trait or granting a listed condition, each listed condition no Effect grants, and each PF2e affliction of the kind. Each comes with the DC and rank PF2e knows: an Effect's level, its origin's class or spell DC (as the spell module reads it), an affliction's DC and half its level.
     - Step 2 takes the ticks and the GM's numbers where PF2e had none, rolls the item's counteract check for each (`1d20 + modifier`), and applies PF2e's counteract rule (a critical success up to 3 ranks above, a success 1 above, a failure only lower). It ends the Effect, the condition or the affliction, or lowers it (Moon Radish Soup).
     - An item with another reading (Panacea Fruit's healing) gets both cards.
     - PF2e's counteract rule is a small table of the item module's own: the spell module's isn't exported, and the core has none.
  2. Resistance to a chosen type with no Effect (Potion of Resistance, Mutagenic Renovator): an Effect made with PF2e's Resistance rule, the type picked on the card.
  3. Items with two activations: the teas' Tea Ceremony is **built** (`src/compiler/tea.js`, the user's answer of 2026-10-15). `plan.item.ceremony` holds `{ duration, removes, text }`, and the card shows a "Tea Ceremony" tick. Ticked, the tea's Effect lasts the ceremony's time (Longnight Tea's 8 hours) and the conditions it names go (its fatigued). PF2e's own ceremony ChoiceSet on the Effect is preset to the ceremony when ticked and to the plain drink when not (Peace in Dreams Tea, Resurrection Tea), so PF2e needn't ask.
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
  - Weaknesses and lingering clouds (Silver Orb) are left for later.
- **Saves** (15 bombs), read for who attempts them. On Apply, the card posts the ability module's save card (`api.live.postCard`) for them:
  - "Any creature hit by the bomb or in its splash area": the target and the creatures splashed, as ticked (Skunk Bomb, Durian Bomb);
  - "each creature within 10 feet of where it exploded": the target and everyone within the radius (Blasting Stone, Bioluminescence Bomb);
  - "A creature struck by …": the target, on a hit (Dwarven Daisy).

  The rows are the ability compiler's save plan, or the plain "save or become Dazzled for 1 round" form.

**Injury poisons** (`src/live/poison-card.js`, `scripts/poisons.js`), 45 items. PF2e leaves these to the table.
1. Using one posts a card: which piercing or slashing weapon to coat, held ones first.
2. Apply puts an Effect on the user that marks the weapon, one poison per weapon.
3. That weapon's next Strike that hits posts the poison's save card on the target, through the ability module's `api.live.postCard`; its affliction goes to Pseudo Afflictions as monster venom does. A miss keeps the poison. A critical miss wastes it ("expend it as normal for an injury poison by either hitting a target or critically failing an attack roll").
- Contact, inhaled and ingested poisons are later. The ability compiler reads them as Strike riders too, which fits only injury.

**Casts** (`src/live/cast-card.js`, `scripts/casts.js`). An item that grants a spell PF2e has no Effect for compiles to the ability compiler's cast-spell builtin; 29 in the census, including casts at someone else ("casts a Rewrite Memory spell (DC 26 Will) against a single target") and summons ("casting a 5th-rank Summon Elemental spell"). Examples: Fade Band's Invisibility, Truesight Potion with its counteract +25.
- Its card names the spell, its rank and any counteract modifier, and for a potion the drinker.
- Apply calls the spell module's `api.castFromItem` (its session built it on 2026-10-15, c3a6b8d, not live-tested yet). The spell module casts it through PF2e, with a temporary entry it cleans up afterwards:
  - on the drinker for a potion;
  - on the user for "casts … on you";
  - at the presser's own targets for a spell aimed at others;
  - with no targets for an area spell or one without targets (Earthquake, Translocate): the spell module places it.
- **Casts in words** (`src/compiler/cast-words.js`): the spell by its name in PF2e's spells (`options.spells`, from `spellIndex`), linked or not. "You cast a 4th-rank Dream Message spell", "The armor casts mislead, affecting you", "The wayfinder can cast 4th-rank Fireball", "The crystal ball casts a DC 33 Scrying spell", "a counteract modifier of [[/r 1d20+23]]", "You cast dimension door" (a few pre-remaster names mapped). 110 activations and Oil of Mending.
  - Several spells ("cast either 5th-rank Darkvision or See the Unseen on yourself", "Choose Summon Lesser Servitor or Command. You Cast the chosen Spell at 1st rank (DC 19)") are `plan.choices` `[{ spell, rank }]`, and the card has a picker. A rank holds for the spells after it.
  - The plan also says `area` and `targets` (from the spell), so the card asks for targets only when the spell targets creatures.
  - The rest of the activation's text goes on the card as notes. A choice not read ("or the 1st-rank spell from your deity's cleric spells") is a note too.
  - Not read: a random table (Pistol of Wonder), innate spells for a while (Elder Seed), a spell in parentheses ("such as the space where a creature just cast Translocate"), a cast after a failed save (Whip of Compliance), "If your next action is to Cast a Spell", rituals.

**Other poisons and saves** (`src/live/poison-card.js`, `scripts/poisons.js`):
- **Contact, inhaled and ingested poisons, and drugs** (89 items) get an exposure card. It says who the poison exposes, from PF2e's trait rules, and posts the poison's save card for the creatures the presser targets. For an inhaled poison, those entering the cloud for a minute are the GM's to call. An injury drug (Zerk) is injected.
- **Another item's save on its Use, at others** (110 items: Spark Wafer, Pyronite, Flask of Elemental Earth, Sneezing Powder…): the same card, "a save for the creatures in its 5-foot burst".
  - An item with no Activate line counts too. The ability compiler reads it as passive, but it's still used: "You can toss sneezing powder…", a fulu "Upon affixing".
  - Not when the save's own sentence names another trigger: a turn in the area, entering or stepping on a square, each time.
- **Damage outright, with no save** (`src/compiler/direct-damage.js`; 10 items: Forge Warden's "The attacking creature takes 2d6 fire damage", Kortos Diamond's "You deal an additional 2d8 force damage to the struck creature", Murderer's Knot's "the creature you damaged takes 1d6 bleed damage and is off-guard"): the same card, "No save". The plan is the ability compiler's shape for it, the check family with no roll and shared damage. The ability module's card rolls it and applies it with PF2e's resistances. Bleed is persistent, a condition after it ("and is off-guard until …") is read with the bombs' rider reader, and the rest is a note.
- **A check with the item's own modifier** (`src/compiler/own-checks.js`; 13 activations): a maneuver ("The tentacle attempts to Grapple with a +13 bonus", Tentacle Cannon; "You shove the creature using the bands' Athletics modifier of +14", Bands of Force) is PF2e's basic action rows (the ability module's compiled actions) with `check.modifier`; an attack of its own ("The armor makes a melee attack with an attack modifier of +14 that deals 2d6 piercing damage", Swallow-Spike) is a check against the target's AC with its damage on a hit, double on a critical. The same target card, "Check": the ability module's card rolls the set modifier against the target's DC or AC.
  - Conditions alone, outright, read the same way (Imposing Shield's "The creature that made the attack … becomes Frightened 2", Highhelm War Shield's grabbed), not one scoped to the user's own attack ("Off-Guard against the next melee attack you attempt").
  - Not read: a save's degrees anywhere in the text, a Strike's hit ("On a successful hit"), an area, ammunition (PF2e's own rules deal it).
  - The automatic rows read before for another creature (Rending Gauntlets' 2d6 piercing, Killer's Belt's bleed, Linnorm's Sankeit's spines) go to this card too, not the item card.
- **A save the item gives for later** (55 items: breath potions, "grants you the Energy Breath action", "you can use a 2-action activity to exhale"): the same card, kept open until the action is used. One that can be used again after a recharge ("After you use Energy Breath, you can't do so again for 1d4 rounds", Roaring Potion's "Frequency once every 1d4 rounds") stays open for the item's time, then closes; the recharge itself is the table's. Roaring Potion's "gives you access to two other activations" is one of these, not a save on drinking. "For 10 minutes after drinking" alone is only a duration: Truth Potion's save is on drinking.
- **Snares** (`src/compiler/snares.js`, `scripts/zones.js`), 63 items. Each compiles to the ability module's zone builtin: a 5-foot square placed within reach, the snare's save plan (with its damage and conditions) on the first creature to enter it, once.
  - After PF2e's Use, the active GM's client calls the ability module's `api.live.startZone` (ability 0581bd5: once; a used-up item). The GM places the square.
  - The 22 lasting areas that compile to the zone builtin (Cryomister, Pheromone Flare) go the same way.

**The GM fallback gives way.** The ability compiler's last fallback ("no-effect", the GM's) yields to a reading of the item's own (its linked Effect, a spell's Effect, PF2e's healing, its row), though not to a note alone. PF2e's healing field counts only when the text heals: Potion of Annulment keeps its counteract roll there.

`src/live/route.js` decides which card an item gets. The census's "Played live" table counts it: 1,090 of 1,486 consumables get a card, and it says why the rest don't.

**Skill actions taken with an item** (`src/compiler/item-actions.js`, `scripts/item-actions.js`): "use a Sneak action with a +1 item bonus" (Onyx Panther), "Attempt a Deception check to Feint with a +4 circumstance bonus" (Coldstar Pistols), "attempt to Administer First Aid using Medicine with a +1 item bonus" (Crying Angel Pendant), "Activate Treat Wounds" (Curled Cure Gel). A builtin "item-action" `{ slug, name, bonus, targeted, after?, basic }`.
- Apply rolls PF2e's own action for the user (`game.pf2e.actions.get(slug).use`, as the spell module rolls its maneuvers), with the bonus as a PF2e Modifier, at the creature the presser targeted when the action is aimed at one.
- For the actions the ability module compiles (Trip, Grapple, Shove, Demoralize, Feint, Disarm, Administer First Aid…), `basic` holds that action's plan, and its row for the degree goes on the target (`applyRiders`).
- Not read:
  - an item that links its own Effect (the bonus lives there; for third-party items that's question 7);
  - an item whose own modifier or total replaces yours (Neophyte's Fipple's "+7 regardless", the Alchemists+ plants);
  - an item with a DC of its own (Lady's Blessing Oil).

**Rerolls** (`src/compiler/rerolls.js`, `scripts/rerolls.js`; 13 items): "reroll the triggering Reflex save" (Lucky Rabbit's Foot), "Reroll the triggering roll and take the higher result" (Starfaring Cloak), "You force the attacker to reroll the attack roll and use the worse result" (Mail of Luck). A builtin "reroll" `{ what, keep, who, statistic?, after? }`.
- The card finds the triggering roll in the last 40 messages: the user's latest save, check or attack roll not rerolled yet (a named save by PF2e's check domains), or for Mail of Luck the latest attack roll at the user.
- PF2e rerolls it with `game.pf2e.Check.rerollFromMessage`, on the GM's client: no `keep` for the new result (as PF2e's own "Keep new" menu), else `keep: "higher"` or `"lower"`.
- A reroll with a bonus (Redsand Hourglass +4, Devil's Bargain +2 keep higher, The Rabbit Prince +1, Navaratna of the Solar Ruby +2 for the companion the presser targets; the user's answer of 2026-10-15): PF2e's reroll keeps the roll's modifiers, so the card rolls a new d20 with the old roll's modifier plus the bonus. It shows the degree against the same DC and which result stands, and applies nothing; PF2e's message stays as it was, and the GM uses the card's result.
- Not read:
  - another creature's reroll (allies), except a companion's;
  - a coin flip, a Mythic Point, a choice of results;
  - a reroll kept for later (Old Tillimaquin);
  - a table's "Reroll two results".
- **A change to the roll already made** (`readRaise`, 6 activations), the same card: "If you failed the saving throw, it becomes a success. If you critically failed, it becomes a failure instead" (Breastplate of the Mountain), "You critically succeed instead" (Sash of Prowess), "+2 circumstance bonus to your attack roll, possibly turning a miss into a hit" (Hunter's Arrowhead), "Roll 1d4 and add the result to your Diplomacy check as a circumstance bonus" (Successor Doll). `reroll.raise` `{ change?, bonus? }`; the roll is the trigger's (after it: "You fail …", "You would miss …"). The card finds that roll, changes its degree or adds the bonus (rolling dice) and grades it against the same DC, and shows the result for the GM, as a reroll with a bonus does (the user's answer 3). PF2e's message is unchanged. Before the roll, "You automatically succeed at your save" is PF2e's AdjustDegreeOfSuccess on a moment's Effect instead (Robe of the Archmagi).

**Rolling twice** (`src/compiler/fortune.js`, `src/live/fortune-card.js`, `scripts/fortune.js`; 12 items): "You roll the check twice and take the better result" with the trigger naming the roll ("You're about to attempt a Perception check for initiative", Sunweave; "You attempt an Athletics check to Force Open, Reposition, or Shove", Kinetic Wraps of Strength), "Roll the triggering saving throw twice" (Energy Shield Tunic), "you roll your next attack roll twice" (Gorum's Tear). A builtin "roll-twice" `{ rollTwice: { selector, keep, predicate? }, notes }`: the selector is PF2e's (initiative, attack-roll, saving-throw, a skill, skill-check), the trigger's actions a predicate (`action:shove`).
- Apply gives the user an Effect with PF2e's RollTwice rule (`removeAfterRoll: true`), for a minute at most. PF2e rolls that roll twice and removes the Effect after it. A check message whose domains hold the selector removes it too, should PF2e's "remove expired effects" setting be off.
- What else the text says stays a note, and the plan is partial: "ignoring any circumstance penalties", "You then become Off-Guard …".
- Not read: another creature's worse roll ("The caster must roll … and take the worse result"), a damage or healing roll ("Roll the damage of the triggering Strike twice"), passive ones (Laurel of the Empath's initiative, PF2e's own rule already).

**A bonus for a moment** (`src/compiler/readied-bonus.js`, the same card and script; 36 items: 15 consumables, 21 activations): reactions and short buffs — Eclipse's "gaining a +2 status bonus to the Stealth check", Empathy Charm's "+1 circumstance bonus against the triggering save", Shacklebreaker's "+2 circumstance bonus to your Fortitude DC against the triggering Grapple", Sparkwarden's "Until the end of the current turn, against the triggering effect, … +1 status bonus to AC and saving throws and gain resistance 2 to damage", Scale of Igroon's "Until the start of your next turn, … +4 item bonus to Stealth checks to Hide and Sneak". A builtin "readied-bonus" `{ bonus: { modifiers: [{ selector, type, value, predicate? }], resistance, duration, spend }, notes }`.
- A talisman's text has no "Effect" after its trigger: the trigger is its first sentence ("Trigger You attempt a Diplomacy check to Make an Impression."), so a later "if you roll a critical failure" isn't read as a trigger after the roll. "When activated, …" and "When you activate the coin, …" open the use itself; "grants you a +2 item bonus" reads as "you gain"; an action's name can be several words ("to Recall Knowledge", "to Make an Impression"). "for the next minute" is lasting (Fulu of the Stoic Ox), and its other sentences are notes only when they say a rule.
- Resistance against the hit that triggered it, with nothing else (Deflecting Parry's "You gain resistance 5 to physical damage against the triggering Strike", Ferrofluid Urchin's "resistance 3 to the triggering damage", Third Blessing's "against that spirit damage"): `bonus.resistance` `{ type, value }`, of the text's type, else the trigger's ("You take physical damage"), else all damage. It lasts to the end of the turn, with a note that it's only that hit's. An item used two ways (Toadskin Salve's two reactions, Thrice-Fried Mudwings' meal and its reaction) isn't one card.
- Apply gives the user an Effect with PF2e's FlatModifier (and Resistance) rules: selectors `ac`, `saving-throw`, `fortitude-dc`, a skill, `skill-check`; "to Hide and Sneak" an action predicate. Its duration is the text's, from the current turn (`startInitiative`): to the end of this turn, the start or end of the next.
- One for a single roll ("the Stealth check", "the triggering save", "your next skill action") is spent by that roll: a check message whose domains hold it removes the Effect.
- "Against the triggering effect" can't be narrowed in PF2e, so the bonus holds for the turn, and the card says what it's only for.
- A better degree for the one roll (Singing Muse's "If you roll a success on your triggering check, you get a critical success instead", Mesmerizing Opal's Feint, Cloak of Repute's Request): PF2e's AdjustDegreeOfSuccess (`bonus.degree` `{ selector, adjustment, predicate? }`), spent by that roll.
- Only a moment's bonus: a trigger before the roll, a short time in its sentence, or one roll. Not read: a bonus after the roll ("You would miss …", "If this causes the Strike to miss": the roll is already made), a lasting one ("The duration is 1 hour", "for 10 minutes", "until you Activate the item again"), an ally's or an area's.

**Items used by Striking** (`src/compiler/strikes.js`, `scripts/strikes.js`): "make a melee Strike. If you hit and deal damage, the target is Frightened 1, or Frightened 2 on a critical hit" (Fear Gem), "Attempt a melee Strike … On a hit, the target must succeed at a DC 22 Fortitude save or be Blinded" (Duelist's Beacon), Aurochs' Might Tattoo, Gloaming Arc. The bombs' rider and save readers, shared. The plan is a bomb's shape: the save family with the Strike as its roll, plus `plan.strike` `{ range, save }` (and, for what a Strike adds, `{ damage, attack, alteration, own, unarmed, uses, until, missKeeps, hit, notes }`).
- Apply readies the user's next Strike this turn, an Effect that lasts to the end of the turn.
- PF2e's attack roll then decides. A hit puts that degree's riders on the target (`applyRiders` in `scripts/foundry.js`, shared with bombs) and posts the Strike's save card. A miss spends it. A melee one waits for a melee Strike (PF2e's `item:melee` / `item:ranged` roll options).
- A rider behind a save ("must succeed at … or be Blinded") is the save's, not the hit's; this holds for bombs too.
- A save the ability compiler read as a save on Use, at whoever's targeted, gives way to the Strike's own on a hit (Aurochs' Might Tattoo, Gloaming Arc).
- **What a Strike adds** (`src/compiler/strike-damage.js`): extra dice ("This Strike deals an additional 4d6 mental damage", Mantle of the Tikbalang; "an additional 1d4 persistent force damage", Pick of Arcane Accuracy; "an extra two dice of weapon damage", Piston Gauntlets, with the weapon's own die), an attack bonus ("+1 status bonus to this Strike"), a damage type ("All damage from this Strike is fire damage", Iris of the Sky). They are PF2e's own rules on the readied Strike's Effect: DamageDice, FlatModifier and DamageAlteration, so PF2e's own rolls carry them.
  - The Strike is the item's own weapon when the item is one (`{id}-damage`, `{id}-attack`, and the roll's `item:id:…`), an unarmed one ("Make two unarmed Strikes", `item:category:unarmed`), or any melee or ranged Strike.
  - A hit keeps the Effect for that Strike's damage roll, which spends it. A miss spends it, except for a "next successful Strike" (Venom Lash). Two Strikes use it twice (Amphisbaena Handwraps).
  - "The next melee Strike you make … before the end of your turn" (Void Sickle), "… before the end of your next turn" (Venom Lash): the Effect lasts that long.
  - A trigger's Strike that already hit (Kinetic Club's "successfully Strike your target") readies its damage roll alone. Its dice follow the item's striking rune ("If the club has a greater striking rune, increase the additional damage to 2d6"). A trigger's hit with a save makes the save the plan, at the creature struck (Spore Sap).
  - Whatever else the text says about the Strike stays on the card as "Also:" notes, and the plan is partial: "This counts as two attacks" (Piston Gauntlets), "(or 2d8 precision damage if you make a jaws Strike)" (Crimson Fulcrum Lens), Godsbreath Bow's vortex.
  - Not read: damage only under a condition ("If your last action was to Stride …"), against some creatures ("to creatures with void healing"), or per damage die (Zealot Staff).
- Not read: several Strikes at once, an item's own attack modifier, a follow-up check (Iron Cube's Trip), a spell cast on a hit (Devil's Trident).
- A spell the text only names as an example ("such as the Talking Corpse spell", Mantis Embrace) isn't a cast, whatever the ability compiler reads (`castMentionOnly` in `src/compiler/guards.js`).
- **Activated ammunition** (11 items: Freezing Ammunition, Rattling Bolt, Black Tendril Shot, Blindpepper Bolt, Rhino Shot, Corpsecaller Round, Vine Arrow…): "When an activated X hits a target, …", "A target damaged by the rattling bolt must …", "On a successful Strike, …" read as the bombs' "On a hit". Its readied Strike is the next ranged Strike with that ammunition (PF2e's `ammo:id:…` / `item:ammo:id:…` roll option, when the roll names its ammunition). Its save is the target's own only: not one for others ("Each creature standing on the icy surface"), nor one under a condition ("If the target takes vitality damage"), though a critical hit's change beside it is fine. Its extra dice are left out when the ammunition has PF2e's own damage rules (Rhino Shot's 2d6 force), and the 29 ammunition items whose effect is wholly PF2e's rules (Elemental Ammunition) need nothing from the module.

**Lowering a condition** (`src/compiler/reduce.js`; 5 items): "reduce the value of your frightened condition by 1" (Lion Badge), "reduce your Sickened value by 1" (Pepper Poultice), "You reduce your Frightened condition by 1" (Coin of Comfort). `plan.item.reduce` `[{ slug, by }]`: the item card lowers it on its user or drinker after its own row, with PF2e's `decreaseCondition`, and says so when there's none to lower. An item with nothing else read gets a plan of its own for it, with its other rule sentences as notes (Cinnamon Nostalgia Bun's flat check).

**Ending persistent damage** (`src/compiler/recovery.js`; 6 items): "Immediately attempt a flat check to end any persistent acid, fire, poison, or void damage affecting you" (Quenching Potion), "attempt a @Check[flat|dc:10] to end any persistent poison damage" (Antivenom Potion), "you gain an immediate flat check to remove the persistent fire damage, and the DC typically decreases from 15 to 10" (Ring of Torag), "an immediate flat check to end any persistent bleed effect with the lower DC for particularly effective assistance" (Cauterizing Torch). `plan.item.recovery` `{ types, dc }`, dc 10 for particularly appropriate help, the text's number when it gives one, else null for the condition's own. The item card rolls PF2e's own recovery check (the condition's `rollRecovery`) for each persistent damage of those types on its user or drinker. A lower DC is set on the condition for that roll and put back if the damage stays. PF2e deletes the condition on a success without waiting, so the card gives it a moment. Not one whose type is the item's to choose (Soothing Powder's "the persistent damage the powder works against"), nor another creature's. The check's own sentence stays a note when it says more (Searing Suture's 1d6 fire damage, Quenching Potion's new save against poison). "applied to yourself or an adjacent target", "sprinkling it on yourself or a creature within reach" make the card's drinker choice (Cauterizing Torch, Saints' Balm, Dust of Disappearance).
- Not read: a later "Secondary Effect" (Ginger Chew), "if successful" (Moon Radish Soup's counteract card does that one), an ally's or an area's (Fearless Sash), a passive one ("Whenever you become Frightened").

**Rage** (`src/compiler/rage.js`; 6 PF2e Instinct Crowns, 14 Barbarians+ activations): "You use Quick-Tempered and gain 10 additional temporary Hit Points from your Rage", "You Rage, gaining 10 additional temporary Hit Points". The plan is PF2e's own "Effect: Rage" (what its Rage action applies) on the user, with `application.tempHP`: the item card raises the Effect's TempHP rule (`@actor.flags.system.rageTempHP`) by that much. Only for a creature with PF2e's Rage action that isn't raging already; the card says so otherwise.

**The live check is ready** (`tools/live-check.mjs`, run in pftest's browser). It has its own "PFTEST ITEM Lab" scene and "PFTEST ITEM" creatures, and cleans up only its own data. Its cases:
- a potion fed to a dying ally;
- an elixir's grade;
- Mistform Elixir;
- a bomb's splash and off-guard;
- a coated weapon's hit and its save card;
- Fear Gem's readied Strike frightening the creature it hits;
- Lucky Rabbit's Foot rerolling a Reflex save;
- Onyx Panther's Sneak rolled by PF2e with its +1 item bonus;
- Surging Serum counteracting a drinker's clumsy;
- Spark Wafer's save;
- a Cloak of Elvenkind's Activate button on the character sheet;
- Hexing Jar's Focus Point, lost at the end of the turn in the check's own encounter (cleanup deletes only encounters flagged as its fixtures);
- an Invisibility Potion cast by the spell module.

`api.live.apply(messageId, choices)` applies a card from code.

## Later phase: permanent items' activations (compiled offline, 2026-10-15)

**The compiler** (`src/compiler/permanent.js`, `tools/census-permanent.mjs` → [census-permanent.md](census-permanent.md)). PF2e keeps activations only as text, so each item's text is split into its activations: name, actions, traits, frequency as `{ max, per }`, trigger and requirements. Each one is read like a consumable, for its user. Staves, wands and spellhearts (the spell module's: its wand readers cover every wand that changes its spell, Wand of Widening's kind too) and bombs are left out.
- 2,119 items, 2,630 activations: 640 resolve, 328 are casts, 301 are saves at targets, 302 notes, 45 Focus Points. 1,134 have nothing read yet.
- **Focus Points** (`src/compiler/focus.js`, `scripts/focus.js`): "You gain 1 Focus Point, which you can use only to cast a witch hex spell. If not used by the end of your turn, this Focus Point is lost" (45 activations: Specialist's Rings, Bloodline Robe, Crown of Witchcraft…). The core has no Focus Point change, so it's the item module's builtin. Its card adds the point up to the pool's maximum, as the spell module does for its "+" features. A note Effect says what it's only for. In an encounter, the GM's client takes the point back at the end of that creature's turn (PF2e's `pf2e.endTurn`) if the pool is still above its old value. Out of an encounter, the card says to take it back by hand. Harmonic Hauberk, which spends the point at once on a spell, isn't read this way.
- An automatic row aimed at another creature ("The target is Quickened for 1 round", Scizore of the Crab's "The target is grabbed") goes to the save card, for the creatures the presser targets, not to the item card on its user.
- The spell module's `claims(item)` (spell b8e2503) leaves it what it acts on: its six casts (Searing Blade, Sky Hammer, Dragon's Eye Charm, the Tridents of the Azarketis), its item spellshapes (Dragon's Breath runes, grimoires) and Djezet Dose, 33 PF2e items. `handlesItem`, `handlesPermanent`, `compileItem` and `compileActivations` take it as an optional `options.claims`. In Foundry, `scripts/main.js` passes the spell module's `api.claims` when it's active; the censuses import its `src/compiler/item-claims.js`. Without it, nothing changes (the simulator's Node calls).

**Live play: buttons on the sheet** (`scripts/activations.js`, `src/live/activations-card.js`; the user's choice, 2026-10-15, over a card after "send to chat").
- On the character and NPC sheets (PF2e's `renderCreatureSheetPF2e`, AppV1), each inventory row whose item has activations the module reads gets an Activate button (a bolt) per activation, after the item's name, for the item's owner or the GM. Its tooltip gives the activation's name, actions, frequency and uses this period.
- Pressing one has the active GM's client (by socket for a player, checked against the item's owner) post that activation's own card through the same routes as consumables, and count the use against its frequency on the item (flag `activationUses`, per period of world time, an encounter's by its combat).
- Over the frequency, the GM gets a whispered warning; it still activates (the GM's call).
- `api.live.activate(itemUuid, index)` does the same from code.

## Third-party items (the user's answers of 2026-10-15: start now; check each module Effect against its text)

The same readers run over the installed modules' items (`tools/census-third-party.mjs`, counts in [census-third-party.md](census-third-party.md); names and text stay in `.cache/`).
- **A module's own linked Effect.** These are written in the short form `@UUID[Compendium.<module>.<pack>.<id>]{Effect: …}`, and `effectLinks` gives them their full uuid, marked `verify`. Live play applies one only when `src/compiler/verify-effect.js` finds each of its rules in the item's text:
  - a FlatModifier's value and type;
  - a Resistance or Weakness, in any of its word orders ("8 resistance to primal", "4 fire resistance");
  - TempHP, FastHealing, a Sense, DamageDice, or a GrantItem's condition by name;
  - RollOption, ChoiceSet and Note pass, since they only label or ask.

  Otherwise the creature gets a note of the text for the Effect's time, and the card says why. The census checks offline the same way: 44 of the 59 Alchemists+ and Tian Xia+ links match. The 15 that don't are listed for the user in `~/Documents/ChatGPT/item-decisions-for-user.md`, most of them errors in the module's data (wrong grade linked, status for item, 10 for 35).

- **An item's own data in its text** (`src/compiler/item-data.js`, before any reading). `@item.system.runes.striking`, `@item.system.runes.potency` and `@item.level` become the item's numbers, and arithmetic in a dice count is worked out. Magic+'s 48 dragonbreath weapons, for one, do `((striking + 1) * 2)d6`, with "The save DC increases to 27 … +2 potency rune, or to 35 with a +3" giving the DC for the item's rune. A "damage with a @Check[…] save" with no degree rows of its own reads as basic, which is the only way it reads. PF2e's own text is untouched (its censuses don't change). Third-party readings that resolve: 191.

## The simulator (the auto-combat session's)

The plans were handed over on 2026-10-15. That session checked their shapes, and is waiting for the user's policy on when PCs use consumables before building it. Once built, it reads a PC's consumables through `registry.planFor(item)`, with their quantity and uses. Its planner then decides when to drink: healing when low, buffs as the fight starts, the action it costs, and whether to feed an adjacent ally. Its snapshot's "consumable" gaps then shrink.

## Asks of the other sessions

- **Ability module:** done 2026-10-15:
  - ability 1cd0e31 and a54d84b: `compileAbility` kept stable; `api.live.applyChange(change, state)` exported; the readZone crash fixed (Cold Comfort, Hampering Snare);
  - ef25d65: `api.live.postCard` and the "target-turn" duration anchor; readConditions, STAGE_CONDITIONS and readPenalties kept stable;
  - 0581bd5: `api.live.startZone`, `zone.once` and saves for a used-up item (snares).
- **Core:** done 2026-10-15:
  - `api.dying` (f8e5d41), moved from the spell module;
  - `check.roll: "automatic"` accepted by saveGaps and CHECK_ROLLS (3875c84).
- **Spell module:** `castFromItem`, done 2026-10-15 (spell c3a6b8d, local, not live-tested); it serves permanent items' activations too. `claims(item)` and `claimsWhy(item)`, done 2026-10-15 (spell b8e2503, local), for PF2e's items and the "+" ones.
- **Simulator:** it plays the consumable plans now (sim b0760a4…171474f, not released or live-checked). It reads `compileItem(item, { spellEffects, basicActions })`, `handlesItem` and `spellEffectIndex`, and `plan.item`'s category, level, uses, recipient, delivery and activations, the cast-spell and zone builtins, and noteOnly. Keep those stable, or tell it first.

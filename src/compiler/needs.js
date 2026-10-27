// What an item's card still can't do, read from the text it leaves over (tools/needs.mjs). Each need: its id, a title, what would make it
// work, where that work lies, and the words that show it. An item gets every need its words show; its main need is the first in this
// order (the most particular first). Pure.

// Several patterns as one need's test: test() when any matches, exec() the first match in the text.
const anyOf = (...patterns) => ({ test: (text) => patterns.some((pattern) => pattern.test(text)), exec: (text) => patterns.map((pattern) => pattern.exec(text)).filter(Boolean).sort((a, b) => a.index - b.index)[0] ?? null });

export const NEEDS = [
    {
        id: "creatures",
        title: "Creatures it makes or controls",
        needs: "A creature on the map: summoned, conjured or animated, a companion's or familiar's ability, a spirit or warrior that Strikes. Needs an actor and token made from a stat block (or the item's own numbers) that the user controls for the time, and its own attacks.",
        where: "ability module + item live play",
        test: /\b(?:summon\w*|conjur\w*|animat(?:e|es|ed|ing) (?:an?|the|one|up to)|animated (?:object|objects)|(?:animal )?companion\b|familiar\b|your mount\b|steed\b|minion\b|creature appears|spirits? (?:of|appear)|warriors?\b|guardian (?:appears|spirit)|duplicate of you|copy of you|servant\b|swarm of|(?:umbral|shadow|illusory) double|double that resembles)\b/i
    },
    {
        id: "forms",
        title: "Forms and size",
        needs: "A battle form, polymorph or change of size: PF2e's BattleForm and CreatureSize rules on an Effect, with the form's Strikes, AC and Speeds, and reach that follows the size.",
        where: "item reader",
        test: /\b(?:polymorph|battle form|you (?:transform|turn) into|take on the (?:form|shape)|takes? the (?:form|shape)|assume the form|in (?:the|your) form of|size (?:increases|decreases|becomes)|(?:increases|decreases|shrinks?|grows?) in size|(?:increase|decrease)s? (?:in )?size (?:by )?(?:one|two) steps?|becomes? (?:Tiny|Small|Medium|Large|Huge|Gargantuan)\b|enlarge)\b/i
    },
    {
        id: "removed",
        title: "Creatures taken out of play",
        needs: "A creature sent away for a time (into the future, to another place, frozen) and back later: its token hidden and its turns skipped, then returned where it was, by the card.",
        where: "item live play",
        test: /\b(?:(?:the target|the creature|target creature|they) (?:disappears?|vanish(?:es)?)\b|banish\w*|into the future|(?:is|are) sent to|shunted|reappears? (?:in|on|at) (?:the same|its|their) (?:space|square|location|initiative)|removed from (?:the )?(?:battlefield|combat|reality|the encounter)|out of (?:time|reality))\b/i
    },
    {
        id: "retaliation",
        title: "Damage back at attackers",
        needs: "Damage or a condition for each creature that hits, touches or attacks the user while it lasts. The module's retaliation card (kept open for the item's time: plan.retaliation, and plan.alsoRetaliation beside another card) plays damage in the wordings it reads; the rest need their wording read, or a condition or save on each hit.",
        where: "item live play",
        test: /\b(?:whenever (?:a|an|another) (?:creature|enemy|foe|adjacent creature) (?:hits|touches|attacks|Strikes|damages)|(?:a |any )?creatures? that (?:hits?|touches?|attacks?|Strikes?) you|each creature that (?:hits|touches))\b/i
    },
    {
        id: "by-kind",
        title: "Results for some creatures only",
        needs: "A result or save only for creatures of a kind (a trait, living creatures, a size): the module's plan.ifTarget reading those words, so the card applies it to them and not the rest.",
        where: "item reader",
        test: /\b(?:only (?:a |an )?creatures? (?:with|that have|of) the [\w-]+ trait|only living creatures|not constructs or undead|only (?:against )?(?:an? )?(?:undead|fiends?|constructs?|animals?|dragons?|spirits?)\b|creatures? of (?:Small|Medium|Large) size or smaller|only a living creature|vulnerable to sunlight|must breathe|holding (?:their|its) breath|that (?:are|is) (?:specifically )?(?:vulnerable|weak) to)\b/i
    },
    {
        id: "missing-number",
        title: "Numbers the text doesn't give",
        needs: "A condition value, amount or DC the item's text leaves out (the GM sets it): the user's ruling for a default, then the card applies it.",
        where: "item reader",
        question: "When the text leaves a number to the GM (\"unless the GM determines otherwise\"), should the card apply the number the text gives by default and say the GM may change it, or stay the GM's?",
        decided: "2026-10-25: Apply the text's number and say on the card that the GM may change it; counted done.",
        test: /\b(?:doesn't say how (?:much|long|many)|the GM (?:sets|decides|determines) (?:it|the|how)|unless the GM determines otherwise|as the GM (?:determines|decides))\b/i
    },
    {
        id: "cooldown",
        title: "Use limits of its own",
        needs: "A limit the item puts on itself beyond its frequency (can't be activated again for a minute, until it recharges, the other activation locked): the module's uses tracker reading those words.",
        where: "item reader",
        test: /\b(?:can't be (?:activated|used) again|can be (?:activated|used) again|can't (?:activate|use) (?:it|this|the [\w' ]+) again|until (?:it|the [\w' ]+) (?:recharges|is recharged)|must (?:wait|recharge))\b/i
    },
    {
        id: "visibility",
        title: "Hidden, undetected, invisible, cover",
        needs: "States one creature has to another: hidden, undetected, unnoticed, concealed, invisible, cover. PF2e keeps these as conditions on one actor, not per observer; the card needs the observers (by token) and Effects with roll options for the attacks they change.",
        where: "core + item live play",
        test: /\b(?:(?:become|becomes|are|is|you're|it's|remain|remains|stay|stays) (?:hidden|undetected|unnoticed|invisible|concealed)|(?:hidden|undetected|unnoticed|concealed|invisible) (?:to|from)\b|Hidden or Undetected|undetected\b|concealment|invisibility|(?:standard|lesser|greater) cover|takes? cover|gains? cover|\bHide\b|\bSneak\b|Avoid Notice)\b/
    },
    {
        id: "senses",
        title: "Senses",
        needs: "A sense for a time (darkvision, low-light vision, scent, tremorsense, echolocation, lifesense, truesight, see the invisible): PF2e's Sense rule on an Effect, read from the item's words.",
        where: "item reader",
        // (Not a smell, 2026-10-27: Ration Tonic's "faintly fruity scent", Fiendish Teleportation's "the scent of brimstone".)
        test: /\b(?:darkvision|low-light vision|(?<!\bfruity )scent\b(?! of\b)|tremorsense|echolocation|lifesense|truesight|blindsight|wavesense|see invisib\w*|see through (?:darkness|walls)|(?:precise|imprecise|vague) sense)\b/i
    },
    {
        id: "speeds",
        title: "Speeds",
        needs: "A Speed of a kind (fly, swim, climb, burrow) or a Speed set or raised beyond a plain bonus: PF2e's BaseSpeed rule on an Effect.",
        where: "item reader",
        // (Not the pace something else moves at, 2026-10-27: Messenger Missive's "Flies at a Speed of 45 feet", Wind-Up Cart's "moves forward at a
        // speed of 30 feet per round" — an object's own.)
        test: /\b(?:(?:fly|swim|climb|burrow|land) Speed|Speed (?:becomes|equal to)|(?<!\bat an? )Speed of \d+ feet|walk on (?:water|liquid)|water walk\w*|levitat\w*|hover\w*|gain (?:the )?ability to fly)\b/i
    },
    {
        id: "fortune",
        title: "Fortune and rerolls on a later roll",
        needs: "Rolling twice or rerolling a later roll that the item names only by kind (your next d20 roll with legendary proficiency, the next save against fear): the module's roll-twice and reroll builtins with that roll's predicate.",
        where: "item reader",
        test: /\b(?:roll twice|reroll\w*|take the (?:better|higher|worse|lower) (?:result|roll)|fortune effect|misfortune)\b/i
    },
    {
        id: "illusions",
        title: "Illusions and disbelief",
        needs: "An illusion and the check to disbelieve it: the user's rule for spells (disbelief as control), with the item's DC and who has seen through it.",
        where: "item live play",
        question: "Play an item's illusion as the spells' are (disbelief as control: the card's check and who has seen through it), counted done?",
        decided: "2026-10-25: Play them as the spells' illusions are: disbelief as control, the card's check against the item's DC, who has seen through it tracked.",
        test: /\b(?:illusion\w*|illusory|disbelie\w*|figment|disguise\w*)\b/i
    },
    {
        id: "vehicles",
        title: "Ships and vehicles",
        needs: "A ship or vehicle's own statistics and movement (its hull, its heading, its crew): PF2e's vehicle actors, which the card doesn't read yet.",
        where: "item live play",
        // (Not every marvelous miniature's flavor, "the camping set features the boat, campfire, and horse miniatures": the Campfire, Chest and
        // Ladder are no boats, 2026-10-27.)
        test: /\b(?:ship\b|ship's|ships\b|vehicle\w*|(?<!\bfeatures the )boat\b|hull\b|airship|wagon|cart\b|sails?\b|crew\b|heading\b)\b/i
    },
    {
        id: "linked-effect",
        title: "A second linked Effect",
        needs: "A second PF2e Effect the text links, applied only when the text says (another stage, another result): the card offering it at that moment.",
        where: "item reader",
        test: /\bis linked too\b/i
    },
    {
        id: "moving",
        title: "Moving creatures and the user",
        needs: "The user or a target moved on the map. The move card (the teleport card) already moves its user (a Stride, Step, Leap or teleport within a range) and a creature to a space its user picks (ability 0.9.2's hook); what's left: objects brought to hand, falls and their damage, jumps (High Jump, Long Jump), several creatures moved at once, travel off the map, and moves tied to another event.",
        where: "item live play",
        test: /\b(?:you (?:can )?(?:Step|Stride|Leap|Fly|Swim|Climb|Burrow|Crawl)\b|Steps? (?:twice|up to)|Strides? (?:twice|up to)|High Jump|Long Jump|\bjumps?\b|teleport\w*|you (?:move|fly|float|glide|travel)|moves? (?:up to|toward|away|you)|fall(?:s|ing)? (?:\d+ feet|prone|to the ground)|falling damage|slow(?:s|ed)? (?:the|your) fall|floats? (?:up|down|toward)|(?:pulls?|draws?|flings?|hurls?) (?:the|you|it|a) (?:target|creature)\b|(?:is |it's |are )?(?:pulled|pushed|knocked) (?:\d+ feet|back|away|toward|closer)|move its token|moves? (?:the target|them|it) \d+ feet|move the creature|Mount\b|another plane|a plane other than|\bGate\b|Plane Shift|\d+-foot fall)/i
    },
    {
        id: "areas",
        title: "Light, darkness, smoke, terrain and walls",
        needs: "A lasting area that changes the map: light or darkness, smoke or fog that conceals, difficult or hazardous terrain, a wall or barrier. Needs a Region (or the ability module's zone) with light, concealment, terrain or walls, not only a save.",
        where: "ability module + item live play",
        test: /\b(?:difficult terrain|hazardous terrain|bright light|dim light|darkness|sheds? (?:bright |dim )?light|light in an? \d+-foot|(?:the )?light's (?:area|radius)|smoke\b|fog\b|mist\b|cloud of|column of|wall of|walls?\b|barrier|cube\b|dome\b|webs?\b|ice\b(?= (?:covers|sheet|surface))|surface (?:becomes|is)|slippery|sheet of|radius\b|light the (?:candle|lantern|torch|incense)|forms? a cloud|a cloud that|first creature (?:that|to) (?:enters?|moves?|applies|steps?)|emanation centered|trip wire|pressure plate|enters the square)\b/i
    },
    {
        id: "triggers",
        title: "Triggers",
        needs: "A card offered when its trigger happens (an attack against the user, a Strike, a fall, a save, a condition gained, damage taken): live hooks on PF2e's chat messages and actor updates that watch for the event, then post the card.",
        where: "item live play",
        test: /\bTrigger\b|\btriggering (?:action|attack|creature|enemy|effect|damage|spell|Strike)\b/
    },
    {
        id: "strike",
        title: "Changes to a Strike",
        needs: "A change to the triggering or the next Strike (damage added on a hit, ignoring cover or concealment, a critical effect, reach, the multiple attack penalty), or a Strike the item makes with numbers of its own. Needs an Effect for the next Strike (roll options, DamageDice, AdjustStrike) that ends after it, or a Strike card.",
        where: "item reader + item live play",
        // (The action as PF2e writes it, "Strike" capitalized — "your Strike", "make a melee Strike", "Retributive Strike" —: "strike the
        // chime", "strike two links together", the verb, aren't one; the rest in any case. Nor where a shot lands, "within your first range
        // increment" (Burrowing Bolt's tunnel): no change to the Strike. 2026-10-27.)
        test: anyOf(/\b(?:Strikes? (?:with|against|up to)|[A-Za-z][a-z]+ Strike)\b/, /\b(?:attack rolls?\b|on a (?:critical )?hit\b|critical hits?\b|score a critical|damage rolls?\b|multiple attack penalty|reach (?:increases|of|by)|the attack (?:deals|gains|ignores)|ignores? (?:the target's )?(?:cover|concealment|circumstance bonus to AC)|uses the [\w' ]+ statistics|(?<!\bwithin (?:your|the) (?:first|second|third) )range increment|damage dice?\b|damage die\b|martial (?:ranged |melee )?weapon)\b/i)
    },
    {
        id: "actions",
        title: "Actions and feats for the user",
        needs: "The user takes an action or uses a feat through the item (Certain Strike, a Shove, Administer First Aid, an extra reaction, an action with a trait): PF2e's own action for it posted from the card, or the feat's effect read.",
        where: "item live play",
        test: /\b(?:as the [a-z' -]+ (?:feat|action|class feature|reaction)|(?:you can|you) (?:use|attempt|perform) (?:the |a |an )?(?:[A-Z][a-z]+ ){1,3}(?:action|activity|reaction|feat)|Demoralize|Shove|Trip\b|Grapple|Disarm|Feint|Create a Diversion|Administer First Aid|Treat Wounds|Battle Medicine|Raise a Shield|Shield Block|Aid\b|extra reaction|additional reaction|(?:an? )?additional action|as part of the same activity|as part of the action|you can use (?:it|this) as|Devise a Stratagem|Pursue a Lead|Interact to draw|Create a Diversion|create-a-diversion|as though by a successful|Force Open|in a stance|stances?\b)\b/
    },
    {
        id: "from-events",
        title: "Numbers from another roll",
        needs: "Damage, healing or a DC worked out from another event: equal to the damage dealt or taken, half of it, the bleed damage, a fall's damage, the critical hit's damage, a recovery check's DC lowered. Needs hooks on PF2e's damage and check messages to read that number.",
        where: "item live play",
        test: /\b(?:(?:damage|Hit Points) equal to (?:the|half|double)|equal to the (?:damage|amount|bleed|persistent)|same amount of damage|half (?:the|its|that) damage|regains? (?:a number of )?Hit Points equal|falling damage|reduce the (?:triggering )?(?:recovery )?check's DC|DC (?:is )?reduced by|decrease (?:the|its) (?:falling )?damage|redirect\w*|split the damage|triggered again|triggers? (?:its|the) weakness)\b/i
    },
    {
        id: "afflictions",
        title: "Afflictions and persistent damage",
        needs: "Suppressing, delaying or ending a poison, disease, curse or addiction, an extra save or flat check against it, or ending persistent damage: the affliction's own stages (Pseudo Afflictions in live play) and PF2e's persistent-damage conditions, read from the item.",
        where: "ability module + item live play",
        test: /\b(?:disease\w*|poison\w*|curse\w*|addiction|affliction\w*|stage\b|stages\b|drug\b|plague|virulent|onset|persistent (?:\w+ )?damage)\b/i
    },
    {
        id: "dying",
        title: "Dying, unconscious and death",
        needs: "Dying, wounded, doomed, stabilizing, falling unconscious, returning to life: the core's dying API and PF2e's conditions at the moment they change.",
        where: "core + item live play",
        test: /\b(?:dying\b|wounded\b|doomed\b|stabiliz\w*|unconscious|knocked out|dies\b|death\b|dead\b|return(?:s|ed)? (?:them |it |you )?to life|resurrect\w*|raise dead|reduced to 0 Hit Points|at 0 Hit Points)\b/i
    },
    {
        id: "spells",
        title: "Spells and the user's resources",
        needs: "A spell slot, Focus Point, staff charge, stored spell, cantrip, counterspell, ritual, Mythic or Hero Point: the spell module's casting and the user's resources read and spent.",
        where: "spell module + item live play",
        test: /\b(?:spell slots?|Focus Points?|Refocus|cantrips?\b|counterspell\w*|stored spell|spell (?:stored|in the ring)|Mythic Points?|Hero Points?|staff(?:'s)? charges|prepared (?:the )?(?:staff|spells?)|ritual\b|spellcasting (?:class|tradition)|focus spells?|Cast the Spell|overcharg\w*|infused reagents|versatile vials?|Quick Alchemy|your rage|while raging|to Cast a Spell)\b/i
    },
    {
        id: "counteract",
        title: "Counteracting and ending effects",
        needs: "Counteracting, suppressing or ending a magical effect, spell or item: a counteract card against what the user picks (an Effect, a spell, an item), its rank and its DC.",
        where: "item live play",
        test: /\b(?:counteract\w*|dispel\w*|suppress(?:es|ed|ing)? (?:the|a|an|one|its|that|all)|end(?:s|ing)? (?:the|one|an?) (?:magical )?(?:effect|spell)|antimagic|cancel\w*)\b/i
    },
    {
        id: "immunity",
        title: "Immunities and resistances by situation",
        needs: "An immunity, resistance or weakness that holds only sometimes or against one source: PF2e's Immunity, Resistance and Weakness rules with predicates, or the immunity tracker for an item's own.",
        where: "item reader",
        test: /\b(?:immune\b|immunity|immunities|resistance (?:to|against|\d+)|resist \w+|weakness (?:to|\d+))\b/i
    },
    {
        id: "situational",
        title: "Bonuses only in some situations",
        needs: "A bonus or penalty only against some creatures, checks or places (against undead, in mountains, to see through the disguise, while you're flying): PF2e roll options and predicates on the modifier, read from the sentence.",
        where: "item reader",
        test: /\b(?:(?:bonus|penalty) (?:is )?only (?:against|to|while|when|on|for)|only (?:against|while|when) (?:you|the|it|a|an|creatures)|(?:bonus|penalty) to [^.]{0,60} (?:against|while|when|that|about)|against (?:creatures|undead|fiends|dragons|animals|spirits|attacks|effects|spells) (?:that|with|of|from)|while (?:in|you're in|on) (?:the |a |an )?[a-z]+ (?:terrain|environment|water|darkness))\b/i
    },
    {
        id: "range",
        title: "Range, reach and areas made larger",
        needs: "A range, reach, area or emanation made larger for the user's other actions or spells: a change to those actions' ranges, which PF2e has no general rule for.",
        where: "core",
        test: /\b(?:range (?:of [^.]{0,40})?increases|ranges? (?:increase|are increased)|(?:increase|extend)s? the (?:range|reach|radius|area)|radius (?:increases|of the))\b/i
    },
    {
        id: "lasting",
        title: "Sustained, repeating and later effects",
        needs: "An effect the user Sustains or Dismisses, one that repeats each round or at each of a creature's turns, or one that waits for a later event (the next time you, until you): turn hooks and the Sustain button, with the card offered again.",
        where: "item live play",
        // (Not "for as long as your desire", Communication Pendants' talk at will: no time to keep, 2026-10-26.)
        // (Nor what doesn't go on, Atlas Arcane's "This intel is current the moment the phrase is spoken but does not update afterward": nothing
        // later, 2026-10-27.)
        // (Nor food that sustains a creature, Campaign Stable's "sufficient feed and water to sustain the horses for 1 day", nor a time to its
        // user's next daily preparations, Mender's Soup's "24 hours or until you make your next daily preparations": out of combat, 2026-10-27.)
        test: /\b(?:(?<!\bto )Sustain\w*|Dismiss\w*|for as long as(?! your desire)|until you(?!r next daily preparations| make your next daily preparations)|each time (?:you|it|the)|at the (?:start|end|beginning) of each of (?:your|its) turns|each round|every round|once per round|the next time (?:you|it|the)|when (?:you|it) next|later\b|(?<!\b(?:not|never) \w+ )afterward\w*|after (?:that|it|the effect) ends|when the effect ends|ends? early|ends? (?:if|when) (?:the target|it|you|the creature)|until (?:it|the target|the creature) Escapes|Thereafter|until the end of your rage|on your next turn|on or off|as long as any|end (?:it|the effect|the grab) early|Escape DC|Escape \(DC)\b/i
    },
    {
        id: "choice",
        title: "Choices on the card",
        needs: "A choice the user makes when using it (a damage type, a mode, a creature, a direction, one of a list): a picker on the card that sets what the card does.",
        where: "item live play",
        // (Not a creature's memory its user decides, Unmemorable Mantle's "You decide whether or not the creature recalls the interaction": a mind's, 2026-10-26.)
        // (Nor PF2e's Pick a Lock, Lockpicker's Oil's: an action, 2026-10-27.)
        test: /\b(?:of your choice|you choose|choose (?:a|an|one|whether|which|the|to|between)|pick (?:a|an|one)(?! Lock\b)|one of the following|you decide(?! whether or not the creature recalls)|(?:you )?select (?:a|one))\b/i
    },
    {
        id: "several",
        title: "Several creatures at once",
        needs: "Allies or several creatures each getting a result, or a number of targets the card can't count yet: a card that takes them all (the user's party, each creature in the area, up to N).",
        where: "item live play",
        test: /\b(?:all(?:ies|y)\b|each (?:creature|ally|enemy|target)|up to (?:two|three|four|five|six|\d+) (?:creatures|allies|targets|enemies)|every (?:creature|ally)|creatures within|everyone)\b/i
    },
    {
        id: "objects",
        title: "Objects and the item itself",
        needs: "What the card targets or changes isn't a creature: a lock, door, rope, container, an unattended object's Hardness and Hit Points, the item turning into another item or making one, its ammunition, charges or runes. Needs object targets on the card and item updates (create, transform, repair).",
        where: "item live play",
        test: /\b(?:an? (?:unattended )?object\b|objects\b|lock\b|locks\b|Pick a Lock|padlock|door\b|doors\b|rope\b|chains?\b|container\b|extradimensional|Hardness|Broken condition|is broken|repair\w*|negligible Bulk|\d+ Bulk|the (?:item|weapon|armor|shield|staff|cane|rod) (?:becomes|transforms|turns|changes|grows|extends|returns)|transforms? into an? (?:common )?(?:weapon|shield|tool|item|object)|weapon of your choice|(?:transforms?|transform|extends?|expands?|expand|shrinks?|grows?|folds?|collapses?|unfolds?|reverts?|reforms?)(?: (?:the|this|its|your) [\w' ]{1,30}?)?(?: from its \w+ form)?(?: permanently)? (?:down |back )?(?:into|to) (?:an?|its|the) (?:[+\w-]+ ){0,4}(?:form|weapon|shield|figurine|tree|boat|ladder|bridge|tent|crossbow|bow|club|greatclub|longspear|spear|sword|greatsword|staff|hammer|axe|whip|item|object|instrument)|an item takes|shackles|manacles|mundane gear|pieces of gear|\bdon\b|\bdoff|\bfolds?\b|\bunfold\w*|its other form|(?:shield|staff|weapon|armor) form|return to the|fly back into|uses of the same|weapons contained|permanently transforms|transforms into it|any-tool|\brefill\b|\blens\b|Bomb Fitted|reload\w*|staff's charges|temporary charges?|adds? (?:one|a|\d+) (?:temporary )?charges?|etched (?:onto|rune)|(?:potency|striking|property|fundamental|resilient) runes?|corpse|the item is destroyed|crumbles?)\b/i
    },
    {
        // (A spell-cast card's note whose words show no other need: the user's answer 2, 2026-10-26 — entry.cast, needsOf.)
        id: "cast-changes",
        title: "A spell cast with the item's changes",
        needs: "The item casts a spell but changes it: another range, area, target or rank, a rule beside the spell. The cast card plays the spell as PF2e has it; the change is a line of it.",
        where: "item live play + spell module",
        test: /(?!)/
    },
    {
        id: "reader",
        title: "Plain results the reader doesn't parse yet",
        needs: "Damage dice, a condition, a bonus or penalty, Hit Points, in words of their own: the item reader (or the ability compiler) taught the sentence. The cheapest kind to fix.",
        where: "item reader",
        // (Not a check's own d20 and modifier, Chime of Opening's "a Thievery bonus of 1d20+13": no result in it — 2026-10-27.)
        test: /\b(?:(?!1d20[+-]\d)\d+d\d+|takes? \d+ (?:\w+ )?damage|(?:Clumsy|Enfeebled|Drained|Stupefied|Frightened|Sickened|Slowed|Stunned|Dazzled|Blinded|Deafened|Fatigued|Off-Guard|Prone|Grabbed|Restrained|Immobilized|Paralyzed|Confused|Fascinated|Fleeing|Quickened|Petrified|Persistent)\b|[+-]\d+ (?:item|status|circumstance) (?:bonus|penalty)|temporary Hit Points|regains? \d+)/
    },
    {
        id: "mind",
        title: "Minds, attitudes and behaviour",
        needs: "A creature's attitude, truthfulness, memory, beliefs or compelled behaviour: no game numbers to apply. A note Effect for its time or a GM ruling, by the user's decision.",
        where: "item reader",
        question: "Attitude, truthfulness, memory and compelled behaviour: a note Effect for its time, counted done (as behaviour rules beside a real result are), or the GM's?",
        decided: "2026-10-25: A note Effect on the creature for its time counts done on its own (for items; spells keep their rule).",
        test: /\b(?:attitude\w*|truth\w*|\blie\b|\blies\b|charm\w*|compel\w*|memory|memories|recalls the interaction|emotion\w*|believes?|convinc\w*|suggestion|befriend|dominat\w*|loyal\w*|obey\w*|mood|feel(?:s)? (?:safe|calm|fear)|as its first action|must spend (?:all )?(?:\w+ )?actions)\b/i
    },
    {
        id: "information",
        title: "Information",
        needs: "Something the user learns: a location, an identity, a creature's statistics, a memory shown, a translation, a direction. An information card whispered to the GM and the user (the user's rule for spells), with what the GM fills in.",
        where: "item live play",
        question: "Apply the spells' rule (an information card whispered to the GM and the user) to items, counted done?",
        decided: "2026-10-25: The spells' rule: an information card whispered to the GM and the user, with what the GM fills in; counted done.",
        test: /\b(?:learn\w*|Identify\w*|identif\w*|detect\w*|reveal\w*|locat(?:e|es|ion|ing)|you know|knows?\b|discern\w*|divin\w*|translat\w*|shows? (?:you|the)|vision of|direction (?:of|to)|points? (?:toward|to the)|Recall Knowledge|Seek\b|aware of|remember\w*|scan\w*|pages? of writing|documents?|sense the direction)\b/i
    },
    {
        id: "speech",
        title: "Messages, speech and sound",
        needs: "Messages, languages, telepathy, sounds and silence: note Effects or chat messages, little to apply.",
        where: "item reader",
        question: "Messages, languages, telepathy and sounds: a chat message or note Effect, counted done?",
        decided: "2026-10-25: A note Effect for the item's time; counted done.",
        test: /\b(?:message\w*|speak\w*|language\w*|telepath\w*|voice\w*|\bwords?\b|music\w*|song\w*|silent(?!ly)\w*|silence\w*|whisper\w*|sounds?\b|noise\w*)\b/i
    },
    {
        id: "out-of-combat",
        title: "Out of combat and the environment",
        needs: "Hours or days, rest, travel, crafting, downtime, weather, air and water, food: what the GM plays at the table. Left over with nothing else (or with objects, information, speech), a line of its card, counted done (src/compiler/decided.js); beside other needs, theirs is the work.",
        where: "item reader",
        question: "Out-of-combat consumables stay as they are (your rule): count them done, or keep them on this list?",
        decided: "2026-10-25: Keep them on this list. 2026-10-27: when that's all that's left (with objects, information or speech), a line of its card counts done — not a unique item's or an artifact's.",
        test: /\b(?:\d+ (?:hours?|days?|weeks?|months?|years?)|(?:an|one) (?:hour|day|week|month|year)\b|24 hours|daily preparations|downtime|exploration|Earn Income|Craft\b|crafting|Subsist|rest\b|sleep\w*|travel\w*|journey|weather|severe (?:cold|heat)|extreme (?:cold|heat)|environmental|food|meal|cooking|camping|nourish\w*|formulas?\b|schematics?\b|airless|breathe\w*|underwater|submerged|\bsink\b|drown\w*)\b/i
    }
];

export const NEED_IDS = NEEDS.map((need) => need.id);

// The text an item's card leaves over: its notes, unread lines, GM lines and note Effects; for one nothing reads (note-only, none, the GM's),
// its own text — an activation's from "Effect" on (its Trigger kept), with its Craft Requirements left out.
// (Or from after its Activate line when it has no Effect heading: a feather token's "Activate Strike from a ranged weapon When activated, …" —
// the Strike that fires it, its user's own, not a change to one —, Fate Shot's "Activate (concentrate) Fate shot is …" — 2026-10-27.)
const FIRED = /^\s*Activat(?:e|ion)\s+(?:\d+ (?:minutes?|hours?|rounds?)\s+)?(?:(?:Strike from an? (?:ranged|melee|thrown) weapon|Interact|command|envision)(?:,\s*(?:Interact|command|envision))*\s*)?(?:\([^)]*\)[;:,]?\s*)?(?=[A-Z])/;
export function leftText(entry) {
    if (entry.result === "partial" || entry.result === "gaps") return entry.left.map(([, line]) => line).join(" ");
    const text = String(entry.text ?? "").replace(/\bCraft Requirements\b.*$/s, "");
    const effect = /\bEffect\b\s*(.*)$/s.exec(text);
    if (entry.kind === "activation" && !effect && FIRED.test(text)) return text.replace(FIRED, "");
    return entry.kind === "activation" && effect ? `${entry.trigger ? "Trigger " : ""}${effect[1]}` : text;
}

// Its needs, the main one first; "no-rules" when its words show none (food, refills, ingredients: nothing for a card to do).
// (What its user only learns isn't an affliction to play — Gaze of the Mantis's "you also know any afflictions, conditions, and spells affecting
// them", Secret-Keeper's Mask's "You know whether the object is poison", Origin Unguent's "You can check if the two share an origin (… or if a
// poison sample …)": information, 2026-10-27.)
const KNOWING = /\b(?:you (?:also )?know (?:any|whether)|you can check if)\b[^.]*\./gi;
const testOf = (need, text) => need.test.test(need.id === "afflictions" ? text.replace(KNOWING, " ") : text);
export function needsOf(entry) {
    const text = leftText(entry);
    const found = NEEDS.filter((need) => testOf(need, text)).map((need) => need.id);
    return found.length ? found : [entry?.cast ? "cast-changes" : "no-rules"];
}

// What its main need's words were — the phrase that matched it ("teleports into your hand", "fall", "summon"): the work within a need,
// grouped (tools/needs.mjs's worklist). key: its words stemmed, so "summons" and "summoned" go together. Null when no words matched.
// (Its words' first 8 letters, stemmed: "teleports" and "teleportation" together, "illusion" and "illusory" apart.)
const stem = (word) => (word.length > 4 ? word.replace(/(?:ing|ed|es|s)$/, "") : word).slice(0, 8);
// (A trigger's work is its event: the first words after "Trigger", "you are targeted", "an ally within".)
const TRIGGER = /\bTrigger\s+(.+?)(?=\s+(?:Effect|Requirements?|Frequency)\b|[.;:]|$)/s;
const TRIGGER_WORDS = 3;
export function workOf(entry, id = needsOf(entry)[0]) {
    const need = NEEDS.find((candidate) => candidate.id === id);
    const text = leftText(entry);
    const event = id === "triggers" ? TRIGGER.exec(text) : null;
    if (event) {
        const phrase = `${event[1].toLowerCase().replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, TRIGGER_WORDS).join(" ")} …`;
        return { key: `trigger: ${phrase}`, phrase: `Trigger: ${phrase}` };
    }
    const match = need ? need.test.exec(text) : null;
    if (!match) return null;
    const phrase = match[0].toLowerCase().replace(/\s+/g, " ").replace(/^(?:an?|the|your|you|it|its|is|are) /, "").trim();
    return { key: phrase.split(" ").map(stem).join(" "), phrase };
}

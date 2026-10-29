// Items with no rule, information, minds, speech, objects and out of combat: the readings of the 2026-10-28 batch's plain group (src/compiler/group-readings.js calls this outermost on both chains).
// context: { kind ("consumable" or "activation"), name (an activation's "Item: Activation"), html, text, words, base, info, frequency (an
// activation's), item, entry (an activation's), options, decide(plan) (the user's rulings applied again, for a plan still partial) }.
// → the new plan, or the same one. Pure.
//
// The third-party modules' items of the group (2026-10-28, docs/needs.md), each read sentence by sentence — every sentence of its effect one of
// the reading's own, none dropped — into what its card plays (their words are theirs: the cards' lines here are paraphrases):
// - Used within its user's own skill action (src/compiler/item-actions.js, action.whole — the action card's lines, action.after): Cardinal
//   Moss's compass for Sense Direction, Crook's Raskovnik's lock opened at one success, the lesser Aromatic Lavender's olfactory diversion
//   (or its Cover Tracks DC, out of combat), the lesser Wriggling Kudzu's minute on a trap. Memory Mugwort's Recall Knowledge at the nearest
//   danger: its skill picked of two (action.statistics), its DC the hard DC of the creature's or hazard's level (action.dc.level, played by
//   scripts/item-actions.js), Stupefied 1 for a round after it (action.selfAfter). The lesser Nettle Balm's assisted recovery (plan.item.recovery,
//   its card's line). Warding Moly's next save against the spell identified: the readied-bonus card's +4 item bonus and PF2e's RollTwice, its
//   user pressing Apply before that save.
// - A creature out of a bottle that acts once and is gone: Bandersnatch Bottle's and Preserved Pteranodon's Strikes (their own attack, the
//   reach their flight or Stride gives as range), Jabberwock Jar's burble (the ways card, each way's lines its save card's), the Pickled
//   Dragons' breath (the ways card of its three shapes, each a basic Fortitude save card whose damage type is picked, the critical failure's
//   persistent damage of that type — src/compiler/type-choice.js withTypeChoices).
// - Rows of their own: the Brain Jars' talking brain (each degree's terms a note Effect on it for the jar's time, the critical failure's −2
//   status penalty to Deception its modifier); Construct Override after its user's critical hit on a mindless construct (plan.gate's critical
//   Strike, plan.ifTarget leaving out any other creature, Controlled to the end of its user's next turn or for a minute, incapacitation);
//   Ferromagnetizer Ammunition's struck creature (the ways card: Encumbered outright for metal armor or a metal body, a Reflex save for metal
//   held, its critical failure dropping it — plan.dropHeld); Silken Tail's flash (the ways card: the creatures its whip damaged this round
//   saving at −2, the others as they are — its user's to target).
// - Lines and note Effects: Ant Pheromones' swarm acting last (the conjure card's lines), Moonlight Chocolate's waking hours (out of combat),
//   Oil of Malleability's softened metal (its object a line, a softened weapon's penalty a note Effect for the hour), Serpentine Mirror's
//   mirror too hot to hold (a note Effect on its user, plan.userEffects), the Barbarians+ crowns' extra action's use (plan.item.untilRage.only,
//   the rage Effect's words) and Instinct Crown (Zealot)'s deity's enemies (the fortune card's lines).

import { withSentenceReadings } from "./lasting.js";
import { DRAGON_TYPES, withTypeChoices } from "./type-choice.js";

const ROUND = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "effect-start" };
const basicRows = () => Object.fromEntries([["criticalSuccess", 0], ["success", 0.5], ["failure", 1], ["criticalFailure", 2]].map(([degree, multiplier]) => [degree, { damage: { mode: "shared", multiplier, sourceComponentIds: multiplier ? ["0"] : [] }, effects: [] }]));
const done = { partial: undefined, automation: { level: "automatic" } };
const capital = (word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

// (An item action read whole: its lines in place of the text's — action.whole, src/compiler/item-actions.js actionLeaves.)
// (One aimed at a creature now, Memory Mugwort's: the plan's target the action card's.)
const whole = (plan, after, more = {}) => ({ keep: true, action: { ...plan.action, ...more, whole: true, after }, ...(more.targeted ? { targeting: { ...(plan.targeting ?? {}), target: "the creature targeted" } } : {}), ...done });
const isAction = (slug) => (plan) => plan?.builtin === "item-action" && plan.action?.slug === slug;

// --- Used within its user's own action ------------------------------------------------------------------------------------------------------

const OWN_ACTION = [
    {
        // (A compass for Sense Direction: no penalty for lacking one.)
        name: "Cardinal Moss",
        over: isAction("sense-direction"),
        sentences: [/^\s*Sense Direction\s+This vibrant\s+sample\b.*\.$/, /^\s*You can Activate\s+the item as\s+part of your\s+Sense Direction\.$/, /^\s*Cardinal moss counts\s+as a compass\s+for the purpose\s+of Sense Direction\.$/],
        card: (found, plan) => whole(plan, "Used within its user's Sense Direction, it serves as a compass: no penalty for having none.")
    },
    {
        // (No thieves' tools, and one success opens the lock: out of combat, the card's line.)
        name: "Crook's Raskovnik",
        over: isAction("pick-a-lock"),
        sentences: [/^\s*Pick a Lock\s+It is notoriously\s+difficult\b.*\.$/, /^\s*Raskovnik has\s+the uncanny\s+ability\b.*\.$/, /^\s*You can Activate\s+the raskovnik\s+as part of your\s+Pick a Lock\.$/, /^\s*You do not need\s+thieves' tools for your check\s+and you reduce the number\s+of successes required to one,\s+regardless of the complexity\s+of the lock,\s+allowing you to\s+unlock the lock after a single\s+successful check\.$/],
        card: (found, plan) => whole(plan, "Used within its user's Pick a Lock: it needs no thieves' tools, and a single success opens the lock, however complex.")
    },
    {
        // (The diversion olfactory; or, out of combat, Cover Tracks at its DC: the card's lines.)
        name: "Aromatic Lavender (Lesser)",
        over: isAction("create-a-diversion"),
        sentences: [/^\s*Create a Diversion\s+or Cover Tracks\s+This noxiously\b.*\.$/, /^\s*You can Activate\s+the item as\s+part of your\s+Create Diversion\.$/, /^\s*When you do so,\s+the diversion gains\s+the olfactory trait\s+instead of the traits\s+it would normally gain\s+from a gesture or words\.$/, /^\s*Alternatively,\s+you can use the lavender\s+as part of your\s+Cover Tracks\s+exploration activity\s+and can use\s+@Check\[survival\|dc:(\d+)[^\]]*\]\s+instead of your\s+Survival DC\s+if it is higher\s+than your own\.$/],
        card: (found, plan) => whole(plan, `Used within its user's Create a Diversion, the diversion is olfactory in place of the traits a gesture or words give it. Or, within Cover Tracks (exploration), DC ${found[3][1]} stands for its user's Survival DC when that's higher.`)
    },
    {
        // (A minute on the trap or device, as thieves' tools; it stays disabled for the rest of that minute.)
        name: "Wriggling Kudzu (Lesser)",
        over: (plan) => isAction("disable-device")(plan) && Boolean(plan.action.minimum),
        sentences: [/^\s*Disable a Device\s+This sample\s+of modified\b.*\.$/, /^\s*You can Activate\s+the item as part\s+of your Disable Device\s+on a trap or a complex device,\s+attaching itself to the target\s+for 1 minute\.$/, /^\s*You are treated\s+as if you had\s+the appropriate thieves tools\s+for your checks to\s+Disable Device and you can use\s+a \+\d+ Thievery modifier\b.*\bhigher than your own\.$/, /^\s*After being attached\s+to a trap or complex device,\s+you can continue\s+to attempt Disable Device\s+checks against the target\.$/, /^\s*If you disable the device,\s+it remains disabled\s+for the remaining duration,\s+after which the grass\s+deteriorates and the trap\b.*\bfunctions normally\.$/],
        card: (found, plan) => whole(plan, "Used within its user's Disable Device on a trap or complex device, it clings there for 1 minute as thieves' tools, and its user may keep trying meanwhile. Once disabled, the device stays so until the minute is up, then works again.")
    },
    {
        // (The nearest danger's Recall Knowledge, either skill, at the hard DC of its level; Stupefied 1 for a round after.)
        name: "Memory Mugwort",
        over: isAction("recall-knowledge"),
        sentences: [/^\s*Recall Knowledge\s+\((\w+) or (\w+)\)\s+The bittersweet\b.*\.$/, /^\s*Activating the item\s+is part of the same action\s+you use to Recall Knowledge\.$/, /^\s*You attempt a Recall Knowledge\s+against the nearest\s+surrounding danger,\s+should one exist,\s+learning about a creature\s+or hazard within (\d+) feet of you\.$/, /^\s*The DC of the Recall Knowledge\s+is a (hard|very hard) DC\s+of the creature or\s+hazard’s level\.$/, /^\s*You can use Recall Knowledge\s+in this way even if\s+the creature or hazard\b.*\bfor your Recall Knowledge\.$/, /^\s*Regardless of your result,\s+you become (Stupefied) (\d+)\s+for (\d+) rounds?\s+after inhaling the incense\.$/],
        card: (found, plan) => {
            const skills = [found[0][1], found[0][2]].map((skill) => skill.toLowerCase());
            const [, slug, value, rounds] = found[5];
            return whole(plan, `At the nearest danger within ${found[2][1]} feet, a creature or hazard (target it): its DC is the ${found[3][1]} DC of its level, and either skill serves whatever it is. Then its user is ${slug} ${value} for ${rounds} round${rounds === "1" ? "" : "s"}, whatever the result.`, {
                slugs: skills.map(() => "recall-knowledge"),
                names: skills.map((skill) => `Recall Knowledge (${capital(skill)})`),
                statistics: skills,
                targeted: true,
                dc: { level: found[3][1].toLowerCase() },
                selfAfter: { slug: slug.toLowerCase(), value: Number(value), duration: { ...ROUND, value: Number(rounds) } }
            });
        }
    },
    {
        // (Its assisted recovery the item card's own, plan.item.recovery: the line for its user's action.)
        name: "Nettle Balm (Lesser)",
        over: (plan) => Boolean(plan?.item?.recovery) && plan.partial,
        sentences: [/^\s*Assisted Recovery\s+\(manipulate\)\s+This prickly\b.*\.$/, /^\s*You can Activate\s+the balm as\s+part of your\s+Assisted Recovery against acid\s+or fire damage\.$/, /^\s*The creature touched\s+immediately attempts\s+a @Check\[flat\|dc:\d+\]\s+to end the persistent damage,\s+taking damage as normal\s+on a failure\.$/],
        card: () => ({ keep: true, notes: ["Used within its user's Assisted Recovery, on the creature touched: against its persistent acid or fire damage."], ...done })
    },
    {
        // (The next save against the spell identified, within a day: +4 item and rolled twice — its user presses Apply before that save.)
        name: "Warding Moly",
        over: isAction("recall-knowledge"),
        sentences: [/^\s*Recall Knowledge\s+This mysterious\s+herb\b.*\.$/, /^\s*You can Activate\s+the moly as part\s+of your Recall Knowledge\s+to identify a spell\.$/, /^\s*When you do so,\s+you impart\s+alchemical protections\b.*\.$/, /^\s*The next time within (\d+) hours\s+you make a save\s+against the spell\s+you identified,\s+you can roll twice\s+and take the higher result,\s+and you gain a \+(\d+) (item) bonus\s+to the save\.$/, /^\s*This is a fortune effect\.$/],
        card: (found, plan) => ({
            keep: true,
            builtin: "readied-bonus",
            action: undefined,
            targeting: { target: "the user", range: null, area: null },
            bonus: { modifiers: [{ selector: "saving-throw", type: found[3][3], value: Number(found[3][2]) }], rules: [{ key: "RollTwice", selector: "saving-throw", keep: "higher" }], resistance: null, duration: { value: 0, unit: "rounds", expiry: "turn-end" }, spend: ["saving-throw"] },
            notes: [`Used within its user's own Recall Knowledge to identify a spell (its roll).`, `Press Apply just before its next save against that spell, within ${found[3][1]} hours: rolled twice, the better kept (a fortune effect).`],
            ...done
        })
    }
];

// --- A creature out of a bottle ---------------------------------------------------------------------------------------------------------------

// (A Pickled Dragon's breath: its three shapes the ways card's, each a basic Fortitude save of the type picked.)
const SHAPES = [/^\s*Cone\s+The area is\s+an? (\d+)-foot cone\.$/, /^\s*Line\s+The area is\s+an? (\d+)-foot line\.$/, /^\s*Burst\s+The area is\s+(?:an? (\d+)-foot burst|a single square)\s+within (\d+) feet\.$/];
function breathWays(found, plan, { base, info, html }) {
    const [, fly, dice, dc] = found[7];
    const persistent = found[8][1];
    const [cone, line, burst] = found.slice(9);
    const save = (area, range, words) => withTypeChoices({
        ...base,
        automation: { level: "automatic" },
        targeting: { target: null, range: `${range} feet`, area },
        trigger: { event: "use" },
        resolution: { kind: "save", check: { roll: "save", statistic: "fortitude", basic: true, against: { dc: "fixed", value: Number(dc) } }, sharedDamage: { rollOnce: true, components: [{ id: "0", formula: `${dice}[untyped]`, type: null, category: null }] }, outcomes: basicRows() },
        item: info,
        notes: [`The dragon flies up to ${fly} feet first and breathes from there: ${words} (target the creatures in it).`, "Its damage type and its shape were its dragon's breath's, set when it was crafted: pick its type here (mental for a breath that dealt none); it has that element's trait."]
    }, { types: DRAGON_TYPES.map((type) => ({ label: capital(type), type })), criticalPersistent: persistent });
    const burstArea = burst[1] ? { type: "burst", value: Number(burst[1]) } : { type: "square", value: 5 };
    const burstWords = burst[1] ? `a ${burst[1]}-foot burst within ${burst[2]} feet of it` : `a single square within ${burst[2]} feet of it`;
    return {
        builtin: "ways",
        once: true,
        targeting: { target: null, range: null, area: null },
        resolution: undefined,
        notes: undefined,
        ways: [
            { name: `Cone (${cone[1]} feet)`, html, plan: save({ type: "cone", value: Number(cone[1]) }, fly, `a ${cone[1]}-foot cone`) },
            { name: `Line (${line[1]} feet)`, html, plan: save({ type: "line", value: Number(line[1]) }, fly, `a ${line[1]}-foot line`) },
            { name: `Burst (${burst[1] ? `${burst[1]} feet` : "one square"})`, html, plan: save(burstArea, Number(fly) + Number(burst[2]), burstWords) }
        ]
    };
}

const BOTTLED = [
    {
        // (Its Seek and Stride before the bite: the reach as range, the rest the card's line.)
        name: "Bandersnatch Bottle",
        over: (plan) => plan?.ownCheck?.kind === "attack" && plan.partial,
        sentences: [/^\s*The contents of this glass bottle\b.*\.$/, /^\s*When Activated,\s+it creates\s+an? (\w+) bandersnatch\.$/, /^\s*The bandersnatch Seeks\s+a creature within (\d+) feet\s+using its scent as\s+a precise sense\s+and a \+(\d+) perception,\s+and then Strides up to (\d+) feet\s+towards it and Strikes\s+with a jaw Strike\s+with a \+\d+ attack modifier\.$/, /^\s*The Strike deals \d+d\d+ plus \d+ piercing damage\s+and has a reach of (\d+) feet\.$/, /^\s*The bandersnatch then\s+disintegrates into nothing\.$/],
        card: (found) => ({
            keep: true,
            targeting: { target: "1 creature", range: `${found[2][1]} feet`, area: null },
            notes: [`A ${found[1][1]} bandersnatch springs out, Seeks a creature within ${found[2][1]} feet (Perception +${found[2][2]}, its scent a precise sense — it finds one hidden there as the GM rolls it), Strides up to ${found[2][3]} feet toward it and bites with ${found[3][1]}-foot reach, then is gone. Target that creature.`],
            ...done
        })
    },
    {
        // (Its flight before the peck: the range.)
        name: "Preserved Pteranodon",
        over: (plan) => plan?.ownCheck?.kind === "attack" && plan.partial,
        sentences: [/^\s*This jar contains\s+a shrunken\b.*\.$/, /^\s*When activated,\s+an? (\w+) pteranodon\s+explodes out\b.*\.$/, /^\s*The pteranodon flies up to (\d+) feet,\s+and makes a beak Strike\s+with a \+\d+ modifier\s+that deals \d+d\d+ piercing damage\.$/, /^\s*On a critical hit,\s+the target is Dazzled\s+for a round\b.*\.$/, /^\s*It then rapidly\s+dessicates into nothing\.$/],
        card: (found) => ({ keep: true, targeting: { target: "1 creature", range: `${found[2][1]} feet`, area: null }, notes: [`A ${found[1][1]} pteranodon bursts out, flies up to ${found[2][1]} feet to the foe targeted and pecks it, then withers away.`], ...done })
    },
    {
        // (The burble picked on the ways card: each way's save card with the jabberwock's flight its line, the area round it.)
        name: "Jabberwock Jar",
        over: (plan) => plan?.builtin === "ways" && plan.ways?.length === 2 && plan.partial,
        sentences: [/^\s*This frabjous bottle\b.*\.$/, /^\s*When activated,\s+an? (\w+) jabberwock emerges,\s+and flies forward up to (\d+) feet\s+before it begins to burble\.$/, /^\s*Choose one of the following\s+effects of the burble\.$/, /^\s*Confusion\s+\(emotion, mental\)\s+Creatures that fail\b.*\bConfused for 1d4 rounds\.$/, /^\s*Sonic Beam\s+\(sonic\)\s+All creatures within (\d+) feet\s+of the creature take\b.*\bbasic\]\s+save\.$/],
        card: (found, plan) => {
            const flight = `A ${found[1][1]} jabberwock flies up to ${found[1][2]} feet from the jar, then burbles there (place it on the map)`;
            const [confusion, beam] = plan.ways;
            const way = (entry, traits, targeting, line) => ({ ...entry, plan: { ...entry.plan, traits: [...new Set([...(entry.plan.traits ?? []), ...traits])], targeting, notes: [...(entry.plan.notes ?? []), line] } });
            return {
                keep: true,
                notes: undefined,
                ways: [
                    way(confusion, ["emotion", "mental"], { target: "the creatures it burbles at", range: `${found[1][2]} feet`, area: null }, `${flight}: target the creatures its burble reaches.`),
                    way(beam, ["sonic"], { target: null, range: `${found[1][2]} feet`, area: { type: "burst", value: Number(found[4][1]) } }, `${flight}: every creature within ${found[4][1]} feet of it (target them).`)
                ],
                ...done
            };
        }
    },
    {
        // (Its breath in the shape and type it was crafted with: the ways card.)
        name: /^\s*Pickled Dragon \((?:Minor|Lesser|Moderate|Greater|Major)\)$/,
        over: (plan) => plan?.resolution?.kind === "save",
        sentences: [/^\s*This bottle of strange liquid\b.*\.$/, /^\s*When it breaks open,\s+it ages rapidly\b.*\.$/, /^\s*The damage type and shape\s+of the breath weapon\s+are chosen upon crafting\b.*\.$/, /^\s*If the dragon’s breath attack\s+does not deal damage,\s+the damage type is mental\.$/, /^\s*The pickled dragon gains\s+the appropriate elemental trait\.$/, /^\s*When you Activate it,\s+it flies the specified distance\s+and then uses its breath attack\.$/, /^\s*The dragon embryo grows into\s+an? [\w ,]+?(?:dragon|drake)\.$/, /^\s*It flies up to (\d+) feet,\s+and uses its breath attack,\s+which deals (\d+d\d+) damage\s+to each creature within the area\s+\(@Check\[fortitude\|dc:(\d+)\|basic\]\s+save\)\.$/, /^\s*Creatures that critically fail\s+the save also take (\d+(?:d\d+)?) persistent damage\.$/, ...SHAPES],
        card: (found, plan, given) => ({ keep: true, ...breathWays(found, plan, given), ...done })
    }
];

// --- Rows and lines of their own ----------------------------------------------------------------------------------------------------------

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const timeOf = (value, unit) => ({ mode: "fixed", value: Number(value), unit: /^\s*min/i.test(unit) ? "minutes" : /^\s*hour/i.test(unit) ? "hours" : /^\s*day/i.test(unit) ? "days" : "rounds", expiry: "turn-start", anchor: "effect-start" });
const NEXT_TURN_END = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const condition = (slug, duration, value = null) => ({ kind: "condition", slug, value, duration });
const note = (label, text, duration) => ({ label, text, duration });

// (A Brain Jar's sentences, the greater one's with one more.)
const JAR = [
    /^\s*with a suitable corpse\s+\(manipulate\)\s+This strange jar\b.*\.$/,
    /^\s*A brain jar can be used\s+to hold the nervous system\b.*\bfor (\d+) (minutes?|hours?) when Activated\.$/,
    /^\s*The brain in the jar\s+can answer questions\b.*\.$/,
    /^\s*You can ask the brain (\d+) questions\.$/,
    /^\s*This jar uses the nervous\s+system's latent memories\b.*\bmostly intact\.$/,
    /^\s*The more damage the nervous\s+system has taken\b.*\.$/,
    /^\s*The nervous system can attempt\s+a (?:@Check\[type:will\|dc:\d+\|basic:false\]|Will save)\s+to resist answering\b.*\bwith the following effects\.$/,
    /^\s*A nervous system inside\s+of a brain jar remains\s+preserved for (\d+) (days?|hours?)\s+after its Activation\.$/,
    /^\s*Success\s+The target can provide\s+false information\b.*\.$/,
    /^\s*Failure\s+The target must answer\s+truthfully\b.*\.$/,
    /^\s*It can still mislead you\b.*\.$/,
    /^\s*Critical Failure\s+As failure,\s+but the target's answers\b.*\.$/,
    /^\s*It takes a -(\d+) (status) penalty\s+to Deception checks\s+to deceive or mislead you\.$/
];
function jarCard(found, plan) {
    const greater = found.length === 14;
    const time = greater ? timeOf(found[13][1], found[13][2]) : timeOf(found[1][1], found[1][2]);
    const label = plan.source?.name ?? "Brain Jar";
    const lies = note(label, "Its brain may lie to its questioner or refuse to answer.", time);
    const truthful = "Its brain must answer truthfully, if briefly, cryptically and repetitively — though it can still mislead or stall until the time runs out.";
    const outcomes = {
        criticalSuccess: { ...none(), noteEffects: [lies] },
        success: { ...none(), noteEffects: [lies] },
        failure: { ...none(), noteEffects: [note(label, truthful, time)] },
        criticalFailure: { ...none(), modifiers: [{ selector: "deception", value: -Number(found[12][1]), type: found[12][2], duration: time }], noteEffects: [note(label, `${truthful} Its answers are more direct and less repetitive, still cryptic, and it takes a −${found[12][1]} ${found[12][2]} penalty to Deception against its questioner.`, time)] }
    };
    return {
        keep: true,
        activation: { ...(plan.activation ?? {}), time: "10 minutes" },
        trigger: { ...(plan.trigger ?? {}), event: "use" },
        targeting: { target: "the corpse's nervous system in the jar", range: "touch", area: null },
        resolution: { ...plan.resolution, outcomes },
        notes: [
            greater ? "Any number of questions, answered as the creature knew in life for a day (the GM answers): after every third, its brain saves again — the GM rolls it at the same DC." : `${found[3][1]} questions, answered as the creature knew in life (the GM answers), for ${found[1][1]} ${found[1][2]}.`,
            "Only a corpse whose nervous system is mostly intact: the more damaged, the less accurate its answers. It saves with the creature's statistics at its death.",
            `The brain stays preserved in the jar for ${found[7][1]} ${found[7][2]}.`
        ],
        ...done
    };
}

const CONSUMED = [
    {
        // (A talking brain for its time, its answers the GM's: each degree's terms a note Effect on it, the critical failure's −2 status penalty
        // to Deception its modifier; the rest its card's lines.)
        name: "Brain Jar",
        over: (plan) => plan?.resolution?.kind === "save" && plan.partial,
        sentences: JAR,
        card: (found, plan) => jarCard(found, plan)
    },
    {
        // (The greater one's day, unlimited questions and its new save after every third.)
        name: "Brain Jar (Greater)",
        over: (plan) => plan?.resolution?.kind === "save" && plan.partial,
        sentences: [...JAR, /^\s*A greater brain jar functions\s+as a brain jar,\s+except the @Check\[type:will\|dc:\d+\|basic:false\],\s+duration is extended to (\d+) (days?|hours?)\b.*\bnew save against this effect\.$/],
        card: (found, plan) => jarCard(found, plan)
    },
    {
        // (After its user's critical hit on a mindless construct: Stunned 1, or Controlled by its user to the end of its next turn — a minute on
        // a critical failure; incapacitation; the struck creature the card's.)
        name: "Construct Override",
        over: (plan) => plan?.resolution?.kind === "save" && plan.partial,
        sentences: [/^\s*These three interlocking\s+gears\b.*\.$/, /^\s*Activating them allows you\s+to temporarily gain control\b.*\.$/, /^\s*Activate - New Mind Protocol\s+\(envision\)\s+Trigger You have just\s+critically succeeded at a Strike\s+against a mindless creature\s+with construct trait\s+The triggering creature must make\s+a @Check\[dc:\d+\|type:fortitude\] save\.$/, /^\s*Critical Success\s+The creature is unaffected\s+Success\s+The target is Stunned (\d+)\s+Failure\s+The target has gained\s+the Controlled condition,\s+with you as the controller\s+until the end of your next turn\.$/, /^\s*Critical Failure\s+As failure,\s+except the target has\s+the controlled condition for (\d+) (minutes?)\.$/, /^\s*This is an incapacitation effect\.$/],
        card: (found, plan) => {
            const long = timeOf(found[4][1], found[4][2]);
            const controlled = (duration, words) => ({ ...none(), effects: [condition("controlled", duration)], noteEffects: [note("Construct Override", `Controlled by the talisman's user ${words}: it obeys their commands.`, duration)] });
            return {
                keep: true,
                traits: [...new Set([...(plan.traits ?? []), "incapacitation"])],
                targeting: { target: "the construct struck", range: null, area: null },
                gate: { ...(plan.gate ?? {}), strike: { critical: true, any: true, maneuvers: [] } },
                ifTarget: [...(plan.ifTarget ?? []), { traits: ["construct"], lacks: true, immune: true }, { traits: ["mindless"], lacks: true, immune: true }],
                resolution: { ...plan.resolution, outcomes: { criticalSuccess: none(), success: { ...none(), effects: [condition("stunned", null, Number(found[3][1]))] }, failure: controlled(NEXT_TURN_END, "until the end of their next turn"), criticalFailure: controlled(long, `for ${found[4][1]} ${found[4][2]}`) } },
                notes: ["Only right after its user's critical hit with a Strike on a mindless construct: the card is at the creature struck."],
                ...done
            };
        }
    },
    {
        // (The swarm's turn last in the order, and its going when it has nothing to attack: the conjure card's lines.)
        name: "Ant Pheromones",
        over: (plan) => plan?.builtin === "conjure" && plan.partial,
        sentences: [/^\s*This vial contains\s+potent pheromones\b.*\.$/, /^\s*You throw the vial\s+at a spot on the ground\s+within (\d+) feet\b.*\bat the end of the round\.$/, /^\s*The swarm immediately\s+takes its turn at the end\s+of the initiative order\b.*\.$/, /^\s*If there are no creatures\s+in its area,\s+the swarm dissipates\s+at the end of its turn\.$/, /^\s*Otherwise, the swarm remains\s+in the same spot for (\d+) rounds\s+unless destroyed sooner\.$/],
        card: (found) => ({
            keep: true,
            notes: [`Thrown at a spot within ${found[1][1]} feet: the swarm appears there, centred on it, at the end of the round, and acts at once, last in the initiative order (move its turn to the end), attacking every creature in its area.`, `If nothing is in its area it disperses as its turn ends (dismiss it); otherwise it stays in place for ${found[4][1]} rounds unless destroyed first.`],
            ...done
        })
    },
    {
        // (Awake 2 hours longer before fatigue: out of combat, its card's lines.)
        name: "Moonlight Chocolate",
        sentences: [/^\s*Made of alchemically\s+enhanced cocoa\b.*\.$/, /^\s*After Activating the chocolate\s+by eating it,\s+you extend the amount\s+of time you can remain awake\s+by (\d+) hours\s+before becoming fatigued\s+\(normally (\d+) hours\)\.$/, /^\s*You can continue to consume\s+moonlight chocolate\b.*\bto a maximum of (\d+) hours\s+before becoming fatigued\.$/, /^\s*Consuming moonlight chocolate\s+while fatigued has no effect\.$/],
        card: (found) => ({
            targeting: { target: null, range: null, area: null },
            resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
            notes: [`Its eater can stay awake ${found[1][1]} hours longer before becoming fatigued (${found[1][2]} hours as a rule), up to ${found[2][1]} hours with more of them; eaten while fatigued, it does nothing.`],
            decided: "card-line"
        })
    },
    {
        // (A metal object softened for an hour: its card's lines; a weapon made malleable, its −2 and nonlethal damage, a note Effect on its user.)
        name: "Oil of Malleability",
        sentences: [/^\s*This shining oil makes\s+metal ductile\b.*\.$/, /^\s*When you apply the oil\s+to a non-magic metal object\s+of (\d+) Bulk or less\b.*\.$/, /^\s*You can use multiple doses\s+and spend the appropriate\b.*\bof larger Bulk\.$/, /^\s*Once you Activate it,\s+items that have the oil applied\s+reduce their Hardness by (\d+)\.$/, /^\s*If the item’s Hardness\s+is reduced to 0\s+from this effect,\s+the metal becomes malleable\b.*\.$/, /^\s*Metal weapons that become malleable\s+from this effect have a -(\d+) item bonus\s+to Strikes and deal\s+non-lethal damage\.$/, /^\s*These effects last for (\d+) (hours?),\s+after which point the metal\b.*\.$/],
        card: (found) => {
            const time = timeOf(found[6][1], found[6][2]);
            return {
                targeting: { target: null, range: "touch", area: null },
                resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), noteEffects: [note("Oil of Malleability", `An object it oiled has Hardness ${found[3][1]} lower; one brought to Hardness 0 is soft and pliable, and a metal weapon so softened takes a −${found[5][1]} item penalty to Strikes and deals nonlethal damage. Then it hardens again.`, time)] } } },
                notes: [`On a non-magic metal object of ${found[1][1]} Bulk or less; more doses, and more time, for a bulkier one. Its Effect stays on its user (move it to the wielder of a softened weapon).`]
            };
        }
    }
];

const ACTIVATED = [
    {
        // (Quickened until the rage ends, already read — src/compiler/rage-time.js —, its extra action's use the Effect's words: untilRage.only.)
        name: /^\s*Instinct Crown \((?:Bloodrager|Elemental|Wildblood)\)$/,
        over: (plan) => Boolean(plan?.item?.untilRage) && plan.partial,
        sentences: [/^\s*(?:Your connection to magic|You can call on the elements|Your wildblood acts)\b.*\.$/, /^\s*You become quickened\s+until the end of your rage\.$/, /^\s*You can use your extra action\s+(?:for the action you gained\s+)?to (.+)\.$/],
        card: (found, plan) => ({ keep: true, item: { ...plan.item, untilRage: { ...plan.item.untilRage, only: found[2][1] } }, notes: undefined, ...done })
    },
    {
        // (Its fortune card's attack roll for the rage: the deity's enemies its user's to judge, card lines.)
        name: "Instinct Crown (Zealot)",
        over: (plan) => plan?.builtin === "roll-twice" && plan.rollTwice?.selector === "attack-roll" && plan.partial,
        sentences: [/^\s*You call upon your god\b.*\.$/, /^\s*You treat all enemies\s+during this rage as if\s+they were enemies of your deity\.$/, /^\s*Once during your Rage,\s+when you make an attack roll\s+against a creature that would\s+normally qualify as an enemy\s+of your deity you can roll twice\s+and take the better result\.$/, /^\s*This is a fortune effect\.$/],
        card: () => ({ keep: true, notes: ["During this rage every enemy counts as one of its deity's enemies, for its own instinct's rules.", "Once this rage: press Apply just before an attack roll at a creature that's its deity's enemy in its own right."], ...done })
    },
    {
        // (The creatures within 5 feet that see it: those it damaged this round with a −2 circumstance penalty to the save — its user's
        // own pick of whom to target, a way each.)
        name: "Silken Tail",
        over: (plan) => plan?.resolution?.kind === "save" && plan.partial,
        sentences: [/^\s*You wave the silken tail\b.*\.$/, /^\s*Creatures other than you\s+within (\d+) feet\s+who can see the whip\s+must succeed at\s+a @Check\[type:fortitude\|dc:\d+\] save\s+or become\s+@Compendium\[[^\]]+\]\{Dazzled\}\s+for 1 round\.$/, /^\s*Creatures you have damaged\s+with the whip this round\s+take a -(\d+) (circumstance) penalty\s+on this save\.$/],
        card: (found, plan, { html }) => {
            const feet = Number(found[1][1]);
            const save = (bonus, who) => {
                const { notes, partial, ...rest } = plan;
                return { ...rest, automation: { level: "automatic" }, targeting: { target: null, range: null, area: { type: "emanation", value: feet } }, resolution: { ...plan.resolution, check: { ...plan.resolution.check, ...(bonus ? { bonus } : {}) } }, notes: [`${who} within ${feet} feet of its user that can see the whip (target them; never its user).`] };
            };
            return {
                keep: true,
                builtin: "ways",
                targeting: { target: null, range: null, area: null },
                resolution: undefined,
                notes: undefined,
                ways: [
                    { name: `Creatures it damaged this round (−${found[2][1]} to the save)`, html, plan: save({ value: -Number(found[2][1]), type: found[2][2] }, "The creatures it damaged with the whip this round") },
                    { name: "The other creatures", html, plan: save(null, "The other creatures") }
                ],
                ...done
            };
        }
    },
    {
        // (The mirror too hot to hold after the beam: a note Effect on its user for the time.)
        name: "Serpentine Mirror: Burning Beam",
        over: (plan) => plan?.ownCheck?.kind === "attack" && plan.partial,
        sentences: [/^\s*You focus the light\s+on a creature within (\d+) feet\b.*\.$/, /^\s*Attempt a ranged attack roll\s+to deal \d+d\d+ fire\s+plus \d+ persistent fire damage\s+on hit\.$/, /^\s*The mirror then becomes\s+too hot to hold for (\d+) (minutes?)\s+and deals (\d+) fire damage\s+to any creature holding it\s+at the start of their turn\s+for the duration\.$/],
        card: (found, plan) => ({ keep: true, notes: undefined, userEffects: [...(plan.userEffects ?? []), { kind: "note", label: "Serpentine Mirror: too hot", text: `The mirror is too hot to hold: whoever holds it takes ${found[2][3]} fire damage at the start of their turn (by hand), until this ends.`, duration: timeOf(found[2][1], found[2][2]) }], ...done })
    },
    {
        // (Struck by it: Encumbered for a round outright for a creature in metal armor or made of metal; a Reflex save for one holding metal,
        // Encumbered on a failure and its metal items dropped on a critical one (plan.dropHeld). A way each, both when both fit.)
        name: "Ferromagnetizer Ammunition",
        over: (plan) => Boolean(plan?.noteOnly),
        sentences: [/^\s*Activate\s+(?:1\s+)?Interact\s+This lodestone bullet’s\b.*\.$/, /^\s*When a creature is struck\s+by ferromagnetizer ammunition\b.*\.$/, /^\s*If the target is wearing\s+metal armor,\s+or is made of metal,\s+it becomes Encumbered for (\d+) rounds?\.$/, /^\s*If the target is holding\s+or wielding metal items,\s+it must attempt a @Check\[reflex\|dc:(\d+)\] save,\s+becoming encumbered for (\d+) rounds?\s+on a failure and dropping\s+the metal items on a critical failure\.$/],
        card: (found, plan, { base, info, html }) => {
            const struck = { target: "the creature struck", range: null, area: null };
            const encumbered = (rounds) => condition("encumbered", { ...ROUND, value: Number(rounds) });
            const way = (card) => ({ ...base, automation: { level: "automatic" }, trigger: { event: "use" }, targeting: struck, item: info, notes: ["After a hit with it: target the creature struck."], ...card });
            return {
                builtin: "ways",
                targeting: { target: null, range: null, area: null },
                ways: [
                    { name: "Its armor or body is metal", html, plan: way({ resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects: [encumbered(found[2][1])] } } } }) },
                    { name: "It holds metal items", html, plan: way({ resolution: { kind: "save", check: { roll: "save", statistic: "reflex", basic: false, against: { dc: "fixed", value: Number(found[3][1]) } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: { ...none(), effects: [encumbered(found[3][2])] }, criticalFailure: { ...none(), effects: [encumbered(found[3][2])] } } }, dropHeld: { degrees: ["criticalFailure"], metallic: true, said: "It drops the metal items it holds." } }) }
                ]
            };
        }
    }
];

// (An ammunition's activation with no Effect block nor parenthesis — "Activate 1 Interact" —: its words from the start, as effectWords gives none.)
const wordsOf = ({ kind, words, text }) => words || (kind === "activation" ? String(text ?? "").replace(/\s*\bCraft Requirements\b.*$/s, "").trim() : words);

// The plan and the item's context → the plan its reading makes, or the same one.
export function withPlainGroup(plan, context) {
    const { kind, name, base, info, frequency, html } = context;
    const table = kind === "consumable" ? [...OWN_ACTION, ...BOTTLED, ...CONSUMED] : ACTIVATED;
    const named = table.filter((reading) => (reading.name instanceof RegExp ? reading.name.test(String(name ?? "")) : reading.name === name));
    if (!named.length) return plan;
    // (withSentenceReadings names by string: the reading's for this one; and its card given the html too.)
    return withSentenceReadings(named.map((reading) => ({ ...reading, name, card: (found, read, given) => reading.card(found, read, { ...given, html }) })), plan, { name, words: wordsOf(context), base, info, frequency });
}

// The adventure books' items whose needs no other reading takes (2026-10-27, docs/needs.md): counteracting, choices on the card, objects,
// casts with the item's changes, actions, creatures made or controlled, information, minds and speech. Each activation or consumable read
// sentence by sentence — every sentence of its effect one of the reading's own, in order, none dropped — into what its card plays; what PF2e
// can't play a note Effect for its time, its user's own actions and the map the card's lines (the user's rulings of 2026-10-25 and 2026-10-27).
//
// - A missile's other damage at one creature (Cape of Justice's Force Shuriken, "or 2d4+2 force damage if the target is your designated
//   offender"): the ways card, the damage at any target or at the designated offender; the Demoralize after it its user's own, a line.
// - A cast on its user beside PF2e's own Effects for it (Assassin's Bracers' Focus on the Doomed, "You cast 4th-rank Invisibility on yourself,
//   but the designated creature can still see you"): plan.castLinks, the item's two linked Effects — its user's, marking the creature it
//   designates, and that creature's — made by the cast card once it's cast (scripts/casts.js); the creature that still sees it a note Effect.
// - A stance on the mat (Mat of Resilience's Sturdy Foundation, "it cannot gain the Off-Guard condition"): a note Effect with PF2e's Immunity
//   to off-guard on the creature on the mat; the mat's shape (Steady Ground) the map's, a line.
// Pure.

import { sentencesOf } from "./lasting.js";
import { conditionUuid } from "./row-readings.js";
import { zoneOf } from "./area-readings.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
// The card's own row (an automatic check) for its user, or for the creatures its presser targets (item.recipient "targets"), and its lines.
const ownRow = ({ noteEffects = [], effects = [], modifiers = [], notes = [], target = null, item = null }) => ({
    targeting: { target, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects, modifiers, ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {}),
    ...(item ? { item } : {})
});
// (A plan read before with its GM lines and notes gone, done: a way of the ways card, or the card itself.)
const cleaned = (plan, notes = []) => {
    const outcomes = Object.fromEntries(Object.entries(plan.resolution?.outcomes ?? {}).map(([degree, row]) => {
        if (!row?.manualInstructions) return [degree, row];
        const { manualInstructions, ...rest } = row;
        return [degree, rest];
    }));
    const next = { ...plan, resolution: plan.resolution ? { ...plan.resolution, outcomes } : plan.resolution, automation: { ...(plan.automation ?? {}), level: "automatic" } };
    delete next.partial;
    delete next.unread;
    delete next.notes;
    if (notes.length) next.notes = notes;
    return next;
};
const ways = (list, base) => ({ ...base, builtin: "ways", targeting: { target: null, range: null, area: null }, once: true, ways: list });
// (A way of the ways card built from nothing: its own whole plan, as the activation's — its base, item part and frequency.)
const wayPlan = ({ item: own, ...card }, { base, info, frequency = null }) => ({ ...base, automation: { level: "automatic" }, trigger: { event: "use", ...(frequency ? { frequency } : {}) }, ...card, item: { ...info, ...(own ?? {}) } });
const wayList = (list) => ({ builtin: "ways", targeting: { target: null, range: null, area: null }, once: true, ways: list });
// (What it tells: whispered to the GM and its user, the GM filling in what it shows — the user's ruling, src/compiler/decided.js.)
const whisper = (text) => ({ builtin: "whisper", targeting: { target: null, range: null, area: null }, whisper: { text } });
const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours" };
const timeOf = (value, unit) => ({ mode: "fixed", value: Number(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
// (Counted from its user's turn: to the end of this one, to the end of its next.)
const TURN_END = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const NEXT_END = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const forTargets = { recipient: "targets" };
const capital = (word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
// (A cast plan read before, its lines and partial gone: what a reading over it starts from.)
const castOver = (fields) => ({ keep: true, ...fields, partial: undefined, automation: { level: "automatic" } });

// (Each condition's own PF2e penalties a step lower: AdjustModifier adding 1 back to each FlatModifier its condition item has — their slugs
// and selectors —, Drained's lost Hit Points a level's worth back.)
const LOWERED = {
    clumsy: [{ key: "AdjustModifier", selectors: ["dex-based"], slug: "clumsy", mode: "add", value: 1 }],
    drained: [{ key: "AdjustModifier", selectors: ["con-based"], slug: "drained", mode: "add", value: 1 }, { key: "AdjustModifier", selectors: ["hp"], slug: "drained", mode: "add", value: "max(1,@actor.level)" }],
    enfeebled: [{ key: "AdjustModifier", selectors: ["str-based", "str-damage"], slug: "enfeebled", mode: "add", value: 1 }],
    sickened: [{ key: "AdjustModifier", selectors: ["all"], slug: "sickened", mode: "add", value: 1 }]
};
// (An astrolabe's Calculate, its sentences and its whisper.)
const ASTROLABE = [
    /^Astrolabes can be used for navigation in unfamiliar or featureless locations\.$/,
    /^To use an astrolabe, the holder must be trained in Survival\.$/,
    /^By spending 1 minute to measure the height of the stars and planets, a holder who knows the time and date can determine the latitude, and a holder who knows their latitude can determine the date and time\.$/,
    /^An astrolabe also grants a \+(\d+) item bonus to checks to identify celestial bodies\.$/
];
const astrolabe = (bonus, steady) => whisper(`Trained in Survival, its holder spends a minute measuring the stars and planets${steady ? " (on steady ground only)" : ""}: knowing the time and date it learns its latitude, or knowing its latitude the date and time — the GM tells it. Its checks to identify celestial bodies have a +${bonus} item bonus (the GM adds it).`);

// Each reading: the source name it's for (an activation's "Item: Activation"; a pattern for an item's grades), a pattern for each sentence of
// its effect — every sentence must be one, in order — and the card they make: a whole card (its base and item part added), or keep: true for
// changes to the plan read before (undefined ones gone). over: read over any plan, not only over nothing, a note or the GM's no-effect.
const READINGS = [
    {
        // (The shuriken's damage at any target, or more at its designated offender — the ways card; the Demoralize after it its user's own.)
        name: "Cape of Justice: Force Shuriken",
        over: true,
        sentences: [
            /^By using a free hand to grab the edge of your cape and give it a quick flourish, you cause a red, shuriken-shaped bolt of force to fire at a target within (\d+) feet that you can see\.$/,
            /^The target takes (\d+d\d+\+\d+) (force) damage\.$/,
            /^A target that's your designated offender takes (\d+d\d+\+\d+) force damage instead\.$/,
            /^If the target is within (\d+) feet, you can attempt to Demoralize the target as a free action after the shuriken strikes them\.$/
        ],
        card: ([[, range], [, formula], [, offender], [, near]], plan) => {
            if (plan?.resolution?.sharedDamage?.components?.length !== 1 || plan.resolution.sharedDamage.components[0].formula !== formula) return null;
            const lines = [`Its user needs a free hand; the target, a creature it can see within ${range} feet, is hit outright.`, `If the target is within ${near} feet, its user can then Demoralize it as a free action (PF2e's own).`];
            const at = (damage) => {
                const own = cleaned(plan, lines);
                const components = own.resolution.sharedDamage.components.map((component) => ({ ...component, formula: damage }));
                return { ...own, resolution: { ...own.resolution, sharedDamage: { ...own.resolution.sharedDamage, components } }, ...(own.directDamage ? { directDamage: { ...own.directDamage, formula: damage } } : {}) };
            };
            const { resolution, directDamage, notes, partial, unread, ...base } = plan;
            return { keep: true, ...ways([{ name: "At any target", html: "", plan: at(formula) }, { name: "At its designated offender", html: "", plan: at(offender) }], base), resolution: undefined, directDamage: undefined, notes: undefined, partial: undefined, unread: undefined, automation: { level: "automatic" } };
        }
    },
    {
        // (Invisibility on its user, but not to the creature it designates — a note Effect —; PF2e's two Effects for it: its user's bonus to Feint
        // and Demoralize that creature, marked, and that creature's penalty to saves against fear.)
        name: /^Assassin's Bracers \(Type I{1,3}\): Focus on the Doomed$/,
        over: true,
        sentences: [
            /^You designate one creature within (\d+) feet\.$/,
            /^You cast 4th-rank Invisibility on yourself, but the designated creature can still see you\.$/,
            /^The bracers enhance your appearance to the designated creature, making you appear more fearsome and unnerving, granting you a \+(\d) item bonus to attempts to Feint or Demoralize the designated creature\.$/,
            /^The designated creature takes a [–-](\d) item penalty to saving throws against fear effects\.$/,
            /^Effect: Focus on the Doomed Effect: Focus on the Doomed \(Fear Penalty\)$/
        ],
        card: ([[, within]], plan, { html }) => {
            if (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Invisibility") return null;
            const link = (label) => new RegExp(String.raw`@UUID\[(Compendium\.pf2e\.equipment-effects\.Item\.[A-Za-z0-9]{16})\]\{Effect: ${label.replace(/[()]/g, "\\$&")}\}`).exec(String(html ?? ""))?.[1] ?? null;
            const own = link("Focus on the Doomed");
            const theirs = link("Focus on the Doomed (Fear Penalty)");
            if (!own || !theirs) return null;
            return {
                keep: true,
                self: true,
                castLinks: [{ uuid: own, on: "user", label: "Focus on the Doomed", mark: true }, { uuid: theirs, on: "target", label: "Focus on the Doomed (Fear Penalty)", within: Number(within) }],
                castNote: { label: "Seen by the doomed", text: "The creature its user designated can still see it through this Invisibility.", duration: timeOf(1, "minutes") },
                notes: [`Target the one creature it designates, within ${within} feet, before Apply.`],
                partial: undefined,
                automation: { level: "automatic" }
            };
        }
    },
    {
        // (The mat's stance on the creature on it: PF2e's Immunity to off-guard on a note Effect, while it stays on the mat.)
        name: /^Mat of Resilience(?: \(Greater\))?: Sturdy Foundation$/,
        sentences: [
            /^The creature enters a simple stance that makes the most of the mat's stabilizing magic\.$/,
            /^While in this stance, if at least half of the creature's space is atop the mat, it cannot gain the Off-Guard condition\.$/
        ],
        card: () => ownRow({
            noteEffects: [{ label: "Sturdy Foundation", text: "In the mat's stance: while at least half its space is on the mat it can't become Off-Guard (PF2e's immunity here). It ends when it leaves the mat or the stance, enters another stance, or the encounter ends: remove it then.", duration: null, rules: [{ key: "Immunity", type: "off-guard" }] }],
            notes: ["Target the creature on the mat (its user's own token when it's the one on it)."],
            item: { recipient: "targets" }
        })
    },
    {
        // (The mat's shape on the map, its user's pick: a line of the card.)
        name: /^Mat of Resilience(?: \(Greater\))?: Steady Ground$/,
        sentences: [/^You unfurl the mat and choose which shape it takes, either a (\d+)-foot square or a (\d+)-foot by 5-foot line\.$/],
        card: ([[, square, line]]) => ownRow({ notes: [`Unfurl the mat on an unoccupied space as a ${square}-foot square or a ${line}-foot by 5-foot line, its user's pick: its ground is smooth and solid, difficult or hazardous terrain under it normal terrain while it's there (the map's).`, "It can be rolled up or moved a square with an Interact, but not while a creature is on it."] })
    },
    {
        // (A cast after a roll of its own, two 1s failing it — a one-off (src/compiler/one-offs.js): its card's lines say the roll and the range.)
        name: "Osteomancer's Pouch: Roll the Bones",
        over: true,
        sentences: [/^You roll the dice\.$/, /^If you roll two 1s, the activation fails with no effect\.$/, /^Otherwise, the dice cast Clairvoyance for you\.$/, /^When cast in this way, the spell's range becomes (\d+) feet × the result of your roll\.$/],
        card: ([, , , [, feet]], plan) => (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Clairvoyance" ? null : castOver({
            notes: ["Roll its two knucklebone dice (2d6) first: on two 1s the activation fails with no effect — don't cast.", `Otherwise its range is ${feet} feet × that roll's total: where the sensor can go (the map's).`],
            decided: "one-off"
        }))
    },
    {
        // (Its electricity at its user's option: the ways card, the cast as it is or with all its damage electricity — PF2e's DamageAlteration on
        // the caster for the spell, plan.castDamage, scripts/casts.js.)
        name: "Sacred Valkyrie Helm: Storm's Arms",
        over: true,
        sentences: [/^The helm casts a (\d+)th-rank weapon storm to your specifications\.$/, /^At your option, all damage caused by this spell is (electricity) damage\s*[-—–]\s*in this option, the duplicated weapons created by the spell appear to be made of lightning\.$/],
        card: ([, [, type]], plan) => {
            if (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Weapon Storm") return null;
            const { notes, partial, ...cast } = plan;
            const as = { ...cast, automation: { level: "automatic" } };
            return { keep: true, ...ways([{ name: "Its own damage", html: "", plan: as }, { name: `All ${type} damage`, html: "", plan: { ...as, castDamage: { type }, notes: ["Its duplicated weapons look made of lightning."] } }], cast), spell: undefined, rank: undefined, dc: undefined, attack: undefined, tradition: undefined, self: undefined, area: undefined, targets: undefined, notes: undefined, partial: undefined, automation: { level: "automatic" } };
        }
    },
    {
        // (The spell's DC, and the good-aligned creatures in its area left out of it: PF2e's holy trait, plan.castTraits' immune.)
        name: "Songbird's Brush",
        over: true,
        sentences: [/^You sweep the songbird's brush in an arc before you, casting Prismatic Spray from the glaive\.$/, /^The spell DC is (\d+)\.$/, /^This prismatic spray does not affect good-aligned creatures in its area\.$/],
        card: ([, [, dc], [said]], plan) => (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Prismatic Spray" ? null : castOver({
            dc: Number(dc),
            castTraits: { immune: ["holy"], penalties: [], said },
            notes: ["Target the creatures in its area: those with the holy trait (good-aligned) are left out of it."]
        }))
    },
    {
        // (A telepathic message: speech, a note Effect on its user for the moment it's sent — the user's ruling, src/compiler/decided.js.)
        name: "Whisper Briolette",
        sentences: [
            /^Usage affixed to armor or to an outfit if a character has no armor Activate Envision Requirements You are an expert in Stealth This teardrop-shaped gemstone\b.*\bhollow\.$/,
            /^When it's activated, you can instantly impart up to 1 minute of speech \(roughly (\d+) words\) telepathically to any creatures you choose within (\d+) feet\.$/,
            /^You can impart this instantaneous telepathic message to creatures that you perceive and creatures Hidden to you, but you can't do so to Undetected creatures\.$/,
            /^Once used, the whisper briolette becomes unusable and subtly vanishes within the next few minutes, rather than crumbling to dust\.$/
        ],
        card: ([, [, words, feet]]) => ownRow({
            noteEffects: [{ label: "Telepathic message", text: `Its message, up to a minute of speech (about ${words} words), reaches at once, telepathically, the creatures it picks within ${feet} feet that it perceives or that are Hidden to it — not Undetected ones.`, duration: TURN_END }],
            notes: ["Its user must be an expert in Stealth; once used, the gem vanishes within a few minutes."]
        })
    },
    {
        // (What the pool shows, whispered to the GM and its user; or its user's memories put into it, out of combat — the ways card.)
        name: "Moonstone Diadem",
        sentences: [
            /^You peer into the moonstone pool and gain access to all the visual history recorded within the receptacle by concentrating on the specific subject you wish to see\.$/,
            /^Conversely, you can choose to deposit your own memories into the pool by concentrating for (\d+) hours? on the information you wish to impart\.$/
        ],
        card: ([, [, hours]], plan, context) => wayList([
            { name: "Peer into the pool", html: "", plan: wayPlan(whisper("Within 10 feet of a moonstone pool, its user concentrates on a subject: the pool shows it all the visual history it holds of that subject — the GM tells what's recorded."), context) },
            { name: "Deposit memories", html: "", plan: wayPlan(ownRow({ notes: [`Within 10 feet of a moonstone pool, its user concentrates for ${hours} hour${hours === "1" ? "" : "s"} on the information it imparts: its memories of that go into the pool (out of combat).`] }), context) }
        ])
    },
    {
        // (A sparrow's Seek far off, with its user's Perception, and the map it makes: what it shows whispered to the GM and its user.)
        name: "Marvelous Miniature, Swift Sparrow",
        sentences: [
            /^When activated, this miniature transforms into a seemingly mundane sparrow\.$/,
            /^The sparrow flies to a destination of your choice within (\d+) feet that you can see, then Seeks in a (\d+)-foot burst using your Perception modifier before returning\.$/,
            /^The sparrow then unravels into a small map of the area it perceived, including any creatures it saw\.$/,
            /^The map is rudimentary and doesn't reveal anything the sparrow failed to perceive\.$/
        ],
        card: ([, [, far, burst]]) => whisper(`A sparrow flies to a spot its user picks within ${far} feet that it can see and Seeks in a ${burst}-foot burst there with its user's Perception modifier (the GM rolls it, as PF2e's Seek), then flies back and unravels into a rough map of that area and the creatures it saw — nothing it failed to perceive: the GM tells what the map shows.`)
    },
    {
        // (An item from the gloves to its hand, its user's pick — the objects' card line —, and the minute's wait before the next (trigger.recharge,
        // src/compiler/cooldown.js's shape).)
        name: "Vernai Shell: Retrieve Item",
        sentences: [/^One item of your choice in either extradimensional space appears in your hand\.$/, /^You can't Retrieve Item again for (\d+) (minutes?)\.$/],
        card: ([, [, value, unit]], plan, { frequency }) => ({
            ...ownRow({ notes: ["One item its user picks from either glove's extradimensional space appears in its hand (a free hand needed)."] }),
            trigger: { event: "use", ...(frequency ? { frequency } : {}), recharge: { value: Number(value), unit: UNITS[unit] } }
        })
    },
    {
        // (One of four conditions a step lower for 8 hours, never removed by it: the ways card, each its own note Effect with PF2e's AdjustModifier
        // on that condition's penalties — Drained's Hit Points too.)
        name: "Elsie's Excellent Bottled Vim",
        sentences: [
            /^A dose of this slightly fizzy, pale-pink tonic\b.*\btemporary respite\.$/,
            /^For (\d+) hours after drinking this elixir, reduce the value of one of the following conditions you're suffering by 1: Clumsy, Drained, Enfeebled, or Sickened\.$/,
            /^A condition whose value is reduced to 0 is not removed; after \d+ hours, the condition returns to its original value, unless its duration expired or it was removed by another means\.$/
        ],
        card: ([, [, hours]], plan, context) => wayList(Object.entries(LOWERED).map(([slug, rules]) => ({
            name: capital(slug),
            html: "",
            plan: wayPlan(ownRow({ noteEffects: [{ label: `${capital(slug)} lowered`, text: `Its ${capital(slug)} counts 1 lower for ${hours} hours (its penalties${slug === "drained" ? " and lost Hit Points" : ""}); at 0 it stays, with none. Then it's back to its own value, unless it ended meanwhile.`, duration: timeOf(hours, "hours"), rules }] }), context)
        })))
    },
    {
        // (A gel turned into the light, its user's pick — the ways card: the red one a zone of the light's cone with PF2e's +2 item bonus to
        // Charisma-based skill checks inside, the yellow one a zone whose creatures are told they're seen there; the green and blue ones only
        // looks, lines; one rotated out, a line. Over any plan: its first activation's a one-off under the same name, merged 2026-10-27.)
        name: "Splendid Floodlight",
        over: true,
        sentences: [
            /^You rotate one of the following gels into position in the floodlight or rotate a gel out\.$/,
            /^You can do this even if the splendid floodlight has been moved from its position when the light was created\.$/,
            /^You can have up to two gels in place at once; if you rotate in a third, another of your choice rotates out\.$/,
            /^Red Gel The light lends an air of gravitas to all creatures illuminated by it\.$/,
            /^Creatures in the light gain a \+(\d+) item bonus to Charisma-based skill checks\.$/,
            /^Yellow Gel Invisible creatures and objects are visible while in the light, and creatures with the spirit trait appear substantial rather than ghostly\.$/,
            /^Green Gel All creatures illuminated by the light appear to be wearing exceptionally stylish clothing with elegantly coiffed hair styles\.$/,
            /^Blue Gel Undead creatures in the light appear as they did when alive, and living creatures in the light appear decayed, like an undead creature\.$/
        ],
        card: ([, , , , [, bonus]], plan, context) => {
            const gels = ["Its light must be on; the gels turn even when the floodlight has been moved from where it lit.", "Two gels at most: turning in a third rotates another out, its user's pick (end that one's zone)."];
            const cone = (fields) => ({ builtin: "zone", actions: null, targeting: { target: null, range: null, area: { type: "cone", value: 120 } }, zone: zoneOf({ area: { type: "cone", value: 120 }, centre: "placed", lasts: timeOf(1, "hours"), ...fields }) });
            const way = (name, card) => ({ name, html: "", plan: wayPlan(card, context) });
            return wayList([
                way("Red gel", cone({ modifiers: [{ selector: "cha-skill-check", value: Number(bonus), type: "item" }], notes: ["Place it over the floodlight's cone of light: creatures in it gain the bonus (an air of gravitas).", ...gels, "It ends with the light (an hour at most): end it then."] })),
                way("Yellow gel", cone({ saves: [{ when: ["initial", "enter"], plan: null, note: "In the yellow light: if Invisible it's visible while it stays in the light; a creature with the spirit trait looks substantial, not ghostly." }], notes: ["Place it over the floodlight's cone of light; invisible objects in it are visible too (the GM's).", ...gels, "It ends with the light (an hour at most): end it then."] })),
                way("Green gel", ownRow({ notes: ["The creatures in the light look exceptionally stylish, finely dressed and coiffed (only looks).", ...gels] })),
                way("Blue gel", ownRow({ notes: ["Undead in the light look as they did alive, and the living look decayed, like undead (only looks).", ...gels] })),
                way("Rotate a gel out", ownRow({ notes: ["A gel rotated out: end its zone, if it has one."] }))
            ]);
        }
    },
    {
        // (Its user's Strike first, then the possessor's save: confirmed as the degree says, its control lost for a minute on a failure, the
        // possession counteracted on a critical failure — note Effects on it.)
        name: "Four-Tiger Blade: Ghost Chasing Tiger",
        over: true,
        sentences: [
            /^Attempt a Strike against a creature you believe to be possessed\.$/,
            /^This attack deals no damage to the creature, but if the target is possessed, the possessing creature must attempt a @Check\[will\|dc:(\d+)\b[^\]]*\] save\.$/,
            /^Critical Success The possessing creature is unaffected, and you remain unaware of if the target is actually possessed or not\.$/,
            /^Success The possessing creature is unaffected, but you sense that creature's control over the target and confirm that the target is possessed\.$/,
            /^Failure You confirm that the target is possessed\.$/,
            /^The possessing creature can't control the target for (\d+) (minutes?)\.$/,
            /^Critical Failure You confirm the target is possessed an instant before you automatically counteract the possession, causing the possessing creature to vacate the target's body\.$/
        ],
        card: ([, , , , , [, value, unit]], plan) => {
            if (plan?.resolution?.kind !== "save" || !plan.resolution.outcomes?.criticalFailure) return null;
            const own = cleaned(plan, [
                "First its user Strikes the creature it believes possessed (PF2e's own Strike, which deals it no damage); only if it is possessed does its possessor attempt this save — the GM rolls it, at the possessor's token if it has one.",
                "On a success or worse its user knows the creature is possessed; on a critical success it learns nothing."
            ]);
            const outcomes = own.resolution.outcomes;
            const note = (label, text, duration) => ({ label, text, duration });
            return { keep: true, resolution: { ...own.resolution, outcomes: {
                ...outcomes,
                failure: { ...outcomes.failure, noteEffects: [note("No control", `It can't control the creature it possesses for ${value} ${unit}.`, timeOf(value, unit))] },
                criticalFailure: { ...outcomes.criticalFailure, noteEffects: [note("Possession counteracted", "Its possession is counteracted: it leaves the creature's body at once (the GM places it).", null)] }
            } }, notes: own.notes, partial: undefined, unread: undefined, automation: { level: "automatic" } };
        }
    },
    {
        // (An adjacent golem's Reflex save or control for a minute; or one already inscribed, a counteract check against that inscription first:
        // the ways card. The controller's own reaction to counteract it, and Dispel Magic, lines.)
        name: "Golem Stylus",
        sentences: [
            /^You make a quick inscription on an adjacent golem creature of (\d+)th level or lower\.$/,
            /^The golem must succeed at a @Check\[reflex\|dc:(\d+)\] saving throw or you immediately gain control over the golem for (\d+) (minutes?)\.$/,
            /^A controlled golem is helpful toward you and follows your orders to the best of its ability as long as it is under your control\.$/,
            /^If the golem's original controller is within (\d+) feet of the golem and can see the golem, that controller can attempt a counteract check \(DC (\d+)\) as a reaction to counteract this effect; on a success, the inscription disappears and the golem reverts to its pre-inscription state\.$/,
            /^The inscription can also be counteracted with Dispel Magic\.$/,
            /^If the golem you are targeting has already been inscribed with a golem stylus ?, you must attempt a counteract check against the previous inscription as part of activating the item, using your golem stylus's item level or your Arcana skill check modifier as your counteract check modifier\.$/,
            /^If successful, you modify the existing inscription so that the golem falls under your control\.$/
        ],
        card: ([[, level], [, dc, value, unit], , [, feet, against]], plan, context) => {
            const time = timeOf(value, unit);
            const controlled = { label: "Golem Stylus", text: "Inscribed: it's controlled by the stylus's user, helpful toward it and following its orders as best it can while that lasts.", duration: time };
            const fails = { ...none(), effects: [{ kind: "condition", slug: "controlled", value: null, duration: time }], noteEffects: [controlled] };
            const lines = [
                `Only an adjacent golem of level ${level} or lower.`,
                `Its original controller, within ${feet} feet and seeing it, can counteract it as a reaction (DC ${against}): on a success the inscription's gone and the golem is as it was. Dispel Magic counteracts it too.`
            ];
            const save = {
                targeting: { target: "1 creature", range: "touch", area: null },
                resolution: { kind: "save", check: { roll: "save", statistic: "reflex", basic: false, against: { dc: "fixed", value: Number(dc) } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: fails, criticalFailure: fails } },
                notes: lines
            };
            const itemLevel = Number(context.info?.level) || 0;
            const counteract = {
                builtin: "counteract",
                targeting: { target: null, range: null, area: null },
                item: { counteract: { modifier: itemLevel, rank: Math.max(1, Math.ceil(itemLevel / 2)), fromUser: { modifier: "arcana", better: true }, conditions: [], traits: [], afflictions: [], free: { name: "the golem's earlier inscription" }, pick: "one", notes: [`Its modifier: the stylus's item level (+${itemLevel}) or its user's Arcana modifier, the higher; the inscription's DC and rank the GM's.`, `On a success the inscription is its user's: the golem is controlled by it, helpful and following its orders, for ${value} ${unit} (as a failed save).`, ...lines] } }
            };
            // (Its frequency, PF2e's "one per hour": once an hour, for the activations card to count.)
            const hourly = { max: 1, per: "hour", raw: "once per hour" };
            const own = { ...context, frequency: hourly, info: { ...context.info, activation: { ...(context.info?.activation ?? {}), frequency: hourly } } };
            return { ...wayList([{ name: "A golem not yet inscribed", html: "", plan: wayPlan(save, own) }, { name: "A golem already inscribed", html: "", plan: wayPlan(counteract, own) }]), trigger: { event: "use", frequency: hourly }, item: own.info };
        }
    },
    {
        // (Non-magical ice and snow melted, the map's; magical ice and snow counteracted at the slick's modifier and rank — the counteract card's
        // one row, its DC and rank those of what made it.)
        name: /^Quickmelt Slick \((?:Lesser|Moderate|Greater)\)$/,
        sentences: [
            /^This clay jar is filled with a warm fluid composed primarily of lagofir oil and natural fire retardants\.$/,
            /^You can pour the fluid in an empty area adjacent to you, or over an adjacent frozen object, with an Interact action\.$/,
            /^The fluid instantly melts non-magical ice and snow in the area and harmlessly vaporizes the resulting meltwater\.$/,
            /^When used to melt magical ice and snow, quickmelt slick attempts a counteract check with the listed counteract modifier to melt the ice and snow, using the source of that ice and snow to determine the counteract rank and DC\.$/,
            /^(?:Lesser|Moderate|Greater) quickmelt slick melts ice and snow up to (\d+ f(?:oo|ee)t) in depth in ([^,]+?),? or melts the ice covering an? (\w+) or smaller object\.$/,
            /^The slick has a \+(\d+) modifier for the counteract check and a counteract rank of (\d+)\.$/
        ],
        card: ([, , , , [, depth, where, size], [, modifier, rank]]) => ({
            builtin: "counteract",
            targeting: { target: null, range: null, area: null },
            item: { counteract: { modifier: Number(modifier), rank: Number(rank), conditions: [], traits: [], afflictions: [], free: { name: "the magical ice and snow" }, pick: "one", notes: [
                `Poured with an Interact in an empty area beside its user, or over an adjacent frozen object: non-magical ice and snow there melt at once, up to ${depth} deep in ${where.replace(/^one /, "a ")}, or the ice on a ${size} or smaller object (the map's).`,
                "Magical ice and snow: this check, against the DC and rank of what made them (the GM's)."
            ] } }
        })
    },
    {
        // (Three treats for three moments, each the ways card's way, on its companion (the creature its presser targets): the Aid its user gives,
        // temporary Hit Points, a condition lowered — and the persistent damage's easier flat check a note Effect on it for that check.)
        name: "Motivating Treat Bag: Toss a Treat",
        sentences: [
            /^You pull out one of the treats and toss it up to (\d+) feet into the waiting mouth of your companion\.$/,
            /^The effect varies by the treat\.$/,
            /^Encouraging Treat \(mental\) Trigger You Command your companion, and it performs a skill check; Effect The treat motivates the companion to perform the task, allowing you to Aid it as though you had prepared to help\.$/,
            /^Reward Treat \(healing, mental\) Trigger Your companion critically succeeds at a skill check or attack roll; Effect The treat grants the companion (\d+d\d+\+\d+) temporary Hit Points that last until the end of your next turn\.$/,
            /^Soothing Treat \(healing\) Trigger Your companion attempts a save to reduce its sickened condition, would reduce the value of its frightened condition at the end of your turn, or attempts a flat check to end persistent damage; Effect Reduce the DC of the check to end persistent damage by (\d+) or reduce the sickened condition by (\d+)\.$/,
            /^If the companion would reduce its frightened condition value by 1 at the end of its turn, it instead reduces that condition's value by (\d+)\.$/
        ],
        card: ([[, feet], , , [, temp], [, easier, sickened], [, frightened]], plan, context) => {
            const at = `Target its companion, within ${feet} feet.`;
            const way = (name, card) => ({ name, html: "", plan: wayPlan(card, context) });
            const reduce = (slug, by) => ({ ...ownRow({ notes: [at] }), reduce: [{ slug, by, who: "targets" }], item: { reduce: [{ slug, by, who: "targets" }] } });
            return wayList([
                way("Encouraging treat", ownRow({ notes: ["When its user Commands its companion and the companion attempts a skill check: its user Aids it as though it had prepared to help (PF2e's Aid, its user's own roll)."] })),
                way("Reward treat", ownRow({ effects: [{ kind: "temp-hp", formula: temp, duration: NEXT_END }], notes: ["When its companion critically succeeds at a skill check or attack roll.", at], item: forTargets })),
                way("Soothing treat: sickened", { ...reduce("sickened", Number(sickened)), notes: ["When its companion attempts a save to reduce its sickened condition.", at] }),
                way("Soothing treat: frightened", { ...reduce("frightened", Number(frightened) - 1), notes: [`When its companion's frightened would go down by 1 at the end of its turn: by ${frightened} instead (PF2e's own 1, and this 1 more).`, at] }),
                way("Soothing treat: persistent damage", ownRow({ noteEffects: [{ label: "Soothing treat", text: `Its flat check to end persistent damage now is DC ${15 - Number(easier)} (${10 - Number(easier)} when helped), ${easier} lower than usual.`, duration: TURN_END }], notes: ["When its companion attempts a flat check to end persistent damage.", at], item: forTargets }))
            ]);
        }
    },
    {
        // (Its companion faster for the turn, but drawn to its user: +5 feet to each Speed — PF2e's FlatModifier — and the rest a note Effect.)
        name: "Motivating Treat Bag: Rustle the Bag",
        sentences: [/^You Command your companion\.$/, /^Until the end of your turn, it gains a \+(\d+)-foot status bonus to each of its Speeds, but must use at least one action to move closer to you\.$/],
        card: ([, [, feet]]) => ownRow({
            modifiers: [{ selector: "all-speeds", value: Number(feet), type: "status", duration: TURN_END }],
            noteEffects: [{ label: "Rustled bag", text: "This turn it must use at least one action to move closer to its user.", duration: TURN_END }],
            notes: ["Its user Commands its companion (PF2e's own): target the companion."],
            item: forTargets
        })
    },
    {
        // (The clockwork spy: a minion for an hour, a week's wait once slain (plan.slainWait, scripts/slain-wait.js), turned back by the same action.)
        name: "Winder's Ring",
        over: true,
        sentences: [
            /^The winder's ring transforms into a Clockwork Spy that doesn't require winding and obeys your spoken commands for up to (\d+) hours?\.$/,
            /^In this form, the winder's ring has the minion trait\.$/,
            /^You can use this action again to return the clockwork spy to winder's ring form as long as you're adjacent to the clockwork spy\.$/,
            /^If the clockwork spy is slain, it reverts to its ring shape, and the winder's ring can't be activated again until (\d+|one) (week|day)s? has passed\.$/
        ],
        card: ([[, hours], , , [, wait, unit]], plan) => (plan?.builtin !== "conjure" ? null : {
            keep: true,
            slainWait: { value: wait === "one" ? 1 : Number(wait), unit: `${unit}s` },
            notes: [
                "A minion: it acts when its user commands it (1 action for 2 of its own); it needs no winding.",
                `It lasts ${hours} hour${hours === "1" ? "" : "s"}: dismiss it when that's up.`,
                "Adjacent to it, its user can turn it back into the ring with this action again: dismiss it then.",
                `Slain, it reverts to the ring, which can't be activated again for ${wait === "one" ? 1 : wait} ${unit}: set as it falls.`
            ],
            partial: undefined,
            automation: { level: "automatic" }
        })
    },
    {
        // (The bear on its ball: −10 feet to its land Speed (PF2e's FlatModifier), always Off-Guard, and the rest on its own Effect — the made
        // creature's own, scripts/zones.js finishConjured.)
        name: "Wondrous Figurine (Rubber Bear)",
        over: true,
        sentences: [
            /^You activate the statue by placing it on solid ground and then speaking its name, causing the statuette to transform into a living creature or creatures\.$/,
            /^In creature form, the figurine has the minion trait\.$/,
            /^It can understand your language and it obeys you to the best of its ability when you use an action to command it\.$/,
            /^The specifics of each creature, as well as the activation's frequency \(if any\), appear in its entry below\.$/,
            /^If the figurine is slain while in animal form, it reverts to its statue shape and cannot be activated again until 1 week has passed\.$/,
            /^If the figurine is destroyed in statue form, it is shattered and its magic is lost\.$/,
            /^This small, stretchable statuette depicts a bear wearing a tutu and a fez and balancing on a ball slightly larger than its head\.$/,
            /^When activated, it becomes a Grizzly Bear with similar attire\.$/,
            /^The bear remains balanced upon its rubber ball, and is therefore ungainly: it cannot Climb or Swim, has a [–-](\d+)- ?foot circumstance penalty to its Speed, and is always off-guard\.$/,
            /^If the bear leaves its ball, such as if it is repositioned with forced movement or knocked prone, it immediately reverts to statuette form\.$/,
            /^The bear can be used once per day, and it can remain in bear form for up to (\d+) hours?\.$/
        ],
        card: ([, , , , , , , , [, slower], , [, hours]], plan) => (plan?.builtin !== "conjure" || plan.creatures?.length !== 1 ? null : {
            keep: true,
            creatures: [{ ...plan.creatures[0], own: { rules: [{ key: "FlatModifier", selector: "land-speed", type: "circumstance", value: -Number(slower), label: "Rubber ball" }], conditions: ["off-guard"], text: "Balanced on its rubber ball: it can't Climb or Swim, and it's always Off-Guard. If it leaves the ball — moved by force, or knocked Prone — it reverts to the statuette at once." } }],
            notes: [
                "A minion: it acts when its user commands it (1 action for 2 of its own).",
                "Slain, it reverts and can't be activated again for 1 week: set as it falls.",
                `It lasts ${hours} hour${hours === "1" ? "" : "s"}: dismiss it when that's up, or at once if it leaves its ball.`,
                "Destroyed as a statuette, it's shattered and its magic lost."
            ],
            partial: undefined,
            automation: { level: "automatic" }
        })
    },
    {
        // (Fireball with its user and its mount immune: its user's own token left out of the cast (plan.castTraits.user), its mount a line.)
        name: "Dragonfire Halfbow: Dragon's Arrow",
        over: true,
        sentences: [
            /^You draw the bow back to its maximum draw length without nocking an arrow, and as you release the string, the dragonfire halfbow casts Fireball \(heightened to 5th rank; @Check\[reflex\|dc:(\d+)\|basic\b[^\]]*\] save\), targeted at a point of your choosing within the spell's range\.$/,
            /^You and your mount are immune to the effects of this fireball ?\.$/
        ],
        card: ([[, dc], [said]], plan) => (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Fireball" || plan.dc !== Number(dc) ? null : castOver({
            castTraits: { immune: [], user: true, penalties: [], said },
            notes: ["Target the creatures in its burst, leaving out its mount: its user and its mount are immune (its user's own token is left out even if targeted)."]
        }))
    },
    {
        // (Its mount quickened while it bleeds, a minute at most: PF2e's quickened granted by a note Effect that lasts while the persistent bleed
        // does (the ability module's whilePersistent), its extra action's limit its words.)
        name: "Heedless Spurs",
        over: true,
        sentences: [/^You kick both spurs into your mount's flank\.$/, /^The target takes (\d+d\d+) bleed damage and is quickened for (\d+) (minutes?)\.$/, /^Target your mount; its quickened condition also ends when the persistent bleed damage ends\.$/, /^It can use the extra action only to Stride\.$/],
        card: ([, [, , value, unit]], plan) => {
            const success = plan?.resolution?.outcomes?.success;
            if (!success || !(success.effects ?? []).some((effect) => effect?.slug === "quickened")) return null;
            const { manualInstructions, ...row } = success;
            const spurred = { label: "Spurred", text: `Quickened, its extra action only to Stride, for ${value} ${unit} or until its persistent bleed damage ends.`, duration: timeOf(value, unit), whilePersistent: "bleed", rules: [{ key: "GrantItem", uuid: conditionUuid("quickened"), allowDuplicate: true, onDeleteActions: { granter: "cascade", grantee: "cascade" } }] };
            return { keep: true, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, effects: row.effects.filter((effect) => effect?.slug !== "quickened"), noteEffects: [spurred] } } }, notes: ["Target its user's mount."], partial: undefined, automation: { level: "automatic" } };
        }
    },
    {
        // (Wall of Stone at half the item's level, rounded up; the wall tied to its user's life — a one-off (src/compiler/one-offs.js): lines.)
        name: "Cavern's Heart",
        over: true,
        sentences: [
            /^By stamping your foot on the ground and calling out to spirits of stone, you summon a stone wall\.$/,
            /^This is a wall of stone, except that the wall is tied to your own life force\.$/,
            /^When the stone wall is damaged, you are damaged instead\.$/,
            /^If you are reduced to 0 HP, the wall is destroyed\.$/,
            /^The effect is dismissed if you move more than (\d+) feet away from the stone wall or if you spend a single action with the concentrate trait\.$/
        ],
        card: ([, , , , [, feet]], plan, { whole, info }) => {
            const uuid = /@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]{16})\]\{Wall of Stone\}/.exec(String(whole ?? ""))?.[1];
            if (!uuid) return null;
            const rank = Math.max(1, Math.ceil((Number(info?.level) || 0) / 2));
            return {
                builtin: "cast-spell", spell: { uuid, name: "Wall of Stone" }, rank, dc: null, attack: null, tradition: null, self: false, area: true, targets: false,
                targeting: { target: null, range: null, area: null },
                notes: [
                    `Wall of Stone at rank ${rank}, half the item's level (the text gives none: the GM may change it).`,
                    "The wall is tied to its user's life: damage to the wall is dealt to its user instead, and the wall falls if its user drops to 0 Hit Points (the GM's).",
                    `It's dismissed once its user is more than ${feet} feet from it or uses an action with the concentrate trait: dismiss it then.`
                ],
                decided: "one-off"
            };
        }
    },
    {
        // (PF2e's Make an Impression or Request with Diplomacy at +2, on a mindless undead: the action card.)
        name: "Needle of Undeath: Speak with Undead",
        sentences: [/^You can use Diplomacy to Make an Impression on mindless undead or make simple requests of them with a \+(\d+) item bonus\.$/, /^You cannot make this request of someone else's summoned undead\.$/],
        card: ([[, bonus]]) => ({
            builtin: "item-action",
            targeting: { target: "the creature targeted", range: null, area: null },
            action: { slug: "make-an-impression", name: "Make an Impression", slugs: ["make-an-impression", "request"], names: ["Make an Impression", "Request"], bonus: { value: Number(bonus), type: "item" }, statistic: "diplomacy", targeted: true, basic: null, basics: { "make-an-impression": null, request: null }, after: "Only at a mindless undead; a simple request only, and not of another's summoned undead." }
        })
    },
    {
        // (A question to the head: what it answers, by the GM's secret Intimidation check, whispered to the GM and its user; the hour's wait
        // before the next, trigger.recharge.)
        name: "Cresset of Grisly Interrogation",
        sentences: [
            /^You pose a question to the head contained within the cresset, and it animates briefly to reply with a short answer over the course of a minute\.$/,
            /^The cresset empowers the severed head with the ability to reply even without breath\b.*\brather than summoning back the deceased's spirit\.$/,
            /^The head must be forcefully commanded to answer with a secret @Check\[intimidation\|traits:secret\] check-? other attempts to query the head without attempting an Intimidation check for a result automatically fail\.$/,
            /^Once activated in this way, this activation of a cresset of grisly interrogation can't be performed again for (\d+) (hours?)\.$/,
            /^The head answers the question based on the result of the secret Intimidation check against the Will DC the creature had when it was alive or DC (\d+), whichever is higher\.$/,
            /^Critical Success The head answers the question truthfully, to the best of its ability\.$/,
            /^Success The head answers the question truthfully, but the answer is brief, cryptic, or repetitive\.$/,
            /^Failure The head's answer provides false information, attempting to Lie to you with a \+(\d+) Deception modifier, or the creature's original Deception, whichever is higher\.$/,
            /^Critical Failure As failure, but the head gains a \+(\d+) circumstance bonus to its Deception check, and the next time you use this activation of the cresset of grisly interrogation during the next (\d+) hours, the result of your Intimidation check is one degree of success worse than the result you rolled\.$/
        ],
        card: ([, , , [, value, unit], [, dc], , , [, lie], [, more, hours]], plan, { frequency }) => ({
            ...whisper(`Its user asks the severed head in the cresset a question; it answers briefly over a minute, from its remains' memories (not its spirit). The GM rolls its user's secret Intimidation check against the creature's Will DC in life or DC ${dc}, whichever is higher — asked without that check, it doesn't answer. Critical success: a true answer, as best it can. Success: true, but brief, cryptic or repetitive. Failure: a false one, a Lie at +${lie} Deception (or its own, if higher). Critical failure: as a failure with +${more} circumstance to that Deception, and its user's next check with this activation within ${hours} hours is one degree worse.`),
            trigger: { event: "use", ...(frequency ? { frequency } : {}), recharge: { value: Number(value), unit: UNITS[unit] } }
        })
    },
    {
        // (A latitude, or a date and time, from the stars: whispered to the GM and its user — the GM telling it —, with the astrolabe's bonus to
        // identify celestial bodies.)
        name: "Astrolabe of the Falling Stars: Calculate",
        sentences: ASTROLABE,
        card: ([, , , [, bonus]]) => astrolabe(bonus, false)
    },
    {
        // (The same, on steady ground only.)
        name: "Standard Astrolabe: Calculate",
        sentences: [...ASTROLABE, /^A standard astrolabe functions only on steady ground\.$/],
        card: ([, , , [, bonus]]) => astrolabe(bonus, true)
    },
    {
        // (Invisible to creatures of one trait, its user's pick, for a minute: the ways card, each a note Effect — one creature's sight PF2e can't
        // give — that a hostile action ends once it's done ("air-ends-on:hostile", scripts/ends-on-hostile.js).)
        name: "Token of Salt and Earth: Hide from the Hateful",
        sentences: [
            /^By rotating the charm along one of its concentric rings, you become Invisible to creatures with the fiend, fey, or undead trait \(your choice\) for (\d+) (minutes?)\.$/,
            /^If you use a hostile action, you're no longer invisible after the action is completed\.$/
        ],
        card: ([[, value, unit]], plan, context) => wayList([["fiend", "Fiends"], ["fey", "Fey"], ["undead", "Undead"]].map(([trait, name]) => ({
            name,
            html: "",
            plan: wayPlan(ownRow({ noteEffects: [{ label: `Hidden from ${name.toLowerCase()}`, text: `Invisible to creatures with the ${trait} trait — to them only — for ${value} ${unit}. A hostile action ends it once the action is done.`, duration: timeOf(value, unit), rules: [{ key: "RollOption", option: "air-ends-on:hostile" }] }] }), context)
        })))
    },
    {
        // (The disarmed weapon flung 20 feet, the map's; the save's damage as the plan has it, the limb a note Effect on a critical failure.)
        name: "Gearblade",
        over: true,
        sentences: [
            /^The target's weapon is pulled through the gearblade's gears and shoots out the other side, landing (\d+) feet away in a direction of your choice\.$/,
            /^The target must attempt a @Check\[reflex\|dc:(\d+)\] save\.$/,
            /^On a failure, the limb holding their weapon is also pulled into the gearblade ?, and the creature takes (\d+d\d+) bludgeoning damage\.$/,
            /^On a critical failure, they take (\d+d\d+) bludgeoning damage and the limb becomes unusable until healed by a Regenerate spell or a similar effect\.$/
        ],
        card: ([[, feet]], plan) => {
            if (plan?.resolution?.kind !== "save" || plan.resolution.outcomes?.criticalFailure?.damage?.mode !== "formulas") return null;
            const own = cleaned(plan, [`Its disarmed weapon shoots out through the gears and lands ${feet} feet away in a direction its user picks (the map's).`]);
            const { criticalFailure } = own.resolution.outcomes;
            return { keep: true, resolution: { ...own.resolution, outcomes: { ...own.resolution.outcomes, criticalFailure: { ...criticalFailure, noteEffects: [{ label: "Limb unusable", text: "The limb that held its weapon is unusable until healed by Regenerate or a similar effect.", duration: null }] } } }, notes: own.notes, partial: undefined, automation: { level: "automatic" } };
        }
    },
    {
        // (A tree grown from an unholy corpse and the healing it sends out: Hit Points for each creature its presser targets in the burst; the
        // tree on the map, climbed by a DC 10 Athletics check, lines.)
        name: "Branch of the Great Sugi: A Multitude of Branches",
        sentences: [
            /^You place the branch of the great sugi on the corpse of an unholy creature, then cause the branch to suddenly grow into a sugi tree, up to (\d+) feet tall with a 2-foot-wide trunk\.$/,
            /^As it grows, it emits a pulse of soothing energy, restoring (\d+d\d+\+\d+) Hit Points to all creatures in a (\d+)-foot burst\.$/,
            /^A character can climb\b.*\bthe tree with a successful DC (\d+) Athletics check, and its branches effortlessly support the weight of any Medium or smaller creature\.$/,
            /^The sugi tree reverts to its whip form after (\d+) (hours?) unless you transform it back before then\.$/
        ],
        card: ([[, tall], [, healing, burst], [, climb], [, value, unit]]) => ownRow({
            effects: [{ kind: "heal", formula: healing }],
            notes: [
                `Placed on the corpse of an unholy creature, it grows into a sugi tree up to ${tall} feet tall there, its trunk 2 feet wide (the map's), until it reverts after ${value} ${unit} or by A Single Branch.`,
                `Target the creatures in the ${burst}-foot burst around it (its user's own token too, when it's there): each regains the Hit Points.`,
                `Climbing it is a DC ${climb} Athletics check; its branches hold any Medium or smaller creature.`
            ],
            item: forTargets
        })
    },
    {
        // (Hurled into the future for 1d4 rounds or minutes, or into another timeline: note Effects on the creature for that time (rolled by the
        // ability module as it's applied, duration.valueRoll — 2026-10-28; the average its fallback) — its token hidden and turns skipped, as the
        // note says.)
        name: "Timeflaying Blade: Flay Time",
        over: true,
        sentences: [
            /^Spend 1 Mythic Point\.$/,
            /^You swing the timeflaying blade through the air as if slicing something while you attempt to sever a creature within (\d+) feet from time itself\.$/,
            /^The creature must attempt a @Check\[will\|dc:(\d+)\] save\.$/,
            /^Critical Success The creature is Slowed 1 for 1 round\.$/,
            /^Success The creature is hurled (\d+d\d+) (rounds) into the future\.$/,
            /^They disappear in a flash of white light, only to reappear in the same space on their initiative after the duration\.$/,
            /^If that space is occupied, the creature is shunted harmlessly aside to the closest unoccupied space\.$/,
            /^Failure As success, but the creature is hurled forward in time (\d+d\d+) (minutes)\.$/,
            /^Critical Failure As success, but the creature is hurled into an entirely alternate timeline\.$/,
            /^At your discretion, the creature's gear is left behind in your timeline\.$/,
            /^Whether or not the creature will ever return to your timeline depends on the GM's whim, but at the very least, it should never return within the span of a year's passing\.$/
        ],
        card: ([, , , , [, rounds, roundUnit], , , [, minutes, minuteUnit]], plan) => {
            if (plan?.resolution?.kind !== "save" || !plan.resolution.outcomes?.success) return null;
            const own = cleaned(plan, ["At its user's discretion the creature's gear stays behind in this timeline when it's gone."]);
            const rolled = (formula, unit) => {
                const [count, sides] = formula.split("d").map(Number);
                return { mode: "fixed", value: Math.floor((count * (sides + 1)) / 2), valueRoll: formula, unit, expiry: "turn-start", anchor: "target-turn" };
            };
            const future = (formula, unit) => ({ label: "Hurled into the future", text: `Gone in a flash of white light, ${formula} ${unit} into the future: hide its token and skip its turns. On its initiative once this ends it reappears in the same space — shunted harmlessly to the nearest free space if that's taken.`, duration: rolled(formula, unit) });
            const outcomes = own.resolution.outcomes;
            return { keep: true, resolution: { ...own.resolution, outcomes: {
                ...outcomes,
                success: { ...outcomes.success, noteEffects: [future(rounds, roundUnit)] },
                failure: { ...outcomes.failure, noteEffects: [future(minutes, minuteUnit)] },
                criticalFailure: { ...outcomes.criticalFailure, noteEffects: [{ label: "Hurled into another timeline", text: "Gone into an entirely different timeline: remove its token. Whether it ever comes back is the GM's call — not within a year at least.", duration: null }] }
            } }, notes: own.notes, partial: undefined, unread: undefined, automation: { level: "automatic" } };
        }
    },
    {
        // (Speak with Animals for birds only: a note Effect beside the spell on its user for the spell's hour (plan.castNote).)
        name: "Raven Band",
        over: true,
        sentences: [/^When you stroke the kadlaka feather, the raven band gives you the effects of Speak with Animals, except that you can speak with and understand only birds, not other animals\.$/],
        card: (found, plan) => (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Speak with Animals" ? null : castOver({
            castNote: { label: "Birds only", text: "Its Speak with Animals reaches only birds: it speaks with and understands them, and no other animals.", duration: timeOf(1, "hours") },
            notes: undefined
        }))
    },
    {
        // (A Mythic Point as it invests the skullcap (plan.spend), and Rewards of Service's Focus Point usable for a runelord focus spell until it
        // next invests it: a note Effect on its user, with no end.)
        name: "Runic Skullcap: Rewards of Rule",
        sentences: [
            /^Spend 1 Mythic Point when you invest the runic skullcap\.$/,
            /^Until the next time you invest the skullcap, you can also use the Focus Point granted by Rewards of Service to cast a focus spell from the runelord wizard school\.$/,
            /^(Envy: .+)$/
        ],
        card: ([, , [list]]) => {
            const spells = list.split(/\s+(?=(?:Greed|Sloth|Gluttony|Lust|Pride|Wrath):)/).map((entry) => entry.replace(/:\s*/, ": ").trim()).join("; ");
            return {
                ...ownRow({
                    noteEffects: [{ label: "Rewards of Rule", text: `Until it next invests the skullcap, the Focus Point Rewards of Service gives can also cast a runelord wizard school focus spell (${spells}).`, duration: null }],
                    notes: ["Its user needs master or legendary proficiency in Arcana; the Mythic Point is spent as it invests the skullcap."]
                }),
                spend: { mythicPoints: 1 }
            };
        }
    },
    {
        // (PF2e's Pick a Lock with Occultism at a lock within 30 feet, or at mythic proficiency for a Mythic Point: the ways card, each the
        // action card (plan.action.statistic, action.mythic — scripts/item-actions.js).)
        name: "Spindle Key: Breach",
        sentences: [/^You harness the key's occult geometry to bypass a lock within (\d+) feet\.$/, /^You attempt to Pick the Lock, using (Occultism) instead of Thievery for the check\.$/, /^You can spend a Mythic Point to attempt the check at mythic proficiency\.$/],
        card: ([[, feet], [, skill]], plan, context) => {
            const pick = (mythic) => ({
                builtin: "item-action",
                targeting: { target: null, range: `${feet} feet`, area: null },
                action: { slug: "pick-a-lock", name: "Pick a Lock", bonus: null, statistic: skill.toLowerCase(), targeted: false, basic: null, ...(mythic ? { mythic: true } : {}), after: `At a lock within ${feet} feet, bypassed by the key's occult geometry.` },
                ...(mythic ? { spend: { mythicPoints: 1 } } : {})
            });
            return wayList([{ name: `With ${skill}`, html: "", plan: wayPlan(pick(false), context) }, { name: "At mythic proficiency (1 Mythic Point)", html: "", plan: wayPlan(pick(true), context) }]);
        }
    },
    {
        // (A successful Control Weather ritual's weather, out of combat: the GM's to set — the environment module's weather — a line of its card.)
        name: "Sky-Piercing Bow",
        sentences: [/^You fire a volley of arrows into the sky\.$/, /^You create the effects of a successful Control Weather ritual\.$/],
        card: () => ownRow({ notes: ["As a successful Control Weather ritual: the weather within 2 miles of its user becomes calm and normal for the season, or up to two of the season's effects it picks, for 4d12 hours (out of combat) — the GM sets it, as the scene's weather in the environment module."] })
    },
    {
        // (Its user's pick of two spells at rank 5, occult, cast with its own spell DC and a rank 5 slot of its own spent: the cast card's
        // choices, plan.castDC and plan.spend.spellSlot.)
        name: "Telekinetic Converters: Mind Over Matter",
        sentences: [/^You cast your choice of (Telekinetic Haul) or (Telekinetic Maneuver) as a (\d+)th-rank (occult) spell, consuming one of your unexpended spell slots of the same rank as if you had used it to cast the spell\.$/],
        card: ([[said, first, second, rank, tradition]], plan, { whole }) => {
            const link = (name) => new RegExp(String.raw`@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]{16})\]\{${name}\}`).exec(String(whole ?? ""))?.[1];
            const [haul, maneuver] = [link(first), link(second)];
            if (!haul || !maneuver) return null;
            const level = Number(rank);
            return {
                builtin: "cast-spell", spell: { uuid: haul, name: first }, rank: level, dc: null, attack: null, tradition, self: false,
                targeting: { target: null, range: null, area: null },
                choices: [{ spell: { uuid: haul, name: first }, rank: level, targets: false }, { spell: { uuid: maneuver, name: second }, rank: level }],
                castDC: { from: "spell", said },
                spend: { spellSlot: { rank: level } },
                notes: [`Its user needs a spellcasting class feature: one of its unexpended rank ${level} spell slots is spent, as if it cast the spell itself (its own spell DC and attack).`]
            };
        }
    }
];

const named = (reading, name) => (reading.name instanceof RegExp ? reading.name.test(String(name ?? "")) : reading.name === name);
// Whether a reading is for this source name (its words aren't worth reading otherwise).
export const hasAdventureReading = (name) => READINGS.some((reading) => named(reading, name));

// Its sentences as one reading's, each matched in order → the matches, or null.
function matched(reading, sentences) {
    if (sentences.length !== reading.sentences.length) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? found : null;
}

// The plan (null, note-only or the GM's no-effect — or any, for a reading over it) and its effect's words → the reading's card, or the same
// plan. name: its source name; base, info, frequency: its own (an activation's, or a consumable's basePlan and itemInfo); html: its text;
// item: the whole item's plain text, whole its html.
export function withAdventureReading(plan, { name, words, html = "", item = "", whole = "", base, info, frequency = null }) {
    const readings = READINGS.filter((reading) => named(reading, name) && (reading.over || !plan || plan.noteOnly || plan.builtin === "no-effect"));
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of readings) {
        const found = matched(reading, sentences);
        const card = found ? reading.card(found, plan, { html, whole: whole || html, base, info, item, frequency }) : null;
        if (!card) continue;
        if (card.keep) {
            const { keep, ...changes } = card;
            const next = { ...plan, ...changes };
            for (const key of Object.keys(changes)) if (changes[key] === undefined) delete next[key];
            return next;
        }
        const { item: own, ...rest } = card;
        return { ...base, automation: { level: "automatic" }, trigger: { event: "use", ...(frequency ? { frequency } : {}) }, ...rest, item: { ...info, ...(own ?? {}) } };
    }
    return plan;
}


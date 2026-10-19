// A square an item covers for a while, with a save for a creature moving into it: Spider Gun's Web Shot, "You fire a mass of webbing
// at a square within 30 feet. That square becomes covered in webbing for 1 minute. … The first time each turn a creature in the
// webbing begins to use a move action or enters the webbing during a move action, it must attempt an @Check[athletics|dc:20]
// {Athletics} check or @Check[reflex|dc:20]{Reflex} save against DC 20. … on a critical failure, it's Immobilized for 1 round or
// until it Escapes (DC 20) or destroys the webbing." The ability module's zone builtin: a square its user places within that
// distance, for its time, the Reflex save on entering (its critical failure Immobilized for 1 round, through the ability compiler's
// reading of that row). The Athletics check in its place, the difficult terrain of a failure, a creature already in it starting a
// move, and the webbing's own statistics are notes. Pure.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const COVERED = /\bYou fire a mass of (\w+) at a square within (\d+) feet\. That square becomes covered in \1 for (\d+) (minutes?|rounds?|hours?)\./i;
const SAVE = /\bThe first time each turn a creature in the (\w+) begins to use a move action or enters the \1 during a move action, it (?:must|has to) attempt an @Check\[athletics\|dc:(\d+)\](?:\{[^}]*\})? check or @Check\[reflex\|dc:\2\](?:\{[^}]*\})? save against DC \2\./i;
const CRITICAL = /\bon a critical failure, it's (@UUID\[[^\]]+\]\{Immobilized\}) for 1 round\b/i;
const UNITS = { minute: "minutes", minutes: "minutes", round: "rounds", rounds: "rounds", hour: "hours", hours: "hours" };

// The activation's html, the plan's base, the item → { builtin: "zone", … } or null.
export function coveredSquarePlan(html, base, item, options = {}) {
    const text = String(html ?? "");
    const covered = COVERED.exec(text);
    const save = SAVE.exec(text);
    const critical = CRITICAL.exec(text);
    if (!covered || !save || !critical) return null;
    const [, stuff, range, time, unit] = covered;
    const dc = Number(save[2]);
    // (The save's own plan: the ability compiler's reading of it, on the creature that enters.)
    const saveHtml = `<p><strong>Effect</strong> The target must attempt a @Check[reflex|dc:${dc}] save.</p><p><strong>Critical Success</strong> The target is unaffected.</p><p><strong>Success</strong> The target is unaffected.</p><p><strong>Failure</strong> The target is unaffected.</p><p><strong>Critical Failure</strong> The target is ${critical[1]} for 1 round.</p>`;
    const read = compileAbility({ ...item, type: "action", system: { ...(item?.system ?? {}), description: { value: saveHtml }, actionType: { value: "passive" }, actions: { value: null } } }, options);
    if (read?.resolution?.kind !== "save" || !(read.resolution.outcomes?.criticalFailure?.effects ?? []).some((effect) => effect.slug === "immobilized")) return null;
    const plan = { ...read, trigger: { event: "zone" }, targeting: { target: `the creature that enters the ${stuff}`, range: null, area: null } };
    const escape = /\buntil it Escapes \((?:\[\[[^\]]*\]\]\{)?DC (\d+)\}?\)/i.exec(text)?.[1];
    return {
        ...base,
        builtin: "zone",
        actions: null,
        zone: {
            area: { type: "square", value: 5 },
            centre: "placed",
            range: Number(range),
            lasts: { mode: "fixed", value: Number(time), unit: UNITS[unit.toLowerCase()], expiry: "turn-start", anchor: "effect-start" },
            untilReused: false,
            concealed: false,
            terrain: [],
            others: false,
            hazard: null,
            saves: [{ when: ["enter"], plan }],
            damage: [],
            effect: null,
            modifiers: [],
            notes: [
                `The first time each turn: a creature that enters the ${stuff}, or starts a move action in it (that one by hand), attempts the save.`,
                `It can attempt an Athletics check against DC ${dc} instead of the Reflex save.`,
                `On a success, it moves normally and clears the ${stuff} from the squares it enters this turn; on a failure, the ${stuff} is difficult terrain for it this turn.`,
                ...(escape ? [`Immobilized until it Escapes (DC ${escape}) or destroys the ${stuff}, at most 1 round.`] : []),
                ...(/\bA square has AC (\d+)/i.test(text) ? [`A square of ${stuff}: AC ${/\bA square has AC (\d+)/i.exec(text)[1]}, it fails its saves, and it's cleared by ${/\bcleared by ([^.]+)\./i.exec(text.replace(/<[^>]+>/g, "").replace(/@Damage\[(\d+)\[(\w+)\]\]/g, "$1 $2"))?.[1] ?? "damage"}.`] : [])
            ]
        }
    };
}

// An area of stalagmites it raises for a while: Stoneraiser Javelin's "You hurl the stoneraiser javelin at an unoccupied space within 30
// feet. The javelin's power flows into the ground, which erupts in a 5-foot-radius burst of razor-sharp stalagmites. … the stalagmites'
// spaces are difficult terrain. A creature takes 4d4 piercing damage for every move action it takes that enters at least one of the
// affected spaces. … The stalagmites crumble to dust after 1 minute. Any creature in the area when the stalagmites appear is pushed to
// the nearest unoccupied space of its choice …. Pushed creatures must attempt a DC 28 Reflex saving throw or take 4d4 piercing damage"
// with its degree rows. The ability module's zone: a burst placed within that distance, difficult terrain, the damage on each move into
// it, the save for those there as it appears. The push, the cover and the stalagmites' own statistics are notes.
const RAISED = /\bYou hurl the (?:<em>)?[\w' -]+?(?:<\/em>)? at an unoccupied space within (\d+) feet\.(?:<\/p>\s*<p>|\s)+The [\w' -]+? power flows into the ground, which erupts in a (\d+)-foot-radius burst of razor-sharp (\w+)\./i;
const ENTERING = /\bA creature takes @Damage\[([^\]]*\])\] damage for every move action it takes that enters at least one of the affected spaces\./i;
const CRUMBLE = /\bThe \w+ crumble to dust after (\d+) (minutes?|rounds?)\./i;
const PUSHED = /\bPushed creatures must attempt a DC (\d+) (Fortitude|Reflex|Will) saving throw or take (@Damage\[[^\]]*\]\]) damage\./i;
export function raisedAreaPlan(html, base, item, options = {}) {
    const text = String(html ?? "");
    const raised = RAISED.exec(text);
    const entering = ENTERING.exec(text);
    const crumble = CRUMBLE.exec(text);
    if (!raised || !entering || !crumble || !/\bspaces are difficult terrain\b/i.test(text)) return null;
    const pushed = PUSHED.exec(text);
    // (Those there as it appears: their save, its degree rows as the ability compiler reads them.)
    const rows = pushed ? text.slice(text.indexOf("</p>", pushed.index) + 4) : "";
    const save = pushed ? compileAbility({ ...item, type: "action", system: { ...(item?.system ?? {}), description: { value: `<p><strong>Effect</strong> The target takes ${pushed[3]} damage with a @Check[${pushed[2].toLowerCase()}|dc:${pushed[1]}] saving throw.</p>${rows}` }, actionType: { value: "free" }, actions: { value: null } } }, options) : null;
    const savePlan = save?.resolution?.kind === "save" ? { ...save, trigger: { event: "zone" }, targeting: { target: "each creature in the area as it appears", range: null, area: null } } : null;
    const plain = text.replace(/<[^>]+>/g, " ").replace(/@Damage\[(\d+d\d+)\[(\w+)\]\]/g, "$1 $2").replace(/\s+/g, " ");
    const notes = [
        ...(/\bhas cover from creatures on the opposite side\b/i.test(plain) ? [`The ${raised[3]} give cover to creatures on either side from those on the other.`] : []),
        ...(/\bis pushed to the nearest unoccupied space of its choice\b/i.test(plain) ? ["A creature in the area as it appears is pushed to the nearest unoccupied space of its choice (forced movement): move its token."] : []),
        ...[/\bEach 5-foot-by-5-foot section has [^.]+\./i, /\bIt's immune to [^.]+\./i, /\bA destroyed section [^.]+\./i].map((pattern) => pattern.exec(plain)?.[0]).filter(Boolean),
        "Its damage on entering is once for each move action that enters it."
    ];
    return {
        ...base,
        builtin: "zone",
        actions: null,
        zone: {
            area: { type: "burst", value: Number(raised[2]) },
            centre: "placed",
            range: Number(raised[1]),
            lasts: { mode: "fixed", value: Number(crumble[1]), unit: UNITS[crumble[2].toLowerCase()], expiry: "turn-start", anchor: "effect-start" },
            untilReused: false,
            concealed: false,
            terrain: [{ movement: ["walk"], difficulty: 2 }],
            others: false,
            hazard: null,
            saves: savePlan ? [{ when: ["initial"], plan: savePlan }] : [],
            damage: [{ when: "enter", formulas: [entering[1]] }],
            effect: null,
            modifiers: [],
            notes
        }
    };
}

// A square its user coats for a while: Colorful Coating's "slather over one 5-foot square within your reach or space … its effect in the
// square you coated lasts for 1 minute". The ability module's zone, that square placed within reach, for that time, with what its colour
// says there: difficult terrain (Violet's, Green's), hazardous terrain's damage on entering (Orange's "dealing 1d4 acid to any creature
// that moves through it"), a save on entering (Violet's Reflex save or a –15-foot penalty to Speeds, Immobilized on a critical failure,
// through the ability compiler's reading of it). Its other rules — uneven ground, Escaping, climbing, once a round — are notes. Null when
// the colour does none of these (Blue's, Red's, Indigo's, Yellow's: the GM's).
const COATED = /\bslather over one 5-foot square within your reach or space\b[\s\S]*?\bits effect in the square you coated lasts for (\d+) (minutes?|rounds?)\./i;
const ENTERS = /^Any creature that enters the square must succeed at an? (@Check\[[^\]]*\])(?:\{[^}]*\})? (?:save|saving throw) or (.+)\.$/i;
const MOVES_THROUGH = /^The square becomes hazardous terrain, dealing @Damage\[((?:[^[\]]|\[[^\]]*\])*)\](?:\{[^}]*\})? (?:damage )?to any creature that moves through it\.$/i;
const RULES = /\b(?:penalty|bonus|DC|Escap\w*|Interact|actions?|damage|once per round|Climb|Balance|Steps?|Crawls?)\b/i;
export function coatedSquarePlan(html, base, item, options = {}) {
    const text = String(html ?? "");
    const coated = COATED.exec(text);
    if (!coated) return null;
    // (The colour's own paragraphs, after the general one; its links kept for the save's reading.)
    const own = text.slice(text.indexOf("</p>", coated.index) + 4).replace(/<\/?(?:p|hr|br)\b[^>]*>/gi, " ").replace(/\s+/g, " ").trim();
    const sentences = own.split(/(?<=[.!?])\s+(?=[A-Z@])/).map((sentence) => sentence.trim()).filter(Boolean);
    const said = (sentence) => sentence.replace(/@\w+\[(?:[^[\]]|\[[^\]]*\])*\]\{([^}]*)\}/g, "$1").replace(/@Damage\[((?:[^[\]]|\[[^\]]*\])*)\]/g, (_all, formula) => formula.replace(/\[(\w+)\]/, " $1")).replace(/<[^>]+>/g, "");
    const terrain = [];
    let hazard = null;
    let entering = null;
    // (Its results after it, "On a critical failure, …", while they follow.)
    let open = false;
    const notes = [];
    for (const sentence of sentences) {
        if (open && /^On a (?:critical )?(?:failure|success)\b/i.test(sentence)) {
            entering.follow.push(sentence);
            continue;
        }
        open = false;
        const enters = ENTERS.exec(sentence);
        if (enters) {
            entering = { check: enters[1], rest: enters[2], follow: [] };
            open = true;
            continue;
        }
        const through = MOVES_THROUGH.exec(sentence);
        if (through) {
            hazard = { formulas: [through[1]] };
            continue;
        }
        // (What it makes, not what lessens another's, Yellow's "reduces difficult terrain caused by slipperiness".)
        if (/\b(?:is|becomes|making it(?: both)?) (?:greater )?difficult terrain\b/i.test(sentence)) {
            if (!terrain.length) terrain.push({ movement: ["walk"], difficulty: /\bgreater difficult terrain\b/i.test(sentence) ? 3 : 2 });
            const uneven = /\buneven ground with a DC to (?:@UUID\[[^\]]*\]\{)?Balance\}? of (\d+)\b/i.exec(sentence);
            if (uneven) notes.push(`It's also uneven ground: a creature moving there Balances against DC ${uneven[1]}.`);
            continue;
        }
        if (RULES.test(said(sentence))) notes.push(said(sentence));
    }
    if (!terrain.length && !hazard && !entering) return null;
    const saves = [];
    if (entering) {
        const sub = `<p><strong>Effect</strong> The target must succeed at a ${entering.check} save or ${entering.rest}.</p>${entering.follow.map((sentence) => `<p>${sentence}</p>`).join("")}`;
        const read = compileAbility({ ...item, type: "action", system: { ...(item?.system ?? {}), description: { value: sub }, actionType: { value: "passive" }, actions: { value: null } } }, options);
        if (read?.resolution?.kind !== "save" || read.resolution.check?.against?.dc !== "fixed") return null;
        saves.push({ when: ["enter"], plan: { ...read, trigger: { event: "zone" }, targeting: { target: "the creature that enters the square", range: null, area: null } } });
    }
    return {
        ...base,
        builtin: "zone",
        actions: null,
        zone: {
            area: { type: "square", value: 5 },
            centre: "placed",
            // (Within its user's reach, or its own space.)
            range: 5,
            lasts: { mode: "fixed", value: Number(coated[1]), unit: UNITS[coated[2].toLowerCase()], expiry: "turn-start", anchor: "effect-start" },
            untilReused: false,
            concealed: false,
            terrain,
            others: false,
            hazard,
            saves,
            damage: [],
            effect: null,
            modifiers: [],
            notes: ["A square within your reach, or your own.", ...notes]
        }
    };
}

// Walls it raises: Alkenstar Phalanx's "You raise walls of rapidly shifting metal plates in two @Template[type:line|distance:60]{60-foot
// lines} going in opposite directions. Each wall is 60 feet high and is greater difficult terrain. Whenever a creature enters or starts
// their turn in the wall's space, they take @Damage[6d10[slashing]] damage (@Check[fortitude|dc:32|basic] save)." The ability module's
// zone: one line twice that long, placed through its user's space, greater difficult terrain, the basic save on entering and at a
// turn's start there (through the ability compiler's reading of it). Its height and cover are notes.
const WALLS = /\bYou raise walls of [^.]*?\bin two @Template\[(?:type:)?line\|distance:(\d+)[^\]]*\](?:\{[^}]*\})? going in opposite directions\./i;
const IN_THE_WALL = /\bWhenever a creature (enters or starts|starts|enters) (?:their|its) turn in the wall's space, (?:they|it) takes? (@Damage\[(?:[^[\]]|\[[^\]]*\])*\](?:\{[^}]*\})?) damage \((@Check\[(?:fortitude|reflex|will)\b[^\]]*\](?:\{[^}]*\})?) save\)\./i;
export function raisedWallsPlan(html, base, item, options = {}) {
    const text = String(html ?? "");
    const walls = WALLS.exec(text);
    const inside = IN_THE_WALL.exec(text);
    if (!walls || !inside) return null;
    const read = compileAbility({ ...item, type: "action", system: { ...(item?.system ?? {}), description: { value: `<p><strong>Effect</strong> The target takes ${inside[2]} damage (${inside[3]} save).</p>` }, actionType: { value: "passive" }, actions: { value: null } } }, options);
    if (read?.resolution?.kind !== "save" || read.resolution.check?.against?.dc !== "fixed") return null;
    const plan = { ...read, trigger: { event: "zone" }, targeting: { target: "a creature in the wall's space", range: null, area: null } };
    const when = [...(/\benters\b/i.test(inside[1]) ? ["enter"] : []), ...(/\bstarts\b/i.test(inside[1]) ? ["start"] : [])];
    const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const length = Number(walls[1]);
    return {
        ...base,
        builtin: "zone",
        actions: null,
        zone: {
            area: { type: "line", value: length * 2 },
            centre: "placed",
            range: null,
            lasts: null,
            untilReused: false,
            concealed: false,
            terrain: [{ movement: ["walk"], difficulty: /\bgreater difficult terrain\b/i.test(plain) ? 3 : 2 }],
            others: false,
            hazard: null,
            saves: [{ when, plan }],
            damage: [],
            effect: null,
            modifiers: [],
            notes: [
                `Two ${length}-foot walls going in opposite directions from you: place this ${length * 2}-foot line through your own space.`,
                ...[/\bEach wall is \d+ feet high\b/i, /\bThe shifting walls also provide greater cover from any attack originating from the opposite side\./i].map((pattern) => pattern.exec(plain)?.[0]).filter(Boolean).map((sentence) => (/\.$/.test(sentence) ? sentence : `${sentence}.`))
            ]
        }
    };
}

// A cloud its user breathes into an adjacent square: Capsaicin Tonic's "You belch out a foul-smelling cloud of blisteringly spicy gas that
// fills a single square adjacent to you. Creatures within the cloud are Concealed … The cloud remains for 1 minute but can be dispersed by
// a strong wind. The cloud deals @Damage[1d4[fire]] damage to creatures that enter the cloud on their turn, as well as to creatures that
// start their turn in the cloud". The ability module's zone: that square placed next to its user, Concealed inside, its damage on
// entering and at a turn's start; its once a round and the wind are notes, and so are the tonic's later belches.
const BELCHED = /\bcloud of [^.]*?\bthat fills a single square adjacent to you\./i;
const CLOUD_DAMAGE = /\bThe cloud deals @Damage\[((?:[^[\]]|\[[^\]]*\])*)\](?:\{[^}]*\})? damage to creatures that enter the cloud on their turn, as well as to creatures that start their turn in the cloud\b/i;
const REMAINS = /\bThe cloud remains for (\d+) (minutes?|rounds?)\b/i;
export function belchedCloudPlan(html, base) {
    const text = String(html ?? "");
    const remains = REMAINS.exec(text);
    if (!BELCHED.test(text) || !remains || !/\bCreatures within the cloud are (?:@UUID\[[^\]]*\]\{)?Concealed\b/i.test(text)) return null;
    const damage = CLOUD_DAMAGE.exec(text);
    const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const uses = /\bIn the next hour, you can use the activation below up to (\w+) times\b/i.exec(plain)?.[1];
    return {
        ...base,
        builtin: "zone",
        actions: null,
        zone: {
            area: { type: "square", value: 5 },
            centre: "placed",
            range: 5,
            lasts: { mode: "fixed", value: Number(remains[1]), unit: UNITS[remains[2].toLowerCase()], expiry: "turn-start", anchor: "effect-start" },
            untilReused: false,
            concealed: true,
            terrain: [],
            others: false,
            hazard: null,
            saves: [],
            damage: damage ? [{ when: "enter", formulas: [damage[1]] }, { when: "start", formulas: [damage[1]] }] : [],
            effect: null,
            modifiers: [],
            notes: [
                "Creatures outside the cloud are concealed to creatures within it.",
                ...(damage ? ["A creature takes its damage no more than once a round."] : []),
                ...(/\bdispersed by a strong wind\b/i.test(plain) ? ["A strong wind disperses it."] : []),
                ...(uses ? [`This is its first use: it can be used up to ${uses} times within the hour, the others placed by hand.`] : [])
            ]
        }
    };
}

// Smoke its user sprays into an adjacent square, Beekeeper's Smoker's "You expel smoke into an adjacent 5-foot square. All creatures in that
// area are Concealed, and other creatures are concealed to them. The smoke lasts for 1d4 rounds or until dispersed by strong wind": the
// ability module's zone, that square placed next to its user, Concealed inside; its 1d4 rounds the GM's (rolled and ended by hand).
const SPRAYED = /\bYou expel smoke into an adjacent 5-foot square\.\s*All creatures in that area are (?:@UUID\[[^\]]*\]\{)?Concealed\}?, and other creatures are concealed to them\.\s*The smoke lasts for (?:\[\[\/\w+ (\d+d\d+) #rounds\]\]\{[^}]*\}|(\d+) rounds?)/i;
export function sprayedSmokePlan(html, base) {
    const text = String(html ?? "");
    const sprayed = SPRAYED.exec(text);
    if (!sprayed) return null;
    const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const lit = /\bfills with smoke for (\d+) minutes, during which time you can squeeze the trigger to spray smoke\b/i.exec(plain);
    return {
        ...base,
        builtin: "zone",
        actions: null,
        zone: {
            area: { type: "square", value: 5 },
            centre: "placed",
            range: 5,
            lasts: sprayed[2] ? { mode: "fixed", value: Number(sprayed[2]), unit: "rounds", expiry: "turn-start", anchor: "effect-start" } : null,
            untilReused: false,
            concealed: true,
            terrain: [],
            others: false,
            hazard: null,
            saves: [],
            damage: [],
            effect: null,
            modifiers: [],
            notes: [
                "Everyone outside it is concealed to those inside.",
                ...(sprayed[1] ? [`It lasts ${sprayed[1]} rounds: roll them and remove it by hand.`] : []),
                ...(/\bdispersed by (?:a )?strong wind\b/i.test(plain) ? ["A strong wind disperses it."] : []),
                ...(lit ? [`Lit, it can spray once a minute for ${lit[1]} minutes (each spray placed by its own activation).`] : [])
            ]
        }
    };
}

// A cloud of sticky bubbles its user blows, Clinging Bubbles' "An improbably large cloud of bubbles emerges in a @Template[burst|distance:5].
// This cloud travels in a straight line, moving 10 feet at the end of your turns. … any creature who enters the same space as the bubble
// cloud becomes shrouded in them, taking a –10-foot circumstance penalty to its Speed. … The bubbles pop naturally and harmlessly after 1
// minute": the ability module's zone placed next to its user for that minute, the penalty on a creature entering it (an Effect that stays
// until it pops them); the cloud's drift, the popping and the cloud's own numbers notes.
const BUBBLES = /\bcloud of bubbles emerges in (a square adjacent to you|an? @Template\[(?:type:)?burst\|distance:(\d+)\][^.]*)\./i;
const SHROUDED = /\btaking an? [–-](\d+)-foot circumstance penalty to its Speed\b/i;
const POPS = /\bpop naturally and harmlessly after (\d+) (minutes?|rounds?)\b/i;
export function bubbleCloudPlan(html, base, item) {
    const text = String(html ?? "");
    const bubbles = BUBBLES.exec(text);
    const shrouded = SHROUDED.exec(text);
    if (!bubbles || !shrouded) return null;
    const pops = POPS.exec(text);
    const plain = text.replace(/@\w+\[[^\]]*\](?:\{([^}]*)\})?/g, (all, label) => label ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
    const plan = {
        modelVersion: MODEL_VERSION,
        source: base?.source ?? { name: item?.name ?? null },
        rank: 1,
        traits: [...(item?.system?.traits?.value ?? [])],
        activation: { time: null, traits: [] },
        automation: { level: "guided" },
        trigger: { event: "zone" },
        targeting: { target: "a creature entering the bubbles", range: null, area: null },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), modifiers: [{ selector: "land-speed", type: "circumstance", value: -Number(shrouded[1]) }] } } }
    };
    const sentences = (pattern) => (pattern.exec(plain)?.[0] ?? null);
    return {
        ...base,
        builtin: "zone",
        actions: null,
        zone: {
            area: bubbles[2] ? { type: "burst", value: Number(bubbles[2]) } : { type: "square", value: 5 },
            centre: "placed",
            range: bubbles[2] ? 10 : 5,
            lasts: pops ? { mode: "fixed", value: Number(pops[1]), unit: UNITS[pops[2].toLowerCase()], expiry: "turn-start", anchor: "effect-start" } : null,
            untilReused: false,
            concealed: false,
            terrain: [],
            others: false,
            hazard: null,
            saves: [{ when: ["enter"], plan }],
            damage: [],
            effect: null,
            modifiers: [],
            notes: [
                "It drifts 10 feet in a straight line at the end of its user's turns: move it by hand.",
                ...[/[^.]*\bInteract action to pop the bubbles[^.]*\./i, /[^.]*\bredirected with strong winds\./i, /[^.]*\bThe cloud of bubbles has AC[^.]*\./i].map(sentences).filter(Boolean).map((sentence) => sentence.trim()),
                "The penalty stays on a creature until it pops the bubbles: remove its Effect then."
            ]
        }
    };
}

// A square its user fills with something that harms only some creatures: Sanctified Beans' "choose an adjacent square to exhale into. You
// fill that square with soothing vapors that harm any fiend, fey, ghost, spirit, or undead creature that ends their turn in that square for
// the next minute, causing them to take @Damage[(4d8+4)[spirit]] damage (@Check[will|dc:28|basic] save). An incorporeal creature that takes
// this damage must also attempt a @Check[fortitude|dc:28] save" with its degree rows. The ability module's zone: that square next to its
// user, its basic save at a turn's end there only for creatures with one of those traits (zone.saves[i].only, ability b4ad3ce), and the
// second save only for an incorporeal one.
const EXHALED = /\bchoose an adjacent square to exhale into\.\s*You fill that square with [^.]*?\bthat harm any ([\w, ]+?) creature that ends their turn in that square for the next (minute|\d+ minutes|\d+ rounds), causing them to take (@Damage\[(?:[^[\]]|\[[^\]]*\])*\])(?:\{[^}]*\})? damage \((@Check\[(?:fortitude|reflex|will)\|[^\]]*\])(?:\{[^}]*\})? save\)\./i;
const ALSO = /\bAn? (\w+) creature that takes this damage must also attempt an? (@Check\[(?:fortitude|reflex|will)\|[^\]]*\])(?:\{[^}]*\})? save[^.]*\.(?:<\/p>\s*<hr \/>\s*|\s*)([\s\S]*)$/i;
export function exhaledSquarePlan(html, base, item, options = {}) {
    const text = String(html ?? "");
    const exhaled = EXHALED.exec(text);
    if (!exhaled) return null;
    const traits = exhaled[1].split(/,\s*(?:or\s+)?|\s+or\s+/).map((trait) => trait.trim().toLowerCase()).filter(Boolean);
    const read = (description) => compileAbility({ ...item, type: "action", system: { ...(item?.system ?? {}), description: { value: description }, actionType: { value: "passive" }, actions: { value: null } } }, options);
    const damage = read(`<p><strong>Effect</strong> The target takes ${exhaled[3]} damage (${exhaled[4]} save).</p>`);
    if (damage?.resolution?.kind !== "save" || damage.resolution.check?.against?.dc !== "fixed") return null;
    const saves = [{ when: ["end"], only: { traits }, plan: { ...damage, trigger: { event: "zone" }, targeting: { target: "a creature in the square", range: null, area: null } } }];
    const also = ALSO.exec(text.slice(exhaled.index + exhaled[0].length));
    if (also) {
        const second = read(`<p><strong>Effect</strong> The target must attempt a ${also[2]} save.</p>${also[3]}`);
        if (second?.resolution?.kind === "save") saves.push({ when: ["end"], only: { traits: [also[1].toLowerCase()] }, plan: { ...second, trigger: { event: "zone" }, targeting: { target: "an incorporeal creature in the square", range: null, area: null } } });
    }
    const time = /^\d+/.test(exhaled[2]) ? { value: Number(exhaled[2].split(" ")[0]), unit: /round/i.test(exhaled[2]) ? "rounds" : "minutes" } : { value: 1, unit: "minutes" };
    return {
        ...base,
        builtin: "zone",
        actions: null,
        zone: {
            area: { type: "square", value: 5 },
            centre: "placed",
            range: 5,
            lasts: { mode: "fixed", ...time, expiry: "turn-start", anchor: "effect-start" },
            untilReused: false,
            concealed: false,
            terrain: [],
            others: false,
            hazard: null,
            saves,
            damage: [],
            effect: null,
            modifiers: [],
            notes: [
                `Only a ${traits.slice(0, -1).join(", ")} or ${traits.at(-1)} creature that ends its turn there takes the damage.`,
                ...(also ? [`An ${also[1].toLowerCase()} creature also attempts the second save (only when it took the damage).`] : [])
            ]
        }
    };
}

// A chime placed in a square that troubles only some creatures around it: Aetheric Irritant's "place it on the ground in a square within
// your reach. The aetheric irritant affects an area in a @Template[type:emanation|distance:10]. Creatures with the fey, spirit, or undead
// traits must attempt a @Check[will|dc:15] save when they enter the affected area and at the beginning of every turn they are in the affected
// area. Those who fail the save treat the area as difficult terrain until the beginning of their next turn. … after 10 minutes". The ability
// module's zone placed within reach (its emanation from that square as a burst the GM places), the save on entering and at a turn's start
// only for creatures with those traits (only: { traits }), a failure's difficult terrain a note Effect on the creature until its next turn.
const PLACED_AROUND = /\bplace it on the ground in a square within your reach\.\s*The [\w' -]+? affects an area in an? @Template\[(?:type:)?emanation\|distance:(\d+)[^\]]*\](?:\{[^}]*\})?\.\s*Creatures with the ([\w, ]+?) traits? must attempt an? (@Check\[(?:fortitude|reflex|will)\|[^\]]*\])(?:\{[^}]*\})? save when they enter the affected area and at the beginning of every turn they are in the affected area\.\s*Those who fail the save ([^.]+)\./i;
export function placedChimePlan(html, base, item, options = {}) {
    const text = String(html ?? "");
    const placed = PLACED_AROUND.exec(text);
    if (!placed) return null;
    const check = /@Check\[(fortitude|reflex|will)\|dc:(\d+)/i.exec(placed[3]);
    const lasting = /\bafter (\d+) (minutes?|rounds?) of being activated\b/i.exec(text);
    if (!check || !lasting) return null;
    const traits = placed[2].split(/,\s*(?:or\s+)?|\s+or\s+/).map((trait) => trait.trim().toLowerCase()).filter(Boolean);
    const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
    const failed = { ...none(), noteEffects: [{ text: `Failed save: ${placed[4]}.`, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "target-turn" } }] };
    const plan = {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: "guided" },
        targeting: { target: "a creature in the area", range: null, area: null },
        trigger: { event: "zone" },
        resolution: { kind: "save", check: { roll: "save", statistic: check[1].toLowerCase(), basic: false, against: { dc: "fixed", value: Number(check[2]) } }, outcomes: { criticalSuccess: none(), success: none(), failure: failed, criticalFailure: failed } }
    };
    const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    return {
        ...base,
        builtin: "zone",
        actions: null,
        zone: {
            area: { type: "burst", value: Number(placed[1]) },
            centre: "placed",
            range: 5,
            lasts: { mode: "fixed", value: Number(lasting[1]), unit: UNITS[lasting[2].toLowerCase()], expiry: "turn-start", anchor: "effect-start" },
            untilReused: false,
            concealed: false,
            terrain: [],
            others: false,
            hazard: null,
            saves: [{ when: ["enter", "start"], only: { traits }, plan }],
            damage: [],
            effect: null,
            modifiers: [],
            notes: [
                `Its ${placed[1]}-foot emanation from the square it's placed in.`,
                ...[/\bA creature that critically succeeds at the save is immune[^.]*\./i, /\bor it is moved, whichever comes first\b/i].map((pattern) => pattern.exec(plain)?.[0]).filter(Boolean).map((said) => (/^or it is moved/i.test(said) ? "It ends sooner if it's moved." : said))
            ]
        }
    };
}

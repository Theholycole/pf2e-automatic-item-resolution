// An area that acts on creatures at a turn's start or end in it, for a while: Arctic Worm Chitin Shield's "Until the beginning of
// your next turn, … any creature that ends its turn adjacent to you takes 3d6 cold damage (… basic save)", Alluring Lantern's "Any
// creature that begins its turn within 20 feet of you must succeed at a … save or become Fascinated", third-party Noisome Garum's
// reek (a Fortitude save, sickened on a failure, for whoever ends a turn next to its user), Sandstorm Top's thrown "5-foot radius. Any creature that
// starts its turn in the area or moves into the area takes 4d6 slashing damage (… basic save)". The ability module's zone: an
// emanation attached to its user's token (or placed where it's thrown), its save at "start" or "end" (and "enter") — the ability
// compiler's plan of that sentence, as the target's — for its time; what else the text says, its notes. Pure.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { durationIn } from "./rows.js";

const AURA = /(?:^|[.;]\s+|\band\s+|\bEffect\s+)((?:Any|Each|A|any|each|a)(?: breathing)? creature that (begins|starts|ends) its turn|Creatures that (begin|start|end) their turn) (?:within (?:@Template\[[^\]]*\]\{)?(\d+) feet\}? of you|(adjacent to you)|in the (?:aura|area))( or moves into the area)? ((?:must (?:succeed at|attempt|make) an? @Check\[(?:fortitude|reflex|will)\b[^\]]*\](?:\{[^}]*\})? save(?:@UUID\[[^\]]*\]\{[^}]*\}|[^.@])*|takes @Damage\[(?:[^\[\]]|\[[^\]]*\])*\](?:\{[^}]*\})? damage \(@Check\[(?:fortitude|reflex|will)\b[^\]]*\](?:\{[^}]*\})? save\)))\./;
const THROWN = /\bYou throw the [\w' -]+? (\d+) feet away from you\b[^.]*\.\s*For (\d+ (?:rounds?|minutes?)), [^.]*?\bin an? (\d+)-foot (radius|burst|emanation)\b/i;

// The activation's html → the zone builtin's { area, centre, range, lasts, saves, notes, … } or null.
export function readAuraZone(html, name = "Aura") {
    const text = String(html ?? "");
    const aura = AURA.exec(text);
    if (!aura) return null;
    const when = /^(?:begin|start)/i.test(aura[2] ?? aura[3]) ? ["start"] : ["end"];
    if (aura[6]) when.push("enter");
    const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const thrown = THROWN.exec(plain);
    if (!aura[4] && !aura[5] && !thrown) return null;
    // (Its time: "Until the beginning of your next turn", "For 1 minute", "These effects last for 1 minute", the thrown one's.)
    const untilNext = /\bUntil the (?:beginning|start) of your next turn\b/i.test(plain);
    const lasting = /\bThese effects last for (\d+|one|an?) (rounds?|minutes?)\b/i.exec(plain);
    const lasts = untilNext ? { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" }
        : thrown ? durationIn(`for ${thrown[2]}`, null)
            : lasting ? durationIn(`for ${lasting[1]} ${lasting[2]}`, null) : durationIn(plain, null);
    if (!lasts) return null;
    // (The creature's own save: the sentence as the target's, the lantern's "The fascination ends at the end of the creature's turn"
    // its own turn's.)
    let words = aura[7].replace(/^must (?:make|attempt) an? (@Check\[[^\]]*\](?:\{[^}]*\})?) save or\b/i, "must succeed at a $1 save or");
    const ownTurn = /\bThe fascination ends at the end of the creature's turn\b/i.test(plain);
    words = `The target ${words.replace(/^must\b/, "must")}.`;
    let plan = null;
    try {
        plan = compileAbility({ name, type: "action", system: { slug: null, description: { value: `<p>${words}</p>` }, actionType: { value: "free" }, actions: { value: null }, traits: { value: [] } } }, {});
    } catch {
        plan = null;
    }
    if (plan?.resolution?.kind !== "save" || plan.resolution.check?.against?.dc !== "fixed") return null;
    if (ownTurn) {
        const outcomes = Object.fromEntries(Object.entries(plan.resolution.outcomes).map(([degree, row]) => [degree, { ...row, effects: (row.effects ?? []).map((effect) => (effect.slug === "fascinated" ? { ...effect, duration: { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "target-turn" } } : effect)) }]));
        plan = { ...plan, resolution: { ...plan.resolution, outcomes } };
    }
    plan = { ...plan, trigger: { event: "zone" }, targeting: { target: "a creature in the area", range: null, area: null } };
    const radius = thrown ? Number(thrown[3]) : aura[5] ? 5 : Number(aura[4]);
    const sentences = plain.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    const said = aura[0].replace(/<[^>]+>/g, " ").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\s+/g, " ").trim();
    const notes = sentences.filter((sentence) => !sentence.includes(said.slice(0, 40)) && !said.includes(sentence.slice(0, 40)) && !/^(?:Activate|Frequency|Trigger|Requirements?)\b/.test(sentence) && !THROWN.test(sentence) && /\b(?:resistance|bonus|penalty|must|can't|breath|suffocat|move toward|action)\b/i.test(sentence));
    // (What it gives its user beside the aura: Arctic Worm Chitin Shield's "you gain resistance 5 to cold", its own PF2e Effect.)
    const own = /\b(?:you gain|granting you) resistance (\d+) to (\w+)\b/i.exec(plain);
    const link = /@UUID\[(Compendium\.pf2e\.equipment-effects\.Item\.[A-Za-z0-9]+)\]\{(Effect: [^}]+)\}/.exec(text);
    if (own) notes.unshift(`You also gain resistance ${own[1]} to ${own[2]}${link ? ` (${link[2]}: apply it to yourself from the item)` : " (by hand)"}.`);
    // (After its save, the lantern's "and must spend at least one of its actions to move toward you".)
    const after = /\bsave or become (?:@UUID\[[^\]]*\]\{[^}]*\}|[^.@])*?\band (must spend [^.]+)\./i.exec(aura[7] + ".");
    if (after) notes.push(`A creature that fails ${after[1].replace(/^must/, "must also")}.`);
    return {
        area: { type: thrown && /radius|burst/i.test(thrown[4]) ? "burst" : "emanation", value: radius },
        centre: thrown ? "placed" : "self",
        range: thrown ? Number(thrown[1]) : null,
        lasts,
        untilReused: false,
        concealed: false,
        terrain: [],
        others: false,
        hazard: null,
        saves: [{ when, plan }],
        damage: [],
        effect: null,
        modifiers: [],
        notes
    };
}

// An emanation around its user for a while, damage for creatures entering it or starting a turn in it: Incendiary Plate's "The armor
// engulfs you in a vortex of living fire in a @Template[type:emanation|distance:15] for 10 minutes. Creatures that enter this aura or
// start their turn within it take @Damage[10d6[fire]] damage (@Check[reflex|dc:40|basic] save). This area is difficult terrain for
// other creatures.", Horn of Rust's shards that "orbit you" for 1 minute, "Creatures and objects that begin their turn in this area
// take … damage from the shards (… save)". The zone on its user's token, the basic save at those times; the rest of its rule
// sentences, notes.
const AROUND_YOU = /\b(?:engulfs|orbits?|surrounds?) you\b[^.]*?@Template\[(?:type:)?emanation\|distance:(\d+)[^\]]*\](?:\{[^}]*\})? for (\d+) (minutes?|rounds?)\./i;
const TAKE_IN_IT = /\bCreatures(?: and objects)? that ((?:enter|begin|start|end)[^.@]*?) take (@Damage\[(?:[^[\]]|\[[^\]]*\])*\](?:\{[^}]*\})?) damage(?: from the [\w' -]+?)? \((@Check\[(?:fortitude|reflex|will)\b[^\]]*\](?:\{[^}]*\})?) save\)\./i;
export function readSelfAura(html, name = "Aura") {
    const text = String(html ?? "");
    const around = AROUND_YOU.exec(text);
    const take = TAKE_IN_IT.exec(text);
    if (!around || !take) return null;
    const who = take[1].toLowerCase();
    const when = [...(/\benters?\b/.test(who) ? ["enter"] : []), ...(/\b(?:begin|start)\b/.test(who) ? ["start"] : []), ...(/\bend\b/.test(who) ? ["end"] : [])];
    if (!when.length) return null;
    let plan = null;
    try {
        plan = compileAbility({ name, type: "action", system: { slug: null, description: { value: `<p>The target takes ${take[2]} damage (${take[3]} save).</p>` }, actionType: { value: "free" }, actions: { value: null }, traits: { value: [] } } }, {});
    } catch {
        plan = null;
    }
    if (plan?.resolution?.kind !== "save" || plan.resolution.check?.against?.dc !== "fixed") return null;
    plan = { ...plan, trigger: { event: "zone" }, targeting: { target: "a creature in the area", range: null, area: null } };
    const plain = text.replace(/@\w+\[(?:[^[\]]|\[[^\]]*\])*\]\{([^}]*)\}/g, "$1").replace(/@Check\[(fortitude|reflex|will)\|dc:(\d+)[^\]]*\]/gi, (_all, statistic, dc) => `DC ${dc} ${statistic}`).replace(/@Damage\[((?:[^[\]]|\[[^\]]*\])*)\]/g, (_all, formula) => formula.replace(/\[(\w+)\].*$/, " $1")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const sentences = plain.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    const others = /\bThis area is difficult terrain for other creatures\b/i.test(plain);
    const difficult = others || /\bThis area is difficult terrain\b/i.test(plain);
    // (Its rule sentences other than the area, the damage and the terrain: Horn of Rust's +1 item bonus to AC for its user, its tetanus.)
    // (Its user's own bonus, with PF2e's Effect for it named after the item: that Effect on its user as the zone starts, scripts/zones.js.)
    const bonus = /\b(?:grants?|gives?) you an? \+\d+ (?:item|status|circumstance) bonus to AC\b[^.]*\./i.exec(plain)?.[0];
    const link = /@UUID\[(Compendium\.pf2e\.equipment-effects\.Item\.[A-Za-z0-9]+)\]\{(Effect: [^}]+)\}/.exec(text);
    const own = bonus && link && link[2].toLowerCase().includes(String(name).replace(/:.*$/, "").trim().toLowerCase()) ? { uuid: link[1], label: link[2] } : null;
    const notes = sentences.filter((sentence) => !/\b(?:engulfs|orbits?|surrounds?) you\b/i.test(sentence) && !/^Creatures(?: and objects)? that\b/i.test(sentence) && !/^This area is difficult terrain\b/i.test(sentence) && !(own && sentence.includes(bonus)) && /\b(?:bonus|penalty|exposed|immune|save|damage|AC)\b/i.test(sentence));
    if (own) notes.unshift(`Its user also gets ${own.label} (${bonus.replace(/^.*?\b(?:grants?|gives?) you an? /i, "").replace(/\.$/, "")}).`);
    return {
        ...(own ? { own } : {}),
        area: { type: "emanation", value: Number(around[1]) },
        centre: "self",
        range: null,
        lasts: durationIn(`for ${around[2]} ${around[3]}`, null),
        untilReused: false,
        concealed: false,
        terrain: difficult ? [{ movement: ["walk"], difficulty: 2 }] : [],
        others,
        hazard: null,
        saves: [{ when, plan }],
        damage: [],
        effect: null,
        modifiers: [],
        notes
    };
}

// An aura activation's save on those in it as it's made and on entering, its damage a type its user picks: Bloodburn Censer's smoke "in
// a @Template[emanation|distance:20]", "the smoke deals your choice of fire or poison damage. Each living creature that's in the area or
// enters it attempts a @Check[fortitude|dc:34] saving throw, then becomes temporarily immune for 1 hour". The ways card, a way for each
// type (src/compiler/type-choice.js's damageChoices), each the zone on its user's token with that type's rows; its condition while that
// persistent damage lasts (src/compiler/primed.js). Who it spares and the immunity are notes. Null for anything else.
const IN_OR_ENTERS = /\bEach (living )?creature (?:that's|that is|who's) in the area or enters it attempts an? @Check\[/i;
export function choiceAuraWays(plan, activation, base, { withWhile = (entry) => entry } = {}) {
    const html = String(activation?.html ?? "");
    const emanation = /@Template\[(?:type:)?emanation\|distance:(\d+)[^\]]*\]/i.exec(html);
    const enters = IN_OR_ENTERS.exec(html);
    if (plan?.resolution?.kind !== "save" || !(plan.damageChoices?.length > 1) || !emanation || !enters || !(activation.traits ?? []).includes("aura")) return null;
    const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const notes = [...(enters[1] ? ["Only a living creature attempts the save."] : []), ...(/\bthen becomes temporarily immune for 1 hour\b/i.test(plain) ? ["A creature that has attempted the save is immune to it for 1 hour: don't roll it again for that creature."] : [])];
    const { damageChoices, ...save } = plan;
    const ways = damageChoices.map((choice) => {
        const one = withWhile({ ...save, resolution: { ...save.resolution, outcomes: choice.outcomes }, trigger: { event: "zone" }, targeting: { target: "a creature in the area", range: null, area: null } });
        const zone = { area: { type: "emanation", value: Number(emanation[1]) }, centre: "self", range: null, lasts: null, untilReused: false, concealed: false, terrain: [], others: false, hazard: null, saves: [{ when: ["initial", "enter"], plan: one }], damage: [], effect: null, modifiers: [], notes };
        return { name: choice.label, html, plan: { ...base, builtin: "zone", source: base.source, actions: null, zone } };
    });
    return { ...base, builtin: "ways", once: true, automation: { level: "guided" }, targeting: { target: null, range: null, area: null }, trigger: { ...(plan.trigger?.frequency ? { frequency: plan.trigger.frequency } : {}), event: "use" }, ways };
}

// An aura around its user that heals some and harms others at a turn's start: Soulcutter's Soothe Souls, "within a
// @Template[type:emanation|distance:20] around you … You can Sustain this activation for up to 1 minute. Living creatures that start their turn
// in the area regain 1d8 Hit Points, and any fiend or undead creature that starts its turn in the area takes @Damage[1d8[spirit]] damage" (its
// Heroic grade's with a @Check[will|dc:38|basic] save). The zone on its user's token for the minute, the damage — or its basic save — at a
// turn's start only for creatures with those traits (only: { traits }, ability b4ad3ce); the healing of the living a note.
const AROUND_YOU_AREA = /\bwithin an? @Template\[(?:type:)?emanation\|distance:(\d+)[^\]]*\](?:\{[^}]*\})? around you\b/i;
const HEALS_AND_HARMS = /\bLiving creatures that start their turn in the area regain (@Damage\[(?:[^[\]]|\[[^\]]*\])*\](?:\{[^}]*\})?|\d+d\d+(?:\+\d+)?) Hit Points, and any ([\w ]+?) creature that starts (?:its|their) turn in the area takes (@Damage\[(?:[^[\]]|\[[^\]]*\])*\])(?:\{[^}]*\})? damage(?: \((@Check\[(?:fortitude|reflex|will)\|[^\]]*\])(?:\{[^}]*\})? save\))?\./i;
export function readHealingAura(html, name = "Aura") {
    const text = String(html ?? "");
    const around = AROUND_YOU_AREA.exec(text);
    const harms = HEALS_AND_HARMS.exec(text);
    const sustained = /\bSustain this activation for up to (\d+) (minutes?|rounds?)\b/i.exec(text);
    if (!around || !harms) return null;
    const traits = harms[2].split(/\s+or\s+|,\s*/).map((trait) => trait.trim().toLowerCase()).filter(Boolean);
    const formula = /@Damage\[((?:[^[\]]|\[[^\]]*\])*)\]/.exec(harms[3])?.[1];
    if (!formula) return null;
    let saves = [];
    let damage = [];
    if (harms[4]) {
        let plan = null;
        try {
            plan = compileAbility({ name, type: "action", system: { slug: null, description: { value: `<p>The target takes ${harms[3]} damage (${harms[4]} save).</p>` }, actionType: { value: "free" }, actions: { value: null }, traits: { value: [] } } }, {});
        } catch {
            plan = null;
        }
        if (plan?.resolution?.kind !== "save") return null;
        saves = [{ when: ["start"], only: { traits }, plan: { ...plan, trigger: { event: "zone" }, targeting: { target: "a creature in the area", range: null, area: null } } }];
    } else damage = [{ when: "start", only: { traits }, formulas: [formula] }];
    const healing = harms[1].replace(/@Damage\[\(?([^\]\[]+?)\)?\[healing\]\]/i, "$1");
    return {
        area: { type: "emanation", value: Number(around[1]) },
        centre: "self",
        range: null,
        lasts: sustained ? durationIn(`for ${sustained[1]} ${sustained[2]}`, null) : null,
        untilReused: false,
        concealed: false,
        terrain: [],
        others: false,
        hazard: null,
        saves,
        damage,
        effect: null,
        modifiers: [],
        notes: [
            ...(sustained ? [`It lasts while you Sustain it, up to ${sustained[1]} ${sustained[2]}: end it on this card sooner if you stop.`] : []),
            `Each living creature that starts its turn in the area regains ${healing} Hit Points (roll it by hand).`
        ]
    };
}

// The builtin, its base the activation's or the item's; its user's own Effect beside it, ownEffect.
export function auraZonePlan(html, base, name) {
    const read = readAuraZone(html, name) ?? readSelfAura(html, name) ?? readHealingAura(html, name);
    if (!read) return null;
    const { own, ...zone } = read;
    return { ...base, builtin: "zone", source: base.source, actions: null, zone, ...(own ? { ownEffect: own } : {}) };
}

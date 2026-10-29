// Light, darkness, smoke, terrain, walls, visibility, senses and vehicles: the readings of the 2026-10-28 batch's areas group (src/compiler/group-readings.js calls this outermost on both chains).
// context: { kind ("consumable" or "activation"), name (an activation's "Item: Activation"), html, text, words, base, info, frequency (an
// activation's), item, entry (an activation's), options, decide(plan) (the user's rulings applied again, for a plan still partial) }.
// → the new plan, or the same one. Pure.
//
// The installed modules' items (2026-10-28, docs/needs.md; the user's ruling of 2026-10-06: theirs as fully as PF2e's own). Each reading
// names the items it's for, whether it reads over the plan before (by default only none, note-only or the GM's no-effect), a pattern for
// each sentence of its effect's words in order — none dropped — and the card they make. Their text is theirs: each pattern is cut into short
// pieces (\s+, \b.*\b) and the cards' words are this module's own.

import { DIFFICULT, zoneOf } from "./area-readings.js";
import { vehicleNote } from "./vehicles.js";
import { benefitStrike } from "./benefit-ways.js";
import { compileItem } from "./index.js";
import { effectWords, sentencesOf } from "./lasting.js";
import { plainText } from "./rows.js";
import { splitSecondary } from "./secondary.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours" };
const timeOf = (value, unit) => ({ mode: "fixed", value: Number(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
// (A zone card of its own; the ways card's way, its own base and item part.)
const zoneCard = (zone) => ({ builtin: "zone", actions: null, targeting: { target: null, range: zone.range ? `${zone.range} feet` : null, area: zone.area }, zone });
const wayOf = (name, card, { base, info }) => {
    const { item: own, ...rest } = card;
    return { name, html: `<p><strong>Effect</strong> ${name}.</p>`, plan: { ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...rest, item: { ...info, ...(own ?? {}) } } };
};
const waysCard = (ways) => ({ builtin: "ways", once: true, targeting: { target: null, range: null, area: null }, ways });
// Its effect's words, for an activation whose words the shared reading misses (no Effect heading, no traits in brackets — Volatile Vial's
// "Activate 1 Interact"): after its Effect heading, else after its Activate line's paragraph; its Craft Requirements off.
function ownWords({ kind, html, words }) {
    if (kind !== "activation") return words;
    const block = String(html ?? "");
    const effect = /<strong>\s*Effect\s*<\/strong>([\s\S]*)$/i.exec(block)?.[1] ?? block.replace(/^\s*(?:<p>\s*)?<strong>\s*Activat[^<]*<\/strong>[\s\S]*?<\/p>/i, "");
    return plainText(effect).replace(/\s*\bCraft Requirements\b.*$/s, "").trim() || null;
}
// (Each sentence matched in order → the matches, or null.)
const matchAll = (patterns, sentences) => (sentences.length === patterns.length && sentences.every((sentence, index) => patterns[index].test(sentence)) ? sentences.map((sentence, index) => patterns[index].exec(sentence)) : null);

// Boreal Mint's Secondary Effect (each grade): its cone's basic Reflex save, read by src/compiler/secondary.js as the ways card's second way,
// harms only creatures with the fire trait or immune to fire — the save card's line to target just those — and puts out the non-magical
// fires in the cone (the map's, a line). The Major's damage link lacks its closing brackets ("[cold[]"): read as the others' once mended.
const MINT_SECONDARY = [/^You\s+breathe out\b.*\bin a (\d+)-foot cone\.$/, /^Non-magical fires\s+within the area\b.*\bextinguished\.$/, /^Creatures with the\s+fire trait or\s+immunity to fire take\b.*\bsave\.$/];
const UNCLOSED_DAMAGE = /@Damage\[(\d+d\d+)\[(\w+)\[\]/;
function mintSecondary(plan, { item, html, options }) {
    if (UNCLOSED_DAMAGE.test(String(html ?? ""))) {
        const mended = String(html).replace(new RegExp(UNCLOSED_DAMAGE.source, "g"), "@Damage[$1[$2]]");
        return { whole: compileItem({ ...item, system: { ...(item.system ?? {}), description: { ...(item.system?.description ?? {}), value: mended } } }, options) };
    }
    const split = splitSecondary(html);
    const at = (plan?.ways ?? []).findIndex((way) => way.name === "Its secondary effect");
    const way = plan?.ways?.[at];
    if (!split || plan.builtin !== "ways" || !way || way.plan?.resolution?.kind !== "save" || way.plan.targeting?.area?.type !== "cone") return null;
    if (!matchAll(MINT_SECONDARY, sentencesOf(effectWords(split.secondary, "activation")))) return null;
    const notes = ["Its damage is only for creatures that have the fire trait or are immune to fire: target just those in the cone.", "Non-magical fires in the cone go out (the map's)."];
    const ways = plan.ways.map((entry, index) => (index === at ? { ...entry, plan: { ...entry.plan, notes: [...(entry.plan.notes ?? []), ...notes] } } : entry));
    return { keep: true, ways };
}

// Volatile Vial: thrown, hazardous fire where it lands for its time in place of a vial's usual effect — the ability module's zone placed within
// its range, its damage on a creature moving into it (hazard) and starting a turn there. How much and how wide are the item's own rules,
// ItemAlterations by its level (2 fire in one square up to 3rd, 4 to 11th, 8 and a 5-foot burst its user may pick from 12th, 12 and a
// 10-foot burst too from 18th): its level's, a way of the ways card for each area its user may pick.
const VIAL = [/^The\s+volatility of the vial\b.*\bhazardous fire at an area\s+within (\d+) feet\b.*\.$/, /^Creatures that\s+begin their turn\b.*\bpass through its\s+space take damage\.$/, /^The hazardous terrain\s+lasts for (\d+) (minutes?|rounds?)\.$/];
const levelFits = (predicate, level) => (predicate ?? []).every((term) => (typeof term === "string" ? true : term?.lte ? level <= Number(term.lte[1]) : term?.gte ? level >= Number(term.gte[1]) : true));
function vialCard([thrown, , lasts], _plan, { item, info, base }) {
    const level = Number(info?.level) || 0;
    // (At 18th both the 12th-to-18th and the 18th-and-up rules fit: the higher, its last.)
    const rule = (item?.system?.rules ?? []).filter((entry) => entry.key === "ItemAlteration" && entry.property === "description" && levelFits(entry.predicate, level)).pop();
    const words = String(rule?.value?.[0]?.text ?? "");
    const damage = /@Damage\[(\d+)\[(\w+)\]\]/.exec(words);
    if (!damage) return null;
    const formula = `${damage[1]}[${damage[2]}]`;
    const areas = [{ type: "square", value: 5 }, ...[...words.matchAll(/@Template\[type:burst\|distance:(\d+)\]/g)].map((found) => ({ type: "burst", value: Number(found[1]) }))].sort((a, b) => (a.type === b.type ? a.value - b.value : a.type === "square" ? -1 : 1));
    const zone = (area) => zoneCard(zoneOf({ area, centre: "placed", range: Number(thrown[1]), lasts: timeOf(lasts[1], lasts[2]), hazard: { formulas: [formula] }, damage: [{ when: "start", formulas: [formula] }], notes: [`Hazardous fire where the vial lands, in place of its usual effect: ${damage[1]} ${damage[2]} damage to a creature moving into it and to one starting its turn there.`] }));
    if (areas.length === 1) return zone(areas[0]);
    return waysCard(areas.map((area) => wayOf(area.type === "square" ? "One 5-foot square" : `A ${area.value}-foot burst`, zone(area), { base, info })));
}

// Expanding Foam (each grade): thrown, a burst of hardened foam — a solid object — for good, as Barricade Stone (Cube)'s stone: the ability
// module's zone where it lands, its walls drawn on the map. Its sections' AC, Hardness, Hit Points, immunities and fire resistance are an
// object's, the creatures in the burst moved out to its edge (forced movement, their pick of where) and the fires put out the map's: lines.
const FOAM = [
    /^This vial\s+contains a liquid\b.*\.$/,
    /^When the\s+glass is shattered\b.*\.$/,
    /^When Activated, the\s+vial is thrown\s+to a space within (\d+) feet\b.*\bfills a (\d+)-foot burst\.$/,
    /^A destroyed\s+section of the foam\b.*\.$/,
    /^Non-magical fires\s+in the area\b.*\bextinguished\.$/,
    /^Creatures in the area\s+are moved to the\s+nearest edge\b.*\.$/,
    /^This is\s+forced movement\.$/,
    /^Each\s+5-foot-by-5-foot\s+section of the wall\s+has AC (\d+), Hardness (\d+), and (\d+) Hit Points\.$/,
    /^It is immune to\s+critical hits and\s+precision damage\b.*\bresistance (\d+) to (\w+)\.$/
];
// (The Greater's restating of its burst, "The area is a 30-foot burst", the same burst: read only when it is.)
const FOAM_AREA = /^The area is a (\d+)-foot burst\.$/;
function foamCard(plan, { words }) {
    const sentences = sentencesOf(words ?? "");
    const restated = sentences.map((sentence) => FOAM_AREA.exec(sentence)).filter(Boolean);
    const found = matchAll(FOAM, sentences.filter((sentence) => !FOAM_AREA.test(sentence)));
    if (!found) return null;
    const [, , thrown, , , , , section, immune] = found;
    if (restated.some((area) => area[1] !== thrown[2])) return null;
    return zoneCard(zoneOf({
        area: { type: "burst", value: Number(thrown[2]) },
        centre: "placed",
        range: Number(thrown[1]),
        notes: [
            `Thrown up to ${thrown[1]} feet, it fills the burst with hardened foam, a solid object, until it's destroyed (fit the zone to it and draw its walls on the map).`,
            "Each creature in the burst is moved out to the nearest edge of the burst, at a spot it picks: forced movement (move its token).",
            "Non-magical fires in the burst go out (the map's).",
            `Each 5-foot section: AC ${section[1]}, Hardness ${section[2]}, ${section[3]} Hit Points, immune to critical hits and to precision damage, ${immune[2]} resistance ${immune[1]}; once destroyed, that section can be crossed as normal (an object's, the GM's).`
        ]
    }));
}

// Draconic Steak: its +2 circumstance bonus to Intimidation only against creatures that sense by scent (precise or imprecise) — no roll option
// of PF2e's tells a target's senses, so PF2e's toggle for it on its user's Effect (item.ruleEffects, as situational.js does) and the
// FlatModifier predicated on it — gone at its user's next daily preparations (untilRest), 24 hours at most. The animals' reluctance to attack
// its user is the GM's call, the same Effect's words.
const STEAK = [/^Made of drake\s+flesh\b.*\.$/, /^The steak adds\s+the pheromones\b.*\.$/, /^After Activating\s+the steak, you gain a \+(\d+) (circumstance|item|status) bonus on (Intimidation) checks\s+against creatures with\s+scent\b.*\.$/, /^Animals with scent\s+are less likely\b.*\.$/, /^These effects last\s+(\d+) hours or until\s+you make your daily preparations\b.*\.$/];
const toggle = (option, label) => ({ key: "RollOption", domain: "all", option, toggleable: true, label });
function steakCard([, , gain, , lasts], plan) {
    const row = plan?.resolution?.outcomes?.success;
    if (!row) return null;
    const option = "draconic-steak-scent";
    const words = `+${gain[1]} ${gain[2]} bonus to ${gain[3]} checks against creatures that sense by scent, precisely or not (its toggle on for those); animals with scent are less inclined to attack it unless compelled (the GM's call). Until its next daily preparations, ${lasts[1]} hours at most`;
    const effect = { name: "Dragon scent", words, rules: [toggle(option, "Intimidating a creature that has scent"), { key: "FlatModifier", selector: gain[3].toLowerCase(), type: gain[2], value: Number(gain[1]), predicate: [option] }], duration: timeOf(lasts[1], "hours"), untilRest: true };
    const { noteEffects: _reminder, ...kept } = row;
    return { keep: true, partial: undefined, unread: undefined, automation: { level: "automatic" }, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...kept, modifiers: [] } } }, item: { ...(plan.item ?? {}), ruleEffects: [effect] } };
}

// X-Ray Goggles: a sight PF2e has no rule for, seeing through what its user picks as it Seeks — its words on its user for the 10 minutes, as
// Spectacles of Piercing Sight's are (what it then sees the GM's to describe).
const GOGGLES = [
    /^These\s+peculiar goggles\b.*\.$/,
    /^When Activated, you can use\s+@Compendium\[[^\]]*\]\{Seek\}\s+to see through\b.*\bwithin (\d+) feet for (\d+) (minutes?)\.$/,
    /^When you Seek,\s+you decide\b.*\.$/,
    /^This ability is\s+blocked by (\d+) feet of wood, (\d+) foot of stone, (\d+) inches of\s+common metal, or (\d+) inch of\s+lead or any starmetal\b.*\bblack-and-white\b.*\.$/,
    /^You don't gain\s+the benefit\b.*\blow-light vision\b.*\.$/,
    /^You can use\s+your goggles as part of a\s+10-minute activity\b.*\.$/,
    /^Creatures you\s+observe or ignore\b.*\barmor or clothing\b.*\.$/
];
const ownRow = ({ noteEffects = [], notes = [], target = null }) => ({
    targeting: { target, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {})
});
function gogglesCard([, seek, , blocked]) {
    const [, wood, stone, metal, lead] = blocked;
    return ownRow({
        noteEffects: [{
            label: "X-ray vision",
            text: `Each time it Seeks, it can see into and through solid materials up to ${seek[1]} feet away, looking past the creatures or objects it picks; in a 10-minute activity (Search, Investigate and the like) it names what it looks past as it starts. Wood ${wood} feet thick, stone ${stone} foot thick, common metal ${metal} inches thick, or lead or any starmetal ${lead} inch thick stops it. Meanwhile its sight is black and white, its other special visual senses (low-light vision and the like) don't help, and it sees no farther than ${seek[1]} feet. What it looks through shows only bones, metal, stone and such, never just armor or clothing (the GM describes it).`,
            duration: timeOf(seek[2], seek[3])
        }]
    });
}

// Toan Nguyen's Tincture: a drinker's hearing for its 10 minutes — up to three conversations within 100 feet heard with no check, what they
// say the GM's — for one other precise sense given up meanwhile. Its sight (most creatures' only other precise sense) is PF2e's Blinded for
// the time; another its own to leave unused: the ways card, its pick. Its Deafened afterwards lasts a minute for each conversation it
// listened to, a count only its user knows: the note Effect's words, applied as it ends.
const TINCTURE = [
    /^This elixir\s+comes in a brown\b.*\.$/,
    /^The solution\s+inside is cloudy\b.*\.$/,
    /^After you drink\s+this elixir, your hearing\b.*\.$/,
    /^You can\s+eavesdrop on up to (\w+)\s+ongoing conversations within (\d+) feet for (\d+) (minutes?)\b.*\bdisabling one\s+other precise sense\b.*\.$/,
    /^Your ears\s+will be left ringing\b.*\bdeafened\b.*\bnumber of\s+conversations\b.*\.$/
];
function tinctureCard([, , , hears], _plan, context) {
    const duration = timeOf(hears[3], hears[4]);
    const note = (sense) => ({ label: "Keen hearing", text: `It hears up to ${hears[1]} conversations going on within ${hears[2]} feet with no check to hear them (what they say is the GM's to tell). ${sense} When this ends, it's Deafened for 1 minute for each conversation it listened to (its own count: apply it then).`, duration });
    const way = (name, sense, effects) => wayOf(name, { targeting: { target: "the drinker", range: null, area: null }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects, noteEffects: [note(sense)] } } } }, context);
    return waysCard([
        way("Its sight given up", "Its sight is given up meanwhile: Blinded.", [{ kind: "condition", slug: "blinded", value: null, duration }]),
        way("Another precise sense given up", "One other precise sense it picks is given up meanwhile (it doesn't use it).", [])
    ]);
}

// Tears of Shizuru: as its wearer drops to 0 Hit Points, jade tears fall within 30 feet of it — as it's used and at the start of its next 2
// turns, a basic Fortitude save card (3d8 force, holy) at each of its foes there and Quickened at each of its allies there, their extra
// action only to move or to heal (a note Effect beside it). The pulse of src/live/pulse.js with cards of its own (plan.item.pulse plan, who,
// also, ticks: scripts/pulse.js), the save as the ability compiler read it.
const TEARS = [
    /^Legend has it\s+Shizuru\b.*\.$/,
    /^This amulet\s+consists of\b.*\.$/,
    /^Activate\b.*\bTrigger You drop to 0 Hit Points\b.*\bEffect The amulet\s+shatters\b.*\.$/,
    /^Jade tears\s+start falling\b.*\bin a (\d+)-foot radius\s+around you\.$/,
    /^Upon activation and\s+at the start of your turn\s+for the next (\d+) rounds, the tears deal\b.*\ball enemies in the area\b.*\bsave\.$/,
    /^The tears\s+have the\s+(holy) trait\.$/,
    /^At the\s+same time,\s+all allies in the area\s+are Quickened\.$/,
    /^They can use\s+this extra action only to move\b.*\bhealing effect\.$/
];
function tearsCard([, , , radius, turns, trait], plan, { base }) {
    if (plan?.resolution?.kind !== "save" || !plan.resolution.sharedDamage) return null;
    const feet = Number(radius[1]);
    const ticks = Number(turns[1]);
    const round = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "effect-start" };
    const foes = { ...base, traits: [...new Set([...(base.traits ?? []), trait[1]])], automation: { level: "automatic" }, targeting: { target: `each foe within ${feet} feet`, range: null, area: null }, trigger: { event: "use" }, resolution: plan.resolution };
    const allies = { ...base, automation: { level: "automatic" }, targeting: { target: `each ally within ${feet} feet`, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects: [{ kind: "condition", slug: "quickened", value: null, duration: round }], noteEffects: [{ label: "Jade tears' extra action", text: "Its extra action from Quickened is only to move or to use an action with a healing effect.", duration: round }] } } } };
    const formula = plan.resolution.sharedDamage.components.map((component) => component.formula).join(" + ");
    const dc = plan.resolution.check?.against?.value;
    const words = `Jade tears within ${feet} feet of its user: ${formula} damage (basic Fortitude save, DC ${dc}; ${trait[1]}) to each foe there and Quickened for each ally there, now and at the start of its next ${ticks} turns`;
    return {
        targeting: { target: null, range: null, area: null },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
        notes: [`Used as its wearer drops to 0 Hit Points without dying: the amulet shatters, and its tears' cards come now and at the start of its next ${ticks} turns.`],
        item: { pulse: { plan: foes, who: "foes", also: { plan: allies, who: "allies" }, radius: feet, own: false, ticks, lasts: timeOf(ticks, "rounds"), words } }
    };
}

// Phlogiston Grease: the ways card — a 10-foot square of surface made to burn as wood would (the map's, a line), or an adjacent creature's
// Fortitude save. Its failure (a critical failure the same) changes the creature's fire resistance, weakness or immunity, as PF2e has no
// rule to: a note Effect on it for the minute, ended early once it has taken fire damage four times (its words).
const GREASE = [
    /^This reddish\s+sludge\b.*\.$/,
    /^When poured or\s+applied to a (\d+)-foot square of surface\b.*\bburnable\b.*\bwood\.$/,
    /^You can apply it\s+to an adjacent creature\b.*\bmust succeed at a\s+@Check\[(fortitude|reflex|will)\|dc:(\d+)\]\s+save\.$/,
    /^If the creature\s+fails its save, its resistance to (\w+)\s+is reduced by (\d+)\b.*\bweakness to \w+ by (\d+)\b.*\.$/,
    /^If the creature\s+has \w+ immunity, it loses its immunity\b.*\bequal to its level\b.*\.$/,
    /^These effects last\s+for (\d+) (minutes?|rounds?), until the area\s+has been burning for (\d+) rounds\b.*\bdamage (\w+) times\b.*\.$/
];
function greaseCard([, surface, applied, fails, , lasts], _plan, context) {
    const [, type, value] = fails;
    const times = { two: 2, three: 3, four: 4, five: 5 }[lasts[4].toLowerCase()] ?? Number(lasts[4]);
    const duration = timeOf(lasts[1], lasts[2]);
    const note = { label: "Phlogiston grease", text: `Its ${type} resistance is ${value} lower; with no ${type} resistance, its ${type} weakness is ${value} higher instead (weakness ${value} if it had none); with ${type} immunity, it loses it and has ${type} resistance equal to its level. It ends early once it has taken ${type} damage ${times} times (delete it then).`, duration };
    const rows = { criticalSuccess: none(), success: none(), failure: { ...none(), noteEffects: [note] }, criticalFailure: { ...none(), noteEffects: [note] } };
    const creature = { targeting: { target: "an adjacent creature", range: "touch", area: null }, resolution: { kind: "save", check: { roll: "save", statistic: applied[1], basic: false, against: { dc: "fixed", value: Number(applied[2]) } }, outcomes: rows } };
    const ground = { targeting: { target: null, range: null, area: null }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, notes: [`A ${surface[1]}-foot square of surface it's poured on burns as if it were wood, for ${lasts[1]} ${lasts[2]} or until it has burned for ${lasts[3]} rounds (the map's).`] };
    return waysCard([wayOf("On a surface", ground, context), wayOf("On an adjacent creature", creature, context)]);
}

// Subliming Aludel: a bomb or a healing elixir put in it becomes a 5-foot emanation of gas round the aludel a round later, concealing for 4
// rounds — the ways card, one zone for each. A bomb's gas is hazardous terrain (on moving into it and at a turn's start there); an elixir's
// heals each creature inside, PF2e's fast healing given while it's inside (at its turn's start, not its end). Either deals or heals half
// the level of the item put in (minimum 1): set at half the aludel's own level, the GM's to change for another item (its pick of its user's
// items is src/compiler/one-offs.js's, to build later).
const ALUDEL = [
    /^This pear-shaped\s+glassware\b.*\.$/,
    /^When you Activate\s+the aludel, it can transform\b.*\.$/,
    /^You can Interact\s+to place a bomb or\s+an elixir that restores Hit Points\b.*\.$/,
    /^The aludel creates\s+a cloud of gas in a (\d+)-foot emanation (\d+) round after\b.*\bconcealment and\s+lasts for (\d+) (rounds?|minutes?)\.$/,
    /^If the alchemical\s+item used was a bomb\b.*\bhazardous terrain\b.*\bhalf the item[’']s level \(minimum (\d+)\)\s+to creatures that\s+move through\b.*\bbegin their\s+turn in the area\.$/,
    /^If the\s+alchemical\s+item used was an elixir\b.*\brestores Hit Points\b.*\bend their turn\b.*\bhalf the item[’']s level \(minimum (\d+)\)\.$/
];
function aludelCard([, , , cloud, bomb, elixir], _plan, context) {
    const level = Number(context.info?.level) || 0;
    const amount = (minimum) => Math.max(Number(minimum), Math.floor(level / 2));
    const zone = (fields, notes) => zoneCard(zoneOf({ area: { type: "emanation", value: Number(cloud[1]) }, centre: "self", lasts: timeOf(cloud[3], cloud[4]), concealed: true, ...fields, notes: [`The gas forms ${cloud[2]} round after the activation, round the aludel: place it then (moved where the aludel stands if it isn't held).`, ...notes] }));
    const hurt = amount(bomb[1]);
    const heal = amount(elixir[1]);
    // (At a turn's start there its holder's too, in the gas round it — a zone's damage spares its maker, so the turn's damage is a card of its
    // own for every creature there, its maker included: saves[i].own.)
    const turn = { ...context.base, automation: { level: "automatic" }, trigger: { event: "zone" }, targeting: { target: "a creature in the gas", range: null, area: null }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), damage: { mode: "formulas", formulas: [{ formula: `${hurt}` }], rollScope: "target" } } } } };
    return waysCard([
        wayOf("A bomb inside", zone({ hazard: { formulas: [`${hurt}`] }, saves: [{ when: ["start"], own: true, plan: turn }] }, [`Its gas is hazardous terrain: ${hurt} damage to a creature moving into it and to one starting its turn there — half the bomb's level, minimum ${bomb[1]}, set for a bomb of the aludel's level (the GM changes it for another bomb, and gives it the bomb's damage type).`]), context),
        wayOf("A healing elixir inside", zone({ inside: [{ rules: [{ key: "FastHealing", value: heal }] }] }, [`Its gas heals each creature inside ${heal} Hit Points a turn — half the elixir's level, minimum ${elixir[1]}, set for an elixir of the aludel's level (the GM changes it for another elixir); PF2e's fast healing, at the start of its turn there rather than its end.`]), context)
    ]);
}

// Terotricus Root Preserve: thrown within 30 feet, a Gargantuan terotricus grows there — no PF2e creature has its statistics, so the GM's to
// place and run (a line) —, the plant life within 60 feet withers, its cover and concealment gone (the map's, a line); if the terotricus eats
// that plant life (the GM's call), its spores: the save card at the creatures within 30 feet of it, a failure's –10-foot status penalty to
// all Speeds for the minute, a critical failure's Immobilized too until it Escapes (the ability module's escape).
const PRESERVE = [
    /^This tiny root\s+of a terotricus\b.*\.$/,
    /^When you Activate it,\s+you throw the preserves\s+at a space within (\d+) feet\b.*\b(Gargantuan) terotricus\b.*\.$/,
    /^All non-magical\s+plant life\b.*\bwithin a (\d+)-foot emanation\b.*\bcover and concealment\b.*\.$/,
    /^If the terotricus\s+consumes plant life\b.*\bcreatures within (\d+) feet of it\s+must attempt a\s+@Check\[(fortitude|reflex|will)\|dc:(\d+)\]\s+save\b.*\s[–-](\d+)-?\s?foot (status|circumstance) penalty to all their Speeds for (\d+) (minutes?|rounds?)\.$/,
    /^Creatures that\s+critically fail their save\s+are Immobilized\s*until they Escape \(DC (\d+)\)\.$/
];
function preserveCard([, thrown, withers, spores, held]) {
    const [, near, statistic, dc, feet, type, lasts, unit] = spores;
    const penalty = { selector: "all-speeds", value: -Number(feet), type, duration: timeOf(lasts, unit) };
    const failure = { ...none(), modifiers: [penalty] };
    const critical = { ...none(), modifiers: [penalty], effects: [{ kind: "condition", slug: "immobilized", value: null, duration: { mode: "until-escape", escape: { dc: Number(held[1]) } } }] };
    return {
        targeting: { target: `each creature within ${near} feet of the terotricus`, range: null, area: null },
        resolution: { kind: "save", check: { roll: "save", statistic, basic: false, against: { dc: "fixed", value: Number(dc) } }, outcomes: { criticalSuccess: none(), success: none(), failure, criticalFailure: critical } },
        notes: [
            `Thrown up to ${thrown[1]} feet, it grows into a ${thrown[2]} terotricus there: PF2e has no creature with its statistics, so the GM places and runs it.`,
            `Non-magical plant life within ${withers[1]} feet of it (not plant creatures) withers into mold and mushrooms: the cover and concealment of trees and undergrowth there are gone (the map's).`,
            `Its spores come only if the terotricus eats that plant life (the GM's call): then target the creatures within ${near} feet of it for this save.`
        ],
        // (Thrown, not eaten: its user's.)
        item: { recipient: "user" }
    };
}

// Hook Chain (each grade): a gadget used several times over a minute — the ways card kept open for its uses in all (plan.waysMax, the grade's
// "number of Activate actions"; scripts/ways.js closes it once they're spent). Hooking a creature is its user's ranged attack with it as a
// simple weapon (ownCheck "thrown", as thrown.js's), a hit's note Effect on the creature for the minute: the two tied within 30 feet of each
// other, its Escape DC and the chain's AC, Hardness and Hit Points. Hooking an object or a square is the card's line. Pulling its user along
// the chain is the teleport card's move toward what it's hooked to, landing beside it (forced movement: no reactions; difficult terrain
// ignored), the hook loose after it; a landing off solid ground the map's.
const HOOK = [
    /^This handheld\s+device has a\s+grappling hook\b.*\.$/,
    /^When you aim it,\s+the grappling hook\b.*\.$/,
    /^The hook can then\s+be recalled\b.*\.$/,
    /^When you Activate,\s+you target a creature, object, or square\s+within (\d+) feet, latching onto the target\s+for (\d+) (minutes?|rounds?)\b.*\blisted number\s+of times\.$/,
    /^If the\s+target is a creature,\s+make a ranged attack roll\s+using the hook as a simple weapon\b.*\bcannot move more than (\d+) feet\s+from each other\.$/,
    /^You can release\s+the hook chain by\s+Interacting\b.*\.$/,
    /^The target can Escape\s+from your hook chain\b.*\(AC (\d+)\)\.$/,
    /^You can Activate\s+your hook chain while attached\b.*\bignoring any difficult terrain\b.*\.$/,
    /^After you complete\s+this movement, the hook detaches\b.*\badjacent to\s+the target\.$/,
    /^If you\s+do not land\s+on a space of solid ground\b.*\bfall after\b.*\.$/,
    /^This is forced movement,\s+so your movement\b.*\breactions\.$/,
    /^The Escape DC is (\d+), its Hardness is (\d+), it has (\d+) Hit Points, and\s+the number of\s+Activate actions is (\d+)\.$/
];
function hookCard([, , , aim, tied, , chainAC, , , , , numbers], _plan, context) {
    const [, escape, hardness, hp, uses] = numbers;
    const range = Number(aim[1]);
    const lasts = timeOf(aim[2], aim[3]);
    const chain = `the chain has AC ${chainAC[1]}, Hardness ${hardness}, ${hp} Hit Points`;
    const minute = `It lasts ${aim[2]} ${aim[3]} from the first use, ${uses} uses in all (this card's).`;
    const hooked = { label: "Hooked", text: `Hooked by a hook chain: it and the chain's user can't move more than ${tied[1]} feet from each other. It can Escape (DC ${escape}) to come loose, and ${chain}. The hook comes loose when its user pulls itself here or lets go with an Interact (delete this then).`, duration: lasts };
    const creature = {
        targeting: { target: "1 creature", range: `${range} feet`, area: null },
        ownCheck: { kind: "attack", modifier: null, choose: ["thrown"], within: range },
        resolution: { kind: "check", check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" }, modifier: null }, outcomes: { criticalSuccess: { ...none(), noteEffects: [hooked] }, success: { ...none(), noteEffects: [hooked] }, failure: none(), criticalFailure: none() } },
        notes: [`Its user's ranged attack with the hook as a simple weapon; a miss doesn't hook it. ${minute}`]
    };
    const thing = { targeting: { target: null, range: null, area: null }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, notes: [`Hooked to an object or a square within ${range} feet (${chain}); its user lets go with an Interact. ${minute}`] };
    const pull = { targeting: { target: "self", range: null, area: null }, builtin: "teleport", teleport: { within: range, from: "self", move: { verb: "Stride", lines: [`Pulled along the chain toward what it's hooked to, up to ${range} feet, ending in a square beside it: difficult terrain doesn't slow it, and it's forced movement, so it triggers no reactions`, "Then the hook comes loose (delete a creature's Hooked Effect)", "Not landing on solid ground, it falls after its next action (the map's)"] } } };
    return { ...waysCard([wayOf("Hook a creature", creature, context), wayOf("Hook an object or square", thing, context), wayOf("Pull yourself to it", pull, context)]), once: undefined, waysMax: Number(uses) };
}

// Ice Zuggle Orb: thrown after its user casts a spell of rank 1 or higher that round (or as a Readied throw when a spell targets it), the
// spell's elemental or energy trait changes it till the end of its user's turn — the ways card, one way for each such trait, each readying
// its next Strike with the orb (the Strike card, scripts/strikes.js; strike.own). A trait of another kind: the orb's own traits swapped for
// that one (PF2e's AdjustStrike, strike.traits) and, for an energy trait, all its damage of that type (PF2e's DamageAlteration,
// strike.alteration); an elemental trait with no damage type (air, earth, metal, water, wood) leaves its damage as it is. Its own trait:
// supercharged — a failure a success and a success a critical success (PF2e's AdjustDegreeOfSuccess, strike.degree), its splash 5 feet
// wider (strike.splashRadius, the splash card's: scripts/bombs.js). Its Strike, damage and splash otherwise PF2e's own, the splash card
// after it as for any weapon with splash.
const ZUGGLE = [
    /^\s*This colorful\s+orb\b.*\.$/,
    /^\s*An? [\w ]+? zuggle orb\s+deals\b.*\.$/,
    /^\s*Spells can\s+temporarily modify\b.*\.$/,
    /^\s*If you\s+Cast a Spell\s+on the same round\b.*\bReady an action\b.*\btargeted with\s+a spell\b.*\.$/,
    /^\s*Different Trait\s+If the spell\b.*\btraits of\s+the spell cast\.$/,
    /^\s*Any damage\s+the zuggle orb\s+deals changes\b.*\.$/,
    /^\s*For example,\s+if you cast\b.*\.$/,
    /^\s*Disrupted\s+and lost spells\b.*\.$/,
    /^\s*Same Trait\s+If the spell\b.*\bsupercharged\.$/,
    /^\s*When you throw\s+a supercharged\b.*\broll a failure,\s+you get a success\s+instead;\s+if you roll\s+a success,\s+you get a critical\s+success instead\.$/,
    /^\s*A supercharged\s+zuggle orb[’']s\s+splash radius\s+increases by (\d+) feet\.$/,
    /^\s*In either case,\s+the spell must be\s+at least (\d+)(?:st|nd|rd|th) level\b.*\buntil the end\s+of your turn\.$/
];
const ENERGY = ["acid", "cold", "electricity", "fire", "force", "sonic", "vitality", "void"];
const ELEMENTAL = ["air", "earth", "fire", "metal", "water", "wood"];
function zuggleCard(found, _plan, context) {
    const [, , , , , , , , , , wider, either] = found;
    const own = (context.item?.system?.traits?.value ?? []).filter((trait) => ENERGY.includes(trait) || ELEMENTAL.includes(trait));
    if (!own.length) return null;
    const radius = 5 + Number(wider[1]);
    const a = (trait) => (/^[aeiou]/.test(trait) ? `an ${trait}` : `a ${trait}`);
    const after = (trait) => `Only right after its user Casts a spell of rank ${either[1]} or higher that has the ${trait} trait, this round (or as its Readied throw when such a spell targets it); a disrupted or lost spell doesn't count`;
    const lasts = "It lasts until the end of its user's turn";
    const way = (trait) => {
        if (own.includes(trait)) return wayOf(`After ${a(trait)} spell: supercharged`, benefitStrike(context.base, { own: true, degree: { failure: "one-degree-better", success: "one-degree-better" }, splashRadius: radius, lines: [after(trait), lasts] }), context);
        const typed = ENERGY.includes(trait);
        const lines = [after(trait), `A spell that also has its own ${own.join(" or ")} trait supercharges it instead`, ...(typed ? [] : [`The ${trait} trait has no damage type of its own: its damage stays as it is`]), lasts];
        return wayOf(`After ${a(trait)} spell`, benefitStrike(context.base, { own: true, ...(typed ? { alteration: trait } : {}), traits: { add: [trait], remove: own }, lines }), context);
    };
    return waysCard([...new Set([...ELEMENTAL, ...ENERGY])].sort().map(way));
}

// Sea Dragon Figurehead's Tempest Roar: a tempest round its ship, as far out as the ship is long, its terrain difficult for 10 minutes — the
// ability module's zone round the vehicle its user targets or stands on (zone.centre "vehicle", its length read as it's placed:
// src/live/vehicle-aura.js, scripts/zones.js), attached to that token so it moves with the ship.
const TEMPEST = [
    /^\s*The figurehead\s+roars\b.*\bemanation with\s+a distance equal\s+to the ship[’']s length\b.*\bfor (\d+) (minutes?|rounds?)\.$/,
    /^\s*All terrain\s+in the emanation\s+is difficult terrain\.$/
];
const tempestCard = ([lasts]) => zoneCard(zoneOf({
    area: { type: "emanation", value: null },
    centre: "vehicle",
    lasts: timeOf(lasts[1], lasts[2]),
    terrain: DIFFICULT,
    notes: ["A whirling tempest round the ship the figurehead is on, out as far as the ship is long: all its terrain is difficult (target the ship before using it, or stand on it)."]
}));

// Sea Dragon Figurehead's Tidal Boost: while its tempest whirls round the ship (its Requirements, a line), the ship's Speed 10 feet higher (an
// item bonus) for a round — a note Effect on the vehicle its user targets, as Feather Token (Fan)'s (PF2e's vehicle Speeds are words no rule
// changes: src/compiler/vehicles.js vehicleNote). Each turn's piloting check to keep it, its user's own roll, is the note's words: a success
// keeps it a round more, a failure ends it.
const TIDAL = [
    /^\s*You channel\s+some of the tempest[’']s power\b.*\.$/,
    /^\s*The ship gains\s+a \+(\d+)-foot (item|circumstance|status) bonus\s+to its Speed\s+for (\d+) (rounds?|minutes?)\.$/,
    /^\s*At the start\s+of your next turn,\s+attempt a DC (\d+) piloting check\b.*\.$/,
    /^\s*On a success,\s+the ship keeps\b.*\bagain on\s+the next round\.$/,
    /^\s*On a failure,\s+the wave passes\b.*\bbonus ends\.$/
];
const TEMPEST_NEEDED = /<strong>\s*Requirements\s*<\/strong>\s*The figurehead\s+is generating\s+a tempest\b[^<]*<\/p>/i;
function tidalCard([, gains, check], _plan, { base, html }) {
    if (!TEMPEST_NEEDED.test(String(html ?? ""))) return null;
    const [, feet, type, value, unit] = gains;
    const text = `A tidal wave pushes it on: its Speed is ${feet} feet higher (an ${type} bonus; PF2e's vehicle Speeds are words no rule changes). At the start of its user's next turn, its user attempts a DC ${check[1]} piloting check to keep riding it: on a success the bonus stays another round (add a round to this Effect) and it can try again the round after; on a failure the wave is gone, and so is the bonus (delete this).`;
    return vehicleNote(base, { label: "Tidal boost", text, duration: timeOf(value, unit) }, ["Only while the figurehead's tempest (its Tempest Roar) is round the ship: target the ship."]);
}

const READINGS = [
    {
        names: ["Sea Dragon Figurehead: Tempest Roar"],
        sentences: TEMPEST,
        card: tempestCard
    },
    {
        names: ["Sea Dragon Figurehead: Tidal Boost"],
        sentences: TIDAL,
        card: tidalCard
    },
    {
        names: ["Ice Zuggle Orb"],
        own: true,
        sentences: ZUGGLE,
        card: zuggleCard
    },
    {
        names: ["Lesser", "Moderate", "Greater", "Major"].map((grade) => `Hook Chain (${grade})`),
        sentences: HOOK,
        card: hookCard
    },
    {
        names: ["Terotricus Root Preserve"],
        sentences: PRESERVE,
        card: preserveCard
    },
    {
        names: ["Subliming Aludel"],
        // (Over the one-off's card lines decided before: its zones are built.)
        over: true,
        own: true,
        sentences: ALUDEL,
        card: aludelCard
    },
    {
        names: ["Phlogiston Grease"],
        sentences: GREASE,
        card: greaseCard
    },
    {
        names: ["Tears of Shizuru"],
        over: (plan) => Boolean(plan?.partial && plan.resolution?.kind === "save"),
        sentences: TEARS,
        card: tearsCard
    },
    {
        names: ["Toan Nguyen's Tincture"],
        sentences: TINCTURE,
        card: tinctureCard
    },
    {
        names: ["X-Ray Goggles"],
        sentences: GOGGLES,
        card: gogglesCard
    },
    {
        names: ["Draconic Steak"],
        over: (plan) => Boolean(plan?.partial && plan.resolution?.outcomes?.success),
        sentences: STEAK,
        card: steakCard
    },
    {
        names: ["Expanding Foam (Lesser)", "Expanding Foam (Moderate)", "Expanding Foam (Greater)"],
        read: (_found, plan, context) => foamCard(plan, context)
    },
    {
        names: ["Volatile Vial"],
        own: true,
        sentences: VIAL,
        card: vialCard
    },
    {
        names: ["Boreal Mint (Lesser)", "Boreal Mint (Moderate)", "Boreal Mint (Greater)", "Boreal Mint (Major)"],
        over: true,
        read: (_found, plan, context) => mintSecondary(plan, context)
    },
    {
        // Sky Dragon's Eyes (each grade): fog and mist seen through for its time — the weather's the environment module's (plan.weatherIgnores,
        // src/compiler/weather.js, its Effect from the item card), a spell's or a zone's fog its words on the eater, as Ixamè's Eye's are.
        names: ["Sky Dragon's Eyes (Lesser)", "Sky Dragon's Eyes (Moderate)", "Sky Dragon's Eyes (Greater)"],
        sentences: [/^These\s+pale cheese\b.*\.$/, /^After you\s+eat\b.*\bmist vision\b.*\bfog and mist don[’']t\s+impair\b.*;\s+ignore the\s+concealed condition\b.*\bfor (\d+) (minutes?|hours?)\.$/],
        card: ([, sight], plan) => {
            const row = plan?.resolution?.outcomes?.success;
            if (!plan?.noteOnly || !row) return null;
            const duration = timeOf(sight[1], sight[2]);
            const note = { label: "Mist vision", text: "Fog and mist don't hinder its sight or make creatures Concealed from it — a spell's or a zone's fog too, not only the weather's (its own to ignore).", duration };
            return { keep: true, noteOnly: undefined, partial: undefined, automation: { level: "automatic" }, weatherIgnores: { ignores: ["fog-mist"], duration: { mode: "fixed", value: duration.value, unit: duration.unit, expiry: "turn-start" } }, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...none(), noteEffects: [note] } } } };
        }
    }
];

const forName = (reading, name) => reading.names.includes(name);
// Its sentences as one reading's, each matched in order → the matches, or null.
function matched(reading, sentences) {
    if (sentences.length !== reading.sentences.length) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? found : null;
}

export function withAreasGroup(plan, context) {
    const { name, words, base, info, frequency = null } = context;
    const readings = READINGS.filter((reading) => forName(reading, name) && (typeof reading.over === "function" ? reading.over(plan, context) : reading.over || !plan || plan.noteOnly || plan.builtin === "no-effect"));
    if (!readings.length) return plan;
    const sentences = words ? sentencesOf(words) : [];
    const ownSentences = readings.some((reading) => reading.own) ? sentencesOf(ownWords(context) ?? "") : [];
    for (const reading of readings) {
        const found = reading.read ? true : matched(reading, reading.own ? ownSentences : sentences);
        const card = found ? (reading.read ?? reading.card)(found, plan, context) : null;
        if (!card) continue;
        // (A plan made whole by its own chain, the item's text mended: Boreal Mint (Major)'s.)
        if (card.whole) return card.whole;
        // (Over the plan read before, its own parts kept.)
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

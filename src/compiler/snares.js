// Snares: set in a square, and the first creature to enter it attempts the snare's save (its damage and conditions),
// then the snare is gone. As the ability module's zone builtin, which places the square and acts on entering:
// { builtin: "zone", zone: { area: { type: "square", value: 5 }, centre: "placed", range: 5, saves: [{ when: ["enter"],
// plan }], once: true, … } } — its startZone plays it (asked of its session: once, and a used-up item). Pure.

const ROW_KEYS = ["criticalSuccess", "success", "failure", "criticalFailure"];

export const isSnare = (item) => item?.type === "consumable" && (item.system?.category === "snare" || (item.system?.traits?.value ?? []).includes("snare") || /\bsnare\b/i.test(item.name ?? ""));

// A snare's outright damage, no save: Boom Snare's "The target and all creatures in adjacent squares take @Damage[1d4[persistent,fire]]
// damage". The zone's damage on the creature that enters; the adjacent creatures' a note.
const OUTRIGHT = /\bThe target(?: and all creatures in adjacent squares)? takes? (@Damage\[((?:[^[\]]|\[[^\]]*\])*)\](?:\{[^}]*\})?) damage\./i;
function damageSnare(item) {
    const text = String(item?.system?.description?.value ?? "");
    const outright = OUTRIGHT.exec(text);
    if (!outright || /@Check\[/.test(text)) return null;
    const adjacent = /\band all creatures in adjacent squares\b/i.test(outright[0]);
    return {
        builtin: "zone",
        actions: null,
        zone: {
            area: { type: "square", value: 5 }, centre: "placed", range: 5, lasts: null, untilReused: false, concealed: false, terrain: [], others: false, hazard: null,
            saves: [],
            damage: [{ when: "enter", formulas: [outright[2]] }],
            effect: null,
            modifiers: [],
            notes: ["The first creature to enter the square sets it off; then it's spent.", ...(adjacent ? [`Each creature adjacent to that square takes the same damage (roll it for them by hand).`] : [])],
            once: true
        }
    };
}

// The snare's save as the zone's: the ability compiler's plan, on the creature that enters. (Or its outright damage.)
export function snareZone(item, read) {
    if (isSnare(item) && read?.resolution?.kind !== "save") {
        const damage = damageSnare(item);
        if (damage) return { ...damage, source: read?.source ?? { name: item.name, slug: item.system?.slug ?? null, uuid: item.uuid ?? null, type: item.type } };
    }
    if (!isSnare(item) || read?.resolution?.kind !== "save" || read.resolution.check?.against?.dc !== "fixed") return null;
    if (!ROW_KEYS.some((degree) => read.resolution.outcomes?.[degree])) return null;
    const plan = { ...read, trigger: { event: "zone" }, targeting: { target: "the creature that enters the snare's square", range: null, area: null } };
    return {
        builtin: "zone",
        source: read.source,
        actions: null,
        zone: {
            area: { type: "square", value: 5 },
            centre: "placed",
            range: 5,
            lasts: null,
            untilReused: false,
            concealed: false,
            terrain: [],
            others: false,
            hazard: null,
            saves: [{ when: ["enter"], plan }],
            damage: [],
            effect: null,
            modifiers: [],
            // (Expulsion Snare's "moved into an adjacent square (chosen by you when you craft the snare)": that square its crafter's.)
            notes: ["The first creature to enter the square sets it off; then it's spent.", ...(/\bchosen by you when you craft the snare\b/i.test(String(item.system?.description?.value ?? "")) ? ["Its crafter chose the square it's pushed into: move its token there."] : []), ...leftOnTheGround(item)],
            once: true
        }
    };
}

// What a snare leaves behind, Ice Slick Snare's "to create a slippery patch of ice on the ground": a note, the GM's.
function leftOnTheGround(item) {
    const left = /\bto create (an? [^.]*?) on the ground\b/i.exec(String(item?.system?.description?.value ?? "").replace(/<[^>]+>/g, " "))?.[1];
    return left ? [`It leaves ${left} on the ground (the GM's).`] : [];
}

// A snare whose damage type its crafter chose, Striking Snare's "The creature must attempt a @Check[reflex|…|basic] saving throw.
// If you choose stones, the snare deals @Damage[9d8[bludgeoning]] damage; if you choose spikes, it deals @Damage[9d8[piercing]]
// damage": one text for each choice, its damage with that save, for the item card's ways (src/compiler/ways.js) — its user picks
// one before placing it. → [{ name, html }] or null.
const DAMAGE = String.raw`@Damage\[(?:[^\[\]]|\[[^\]]*\])*\]`;
const CHOSEN = new RegExp(String.raw`\bThe creature must attempt an? (@Check\[[^\]]*\]) saving throw\.\s*If you choose (\w+), the snare deals (${DAMAGE}) damage; if you choose (\w+), it deals (${DAMAGE}) damage\.`, "i");
export function snareChoices(html) {
    const text = String(html ?? "");
    const match = CHOSEN.exec(text);
    if (!match) return null;
    const [, check, first, firstDamage, second, secondDamage] = match;
    const typeOf = (damage) => /\[(\w+)\]\]$/.exec(damage)?.[1] ?? null;
    return [[first, firstDamage], [second, secondDamage]].map(([name, damage]) => ({
        name: `${name.charAt(0).toUpperCase()}${name.slice(1)}${typeOf(damage) ? `: ${typeOf(damage)}` : ""}`,
        html: `${text.slice(0, match.index)}The creature takes ${damage} damage with a ${check} saving throw.${text.slice(match.index + match[0].length)}`
    }));
}

// A snare that leaves an area where it was once set off, doing nothing to the creature itself: the ability module's zone.then (ability
// d6e48fb), the area made at the snare's square. Smoke Screen Snare's "releases a dense cloud of smoke when a creature enters the square
// … All creatures within that area are Concealed … The smoke lasts for 1 minute", its area "the snare's square and all adjacent squares"
// (Lesser) or "a 20-foot burst centered on the snare's square" (Greater); Hampering Snare's 10-foot square of difficult terrain "for 1d4
// rounds after the snare is triggered"; Shadow Cloak Snare's darkness in its square for 1 minute (its lighting a note). → the zone
// builtin, or null.
const minutesOr = (count, unit) => ({ mode: "fixed", value: Number(count), unit: /^round/i.test(unit) ? "rounds" : "minutes", expiry: "turn-start", anchor: "effect-start" });
const SMOKE = /\breleases a dense cloud of smoke when a creature enters the square\b[^.]*\.\s*All creatures within that area are (?:@UUID\[[^\]]*\]\{)?Concealed\}?, and all other creatures are concealed to them\.\s*The smoke lasts for (\d+) (minutes?|rounds?)( or until (?:dispersed|dissipated) by a strong wind)?\./i;
const HAMPERING = /\bThe square with this snare, as well as three adjacent squares \(to form a @Template\[square\|distance:(\d+)\](?:\{[^}]*\})?\), become difficult terrain when the first creature enters the snare's square\.[\s\S]*?\blasts for (?:\[\[\/\w+ (\d+d\d+) #rounds\]\]\{[^}]*\}|(\d+) rounds?) after the snare is triggered\./i;
const DARKNESS = /\bWhen a creature enters the snare's square, it is plunged into an unnatural darkness for (\d+) (minutes?|rounds?)\.\s*/i;
export function snareThen(item, base) {
    if (!isSnare(item)) return null;
    const html = String(item.system?.description?.value ?? "");
    const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    let then = null;
    const smoke = SMOKE.exec(html.replace(/<\/p>\s*<p>/g, " "));
    if (smoke) {
        const burst = /\bThe smoke fills a @Template\[burst\|distance:(\d+)\](?:\{[^}]*\})? centered on the snare's square\b/i.exec(html);
        const adjacent = /\bThe smoke fills the snare's square and all adjacent squares\b/i.test(html);
        if (!burst && !adjacent) return null;
        then = { area: burst ? { type: "burst", value: Number(burst[1]) } : { type: "square", value: 15 }, lasts: minutesOr(smoke[1], smoke[2]), concealed: true, terrain: [], notes: smoke[3] ? ["A strong wind disperses it."] : [] };
    }
    const hampering = !then ? HAMPERING.exec(html) : null;
    if (hampering) {
        const rolled = hampering[2];
        const lasts = rolled ? { ...minutesOr(Math.floor((Number(rolled.split("d")[0]) * (Number(rolled.split("d")[1]) + 1)) / 2), "rounds"), valueRoll: rolled } : minutesOr(hampering[3], "rounds");
        then = { area: { type: "square", value: Number(hampering[1]) }, lasts, concealed: false, terrain: [{ movement: ["walk"], difficulty: 2 }], notes: /\bInteract action to clear the difficult terrain\b/i.test(plain) ? ["An Interact action clears one square of it early."] : [] };
    }
    const darkness = !then ? DARKNESS.exec(plain) : null;
    if (darkness) {
        const rest = plain.slice(darkness.index + darkness[0].length).replace(/\s*\bCraft Requirements\b.*$/s, "").trim();
        then = { area: { type: "square", value: 5 }, lasts: minutesOr(darkness[1], darkness[2]), concealed: false, terrain: [], notes: [`Darkness: ${rest}`.trim()] };
    }
    if (!then) return null;
    return {
        ...base,
        builtin: "zone",
        actions: null,
        zone: { area: { type: "square", value: 5 }, centre: "placed", range: 5, lasts: null, untilReused: false, concealed: false, terrain: [], others: false, hazard: null, saves: [], damage: [], effect: null, modifiers: [], notes: ["The first creature to enter the square sets it off; then it's spent, and its area appears there."], once: true, then }
    };
}

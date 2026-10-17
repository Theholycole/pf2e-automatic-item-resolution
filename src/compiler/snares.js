// Snares: set in a square, and the first creature to enter it attempts the snare's save (its damage and conditions),
// then the snare is gone. As the ability module's zone builtin, which places the square and acts on entering:
// { builtin: "zone", zone: { area: { type: "square", value: 5 }, centre: "placed", range: 5, saves: [{ when: ["enter"],
// plan }], once: true, … } } — its startZone plays it (asked of its session: once, and a used-up item). Pure.

const ROW_KEYS = ["criticalSuccess", "success", "failure", "criticalFailure"];

export const isSnare = (item) => item?.type === "consumable" && (item.system?.category === "snare" || /\bsnare\b/i.test(item.name ?? ""));

// The snare's save as the zone's: the ability compiler's plan, on the creature that enters.
export function snareZone(item, read) {
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

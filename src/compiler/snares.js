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
            notes: ["The first creature to enter the square sets it off; then it's spent.", ...(/\bchosen by you when you craft the snare\b/i.test(String(item.system?.description?.value ?? "")) ? ["Its crafter chose the square it's pushed into: move its token there."] : [])],
            once: true
        }
    };
}

// A burst that hurts whoever starts a turn in it while it lasts, and lights its square (2026-10-26): Spark Wafer's "throw it at a corner of a
// square within 20 feet … The wafer then releases a 10-foot-high column of sparks for 1 round. The sparks shed bright light in a 5-foot burst
// and dim light in the next 5 feet. Any creature that begins their turn in the burst takes 1d4 fire damage (basic Reflex save)". Before, its
// save was rolled at once at the creatures targeted. Now it's the ability module's zone, placed within its range for its time, its save on a
// creature starting its turn inside; zone.light is a Foundry light at the zone's centre for that time (scripts/zones.js). Pure.

const THROWN = /\bthrow it at a corner of a square within (\d+) feet\b/i;
const COLUMN = /\bThe [\w' -]+? then releases an? (\d+)-foot-high column of sparks for (\d+|one|an?) (rounds?|minutes?)\./i;
const LIGHT = /\bThe sparks shed bright light in an? (?:(\d+)-foot burst|@Template\[(?:type:)?burst\|distance:(\d+)\](?:\{[^}]*\})?) and dim light in the next (\d+) feet\./i;
const START = /\bAny creature that begins (?:their|its) turn in the burst takes\b/i;
const COUNT = { one: 1, a: 1, an: 1 };

export function sparkColumnPlan(plan, html) {
    const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const thrown = THROWN.exec(text);
    const column = COLUMN.exec(text);
    const light = LIGHT.exec(text);
    if (!plan || plan.builtin || plan.resolution?.kind !== "save" || !thrown || !column || !light || !START.test(text) || plan.targeting?.area?.type !== "burst") return plan;
    const lasts = { mode: "fixed", value: COUNT[column[2].toLowerCase()] ?? Number(column[2]), unit: column[3].toLowerCase().replace(/s?$/, "s"), expiry: "turn-start", anchor: "effect-start" };
    const bright = Number(light[1] ?? light[2]);
    const save = { ...plan, trigger: { event: "zone" }, targeting: { target: "a creature in the area", range: null, area: null }, automation: { level: "automatic" } };
    for (const key of ["notes", "partial", "item"]) delete save[key];
    const { resolution, targeting, trigger, notes, partial, automation, ...base } = plan;
    return {
        ...base,
        builtin: "zone",
        actions: null,
        automation: { level: "automatic" },
        trigger: { event: "use" },
        targeting: { target: null, range: `${thrown[1]} feet`, area: { type: "burst", value: plan.targeting.area.value } },
        zone: {
            area: { type: "burst", value: plan.targeting.area.value },
            centre: "placed",
            range: Number(thrown[1]),
            lasts,
            untilReused: false,
            concealed: false,
            terrain: [],
            others: false,
            hazard: null,
            saves: [{ when: ["start"], plan: save }],
            damage: [],
            effect: null,
            modifiers: [],
            light: { bright, dim: bright + Number(light[3]) },
            notes: [`A ${column[1]}-foot-high column of sparks.`]
        }
    };
}

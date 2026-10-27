// A light that lures the creatures that begin their turns in it (2026-10-27, docs/needs.md "Changes to a Strike"): Mamlambo Scale's Luminous Lure,
// "The mamlambo scale sheds dim light in a 20-foot emanation. The light has a duration of 1 minute, but you can extinguish the light with an
// Interact action. A creature that begins its turn in the light must attempt a … Will save. Regardless of the save's result, the creature is
// temporarily immune for 1 hour. Effect: Luminous Lure … Failure The creature is Fascinated, and for as long as it remains in the light, it must
// spend at least 1 of its actions on each of its turns to move closer to the source of the light. If the creature ends its movement adjacent to
// you, it is slowed 1 until it is out of the light or until you make a Strike against it. Critical Failure As failure, but the creature is also
// Off-Guard against the first Strike you make against it while it is slowed."
// The ability module's zone on its user's token for the light's minute (PF2e's own Effect: Luminous Lure its user's, the light and aura), the
// save the ability compiler read as each creature's at the start of its turn in it, with its temporary immunity; the failures' compelled walk
// and what follows it a note Effect on the creature for that minute — the user's rule for a creature's compelled behaviour — in place of the
// GM's lines, the critical failure's Off-Guard only against that first Strike (its words, not a standing condition). Pure.

const SHEDS = /\bsheds (?:dim|bright) light in an? (\d+)-foot emanation\. The light has a duration of (\d+) (minutes?|rounds?), but you can extinguish the light with an Interact action\. A creature that begins its turn in the light must attempt\b/i;
const FAILED = /^\{target\} \(failure, the rest by hand\): The creature is Fascinated, and for as long as it remains in the light, it must spend at least 1 of its actions on each of its turns to move closer to the source of the light\. If the creature ends its movement adjacent to you, it is slowed 1 until it is out of the light or until you make a Strike against it\.$/i;
const WORSE = /^\{target\} \(critical failure, the rest by hand\): As failure, but the creature is also Off-Guard against the first Strike you make against it while it is slowed\.(?: \(failure: .*\))?$/i;
const LINK = /@UUID\[(Compendium\.pf2e\.equipment-effects\.Item\.[A-Za-z0-9]+)\]\{(Effect: [^}]+)\}/;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const plain = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// The save plan the ability compiler read and the activation's html → the zone plan, or the same plan.
export function withLureLight(plan, html) {
    const sheds = SHEDS.exec(plain(html));
    const outcomes = plan?.resolution?.kind === "save" ? plan.resolution.outcomes : null;
    const failed = outcomes ? (outcomes.failure?.manualInstructions ?? []).find((entry) => FAILED.test(said(entry))) : null;
    const worse = outcomes ? (outcomes.criticalFailure?.manualInstructions ?? []).find((entry) => WORSE.test(said(entry))) : null;
    if (!sheds || !failed || !worse || plan.builtin) return plan;
    const lasts = { mode: "fixed", value: Number(sheds[2]), unit: /^min/i.test(sheds[3]) ? "minutes" : "rounds", expiry: "turn-start", anchor: "effect-start" };
    const lure = { label: "Lured by the light", text: "While it stays in the light, it must spend at least 1 of its actions each turn moving closer to the light's source. If it ends its movement adjacent to the light's wearer, it's Slowed 1 until it's out of the light or the wearer makes a Strike against it.", duration: lasts };
    const exposed = { label: "Lured: Off-Guard", text: "It's Off-Guard against the first Strike the light's wearer makes against it while it's slowed.", duration: lasts };
    const row = (entry, notes) => {
        const { manualInstructions, ...rest } = entry;
        const effects = (rest.effects ?? []).filter((effect) => effect.slug !== "off-guard").map((effect) => (effect.slug === "fascinated" && !effect.duration ? { ...effect, duration: lasts } : effect));
        return { ...rest, effects, noteEffects: [...(rest.noteEffects ?? []), ...notes] };
    };
    const save = {
        ...plan,
        trigger: { event: "zone", ...(plan.trigger?.immunity ? { immunity: plan.trigger.immunity } : {}) },
        targeting: { target: "a creature in the area", range: null, area: null },
        resolution: { ...plan.resolution, outcomes: { ...outcomes, failure: row(outcomes.failure, [lure]), criticalFailure: row(outcomes.criticalFailure, [lure, exposed]) } }
    };
    delete save.partial;
    delete save.item;
    const link = LINK.exec(String(html ?? ""));
    const zone = { area: { type: "emanation", value: Number(sheds[1]) }, centre: "self", range: null, lasts, untilReused: false, concealed: false, terrain: [], others: false, hazard: null, saves: [{ when: ["start"], plan: save }], damage: [], effect: null, modifiers: [], notes: ["Its wearer can put the light out with an Interact action (end the zone and its Effect)."] };
    const { partial: _partial, resolution: _resolution, ...rest } = plan;
    return { ...rest, builtin: "zone", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use", ...(plan.trigger?.frequency ? { frequency: plan.trigger.frequency } : {}) }, actions: null, zone, ...(link ? { ownEffect: { uuid: link[1], label: link[2] } } : {}) };
}

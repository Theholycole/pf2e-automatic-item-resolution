// A condition its user avoids gaining (2026-10-27): Immortal Bastion's "Trigger You would gain or increase the Doomed or Wounded condition
// Effect You avoid gaining or increasing the condition", Urn of Ashes' Doom the Urn ("Trigger You would become Doomed, or your doomed value
// would increase … Effect The ashes in the urn intervene, taking the doomed condition in your place, and you don't gain or increase the value
// of your doomed condition"). A readied Effect on its user, ruleEffects { prevents }: the next of those conditions it would gain or increase
// within the round, it doesn't — scripts/prevent-condition.js cancels PF2e's creating or raising it, and the Effect is used up. Immortal
// Bastion's "choose only one" is the first of them to come; its "doesn't remove … nor does it prevent … later" is once only, as played. The
// urn's own doom, which keeps it from being used until a night's rest lowers it, is a line of the card (out of combat). Pure.

const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const BASTION = /\bTrigger You would gain or increase the (Doomed|Wounded) or (Doomed|Wounded) condition Effect You avoid gaining or increasing the condition\.(?: If the triggering effect imposes both doomed and wounded, choose only one to prevent\.)?(?: This doesn't remove either of the conditions if you already have them, nor does it prevent the same triggering effect from giving or increasing the prevented condition later\.)?\s*$/i;
const URN = /\bTrigger You would become Doomed, or your doomed value would increase Requirements The ashes aren't doomed Effect The ashes in the urn intervene, taking the doomed condition in your place, and you don't gain or increase the value of your doomed condition\./i;
const ROUND = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "effect-start" };
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

export const PREVENTS = "prevents conditions";

// The activation's html and the plan's base → the plan, or null.
export function preventConditionPlan(html, base) {
    const plain = plainOf(html).replace(/\s*\bCraft Requirements\b.*$/s, "").trim();
    const bastion = BASTION.exec(plain);
    const urn = !bastion ? URN.exec(plain) : null;
    if (!bastion && !urn) return null;
    const prevents = bastion ? [...new Set([bastion[1], bastion[2]].map((slug) => slug.toLowerCase()))] : ["doomed"];
    const words = `The next ${prevents.map((slug) => slug.charAt(0).toUpperCase() + slug.slice(1)).join(" or ")} it would gain or increase this round, it doesn't (once)`;
    return {
        ...base,
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use", ...(base?.trigger?.frequency ? { frequency: base.trigger.frequency } : {}) },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
        ruleEffects: [{ name: PREVENTS, words, rules: [], duration: ROUND, prevents }],
        ...(urn ? { notes: ["The urn's ashes are now doomed in its place: it can't be used so again until a night's rest lowers the urn's doom instead of its user's (the GM's, out of combat)."], partial: true } : {})
    };
}

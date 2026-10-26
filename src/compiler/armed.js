// An item that waits on its wearer for a kind of damage (2026-10-26): Flame Layer Balm's "The balm remains on the armor for 1 hour, and the
// first time during that time that the wearer takes fire damage, the balm bursts into flame and the wearer gains the effects of the Fiery Body
// spell for 1 minute". Before, the item card gave the spell's Effect at once. plan.item.armed { lasts, damageType, applications }: the card
// marks the wearer for that time, and the first damage of that type it takes (the core's applyDamage listener, scripts/armed.js) gives it
// the applications — PF2e's Spell Effect: Fiery Body for its minute —, the mark used up. Pure.

const ARMED = /^The [\w' -]+? remains on the armor for (\d+|one|an?) (hours?|minutes?), and the first time during that time that the wearer takes (\w+) damage, the [\w' -]+? bursts into flame and the wearer gains the effects of the [\w' -]+? spell for (\d+|one|an?) (minutes?|rounds?)\.$/i;
const COUNT = { one: 1, a: 1, an: 1 };
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });

export function withArmed(plan) {
    const applications = plan?.resolution?.kind === "effect" ? plan.resolution.applications ?? [] : [];
    const found = (plan?.notes ?? []).map((note) => [note, ARMED.exec(said(note))]).find(([, match]) => match);
    if (!found || applications.length !== 1 || applications[0].kind !== "native-spell-effect") return plan;
    const [note, match] = found;
    const unit = (words) => words.toLowerCase().replace(/s?$/, "s");
    const lasts = { mode: "fixed", value: COUNT[match[1].toLowerCase()] ?? Number(match[1]), unit: unit(match[2]), expiry: "turn-start", anchor: "effect-start" };
    const duration = { value: COUNT[match[4].toLowerCase()] ?? Number(match[4]), unit: unit(match[5]) };
    const notes = plan.notes.filter((entry) => entry !== note);
    return {
        ...plan,
        notes: notes.length ? notes : undefined,
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
        item: { ...(plan.item ?? {}), armed: { lasts, damageType: match[3].toLowerCase(), applications: [{ ...applications[0], duration }] } }
    };
}

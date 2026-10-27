// A swarm a creature shoos onto its ally (2026-10-27, docs/needs.md "afflictions"): Wasp Guard's "The swarm flies to the triggering enemy's space
// and swarms about them, dealing 1d8 persistent poison damage. If the affected enemy has any allies within 30 feet, the enemy can spend a single
// action, which has the manipulate trait, to shoo the swarm away. This ends the persistent damage on that enemy automatically, but the swarm
// instead moves to affect the enemy's ally." The persistent damage is the card's; what the enemy can do about it, its own action, is a note
// Effect on it for as long as that persistent poison lasts (the ability module's whilePersistent) — a behaviour rule beside the damage (the
// user's ruling of 2026-10-26). Pure.

const SHOO = /^If the affected enemy has any allies within (\d+) feet, the enemy can spend a single action, which has the manipulate trait, to shoo the swarm away\.$/;
const MOVES = /^This ends the persistent damage on that enemy automatically, but the swarm instead moves to affect the enemy's ally\.$/;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim().replace(/^\{target\}(?: \([^)]*\))?:\s*/, "");

// The plan (its persistent damage read) → the plan with its note Effect, or the same plan.
export function withShooedSwarm(plan) {
    const notes = plan?.notes ?? [];
    const shoo = notes.map((entry) => SHOO.exec(said(entry))).find(Boolean);
    const row = plan?.resolution?.outcomes?.success;
    const persistent = (plan?.resolution?.sharedDamage?.components ?? []).find((component) => component.category === "persistent");
    if (!shoo || notes.length !== 2 || !notes.some((entry) => MOVES.test(said(entry))) || !row || !persistent || (plan.unread ?? []).length) return plan;
    const ours = (line) => SHOO.test(said(line)) || MOVES.test(said(line));
    const note = { label: "Swarm of wasps", text: `With an ally within ${shoo[1]} feet, it can shoo the swarm away (1 action, manipulate): this persistent ${persistent.type} damage ends, and the swarm moves on to that ally, who takes ${persistent.formula} persistent ${persistent.type} damage instead.`, whilePersistent: persistent.type };
    const outcomes = Object.fromEntries(Object.entries(plan.resolution.outcomes).map(([degree, one]) => {
        if (!one?.manualInstructions) return [degree, one];
        const { manualInstructions, ...kept } = one;
        const left = manualInstructions.filter((line) => !ours(line));
        return [degree, { ...kept, ...(left.length ? { manualInstructions: left } : {}) }];
    }));
    const left = Object.values(outcomes).some((one) => (one?.manualInstructions ?? []).length);
    const { notes: _notes, ...rest } = plan;
    return {
        ...rest,
        resolution: { ...plan.resolution, outcomes: { ...outcomes, success: { ...outcomes.success, noteEffects: [...(outcomes.success.noteEffects ?? []), note] } } },
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}

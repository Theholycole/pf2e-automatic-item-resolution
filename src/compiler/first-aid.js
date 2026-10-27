// More from a successful Administer First Aid (2026-10-27, docs/needs.md "dying"): Crying Angel Pendant's "attempt to Administer First Aid using
// Medicine with a +1 item bonus to the check. If you succeed, and you were trying to stabilize, the target regains 1 Hit Point, losing the dying
// condition and becoming conscious as normal. If you succeed, and you were trying to stop bleeding, the bleeding ends." PF2e's own action is the
// card's already (scripts/item-actions.js, its variant by the target's state); on a success its rule after it, action.onSuccess by variant:
// stabilize, 1 Hit Point healed while it's still dying (the core's end of Dying, which wakes it); stop bleeding, its persistent bleed ended
// outright. Its "after" card line gone. Pure.

const MORE = /^If you succeed, and you were trying to stabilize, the target regains (\d+) Hit Points?, losing the dying condition and becoming conscious as normal\. If you succeed, and you were trying to stop bleeding, the bleeding ends\.$/i;

// The plan (an item action's) → the plan with what its success does more, or the same plan.
export function withFirstAidMore(plan) {
    const action = plan?.action;
    const found = plan?.builtin === "item-action" && action?.slug === "administer-first-aid" ? MORE.exec(String(action.after ?? "").trim()) : null;
    if (!found) return plan;
    const { after: _after, ...rest } = action;
    const left = (plan.notes ?? []).length || (plan.unread ?? []).length;
    return { ...plan, action: { ...rest, onSuccess: { stabilize: { hp: Number(found[1]) }, "stop-bleeding": { ends: ["bleed"] } } }, ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}

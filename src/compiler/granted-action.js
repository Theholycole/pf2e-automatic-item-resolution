// A PF2e action its user has while the item's effect lasts (2026-10-27, docs/needs.md "Changes to a Strike"): Potion of Grounding's "Drinking
// this potion turns you into a living lightning rod for 1 minute, drawing nearby electricity to strike you instead of allies. You gain the
// @UUID[Compendium.pf2e.actionspf2e.Item.s2RrhZx1f1X4YnYV]{Divert Lightning} reaction while the effect lasts." Its note Effect for that minute
// grants PF2e's own action (GrantItem: on its user's sheet while the Effect is, gone with it); using it is its user's own reaction. Pure.

const GRANTED = /\bYou gain the @UUID\[(Compendium\.pf2e\.actionspf2e\.Item\.[A-Za-z0-9]+)\]\{([^}]+)\} (?:reaction|action|activity) while the effect lasts\b/i;

// The plan and its item's html → the plan whose note Effect grants that action, or the same plan.
export function withGrantedAction(plan, html) {
    const granted = GRANTED.exec(String(html ?? ""));
    const row = plan?.resolution?.outcomes?.success;
    const notes = row?.noteEffects ?? [];
    if (!granted || notes.length !== 1 || !notes[0].duration || (plan.unread ?? []).length || (plan.notes ?? []).length || (row.manualInstructions ?? []).length) return plan;
    const note = { ...notes[0], label: `${plan.source?.name ?? "Item"}: ${granted[2]}`, rules: [...(notes[0].rules ?? []), { key: "GrantItem", uuid: granted[1], allowDuplicate: false }] };
    delete note.reminder;
    const { noteOnly, ...rest } = plan;
    return { ...rest, automation: { ...(plan.automation ?? {}), level: "automatic" }, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, noteEffects: [note] } } } };
}

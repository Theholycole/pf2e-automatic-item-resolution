// A ward against summoned creatures' movement and Strikes (2026-10-27, docs/needs.md "Changes to a Strike"): Portable Seal's "The design covers
// a 5-foot burst when unfolded and must be unfolded into an area free of major obstructions such as rocks or hostile creatures. When a creature
// with the summoned trait attempts to enter the seal's area or make a melee Strike against a creature in that area, the summoned creature must
// attempt a … Will save. Success The action occurs normally, and the creature is immune to the effects of this portable seal this round. Failure
// The movement or Strike is disrupted, but the creature is immune to further effects of the portable seal this round. Critical Failure The
// movement or Strike is disrupted."
// The ability module's zone, placed where it's unfolded (a 5-foot burst, there until removed): the save at each summoned creature entering it
// (zone.saves only { traits: ["summoned"] }), a disrupted move a note Effect on it for that turn (PF2e can't undo an action: it's spent, to no
// effect), the success's and failure's immunity for the round the module's temporary-immunity tracker (trigger.immunity). A summoned creature's
// melee Strike at a creature in it: the same save card on the attacker (the ability module's when "strike-into", 2026-10-28, its only read
// for the attacker). Pure.

const SEAL = /\bWhen a creature with the summoned trait attempts to enter the seal's area or make a melee Strike against a creature in that area, the summoned creature must attempt\b/i;
const PLACED = /\bThe design covers an? @Template\[(?:type:)?burst\|distance:(\d+)\][^.]*? when unfolded and must be unfolded into an area free of major obstructions such as rocks or hostile creatures\./i;
const ROWS = {
    success: /^\{target\} \(success\): The action occurs normally, and the creature is immune to the effects of this [\w' -]+? this round\.$/i,
    failure: /^\{target\} \(failure\): The movement or Strike is disrupted, but the creature is immune to further effects of the [\w' -]+? this round\.$/i,
    criticalFailure: /^\{target\} \(critical failure\): The movement or Strike is disrupted\.$/i
};
const THIS_TURN = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "target-turn" };
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan and the item's html → the plan with those rows, or the same plan.
export function withWardingSeal(plan, html) {
    const text = String(html ?? "");
    const placed = PLACED.exec(text);
    const outcomes = plan?.resolution?.kind === "save" ? plan.resolution.outcomes : null;
    if (!SEAL.test(text.replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")) || !placed || !outcomes) return plan;
    const lines = Object.fromEntries(Object.entries(ROWS).map(([degree, pattern]) => [degree, (outcomes[degree]?.manualInstructions ?? []).find((entry) => pattern.test(said(entry)))]));
    if (Object.values(lines).some((line) => !line)) return plan;
    const disrupted = { label: "Disrupted", text: "Its movement or Strike is disrupted: the action is spent, to no effect.", duration: THIS_TURN };
    const rows = { ...outcomes };
    for (const degree of Object.keys(ROWS)) {
        const { manualInstructions, ...rest } = outcomes[degree];
        const kept = manualInstructions.filter((entry) => entry !== lines[degree]);
        rows[degree] = { ...rest, ...(kept.length ? { manualInstructions: kept } : {}), ...(degree === "success" ? {} : { noteEffects: [...(rest.noteEffects ?? []), disrupted] }) };
    }
    const slug = String(plan.source?.slug ?? plan.source?.name ?? "seal").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const immunity = { scope: "target", raw: "the creature is immune to the effects of this portable seal this round", duration: { value: 1, unit: "rounds" }, degrees: ["criticalSuccess", "success", "failure"], against: "all", slug };
    const save = { ...plan, trigger: { event: "zone", immunity }, targeting: { target: "a summoned creature entering it or making a melee Strike into it", range: null, area: null }, resolution: { ...plan.resolution, outcomes: rows } };
    delete save.partial;
    delete save.item;
    delete save.notes;
    const zone = { area: { type: "burst", value: Number(placed[1]) }, centre: "placed", range: Number(placed[1]), lasts: null, untilReused: false, concealed: false, terrain: [], others: false, hazard: null, saves: [{ when: ["enter", "strike-into"], only: { traits: ["summoned"] }, plan: save }], damage: [], effect: null, modifiers: [], notes: [`Unfold it into an area free of major obstructions such as rocks or hostile creatures; it stays until it's removed.`] };
    const { resolution: _resolution, notes: _notes, partial: _partial, ...rest } = plan;
    return { ...rest, builtin: "zone", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, actions: null, zone };
}

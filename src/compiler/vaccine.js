// A vaccine's immunity to the strain it was made for (2026-10-27, docs/needs.md "afflictions"): Vaccine's "A vaccine grants a creature
// immunity to a specific strain of disease of a level equal to or less than the vaccine's level, and a +2 item bonus on all saving throws
// against other strains of the same disease." Its +2 to saves against diseases for its duration is the item card's already (the user's
// answer 12 of 2026-10-17: against every disease, the strain a note); the strain's immunity, which no PF2e rule can aim at one strain, is the
// note Effect beside it for the same time, in place of the whole text's reminder. The example sentence says nothing more. Pure.

const STRAIN = /^Its immunity to the one strain of disease it was made for \(of a level equal to or less than the vaccine's level\) is the GM's, and the bonus is only against other strains of that disease\.$/;
const EXAMPLE = /^For example, a vaccine could grant immunity to [\w ]+? inflicted by [\w ]+?, but would only grant a \+\d+ saving throw bonus against [\w ]+? inflicted by [\w ]+?\.$/;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan → the plan with the strain's note Effect, or the same plan.
export function withVaccineStrain(plan) {
    const unread = plan?.unread ?? [];
    const row = plan?.resolution?.outcomes?.success;
    if (!unread.some((entry) => STRAIN.test(said(entry))) || !unread.every((entry) => STRAIN.test(said(entry)) || EXAMPLE.test(said(entry))) || !row?.modifiers?.length) return plan;
    const note = { label: "Vaccinated", text: "Immune to the one strain of disease it was made for, of the vaccine's level or lower (the GM's to say which). Strictly, its +2 is only against that disease's other strains.", duration: row.modifiers[0].duration ?? null };
    const { unread: _unread, ...rest } = plan;
    const left = (plan.notes ?? []).length || Object.values(plan.resolution.outcomes).some((one) => (one?.manualInstructions ?? []).length);
    return {
        ...rest,
        resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, noteEffects: [...(row.noteEffects ?? []).filter((entry) => !entry.reminder), note] } } },
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}

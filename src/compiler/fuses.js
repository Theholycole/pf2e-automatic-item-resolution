// A cursed item that fuses to its user once used and changes for good (2026-10-27, docs/needs.md): Sluggish Bracelet's "Effect You take a
// -10-foot penalty to your Speed for 1 minute, and the bracelet fuses to you. Thereafter, it grants you no bonus to Acrobatics checks, and it
// imposes a -5-foot status penalty to your Speed." → plan.item.becomes { removes: [rule], adds: [rule], words }: once its card has applied
// (scripts/becomes.js), the item's own PF2e rules lose its Acrobatics bonus and gain that Speed penalty, and it's marked fused. Its reminder
// note gone when nothing else is left. Pure.

const FUSED = /^Thereafter, it grants you no bonus to (\w+) checks, and it imposes an? [–-](\d+)-foot (status|circumstance|item) penalty to your Speed\.$/i;
const FUSES = /\bthe [\w' -]+? fuses to you\b/i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan and its activation's text (plain) → the plan with item.becomes, or the same plan.
export function withFuses(plan, text) {
    const line = (plan?.unread ?? []).map((entry) => [entry, FUSED.exec(said(entry))]).find(([, match]) => match);
    if (!line || !FUSES.test(String(text ?? ""))) return plan;
    const [, skill, feet, type] = line[1];
    const becomes = {
        removes: [{ key: "FlatModifier", selector: skill.toLowerCase() }],
        adds: [{ key: "FlatModifier", selector: "land-speed", type: type.toLowerCase(), value: -Number(feet) }],
        words: `Fused to its wearer: no bonus to ${skill} checks, and a –${feet}-foot ${type.toLowerCase()} penalty to its Speed (removing the curse ends it)`
    };
    const unread = plan.unread.filter((entry) => entry !== line[0]);
    // (Its reminder of the whole text, the rest now read.)
    const outcomes = unread.length ? plan.resolution?.outcomes : Object.fromEntries(Object.entries(plan.resolution?.outcomes ?? {}).map(([degree, row]) => [degree, row?.noteEffects ? { ...row, noteEffects: row.noteEffects.filter((note) => !note.reminder) } : row]));
    const left = unread.length || (plan.notes ?? []).length || Object.values(outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length);
    const { unread: _, ...rest } = plan;
    return {
        ...rest,
        ...(unread.length ? { unread } : {}),
        ...(outcomes ? { resolution: { ...plan.resolution, outcomes } } : {}),
        item: { ...(plan.item ?? {}), becomes },
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}

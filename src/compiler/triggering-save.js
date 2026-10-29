// A talisman's better degree on the save that triggered it (2026-10-28, docs/needs.md "triggers"): Black Pearl of Mewru's status bonus to
// saves against curses for a minute (src/compiler/item-data.js reads it; the item card's Effect) and, on the triggering save, a failure a
// success and a critical failure a failure — the line item-data.js left "by hand". → plan.alsoReadied: the fortune card beside the item card
// (scripts/live.js), its readied Effect for that save — PF2e's AdjustDegreeOfSuccess and the same bonus, both predicated on the save's trait,
// kept until a save of that trait spends it (scripts/fortune.js). Pure.

const LINE = "The save that triggered it is also one degree better if it fails, by hand.";
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

export function withTriggeringSave(plan, { kind }) {
    if (kind !== "consumable" || !plan?.partial || plan.alsoReadied || !(plan.unread ?? []).map(said).includes(LINE) || (plan.notes ?? []).length) return plan;
    const row = plan.resolution?.outcomes?.success;
    const saves = (row?.modifiers ?? []).filter((modifier) => modifier.selector === "saving-throw" && (modifier.predicate ?? []).length);
    if (plan.resolution?.check?.roll !== "automatic" || saves.length !== 1) return plan;
    const [save] = saves;
    const trait = /^item:trait:(\w+)$/.exec(save.predicate[0])?.[1] ?? null;
    const unread = plan.unread.filter((line) => said(line) !== LINE);
    const readied = {
        builtin: "readied-bonus",
        automation: { level: "automatic" },
        targeting: { target: "the user", range: null, area: null },
        trigger: { event: "use" },
        bonus: {
            words: "For the save that triggered it",
            modifiers: [{ selector: "saving-throw", type: save.type, value: save.value, predicate: save.predicate }],
            resistance: null,
            degree: { selector: "saving-throw", adjustment: { failure: "to-success", criticalFailure: "to-failure" }, predicate: save.predicate },
            duration: null,
            spend: ["saving-throw"],
            lasting: true
        },
        notes: [`Press Apply before the save${trait ? ` against the ${trait}` : ""} is rolled: a failure becomes a success and a critical failure a failure.`]
    };
    // (The item card's note Effect without the line.)
    const outcomes = { ...plan.resolution.outcomes, success: { ...row, noteEffects: (row.noteEffects ?? []).map((note) => (note.reminder && said(note).includes(LINE) ? { ...note, text: said(note).replace(` ${LINE}`, "").replace(LINE, "").trim() } : note)) } };
    const next = { ...plan, resolution: { ...plan.resolution, outcomes }, unread: unread.length ? unread : undefined, alsoReadied: readied };
    if (!unread.length) {
        delete next.partial;
        next.automation = { ...(plan.automation ?? {}), level: "automatic" };
    }
    return next;
}

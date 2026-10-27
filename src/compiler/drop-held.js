// What a creature drops of what it holds, on a row of a save (2026-10-27, docs/needs.md): Deadweight Snare's critical failure, "As failure, but
// the creature drops any metallic items it's holding". → plan.dropHeld { degrees, metallic, said }: once the ability module's card has applied
// (its "applied" hook), the drop card lists each creature of those degrees with what it holds — the metal ones ticked by their material and
// kind, the GM's to change — and drops the ticked ones (scripts/drop-held.js). The row's note gone. Pure.

const DROPS = /^(?:\{target\}(?: \([^)]*\))?:\s*)?The creature drops any (metallic )?items it's holding\.(?: The GM handles it\.)?$/i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// One plan's rows → { plan, drop } with its rows' drop lines gone, or null.
function dropsIn(plan) {
    const outcomes = plan?.resolution?.outcomes;
    if (!outcomes) return null;
    const degrees = [];
    let found = null;
    const rows = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => {
        if (!row) return [degree, row];
        const notes = (row.noteEffects ?? []).filter((entry) => !DROPS.test(said(entry)));
        const lines = (row.manualInstructions ?? []).filter((entry) => !DROPS.test(said(entry)));
        const hit = [...(row.noteEffects ?? []), ...(row.manualInstructions ?? [])].find((entry) => DROPS.test(said(entry)));
        if (!hit) return [degree, row];
        degrees.push(degree);
        found = DROPS.exec(said(hit));
        const { noteEffects, manualInstructions, ...rest } = row;
        return [degree, { ...rest, ...(notes.length ? { noteEffects: notes } : {}), ...(lines.length ? { manualInstructions: lines } : {}) }];
    }));
    if (!degrees.length) return null;
    return { plan: { ...plan, resolution: { ...plan.resolution, outcomes: rows }, dropHeld: { degrees, metallic: Boolean(found[1]), said: found[0] } } };
}

// What a plan still leaves the GM: its unread sentences, its rows' lines, the note Effects that are the GM's work.
const GM_WORK = /\bThe GM handles it\b|\bthe GM sets it\b|\(by hand\)/;
const leftIn = (plan) => [...(plan?.unread ?? []), ...Object.values(plan?.resolution?.outcomes ?? {}).flatMap((row) => [...(row?.manualInstructions ?? []), ...(row?.noteEffects ?? []).filter((entry) => GM_WORK.test(said(entry)))])];
const settled = (plan, others = []) => (plan.partial && !leftIn(plan).length && !others.some((one) => leftIn(one).length) ? (({ partial, ...rest }) => ({ ...rest, automation: { ...(rest.automation ?? {}), level: "automatic" } }))(plan) : plan);

// The plan (a zone's saves and burst, or its own rows) → the plan with dropHeld where a row says so, or the same plan. Run once its rows are
// whole (src/compiler/index.js, near the end): the row's line is only a note Effect by then.
export function withDropHeld(plan) {
    if (plan?.builtin === "zone" && plan.zone) {
        let changed = false;
        const saves = (plan.zone.saves ?? []).map((save) => {
            const read = dropsIn(save.plan);
            if (!read) return save;
            changed = true;
            return { ...save, plan: settled(read.plan) };
        });
        const burst = plan.zone.burst?.plan ? dropsIn(plan.zone.burst.plan) : null;
        if (!changed && !burst) return plan;
        const zone = { ...plan.zone, saves, ...(burst ? { burst: { ...plan.zone.burst, plan: settled(burst.plan) } } : {}) };
        return settled({ ...plan, zone }, [...saves.map((save) => save.plan), ...(zone.burst?.plan ? [zone.burst.plan] : [])]);
    }
    const read = dropsIn(plan);
    return read ? settled(read.plan) : plan;
}

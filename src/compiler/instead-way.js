// A worse condition when something the card can't see happened (2026-10-26): Imposing Shield's Terrifying Block, "The creature that made the
// attack that triggered your Shield Block becomes Frightened 2. If the Shield Block reduced the incoming damage to 0, the creature instead
// becomes Frightened 3." Whether the block took all the damage is the table's to say, so the card asks: the ways card's two buttons, "As it
// is" and that case, its row's condition at the other value (the user's 2026-10-11 ruling, choices as buttons). Pure.

const INSTEAD = /^If ([^,]+), (?:the creature|it|the target) instead becomes ([A-Z][a-z-]+) (\d+)\.$/;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const playable = (plan) => Boolean(plan?.resolution?.outcomes) && !plan.noteOnly && !plan.builtin;

export function withInsteadWay(plan, text, html = "") {
    if (!playable(plan)) return plan;
    const sentence = String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((one) => one.trim()).find((one) => INSTEAD.test(one));
    if (!sentence) return plan;
    const [, when, condition, value] = INSTEAD.exec(sentence);
    const slug = condition.toLowerCase();
    const rows = Object.entries(plan.resolution.outcomes).filter(([, row]) => (row?.effects ?? []).some((effect) => effect?.kind === "condition" && effect.slug === slug && Number(effect.value) !== Number(value)));
    if (!rows.length) return plan;
    const gone = (entry) => said(entry).replace(/^\{target\}:\s*/, "").replace(/\s*\(by hand\)\.?$/, "").replace(/\.$/, "") === sentence.replace(/\.$/, "");
    const clean = (given, worse) => {
        const outcomes = Object.fromEntries(Object.entries(given.resolution.outcomes).map(([degree, row]) => [degree, row ? { ...row, ...(row.manualInstructions ? { manualInstructions: row.manualInstructions.filter((line) => !gone(line)) } : {}), effects: (row.effects ?? []).map((effect) => (worse && effect?.kind === "condition" && effect.slug === slug ? { ...effect, value: Number(value) } : effect)) } : row]));
        for (const row of Object.values(outcomes)) if (row?.manualInstructions && !row.manualInstructions.length) delete row.manualInstructions;
        const notes = (given.notes ?? []).filter((note) => !gone(note));
        const next = { ...given, notes: notes.length ? notes : undefined, resolution: { ...given.resolution, outcomes } };
        const left = [...notes, ...(given.unread ?? []), ...Object.values(outcomes).flatMap((row) => row?.manualInstructions ?? [])];
        if (next.partial && !left.length) {
            delete next.partial;
            next.automation = { ...(next.automation ?? {}), level: "automatic" };
        }
        return next;
    };
    const base = clean(plan, false);
    const worse = clean(plan, true);
    const { resolution, ...rest } = plan;
    return {
        ...rest,
        notes: undefined,
        unread: undefined,
        builtin: "ways",
        automation: { level: base.partial || worse.partial ? "guided" : "automatic" },
        ...(base.partial || worse.partial ? { partial: true } : { partial: undefined }),
        trigger: { ...(plan.trigger ?? {}) },
        ways: [{ name: "As it is", html: String(html ?? ""), plan: base }, { name: `${when.charAt(0).toUpperCase()}${when.slice(1)}`, html: String(html ?? ""), plan: worse }],
        once: true
    };
}

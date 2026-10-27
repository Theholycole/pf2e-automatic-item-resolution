// Rules PF2e can't play beside the bonus a row gives, as words on a note Effect for the bonus's time (2026-10-27, docs/needs.md; the user's
// note-Effect rule): Infiltrator's Elixir's "You gain a +4 status bonus to your Deception DC to avoid others seeing through your disguise, and
// you add your level to this DC even if untrained" (src/compiler/item-data.js words its tail "The bonus is only to avoid others seeing through
// your disguise, …") — PF2e's DC has no option for what it's against, nor a rule for its level when untrained —, and Look-Me-Not's "If you're
// untrained in Deception, you can use the Feint action anyway and add your level as your proficiency bonus despite being untrained.
// Additionally, your Strikes and damage from the affixed weapon can't trigger reactions (such as the Shield Block reaction)." Its sentences no
// longer unread; the whole text's reminder gives way to the note (src/compiler/honest.js). The disguise's look, its maker's and the GM's, in
// its words. Pure.

const READINGS = [
    {
        sentences: [/^The bonus is only to avoid others seeing through your disguise, and you add your level to this DC even if untrained\.$/i],
        // (Its look and the Impersonate it sets up, from the text before.)
        needs: /\bWhen imbibed, you take the shape of a humanoid creature of your size, but different enough so you might be unrecognizable\..*\bDrinking this elixir counts as setting up a disguise to Impersonate\./is,
        label: "Disguised",
        words: "It has taken the shape of an unrecognizable humanoid of its size (the look its elixir's maker chose, never a specific person; a non-humanoid may take a form nearer its own, as the GM decides): a disguise set up to Impersonate. The +4 status bonus is to its Deception DC only against others seeing through that disguise, and its level counts toward that DC even if it's untrained."
    },
    {
        sentences: [/^If you're untrained in Deception, you can use the Feint action anyway and add your level as your proficiency bonus despite being untrained\.$/i, /^Additionally, your Strikes and damage from the affixed weapon can't trigger reactions \(such as the Shield Block reaction\)\.$/i],
        needs: /\byour weapon becomes difficult to look at\b/i,
        label: "Hard to look at",
        words: "Its affixed weapon is hard to look at. Untrained in Deception, it can still Feint, adding its level as its proficiency bonus. Its Strikes and damage with that weapon can't trigger reactions (Shield Block among them)."
    }
];
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// The plan and its item's plain text → the plan with that note Effect on its own row, or the same plan.
export function withRuleWords(plan, text) {
    const row = plan?.resolution?.check?.roll === "automatic" ? plan.resolution.outcomes?.success : null;
    const time = row?.modifiers?.[0]?.duration;
    if (!row || !time || !(plan.unread ?? []).length) return plan;
    const reading = READINGS.find((entry) => entry.needs.test(String(text ?? "")) && entry.sentences.every((pattern) => plan.unread.some((sentence) => pattern.test(said(sentence)))));
    if (!reading) return plan;
    const unread = plan.unread.filter((sentence) => !reading.sentences.some((pattern) => pattern.test(said(sentence))));
    const note = { label: reading.label, text: reading.words, duration: time };
    const next = { ...plan, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, noteEffects: [...(row.noteEffects ?? []).filter((entry) => !entry?.reminder), note] } } }, ...(unread.length ? { unread } : { unread: undefined }) };
    if (!unread.length && !(plan.notes ?? []).length) {
        delete next.partial;
        next.automation = { ...(plan.automation ?? {}), level: "automatic" };
    }
    return next;
}

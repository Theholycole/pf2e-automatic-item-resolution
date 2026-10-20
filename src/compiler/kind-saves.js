// A save harder for some creatures, or not for them at all (2026-10-20): Lamentation of the Faithless's "Creatures with the unholy trait are
// immune to this effect, but creatures with the holy trait take a -2 status penalty on this save", Anglerfish Lantern's "Aquatic animals and
// creatures with the water trait take a -2 circumstance penalty to this check", Deravon's Helm's "If the target is a human, they take a -1
// status penalty to the save", Daybreak Ammunition's "Creatures with darkvision take a -2 circumstance penalty to this save". plan.ifTarget
// [{ traits | senses, bonus }] or [{ traits, immune: true }]: the save card for those creatures carries it (src/live/if-target.js), the
// sentence no longer a note. And a save only for living creatures, none for undead and constructs. Pure.

// (Its sentence as a note said it "(by hand)" — an activation's text read again after that: Deravon's Helm.)
const PENALTY = String.raw`take an? [-–−](\d+) (circumstance|status) penalty (?:to|on) (?:this (?:save|saving throw|check)|the save|their save)(?: \(by hand\))?`;
const bonusOf = (value, type) => ({ value: -Number(value), type: type.toLowerCase() });
const SENSES = { darkvision: "darkvision", "low-light vision": "low-light-vision", tremorsense: "tremorsense", scent: "scent" };
const READINGS = [
    [new RegExp(String.raw`\bCreatures with the (\w+) trait are immune to this effect, but creatures with the (\w+) trait ${PENALTY}\.`, "i"), (match) => [{ traits: [match[1].toLowerCase()], immune: true }, { traits: [match[2].toLowerCase()], bonus: bonusOf(match[3], match[4]) }]],
    [new RegExp(String.raw`\b(\w+) animals and creatures with the (\w+) trait ${PENALTY}\.`, "i"), (match) => [{ traits: [match[1].toLowerCase(), match[2].toLowerCase()], bonus: bonusOf(match[3], match[4]) }]],
    [new RegExp(String.raw`\bIf the target is an? (\w+), they ${PENALTY}\.`, "i"), (match) => [{ traits: [match[1].toLowerCase()], bonus: bonusOf(match[2], match[3]) }]],
    [new RegExp(String.raw`\bCreatures with (darkvision|low-light vision|tremorsense|scent) ${PENALTY}\.`, "i"), (match) => [{ senses: [SENSES[match[1].toLowerCase()]], bonus: bonusOf(match[2], match[3]) }]],
    // (A save only for a living creature — Slumber Arrow's "a living creature hit by it … must attempt", Ghost Ampoule's "each living creature in
    // a 15-foot emanation", Moritype's "If used on a living creature": undead and constructs aren't living, so no save card for them.)
    [/\b(?:a|each|any) living creature\b[^.]*?\b(?:must attempt|to attempt)\b|\bIf used on a living creature, that creature must attempt\b/i, () => [{ traits: ["undead", "construct"], immune: true }]]
];

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "");

// One save plan with the riders its text gives some creatures, or as it was.
function kindPlan(plan, plain) {
    if (plan?.resolution?.kind !== "save" || plan.resolution.check?.roll !== "save") return plan;
    const read = READINGS.map(([pattern, build]) => {
        const match = pattern.exec(plain);
        return match ? { sentence: match[0], entries: build(match) } : null;
    }).filter(Boolean);
    if (!read.length) return plan;
    const kept = (list) => (Array.isArray(list) ? list.filter((entry) => !read.some(({ sentence }) => said(entry).includes(sentence.slice(0, 60)))) : list);
    const notes = kept(plan.notes);
    const { notes: _notes, ...rest } = plan;
    return { ...rest, ...(notes?.length ? { notes } : {}), ifTarget: [...(plan.ifTarget ?? []), ...read.flatMap(({ entries }) => entries)] };
}

// The plan, its Strike's save too. text: its plain text.
export function withKindSaves(plan, text) {
    if (!plan || plan.builtin) return plan;
    const plain = String(text ?? "");
    let next = kindPlan(plan, plain);
    if (next?.strike?.save) {
        const save = kindPlan(next.strike.save, plain);
        if (save !== next.strike.save) next = { ...next, strike: { ...next.strike, save } };
    }
    return next;
}

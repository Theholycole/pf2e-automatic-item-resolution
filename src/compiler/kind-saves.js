// A save harder for some creatures, or not for them at all (2026-10-20): Lamentation of the Faithless's "Creatures with the unholy trait are
// immune to this effect, but creatures with the holy trait take a -2 status penalty on this save", Anglerfish Lantern's "Aquatic animals and
// creatures with the water trait take a -2 circumstance penalty to this check", Deravon's Helm's "If the target is a human, they take a -1
// status penalty to the save", Daybreak Ammunition's "Creatures with darkvision take a -2 circumstance penalty to this save". plan.ifTarget
// [{ traits | senses, bonus }], [{ traits, immune: true }] or [{ traits, failDamage }] (more damage on its failures, Locust Leather's swarms'):
// the save card for those creatures carries it (src/live/if-target.js), the
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
    // (Creatures of a trait by its own word, Mythotoxin's "Mythic creatures take a -2 circumstance penalty to saves against mythotoxin", 2026-10-25.)
    [/\b(Mythic|Undead|Holy|Unholy|Fiend|Celestial|Elemental|Construct|Aquatic|Amphibious) creatures take an? [-–−](\d+) (circumstance|status) penalty to saves against (?:it|this|the [\w' -]+|[a-z][\w' -]*)\./, (match) => [{ traits: [match[1].toLowerCase()], bonus: bonusOf(match[2], match[3]) }]],
    // (A save only for a living creature — Slumber Arrow's "a living creature hit by it … must attempt", Ghost Ampoule's "each living creature in
    // a 15-foot emanation", Moritype's "If used on a living creature": undead and constructs aren't living, so no save card for them.)
    [/\b(?:a|each|any) living creature\b[^.]*?\b(?:must attempt|to attempt)\b|\bIf used on a living creature, that creature must attempt\b/i, () => [{ traits: ["undead", "construct"], immune: true }]],
    // (2026-10-25: another damage for a kind, Lance of Sun's Radiance's "or 6d12 spirit damage if they're a dragon" — in src/compiler/item-data.js's
    // words "A dragon takes 6d12 spirit damage instead" — that formula for them.)
    [/\bAn? ([\w-]+) takes (\d+d\d+) (\w+) damage instead\./i, (match) => [{ traits: [match[1].toLowerCase()], formula: `${match[2]}[${match[3].toLowerCase()}]` }]],
    [/\bor (\d+d\d+) (\w+) damage if they're an? ([\w-]+)\b/i, (match) => [{ traits: [match[3].toLowerCase()], formula: `${match[1]}[${match[2].toLowerCase()}]` }]],
    // (Healing instead for a living one, Spirit Fan's "If the target is a living creature, the energy restores 3d8+8 Hit Points" beside its undead's save.)
    [/\bIf the target is a living creature, (?:the energy|it) restores (\d+d\d+(?:\+\d+)?) Hit Points\./i, (match) => [{ living: true, heal: match[1] }]],
    // (More damage for a kind on a failure, Locust Leather's "Swarms that fail this save also take 1d6 persistent poison damage", 2026-10-26: their
    // failure rows' damage mixed, the save's and that.)
    [/\b(Swarms|Undead|Constructs|Plants|Oozes|Fungi|Animals|Beasts) that fail this save also take (\d+d\d+) (persistent )?(\w+) damage\./i, (match) => [{ traits: [{ swarms: "swarm", undead: "undead", constructs: "construct", plants: "plant", oozes: "ooze", fungi: "fungus", animals: "animal", beasts: "beast" }[match[1].toLowerCase()]], failDamage: `${match[2]}[${match[3] ? "persistent," : ""}${match[4].toLowerCase()}]` }]],
    // (A penalty for a trait's creatures, Golden Gloves' "Unholy creatures take a –2 item penalty to their roll".)
    [/\b(Unholy|Holy|Undead|Fiend|Celestial|Dragon|Mythic) creatures take an? [-–−](\d+) (item|status|circumstance) penalty to their (?:roll|saves?|saving throws?)\./, (match) => [{ traits: [match[1].toLowerCase()], bonus: bonusOf(match[2], match[3]) }]]
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
    // (Its note in the reworded form too, "A dragon takes 6d12 spirit damage instead (by hand)".)
    const reworded = (entry) => /^An? [\w-]+ takes \d+d\d+ \w+ damage instead(?: \(by hand\))?\.$/i.test(said(entry).trim()) && read.some(({ entries }) => entries.some((one) => one.formula));
    // (Dashes as one: the note's "-2", the text's "–2".)
    const flat = (words) => String(words).replace(/[–−]/g, "-");
    const kept = (list) => (Array.isArray(list) ? list.filter((entry) => !reworded(entry) && !read.some(({ sentence }) => flat(said(entry)).includes(flat(sentence.slice(0, 60)).replace(/\.$/, "")))) : list);
    const notes = kept(plan.notes);
    const { notes: _notes, ...rest } = plan;
    // (Each entry once: the reworded sentence and the text's own can both say it.)
    const entries = read.flatMap(({ entries: found }) => found).filter((entry, index, all) => all.findIndex((other) => JSON.stringify(other) === JSON.stringify(entry)) === index);
    const result = { ...rest, ...(notes?.length ? { notes } : {}), ifTarget: [...(plan.ifTarget ?? []), ...entries] };
    // (Nothing else left to the GM: no longer partial.)
    const left = [...(notes ?? []), ...(plan.unread ?? []), ...Object.values(plan.resolution.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    if (plan.partial && !left.length) {
        delete result.partial;
        result.automation = { ...(result.automation ?? {}), level: "automatic" };
    }
    return result;
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

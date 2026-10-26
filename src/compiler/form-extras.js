// A form spell an item casts on its user, with its element named and more besides (2026-10-26): Golden Blade of Mzali's "The spear casts
// 7th-rank Elemental Form on you, choosing fire as the form's trait", Robe of Stone's "The cloak casts Elemental Form on you, transforming you
// into an earth elemental. In addition to the spell's normal effects, you can Burrow through any earthen matter … Also, the range of the
// tremorsense you gain from the robe increases to 30 feet." Its linked Spell Effect's element preset (application.choice, the ChoiceSet's
// value) at its rank (application.level); what it adds, an Effect for the form's time — PF2e's Sense for the tremorsense, the burrowing
// through stone in its words (the user's note-Effect rule). Before, these were notes on a plan counted whole. Pure.

const CASTS = /^The [\w' -]+? casts (?:(\d+)(?:st|nd|rd|th)-rank )?Elemental Form on you, (?:choosing (\w+) as the form's trait|transforming you into an? (\w+) elemental)\.$/i;
const BURROW = /^In addition to the spell's normal effects, you can Burrow through any earthen matter, including rock, moving at the spell's burrow Speed, leaving no tunnels or signs of your passing\.$/i;
const SENSE = /^Also, the range of the tremorsense you gain from the [\w' -]+? increases to (\d+) feet\.$/i;
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

export function withFormExtras(plan) {
    const applications = plan?.resolution?.kind === "effect" ? plan.resolution.applications ?? [] : [];
    const form = applications.findIndex((entry) => entry.kind === "native-spell-effect" && entry.spell?.name === "Elemental Form");
    const cast = (plan?.notes ?? []).map((note) => [note, CASTS.exec(said(note))]).find(([, match]) => match);
    if (form < 0 || !cast) return plan;
    const [note, match] = cast;
    const element = (match[2] ?? match[3]).toLowerCase();
    const application = { ...applications[form], choice: element, ...(match[1] ? { level: Number(match[1]) } : {}) };
    const burrow = (plan.notes ?? []).find((entry) => BURROW.test(said(entry)));
    const sense = (plan.notes ?? []).map((entry) => [entry, SENSE.exec(said(entry))]).find(([, found]) => found);
    const read = [note, burrow, sense?.[0]].filter(Boolean);
    const notes = plan.notes.filter((entry) => !read.includes(entry));
    const extras = burrow || sense ? [{ name: "elemental form", words: [burrow ? "Burrows through any earthen matter, including rock, at the form's burrow Speed, leaving no tunnels or signs of its passing" : null, sense ? `Imprecise tremorsense ${sense[1][1]} feet` : null].filter(Boolean).join("; "), rules: sense ? [{ key: "Sense", selector: "tremorsense", range: Number(sense[1][1]), acuity: "imprecise" }] : [], duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } }] : [];
    const next = {
        ...plan,
        notes: notes.length ? notes : undefined,
        resolution: { ...plan.resolution, applications: applications.map((entry, index) => (index === form ? application : entry)) },
        // (Read before the activation's plan is packed: its own ruleEffects, which go to plan.item.)
        ...(extras.length ? { ruleEffects: [...(plan.ruleEffects ?? []), ...extras] } : {})
    };
    return next;
}

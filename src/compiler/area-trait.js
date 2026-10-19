// A save in an area for some creatures only, by a trait: Fulu Compendium's Paralyzing Page's "All undead creatures in a 30-foot emanation",
// Ghost Ampoule's "each living creature in a 10-foot burst". The presser targets the creatures in the area; the card's note says which
// ones save. Pure.

const IN_AREA = /\b(?:All|Each) (undead|living|fiend|construct|animal|plant|fey|dragon|elemental|celestial|aberration|ooze|spirit|demon|devil) creatures? (?:in|within) (?:an? )?(?:\d+-foot (?:emanation|burst|cone|line)|@Template)/i;
const WORDS = { living: "living creatures (not constructs or undead, unless the GM says otherwise)" };

// The plan, its activation's or item's html → the plan with that note, or as it was.
export function withAreaTraitNote(plan, html) {
    if (plan?.resolution?.check?.roll !== "save" || !plan.targeting?.area) return plan;
    const found = IN_AREA.exec(String(html ?? "").replace(/<[^>]+>/g, " "));
    if (!found) return plan;
    const trait = found[1].toLowerCase();
    const note = `Only ${WORDS[trait] ?? `${trait} creatures`} in the area attempt the save: target those.`;
    return (plan.notes ?? []).includes(note) ? plan : { ...plan, notes: [...(plan.notes ?? []), note] };
}

// Last checks on a plan before it's played (the user's rule: never apply a rule wrongly; a note says it instead). Pure.
//
// A valued condition read with no value — Gearbinder Oil's "increases its slowed condition", Mamlambo Scale's "As failure,
// but …" whose failure value didn't carry over — isn't applied: a note on the creature for that degree says it, and the
// GM sets the value. (Stunned for a time, "Stunned for 1 round", has no value by right.)

const VALUED = new Set(["clumsy", "doomed", "drained", "enfeebled", "frightened", "sickened", "slowed", "stunned", "stupefied", "wounded"]);

const unvalued = (effect) => effect?.kind === "condition" && VALUED.has(effect.slug) && !Number.isFinite(effect.value) && !(effect.slug === "stunned" && effect.duration) && effect.recipient !== "self";

function guardOutcomes(resolution) {
    if (!resolution?.outcomes) return null;
    let changed = false;
    const outcomes = {};
    for (const [degree, row] of Object.entries(resolution.outcomes)) {
        const bad = (row?.effects ?? []).filter(unvalued);
        if (!bad.length) {
            outcomes[degree] = row;
            continue;
        }
        changed = true;
        outcomes[degree] = {
            ...row,
            effects: row.effects.filter((effect) => !bad.includes(effect)),
            noteEffects: [...(row.noteEffects ?? []), ...bad.map((effect) => ({ label: effect.slug, text: `${effect.slug.charAt(0).toUpperCase()}${effect.slug.slice(1)}: the item doesn't say how much; the GM sets it.`, duration: effect.duration ?? null }))]
        };
    }
    return changed ? { ...resolution, outcomes } : null;
}

// The plan with its unvalued conditions as notes (its own rows, and the saves it carries: a bomb's, a Strike's), marked
// partial; the same plan when there are none.
export function guardValues(plan) {
    if (!plan || plan.builtin) return plan;
    const own = guardOutcomes(plan.resolution);
    const itemSave = plan.item?.save?.plan ? guardOutcomes(plan.item.save.plan.resolution) : null;
    const strikeSave = plan.strike?.save ? guardOutcomes(plan.strike.save.resolution) : null;
    if (!own && !itemSave && !strikeSave) return plan;
    return {
        ...plan,
        ...(own ? { resolution: own } : {}),
        ...(itemSave ? { item: { ...plan.item, save: { ...plan.item.save, plan: { ...plan.item.save.plan, resolution: itemSave } } } } : {}),
        ...(strikeSave ? { strike: { ...plan.strike, save: { ...plan.strike.save, resolution: strikeSave } } } : {}),
        partial: true
    };
}

// A text whose target takes something outright and whose save is for others (the target takes damage and a condition, its
// allies nearby take damage with a basic save — Shei Long's Blade): one save plan can't hold both, so a save plan read
// from it isn't played (the ability module leaves it to the item side, 2026-10-15).
const TARGET_THEN_OTHERS = /\b(?:Your|The) target takes\b[^.]*\.\s*(?:All|Each|Any)\b[^.]*\b(?:allies|other creatures|creatures)\b[^.]*\b(?:save|saving throw)\b/i;
export function guardText(plan, text) {
    if (plan?.resolution?.kind === "save" && plan.resolution.check?.roll === "save" && TARGET_THEN_OTHERS.test(String(text ?? ""))) return null;
    return equalTempHP(traitGated(plan, text), text);
}

// Temporary Hit Points equal to the damage it deals — Life's Last Breath's "or take 4d6 void damage; you gain an equal amount of
// temporary Hit Points that last 1 minute" — which the ability compiler leaves out: a note for its user.
const EQUAL_TEMP = /\byou gain (?:an equal amount of|a number of) temporary Hit Points\b[^.;]*/i;
function equalTempHP(plan, text) {
    const match = EQUAL_TEMP.exec(String(text ?? ""));
    if (!match || !plan?.resolution?.outcomes || plan.builtin) return plan;
    if (Object.values(plan.resolution.outcomes).some((row) => (row?.effects ?? []).some((effect) => effect?.kind === "tempHP" || effect?.kind === "temp-hp"))) return plan;
    const note = `${match[0].charAt(0).toUpperCase()}${match[0].slice(1)} (the damage dealt): add them by hand.`;
    return { ...plan, notes: [...(plan.notes ?? []), note], partial: true };
}

// A condition only for a creature with a trait — Lacquered Waist Drum's "if the creature has the ghost trait, it becomes
// Stupefied 1 for 1 minute" — isn't the ability compiler's to give every creature the save is for: its rows lose it, and a
// note on each says who it's for. One the compiler left out ("the ghost becomes Sickened 1 if it fails the save") is a note
// on the failures.
const TRAIT_GATED = /\bif the (?:creature|undead|target)(?: also)? has the ([\w-]+) trait, (?:it|the [\w-]+) becomes ([A-Z][a-z-]+)((?: \d+)?[^.;]*)/g;
function traitGated(plan, text) {
    const gated = [...String(text ?? "").matchAll(TRAIT_GATED)].map((match) => ({ trait: match[1].toLowerCase(), slug: match[2].toLowerCase(), words: `${match[2]}${match[3]}`.trim() }));
    if (!gated.length || !plan?.resolution?.outcomes) return plan;
    let changed = false;
    const outcomes = {};
    for (const [degree, row] of Object.entries(plan.resolution.outcomes)) {
        const bad = (row?.effects ?? []).filter((effect) => effect?.kind === "condition" && gated.some((entry) => entry.slug === effect.slug));
        if (!bad.length) {
            outcomes[degree] = row;
            continue;
        }
        changed = true;
        outcomes[degree] = {
            ...row,
            effects: row.effects.filter((effect) => !bad.includes(effect)),
            noteEffects: [...(row.noteEffects ?? []), ...bad.map((effect) => {
                const entry = gated.find((one) => one.slug === effect.slug);
                return { label: effect.slug, text: `Only a creature with the ${entry.trait} trait: ${effect.slug.charAt(0).toUpperCase()}${effect.slug.slice(1)}${Number.isFinite(effect.value) ? ` ${effect.value}` : ""}. Apply it by hand.`, duration: effect.duration ?? null };
            })]
        };
    }
    // (Left out: a note on the rows it names.)
    for (const entry of gated.filter((one) => !Object.values(plan.resolution.outcomes).some((row) => (row?.effects ?? []).some((effect) => effect?.slug === one.slug)))) {
        const degrees = /\bif it (?:critically )?fails\b/i.test(entry.words) ? (/\bcritically fails\b/i.test(entry.words) ? ["criticalFailure"] : ["failure", "criticalFailure"]) : [];
        for (const degree of degrees.filter((one) => outcomes[one])) {
            changed = true;
            outcomes[degree] = { ...outcomes[degree], noteEffects: [...(outcomes[degree].noteEffects ?? []), { label: entry.slug, text: `Only a creature with the ${entry.trait} trait: ${entry.words.replace(/\s+if it (?:critically )?fails the save\b/i, "")}. Apply it by hand.`, duration: null }] };
        }
    }
    return changed ? { ...plan, resolution: { ...plan.resolution, outcomes }, partial: true } : plan;
}

// A spell the text only names as an example ("cannot be affected by any effect that requires an intact body to function,
// such as the Talking Corpse spell" — Mantis Embrace; "saves against mental effects … such as the Nightmare spell" —
// Restful Sleep Fulu): the ability compiler's cast of it isn't one (2026-10-15). True when every sentence naming it does
// so after "such as" or "like".
export function castMentionOnly(plan, html) {
    if (plan?.builtin !== "cast-spell" || !plan.spell?.name) return false;
    const name = plan.spell.name;
    const sentences = String(html ?? "").replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z])/).filter((sentence) => sentence.includes(name));
    return sentences.length > 0 && sentences.every((sentence) => new RegExp(String.raw`\b(?:such as|like) (?:an? |the )?(?:[\w-]+ ){0,3}?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\b`, "i").test(sentence));
}


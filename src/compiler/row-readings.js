// Results the ability compiler leaves as notes that a row of the plan can carry itself (2026-10-25, docs/needs.md):
// - a creature shrunk for a time, Reducer Round's "Failure The target shrinks to Tiny size for 1d4 rounds. Its reach becomes 0 feet, and it's
//   Enfeebled 1 for this duration": that row's note Effect with PF2e's own rules for it, as PF2e's Shrink Effect has them (CreatureSize tiny,
//   reach 0, its gear resized), the conditions "for this duration" granted by it (GrantItem, gone with it) instead of lasting forever;
// - persistent damage a failed save adds to a basic save's, Splintering Spear's Shatter's "A creature that fails also takes the same amount of
//   persistent bleed damage as the spear deals on a hit" (the item's "when you hit with the spear, splinters break off in the target, dealing
//   1d6 bleed damage"): the failure's and the critical failure's damage, mixed — the save's shared damage and that persistent damage.
// - a push the row already makes, its GM line the whole paragraph: Blast Lance's "The target takes the full fire damage and is pushed back 5
//   feet. You can Stride after it, but you must move the same distance and in the same direction." — the push the row's, the Stride its
//   user's option, a line on the card.
// - an attack it makes nonlethal, Possum's Play's "When you activate the talisman, the triggering attack gains the nonlethal trait, and you
//   fall Prone, feigning death" (the Prone the row's): a note Effect on its user for the round — what nonlethal damage does at 0 Hit Points
//   is PF2e's rule, the damage the attacker's roll; the user's note-Effect ruling counts it done.
// - whom it's at, a banner's "each enemy within the banner's aura that has been dealt damage since the end of your last turn" (Banner of
//   Piercing Shards, worded so by src/compiler/item-data.js): the card's target, the creatures its presser targets — not a GM line.
// Each sentence read is no longer a note. Pure.

const CONDITION_IDS = { blinded: "XgEqL1kFApUbl5Z2", clumsy: "i3OJZU2nk64Df3xm", confused: "yblD8fOR1J8rDwEQ", controlled: "9qGBRpbX9NEwtAAr", dazzled: "TkIyaNPgTZFBCCuh", deafened: "9PR9y0bi4JPKnHPR", drained: "4D2KBtexWXa6oUMR", enfeebled: "MIRkyAjyBeXivMa7", fascinated: "AdPVz7rbaVSRxHFg", fatigued: "HL2l2VRSaQHu9lUw", frightened: "TBSHQspnbcqxsmjL", grabbed: "kWc1fhmv9LBiTuei", immobilized: "eIcWbB5o3pP6OIMe", "off-guard": "AJh5ex99aV6VTggg", paralyzed: "6uEgoh53GbXuHpTF", petrified: "dTwPJuKgBQCMxixg", prone: "j91X7x0XSomq8d60", restrained: "VcDeM8A5oI6VqhbM", sickened: "fesd1n5eVhpCSS18", slowed: "xYTAsEpcJE1Ccni3", stunned: "dfCMdR4wnpbYNTix", stupefied: "e1XGnhKNSQIm5IXg" };
const conditionUuid = (slug) => (CONDITION_IDS[slug] ? `Compendium.pf2e.conditionitems.Item.${CONDITION_IDS[slug]}` : null);
const UNITS = { round: "rounds", minute: "minutes", hour: "hours" };
const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\[\[\/r ([^\]#]+?)(?:\s*#[^\]]*)?\]\](?:\{[^}]*\})?/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();

// "1d4 rounds", "1 minute" → a duration (rolled: its average, rounded down, with valueRoll, as src/compiler/rows.js has it).
function timeOf(words) {
    const rolled = /^(\d+)d(\d+) (round|minute|hour)s?$/i.exec(words);
    if (rolled) return { mode: "fixed", value: Math.floor((Number(rolled[1]) * (Number(rolled[2]) + 1)) / 2), valueRoll: `${rolled[1]}d${rolled[2]}`, unit: UNITS[rolled[3].toLowerCase()], expiry: "turn-start" };
    const fixed = /^(\d+|one|an?) (round|minute|hour)s?$/i.exec(words);
    if (!fixed) return null;
    return { mode: "fixed", value: /^\d+$/.test(fixed[1]) ? Number(fixed[1]) : 1, unit: UNITS[fixed[2].toLowerCase()], expiry: "turn-start" };
}

// (The size and what lasts with it: "Its reach becomes 0 feet, and it's Enfeebled 1 for this duration.")
const SHRINK = /\bThe target shrinks to (Tiny|Small) size for ([^.]+?)\.(?:\s*Its reach becomes (\d+) feet(?:,| and)? (?:and )?(?:it's|it is) ((?:[A-Z]?[a-z-]+ \d+(?:,? (?:and )?)?)+) for this duration\.?)?/;
function shrinkOf(paragraph) {
    const match = SHRINK.exec(paragraph);
    if (!match) return null;
    const duration = timeOf(match[2].trim());
    if (!duration) return null;
    const conditions = match[4] ? [...match[4].matchAll(/([A-Za-z-]+) (\d+)/g)].map(([, slug, value]) => ({ slug: slug.toLowerCase(), value: Number(value) })) : [];
    if (conditions.some((condition) => !conditionUuid(condition.slug))) return null;
    const size = match[1].toLowerCase();
    const reach = match[3] !== undefined ? Number(match[3]) : size === "tiny" ? 0 : null;
    const rules = [{ key: "CreatureSize", value: size, ...(reach !== null ? { reach: { override: reach } } : {}), resizeEquipment: true }, ...conditions.map((condition) => ({ key: "GrantItem", uuid: conditionUuid(condition.slug), inMemoryOnly: true, alterations: [{ mode: "override", property: "badge-value", value: condition.value }] }))];
    const words = [`${match[1]} size`, ...(reach !== null ? [`reach ${reach} feet`] : []), ...conditions.map((condition) => `${condition.slug.replace(/^./, (letter) => letter.toUpperCase())} ${condition.value}`)].join(", ");
    return { said: match[0], conditions, note: { label: `Shrunk to ${match[1]}`, text: `${words} (${match[2].trim()})`, duration, rules } };
}

// ("A creature that fails also takes the same amount of persistent bleed damage as the spear deals on a hit", the item's own hit damage.)
const SAME_PERSISTENT = /^A creature that fails also takes the same amount of persistent ([a-z]+) damage as the [\w' -]+? deals on a hit\.$/i;
function persistentOf(sentence, itemHtml) {
    const match = SAME_PERSISTENT.exec(sentence);
    if (!match) return null;
    const type = match[1].toLowerCase();
    const hit = new RegExp(String.raw`\bwhen you hit with the [^.]*?@Damage\[(\d+d\d+|\d+)\[${type}\]\]`, "i").exec(String(itemHtml ?? ""));
    return hit ? { formula: `${hit[1]}[persistent,${type}]` } : null;
}

// (A paragraph whose results the row has — its damage, its push — but its Stride after the creature, its user's to take.)
const STRIDE_AFTER = /^\{target\} \((?:critical )?failure, the rest by hand\): The target takes (?:the )?(?:full|double|half)(?: fire| \w+)? damage and is pushed back (\d+) feet\. (You can Stride after it, but you must move the same distance and in the same direction\.)$/;

const NONLETHAL = /^When you activate [\w' -]+?, the triggering attack gains the nonlethal trait(?:, and you fall Prone, feigning death)?\.$/i;

const AIMED = /^\{target\}: Target (each enemy within the banner's aura that [^.]+)\.$/i;

const leftOver = (plan) => !(plan.notes ?? []).length && !(plan.unread ?? []).length && !Object.values(plan.resolution?.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length || (row?.unread ?? []).length);

// The plan and its (activation's) html → the plan with the rows that carry these.
// (item: the item's own html, for what a sentence refers to there.)
export function withRowReadings(plan, html, item = null) {
    const outcomes = plan?.resolution?.outcomes;
    if (!outcomes || plan.builtin) return plan;
    let next = plan;
    // (Its notes, and what it didn't read — notes later.)
    let notes = [...(plan.notes ?? [])];
    let unread = [...(plan.unread ?? [])];
    let targetWords = null;
    const kept = (list, words) => list.filter((note) => !said(note).includes(words) && !words.includes(said(note).replace(/^(?:Critical Success|Success|Failure|Critical Failure)\s+/, "")));
    const drop = (words) => {
        notes = kept(notes, words);
        unread = kept(unread, words);
    };
    // (A shrink in a degree's paragraph: that row.)
    const paragraphs = [...String(html ?? "").matchAll(/<p>\s*<strong>\s*(Critical Success|Success|Failure|Critical Failure)\s*<\/strong>([\s\S]*?)<\/p>/gi)];
    const keyOf = { "critical success": "criticalSuccess", success: "success", failure: "failure", "critical failure": "criticalFailure" };
    const rows = { ...outcomes };
    for (const [, heading, body] of paragraphs) {
        const degree = keyOf[heading.toLowerCase()];
        const shrink = shrinkOf(plainOf(body));
        if (!shrink || !rows[degree]) continue;
        const row = rows[degree];
        const folded = new Set(shrink.conditions.map((condition) => condition.slug));
        rows[degree] = { ...row, effects: (row.effects ?? []).filter((effect) => !(effect?.kind === "condition" && folded.has(effect.slug) && !effect.duration)), noteEffects: [...(row.noteEffects ?? []), shrink.note] };
        drop(shrink.said);
        for (const sentence of shrink.said.split(/(?<=\.)\s+/)) drop(sentence);
    }
    // (Persistent damage beside a basic save's on its failures.)
    if (plan.resolution.kind === "save") {
        // (Its sentences, not its notes: one read here is traced by its damage, never a note later — src/compiler/honest.js withUntracedRules.)
        for (const note of plainOf(html).split(/(?<=[.!?])\s+(?=[A-Z])/)) {
            const extra = persistentOf(said(note), item?.system?.description?.value);
            if (!extra) continue;
            for (const degree of ["failure", "criticalFailure"]) {
                const row = rows[degree];
                if (row?.damage?.mode !== "shared") continue;
                rows[degree] = { ...row, damage: { mode: "mixed", shared: row.damage, formulas: [extra], rollScope: "target" } };
            }
            drop(said(note));
        }
    }
    // (A push the row has, its Stride the user's option: the card's line.)
    for (const degree of ["failure", "criticalFailure"]) {
        const row = rows[degree];
        const lines = row?.manualInstructions ?? [];
        const said = lines.map((line) => [line, STRIDE_AFTER.exec(String(line))]).filter(([, match]) => match && Number(match[1]) === Number(row.forcedMovement?.distance) && row.forcedMovement?.kind === "push");
        if (!said.length) continue;
        rows[degree] = { ...row, manualInstructions: lines.filter((line) => !said.some(([one]) => one === line)) };
        const option = `After the push, its user can Stride after the creature, the same distance and direction.`;
        if (!notes.includes(option)) notes.push(option);
    }
    // (The triggering attack made nonlethal, its Prone the row's: a note Effect on its user.)
    if (plan.resolution.kind === "check" && rows.success) {
        for (const entry of [...notes, ...unread]) {
            const match = NONLETHAL.exec(said(entry));
            if (!match) continue;
            const prone = /\bfall Prone\b/i.test(said(entry));
            if (prone && !(rows.success.effects ?? []).some((effect) => effect?.slug === "prone")) continue;
            rows.success = { ...rows.success, noteEffects: [...(rows.success.noteEffects ?? []), { label: "Nonlethal attack", text: "The triggering attack is nonlethal: if it brings you to 0 Hit Points, you're unconscious instead of dying (PF2e's rule for nonlethal damage).", duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start" } }] };
            drop(said(entry));
        }
    }
    // (Whom it's at, the banner's aura's enemies: the card's target words.)
    for (const [degree, row] of Object.entries(rows)) {
        const lines = row?.manualInstructions ?? [];
        const aimed = lines.map((line) => [line, AIMED.exec(String(line))]).filter(([, match]) => match);
        if (!aimed.length) continue;
        rows[degree] = { ...row, manualInstructions: lines.filter((line) => !aimed.some(([one]) => one === line)) };
        targetWords = aimed[0][1][1];
        notes = notes.filter((note) => !/^Only each enemy within the banner's aura that\b/i.test(said(note)));
    }
    if (!targetWords && notes.length === (plan.notes ?? []).length && unread.length === (plan.unread ?? []).length && Object.keys(rows).every((degree) => rows[degree] === outcomes[degree])) return plan;
    next = { ...plan, notes: notes.length ? notes : undefined, ...(plan.unread ? { unread } : {}), resolution: { ...plan.resolution, outcomes: rows }, ...(targetWords ? { targeting: { ...(plan.targeting ?? {}), target: targetWords } } : {}) };
    if (next.partial && leftOver(next)) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}

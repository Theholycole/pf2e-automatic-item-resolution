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
// - healing more by its user's condition value, Oracular Crown's "You regain 3d8 Hit Points. The amount of healing increases to 5d8 if you're
//   cursebound 2, 7d8 if you're cursebound 3, or 9d8 if you're cursebound 4" (2026-10-26): its heal effect's byCondition { slug, formulas },
//   the formula picked from its user's value as the card applies (src/live/scaled.js).
// - a save bonus only against persistent damage, Antivenom Potion's "In addition, for 1 minute after drinking the potion, you gain a +1 bonus to
//   Fortitude saving throws to avoid taking persistent poison damage" (2026-10-26): a note Effect for that minute in place of the whole text's
//   reminder, its flat check the card's own (plan.item.recovery) — PF2e has no option for a save against persistent damage.
// - what a critical failure's Prone makes it do, Deravon's Helm's "on a critical failure, the target must spend all three actions on its next turn
//   remaining prone" (as src/compiler/item-data.js words it, its Prone the rows'): a note Effect on that row to the end of its next turn — a
//   behaviour rule beside the condition the row gives (2026-10-26).
// - a save bonus only to reduce the sickened condition, Emetic Paste's "The bonus is only to saves to reduce the sickened condition, and the
//   creature attempts one such save at once" (as src/compiler/item-data.js words it, 2026-10-26): its +2 item to Fortitude no longer every
//   Fortitude save's — an Effect with PF2e's FlatModifier for a Retch ("action:retch", as PF2e's Stench has it) and a roll note on its
//   Fortitude saves while sickened; the save at once its target's own roll, a line of the card.
// - an ignition its hit needs, Oil's "You must succeed at a DC 10 flat check for the oil to ignite successfully when it hits" (and "Its
//   damage only when the oil ignites", 2026-10-26): ownCheck.ignite, the flat check the card rolls as it's thrown (scripts/poisons.js) — a
//   failure, the hit deals no damage.
// Each sentence read is no longer a note. Pure.

import { readAffliction } from "../../../pf2e-automatic-ability-resolution/src/compiler/afflictions.js";

const IGNITE = /^You must succeed at a DC (\d+) flat check for the (\w+) to ignite successfully when it hits\.$/i;
const IGNITES_ONLY = /^Its damage only when the (\w+) ignites\.$/i;

const RETCH_ONLY = /^The bonus is only to saves to reduce the sickened condition, and the creature attempts one such save at once\.$/i;
const CHOSEN_IN_REACH = /^Choose a creature within reach \(you, or a sickened creature\)\.$/i;

// (Concealed to the end of its user's next turn, gone sooner on a hostile action, Invisible Chain Shirt's Obscured Approach: "You Stride and turn
// partially invisible, becoming Concealed until the end of your next turn or until you use a hostile action, whichever comes first" — the row's
// Concealed for that time, its hostile-action end a note Effect beside it, the Stride a line of the card.)
const CONCEALED_UNTIL = /^You (Stride|Step) and [^,.]+, becoming Concealed until the end of your next turn or until you use a hostile action, whichever comes first\.$/i;

// (An illusion spell's disbelief undone, Storyteller's Opus's Hoodwink: "If you succeed, the creature doesn't disbelieve the illusion" — a note
// Effect on it, as the user's ruling has illusions the GM's control, 2026-10-26.)
const STILL_FOOLED = /^\{target\} \(success\): the creature doesn't disbelieve the illusion\.?$/i;
const STAYS_PRONE = /^It drops prone as its first action on its next turn; on a critical failure, the target must spend all three actions on its next turn remaining prone(?: \(by hand\))?\.$/i;

const AGAINST_PERSISTENT = /^(?:In addition, )?for (\d+|one|an?) (rounds?|minutes?|hours?) after drinking (?:the|this) potion, you gain an? \+(\d+) (?:(status|item|circumstance) )?bonus to (Fortitude|Reflex|Will) saving throws to avoid taking persistent (\w+) damage\.$/i;

// ("… increases to 5d8 if you're cursebound 2, 7d8 if you're cursebound 3, or 9d8 if you're cursebound 4.")
const SCALED_HEAL = /^The amount of healing increases to ((?:\d+d\d+ if you're [a-z-]+ \d+(?:,? (?:or )?)?)+)\.$/i;
const SCALE_STEP = /(\d+d\d+) if you're ([a-z-]+) (\d+)/gi;

const CONDITION_IDS = { blinded: "XgEqL1kFApUbl5Z2", clumsy: "i3OJZU2nk64Df3xm", confused: "yblD8fOR1J8rDwEQ", controlled: "9qGBRpbX9NEwtAAr", dazzled: "TkIyaNPgTZFBCCuh", deafened: "9PR9y0bi4JPKnHPR", drained: "4D2KBtexWXa6oUMR", enfeebled: "MIRkyAjyBeXivMa7", fascinated: "AdPVz7rbaVSRxHFg", fatigued: "HL2l2VRSaQHu9lUw", frightened: "TBSHQspnbcqxsmjL", grabbed: "kWc1fhmv9LBiTuei", immobilized: "eIcWbB5o3pP6OIMe", "off-guard": "AJh5ex99aV6VTggg", paralyzed: "6uEgoh53GbXuHpTF", petrified: "dTwPJuKgBQCMxixg", prone: "j91X7x0XSomq8d60", quickened: "nlCjDvLMf2EkV2dl", restrained: "VcDeM8A5oI6VqhbM", sickened: "fesd1n5eVhpCSS18", slowed: "xYTAsEpcJE1Ccni3", stunned: "dfCMdR4wnpbYNTix", stupefied: "e1XGnhKNSQIm5IXg" };
export const conditionUuid = (slug) => (CONDITION_IDS[slug] ? `Compendium.pf2e.conditionitems.Item.${CONDITION_IDS[slug]}` : null);
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

// (Nothing left but the readings' own lines of the card: Emetic Paste's save at once, a push's Stride after.)
// (And a class's action economy for it, Spectacles of Inquiry's "If you're an investigator, you can use this activation as part of the action you
// take to Devise a Stratagem or Pursue a Lead, …": its user's to take, a line of the card — 2026-10-26.)
const INVESTIGATOR = "If you're an investigator, you can use this activation as part of the action you take to Devise a Stratagem or Pursue a Lead, and you can do the latter even though you can't see the creature.";
// (Its user's own Stride before the Effect, Invisible Chain Shirt's Obscured Approach: a line of the card — 2026-10-26.)
const STRIDE_FIRST = "Stride first (its user's own move).";
const CARD_LINES = new Set(["It attempts a Fortitude save to reduce its sickened condition at once, with the bonus.", "After the push, its user can Stride after the creature, the same distance and direction.", INVESTIGATOR, STRIDE_FIRST, "Then Stride up to its Speed and make a melee Strike at the end of that movement (its own actions)."]);
// (A note that's one of those lines: later readings — the mark's — leave the plan whole beside it too.)
export const isCardLine = (note) => CARD_LINES.has(said(note));
const leftOver = (plan) => !(plan.notes ?? []).filter((note) => !CARD_LINES.has(said(note))).length && !(plan.unread ?? []).length && !Object.values(plan.resolution?.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length || (row?.unread ?? []).length);

// The plan and its (activation's) html → the plan with the rows that carry these.
// (item: the item's own html, for what a sentence refers to there.)
// (An affliction a degree exposes the creature to, its stat block in the item's text, Tarantula Ampoule's critical failure "it's also exposed to
// tarantula venom": that row's follow-up save — the core's outcome.followUps, the ability module's next card — handing on the affliction's
// stages as the ability compiler reads a stat block (readAffliction), in place of the GM's line. 2026-10-26.)
const EXPOSED_LINE = /^\{target\} is exposed to [^:]+: a DC (\d+) (Fortitude|Reflex|Will) save against it \(its stages are in the ability's text\)\.?$/i;
const STAT_BLOCK = /<p>\s*<strong>([^<]+)<\/strong>\s*\(([^)]*)\)\s*<\/p>([\s\S]*?<strong>\s*Saving Throw\s*<\/strong>[\s\S]*?<strong>\s*Stage 1\s*<\/strong>[\s\S]*?)(?=<hr|<p>\s*<strong>\s*Craft Requirements|$)/i;
function withExposure(plan, itemHtml) {
    const rows = plan?.resolution?.outcomes;
    if (plan?.resolution?.kind !== "save" || !rows) return plan;
    const entries = Object.entries(rows).filter(([, row]) => (row?.manualInstructions ?? []).some((line) => EXPOSED_LINE.test(said(line))));
    const block = entries.length ? STAT_BLOCK.exec(String(itemHtml ?? "")) : null;
    const affliction = block ? readAffliction({ name: block[1].trim(), system: { slug: null, traits: { value: block[2].split(/,\s*/).map((trait) => trait.trim().toLowerCase()).filter(Boolean) }, description: { value: block[3] } } }) : null;
    if (!affliction) return plan;
    const stage = (value) => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], affliction: { name: affliction.name, stage: Math.min(value, affliction.stages.length) } });
    const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [] });
    const followUp = { kind: "save", check: { roll: "save", statistic: affliction.statistic, basic: false, against: { dc: "fixed", value: affliction.dc } }, outcomes: { criticalSuccess: none(), success: none(), failure: stage(1), criticalFailure: stage(2) }, afflictionHandoff: affliction };
    const next = { ...rows };
    for (const [degree, row] of entries) {
        const lines = row.manualInstructions.filter((line) => !EXPOSED_LINE.test(said(line)));
        next[degree] = { ...row, followUps: [...(row.followUps ?? []), followUp], ...(lines.length ? { manualInstructions: lines } : { manualInstructions: undefined }) };
    }
    const result = { ...plan, resolution: { ...plan.resolution, outcomes: next } };
    if (result.partial && leftOver(result)) {
        delete result.partial;
        result.automation = { ...(result.automation ?? {}), level: "automatic" };
    }
    return result;
}

// (Invisible until its user's Strike, Amulet of the Hellcat's Invisible Pounce: "You become Invisible, Stride up to your speed, and then make a
// melee Strike … After making the Strike, you are no longer invisible. If at any point during your Stride, you pass out of bright light, you
// are no longer invisible and must stop moving" — its Invisible on an Effect that the user's next Strike ends (endsOnStrike, scripts/
// ends-on-strike.js), the bright light's end in its words (the user's note-Effect rule), the Stride and Strike its own, a line of the card.
// 2026-10-26.)
const AFTER_STRIKE = /^After making the Strike, you are no longer invisible\.$/i;
const OUT_OF_LIGHT = /^If at any point during your Stride, you pass out of bright light, you are no longer invisible and must stop moving\.$/i;
const MAY_STRIKE = /^You may make a melee Strike if you have a target within reach\.$/i;
export const POUNCE_LINE = "Then Stride up to its Speed and make a melee Strike at the end of that movement (its own actions).";
function withInvisibleUntilStrike(plan) {
    const rows = plan?.resolution?.outcomes;
    if (plan?.resolution?.kind !== "check" || !(rows?.success?.effects ?? []).some((effect) => effect?.slug === "invisible") || !(plan.notes ?? []).some((note) => AFTER_STRIKE.test(said(note)))) return plan;
    const gone = (note) => AFTER_STRIKE.test(said(note)) || OUT_OF_LIGHT.test(said(note)) || MAY_STRIKE.test(said(note));
    const light = (plan.notes ?? []).some((note) => OUT_OF_LIGHT.test(said(note)));
    const notes = [...(plan.notes ?? []).filter((note) => !gone(note)), POUNCE_LINE];
    const effect = { name: "invisible until its Strike", words: `Invisible until after its next Strike${light ? "; if it passes out of bright light during its Stride, it's no longer invisible and must stop moving" : ""}`, rules: [{ key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.zJxUflt9np0q4yML", onDeleteActions: { granter: "cascade", grantee: "cascade" } }], duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" }, endsOnStrike: true };
    const success = { ...rows.success, effects: rows.success.effects.filter((entry) => entry?.slug !== "invisible") };
    const next = { ...plan, notes, resolution: { ...plan.resolution, outcomes: { ...rows, success } }, item: { ...(plan.item ?? {}), ruleEffects: [...(plan.item?.ruleEffects ?? []), effect] } };
    return next;
}

// (A Speed's end by what the card can't see, Buoyant Buckle's Flotation: "If the pouches take any damage (AC 10, Hardness 0), they quickly
// deflate, ending the effect" — in the Speed Effect's words, with its swimming only along the surface (the user's note-Effect rule). 2026-10-26.)
const DEFLATES = /^If the pouches take any damage \(AC (\d+), Hardness (\d+)\), they quickly deflate, ending the effect\.$/i;
function withSpeedNote(plan, html) {
    const speeds = plan?.item?.speeds ?? [];
    const found = [...(plan?.unread ?? []), ...(plan?.notes ?? [])].map((entry) => [entry, DEFLATES.exec(said(entry))]).find(([, match]) => match);
    if (speeds.length !== 1 || speeds[0].type !== "swim" || !found) return plan;
    const [entry, match] = found;
    const surface = /\bYou can swim only along the surface of the water while this is active\./i.test(plainOf(html));
    const note = `${surface ? "only along the water's surface; " : ""}it ends if the pouches take any damage (AC ${match[1]}, Hardness ${match[2]})`;
    const next = { ...plan, item: { ...plan.item, speeds: [{ ...speeds[0], note }] }, ...(plan.unread ? { unread: plan.unread.filter((one) => one !== entry) } : {}), ...(plan.notes ? { notes: plan.notes.filter((one) => one !== entry) } : {}) };
    if (next.notes && !next.notes.length) next.notes = undefined;
    if (next.partial && leftOver(next)) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}

// (Its Prone only for a creature on the ground, Drake Rifle (Fire)'s Drake Shot: "A target that isn't on the ground doesn't fall Prone" — the
// Strike's strike.groundedProne, its rows' Prone left off for a target above the ground as the riders apply, src/live/if-target.js.)
const GROUNDED = /^A target that isn't on the ground doesn't fall Prone\.$/i;
function withGroundedProne(plan) {
    const notes = plan?.strike?.notes ?? [];
    if (!notes.some((note) => GROUNDED.test(said(note)))) return plan;
    if (!Object.values(plan.resolution?.outcomes ?? {}).some((row) => (row?.effects ?? []).some((effect) => effect?.slug === "prone"))) return plan;
    const kept = notes.filter((note) => !GROUNDED.test(said(note)));
    const next = { ...plan, strike: { ...plan.strike, notes: kept, groundedProne: true } };
    const left = [...kept, ...(plan.notes ?? []), ...(plan.unread ?? []), ...Object.values(plan.resolution.outcomes).flatMap((row) => row?.manualInstructions ?? [])];
    if (next.partial && !left.length) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}

export function withRowReadings(given, html, item = null) {
    const plan = withSpeedNote(withInvisibleUntilStrike(withExposure(withGroundedProne(given), item?.system?.description?.value ?? html)), html);
    const outcomes = plan?.resolution?.outcomes;
    if (!outcomes || plan.builtin) return plan;
    let next = plan;
    // (Its notes, and what it didn't read — notes later.)
    let notes = [...(plan.notes ?? [])];
    let unread = [...(plan.unread ?? [])];
    let targetWords = null;
    const ruleEffects = [];
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
    // (Healing by its user's condition value: on the success row's heal.)
    // (Its sentences, not its notes: the honesty pass makes it a note only later, src/compiler/honest.js — its dice in byCondition trace it.)
    if (plan.resolution.kind === "check" && (rows.success?.effects ?? []).some((effect) => effect?.kind === "heal")) {
        for (const entry of plainOf(html).split(/(?<=[.!?])\s+(?=[A-Z])/)) {
            const match = SCALED_HEAL.exec(said(entry).trim());
            if (!match) continue;
            const steps = [...match[1].matchAll(new RegExp(SCALE_STEP.source, "gi"))];
            const slugs = new Set(steps.map((step) => step[2].toLowerCase()));
            if (slugs.size !== 1) continue;
            const byCondition = { slug: [...slugs][0], formulas: Object.fromEntries(steps.map((step) => [step[3], step[1]])) };
            rows.success = { ...rows.success, effects: rows.success.effects.map((effect) => (effect?.kind === "heal" ? { ...effect, byCondition } : effect)) };
            drop(said(entry));
        }
    }
    // (Concealed for its time, ended by a hostile action: the success row's.)
    if (plan.resolution.kind === "check" && (rows.success?.effects ?? []).some((effect) => effect?.slug === "concealed")) {
        const found = [...notes, ...unread].find((entry) => CONCEALED_UNTIL.test(said(entry)));
        if (found) {
            const duration = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
            rows.success = { ...rows.success, effects: rows.success.effects.map((effect) => (effect?.slug === "concealed" ? { ...effect, duration: effect.duration ?? duration } : effect)), noteEffects: [...(rows.success.noteEffects ?? []), { label: "Concealed", text: "It ends sooner once you use a hostile action.", duration }] };
            drop(said(found));
            if (!notes.includes(STRIDE_FIRST)) notes.push(STRIDE_FIRST);
        }
    }
    // (An investigator's way to use it, a line of the card.)
    if ([...notes, ...unread].some((entry) => said(entry) === INVESTIGATOR)) {
        unread = unread.filter((entry) => said(entry) !== INVESTIGATOR);
        if (!notes.some((entry) => said(entry) === INVESTIGATOR)) notes.push(INVESTIGATOR);
    }
    // (Its disbelief undone on a success: a note Effect on the creature on both successes, the GM's line gone.)
    if (plan.resolution.kind === "check" && (rows.success?.manualInstructions ?? []).some((line) => STILL_FOOLED.test(said(line)))) {
        const fooled = { label: "Still fooled", text: "It doesn't disbelieve the illusion after all.", duration: null };
        for (const degree of ["success", "criticalSuccess"]) if (rows[degree]) rows[degree] = { ...rows[degree], manualInstructions: (rows[degree].manualInstructions ?? []).filter((line) => !STILL_FOOLED.test(said(line))), noteEffects: [...(rows[degree].noteEffects ?? []), fooled] };
    }
    // (Its ignition's flat check: the card's, as it's thrown.)
    let ignite = null;
    if (plan.ownCheck?.kind === "attack") {
        const found = [...notes, ...unread].map((entry) => IGNITE.exec(said(entry))).find(Boolean);
        if (found) {
            ignite = Number(found[1]);
            drop(found[0]);
            for (const entry of [...notes, ...unread]) if (IGNITES_ONLY.test(said(entry))) drop(said(entry));
        }
    }
    // (A Fortitude bonus only to reduce the sickened condition: an Effect of PF2e's rules in place of the row's plain bonus.)
    const retch = [...notes, ...unread].find((entry) => RETCH_ONLY.test(said(entry)));
    const fortitude = (rows.success?.modifiers ?? []).find((modifier) => modifier?.selector === "fortitude" && modifier.type === "item");
    if (retch && fortitude && plan.resolution.kind === "check") {
        const words = `+${fortitude.value} item bonus to saves to reduce the sickened condition`;
        ruleEffects.push({ name: "saves against sickened", words, rules: [{ key: "FlatModifier", selector: "fortitude", type: "item", value: fortitude.value, predicate: ["action:retch"] }, { key: "Note", selector: "fortitude", title: words, text: `${words.charAt(0).toUpperCase()}${words.slice(1)}: add it when this save is to reduce it.`, predicate: ["self:condition:sickened"] }], duration: fortitude.duration ?? null });
        rows.success = { ...rows.success, modifiers: rows.success.modifiers.filter((modifier) => modifier !== fortitude), noteEffects: (rows.success.noteEffects ?? []).filter((entry) => !entry?.reminder) };
        const atOnce = [...CARD_LINES][0];
        if (!notes.includes(atOnce)) notes.push(atOnce);
        drop(said(retch));
        for (const entry of [...notes, ...unread]) if (CHOSEN_IN_REACH.test(said(entry)) || /^Sickened creatures have difficulty swallowing\b/i.test(said(entry))) drop(said(entry));
    }
    // (Its critical failure's Prone kept for its whole next turn: a note Effect on that row, its Prone the rows' own.)
    if (plan.resolution.kind === "save" && ["failure", "criticalFailure"].every((degree) => (rows[degree]?.effects ?? []).some((effect) => effect?.slug === "prone"))) {
        for (const entry of [...notes, ...unread]) {
            if (!STAYS_PRONE.test(said(entry))) continue;
            rows.criticalFailure = { ...rows.criticalFailure, noteEffects: [...(rows.criticalFailure.noteEffects ?? []), { label: "Stays Prone", text: "It must spend all three actions on its next turn remaining Prone.", duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" } }] };
            drop(said(entry));
        }
    }
    // (A save bonus against persistent damage alone: its note Effect, the reminder gone once all else is read — the flat check its recovery.)
    if (plan.resolution.kind === "check" && plan.item?.recovery && (rows.success?.noteEffects ?? []).some((entry) => entry?.reminder)) {
        const sentences = plainOf(html).split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim());
        const found = sentences.map((sentence) => [sentence, AGAINST_PERSISTENT.exec(sentence)]).find(([, match]) => match);
        const others = sentences.filter((sentence) => sentence !== found?.[0] && /\b(?:bonus|penalty|damage|save|saving throw|check|DC|Hit Points|condition)\b/i.test(sentence) && !/\battempt an? (?:DC \d+ )?flat check\b|\bflat\|dc:\d+|\bflat check to end\b/i.test(sentence) && !/^\s*Activate\b/.test(sentence));
        if (found && !others.length) {
            const [sentence, match] = found;
            const duration = { mode: "fixed", value: /^\d+$/.test(match[1]) ? Number(match[1]) : 1, unit: UNITS[match[2].toLowerCase().replace(/s$/, "")], expiry: "turn-start", anchor: "effect-start" };
            const note = { label: `+${match[3]}${match[4] ? ` ${match[4].toLowerCase()}` : ""} to ${match[5]} saves against persistent ${match[6].toLowerCase()} damage`, text: sentence.replace(/^In addition, /i, "").replace(/^./, (first) => first.toUpperCase()), duration };
            rows.success = { ...rows.success, noteEffects: [...rows.success.noteEffects.filter((entry) => !entry?.reminder), note] };
            drop(sentence);
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
    if (!targetWords && !ruleEffects.length && !ignite && notes.length === (plan.notes ?? []).length && unread.length === (plan.unread ?? []).length && Object.keys(rows).every((degree) => rows[degree] === outcomes[degree])) return plan;
    next = { ...plan, notes: notes.length ? notes : undefined, ...(plan.unread ? { unread } : {}), resolution: { ...plan.resolution, outcomes: rows }, ...(targetWords ? { targeting: { ...(plan.targeting ?? {}), target: targetWords } } : {}), ...(ruleEffects.length ? { item: { ...(plan.item ?? {}), ruleEffects: [...(plan.item?.ruleEffects ?? []), ...ruleEffects] } } : {}), ...(ignite ? { ownCheck: { ...plan.ownCheck, ignite } } : {}) };
    if (next.partial && leftOver(next)) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}

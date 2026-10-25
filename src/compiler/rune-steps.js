// An activation's damage by its weapon's own striking rune (2026-10-20): a third-party weapon's damage that rises to 6d6 with a greater
// striking rune and to 8d6 with a major one, Guiding Star's "The piercing damage increases to 6
// piercing damage with a greater striking rune and 8 piercing damage with a major striking rune". The item's runes are known as its plan is
// compiled (system.runes.striking: 2 greater, 3 major), so its damage is that step's, and the sentence is read. Pure.

const DICE_STEP = /\bdamage\b[^.]*?\bincreases? to (\d+d\d+) if [^.]*?\bhas an? greater striking rune,? (?:or|and) (?:to )?(\d+d\d+) if [^.]*?\bmajor striking rune\b[^.]*\./i;
const FLAT_STEP = /\b(?:The )?(\w+) damage increases to (\d+) \1 damage with a greater striking rune and (\d+) \1 damage with a major striking rune\./i;
// (Any sentence of a step by the striking rune — the Strike reader's own "If the club has a greater striking rune, increase the additional
// damage to 2d6" too: the item's rune decides it, not a rule left out.)
// (And a step by its potency rune, Screaming Pinion's "If the screaming pinion has a +3 potency rune, the DC increases to 35".)
export const RUNE_STEP_SENTENCE = /\b(?:has an? (?:greater|major) striking rune|with an? (?:greater|major) striking rune|for (?:a )?major striking|has an? \+\d potency rune, the DC increases to)\b/i;

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "");

// The formula with its first dice (or its number, for a flat step) the step's.
function stepped(formula, step) {
    return step.dice ? String(formula).replace(/\b\d+d\d+\b/, step.dice) : String(formula).replace(/^\(?(\d+)\)?(?=\[)/, String(step.flat));
}

// (And a DC and damage by its potency rune, Screaming Pinion's "If the screaming pinion has a +3 potency rune, the DC increases to 35 (…), and
// the damage increases to 10d10 sonic": the weapon's own rune decides it, 2026-10-25.)
const POTENCY_STEP = /\bIf the [\w' -]+? has an? \+(\d) potency rune, the DC increases to (\d+)(?: \([^)]*\))?, and the damage increases to (\d+d\d+)(?: \w+)?\./i;
function withPotencyStep(plan, text, item) {
    const step = POTENCY_STEP.exec(String(text ?? ""));
    if (!step || !plan?.resolution) return plan;
    const has = (Number(item?.system?.runes?.potency) || 0) >= Number(step[1]);
    const components = plan.resolution.sharedDamage?.components;
    const resolution = has
        ? { ...plan.resolution, ...(plan.resolution.check?.against?.dc === "fixed" ? { check: { ...plan.resolution.check, against: { ...plan.resolution.check.against, value: Number(step[2]) } } } : {}), ...(components?.length ? { sharedDamage: { ...plan.resolution.sharedDamage, components: components.map((component, index) => (index === 0 ? { ...component, formula: String(component.formula).replace(/\b\d+d\d+\b/, step[3]) } : component)) } } : {}) }
        : plan.resolution;
    const words = step[0].slice(0, 60);
    const notes = (plan.notes ?? []).filter((note) => !String(note?.text ?? note).includes(words));
    // (What its rune replaced, kept on the plan so the sentence that says it isn't counted a rule left out, src/compiler/honest.js.)
    const base = has ? { dc: plan.resolution.check?.against?.value ?? null, dice: /\b\d+d\d+\b/.exec(String(components?.[0]?.formula ?? ""))?.[0] ?? null } : null;
    const result = { ...plan, resolution, ...(plan.notes ? { notes: notes.length ? notes : undefined } : {}), ...(base ? { runeStep: { potency: Number(step[1]), replaced: base } } : {}) };
    if (!notes.length && !(plan.unread ?? []).length && plan.partial && !Object.values(resolution.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length)) {
        delete result.partial;
        result.automation = { ...(result.automation ?? {}), level: "automatic" };
    }
    return result;
}

// The plan with its damage at the weapon's step, its sentence no longer a note or a GM line. text: the activation's plain text; item: the weapon.
export function withRuneSteps(given, text, item) {
    const plan = withPotencyStep(given, text, item);
    const striking = Number(item?.system?.runes?.striking) || 0;
    const plain = String(text ?? "");
    const dice = DICE_STEP.exec(plain);
    const flat = !dice ? FLAT_STEP.exec(plain) : null;
    if (!plan?.resolution || (!dice && !flat)) return plan;
    const sentence = (dice ?? flat)[0];
    const step = striking >= 3 ? (dice ? { dice: dice[2] } : { flat: Number(flat[3]) }) : striking >= 2 ? (dice ? { dice: dice[1] } : { flat: Number(flat[2]) }) : null;
    const components = plan.resolution.sharedDamage?.components;
    const next = step && components?.length
        ? { ...plan, resolution: { ...plan.resolution, sharedDamage: { ...plan.resolution.sharedDamage, components: components.map((component, index) => (index === 0 ? { ...component, formula: stepped(component.formula, step) } : component)) } }, ...(plan.damageChoices?.length ? { damageChoices: plan.damageChoices.map((choice) => ({ ...choice, formula: stepped(choice.formula, step) })) } : {}) }
        : plan;
    // (Its sentence read: no longer a note, an unread line or a GM line.)
    const words = sentence.replace(/^Special\s+/i, "").slice(0, 60);
    const kept = (list) => (Array.isArray(list) ? list.filter((entry) => !said(entry).includes(words)) : list);
    const outcomes = next.resolution.outcomes ? Object.fromEntries(Object.entries(next.resolution.outcomes).map(([degree, row]) => [degree, row?.manualInstructions ? { ...row, manualInstructions: kept(row.manualInstructions) } : row])) : next.resolution.outcomes;
    for (const row of Object.values(outcomes ?? {})) if (row?.manualInstructions && !row.manualInstructions.length) delete row.manualInstructions;
    const notes = kept(next.notes);
    const unread = kept(next.unread);
    const left = [...(notes ?? []), ...(unread ?? []), ...Object.values(outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    const result = { ...next, resolution: { ...next.resolution, outcomes }, ...(notes ? { notes: notes.length ? notes : undefined } : {}), ...(unread ? { unread: unread.length ? unread : undefined } : {}) };
    if (!left.length && plan.partial) {
        delete result.partial;
        result.automation = { ...(result.automation ?? {}), level: "automatic" };
    }
    return result;
}

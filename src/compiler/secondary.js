// A use after the first, a candy's or chew's "Secondary Effect": Ginger Chew's "Secondary Effect [1] Effect Reduce your sickened value by 1,
// if any. The chew becomes inert", Crackling Bubble Gum's pop (a 15-foot cone, a basic Fortitude save), Silver Crescent's ray, Energizing
// Pill's reaction to a condition. Its block compiled as an activation is (src/compiler/permanent.js), its "Secondary Effect" heading its
// Activate line; the plan is the item module's builtin "ways": the item's own use, and that secondary effect whenever it comes — the card
// stays open (scripts/ways.js). One that can't be read stays the use's note. Pure.

import { compileActivations } from "./permanent.js";
import { plainText } from "./rows.js";

const HEADING = /<p>\s*<strong>\s*Secondary Effect\s*<\/strong>/i;
const plays = (plan) => Boolean(plan) && !plan.noteOnly && plan.builtin !== "no-effect" && plan.builtin !== "ways";

// The item's own Effect linked in a paragraph of its own at the text's end, after the secondary effect: Poison Fizz's "Effect: Poison Fizz",
// the candy's save bonus — the use's when the use links none of its own (Crackling Bubble Gum's "(Failure)" Effect after its pop is the
// pop's: its use links its own).
const TRAILING_EFFECTS = /(?:<p>\s*(?:@UUID\[Compendium\.pf2e\.equipment-effects\.Item\.\w+\]\{[^}]+\}\s*)+<\/p>\s*)+$/;
const EFFECT_LINK = /@UUID\[Compendium\.pf2e\.equipment-effects\.Item\.\w+\]/;

// The item's html → { use, secondary } (each its html), or null.
export function splitSecondary(html) {
    const text = String(html ?? "");
    const at = HEADING.exec(text);
    if (!at) return null;
    let use = text.slice(0, at.index);
    let secondary = text.slice(at.index).replace(/<strong>\s*Secondary Effect\s*<\/strong>/i, "<strong>Activate</strong>");
    const trailing = TRAILING_EFFECTS.exec(secondary);
    if (trailing && !EFFECT_LINK.test(use) && !/\{Effect: [^}]*\(/.test(trailing[0])) {
        use = `${use}${trailing[0]}`;
        secondary = secondary.slice(0, trailing.index);
    }
    return { use, secondary };
}

// The use's plan, the item, and the compiler for the use's own words (src/compiler/index.js compileItem, its text up to the secondary
// effect: what the whole text read may have taken from the secondary's) → the ways plan with its secondary effect, the use's plan with it
// as a note, or the plan as it was.
export function withSecondary(plan, item, options = {}, compileUse = null) {
    const split = item?.type === "consumable" ? splitSecondary(item?.system?.description?.value) : null;
    if (!plan || !split || plan.builtin === "ways") return plan;
    const own = compileUse ? compileUse({ ...item, system: { ...(item.system ?? {}), description: { value: split.use } } }) : null;
    if (own) plan = own;
    // (The use's own notes without the secondary effect's words, which a row read leaves there.)
    const secondaryWords = plainText(split.secondary).replace(/^\s*Activate\b\s*/i, "").trim();
    const theirs = (entry) => /^\s*Secondary Effect\b/i.test(String(entry)) || (secondaryWords && String(entry).includes(secondaryWords.slice(0, 60)));
    const kept = (list) => (Array.isArray(list) ? list.filter((entry) => !theirs(entry)) : list);
    const notes = kept(plan.notes);
    const unread = kept(plan.unread);
    const left = [...(notes ?? []), ...(unread ?? [])];
    const use = { ...plan, ...(plan.notes ? { notes: notes.length ? notes : undefined } : {}), ...(plan.unread ? { unread: unread.length ? unread : undefined } : {}), ...(plan.partial && !left.length ? { partial: undefined } : {}) };
    const [entry] = compileActivations({ ...item, type: "equipment", system: { ...(item.system ?? {}), description: { value: split.secondary } } }, options);
    const secondary = entry?.plan ?? null;
    if (!plays(secondary)) return { ...use, notes: [...(use.notes ?? []), `Secondary effect: ${secondaryWords}`], partial: true };
    const ways = [
        { name: "Its use", html: split.use, plan: use },
        { name: "Its secondary effect", html: split.secondary, plan: { ...secondary, item: { ...(secondary.item ?? {}), type: item.type } } }
    ];
    const partial = ways.some((way) => way.plan.partial);
    return { ...use, builtin: "ways", automation: { level: partial ? "guided" : "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways, ...(partial ? { partial: true } : { partial: undefined }), notes: undefined, unread: undefined };
}

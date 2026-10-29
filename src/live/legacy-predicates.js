// An item's rules whose predicates are in the old form PF2e no longer reads (2026-10-29, the user's answer to question 9): an object
// { all, any, not } in place of PF2e's array of statements — Battlezoo's Runebranded Hide, Cloak of Eyes, Labyrinth and Tree. PF2e ignores
// such a rule; rewritten into the array form, it reads as its author meant: all's statements as they are, any's as { or }, not's as
// { not } (one) or { nor } (several). Every predicate in a rule is rewritten (its own, a ChoiceSet choice's, an aura effect's, a RollOption's
// disabledIf). Pure.

const OLD_KEYS = new Set(["all", "any", "not"]);
const PREDICATE_KEYS = new Set(["predicate", "disabledIf"]);
const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);

// Whether the value is an old-form predicate: a plain object whose keys are all, any or not, none of them else.
export const isOldPredicate = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0 && Object.keys(value).every((key) => OLD_KEYS.has(key));

// The old form → PF2e's array of statements.
export function predicateFromOld(old) {
    const all = list(old.all);
    const any = list(old.any);
    const not = list(old.not);
    return [...all, ...(any.length > 1 ? [{ or: any }] : any), ...(not.length > 1 ? [{ nor: not }] : not.map((statement) => ({ not: statement })))];
}

// A rule (or anything in it) with each old-form predicate rewritten → { value, changed }.
function rewrite(value) {
    if (Array.isArray(value)) {
        const parts = value.map(rewrite);
        return parts.some((part) => part.changed) ? { value: parts.map((part) => part.value), changed: true } : { value, changed: false };
    }
    if (!value || typeof value !== "object") return { value, changed: false };
    let changed = false;
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
        if (PREDICATE_KEYS.has(key) && isOldPredicate(entry)) {
            out[key] = predicateFromOld(entry);
            changed = true;
            continue;
        }
        const part = rewrite(entry);
        out[key] = part.value;
        changed ||= part.changed;
    }
    return changed ? { value: out, changed } : { value, changed: false };
}

// The item's rules with their old-form predicates rewritten, or null when it has none.
export function rulesWithoutOldPredicates(rules) {
    const { value, changed } = rewrite(Array.isArray(rules) ? rules : []);
    return changed ? value : null;
}

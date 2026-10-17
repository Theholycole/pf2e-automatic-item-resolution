// A time's first critical failure made a failure, then gone — Lockpicker's Oil's "In addition, the first time during that
// minute that anyone gets a critical failure on the Thievery check, they get a failure instead": plan.item.firstDegree, its
// user's Effect with PF2e's AdjustDegreeOfSuccess on that check, with the predicate and time of the bonus the item gives the
// same check, which the first roll it changes removes (scripts/first-degree.js). "Anyone" else stays the table's. Pure.

const FIRST = /\bthe first time during that (minute|hour|round) that anyone gets a critical failure on the (\w+) check, they get a failure instead\b/i;

// The item's text (plain) and the modifiers its row reads → { selector, adjustment, predicate?, duration } or null.
export function firstDegreeOf(text, modifiers = []) {
    const match = FIRST.exec(String(text ?? ""));
    if (!match) return null;
    const selector = match[2].toLowerCase();
    const base = (modifiers ?? []).find((modifier) => modifier.selector === selector);
    const duration = base?.duration ?? { mode: "fixed", value: 1, unit: `${match[1].toLowerCase()}s`, expiry: "turn-start" };
    return { selector, adjustment: { criticalFailure: "one-degree-better" }, ...(base?.predicate?.length ? { predicate: base.predicate } : {}), duration };
}

// The sentence it reads, off the plan's unread list.
export const firstDegreeSentence = (sentence) => FIRST.test(String(sentence ?? ""));

// Its Effect's rule.
export function firstDegreeRules(first, label = null) {
    return [{ key: "AdjustDegreeOfSuccess", selector: first.selector, adjustment: first.adjustment, ...(first.predicate ? { predicate: first.predicate } : {}), ...(label ? { label } : {}) }];
}

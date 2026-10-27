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

// Its Effect's rule, one for each check it's for.
export function firstDegreeRules(first, label = null) {
    return [].concat(first.selectors ?? first.selector).map((selector) => ({ key: "AdjustDegreeOfSuccess", selector, adjustment: first.adjustment, ...(first.predicate ? { predicate: first.predicate } : {}), ...(label ? { label } : {}) }));
}

// (Or a failure made a success once, its recipient's, 2026-10-27: Heartening Missive (Butterfly)'s "Once during the next 24 hours, when the
// recipient fails a Diplomacy or Performance check, they can improve the result from a failure to a success or from a critical failure to a
// failure. This is a fortune effect." → { selector, selectors, adjustment: { failure, criticalFailure }, duration, fortune } — its recipient's
// Effect, gone with the first roll it changes.)
const ONCE_BETTER = /\bOnce during the next (\d+) (hours?|minutes?|rounds?), when the recipient fails an? (\w+)(?: or (\w+))? check, they can improve the result from a failure to a success or from a critical failure to a failure\. This is a fortune effect\./i;
export function onceBetterOf(sentence) {
    const match = ONCE_BETTER.exec(String(sentence ?? ""));
    if (!match) return null;
    const selectors = [match[3], match[4]].filter(Boolean).map((word) => word.toLowerCase());
    return { selector: selectors[0], selectors, adjustment: { failure: "one-degree-better", criticalFailure: "one-degree-better" }, duration: { mode: "fixed", value: Number(match[1]), unit: `${match[2].toLowerCase().replace(/s$/, "")}s`, expiry: "turn-start" }, fortune: true };
}

// A note-only plan whose text says it → the plan for its recipient (the creature its presser targets) with that Effect, or the same plan. Its
// missive's delivery, to the recipient far away, the card's line: applied when it arrives.
const FLIES = /\bfolds itself into the shape of an animal and Flies at a speed of (\d+) feet \(about (\d+) miles per hour\) toward the location for up to (\d+) hours\b/i;
export function withOnceBetter(plan, text) {
    const first = plan?.noteOnly && plan.resolution?.check?.roll === "automatic" ? onceBetterOf(text) : null;
    if (!first) return plan;
    const flies = FLIES.exec(String(text ?? ""));
    const { noteOnly, ...rest } = plan;
    return {
        ...rest,
        automation: { ...(plan.automation ?? {}), level: "automatic" },
        targeting: { target: "1 creature", range: "touch", area: null },
        notes: [...(plan.notes ?? []), ...(flies ? [`It flies to its recipient (${flies[1]} feet a round, about ${flies[2]} miles an hour, for up to ${flies[3]} hours): use the card when it arrives, targeting the recipient.`] : [])],
        item: { ...(plan.item ?? {}), recipient: "targets", firstDegree: first }
    };
}

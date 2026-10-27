// An activation's own wait before it's used again (2026-10-26, docs/needs.md "Use limits of its own"): Retrieval Belt's "Neither Store Item
// nor Retrieve Item can be activated again for 1 minute", Vine Whip's "You can't Activate the item again for 10 minutes", Animated's "can't be
// Set Free again for 10 minutes", Rod of Cancellation's "can't be activated again for 2d6 hours", Oathbow's "you can't activate it again for 7
// days". The plan's trigger.recharge — the ability compiler's own shape for "You can't use this activation again for 1d4 rounds" —
// { formula | value, unit, shared? }: live play keeps when each activation is usable again on the item (scripts/activations.js) and warns
// the GM when it's used before then, as a frequency's. Not one that starts when its effect ends ("Once deactivated", "When the activation
// ends"), waits for something other than time, or is another creature's. Pure.

const UNITS = { round: "rounds", minute: "minutes", hour: "hours", day: "days", week: "weeks" };
const TIME = String.raw`(\d+d\d+|\d+|one|an?) (round|minute|hour|day|week)s?`;
const OWN = [
    // "Neither Store Item nor Retrieve Item can be activated again for 1 minute": both.
    new RegExp(String.raw`^Neither ([A-Z][\w' ]+?) nor ([A-Z][\w' ]+?) can be activated again for ${TIME}\.$`, "i"),
    // "the rod of cancellation can't be activated again for 2d6 hours", "Once activated, the rod can't be activated again for 1d4 hours".
    new RegExp(String.raw`^(?:Once activated, |Regardless of the result, )?(?:the [\w' -]+?|it) (?:can't|cannot) be (?:activated|used) again for ${TIME}\.$`, "i"),
    // "You can't Activate the item again for 10 minutes", "After you activate the bow, you can't activate it again for 7 days", "You can't
    // Retrieve Item again for 1 minute", "After you use this action, you can't use it again for 10 minutes".
    new RegExp(String.raw`^(?:After you (?:activate|use) (?:the [\w' -]+?|this action|it), )?you (?:can't|cannot) (?:Activate the item|activate it|use it|use this (?:activation|ability)|([A-Z][\w' ]+?)) again for ${TIME}\.$`, "i"),
    // "The weapon falls to the ground and can't be Set Free again for 10 minutes": that activation's name.
    new RegExp(String.raw`\bcan't be ([A-Z][\w' ]+?) again for ${TIME}\.$`)
];
const COUNT = { one: 1, a: 1, an: 1 };
const SENTENCES = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);

// A sentence → { formula | value, unit, shared? } or null.
export function readCooldown(sentence) {
    const text = String(sentence ?? "").trim();
    for (const [index, pattern] of OWN.entries()) {
        const match = pattern.exec(text);
        if (!match) continue;
        const [amount, unit] = match.slice(-2);
        const names = index === 0 ? [match[1], match[2]] : index === 2 && match[1] ? [match[1]] : index === 3 ? [match[1]] : [];
        const time = /d/.test(amount) ? { formula: amount } : { value: COUNT[amount.toLowerCase()] ?? Number(amount) };
        return { ...time, unit: UNITS[unit.toLowerCase()], ...(names.length ? { names: names.map((name) => name.trim()) } : {}) };
    }
    return null;
}

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const flat = (html) => String(html ?? "").replace(/\[\[\/\w+ ([^\]#]+?)(?:\s*#[^\]]*)?\]\](?:\{([^}]*)\})?/g, (all, formula, label) => label ?? formula.trim()).replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// The plan, its activation's html and name → the plan with trigger.recharge (and the names it shares the wait with), its sentence no longer a
// note; the same plan when there's none or nothing to carry it.
export function withCooldown(plan, html, name = null) {
    if (!plan || plan.builtin === "no-effect" || plan.noteOnly) return plan;
    // (A paragraph's end ends its sentence: Madcap Top's "The top can't be activated again for 1d4 hours" before its table, no full stop.)
    const sentences = SENTENCES(flat(String(html ?? "").replace(/([^.!?:\s>])\s*<\/p>/g, "$1.</p>")).replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, ""));
    for (const sentence of sentences) {
        const read = readCooldown(sentence);
        if (!read) continue;
        // (Named, it must name this activation: "You can't Retrieve Item again" on Retrieve Item, not another's wait.)
        const { names, ...time } = read;
        if (names?.length && name && !names.some((one) => one.toLowerCase() === String(name).toLowerCase())) return plan;
        const shared = (names ?? []).filter((one) => !name || one.toLowerCase() !== String(name).toLowerCase());
        const gone = (entry) => said(entry).replace(/\.$/, "") === sentence.replace(/\.$/, "") || said(entry).includes(sentence.replace(/\.$/, ""));
        const notes = (plan.notes ?? []).filter((entry) => !gone(entry));
        const unread = (plan.unread ?? []).filter((entry) => !gone(entry));
        const next = { ...plan, trigger: { ...(plan.trigger ?? {}), recharge: plan.trigger?.recharge ?? { ...time, ...(shared.length ? { shared } : {}) } }, notes: notes.length ? notes : undefined, ...(plan.unread ? { unread } : {}) };
        const left = [...notes, ...unread, ...Object.values(next.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
        if (next.partial && !left.length) {
            delete next.partial;
            next.automation = { ...(next.automation ?? {}), level: "automatic" };
        }
        return next;
    }
    return plan;
}

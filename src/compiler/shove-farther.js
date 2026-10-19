// A Shove pushed farther, Avalanche Boots' free action after a successful one: "If the Shove was a success, you push your opponent up to
// 10 feet instead of 5 feet", on a critical success up to 20 feet, then Prone if its user likes. The ways card's buttons — after a success,
// after a critical success, after a critical success with the Prone — each the core's automatic row at the creature the presser targets:
// the rest of the push (PF2e's Shove already pushed 5 feet, or 10 on a critical success) and the Prone. Pure.

const FARTHER = /\bIf the Shove was a success, you push your opponent up to (\d+) feet instead of (\d+) feet\. If the Shove was a critical success, you push your opponent up to (\d+) feet, and you can then choose to knock them Prone\./i;
// (PF2e's Shove: 10 feet on a critical success.)
const CRITICAL_PUSH = 10;

// The activation's html, its base → the ways plan, or null.
export function shoveFartherPlan(html, base) {
    const text = String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const farther = FARTHER.exec(text);
    if (!farther) return null;
    const [, success, normal, critical] = farther.map(Number);
    const none = { mode: "none", multiplier: 0, sourceComponentIds: [] };
    const frequency = base?.trigger?.frequency ? { frequency: base.trigger.frequency } : {};
    const row = (distance, prone) => ({
        ...base,
        automation: { level: "automatic" },
        targeting: { target: "1 creature", range: null, area: null },
        trigger: { event: "use", ...frequency },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: none, effects: prone ? [{ kind: "condition", slug: "prone", value: null, duration: null }] : [], modifiers: [], forcedMovement: { kind: "push", distance, upTo: true, optional: false, direction: "away" } } } }
    });
    return {
        ...base,
        builtin: "ways",
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use", ...frequency },
        ways: [
            { name: `After a success: ${success - normal} feet more`, html: String(html ?? ""), plan: row(success - normal, false) },
            { name: `After a critical success: ${critical - CRITICAL_PUSH} feet more`, html: String(html ?? ""), plan: row(critical - CRITICAL_PUSH, false) },
            { name: `After a critical success: ${critical - CRITICAL_PUSH} feet more, and Prone`, html: String(html ?? ""), plan: row(critical - CRITICAL_PUSH, true) }
        ],
        once: true
    };
}

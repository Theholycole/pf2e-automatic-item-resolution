// An activation that raises its user's shield (2026-10-26): Shield of Snakes' Snap Up, "The shield of snakes moves into position, allowing
// you to Raise the Shield" — PF2e's own Raise a Shield for its user on the item card's Apply (plan.raiseShield, scripts/live.js). One
// that reads nothing else becomes its own card; an item card's own plan gets it beside what it does. Pure.

const RAISE = /\b(?:allowing you to|you) Raise (?:the|your|a) Shield\b/i;
const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const SENTENCES = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// The plan (or none), the activation's html, its base, whether it's played on the item card (route "item") → the plan with the raise.
export function withRaiseShield(plan, html, base, { ownCard = false } = {}) {
    const body = plainOf(html).replace(/^.*?\bEffect\b\s*/s, "");
    const sentence = SENTENCES(body).find((one) => RAISE.test(one));
    if (!sentence || plan?.raiseShield) return plan;
    // (Only the raise in its sentence: Shield of Snakes'. Shield of Endurance's shield's temporary Hit Points stay its note.)
    const alone = !/\band\b[^.]*\b(?:gains?|Stride|Strike|deals?)\b/i.test(sentence.slice(sentence.search(RAISE)));
    const empty = !plan || plan.noteOnly || plan.builtin === "no-effect";
    if (empty && alone && SENTENCES(body).length === 1) {
        return { ...base, builtin: undefined, noteOnly: undefined, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(base?.trigger ?? {}), event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, raiseShield: true };
    }
    if (!empty && ownCard) return { ...plan, raiseShield: true };
    return plan;
}

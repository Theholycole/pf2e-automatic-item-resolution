// An activation that raises its user's shield (2026-10-26): Shield of Snakes' Snap Up, "The shield of snakes moves into position, allowing
// you to Raise the Shield" — PF2e's own Raise a Shield for its user on the item card's Apply (plan.raiseShield, scripts/live.js). One
// that reads nothing else becomes its own card; an item card's own plan gets it beside what it does. Shield of Endurance's "You Raise the Shield,
// and it gains 10 temporary Hit Points that last for 1 minute" (2026-10-26): the raise, and the shield's temporary Hit Points a note Effect on
// its user for that time — PF2e gives a shield none, so its damage comes off them by hand. Pure.

// ("… and it gains 10 temporary Hit Points that last for 1 minute.")
const SHIELD_TEMP = /^You Raise the Shield, and it gains (\d+) temporary Hit Points that last for (\d+|one|an?) (rounds?|minutes?)\.$/i;
const UNITS = { round: "rounds", minute: "minutes" };

const RAISE = /\b(?:allowing you to|you) Raise (?:the|your|a) Shield\b/i;
const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const SENTENCES = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// The plan (or none), the activation's html, its base, whether it's played on the item card (route "item") → the plan with the raise.
export function withRaiseShield(plan, html, base, { ownCard = false } = {}) {
    const body = plainOf(html).replace(/^.*?\bEffect\b\s*/s, "");
    const sentence = SENTENCES(body).find((one) => RAISE.test(one));
    if (!sentence || plan?.raiseShield) return plan;
    // (Only the raise in its sentence: Shield of Snakes'; or the shield's temporary Hit Points beside it, Shield of Endurance's — a note Effect.)
    const temp = SHIELD_TEMP.exec(sentence);
    const alone = Boolean(temp) || !/\band\b[^.]*\b(?:gains?|Stride|Strike|deals?)\b/i.test(sentence.slice(sentence.search(RAISE)));
    const empty = !plan || plan.noteOnly || plan.builtin === "no-effect";
    const note = temp ? { label: `Shield: ${temp[1]} temporary Hit Points`, text: `Its raised shield has ${temp[1]} temporary Hit Points: damage to the shield comes off them first (by hand; PF2e gives a shield none).`, duration: { mode: "fixed", value: /^\d+$/.test(temp[2]) ? Number(temp[2]) : 1, unit: UNITS[temp[3].toLowerCase().replace(/s$/, "")], expiry: "turn-start", anchor: "effect-start" } } : null;
    if (empty && alone && SENTENCES(body).length === 1) {
        return { ...base, builtin: undefined, noteOnly: undefined, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(base?.trigger ?? {}), event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), ...(note ? { noteEffects: [note] } : {}) } } }, raiseShield: true };
    }
    if (!empty && ownCard) return { ...plan, raiseShield: true };
    return plan;
}

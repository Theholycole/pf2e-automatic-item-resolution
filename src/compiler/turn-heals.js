// Healing at the start of each of its user's turns for a while, unless a damage type came first (2026-10-27): Infernal Health's "For 6 rounds,
// at the start of your turn each round, you recover 25 Hit Points unless you took spirit damage since the start of your previous turn". Not
// PF2e's fast healing, which can't be stopped by a damage type: a ruleEffect { turnHeal { formula, at: "start", unless } } for its time —
// scripts/turn-heal.js heals at each turn's start (pf2e.startTurn), and a damage of that type marks the Effect, so the next start heals none.
// The sentence is then no leftover. Pure.

const START_HEAL = /^For (\d+) rounds, at the start of your turn each round, you recover (\d+) Hit Points unless you took (\w+) damage since the start of your previous turn\.$/i;

// The plan and its activation's text (plain) → the plan with the Effect, or the same plan.
export function withStartTurnHeal(plan, text) {
    if (!plan || plan.builtin) return plan;
    const sentences = String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim());
    const said = sentences.find((sentence) => START_HEAL.test(sentence));
    if (!said) return plan;
    const [, rounds, amount, type] = START_HEAL.exec(said);
    const entry = {
        name: `${amount} Hit Points each turn`,
        words: `At the start of each of its turns, it recovers ${amount} Hit Points, unless it took ${type.toLowerCase()} damage since the start of its previous turn`,
        rules: [],
        // (Its time to the end of its last such turn, so the last start-of-turn healing comes before it expires.)
        duration: { mode: "fixed", value: Number(rounds), unit: "rounds", expiry: "turn-end", anchor: "effect-start" },
        turnHeal: { formula: amount, at: "start", unless: type.toLowerCase() }
    };
    const unread = (plan.unread ?? []).filter((sentence) => String(sentence).trim() !== said);
    const notes = (plan.notes ?? []).filter((note) => String(typeof note === "string" ? note : note?.text ?? "").trim() !== said);
    const left = unread.length || notes.length;
    // (Not PF2e's fast healing as well, which the rows read from the same sentence without its "unless": this instead.)
    const fastHealing = (plan.fastHealing ?? []).filter((heal) => !(Number(heal.value) === Number(amount) && heal.duration?.value === Number(rounds)));
    return {
        ...plan,
        ...(plan.fastHealing ? { fastHealing: fastHealing.length ? fastHealing : undefined } : {}),
        ruleEffects: [...(plan.ruleEffects ?? []), entry],
        ...(plan.unread ? { unread: unread.length ? unread : undefined } : {}),
        ...(plan.notes ? { notes: notes.length ? notes : undefined } : {}),
        ...(plan.partial && !left ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}

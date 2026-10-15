// The readied-roll card (src/compiler/fortune.js, src/compiler/readied-bonus.js): an item that has its user roll their
// next roll of a kind twice and keep the better (Sunweave's initiative, Gorum's Tear's attack roll), or that gives its user
// a bonus for a moment (Eclipse's +2 to the Stealth check, Sparkwarden's +1 to AC and saves and resistance 2 for the
// turn). Apply gives the user an Effect with PF2e's own rules — RollTwice, or FlatModifier and Resistance — for that roll
// or that long; PF2e removes a RollTwice Effect after its roll, and scripts/fortune.js removes one for a single roll
// after that roll. Pure; the ability module's classes.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const MODULE_KEY = "rollTwice";
export const isFortune = (plan) => (plan?.builtin === "roll-twice" && Boolean(plan.rollTwice?.selector)) || (plan?.builtin === "readied-bonus" && Boolean(plan.bonus?.modifiers?.length || plan.bonus?.degree));

const ROLL_WORDS = { initiative: "initiative roll", "attack-roll": "attack roll", "saving-throw": "saving throw", "skill-check": "skill check", perception: "Perception check", fortitude: "Fortitude save", reflex: "Reflex save", will: "Will save", ac: "AC" };
const actionWords = (predicate) => (predicate?.[0]?.or ?? []).map((option) => String(option).replace(/^action:/, "").replace(/-/g, " ")).join(", ");
const nameOf = (selector) => ROLL_WORDS[selector] ?? (/-dc$/.test(selector) ? `${selector.charAt(0).toUpperCase()}${selector.slice(1, -3)} DC` : `${selector.charAt(0).toUpperCase()}${selector.slice(1)} check`);

// The roll in words: "initiative roll", "Athletics check (force open, reposition, shove)".
export function rollWords(rollTwice) {
    const actions = actionWords(rollTwice.predicate);
    return actions ? `${nameOf(rollTwice.selector)} (${actions})` : nameOf(rollTwice.selector);
}

const DEGREE_WORDS = { all: "one degree better", success: "a success becomes a critical success", criticalFailure: "a critical failure becomes a failure" };

// A bonus in words: "+1 status bonus to AC and saving throws, resistance 2 to damage", "Performance check: a success becomes a
// critical success".
export function bonusWords(bonus) {
    const [first] = bonus.modifiers;
    const targets = bonus.modifiers.map((modifier) => nameOf(modifier.selector)).join(" and ");
    const actions = first ? actionWords(first.predicate) : "";
    const degree = bonus.degree ? `${nameOf(bonus.degree.selector)}${actionWords(bonus.degree.predicate) ? ` (${actionWords(bonus.degree.predicate)})` : ""}: ${Object.keys(bonus.degree.adjustment).map((key) => DEGREE_WORDS[key]).join(", ")}` : null;
    return [first ? `+${first.value} ${first.type} bonus to ${targets}${actions ? ` (${actions})` : ""}` : null, bonus.resistance ? `resistance ${bonus.resistance.value} to damage` : null, degree].filter(Boolean).join(", ");
}

// What the card says it gives: "next initiative roll: roll twice, take the better" / "+2 status bonus to Stealth check, for that roll".
export function readiedWords(plan) {
    if (plan.builtin === "roll-twice") return `next ${rollWords(plan.rollTwice)}: roll twice, take the better`;
    const bonus = plan.bonus;
    const until = bonus.spend?.length ? "for the next such roll" : bonus.duration?.expiry === "turn-start" ? "until the start of the next turn" : bonus.duration?.value ? "until the end of the next turn" : "until the end of this turn";
    return `${bonusWords(bonus)}, ${until}`;
}

export function createFortuneCard({ plan, item, user }) {
    return { kind: "fortune", status: "open", plan, item, user, results: [] };
}

// The Effect's rules: PF2e's RollTwice (removed after its roll), or a FlatModifier per bonus and a Resistance.
export function readiedRules(plan) {
    if (plan.builtin === "roll-twice") {
        const rollTwice = plan.rollTwice;
        return [{ key: "RollTwice", selector: rollTwice.selector, keep: rollTwice.keep ?? "higher", removeAfterRoll: true, ...(rollTwice.predicate ? { predicate: rollTwice.predicate } : {}) }];
    }
    const label = plan.source?.name ?? null;
    return [
        ...plan.bonus.modifiers.map((modifier) => ({ key: "FlatModifier", selector: modifier.selector, type: modifier.type, value: modifier.value, ...(label ? { label } : {}), ...(modifier.predicate ? { predicate: modifier.predicate } : {}) })),
        ...(plan.bonus.resistance ? [{ key: "Resistance", type: plan.bonus.resistance.type, value: plan.bonus.resistance.value }] : []),
        ...(plan.bonus.degree ? [{ key: "AdjustDegreeOfSuccess", selector: plan.bonus.degree.selector, adjustment: plan.bonus.degree.adjustment, ...(label ? { label } : {}), ...(plan.bonus.degree.predicate ? { predicate: plan.bonus.degree.predicate } : {}) }] : [])
    ];
}

// The Effect on the user: its rules, for its roll (a minute at most, should the roll not come) or its time.
export function fortuneEffectSource({ state, img = null, worldTime = 0, initiative = null, moduleId }) {
    const plan = state.plan;
    const fortune = plan.builtin === "roll-twice";
    const spend = fortune ? [plan.rollTwice.selector] : plan.bonus.spend ?? [];
    const duration = fortune || spend.length ? { value: 1, unit: "minutes", expiry: "turn-start" } : plan.bonus.duration;
    return {
        name: `${state.item.name}: ${fortune ? "roll twice" : "bonus"}`,
        type: "effect",
        img: img ?? (fortune ? "icons/svg/d20-highlight.svg" : "icons/svg/upgrade.svg"),
        flags: { [moduleId]: { [MODULE_KEY]: { item: state.item, user: state.user, selector: spend[0] ?? null, spend } } },
        system: {
            description: { value: `<p>${escape(readiedWords(plan))}.${(plan.notes ?? []).length ? ` ${escape(plan.notes.join(" "))}` : ""}</p>` },
            duration: { ...duration, sustained: false },
            start: { value: worldTime, initiative },
            rules: readiedRules(plan)
        }
    };
}

export function fortuneCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const fortune = state.plan.builtin === "roll-twice";
    const notes = open && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">${fortune ? "Roll it twice" : "Gain the bonus"}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to apply it.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${fortune ? "Fortune" : "Bonus"}</span></header><p class="aar-actions">${escape(state.user.name)}'s ${escape(readiedWords(state.plan))}.</p>${notes}${results}${controls}</section>`;
}

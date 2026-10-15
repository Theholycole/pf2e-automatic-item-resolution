// The fortune card (src/compiler/fortune.js): an item that has its user roll their next roll of a kind twice and keep the
// better (Sunweave's initiative, Kinetic Wraps of Strength's Athletics, Gorum's Tear's attack roll). Apply gives the user
// an Effect with PF2e's own RollTwice rule for that roll; PF2e rolls it twice and removes the Effect after that roll
// (scripts/fortune.js removes it too, should PF2e's setting not). Pure; the ability module's classes.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const MODULE_KEY = "rollTwice";
export const isFortune = (plan) => plan?.builtin === "roll-twice" && Boolean(plan.rollTwice?.selector);

const ROLL_WORDS = { initiative: "initiative roll", "attack-roll": "attack roll", "saving-throw": "saving throw", "skill-check": "skill check", perception: "Perception check", fortitude: "Fortitude save", reflex: "Reflex save", will: "Will save" };
const actionWords = (predicate) => (predicate?.[0]?.or ?? []).map((option) => String(option).replace(/^action:/, "").replace(/-/g, " ")).join(", ");

// The roll in words: "initiative roll", "Athletics check (force open, reposition, shove)".
export function rollWords(rollTwice) {
    const name = ROLL_WORDS[rollTwice.selector] ?? `${rollTwice.selector.charAt(0).toUpperCase()}${rollTwice.selector.slice(1)} check`;
    const actions = actionWords(rollTwice.predicate);
    return actions ? `${name} (${actions})` : name;
}

export function createFortuneCard({ plan, item, user }) {
    return { kind: "fortune", status: "open", plan, item, user, results: [] };
}

// The Effect on the user: PF2e's RollTwice for that roll, removed after it; a minute at most, should the roll not come.
export function fortuneEffectSource({ state, img = null, worldTime = 0, initiative = null, moduleId }) {
    const rollTwice = state.plan.rollTwice;
    return {
        name: `${state.item.name}: roll twice`,
        type: "effect",
        img: img ?? "icons/svg/d20-highlight.svg",
        flags: { [moduleId]: { [MODULE_KEY]: { item: state.item, user: state.user, selector: rollTwice.selector } } },
        system: {
            description: { value: `<p>The next ${escape(rollWords(rollTwice))}: roll twice and take the better result (a fortune effect).${(state.plan.notes ?? []).length ? ` ${escape(state.plan.notes.join(" "))}` : ""}</p>` },
            duration: { value: 1, unit: "minutes", expiry: "turn-start", sustained: false },
            start: { value: worldTime, initiative },
            rules: [{ key: "RollTwice", selector: rollTwice.selector, keep: rollTwice.keep ?? "higher", removeAfterRoll: true, ...(rollTwice.predicate ? { predicate: rollTwice.predicate } : {}) }]
        }
    };
}

export function fortuneCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const notes = open && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Roll it twice</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to apply it.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">Fortune</span></header><p class="aar-actions">${escape(state.user.name)}'s next ${escape(rollWords(state.plan.rollTwice))}: roll twice, take the better.</p>${notes}${results}${controls}</section>`;
}

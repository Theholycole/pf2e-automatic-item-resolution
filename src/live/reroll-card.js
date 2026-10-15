// The reroll card (src/compiler/rerolls.js): an item that rerolls the roll that triggered it. Apply finds that roll in
// the recent chat — the user's latest save, check or attack roll not rerolled yet, or for Mail of Luck the latest attack
// roll at the user — and PF2e rerolls it (game.pf2e.Check.rerollFromMessage), keeping the new, the higher or the lower
// result as the item says (scripts/rerolls.js). Pure; the ability module's classes.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// PF2e's check messages by what the item rerolls.
export const CHECK_TYPES = Object.freeze({
    save: ["saving-throw"],
    attack: ["attack-roll"],
    check: ["skill-check", "perception-check", "flat-check", "counteract-check"],
    roll: ["saving-throw", "attack-roll", "skill-check", "perception-check", "flat-check", "counteract-check", "initiative"]
});

export function createRerollCard({ plan, item, user }) {
    return { kind: "reroll", status: "open", plan, item, user, results: [] };
}

const WHAT_WORDS = { save: "saving throw", attack: "attack roll", check: "check", roll: "roll" };
const KEEP_WORDS = { new: "the new result", higher: "the higher result", lower: "the lower result" };

export function rerollText(reroll) {
    const what = reroll.statistic ? `${reroll.statistic.charAt(0).toUpperCase()}${reroll.statistic.slice(1)} save` : WHAT_WORDS[reroll.what] ?? "roll";
    const whose = reroll.who === "attacker" ? "The latest attack roll at you" : `Your latest ${what}`;
    return `${whose}, rerolled: ${KEEP_WORDS[reroll.keep] ?? KEEP_WORDS.new}`;
}

// The roll to reroll, newest first: messages as [{ id, type, domains, isReroll, actorUuid, actorId, targetActorUuid }] (the
// live layer reads them off PF2e's messages; a save's domains name its statistic). → its id, or null.
export function triggeringRoll(messages, reroll, { actorUuid, actorId }) {
    const types = CHECK_TYPES[reroll.what] ?? CHECK_TYPES.roll;
    for (const message of [...messages].reverse()) {
        if (!message?.type || message.isReroll) continue;
        if (reroll.who === "attacker") {
            if (message.type === "attack-roll" && message.targetActorUuid === actorUuid) return message.id;
            continue;
        }
        if (reroll.statistic && !(message.domains ?? []).includes(reroll.statistic)) continue;
        if (types.includes(message.type) && (message.actorUuid === actorUuid || (actorId && message.actorId === actorId))) return message.id;
    }
    return null;
}

export function rerollCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const reroll = state.plan.reroll;
    const after = open && reroll.after ? `<ul class="aar-notes"><li>${escape(reroll.after)}</li></ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Reroll</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">reroll</span></header><p class="aar-actions">${escape(rerollText(reroll))}</p>${after}${results}${controls}</section>`;
}

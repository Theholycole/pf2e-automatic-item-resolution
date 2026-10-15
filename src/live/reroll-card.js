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
    const whose = reroll.who === "attacker" ? "The latest attack roll at you" : reroll.who === "companion" ? `The targeted companion's latest ${what}` : `Your latest ${what}`;
    const bonus = reroll.bonus ? ` with a +${reroll.bonus.value} ${reroll.bonus.type === "untyped" ? "" : `${reroll.bonus.type} `}bonus` : "";
    return `${whose}, rerolled${bonus}: ${KEEP_WORDS[reroll.keep] ?? KEEP_WORDS.new}`;
}

// PF2e's degree of success: 10 over the DC a critical success, 10 under a critical failure; a natural 20 one step better,
// a natural 1 one step worse. → 0 (critical failure) … 3 (critical success), or null without a DC.
export function degreeOf({ total, dc, natural = null }) {
    if (!Number.isFinite(Number(dc)) || !Number.isFinite(Number(total))) return null;
    let degree = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
    if (natural === 20) degree = Math.min(3, degree + 1);
    if (natural === 1) degree = Math.max(0, degree - 1);
    return degree;
}
export const DEGREE_WORDS = ["a critical failure", "a failure", "a success", "a critical success"];

// A reroll the card rolls itself, with a bonus (Redsand Hourglass): the old roll's modifier and the bonus on a new d20,
// and which result stands. → { total, degree, oldDegree, kept: "new" | "old" }.
export function bonusReroll({ oldTotal, oldNatural = null, newNatural, bonus, dc = null, keep = "new" }) {
    const modifier = Number(oldTotal) - Number(oldNatural ?? 0);
    const total = newNatural + modifier + bonus;
    const degree = degreeOf({ total, dc, natural: newNatural });
    const oldDegree = degreeOf({ total: oldTotal, dc, natural: oldNatural });
    const better = degree !== null && oldDegree !== null ? degree > oldDegree || (degree === oldDegree && total > oldTotal) : total > oldTotal;
    const kept = keep === "higher" ? (better ? "new" : "old") : keep === "lower" ? (better ? "old" : "new") : "new";
    return { total, modifier, degree, oldDegree, kept };
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
        // (A companion's: actorUuid is the creature targeted.)
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

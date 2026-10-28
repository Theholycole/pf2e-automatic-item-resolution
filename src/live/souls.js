// Souls a weapon keeps (2026-10-27, src/compiler/whole-artifacts.js: Reaper's Grasp, "Whenever the reaper's grasp kills a sapient living or
// undead creature, a portion of that creature's soul is drawn inexorably into the weapon … to a maximum of 10 souls. … Keep track of the level
// of each creature whose souls are stored"): its record on the weapon, [{ name, level }]; a kill that counts; the soul spent by Soul Shot (twice
// its level in void damage on the next Strike with it this turn) or Devour Captured Soul (three times its level in temporary Hit Points till
// the end of the next turn). Pure.

export const SOULS = "souls";
export const isSouls = (plan) => plan?.builtin === "souls" && Boolean(plan.souls);
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// Whether a creature's death stores its soul: sapient (not mindless), living or undead (not a construct), and room left.
export const soulCounts = (creature, record, max) => Boolean(creature) && !(creature.traits ?? []).includes("mindless") && ["living", "undead"].includes(creature.modeOfBeing ?? "living") && (record ?? []).length < max;
export const withSoul = (record, creature, max) => [...(record ?? []), { name: creature.name, level: Number(creature.level) || 0 }].slice(0, max);
export const withoutSoul = (record, index) => (record ?? []).filter((_, at) => at !== Number(index));

// The amount a soul gives: its level times the item's.
export const soulAmount = (souls, soul) => (Number(soul?.level) || 0) * (Number(souls.times) || 1);

// The Effect's rules: void damage on that weapon's Strikes, or temporary Hit Points (PF2e's TempHP, gone with the Effect).
export const soulRules = (souls, amount, weaponId) => (souls.op === "strike" ? [{ key: "FlatModifier", selector: `${weaponId}-damage`, damageType: souls.type ?? "void", value: amount, label: "Soul Shot" }] : [{ key: "TempHP", value: amount }]);

export function createSoulsCard({ plan, item, user, souls = [] }) {
    return { kind: "souls", status: "open", plan, item, user, souls, pick: 0, results: [] };
}

export function soulsCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const souls = state.plan.souls;
    const what = souls.op === "strike" ? `Its next Strike with the weapon this turn deals ${souls.times} × the soul's level in ${souls.type} damage more` : `${souls.times} × the soul's level in temporary Hit Points, till the end of its next turn`;
    const pick = open && state.souls.length ? `<label class="aar-choice">Soul: <select data-air-field="pick">${state.souls.map((soul, index) => `<option value="${index}"${index === state.pick ? " selected" : ""}>${escape(soul.name)} (level ${escape(soul.level)})</option>`).join("")}</select></label>` : "";
    const none = open && !state.souls.length ? `<p class="aar-hint">No soul is stored in it.</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply && state.souls.length ? `<footer class="aar-controls"><button type="button" data-air-souls="apply">Release the soul</button></footer>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header><p class="aar-actions">${escape(what)}; the soul is released.</p>${pick}${none}${results}${controls}</section>`;
}

// The craft card (src/compiler/relic-readings.js plan.craft, 2026-10-27): an item made from a formula its user knows — Aroden's
// Hearthstone's magical weapon or armor of 20th level or lower, Philosopher's Extractor's alchemical item of its user's level or lower —,
// the formula picked on the card from the user's own (PF2e's known formulas, listed when the card is posted). With a check (check true):
// PF2e's Crafting check at the item's level's DC (PF2e's own, its rarity's too), and by its degree the raw materials paid (materials, a
// share of the item's Price: a quarter for the hearthstone) and the item made — a failure loses nothing, a critical failure a tenth of the
// materials, as Craft has it. Without one: made at once, its levels counted against what it makes in a day (budget). An impeccable item
// (impeccable true, the extractor's) is flagged so; its uses roll their maximum, last twice as long and have no drawback (impeccablePlan).
// Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
export const isCraft = (plan) => plan?.builtin === "craft" && Boolean(plan.craft);

// Whether a formula's item fits: { type, traits, level } against the craft's types, traits and highest level ("user": its user's level).
export function fitsCraft(item, craft, userLevel) {
    if (!item || !craft) return false;
    if ((craft.types ?? []).length && !craft.types.includes(item.type)) return false;
    if (!(craft.traits ?? []).every((trait) => (item.traits ?? []).includes(trait))) return false;
    const most = craft.maxLevel === "user" ? Number(userLevel) : Number(craft.maxLevel);
    return !Number.isFinite(most) || (Number(item.level) || 0) <= most;
}

// The raw materials it costs, in copper pieces: its share of the Price (rounded up); a critical failure's loss, a tenth of that.
export const materialsCost = (craft, priceCopper) => Math.ceil((Number(priceCopper) || 0) * (Number(craft?.materials) || 0));
export const ruinedCost = (craft, priceCopper) => Math.ceil(materialsCost(craft, priceCopper) / 10);

// Copper pieces in words: "1,250 gp", "12 gp, 5 sp".
export function coinsText(copper) {
    const value = Math.max(0, Math.round(Number(copper) || 0));
    const [gp, sp, cp] = [Math.floor(value / 100), Math.floor((value % 100) / 10), value % 10];
    const parts = [gp ? `${gp.toLocaleString("en-US")} gp` : null, sp ? `${sp} sp` : null, cp ? `${cp} cp` : null].filter(Boolean);
    return parts.length ? parts.join(", ") : "0 gp";
}

// The day's record of levels made { period, levels }: the levels left this day (budget.levels less those made in the same period).
export const levelsLeft = (budget, record, period) => Math.max(0, (Number(budget?.levels) || 0) - (record?.period === period ? Number(record.levels) || 0 : 0));
export const withLevels = (record, period, level) => ({ period, levels: (record?.period === period ? Number(record.levels) || 0 : 0) + (Number(level) || 0) });

// What it does, in words.
export function craftText(craft) {
    const kinds = (craft.types ?? []).length ? craft.types.join(" or ") : "item";
    const what = `${craft.traits?.length ? `${craft.traits.join(" ")} ` : ""}${kinds}`;
    const most = craft.maxLevel === "user" ? "of its user's level or lower" : `of level ${craft.maxLevel} or lower`;
    if (!craft.check) return `An ${what} ${most} from a formula its user knows, made at once${craft.budget ? ` (up to ${craft.budget.levels} levels of items a ${craft.budget.per})` : ""}${craft.impeccable ? "; impeccable: its rolls at their maximum, its duration doubled, no drawback" : ""}`;
    return `A ${what} ${most} from a formula its user knows: PF2e's Crafting check at its level's DC; on a success it's made, its user paying ${craft.materials === 0.25 ? "a quarter" : `${Math.round((craft.materials ?? 0) * 100)}%`} of its Price in raw materials and nothing more (a critical failure ruins a tenth of those materials, a failure none)`;
}

// The degree's outcome: { made, paid (copper), lines }.
export function craftOutcome(craft, degree, { name, priceCopper }) {
    const cost = materialsCost(craft, priceCopper);
    if (!craft.check || degree >= 2) return { made: true, paid: cost, line: `${name} made${cost ? `, ${coinsText(cost)} of raw materials paid` : ""}.` };
    if (degree === 0) return { made: false, paid: ruinedCost(craft, priceCopper), line: `Critical failure: ${name} isn't made, and a tenth of its raw materials is ruined (${coinsText(ruinedCost(craft, priceCopper))}).` };
    return { made: false, paid: 0, line: `Failure: ${name} isn't made; its raw materials are kept (nothing paid).` };
}

// options: [{ uuid, name, level, price (copper), dc }] — the user's formulas that fit, listed when it's posted. left: the levels left today.
export function createCraftCard({ plan, item, user, options = [], left = null }) {
    return { kind: "craft", status: "open", plan, item, user, options, pick: 0, left, results: [] };
}

export function craftCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const craft = state.plan.craft;
    const line = `<p class="aar-actions">${escape(craftText(craft))}.</p>`;
    const notes = open && (state.plan.notes ?? []).length ? `<ul class="aar-notes">${state.plan.notes.map((note) => `<li>${escape(note)}</li>`).join("")}</ul>` : "";
    const left = Number.isFinite(state.left) ? `<p class="aar-hint">${state.left} levels of items left to make today.</p>` : "";
    const label = (option) => `${option.name} (level ${option.level}${craft.check ? `, DC ${option.dc}, ${coinsText(materialsCost(craft, option.price))} of raw materials` : ""})`;
    const picker = !state.options.length ? (open ? `<p class="aar-hint">${escape(state.user.name)} knows no formula it can make.</p>` : "")
        : open && canApply ? `<p class="aar-actions">Formula: <select data-air-field="pick">${state.options.map((option, index) => `<option value="${index}"${index === (state.pick ?? 0) ? " selected" : ""}>${escape(label(option))}</option>`).join("")}</select></p>`
            : `<p class="aar-actions">Formula: ${escape(label(state.options[state.pick ?? 0] ?? { name: "", level: 0 }))}</p>`;
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((entry) => `<li>${escape(entry)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply && state.options.length ? `<footer class="aar-controls"><button type="button" data-air-action="apply">${craft.check ? "Attempt the Crafting check" : "Make it"}</button></footer>` : open && state.options.length ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">${craft.check ? "Crafting check" : "made at once"}</span></header>${line}${notes}${left}${picker}${results}${controls}</section>`;
}

// An impeccable item's use (Philosopher's Extractor's): "always uses the maximum numerical value possible for any rolls it requires",
// "If the impeccable item has a duration, it lasts twice as long", "never has a drawback" — the plan with each dice formula its maximum
// (its damage, its healing), each fixed time doubled, and its penalties (its drawback's: a negative modifier on its own drinker) gone.
const maximum = (formula) => String(formula).replace(/(\d*)d(\d+)/g, (_, count, size) => String((Number(count) || 1) * Number(size)));
const DICE = /\d*d\d+/;
export function impeccablePlan(plan) {
    if (!plan || typeof plan !== "object") return plan;
    const walk = (node, key = null) => {
        if (Array.isArray(node)) return node.map((entry) => walk(entry, key));
        if (!node || typeof node !== "object") return typeof node === "string" && ["formula", "heal", "healing"].includes(key) && DICE.test(node) ? maximum(node) : node;
        const out = {};
        for (const [field, value] of Object.entries(node)) out[field] = walk(value, field);
        // (A time: { mode "fixed", value, unit } — "until the end of the turn", 0 rounds, stays so.)
        if (out.mode === "fixed" && out.unit && Number(out.value) > 0) out.value = Number(out.value) * 2;
        if (Array.isArray(out.modifiers)) out.modifiers = out.modifiers.filter((modifier) => !(Number(modifier?.value) < 0));
        return out;
    };
    // (Not PF2e's own roll of its healing or damage as it was used: the card rolls its maximum instead.)
    const next = walk(plan);
    if (next.item?.pf2eRoll) next.item = { ...next.item, pf2eRoll: null };
    return { ...next, impeccable: true };
}

// An impeccable item's own PF2e Effect (its source, as scripts/live.js makes it): its time doubled (not an unlimited or an encounter's one),
// its drawback's rules gone — a negative FlatModifier, a weakness.
export function impeccableEffect(source) {
    const next = structuredClone(source);
    const time = next.system?.duration;
    if (time && Number(time.value) > 0 && !["unlimited", "encounter"].includes(time.unit)) time.value = Number(time.value) * 2;
    if (Array.isArray(next.system?.rules)) next.system.rules = next.system.rules.filter((rule) => !((rule?.key === "FlatModifier" && Number(rule.value) < 0) || rule?.key === "Weakness"));
    return next;
}

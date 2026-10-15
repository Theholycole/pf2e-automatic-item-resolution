// The item card's state and HTML, and the item-specific parts of applying it
// (which creature drinks, what PF2e rolled, an Effect's grade). Pure: no
// Foundry, so it is tested in Node. The card wears the ability module's
// classes (pf2e-aar-card, aar-*), so both modules' cards look alike.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// The id the core's context gives the user (as the ability module's cards: "source") and the drinker.
export const USER_ID = "source";
export const DRINKER_ID = "drinker";

// A new card: the plan, the item ({ name, uuid, sourceId, slug, img }), its user
// ({ actorUuid, tokenUuid, name }), the creatures it can be fed to (the user first),
// and PF2e's own roll for it ({ total, formula, kind, messageId } or null).
export function createItemCard({ plan, item, user, drinkers = [], rolled = null }) {
    const drinker = plan?.item?.recipient === "drinker";
    const choices = drinker ? [user, ...drinkers.filter((entry) => entry.actorUuid !== user.actorUuid || entry.tokenUuid !== user.tokenUuid)] : [];
    return {
        kind: "item",
        status: "open",
        plan,
        item,
        user,
        drinkers: choices,
        drinker: drinker ? 0 : null,
        rolled,
        results: []
    };
}

// The creature who gets the item's benefit: the chosen drinker, or the user.
export function recipientOf(state) {
    return state.drinker === null || state.drinker === undefined ? state.user : state.drinkers[state.drinker] ?? state.user;
}

// The ability module's state for its applyChange: the user as "source", the drinker as the one target.
export function abilityState(state) {
    const recipient = recipientOf(state);
    return {
        plan: state.plan,
        ability: { name: state.item.name, uuid: state.item.uuid ?? null },
        source: { actorUuid: state.user.actorUuid, tokenUuid: state.user.tokenUuid ?? null, name: state.user.name },
        targets: [{ id: DRINKER_ID, actorUuid: recipient.actorUuid, tokenUuid: recipient.tokenUuid ?? null, name: recipient.name }]
    };
}

// The core's io.damage for the healing PF2e already rolled: its total for the first
// request (healing and effect plans roll their healing first, and it is PF2e's one
// formula), then null (roll the rest).
export function rolledHealing(state) {
    let used = false;
    return () => {
        if (used || state.rolled?.kind !== "healing" || !Number.isFinite(state.rolled.total)) return null;
        used = true;
        return state.rolled.total;
    };
}

// A core damage instance as a Foundry Roll formula ("2*1d6 + 3").
export const rollFormula = (instance) => [...(instance?.dice ?? []).map((term) => `${term.factor && term.factor !== 1 ? `${term.factor}*` : ""}${term.count}d${term.die}`), instance?.constant ? String(instance.constant) : null].filter(Boolean).join(" + ") || "0";

// The plan application an effect change came from (the core's change keeps only uuid and label).
export function applicationFor(plan, change) {
    return (plan?.resolution?.applications ?? []).find((entry) => entry.uuid === change?.effect?.uuid) ?? null;
}

const UNIT = { rounds: "round", minutes: "minute", hours: "hour", days: "day" };
const timeText = (duration) => `${duration.value} ${duration.value === 1 ? UNIT[duration.unit] ?? duration.unit : duration.unit}`;

// What Apply will do, as lines for the card.
export function previewLines(state) {
    const plan = state.plan;
    const lines = [];
    const healing = plan?.resolution?.native?.healing;
    if (healing?.components?.length) {
        const formula = healing.components.map((component) => component.formula).join(" + ");
        lines.push(state.rolled?.kind === "healing" && Number.isFinite(state.rolled.total) ? `Heals ${state.rolled.total} Hit Points (PF2e's roll of ${formula})` : `Heals ${formula} Hit Points`);
    }
    for (const application of plan?.resolution?.applications ?? []) {
        const extra = [application.level ? `rank ${application.level}` : null, application.duration ? timeText(application.duration) : null].filter(Boolean).join(", ");
        lines.push(`${application.label ?? "Effect"}${extra ? ` (${extra})` : ""}`);
    }
    for (const note of plan?.notes ?? []) lines.push(note);
    return lines;
}

// The PF2e Effect to create from its compendium source: the grade the item is (PF2e's
// equipment Effects share one item across grades, with a ChoiceSet on the used item's
// slug, which can't be read once the last dose is deleted), the spell's rank, the time
// the item gives, and where it came from. Returns a new source.
export function effectSource(template, { application = null, item = {}, user = {}, worldTime = 0, initiative = null, flags = {} } = {}) {
    const source = structuredClone(template);
    delete source._id;
    const slug = item.slug ?? null;
    for (const rule of source.system?.rules ?? []) {
        if (rule?.key !== "ChoiceSet" || rule.selection !== undefined || !Array.isArray(rule.choices)) continue;
        const choice = rule.choices.find((entry) => (item.sourceId && entry?.value === item.sourceId) || (slug && JSON.stringify(entry?.predicate ?? []).includes(`parent:origin:item:slug:${slug}"`)));
        if (choice) rule.selection = choice.value;
    }
    source.system ??= {};
    if (Number.isFinite(application?.level) && application.level > 0) source.system.level = { ...(source.system.level ?? {}), value: application.level };
    if (application?.duration) source.system.duration = { ...(source.system.duration ?? {}), value: application.duration.value, unit: application.duration.unit, expiry: source.system.duration?.expiry ?? "turn-start", sustained: false };
    source.system.start = { value: worldTime, initiative };
    source.system.context = { ...(source.system.context ?? {}), origin: { ...(source.system.context?.origin ?? {}), actor: user.actorUuid ?? null, token: user.tokenUuid ?? null, item: item.uuid ?? null } };
    source.flags = { ...(source.flags ?? {}), ...flags };
    return source;
}

// The card's HTML. canApply: whether this user may press Apply (the item's owner or the GM).
export function cardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const recipient = recipientOf(state);
    const drinker = state.drinker === null || state.drinker === undefined ? ""
        : open && state.drinkers.length > 1 && canApply
            ? `<p class="aar-actions">Drinker: <select data-air-field="drinker">${state.drinkers.map((entry, index) => `<option value="${index}"${index === state.drinker ? " selected" : ""}>${escape(entry.name)}${index === 0 ? " (self)" : ""}</option>`).join("")}</select></p>`
            : `<p class="aar-actions">Drinker: ${escape(recipient.name)}</p>`;
    const preview = open ? previewLines(state) : [];
    const previewList = preview.length ? `<ul class="aar-notes">${preview.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Apply</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to apply it.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header>${drinker}${previewList}${results}${controls}</section>`;
}

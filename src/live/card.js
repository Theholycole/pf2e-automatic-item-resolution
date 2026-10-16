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
        // (A tea's Tea Ceremony: ticked on the card, false until then; null for any other item.)
        ceremony: plan?.item?.ceremony ? false : null,
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

// A condition it lowers, in words: "Lowers frightened by 1", "Ends doomed", "Lowers one of clumsy, enfeebled or
// stupefied by 1 (picked below)", "… on each creature you target".
const orList = (words) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}` : words[0]);
export function reductionText({ slug, choose, by, who }) {
    const what = choose ? `one of ${orList(choose)}` : slug;
    const done = by === "all" ? `Ends ${what}` : `Lowers ${what} by ${by}`;
    return `${done}${choose ? " (picked below)" : ""}${who === "targets" ? " on each creature you target" : ""}`;
}

// What Apply will do, as lines for the card.
export function previewLines(state) {
    const plan = state.plan;
    const lines = [];
    // (The conditions it lowers, src/compiler/reduce.js.)
    for (const entry of plan?.item?.reduce ?? []) lines.push(reductionText(entry));
    // (Its resistance, src/compiler/rows.js: the card's own Effect.)
    if (plan?.item?.resist?.length) lines.push(resistanceText(plan.item.resist));
    // (A Speed of a new kind, src/compiler/rows.js: the card's own Effect.)
    for (const speed of plan?.item?.speeds ?? []) lines.push(speedText(speed));
    for (const sense of plan?.item?.senses ?? []) lines.push(senseText(sense));
    // (Its flat check to end persistent damage, src/compiler/recovery.js.)
    if (plan?.item?.recovery) lines.push(recoveryText(plan.item.recovery));
    // (What a reduction alone leaves to the table: Cinnamon Nostalgia Bun's flat check.)
    if (plan?.reduce) for (const note of plan.notes ?? []) lines.push(`Also: ${note}`);
    const healing = plan?.resolution?.native?.healing;
    if (healing?.components?.length) {
        const formula = healing.components.map((component) => component.formula).join(" + ");
        lines.push(state.rolled?.kind === "healing" && Number.isFinite(state.rolled.total) ? `Heals ${state.rolled.total} Hit Points (PF2e's roll of ${formula})` : `Heals ${formula} Hit Points`);
    }
    for (const application of plan?.resolution?.applications ?? []) {
        const extra = [application.level ? `rank ${application.level}` : null, application.duration ? timeText(application.duration) : null, Number(application.tempHP) ? `${application.tempHP} more temporary Hit Points` : null].filter(Boolean).join(", ");
        lines.push(`${application.label ?? "Effect"}${extra ? ` (${extra})` : ""}`);
    }
    // The item's own row (an automatic check): what the drinker gets.
    const row = plan?.resolution?.kind === "check" && plan.resolution.check?.roll === "automatic" ? plan.resolution.outcomes?.success ?? {} : {};
    for (const effect of row.effects ?? []) {
        const time = effect.duration?.mode === "fixed" ? (effect.duration.expiry === "turn-end" && effect.duration.anchor === "source-turn" ? "until the end of the next turn" : `for ${timeText(effect.duration)}`) : null;
        const amount = effect.amount ?? effect.formula;
        if (effect.kind === "condition") lines.push(`${effect.slug}${Number.isFinite(effect.value) ? ` ${effect.value}` : ""}${time ? ` ${time}` : ""}`);
        else if (effect.kind === "temp-hp") lines.push(`${amount} temporary Hit Points${time ? ` ${time}` : ""}`);
        else if (effect.kind === "heal") lines.push(`Heals ${amount} Hit Points`);
    }
    for (const modifier of row.modifiers ?? []) lines.push(`${modifier.value > 0 ? "+" : "−"}${Math.abs(modifier.value)} ${modifier.type} to ${modifier.selector}${modifier.duration?.mode === "fixed" ? ` for ${timeText(modifier.duration)}` : ""}`);
    for (const note of row.noteEffects ?? []) lines.push(plan.partial ? `A note of its text${note.duration?.mode === "fixed" ? ` for ${timeText(note.duration)}` : ""}: the rest is the GM's to apply` : `A note of its text${note.duration?.mode === "fixed" ? ` for ${timeText(note.duration)}` : ""} (nothing else to apply)`);
    // (A reduction's own notes are above, as "Also: …".)
    if (!plan?.reduce) for (const note of plan?.notes ?? []) lines.push(note);
    return lines;
}

// The PF2e Effect to create from its compendium source: the grade the item is (PF2e's
// equipment Effects share one item across grades, with a ChoiceSet on the used item's
// slug, which can't be read once the last dose is deleted), the spell's rank, the time
// the item gives, and where it came from. Returns a new source.
// ceremony: a tea's Tea Ceremony, true or false (null for any other item) — PF2e's own ceremony choice on the tea's Effect
// is preset to it (Peace in Dreams Tea's "tea-ceremony", Resurrection Tea's "TeaCeremony" label), so PF2e needn't ask.
const isCeremonyChoice = (entry) => entry?.value === "tea-ceremony" || /TeaCeremony/i.test(String(entry?.label ?? ""));
export function effectSource(template, { application = null, item = {}, user = {}, worldTime = 0, initiative = null, flags = {}, ceremony = null } = {}) {
    const source = structuredClone(template);
    delete source._id;
    const slug = item.slug ?? null;
    for (const rule of source.system?.rules ?? []) {
        if (rule?.key !== "ChoiceSet" || rule.selection !== undefined || !Array.isArray(rule.choices)) continue;
        if (ceremony !== null && rule.choices.some(isCeremonyChoice)) {
            const chosen = rule.choices.find((entry) => (ceremony ? isCeremonyChoice(entry) : !isCeremonyChoice(entry)));
            if (chosen) rule.selection = chosen.value;
            continue;
        }
        const choice = rule.choices.find((entry) => (item.sourceId && entry?.value === item.sourceId) || (slug && JSON.stringify(entry?.predicate ?? []).includes(`parent:origin:item:slug:${slug}"`)));
        if (choice) rule.selection = choice.value;
    }
    source.system ??= {};
    if (Number.isFinite(application?.level) && application.level > 0) source.system.level = { ...(source.system.level ?? {}), value: application.level };
    if (application?.duration) source.system.duration = { ...(source.system.duration ?? {}), value: application.duration.value, unit: application.duration.unit, expiry: source.system.duration?.expiry ?? "turn-start", sustained: false };
    // ("gain 10 additional temporary Hit Points from your Rage": its TempHP rule raised by that much, src/compiler/rage.js.)
    if (Number(application?.tempHP)) for (const rule of source.system.rules ?? []) if (rule?.key === "TempHP") rule.value = `(${rule.value ?? 0}) + ${Number(application.tempHP)}`;
    source.system.start = { value: worldTime, initiative };
    source.system.context = { ...(source.system.context ?? {}), origin: { ...(source.system.context?.origin ?? {}), actor: user.actorUuid ?? null, token: user.tokenUuid ?? null, item: item.uuid ?? null } };
    source.flags = { ...(source.flags ?? {}), ...flags };
    return source;
}

// The resistance an item gives its user (plan.item.resist, src/compiler/rows.js) in words: "Resistance 5 to slashing and
// piercing for 10 minutes".
const typeWords = (type) => (type === "all-damage" ? "all damage" : type.replace(/-/g, " "));
export function resistanceText(resist) {
    const byValue = new Map();
    // (A type to choose: "acid, cold or fire (one, chosen)".)
    for (const entry of resist) byValue.set(entry.value, [...(byValue.get(entry.value) ?? []), entry.type ? typeWords(entry.type) : `${entry.choose.slice(0, -1).join(", ")} or ${entry.choose.at(-1)} (one, chosen)`]);
    const duration = resist.find((entry) => entry.duration?.mode === "fixed")?.duration;
    return `${[...byValue].map(([value, types]) => `Resistance ${value} to ${types.join(" and ")}`).join(", ")}${duration ? ` for ${timeText(duration)}` : ""}`;
}

// A Speed in words: "A fly Speed equal to your land Speed until the end of the next turn", "A swim Speed of 30 feet".
const LAND_WORDS = [[/^@actor\.system\.movement\.speeds\.land\.value$/, "equal to your land Speed"], [/^floor\(@actor\.system\.movement\.speeds\.land\.value\*0\.5\)$/, "equal to half your land Speed"], [/^max\((\d+),@actor\.system\.movement\.speeds\.land\.value\)$/, "of $1 feet or your land Speed, whichever is greater"], [/^min\((\d+),@actor\.system\.movement\.speeds\.land\.value\)$/, "of $1 feet or your land Speed, whichever is lower"]];
export function speedText(speed) {
    const formula = String(speed.value);
    const said = typeof speed.value === "number" ? `of ${speed.value} feet` : LAND_WORDS.reduce((words, [pattern, text]) => words ?? (pattern.test(formula) ? formula.replace(pattern, text) : null), null) ?? `of ${formula}`;
    const time = speed.duration?.mode === "fixed" ? (speed.duration.expiry === "turn-end" && speed.duration.anchor === "source-turn" ? " until the end of the next turn" : ` for ${timeText(speed.duration)}`) : "";
    return `A ${speed.type} Speed ${said}${time}`;
}

// Its Speed's Effect: PF2e's BaseSpeed rule ("until the end of the next turn": PF2e's one round, ending at a turn's end).
export function speedEffectSource(speed, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return ownEffectSource({ name: `${speed.type} Speed`, img: "icons/svg/wing.svg", words: speedText(speed), rules: [{ key: "BaseSpeed", selector: speed.type, value: speed.value }], duration: speed.duration, flag: { speed: speed.type }, item, user, worldTime, initiative, moduleId });
}

// Its flat check to end persistent damage in words: "A flat check (DC 10) to end persistent acid, fire, poison or void damage".
export function recoveryText(recovery) {
    const types = recovery.types.length > 1 ? `${recovery.types.slice(0, -1).join(", ")} or ${recovery.types.at(-1)}` : recovery.types[0];
    return `A flat check${recovery.dc ? ` (DC ${recovery.dc})` : ""} to end persistent ${types} damage`;
}

// One of the card's own Effects (its resistance, Speed or vision): PF2e's rules for the item's time (unlimited with none),
// named for the item, flagged as the module's. Returns a new source.
function ownEffectSource({ name, img, words, rules, duration, flag, item, user, worldTime, initiative, moduleId }) {
    return {
        name: `${item.name}: ${name}`,
        type: "effect",
        img: item.img ?? img,
        flags: { [moduleId]: flag },
        system: {
            description: { value: `<p>${escape(words)}, from <strong>${escape(item.name)}</strong>.</p>` },
            duration: duration?.mode === "fixed" ? { value: duration.value, unit: duration.unit, expiry: duration.expiry ?? "turn-start", sustained: false } : { value: -1, unit: "unlimited", expiry: null, sustained: false },
            start: { value: worldTime, initiative },
            context: { origin: { actor: user.actorUuid ?? null, token: user.tokenUuid ?? null, item: item.uuid ?? null } },
            rules
        }
    };
}

// Its resistances with a chosen type filled in (index into the entry's choose list, the first by default).
export const chosenResistances = (resist, index = 0) => resist.map((entry) => (entry.choose?.length ? { ...entry, type: entry.choose[Number.isInteger(index) && entry.choose[index] ? index : 0], choose: undefined } : entry));

// Its resistance's Effect: PF2e's Resistance rules. moduleId: the flag's scope.
export function resistanceEffectSource(resist, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const duration = resist.find((entry) => entry.duration?.mode === "fixed")?.duration ?? null;
    return ownEffectSource({ name: "resistance", img: "icons/svg/shield.svg", words: resistanceText(resist), rules: resist.map(({ type, value }) => ({ key: "Resistance", type, value })), duration, flag: { resist: true }, item, user, worldTime, initiative, moduleId });
}

// A vision in words: "Darkvision until the start of the next turn", "Greater darkvision".
const SENSE_WORDS = { darkvision: "Darkvision", "greater-darkvision": "Greater darkvision", "low-light-vision": "Low-light vision" };
export function senseText(sense) {
    const time = sense.duration?.mode === "fixed" ? (sense.duration.anchor === "source-turn" ? ` until the ${sense.duration.expiry === "turn-end" ? "end" : "start"} of the next turn` : ` for ${timeText(sense.duration)}`) : "";
    return `${SENSE_WORDS[sense.selector] ?? sense.selector}${time}`;
}

// Its vision's Effect: PF2e's Sense rule.
export function senseEffectSource(sense, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return ownEffectSource({ name: SENSE_WORDS[sense.selector] ?? sense.selector, img: "icons/svg/eye.svg", words: senseText(sense), rules: [{ key: "Sense", selector: sense.selector }], duration: sense.duration, flag: { sense: sense.selector }, item, user, worldTime, initiative, moduleId });
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
    // (A tea's Tea Ceremony: a tick, or what was chosen.)
    const ceremonyInfo = state.plan?.item?.ceremony;
    const changes = ceremonyInfo ? [ceremonyInfo.duration ? `lasts ${timeText(ceremonyInfo.duration)}` : null, ...(ceremonyInfo.removes ?? []).map((slug) => `removes ${slug}`)].filter(Boolean) : [];
    const ceremonyWords = `Tea Ceremony (10 minutes)${changes.length ? `: ${changes.join(", ")}` : ""}`;
    const ceremony = state.ceremony === null || state.ceremony === undefined ? ""
        : open && canApply ? `<p class="aar-actions"><label><input type="checkbox" data-air-field="ceremony"${state.ceremony ? " checked" : ""}> ${escape(ceremonyWords)}</label></p>`
            : state.ceremony ? `<p class="aar-actions">${escape(ceremonyWords)}</p>` : "";
    // (Its resistance's type, when the item makes its user choose: a picker.)
    const choose = (state.plan?.item?.resist ?? []).find((entry) => entry.choose?.length)?.choose ?? null;
    const resistPick = !choose ? ""
        : open && canApply ? `<p class="aar-actions">Resistance to: <select data-air-field="resistType">${choose.map((type, index) => `<option value="${index}"${index === (state.resistType ?? 0) ? " selected" : ""}>${escape(type)}</option>`).join("")}</select></p>`
            : Number.isInteger(state.resistType) ? `<p class="aar-actions">Resistance to: ${escape(choose[state.resistType] ?? choose[0])}</p>` : "";
    // (One of several conditions it lowers: a picker. Another's: target the creatures first.)
    const pickFrom = (state.plan?.item?.reduce ?? []).find((entry) => entry.choose?.length)?.choose ?? null;
    const reducePick = !pickFrom ? ""
        : open && canApply ? `<p class="aar-actions">Lower: <select data-air-field="reduceChoice">${pickFrom.map((slug, index) => `<option value="${index}"${index === (state.reduceChoice ?? 0) ? " selected" : ""}>${escape(slug)}</option>`).join("")}</select></p>`
            : Number.isInteger(state.reduceChoice) ? `<p class="aar-actions">Lower: ${escape(pickFrom[state.reduceChoice] ?? pickFrom[0])}</p>` : "";
    const forAllies = state.plan?.item?.recipient === "targets" || (state.plan?.item?.reduce ?? []).some((entry) => entry.who === "targets");
    const targetHint = open && canApply && forAllies ? `<p class="aar-hint">Target the creatures it helps (your own token too, when it helps you), then press Apply.</p>` : "";
    const previewList = preview.length ? `<ul class="aar-notes">${preview.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Apply</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to apply it.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header>${drinker}${ceremony}${resistPick}${reducePick}${previewList}${targetHint}${results}${controls}</section>`;
}

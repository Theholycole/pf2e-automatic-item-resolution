// A degree row's own PF2e Effect, linked after it and named for it: Crackling Bubble Gum's failure ("A creature that fails its
// save is also bound with sticky gum, taking a -10-foot item penalty to its Speed for 1 minute" and then "Effect: Crackling
// Bubble Gum (Failure)"), Cape of Justice's Enact Justice failure, Stonethroat Ammunition's success. The ability compiler
// leaves that row to the GM; the Effect holds what it does, so it goes on the row as the core's native Effect (live play puts it
// on the creature, for the Effect's own time) and the row's "by hand" line naming it goes. Only a save's rows (the creature that
// saves is the one the Effect is for), and only when the Effect lasts as the row says: a row with a time of its own needs the
// Effect's duration (options.itemEffects, equipmentEffectIndex) to be that time — Stonethroat's "For 1 round" isn't its Effect's
// unlimited one. Pure.

const DEGREES = { "critical success": "criticalSuccess", success: "success", failure: "failure", "critical failure": "criticalFailure" };
const LINK = /@UUID\[(Compendium\.pf2e\.equipment-effects\.Item\.[A-Za-z0-9]+)\]\{(Effect: [^}]*?\((Critical Success|Success|Failure|Critical Failure)\))\}/g;

const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours" };

// PF2e's equipment Effects' durations by uuid, from its equipment-effects pack's index (system.duration): { uuid: { value, unit } }.
export function equipmentEffectIndex(effects) {
    const index = {};
    for (const effect of effects ?? []) {
        const uuid = effect?.uuid ?? (effect?._id ? `Compendium.pf2e.equipment-effects.Item.${effect._id}` : null);
        if (uuid && effect?.system?.duration) index[uuid] = { value: Number(effect.system.duration.value), unit: effect.system.duration.unit };
    }
    return index;
}

// The row's own time, in the words before the link (back to the row's heading): { value, unit } or null.
function timeBefore(text, at) {
    const before = text.slice(0, at);
    const heading = before.lastIndexOf("<strong>");
    const words = before.slice(heading < 0 ? Math.max(0, at - 600) : heading).replace(/<[^>]+>/g, " ");
    const time = [...words.matchAll(/\bfor (\d+|an?|one) (rounds?|minutes?|hours?)\b/gi)].pop();
    return time ? { value: /^\d+$/.test(time[1]) ? Number(time[1]) : 1, unit: UNITS[time[2].toLowerCase()] } : null;
}

// The html → [{ degree, uuid, label, time }]. (A failure's Effect is a critical failure's too when no row or Effect of its own says
// otherwise: Crackling Bubble Gum's "A creature that fails its save is also bound with sticky gum".)
export function readDegreeEffects(html) {
    const text = String(html ?? "");
    const links = [...text.matchAll(LINK)].map((match) => ({ degree: DEGREES[match[3].toLowerCase()], uuid: match[1], label: match[2], time: timeBefore(text, match.index) }));
    const ownCritical = links.some((link) => link.degree === "criticalFailure") || /<strong>\s*Critical Failure\s*<\/strong>/i.test(text);
    return ownCritical ? links : links.flatMap((link) => (link.degree === "failure" ? [link, { ...link, degree: "criticalFailure" }] : [link]));
}

function onRows(plan, links) {
    if (plan?.resolution?.kind !== "save" || plan.builtin || plan.resolution.check?.against?.statistic === "ac" || !plan.resolution.outcomes) return plan;
    let changed = false;
    const outcomes = { ...plan.resolution.outcomes };
    for (const { degree, uuid, label } of links) {
        const row = outcomes[degree];
        if (!row || (row.nativeEffects ?? []).some((effect) => effect.uuid === uuid)) continue;
        changed = true;
        const manual = (row.manualInstructions ?? []).filter((line) => !String(typeof line === "string" ? line : line?.text).includes(label));
        outcomes[degree] = { ...row, nativeEffects: [...(row.nativeEffects ?? []), { uuid, label }], ...(row.manualInstructions ? { manualInstructions: manual } : {}) };
    }
    return changed ? { ...plan, resolution: { ...plan.resolution, outcomes } } : plan;
}

// Whether the Effect lasts as its row says: no time of its own, or the Effect's own duration that time.
const lastsAsSaid = (link, durations) => !link.time || (durations?.[link.uuid]?.unit === link.time.unit && durations[link.uuid].value === link.time.value);

// The plan with each linked degree Effect on its row: its own rows and the saves it carries (a Strike's, an item's).
// durations: equipmentEffectIndex's.
export function withDegreeEffects(plan, html, durations = null) {
    const links = readDegreeEffects(html).filter((link) => lastsAsSaid(link, durations));
    if (!links.length || !plan) return plan;
    let next = onRows(plan, links);
    if (next?.strike?.save) {
        const save = onRows(next.strike.save, links);
        if (save !== next.strike.save) next = { ...next, strike: { ...next.strike, save } };
    }
    if (next?.item?.save?.plan) {
        const save = onRows(next.item.save.plan, links);
        if (save !== next.item.save.plan) next = { ...next, item: { ...next.item, save: { ...next.item.save, plan: save } } };
    }
    return next;
}

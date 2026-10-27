// The feat-use card: one more use of a feat its user just used (src/compiler/unique-rules.js withFeatUse — Ancestral Embrace's "You gain an
// additional use of the ancestry feat"). The card lists its user's feats of that kind whose uses a day are spent (PF2e's frequency, below its
// maximum), one picked; Give has PF2e's frequency count one higher (scripts/feat-uses.js). Its next daily preparations set it to its maximum
// again, so an extra use not used by then is lost, as the text says. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export const isFeatUse = (plan) => plan?.builtin === "feat-use" && Boolean(plan.featUse?.category);

// The feats of the plan's kind with uses a day, used at least once: [{ id, name, value, max }] from PF2e's feats ({ id, name, system }).
export function spentFeats(featUse, feats = []) {
    return feats.filter((feat) => feat?.system?.category === featUse.category && featUse.per.includes(feat.system?.frequency?.per) && Number(feat.system.frequency.max) > 0 && Number(feat.system.frequency.value ?? feat.system.frequency.max) < Number(feat.system.frequency.max))
        .map((feat) => ({ id: feat.id, name: feat.name, value: Number(feat.system.frequency.value ?? 0), max: Number(feat.system.frequency.max) }));
}

export function createFeatUseCard({ plan, item, user, feats = [] }) {
    return { kind: "feat-use", status: "open", plan, item, user, feats, pick: 0, results: [] };
}

// "One more use today of an ancestry feat used up: lost at the next daily preparations if not used by then".
export const featUseText = (featUse) => `One more use of an ${featUse.category} feat it has used today, lost at its next daily preparations if not used by then`;

export function featUseCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const pick = !open ? ""
        : !state.feats.length ? `<p class="aar-hint">${escape(state.user.name)} has no ${escape(state.plan.featUse.category)} feat with uses a day that it has used.</p>`
            : canApply ? `<p class="aar-actions">Feat: <select data-air-field="pick">${state.feats.map((feat, index) => `<option value="${index}"${index === (state.pick ?? 0) ? " selected" : ""}>${escape(`${feat.name} (${feat.value}/${feat.max})`)}</option>`).join("")}</select></p>`
                : `<p class="aar-actions">${escape(state.feats.map((feat) => feat.name).join(", "))}</p>`;
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply && state.feats.length ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Give</button></footer>` : open && state.feats.length ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header><p class="aar-actions">${escape(featUseText(state.plan.featUse))}.</p>${pick}${results}${controls}</section>`;
}

// The feat as it is after one more use: its frequency count, never past its maximum. → { value, line } or null.
export function oneMoreUse(feat, user) {
    if (!feat || feat.value >= feat.max) return null;
    return { value: feat.value + 1, line: `${user}: one more use of ${feat.name} (${feat.value + 1}/${feat.max}), lost at the next daily preparations if not used by then.` };
}

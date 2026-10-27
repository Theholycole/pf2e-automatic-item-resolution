// The sphere card (2026-10-27, src/compiler/sphere.js: Sphere of Annihilation): its user's check to take control of the sphere, then each round
// to Sustain it — the sphere's token moved toward a user who fails, or where one who succeeds directs it, and every creature it touches
// destroyed (scripts/sphere.js). Its DC, the steps the sphere takes and the creatures in its way, worked out here. Pure.

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const DEGREES = ["criticalFailure", "failure", "success", "criticalSuccess"];
const DEGREE_WORDS = { criticalSuccess: "critical success", success: "success", failure: "failure", criticalFailure: "critical failure" };
const SKILL_WORDS = { arcana: "Arcana", occultism: "Occultism" };

export const isSphere = (plan) => plan?.builtin === "sphere" && Boolean(plan.sphere);

// phase "take" (its check to take control), "sustain" (each round's), "move" (a success's move to direct: allowed, its feet); sphere: the
// sphere's token found { tokenUuid, name } or null.
export function createSphereCard({ plan, item, user, sphere = null }) {
    return { kind: "sphere", status: "open", phase: "take", plan, item, user, sphere, skill: 0, results: [] };
}

// Its check's DC: the phase's own, the higher of it and another controller's Will DC when taking control from them (controllers: their Will
// DCs), 10 lower with the talisman held (talisman: true) → { dc, words }.
export function sphereDC(sphere, { phase = "take", controllers = [], talisman = false } = {}) {
    const own = phase === "take" ? Number(sphere.dc) : Number(sphere.sustain?.dc ?? sphere.dc);
    const theirs = phase === "take" && sphere.controllerWill ? Math.max(0, ...controllers.map(Number).filter(Number.isFinite)) : 0;
    const base = Math.max(own, theirs);
    const by = talisman && sphere.talisman ? Number(sphere.talisman.by) || 0 : 0;
    const words = [theirs > own ? `its controller's Will DC ${theirs}` : null, by ? `${by} lower with the ${sphere.talisman.name} held` : null].filter(Boolean);
    return { dc: base - by, words };
}

// What a degree does in a phase: { control } taken, { move } feet to direct, { lose, closer } feet toward its user.
export const sphereRow = (sphere, phase, degree) => (phase === "take" ? sphere.take?.[degree] : sphere.sustain?.[degree]) ?? {};
export const degreeName = (index) => DEGREES[Number(index)] ?? null;

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const centreOf = (space) => ({ x: space.x + space.w / 2, y: space.y + space.h / 2 });

// The sphere moved feet closer to a creature, a square at a time toward its centre: from and to { x, y, w, h } in pixels, grid { size, gridFeet
// } → { x, y, path } — where it ends (its top-left), and each space it passed through on the way, in order. PF2e's diagonals (5, then 10 feet)
// count; it stops once it touches the creature (its space overlapping) or the feet are spent.
export function stepToward(from, to, feet, { size, gridFeet = 5 }) {
    let at = { x: from.x, y: from.y };
    let spent = 0;
    let diagonals = 0;
    const path = [];
    const goal = centreOf(to);
    for (let guard = 0; guard < 400; guard++) {
        if (overlaps({ ...at, w: from.w, h: from.h }, to)) break;
        const here = centreOf({ ...at, w: from.w, h: from.h });
        const far = (point) => Math.hypot(goal.x - point.x, goal.y - point.y);
        const steps = [];
        for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
            if (!dx && !dy) continue;
            const next = { x: here.x + dx * size, y: here.y + dy * size };
            const diagonal = Boolean(dx && dy);
            // (Straight before diagonal when both are as near.)
            steps.push({ dx, dy, diagonal, score: far(next) + (diagonal ? 0.001 : 0), cost: diagonal ? (diagonals % 2 === 0 ? gridFeet : gridFeet * 2) : gridFeet });
        }
        // (The nearest step it has the feet left for: a straight one when a second diagonal would cost too much.)
        const best = steps.filter((step) => step.score < far(here) && spent + step.cost <= feet).sort((a, b) => a.score - b.score)[0];
        if (!best) break;
        const { diagonal, cost } = best;
        spent += cost;
        if (diagonal) diagonals += 1;
        at = { x: at.x + best.dx * size, y: at.y + best.dy * size };
        path.push({ ...at });
    }
    return { ...at, path, spent };
}

// The others it touches on its way: spaces [{ x, y, w, h }] it covers along it in order (its end among them), others [{ id, x, y, w, h }] →
// their ids, each once, in the order it reaches them.
export function touchedOn(spaces, others) {
    const out = [];
    for (const space of spaces) for (const other of others) if (!out.includes(other.id) && overlaps(space, other)) out.push(other.id);
    return out;
}

// Its lines: what its check and its Sustain do, from its plan.
export function sphereLines(sphere) {
    const take = sphere.take ?? {};
    const sustain = sphere.sustain ?? {};
    const skills = (list) => (list ?? []).map((slug) => SKILL_WORDS[slug] ?? slug).join(" or ");
    return [
        `To take control: ${skills(sphere.skills)} against DC ${sphere.dc}${sphere.controllerWill ? " (or its current controller's Will DC, if higher)" : ""}, within ${sphere.within} feet of the sphere. A failure moves it ${take.failure?.closer} feet toward its user (${take.criticalFailure?.closer} on a critical failure)`,
        `Control lasts while its user stays within ${sphere.keep} feet of it and Sustains the activation each round: ${skills(sustain.skills)} against DC ${sustain.dc}; a success directs it up to ${sustain.success?.move} feet in a straight line (${sustain.criticalSuccess?.move} on a critical success), a failure loses control and it moves ${sustain.failure?.closer} feet toward its user (${sustain.criticalFailure?.closer} on a critical failure)`,
        sphere.destroys ? `Whatever it touches is destroyed utterly${sphere.deity ? ": only a deity's direct intervention brings it back" : ""}. Objects and walls it passes through are the GM's to remove from the map` : null,
        sphere.talisman ? `A wielder who casts arcane or occult spells, holding the ${sphere.talisman.name}: its DCs ${sphere.talisman.by} lower` : null
    ].filter(Boolean);
}

export const degreeWords = (degree) => DEGREE_WORDS[degree] ?? degree;

export function sphereCardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const sphere = state.plan.sphere;
    const lines = sphereLines(sphere);
    const said = `<ul class="aar-lines">${lines.map((line) => `<li>${escape(line)}.</li>`).join("")}</ul>`;
    const skills = state.phase === "take" ? sphere.skills : sphere.sustain?.skills ?? sphere.skills;
    const select = open && canApply && state.phase !== "move" ? `<label class="aar-choice">Check: <select data-air-field="skill">${skills.map((slug, index) => `<option value="${index}"${index === (state.skill ?? 0) ? " selected" : ""}>${escape(SKILL_WORDS[slug] ?? slug)}</option>`).join("")}</select></label>` : "";
    const where = state.sphere ? `<p class="aar-actions">The sphere: ${escape(state.sphere.name)}.</p>` : `<p class="aar-hint">No sphere found on the scene yet: its token (named Sphere of Annihilation) is looked for when the check is rolled.</p>`;
    const step = state.phase === "move" ? `<p class="aar-hint">Press Pick and click the space the sphere moves to, up to ${escape(state.allowed)} feet away in a straight line (its own space leaves it there; right-click or Escape cancels).</p>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const label = state.phase === "take" ? "Roll to take control" : state.phase === "sustain" ? "Sustain: roll" : "Pick";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-sphere="${state.phase === "move" ? "move" : "roll"}">${label}</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header>${where}${said}${step}${select}${results}${controls}</section>`;
}

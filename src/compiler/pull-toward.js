// A check that pulls the creature toward its user (2026-10-25, docs/needs.md): Tentacle Cannon's Grasping Deep Shot, "The tentacle attempts to
// Grapple with a +13 bonus … On a success, the tentacle pulls the creature up to 10 feet directly towards you, until it's in a square
// adjacent to you." → the success's and the critical success's forcedMovement, a pull toward its user that stops beside them (the core's
// forced movement, as the card applies its rows). What its notes then say for nothing on the card: "attempt to pull and grab a creature
// within 15 feet" is its targeting's range (not the Grapple's touch); "It can attempt to Grapple any creature, regardless of size" (the
// card never limits a Grapple by size). Pure.

const PULLS = /^On a success, (?:the [\w ]+? )?pulls the creature up to (\d+) feet (?:directly )?towards? you(?:, until it(?:'|’)s in a square adjacent to you)?\.$/i;
const WITHIN = /^You [^.]*?\battempt to [\w ]+? a creature within (\d+) feet\.$/i;
const ANY_SIZE = /^It can attempt to (?:Grapple|Shove|Trip) any creature, regardless of size\.$/i;
const said = (note) => String(typeof note === "string" ? note : note?.text ?? "").trim();

export function withPullToward(plan) {
    if (plan?.resolution?.kind !== "check" || plan.builtin || !plan.notes?.length) return plan;
    const pull = plan.notes.map((note) => PULLS.exec(said(note))).find(Boolean);
    const outcomes = plan.resolution.outcomes ?? {};
    if (!pull || !outcomes.success) return plan;
    const forcedMovement = { kind: "pull", distance: Number(pull[1]), upTo: true, optional: false, direction: "toward" };
    const rows = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => [degree, ["success", "criticalSuccess"].includes(degree) && row && !row.forcedMovement ? { ...row, forcedMovement } : row]));
    const within = plan.notes.map((note) => WITHIN.exec(said(note))).find(Boolean);
    const notes = plan.notes.filter((note) => !PULLS.test(said(note)) && !ANY_SIZE.test(said(note)) && !(within && WITHIN.test(said(note))));
    const result = { ...plan, resolution: { ...plan.resolution, outcomes: rows }, notes: notes.length ? notes : undefined, ...(within && plan.targeting && (!plan.targeting.range || plan.targeting.range === "touch") ? { targeting: { ...plan.targeting, range: Number(within[1]) } } : {}) };
    const left = [...notes, ...(plan.unread ?? []), ...Object.values(rows).flatMap((row) => row?.manualInstructions ?? [])];
    if (plan.partial && !left.length) {
        delete result.partial;
        result.automation = { ...(result.automation ?? {}), level: "automatic" };
    }
    return result;
}

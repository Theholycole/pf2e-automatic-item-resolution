// A creature moved to a space its user picks (2026-10-25, docs/needs.md): Roc-Shaft Arrow's "save or be moved to a space you choose within 10
// feet (20 feet on a critical failure)", Whip-Tongue Sling's Tongue Twister, "On a success, you can move the creature up to 15 feet into any
// space within 20 feet of you". The ability module's card's plan gets placed { rows: { degree: { within } }, nearSource, optional, lines,
// byHand }: once that card is applied (its "applied" hook, ability 0.9.2), live play posts the teleport card for each creature whose degree
// has a row, its user's to press — the space picked within that distance of where the creature stood, and within nearSource feet of its
// user (scripts/placed-moves.js). Before ability 0.9.2, what it was: the note, the core's straight push. Pure.

// (Roc-Shaft's, as src/compiler/item-data.js says it for the core's push: "Its attacker picks the space within that distance; move its token
// there.")
const PICKS = /^Its attacker picks the space within that distance; move its token there\.$/i;
const HAZARD = /^If this would move the target into a hazardous space, this effect gains the incapacitation trait\.$/i;
const CARRY = /^On a hit, the arrow briefly grows a pair of avian wings and attempts to carry off the target\.$/i;
// (Juxtaposition Ammunition's failed save, a note on its rows: "be teleported to a safe, unoccupied square of your choice within 60 feet of its
// original position and within the weapon's first range increment" — nearSource the Strike's weapon's range increment, filled in on the
// hit, scripts/strikes.js. Its other sentences: Sickened on a critical failure, its forced movement said, no damage on the hit.)
const TELEPORTED = /^Failed save: be teleported to a safe, unoccupied square of your choice within (\d+) feet of its original position and within the weapon(?:'|’)s first range increment\.$/i;
const ALSO = /^On a critical failure, the target is also (Sickened|Stupefied|Clumsy|Enfeebled|Dazzled|Frightened) (\d)\b[^.]*\.$/i;
const FORCED = /^Any relocation from the [\w ]+? is forced movement\.$/i;
const NO_DAMAGE = /^On a hit, it doesn(?:'|’)t deal the Strike(?:'|’)s normal damage\.$/i;
// (Whip-Tongue Sling's: the ability compiler's line for the GM.)
const MOVE_INTO = /^\{target\} \((critical success|success)\): you can move the creature up to (\d+) feet into any space within (\d+) feet of you\.?$/i;
const said = (note) => String(typeof note === "string" ? note : note?.text ?? "").trim();
const DEGREE = { "critical success": "criticalSuccess", success: "success" };

function settled(plan, notes, rows) {
    const left = [...notes, ...(plan.unread ?? []), ...Object.values(rows ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    const result = { ...plan, notes: notes.length ? notes : undefined };
    if (plan.partial && !left.length) {
        delete result.partial;
        result.automation = { ...(result.automation ?? {}), level: "automatic" };
    }
    return result;
}

// A Strike's save that teleports the creature hit to a square its attacker picks (Juxtaposition Ammunition's): placed, teleport, within the
// weapon's range; its critical failure's condition its row's; no damage on the hit, strike.noDamage (the hit's line, scripts/strikes.js).
function withTeleportedSave(plan) {
    const save = plan?.strike?.save;
    const outcomes = save?.resolution?.outcomes;
    const teleported = outcomes ? Object.values(outcomes).flatMap((row) => row?.noteEffects ?? []).map((note) => TELEPORTED.exec(said(note))).find(Boolean) : null;
    if (!teleported) return plan;
    const strikeNotes = plan.strike.notes ?? [];
    const also = strikeNotes.map((note) => ALSO.exec(said(note))).find(Boolean);
    const within = Number(teleported[1]);
    const rows = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => {
        if (!row) return [degree, row];
        const noteEffects = (row.noteEffects ?? []).filter((note) => !TELEPORTED.test(said(note)));
        const effects = degree === "criticalFailure" && also ? [...(row.effects ?? []), { kind: "condition", slug: also[1].toLowerCase(), value: Number(also[2]), duration: null }] : row.effects;
        return [degree, { ...row, effects, ...(row.noteEffects ? { noteEffects } : {}) }];
    }));
    const placed = { rows: { failure: { within }, criticalFailure: { within } }, nearSource: "weapon-range", optional: false, teleport: true, lines: ["Into a safe, unoccupied square"], byHand: `On a failure, teleport it to a safe, unoccupied square its attacker picks within ${within} feet of where it was and within the weapon's first range increment.` };
    const noDamage = strikeNotes.some((note) => NO_DAMAGE.test(said(note)));
    const notes = strikeNotes.filter((note) => !(also && ALSO.test(said(note))) && !FORCED.test(said(note)) && !NO_DAMAGE.test(said(note)));
    const result = settled({ ...plan, strike: { ...plan.strike, notes, ...(noDamage ? { noDamage: true } : {}), save: { ...save, resolution: { ...save.resolution, outcomes: rows }, placed } } }, plan.notes ?? [], null);
    if (notes.length) result.partial = true;
    return result;
}

// A Strike's save that moves the creature hit to a space its attacker picks: plan.strike.save.placed, its rows' pushes gone.
export function withPlacedSave(given) {
    const plan = withTeleportedSave(given);
    if (plan !== given) return plan;
    const save = plan?.strike?.save;
    const outcomes = save?.resolution?.outcomes;
    // (Its notes the Strike's own.)
    const strikeNotes = plan?.strike?.notes ?? [];
    if (!outcomes || !strikeNotes.some((note) => PICKS.test(said(note)))) return plan;
    const pushed = Object.entries(outcomes).filter(([, row]) => row?.forcedMovement?.kind === "push");
    if (!pushed.length) return plan;
    const hazard = strikeNotes.find((note) => HAZARD.test(said(note)));
    const placedRows = Object.fromEntries(pushed.map(([degree, row]) => [degree, { within: row.forcedMovement.distance }]));
    const rows = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => {
        if (!row?.forcedMovement) return [degree, row];
        const { forcedMovement, ...rest } = row;
        return [degree, rest];
    }));
    const placed = { rows: placedRows, nearSource: null, optional: false, lines: hazard ? ["Into a hazardous space, this has the incapacitation trait"] : [], byHand: pushed.map(([degree, row]) => `${degree === "criticalFailure" ? "On a critical failure" : "On a failure"}, move it to a space its attacker picks within ${row.forcedMovement.distance} feet.`).join(" ") };
    const notes = strikeNotes.filter((note) => !PICKS.test(said(note)) && !HAZARD.test(said(note)) && !CARRY.test(said(note)));
    const result = settled({ ...plan, strike: { ...plan.strike, notes, save: { ...save, resolution: { ...save.resolution, outcomes: rows }, placed } } }, plan.notes ?? [], null);
    // (The Strike's notes counted too: what's left of them keeps it partial.)
    if (notes.length) result.partial = true;
    return result;
}

// A check whose success moves the creature: plan.placed, its line for the GM gone.
export function withPlacedCheck(plan) {
    const outcomes = plan?.resolution?.outcomes;
    if (plan?.resolution?.kind !== "check" || plan.builtin || !outcomes) return plan;
    let read = null;
    const rows = Object.fromEntries(Object.entries(outcomes).map(([degree, row]) => {
        const lines = row?.manualInstructions ?? [];
        const match = lines.map((line) => MOVE_INTO.exec(said(line))).find(Boolean);
        if (!match) return [degree, row];
        read = match;
        return [degree, { ...row, manualInstructions: lines.filter((line) => !MOVE_INTO.test(said(line))) }];
    }));
    if (!read) return plan;
    // (A success's and a critical success's alike: "On a success".)
    const within = Number(read[2]);
    const placed = { rows: { success: { within }, criticalSuccess: { within } }, nearSource: Number(read[3]), optional: true, lines: [], byHand: `On a success, its user can move the creature up to ${within} feet into a space within ${read[3]} feet of them.` };
    return settled({ ...plan, resolution: { ...plan.resolution, outcomes: rows }, placed }, plan.notes ?? [], rows);
}

// Before ability 0.9.2 (no "applied" hook, no postCard moveFrom): the plan as it was read before — its moves the GM's notes, and Roc-Shaft's
// push the core's.
export function withoutPlacedMoves(plan) {
    if (!plan) return plan;
    let next = plan;
    const back = (entry) => ({ ...entry, partial: true, notes: [...(entry.notes ?? []), entry.placed.byHand], placed: undefined });
    // (Juxtaposition's: its rows' notes stay as they are — the teleport said again, the GM's.)
    if (next.placed) next = back(next);
    if (next.strike?.save?.placed) next = { ...next, partial: true, strike: { ...next.strike, save: back(next.strike.save) } };
    if ((next.strike?.around ?? []).some((entry) => entry.moveFrom)) {
        const none = { mode: "none", multiplier: 0, sourceComponentIds: [] };
        const around = next.strike.around.map((entry) => {
            if (!entry.moveFrom) return entry;
            const outcomes = Object.fromEntries(Object.entries(entry.plan.resolution.outcomes).map(([degree, row]) => [degree, row?.forcedMovement ? { damage: row.damage ?? none, effects: row.effects ?? [], modifiers: row.modifiers ?? [] } : row]));
            return { radius: entry.radius, includeTarget: entry.includeTarget, plan: { ...entry.plan, resolution: { ...entry.plan.resolution, outcomes }, notes: [...(entry.plan.notes ?? []), entry.byHand] } };
        });
        next = { ...next, partial: true, strike: { ...next.strike, around } };
    }
    return next;
}

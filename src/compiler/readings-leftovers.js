// PF2e's own items left over: the general books' last ones, and readings two groups built twice: the readings of the 2026-10-28 batch's leftovers group (src/compiler/group-readings.js calls this outermost on both chains).
// context: { kind ("consumable" or "activation"), name (an activation's "Item: Activation"), html, text, words, base, info, frequency (an
// activation's), item, entry (an activation's), options, decide(plan) (the user's rulings applied again, for a plan still partial) }.
// → the new plan, or the same one. Pure.

export function withLeftoversGroup(plan, context) {
    return plan;
}

// The item's own Effect that its other activation gave, ended (plan.item.endsOwn { label }, src/compiler/creature-readings.js: Hosteling
// Statuette's statuette form as its companion is called forth). The item card says so, and once applied deletes the Effects of that name on
// its user — a note Effect's name, as the ability module gives it, "<item>: <label>" (scripts/live.js applyCard). Pure.

export const endsOwnName = (itemName, label) => `${itemName}: ${label}`;
// (Or the Effects of its other ways by their names, endsOwn.names: The Silent Hag's sense given before, ended by the next — 2026-10-27.)
export const endsOwnText = (endsOwn) => (endsOwn.names?.length ? `Ends its ${endsOwn.label} Effect (the one another of its ways gave)` : `Ends its ${endsOwn.label} Effect (the one its other activation gave)`);
// Its user's Effects ([{ id, name }]) that end → their ids.
export const ownEffectsToEnd = (effects, itemName, label, names = null) => (effects ?? []).filter((effect) => (names?.length ? names.includes(effect?.name) : effect?.name === endsOwnName(itemName, label))).map((effect) => effect.id);

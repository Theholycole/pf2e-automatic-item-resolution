// The item's own Effect that its other activation gave, ended (plan.item.endsOwn { label }, src/compiler/creature-readings.js: Hosteling
// Statuette's statuette form as its companion is called forth). The item card says so, and once applied deletes the Effects of that name on
// its user — a note Effect's name, as the ability module gives it, "<item>: <label>" (scripts/live.js applyCard). Pure.

export const endsOwnName = (itemName, label) => `${itemName}: ${label}`;
export const endsOwnText = (endsOwn) => `Ends its ${endsOwn.label} Effect (the one its other activation gave)`;
// Its user's Effects ([{ id, name }]) that end → their ids.
export const ownEffectsToEnd = (effects, itemName, label) => (effects ?? []).filter((effect) => effect?.name === endsOwnName(itemName, label)).map((effect) => effect.id);

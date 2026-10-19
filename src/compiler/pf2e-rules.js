// Activated ammunition whose PF2e rules already do what it adds to the Strike that fires it: Elemental Ammunition's
// DamageDice and FlatModifiers on "{item|id}-ranged-damage" (its persistent damage and its splash), Magnetic Shot's
// extra weapon dice, deadly d8 and +1 against metal, Eroding Bullet's persistent acid. PF2e applies an ammunition's rules
// to the Strike that uses it, activated or not, so there is nothing to apply when it's activated; its splash on the
// creatures around the target is the splash card's after the damage roll (scripts/bombs.js). The plan is a builtin,
// "pf2e-rules", with what those rules do as a note: no card of its own. What else the text says (Gravebane Ammunition's
// save, Garrote Shot's critical hit, Penetrating Ammunition's line) stays a note for the GM, and the plan is partial. Holy
// Water and the other thrown splash weapons whose activation is PF2e's own Strike get the same builtin. Pure.

const OWN = /\{item\|_?id\}/;
const ownSelector = (rule) => [].concat(rule.selector ?? []).some((selector) => OWN.test(String(selector)));
const DICE_WORDS = { 1: "one", 2: "two", 3: "three", 4: "four" };

// The item's rules on its own Strike: DamageDice, FlatModifier, DamageAlteration on its selectors, ItemAlteration on it.
export function ownStrikeRules(item) {
    return (item?.system?.rules ?? []).filter((rule) => (["DamageDice", "FlatModifier", "DamageAlteration"].includes(rule?.key) && ownSelector(rule)) || (rule?.key === "ItemAlteration" && OWN.test(String(rule.itemId ?? ""))));
}

// A rule in words: "2d4 persistent acid damage", "2 splash acid damage", "two more weapon damage dice", "the deadly-d8
// trait", "a +1 circumstance bonus to attack rolls (against: target:trait:metal)".
function ruleText(rule) {
    if (rule.key === "DamageDice") {
        const category = rule.category === "persistent" ? "persistent " : rule.category === "splash" ? "splash " : "";
        if (!rule.dieSize) return `${DICE_WORDS[rule.diceNumber] ?? rule.diceNumber} more weapon damage ${Number(rule.diceNumber) === 1 ? "die" : "dice"}${rule.damageType ? ` of ${rule.damageType}` : ""}`;
        return `${rule.diceNumber ?? 1}${rule.dieSize} ${category}${rule.damageType ?? ""} damage${againstText(rule)}`.replace(/\s+/g, " ");
    }
    if (rule.key === "FlatModifier") {
        const value = Number(rule.value);
        if (/damage$/.test([].concat(rule.selector).join(" "))) {
            const category = rule.damageCategory === "persistent" ? "persistent " : rule.damageCategory === "splash" ? "splash " : "";
            return `${Number.isFinite(value) ? value : rule.value} ${category}${rule.damageType ?? ""} damage`.replace(/\s+/g, " ");
        }
        return `a ${value >= 0 ? "+" : "−"}${Math.abs(value)} ${rule.type ?? ""} ${value >= 0 ? "bonus" : "penalty"} to its attack roll${againstText(rule)}`.replace(/\s+/g, " ");
    }
    if (rule.key === "ItemAlteration" && rule.property === "traits") return `the ${rule.value} trait`;
    if (rule.key === "DamageAlteration") return `its damage ${rule.property ?? "altered"}${rule.value ? ` (${rule.value})` : ""}`;
    return null;
}

// (A rule's predicate on the target's traits: " against metal targets".)
function againstText(rule) {
    const traits = (rule.predicate ?? []).filter((entry) => typeof entry === "string" && entry.startsWith("target:trait:")).map((entry) => entry.slice("target:trait:".length));
    return traits.length ? ` against ${traits.join(" or ")} targets` : "";
}

const listText = (words) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : words[0]);
// (A sentence beyond the damage: a save, a critical hit, a line, resistance or Hardness.)
const MORE = /@Check\[|\bsav(?:e|ing throw)\b|\bcritical\b|@Template\[|\bline\b|\bresistance\b|\bHardness\b|\bcan't\b|\bnatural 20\b/i;

// The trait a splash weapon harms only creatures with, from its text: Holy Water's "can damage only creatures with the unholy
// trait" → "unholy"; null when it harms any.
export function onlyHarms(item) {
    const match = /\bcan damage only creatures with the (\w+) trait\b/i.exec(String(item?.system?.description?.value ?? "").replace(/<[^>]+>/g, " "));
    return match ? match[1].toLowerCase() : null;
}

// A thrown consumable weapon with splash damage (Holy Water): its "Activate A Strike" is PF2e's own Strike, which rolls its
// damage and splash; the splash card after the damage roll lists the creatures within 5 feet of the target.
function splashWeaponPlan(item, base) {
    const traits = item?.system?.traits?.value ?? [];
    if (item?.type !== "weapon" || !traits.includes("consumable") || !traits.includes("thrown") || !(Number(item.system?.splashDamage?.value) > 0)) return null;
    const harms = onlyHarms(item);
    const notes = [`PF2e's own Strike with ${item.name} rolls its damage and its splash.`, "After the damage roll, the splash card lists the creatures within 5 feet of the target for its splash."];
    if (harms) notes.push(`It harms only creatures with the ${harms} trait: the splash card leaves the others unticked, and its damage on a target without the trait is for the GM to leave unapplied.`);
    return { ...base, builtin: "pf2e-rules", rules: [], notes };
}

// The plan for an activated ammunition's activation that PF2e's own rules do, or null. text: the activation's (plain).
export function pf2eRulesPlan(item, base, text = "") {
    if (item?.type === "weapon") return splashWeaponPlan(item, base);
    if (item?.type !== "ammo") return null;
    const rules = ownStrikeRules(item);
    if (!rules.length) return null;
    const words = rules.map(ruleText).filter(Boolean);
    const splash = rules.some((rule) => rule.damageCategory === "splash" || rule.category === "splash");
    const notes = [`PF2e's own rules on ${item.name} add ${listText(words)} to the Strike that fires it.`];
    if (splash) notes.push("After the damage roll, the splash card lists the creatures within 5 feet of the target for its splash.");
    const more = String(text).split(/(?<=[.!?])\s+(?=[A-Z@])/).filter((sentence) => MORE.test(sentence)).map((sentence) => sentence.trim());
    return { ...base, builtin: "pf2e-rules", rules: rules.map((rule) => rule.key), notes: [...notes, ...more], ...(more.length ? { partial: true } : {}) };
}

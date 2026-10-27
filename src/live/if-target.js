// A rider only for some creatures (plan.ifTarget, src/compiler/materials.js withMaterialRider): Moonlit Spellgun's Enfeebled on a critical
// success at a creature weak to silver or whose resistance silver gets past; a save's bonus or immunity by kind (src/compiler/kind-saves.js). The attack card posts the plan with the rider for those creatures,
// the plain plan for the rest (scripts/poisons.js). Pure.

// An exception's words: PF2e's are strings ("silver") or { definition, label } objects.
const exceptionWords = (exception) => (typeof exception === "string" ? exception : [exception?.label, ...(exception?.definition ?? [])].filter(Boolean).join(" ")).toLowerCase();

// Whether the material gets past the creature: a weakness to it, or a resistance with it as an exception.
export function materialGetsPast(actor, material) {
    const attributes = actor?.attributes ?? actor?.system?.attributes ?? {};
    const words = String(material ?? "").toLowerCase();
    if (!words) return false;
    if ((attributes.weaknesses ?? []).some((weakness) => String(weakness?.type ?? "").toLowerCase() === words)) return true;
    return (attributes.resistances ?? []).some((resistance) => (resistance?.exceptions ?? []).some((exception) => exceptionWords(exception).split(/[\s,]+/).includes(words) || exceptionWords(exception).includes(words)));
}

// (2026-10-20, src/compiler/kind-saves.js: a creature's traits and senses — PF2e's actor.traits Set and system.perception.senses.)
const traitsOf = (actor) => new Set([...(actor?.system?.traits?.value ?? []), ...(actor?.traits ?? [])].map((trait) => String(trait).toLowerCase()));
const sensesOf = (actor) => [...(actor?.system?.perception?.senses ?? []), ...(actor?.perception?.senses ?? [])].map((sense) => String(sense?.type ?? sense).toLowerCase());
// (Living, PF2e's mode of being — not undead nor a construct when PF2e doesn't say: Spirit Fan's living target, 2026-10-25.)
const living = (actor) => (actor?.modeOfBeing ? actor.modeOfBeing === "living" : !traitsOf(actor).has("undead") && !traitsOf(actor).has("construct"));
// (Its weakness of a type, PF2e's attributes.weaknesses: its value, 0 with none.)
export const weaknessOf = (actor, type) => Math.max(0, ...((actor?.attributes ?? actor?.system?.attributes ?? {}).weaknesses ?? []).filter((weakness) => String(weakness?.type ?? "").toLowerCase() === type).map((weakness) => Number(weakness.value) || 0));
// (2026-10-27, src/compiler/trigger-readings.js: a creature that must breathe and isn't holding its breath — no construct (an eidolon aside)
// nor undead, no ability saying it needn't breathe, as the environment module reads them, and no Effect of holding its breath, that module's
// Remaining Air or one named for it —, Smogger's smog; one specifically vulnerable to sunlight — an ability named for sunlight (Sunlight
// Powerlessness, Vulnerable to Sunlight) or a vampire's vulnerabilities —, Horn of the Sun Aurochs'.)
const ENVIRONMENT_ID = "pf2e-automatic-environment-resolution";
const itemsOf = (actor) => (Array.isArray(actor?.items) ? actor.items : actor?.items?.contents ?? [...(actor?.items ?? [])]);
const abilityNames = (actor) => itemsOf(actor).filter((item) => ["action", "feat"].includes(item?.type)).map((item) => String(item?.name ?? "").toLowerCase());
const NO_BREATH = /\b(?:doesn't need to breathe|does not breathe|no breath)\b/;
const HOLDING = /\bholding (?:its |your |their )?breath\b|\bremaining air\b/i;
export function breathes(actor) {
    const traits = traitsOf(actor);
    if ((traits.has("construct") && !traits.has("eidolon")) || traits.has("undead")) return false;
    if (abilityNames(actor).some((name) => NO_BREATH.test(name))) return false;
    return !(actor?.itemTypes?.effect ?? []).some((effect) => effect?.flags?.[ENVIRONMENT_ID]?.air || HOLDING.test(String(effect?.name ?? "")));
}
const SUNLIGHT = /\bsunlight\b|\bvampire (?:vulnerabilities|weaknesses)\b/;
export const sunlightVulnerable = (actor) => abilityNames(actor).some((name) => SUNLIGHT.test(name));
// (Or a creature without it, lacks: Dawnlight's flash only for creatures with darkvision, the rest immune — 2026-10-27.)
const fits = (entry, actor) => (entry.lacks ? !fitsKind({ ...entry, lacks: false }, actor) : fitsKind(entry, actor));
const fitsKind = (entry, actor) => (entry.breathes ? breathes(actor) : entry.sunlight ? sunlightVulnerable(actor) : entry.weakness ? weaknessOf(actor, entry.weakness) > 0 : entry.material ? materialGetsPast(actor, entry.material) : entry.living ? living(actor) : entry.traits ? entry.traits.some((trait) => traitsOf(actor).has(trait)) : entry.senses ? entry.senses.some((sense) => sensesOf(actor).includes(sense)) : false);

// The plan for that creature: its riders added to their degree's effects when it fits; a save's bonus or penalty for its kind (Lamentation of
// the Faithless's holy creatures' –2); null for a kind immune to it (its unholy ones).
// (2026-10-25: healing instead for those creatures, Spirit Fan's living target's "the energy restores 3d8+8 Hit Points" — the plan's kindHeal, no
// save, healed by the card itself (scripts/poisons.js); another damage for them, Lance of Sun's Radiance's dragons' 6d12 spirit — its shared
// damage's first formula.)
export function planFor(plan, actor) {
    const riders = (plan?.ifTarget ?? []).filter((entry) => fits(entry, actor));
    if (!riders.length) return plan;
    if (riders.some((entry) => entry.immune)) return null;
    const heal = riders.find((entry) => entry.heal);
    if (heal) return { ...plan, kindHeal: heal.heal };
    // (Its weakness triggered again in place of the damage, Freedom's Flame's holy one: that weakness's value, untyped.)
    const again = riders.find((entry) => entry.weaknessDamage);
    const formula = again ? `${weaknessOf(actor, again.weakness)}[untyped]` : riders.find((entry) => entry.formula)?.formula;
    if (formula && plan.resolution.sharedDamage?.components?.length) plan = { ...plan, resolution: { ...plan.resolution, sharedDamage: { ...plan.resolution.sharedDamage, components: plan.resolution.sharedDamage.components.map((component, index) => (index === 0 ? { ...component, formula } : component)) } } };
    const outcomes = { ...plan.resolution.outcomes };
    for (const rider of riders.filter((entry) => entry.degree && entry.effects)) outcomes[rider.degree] = { ...outcomes[rider.degree], effects: [...(outcomes[rider.degree]?.effects ?? []), ...rider.effects] };
    // (A note Effect for those creatures, Rattling Bolt's undead's lifesense lost, 2026-10-26.)
    for (const rider of riders.filter((entry) => entry.degree && entry.noteEffects)) outcomes[rider.degree] = { ...outcomes[rider.degree], noteEffects: [...(outcomes[rider.degree]?.noteEffects ?? []), ...rider.noteEffects] };
    // (More damage on its failures for those creatures, Locust Leather's swarms' 1d6 persistent poison: the save's shared damage and that, 2026-10-26.)
    for (const rider of riders.filter((entry) => entry.failDamage)) for (const degree of ["failure", "criticalFailure"]) {
        const row = outcomes[degree];
        if (row?.damage?.mode === "shared") outcomes[degree] = { ...row, damage: { mode: "mixed", shared: row.damage, formulas: [{ formula: rider.failDamage }], rollScope: "target" } };
    }
    const bonuses = riders.filter((entry) => entry.bonus);
    const check = bonuses.length ? { ...plan.resolution.check, bonus: { value: bonuses.reduce((sum, entry) => sum + Number(entry.bonus.value), Number(plan.resolution.check?.bonus?.value) || 0), type: bonuses[0].bonus.type } } : plan.resolution.check;
    return { ...plan, resolution: { ...plan.resolution, check, outcomes } };
}

// The tokens by the plan each gets → [{ plan, tokens }] (one group when the plan has no such rider; plan null for those immune).
export function targetGroups(plan, tokens) {
    if (!(plan?.ifTarget ?? []).length) return [{ plan, tokens }];
    const groups = [];
    for (const token of tokens) {
        const own = planFor(plan, token.actor ?? token.object?.actor);
        const group = groups.find((entry) => entry.plan === own) ?? groups.find((entry) => own && entry.plan && entry.plan !== plan && own !== plan && JSON.stringify(entry.plan) === JSON.stringify(own));
        if (group) group.tokens.push(token);
        else groups.push({ plan: own, tokens: [token] });
    }
    return groups;
}

// (Its Prone only for a creature on the ground, Drake Rifle (Fire)'s Drake Shot — plan.strike.groundedProne, src/compiler/row-readings.js: a
// target above the ground, its token's elevation, keeps the rest of its rows but not their Prone.)
export function withoutAloftProne(plan, elevation) {
    if (!plan?.strike?.groundedProne || !(Number(elevation) > 0)) return plan;
    const outcomes = Object.fromEntries(Object.entries(plan.resolution?.outcomes ?? {}).map(([degree, row]) => [degree, row ? { ...row, effects: (row.effects ?? []).filter((effect) => effect?.slug !== "prone") } : row]));
    return { ...plan, resolution: { ...plan.resolution, outcomes } };
}

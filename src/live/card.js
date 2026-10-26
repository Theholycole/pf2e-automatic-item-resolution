// The item card's state and HTML, and the item-specific parts of applying it
// (which creature drinks, what PF2e rolled, an Effect's grade). Pure: no
// Foundry, so it is tested in Node. The card wears the ability module's
// classes (pf2e-aar-card, aar-*), so both modules' cards look alike.

import { skillPickRules } from "../compiler/skill-pick.js";
import { firstDegreeRules } from "../compiler/first-degree.js";
import { restoreText } from "../compiler/restore.js";
import { attackRidersText } from "../compiler/attack-riders.js";
import { ENVIRONMENT_ID, temperatureFlag, temperatureText } from "../compiler/temperature.js";
import { fallText } from "../compiler/falls.js";
import { conditionUuid } from "../compiler/row-readings.js";
import { weatherText } from "../compiler/weather.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// The id the core's context gives the user (as the ability module's cards: "source") and the drinker.
export const USER_ID = "source";
export const DRINKER_ID = "drinker";

// A new card: the plan, the item ({ name, uuid, sourceId, slug, img }), its user
// ({ actorUuid, tokenUuid, name }), the creatures it can be fed to (the user first),
// and PF2e's own roll for it ({ total, formula, kind, messageId } or null).
// Whether its card picks one of its user's weapons: a rune it lends one, one it makes its user's best, a whetstone's riders.
export const picksWeapon = (plan) => Boolean((plan?.item?.rune && !plan.item.rune.own) || plan?.item?.proficiency || (plan?.item?.attackRiders?.riders ?? []).some((rider) => rider.weapon));

// weapons: its user's, [{ id, name }], for a rune it lends a weapon (plan.item.rune), picked on the card.
// installed: its user's items of the kind installed in it (plan.item.installed), [{ id, name, level, bonus, splash, quantity }], picked on
// the card.
// potions: its user's, [{ id, name, level }], for a potion it holds (plan.item.patch), picked on the card.
// (held: the conditions its user has now — a reduce entry "held", Armbands of the Gorgon's "a single condition of your choice currently
// afflicting you", lists only those.)
export function createItemCard({ plan: given, item, user, drinkers = [], rolled = null, weapons = [], installed = [], potions = [], held = null }) {
    const plan = held && (given?.item?.reduce ?? []).some((entry) => entry.held) ? { ...given, item: { ...given.item, reduce: given.item.reduce.map((entry) => (entry.held ? { ...entry, choose: entry.choose.filter((slug) => held.includes(slug)) } : entry)) } } : given;
    const drinker = plan?.item?.recipient === "drinker";
    const choices = drinker ? [user, ...drinkers.filter((entry) => entry.actorUuid !== user.actorUuid || entry.tokenUuid !== user.tokenUuid)] : [];
    return {
        kind: "item",
        status: "open",
        plan,
        item,
        user,
        drinkers: choices,
        drinker: drinker ? 0 : null,
        // (A tea's Tea Ceremony: ticked on the card, false until then; null for any other item.)
        ceremony: plan?.item?.ceremony ? false : null,
        ...(picksWeapon(plan) ? { weapons, runeWeapon: 0 } : {}),
        // (The alchemical item installed in it: one of its user's, picked.)
        ...(plan?.item?.installed ? { installed, installedPick: 0 } : {}),
        // (A potion it holds, Potion Patch's: one of its user's, picked.)
        ...(plan?.item?.patch ? { potions, potionPick: 0 } : {}),
        // (One of several runes, picked: Boughshatter's Decaying, Grievous or Wounding.)
        ...(plan?.item?.rune?.choices?.length ? { runeChoice: 0 } : {}),
        rolled,
        results: []
    };
}

// The creature who gets the item's benefit: the chosen drinker, or the user.
export function recipientOf(state) {
    return state.drinker === null || state.drinker === undefined ? state.user : state.drinkers[state.drinker] ?? state.user;
}

// The ability module's state for its applyChange: the user as "source", the drinker as the one target.
export function abilityState(state) {
    const recipient = recipientOf(state);
    return {
        plan: state.plan,
        ability: { name: state.item.name, uuid: state.item.uuid ?? null },
        source: { actorUuid: state.user.actorUuid, tokenUuid: state.user.tokenUuid ?? null, name: state.user.name },
        targets: [{ id: DRINKER_ID, actorUuid: recipient.actorUuid, tokenUuid: recipient.tokenUuid ?? null, name: recipient.name }]
    };
}

// The core's io.damage for the healing PF2e already rolled: its total for the first
// request (healing and effect plans roll their healing first, and it is PF2e's one
// formula), then null (roll the rest).
export function rolledHealing(state) {
    let used = false;
    return () => {
        if (used || state.rolled?.kind !== "healing" || !Number.isFinite(state.rolled.total)) return null;
        used = true;
        return state.rolled.total;
    };
}

// A core damage instance as a Foundry Roll formula ("2*1d6 + 3").
export const rollFormula = (instance) => [...(instance?.dice ?? []).map((term) => `${term.factor && term.factor !== 1 ? `${term.factor}*` : ""}${term.count}d${term.die}`), instance?.constant ? String(instance.constant) : null].filter(Boolean).join(" + ") || "0";

// The plan application an effect change came from (the core's change keeps only uuid and label).
export function applicationFor(plan, change) {
    return (plan?.resolution?.applications ?? []).find((entry) => entry.uuid === change?.effect?.uuid) ?? null;
}

const UNIT = { rounds: "round", minutes: "minute", hours: "hour", days: "day" };
const timeText = (duration) => `${duration.value} ${duration.value === 1 ? UNIT[duration.unit] ?? duration.unit : duration.unit}`;
// A time in words, its turn's end or start when it's one: " until the end of the turn" (0 rounds), " until the start of the next
// turn", " for 1 minute".
const forTime = (duration) => {
    if (duration?.mode !== "fixed") return "";
    if (duration.unit === "rounds" && duration.value === 0) return " until the end of the turn";
    if (duration.anchor === "source-turn" && duration.value === 1) return ` until the ${duration.expiry === "turn-end" ? "end" : "start"} of the next turn`;
    return ` for ${timeText(duration)}`;
};

// A condition it lowers, in words: "Lowers frightened by 1", "Ends doomed", "Lowers one of clumsy, enfeebled or
// stupefied by 1 (picked below)", "… on each creature you target".
const orList = (words) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words.at(-1)}` : words[0]);
// (Its area, Fearless Sash's: "… on each creature you target (you and allies within 5 feet)".)
export function reductionText({ slug, choose, by, who, optional, radius }) {
    const what = choose ? `one of ${orList(choose)}` : slug;
    const done = by === "all" ? `Ends ${what}` : `Lowers ${what} by ${by}`;
    return `${done}${choose ? " (picked below)" : ""}${who === "targets" ? ` on each creature you target${Number.isFinite(radius) ? ` (you and allies within ${radius} feet)` : ""}${optional ? " (if any)" : ""}` : ""}`;
}

// A bonus or penalty in words: "+2 item to performance for 1 hour", "+3 item to perception (sense motive, against the marked creature)".
export function modifierText(modifier) {
    const predicate = modifier.predicate ?? [];
    const actions = predicate.filter((term) => typeof term === "string" && term.startsWith("action:")).map((term) => term.slice(7).replace(/-/g, " "));
    const marked = predicate.some((term) => typeof term === "string" && term.startsWith("target:mark:"));
    // (Its effects' traits, Admirer's Bouquet's "against emotion or mental effects": item:trait:… terms, alone or in an "or".)
    const traitsOf = (terms) => terms.filter((term) => typeof term === "string" && term.startsWith("item:trait:")).map((term) => term.slice(11));
    const traits = [...traitsOf(predicate), ...predicate.filter((term) => Array.isArray(term?.or)).flatMap((term) => traitsOf(term.or))];
    const scope = [...actions, ...(marked ? ["against the marked creature"] : []), ...(traits.length ? [`against ${traits.join(" or ")} effects`] : [])];
    return `${modifier.value > 0 ? "+" : "−"}${Math.abs(modifier.value)} ${modifier.type} to ${modifier.selector}${scope.length ? ` (${scope.join(", ")})` : ""}${forTime(modifier.duration)}`;
}

// What Apply will do, as lines for the card.
export function previewLines(state) {
    const plan = state.plan;
    const lines = [];
    // (A weapon its user treats as their best, src/compiler/proficiency-loan.js.)
    if (plan?.item?.proficiency) lines.push(proficiencyText(plan.item.proficiency));
    // (A potion it holds, src/compiler/patch.js: used through it.)
    if (plan?.item?.patch) lines.push(`Uses one of your potions${plan.item.patch.maxLevel ? ` (level ${plan.item.patch.maxLevel} or lower)` : ""} through it: the potion's own card follows`);
    // (The alchemical item installed in it, src/compiler/installed.js: what its numbers give, the item used up.)
    if (plan?.item?.installed) lines.push(installedText(plan.item.installed));
    // (A spell slot it costs, src/compiler/slot-cost.js: spent when it's applied.)
    if (plan?.spend?.spellSlot) lines.push(Number.isInteger(plan.spend.spellSlot.rank) ? `Costs a rank ${plan.spend.spellSlot.rank} spell slot` : `Costs a spell slot of rank ${plan.spend.spellSlot.min} or higher (the lowest left)`);
    // (The conditions it lowers, src/compiler/reduce.js.)
    for (const entry of plan?.item?.reduce ?? []) lines.push(reductionText(entry));
    // (Its allies' own Effect, src/compiler/consumables.js plan.allyLinks: Belt of the Five Kings'.)
    for (const link of plan?.allyLinks ?? []) lines.push(`${link.label} on each ally within ${link.radius} feet of you`);
    // (A Mythic Point it gives back, src/compiler/reduce.js readRegain.)
    if (plan?.item?.regain?.mythicPoints) lines.push(`Gives back ${plan.item.regain.mythicPoints} Mythic Point${plan.item.regain.mythicPoints === 1 ? "" : "s"} (a Hero Point instead under the world setting)`);
    // (A rune it lends a weapon, src/compiler/rune-loans.js.)
    if (plan?.item?.rune) lines.push(runeText(plan.item.rune));
    // (A condition until the end of the user's rage, src/compiler/rage-time.js.)
    if (plan?.item?.untilRage) lines.push(`${untilRageText(plan.item.untilRage)}, while raging`);
    // (Its resistance, src/compiler/rows.js: the card's own Effect.)
    if (plan?.item?.resist?.length) lines.push(resistanceText(plan.item.resist));
    // (A Speed of a new kind, src/compiler/rows.js: the card's own Effect.)
    for (const speed of plan?.item?.speeds ?? []) lines.push(speedText(speed));
    for (const sense of plan?.item?.senses ?? []) lines.push(senseText(sense));
    // (Protection from heat or cold, src/compiler/temperature.js: the card's own Effect, for the environment module.)
    if (plan?.temperature?.counts) lines.push(temperatureLine(plan.temperature));
    // (A fall it eases, src/compiler/falls.js: the card's own Effect, for the environment module.)
    if (plan?.fall) lines.push(fallLine(plan.fall));
    // (What of the weather it ignores, src/compiler/weather.js: the card's own Effect, for the environment module.)
    if (plan?.weatherIgnores) lines.push(weatherLine(plan.weatherIgnores));
    // (Its user's shield raised, src/compiler/raise-shield.js: PF2e's own Raise a Shield.)
    if (plan?.raiseShield) lines.push("Raises its user's shield (PF2e's Raise a Shield)");
    for (const light of plan?.item?.light ?? []) lines.push(lightText(light));
    for (const entry of plan?.item?.levelTemp ?? []) lines.push(levelTempText(entry));
    for (const adjust of plan?.item?.weapon ?? []) lines.push(weaponText(adjust));
    for (const attack of plan?.item?.attacks ?? []) lines.push(attackText(attack));
    for (const healing of plan?.item?.fastHealing ?? []) lines.push(fastHealingText(healing));
    if (plan?.item?.creates) lines.push(createsText(plan.item.creates));
    if (plan?.item?.shieldForm) lines.push(shieldFormText(plan.item.shieldForm));
    // (PF2e's own rules on it, Mirrorblade's flanking.)
    for (const entry of plan?.item?.ruleEffects ?? []) lines.push(`${entry.words}${forTime(entry.duration)}`);
    // (Another of its activations recharged: Smoldering Armor's Fire Shield.)
    if (plan?.item?.recharges) lines.push(`The ${plan.item.recharges.name} activation recharges (its uses given back)`);
    if (plan?.item?.mark) lines.push(markText(plan.item.mark));
    if (plan?.item?.attackRiders) lines.push(attackRidersText(plan.item.attackRiders.riders));
    if (plan?.item?.lightAura) lines.push(`For each creature in the bright light (${plan.item.lightAura.radius} feet): ${plan.item.lightAura.modifiers.map((modifier) => modifierText({ ...modifier, duration: null })).join(", ")}${forTime(plan.item.lightAura.duration)}`);
    for (const extra of plan?.item?.strikeDamage ?? []) lines.push(strikeDamageText(extra));
    for (const entry of plan?.item?.suppress ?? []) lines.push(suppressText(entry));
    if (plan?.item?.skillPick) lines.push(skillPickText(plan.item.skillPick));
    if (plan?.item?.firstDegree) lines.push(firstDegreeText(plan.item.firstDegree));
    // (Its maximum Hit Points and its afflictions, src/compiler/restore.js.)
    if (plan?.item?.restore) lines.push(restoreText(plan.item.restore));
    // (Its flat check to end persistent damage, src/compiler/recovery.js.)
    if (plan?.item?.recovery) lines.push(recoveryText(plan.item.recovery));
    // (What a reduction alone leaves to the table: Cinnamon Nostalgia Bun's flat check.)
    if (plan?.reduce) for (const note of plan.notes ?? []) lines.push(`Also: ${note}`);
    const healing = plan?.resolution?.native?.healing;
    if (healing?.components?.length) {
        const formula = healing.components.map((component) => component.formula).join(" + ");
        lines.push(state.rolled?.kind === "healing" && Number.isFinite(state.rolled.total) ? `Heals ${state.rolled.total} Hit Points (PF2e's roll of ${formula})` : `Heals ${formula} Hit Points`);
    }
    for (const application of plan?.resolution?.applications ?? []) {
        const extra = [application.level ? `rank ${application.level}` : null, application.duration ? timeText(application.duration) : null, Number(application.tempHP) ? `${application.tempHP} more temporary Hit Points` : null].filter(Boolean).join(", ");
        lines.push(`${application.label ?? "Effect"}${extra ? ` (${extra})` : ""}`);
    }
    // The item's own row (an automatic check): what the drinker gets.
    const row = plan?.resolution?.kind === "check" && plan.resolution.check?.roll === "automatic" ? plan.resolution.outcomes?.success ?? {} : {};
    for (const effect of row.effects ?? []) {
        const time = effect.duration?.mode === "fixed" ? (effect.duration.expiry === "turn-end" && effect.duration.anchor === "source-turn" ? "until the end of the next turn" : `for ${timeText(effect.duration)}`) : null;
        const amount = effect.amount ?? effect.formula;
        if (effect.kind === "condition") lines.push(`${effect.slug}${Number.isFinite(effect.value) ? ` ${effect.value}` : ""}${time ? ` ${time}` : ""}`);
        else if (effect.kind === "temp-hp") lines.push(`${amount} temporary Hit Points${time ? ` ${time}` : ""}`);
        else if (effect.kind === "heal") lines.push(`Heals ${amount} Hit Points`);
    }
    for (const modifier of row.modifiers ?? []) lines.push(modifierText(modifier));
    for (const note of row.noteEffects ?? []) lines.push(plan.partial ? `A note of its text${note.duration?.mode === "fixed" ? ` for ${timeText(note.duration)}` : ""}: the rest is the GM's to apply` : `A note of its text${note.duration?.mode === "fixed" ? ` for ${timeText(note.duration)}` : ""} (nothing else to apply)`);
    // (A reduction's own notes are above, as "Also: …".)
    if (!plan?.reduce) for (const note of plan?.notes ?? []) lines.push(note);
    return lines;
}

// The PF2e Effect to create from its compendium source: the grade the item is (PF2e's
// equipment Effects share one item across grades, with a ChoiceSet on the used item's
// slug, which can't be read once the last dose is deleted), the spell's rank, the time
// the item gives, and where it came from. Returns a new source.
// ceremony: a tea's Tea Ceremony, true or false (null for any other item) — PF2e's own ceremony choice on the tea's Effect
// is preset to it (Peace in Dreams Tea's "tea-ceremony", Resurrection Tea's "TeaCeremony" label), so PF2e needn't ask.
const isCeremonyChoice = (entry) => entry?.value === "tea-ceremony" || /TeaCeremony/i.test(String(entry?.label ?? ""));
export function effectSource(template, { application = null, item = {}, user = {}, worldTime = 0, initiative = null, flags = {}, ceremony = null } = {}) {
    const source = structuredClone(template);
    delete source._id;
    const slug = item.slug ?? null;
    for (const rule of source.system?.rules ?? []) {
        if (rule?.key !== "ChoiceSet" || rule.selection !== undefined || !Array.isArray(rule.choices)) continue;
        if (ceremony !== null && rule.choices.some(isCeremonyChoice)) {
            const chosen = rule.choices.find((entry) => (ceremony ? isCeremonyChoice(entry) : !isCeremonyChoice(entry)));
            if (chosen) rule.selection = chosen.value;
            continue;
        }
        // (Its choice named by the text, Elemental Form's element: application.choice, src/compiler/form-extras.js.)
        const named = application?.choice ? rule.choices.find((entry) => entry?.value === application.choice) : null;
        const choice = named ?? rule.choices.find((entry) => (item.sourceId && entry?.value === item.sourceId) || (slug && JSON.stringify(entry?.predicate ?? []).includes(`parent:origin:item:slug:${slug}"`)));
        if (choice) rule.selection = choice.value;
    }
    source.system ??= {};
    if (Number.isFinite(application?.level) && application.level > 0) source.system.level = { ...(source.system.level ?? {}), value: application.level };
    if (application?.duration) source.system.duration = { ...(source.system.duration ?? {}), value: application.duration.value, unit: application.duration.unit, expiry: source.system.duration?.expiry ?? "turn-start", sustained: false };
    // ("gain 10 additional temporary Hit Points from your Rage": its TempHP rule raised by that much, src/compiler/rage.js.)
    if (Number(application?.tempHP)) for (const rule of source.system.rules ?? []) if (rule?.key === "TempHP") rule.value = `(${rule.value ?? 0}) + ${Number(application.tempHP)}`;
    source.system.start = { value: worldTime, initiative };
    source.system.context = { ...(source.system.context ?? {}), origin: { ...(source.system.context?.origin ?? {}), actor: user.actorUuid ?? null, token: user.tokenUuid ?? null, item: item.uuid ?? null } };
    source.flags = { ...(source.flags ?? {}), ...flags };
    return source;
}

// The resistance an item gives its user (plan.item.resist, src/compiler/rows.js) in words: "Resistance 5 to slashing and
// piercing for 10 minutes".
const typeWords = (type) => (type === "all-damage" ? "all damage" : type.replace(/-/g, " "));
export function resistanceText(resist) {
    // (Immunity, its own words: "Immunity to fire until the end of the next turn".)
    const immune = resist.filter((entry) => entry.immune);
    if (immune.length) {
        const duration = immune.find((entry) => entry.duration?.mode === "fixed")?.duration;
        const time = !duration ? "" : duration.anchor === "source-turn" ? ` until the ${duration.expiry === "turn-end" ? "end" : "start"} of the next turn` : ` for ${timeText(duration)}`;
        const rest = resist.filter((entry) => !entry.immune);
        return `Immunity to ${immune.map((entry) => typeWords(entry.type)).join(" and ")}${time}${rest.length ? `; ${resistanceText(rest)}` : ""}`;
    }
    const byValue = new Map();
    // (A type to choose: "acid, cold or fire (one, chosen)".)
    // (Damage from some creatures: its own words, "spirit and void damage from unholy creatures".)
    // (All damage but some: "all damage except force and ghost touch, double against non-magical".)
    const list = (words) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : words[0]);
    const but = (entry) => (entry.exceptions?.length ? ` except ${list(entry.exceptions.map(typeWords))}` : "") + (entry.doubleVs?.length ? `, double against ${entry.doubleVs.map(typeWords).join(" and ")}` : "");
    for (const entry of resist) byValue.set(entry.value, [...(byValue.get(entry.value) ?? []), entry.type === "custom" ? entry.label.charAt(0).toLowerCase() + entry.label.slice(1) : entry.type ? `${typeWords(entry.type)}${but(entry)}` : `${entry.choose.slice(0, -1).join(", ")} or ${entry.choose.at(-1)} (one, chosen)`]);
    const duration = resist.find((entry) => entry.duration?.mode === "fixed")?.duration;
    // (A turn's end or start: "until the end of the turn".)
    const time = !duration ? "" : duration.anchor === "source-turn" ? ` until the ${duration.expiry === "turn-end" ? "end" : "start"} of the ${duration.value ? "next " : ""}turn` : ` for ${timeText(duration)}`;
    const lower = resist.find((entry) => entry.recoveryDC);
    // (What else its text holds it to, Chromatic Robe's: resist.note.)
    const note = resist.find((entry) => entry.note)?.note;
    return `${[...byValue].map(([value, types]) => `Resistance ${value} to ${types.join(" and ")}`).join(", ")}${lower ? `, and the flat check to end persistent ${lower.type ?? "damage of that type"}${lower.type ? " damage" : ""} ${lower.recoveryDC} easier` : ""}${time}${note ? `; ${note}` : ""}`;
}

// A Speed in words: "A fly Speed equal to your land Speed until the end of the next turn", "A swim Speed of 30 feet".
const LAND_WORDS = [[/^@actor\.system\.movement\.speeds\.land\.value$/, "equal to your land Speed"], [/^floor\(@actor\.system\.movement\.speeds\.land\.value\*0\.5\)$/, "equal to half your land Speed"], [/^max\((\d+),@actor\.system\.movement\.speeds\.land\.value\)$/, "of $1 feet or your land Speed, whichever is greater"], [/^min\((\d+),@actor\.system\.movement\.speeds\.land\.value\)$/, "of $1 feet or your land Speed, whichever is lower"]];
export function speedText(speed) {
    const formula = String(speed.value);
    const said = typeof speed.value === "number" ? `of ${speed.value} feet` : LAND_WORDS.reduce((words, [pattern, text]) => words ?? (pattern.test(formula) ? formula.replace(pattern, text) : null), null) ?? `of ${formula}`;
    const time = speed.duration?.mode === "fixed" ? (speed.duration.expiry === "turn-end" && speed.duration.anchor === "source-turn" ? " until the end of the next turn" : ` for ${timeText(speed.duration)}`) : "";
    // (One its switch turns off, Steamflight Pack's.)
    // (What else holds it, in its words: Buoyant Buckle's surface swimming and its deflating pouches, speed.note.)
    return `A ${speed.type} Speed ${said}${time}${speed.toggle ? " (the item's next activation turns it off)" : ""}${speed.note ? `; ${speed.note}` : ""}`;
}

// Its Speed's Effect: PF2e's BaseSpeed rule ("until the end of the next turn": PF2e's one round, ending at a turn's end).
export function speedEffectSource(speed, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return ownEffectSource({ name: `${speed.type} Speed`, img: "icons/svg/wing.svg", words: speedText(speed), rules: [{ key: "BaseSpeed", selector: speed.type, value: speed.value }], duration: speed.duration, flag: { speed: speed.type }, item, user, worldTime, initiative, moduleId });
}

// Its flat check to end persistent damage in words: "A flat check (DC 10) to end persistent acid, fire, poison or void damage".
export function recoveryText(recovery) {
    if (recovery.ends) return "All its user's persistent damage ends";
    if (recovery.choose) return `A flat check${recovery.dc ? ` (DC ${recovery.dc})` : ""} to end persistent damage of its type (picked below)`;
    const types = recovery.types.length > 1 ? `${recovery.types.slice(0, -1).join(", ")} or ${recovery.types.at(-1)}` : recovery.types[0];
    return `A flat check${recovery.dc ? ` (DC ${recovery.dc})` : ""} to end persistent ${types} damage${recovery.who === "targets" ? ", for the creature touched (targeted)" : ""}`;
}

// One of the card's own Effects (its resistance, Speed or vision): PF2e's rules for the item's time (unlimited with none),
// named for the item, flagged as the module's. Returns a new source.
// An Effect of PF2e's own rules on its user (item.ruleEffects): Mirrorblade's flanking.offGuardable.
export function ruleEffectSource(entry, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    // (Ended by its creature's next Strike, Amulet of the Hellcat's Invisible: entry.endsOnStrike, scripts/ends-on-strike.js.)
    return ownEffectSource({ name: entry.name, img: "icons/svg/aura.svg", words: entry.words, rules: entry.rules, duration: entry.duration, flag: { ruleEffect: entry.name, ...(entry.endsOnStrike ? { endsOnStrike: true } : {}) }, item, user, worldTime, initiative, moduleId });
}

// Protection from heat or cold in words, with its time and its terms: "Severe heat counts as mild heat for 24 hours".
export function temperatureLine(temperature) {
    const time = temperature.duration?.mode === "fixed" ? ` for ${temperature.duration.value} ${temperature.duration.value === 1 ? temperature.duration.unit.replace(/s$/, "") : temperature.duration.unit}` : temperature.until ? ` (${temperature.until.toLowerCase()})` : "";
    return `${temperatureText(temperature)}${time}${temperature.only ? ` (${temperature.only.toLowerCase()})` : ""}`;
}

// Its Effect: the environment module's flag (flags.<environment>.temperature { counts, fatigueHours?, source }), read as the creature feels the
// temperature, for the item's time.
export function temperatureEffectSource(temperature, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return ownEffectSource({ name: "temperature", img: "icons/svg/sun.svg", words: temperatureLine(temperature), rules: [], duration: temperature.duration, flag: { temperature: true }, extraFlags: { [ENVIRONMENT_ID]: { temperature: temperatureFlag(temperature, item.name ?? "an item") } }, item, user, worldTime, initiative, moduleId });
}

// A fall it eases in words, with its time: "Its falls count as 120 feet shorter for 1 round".
export function fallLine(fall) {
    const time = fall.duration?.mode === "fixed" ? ` for ${fall.duration.value} ${fall.duration.value === 1 ? fall.duration.unit.replace(/s$/, "") : fall.duration.unit}` : "";
    return `${fallText(fall)}${time}`;
}

// Its Effect: the environment module's flag (flags.<environment>.fall { shorter?, noDamage?, landsOnFeet?, source }), read as it rolls the creature's falling
// damage, for the item's time.
export function fallEffectSource(fall, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const flag = { ...(fall.shorter ? { shorter: fall.shorter } : {}), ...(fall.noDamage ? { noDamage: true } : {}), ...(fall.landsOnFeet ? { landsOnFeet: true } : {}), source: item.name ?? null };
    // (Jade Cat's Balance: a roll note on it, as PF2e's own Steady Balance.)
    const rules = fall.balance ? [{ key: "Note", selector: "acrobatics", predicate: ["action:balance"], title: item.name ?? "Balance", text: fall.balance }] : [];
    return ownEffectSource({ name: "fall", img: "icons/svg/wing.svg", words: fallLine(fall), rules, duration: fall.duration, flag: { fall: true }, extraFlags: { [ENVIRONMENT_ID]: { fall: flag } }, item, user, worldTime, initiative, moduleId });
}

// The foam an Impact Foam Chassis leaves around its wearer after a fall (src/compiler/falls.js readFoam, scripts/falls.js), with the Hit
// Points it has left: PF2e's Immobilized granted while it lasts; standard cover against other creatures as PF2e's Effect: Cover has it
// (its roll options, so what ignores cover sees it, and +2 circumstance to AC, Reflex against areas, Stealth to Hide or Sneak); their standard
// cover against its own attacks as −2 to them; Escape DC 15 (the ability module's escape flag: an Escape that beats it removes the foam);
// 1 minute. Three Interact actions or damaging it to 0 (AC 12) remove it: the GM deletes it, its Hit Points on it.
export const FOAM_ESCAPE_DC = 15;
export const FOAM_AC = 12;
const IMMOBILIZED = "Compendium.pf2e.conditionitems.Item.eIcWbB5o3pP6OIMe";
export function foamEffectSource(hp, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const cover = [
        { key: "RollOption", option: "self:cover-bonus:2" },
        { key: "RollOption", option: "self:cover-level:standard" },
        { key: "FlatModifier", selector: "ac", slug: "cover", label: "Cover", type: "circumstance", value: 2 },
        { key: "FlatModifier", selector: "reflex", slug: "cover", label: "Cover", type: "circumstance", value: 2, predicate: ["area-effect"] },
        { key: "FlatModifier", selector: "stealth", slug: "cover", label: "Cover", type: "circumstance", value: 2, predicate: [{ or: ["action:hide", "action:sneak", "avoid-detection"] }] }
    ];
    const rules = [{ key: "GrantItem", uuid: IMMOBILIZED }, ...cover, { key: "FlatModifier", selector: "attack-roll", slug: "foam-cover", label: "Their cover (foam)", type: "circumstance", value: -2 }];
    const words = `Wrapped in foam with ${hp} Hit Points (AC ${FOAM_AC}) for up to 1 minute: immobilized, standard cover against other creatures and they have standard cover against it. Escape DC ${FOAM_ESCAPE_DC}; three Interact actions, or damaging the foam to 0 Hit Points, removes it`;
    const source = ownEffectSource({ name: "foam", img: "icons/svg/clockwork.svg", words, rules, duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start" }, flag: { foam: { hp, ac: FOAM_AC } }, extraFlags: { "pf2e-automatic-ability-resolution": { escape: { dc: FOAM_ESCAPE_DC } } }, item, user, worldTime, initiative, moduleId });
    source.system.description.value += `<p>[[/act escape dc=${FOAM_ESCAPE_DC}]]{Escape}</p>`;
    return source;
}

// Exsanguinate's mark on the creature its card damaged (src/compiler/drain.js, scripts/drain.js): the first damage of its type the creature
// then takes gives its user that share as temporary Hit Points, until the item's time from now runs out. drain: { fraction, type,
// duration }; user: its user's { actorUuid, tokenUuid, name }, the Effect's origin (PF2e requires one).
const SHARE_WORDS = { 0.5: "half", 1: "all", 2: "twice" };
export function drainMarkSource(drain, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const share = SHARE_WORDS[drain.fraction] ?? `${drain.fraction} times`;
    const words = `The next ${drain.type ? `${drain.type} ` : ""}damage it takes gives ${user.name ?? "its user"} ${share} of it (after resistances) as temporary Hit Points${drain.duration?.mode === "fixed" ? `, until ${timeText(drain.duration)} after the activation` : ""}`;
    return ownEffectSource({ name: "drained", img: "icons/svg/blood.svg", words, rules: [], duration: drain.duration, flag: { drain: { fraction: drain.fraction, type: drain.type ?? null, userUuid: user.actorUuid ?? null, userName: user.name ?? null } }, item, user: { actorUuid: user.actorUuid ?? null, tokenUuid: user.tokenUuid ?? null }, worldTime, initiative, moduleId });
}

// Its user's temporary Hit Points from it: PF2e's TempHP (more than it has, else nothing; gone with the Effect), its time counted from the
// mark's start.
export function drainTempSource(amount, { item = {}, user = {}, start = { value: 0, initiative: null }, duration = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return ownEffectSource({ name: "temporary Hit Points", img: "icons/svg/regen.svg", words: `${amount} temporary Hit Points`, rules: [{ key: "TempHP", value: amount }], duration, flag: { drainTemp: true }, item, user, worldTime: start.value ?? 0, initiative: start.initiative ?? null, moduleId });
}

// What follows once a condition ends (src/compiler/after-ends.js, scripts/after-ends.js): the creature's mark while it has that condition, and
// then the next condition for its time — PF2e's condition granted by the Effect (gone with it), as the ability module's timed conditions are.
const oneCondition = (slug, value) => `${slug.charAt(0).toUpperCase()}${slug.slice(1)}${Number.isFinite(value) ? ` ${value}` : ""}`;
export function afterEndsMarkSource(entry, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const then = entry.then.immunity ? `temporarily immune to it for ${entry.then.immunity.duration.value} ${entry.then.immunity.duration.unit}` : `${oneCondition(entry.then.slug, entry.then.value)}${entry.then.duration?.mode === "fixed" ? ` for ${timeText(entry.then.duration)}` : ""}`;
    const words = `When it's no longer ${entry.when}, it becomes ${then}`;
    return ownEffectSource({ name: `after ${entry.when}`, img: "icons/svg/clockwork.svg", words, rules: [], duration: null, flag: { afterEnds: { when: entry.when, then: entry.then } }, item, user, worldTime, initiative, moduleId });
}
export function afterEndsEffectSource(then, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const uuid = conditionUuid(then.slug);
    const rules = uuid ? [{ key: "GrantItem", uuid, allowDuplicate: true, alterations: Number.isFinite(then.value) ? [{ mode: "override", property: "badge-value", value: then.value }] : [], onDeleteActions: { granter: "cascade", grantee: "cascade" } }] : [];
    return ownEffectSource({ name: oneCondition(then.slug, then.value), img: "icons/svg/clockwork.svg", words: `${oneCondition(then.slug, then.value)}${then.duration?.mode === "fixed" ? ` for ${timeText(then.duration)}` : ""}`, rules, duration: then.duration, flag: { afterEndsThen: then.slug }, item, user, worldTime, initiative, moduleId });
}

// Its wait on its wearer for a kind of damage (src/compiler/armed.js, scripts/armed.js): the mark for its time, carrying what that damage sets off.
export function armedMarkSource(armed, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const what = armed.applications.map((entry) => entry.label ?? "its Effect").join(", ");
    const words = `The first ${armed.damageType} damage it takes gives it ${what}${armed.applications[0]?.duration ? ` for ${armed.applications[0].duration.value} ${armed.applications[0].duration.value === 1 ? armed.applications[0].duration.unit.replace(/s$/, "") : armed.applications[0].duration.unit}` : ""}`;
    return ownEffectSource({ name: "armed", img: "icons/svg/fire.svg", words, rules: [], duration: armed.lasts, flag: { armed }, item, user, worldTime, initiative, moduleId });
}

// What of the weather it ignores, with its time: "Ignores the weather's fog and mist for 1 minute".
export function weatherLine(entry) {
    const time = entry.duration?.mode === "fixed" ? ` for ${entry.duration.value} ${entry.duration.value === 1 ? entry.duration.unit.replace(/s$/, "") : entry.duration.unit}` : "";
    return `${weatherText(entry)}${time}`;
}

// Its Effect: the environment module's flag (flags.<environment>.weatherIgnores { ignores, source, windUpTo? } — not "weather", its own
// Effects' mark), for the item's time.
export function weatherEffectSource(entry, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const flag = { ignores: entry.ignores, ...(entry.windUpTo ? { windUpTo: entry.windUpTo } : {}), source: item.name ?? null };
    return ownEffectSource({ name: "weather", img: "icons/svg/eye.svg", words: weatherLine(entry), rules: [], duration: entry.duration, flag: { weatherIgnores: true }, extraFlags: { [ENVIRONMENT_ID]: { weatherIgnores: flag } }, item, user, worldTime, initiative, moduleId });
}

function ownEffectSource({ name, img, words, rules, duration, flag, extraFlags = {}, item, user, worldTime, initiative, moduleId }) {
    return {
        name: `${item.name}: ${name}`,
        type: "effect",
        img: item.img ?? img,
        flags: { [moduleId]: flag, ...extraFlags },
        system: {
            description: { value: `<p>${escape(words)}, from <strong>${escape(item.name)}</strong>.</p>` },
            duration: duration?.mode === "fixed" ? { value: duration.value, unit: duration.unit, expiry: duration.expiry ?? "turn-start", sustained: false } : { value: -1, unit: "unlimited", expiry: null, sustained: false },
            start: { value: worldTime, initiative },
            context: { origin: { actor: user.actorUuid ?? null, token: user.tokenUuid ?? null, item: item.uuid ?? null } },
            rules
        }
    };
}

// A rune it lends a weapon, in words: "Gives the weapon the Vitalizing rune for 1 minute"; one of several, "the Decaying, Grievous or
// Wounding rune (picked)" until it's picked.
export function runeText(rune, weaponName = null) {
    const time = rune.duration?.mode === "fixed" ? (rune.duration.value === 0 ? " until the end of the turn" : ` for ${timeText(rune.duration)}`) : "";
    // (One rune of several types, Bane Oil's: "the Bane rune of the type picked".)
    const typed = rune.choices?.length && rune.choices.every((choice) => choice.traits?.length);
    const name = typed && !rune.picked ? `${rune.name} rune of the type picked` : rune.choices?.length && !rune.picked ? `${rune.choices.slice(0, -1).map((choice) => choice.name).join(", ")} or ${rune.choices.at(-1).name} rune (picked)` : `${rune.name} rune`;
    return `Gives ${weaponName ?? (rune.own ? "its weapon" : "the weapon picked")} the ${name}${time}`;
}

// The rune's Effect on its user: PF2e's AdjustStrike adding the property rune to that weapon (as PF2e's own Wounding Oil).
// key: PF2e's rune key, kebab-case ("disrupting", "greater-disrupting").
// A weapon its user treats as their best, in words: "The weapon picked at your highest weapon proficiency for 1 minute (one of level 11
// or lower)".
export const proficiencyText = (loan, weaponName = null) => `${weaponName ?? "The weapon picked"} at your highest weapon proficiency${forTime(loan.duration)}${loan.maxLevel && !weaponName ? ` (one of level ${loan.maxLevel} or lower)` : ""}`;

// Its Effect: PF2e's MartialProficiency for that weapon (by its id) at that rank.
export function proficiencyEffectSource(loan, { weapon, rank, item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return ownEffectSource({ name: `${weapon.name}: proficiency`, img: "icons/svg/sword.svg", words: proficiencyText(loan, weapon.name), rules: [{ key: "MartialProficiency", slug: `${String(item.name ?? "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${weapon.id}`, label: item.name ?? "Proficiency", definition: [`item:id:${weapon.id}`], value: rank }], duration: loan.duration, flag: { proficiency: weapon.id }, item, user, worldTime, initiative, moduleId });
}

export function runeEffectSource(rune, { key = rune.key, weapon, item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    // (A Bane rune of a type, Bane Oil's: 1d6 more of the weapon's own damage type against a creature with the type's traits — PF2e's DamageDice
    // on that weapon's damage, as PF2e's own Bane rune has no rules.)
    const rules = rune.traits?.length
        ? [{ key: "DamageDice", selector: `${weapon.id}-damage`, slug: "bane-oil", label: rune.name, diceNumber: 1, dieSize: "d6", predicate: [{ or: rune.traits.map((trait) => `target:trait:${trait}`) }] }]
        : [{ key: "AdjustStrike", mode: "add", property: "property-runes", value: key, definition: [`item:id:${weapon.id}`] }];
    return ownEffectSource({ name: `${rune.name} (${weapon.name})`, img: "icons/svg/sword.svg", words: runeText(rune, weapon.name), rules, duration: rune.duration, flag: { rune: key, weaponId: weapon.id }, item, user, worldTime, initiative, moduleId });
}

// Conditions until the end of the rage, in words: "Quickened until the end of the rage".
const conditionWords = (conditions) => conditions.map((entry) => `${entry.slug.charAt(0).toUpperCase()}${entry.slug.slice(1)}${entry.value ? ` ${entry.value}` : ""}`).join(" and ");
export const untilRageText = (untilRage) => `${[untilRage.conditions.length ? conditionWords(untilRage.conditions) : null, untilRage.fastHealing ? `Fast healing ${Number.isFinite(untilRage.fastHealing.value) ? untilRage.fastHealing.value : "half the user's level"}` : null].filter(Boolean).join(" and ")} until the end of the rage`;

// Their Effect: PF2e's GrantItem for each condition (uuids: the conditions' own, by slug), lasting at most a minute (a Rage's),
// flagged untilRage so the Rage's end removes it (scripts/live.js).
export function untilRageEffectSource(untilRage, uuids, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const rules = untilRage.conditions.map((entry, index) => ({ key: "GrantItem", uuid: uuids[index], ...(entry.value ? { alterations: [{ mode: "override", property: "badge-value", value: entry.value }] } : {}) })).filter((rule) => rule.uuid);
    // (Its fast healing, at the value live play worked out from its user's level.)
    if (Number.isFinite(untilRage.fastHealing?.value)) rules.push({ key: "FastHealing", value: untilRage.fastHealing.value });
    return ownEffectSource({ name: untilRageText(untilRage), img: "icons/svg/aura.svg", words: untilRageText(untilRage), rules, duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start" }, flag: { untilRage: true }, item, user, worldTime, initiative, moduleId });
}

// Its resistances with a chosen type filled in (index into the entry's choose list, the first by default).
export const chosenResistances = (resist, index = 0) => resist.map((entry) => (entry.choose?.length ? { ...entry, type: entry.choose[Number.isInteger(index) && entry.choose[index] ? index : 0], choose: undefined } : entry));

// Its resistance's Effect: PF2e's Resistance rules. moduleId: the flag's scope.
// One resistance as PF2e's rule; damage from some creatures as its custom type, the damage's types and its source's traits.
// (Or immunity, Dragonclaw Scutcheon's "immunity to all damage of that type": PF2e's Immunity rule.)
const resistanceRule = ({ type, value, from = [], damage = [], label, immune = false, exceptions = [], doubleVs = [] }) => (immune ? { key: "Immunity", type } : exceptions.length || doubleVs.length ? { key: "Resistance", type, value, ...(exceptions.length ? { exceptions } : {}), ...(doubleVs.length ? { doubleVs } : {}) } : type === "custom" ? { key: "Resistance", type: "custom", definition: [...(damage.length ? [{ or: damage.map((kind) => `damage:type:${kind}`) }] : []), { or: from.map((trait) => `origin:trait:${trait}`) }], label, value } : { key: "Resistance", type, value });
// (A lower DC for the flat check to end persistent damage of that type, Energy Ointment's: PF2e's ItemAlteration on its persistent-damage
// conditions, as PF2e's own Horned Lion Amulet Effect does.)
const recoveryRule = ({ type, recoveryDC }) => (recoveryDC && type ? [{ key: "ItemAlteration", itemType: "condition", property: "pd-recovery-dc", mode: "subtract", value: recoveryDC, predicate: [`item:damage:type:${type}`] }] : []);
export function resistanceEffectSource(resist, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const duration = resist.find((entry) => entry.duration?.mode === "fixed")?.duration ?? null;
    return ownEffectSource({ name: "resistance", img: "icons/svg/shield.svg", words: resistanceText(resist), rules: [...resist.map(resistanceRule), ...resist.flatMap(recoveryRule)], duration, flag: { resist: true }, item, user, worldTime, initiative, moduleId });
}

// A vision in words: "Darkvision until the start of the next turn", "Greater darkvision".
const SENSE_WORDS = { darkvision: "Darkvision", "greater-darkvision": "Greater darkvision", "low-light-vision": "Low-light vision", bloodsense: "Bloodsense", tremorsense: "Tremorsense", scent: "Scent", lifesense: "Lifesense", echolocation: "Echolocation", wavesense: "Wavesense", thoughtsense: "Thoughtsense", "motion-sense": "Motion sense" };
export function senseText(sense) {
    // (One its user ends: "until deactivated (its next activation) or no longer invested".)
    const time = sense.duration?.mode === "fixed" ? (sense.duration.anchor === "source-turn" ? ` until the ${sense.duration.expiry === "turn-end" ? "end" : "start"} of the next turn` : ` for ${timeText(sense.duration)}`) : sense.toggle ? ` until deactivated (its next activation)${sense.invested ? " or no longer invested" : ""}` : "";
    // (Its acuity and range: "Imprecise tremorsense 30 feet for 1 minute".)
    const name = SENSE_WORDS[sense.selector] ?? sense.selector;
    // (What its user keeps doing for it: "as long as you continue to look through the scope".)
    return `${sense.acuity ? `${sense.acuity.charAt(0).toUpperCase()}${sense.acuity.slice(1)} ${name.toLowerCase()}` : name}${Number.isFinite(sense.range) ? ` ${sense.range} feet` : ""}${time}${sense.keeps ? `, ${sense.keeps}` : ""}`;
}

// Temporary Hit Points from the targeted creature's level in words: "Temporary Hit Points equal to twice the level of the creature
// targeted, for 1 minute".
const TIMES_WORDS = { 0.5: "half", 2: "twice", 3: "three times", 4: "four times" };
export function levelTempText(entry) {
    // (From an amount typed on the card: "Temporary Hit Points equal to half the damage dealt (typed on the card), at most 10, for 1 minute".)
    if (entry.from === "amount") return `${entry.heal ? "Hit Points regained" : "Temporary Hit Points"} equal to ${TIMES_WORDS[entry.multiplier] ? `${TIMES_WORDS[entry.multiplier]} ` : ""}${entry.of} (typed on the card)${entry.max ? `, at most ${entry.max}` : ""}${!entry.heal && entry.duration?.mode === "fixed" ? `, for ${timeText(entry.duration)}` : ""}`;
    if (entry.heal) return `Hit Points regained equal to ${TIMES_WORDS[entry.multiplier] ? `${TIMES_WORDS[entry.multiplier]} ` : ""}the level of the creature targeted`;
    return `Temporary Hit Points equal to ${TIMES_WORDS[entry.multiplier] ? `${TIMES_WORDS[entry.multiplier]} ` : ""}the level of the creature targeted${entry.duration?.mode === "fixed" ? `, for ${timeText(entry.duration)}` : ""}`;
}

// Fruit it grows in words: "1d4 Verdant Branch Fruit in its user's inventory, each eaten for 2d6+5 Hit Points".
export function createsText(creates) {
    const heal = String(creates.heal ?? "").replace(/^@Damage\[\(?([^\[\])]+)\)?\[healing\]\]$/, "$1");
    return `${creates.count} ${creates.name} in its user's inventory, each eaten for ${heal} Hit Points`;
}

// The fruit's item: a consumable eaten with an Interact action for its healing — the module's own heal card when it's eaten.
// (Its time, creates.lasts: flags.<module>.expiresAt, the world time it withers at — scripts/expiring.js removes it then.)
const SECONDS = { minutes: 60, hours: 3600, days: 86400 };
export function createdItemSource(creates, { count = 1, level = 0, img = null, worldTime = 0, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return {
        name: creates.name,
        type: "consumable",
        img: img ?? "icons/consumables/fruit/apple-red.webp",
        ...(creates.lasts ? { flags: { [moduleId]: { expiresAt: worldTime + creates.lasts.value * (SECONDS[creates.lasts.unit] ?? 60) } } } : {}),
        system: {
            category: "other",
            quantity: count,
            uses: { value: 1, max: 1, autoDestroy: true },
            level: { value: level },
            traits: { value: ["consumable", "healing", "magical"], rarity: "common" },
            description: { value: `<p><strong>Activate</strong> <span class="action-glyph">A</span> Interact</p><hr /><p>You eat the fruit and regain ${creates.heal} Hit Points.</p>${creates.lasts ? `<p>It withers away ${creates.lasts.value} ${creates.lasts.value === 1 ? creates.lasts.unit.replace(/s$/, "") : creates.lasts.unit} after it grew.</p>` : ""}` }
        }
    };
}

// A light its user sheds in words: "Bright light in 20 feet and dim light to 40 feet for 10 minutes".
export function lightText(light) {
    const reach = light.bright ? `Bright light in ${light.bright} feet${light.dim > light.bright ? ` and dim light to ${light.dim} feet` : ""}` : `Dim light in ${light.dim} feet`;
    return `${reach}${light.duration?.mode === "fixed" ? ` for ${timeText(light.duration)}` : ", until put out (its next activation)"}${light.note ? `; ${light.note}` : ""}`;
}

// Its light's Effect: PF2e's TokenLight rule on its user's token.
export function lightEffectSource(light, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return ownEffectSource({ name: "Light", img: "icons/svg/light.svg", words: lightText(light), rules: [{ key: "TokenLight", value: { bright: light.bright, dim: light.dim } }], duration: light.duration, flag: { light: true, from: item.name ?? null }, item, user, worldTime, initiative, moduleId });
}

// Its vision's Effect: PF2e's Sense rule.
export function senseEffectSource(sense, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    // (Its item's own: the item that ends it — by its next activation, or by not being invested.)
    const itemId = String(item.uuid ?? "").split(".Item.")[1]?.split(".")[0] ?? null;
    return ownEffectSource({ name: SENSE_WORDS[sense.selector] ?? sense.selector, img: "icons/svg/eye.svg", words: senseText(sense), rules: [{ key: "Sense", selector: sense.selector, ...(sense.acuity ? { acuity: sense.acuity } : {}), ...(Number.isFinite(sense.range) ? { range: sense.range } : {}) }], duration: sense.duration, flag: { sense: sense.selector, from: item.name ?? null, ...(sense.invested && itemId ? { untilUninvested: itemId } : {}) }, item, user, worldTime, initiative, moduleId });
}

// A change to its user's weapons in words: "+20 feet to its ranged weapons' range increment until the start of the next turn", "Its
// melee weapons gain thrown 20 feet until the end of the turn".
export function weaponText(adjust) {
    const which = adjust.definition?.includes("item:ranged") ? "ranged" : adjust.definition?.includes("item:melee") ? "melee" : "";
    if (adjust.property === "range-increment") return `+${adjust.value} feet to its ${which ? `${which} ` : ""}weapons' range increment${forTime(adjust.duration)}`;
    const thrown = /^thrown-(\d+)$/.exec(adjust.value);
    // (The item's own weapon losing a trait: "The weapon loses nonlethal for 1 round".)
    if (adjust.mode === "remove") return `${adjust.own ? "The weapon loses" : `Its ${which ? `${which} ` : ""}weapons lose`} ${adjust.value}${forTime(adjust.duration)}`;
    if (adjust.own) return `The weapon gains ${adjust.value}${forTime(adjust.duration)}`;
    return `Its ${which ? `${which} ` : ""}weapons gain ${thrown ? `thrown ${thrown[1]} feet` : adjust.value}${forTime(adjust.duration)}`;
}

// That change's Effect: PF2e's AdjustStrike on those weapons.
// (The item's own weapon, by its id on the actor: "Actor.abc.Item.def" → "def".)
const ownId = (uuid) => /\.Item\.([A-Za-z0-9]+)$/.exec(String(uuid ?? ""))?.[1] ?? null;
export function weaponEffectSource(adjust, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const definition = adjust.own && ownId(item.uuid) ? [`item:id:${ownId(item.uuid)}`] : adjust.definition ?? [];
    const rule = { key: "AdjustStrike", mode: adjust.mode ?? "add", property: adjust.property, value: adjust.value, definition };
    return ownEffectSource({ name: "weapon", img: "icons/svg/sword.svg", words: weaponText(adjust), rules: [rule], duration: adjust.duration, flag: { weapon: adjust.property }, item, user, worldTime, initiative, moduleId });
}

// An unarmed attack it grants in words: "A claw unarmed attack (1d6 slashing; agile) until the end of the turn".
export function attackText(attack) {
    const traits = attack.traits.filter((trait) => trait !== "unarmed");
    // (Copying its user's best unarmed attack, Tooth and Claw Tattoo's: "A claw unarmed attack (your best unarmed attack's damage, slashing)".)
    if (attack.copyBest) return `A ${attack.name} unarmed attack (your best unarmed attack's damage and traits, ${attack.type})${forTime(attack.duration)}`;
    return `A ${attack.name} unarmed attack (${attack.dice}${attack.die} ${attack.type}${traits.length ? `; ${traits.join(", ")}` : ""})${forTime(attack.duration)}`;
}

// Its user's best unarmed attack: { die, traits } — the largest die among its unarmed Strikes (PF2e's fist, 1d4, without one).
export function bestUnarmed(actor) {
    const SIZES = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12 };
    const unarmed = (actor?.system?.actions ?? []).map((action) => action.item).filter((weapon) => weapon?.system?.category === "unarmed" || weapon?.category === "unarmed");
    const best = unarmed.sort((a, b) => (SIZES[b.system?.damage?.die] ?? 0) - (SIZES[a.system?.damage?.die] ?? 0))[0];
    return best ? { die: best.system?.damage?.die ?? "d4", traits: [...(best.system?.traits?.value ?? [])].filter((trait) => !["unarmed"].includes(trait)) } : { die: "d4", traits: ["agile", "finesse", "nonlethal"] };
}

// Its Effect: PF2e's Strike rule, as its own Effects grant one (Bestial Mutagen's claw).
export function attackEffectSource(given, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution", actor = null } = {}) {
    // (Its die and traits its user's best unarmed attack's, when it copies one.)
    const best = given.copyBest ? bestUnarmed(actor) : null;
    const attack = best ? { ...given, dice: 1, die: best.die, traits: [...new Set(["unarmed", ...best.traits])] } : given;
    const rule = { key: "Strike", category: "unarmed", group: "brawling", ...(["claw", "jaws", "fist", "horn", "tail", "foot", "fangs", "tusk"].includes(attack.name) ? { baseType: attack.name } : {}), damage: { base: { damageType: attack.type, dice: attack.dice, die: attack.die } }, label: `${attack.name.charAt(0).toUpperCase()}${attack.name.slice(1)}`, range: null, slug: `${attack.name}-${String(item.name ?? "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`, traits: attack.traits };
    return ownEffectSource({ name: `${attack.name} attack`, img: "icons/svg/sword.svg", words: attackText(given), rules: [rule], duration: attack.duration, flag: { attack: attack.name }, item, user, worldTime, initiative, moduleId });
}

// Fast healing in words: "Fast healing 25 for 6 rounds".
export const fastHealingText = (healing) => `Fast healing ${healing.value}${forTime(healing.duration)}`;

// Its Effect: PF2e's FastHealing rule, which heals at the start of each of its turns.
export function fastHealingEffectSource(healing, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return ownEffectSource({ name: "fast healing", img: "icons/svg/regen.svg", words: fastHealingText(healing), rules: [{ key: "FastHealing", value: healing.value }], duration: healing.duration, flag: { fastHealing: healing.value }, item, user, worldTime, initiative, moduleId });
}

// A shield's other form in words: "The shield becomes a tower shield (+2 AC, a –5-foot Speed penalty) until it's activated again".
export const shieldFormText = (form) => `The shield becomes a ${form.name} (+${form.acBonus} AC, a ${form.speedPenalty}-foot Speed penalty${form.harder ? `, its Hardness and Bulk ${form.harder} higher` : ""}${form.takeCover ? "; it can Take Cover as a tower shield does: PF2e's Take Cover, greater cover with it raised" : ""}) until it's activated again`;

// Its Effect: PF2e's ItemAlteration on that shield, by its id on its user.
export function shieldFormEffectSource(form, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const shieldId = /\.Item\.([A-Za-z0-9]+)$/.exec(String(item.uuid ?? ""))?.[1] ?? null;
    // (Its Hardness and Bulk higher in this form, Sapling Shield's 2: PF2e's ItemAlteration on them too.)
    const rules = [{ key: "ItemAlteration", itemId: shieldId, mode: "override", property: "ac-bonus", value: form.acBonus }, { key: "ItemAlteration", itemId: shieldId, mode: "override", property: "speed-penalty", value: form.speedPenalty }, ...(form.harder ? [{ key: "ItemAlteration", itemId: shieldId, mode: "add", property: "hardness", value: form.harder }, { key: "ItemAlteration", itemId: shieldId, mode: "add", property: "bulk", value: form.harder }] : [])];
    return ownEffectSource({ name: form.name, img: "icons/svg/shield.svg", words: shieldFormText(form), rules, duration: null, flag: { shieldForm: shieldId }, item, user, worldTime, initiative, moduleId });
}

// A picked skill's bonus in words: "+1 item to the skill picked (intimidation, deception or performance), and a critical failure
// on it or diplomacy becomes a failure, for 1 minute".
export function skillPickText(pick) {
    // (Any skill, Stone of Unrivaled Skill's contract skill: "any skill".)
    const list = pick.any ? "any skill" : `${pick.skills.slice(0, -1).join(", ")} or ${pick.skills.at(-1)}`;
    return `${pick.modifier.value > 0 ? "+" : "−"}${Math.abs(pick.modifier.value)} ${pick.modifier.type} to the skill picked (${list})${pick.degree ? `, and a critical failure on it or ${pick.degree.selectors.join(" or ")} becomes a failure` : ""}${forTime(pick.duration)}`;
}

// That skill's Effect: the bonus on it and the better degree (src/compiler/skill-pick.js skillPickRules).
export function skillPickEffectSource(pick, index, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const skill = pick.skills[index] ?? pick.skills[0];
    return ownEffectSource({ name: skill.charAt(0).toUpperCase() + skill.slice(1), img: "icons/svg/upgrade.svg", words: skillPickText({ ...pick, skills: [skill, skill] }).replace(/the skill picked \([^)]*\)/, skill), rules: skillPickRules(pick, index, item.name ?? null), duration: pick.duration, flag: { skillPick: skill }, item, user, worldTime, initiative, moduleId });
}

// A condition's penalty ignored, in words: "Ignores Fatigued's penalty to AC and saving throws for 1 hour".
const SELECTOR_WORDS = { ac: "AC", "saving-throw": "saving throws" };
export function suppressText(entry) {
    const to = entry.selectors.map((selector) => SELECTOR_WORDS[selector] ?? selector).join(" and ");
    return `Ignores ${entry.slug.charAt(0).toUpperCase()}${entry.slug.slice(1)}'s penalty to ${to}${forTime(entry.duration)} (the condition stays)`;
}

// Its Effect: PF2e's AdjustModifier suppressing that condition's own modifier.
export function suppressEffectSource(entry, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const rule = { key: "AdjustModifier", selectors: entry.selectors, slug: entry.slug, suppress: true };
    return ownEffectSource({ name: `${entry.slug} ignored`, img: "icons/svg/upgrade.svg", words: suppressText(entry), rules: [rule], duration: entry.duration, flag: { suppress: entry.slug }, item, user, worldTime, initiative, moduleId });
}

// A time's first critical failure made a failure, in words: "The first critical failure on Thievery checks to Pick a Lock becomes a
// failure, within 1 minute".
export function firstDegreeText(first) {
    const actions = [].concat(first.predicate ?? []).filter((term) => typeof term === "string" && term.startsWith("action:")).map((term) => term.slice(7).split("-").map((word, at) => (at === 0 || !["a", "an", "the", "of"].includes(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(" "));
    const skill = first.selector.charAt(0).toUpperCase() + first.selector.slice(1);
    const time = first.duration?.mode === "fixed" ? `, within ${timeText(first.duration)}` : "";
    return `The first critical failure on ${skill} checks${actions.length ? ` to ${actions.join(" or ")}` : ""} becomes a failure${time}`;
}

// Its Effect: PF2e's AdjustDegreeOfSuccess, which the first roll it changes removes (scripts/first-degree.js).
export function firstDegreeEffectSource(first, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return ownEffectSource({ name: "first critical failure", img: "icons/svg/upgrade.svg", words: firstDegreeText(first), rules: firstDegreeRules(first, item.name ?? null), duration: first.duration, flag: { firstDegree: { selector: first.selector, adjustment: first.adjustment } }, item, user, worldTime, initiative, moduleId });
}

// Extra damage on its user's Strikes in words: "+1d4 precision damage on melee Strikes against off-guard creatures for 10 minutes".
export function strikeDamageText(extra) {
    const amount = extra.diceNumber ? `${extra.diceNumber}${extra.dieSize}` : String(extra.value);
    const kind = [extra.category, extra.damageType].filter(Boolean).join(" ");
    const range = (extra.predicate ?? []).find((option) => /^item:(?:melee|ranged|category:unarmed)$/.test(option))?.replace(/^item:(?:category:)?/, "");
    const against = (extra.predicate ?? []).find((option) => option.startsWith("target:condition:"))?.replace("target:condition:", "");
    const marked = (extra.predicate ?? []).some((option) => option.startsWith("target:mark:"));
    return `+${amount}${kind ? ` ${kind}` : ""} damage on ${extra.own ? "the weapon's " : range ? `${range} ` : ""}Strikes${against ? ` against ${against} creatures` : ""}${marked ? " against the marked creature" : ""}${forTime(extra.duration)}`;
}

// The creature its bonuses are against, src/compiler/marked.js: "Marks the creature targeted (its bonuses against it alone) for 7 days".
export function markText(mark, name = null) {
    return `Marks ${name ?? "the creature targeted"} (its bonuses against that creature alone)${forTime(mark.duration)}`;
}

// The mark's Effect on its user: PF2e's TokenMark at that creature's token, which its bonuses' target:mark predicates read.
export function markEffectSource(mark, { token, name = null, item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return ownEffectSource({ name: `${name ?? "creature"} marked`, img: "icons/svg/target.svg", words: markText(mark, name), rules: [{ key: "TokenMark", slug: mark.slug, uuid: token }], duration: mark.duration, flag: { mark: mark.slug }, item, user, worldTime, initiative, moduleId });
}

// Its Effect: PF2e's DamageDice on Strike damage (a FlatModifier for a number), with its predicate.
export function strikeDamageEffectSource(extra, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const common = { selector: extra.own && ownId(item.uuid) ? `${ownId(item.uuid)}-damage` : "strike-damage", ...(extra.category ? { [extra.diceNumber ? "category" : "damageCategory"]: extra.category } : {}), ...(extra.damageType ? { damageType: extra.damageType } : {}), ...(extra.predicate?.length ? { predicate: extra.predicate } : {}), label: item.name ?? "Item" };
    const rule = extra.diceNumber ? { key: "DamageDice", ...common, diceNumber: extra.diceNumber, dieSize: extra.dieSize } : { key: "FlatModifier", ...common, value: extra.value };
    return ownEffectSource({ name: "Strike damage", img: "icons/svg/sword.svg", words: strikeDamageText(extra), rules: [rule], duration: extra.duration, flag: { strikeDamage: true }, item, user, worldTime, initiative, moduleId });
}

// The card's HTML. canApply: whether this user may press Apply (the item's owner or the GM).
export function cardHTML(state, { canApply = false } = {}) {
    const open = state.status === "open";
    const recipient = recipientOf(state);
    const drinker = state.drinker === null || state.drinker === undefined ? ""
        : open && state.drinkers.length > 1 && canApply
            ? `<p class="aar-actions">Drinker: <select data-air-field="drinker">${state.drinkers.map((entry, index) => `<option value="${index}"${index === state.drinker ? " selected" : ""}>${escape(entry.name)}${index === 0 ? " (self)" : ""}</option>`).join("")}</select></p>`
            : `<p class="aar-actions">Drinker: ${escape(recipient.name)}</p>`;
    const preview = open ? previewLines(state) : [];
    // (A tea's Tea Ceremony: a tick, or what was chosen.)
    const ceremonyInfo = state.plan?.item?.ceremony;
    const changes = ceremonyInfo ? [ceremonyInfo.duration ? `lasts ${timeText(ceremonyInfo.duration)}` : null, ...(ceremonyInfo.removes ?? []).map((slug) => `removes ${slug}`)].filter(Boolean) : [];
    const ceremonyWords = `Tea Ceremony (10 minutes)${changes.length ? `: ${changes.join(", ")}` : ""}`;
    const ceremony = state.ceremony === null || state.ceremony === undefined ? ""
        : open && canApply ? `<p class="aar-actions"><label><input type="checkbox" data-air-field="ceremony"${state.ceremony ? " checked" : ""}> ${escape(ceremonyWords)}</label></p>`
            : state.ceremony ? `<p class="aar-actions">${escape(ceremonyWords)}</p>` : "";
    // (Its resistance's type, when the item makes its user choose: a picker.)
    const choose = (state.plan?.item?.resist ?? []).find((entry) => entry.choose?.length)?.choose ?? null;
    const resistPick = !choose ? ""
        : open && canApply ? `<p class="aar-actions">Resistance to: <select data-air-field="resistType">${choose.map((type, index) => `<option value="${index}"${index === (state.resistType ?? 0) ? " selected" : ""}>${escape(type)}</option>`).join("")}</select></p>`
            : Number.isInteger(state.resistType) ? `<p class="aar-actions">Resistance to: ${escape(choose[state.resistType] ?? choose[0])}</p>` : "";
    // (Its flat check's type, when it's the item's own: a picker — Soothing Powder's.)
    const recoveryTypes = state.plan?.item?.recovery?.choose ? state.plan.item.recovery.types : null;
    const recoveryPick = !recoveryTypes ? ""
        : open && canApply ? `<p class="aar-actions">Persistent damage it ends: <select data-air-field="recoveryType">${recoveryTypes.map((type, index) => `<option value="${index}"${index === (state.recoveryType ?? 0) ? " selected" : ""}>${escape(type)}</option>`).join("")}</select></p>`
            : Number.isInteger(state.recoveryType) ? `<p class="aar-actions">Persistent damage it ends: ${escape(recoveryTypes[state.recoveryType] ?? recoveryTypes[0])}</p>` : "";
    // (One of several conditions it lowers: a picker. Another's: target the creatures first.)
    const pickFrom = (state.plan?.item?.reduce ?? []).find((entry) => entry.choose?.length)?.choose ?? null;
    const reducePick = !pickFrom ? ""
        : open && canApply ? `<p class="aar-actions">Lower: <select data-air-field="reduceChoice">${pickFrom.map((slug, index) => `<option value="${index}"${index === (state.reduceChoice ?? 0) ? " selected" : ""}>${escape(slug)}</option>`).join("")}</select></p>`
            : Number.isInteger(state.reduceChoice) ? `<p class="aar-actions">Lower: ${escape(pickFrom[state.reduceChoice] ?? pickFrom[0])}</p>` : "";
    const forAllies = state.plan?.item?.recipient === "targets" || (state.plan?.item?.reduce ?? []).some((entry) => entry.who === "targets");
    // (A rune it lends a weapon: its user's weapon, picked.)
    const runePick = !state.weapons ? ""
        : !state.weapons.length ? (open ? `<p class="aar-hint">${escape(state.user.name)} has no weapon for it.</p>` : "")
            : open && canApply ? `<p class="aar-actions">Weapon: <select data-air-field="runeWeapon">${state.weapons.map((weapon, index) => `<option value="${index}"${index === (state.runeWeapon ?? 0) ? " selected" : ""}>${escape(weapon.name)}</option>`).join("")}</select></p>`
                : Number.isInteger(state.runeWeapon) ? `<p class="aar-actions">Weapon: ${escape(state.weapons[state.runeWeapon]?.name ?? "")}</p>` : "";
    // (The alchemical item installed in it: one of its user's, picked.)
    const installedPick = !state.installed ? ""
        : !state.installed.length ? (open ? `<p class="aar-hint">${escape(state.user.name)} has no ${escape(state.plan.item.installed.name)} to install.</p>` : "")
            : open && canApply ? `<p class="aar-actions">Installed: <select data-air-field="installedPick">${state.installed.map((entry, index) => `<option value="${index}"${index === (state.installedPick ?? 0) ? " selected" : ""}>${escape(entry.name)}</option>`).join("")}</select></p>`
                : Number.isInteger(state.installedPick) ? `<p class="aar-actions">Installed: ${escape(state.installed[state.installedPick]?.name ?? "")}</p>` : "";
    // (A potion it holds: one of its user's, picked.)
    const potionPick = !state.potions ? ""
        : !state.potions.length ? (open ? `<p class="aar-hint">${escape(state.user.name)} has no potion it can hold.</p>` : "")
            : open && canApply ? `<p class="aar-actions">Potion: <select data-air-field="potionPick">${state.potions.map((entry, index) => `<option value="${index}"${index === (state.potionPick ?? 0) ? " selected" : ""}>${escape(entry.name)}</option>`).join("")}</select></p>`
                : Number.isInteger(state.potionPick) ? `<p class="aar-actions">Potion: ${escape(state.potions[state.potionPick]?.name ?? "")}</p>` : "";
    // (A skill its user picked when the item was made, Words of Wisdom's phrase: a picker.)
    const skillPick = state.plan?.item?.skillPick ?? null;
    const skillPicker = !skillPick ? ""
        : open && canApply ? `<p class="aar-actions">Its skill: <select data-air-field="skillPick">${skillPick.skills.map((skill, index) => `<option value="${index}"${index === (state.skillPick ?? 0) ? " selected" : ""}>${escape(skill.charAt(0).toUpperCase() + skill.slice(1))}</option>`).join("")}</select></p>`
            : `<p class="aar-actions">Its skill: ${escape(skillPick.skills[state.skillPick ?? 0] ?? "")}</p>`;
    // (One of several runes: the one picked.)
    const runeChoices = state.plan?.item?.rune?.choices ?? null;
    const runeChoicePick = !runeChoices?.length ? ""
        : open && canApply ? `<p class="aar-actions">Rune: <select data-air-field="runeChoice">${runeChoices.map((choice, index) => `<option value="${index}"${index === (state.runeChoice ?? 0) ? " selected" : ""}>${escape(choice.name)}</option>`).join("")}</select></p>`
            : `<p class="aar-actions">Rune: ${escape(runeChoices[state.runeChoice ?? 0]?.name ?? "")}</p>`;
    // (Temporary Hit Points or healing from an amount its trigger gave — Bloodknuckles' bleed damage: typed on the card.)
    const amountOf = (state.plan?.item?.levelTemp ?? []).find((entry) => entry.from === "amount")?.of ?? null;
    const amountField = !amountOf ? ""
        : open && canApply ? `<p class="aar-actions">Amount (${escape(amountOf)}): <input type="number" min="0" data-air-field="amount" value="${escape(state.amount ?? "")}" style="width:4em"></p>`
            : Number.isFinite(state.amount) ? `<p class="aar-actions">Amount (${escape(amountOf)}): ${escape(state.amount)}</p>` : "";
    // ("Creatures of your choice", none needed: Cayden's Tankard ends its user's own either way.)
    const optional = (state.plan?.item?.reduce ?? []).filter((entry) => entry.who === "targets").every((entry) => entry.optional) && state.plan?.item?.recipient !== "targets";
    const targetHint = open && canApply && forAllies ? `<p class="aar-hint">${optional ? "Target the other creatures it helps, if any" : "Target the creatures it helps (your own token too, when it helps you)"}, then press Apply.</p>` : "";
    const previewList = preview.length ? `<ul class="aar-notes">${preview.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Apply</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to apply it.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header>${drinker}${ceremony}${resistPick}${recoveryPick}${reducePick}${amountField}${runePick}${runeChoicePick}${installedPick}${potionPick}${skillPicker}${previewList}${targetHint}${results}${controls}</section>`;
}

// The alchemical item installed in it, in words: "From the elixir of life installed, its item bonus to athletics (grapple), fortitude-dc
// (grapple, disarm, shove) and reflex-dc (trip), for 3 rounds; the item used up".
const scopeOf = (modifier) => (modifier.predicate ?? []).flatMap((term) => (typeof term === "string" ? [term] : term.or ?? [])).map((term) => String(term).replace(/^action:/, "").replace(/-/g, " "));
export function installedText(installed, entry = null) {
    const bonus = entry ? `+${entry.bonus} item bonus` : "its item bonus";
    const parts = [
        installed.modifiers.length ? `${bonus} to ${installed.modifiers.map((modifier) => `${modifier.selector}${scopeOf(modifier).length ? ` (${scopeOf(modifier).join(", ")})` : ""}`).join(", ")}` : null,
        installed.resistance ? `resistance ${entry ? entry.splash : "equal to its splash damage"} to ${installed.resistance.types.join(", ")}` : null,
        installed.fastHealing ? `${entry ? entry.level : "its level in"} Hit Points at the start of each turn` : null,
        installed.damage ? `${entry ? entry.splash : "its splash damage as"} ${installed.damage.type} damage to each other creature within ${installed.damage.radius} feet` : null,
        installed.strength ? `the armor's Strength requirement ${entry ? `${entry.bonus >= installed.strength.at ? installed.strength.more : installed.strength.by} lower` : `${installed.strength.by} lower (${installed.strength.more} with a +${installed.strength.at} item)`}` : null
    ].filter(Boolean);
    const time = installed.duration?.from === "level" ? (entry ? ` for ${entry.level} rounds` : " for its level in rounds") : installed.duration?.mode === "fixed" ? ` for ${timeText(installed.duration)}` : "";
    const what = entry?.name ?? `the ${installed.name}${installed.count > 1 ? "s" : ""}`;
    return `From ${what} installed: ${parts.join("; ")}${time}; ${installed.count > 1 ? `${installed.count} of them` : "the item"} used up`;
}

// Its Effect: PF2e's FlatModifier (item) for each bonus, Resistance, FastHealing — the installed item's numbers.
const itemIdOf = (uuid) => String(uuid ?? "").split(".Item.")[1]?.split(".")[0] ?? null;
export function installedEffectSource(installed, entry, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const label = item.name ?? "Installed";
    const rules = [
        ...(entry.bonus > 0 ? installed.modifiers.map((modifier) => ({ key: "FlatModifier", selector: modifier.selector, type: "item", value: entry.bonus, label, ...(modifier.predicate ? { predicate: modifier.predicate } : {}) })) : []),
        ...(installed.resistance && entry.splash > 0 ? installed.resistance.types.map((type) => ({ key: "Resistance", type, value: entry.splash })) : []),
        ...(installed.fastHealing && entry.level > 0 ? [{ key: "FastHealing", value: entry.level }] : []),
        // (The armor's own Strength requirement lowered: PF2e's ItemAlteration on that armor, by its id.)
        ...(installed.strength && itemIdOf(item.uuid) ? [{ key: "ItemAlteration", itemId: itemIdOf(item.uuid), mode: "subtract", property: "strength", value: entry.bonus >= installed.strength.at ? installed.strength.more : installed.strength.by }] : [])
    ];
    const duration = installed.duration?.from === "level" ? { mode: "fixed", value: entry.level, unit: installed.duration.unit, expiry: "turn-start" } : installed.duration;
    // (Its time shortened by each hit of its types, Bone Dreadnought Plate's: the flag scripts/shorten-on-hit.js looks for.)
    return ownEffectSource({ name: "installed", img: "icons/svg/upgrade.svg", words: installedText(installed, entry), rules, duration, flag: { installed: installed.name, ...(installed.shortensOnHit ? { shortensOnHit: installed.shortensOnHit } : {}) }, item, user, worldTime, initiative, moduleId });
}

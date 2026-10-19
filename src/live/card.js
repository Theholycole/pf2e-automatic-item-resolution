// The item card's state and HTML, and the item-specific parts of applying it
// (which creature drinks, what PF2e rolled, an Effect's grade). Pure: no
// Foundry, so it is tested in Node. The card wears the ability module's
// classes (pf2e-aar-card, aar-*), so both modules' cards look alike.

import { skillPickRules } from "../compiler/skill-pick.js";
import { firstDegreeRules } from "../compiler/first-degree.js";
import { restoreText } from "../compiler/restore.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// The id the core's context gives the user (as the ability module's cards: "source") and the drinker.
export const USER_ID = "source";
export const DRINKER_ID = "drinker";

// A new card: the plan, the item ({ name, uuid, sourceId, slug, img }), its user
// ({ actorUuid, tokenUuid, name }), the creatures it can be fed to (the user first),
// and PF2e's own roll for it ({ total, formula, kind, messageId } or null).
// weapons: its user's, [{ id, name }], for a rune it lends a weapon (plan.item.rune), picked on the card.
export function createItemCard({ plan, item, user, drinkers = [], rolled = null, weapons = [] }) {
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
        ...(plan?.item?.rune && !plan.item.rune.own ? { weapons, runeWeapon: 0 } : {}),
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
export function reductionText({ slug, choose, by, who, optional }) {
    const what = choose ? `one of ${orList(choose)}` : slug;
    const done = by === "all" ? `Ends ${what}` : `Lowers ${what} by ${by}`;
    return `${done}${choose ? " (picked below)" : ""}${who === "targets" ? ` on each creature you target${optional ? " (if any)" : ""}` : ""}`;
}

// What Apply will do, as lines for the card.
export function previewLines(state) {
    const plan = state.plan;
    const lines = [];
    // (The conditions it lowers, src/compiler/reduce.js.)
    for (const entry of plan?.item?.reduce ?? []) lines.push(reductionText(entry));
    // (A rune it lends a weapon, src/compiler/rune-loans.js.)
    if (plan?.item?.rune) lines.push(runeText(plan.item.rune));
    // (A condition until the end of the user's rage, src/compiler/rage-time.js.)
    if (plan?.item?.untilRage) lines.push(`${untilRageText(plan.item.untilRage)}, while raging`);
    // (Its resistance, src/compiler/rows.js: the card's own Effect.)
    if (plan?.item?.resist?.length) lines.push(resistanceText(plan.item.resist));
    // (A Speed of a new kind, src/compiler/rows.js: the card's own Effect.)
    for (const speed of plan?.item?.speeds ?? []) lines.push(speedText(speed));
    for (const sense of plan?.item?.senses ?? []) lines.push(senseText(sense));
    for (const light of plan?.item?.light ?? []) lines.push(lightText(light));
    for (const entry of plan?.item?.levelTemp ?? []) lines.push(levelTempText(entry));
    for (const adjust of plan?.item?.weapon ?? []) lines.push(weaponText(adjust));
    for (const attack of plan?.item?.attacks ?? []) lines.push(attackText(attack));
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
    for (const modifier of row.modifiers ?? []) lines.push(`${modifier.value > 0 ? "+" : "−"}${Math.abs(modifier.value)} ${modifier.type} to ${modifier.selector}${forTime(modifier.duration)}`);
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
        const choice = rule.choices.find((entry) => (item.sourceId && entry?.value === item.sourceId) || (slug && JSON.stringify(entry?.predicate ?? []).includes(`parent:origin:item:slug:${slug}"`)));
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
    const byValue = new Map();
    // (A type to choose: "acid, cold or fire (one, chosen)".)
    // (Damage from some creatures: its own words, "spirit and void damage from unholy creatures".)
    for (const entry of resist) byValue.set(entry.value, [...(byValue.get(entry.value) ?? []), entry.type === "custom" ? entry.label.charAt(0).toLowerCase() + entry.label.slice(1) : entry.type ? typeWords(entry.type) : `${entry.choose.slice(0, -1).join(", ")} or ${entry.choose.at(-1)} (one, chosen)`]);
    const duration = resist.find((entry) => entry.duration?.mode === "fixed")?.duration;
    return `${[...byValue].map(([value, types]) => `Resistance ${value} to ${types.join(" and ")}`).join(", ")}${duration ? ` for ${timeText(duration)}` : ""}`;
}

// A Speed in words: "A fly Speed equal to your land Speed until the end of the next turn", "A swim Speed of 30 feet".
const LAND_WORDS = [[/^@actor\.system\.movement\.speeds\.land\.value$/, "equal to your land Speed"], [/^floor\(@actor\.system\.movement\.speeds\.land\.value\*0\.5\)$/, "equal to half your land Speed"], [/^max\((\d+),@actor\.system\.movement\.speeds\.land\.value\)$/, "of $1 feet or your land Speed, whichever is greater"], [/^min\((\d+),@actor\.system\.movement\.speeds\.land\.value\)$/, "of $1 feet or your land Speed, whichever is lower"]];
export function speedText(speed) {
    const formula = String(speed.value);
    const said = typeof speed.value === "number" ? `of ${speed.value} feet` : LAND_WORDS.reduce((words, [pattern, text]) => words ?? (pattern.test(formula) ? formula.replace(pattern, text) : null), null) ?? `of ${formula}`;
    const time = speed.duration?.mode === "fixed" ? (speed.duration.expiry === "turn-end" && speed.duration.anchor === "source-turn" ? " until the end of the next turn" : ` for ${timeText(speed.duration)}`) : "";
    return `A ${speed.type} Speed ${said}${time}`;
}

// Its Speed's Effect: PF2e's BaseSpeed rule ("until the end of the next turn": PF2e's one round, ending at a turn's end).
export function speedEffectSource(speed, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return ownEffectSource({ name: `${speed.type} Speed`, img: "icons/svg/wing.svg", words: speedText(speed), rules: [{ key: "BaseSpeed", selector: speed.type, value: speed.value }], duration: speed.duration, flag: { speed: speed.type }, item, user, worldTime, initiative, moduleId });
}

// Its flat check to end persistent damage in words: "A flat check (DC 10) to end persistent acid, fire, poison or void damage".
export function recoveryText(recovery) {
    if (recovery.choose) return `A flat check${recovery.dc ? ` (DC ${recovery.dc})` : ""} to end persistent damage of its type (picked below)`;
    const types = recovery.types.length > 1 ? `${recovery.types.slice(0, -1).join(", ")} or ${recovery.types.at(-1)}` : recovery.types[0];
    return `A flat check${recovery.dc ? ` (DC ${recovery.dc})` : ""} to end persistent ${types} damage${recovery.who === "targets" ? ", for the creature touched (targeted)" : ""}`;
}

// One of the card's own Effects (its resistance, Speed or vision): PF2e's rules for the item's time (unlimited with none),
// named for the item, flagged as the module's. Returns a new source.
function ownEffectSource({ name, img, words, rules, duration, flag, item, user, worldTime, initiative, moduleId }) {
    return {
        name: `${item.name}: ${name}`,
        type: "effect",
        img: item.img ?? img,
        flags: { [moduleId]: flag },
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
    const name = rune.choices?.length && !rune.picked ? `${rune.choices.slice(0, -1).map((choice) => choice.name).join(", ")} or ${rune.choices.at(-1).name} rune (picked)` : `${rune.name} rune`;
    return `Gives ${weaponName ?? (rune.own ? "its weapon" : "the weapon picked")} the ${name}${time}`;
}

// The rune's Effect on its user: PF2e's AdjustStrike adding the property rune to that weapon (as PF2e's own Wounding Oil).
// key: PF2e's rune key, kebab-case ("disrupting", "greater-disrupting").
export function runeEffectSource(rune, { key = rune.key, weapon, item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return ownEffectSource({ name: `${rune.name} (${weapon.name})`, img: "icons/svg/sword.svg", words: runeText(rune, weapon.name), rules: [{ key: "AdjustStrike", mode: "add", property: "property-runes", value: key, definition: [`item:id:${weapon.id}`] }], duration: rune.duration, flag: { rune: key, weaponId: weapon.id }, item, user, worldTime, initiative, moduleId });
}

// Conditions until the end of the rage, in words: "Quickened until the end of the rage".
const conditionWords = (conditions) => conditions.map((entry) => `${entry.slug.charAt(0).toUpperCase()}${entry.slug.slice(1)}${entry.value ? ` ${entry.value}` : ""}`).join(" and ");
export const untilRageText = (untilRage) => `${conditionWords(untilRage.conditions)} until the end of the rage`;

// Their Effect: PF2e's GrantItem for each condition (uuids: the conditions' own, by slug), lasting at most a minute (a Rage's),
// flagged untilRage so the Rage's end removes it (scripts/live.js).
export function untilRageEffectSource(untilRage, uuids, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const rules = untilRage.conditions.map((entry, index) => ({ key: "GrantItem", uuid: uuids[index], ...(entry.value ? { alterations: [{ mode: "override", property: "badge-value", value: entry.value }] } : {}) })).filter((rule) => rule.uuid);
    return ownEffectSource({ name: untilRageText(untilRage), img: "icons/svg/aura.svg", words: untilRageText(untilRage), rules, duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start" }, flag: { untilRage: true }, item, user, worldTime, initiative, moduleId });
}

// Its resistances with a chosen type filled in (index into the entry's choose list, the first by default).
export const chosenResistances = (resist, index = 0) => resist.map((entry) => (entry.choose?.length ? { ...entry, type: entry.choose[Number.isInteger(index) && entry.choose[index] ? index : 0], choose: undefined } : entry));

// Its resistance's Effect: PF2e's Resistance rules. moduleId: the flag's scope.
// One resistance as PF2e's rule; damage from some creatures as its custom type, the damage's types and its source's traits.
const resistanceRule = ({ type, value, from = [], damage = [], label }) => (type === "custom" ? { key: "Resistance", type: "custom", definition: [...(damage.length ? [{ or: damage.map((kind) => `damage:type:${kind}`) }] : []), { or: from.map((trait) => `origin:trait:${trait}`) }], label, value } : { key: "Resistance", type, value });
export function resistanceEffectSource(resist, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const duration = resist.find((entry) => entry.duration?.mode === "fixed")?.duration ?? null;
    return ownEffectSource({ name: "resistance", img: "icons/svg/shield.svg", words: resistanceText(resist), rules: resist.map(resistanceRule), duration, flag: { resist: true }, item, user, worldTime, initiative, moduleId });
}

// A vision in words: "Darkvision until the start of the next turn", "Greater darkvision".
const SENSE_WORDS = { darkvision: "Darkvision", "greater-darkvision": "Greater darkvision", "low-light-vision": "Low-light vision", bloodsense: "Bloodsense", tremorsense: "Tremorsense", scent: "Scent", lifesense: "Lifesense", echolocation: "Echolocation", wavesense: "Wavesense", thoughtsense: "Thoughtsense", "motion-sense": "Motion sense" };
export function senseText(sense) {
    const time = sense.duration?.mode === "fixed" ? (sense.duration.anchor === "source-turn" ? ` until the ${sense.duration.expiry === "turn-end" ? "end" : "start"} of the next turn` : ` for ${timeText(sense.duration)}`) : "";
    // (Its acuity and range: "Imprecise tremorsense 30 feet for 1 minute".)
    const name = SENSE_WORDS[sense.selector] ?? sense.selector;
    return `${sense.acuity ? `${sense.acuity.charAt(0).toUpperCase()}${sense.acuity.slice(1)} ${name.toLowerCase()}` : name}${Number.isFinite(sense.range) ? ` ${sense.range} feet` : ""}${time}`;
}

// Temporary Hit Points from the targeted creature's level in words: "Temporary Hit Points equal to twice the level of the creature
// targeted, for 1 minute".
const TIMES_WORDS = { 0.5: "half", 2: "twice", 3: "three times", 4: "four times" };
export function levelTempText(entry) {
    if (entry.heal) return `Hit Points regained equal to ${TIMES_WORDS[entry.multiplier] ? `${TIMES_WORDS[entry.multiplier]} ` : ""}the level of the creature targeted`;
    return `Temporary Hit Points equal to ${TIMES_WORDS[entry.multiplier] ? `${TIMES_WORDS[entry.multiplier]} ` : ""}the level of the creature targeted${entry.duration?.mode === "fixed" ? `, for ${timeText(entry.duration)}` : ""}`;
}

// A light its user sheds in words: "Bright light in 20 feet and dim light to 40 feet for 10 minutes".
export function lightText(light) {
    const reach = light.bright ? `Bright light in ${light.bright} feet${light.dim > light.bright ? ` and dim light to ${light.dim} feet` : ""}` : `Dim light in ${light.dim} feet`;
    return `${reach}${light.duration?.mode === "fixed" ? ` for ${timeText(light.duration)}` : ""}`;
}

// Its light's Effect: PF2e's TokenLight rule on its user's token.
export function lightEffectSource(light, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return ownEffectSource({ name: "Light", img: "icons/svg/light.svg", words: lightText(light), rules: [{ key: "TokenLight", value: { bright: light.bright, dim: light.dim } }], duration: light.duration, flag: { light: true }, item, user, worldTime, initiative, moduleId });
}

// Its vision's Effect: PF2e's Sense rule.
export function senseEffectSource(sense, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    return ownEffectSource({ name: SENSE_WORDS[sense.selector] ?? sense.selector, img: "icons/svg/eye.svg", words: senseText(sense), rules: [{ key: "Sense", selector: sense.selector, ...(sense.acuity ? { acuity: sense.acuity } : {}), ...(Number.isFinite(sense.range) ? { range: sense.range } : {}) }], duration: sense.duration, flag: { sense: sense.selector }, item, user, worldTime, initiative, moduleId });
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
    return `A ${attack.name} unarmed attack (${attack.dice}${attack.die} ${attack.type}${traits.length ? `; ${traits.join(", ")}` : ""})${forTime(attack.duration)}`;
}

// Its Effect: PF2e's Strike rule, as its own Effects grant one (Bestial Mutagen's claw).
export function attackEffectSource(attack, { item = {}, user = {}, worldTime = 0, initiative = null, moduleId = "pf2e-automatic-item-resolution" } = {}) {
    const rule = { key: "Strike", category: "unarmed", group: "brawling", ...(["claw", "jaws", "fist", "horn", "tail", "foot", "fangs", "tusk"].includes(attack.name) ? { baseType: attack.name } : {}), damage: { base: { damageType: attack.type, dice: attack.dice, die: attack.die } }, label: `${attack.name.charAt(0).toUpperCase()}${attack.name.slice(1)}`, range: null, slug: `${attack.name}-${String(item.name ?? "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`, traits: attack.traits };
    return ownEffectSource({ name: `${attack.name} attack`, img: "icons/svg/sword.svg", words: attackText(attack), rules: [rule], duration: attack.duration, flag: { attack: attack.name }, item, user, worldTime, initiative, moduleId });
}

// A picked skill's bonus in words: "+1 item to the skill picked (intimidation, deception or performance), and a critical failure
// on it or diplomacy becomes a failure, for 1 minute".
export function skillPickText(pick) {
    const list = `${pick.skills.slice(0, -1).join(", ")} or ${pick.skills.at(-1)}`;
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
    return `+${amount}${kind ? ` ${kind}` : ""} damage on ${extra.own ? "the weapon's " : range ? `${range} ` : ""}Strikes${against ? ` against ${against} creatures` : ""}${forTime(extra.duration)}`;
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
    // ("Creatures of your choice", none needed: Cayden's Tankard ends its user's own either way.)
    const optional = (state.plan?.item?.reduce ?? []).filter((entry) => entry.who === "targets").every((entry) => entry.optional) && state.plan?.item?.recipient !== "targets";
    const targetHint = open && canApply && forAllies ? `<p class="aar-hint">${optional ? "Target the other creatures it helps, if any" : "Target the creatures it helps (your own token too, when it helps you)"}, then press Apply.</p>` : "";
    const previewList = preview.length ? `<ul class="aar-notes">${preview.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const results = state.results.length ? `<ul class="aar-applied">${state.results.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>` : "";
    const controls = open && canApply ? `<footer class="aar-controls"><button type="button" data-air-action="apply">Apply</button></footer>` : open ? `<p class="aar-hint">Waiting for ${escape(state.user.name)}'s player or the GM to apply it.</p>` : "";
    return `<section class="pf2e-aar-card pf2e-air-card" data-air-status="${escape(state.status)}"><header><strong>${escape(state.item.name)}</strong><span class="aar-check">used by ${escape(state.user.name)}</span></header>${drinker}${ceremony}${resistPick}${recoveryPick}${reducePick}${runePick}${runeChoicePick}${skillPicker}${previewList}${targetHint}${results}${controls}</section>`;
}

// Live play for an item that has its user roll their next roll of a kind twice, or gives them a bonus for a moment
// (src/compiler/fortune.js, src/compiler/readied-bonus.js, src/live/fortune-card.js): Apply gives the user an Effect with
// PF2e's rules (one at a time per item); PF2e rolls that roll twice and removes a RollTwice Effect after it. On the active
// GM's client, a check message whose domains hold the roll an Effect is for removes it (a bonus for one roll; a RollTwice
// should PF2e's "remove expired effects" setting be off). A bonus for a time ends with PF2e's own duration. One only against what
// triggered it goes after that: the attack or check at its creature, its creature's save, or the damage it takes.

import { MODULE_KEY, createFortuneCard, fortuneCardHTML, fortuneEffectSource, isForTarget, readiedWords } from "../src/live/fortune-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, damageRollClass, entryOf, isActiveGM, recover, startInitiative, stateOf } from "./foundry.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export async function postFortuneCard({ message, plan, used, actor, token }) {
    const state = createFortuneCard({ plan, item: { name: used.data.name, uuid: used.data.uuid ?? null, img: used.data.img ?? null }, user: entryOf(token, actor) });
    return ChatMessage.create({ content: fortuneCardHTML(state, { canApply: true }), speaker: message?.speaker ?? ChatMessage.getSpeaker({ actor }), flags: { [MODULE_ID]: { [FLAG]: state } } });
}

// choices: { targets } (token uuids), for a bonus another creature gets (Resonant Guitar's): each of them, not the user.
export async function applyFortuneCard(message, { targets = [] } = {}) {
    const state = stateOf(message);
    if (!state || state.kind !== "fortune" || state.status !== "open") return null;
    const forTarget = isForTarget(state.plan);
    if (forTarget && !targets.length) throw new Error("Target the creature first.");
    const creatures = forTarget
        ? (await Promise.all(targets.map(async (uuid) => { const token = await fromUuid(uuid).catch(() => null); return token?.actor ? { actor: token.actor, name: token.name ?? token.actor.name } : null; }))).filter(Boolean)
        : [{ actor: await fromUuid(state.user.actorUuid).catch(() => null), name: state.user.name }];
    if (!creatures.length || !creatures[0].actor) throw new Error(`${forTarget ? "That creature" : state.user.name} isn't there any more.`);
    // (Its user's legendary rolls, Perfected Robes': read off its sheet now; none, nothing to roll twice.)
    if (state.plan.rollTwice?.selector === "legendary") {
        const rolls = legendaryRolls(creatures[0].actor);
        if (!rolls.length) throw new Error(`${state.user.name} has no legendary proficiency to roll with.`);
        state.plan = { ...state.plan, rollTwice: { ...state.plan.rollTwice, rolls } };
    }
    for (const { actor } of creatures) {
        // (The same item's earlier one, unused: replaced.)
        const old = (actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]?.item?.name === state.item.name);
        if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map((effect) => effect.id));
        await actor.createEmbeddedDocuments("Item", [fortuneEffectSource({ state: forExpert(state, actor), img: state.item.img, worldTime: game.time.worldTime, initiative: startInitiative(actor), moduleId: MODULE_ID })]);
        // (What a failure at that roll costs, Iris of the Sky's: a mark of its own — PF2e takes the RollTwice Effect away with the roll.)
        const onFailure = state.plan.rollTwice?.onFailure;
        if (onFailure) await actor.createEmbeddedDocuments("Item", [{ name: `${state.item.name}: a failure costs ${failureWords(onFailure)}`, type: "effect", img: state.item.img ?? "icons/svg/hazard.svg", flags: { [MODULE_ID]: { rollAfter: { selector: state.plan.rollTwice.selector, onFailure, item: state.item } } }, system: { description: { value: `<p>If the roll is a failure, ${escape(actor.name)} takes ${escape(failureWords(onFailure))}.</p>` }, duration: { value: 1, unit: "minutes", expiry: "turn-start", sustained: false }, start: { value: game.time.worldTime, initiative: startInitiative(actor) }, rules: [] } }]);
    }
    const results = creatures.map(({ actor, name }) => `${name}: ${readiedWords(forExpert(state, actor).plan)}.`);
    // (Thrice-Fried Mudwings': the item's Speed Effect on its user lowered the first time, ended the second.)
    if (state.plan.bonus?.speedSteps) for (const { actor, name } of creatures) results.push(await stepSpeed(actor, name, state));
    // (Pyrefeather Cloak's flat check to end its persistent fire at once: PF2e's recovery check.)
    if (state.plan.bonus?.recovery) for (const { actor, name } of creatures) results.push(...await recover(actor, name, state.plan.bonus.recovery));
    if (state.plan.bonus?.breaks) results.push(await breakItem(state.item));
    const next = { ...state, status: "applied", results };
    return message.update({ content: fortuneCardHTML(next, { canApply: true }), [`flags.${MODULE_ID}.${FLAG}`]: next });
}

// The item broken by its own use (Worldscale Shield's Absorb Blow): its Hit Points down to its Broken Threshold, or to 0 — destroyed — if
// it was broken already. → the card's line.
async function breakItem(entry) {
    const item = entry?.uuid ? await fromUuid(entry.uuid).catch(() => null) : null;
    const hp = item?.system?.hp;
    if (!item || !Number.isFinite(Number(hp?.value))) return `${entry?.name ?? "The item"}: break it by hand (it isn't there to update).`;
    // (No Hit Points in its data — PF2e's Worldscale Shield has none, its text's 60 aside: by hand.)
    if (!(Number(hp.max) > 0)) return `${item.name}: break it by hand (its data has no Hit Points).`;
    const threshold = Number(hp.brokenThreshold) || 0;
    const broken = Number(hp.value) <= threshold;
    const value = broken ? 0 : threshold;
    await item.update({ "system.hp.value": value });
    return `${item.name}: ${broken ? "destroyed" : "broken"} (Hit Points ${hp.value} → ${value}).`;
}

// A check by a creature with such an Effect, rolled for its roll: the Effect gone (PF2e's own removal may have done it).
// (More for an expert in any weapon, Warrior's Training Ring's +4: the modifier's value for this creature — a character's attack
// proficiencies, expert or better in one.)
const expertIn = (actor) => Object.values(actor?.system?.proficiencies?.attacks ?? {}).some((entry) => Number(entry?.rank ?? 0) >= 2);
function forExpert(state, actor) {
    const modifiers = state.plan.bonus?.modifiers ?? [];
    if (!modifiers.some((modifier) => modifier.ifExpert)) return state;
    const expert = expertIn(actor);
    return { ...state, plan: { ...state.plan, bonus: { ...state.plan.bonus, modifiers: modifiers.map(({ ifExpert, ...modifier }) => (ifExpert && expert ? { ...modifier, value: ifExpert } : modifier)) } } };
}

// The item's Speed Effect of that kind on its user (src/live/card.js speedEffectSource: its speed flag, the item as its origin): the first use
// sets its BaseSpeed to the lower value, the second ends it when the text says so. → the card's line.
async function stepSpeed(actor, name, state) {
    const steps = state.plan.bonus.speedSteps;
    const effect = (actor?.itemTypes?.effect ?? []).find((entry) => entry.flags?.[MODULE_ID]?.speed === steps.type && (!state.item.uuid || entry.system?.context?.origin?.item === state.item.uuid));
    if (!effect) return `${name} has no ${steps.type} Speed from ${state.item.name} to lower.`;
    const used = Number(effect.flags[MODULE_ID].speedSteps ?? 0);
    if (used >= 1 && steps.secondEnds) {
        await effect.delete();
        return `${name}'s ${steps.type} Speed from ${state.item.name} ends.`;
    }
    const rules = (effect.system.rules ?? []).map((rule) => (rule.key === "BaseSpeed" && rule.selector === steps.type ? { ...rule, value: steps.first } : rule));
    await effect.update({ "system.rules": rules, [`flags.${MODULE_ID}.speedSteps`]: used + 1 });
    return `${name}'s ${steps.type} Speed from ${state.item.name} is now ${steps.feet} feet or half their Speed, whichever is lower.`;
}

const failureWords = (onFailure) => `${onFailure.formula} ${onFailure.persistent ? "persistent " : ""}${onFailure.type} damage`;

export async function fortuneRolled(message) {
    if (!isActiveGM()) return;
    const context = message?.flags?.pf2e?.context;
    if (!context?.type || context.type === "damage-roll") return;
    const actor = message.actor;
    const domains = context.domains ?? [];
    // (A RollTwice Effect PF2e removes itself after the roll, when its "remove expired effects" setting is on: not twice.)
    const pf2eRemoves = Boolean(game.pf2e?.settings?.automation?.removeEffects);
    const options = new Set(context.options ?? []);
    const spent = (actor?.itemTypes?.effect ?? []).filter((effect) => {
        const flag = effect.flags?.[MODULE_ID]?.[MODULE_KEY];
        if (pf2eRemoves && (effect.system?.rules ?? []).some((rule) => rule.key === "RollTwice")) return false;
        if (!flag || !(flag.spend ?? [flag.selector]).some((selector) => selector && domains.includes(selector))) return false;
        // (Only a roll its bonus is for: a save against a mental effect for Psychic Warding Bracelet's, not any save.)
        const predicates = (effect.system?.rules ?? []).filter((rule) => rule.key === "FlatModifier" && Array.isArray(rule.predicate) && rule.predicate.length);
        const fits = (predicate) => {
            const Predicate = game.pf2e?.Predicate;
            if (Predicate) return new Predicate(predicate).test(options);
            return predicate.every((term) => typeof term !== "string" || options.has(term));
        };
        return !predicates.length || predicates.some((rule) => fits(rule.predicate));
    });
    if (spent.length) await actor.deleteEmbeddedDocuments("Item", spent.map((effect) => effect.id)).catch(() => null);
    // (What a failure at that roll costs, Iris of the Sky's 5 persistent fire: dealt to its user on a failure, the mark gone either way.)
    const after = (actor?.itemTypes?.effect ?? []).filter((effect) => domains.includes(effect.flags?.[MODULE_ID]?.rollAfter?.selector));
    if (after.length) await actor.deleteEmbeddedDocuments("Item", after.map((effect) => effect.id)).catch(() => null);
    for (const effect of context.outcome === "failure" ? after : []) {
        const { onFailure, item } = effect.flags[MODULE_ID].rollAfter;
        const DamageRoll = damageRollClass();
        const roll = await new DamageRoll(`${onFailure.formula}[${onFailure.persistent ? `persistent,${onFailure.type}` : onFailure.type}]`).evaluate();
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>${escape(item?.name ?? "Item")}</strong>: a failure — ${escape(failureWords(onFailure))} to ${escape(actor.name)}` });
        await actor.applyDamage({ damage: roll, token: message.token ?? actor.getActiveTokens?.(true, true)?.[0] ?? undefined });
    }
    // (A success at that roll gives a condition, Boots of the Blight's Quickened for 1 minute: the ability module's timed condition on its user,
    // the action it's for in the line.)
    for (const effect of ["success", "criticalSuccess"].includes(context.outcome) ? spent : []) {
        const flag = effect.flags[MODULE_ID][MODULE_KEY];
        if (!flag.onSuccess?.condition) continue;
        const ability = game.modules.get(ABILITY_ID)?.api?.live;
        const condition = flag.onSuccess.condition;
        const token = message.token ?? actor.getActiveTokens?.(true, true)?.[0] ?? null;
        const state = { plan: {}, ability: { name: flag.item?.name ?? "Item", uuid: flag.item?.uuid ?? null, slug: String(flag.item?.name ?? "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item" }, source: { actorUuid: actor.uuid, tokenUuid: token?.uuid ?? null, name: actor.name }, targets: [{ id: "t0", actorUuid: actor.uuid, tokenUuid: token?.uuid ?? null, name: token?.name ?? actor.name }] };
        const line = ability?.applyChange ? await ability.applyChange({ op: "condition", slug: condition.slug, value: condition.value, target: "t0", duration: condition.duration }, state) : null;
        await ChatMessage.create({ content: `<p><strong>${escape(flag.item?.name ?? "Item")}</strong>: a success — ${escape(line ?? `${actor.name} ${condition.slug} (by hand: the ability module isn't active)`)}${flag.onSuccess.only ? `; its extra action only to ${escape(flag.onSuccess.only)}` : ""}.</p>`, speaker: ChatMessage.getSpeaker({ actor }) });
    }
    // (A critical success at that roll gives more: Champion's Laurels' temporary Hit Points — the ability module's, with their time.)
    for (const effect of context.outcome === "criticalSuccess" ? spent : []) {
        const flag = effect.flags[MODULE_ID][MODULE_KEY];
        if (!flag.onCritical?.tempHP) continue;
        const ability = game.modules.get(ABILITY_ID)?.api?.live;
        const name = escape(flag.item?.name ?? "Item");
        const token = message.token ?? actor.getActiveTokens?.(true, true)?.[0] ?? null;
        const state = { plan: {}, ability: { name: flag.item?.name ?? "Item", uuid: flag.item?.uuid ?? null, slug: String(flag.item?.name ?? "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item" }, source: { actorUuid: actor.uuid, tokenUuid: token?.uuid ?? null, name: actor.name }, targets: [] };
        const line = ability?.applyChange ? await ability.applyChange({ op: "tempHp", target: "source", amount: flag.onCritical.tempHP, duration: flag.onCritical.duration }, state) : null;
        await ChatMessage.create({ content: `<p><strong>${name}</strong>: a critical success — ${escape(line ?? `${actor.name}: ${flag.onCritical.tempHP} temporary Hit Points${ability?.applyChange ? "" : " (by hand: the ability module isn't active)"}`)}.</p>`, speaker: ChatMessage.getSpeaker({ actor }) });
    }
}

// (Only against what triggered it, an Effect's flag against { damage, save, onAttack? }: the next attack roll or check at its creature
// spends it — a hit keeping one with resistance or immunity until the damage — as does its creature's next save, when it has a bonus to
// saves and no damage still to come, and the next damage it takes, one with resistance or immunity. Its turn's end otherwise. The attack's
// result does what onAttack says to the attacker: a condition on a miss (the ability module's timed condition), damage on a hit.)
const ATTACKS = new Set(["attack-roll", "spell-attack-roll"]);
export async function againstRolled(message) {
    if (!isActiveGM()) return;
    const flags = message?.flags?.pf2e;
    const context = flags?.context;
    if (!context?.type) return;
    const actorOf = async (uuid) => (uuid ? await fromUuid(uuid).catch(() => null) : null);
    const guarded = (actor) => (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]?.against);
    const remove = async (actor, effects) => {
        if (effects.length) await actor.deleteEmbeddedDocuments("Item", effects.map((effect) => effect.id)).catch(() => null);
    };
    if (context.type === "damage-taken" && flags.appliedDamage && !flags.appliedDamage.isHealing) {
        const actor = await actorOf(flags.appliedDamage.uuid);
        return remove(actor, guarded(actor).filter((effect) => effect.flags[MODULE_ID][MODULE_KEY].against.damage));
    }
    if (context.type === "saving-throw") return remove(message.actor, guarded(message.actor).filter((effect) => { const against = effect.flags[MODULE_ID][MODULE_KEY].against; return against.save && !against.damage; }));
    if (!(ATTACKS.has(context.type) || context.type === "skill-check" || context.type === "check") || !context.target?.actor) return;
    const actor = await actorOf(context.target.actor);
    const attack = ATTACKS.has(context.type);
    const hit = attack && ["success", "criticalSuccess"].includes(context.outcome);
    const spent = [];
    for (const effect of guarded(actor)) {
        const against = effect.flags[MODULE_ID][MODULE_KEY].against;
        // (Its attack already come, a hit whose damage is still to: not this one's.)
        if (against.attacked) continue;
        if (attack && against.onAttack) await onAttackResult(against.onAttack, { hit, attacker: message.actor, attackerToken: message.token ?? null, guarded: actor, item: effect.flags[MODULE_ID][MODULE_KEY].item });
        if (hit && against.damage) await effect.update({ [`flags.${MODULE_ID}.${MODULE_KEY}.against.attacked`]: true });
        else spent.push(effect);
    }
    return remove(actor, spent);
}

async function onAttackResult(onAttack, { hit, attacker, attackerToken, guarded, item }) {
    if (!attacker) return;
    const name = escape(item?.name ?? "Item");
    if (!hit && onAttack.miss) {
        const ability = game.modules.get(ABILITY_ID)?.api?.live;
        const token = attackerToken ?? attacker.getActiveTokens?.(true, true)?.[0] ?? null;
        const state = { plan: {}, ability: { name: item?.name ?? "Item", uuid: item?.uuid ?? null, slug: String(item?.name ?? "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item" }, source: { actorUuid: guarded.uuid, tokenUuid: guarded.getActiveTokens?.(true, true)?.[0]?.uuid ?? null, name: guarded.name }, targets: [{ id: "t0", actorUuid: attacker.uuid, tokenUuid: token?.uuid ?? null, name: token?.name ?? attacker.name }] };
        const condition = onAttack.miss.condition;
        const line = ability?.applyChange ? await ability.applyChange({ op: "condition", slug: condition.slug, value: condition.value, target: "t0", duration: condition.duration }, state) : null;
        await ChatMessage.create({ content: `<p><strong>${name}</strong>: the attack missed — ${escape(line ?? `${attacker.name} ${condition.slug}${condition.value ? ` ${condition.value}` : ""} for ${condition.duration.value} round${condition.duration.value === 1 ? "" : "s"}${ability?.applyChange ? "" : " (by hand: the ability module isn't active)"}`)}.</p>`, speaker: ChatMessage.getSpeaker({ actor: guarded }) });
    }
    if (hit && onAttack.hit) {
        const DamageRoll = damageRollClass();
        if (!DamageRoll) return;
        const damage = onAttack.hit.damage;
        const roll = await new DamageRoll(`(${damage.formula})[${damage.type}]`).evaluate();
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: guarded }), flavor: `<strong>${name}</strong>: the attack still hit — ${damage.formula} ${damage.type} damage to ${escape(attacker.name)}` });
        await attacker.applyDamage({ damage: roll, token: attackerToken ?? attacker.getActiveTokens?.(true, true)?.[0] ?? undefined });
    }
}

// The d20 rolls its user has legendary proficiency in: [{ selector, predicate?, label }] — PF2e's skills, saves and Perception at rank 4, and
// its Strikes and spell attacks with a legendary proficiency (PF2e's "item:proficiency:rank:4", its spellcasting's rank).
export function legendaryRolls(actor) {
    const rolls = [];
    const legendary = (statistic) => Number(statistic?.rank) === 4;
    for (const [slug, skill] of Object.entries(actor?.skills ?? {})) if (legendary(skill)) rolls.push({ selector: slug, label: skill.label ?? slug });
    for (const [slug, save] of Object.entries(actor?.saves ?? {})) if (legendary(save)) rolls.push({ selector: slug, label: save.label ?? slug });
    if (legendary(actor?.perception)) rolls.push({ selector: "perception", label: "Perception" });
    const weapons = Object.values(actor?.system?.proficiencies?.attacks ?? {}).some((entry) => Number(entry?.rank) === 4);
    if (weapons) rolls.push({ selector: "strike-attack-roll", predicate: ["item:proficiency:rank:4"], label: "Strikes at legendary proficiency" });
    const casting = (actor?.spellcasting?.contents ?? [...(actor?.spellcasting ?? [])]).some((entry) => Number(entry?.statistic?.rank) === 4);
    if (casting) rolls.push({ selector: "spell-attack-roll", label: "spell attacks" });
    return rolls;
}

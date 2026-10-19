// Live play for an item that has its user roll their next roll of a kind twice, or gives them a bonus for a moment
// (src/compiler/fortune.js, src/compiler/readied-bonus.js, src/live/fortune-card.js): Apply gives the user an Effect with
// PF2e's rules (one at a time per item); PF2e rolls that roll twice and removes a RollTwice Effect after it. On the active
// GM's client, a check message whose domains hold the roll an Effect is for removes it (a bonus for one roll; a RollTwice
// should PF2e's "remove expired effects" setting be off). A bonus for a time ends with PF2e's own duration. One only against what
// triggered it goes after that: the attack or check at its creature, its creature's save, or the damage it takes.

import { MODULE_KEY, createFortuneCard, fortuneCardHTML, fortuneEffectSource, isForTarget, readiedWords } from "../src/live/fortune-card.js";
import { ABILITY_ID, FLAG, MODULE_ID, damageRollClass, entryOf, isActiveGM, startInitiative, stateOf } from "./foundry.js";

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
    for (const { actor } of creatures) {
        // (The same item's earlier one, unused: replaced.)
        const old = (actor.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.[MODULE_KEY]?.item?.name === state.item.name);
        if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map((effect) => effect.id));
        await actor.createEmbeddedDocuments("Item", [fortuneEffectSource({ state, img: state.item.img, worldTime: game.time.worldTime, initiative: startInitiative(actor), moduleId: MODULE_ID })]);
    }
    const results = creatures.map(({ name }) => `${name}: ${readiedWords(state.plan)}.`);
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
    const name = String(item?.name ?? "Item").replace(/[&<>"']/g, "");
    if (!hit && onAttack.miss) {
        const ability = game.modules.get(ABILITY_ID)?.api?.live;
        const token = attackerToken ?? attacker.getActiveTokens?.(true, true)?.[0] ?? null;
        const state = { plan: {}, ability: { name, uuid: item?.uuid ?? null, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item" }, source: { actorUuid: guarded.uuid, tokenUuid: guarded.getActiveTokens?.(true, true)?.[0]?.uuid ?? null, name: guarded.name }, targets: [{ id: "t0", actorUuid: attacker.uuid, tokenUuid: token?.uuid ?? null, name: token?.name ?? attacker.name }] };
        const condition = onAttack.miss.condition;
        const line = ability?.applyChange ? await ability.applyChange({ op: "condition", slug: condition.slug, value: condition.value, target: "t0", duration: condition.duration }, state) : null;
        await ChatMessage.create({ content: `<p><strong>${name}</strong>: the attack missed — ${line ?? `${attacker.name} ${condition.slug}${condition.value ? ` ${condition.value}` : ""} for ${condition.duration.value} round${condition.duration.value === 1 ? "" : "s"}${ability?.applyChange ? "" : " (by hand: the ability module isn't active)"}`}.</p>`, speaker: ChatMessage.getSpeaker({ actor: guarded }) });
    }
    if (hit && onAttack.hit) {
        const DamageRoll = damageRollClass();
        if (!DamageRoll) return;
        const damage = onAttack.hit.damage;
        const roll = await new DamageRoll(`(${damage.formula})[${damage.type}]`).evaluate();
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: guarded }), flavor: `<strong>${name}</strong>: the attack still hit — ${damage.formula} ${damage.type} damage to ${attacker.name}` });
        await attacker.applyDamage({ damage: roll, token: attackerToken ?? attacker.getActiveTokens?.(true, true)?.[0] ?? undefined });
    }
}

// Foundry helpers the item module's cards share (scripts/live.js, scripts/bombs.js).

import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";
import { recoveryText, rollFormula } from "../src/live/card.js";

export const MODULE_ID = "pf2e-automatic-item-resolution";
export const CORE_ID = "pf2e-resolution-core";
export const ABILITY_ID = "pf2e-automatic-ability-resolution";
export const FLAG = "card";
export const SOCKET = `module.${MODULE_ID}`;

export const isActiveGM = () => game.users.activeGM?.isSelf ?? game.user.isGM;
export const stateOf = (message) => message?.getFlag?.(MODULE_ID, FLAG) ?? null;

// A card's entry for a creature: its actor, its token (when on a scene) and the name shown.
// An item's owner's numbers for the compiler (src/compiler/item-data.js): its level and its attribute modifiers.
// (And its feats' slugs, for an item whose result depends on one: Lover's Knot's "If you have the Battle Medicine feat, you instead
// regain 2d6+7 Hit Points".)
export const ownerOf = (actor) => (actor ? { ownerLevel: Number.isFinite(Number(actor.level)) ? Number(actor.level) : null, ownerAbilities: Object.fromEntries(Object.entries(actor.abilities ?? actor.system?.abilities ?? {}).map(([key, value]) => [key, Number(value?.mod)]).filter(([, mod]) => Number.isFinite(mod))), ownerFeats: (actor.itemTypes?.feat ?? []).map((feat) => feat.slug).filter(Boolean) } : {});

export const entryOf = (token, actor) => ({ actorUuid: actor.uuid, tokenUuid: token?.document?.uuid ?? token?.uuid ?? null, name: token?.name ?? actor.name });

// A token's space for the core's distance (as the ability module measures auras).
export function spaceOf(token) {
    const size = canvas.grid.size;
    const data = token.document ?? token;
    return { x: Number(data.x), y: Number(data.y), w: Math.max(1, Number(data.width ?? 1)) * size, h: Math.max(1, Number(data.height ?? 1)) * size, elevation: Number(data.elevation ?? 0) };
}

// The visible creatures within that many feet of a token on the current scene (not the token itself).
export function creaturesNear(token, feet = 5) {
    const placeable = token?.object ?? token;
    const sceneId = placeable?.document?.parent?.id ?? placeable?.parent?.id;
    if (!placeable || !canvas?.ready || sceneId !== canvas.scene?.id) return [];
    const from = spaceOf(placeable);
    const grid = { size: canvas.grid.size, gridFeet: canvas.dimensions?.distance ?? 5 };
    return canvas.tokens.placeables
        .filter((other) => other !== placeable && other.document?.uuid !== placeable.document?.uuid && other.actor?.isOfType?.("creature") && !other.document.hidden && distanceFeet(from, spaceOf(other), grid) <= feet)
        .map((other) => entryOf(other, other.actor));
}

// The actor and token of a card's entry.
export async function creatureOf(entry) {
    const token = entry?.tokenUuid ? await fromUuid(entry.tokenUuid).catch(() => null) : null;
    return { token, actor: token?.actor ?? (entry?.actorUuid ? await fromUuid(entry.actorUuid).catch(() => null) : null) };
}

// Whether this user may press a card's Apply: the GM, or an owner of the item's user.
// (Its presser's when it has one — a creature moved by its user, src/live/teleport-card.js: the user's owner picks, not the creature's.)
export const presserUuid = (state) => state?.presser?.actorUuid ?? state?.user?.actorUuid;

export function mayApply(state) {
    if (game.user.isGM) return true;
    try {
        return !!fromUuidSync(presserUuid(state))?.testUserPermission?.(game.user, "OWNER");
    } catch {
        return false;
    }
}

export const damageRollClass = () => (CONFIG.Dice?.rolls ?? []).find((roll) => roll?.name === "DamageRoll");

// A Strike's riders on the creature it hit (a bomb's, an item's Strike): the plan resolved by the core at the degree PF2e
// rolled, each change through the ability module's api.live.applyChange. → the lines for the card.
export async function applyRiders({ plan, degree, user, target, item }) {
    const core = game.modules.get(CORE_ID)?.api;
    const ability = game.modules.get(ABILITY_ID)?.api?.live;
    const context = { caster: { id: "source" }, targets: [{ id: "target" }], id: (creature) => creature.id, statistic: () => ({ modifier: 0, dc: 10 }), allied: () => false };
    // (Its dice rolled: an action's own healing, Medic's Shield's 6d6+20 on a successful First Aid.)
    const damage = async (instance) => (globalThis.Roll ? (await new Roll(rollFormula(instance)).evaluate()).total : 0);
    const result = core ? await core.registry.resolve(plan, context, { roll: () => ({ degree, total: null, natural: null }), damage, choose: () => undefined }) : { changes: [] };
    const abilityState = {
        plan,
        ability: { name: item.name, uuid: item.uuid ?? null },
        source: { actorUuid: user.actorUuid, tokenUuid: user.tokenUuid ?? null, name: user.name },
        targets: [{ id: "target", actorUuid: target.actorUuid, tokenUuid: target.tokenUuid ?? null, name: target.name }]
    };
    const lines = [];
    for (const change of result.changes) {
        try {
            const line = ability?.applyChange ? await ability.applyChange(change, abilityState) : `${target.name}: ${change.op} to apply by hand (the ability module isn't active).`;
            // (A floor: "can't reduce sickened below 1", as the ability module's own card says it — only when its floor Effect is there;
            // an ability module without floors leaves it to the GM.)
            const floored = change.effect?.kind === "floor" && !line ? ((await fromUuid(target.actorUuid).catch(() => null))?.itemTypes?.effect ?? []).some((effect) => /\bfloor$/i.test(effect.name)) : null;
            const said = change.op === "condition" ? `${change.slug}${Number.isFinite(change.value) ? ` ${change.value}` : ""}`
                : change.effect?.kind === "modifier" ? `${change.effect.modifier.value} to ${change.effect.modifier.selector}`
                    : change.effect?.kind === "floor" ? `can't reduce ${change.effect.floor?.slug} below ${change.effect.floor?.value}${floored ? "" : " (apply it by hand)"}`
                        : change.op;
            lines.push(line ?? `${target.name}: ${said}`);
        } catch (error) {
            lines.push(`Couldn't apply ${change.op} to ${target.name}: ${error.message}`);
        }
    }
    return lines;
}

// A creature's afflictions: PF2e's affliction items where it has them (not in its production builds), and the Effects Pseudo Afflictions
// tracks them with ("Affliction Effect: …", its flag with the save and stages). → [{ document, id, name, traits, level, dc }].
const PSEUDO_AFFLICTIONS = "pseudo-afflictions";
export function afflictionsOf(actor) {
    const own = (actor?.itemTypes?.affliction ?? []).map((affliction) => ({ document: affliction, id: affliction.id, name: affliction.name, traits: affliction.system?.traits?.value ?? [], level: Number(affliction.system?.level?.value) || 0, dc: Number(affliction.system?.save?.value) || null }));
    const tracked = (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[PSEUDO_AFFLICTIONS]?.stages).map((effect) => ({ document: effect, id: effect.id, name: effect.name.replace(/^Affliction Effect:\s*/i, ""), traits: effect.system?.traits?.value ?? [], level: Number(effect.system?.level?.value) || 0, dc: Number(effect.flags[PSEUDO_AFFLICTIONS].save?.value) || null }));
    return [...own, ...tracked];
}

// Afflictions removed, with the conditions they gave (Pseudo Afflictions marks them granted by its Effect, which PF2e may not delete
// with it).
export async function removeAfflictions(actor, ids) {
    if (!actor || !ids?.length) return;
    const granted = (actor.itemTypes?.condition ?? []).filter((condition) => ids.includes(condition.flags?.pf2e?.grantedBy?.id)).map((condition) => condition.id);
    await actor.deleteEmbeddedDocuments("Item", ids);
    const left = granted.filter((id) => actor.items?.get?.(id));
    if (left.length) await actor.deleteEmbeddedDocuments("Item", left).catch(() => null);
}

// The started encounter the creature is in, and its combatant there: the GM may be viewing another encounter, or an unlinked
// one (game.combat is the viewed one). → { combat, combatant } or null.
export function encounterOf(actor) {
    if (!actor) return null;
    const isIt = (combatant) => combatant.actor?.uuid === actor.uuid || combatant.actorId === actor.id;
    const combats = [game.combat, ...(game.combats?.contents ?? [])].filter((combat, index, list) => combat?.started && list.indexOf(combat) === index);
    for (const combat of combats) {
        const combatant = combat.combatants.find(isIt);
        if (combatant) return { combat, combatant };
    }
    return null;
}

// The initiative a new Effect starts at: the current turn's in the creature's encounter, else none.
export const startInitiative = (actor) => {
    const found = encounterOf(actor);
    return found ? found.combat.combatant?.initiative ?? null : null;
};

// The owner's own DCs, for a save against "your class DC or spell DC" (src/compiler/item-data.js fillOwnerDCs): PF2e's
// attributes classDC and spellDC, which it keeps on characters and NPCs alike.
export function ownerDCsOf(actor) {
    const number = (value) => (Number(value) > 0 ? Number(value) : null);
    const attributes = actor?.system?.attributes ?? {};
    // (And its Athletics DC: a grab's Escape DC, Scizore of the Crab's "This functions as the Grab creature ability".)
    return { class: number(attributes.classDC?.value), spell: number(attributes.spellDC?.value), athletics: number(actor?.skills?.athletics?.dc?.value) };
}

// A condition lowered by an amount (PF2e's decreaseCondition, once for each step), or removed ("all").
// (A condition with no value — Cayden's Tankard's grabbed — is there or not.)
export async function lowerCondition(actor, name, slug, by) {
    const condition = actor?.getCondition?.(slug) ?? null;
    const present = Boolean(condition) || Boolean(actor?.hasCondition?.(slug));
    if (!present) return `${name} isn't ${slug}: nothing to lower.`;
    if (by === "all") await actor.decreaseCondition(slug, { forceRemove: true });
    else for (let step = 0; step < by; step++) await actor.decreaseCondition(slug);
    const left = actor.getCondition?.(slug) ?? null;
    const after = Number(left?.value) || 0;
    return after ? `${name}'s ${slug} lowered to ${after}` : left || actor.hasCondition?.(slug) ? `${name} is still ${slug}` : `${name} is no longer ${slug}`;
}

// Healing through PF2e (its healing bonuses, its "healed" message with undo), then
// Dying ends at 1 Hit Point or more (the core's api.dying; PF2e leaves it to the table). An item card's healing, and a save card's for the
// creatures its plan heals instead (src/live/if-target.js). → the line for the card.
export async function healCreature({ token, actor }, name, amount, state = {}) {
    if (!actor || !(amount > 0)) return null;
    const dying = game.modules.get(CORE_ID)?.api?.dying;
    const wasDying = dying?.isDying(actor) ?? actor.hasCondition?.("dying") ?? false;
    const before = Number(actor.system?.attributes?.hp?.value) || 0;
    await actor.applyDamage({ damage: -amount, token: token ?? actor.getActiveTokens?.(true, true)?.[0] ?? undefined });
    const healed = (Number(actor.system?.attributes?.hp?.value) || 0) - before;
    const parts = [`${name} regains ${healed} Hit Points${healed < amount ? ` (of ${amount})` : ""}${state?.rolled?.kind === "healing" ? ", PF2e's roll" : ""}`];
    if (wasDying && dying) {
        // (Magical Medal (Phoenix's Fire)'s "Your Wounded value does not increase": the core's keepWounded.)
        const revived = await dying.recoverFromDying(actor, wasDying, { keepWounded: Boolean(state?.plan?.item?.keepWounded) });
        // (The core's words are a spell's: "this spell doesn't increase it" — an item's here.)
        if (revived) parts.push(dying.revivedNote(revived).replace(/\bthis spell\b/, "this item"));
    } else if (wasDying) parts.push("It was dying: end Dying and raise Wounded by hand.");
    return parts.join(". ");
}

// The recovery check for each persistent damage of the item's types: PF2e's condition.rollRecovery, which deletes it on a
// success (without waiting for that, so a moment is given for it). → lines for the card.
// A new save against each affliction of those traits Pseudo Afflictions tracks on the creature (src/compiler/recovery.js: Quenching Potion's
// poisons): its save, at its DC; a success lowers the stage one, a critical success two (ended below stage 1, as Pseudo Afflictions ends one);
// a failure raises it one, a critical failure two, unless noWorse. Its badge changed, Pseudo Afflictions gives the stage's conditions.
export async function afflictionSaves(actor, name, { traits = [], noWorse = false } = {}) {
    const found = afflictionsOf(actor).filter((one) => one.document?.flags?.[PSEUDO_AFFLICTIONS]?.save && traits.some((trait) => one.traits.includes(trait) || one.document.traits?.has?.(trait)));
    if (!found.length) return [`${name} has no ${traits.join(" or ")} affliction: no new save.`];
    const lines = [];
    for (const one of found) {
        const effect = one.document;
        const save = effect.flags[PSEUDO_AFFLICTIONS].save;
        const statistic = actor.saves?.[save.type];
        const stage = Number(effect.system?.badge?.value) || 1;
        if (!statistic || !Number(save.value)) {
            lines.push(`${name}: roll a new save against ${one.name} by hand.`);
            continue;
        }
        const roll = await statistic.roll({ dc: { value: Number(save.value) }, skipDialog: true, item: effect });
        const degree = roll?.degreeOfSuccess ?? null;
        const change = degree === 3 ? -2 : degree === 2 ? -1 : noWorse ? 0 : degree === 1 ? 1 : degree === 0 ? 2 : 0;
        if (degree === null) lines.push(`${name}: the save against ${one.name} wasn't rolled.`);
        else if (change < 0 && stage + change < 1) {
            await effect.delete();
            lines.push(`${name}: ${one.name} ends (its new save)`);
        } else if (change !== 0) {
            const next = Math.min(stage + change, Number(effect.system?.badge?.max) || stage + change);
            await effect.update({ "system.badge.value": next });
            lines.push(`${name}: ${one.name} at stage ${next} (its new save)`);
        } else lines.push(`${name}: ${one.name} stays at stage ${stage}${noWorse ? " (it can't worsen from this save)" : ""}`);
    }
    return lines;
}

// One affliction of those traits lowered (src/compiler/permanent.js: Heartripper Blade's "reduce the stage of one toxin or disease you're
// suffering by one stage (this can't reduce the stage below stage 1 …)"): the Pseudo Afflictions one at the highest stage above the minimum,
// its badge lowered, never below it — Pseudo Afflictions gives that stage's conditions.
// (only: which of them it may lower, Artevil Suspension's ingested poison; the lines' lowered, whether one was — 2026-10-27.)
export async function lowerAfflictionStage(actor, name, { traits = [], by = 1, min = 1, only = null } = {}) {
    const found = afflictionsOf(actor).filter((one) => one.document?.flags?.[PSEUDO_AFFLICTIONS]?.stages && traits.some((trait) => one.traits.includes(trait) || one.document.traits?.has?.(trait)) && (!only || only(one)));
    const stageOf = (one) => Number(one.document.system?.badge?.value) || 1;
    const above = found.filter((one) => stageOf(one) > min).sort((a, b) => stageOf(b) - stageOf(a));
    if (!found.length) return [`${name} has no ${traits.join(" or ")} affliction to lower.`];
    if (!above.length) return [`${name}: ${found.map((one) => one.name).join(", ")} already at stage ${min}; it can't go lower this way.`];
    const one = above[0];
    const next = Math.max(min, stageOf(one) - by);
    await one.document.update({ "system.badge.value": next });
    return Object.assign([`${name}: ${one.name} down to stage ${next}${above.length > 1 ? ` (the highest of ${above.length}; change another on the sheet if you'd rather)` : ""}`], { lowered: true });
}

export async function recover(actor, name, recovery) {
    const persistent = () => (actor?.itemTypes?.condition ?? []).filter((condition) => condition.slug === "persistent-damage" && recovery.types.includes(condition.system?.persistent?.damageType));
    const found = persistent();
    // (Ended outright, Hollow Robes': each deleted, no check — or one, Extinguishing Ball's hit: the first of them.)
    if (recovery.ends) {
        if (!found.length) return [`${name} has no persistent ${recovery.types.length < 4 ? `${recovery.types.join(" or ")} ` : ""}damage to end.`];
        const ended = recovery.one ? found.slice(0, 1) : found;
        await actor.deleteEmbeddedDocuments("Item", ended.map((condition) => condition.id));
        return ended.map((condition) => `${name}: ${condition.name} ended`);
    }
    if (!found.length) return [`${name} has no persistent ${recoveryText({ ...recovery, afflictionSave: null }).replace(/^.* persistent /, "")}: no flat check.`];
    const lines = [];
    for (const condition of found) {
        // (Its name before a lower DC renames it: "Persistent Damage (1d6 fire)".)
        const label = condition.name;
        const usual = Number(condition.system.persistent.dc) || 15;
        const dc = recovery.dc && recovery.dc < usual ? recovery.dc : usual;
        if (dc !== usual) await condition.update({ "system.persistent.dc": dc });
        await condition.rollRecovery();
        const stays = () => persistent().some((entry) => entry.id === condition.id);
        for (let wait = 0; wait < 20 && stays(); wait++) await new Promise((resolve) => setTimeout(resolve, 50));
        if (stays() && dc !== usual) await condition.update({ "system.persistent.dc": usual });
        lines.push(stays() ? `${name}: the flat check (DC ${dc}) didn't end ${label}` : `${name}: ${label} ended (flat check, DC ${dc})`);
    }
    return lines;
}

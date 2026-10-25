// Foundry helpers the item module's cards share (scripts/live.js, scripts/bombs.js).

import { distanceFeet } from "../../pf2e-resolution-core/src/model/grid.js";
import { rollFormula } from "../src/live/card.js";

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
export function mayApply(state) {
    if (game.user.isGM) return true;
    try {
        return !!fromUuidSync(state.user.actorUuid)?.testUserPermission?.(game.user, "OWNER");
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
    return { class: number(attributes.classDC?.value), spell: number(attributes.spellDC?.value) };
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

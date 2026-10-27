// Live play for what each of its user's melee attack rolls sets off while an item lasts (src/compiler/attack-riders.js, Martial Mayhem
// Mutagen's): Apply gives its user a watch Effect for the item's time; on the active GM's client, each melee attack roll by a creature with
// one applies the riders for the degree PF2e rolled — through the ability module's applyChange: the target off-guard to that creature's
// next attack (its scoped off-guard, the next attack at it spends it), a timed condition on the target or on the user. A whetstone's
// riders, its weapon's alone: Analysis Eye's weaknesses and resistances to the GM, Leeching Fangs' healing from the damage dealt.

import { attackRidersText } from "../src/compiler/attack-riders.js";
import { itemNoteSource } from "../src/live/card.js";
import { ABILITY_ID, MODULE_ID, isActiveGM } from "./foundry.js";

export const WATCH_KEY = "attackRiders";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// The watch Effect on its user, for the item's time (unlimited with none); a whetstone's, the weapon picked on the card ({ id, name }).
export function attackRidersEffectSource(entry, { item = {}, user = {}, weapon = null, worldTime = 0, initiative = null } = {}) {
    const duration = entry.duration?.mode === "fixed" ? { value: entry.duration.value, unit: entry.duration.unit, expiry: entry.duration.expiry ?? "turn-start", sustained: false } : { value: -1, unit: "unlimited", expiry: null, sustained: false };
    return {
        name: weapon ? `${item.name ?? "Item"} (${weapon.name})` : `${item.name ?? "Item"}: melee attack riders`,
        type: "effect",
        img: item.img ?? "icons/svg/sword.svg",
        flags: { [MODULE_ID]: { [WATCH_KEY]: { riders: entry.riders, item: { name: item.name ?? null, uuid: item.uuid ?? null }, user, ...(weapon ? { weapon: { id: weapon.id, name: weapon.name } } : {}) } } },
        // (A whetstone's own rules for its weapon, Pinpoint Arrowhead's: on that weapon alone, by its id.)
        system: { description: { value: `<p>${escape(attackRidersText(entry.riders, weapon?.name ?? null))}, from <strong>${escape(item.name ?? "the item")}</strong>.</p>` }, duration, start: { value: worldTime, initiative }, rules: weapon?.id ? (entry.riders ?? []).flatMap((rider) => rider.rules ?? []).map((rule) => ({ ...rule, predicate: [...(rule.predicate ?? []), `item:id:${weapon.id}`] })) : [] }
    };
}

// (Its weaknesses and resistances, PF2e's: "Fire 10" each, or its type and value.)
const iwrWords = (list, kind) => (list ?? []).map((entry) => `${kind} ${entry.label ?? `${entry.type} ${entry.value ?? ""}`.trim()}`);
const ownersOf = (actor) => game.users.filter((user) => !user.isGM && actor?.testUserPermission?.(user, "OWNER")).map((user) => user.id);
const gmIds = () => game.users.filter((user) => user.isGM).map((user) => user.id);

// Analysis Eye's first hit at a creature: its weaknesses and resistances to the GM (one alone, to the user too) — once a creature, the
// creatures already done kept on the watch Effect.
async function learnOf(effect, watch, actor, target) {
    const learned = watch.learned ?? [];
    if (!target || learned.includes(target.uuid)) return null;
    await effect.update({ [`flags.${MODULE_ID}.${WATCH_KEY}.learned`]: [...learned, target.uuid] });
    const known = [...iwrWords(target.system?.attributes?.weaknesses, "weakness"), ...iwrWords(target.system?.attributes?.resistances, "resistance")];
    const item = escape(watch.item?.name ?? "Item");
    if (known.length === 1) {
        await ChatMessage.create({ content: `<p><strong>${item}</strong>: ${escape(actor.name)} learns that ${escape(target.name)} has ${escape(known[0])}.</p>`, speaker: ChatMessage.getSpeaker({ actor }), whisper: [...gmIds(), ...ownersOf(actor)] });
        return null;
    }
    const words = known.length ? `pick one of ${escape(target.name)}'s to tell ${escape(actor.name)}: ${known.map(escape).join("; ")}` : `${escape(target.name)} has no weakness or resistance for ${escape(actor.name)} to learn`;
    await ChatMessage.create({ content: `<p><strong>${item}</strong> (GM): ${words}.</p>`, speaker: ChatMessage.getSpeaker({ actor }), whisper: gmIds() });
    return null;
}

// A melee attack roll by a creature with a watch Effect: its riders for the degree rolled.
export async function attackRidersRolled(message) {
    if (!isActiveGM()) return;
    const context = message?.flags?.pf2e?.context;
    if (context?.type !== "attack-roll" || context.isReroll || !context.outcome) return;
    const actor = message.actor;
    const watched = (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.[WATCH_KEY]);
    if (!watched.length) return;
    const melee = (context.options ?? []).includes("item:melee");
    const ability = game.modules.get(ABILITY_ID)?.api?.live;
    const targetToken = context.target?.token ? await fromUuid(context.target.token).catch(() => null) : null;
    const sourceToken = message.token ?? actor.getActiveTokens?.(true, true)?.[0] ?? null;
    for (const effect of watched) {
        const watch = effect.flags[MODULE_ID][WATCH_KEY];
        const state = {
            plan: {},
            ability: { name: watch.item?.name ?? "Item", uuid: watch.item?.uuid ?? null, slug: String(watch.item?.name ?? "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item" },
            source: { actorUuid: actor.uuid, tokenUuid: sourceToken?.uuid ?? null, name: actor.name },
            targets: targetToken?.actor ? [{ id: "t0", actorUuid: targetToken.actor.uuid, tokenUuid: targetToken.uuid, name: targetToken.name }] : []
        };
        const lines = [];
        // (Its own Strikes only, Silkspinner's Shield's bash: that item's, by its id.)
        const ownId = String(watch.item?.uuid ?? "").split(".").at(-1);
        const own = Boolean(ownId) && (context.options ?? []).includes(`item:id:${ownId}`);
        // (A whetstone's weapon only: the one picked, by its id.)
        const weapon = Boolean(watch.weapon?.id) && (context.options ?? []).includes(`item:id:${watch.weapon.id}`);
        for (const rider of watch.riders ?? []) {
            if (!rider.on.includes(context.outcome) || (rider.melee && !melee) || (rider.own && !own) || (rider.weapon && !weapon)) continue;
            if (rider.learn) {
                await learnOf(effect, watch, actor, targetToken?.actor ?? null);
                continue;
            }
            if (!ability?.applyChange) {
                lines.push(`${attackRidersText([rider])} (apply it by hand: the ability module isn't active)`);
                continue;
            }
            if (rider.offGuard && state.targets.length) lines.push((await ability.applyChange({ op: "condition", slug: "off-guard", value: null, target: "t0", duration: rider.offGuard.duration, scope: { attacker: "source", attacks: "any", uses: rider.offGuard.uses } }, state)) ?? `${state.targets[0].name} is off-guard to ${actor.name}'s next attack`);
            if (rider.targetModifier && state.targets.length) lines.push((await ability.applyChange({ op: "effect", target: "t0", effect: { kind: "modifier", modifier: rider.targetModifier } }, state)) ?? `${state.targets[0].name}: ${rider.targetModifier.value} feet to its Speeds`);
            if (rider.target && state.targets.length) lines.push((await ability.applyChange({ op: "condition", slug: rider.target.slug, value: rider.target.value, target: "t0", duration: rider.target.duration }, state)) ?? `${state.targets[0].name}: ${rider.target.slug} ${rider.target.value}`);
            if (rider.self) lines.push((await ability.applyChange({ op: "condition", slug: rider.self.slug, value: rider.self.value, target: "source", duration: rider.self.duration }, state)) ?? `${actor.name}: ${rider.self.slug}${rider.self.value ? ` ${rider.self.value}` : ""}`);
            if (rider.self?.only) lines.push(`its extra action only to ${rider.self.only}`);
            // (A note Effect on the creature hit, its rules with it: Limning Gem's outline, an invisible creature only concealed — 2026-10-27.)
            if (rider.note && state.targets.length) lines.push((await ability.applyChange({ op: "effect", target: "t0", effect: { kind: "note", note: rider.note } }, state)) ?? `${state.targets[0].name}: ${rider.note.label}`);
        }
        if (lines.length) await ChatMessage.create({ content: `<p><strong>${escape(watch.item?.name ?? "Item")}</strong>: ${lines.map(escape).join("; ")}.</p>`, speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter((user) => user.isGM).map((user) => user.id) });
    }
}

// Hit Point damage a whetstone's weapon dealt, PF2e's damage-taken message (its origin the weapon, by its id): Leeching Fangs' healing for
// its user, half as much — to a living creature only; PF2e's healing stops at the maximum.
// (Or a note Effect on the creature it damages, Oil of Revelation's glowing wound for its minute — rider.note; once: the first creature only,
// the oil spent then, its watch Effect gone. 2026-10-27.)
export async function weaponDamageDealt(message) {
    if (!isActiveGM()) return;
    const flags = message?.flags?.pf2e;
    const applied = flags?.appliedDamage;
    if (flags?.context?.type !== "damage-taken" || !applied || applied.isHealing || applied.isReverted || !flags.origin?.actor || !flags.origin?.uuid) return;
    const actor = await fromUuid(flags.origin.actor).catch(() => null);
    const weaponId = String(flags.origin.uuid).split(".").at(-1);
    const watched = (actor?.itemTypes?.effect ?? []).filter((effect) => effect.flags?.[MODULE_ID]?.[WATCH_KEY]?.weapon?.id === weaponId);
    if (!watched.length) return;
    const target = await fromUuid(applied.uuid).catch(() => null);
    const dealt = (applied.updates ?? []).filter((update) => /^system\.attributes\.hp\.(?:value|temp)$/.test(update.path)).reduce((sum, update) => sum + Math.max(0, Number(update.value) || 0), 0);
    for (const effect of watched) {
        const watch = effect.flags[MODULE_ID][WATCH_KEY];
        for (const rider of (watch.riders ?? []).filter((entry) => entry.on.includes("dealt") && entry.heal)) {
            if (rider.living && target?.modeOfBeing !== "living") continue;
            const amount = Math.floor(dealt * rider.heal.fraction);
            if (amount < 1) continue;
            await actor.applyDamage({ damage: -amount, token: actor.getActiveTokens?.(true, true)?.[0] ?? undefined });
            await ChatMessage.create({ content: `<p><strong>${escape(watch.item?.name ?? "Item")}</strong>: ${escape(actor.name)} heals ${amount}, half the ${dealt} Hit Point damage dealt to ${escape(target?.name ?? "the creature")}.</p>`, speaker: ChatMessage.getSpeaker({ actor }), whisper: gmIds() });
        }
        let spent = false;
        for (const rider of (watch.riders ?? []).filter((entry) => entry.on.includes("dealt") && entry.note)) {
            if (dealt < 1 || !target?.createEmbeddedDocuments) continue;
            await target.createEmbeddedDocuments("Item", [itemNoteSource({ name: rider.note.label, words: rider.note.text.replace(/\.$/, ""), duration: rider.note.duration ?? null }, { item: watch.item ?? {}, user: watch.user ?? {}, worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null, moduleId: MODULE_ID })]);
            await ChatMessage.create({ content: `<p><strong>${escape(watch.item?.name ?? "Item")}</strong>: ${escape(target.name ?? "the creature")}: ${escape(rider.note.label)}${rider.once ? " (used up)" : ""}.</p>`, speaker: ChatMessage.getSpeaker({ actor }) });
            if (rider.once) spent = true;
        }
        if (spent) await actor.deleteEmbeddedDocuments("Item", [effect.id]);
    }
}

// Live play for what each of its user's melee attack rolls sets off while an item lasts (src/compiler/attack-riders.js, Martial Mayhem
// Mutagen's): Apply gives its user a watch Effect for the item's time; on the active GM's client, each melee attack roll by a creature with
// one applies the riders for the degree PF2e rolled — through the ability module's applyChange: the target off-guard to that creature's
// next attack (its scoped off-guard, the next attack at it spends it), a timed condition on the target or on the user.

import { attackRidersText } from "../src/compiler/attack-riders.js";
import { ABILITY_ID, MODULE_ID, isActiveGM } from "./foundry.js";

export const WATCH_KEY = "attackRiders";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

// The watch Effect on its user, for the item's time (unlimited with none).
export function attackRidersEffectSource(entry, { item = {}, user = {}, worldTime = 0, initiative = null } = {}) {
    const duration = entry.duration?.mode === "fixed" ? { value: entry.duration.value, unit: entry.duration.unit, expiry: entry.duration.expiry ?? "turn-start", sustained: false } : { value: -1, unit: "unlimited", expiry: null, sustained: false };
    return {
        name: `${item.name ?? "Item"}: melee attack riders`,
        type: "effect",
        img: item.img ?? "icons/svg/sword.svg",
        flags: { [MODULE_ID]: { [WATCH_KEY]: { riders: entry.riders, item: { name: item.name ?? null, uuid: item.uuid ?? null }, user } } },
        system: { description: { value: `<p>${escape(attackRidersText(entry.riders))}, from <strong>${escape(item.name ?? "the item")}</strong>.</p>` }, duration, start: { value: worldTime, initiative }, rules: [] }
    };
}

// A melee attack roll by a creature with a watch Effect: its riders for the degree rolled.
export async function attackRidersRolled(message) {
    if (!isActiveGM()) return;
    const context = message?.flags?.pf2e?.context;
    if (context?.type !== "attack-roll" || context.isReroll || !context.outcome) return;
    const actor = message.actor;
    const watches = (actor?.itemTypes?.effect ?? []).map((effect) => effect.flags?.[MODULE_ID]?.[WATCH_KEY]).filter(Boolean);
    if (!watches.length) return;
    const melee = (context.options ?? []).includes("item:melee");
    const ability = game.modules.get(ABILITY_ID)?.api?.live;
    const targetToken = context.target?.token ? await fromUuid(context.target.token).catch(() => null) : null;
    const sourceToken = message.token ?? actor.getActiveTokens?.(true, true)?.[0] ?? null;
    for (const watch of watches) {
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
        for (const rider of watch.riders ?? []) {
            if (!rider.on.includes(context.outcome) || (rider.melee && !melee) || (rider.own && !own)) continue;
            if (!ability?.applyChange) {
                lines.push(`${attackRidersText([rider])} (apply it by hand: the ability module isn't active)`);
                continue;
            }
            if (rider.offGuard && state.targets.length) lines.push((await ability.applyChange({ op: "condition", slug: "off-guard", value: null, target: "t0", duration: rider.offGuard.duration, scope: { attacker: "source", attacks: "any", uses: rider.offGuard.uses } }, state)) ?? `${state.targets[0].name} is off-guard to ${actor.name}'s next attack`);
            if (rider.targetModifier && state.targets.length) lines.push((await ability.applyChange({ op: "effect", target: "t0", effect: { kind: "modifier", modifier: rider.targetModifier } }, state)) ?? `${state.targets[0].name}: ${rider.targetModifier.value} feet to its Speeds`);
            if (rider.target && state.targets.length) lines.push((await ability.applyChange({ op: "condition", slug: rider.target.slug, value: rider.target.value, target: "t0", duration: rider.target.duration }, state)) ?? `${state.targets[0].name}: ${rider.target.slug} ${rider.target.value}`);
            if (rider.self) lines.push((await ability.applyChange({ op: "condition", slug: rider.self.slug, value: rider.self.value, target: "source", duration: rider.self.duration }, state)) ?? `${actor.name}: ${rider.self.slug} ${rider.self.value}`);
        }
        if (lines.length) await ChatMessage.create({ content: `<p><strong>${escape(watch.item?.name ?? "Item")}</strong>: ${lines.map(escape).join("; ")}.</p>`, speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter((user) => user.isGM).map((user) => user.id) });
    }
}

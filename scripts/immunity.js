// Live play for a temporary immunity after a use (src/compiler/immunity.js, plan.item.immunity) on the item module's own cards — an item card,
// a cast, a fortune, a reroll, a ways card, a counteract: before Apply, a creature it would go to that's already immune is refused (left out
// when others are targeted); after it, each creature it went to gets the "Immune:" Effect. The Effect is the ability module's own
// (src/live/auras.js immunityEffect, flagged under its id), so its save cards and zones, which hold to plan.trigger.immunity themselves,
// see the same one.

import { immunityEffect, isImmune } from "../../pf2e-automatic-ability-resolution/src/live/auras.js";
import { recipientOf } from "../src/live/card.js";
import { ABILITY_ID, MODULE_ID, stateOf } from "./foundry.js";

// (Kinds whose card holds to it some other way: a save at the creatures, the ability module's; a Strike's or a bomb's, theirs.)
const OWN_KINDS = new Set(["item", "cast", "fortune", "reroll", "ways", "counteract", "item-action", "toggle", "focus", "take"]);

const unexpired = (actor) => (actor?.itemTypes?.effect ?? []).filter((effect) => !effect.isExpired && !effect.system?.expired).map((effect) => effect.flags?.[ABILITY_ID]);
export const immuneNow = (actor, immunity) => Boolean(actor) && isImmune(unexpired(actor), { slug: immunity.slug, source: null });

// Who the card gives its item to: the creatures targeted (an item for allies, a cast at others, a bonus or reroll for another), the drinker
// picked, else its user → [{ actor, token, name, uuid }].
async function recipientsOf(state, choices) {
    const tokens = async (uuids) => (await Promise.all((uuids ?? []).map((uuid) => fromUuid(uuid).catch(() => null)))).filter((token) => token?.actor).map((token) => ({ actor: token.actor, token, name: token.name ?? token.actor.name, uuid: token.uuid }));
    const forOthers = (state.kind === "item" && state.plan?.item?.recipient === "targets") || (state.kind === "cast" && (choices.targets ?? []).length) || (state.kind === "fortune" && state.plan?.bonus?.recipient === "target") || (state.kind === "reroll" && ["companion", "target"].includes(state.plan?.reroll?.who));
    if (forOthers) return tokens(choices.targets);
    const entry = state.kind === "item" || state.kind === "cast" ? (Number.isInteger(choices.drinker) && state.drinkers?.[choices.drinker] ? state.drinkers[choices.drinker] : recipientOf(state)) : state.user;
    const token = entry?.tokenUuid ? await fromUuid(entry.tokenUuid).catch(() => null) : null;
    const actor = token?.actor ?? (entry?.actorUuid ? await fromUuid(entry.actorUuid).catch(() => null) : null);
    return actor ? [{ actor, token, name: entry.name ?? actor.name, uuid: token?.uuid ?? null }] : [];
}

// Its Effect on the creature.
async function grant(creature, immunity, state) {
    if (immuneNow(creature.actor, immunity)) return;
    const data = immunityEffect(ABILITY_ID, { ...immunity, against: "all" }, {
        ability: { name: state.item?.name ?? "Item", slug: immunity.slug, img: state.item?.img ?? null },
        source: { actorUuid: state.user?.actorUuid ?? null, name: state.user?.name ?? "" },
        time: { worldTime: game.time.worldTime, initiative: game.combat?.started ? game.combat.combatant?.initiative ?? null : null }
    });
    await creature.actor.createEmbeddedDocuments("Item", [{ ...data, flags: { ...data.flags, [MODULE_ID]: { immunity: immunity.slug } } }]);
}

// Around a card's Apply (run: the card's own): the immune refused or left out, then the Effect on each creature it went to → run's result.
export async function withImmunityGuard(message, state, choices, run) {
    const immunity = state?.plan?.item?.immunity;
    if (!immunity?.slug || !OWN_KINDS.has(state.kind)) return run(choices);
    const creatures = await recipientsOf(state, choices);
    const immune = creatures.filter((creature) => immuneNow(creature.actor, immunity));
    const time = `${immunity.duration.value} ${immunity.duration.value === 1 ? immunity.duration.unit.replace(/s$/, "") : immunity.duration.unit}`;
    if (creatures.length && immune.length === creatures.length) throw new Error(`${immune.map((creature) => creature.name).join(", ")} ${immune.length === 1 ? "is" : "are"} still immune to ${state.item?.name ?? "it"} (temporarily, ${time} from its last use).`);
    // (Several targeted, some immune: the rest only.)
    const given = immune.length ? { ...choices, targets: (choices.targets ?? []).filter((uuid) => !immune.some((creature) => creature.uuid === uuid)) } : choices;
    if (immune.length) ui.notifications?.warn?.(`${state.item?.name ?? "Item"}: ${immune.map((creature) => creature.name).join(", ")} still immune, left out.`);
    const before = JSON.stringify(stateOf(message));
    const done = await run(given);
    const now = game.messages?.get?.(message.id) ?? message;
    // (Only once it was applied: its card changed.)
    if (JSON.stringify(stateOf(now)) === before) return done;
    for (const creature of creatures.filter((one) => !immune.includes(one))) await grant(creature, immunity, state);
    return done;
}

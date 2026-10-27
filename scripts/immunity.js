// Live play for a temporary immunity after a use (src/compiler/immunity.js, plan.item.immunity) on the item module's own cards — an item card,
// a cast, a fortune, a reroll, a ways card, a counteract: before Apply, a creature it would go to that's already immune is refused (left out
// when others are targeted); after it, each creature it went to gets the "Immune:" Effect. The Effect is the ability module's own
// (src/live/auras.js immunityEffect, flagged under its id), so its save cards and zones, which hold to plan.trigger.immunity themselves,
// see the same one.

import { immunityEffect, isImmune } from "../../pf2e-automatic-ability-resolution/src/live/auras.js";
import { recipientOf } from "../src/live/card.js";
import { ABILITY_ID, MODULE_ID, isActiveGM, stateOf } from "./foundry.js";

// (Kinds whose card holds to it some other way: a save at the creatures, the ability module's; a Strike's or a bomb's, theirs.)
const OWN_KINDS = new Set(["item", "cast", "fortune", "reroll", "ways", "counteract", "item-action", "toggle", "focus", "take"]);

const unexpired = (actor) => (actor?.itemTypes?.effect ?? []).filter((effect) => !effect.isExpired && !effect.system?.expired).map((effect) => effect.flags?.[ABILITY_ID]);
export const immuneNow = (actor, immunity) => Boolean(actor) && isImmune(unexpired(actor), { slug: immunity.slug, source: null });

// Who the card gives its item to: the creatures targeted (an item for allies, a cast at others, a bonus or reroll for another), the drinker
// picked, else its user → [{ actor, token, name, uuid }].
async function recipientsOf(state, choices) {
    const tokens = async (uuids) => (await Promise.all((uuids ?? []).map((uuid) => fromUuid(uuid).catch(() => null)))).filter((token) => token?.actor).map((token) => ({ actor: token.actor, token, name: token.name ?? token.actor.name, uuid: token.uuid }));
    // (A skill action's at the creature targeted, Curled Cure Gel's on the creature treated: it, 2026-10-27.)
    // (Or an item card's for its user whose immunity is the creature targeted's, The Rakshasa's pledged follower: immunity.on "targets".)
    const forOthers = (state.kind === "item" && (state.plan?.item?.recipient === "targets" || state.plan?.item?.immunity?.on === "targets")) || (state.kind === "item-action" && Boolean(state.plan?.action?.targeted)) || (state.kind === "cast" && (choices.targets ?? []).length) || (state.kind === "fortune" && state.plan?.bonus?.recipient === "target") || (state.kind === "reroll" && ["companion", "target"].includes(state.plan?.reroll?.who));
    if (forOthers) return tokens(choices.targets);
    // (A counteract card's creature picked, Contagion Metabolizer's drinker: the one its find step is given, then the one it found on — 2026-10-27.)
    const picked = (list, at) => (Number.isInteger(at) && list?.[at] ? list[at] : null);
    const entry = state.kind === "item" || state.kind === "cast" ? picked(state.drinkers, choices.drinker) ?? recipientOf(state)
        : state.kind === "counteract" ? picked(state.drinkers, choices.drinker) ?? picked(state.drinkers, state.drinker) ?? state.user : state.user;
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
    // (One with no end of its own, Tteokguk of Time Advancement's "until the next lunar new year": unlimited, its words saying when it ends.)
    const open = immunity.duration?.unit === "unlimited";
    const system = open ? { ...data.system, duration: { value: -1, unit: "unlimited", expiry: null, sustained: false }, description: { value: `${data.system.description.value}<p>It ends at ${immunity.duration.until ?? "the GM's word"} (remove it then).</p>` } } : data.system;
    await creature.actor.createEmbeddedDocuments("Item", [{ ...data, system, flags: { ...data.flags, [MODULE_ID]: { immunity: immunity.slug } } }]);
}

// Its time in words: "24 hours", "until the next lunar new year".
const timeWords = (duration) => (duration.unit === "unlimited" ? `until ${duration.until ?? "the GM ends it"}` : `${duration.value} ${duration.value === 1 ? duration.unit.replace(/s$/, "") : duration.unit} from its last use`);

// Around a card's Apply (run: the card's own): the immune refused or left out, then the Effect on each creature it went to → run's result.
export async function withImmunityGuard(message, state, choices, run) {
    // (Or a skill action's own, Curled Cure Gel's: plan.action.immunity, src/compiler/item-actions.js.)
    // (A counteract card's, Flame Navette's one a day and Contagion Metabolizer's hour: its plan's, kept on the card as it's posted — it holds
    // no plan, scripts/counteract.js — 2026-10-27.)
    const immunity = state?.plan?.item?.immunity ?? (state?.kind === "item-action" ? state.plan?.action?.immunity : state?.kind === "counteract" ? state.immunity : null);
    if (!immunity?.slug || !OWN_KINDS.has(state.kind)) return run(choices);
    const creatures = await recipientsOf(state, choices);
    const immune = creatures.filter((creature) => immuneNow(creature.actor, immunity));
    const time = timeWords(immunity.duration);
    if (creatures.length && immune.length === creatures.length) throw new Error(`${immune.map((creature) => creature.name).join(", ")} ${immune.length === 1 ? "is" : "are"} still immune to ${state.item?.name ?? "it"} (temporarily, ${time}).`);
    // (Several targeted, some immune: the rest only.)
    const given = immune.length ? { ...choices, targets: (choices.targets ?? []).filter((uuid) => !immune.some((creature) => creature.uuid === uuid)) } : choices;
    if (immune.length) ui.notifications?.warn?.(`${state.item?.name ?? "Item"}: ${immune.map((creature) => creature.name).join(", ")} still immune, left out.`);
    const before = JSON.stringify(stateOf(message));
    const done = await run(given);
    const now = game.messages?.get?.(message.id) ?? message;
    // (Only once it was applied: its card changed.)
    if (JSON.stringify(stateOf(now)) === before) return done;
    // (And for a card whose Apply can leave it open, only once it isn't: a skill action's check cancelled or refused — PF2e's Treat Wounds by an
    // untrained medic —, a counteract card's first step, finding what's there; its second, once applied, gives it — 2026-10-27.)
    if (["item-action", "counteract"].includes(state.kind) && stateOf(now)?.status === "open") return done;
    // (From when its Effect ends, Starsong Nectar's: that Effect carries it, setUpImmunityAfter.)
    if (immunity.after) return done;
    for (const creature of creatures.filter((one) => !immune.includes(one))) await grant(creature, immunity, state);
    return done;
}

// (An item card's Effect flagged immunityAfter, gone — expired or deleted —: its creature's "Immune:" Effect from then, on the active GM's client.)
export function setUpImmunityAfter() {
    Hooks.on("deleteItem", (item) => {
        const immunity = item?.type === "effect" ? item.flags?.[MODULE_ID]?.immunityAfter : null;
        if (!immunity?.slug || !item.parent || !isActiveGM()) return;
        const { after, ...held } = immunity;
        const name = String(item.name ?? "").replace(/^Effect:\s*/, "");
        grant({ actor: item.parent }, held, { item: { name, img: item.img ?? null }, user: { actorUuid: item.system?.context?.origin?.actor ?? null, name: "" } }).catch((error) => console.error(`${MODULE_ID} | immunity after`, error));
    });
}

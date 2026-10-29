// Damage each round around an item's user for a while, and a blast as it ends (2026-10-27, src/compiler/relic-readings.js plan.item.pulse):
// Aroden's Hearthstone's 4d6 cold each round to every creature within a mile — its user too — for 1 minute, then 25d6 fire to every
// creature within 150 feet. { formula, type, radius, own, lasts, then: { formula, type, radius, own } }: the ability module's card of that
// damage (no roll against it) at every creature within the radius as it's used and at the start of each of its user's turns while it
// lasts, then the blast's card once its time is up (scripts/pulse.js).
// (2026-10-28, the installed modules' Tears of Shizuru: a pulse of cards of its own — pulse.plan, a save card in place of the damage, at
// pulse.who's creatures ("foes" or "allies" of its user, every creature when none), and pulse.also { plan, who }, a second card at the same
// time —, for so many of its user's turns' starts after the first (pulse.ticks, counted in place of its time, which then only ends it out
// of an encounter), its words pulse.words.) Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const SECONDS = { rounds: 6, minutes: 60, hours: 3600, days: 86_400 };
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [] });

// The damage's own plan: the check family with no roll, its damage shared.
export function pulseDamagePlan({ formula, type, radius, name }) {
    return {
        modelVersion: MODEL_VERSION,
        source: { name },
        automation: { level: "automatic" },
        targeting: { target: `every creature within ${radius} feet`, range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, sharedDamage: { rollOnce: true, components: [{ id: "0", formula: `${formula}[${type}]`, type, category: null }] }, outcomes: { criticalSuccess: none(), success: { damage: { mode: "shared", multiplier: 1, sourceComponentIds: ["0"] }, effects: [] }, failure: none(), criticalFailure: none() } }
    };
}

// Its cards for one step, each with whom it's at: [{ plan, who }] — its damage's plan, or its own plans named for the step.
export function pulseCards(pulse, name) {
    if (!pulse?.plan) return [{ plan: pulseDamagePlan({ ...pulse, name }), who: pulse?.who ?? null }];
    return [pulse, ...(pulse.also?.plan ? [pulse.also] : [])].map((entry) => ({ plan: { ...entry.plan, source: { ...(entry.plan.source ?? {}), name } }, who: entry.who ?? null }));
}

// Whether a creature is one its cards are for: who "foes" (not its user's ally), "allies" (its user's), else any.
export const pulseFits = (who, allied) => (who === "foes" ? !allied : who === "allies" ? allied : true);

// What's kept on its user while it lasts: { item, uuid, pulse, endsAt, ticksLeft? } (endsAt: the world time it ends at; a counted pulse's
// a round past its last turn's start).
export function pulseFlag(pulse, { item = {}, worldTime = 0 } = {}) {
    const counted = Number.isInteger(pulse?.ticks);
    const seconds = counted ? (pulse.ticks + 1) * SECONDS.rounds : (Number(pulse?.lasts?.value) || 0) * (SECONDS[pulse?.lasts?.unit] ?? 60);
    return { item: item.name ?? null, uuid: item.uuid ?? null, pulse, endsAt: (Number(worldTime) || 0) + seconds, ...(counted ? { ticksLeft: pulse.ticks } : {}) };
}

// At the start of its user's turn: "tick" while it lasts (a counted one while it has turns left), "blast" once its time is up (its blast,
// or nothing more: "end").
export function pulseStep(flag, worldTime) {
    const timely = (Number(worldTime) || 0) < (Number(flag?.endsAt) || 0);
    const lasting = Number.isInteger(flag?.ticksLeft) ? flag.ticksLeft > 0 && timely : timely;
    return lasting ? "tick" : flag?.pulse?.then ? "blast" : "end";
}

// In words: "4d6 cold damage to every creature within 5280 feet (its user too) each round for 1 minute, then 25d6 fire damage to every creature
// within 150 feet".
export function pulseText(pulse) {
    if (pulse.words) return pulse.words;
    const each = `${pulse.formula} ${pulse.type} damage to every creature within ${pulse.radius} feet${pulse.own ? " (its user too)" : ""} each round for ${pulse.lasts.value} ${pulse.lasts.value === 1 ? pulse.lasts.unit.replace(/s$/, "") : pulse.lasts.unit}`;
    return pulse.then ? `${each}, then ${pulse.then.formula} ${pulse.then.type} damage to every creature within ${pulse.then.radius} feet${pulse.then.own ? " (its user too)" : ""}` : each;
}

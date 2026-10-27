// Damage beside where its caster was and where it arrives (2026-10-27, docs/needs.md): Fiendish Teleportation's "You cast dimension door. The
// space you leave and the one you appear in are filled with the scent of brimstone, dealing 2d6 spirit damage to creatures adjacent to both
// spaces." → plan.castArrival { plan }: once its user's token has moved after the cast (scripts/cast-arrival.js, as Charlatan's Cape's smoke
// waits for it), the ability module's card of that damage — no roll against it — at every other creature adjacent to the space it left or the
// one it arrived in, each once. "Both spaces": each of them, since a creature beside both is rare after a teleport. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const BRIMSTONE = /^The space you leave and the one you appear in are filled with the scent of brimstone, dealing (\d+d\d+) (\w+) damage to creatures adjacent to both spaces\.$/i;
const said = (note) => String(typeof note === "string" ? note : note?.text ?? "").trim();
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [] });

// The damage's own plan: the check family with no roll, its damage shared.
export function arrivalDamagePlan({ formula, type, name }) {
    return {
        modelVersion: MODEL_VERSION,
        source: { name: `${name}: brimstone` },
        automation: { level: "automatic" },
        targeting: { target: "each creature adjacent to the space its user left or arrived in", range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, sharedDamage: { rollOnce: true, components: [{ id: "0", formula, type, category: null }] }, outcomes: { criticalSuccess: none(), success: { damage: { mode: "shared", multiplier: 1, sourceComponentIds: ["0"] }, effects: [] }, failure: none(), criticalFailure: none() } }
    };
}

// The cast's plan → the plan with castArrival, or the same plan.
export function withCastArrival(plan) {
    if (plan?.builtin !== "cast-spell") return plan;
    const notes = plan.notes ?? [];
    const brimstone = notes.map((note) => [note, BRIMSTONE.exec(said(note))]).find(([, match]) => match);
    if (!brimstone) return plan;
    // (Its flavor before the cast, "You recite a subclause of your contract regarding change in venue": nothing to play.)
    const left = notes.filter((note) => note !== brimstone[0] && !/^You recite a subclause of your contract regarding change in venue\.$/i.test(said(note)));
    const { notes: _, ...rest } = plan;
    return {
        ...rest,
        ...(left.length ? { notes: left } : {}),
        castArrival: { plan: arrivalDamagePlan({ formula: brimstone[1][1], type: brimstone[1][2].toLowerCase(), name: plan.source?.name ?? "The item" }), words: `${brimstone[1][1]} ${brimstone[1][2].toLowerCase()} damage to each creature next to the space it leaves or the one it arrives in` },
        ...(plan.partial && !left.length && !(plan.unread ?? []).length ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {})
    };
}

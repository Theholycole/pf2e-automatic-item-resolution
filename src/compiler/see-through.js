// Seeing illusions and polymorphs as they are, for a while (2026-10-27, docs/needs.md): Scope of Truth's Reveal All, "For the next 10 minutes,
// you can see things through the scope as they actually are. The GM rolls a secret counteract check with a +20 counteract modifier and a
// counteract rank of 7 against any illusion or polymorph effect in the area, but only for the purpose of determining whether you see through it,
// not to end the spell or effect." Each check is the GM's secret roll against what its user looks at, so the card gives no counteract card:
// words on its user's Effect for the 10 minutes, with the modifier and rank the GM rolls with (the user's note-Effect rule). Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const REVEAL = /\bFor the next (\d+) minutes, you can see things through the scope as they actually are\. The GM rolls a secret counteract check with an? (?:\[\[\/br 1d20\+(\d+)[^\]]*\]\](?:\{[^}]*\})?|\+(\d+)) counteract modifier and a counteract rank of (\d+) against any illusion or polymorph effect in the area, but only for the purpose of determining whether you see through it, not to end the spell or effect\. For instance, if the check succeeds against a polymorph spell, you can see the creature's true form, but you don't end the spell\./i;
const row = (noteEffects) => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects });

// The activation's plan (the GM's no-effect), its html, the item and its activation → its user's Effect, or the same plan.
export function withSeeThrough(plan, html, { item = null, activation = null } = {}) {
    const reveal = plan?.builtin === "no-effect" ? REVEAL.exec(String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")) : null;
    if (!reveal) return plan;
    const [minutes, modifier, rank] = [Number(reveal[1]), Number(reveal[2] ?? reveal[3]), Number(reveal[4])];
    const text = `Through the scope it sees things as they are: against each illusion or polymorph effect in what it looks at, the GM rolls a secret counteract check (+${modifier}, rank ${rank}), only to see through it, not to end it — a success against a polymorph shows the creature's true form.`;
    const { builtin, gm, ...rest } = plan;
    return {
        modelVersion: MODEL_VERSION,
        source: { name: `${item?.name ?? "The item"}${activation?.name ? `: ${activation.name}` : ""}`, slug: item?.system?.slug ?? null, uuid: item?.uuid ?? null, type: item?.type ?? null },
        rank: 1,
        traits: [...(item?.system?.traits?.value ?? [])],
        activation: { time: activation?.time ?? null, traits: activation?.traits ?? [] },
        ...rest,
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { ...(plan.trigger ?? {}), event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: row([{ label: "Seeing true", text, duration: { mode: "fixed", value: minutes, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } }]) } }
    };
}

// A disguise its wearer keeps until it's dismissed (2026-10-27, docs/needs.md): Sinister Knight's "With a thought, the wearer activates a
// disguise. … While in the disguise, the wearer is always considered to be taking precautions against lifesense, and even a creature that
// successfully notices the wearer with its lifesense mistakes the wearer for an undead unless it critically succeeds at its Perception check or
// the wearer critically fails a Deception or Stealth check. Finally, while in the disguise, the rune attempts to counteract any effects that
// would reveal your alignment; on a successful counteract check, … the rune causes the effect to perceive your alignment as evil … The wearer can
// Dismiss the disguise, and if the wearer's armor is removed, the disguise deactivates automatically." PF2e can't play how others sense its
// wearer: words on its Effect until it's dismissed (no end of its own; its wearer removes it, or the armor's removal does). The counteract
// gives no modifier: its level's DC less 10, and half its level as its rank (the user's answer to question 5, 2026-10-26), the GM's to
// change. What reveals an alignment is information, the GM's to tell. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";

const DISGUISE = /\bWith a thought, the wearer activates a disguise\. While the sinister knight armor's disguise is active, any identifying insignia or aesthetic of the armor is replaced by generic malevolent aesthetics such as spikes or demonic faces\. While in the disguise, the wearer is always considered to be taking precautions against lifesense, and even a creature that successfully notices the wearer with its lifesense mistakes the wearer for an undead unless it critically succeeds at its Perception check or the wearer critically fails a Deception or Stealth check\. Finally, while in the disguise, the rune attempts to counteract any effects that would reveal your alignment; on a successful counteract check, rather than negate the effect, the rune causes the effect to perceive your alignment as evil \(maintaining any lawful or chaotic component of your alignment\)\. The wearer can Dismiss the disguise, and if the wearer's armor is removed, the disguise deactivates automatically\./i;
// GM Core's DCs by level, 0 to 25 (as src/compiler/counteract.js has them).
const LEVEL_DCS = [14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46, 48, 50];
const row = (noteEffects) => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects });

// The activation's plan (the GM's no-effect), its html, the item and its activation → its wearer's Effect, or the same plan.
export function withDisguiseWords(plan, html, { item = null, activation = null } = {}) {
    if (plan?.builtin !== "no-effect" || !DISGUISE.test(String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "))) return plan;
    const level = Math.max(0, Math.min(25, Number(item?.system?.level?.value) || 0));
    const modifier = LEVEL_DCS[level] - 10;
    const rank = Math.max(1, Math.ceil(level / 2));
    const text = `Its armor's insignia hidden under spikes and demonic faces. It counts as taking precautions against lifesense, and a creature that notices it with lifesense takes it for an undead unless that creature critically succeeds at its Perception check or the wearer critically fails a Deception or Stealth check. Against any effect that would reveal its alignment, the rune attempts to counteract it (+${modifier}, rank ${rank}: the item gives none, so its level's DC less 10 — the GM may change it); if it succeeds, the effect perceives the wearer's alignment as evil (keeping any lawful or chaotic part). It lasts until the wearer Dismisses it or its armor is removed.`;
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
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: row([{ label: "Sinister disguise", text, duration: null }]) } },
        notes: ["Its wearer Dismisses it, or takes off the armor: remove its Effect."]
    };
}

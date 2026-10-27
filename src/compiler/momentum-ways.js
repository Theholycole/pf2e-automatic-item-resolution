// One of two effects by the actions spent, the 1-action one a Strike's (2026-10-27, docs/needs.md "Changes to a Strike"): Horned Hand Rests'
// "Activate 1 or 2 … with an effect depending on how many actions you spent. 1 Your legchair draws force from its momentum. Until the end of
// this turn, if your legchair Strides, it deals 2d6 additional force damage on its next Strike and, on a critical success, pushes the target
// away by 5 feet. 2 Your legchair fires a beam of force from its ram horns …" — the 2 actions' beam: 4d6 force damage with a Fortitude save.
// The ability compiler reads the 2 actions' beam, its save card, leaving the 1 action's words a note: the ways card's two ways — the 1
// action's the next Strike this turn of the one that has the hand rests (the legchair, its wearer: the Strike card, scripts/strikes.js) with
// those dice and the critical hit's push, its Stride first its own; the 2 actions' the beam's save. Pure.

// (Its opening flavor, "Your legchair draws force from its momentum.", may be gone from the note: the ability compiler's.)
const MOMENTUM = /^(?:Your [\w ]+? draws force from its momentum\. )?Until the end of this turn, if your ([\w ]+?) Strides, it deals (\d+)d(\d+) additional (\w+) damage on its next Strike and, on a critical success, pushes the target away by (\d+) feet\.$/i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// The plan (the beam's save, the momentum its note) and the activation's html → the ways card, or the same plan.
export function withMomentumWays(plan, html) {
    if (plan?.resolution?.kind !== "save" || plan.builtin || !/<strong>\s*Activate\s*<\/strong>\s*<span class="action-glyph">1<\/span>\s*or\s*<span class="action-glyph">2<\/span>/i.test(String(html ?? ""))) return plan;
    const note = (plan.notes ?? []).map((entry) => [entry, MOMENTUM.exec(String(entry).trim())]).find(([, match]) => match);
    if (!note || (plan.notes ?? []).length !== 1 || (plan.unread ?? []).length) return plan;
    const [, who, count, faces, type, feet] = note[1];
    const { notes: _notes, partial: _partial, ...beam } = plan;
    const strike = {
        ...beam,
        automation: { level: "automatic" },
        activation: { ...(beam.activation ?? {}), time: "1" },
        targeting: { target: "the creature the Strike hits", range: null, area: null },
        trigger: { ...(plan.trigger ?? {}), event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
        resolution: {
            kind: "save",
            check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } },
            outcomes: { criticalSuccess: { ...none(), forcedMovement: { kind: "push", distance: Number(feet), upTo: false, optional: false, direction: "away" } }, success: none(), failure: none(), criticalFailure: none() }
        },
        strike: { range: null, save: null, damage: [{ diceNumber: Number(count), dieSize: `d${faces}`, category: null, damageType: type.toLowerCase() }], attack: null, alteration: null, own: false, unarmed: false, uses: 1, until: "turn-end", missKeeps: false, hit: false, notes: [], lines: [`The ${who.toLowerCase()}'s next Strike this turn, once it has Strided (its own Stride first; use it from the ${who.toLowerCase()}'s sheet)`] }
    };
    return {
        ...beam,
        builtin: "ways",
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { ...(plan.trigger ?? {}), event: "use" },
        ways: [
            { name: "1 action: momentum", html: `<p>${note[0]}</p>`, plan: strike },
            { name: "2 actions: the beam", plan: { ...beam, automation: { level: "automatic" }, activation: { ...(beam.activation ?? {}), time: "2" } } }
        ]
    };
}

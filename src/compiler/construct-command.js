// A construct's mind overridden as Command would (2026-10-28, docs/needs.md "immunity"): Inventors+'s Construct Controller, a drive put into
// a construct's weak point, its Will save with a Command spell's effects, and a day's immunity to the drive for one that succeeds. Before, it
// was the spell module's cast of Command, which can't tell the item which creatures succeeded. Now its own save card (the ability module's):
// the item's DC, Command's rows as note Effects on the creature until the end of its next turn — the first action of that turn spent obeying
// on a failure, all of them on a critical failure, no Delay nor reactions until it has (PF2e's Command: approach, run away as if Fleeing,
// release what it holds, drop Prone or stand in place, its user's order, a line) —, the immunity on its successes (src/compiler/immunity.js,
// trigger.immunity), and no card for a creature without the construct trait (plan.ifTarget lacks, immune). Pure.

import { withImmunity } from "./immunity.js";

const OVERRIDES = /^You insert the drive into\s+a weak point in a creature\s+with the (\w+) trait, overriding its mind\.$/;
const COMMANDED = /^The creature must attempt\s+@Check\[type:(will|fortitude|reflex)\|dc:(\d+)\|basic:false\]\s+with the same effects as a\s+@Compendium\[pf2e\.spells-srd\.aIHY2DArKFweIrpf\]\{Command\} spell\.$/;
const FLAVOR = /^This small, cuboid drive\b/;
const none = (noteEffects = []) => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects });
const UNTIL_NEXT_TURN_END = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" };
const ORDERS = "approach its user, run away (as if Fleeing), release what it's holding, drop Prone, or stand in place";
const commanded = (label, text) => [{ label, text, duration: UNTIL_NEXT_TURN_END }];

// The plan read before (the cast), its item's plain text and html, its base → the save card, or the same plan.
export function withConstructCommand(plan, { text, html, base } = {}) {
    if (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Command") return plan;
    const sentences = String(text ?? "").replace(/^\s*Activate\b.*?\((?:manipulate)\)\s+/, "").split(/(?<=[.!?])\s+(?=[A-Z@])/).map((sentence) => sentence.trim()).filter(Boolean);
    const [flavor, inserted, attempt, immune, ...more] = sentences;
    const kind = OVERRIDES.exec(inserted ?? "");
    const save = COMMANDED.exec(attempt ?? "");
    if (more.length || !FLAVOR.test(flavor ?? "") || !kind || !save || !/\bimmune\b/.test(immune ?? "")) return plan;
    const trait = kind[1].toLowerCase();
    const card = {
        ...(base ?? {}),
        source: { ...(base?.source ?? {}), name: plan.source?.name ?? base?.source?.name },
        traits: [...new Set([...(base?.traits ?? []), "mental"])],
        automation: { level: "automatic" },
        targeting: { target: `1 adjacent creature with the ${trait} trait`, range: "touch", area: null },
        trigger: { event: "use" },
        resolution: {
            kind: "save",
            check: { roll: "save", statistic: save[1], basic: false, against: { dc: "fixed", value: Number(save[2]) } },
            sharedDamage: null,
            outcomes: {
                criticalSuccess: none(),
                success: none(),
                failure: none(commanded("Commanded", `Its user's command (${ORDERS}): it uses the first action of its next turn to obey, and can't Delay or use reactions until it has.`)),
                criticalFailure: none(commanded("Commanded", `Its user's command (${ORDERS}): it uses all its actions on its next turn to obey, and can't Delay or use reactions until it has.`))
            }
        },
        ifTarget: [{ traits: [trait], lacks: true, immune: true }],
        item: plan.item,
        notes: [immune],
        partial: true
    };
    // (Its day's immunity on the successes: the ability module's trigger.immunity, by degree — its sentence read, or the cast as it was.)
    const held = withImmunity(card, html, { name: plan.source?.name ?? base?.source?.name });
    // (Its reader counts the rows' note Effects as left: held partial, so the card's own check.)
    if (!held.trigger?.immunity || (held.notes ?? []).length || (held.unread ?? []).length) return plan;
    const { partial, ...whole } = held;
    return { ...whole, notes: [`Its user picks the command as the drive goes in: ${ORDERS}.`, `Only a creature with the ${trait} trait can be overridden: any other gets no card.`] };
}

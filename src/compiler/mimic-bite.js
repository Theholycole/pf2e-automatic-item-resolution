// A disguised creature that bites later (2026-10-28, docs/needs.md "reader"): Alchemists+'s Mimic Melange, whose bottle becomes a mimic
// looking like an object of its user's choice for an hour (a Perception DC to see it for what it is), which bites the closest creature once,
// for a basic Reflex save against piercing damage, when a creature stays beside it for over a round or handles it — then dissolves. Before,
// its words were one note. Now the item card marks the hour on its user (a note Effect) with its lines — where it's put, the Perception DC the
// GM asks for —, and the bite is its later save card (plan.again, later: scripts/live.js), kept until it bites: pressed at the closest
// creature then. Its unclosed damage link is read as its dice. Pure.

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });
const shared = (multiplier) => ({ damage: { mode: multiplier ? "shared" : "none", multiplier, sourceComponentIds: multiplier ? ["0"] : [] }, effects: [] });
const COUNT = { one: 1, an: 1, a: 1 };

// Its sentences, in order, after the bottle's looks.
const MORPHS = /^When opened, an? [\w' -]+? will morph into\s+a mimic of a common\s+manufactured object of your choosing\.$/;
const HIDES = /^It does not function as\s+the object, but will remain for (\d+|one|an?) (hours?|minutes?)\s+as it hides in plain sight\s+\(@Check\[perception\|dc:(\d+)\]\s*check\)\.$/;
const BITES = /^While in this state,\s+if a creature spends\s+more than 1 round\s+adjacent to the mimic\s+or a creature interacts with it,\s+it immediately bites the closest target\s+dealing @Damage\[(\d+d\d+(?:\+\d+)?)\[(\w+)\]\]?\s*damage\s+\(@Check\[reflex\|dc:(\d+)\|basic\]\s*save\)\s+before dissolving\.$/;
const CRAFT = /^Craft Requirements\b/;

// The plan read before (its words a note), its item's plain text and base → the card with its bite for later, or the same plan.
export function withMimicBite(plan, text, base) {
    if (!plan?.noteOnly || plan.again) return plan;
    const sentences = String(text ?? "").replace(/^\s*Activate\b.*?\bInteract\s+/, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    const at = sentences.findIndex((sentence) => MORPHS.test(sentence));
    const hides = HIDES.exec(sentences[at + 1] ?? "");
    const bites = BITES.exec(sentences[at + 2] ?? "");
    // (Every sentence read: the bottle's looks before, the crafting after.)
    if (at !== 1 || !hides || !bites || !sentences.slice(at + 3).every((sentence) => CRAFT.test(sentence) || /^Supply the corpse\b/.test(sentence))) return plan;
    const unit = hides[2].toLowerCase().replace(/s?$/, "s");
    const hours = { mode: "fixed", value: COUNT[hides[1].toLowerCase()] ?? Number(hides[1]), unit, expiry: "turn-start", anchor: "effect-start" };
    const time = `${hours.value} ${hours.value === 1 ? unit.replace(/s$/, "") : unit}`;
    const bite = {
        ...(base ?? {}),
        source: { ...(base?.source ?? plan.source), name: `${plan.source?.name ?? "Mimic"}: Bite` },
        automation: { level: "automatic" },
        targeting: { target: "the closest creature", range: null, area: null },
        trigger: { event: "use" },
        resolution: {
            kind: "save",
            check: { roll: "save", statistic: "reflex", basic: true, against: { dc: "fixed", value: Number(bites[3]) } },
            sharedDamage: { rollOnce: true, components: [{ id: "0", formula: `${bites[1]}[${bites[2].toLowerCase()}]`, type: null, category: null }] },
            outcomes: { criticalSuccess: shared(0), success: shared(0.5), failure: shared(1), criticalFailure: shared(2) }
        }
    };
    const { noteOnly, partial, ...rest } = plan;
    return {
        ...rest,
        automation: { ...(plan.automation ?? {}), level: "automatic" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), noteEffects: [{ label: "Its mimic", text: `Its mimic is out, looking like a common manufactured object of its choice (it doesn't work as one), for ${time} or until it bites.`, duration: hours }] } } },
        notes: [
            `Put the mimic where it's opened: it stays ${time}, looking like the object its user chose.`,
            `A creature that looks it over sees it for a mimic with a DC ${hides[3]} Perception check (the GM asks for it).`,
            "It bites once, then dissolves: when a creature has stayed beside it for more than a round, or one handles it, press its bite card at the closest creature."
        ],
        again: { plan: bite, later: true, when: "a creature stays beside the mimic over a round or handles it: at the closest creature, then it dissolves" }
    };
}

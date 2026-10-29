// A ray its user aims with their own attack roll whose hit calls for a save (2026-10-28, docs/needs.md "strike"): Miniaturization Device's
// ranged attack as a simple weapon (its user's Dexterity and simple weapon proficiency: ownCheck.choose "simple-ranged", scripts/poisons.js
// attackChoices) against the target's AC, then the Fortitude save its hit calls for — the exposure card's second step (plan.thenSave, as a
// thrown item's: src/compiler/thrown.js) at the creature hit, an incapacitation effect. A critical hit makes that save one degree worse: the
// second step's box (plan.thenCritical "worse": its rows one degree down, src/live/poison-card.js worseSave). Its rows: reach shorter for a
// minute (words on the creature's note Effect: PF2e keeps a creature's reach on each Strike), and a size or two smaller too, at least Tiny
// (PF2e's CreatureSize), an hour on a critical failure. A willing creature it needn't attack, its pick of the degree: lines of the card. Pure.

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const timed = (value, unit) => ({ mode: "fixed", value, unit: /^h/i.test(unit) ? "hours" : "minutes", expiry: "turn-start", anchor: "effect-start" });

const ATTACK = /\bMake a ranged attack roll,\s+treating the [\w' -]+? as a simple\s+weapon for the purposes of proficiency\./;
const HIT = /\bOn a hit, the target must\s+attempt (?:an? )?(?:@Check\[(?:type:)?(fortitude|reflex|will)\b[^\]]*\]|(?:DC \d+ )?(Fortitude|Reflex|Will)\b)/i;
const CRITICAL = /\bOn a critical hit, treat the\s+save result as one degree worse\./;
const WILLING = /\bYou can choose to target a\s+willing creature, and if you do\b[^.]*\bof their choice\./;
const UNAFFECTED = /\bCritical Success The target\s+is unaffected\./;
const SUCCESS = /\bSuccess The target reduces its\s+reach by (\d+) feet to a minimum\s+of (\d+) feet of reach for (\d+) (minutes?|hours?)\./;
const FAILURE = /\bFailure As success, except the\s+target reduces its reach by (\d+) feet\s+and becomes one size category smaller\s+to a minimum size of (Tiny|Small)\./;
const CRITICAL_FAILURE = /\bCritical Failure As failure, except\s+the target becomes two size\s+categories smaller and the duration is (\d+) (hours?|minutes?)\./;
const INCAPACITATION = /\bThis is an incapacitation effect\./;

export function withAttackThenSave(plan, { kind, text }) {
    if (kind !== "consumable" || !plan?.partial || plan.ownCheck || plan.thenSave || plan.resolution?.kind !== "save" || plan.resolution.check?.against?.dc !== "fixed") return plan;
    const words = String(text ?? "");
    const [attack, hit, critical, willing, unaffected, success, failure, worst] = [ATTACK, HIT, CRITICAL, WILLING, UNAFFECTED, SUCCESS, FAILURE, CRITICAL_FAILURE].map((pattern) => pattern.exec(words));
    if (!attack || !hit || !critical || !willing || !unaffected || !success || !failure || !worst || (hit[1] ?? hit[2]).toLowerCase() !== plan.resolution.check.statistic) return plan;
    const minimum = Number(success[2]);
    const lasts = timed(Number(success[3]), success[4]);
    const longest = timed(Number(worst[1]), worst[2]);
    const reach = (feet) => `its reach ${feet} feet shorter (${minimum} feet at least)`;
    const smaller = (steps, duration) => ({ label: "Shrunken", text: `It's ${steps === 1 ? "a size" : "two sizes"} smaller (${failure[2]} at least), ${reach(Number(failure[1]))}.`, duration, rules: [{ key: "CreatureSize", value: -steps, minimumSize: failure[2].toLowerCase(), resizeEquipment: true }] });
    const outcomes = {
        criticalSuccess: none(),
        success: { ...none(), noteEffects: [{ label: "Shortened reach", text: `It has ${reach(Number(success[1]))}.`, duration: lasts }] },
        failure: { ...none(), noteEffects: [smaller(1, lasts)] },
        criticalFailure: { ...none(), noteEffects: [smaller(2, longest)] }
    };
    const traits = [...new Set([...(plan.traits ?? []), ...(INCAPACITATION.test(words) ? ["incapacitation"] : [])])];
    const thenSave = { ...plan, partial: undefined, traits, automation: { level: "automatic" }, trigger: { event: "use" }, targeting: { target: "the creature hit", range: null, area: null }, resolution: { ...plan.resolution, outcomes } };
    delete thenSave.partial;
    const next = {
        ...plan,
        automation: { level: "automatic" },
        targeting: { target: "1 creature", range: null, area: null },
        trigger: { event: "use" },
        ownCheck: { kind: "attack", modifier: null, choose: ["simple-ranged"] },
        resolution: { kind: "check", check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" }, modifier: null }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
        thenSave,
        thenCritical: "worse",
        notes: ["At a willing creature there's no attack roll, and it picks the degree it gets."]
    };
    delete next.partial;
    return next;
}

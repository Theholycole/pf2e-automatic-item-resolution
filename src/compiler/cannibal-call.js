// A rage whose creatures change while it lasts (2026-10-27, docs/needs.md): Horn of the Aoyin's Cannibal Call, "Creatures other than you in a
// 60-foot emanation must attempt a DC 30 Will save. Those who fail become overwhelmed with an animalistic rage and the urge to consume flesh for 1
// round, or 1 minute on a critical failure. They indiscriminately attack the nearest target unaffected by the magic of the horn … While affected,
// they gain a jaws unarmed attack that deals 1d8 piercing damage, deal an additional 2 damage with unarmed attacks, and lose the ability to use any
// weaponry. They also gain a +2 status bonus to saving throws against mental effects, can detect bleeding creatures and open wounds as an
// imprecise sense with a range of 30 feet, and gain a +10-foot status bonus to their Speed. Lastly, they take a –1 penalty to AC and are unable to
// use concentrate actions other than Seeking. Creatures who critically succeed are temporarily immune for 24 hours." The ability compiler read it
// as a note. Now the save card at the creatures in the emanation: the failure's and the critical failure's note Effect for their time, with
// PF2e's rules for what PF2e can play — the jaws Strike, +2 damage on unarmed Strikes, +2 status to saves against mental effects, the
// imprecise bloodsense 30 feet, +10 feet status to Speed, –1 to AC — and the rest (whom it attacks, no weapons, no concentrate actions but Seek)
// in its words, a behaviour beside those rules; the critical success's 24 hours' immunity (src/compiler/immunity.js reads it). Its
// incapacitation: the ability module's save card's, from the plan's traits — PF2e's own degree change at the horn's level (ability 79db4dd). Pure.

import { plainText } from "./rows.js";
import { withImmunity } from "./immunity.js";

const CALL = /\bCreatures other than you in an? (?:@Template\[(?:type:)?emanation\|distance:(\d+)\](?:\{[^}]*\})?|(\d+)-foot emanation) must attempt an? (?:@Check\[will\|dc:(\d+)[^\]]*\](?:\{[^}]*\})? save|DC (\d+) Will save)\. Those who fail become overwhelmed with an animalistic rage and the urge to consume flesh for (\d+) rounds?, or (\d+) minutes? on a critical failure\. They indiscriminately attack the nearest target unaffected by the magic of the horn unless there are no such targets, at which point they set on each other\. While affected, they gain a jaws unarmed attack that deals (\d+)d(\d+) (piercing) damage, deal an additional (\d+) damage with unarmed attacks, and lose the ability to use any weaponry\. They also gain a \+(\d+) status bonus to saving throws against mental effects, can detect bleeding creatures and open wounds as an imprecise sense with a range of (\d+) feet, and gain a \+(\d+)-foot status bonus to their Speed\. Lastly, they take a [–-](\d+) penalty to AC and are unable to use concentrate actions other than Seeking\./i;
const OWNER = /\bIf the horn of the aoyin's owner doesn't use the instrument's activation on sapient creatures at least once a day, the horn of the aoyin activates at some point of its own choosing on the owner, and the owner critically fails with no saving throw\./i;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] });

// The rage's note Effect for a time.
function rageNote(read, duration, label) {
    const [dice, die, type, extra, save, range, speed, ac] = read;
    return {
        label,
        text: `Overwhelmed with an animalistic rage and the urge to eat flesh: it attacks the nearest creature the horn didn't affect (if none, those it did), can't use weapons, and can't use concentrate actions other than Seek. Its jaws deal ${dice}d${die} ${type}, its unarmed attacks ${extra} more damage; +${save} status to saves against mental effects; it senses bleeding creatures and open wounds (imprecise, ${range} feet); +${speed} feet status to its Speed; –${ac} to AC.`,
        duration,
        rules: [
            { key: "Strike", category: "unarmed", group: "brawling", damage: { base: { damageType: type, dice: Number(dice), die: `d${die}` } }, label: "Jaws", slug: "aoyin-jaws", traits: ["unarmed"] },
            { key: "FlatModifier", selector: "strike-damage", value: Number(extra), predicate: ["item:category:unarmed"], label },
            { key: "FlatModifier", selector: "saving-throw", type: "status", value: Number(save), predicate: ["item:trait:mental"], label },
            { key: "Sense", selector: "bloodsense", acuity: "imprecise", range: Number(range) },
            { key: "FlatModifier", selector: "land-speed", type: "status", value: Number(speed), label },
            { key: "FlatModifier", selector: "ac", value: -Number(ac), label }
        ]
    };
}

// The activation's plan (its text's note) and html, and the item's whole html → the save card's plan, or the same plan.
export function withCannibalCall(plan, html, itemHtml = "") {
    const call = CALL.exec(String(html ?? ""));
    if (!call || !plan || plan.builtin || plan.resolution?.kind === "save") return plan;
    const feet = Number(call[1] ?? call[2]);
    const dc = Number(call[3] ?? call[4]);
    const read = call.slice(7, 15);
    const label = "Cannibal Call";
    const round = { mode: "fixed", value: Number(call[5]), unit: "rounds", expiry: "turn-start", anchor: "effect-start" };
    const minute = { mode: "fixed", value: Number(call[6]), unit: "minutes", expiry: "turn-start", anchor: "effect-start" };
    const { noteOnly, partial, unread, ...rest } = plan;
    const traits = [...new Set([...(plan.traits ?? []), ...(plan.activation?.traits ?? [])])];
    return withImmunity({
        ...rest,
        traits,
        automation: { level: "automatic" },
        targeting: { target: "creatures other than you in the emanation", range: null, area: { type: "emanation", value: feet } },
        resolution: {
            kind: "save",
            check: { roll: "save", statistic: "will", basic: false, against: { dc: "fixed", value: dc } },
            outcomes: { criticalSuccess: none(), success: none(), failure: { ...none(), noteEffects: [rageNote(read, round, label)] }, criticalFailure: { ...none(), noteEffects: [rageNote(read, minute, label)] } }
        },
        notes: [
            ...(plan.notes ?? []),
            ...(OWNER.test(plainText(itemHtml)) ? ["If its owner doesn't use it on sapient creatures at least once a day, the horn activates on them at a time of its own choosing (the GM's): they critically fail, with no save."] : [])
        ]
    }, html, { name: plan.source?.name });
}

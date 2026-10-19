// What each of its user's melee attack rolls sets off while the item lasts, Martial Mayhem Mutagen's: "When you succeed at a melee
// attack roll, the target is off-guard to your next attack roll against it before the start of your next turn", "When you critically
// succeed at a melee attack roll, the target is also Clumsy 1 until the beginning of your next turn" (Major), "When you fail at a melee
// attack roll, you are Clumsy 1 until the end of your next turn". plan.item.attackRiders: [{ on, melee, offGuard?, target?, self? }] — live
// play gives its user a watch Effect for the item's time, and each melee attack roll's degree then applies its rows (scripts/attack-riders.js:
// the ability module's off-guard to one creature's next attack, its timed conditions). Pure.

import { plainText } from "./rows.js";

const LINK = String.raw`(?:@UUID\[[^\]]*\]\{)?`;
const SUCCEED = /\bWhen you succeed at a melee attack roll, the target is off-guard to your next attack roll against it before the start of your next turn\./i;
const CRITICAL = new RegExp(String.raw`\bWhen you critically succeed at a melee attack roll, the target is also ${LINK}(Clumsy|Enfeebled|Frightened|Stupefied) (\d)\}? until the (?:beginning|start) of your next turn\.`, "i");
const FAIL = new RegExp(String.raw`\bWhen you fail at a melee attack roll, you are ${LINK}(Clumsy|Enfeebled|Frightened|Stupefied) (\d)\}? until the end of your next turn\.`, "i");

const START = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" };
const END = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };

// (Its own Strikes only, the item's, for a while: Silkspinner's Shield's "Successful shield bash Strikes made with the silkspinner's shield
// during this time entangle the target in silk. The target takes a –10-foot circumstance penalty to its Speeds for 1 round. If your Strike
// was a critical hit, the target becomes Immobilized for 1 round instead." — own: the shield's Strikes, by its id; the Escape a note.)
const OWN_BASH = new RegExp(String.raw`\bSuccessful shield bash Strikes made with the [\w' -]+? during this time [^.]*\.\s*The target takes an? [–-](\d+)-foot (circumstance|status) penalty to its Speeds for (\d+) rounds?\.\s*If your Strike was a critical hit, the target becomes ${LINK}(Immobilized|Grabbed|Prone)\}? for (\d+) rounds? instead\.`, "i");

// The item's html → { riders, said } (the sentences read), or null.
export function readAttackRiders(html) {
    const text = String(html ?? "");
    const riders = [];
    const said = [];
    const extra = [];
    const bash = OWN_BASH.exec(text);
    if (bash) {
        const rounds = (count) => ({ mode: "fixed", value: Number(count), unit: "rounds", expiry: "turn-start", anchor: "effect-start" });
        riders.push({ on: ["success"], own: true, targetModifier: { selector: "all-speeds", value: -Number(bash[1]), type: bash[2].toLowerCase(), duration: rounds(bash[3]) } });
        riders.push({ on: ["criticalSuccess"], own: true, target: { slug: bash[4].toLowerCase(), value: null, duration: rounds(bash[5]) } });
        said.push(...bash[0].split(/(?<=\.)\s+(?=[A-Z])/));
        // (Its Escape, the GM's: a note on the card.)
        const escape = /\bRegardless, the target can attempt to Escape \(DC (\d+)\) to end the effect early\./i.exec(text);
        if (escape) extra.push(`The struck creature can Escape (DC ${escape[1]}) to end it early (by hand).`);
    }
    const succeed = SUCCEED.exec(text);
    if (succeed) {
        riders.push({ on: ["success", "criticalSuccess"], melee: true, offGuard: { uses: 1, duration: START } });
        said.push(succeed[0]);
    }
    const critical = CRITICAL.exec(text);
    if (critical) {
        riders.push({ on: ["criticalSuccess"], melee: true, target: { slug: critical[1].toLowerCase(), value: Number(critical[2]), duration: START } });
        said.push(critical[0]);
    }
    const fail = FAIL.exec(text);
    if (fail) {
        riders.push({ on: ["failure", "criticalFailure"], melee: true, self: { slug: fail[1].toLowerCase(), value: Number(fail[2]), duration: END } });
        said.push(fail[0]);
    }
    return riders.length ? { riders, said, notes: extra } : null;
}

// The riders in words, for the card: "On a melee hit: the target off-guard to your next attack before your next turn; On a melee
// miss: you are clumsy 1, till your next turn ends".
export function attackRidersText(riders) {
    const parts = (riders ?? []).map((rider) => {
        const when = rider.on.includes("success") ? "a melee hit" : rider.on.includes("criticalSuccess") ? "a melee critical hit" : "a melee miss";
        const with_ = rider.own ? " with the item" : "";
        if (rider.offGuard) return `On ${when}: the target off-guard to your next attack before your next turn`;
        if (rider.targetModifier) return `On a hit${with_}: the target ${rider.targetModifier.value} feet to its Speeds for ${rider.targetModifier.duration.value} round${rider.targetModifier.duration.value === 1 ? "" : "s"}`;
        if (rider.target && rider.target.value === null) return `On a critical hit${with_}: the target ${rider.target.slug} for ${rider.target.duration.value} round${rider.target.duration.value === 1 ? "" : "s"} instead`;
        if (rider.target) return `On ${when}: the target ${rider.target.slug} ${rider.target.value} until your next turn`;
        return `On ${when}: you are ${rider.self.slug} ${rider.self.value}, till your next turn ends`;
    });
    return parts.join("; ");
}

// The plan with plan.item.attackRiders { riders, duration } (the item's own time: its modifiers', else its Effects', else the riders'
// sentence's "for 1 minute"), those sentences no longer notes — or the same plan.
export function withAttackRiders(plan, html) {
    const read = plan?.item && (plan.resolution || plan.builtin) ? readAttackRiders(html) : null;
    if (!read) return plan;
    const said = read.said.map((sentence) => plainText(`<p>${sentence}</p>`).trim());
    const kept = (list) => (list ?? []).filter((sentence) => !said.some((one) => String(sentence).includes(one) || one.includes(String(sentence).trim())));
    const unread = kept(plan.unread);
    const notes = [...kept(plan.notes), ...(read.notes ?? [])];
    const success = plan.resolution?.outcomes?.success ?? {};
    const lasting = /\bfor (\d+) (minutes?|hours?|rounds?)\b/i.exec(plainText(html));
    const duration = [...(success.modifiers ?? []), ...(success.effects ?? [])].map((entry) => entry.duration).find((time) => time?.mode === "fixed")
        ?? (lasting ? { mode: "fixed", value: Number(lasting[1]), unit: /^min/i.test(lasting[2]) ? "minutes" : /^hour/i.test(lasting[2]) ? "hours" : "rounds", expiry: "turn-start", anchor: "effect-start" } : null);
    return { ...plan, item: { ...plan.item, attackRiders: { riders: read.riders, duration } }, ...(plan.unread ? { unread } : {}), ...(plan.notes || notes.length ? { notes: notes.length ? notes : undefined } : {}), ...(plan.partial && !unread.length && !notes.length ? { partial: undefined } : {}) };
}

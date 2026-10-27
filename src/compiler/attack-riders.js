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

// (A whetstone's weapon, the one its user picks on the card — rider.weapon: Frenzied Quintessence's "After a successful Strike with a
// weapon enhanced by frenzied quintessence, you are Quickened for 1 round. You can use the additional action only to Stride toward a foe
// or Strike." (its user Quickened on each hit, the action's limit a note), Analysis Eye's "The first time you succeed at a Strike
// against a given creature with a weapon under the effect of an analysis eye, as a free action, you learn one weakness or resistance of
// that creature; if the creature has multiple weaknesses or resistances, the GM selects which one you learn." (once a creature: its
// weaknesses and resistances whispered to the GM, who tells one), Leeching Fangs' "Whenever you deal Hit Point damage to a living
// creature with a weapon under the effect of leeching fangs, you heal yourself half the amount of Hit Point damage dealt" (on "dealt":
// PF2e's damage-taken message, not the attack roll).)
const TREATED = String.raw`with a weapon (?:enhanced by|under the effects? of|affected by) (?:an? )?[\w' -]+?`;
const QUICKENED = new RegExp(String.raw`\bAfter a successful Strike ${TREATED}, you are ${LINK}Quickened\}? for 1 round\.(?:\s*You can use the (?:additional|extra) action only to ([^.]+)\.)?`, "i");
const LEARN = new RegExp(String.raw`\bThe first time you succeed at a Strike against a given creature ${TREATED}, as a free action, you learn one weakness or resistance of that creature; if the creature has multiple weaknesses or resistances, the GM selects which one you learn\.`, "i");
const LEECH = new RegExp(String.raw`\bWhenever you deal Hit Point damage to a living creature ${TREATED}, you heal yourself half the amount of Hit Point damage dealt\.(?:\s*This cannot heal you above your maximum number of Hit Points\.)?`, "i");

// (Or what the weapon does on its own Strikes while it lasts, PF2e's rules on that weapon — rider.rules: Pinpoint Arrowhead's "When you attempt
// a ranged Strike with a weapon under the effect of a pinpoint arrowhead, you treat any cover the target has as one degree less": its ranged
// Strikes +1 against a target in lesser or standard cover and +2 in greater, as the target's AC one degree of cover lower would be — each
// its own slug, as PF2e keeps one modifier of a slug (found live), 2026-10-27.)
const PINPOINT = new RegExp(String.raw`\bWhen you attempt a ranged Strike ${TREATED}, you treat any cover the target has as one degree less(?: \(for example, treat standard cover as lesser cover, and lesser cover as no cover\))?\.`, "i");
// (Or only its user's own action with it, Windstep Sheath's "When you use the Quick Draw feat with a weapon under the effect of a windstep
// sheath, you can also Step as part of that action, either immediately before or after your Strike": the watch Effect's words, no rule.)
const WINDSTEP = new RegExp(String.raw`\bWhen you use the ${LINK}Quick Draw\}? feat ${TREATED}, you can also Step as part of that action, either immediately before or after your Strike\.`, "i");
const COVER_LESS = [
    { key: "FlatModifier", selector: "strike-attack-roll", value: 1, slug: "cover-one-degree-less", label: "Cover one degree less", predicate: ["item:ranged", { or: ["target:cover-level:lesser", "target:cover-level:standard"] }] },
    { key: "FlatModifier", selector: "strike-attack-roll", value: 2, slug: "greater-cover-one-degree-less", label: "Cover one degree less", predicate: ["item:ranged", { or: ["target:cover-level:greater", "target:cover-level:greater-prone"] }] }
];

// The item's html → { riders, said } (the sentences read), or null.
export function readAttackRiders(html) {
    const text = String(html ?? "").replace(/<\/?(?:em|i|strong|b)>/g, "");
    const riders = [];
    const said = [];
    const extra = [];
    const quickened = QUICKENED.exec(text);
    if (quickened) {
        riders.push({ on: ["success", "criticalSuccess"], weapon: true, self: { slug: "quickened", value: null, duration: END, only: quickened[1] ?? null } });
        // (The extra action's limit is its user's to keep: a note, as Quickened Standard's.)
        const [first, ...limit] = quickened[0].split(/(?<=\.)\s+(?=[A-Z])/);
        said.push(first);
        extra.push(...limit);
    }
    const learn = LEARN.exec(text);
    if (learn) {
        riders.push({ on: ["success", "criticalSuccess"], weapon: true, learn: { once: "creature" } });
        said.push(learn[0]);
    }
    const leech = LEECH.exec(text);
    if (leech) {
        riders.push({ on: ["dealt"], weapon: true, living: true, heal: { fraction: 0.5 } });
        said.push(...leech[0].split(/(?<=\.)\s+(?=[A-Z])/));
    }
    const windstep = WINDSTEP.exec(text);
    if (windstep) {
        riders.push({ on: [], weapon: true, rules: [], words: "Quick Draw with it may also Step, just before or after the Strike (its own action)" });
        said.push(windstep[0]);
    }
    const pinpoint = PINPOINT.exec(text);
    if (pinpoint) {
        riders.push({ on: [], weapon: true, rules: COVER_LESS, words: "its ranged Strikes treat the target's cover as one degree less" });
        said.push(pinpoint[0]);
    }
    const bash = OWN_BASH.exec(text);
    if (bash) {
        // (Its Escape, "Regardless, the target can attempt to Escape (DC 30) to end the effect early": the penalty's and the condition's
        // escape { dc }, the ability module's — a successful Escape against it ends them, 2026-10-25.)
        const escapeDC = /\bRegardless, the target can attempt to Escape \(DC (\d+)\) to end the effect early\./i.exec(text);
        const escape = escapeDC ? { escape: { dc: Number(escapeDC[1]) } } : {};
        const rounds = (count) => ({ mode: "fixed", value: Number(count), unit: "rounds", expiry: "turn-start", anchor: "effect-start", ...escape });
        riders.push({ on: ["success"], own: true, targetModifier: { selector: "all-speeds", value: -Number(bash[1]), type: bash[2].toLowerCase(), duration: rounds(bash[3]), ...escape } });
        riders.push({ on: ["criticalSuccess"], own: true, target: { slug: bash[4].toLowerCase(), value: null, duration: rounds(bash[5]) } });
        said.push(...bash[0].split(/(?<=\.)\s+(?=[A-Z])/));
        if (escapeDC) said.push(escapeDC[0]);
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
// (A whetstone's: "On a hit with the weapon picked: you are quickened for 1 round (its extra action only to Stride toward a foe or Strike)".)
export function attackRidersText(riders, weaponName = null) {
    const parts = (riders ?? []).map((rider) => {
        const weapon = weaponName ?? "the weapon picked";
        if (rider.weapon && rider.heal) return `Hit Point damage ${weapon} deals to a living creature heals you half as much`;
        if (rider.weapon && rider.rules) return `With ${weapon}: ${rider.words}`;
        if (rider.weapon && rider.learn) return `On the first hit with ${weapon} at each creature: one of its weaknesses or resistances, whispered to the GM to tell you`;
        if (rider.weapon && rider.self) return `On a hit with ${weapon}: you are ${rider.self.slug}${rider.self.value ? ` ${rider.self.value}` : ""} for 1 round${rider.self.only ? ` (its extra action only to ${rider.self.only})` : ""}`;
        const when = rider.on.includes("success") ? "a melee hit" : rider.on.includes("criticalSuccess") ? "a melee critical hit" : "a melee miss";
        const with_ = rider.own ? " with the item" : "";
        if (rider.offGuard) return `On ${when}: the target off-guard to your next attack before your next turn`;
        const escapes = (escape) => (Number(escape?.dc) > 0 ? ` (a successful Escape, DC ${Number(escape.dc)}, ends it)` : "");
        if (rider.targetModifier) return `On a hit${with_}: the target ${rider.targetModifier.value} feet to its Speeds for ${rider.targetModifier.duration.value} round${rider.targetModifier.duration.value === 1 ? "" : "s"}${escapes(rider.targetModifier.escape)}`;
        if (rider.target && rider.target.value === null) return `On a critical hit${with_}: the target ${rider.target.slug} for ${rider.target.duration.value} round${rider.target.duration.value === 1 ? "" : "s"} instead${escapes(rider.target.duration.escape)}`;
        if (rider.target) return `On ${when}: the target ${rider.target.slug} ${rider.target.value} until your next turn`;
        return `On ${when}: you are ${rider.self.slug} ${rider.self.value}, till your next turn ends`;
    });
    return parts.join("; ");
}

// The plan with plan.item.attackRiders { riders, duration } (the item's own time: its modifiers', else its Effects', else the text's
// "for 1 minute" outside the riders' sentences, else a whetstone's 1 minute — PF2e's own Effects for whetstones that state no time last
// that long: Mighty Counterweight's, Phasing Trine's), those sentences no longer notes — or the same plan.
export function withAttackRiders(plan, html) {
    const read = plan?.item && (plan.resolution || plan.builtin) ? readAttackRiders(html) : null;
    if (!read) return plan;
    const said = read.said.map((sentence) => plainText(`<p>${sentence}</p>`).trim());
    const kept = (list) => (list ?? []).filter((sentence) => !said.some((one) => String(sentence).includes(one) || one.includes(String(sentence).trim())));
    const unread = kept(plan.unread);
    const notes = [...kept(plan.notes), ...(read.notes ?? [])];
    const success = plan.resolution?.outcomes?.success ?? {};
    const tight = (words) => String(words).replace(/\s+([,.;:])/g, "$1");
    const rest = said.reduce((plain, sentence) => plain.replace(tight(sentence), " "), tight(plainText(html)));
    const lasting = /\bfor (\d+) (minutes?|hours?|rounds?)\b/i.exec(rest);
    const whetstone = read.riders.some((rider) => rider.weapon) ? { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } : null;
    const duration = [...(success.modifiers ?? []), ...(success.effects ?? [])].map((entry) => entry.duration).find((time) => time?.mode === "fixed")
        ?? (lasting ? { mode: "fixed", value: Number(lasting[1]), unit: /^min/i.test(lasting[2]) ? "minutes" : /^hour/i.test(lasting[2]) ? "hours" : "rounds", expiry: "turn-start", anchor: "effect-start" } : whetstone);
    return { ...plan, item: { ...plan.item, attackRiders: { riders: read.riders, duration } }, ...(plan.unread ? { unread } : {}), ...(plan.notes || notes.length ? { notes: notes.length ? notes : undefined } : {}), ...(plan.partial && !unread.length && !notes.length ? { partial: undefined } : {}), ...(read.notes?.length ? { partial: true } : {}) };
}

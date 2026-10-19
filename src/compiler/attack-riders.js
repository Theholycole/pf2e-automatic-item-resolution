// What each of its user's melee attack rolls sets off while the item lasts, Martial Mayhem Mutagen's: "When you succeed at a melee
// attack roll, the target is off-guard to your next attack roll against it before the start of your next turn", "When you critically
// succeed at a melee attack roll, the target is also Clumsy 1 until the beginning of your next turn" (Major), "When you fail at a melee
// attack roll, you are Clumsy 1 until the end of your next turn". plan.item.attackRiders: [{ on, melee, offGuard?, target?, self? }] — live
// play gives its user a watch Effect for the item's time, and each melee attack roll's degree then applies its rows (scripts/attack-riders.js:
// the ability module's off-guard to one creature's next attack, its timed conditions). Pure.

const LINK = String.raw`(?:@UUID\[[^\]]*\]\{)?`;
const SUCCEED = /\bWhen you succeed at a melee attack roll, the target is off-guard to your next attack roll against it before the start of your next turn\./i;
const CRITICAL = new RegExp(String.raw`\bWhen you critically succeed at a melee attack roll, the target is also ${LINK}(Clumsy|Enfeebled|Frightened|Stupefied) (\d)\}? until the (?:beginning|start) of your next turn\.`, "i");
const FAIL = new RegExp(String.raw`\bWhen you fail at a melee attack roll, you are ${LINK}(Clumsy|Enfeebled|Frightened|Stupefied) (\d)\}? until the end of your next turn\.`, "i");

const START = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" };
const END = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };

// The item's html → { riders, said } (the sentences read), or null.
export function readAttackRiders(html) {
    const text = String(html ?? "");
    const riders = [];
    const said = [];
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
    return riders.length ? { riders, said } : null;
}

// The riders in words, for the card: "On a melee hit: the target off-guard to your next attack before your next turn; On a melee
// miss: you are clumsy 1, till your next turn ends".
export function attackRidersText(riders) {
    const parts = (riders ?? []).map((rider) => {
        const when = rider.on.includes("success") ? "a melee hit" : rider.on.includes("criticalSuccess") ? "a melee critical hit" : "a melee miss";
        if (rider.offGuard) return `On ${when}: the target off-guard to your next attack before your next turn`;
        if (rider.target) return `On ${when}: the target ${rider.target.slug} ${rider.target.value} until your next turn`;
        return `On ${when}: you are ${rider.self.slug} ${rider.self.value}, till your next turn ends`;
    });
    return parts.join("; ");
}

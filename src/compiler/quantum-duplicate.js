// A duplicate of its user for downtime, its loyalty the GM's secret roll (2026-10-28, docs/needs.md "reader", out of combat): Inventors+'s
// Quantum Duplicator, a duplicate of its user from another reality for 24 hours — an NPC with its personality and goals, 1 Hit Point,
// failing every save, Fleeing whenever it's in danger — doing downtime as its user would, what it learnt its user's once it stands on the
// platform after; the GM's secret flat check as it's activated, a failure making it evil (working against its user, what it passes on maybe
// corrupted). Before, all of it was one note. Now the whispered card (plan.builtin "whisper", scripts/live.js postWhisper): its words to the
// GM and its user, the secret flat check rolled for the GM alone (whisper.flat { dc, success, failure }); and a note Effect on its user for
// the 24 hours (plan.userEffects kind "note"), the duplicate's rules on it, as The Carnival's whisper has its Stupefied. Pure.

const COUNT = { one: 1, a: 1, an: 1 };
const DUPLICATE = /^When activated, this creates an NPC\s+with your exact personality and goals\s+that lasts for (\d+) (hours?)\.$/;
const FRAIL = /^Because of their transplanar nature,\s+they cannot overwork themselves\s*-\s*they have 1 Hit Point,\s+automatically fail any saves\s+they would make, and gain the\s+@Compendium\[pf2e\.conditionitems\.\w+\]\{Fleeing\} condition\s+if they are ever in danger\.$/;
const DOWNTIME = /^You can perform downtime activities\s+with your duplicate\s+as if it were you,\s+gaining the knowledge and benefits\s+of its activities when you stand\s+on the platform\s+after the duration has expired\.$/;
const SECRET = /^When you Activate the gadget,\s+the GM rolls a secret\s+@Check\[type:flat\|dc:(\d+)\|[^\]]*\]\.$/;
const EVIL = /^On a failure, the duplicate is evil,\s+and will secretly work against you\s+and the knowledge transferred\s+from the platform may be corrupted\.$/;
const FLAVOR = /^By twisting the dials and knobs\b/;

// The plan read before (its words a note) and its item's plain text → the whispered card with its note Effect, or the same plan.
export function withQuantumDuplicate(plan, text) {
    if (!plan?.noteOnly) return plan;
    const sentences = String(text ?? "").replace(/^\s*Activate\b.*?\bInteract\s+/, "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
    const [flavor, made, frail, downtime, secret, evil, ...more] = sentences;
    const lasts = DUPLICATE.exec(made ?? "");
    const flat = SECRET.exec(secret ?? "");
    if (more.length || !FLAVOR.test(flavor ?? "") || !lasts || !FRAIL.test(frail ?? "") || !DOWNTIME.test(downtime ?? "") || !flat || !EVIL.test(evil ?? "")) return plan;
    const hours = COUNT[lasts[1]] ?? Number(lasts[1]);
    const duration = { mode: "fixed", value: hours, unit: "hours", expiry: "turn-start", anchor: "effect-start" };
    const rules = `The duplicate has 1 Hit Point, automatically fails every save it attempts, and becomes Fleeing whenever it's in danger.`;
    const { noteOnly, partial, resolution, ...rest } = plan;
    return {
        ...rest,
        builtin: "whisper",
        automation: { ...(plan.automation ?? {}), level: "automatic" },
        targeting: { target: null, range: null, area: null },
        trigger: { ...(plan.trigger ?? {}), event: "use" },
        whisper: {
            text: `A duplicate of its user from another reality appears for ${hours} hours: an NPC with its personality and goals (the GM plays it). ${rules} It can do downtime activities as its user would; standing on the platform once the ${hours} hours are up, its user gains what it learnt and the benefits of what it did.`,
            flat: { dc: Number(flat[1]), success: "the duplicate is true to its user", failure: "The duplicate is evil: it works against its user in secret, and what it passes on from the platform may be corrupted (the GM's)." }
        },
        userEffects: [...(plan.userEffects ?? []), { kind: "note", label: "Quantum duplicate", text: `Its duplicate from another reality is out for ${hours} hours, doing downtime as it would. ${rules} Once the time is up, it stands on the platform to gain what the duplicate learnt and did.`, duration }]
    };
}

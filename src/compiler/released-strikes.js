// A creature let out of a third-party alchemical flask that Strikes once at its own modifier (src/compiler/own-checks.js reads the attack),
// its other words read here (2026-10-28, docs/needs.md "strike"):
// - Manticore Matrass: its spikes at one creature (40 feet) or two (within 20 feet of it and of one another) — the exposure card's pick of the two
//   (plan.checkChoices, as Twisting Twine's maneuvers): at one, both spikes in one Strike whose hit also pins it, Immobilized until it gets free
//   (an Escape, or Forcing Open the spike) at the item's DC; at two, a spike's Strike at each, both at its modifier.
// - Cucrubit of Krooth: its jaws' deadly die on a critical hit (ownCheck.deadly, as a thrown weapon's: src/compiler/thrown.js), and the tooth
//   its hit leaves — persistent bleed and Drained 1 on that creature, and a note Effect for what the tooth stops and how it's taken out
//   (Administer First Aid or Force Open at the item's DC, which ends the Drained, not the bleed).
// Its look, its arrival and its dissolving are flavor; where it moves is the map's, a line. Pure.

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const done = (plan) => {
    const next = { ...plan, automation: { ...(plan.automation ?? {}), level: "automatic" } };
    delete next.partial;
    return next;
};
// (Its sentences, each read or flavor: every note must be one of these, else the plan stays as it was.)
const readAll = (notes, patterns) => {
    const found = {};
    for (const note of notes) {
        const entry = Object.entries(patterns).find(([, pattern]) => pattern.test(note));
        if (!entry) return null;
        found[entry[0]] = entry[1].exec(note);
    }
    return found;
};

const MANTICORE = {
    look: /^\s*Activate Interact Inside this\s+long flask\b/,
    arrives: /^\s*When you Activate it, a\s+Large manticore emerges\.$/,
    volley: /^\s*The manticore quickly\s+shoots out a volley\b[^.]*\.$/,
    targets: /^\s*It can choose to target either\s+one creature within (\d+) feet or\s+two creatures within (\d+) feet\s+of it and each other\.$/,
    two: /^\s*If the manticore targets\s+two different creatures, the manticore\s+makes a separate Strike against each;[^.]*\bmultiple attack penalty\b[^.]*\.$/,
    one: /^\s*If the manticore flings\s+both spikes at the same\s+creature, it makes a single Strike\.$/,
    pinned: /^\s*If the attack hits, it deals\s+the damage of a single spike,\s+but the target is pinned in place,\s+rendering it Immobilized until it\s+Escapes or Forces Open the spike\s+\(either option is DC (\d+)\)\.$/,
    gone: /^\s*Afterwards, the manticore dissolves\b[^.]*\.$/
};
function withManticore(plan) {
    if (plan?.ownCheck?.kind !== "attack" || plan.checkChoices || !plan.partial || (plan.unread ?? []).length || plan.resolution?.check?.statistic !== "attack") return plan;
    const read = readAll((plan.notes ?? []).map(said), MANTICORE);
    if (!read?.targets || !read.pinned || !read.one || !read.two) return plan;
    const [, near, far] = read.targets;
    const dc = Number(read.pinned[1]);
    const pinned = { kind: "condition", slug: "immobilized", value: null, duration: { mode: "until-escape", escape: { dc } } };
    const rows = plan.resolution.outcomes;
    const one = { ...plan.resolution, outcomes: { ...rows, criticalSuccess: { ...rows.criticalSuccess, effects: [...(rows.criticalSuccess?.effects ?? []), pinned] }, success: { ...rows.success, effects: [...(rows.success?.effects ?? []), pinned] } } };
    const modifier = plan.resolution.check.modifier;
    return done({
        ...plan,
        targeting: { ...(plan.targeting ?? {}), target: "1 creature, or 2 creatures" },
        resolution: one,
        checkChoices: [
            { label: `Both spikes at one creature within ${near} feet: pinned on a hit`, resolution: one },
            { label: `A spike at each of two creatures within ${far} feet of it and of each other`, resolution: plan.resolution }
        ],
        notes: [
            `At two creatures, each spike's Strike is at +${modifier} (they count as one attack for its multiple attack penalty).`,
            `Pinned: Immobilized until it Escapes (DC ${dc}); Forcing Open the spike at that DC frees it as well.`
        ]
    });
}

const KROOTH = {
    look: /^\s*Activate Interact A scaled horror\b[^.]*\.$/,
    arrives: /^\s*When Activated, a Large ([a-z]+) appears\.$/,
    tooth: /^\s*The creature takes (\d+d\d+) bleed damage\s+and is Drained (\d+)\.$/,
    unhealed: /^\s*Neither can be healed while\s+the tooth remains\.$/,
    removal: /^\s*Removing the tooth safely requires\s+a successful check to Administer\s+First Aid or to Force Open\s+\(either option is DC (\d+)\)\.$/,
    instead: /^\s*Instead of ending bleeding or\s+stabilizing, this removes the tooth\s+and the drained condition, but\b[^.]*\bbleed damage\.$/
};
// (Its move to its target before its Strike, and its jaws' deadly die, read from the whole text.)
const MOVES = /\bIt (Strides(?: or (?:Swims|Climbs|Flies))?) up to (\d+) feet, and then Strikes\b/;
const DEADLY = /\bdeadly (d\d+)\b/i;
function withKrooth(plan, text) {
    if (plan?.ownCheck?.kind !== "attack" || !plan.partial || (plan.unread ?? []).length || plan.resolution?.check?.statistic !== "attack") return plan;
    const read = readAll((plan.notes ?? []).map(said), KROOTH);
    if (!read?.tooth || !read.unhealed || !read.removal || !read.instead) return plan;
    const [component] = plan.resolution.sharedDamage?.components ?? [];
    if (!component) return plan;
    const deadly = DEADLY.exec(text)?.[1] ?? null;
    const moves = MOVES.exec(text);
    const dc = Number(read.removal[1]);
    const components = [component, ...(deadly ? [{ id: "deadly", formula: `1${deadly}`, type: component.type, category: null }] : []), { id: "bleed", formula: read.tooth[1], type: "bleed", category: "persistent" }];
    const tooth = { label: "Tooth lodged", text: `A tooth is lodged in it: its bleed and its Drained can't be healed while it stays. Taking the tooth out needs a DC ${dc} success at Administer First Aid or at Force Open (in place of what that action usually does): it ends the Drained, not the bleed.`, duration: null };
    const hit = (multiplier) => ({
        ...none(),
        damage: { mode: "shared", multiplier, sourceComponentIds: ["0", ...(deadly && multiplier === 2 ? ["deadly"] : []), "bleed"], componentMultipliers: { bleed: 1, ...(deadly && multiplier === 2 ? { deadly: 1 } : {}) } },
        effects: [{ kind: "condition", slug: "drained", value: Number(read.tooth[2]), duration: null }],
        noteEffects: [tooth]
    });
    return done({
        ...plan,
        ownCheck: { ...plan.ownCheck, ...(deadly ? { deadly } : {}) },
        resolution: { ...plan.resolution, sharedDamage: { rollOnce: true, components }, outcomes: { criticalSuccess: hit(2), success: hit(1), failure: none(), criticalFailure: none() } },
        notes: moves ? [`It ${moves[1].toLowerCase()} up to ${moves[2]} feet to its target first: the map's.`] : undefined
    });
}

export function withReleasedStrikes(plan, { kind, text }) {
    if (kind !== "consumable") return plan;
    return withKrooth(withManticore(plan), text);
}

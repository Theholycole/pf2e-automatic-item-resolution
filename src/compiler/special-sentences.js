// Unique items' and artifacts' activations read sentence by sentence (2026-10-27, the user: their every effect built): every sentence of the
// effect one of the reading's own, none dropped, into what its card plays — as src/compiler/lasting.js's readings (its withSentenceReadings).
// Passage Pane's lock onto a Boneyard location (its user's own Religion check, plan.ownSave: the save card on its user, a success a note
// Effect on them, "Locked on"), its rift (a note Effect for its 24 hours at most, onto that location or else a random point of the Dead Roads)
// and its closing (that Effect ended, item.endsOwn). Pure.

import { withSentenceReadings } from "./lasting.js";

const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours" };
const timeOf = (value, unit) => ({ mode: "fixed", value: Number(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const ownRow = ({ noteEffects = [], notes = [], target = null, item = null }) => ({
    targeting: { target, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {}),
    ...(item ? { item } : {})
});
// (Its user's own check against a DC, as the save card rolls it on them — PF2e's statistic of that name, a skill's too.)
const ownCheck = ({ statistic, dc, rows, notes = [] }) => ({
    targeting: { target: "self", range: null, area: null },
    ownSave: true,
    resolution: { kind: "save", check: { roll: "save", statistic, basic: false, against: { dc: "fixed", value: Number(dc) } }, sharedDamage: null, outcomes: Object.fromEntries(["criticalSuccess", "success", "failure", "criticalFailure"].map((degree) => [degree, { ...none(), ...(rows[degree] ? { noteEffects: rows[degree] } : {}) }])) },
    ...(notes.length ? { notes } : {})
});

// (Its user's own Strength modifier, as live play gives it — unknown, PF2e's own formula term.)
const strOf = (item) => (Number.isFinite(Number(item?.ownerAbilities?.str)) ? Number(item.ownerAbilities.str) : null);
const plus = (dice, str) => (str === null ? `${dice}+@actor.abilities.str.mod` : str ? `${dice}${str > 0 ? "+" : ""}${str}` : dice);
const COUNT = ["one", "two", "three"];

const PANE_NEEDS = "Only while the mirror's mounted firmly on a solid surface and its user is bonded with it.";
const RIFT = "Rift to the Boneyard";
const LOCKED = "Locked on";

const READINGS = [
    {
        // (A conjured javelin's ranged Strike — a javelin's, with the club's +3 and its damage dice — and its gazelle's leap to as many creatures
        // near the one hit as the actions spent: the ways card's three ways, each its user's thrown attack (Dexterity and simple weapon
        // proficiency, +3 item) at a creature within 60 feet, its hit's second step the gazelle's damage at up to that many creatures its
        // presser targets within 20 feet of the first (thenSave, maxTargets). The javelin's ghost touch needs the ability module to roll the
        // damage with the rune's roll option (requested): partial for that alone.)
        name: "Hunter's Dawn",
        sentences: [
            /^You swing Hunter's Dawn and launch a magically conjured javelin at a target within (\d+) feet, making a ranged Strike\.$/,
            /^The javelin has the statistics of a javelin but gains the magical properties of Hunter's Dawn and disappears immediately after hitting or missing its target\.$/,
            /^On a successful hit, you deal damage \((\d+d\d+) (\w+), due to the atlatl's greater striking rune, plus your Strength modifier\); in addition, a gazelle leaps from the hit target to one or more targets within (\d+) feet of the first, dealing (\d+d\d+) (\w+) damage plus your Strength modifier\.$/,
            /^The number of additional targets hit in this way is equal to the number of actions you spend to activate this ability \(one additional target if you used one action, two additional targets for two actions, and so forth\)\.$/
        ],
        card: ([launch, , hit], plan, { item, base }) => {
            const str = strOf(item);
            const potency = Number(item?.system?.runes?.potency) || 0;
            const way = (actions) => {
                const gazelle = {
                    ...base,
                    automation: { level: "automatic" },
                    targeting: { target: `up to ${COUNT[actions - 1]} creature${actions === 1 ? "" : "s"} within ${hit[3]} feet of the one hit`, range: null, area: null },
                    trigger: { event: "use" },
                    maxTargets: actions,
                    resolution: { kind: "check", check: { roll: "automatic" }, sharedDamage: { rollOnce: true, components: [{ id: "0", formula: plus(hit[4], str), type: hit[5].toLowerCase(), category: null }] }, outcomes: { success: { damage: { mode: "shared", multiplier: 1, sourceComponentIds: ["0"] }, effects: [], modifiers: [] } } },
                    damageOptions: ["item:rune:property:ghost-touch"]
                };
                const hitRow = (multiplier) => ({ damage: { mode: "shared", multiplier, sourceComponentIds: ["0"] }, effects: [], modifiers: [] });
                return {
                    name: `${actions} action${actions === 1 ? "" : "s"}: the javelin and ${COUNT[actions - 1]} gazelle leap${actions === 1 ? "" : "s"}`,
                    plan: {
                        ...base,
                        automation: { level: "automatic" },
                        activation: { ...(base?.activation ?? {}), time: String(actions) },
                        targeting: { target: "1 creature", range: `${launch[1]} feet`, area: null },
                        trigger: { event: "use" },
                        ownCheck: { kind: "attack", modifier: null, choose: ["thrown"], within: Number(launch[1]), ...(potency ? { itemBonus: potency } : {}) },
                        resolution: { kind: "check", check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" }, modifier: null }, sharedDamage: { rollOnce: true, components: [{ id: "0", formula: plus(hit[1], str), type: hit[2].toLowerCase(), category: null }] }, outcomes: { criticalSuccess: hitRow(2), success: hitRow(1), failure: none(), criticalFailure: none() } },
                        damageOptions: ["item:rune:property:ghost-touch"],
                        thenSave: gazelle,
                        notes: [
                            `A conjured javelin, gone once it hits or misses: its user's thrown attack${potency ? ` with the club's +${potency}` : ""}.`,
                            `On a hit, the gazelle leaps on: target up to ${COUNT[actions - 1]} other creature${actions === 1 ? "" : "s"} within ${hit[3]} feet of the one hit, then press its step (nothing on a miss).`,
                            "Ghost touch: an incorporeal creature's resistance doesn't hold against it (by hand until the ability module rolls the rune's option)."
                        ],
                        partial: true
                    }
                };
            };
            return { builtin: "ways", targeting: { target: null, range: null, area: null }, once: true, ways: [1, 2, 3].map(way), partial: true };
        }
    },
    {
        // (The creature hit marked — its user's TokenMark, until a new one's marked or it dies, its dispelling the GM's at DC 46 —, and once a day
        // 5th-rank Locate on it however far: the ways card's two ways, the Locate's own once a day (way.frequency).)
        name: "Hunter's Dawn",
        sentences: [
            /^The target is marked\.$/,
            /^Once per day, you can cast a (\d+)(?:st|nd|rd|th)-rank Locate spell on the marked target, regardless of its distance from you or your ability to cast spells\.$/,
            /^This effect persists until it is dispelled \(counterspell DC (\d+)\), the creature dies, or a new target is marked\.$/
        ],
        card: ([, locate, persists], plan, { base, info, html }) => {
            const uuid = /@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]+)\]\{Locate\}/.exec(String(html ?? ""))?.[1];
            if (!uuid) return null;
            const slug = "hunters-dawn-mark";
            const mark = { ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...ownRow({ target: "the creature hit" }), item: { ...info, recipient: "user", mark: { slug, duration: null, endsOnDeath: true, words: `until it dies or another is marked; dispelling it takes a counteract check against DC ${persists[1]}` } } };
            const cast = { ...base, automation: { level: "automatic" }, trigger: { event: "use", frequency: { max: 1, per: "day", raw: "once per day" } }, builtin: "cast-spell", spell: { uuid, name: "Locate" }, rank: Number(locate[1]), dc: null, attack: null, tradition: null, self: false, area: false, targets: true, targeting: { target: "the marked creature", range: null, area: null }, notes: ["Target the marked creature: Locate reaches it however far away it is, whether or not its user can cast spells."], item: { ...info } };
            return {
                builtin: "ways",
                targeting: { target: null, range: null, area: null },
                ways: [
                    { name: "Mark the creature hit", html: "<p>The target is marked.</p>", plan: mark },
                    { name: `Cast ${locate[1]}th-rank Locate on the marked creature (once per day)`, html: `<p>${locate[0]}</p>`, plan: cast, frequency: { max: 1, per: "day", raw: "once per day" } }
                ]
            };
        }
    },
    {
        // (Its user's Religion check: a success locks the mirror onto the place they focus on, only they seeing it — their note Effect until it
        // opens its rift there.)
        name: "Passage Pane",
        sentences: [
            /^You focus on a location in the Boneyard that you wish to travel to\.$/,
            /^You must have either seen or visited this location before or be able to describe the location in detail and its purpose or name, as appropriate\.$/,
            /^Attempt a @Check\[(\w+)\|dc:(\d+)\] check\.$/,
            /^On a success, the mirror locks onto your desired location, and you \(and only you\) see this location reflected in the mirror's pane\.$/
        ],
        card: ([, , check]) => {
            const lock = [{ label: LOCKED, text: "The mirror is locked onto the Boneyard location its user focused on; only they see it reflected in its pane. Its rift opens there.", duration: null }];
            return ownCheck({
                statistic: check[1].toLowerCase(),
                dc: check[2],
                rows: { criticalSuccess: lock, success: lock },
                notes: ["Its user focuses on a Boneyard location they've seen or visited, or can describe in detail (its purpose or name).", PANE_NEEDS]
            });
        }
    },
    {
        // (Its rift, open for 24 hours at most: onto the location it's locked on, else a random point of the Dead Roads.)
        name: "Passage Pane",
        sentences: [
            /^You urge the mirror to open a rift to the Boneyard\.$/,
            /^Creatures can travel through this rift in either direction\.$/,
            /^If you've successfully forced the mirror to lock onto a specific location, the mirror's pane becomes a rift to the Boneyard that opens onto that location\.$/,
            /^If you haven't forced the mirror to lock onto a specific location, the mirror's pane becomes a rift to a random location on the Dead Roads\.$/,
            /^This rift remains open until you close it, up to a maximum of (\d+) (hours?|minutes?)\.$/,
            /^As long as the rift is open, the mirror is immovable, no one can form a bond with the mirror, and no one but you can Activate the mirror\.$/
        ],
        card: ([, , , , open]) => ownRow({
            noteEffects: [{ label: RIFT, text: `The mirror's pane is a rift to the Boneyard, which creatures can travel through either way: onto the location it's locked on (its user's ${LOCKED} Effect), or else onto a random point on the Dead Roads. It's open until its user closes it, ${open[1]} ${open[2]} at most. While it's open the mirror is immovable, no one can bond with it, and no one but its user can Activate it.`, duration: timeOf(open[1], open[2]) }],
            notes: [`Locked on (its user's ${LOCKED} Effect): the rift opens onto that location; otherwise onto a random point on the Dead Roads, the GM's pick.`, PANE_NEEDS]
        })
    },
    {
        // (Its rift closed: the Effect its other activation gave ended.)
        name: "Passage Pane",
        over: true,
        sentences: [/^You close the rift\.$/],
        card: () => ownRow({ notes: ["Only while the mirror is an open rift and its user is bonded with it."], item: { endsOwn: { label: RIFT } } })
    }
];

// The plan and its activation's { name, words, html, base, info, frequency, item } → the reading's card, or the same plan.
export function withSpecialSentences(plan, given) {
    const own = READINGS.map((reading) => ({ ...reading, card: (found, read) => reading.card(found, read, given) }));
    return withSentenceReadings(own, plan, given);
}

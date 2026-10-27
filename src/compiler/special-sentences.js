// Unique items' and artifacts' activations read sentence by sentence (2026-10-27, the user: their every effect built): every sentence of the
// effect one of the reading's own, none dropped, into what its card plays — as src/compiler/lasting.js's readings (its withSentenceReadings).
// Passage Pane's lock onto a Boneyard location (its user's own Religion check, plan.ownSave: the save card on its user, a success a note
// Effect on them, "Locked on"), its rift (a note Effect for its 24 hours at most, onto that location or else a random point of the Dead Roads)
// and its closing (that Effect ended, item.endsOwn). Pure.

import { withSentenceReadings } from "./lasting.js";
import { LEVEL_DCS } from "./counteract.js";

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

const stun = (value) => ({ ...none(), effects: [{ kind: "condition", slug: "stunned", value, duration: null }] });

// (PF2e's statistic slugs: a Lore skill's "warfare-lore".)
const statisticSlug = (words) => String(words).trim().toLowerCase().replace(/\s+(?:save|check)$/, "").replace(/\s+/g, "-");
const COMMANDER = "Commander of Flame";
const COMMANDER_TEXT = "The Army of Fire follows its orders as long as the army can see and hear it, whatever language it speaks; it senses the army's presence and can give orders as the spear's holder does. It still needs the spear in hand to muster the army. If it doesn't hold the spear for 1 week, the spear returns to Cuetzmonquali.";

const READINGS = [
    {
        // (Two activations in one block — PF2e's text runs the second's Activate line on in the first's paragraph: tying its user's soul to the spear,
        // once a day, and mustering the Army of Fire, once a week — the ways card's ways, each its own frequency (way.frequency). Against a living
        // Commander: its user's best of the four, against the highest of the Commander's four DCs (plan.bestOf, plan.dcFromTarget: scripts/live.js,
        // the Commander targeted), rolled on its user — a success its Commander of Flame Effect, a failure the Commander knowing it for 24 hours.
        // With none living: that Effect at once. The muster's teleports: the army's tokens or its user's, on the map.)
        name: "Spear of the Destroyer's Flame",
        sentences: [
            /^You attempt to tie your soul to the spear\.$/,
            /^If the current Commander of Flame still lives, you must attempt either an? ((?:Will|Fortitude|Reflex) save), ([\w ]+? check), ([\w ]+? check), or ([\w ]+? check)\.$/,
            /^The DC of this check is equal to the current Commander's (\w+) DC, ([\w ]+?) DC, ([\w ]+?) DC, or ([\w ]+?) DC, whichever is highest\.$/,
            /^On a success, you become the Commander of Flame\.$/,
            /^On a failure, the current Commander knows your name and appearance and is aware of your exact location for (\d+) (hours?)\.$/,
            /^Activate 1 hour \(envision, Interact\) Frequency (once per week) Effect You use the spear's power to muster the Army of Fire\.$/,
            /^You can choose to either call the Army of Fire to your location or move yourself to the army's location\.$/,
            /^When calling the army, you select an area you can see within (\d+) feet\.$/,
            /^The army is instantly teleported to the location you select, spreading out as necessary to arrive safely\.$/,
            /^When moving yourself, you instantly teleport yourself to a location within (\d+) feet of the army\.$/,
            /^The army is composed of souls given form as burning humanoids, elementals, spirits, and undead\.$/
        ],
        card: ([, attempt, dcs, , failure, muster, , call, , move], plan, { base, info }) => {
            const own = (card) => ({ ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...card, item: { ...info, ...(card.item ?? {}) } });
            const becomes = [{ label: COMMANDER, text: COMMANDER_TEXT, duration: null }];
            const known = [{ label: "Known to the Commander", text: `The current Commander of Flame knows its name and appearance and is aware of its exact location for ${failure[1]} ${failure[2]}.`, duration: timeOf(failure[1], failure[2]) }];
            const stats = attempt.slice(1, 5).map(statisticSlug);
            const against = ownCheck({ statistic: stats[0], dc: 0, rows: { criticalSuccess: becomes, success: becomes, failure: known, criticalFailure: known }, notes: ["Target the living Commander of Flame first: the DC is the highest of their four, rolled with its user's best of the four."] });
            const day = { max: 1, per: "day", raw: "once per day" };
            const tie = (name, card) => ({ name, html: "<p>You attempt to tie your soul to the spear.</p>", plan: own({ ...card, activation: { ...(base?.activation ?? {}), time: "1 minute" } }), frequency: day, frequencyKey: "tie" });
            return {
                builtin: "ways",
                targeting: { target: null, range: null, area: null },
                ways: [
                    tie("Tie its soul: against the living Commander", { ...against, bestOf: stats, dcFromTarget: { statistics: dcs.slice(1, 5).map(statisticSlug) } }),
                    tie("Tie its soul: no Commander living", ownRow({ noteEffects: becomes })),
                    {
                        name: "Muster the Army of Fire (once per week)",
                        html: `<p>${muster[0].replace(/^Activate 1 hour \(envision, Interact\) Frequency once per week Effect /, "")}</p>`,
                        frequency: { max: 1, per: "week", raw: muster[1] },
                        plan: own({ ...ownRow({ notes: [
                            `Call the army: it teleports at once to an area its user can see within ${call[1]} feet, spreading out to arrive safely (put its tokens there).`,
                            `Or move itself: its user teleports at once to a spot within ${move[1]} feet of the army (move its token there).`,
                            "The army: souls given form as burning humanoids, elementals, spirits and undead."
                        ] }), activation: { ...(base?.activation ?? {}), time: "1 hour" } })
                    }
                ]
            };
        }
    },
    {
        // (PF2e's Retributive Strike as its user's own: the ally the enemy damaged gains resistance to all damage, 2 + its user's level, against
        // that damage — the fortune card's readied bonus for the creature targeted, gone with the damage —; its melee Strike at the enemy in reach,
        // and its champion feats' benefits (PF2e's own toggle on its sheet), its user's own.)
        name: "Piereta",
        sentences: [/^Piereta makes a Retributive Strike, resolved as though you had used the ability, including any benefits from champion feats you have\.$/],
        card: (found, plan, { item }) => {
            const level = Number(item?.ownerLevel);
            if (!Number.isFinite(level)) return null;
            return {
                builtin: "readied-bonus",
                targeting: { target: "the ally the enemy damaged", range: null, area: null },
                bonus: { modifiers: [], resistance: { type: "all-damage", value: level + 2 }, against: true, duration: { value: 0, unit: "rounds", expiry: "turn-end" }, spend: [], recipient: "target" },
                notes: [
                    "Retributive Strike's trigger: an enemy damages its user's ally, both within 15 feet of its user (its champion's aura). Target that ally, then Apply: its resistance is against that damage.",
                    "If the enemy is within reach, its user makes a melee Strike against it (their own Strike, with any champion feats' benefits — PF2e's Retributive Strike toggle on its sheet)."
                ]
            };
        }
    },
    {
        // (Its partner back from death at full Hit Points, keeping the spells prepared and the points in its pools it had: the revival on its user
        // (item.revive hp "max", keepPools — scripts/revive.js); its long-term debilitations kept, and the look it takes on, note Effects.)
        name: "Briar",
        sentences: [
            /^Briar resurrects its partner\.$/,
            /^The partner returns to life with full Hit Points and the same spells prepared and points in their pools they had when they died, but still suffering from any long-term debilitations of the old body\.$/,
            /^The target is also permanently changed in some way that shifts their appearance slightly toward that of Nyrissa's, such as a green streak in the hair, a few thorny growths on the body, or a slight greenish cast to their skin\.$/
        ],
        card: () => ownRow({
            noteEffects: [{ label: "Touched by Nyrissa", text: "Its look has shifted for good a little toward Nyrissa's: a green streak in the hair, a few thorny growths, or a slight greenish cast to the skin (its player picks).", duration: null }],
            item: { recipient: "user", revive: { hp: "max", keepPools: true, words: "Back from death by Briar with full Hit Points, the spells prepared and the points in its pools it had when it died; it still has any long-term debilitations of its old body" } }
        })
    },
    {
        // (Its first Strike at Nyrissa in a round: its partner's +4 item bonus to saves against her spells for a minute — the item card's Effect,
        // its TokenMark at her, the bonus predicated on her as the save's origin — then her Fortitude save card, DC 50: Stunned 1, or 3 on a
        // critical failure; no other creature's.)
        name: "Briar",
        over: true,
        sentences: [
            /^The target must attempt a @Check\[fortitude\|dc:(\d+)\] save\.$/,
            /^Success The target is unaffected\.$/,
            /^Failure The target is Stunned (\d+)\.$/,
            /^Critical Failure The target is Stunned (\d+)\.$/,
            /^Briar's partner gains a \+(\d+) item bonus to all saving throws against Nyrissa's spells for (\d+) (minutes?|rounds?)\.$/
        ],
        card: ([save, , failure, critical, bonus], plan, { base }) => {
            if (plan?.resolution?.kind !== "save") return null;
            const slug = "briar-nyrissa";
            const duration = timeOf(bonus[2], bonus[3]);
            const nyrissa = {
                ...base,
                automation: { level: "automatic" },
                trigger: { event: "use" },
                targeting: { target: "Nyrissa", range: null, area: null },
                ifTarget: [{ named: "nyrissa", lacks: true, immune: true }],
                resolution: { kind: "save", check: { roll: "save", statistic: "fortitude", basic: false, against: { dc: "fixed", value: Number(save[1]) } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: stun(Number(failure[1])), criticalFailure: stun(Number(critical[1])) } }
            };
            return {
                ...ownRow({ target: "Nyrissa", notes: ["Target Nyrissa, the creature struck: the bonus is against her spells, then her save's card follows."] }),
                resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), modifiers: [{ selector: "saving-throw", value: Number(bonus[1]), type: "item", duration, predicate: [`origin:mark:${slug}`, "item:type:spell"] }] } } },
                again: { plan: nyrissa, later: false },
                item: { recipient: "user", mark: { slug, duration } }
            };
        }
    },
    {
        // (3rd-rank Circle of Protection against undead in place of an alignment, a 10-foot emanation around the athame: a zone on its user for a
        // minute, each creature inside +1 status to AC against undead creatures' attacks and to saves against their effects, +3 against a summoned
        // undead's attacks and (its toggle) an undead's effect that directly controls it; a summoned undead entering attempts a Will save at the
        // athame's level DC to come in. That save only for summoned undead needs the ability module's all-traits filter (requested): partial.)
        name: "Spiral Athame",
        over: true,
        sentences: [
            /^You point the Spiral Athame to the sky and pray, warding creatures against undead\.$/,
            /^This has the effect of (\d)(?:st|nd|rd|th)-rank Circle of Protection, except it wards against undead creatures rather than creatures of a specified alignment, and the emanation is centered on the Spiral Athame ?\.$/
        ],
        card: ([, rank], plan, { item }) => {
            if (plan?.builtin !== "cast-spell" || Number(rank[1]) !== 3) return null;
            const dc = LEVEL_DCS[Math.max(0, Math.min(25, Number(item?.system?.level?.value) || 0))];
            const toggle = "spiral-athame-ward:controlling";
            const keep = { kind: "save", check: { roll: "save", statistic: "will", basic: false, against: { dc: "fixed", value: dc } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: { ...none(), noteEffects: [{ label: "Kept out of the ward", text: "This summoned undead can't willingly enter the Spiral Athame's ward; its later tries use this result.", duration: timeOf(1, "minute") }] }, criticalFailure: { ...none(), noteEffects: [{ label: "Kept out of the ward", text: "This summoned undead can't willingly enter the Spiral Athame's ward; its later tries use this result.", duration: timeOf(1, "minute") }] } } };
            return {
                builtin: "zone",
                actions: null,
                targeting: { target: null, range: null, area: { type: "emanation", value: 10 } },
                partial: true,
                automation: { level: "guided" },
                zone: {
                    area: { type: "emanation", value: 10 },
                    centre: "self",
                    range: null,
                    lasts: timeOf(1, "minute"),
                    untilReused: false, concealed: false, terrain: [], others: false, hazard: null, damage: [], effect: null, modifiers: [],
                    saves: [{ when: ["enter"], only: { traits: ["undead"], all: ["undead", "summoned"] }, plan: { modelVersion: plan.modelVersion, source: plan.source, rank: 3, traits: ["divine", "necromancy"], trigger: { event: "zone" }, targeting: { target: "a summoned undead entering", range: null, area: null }, automation: { level: "automatic" }, resolution: keep } }],
                    inside: [{ rules: [
                        { key: "FlatModifier", slug: "spiral-athame-ward", selector: ["ac", "saving-throw"], type: "status", value: 1, predicate: ["origin:trait:undead"] },
                        { key: "FlatModifier", slug: "spiral-athame-ward-summoned", selector: "ac", type: "status", value: 3, predicate: ["origin:trait:undead", "origin:trait:summoned"] },
                        { key: "RollOption", domain: "saving-throw", option: toggle, toggleable: true, label: "Against an undead's effect that directly controls it", value: false },
                        { key: "FlatModifier", slug: "spiral-athame-ward-controlling", selector: "saving-throw", type: "status", value: 3, predicate: ["origin:trait:undead", toggle] }
                    ] }],
                    notes: [
                        "A 10-foot ward around the athame's holder for 1 minute: inside, +1 status to AC against undead's attacks and to saves against their effects; +3 against a summoned undead's attack, and (switch it on) against an undead's effect directly controlling the creature.",
                        `A summoned undead entering attempts a DC ${dc} Will save (the athame's level DC: the GM may change it); failing, it can't willingly enter, its later tries using that result. Only a summoned one attempts it (until the ability module filters by both traits).`
                    ]
                }
            };
        }
    },
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

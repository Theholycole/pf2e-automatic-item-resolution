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

const days = (value) => ({ mode: "fixed", value: Number(value), unit: "days", expiry: "turn-start", anchor: "effect-start" });
const NO_BONUSES = "It can't benefit from circumstance or status bonuses";

// (Its user's unarmed Strike against a creature's DC: the check at their unarmed attack modifier, filled in live — check.attackFrom, scripts/live.js.)
const unarmedCheck = (against, rows, base) => ({ modelVersion: base?.modelVersion, source: base?.source, rank: 1, traits: ["attack"], automation: { level: "automatic" }, trigger: { event: "zone" }, targeting: { target: "a creature in the area", range: null, area: null }, resolution: { kind: "check", check: { roll: "skill", statistic: "unarmed", against: { dc: "target", statistic: against }, modifier: null, attackFrom: "unarmed" }, sharedDamage: rows.sharedDamage ?? null, outcomes: rows.outcomes } });

const READINGS = [
    {
        // (A mob of shadowy figures in a 20-foot burst within 120 feet, for a minute: a zone, its user's unarmed Strike against each creature's
        // Fortitude DC as it rises (Grabbed for the minute or until it Escapes against its user's class DC, and 3d6 bludgeoning), again at the end
        // of each turn a creature not yet grabbed ends there, and 1d6 bludgeoning at the end of each turn of one that is. Those last two need the
        // ability module's condition filters on a zone's entries (only.conditions, only.lacks — requested): partial for that alone. The figures'
        // AC and Hit Points, moving the burst from 15th level, and ground that can't hold it are the zone card's lines (the map's).)
        name: "The Uprising",
        sentences: [
            /^The card calls forth a mob of shadowy figures who batter and hinder your enemies\.$/,
            /^Target a (\d+)-foot burst at any point on solid ground with (\d+) feet, and the mob of figures rises up from the ground, persisting for (\d+) (minutes?|rounds?)\.$/,
            /^Make an unarmed Strike against the (Fortitude|Reflex|Will) DC of any number of creatures in this burst \(you can choose to not attack some creatures in the area if you wish\)\.$/,
            /^Any creature you succeed against is Grabbed and takes (\d+d\d+) (\w+) damage\.$/,
            /^Whenever a creature ends its turn in the area, the figures attempt to Grab that creature if they haven't already, and they deal (\d+d\d+) (\w+) damage to any creature already grabbed\.$/,
            /^The mob's Escape DC is equal to your class DC\.$/,
            /^A creature can attack a figure in an attempt to release its grip\.$/,
            /^It's AC is equal to your class DC, and it's destroyed if it takes (\d+) or more damage\.$/,
            /^Even if destroyed, additional figures continue to rise up in the area until the effect's duration ends\.$/,
            /^You can Dismiss this effect\.$/,
            /^If you are at least (\d+)th level, you can use a two-action activity, which has the concentrate trait, to move the burst up to (\d+) feet, which causes any currently grabbed creatures to be released and left behind\.$/,
            /^If part of the burst appears or moves into an area that can't support it on the ground, that portion of the burst disappears until it is supported\.$/
        ],
        card: ([, burst, strike, hit, ends, , , figure, , , move], plan, { base }) => {
            const lasts = timeOf(burst[3], burst[4]);
            const grab = { kind: "condition", slug: "grabbed", value: null, duration: { ...lasts, escape: { ownerDC: "class" } } };
            const struck = (damage) => ({ damage: damage ? { mode: "shared", multiplier: 1, sourceComponentIds: ["0"] } : { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [grab], modifiers: [] });
            const rises = unarmedCheck(strike[1].toLowerCase(), { sharedDamage: { rollOnce: false, components: [{ id: "0", formula: hit[1], type: hit[2].toLowerCase(), category: null }] }, outcomes: { criticalSuccess: struck(true), success: struck(true), failure: none(), criticalFailure: none() } }, base);
            const grabs = unarmedCheck(strike[1].toLowerCase(), { outcomes: { criticalSuccess: struck(false), success: struck(false), failure: none(), criticalFailure: none() } }, base);
            return {
                builtin: "zone",
                actions: null,
                partial: true,
                automation: { level: "guided" },
                targeting: { target: null, range: `${burst[2]} feet`, area: { type: "burst", value: Number(burst[1]) } },
                zone: {
                    area: { type: "burst", value: Number(burst[1]) },
                    centre: "placed",
                    range: Number(burst[2]),
                    lasts,
                    untilReused: false, concealed: false, terrain: [], others: false, hazard: null, effect: null, modifiers: [],
                    saves: [{ when: ["initial"], plan: rises }, { when: ["end"], only: { lacks: { conditions: ["grabbed"] } }, plan: grabs }],
                    damage: [{ when: "end", only: { conditions: ["grabbed"] }, formulas: [`${ends[1]}[${ends[2].toLowerCase()}]`] }],
                    notes: [
                        "On solid ground: a part of the burst over ground that can't hold it is gone until it's held again.",
                        "Its user picks which creatures in it they Strike as it rises (dismiss the cards of those they spare).",
                        `A figure holding a creature: AC equal to its user's class DC; ${figure[1]} damage or more destroys it and frees that creature (end its Grabbed). More keep rising until the minute's up.`,
                        "Its user can Dismiss it (end the zone).",
                        `From ${move[1]}th level, a two-action concentrate activity moves the burst up to ${move[2]} feet (move the zone's region): the creatures grabbed are released and left behind (end their Grabbed).`
                    ]
                }
            };
        }
    },
    {
        // (A glimpse of someone its user will meet in the next 24 hours, and whether to trust them: what it tells, whispered to the GM and its
        // user — the GM's to fill in — with the card's secret flat check rolled for the GM alone (plan.whisper.flat: DC 6, 2 lower while The
        // Carnival is invested, 3 from 17th level, never below 2), a failure always "neither"; and, a divination with a flat check, its user
        // Stupefied 1 for a round (the card's own invested rule).)
        name: "The Carnival",
        sentences: [
            /^You peer into the future and witness yourself walking through a colorful but vaguely sinister carnival, meeting a variety of strange people\.$/,
            /^One of these people looks more genuine than the others and resembles someone you're likely to meet for the first time in the next (\d+) hours \(if anyone\)\.$/,
            /^This resemblance might be metaphorical, such a clown signifying someone who is silly or a stilt-walker representing someone who is tall\.$/,
            /^You also get a sense for whether this person can be trusted, should be distrusted, or neither, based on how they're most likely to interact with you and your allies\.$/,
            /^The GM decides who this new person might be, then rolls a secret @Check\[flat\|dc:(\d+)\]\.$/,
            /^On a failure, the result is always "neither," making it hard to determine whether a "neither" result is accurate\.$/
        ],
        card: ([, meet, , , flat], plan, { item }) => {
            const level = Number(item?.ownerLevel) || 0;
            const dc = Math.max(2, Number(flat[1]) - (level >= 17 ? 3 : 2));
            return {
                builtin: "whisper",
                targeting: { target: null, range: null, area: null },
                whisper: {
                    text: `A vision of a sinister carnival: among its strange people one looks more genuine, resembling — perhaps only in a manner of speaking — someone its user is likely to meet for the first time in the next ${meet[1]} hours (if anyone), and with it a sense of whether they can be trusted, should be distrusted, or neither. The GM says who.`,
                    flat: { dc, failure: "The answer is \"neither\", whatever the truth." }
                },
                userEffects: [{ slug: "stupefied", value: 1, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "effect-start" } }]
            };
        }
    },
    {
        // (No circumstance or status bonuses for the creature that fails — PF2e has no rule to take them away, so its note Effect for the row's time
        // (the user's ruling) —, and on a failure for its allies within 15 feet of it too, said on the same Effect.)
        name: "The Empty Throne",
        over: true,
        sentences: [
            /^You overwhelm a target you can see within (\d+) feet with feelings of helplessness and loss\.$/,
            /^The creature must attempt a @Check\[will\|dc:\d+\] save with a DC equal to your class DC or spell DC\.$/,
            /^Critical Success The target is unaffected\.$/,
            /^Success The target can't benefit from circumstance or status bonuses for 1 round\.$/,
            /^Failure The target can't benefit from circumstance or status bonuses for 1 day, and the target's allies are unable to benefit from circumstance or status bonuses while within (\d+) feet of the target\.$/,
            /^Critical Failure As failure, except the duration is 1 week\.$/
        ],
        card: ([range, , , , allies], plan) => {
            if (plan?.resolution?.kind !== "save") return null;
            const lost = (duration, words, around) => ({ ...none(), noteEffects: [{ label: "Helpless and bereft", text: `${NO_BONUSES} ${words}.${around ? ` Its allies can't benefit from them either while within ${allies[1]} feet of it.` : ""}`, duration }] });
            const outcomes = plan.resolution.outcomes;
            const row = (degree, next) => ({ ...outcomes[degree], ...next, manualInstructions: undefined });
            const rows = {
                criticalSuccess: row("criticalSuccess", none()),
                success: row("success", lost({ mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "effect-start" }, "for 1 round", false)),
                failure: row("failure", lost(days(1), "for 1 day", true)),
                criticalFailure: row("criticalFailure", lost(days(7), "for 1 week", true))
            };
            for (const entry of Object.values(rows)) delete entry.manualInstructions;
            return { keep: true, partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" }, targeting: { ...(plan.targeting ?? {}), range: `${range[1]} feet` }, resolution: { ...plan.resolution, outcomes: rows } };
        }
    },
    {
        // (One question of the region's spirits as by a Commune ritual: its user's Nature check, DC 30, with the card's own +2 item bonus to it
        // (+3 from 17th level) — its degrees Commune's, what the spirits say the GM's, whispered on the row's note —; a critical failure its
        // Stupefied 4 for a week that nothing removes.)
        name: "The Owl",
        sentences: [
            /^After spending an hour meditating, you can ask one question of the region's spirits, as if you had just performed a Commune ritual\.$/,
            /^Attempt a @Check\[(\w+)\|dc:(\d+)\|traits:activate-the-owl\] check to determine the result\.$/
        ],
        card: ([, check], plan, { item }) => {
            const level = Number(item?.ownerLevel) || 0;
            const answer = (label, text) => [{ label, text, duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } }];
            const card = ownCheck({
                statistic: check[1].toLowerCase(),
                dc: check[2],
                rows: {
                    criticalSuccess: answer("The spirits answer", "A more powerful spirit of nature, strongly aligned with its user's interests, answers its one yes-or-no question about the region's animals, beasts, fey, fungi, plants, land and resources within 3 miles: it won't deceive (though it may not know), and gives up to five words when clarity matters. The GM answers."),
                    success: answer("The spirits answer", "The region's spirits of nature answer its one yes-or-no question with one word (\"Yes\", \"No\", \"Likely\", \"Unknown\"), as their own agenda has it — perhaps deceptively. The GM answers."),
                    failure: answer("No answer", "It fails to reach an appropriate spirit: no answer."),
                    criticalFailure: [{ label: "The enormity of the cosmos", text: "Stupefied 4 for 1 week; nothing can remove it.", rules: [{ key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg", onDeleteActions: { grantee: "restrict" }, alterations: [{ mode: "override", property: "badge-value", value: 4 }] }], duration: days(7) }]
                },
                notes: ["An hour's meditation first; then its user asks its one question, the card's bonus on the Nature check."]
            });
            return { ...card, resolution: { ...card.resolution, check: { ...card.resolution.check, bonus: { value: level >= 17 ? 3 : 2, type: "item" } } } };
        }
    },
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

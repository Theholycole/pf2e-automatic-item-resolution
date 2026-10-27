// The adventure books' items of the Strike group (2026-10-27, docs/needs.md: changes to a Strike, bonuses only in some situations, plain
// results, immunities by situation, numbers the text doesn't give), read sentence by sentence — every sentence of its effect one of the
// reading's own, in order, none dropped — into what its card plays. Each reading names what it builds:
// - Deafening Music Box: "any creature within 60 feet must succeed at a … save or become Deafened for as long as they remain within 60 feet of
//   the music box, and for 1 minute thereafter. On a critical success, a creature need not make any more saves and is temporarily immune …; on a
//   success, the creature must attempt a new save each round it remains within 60 feet". The ability module's zone placed where the box is set
//   down for its minute, the save at the creatures in it as it starts and at the start of each of their turns inside (its user's too), the
//   critical success's immunity on that save (trigger.immunity, which its save cards hold to).
// - Mindrender Baton's command: "You take command of the target and it becomes controlled … The creature can attempt a new … save at the end of
//   each of its turns; on a success, the effect ends." A note Effect that grants PF2e's Controlled while it lasts (GrantItem), its new save at
//   the end of each of the creature's turns (the ability module's saveEnds); the critical failure's 24 hours with that save only when the GM says
//   its commander ordered it against its nature (saveEnds.gate). Another's check to end it, and the immunity to their tries, its words.
// - Gift of Olives' Sew the Cutting: the tree's shelter, a 15-foot square zone for 8 hours — inside, PF2e's +1 status to Survival to Subsist,
//   and its toggle for environmental damage or hazards: resistance 3 to all damage and +1 status to saves while it's on. Its olives a line.
// - Mutagenic Renovator: its energy picked on the item card (item.resist's choose); how it shifts, the words of a note Effect for the hour.
// - Mnemonic Acid: "the memory lasts no longer than 10 minutes, and you're Blind to the world around you for the duration": Blinded for those
//   10 minutes (the GM may end it sooner) and the memory a note Effect beside it; the brain matter dissolving first, a line.
// - Soldier's Syrup: "you can activate the potion within the next hour as a single action … If you do not activate the potion within 1 hour, the
//   potion spoils inside you, and you become Enfeebled 1 for 24 hours." The ways card: the potion held, a note Effect for the hour; and its
//   spoiling, Enfeebled 1 for 24 hours, the second button its user presses once that hour runs out.
// - Rime Jar's Siphon Chill: its 8 hours of severe cold for extreme (plan.temperature) on both of the ways card's buttons, the second also
//   ending its user's Fatigued (item.reduce) — "caused by exposure to environmental cold", which only its user knows.
// - Gorum's Tear: a one-off (src/compiler/one-offs.js) — its lines reworded: the circumstance penalties its user unticks in PF2e's roll dialog,
//   its user's Off-Guard to the creature it targeted.
// - Fungal Walk Musk, Armor Polishing Kit, Exploration Lens (Investigating): a bonus only in some situations — PF2e's FlatModifier predicated
//   on a toggle for it on a note Effect for its time (as src/compiler/situational.js's), in place of the row's modifier; what PF2e can't play
//   (the fungus creatures' Perception penalty, the armor soiled), its words.
// - Changes to a Strike: Jawbreaker Shield's bash (its failure's −2 to mouth Strikes, a toggle with PF2e's jaws and fangs, on a note Effect for
//   24 hours); Corpsecaller Round's tether to the Void (a note Effect for the day); Venom Lash's Envenom (3d6 on a critical hit with its
//   alternate critical specialization, a toggle on the readied Effect); Mantis Embrace's death trait (PF2e's AdjustStrike on the readied
//   Effect); Boughshatter's Splintering Strike (the core's ignoreResistance against plants, fungi and wood creatures; its splinters a one-off);
//   Nightmare Cudgel's and Whip of Compliance's Strikes for a while (strike.every: each hit carries it, none spends it — the Demoralize card
//   after each hit, the Will save and its Suggestion); Ankylostar's sweep (up to three Strikes in the cone, or the Shove card, the ways card);
//   Soulfeeding Mask's Devour Soul (Quickened once the creature takes its damage: plan.userAfter, src/live/user-after.js; 50 vitality for an
//   undead, plan.ifTarget); Moonkeep Lily's week (a note Effect); Bomber's Saddle's payload, a one-off (src/compiler/one-offs.js, its own key —
//   its first activation another reading's), its words the card's lines.
// - Necrobinding Serum: coated as an injury poison; on its undead's save, the success's –1 status penalty to attack rolls against its user (a
//   toggle on a note Effect till the start of its user's next turn), the failures' attitude by kind — a note Effect for a mindless undead's
//   8 or 24 hours, another for the others' 10 minutes or hour (plan.ifTarget, src/live/if-target.js) — and none for a creature that isn't undead.
// Pure.

import { effectWords, sentencesOf } from "./lasting.js";
import { timeOf, zoneOf } from "./area-readings.js";
import { plainText } from "./rows.js";
import { itemActionPlan } from "./item-actions.js";
import { oneOff } from "./one-offs.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const whole = (plan) => {
    const next = { ...plan, automation: { ...(plan.automation ?? {}), level: "automatic" } };
    delete next.partial;
    delete next.noteOnly;
    return next;
};
const CONDITION = (id) => `Compendium.pf2e.conditionitems.Item.${id}`;
const CONTROLLED = CONDITION("9qGBRpbX9NEwtAAr");
const toggle = (option, label) => ({ key: "RollOption", domain: "all", option, toggleable: true, label });
const bonus = (selector, type, value, predicate) => ({ key: "FlatModifier", selector, type, value, predicate });
const BLINDED = (duration) => ({ kind: "condition", slug: "blinded", value: null, duration });
const ENFEEBLED = (value, duration) => ({ kind: "condition", slug: "enfeebled", value, duration });
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
// (A row of its own: a note Effect, conditions; its card's lines.)
const ownRow = ({ noteEffects = [], effects = [], notes = [], target = null }) => ({
    targeting: { target, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects, ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {})
});
// (A bonus only in a situation: the plan's own row with its toggle's note Effect in place of the reminder and the row's modifier.)
function situationNote(plan, note, extra = {}) {
    const success = plan.resolution.outcomes.success;
    const { unread: _unread, ...rest } = plan;
    return whole({ ...rest, ...extra, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...success, modifiers: [], noteEffects: [...(success.noteEffects ?? []).filter((entry) => !entry.reminder), note] } } } });
}
// (A Strike card of the item's own: its attack the save family's, as src/compiler/strikes.js makes it.)
const strikeCard = (base, info, frequency, strike) => ({
    ...base,
    automation: { level: "automatic" },
    targeting: { target: "the creature the Strike hits", range: null, area: null },
    trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free", ...(frequency ? { frequency } : {}) },
    resolution: { kind: "save", check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
    strike: { range: null, save: null, own: true, damage: [], attack: null, alteration: null, unarmed: false, uses: 1, until: "turn-end", missKeeps: false, hit: false, notes: [], ...strike },
    item: info
});
// (A Strike plan's own parts changed, its notes the lines given: whole once nothing else is left.)
function strikeWith(plan, strike, extra = {}) {
    const next = { ...plan, ...extra, strike: { ...plan.strike, ...strike } };
    const left = [...(next.strike.notes ?? []), ...(next.notes ?? []), ...(next.unread ?? []), ...Object.values(next.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? []), ...Object.values(next.strike.save?.resolution?.outcomes ?? {}).flatMap((row) => row?.manualInstructions ?? [])];
    return left.length ? next : whole(next);
}
const withoutLines = (row) => {
    const { manualInstructions: _lines, ...rest } = row ?? none();
    return rest;
};
// (A consumable's ways card: each way its own plan.)
const waysCard = (base, info, ways) => ({ ...base, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways, item: info });
// (A zone card of its own, as area-readings.js's.)
const zoneCard = (zone) => ({ builtin: "zone", actions: null, targeting: { target: null, range: zone.range ? `${zone.range} feet` : null, area: zone.area }, zone });

const READINGS = [
    {
        names: ["Deafening Music Box"],
        over: (plan) => plan?.resolution?.kind === "save" && plan.trigger?.immunity?.degrees?.join() === "criticalSuccess",
        sentences: [
            /^You press the button on the side of the music box, causing it to erupt with [\w ,]+? for (\d+) (minutes?) while it plays its entire melody, and it can't be shut off prematurely\.$/,
            /^The music is so loud that any creature within (\d+) feet must succeed at a @Check\[fortitude\|dc:\d+[^\]]*\] save or become Deafened for as long as they remain within \1 feet of the music box, and for (\d+) (minutes?) thereafter\.$/,
            /^On a critical success, a creature need not make any more saves and is temporarily immune to the deafening music box for the next 24 hours; on a success, the creature must attempt a new save each round it remains within \d+ feet of the music box\.$/
        ],
        card: ([plays, loud], plan, { base, info }) => {
            const { notes: _notes, partial: _partial, item: _item, ...own } = plan;
            const save = { ...own, automation: { level: "automatic" }, trigger: { event: "zone", immunity: plan.trigger.immunity }, targeting: { target: "a creature in the area", range: null, area: null } };
            return {
                ...base,
                ...zoneCard(zoneOf({
                    area: { type: "burst", value: Number(loud[1]) },
                    centre: "placed",
                    range: 5,
                    lasts: timeOf(plays[1], plays[2]),
                    // (Its user's too: "any creature within 60 feet".)
                    saves: [{ when: ["initial", "start"], own: true, plan: save }],
                    notes: [
                        "Set the box down on a flat surface first (place the area on it). While it plays it can't be carried without dropping it, and nothing shuts it off early.",
                        `A creature in the area saves as it starts and again at the start of each of its turns inside; a critical success makes it immune for 24 hours. A failure deafens it for ${loud[2]} ${loud[3]} from then: kept on while it stays within ${loud[1]} feet, so a minute after it leaves.`
                    ]
                })),
                automation: { level: "automatic" },
                trigger: { event: "use" },
                item: { ...info, ...(plan.item ?? {}) }
            };
        }
    },
    {
        names: ["Mindrender Baton"],
        over: (plan) => plan?.resolution?.kind === "save" && Boolean(plan.resolution.outcomes?.failure?.manualInstructions?.length),
        sentences: [
            /^You point the mindrender baton at a target creature within \d+ feet and disrupt the target's thoughts so that it sees the carrier of the mindrender baton as its commander and liege\.$/,
            /^The target must attempt @Check\[will\|dc:(\d+)[^\]]*\] save\.$/,
            /^Critical Success The target is unaffected\.$/,
            /^Success The target is Stunned 1 as it fights off the intrusion into its mind\.$/,
            /^Failure You take command of the target and it becomes controlled, following your orders; if you issue an obviously self-destructive order, the target doesn't act until you issue a new order\.$/,
            /^The creature can attempt a new @Check\[will\|dc:(\d+)[^\]]*\] save at the end of each of its turns; on a success, the effect ends\.$/,
            /^Another character can attempt a @Check\[diplomacy\|dc:(\d+)[^\]]*\] \(master\) or @Check\[intimidation\|dc:(\d+)[^\]]*\] \(master\) check against the effect's DC of \d+ to remove this effect before then, but if this attempt fails, the commanded creature becomes temporarily immune to that character's attempts to remove the effect via skills for (\d+) hours\.$/,
            /^Critical Failure As failure, but the target receives a new save only if you give a new order that is against its nature, such as to kill its allies\.$/,
            /^Otherwise, this effect persists for (\d+) hours, or until another character ends it via a skill check\.$/
        ],
        card: ([, , , , , again, others, , persists], plan) => {
            const dc = Number(again[1]);
            const rules = [{ key: "GrantItem", uuid: CONTROLLED, inMemoryOnly: true }];
            const commanded = "Controlled: it takes the baton's carrier for its commander and liege and follows their orders. Given an obviously self-destructive order, it doesn't act until it gets a new one.";
            const ended = `Another creature can end this with a DC ${others[1]} Diplomacy or DC ${others[2]} Intimidation check (master; incapacitation, mental); if that check fails, this creature is immune to that creature's tries by skill for ${others[3]} hours.`;
            const failure = { label: "Commanded by the mindrender baton", text: `${commanded} It attempts a new DC ${dc} Will save at the end of each of its turns, ending this on a success. ${ended}`, duration: null, saveEnds: { save: "will", dc, mode: "end" }, rules };
            const critical = {
                label: "Commanded by the mindrender baton",
                text: `${commanded} It gets a new DC ${dc} Will save at the end of its turn only when its commander has given it a new order against its nature, such as to kill its allies (the GM says so). It lasts ${persists[1]} hours otherwise. ${ended}`,
                duration: timeOf(persists[1], "hours"),
                saveEnds: { save: "will", dc, mode: "end", gate: "Did its commander give it a new order against its nature (such as to kill its allies) this turn?" },
                rules
            };
            const outcomes = plan.resolution.outcomes;
            const without = (row) => {
                const { manualInstructions: _lines, ...rest } = row ?? none();
                return rest;
            };
            const { notes: _notes, ...rest } = plan;
            return whole({
                ...rest,
                resolution: { ...plan.resolution, outcomes: { ...outcomes, failure: { ...without(outcomes.failure), noteEffects: [failure] }, criticalFailure: { ...without(outcomes.criticalFailure), noteEffects: [critical] } } }
            });
        }
    },
    {
        names: ["Gift of Olives: Sew the Cutting"],
        over: (plan) => !plan,
        sentences: [
            /^You drive one end of the cutting into the soil\.$/,
            /^The cutting immediately grows into an olive tree whose boughs shelter a (\d+)-foot-diameter area\.$/,
            /^Creatures in the sheltered area gain resistance (\d+) to any environmental damage, gain a \+(\d+) status bonus to saving throws against environmental hazards, and gain a \+(\d+) status bonus to Survival checks to Subsist\.$/,
            /^After (\d+) minutes, the tree sprouts (\d+) olives, each of which can be eaten as an action to restore (\d+) Hit Points? and nourish the eater as if they had consumed a full meal\.$/,
            /^After (\d+) hours, the olives lose their potency, and the gift of olives cutting detaches from the tree and falls harmlessly to the ground\.$/,
            /^The olive tree loses its protective abilities and becomes a normal, non-magical olive tree that survives so long as it's growing in a suitable location\.$/
        ],
        card: ([, shelter, gains, olives, ends], _plan, { base, info, frequency }) => ({
            ...base,
            ...zoneCard(zoneOf({
                area: { type: "square", value: Number(shelter[1]) },
                centre: "placed",
                lasts: timeOf(ends[1], "hours"),
                // (PF2e names no environmental damage: its toggle, on while the weather or the place harms them, as Coral Aspect's sharer.)
                inside: [{
                    rules: [
                        toggle("gift-of-olives-environment", "Environmental damage or hazard (the olive tree's shelter)"),
                        { key: "Resistance", type: "all-damage", value: Number(gains[1]), predicate: ["gift-of-olives-environment"] },
                        bonus("saving-throw", "status", Number(gains[2]), ["gift-of-olives-environment"]),
                        bonus("survival", "status", Number(gains[3]), ["action:subsist"])
                    ]
                }],
                notes: [
                    "Its tree grows in its user's square (outside, on soil): place the area centred on it.",
                    `Inside: resistance ${gains[1]} to environmental damage and +${gains[2]} status to saves against environmental hazards (the inside Effect's toggle, on against those), +${gains[3]} status to Survival to Subsist.`,
                    `After ${olives[1]} minutes, ${olives[2]} olives grow: eating one (an action) restores ${olives[3]} Hit Point and is a full meal, until the ${ends[1]} hours are up.`,
                    `After ${ends[1]} hours the cutting falls from the tree (the item back to its owner) and the tree is an ordinary olive tree: the zone ends.`
                ]
            })),
            automation: { level: "automatic" },
            trigger: { event: "use", ...(frequency ? { frequency } : {}) },
            item: info
        })
    },
    {
        names: ["Mutagenic Renovator"],
        over: (plan) => (plan?.resolution?.outcomes?.success?.noteEffects ?? []).some((note) => note.reminder),
        sentences: [
            /^This sludgy concoction is said to be derived from liquefied mutant scales\.$/,
            /^For (\d+) hours? after you imbibe the potion, your skin warps and mutates to grant you resistance (\d+) to one type of energy damage\.$/,
            /^When you first drink the potion, choose either ((?:\w+, )+)or (\w+) damage\.$/,
            /^The potion starts by granting you resistance against this type of damage\.$/,
            /^Each time you take damage from one of these listed energy types other than the one you currently resist, your skin mutates, causing you to lose the energy resistance previously granted by this potion and gain resistance to the type of energy by which you were most recently damaged, and the potion's duration decreases by (\d+) minutes\.$/,
            /^The resistance shifts only after you take the damage, so it doesn't apply to the first instance of damage\.?$/
        ],
        // (Its energy picked on the item card already, item.resist's choose: its shift the words of a note Effect beside it.)
        card: ([, lasts, listed, , shifts], plan) => {
            const resist = (plan.item?.resist ?? []).find((entry) => (entry.choose ?? []).length > 1 && Number(entry.value) === Number(lasts[2]));
            if (!resist) return null;
            const named = [...listed[1].split(",").map((word) => word.trim()).filter(Boolean), listed[2]].join(", ").replace(/, (\w+)$/, " or $1");
            const success = plan.resolution.outcomes.success;
            const note = {
                label: "Mutagenic skin",
                text: `When it takes damage of another of the potion's energies (${named}), its resistance ${lasts[2]} changes to that energy once the damage is dealt, and the potion's time left drops by ${shifts[1]} minutes: change its resistance Effect so.`,
                duration: timeOf(lasts[1], "hours")
            };
            const { unread: _unread, ...rest } = plan;
            return whole({ ...rest, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...success, noteEffects: [...(success.noteEffects ?? []).filter((entry) => !entry.reminder), note] } } } });
        }
    },
    {
        names: ["Mnemonic Acid"],
        over: (plan) => !plan,
        sentences: [
            /^This translucent yellow-green liquid has a sharp, tangy odor and an oily sheen\.$/,
            /^It's mildly acidic and can cause a minor rash after prolonged contact with skin\.$/,
            /^To unlock its true potential, you must submerge a piece of an intelligent creature's brain matter in the acid and allow the material to completely dissolve\.$/,
            /^This takes (\d+d\d+) minutes, during which time the mnemonic acid bubbles and steams eagerly\.$/,
            /^Once the brain matter fully dissolves, you can consume the acid as an Interact action to experience a powerful vision and relive one of the memories of the creature whose brain matter was dissolved\.$/,
            /^You have no control over which memory you experience, although such visions are almost always of memories that were meaningful to the owner of the dissolved brain matter\.$/,
            /^The memory might be of a single event or a series of related and interconnected events; the memory lasts no longer than (\d+) minutes, and you're Blind to the world around you for the duration\.$/,
            /^Each dose of mnemonic acid requires roughly 10% of the brain matter of the creature whose visions are to be experienced, meaning that up to (\d+) different memories from the same creature can be experienced\b.*\.$/
        ],
        card: ([, , , dissolves, , , lasts, doses], _plan, { base, info }) => ({
            ...base,
            automation: { level: "automatic" },
            trigger: { event: "use" },
            ...ownRow({
                effects: [BLINDED(timeOf(lasts[1], "minutes"))],
                noteEffects: [{ label: "Reliving a memory", text: `It relives one memory of the creature whose brain matter dissolved in the acid, not one it picks (almost always one that mattered to that creature; the GM tells it): one event or a run of linked ones, ${lasts[1]} minutes at most — the GM may end it sooner, its Blinded with it.`, duration: timeOf(lasts[1], "minutes") }],
                notes: [
                    `First a piece of an intelligent creature's brain matter is put in the acid and dissolves, over ${dissolves[1]} minutes; then it's drunk (an Interact action).`,
                    `Each dose takes about a tenth of that creature's brain matter: up to ${doses[1]} memories from one creature, a dose each.`
                ]
            }),
            item: info
        })
    },
    ...["Minor", "Lesser", "Moderate", "Greater", "Major"].map((grade) => ({
        names: [`Soldier's Syrup (${grade})`],
        over: (plan) => Boolean(plan?.noteOnly),
        sentences: [
            /^This thick syrup sweetens potions and creates a distinctive, metallic flavor\b.*\.$/,
            /^Partygoers are fond of mixing soldier's syrup with potions to extend their release\.$/,
            /^Activating a dose of soldier's syrup requires you to combine it with another consumable potion that takes 1 action to activate\.$/,
            /^After swirling the mixture for a few moments, you must either imbibe the augmented potion within (\d+) minutes?, or the potion reverts to its unaugmented state\.$/,
            /^The potion's level cannot exceed that of the soldier's syrup it is mixed with, otherwise the syrup is wasted\.$/,
            /^When consumed, a soldier's syrup ?[–-] ?augmented potion does not immediately grant its benefits to you\.$/,
            /^Instead, you can activate the potion within the next hour as a single action, which has the concentrate trait\.$/,
            /^You can have only one soldier's syrup ?[–-] ?augmented potion consumed at a time; consuming a second one renders the first one inert\.$/,
            /^If you do not activate the potion within (\d+) hours?, the potion spoils inside you, and you become Enfeebled (\d+) for (\d+) hours\.$/
        ],
        card: ([, , , mixed, , , , , spoils], plan, { base, info }) => {
            const own = { ...info, ...(plan.item ?? {}) };
            const level = Number(own.level) || 0;
            const held = {
                label: "Augmented potion",
                text: `An augmented potion is inside it, its benefits held: activating it (a single action, concentrate) within ${spoils[1]} hour${spoils[1] === "1" ? "" : "s"} gives them — use that potion's card then, and delete this Effect. Consuming a second augmented potion makes this one inert. If the time runs out first, it spoils: the syrup card's second button.`,
                duration: timeOf(spoils[1], "hours")
            };
            const way = (name, row) => ({ name, html: `<p><strong>Effect</strong> ${name}.</p>`, plan: { ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...row, item: own } });
            return waysCard(base, own, [
                way("The augmented potion drunk", ownRow({
                    noteEffects: [held],
                    notes: [
                        `Mixed with a potion of level ${level} or lower that takes 1 action to drink (a higher one wastes the syrup), and drunk within ${mixed[1]} minute${mixed[1] === "1" ? "" : "s"} or it's a plain potion again.`,
                        "Keep that potion on the sheet until it's activated: its own card gives its benefits then."
                    ]
                })),
                way("It spoiled (not activated in time)", ownRow({ effects: [ENFEEBLED(Number(spoils[2]), timeOf(spoils[3], "hours"))] }))
            ]);
        }
    })),
    {
        names: ["Rime Jar: Siphon Chill"],
        over: (plan) => Boolean(plan?.temperature) && (plan.notes ?? []).length === 1,
        sentences: [
            /^The jar draws off the cold and warms your body\.$/,
            /^If you have the Fatigued condition caused by exposure to environmental cold, it removes the condition\.$/,
            /^For (\d+) hours after applying the rime, you treat extreme cold as severe cold\.$/
        ],
        card: (_found, plan) => {
            const { notes: _notes, ...rest } = plan;
            const warmed = whole(rest);
            const way = (name, item) => ({ name, html: `<p><strong>Effect</strong> ${name}.</p>`, plan: { ...warmed, item } });
            return {
                ...warmed,
                builtin: "ways",
                ways: [
                    way("Warmed", warmed.item),
                    way("Warmed, its Fatigued from the cold ended", { ...warmed.item, reduce: [...(warmed.item?.reduce ?? []), { slug: "fatigued", by: "all" }] })
                ]
            };
        }
    },
    {
        names: ["Gorum's Tear"],
        over: (plan) => plan?.builtin === "roll-twice" && plan.decided === "one-off",
        sentences: [
            /^Trigger You make an attack with the affixed weapon\.$/,
            /^This teardrop-shaped piece of iron is a naturally occurring mineral\b.*\.$/,
            /^When you activate the Gorum's tear, you roll your next attack roll twice and take the better result, ignoring any circumstance penalties\.$/,
            /^You then become Off-Guard to the creature you targeted until the beginning of your next turn\.$/
        ],
        card: (_found, plan) => ({
            ...plan,
            notes: [
                "Untick any circumstance penalties in PF2e's roll dialog: this attack ignores them.",
                "After it, its user is Off-Guard to the creature it targeted until the start of its next turn (that creature's attacks only)."
            ]
        })
    },
    {
        names: ["Fungal Walk Musk"],
        over: (plan) => (plan?.resolution?.outcomes?.success?.noteEffects ?? []).some((note) => note.reminder),
        sentences: [
            /^This foul-smelling unguent dulls the odors and traces that fungus creatures detect\.$/,
            /^For (\d+) days? after you slather this musk on your body, fungus creatures take a [-–](\d+) penalty to Perception checks to Seek you or otherwise notice you\.$/,
            /^If a fungus creature is mindless, it instead has a [-–](\d+) penalty\.$/,
            /^The musk also grants you a \+(\d+) item bonus to AC against melee attacks from fungus creatures with no vision for the same period of time\.$/,
            /^The effects of fungal walk musk end immediately if you're submerged in water or subject to another olfactory effect\.$/
        ],
        card: ([, lasts, mindless, ac], plan) => situationNote(plan, {
            label: "Fungal walk musk",
            text: `Fungus creatures take a –${lasts[2]} penalty to Perception checks to Seek it or otherwise notice it (–${mindless[1]} for a mindless one). +${ac[1]} item bonus to AC against melee attacks from fungus creatures with no vision (its toggle on against one). It ends at once if it's submerged in water or subject to another olfactory effect (delete it then).`,
            duration: timeOf(lasts[1], "days"),
            rules: [toggle("fungal-walk-musk-blind-fungus", "Melee attack by a fungus creature with no vision"), bonus("ac", "item", Number(ac[1]), ["fungal-walk-musk-blind-fungus"])]
        })
    },
    {
        names: ["Armor Polishing Kit"],
        over: (plan) => (plan?.resolution?.outcomes?.success?.noteEffects ?? []).some((note) => note.reminder),
        sentences: [
            /^This kit can be used to clean and polish armor\.$/,
            /^Creatures wearing armor that has been maintained by this kit gain a \+(\d+) circumstance bonus on Diplomacy checks to Make an Impression on soldiers, guards, Gorumites, and other martially minded characters\.$/,
            /^This bonus expires after (\d+) hours, or if the armor is soiled in some way, such as by walking through a sewer or falling in a mud pit\.$/
        ],
        // (Whoever wears the armor: its user or one beside it, picked on the card.)
        card: ([, impression, lasts], plan) => situationNote(plan, {
            label: "Polished armor",
            text: `Wearing the polished armor: +${impression[1]} circumstance bonus to Diplomacy checks to Make an Impression on soldiers, guards, Gorumites and other martially minded characters (its toggle on for one). It ends early if the armor is soiled, such as by walking through a sewer or falling in a mud pit (delete it then).`,
            duration: timeOf(lasts[1], "hours"),
            rules: [toggle("armor-polishing-kit-martial", "Making an Impression on a martially minded character"), bonus("diplomacy", "circumstance", Number(impression[1]), ["action:make-an-impression", "armor-polishing-kit-martial"])]
        }, { item: { ...plan.item, recipient: "drinker" } })
    },
    {
        names: ["Exploration Lens (Investigating)"],
        over: (plan) => (plan?.resolution?.outcomes?.success?.modifiers ?? []).length === 1 && (plan.unread ?? []).length === 3,
        // (Its whole text is its activation's, no Effect heading: from its Activate line on.)
        words: (html) => plainText(html).replace(/^Activate\s+(?:\d\s+)?Interact\s+/, ""),
        sentences: [
            /^An exploration lens is a magical glass lens designed for a Bull's Eye Lantern\.$/,
            /^When light from the lantern passes through the lens, it alters the light to make it easier to perform a common exploration activity with the lantern\.$/,
            /^Alternatively, an exploration lens can be installed in a Wayfinder like an aeon stone\.$/,
            /^In this case, light \(such as that from a Lantern \(Hooded\), Torch, or Light spell\) must still pass through the lens and you must hold the wayfinder in your hand for it to function\.$/,
            /^There are several different types of exploration lens ?, each granting benefits with a different type of exploration activity\.$/,
            /^Each type of lens is distinguishable from all the other types by holding it up to a bright light\.$/,
            /^Type: Investigating The outer rim of this lens glows faintly when held up to the light\.$/,
            /^While activated, the lens grants you a \+(\d+) item bonus to skill checks to Recall Knowledge while Investigating\b[^.]*\.$/,
            /^If you're Investigating something while using the lens, you can always roll a Recall Knowledge skill check appropriate to the investigation for initiative\.$/
        ],
        card: ([, , , , , , , recall], plan) => situationNote(plan, {
            label: "Investigating lens",
            text: `+${recall[1]} item bonus to Recall Knowledge checks while Investigating (its toggle on while it does). While Investigating with the lens, it can roll a Recall Knowledge check fitting the investigation for initiative. It lasts while the lens is in use (delete it then).`,
            duration: null,
            rules: [toggle("exploration-lens-investigating", "Investigating"), bonus("skill-check", "item", Number(recall[1]), ["action:recall-knowledge", "exploration-lens-investigating"])]
        }, { notes: [...(plan.notes ?? []), "In a bull's eye lantern, or in a wayfinder held in its user's hand with light (a hooded lantern, a torch, the Light spell) shining through it."] })
    },
    {
        names: ["Necrobinding Serum"],
        over: (plan) => plan?.item?.delivery === "injury" && plan.resolution?.kind === "save" && Boolean(plan.resolution.outcomes?.failure?.manualInstructions?.length),
        sentences: [
            /^This potent necromantic serum is distilled from the body of an intelligent corporeal undead\b.*\.$/,
            /^The raw materials of a necrobinding serum are composed of a slurry\b.*\.$/,
            /^The exact ingredients vary, but the act of brewing a necrobinding serum\b.*\.$/,
            /^While necrobinding serum isn't a poison, its method of delivery is identical to that of an injury poison-it's applied to a weapon that's then used to Strike an undead target \(living creatures suffer no additional effect from exposure to a dose of necrobinding serum ?\)\.$/,
            /^When an undead creature is targeted by a dose of necrobinding serum ?, it must attempt a @Check\[will\|dc:\d+\] save\.$/,
            /^Critical Success The undead creature is unaffected\.$/,
            /^Success The undead creature is momentarily disoriented; it takes a [-–](\d+) status penalty to all attack rolls made against you until the start of your next turn\.$/,
            /^Failure The undead creature becomes friendly toward you\.$/,
            /^If it was already friendly, it becomes helpful\.$/,
            /^It can't use hostile actions against you\.$/,
            /^This effect persists for (\d+) hours if the undead is mindless\.$/,
            /^Against other undead, the effect gains the mental trait and persists for (\d+) minutes\.$/,
            /^Critical Failure The undead creature becomes helpful toward you and can't use hostile actions against you\.$/,
            /^This effect persists for (\d+) hours if the undead is mindless\.$/,
            /^Against other undead, the effect gains the mental trait and persists for (\d+) hours?\.$/
        ],
        card: ([, , , , , , penalty, , , , failMindless, failOthers, , critMindless, critOthers], plan) => {
            const outcomes = plan.resolution.outcomes;
            const bare = (row) => {
                const { manualInstructions: _lines, ...rest } = row ?? none();
                return rest;
            };
            // (Till the start of its user's next turn: PF2e's own round from the user's turn.)
            const untilNext = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" };
            const dazed = {
                label: "Disoriented by necrobinding serum",
                text: `–${penalty[1]} status penalty to attack rolls against the serum's user (its toggle on for one).`,
                duration: untilNext,
                rules: [toggle("necrobinding-serum-against-user", "Attacking the serum's user"), bonus("attack-roll", "status", -Number(penalty[1]), ["necrobinding-serum-against-user"])]
            };
            const bound = (helpful, duration, mental) => ({
                label: "Bound by necrobinding serum",
                text: `${helpful ? "Helpful" : "Friendly (Helpful if it already was)"} toward the serum's user, and it can't use hostile actions against them${mental ? " (a mental effect)" : ""}.`,
                duration
            });
            return whole({
                ...plan,
                // (Its save on the hit of the weapon it coats, as an injury poison's: the poison card.)
                targeting: { ...plan.targeting, target: "the creature the Strike hits" },
                trigger: { ...plan.trigger, event: "strike", on: ["success", "criticalSuccess"], cost: "free", map: false },
                resolution: { ...plan.resolution, outcomes: { ...outcomes, success: { ...bare(outcomes.success), noteEffects: [dazed] }, failure: bare(outcomes.failure), criticalFailure: bare(outcomes.criticalFailure) } },
                // (Its time by the undead's kind: a mindless one's longer; the others' a mental effect. Not an undead: nothing more.)
                ifTarget: [
                    ...(plan.ifTarget ?? []),
                    { traits: ["undead"], lacks: true, immune: true },
                    { traits: ["mindless"], degree: "failure", noteEffects: [bound(false, timeOf(failMindless[1], "hours"), false)] },
                    { traits: ["mindless"], lacks: true, degree: "failure", noteEffects: [bound(false, timeOf(failOthers[1], "minutes"), true)] },
                    { traits: ["mindless"], degree: "criticalFailure", noteEffects: [bound(true, timeOf(critMindless[1], "hours"), false)] },
                    { traits: ["mindless"], lacks: true, degree: "criticalFailure", noteEffects: [bound(true, timeOf(critOthers[1], "hours"), true)] }
                ]
            });
        }
    },
    {
        names: ["Jawbreaker Shield"],
        over: (plan) => Boolean(plan?.strike?.save?.resolution?.outcomes?.failure?.manualInstructions?.length),
        sentences: [
            /^You make a shield bash Strike as a reaction against the attacker\.$/,
            /^On a hit, the target attempts a @Check\[fortitude\|dc:\d+\] save\.$/,
            /^The effects of the saving throw are determined after the effects of the triggering Strike are resolved\.$/,
            /^Success The target is unaffected\.$/,
            /^Failure You wound the target's mouth\.$/,
            /^It takes 1d6 bleed and takes a [-–](\d+) status penalty to attack and damage rolls with jaws, fangs, or similar Strikes for (\d+) hours\.$/,
            /^Critical Failure You break the target's jaw\.$/,
            /^As failure, and the creature can't make Strikes using its mouth for \d+ minutes?\.$/,
            /^At the end of its turn, it can attempt a Fortitude save to regain the ability to make Strikes using its mouth\.$/
        ],
        card: ([, , , , , wound], plan) => {
            const save = plan.strike.save;
            const outcomes = save.resolution.outcomes;
            // (PF2e's own jaws and fangs Strikes by their selectors, as src/compiler/throat.js's; another Strike with its mouth, a beak or
            // mandibles, its toggle — status penalties don't stack, so none counts twice.)
            const value = -Number(wound[1]);
            const wounded = {
                label: "Wounded mouth",
                text: `–${wound[1]} status penalty to attack and damage rolls with jaws, fangs or similar Strikes using its mouth (its toggle on for one that's neither jaws nor fangs).`,
                duration: timeOf(wound[2], "hours"),
                rules: [
                    toggle("jawbreaker-mouth", "A Strike with its mouth"),
                    { key: "FlatModifier", selector: ["jaws-attack", "fangs-attack"], type: "status", value },
                    { key: "FlatModifier", selector: ["jaws-damage", "fangs-damage"], type: "status", value },
                    bonus("strike-attack-roll", "status", value, ["jawbreaker-mouth"]),
                    bonus("strike-damage", "status", value, ["jawbreaker-mouth"])
                ]
            };
            const next = { ...outcomes, failure: { ...withoutLines(outcomes.failure), noteEffects: [...(outcomes.failure.noteEffects ?? []), wounded] }, criticalFailure: { ...withoutLines(outcomes.criticalFailure), noteEffects: [...(outcomes.criticalFailure.noteEffects ?? []), wounded] } };
            return strikeWith(plan, { save: { ...save, resolution: { ...save.resolution, outcomes: next } }, lines: [...(plan.strike.lines ?? []), "At the attacker; its save's results come after the triggering Strike is resolved, so none of them is on that Strike"] });
        }
    },
    {
        names: ["Corpsecaller Round"],
        over: (plan) => Boolean(plan?.strike?.save?.resolution?.outcomes?.failure?.manualInstructions?.length),
        words: (html) => plainText(html).replace(/^(?:Ammunition round\s+)?Activate\s+(?:\d\s+)?Interact\s+/, ""),
        sentences: [
            /^This bullet is crafted entirely from obsidian and engraved with hair-thin runes\.$/,
            /^When an activated corpsecaller round hits a target, the struck creature is called to the grave\.$/,
            /^It takes 4d10 void damage with a @Check\[fortitude\|dc:\d+\] saving throw\.$/,
            /^Critical Success The foe is unaffected\.$/,
            /^Success The foe takes half damage\.$/,
            /^Failure The foe takes full damage and is Doomed 1\.$/,
            /^If the foe dies within the next (\d+) hours, its corpse is tethered to the Void, making it easier to raise as an undead\.$/,
            /^Creatures using the create undead ritual on the foe's corpse receive a \+(\d+) circumstance bonus to their primary and secondary skill checks for the ritual\.$/,
            /^Critical Failure As failure, except the foe takes double damage and is Doomed 2\.$/
        ],
        card: ([, , , , , , dies, ritual], plan) => {
            const save = plan.strike.save;
            const outcomes = save.resolution.outcomes;
            const tethered = { label: "Tethered to the Void", text: `If it dies within this time, its corpse is easier to raise as an undead: +${ritual[1]} circumstance bonus to the primary and secondary checks of a create undead ritual on it.`, duration: timeOf(dies[1], "hours") };
            const next = { ...outcomes, failure: { ...withoutLines(outcomes.failure), noteEffects: [tethered] }, criticalFailure: { ...withoutLines(outcomes.criticalFailure), noteEffects: [tethered] } };
            // (Its "called to the grave" is the hit's picture: its save below.)
            return strikeWith(plan, { save: { ...save, resolution: { ...save.resolution, outcomes: next } }, notes: [] });
        }
    },
    {
        names: ["Venom Lash: Envenom"],
        over: (plan) => plan?.strike?.damage?.length === 1 && plan.strike.damage[0].category === "persistent",
        sentences: [
            /^You temporarily fill the flail's stingers with venom\.$/,
            /^The next successful Strike you make with it before the end of your next turn deals (\d+d\d+) persistent poison damage to the target\.$/,
            /^If the Strike critically succeeds and if you would apply persistent poison damage with this weapon's alternate critical specialization, you combine the two effects to deal (\d+)d(\d+) persistent poison damage to the target\.$/
        ],
        // (PF2e doubles the Strike's persistent dice on a critical hit; with the flail's own 1d6 in place of its critical specialization, the
        // two together are the text's 3d6 — the readied Effect's toggle for that, its dice not doubled then.)
        card: ([, , combined], plan) => {
            const [venom] = plan.strike.damage;
            const alternate = "venom-lash-alternate";
            return strikeWith(plan, {
                damage: [
                    { ...venom, predicate: [{ not: alternate }] },
                    { ...venom, critical: false, predicate: [alternate] },
                    { ...venom, diceNumber: Number(combined[1]), dieSize: `d${combined[2]}`, critical: true, predicate: [alternate] }
                ],
                userRules: [...(plan.strike.userRules ?? []), toggle(alternate, "Venom Lash: its alternate critical specialization (poison)")],
                notes: [],
                lines: [...(plan.strike.lines ?? []), `On a critical hit with the flail's alternate critical specialization: tick its toggle on the readied Effect before the damage roll — ${combined[1]}d${combined[2]} persistent poison in all, in place of both`]
            });
        }
    },
    ...["Mantis Embrace", "Mantis Embrace (Greater)"].map((name) => ({
        names: [`${name}: Crushing Embrace`],
        over: (plan) => (plan?.strike?.damage ?? []).some((entry) => entry.category === "precision") && (plan.strike.notes ?? []).length === 3,
        sentences: [
            /^You Strike the creature you are grappling with a melee weapon or unarmed attack\.$/,
            /^This Strike deals an additional \d+d6 precision damage and gains the death trait\.$/,
            /^The body of a creature that is slain by Crushing Embrace is so gruesomely damaged that the creature's body cannot be affected by any effect that requires an intact body to function, such as the Talking Corpse spell\.$/
        ],
        // (Its death trait: PF2e's AdjustStrike on the readied Effect, for its melee Strikes while it lasts.)
        card: (_found, plan) => strikeWith(plan, {
            notes: [],
            requires: [...(plan.strike.requires ?? []), "The creature its user is grappling"],
            userRules: [...(plan.strike.userRules ?? []), { key: "AdjustStrike", mode: "add", property: "traits", value: "death", definition: ["item:melee"] }],
            lines: [...(plan.strike.lines ?? []), "It has the death trait", "A creature it slays can't have its body used by an effect that needs an intact body, such as Talking Corpse"]
        })
    })),
    {
        names: ["Boughshatter: Splintering Strike"],
        over: (plan) => Boolean(plan?.strike) && (plan.strike.notes ?? []).length === 3,
        sentences: [
            /^Make a Strike with the morningstar that deals an extra die of weapon damage\.$/,
            /^If you make this Strike against a fungus, plant, or creature with the wood trait, the Strike ignores (\d+) points of the target's resistances to bludgeoning and piercing damage, if any\.$/,
            /^By damaging such a creature, the morningstar causes the target's flesh to explode in a shower of splinters\b.*\.$/,
            /^You and the target are unaffected by these splinters\.$/
        ],
        // (Its splinters' cone from the creature hit, a one-off: src/compiler/one-offs.js — the rest of its notes the Strike card's.)
        card: ([, ignores], plan) => strikeWith(plan, {
            ignoreResistance: { value: Number(ignores[1]), types: ["bludgeoning", "piercing"], predicate: [{ or: ["target:trait:fungus", "target:trait:plant", "target:trait:wood"] }] },
            notes: (plan.strike.notes ?? []).filter((note) => !/\bthe Strike ignores \d+ points of the target's resistances\b/.test(String(note))),
            lines: [...(plan.strike.lines ?? []), `Against a fungus, a plant or a wood creature, its damage ignores ${ignores[1]} of the target's resistance to bludgeoning and piercing`]
        })
    },
    {
        names: ["Nightmare Cudgel"],
        over: (plan) => plan?.builtin === "teleport" && (plan.notes ?? []).length === 1,
        sentences: [
            /^You initiate an intimidating walk, thumping the cudgel menacingly against your palm\.$/,
            /^As part of activating this item, you can Stride twice\.$/,
            /^For the next minute, whenever you successfully Strike a creature with the nightmare cudgel ?, you can use a free action to attempt an Intimidation check to Demoralize the struck creature\.$/
        ],
        card: (_found, plan, { base, info, frequency, options }) => {
            const demoralize = itemActionPlan("<p>You attempt to Demoralize the creature.</p>", { ...base, activation: { time: "free", traits: [] } }, options);
            if (!demoralize?.action) return null;
            return strikeCard(base, { ...info, ...(plan.item ?? {}) }, frequency, {
                every: true,
                until: "minute",
                missKeeps: true,
                follow: demoralize,
                lines: ["As part of activating it, its user can Stride twice first (its own moves on the map)", "Its Demoralize after each hit is a free action: its user can skip it"]
            });
        }
    },
    {
        names: ["Whip of Compliance"],
        over: (plan) => !plan,
        sentences: [
            /^Until the end of your current turn, any animals you Strike with the whip must attempt a @Check\[will\|dc:(\d+)\]\.$/,
            /^On a failed or critically failed saving throw, the whip casts a (\d)(?:st|nd|rd|th)-rank Suggestion spell on the animal with a base duration of 1 round, and the spell loses the linguistic trait\.$/,
            /^The course of action must still fulfill suggestion's requirements\.$/,
            /^If you can cast spells, you can expend one of your spells of (\d)(?:st|nd|rd|th) level or higher as a part of activating the whip; if you do so, the suggestions this turn have their normal base duration\.$/
        ],
        // (Suggestion's own Will save is the whip's: a failure its course of action for the round — or, with a spell expended, the spell's own
        // minute, an hour on a critical failure. An incapacitation effect, as the spell is.)
        card: ([will, rank, , expend], _plan, { base, info, frequency }) => {
            const suggested = (duration) => ({ label: "Following a suggestion", text: `As a ${rank[1]}th-rank Suggestion that isn't linguistic: it follows the course of action its attacker suggests, which must seem logical to it and can't be self-destructive or obviously against its interest; it ends early once a finite suggestion is done or it turns self-destructive or plainly harmful.`, duration });
            const save = (failure, critical) => ({
                ...base,
                rank: Number(rank[1]),
                traits: [...new Set([...(base.traits ?? []), "incapacitation", "mental"])],
                activation: { time: "free", traits: [] },
                automation: { level: "automatic" },
                targeting: { target: "the animal the Strike hits", range: null, area: null },
                trigger: { event: "strike", on: ["success", "criticalSuccess"], cost: "free" },
                resolution: { kind: "save", check: { roll: "save", statistic: "will", basic: false, against: { dc: "fixed", value: Number(will[1]) } }, outcomes: { criticalSuccess: none(), success: none(), failure: { ...none(), noteEffects: [suggested(failure)] }, criticalFailure: { ...none(), noteEffects: [suggested(critical)] } } }
            });
            const way = (name, failure, critical) => ({ name, html: `<p><strong>Effect</strong> ${name}.</p>`, plan: strikeCard(base, info, frequency, { every: true, until: "turn-end", missKeeps: true, against: ["animal"], save: save(failure, critical), lines: ["Its Strikes at animals this turn: each hit's Will save, a failure's Suggestion as the whip casts it"] }) });
            return {
                ...base,
                builtin: "ways",
                automation: { level: "automatic" },
                targeting: { target: null, range: null, area: null },
                trigger: { event: "use", ...(frequency ? { frequency } : {}) },
                ways: [
                    way("Its suggestions for 1 round", timeOf(1, "round"), timeOf(1, "round")),
                    way(`A ${expend[1]}th-rank or higher spell expended: their normal time`, timeOf(1, "minute"), timeOf(1, "hour"))
                ],
                item: info
            };
        }
    },
    {
        names: ["Ankylostar"],
        over: (plan) => plan?.builtin === "no-effect",
        sentences: [
            /^The ankylostar's length extends as you swing the club in a wide arc\.$/,
            /^You Strike up to (three|\d) creatures in a (\d+)-foot cone; this counts as one attack for the purpose of calculating your multiple attack penalty\.$/,
            /^Alternatively, you Shove up to (?:three|\d) creatures in a \d+-foot cone, rolling a separate Athletics check for each creature\.$/
        ],
        card: ([, sweep], plan, { base, info, frequency, options }) => {
            const count = { three: 3 }[sweep[1]] ?? Number(sweep[1]);
            const cone = Number(sweep[2]);
            const own = { ...info, ...(plan?.item ?? {}) };
            const shove = itemActionPlan("<p>You attempt to Shove the creature.</p>", base, options);
            if (!shove?.action) return null;
            const strikes = strikeCard(base, own, null, { range: "melee", uses: count, volley: { different: true, cone, mapHeld: true }, lines: ["They count as one attack for its multiple attack penalty: roll each at the same penalty"] });
            return {
                ...base,
                builtin: "ways",
                automation: { level: "automatic" },
                targeting: { target: null, range: null, area: null },
                trigger: { event: "use", ...(frequency ? { frequency } : {}) },
                ways: [
                    { name: `Strike up to ${count} creatures in the ${cone}-foot cone`, html: `<p><strong>Effect</strong> Strike up to ${count} creatures in a ${cone}-foot cone.</p>`, plan: strikes },
                    { name: `Shove up to ${count} creatures in the ${cone}-foot cone`, html: `<p><strong>Effect</strong> Shove up to ${count} creatures in a ${cone}-foot cone.</p>`, plan: { ...shove, notes: [...(shove.notes ?? []), `Up to ${count} creatures in the ${cone}-foot cone, an Athletics check for each: use PF2e's Shove again for each other one, at the same multiple attack penalty`], item: own } }
                ],
                item: own
            };
        }
    },
    {
        names: ["Soulfeeding Mask: Devour Soul"],
        over: (plan) => plan?.resolution?.kind === "save" && (plan.notes ?? []).length === 1 && !plan.userAfter,
        sentences: [
            /^The soulfeeding mask ?'s eyes and jaw open wide\b.*\bwithin \d+ feet\.$/,
            /^That creature takes (\d+) void damage with a @Check\[fortitude\|dc:\d+\|basic[^\]]*\] save\.$/,
            /^If the target is undead or otherwise has void healing, this activation loses the death and void traits and gains the vitality trait, and the target takes (\d+) vitality damage with a @Check\[fortitude\|dc:\d+\|basic[^\]]*\] save\.$/,
            /^If the target takes any damage, you become Quickened for (\d+) minutes? and can use the extra action each round for only Stride actions, unless the damage killed the creature, in which case you can also use the extra action each round for Strike actions as well\.$/
        ],
        card: ([, , vitality, quick], plan) => {
            const { notes: _notes, ...rest } = plan;
            return whole({
                ...rest,
                // (Any damage, by its basic save: a success or worse.)
                userAfter: { degrees: ["success", "failure", "criticalFailure"], slug: "quickened", duration: timeOf(quick[1], "minutes"), words: "Quickened from Devour Soul: the extra action only to Stride", slainWords: "Quickened from Devour Soul, whose damage slew the creature: the extra action only to Stride or Strike" },
                // (An undead takes vitality damage instead; one with void healing that isn't undead, the GM's pick of the type.)
                ifTarget: [...(plan.ifTarget ?? []), { traits: ["undead"], formula: `${vitality[1]}[vitality]` }],
                notes: ["A creature with void healing that isn't undead (a rare few) takes the vitality damage too: change the damage's type for it."]
            });
        }
    },
    {
        names: ["Moonkeep Lily"],
        over: (plan) => !plan,
        sentences: [
            /^These magical flowers are infused with the power to counteract the curse of the werecreature\.$/,
            /^Intentionally growing these flowers is nearly impossible\b.*\.$/,
            /^They occasionally grow in places where a particular powerful werecreature is buried\b.*\.$/,
            /^This thin, white lily has stamens that end in small, round portions resembling the moon\.$/,
            /^When you eat the flower, you gain the flower's protection for (\d+) weeks?\.$/,
            /^During this time, your curse of the werecreature becomes partially inert\.$/,
            /^Your jaws Strike doesn't inflict the curse of the werecreature during this time\.$/
        ],
        card: ([, , , , week], _plan, { base, info }) => ({
            ...base,
            automation: { level: "automatic" },
            trigger: { event: "use" },
            targeting: { target: null, range: null, area: null },
            resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), noteEffects: [{ label: "Moonkeep lily", text: "Its curse of the werecreature is partly inert: its jaws Strike doesn't pass on the curse.", duration: timeOf(7 * Number(week[1]), "days") }] } } },
            item: info
        })
    },
    {
        // (Its second activation only — its first, a bomb dropped, another reading's: a one-off under a key of its own.)
        names: ["Bomber's Saddle"],
        over: (plan) => !plan && Boolean(oneOff("Bomber's Saddle (payload)")),
        sentences: [
            /^You drop the saddle's entire payload, scattering the bombs below\.$/,
            /^Make a single ranged Strike against an AC of (\d+)\.$/,
            /^The AC increases by 1 for every 5 feet above the target area you are\.$/,
            /^On a failure, the bombs fly away wildly and deal no damage\.$/,
            /^On a successful attack roll, the bombs fall and shatter, starting in the target area and moving in a line of 5-foot spaces up to (\d+) feet long for six bombs, one bomb per space\.$/,
            /^The bombs don't directly hit any creatures; instead, creatures take splash damage from the bombs as usual, but combine the splash damage from multiple overlapping bombs together before applying weaknesses or resistances\.$/,
            /^Apply any effects normally applied to splash damage when throwing a bomb \(such as the effects of the Calculated Splash feat\)\.$/
        ],
        card: ([, ac, , , line], _plan, { base, info, frequency }) => ({
            ...base,
            automation: { level: "automatic" },
            targeting: { target: null, range: null, area: null },
            trigger: { event: "use", ...(frequency ? { frequency } : {}) },
            resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
            notes: [
                `All its bombs (two to six) dropped at once: one ranged Strike against AC ${ac[1]}, 1 higher for every 5 feet its user is above the target area. A failure: they fly off and deal nothing.`,
                `A hit: they shatter in a line of 5-foot squares from the target area, one bomb a square (${line[1]} feet for six). None hits a creature directly; each creature takes the splash of the bombs around it, those that overlap added up before its weaknesses and resistances, with what adds to a bomb's splash (Calculated Splash).`
            ],
            decided: "one-off",
            item: info
        })
    }
];

// Whether a reading is for this source name (an activation's "Item: Activation").
export const hasBookStrikesReading = (name) => READINGS.some((reading) => reading.names.includes(name));

// Its sentences as one reading's, each matched in order → the matches, or null.
function matched(reading, sentences) {
    if (sentences.length !== reading.sentences.length) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? found : null;
}

// The plan and the activation's (or consumable's) html → the reading's card, or the same plan. name: its source name; kind "activation" or
// "consumable"; base, info, frequency: its own (lasting.js activationBase, or a consumable's basePlan and itemInfo); item: the item.
export function withBookStrikes(plan, { name, html, kind = "activation", base, info, frequency = null, item = null, options = {} }) {
    const readings = READINGS.filter((reading) => reading.names.includes(name) && (!reading.over || reading.over(plan)));
    if (!readings.length) return plan;
    for (const reading of readings) {
        const words = reading.words ? reading.words(html) : effectWords(html, kind);
        const found = matched(reading, words ? sentencesOf(words) : []);
        const card = found ? reading.card(found, plan, { base, info, frequency, item, html, options }) : null;
        if (card) return card;
    }
    return plan;
}

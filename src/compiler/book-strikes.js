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
// - Necrobinding Serum: coated as an injury poison; on its undead's save, the success's –1 status penalty to attack rolls against its user (a
//   toggle on a note Effect till the start of its user's next turn), the failures' attitude by kind — a note Effect for a mindless undead's
//   8 or 24 hours, another for the others' 10 minutes or hour (plan.ifTarget, src/live/if-target.js) — and none for a creature that isn't undead.
// Pure.

import { effectWords, sentencesOf } from "./lasting.js";
import { timeOf, zoneOf } from "./area-readings.js";
import { plainText } from "./rows.js";

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
export function withBookStrikes(plan, { name, html, kind = "activation", base, info, frequency = null, item = null }) {
    const readings = READINGS.filter((reading) => reading.names.includes(name) && (!reading.over || reading.over(plan)));
    if (!readings.length) return plan;
    for (const reading of readings) {
        const words = reading.words ? reading.words(html) : effectWords(html, kind);
        const found = matched(reading, words ? sentencesOf(words) : []);
        const card = found ? reading.card(found, plan, { base, info, frequency, item, html }) : null;
        if (card) return card;
    }
    return plan;
}

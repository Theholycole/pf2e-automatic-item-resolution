// Unique items' and artifacts' activations, built in full (2026-10-27, docs/needs.md; the user: "unique effects that are on unique rarity
// items should be automated … They are special and should feel special to players"): each one read sentence by sentence as
// src/compiler/lasting.js reads its own — every sentence of its effect one of the reading's, in order, none dropped — into what its cards
// play: its user's own check against a set DC, picked of the skills its words allow (Essence Prism's "You must succeed at a secret DC 30 skill
// check with a skill associated with a magical tradition that uses the essence you chose"), the creatures' conditions and note Effects for
// their time, casts, counteracts and the card's lines for the map and the GM's discretion. Over whatever the readers before made of it
// (a reading here is the item's whole reading). Live: the item card, the ability module's save card (plan.ownSave: at its user's own token,
// scripts/poisons.js), the spell module's casts. Pure.

import { effectWords, sentencesOf } from "./lasting.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours", day: "days", days: "days" };
const WORDS = { a: 1, an: 1, one: 1, two: 2, ten: 10 };
const timeOf = (value, unit) => ({ mode: "fixed", value: WORDS[String(value).toLowerCase()] ?? Number(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
const note = (label, text, duration = null, extra = {}) => ({ label, text, duration, ...extra });
const SPELL = (id, name) => ({ uuid: `Compendium.pf2e.spells-srd.Item.${id}`, name });
const SKILL_LABEL = { arcana: "Arcana", nature: "Nature", occultism: "Occultism", religion: "Religion" };

// Its user's own check against a set DC (the save card at its own token, plan.ownSave), one of several skills picked on the card
// (plan.checkChoices): each choice's label and statistic, and its rows by degree.
function ownCheck({ choices, dc, rows, secret = false, target = "you" }) {
    const resolutionOf = (statistic, choice) => ({ kind: "save", check: { roll: "save", statistic, basic: false, against: { dc: "fixed", value: dc }, ...(secret ? { secret: true } : {}) }, sharedDamage: null, outcomes: rows(choice) });
    return {
        targeting: { target, range: null, area: null },
        ownSave: true,
        resolution: resolutionOf(choices[0].statistic, choices[0]),
        ...(choices.length > 1 ? { checkChoices: choices.map((choice) => ({ label: choice.label, resolution: resolutionOf(choice.statistic, choice) })) } : {})
    };
}

// A row of its own for the creatures it's for (or its user): its note Effects and conditions.
const ownRow = ({ noteEffects = [], effects = [], target = null, notes = [] }) => ({
    targeting: { target, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects, ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {})
});

// (The four essences and the traditions' skills that use each: arcane material and mental, divine spiritual and vital, occult mental and
// spiritual, primal material and vital.)
const ESSENCES = [["mental", ["arcana", "occultism"]], ["material", ["arcana", "nature"]], ["spiritual", ["occultism", "religion"]], ["vital", ["nature", "religion"]]];

const READINGS = [
    {
        // (Its user's secret skill check, DC 30, the skill one of a tradition using the essence picked: the card's pick of the eight. A success
        // sets the prism for the quality chosen, a failure for another — the GM's, the check being secret.)
        name: "Essence Prism",
        index: 0,
        sentences: [
            /^You alter and rearrange the facets of the essence prism, adjusting the essences to select for a single quality, which might be associated with mental essence\b.*\bmaterial essence\b.*\bvital essence\b.*\bspiritual essence\b.*\.$/,
            /^You must succeed at a secret DC (\d+) skill check with a skill associated with a magical tradition that uses the essence you chose\b.*\.$/,
            /^On a failure, you accidentally set the prism for some other quality\.$/
        ],
        card: ([, check]) => {
            const set = (essence, right) => ({ ...none(), noteEffects: [note("Essence Prism", right ? `The prism is set for the quality its user chose, of ${essence} essence (a personality trait, a physical quality, a belief or instinct, or an alignment component such as good or lawful), until it's set again. Its next refraction splits a creature by that quality.` : `The prism is set for some other quality than the one its user chose (of ${essence} essence) — the GM's pick, kept secret — until it's set again. Its next refraction splits a creature by that quality.`)] });
            const choices = ESSENCES.flatMap(([essence, skills]) => skills.map((statistic) => ({ label: `${essence.charAt(0).toUpperCase()}${essence.slice(1)} essence: ${SKILL_LABEL[statistic]}`, statistic, essence })));
            return {
                ...ownCheck({ choices, dc: Number(check[1]), secret: true, rows: ({ essence }) => ({ criticalSuccess: set(essence, true), success: set(essence, true), failure: set(essence, false), criticalFailure: set(essence, false) }) }),
                notes: ["Pick the essence of the quality and the skill of a tradition that uses it (arcane: material, mental; divine: spiritual, vital; occult: mental, spiritual; primal: material, vital). The check is secret: the GM rolls it and keeps the result.", "Its user names the quality to the GM."]
            };
        }
    },
    {
        // (One encased creature split in two over the hour: Paralyzed in its cocoon and its note Effect for the hour; the two new creatures the
        // GM's to place, by the text's levels.)
        name: "Essence Prism",
        index: 1,
        sentences: [
            /^Over the course of the next (hour|\d+ hours), the creature in the input stream has its essences refracted through the prism, creating two cocoons of magic in the output streams that each contain a new creature\.$/,
            /^At the end of the process, the original creature is gone, and the two new creatures break free of their cocoons\.$/,
            /^Each creature is part of the original, separated from the rest based on the last quality set by the prism's first activation\.$/,
            /^For instance, if you set the prism to "good", one creature would have all the original creature's good aspects and the other would be the original creature's evil side\.$/,
            /^Unless you selected a physical quality, both new creatures look just like the original\.$/,
            /^The new creatures are usually (\d+) levels lower than the original, but if the original creature was strongly biased with respect to the quality you chose\b.*?, the stronger creature is (\d+) level lower and the weaker creature is (\d+) or more levels lower\.$/,
            /^If calibrated correctly, this activation can also reverse the effect of the third activation\.$/
        ],
        card: ([over, , , , , levels]) => {
            const hour = over[1] === "hour" ? timeOf(1, "hour") : timeOf(over[1].split(" ")[0], "hours");
            return ownRow({
                target: "the creature encased in the input stream",
                effects: [{ kind: "condition", slug: "paralyzed", value: null, duration: hour }],
                noteEffects: [note("Refracted", `Encased in the input stream, its essences refracted through the prism into two cocoons in the output streams. When this ends it's gone: two new creatures break free, each part of it, split by the quality the prism was last set for (one with that quality, the other with the rest — its good and its evil side, say). They look just like it unless the quality was a physical one. Each is ${levels[1]} levels lower than it; if it was strongly biased in that quality, the stronger is ${levels[2]} level lower and the weaker ${levels[3]} or more (the GM may change these).`, hour)],
                notes: ["When the hour is up, remove its token and place the two new creatures in the output streams (the GM builds them at those levels).", "Calibrated right, this also undoes a combining (the third activation): the GM's call."]
            });
        }
    },
    {
        // (Two encased creatures combined over the hour: each Paralyzed and its note Effect; the new creature the GM's to place.)
        name: "Essence Prism",
        index: 2,
        sentences: [
            /^Over the course of the next (hour|\d+ hours), the essences of both creatures in the input streams are refracted through the prism, creating a cocoon of magic in the output stream that contains a new creature\.$/,
            /^At the end of the process, the original creatures are gone, and the new creature breaks free of its cocoon\.$/,
            /^The new creature is an amalgam of the originals, with a new personality blended from both, and is usually (\d+) or (\d+) levels higher than the higher level of the original creatures unless the lower-level creature was much weaker\.$/,
            /^This activation also reverses the effect of the second activation\.$/
        ],
        card: ([over, , higher]) => {
            const hour = over[1] === "hour" ? timeOf(1, "hour") : timeOf(over[1].split(" ")[0], "hours");
            return ownRow({
                target: "the two creatures encased in the input streams",
                effects: [{ kind: "condition", slug: "paralyzed", value: null, duration: hour }],
                noteEffects: [note("Refracted", `Encased in an input stream, its essences refracted through the prism with the other creature's into one cocoon in the output stream. When this ends both are gone: a new creature breaks free, an amalgam of the two with a personality blended from both, ${higher[1]} or ${higher[2]} levels higher than the higher-level one — less if the lower-level one was much weaker (the GM may change this).`, hour)],
                notes: ["When the hour is up, remove both tokens and place the new creature in the output stream (the GM builds it at that level).", "It also undoes a splitting (the second activation)."]
            });
        }
    },
    {
        // (Its fascination's save again at a creature looking into it, even one that saved: the item's DC 35 Will save from its own words,
        // Fascinated while the mirror's in view, hostile actions not ending it — a DC 30 Will save does.)
        name: "Mirror of Sorshen: Second Glance",
        sentences: [/^You force a creature looking at the mirror to attempt an additional Will save against the mirror's fascination effect, even if they succeeded at their save\.$/],
        card: (found, plan, { text }) => {
            const save = /\bObservers are Fascinated by the images in the mirror unless they succeed at a @Check\[will\|dc:(\d+)\] save each round\./.exec(text);
            const end = /\binstead, they can attempt a @Check\[will\|dc:(\d+)\] save to end the fascination\./.exec(text);
            if (!save || !end) return null;
            const fascinated = () => ({ ...none(), effects: [{ kind: "condition", slug: "fascinated", value: null, duration: null }], noteEffects: [note("Entranced", `Fascinated by what it sees in the Mirror of Sorshen: it stares blankly at the mirror for as long as the mirror stays in view, and if the mirror leaves its view, it stares toward where it last saw it for several minutes more (then remove this and Fascinated). Hostile actions against it or its allies don't end this fascination: instead it can attempt a DC ${end[1]} Will save to end it.`)] });
            return {
                targeting: { target: "a creature looking at the mirror", range: null, area: null },
                addTraits: ["emotion", "incapacitation", "visual"],
                resolution: { kind: "save", check: { roll: "save", statistic: "will", basic: false, against: { dc: "fixed", value: Number(save[1]) } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: fascinated(), criticalFailure: fascinated() } },
                notes: [`Each round a creature looks into the mirror it saves again at DC ${save[1]} (this card, pressed for it).`, "At the GM's discretion, a truly innocent creature or one that has renounced all worldly pleasures may be immune."]
            };
        }
    },
    {
        // (Dominate's critical failure for 30 days at a creature the mirror holds: Controlled for the time, its terms on a note Effect.)
        name: "Mirror of Sorshen: Irresistible Desire",
        sentences: [
            /^You control the target for (\d+) days, with the effect of a critically failed saving throw against Dominate\.$/,
            /^If the victim sees the mirror again at any point before this duration expires, the control extends for an additional (\d+) days from the moment it looked at the mirror again\.$/,
            /^While there is no initial saving throw, the DC to break free due to commands against the creature's nature is (\d+)\.$/
        ],
        card: ([days, again, free]) => {
            const time = timeOf(days[1], "days");
            return ownRow({
                target: "the creature fascinated by the mirror",
                effects: [{ kind: "condition", slug: "controlled", value: null, duration: time }],
                noteEffects: [note("Irresistible Desire", `Controlled by the mirror's owner, as Dominate's critical failure: it obeys their orders, and an obviously self-destructive one leaves it doing nothing until a new order. Only an order against its nature (killing its allies, say) lets it attempt a DC ${free[1]} Will save to break free, ending this. Each time it sees the mirror again before this ends, it lasts ${again[1]} days more from that moment (reset this Effect's time).`, time)],
                notes: ["Only a creature the mirror has Fascinated: no initial save."]
            });
        }
    },
    {
        // (A Binding Circle its user begins: its casting time and secondary casters on its user for the hour it now takes.)
        name: "Radiant Spark",
        index: 1,
        sentences: [/^The Radiant Spark reduces the casting time of the ritual to (\d+) (hours?|minutes?), and you don't need secondary casters for this ritual\.$/],
        card: ([time]) => ownRow({ noteEffects: [note("Radiant Binding", `The Binding Circle ritual its user has begun takes only ${time[1]} ${time[2]} to cast, and needs no secondary casters.`, timeOf(time[1], time[2]))] })
    },
    {
        // (Its essence consumed after a critical failure against its dominate or a critical success at binding it: a DC 49 Will save, Drained 2
        // on a success, death on a failure — its return only by Wish or Miracle, or not until the Spark is destroyed —, immune 24 hours.)
        name: "Radiant Spark",
        index: 2,
        sentences: [
            /^The target must attempt a @Check\[will\|dc:(\d+)\] save and is immune to further attempts for (\d+) hours\.$/,
            /^Critical Success The target is unaffected\.$/,
            /^Success The target is Drained (\d+)\.$/,
            /^Failure The target dies and its essence is trapped within the Radiant Spark\.$/,
            /^It can be brought back to life only with powerful magic such as Wish or Miracle\.$/,
            /^Critical Failure As failure, and the target can't be brought back to life until the Radiant Spark is destroyed\.$/
        ],
        card: ([save, , drained]) => {
            const dies = (words) => ({ ...none(), terminal: { kind: "death" }, noteEffects: [note("Essence Consumed", words)] });
            return {
                targeting: { target: "the creature dominated or bound", range: null, area: null },
                resolution: {
                    kind: "save",
                    check: { roll: "save", statistic: "will", basic: false, against: { dc: "fixed", value: Number(save[1]) } },
                    sharedDamage: null,
                    outcomes: {
                        criticalSuccess: none(),
                        success: { ...none(), effects: [{ kind: "condition", slug: "drained", value: Number(drained[1]), duration: null }] },
                        failure: dies("Dead, its essence trapped within the Radiant Spark: only powerful magic such as Wish or Miracle can bring it back to life."),
                        criticalFailure: dies("Dead, its essence trapped within the Radiant Spark: nothing can bring it back to life until the Radiant Spark is destroyed.")
                    }
                },
                trigger: { immunity: { scope: "target", raw: save[0], duration: { value: Number(save[2]), unit: "hours" }, degrees: ["criticalSuccess", "success", "failure", "criticalFailure"], against: "all", slug: "radiant-spark-consumption" } }
            };
        }
    },
    {
        // (Temporary Hit Points four times the counteract rank of the darkness or shadow effect it touches, for the hour — typed on the card, read
        // before (plan.item.levelTemp) —, and the darkness it counteracts around its user while they last: a note Effect beside them, in place of
        // the whole text's reminder.)
        name: "Shadowpiercer: Absorb Shadows",
        sentences: [
            /^You touch Shadowpiercer to a darkness or shadow effect to siphon its energy and bolster yourself\.$/,
            /^You gain a number of temporary Hit Points equal to (four|three|two|\d+) times the effect's counteract rank\.$/,
            /^These temporary Hit Points last for (\d+) (hours?|minutes?)\.$/,
            /^In addition, if the effect is causing darkness, that darkness is automatically counteracted within (\d+) feet of you for as long as you have those temporary Hit Points\.$/,
            /^This doesn't provide light - it merely restores the area to its natural illumination level\.$/
        ],
        card: ([, , last, within], plan) => {
            const temp = plan?.item?.levelTemp?.[0];
            const row = plan?.resolution?.outcomes?.success;
            if (!temp || temp.from !== "amount" || !row) return null;
            const darkness = note("Absorbed Shadows", `While it keeps the temporary Hit Points Shadowpiercer gave it, the darkness of the effect it siphoned is counteracted within ${within[1]} feet of it: the area there is back to its natural light, not lit (remove this once they're gone).`, timeOf(last[1], last[2]));
            return {
                keep: true,
                resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, noteEffects: [...(row.noteEffects ?? []).filter((entry) => !entry.reminder), darkness] } } },
                unread: undefined,
                partial: undefined,
                automation: { level: "automatic" }
            };
        }
    },
    {
        // (The triggering darkness or shadow effect counteracted at +46, rank 10, for a Mythic Point — or, with none to spend, Drained 2: the
        // ways card's two buttons, each the free counteract card.)
        name: "Shadowpiercer: Rebuff Gloom",
        sentences: [
            /^Spend a Mythic Point; the spear drains your vitality to counteract the effect\.$/,
            /^You can attempt to counteract the effect \(\+(\d+) modifier level, counteract rank (\d+)\)\.$/,
            /^You can activate this effect without having a Mythic Point available but doing so makes you Drained (\d+)\.$/
        ],
        card: ([, numbers, drained], plan) => {
            const counteract = { modifier: Number(numbers[1]), rank: Number(numbers[2]), conditions: [], traits: [], afflictions: [], free: { name: "the darkness or shadow effect" }, pick: "one" };
            const way = (name, extra) => ({ name, plan: { builtin: "counteract", automation: { level: "automatic" }, targeting: { target: "the drinker", range: null, area: null }, trigger: { event: "use" }, item: { ...(plan?.item ?? {}), counteract }, ...extra } });
            return {
                builtin: "ways",
                once: true,
                targeting: { target: null, range: null, area: null },
                ways: [way("Spend a Mythic Point", { spend: { mythicPoints: 1 } }), way(`With no Mythic Point: Drained ${drained[1]}`, { userEffects: [{ kind: "condition", slug: "drained", value: Number(drained[1]) }] })],
                notes: ["Only while its user isn't Drained (its Requirements).", "At the darkness or shadow effect targeting its user or an ally within 60 feet."]
            };
        }
    },
    {
        // (A Gate to the Harrowed Realm: the spell module's Gate, from any other plane.)
        name: "Deck of Harrowed Tales",
        sentences: [/^If on a plane other than the Harrowed Realm, the deck creates a Gate to the Harrowed Realm\.$/],
        card: () => ({ builtin: "cast-spell", spell: SPELL("U13bC0tNgrlHoeTK", "Gate"), rank: 10, dc: null, attack: null, tradition: null, self: false, area: false, targets: false, notes: ["Only on a plane other than the Harrowed Realm: its gate opens onto the Harrowed Realm."] })
    },
    {
        // (A fear effect at its user turned back: Frightened, and the Effects that give it, gone from its user and the effect's other targets —
        // counteracted outright —; the effect's save at its creator, as its only target, the GM's to run until the ability and spell modules
        // can re-aim a card in the chat.)
        name: "Cayden's Tankard",
        index: 0,
        sentences: [
            /^Calmly swigging a drink on the battlefield turns your foe's attempt to frighten you against them\.$/,
            /^The fear effect is counteracted for all targets, and the creature that created the effect must attempt a saving throw as if it alone were the original target of the effect\.$/
        ],
        card: () => {
            const reduce = [{ slug: "frightened", by: "all", granter: "ends" }, { slug: "frightened", by: "all", who: "targets", optional: true, granter: "ends" }];
            return {
                targeting: { target: null, range: null, area: null },
                resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
                reduce,
                item: { reduce },
                notes: ["Target the fear effect's other targets: it's counteracted for all of them, no check (Frightened it gave ends, with the Effects that give it).", "Its creator attempts the fear effect's saving throw as though it were its only target: post that effect's save at it (its DC and results)."],
                partial: true,
                automation: { level: "guided" }
            };
        }
    },
    {
        // (The conditions it ends, read before — src/compiler/reduce.js —, and the effects that give them ending too: each one's Effect deleted;
        // an item that made it, lower in level, kept from making it for a week, a line; an Escape still needed, and its use while paralyzed,
        // lines of the card.)
        name: "Cayden's Tankard",
        index: 1,
        sentences: [
            /^You drink from the tankard, ending the controlled, Grabbed, Immobilized, Paralyzed, Restrained, and slowed conditions on yourself and creatures of your choice within (\d+) feet of you, as well as anything giving such targets a circumstance penalty to Speed\.$/,
            /^Any effect causing these conditions ends, and if the source of the effect is an item, that item can't produce the effect for (\d+) weeks?, provided it is of a level lower than the tankard's\.$/,
            /^If a target needs to Escape an effect imposing any of these conditions, it automatically does so on its next attempt\.$/,
            /^You can Activate this ability even if one of the listed conditions would normally prevent you from doing so \(such as paralyzed\)\.$/
        ],
        card: ([within, week], plan) => {
            if (!(plan?.reduce ?? []).length) return null;
            const ends = (entry) => ({ ...entry, granter: "ends", ...(Number(week[1]) ? { granterWeeks: Number(week[1]) } : {}) });
            return {
                keep: true,
                reduce: plan.reduce.map(ends),
                item: { ...plan.item, reduce: (plan.item?.reduce ?? plan.reduce).map(ends) },
                notes: [...(plan.notes ?? []), `Target the creatures of its user's choice within ${within[1]} feet.`, "A target that still needs to Escape an effect imposing one of these conditions succeeds at its next attempt automatically.", "It can be activated even while a listed condition (such as Paralyzed) would prevent it."]
            };
        }
    },
    {
        // (Energy it blocked sent back along a line of its user's choosing: the effect's own card aimed again at the creatures in its way, the
        // GM's until the ability and spell modules can re-aim a card in the chat.)
        name: "Scale of Igroon",
        index: 2,
        sentences: [/^You reflect the energy along a trajectory you choose\.$/, /^The effect travels only up to its remaining range, using its original parameters if it strikes other targets\.$/],
        card: () => ({
            targeting: { target: null, range: null, area: null },
            resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
            notes: ["After a Shield Block that kept its user from a line's, a ray's or a direct attack's energy damage (Force Barrage too): its user aims it along a new line, out to what's left of its range.", "It hits what it meets there with its own numbers: post that effect's card again at those creatures."],
            partial: true,
            automation: { level: "guided" }
        })
    },
    {
        // (Quandary at the fan's DC 34, for a minute at most: the spell module's cast; its Sustain the user's Strikes with the fan each round, the
        // spell module's to keep until it can be told so.)
        name: "Phoenix Fighting Fan",
        index: 0,
        sentences: [
            /^You call upon the fan's extradimensional powers to trap a creature in Hao Jin's repository\b.*\.$/,
            /^The fighting fan casts Quandary on a creature within (\d+) feet\.$/,
            /^The fan automatically Sustains the Spell as long as you Strike a creature with it each round\.$/,
            /^The @Check\[survival\|dc:(\d+)[^\]]*\] or @Check\[perception\|dc:\d+[^\]]*\] DC to escape the demiplane is \d+\.$/,
            /^The spell ends once the creature escapes, you fail to Strike a creature with the fan during a round, or after (\d+) minutes?, whichever comes first\.$/
        ],
        card: ([, within, , escape, most], plan) => {
            if (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Quandary") return null;
            return {
                keep: true,
                dc: Number(escape[1]),
                castRange: { feet: Number(within[1]) },
                castDuration: { value: Number(most[1]), unit: "minutes", said: [most[0]] },
                notes: [`The creature in the demiplane escapes with a Survival or Perception check against DC ${escape[1]}; it can't touch the relics Hao Jin keeps there.`, "The fan Sustains the spell for its user each round they Strike a creature with it: a round without such a Strike ends it (Sustain it by hand at each such Strike)."],
                partial: true,
                automation: { level: "guided" }
            };
        }
    },
    {
        // (One of nine terrains, and heat or cold, until its user's next daily preparations or its next use: an Effect ignoring that terrain's
        // difficult terrain — PF2e's own entry, which the environment module reads — with +2 circumstance to saves against what that terrain's
        // environment throws at it, and the protection from heat or cold the environment module reads; the ways card's eighteen.)
        name: "Slithermaw's Bane (Heroic): Terrain Adaptation",
        sentences: [
            /^You alter the exterior of the armor to better adapt to the surrounding terrain: aquatic, arctic, desert, forest, mountain, plains, sky, swamp, or underground\.$/,
            /^You ignore difficult terrain within the chosen environment and gain a \+(\d+) circumstance bonus to saving throws against environmental hazards, natural disasters, and extreme temperatures that originate from that terrain\.$/,
            /^You're also protected from severe and extreme heat or severe and extreme cold \(your choice when you activate this ability\)\.$/,
            /^This effect lasts until your next daily preparations or the next time you activate it, whichever comes first\.$/
        ],
        card: ([, bonus]) => {
            const terrains = [["aquatic", "Aquatic"], ["arctic", "Arctic"], ["desert", "Desert"], ["forest", "Forest"], ["mountain", "Mountain"], ["plain", "Plains"], ["sky", "Sky"], ["swamp", "Swamp"], ["underground", "Underground"]];
            const sides = [["heat", { "severe-heat": "mild-heat", "extreme-heat": "mild-heat" }], ["cold", { "severe-cold": "mild-cold", "extreme-cold": "mild-cold" }]];
            const way = ([key, label], [side, counts]) => ({
                name: `${label}, protected from ${side}`,
                plan: {
                    targeting: { target: null, range: null, area: null },
                    automation: { level: "automatic" },
                    trigger: { event: "use" },
                    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
                    temperature: { counts, duration: null, until: "Until its user's next daily preparations", untilRest: true, replaces: true },
                    item: {
                        ruleEffects: [{
                            name: "Terrain Adaptation",
                            words: `Adapted to ${label.toLowerCase()} terrain until its next daily preparations or next Terrain Adaptation: it ignores difficult terrain there, and gets a +${bonus[1]} circumstance bonus to saves against that terrain's environmental hazards, natural disasters and extreme temperatures`,
                            rules: [
                                { key: "ActiveEffectLike", mode: "add", path: "system.movement.terrain.difficult.ignored", value: { environment: key, feature: "all" } },
                                { key: "FlatModifier", selector: "saving-throw", type: "circumstance", value: Number(bonus[1]), predicate: [`terrain:${key}`, { or: ["environment", "origin:trait:environmental"] }], label: "Terrain Adaptation" }
                            ],
                            duration: null,
                            untilRest: true,
                            replaces: true
                        }]
                    }
                }
            });
            return { builtin: "ways", once: true, targeting: { target: null, range: null, area: null }, ways: terrains.flatMap((terrain) => sides.map((side) => way(terrain, side))), notes: ["Its save bonus holds where the scene or region is of that terrain (PF2e's environment types)."] };
        }
    },
];

// Whether a reading is for this source name (an activation's "Item: Activation").
export const hasArtifactReading = (name) => READINGS.some((entry) => entry.name === name);

// Its sentences as one reading's, each matched in order → the matches, or null.
function matched(reading, sentences) {
    if (sentences.length !== reading.sentences.length) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? found : null;
}

// The plan (whatever was read before) and its effect's words → the reading's card, or the same plan. name: its source name; index: an
// activation's place among its item's (for an item whose activations have no names); base, info, frequency: its own (lasting.js
// activationBase, or a consumable's basePlan and itemInfo); text: the item's whole plain text, for a rule its activation's words refer to.
export function withArtifactReading(plan, { name, index = null, words, text = "", base, info, frequency = null }) {
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of READINGS.filter((entry) => entry.name === name && (entry.index === undefined || entry.index === index))) {
        const found = matched(reading, sentences);
        const card = found ? reading.card(found, plan, { text }) : null;
        if (!card) continue;
        // (Over the plan read before, its own parts kept: Cayden's Tankard's conditions ended, src/compiler/reduce.js's.)
        if (card.keep) {
            const { keep, ...changes } = card;
            const next = { ...plan, ...changes };
            for (const key of Object.keys(changes)) if (changes[key] === undefined) delete next[key];
            return next;
        }
        const { item: own, trigger, addTraits, ...rest } = card;
        return {
            ...base,
            // (Its effect's own traits beside the item's, for the save card: the Mirror of Sorshen's incapacitation.)
            ...(addTraits ? { traits: [...new Set([...(base?.traits ?? []), ...addTraits])] } : {}),
            automation: { level: "automatic" },
            trigger: { event: "use", ...(frequency ? { frequency } : {}), ...(trigger ?? {}) },
            ...rest,
            item: { ...info, ...(own ?? {}) }
        };
    }
    return plan;
}

// Its effect's words, as src/compiler/lasting.js reads them.
export const artifactWords = (html, kind) => effectWords(html, kind);

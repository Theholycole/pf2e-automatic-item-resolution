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
    {
        // (Its user healed twice its level, read before, and its pledged follower's Hit Points lost by its level, nothing lowering them —
        // plan.item.hpLoss, PF2e's final damage at the creature targeted (scripts/live.js) —, its user's temporary Hit Points by its level if
        // that kills it; the follower's 24 hours' immunity its own (immunity.on "targets").)
        name: "The Rakshasa",
        sentences: [
            /^You regain (?:\d+ Hit Points|Hit Points equal to twice your level), and a pledged follower of your choice loses Hit Points equal to your level \(no effects apply that would decrease this Hit Point loss\)\.$/,
            /^If this loss kills your pledged follower, you also gain temporary Hit Points equal to your level\.$/,
            /^The pledged follower is temporarily immune to this activation for (\d+) hours\.$/
        ],
        card: (found, plan) => {
            const row = plan?.resolution?.outcomes?.success;
            if (!row || !(row.effects ?? []).some((effect) => effect.kind === "heal") || !plan.item?.immunity) return null;
            return {
                keep: true,
                resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, noteEffects: (row.noteEffects ?? []).filter((entry) => !entry.reminder) } } },
                item: { ...plan.item, hpLoss: { amount: { level: 1 }, killedTemp: { level: 1 }, who: "a pledged follower of its user's choice" }, immunity: { ...plan.item.immunity, on: "targets" } },
                notes: ["Target one of its user's pledged followers (named as The Rakshasa was invested: one, two from 15th level, three from 18th)."],
                unread: undefined,
                partial: undefined,
                automation: { level: "automatic" }
            };
        }
    },
    {
        // (Pernicious Poltergeist cast at its user's rank and DC, read before, and its area difficult terrain beside it: the ability module's
        // zone placed over the spell's 10-foot burst once it's cast, for the spell's minute — plan.castZone, scripts/casts.js.)
        name: "The Beating",
        sentences: [
            /^You wave the card to conjure up dozens of violent ghostly figures; you cast Pernicious Poltergeist, and the area of the spell is treated as difficult terrain in addition to its normal effects\.$/,
            /^The rank of the spell is one-half your level, rounded down \(minimum 6th level\), and the save DC is your class DC or spell DC\.(?:\s*@Check\[[^\]]*\])*$/
        ],
        card: (found, plan) => {
            if (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Pernicious Poltergeist" || !plan.castRank || !plan.castDC) return null;
            const zone = { area: { type: "burst", value: 10 }, centre: "placed", range: 60, lasts: timeOf(1, "minute"), untilReused: false, concealed: false, terrain: [{ movement: ["walk"], difficulty: 2 }], others: false, hazard: null, saves: [], damage: [], effect: null, modifiers: [], notes: ["Difficult terrain over Pernicious Poltergeist's area: it goes when the spell does."] };
            return {
                keep: true,
                castZone: { builtin: "zone", zone, source: plan.source, automation: { level: "automatic" }, trigger: { event: "use" } },
                notes: ["Its rank is half its user's level, rounded down (6th at least), its DC its user's class DC or spell DC.", "Its 10-foot burst is difficult terrain too: placed over it once it's cast."],
                partial: undefined,
                automation: { level: "automatic" }
            };
        }
    },
    {
        // (An object of 2 Bulk or less teleported from a creature: its user's Thievery against that creature's Reflex DC, read before, and the
        // drop card after it — the object its user picks of what the creature has, into its user's hand on a critical success, on the ground on
        // a success (plan.dropHeld one, take: scripts/drop-held.js) —; a failure's faltering grip a note Effect on it to the end of its turn.)
        name: "The Crows",
        sentences: [
            /^You hold the card in your hand, and with a flick of the wrist it vanishes, only to be replaced by an object of your choice within (\d+) feet\.$/,
            /^The object must be (\d+) Bulk or less\.$/,
            /^If that object is unattended, it teleports into your hand automatically\.$/,
            /^If the object is attended by a creature, you must make a @Check\[thievery\|defense:reflex\] check against the creature's Reflex DC\.$/,
            /^Critical Success The object teleports into your hand\.$/,
            /^Success The object vanishes from the target's possession and lands on the ground at a point at a midway point between you two\.$/,
            /^Failure The object does not vanish, but the creature's grip on it falters and if it doesn't spend an Interact action on its next turn to grip the item, it drops to the ground\.$/,
            /^Critical Failure You fail to manipulate the object entirely\.$/
        ],
        card: ([within, bulk], plan) => {
            const check = plan?.resolution?.check;
            if (plan?.resolution?.kind !== "check" || check?.statistic !== "thievery" || check.against?.statistic !== "reflex") return null;
            const clean = (row) => ({ ...row, manualInstructions: undefined });
            const outcomes = Object.fromEntries(Object.entries(plan.resolution.outcomes).map(([degree, row]) => [degree, clean(row)]));
            outcomes.failure = { ...outcomes.failure, noteEffects: [note("Faltering grip", "Its grip on the object The Crows reached for falters: unless it spends an Interact action this turn to grip it, it drops it at the end of the turn.", { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" })] };
            for (const degree of Object.keys(outcomes)) if (!outcomes[degree].manualInstructions) delete outcomes[degree].manualInstructions;
            return {
                keep: true,
                targeting: { ...plan.targeting, range: `${within[1]} feet` },
                resolution: { ...plan.resolution, outcomes },
                dropHeld: { degrees: ["criticalSuccess", "success"], take: ["criticalSuccess"], one: true, attended: true, maxBulk: Number(bulk[1]), said: "the object" },
                notes: [`An unattended object within ${within[1]} feet (${bulk[1]} Bulk or less) teleports into its user's hand, no check: move it to their sheet.`, "Target the creature that has the object; after the check, tick the object on the next card."],
                partial: undefined,
                automation: { level: "automatic" }
            };
        }
    },
    {
        // (An item of 1 Bulk or less that falls within reach, or a thrown weapon that missed, caught: the drop card at the creature it came from,
        // into its user's hand — the automatic row's only work, plan.dropHeld take.)
        name: "The Juggler",
        sentences: [
            /^You grab the triggering item\.$/,
            /^If all of your hands are full \(including any extra free hands from The Juggler\), you must immediately release an item, which can include the triggering item\.$/
        ],
        card: (found, plan, { text }) => {
            const bulk = /\bTrigger an item of (\d+) Bulk or less falls within your reach\b/.exec(text) ?? /\bof (\d+) Bulk or less\b/.exec(text);
            return {
                targeting: { target: "the creature the item came from", range: null, area: null },
                resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
                dropHeld: { degrees: ["success"], take: ["success"], one: true, attended: true, ...(bulk ? { maxBulk: Number(bulk[1]) } : {}), said: "the triggering item" },
                notes: ["Target the creature the item fell from (or whose thrown weapon missed), then tick the item on the next card.", "With every hand full (The Juggler's extra free hands too), its user releases an item at once, the caught one if they like."]
            };
        }
    },
    {
        // (An item of PF2e's in its user's hand for a minute, any common permanent one of Light Bulk at most two levels below its user's: the
        // objects card's pick (scripts/objects.js), gone when the minute's up or it's dropped.)
        name: "The Wanderer",
        sentences: [
            /^You do a quick bit of legerdemain with The Wanderer ?\.$/,
            /^As the card appears to disappear from your hand, it's immediately replaced by an object of Light bulk in your hand\.$/,
            /^The object can be any Common permanent magic item, weapon, or piece of gear of a level no higher than your level -(\d+)\.$/,
            /^The item exists for (\d+) (minutes?|rounds?|hours?), or until it is no longer attended by you, at which point the item vanishes and The Wanderer reappears in your possession\.$/
        ],
        card: ([, , below, lasts]) => ({
            builtin: "objects",
            targeting: { target: null, range: null, area: null },
            objects: { op: "create", choose: { any: { rarity: "common", levelsBelow: Number(below[1]), maxBulk: 0.1 } }, lasts: { value: Number(lasts[1]), unit: UNITS[lasts[2].toLowerCase()] }, whileAttended: true },
            notes: ["The Wanderer seems to vanish from its user's hand while the object lasts, and is back with them once it's gone."]
        })
    },
    {
        // (Temporary Hit Points twice the level of the creature it felled, read before — three times while its user holds Fleshrender in its
        // other hand, the card's look at its held items: levelTemp ifHeld —, for the minute.)
        name: "Blood-Drinker: Drink Blood",
        sentences: [
            /^You gain a number of temporary Hit Points equal to twice the creature's level\.$/,
            /^If you're also wielding (Fleshrender) in your other hand, you instead gain temporary Hit Points equal to (three|four) times the creature's level\.$/,
            /^These Hit Points remain for (\d+) (minutes?|rounds?|hours?)\.$/
        ],
        card: ([, other], plan) => {
            const entry = plan?.item?.levelTemp?.[0];
            const row = plan?.resolution?.outcomes?.success;
            if (!entry || entry.multiplier !== 2 || entry.from === "amount" || !row) return null;
            return {
                keep: true,
                resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, noteEffects: (row.noteEffects ?? []).filter((one) => !one.reminder) } } },
                item: { ...plan.item, levelTemp: [{ ...entry, ifHeld: { name: other[1], multiplier: { three: 3, four: 4 }[other[2].toLowerCase()] } }] },
                notes: ["Target the creature it reduced to 0 Hit Points: its level counts."],
                unread: undefined,
                partial: undefined,
                automation: { level: "automatic" }
            };
        }
    },
    {
        // (A building of up to ten contiguous 10-foot cubes within 1,000 feet, until the next: the structure card's shapes of that size —
        // square, one to ten stories —, the environment module's hewn stone walls and stone door where its user clicks, the last one gone
        // first (scripts/structure.js).)
        name: "Guiding Chisel",
        sentences: [
            /^You embed the Guiding Chisel in the ground and imagine a building\.$/,
            /^After (\d+) minutes, you remove the chisel and the building appears\.$/,
            /^The building can take any shape you wish, filling up to (ten|\d+) contiguous (\d+)-foot cubes within ([\d,]+) feet of the chisel\.$/,
            /^The building lasts until you use the chisel to create another building\.$/,
            /^This building has the structure trait\.$/
        ],
        card: ([, , cubes]) => {
            const count = WORDS[cubes[1].toLowerCase()] ?? Number(cubes[1]);
            const side = Number(cubes[2]);
            // (Each square of it as tall as the cubes allow: 30 feet across one story high (9), 20 across two (8), 10 across ten (10).)
            const sizes = [3, 2, 1].map((across) => ({ feet: across * side, height: Math.floor(count / (across * across)) * side })).filter((size) => size.height > 0);
            return {
                builtin: "structure",
                targeting: { target: null, range: null, area: null },
                structure: { name: "Guiding Chisel's building", kind: "wall-hewn", door: { kind: "door-stone", side: "south" }, sizes, replaces: true, within: Number(cubes[3].replace(/,/g, "")) },
                notes: [`Click its middle within ${cubes[3]} feet of the chisel, which its user embeds for the activation's 10 minutes; it has the structure trait and lasts until the chisel makes another.`, `Another shape of up to ${count} contiguous ${side}-foot cubes is its user's to wish: draw its walls by hand.`]
            };
        }
    },
    {
        // (Raise Dead at 8th rank, read before, the fan consumed by it: plan.item.destroyed, scripts/casts.js.)
        name: "Phoenix Fighting Fan",
        index: 1,
        sentences: [/^The fan casts (\d+)(?:st|nd|rd|th)-rank Raise Dead, consuming the phoenix fighting fan in the process\.$/],
        card: ([cast], plan) => {
            if (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Raise Dead") return null;
            return { keep: true, rank: plan.rank ?? Number(cast[1]), item: { ...(plan.item ?? {}), destroyed: true }, notes: ["The fan is consumed by the cast."] };
        }
    },
    {
        // (Its user's current place held by the orb, the last one replaced: an Effect on its user saying so, for the teleportation spells cast to
        // it by whoever holds the orb.)
        name: "Guiding Star Orb: Embed Location",
        sentences: [
            /^;?\s*By focusing on the Guiding Star Orb ?, you embed your current location in the item\.$/,
            /^Thereafter, anyone who holds the Guiding Star Orb while Casting a Spell with the teleportation trait to travel to this location arrives precisely, without any inaccuracy at all\.$/,
            /^The Guiding Star Orb can only have one location embedded at a time; if you use this activity a second time, the new location replaces the previous one\.$/
        ],
        card: () => ({
            ...ownRow({}),
            item: { ruleEffects: [{ name: "Embedded location", words: "The Guiding Star Orb holds the place where its user stood as it was embedded: whoever holds the orb while Casting a Spell with the teleportation trait to travel there arrives exactly there, with no inaccuracy (until the orb holds another place)", rules: [], duration: null, replaces: true }] },
            notes: ["Its 10 minutes' focus are its user's, where they stand."]
        })
    },
    ...["Soulheart (Major)", "Soulheart (Greater)"].map((name) => ({
        // (The soulheart spent on a Maiserene phantom: each PC targeted +N maximum Hit Points while in cursed Bastardhall — an Effect with PF2e's
        // own modifier, on each —, the phantom's rank raised the GM's to set (an adventure creature's), the soulheart destroyed.)
        name: `${name}: Bolster Maiserene Phantom`,
        sentences: [
            /^When touched to a rank (\d+) Maiserene phantom, the soulheart flashes with bright red light and is destroyed\.$/,
            /^As it does so, it permanently increases the targeted phantom to rank (\d+), and increases each PC's maximum Hit Points by (\d+) for as long as they remain within Bastardhall while the castle remains cursed\.$/
        ],
        card: ([from, raised]) => ({
            ...ownRow({}),
            item: {
                recipient: "targets",
                destroyed: true,
                ruleEffects: [{ name: "Bolstered by the soulheart", words: `+${raised[2]} maximum Hit Points while it stays within Bastardhall and the castle remains cursed (remove this when it leaves or the curse ends)`, rules: [{ key: "FlatModifier", selector: "hp", value: Number(raised[2]), label: "Soulheart" }], duration: null }]
            },
            notes: [`Target the PCs: each gets +${raised[2]} maximum Hit Points while in cursed Bastardhall.`, `Touched to a rank ${from[1]} Maiserene phantom, which is rank ${raised[1]} from now on (set its rank by hand); the soulheart is destroyed.`]
        })
    })),
    {
        // (The flame claimed: an Effect on its user with its candle's light, one at a time — a new one in place of the last —, until its death or
        // its spending; spent, 6th-rank Raise Dead from the spell module, the flame's Effect gone (plan.castEndsRule): the ways card's two, kept
        // open. Its Destruction and the adventure's hint are lore: read, not the card's.)
        name: "Flame of The Radiant Spark",
        sentences: [
            /^The ancient lost artifact known as the Radiant Spark could bestow its flames upon the wick of any candle\b.*\.$/,
            /^You activate a flame of the Radiant Spark either by using your fingers to extinguish the flame or by blowing it out, causing the crackling blue energy to leap into your body and then settle in one of your hands\.$/,
            /^The blue flame continues to burn harmlessly on your hand, shedding illumination equivalent to a candle, and it can be extinguished only by your death or by expending it through calling upon the flame's power to cast a (\d+)(?:st|nd|rd|th)-rank raise dead to your specifications\.$/,
            /^You can hold only one flame of the Radiant Spark at a time - if you activate another flame before your current one is extinguished, the new flame replaces the previous one\.$/,
            /^The PCs can get a hint at how to use the flames of the Radiant Spark\b.*\.$/,
            /^Destruction While the Radiant Spark itself is nearly as indestructible as any other artifact, these flames created by its power are fragile\.$/,
            /^A candle bearing a flame of the Radiant Spark can burn forever, but any attempt to move the candle\b.*\.$/,
            /^The flame can still be claimed if someone extinguishes it with their fingers within a minute, otherwise the flame goes out\.$/,
            /^Curiously, wind and water cannot extinguish a flame of the Radiant Spark\b.*\.$/
        ],
        card: ([, , burns]) => {
            const label = "Flame of the Radiant Spark";
            const claim = {
                ...ownRow({}),
                automation: { level: "automatic" },
                trigger: { event: "use" },
                item: { ruleEffects: [{ name: label, words: `A flame of the Radiant Spark burns harmlessly on its hand, with a candle's light; only its death puts it out, or its spending on a ${burns[1]}th-rank Raise Dead (this card's other button). A new flame takes this one's place`, rules: [{ key: "TokenLight", value: { animation: { intensity: 4, speed: 1, type: "torch" }, color: "#3a8bff", coloration: 101, dim: 10, shadows: 0.2 } }], duration: null, replaces: "any" }] }
            };
            const spend = { builtin: "cast-spell", spell: SPELL("IkGYwHRLhkuoGReG", "Raise Dead"), rank: Number(burns[1]), dc: null, attack: null, tradition: null, self: false, area: false, targets: true, notes: [], castEndsRule: label, automation: { level: "automatic" }, trigger: { event: "use" } };
            return { builtin: "ways", targeting: { target: null, range: null, area: null }, ways: [{ name: "Claim the flame", plan: claim }, { name: `Spend it: ${burns[1]}th-rank Raise Dead`, plan: spend }], notes: ["The flame is claimed by snuffing it out with the fingers or blowing it out; this card stays open for its spending later."] };
        }
    },
    {
        // (Enthrall at DC 30, read before: what the enthralled see in its hand a note Effect on its user while it lasts (castNote); its next
        // waking's DC 30 Will save, Stupefied 1 for 24 hours on a failure, its own save card kept for then (castAgain); the week's lock if it
        // doesn't use them, a line of its user's own doing.)
        name: "Whispering Remnant: Hear My Words",
        sentences: [
            /^The whispering remnant casts an Enthrall spell \(@Check\[will\|dc:(\d+)[^\]]*\]\) to your specifications\.$/,
            /^Creatures that fail or critically fail to resist this spell perceive and remember the whispering remnant in your hand as something commonplace to the region, such as a farming tool, book, or fresh-baked pie, for as long as they remain enthralled\.$/,
            /^If you don't take advantage of this to subtly guide any affected creatures toward undermining their society, the whispering remnant can't be activated to Hear My Words again by you for (\d+) weeks?\.$/,
            /^Additionally, the next time you sleep, you endure horrific nightmares and must succeed at a @Check\[will\|dc:(\d+)[^\]]*\] save upon waking to avoid becoming Stupefied (\d+) for (\d+) hours \(this is a mental effect\)\.$/
        ],
        card: ([cast, , lock, dream], plan) => {
            if (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Enthrall") return null;
            const stupefied = { ...none(), effects: [{ kind: "condition", slug: "stupefied", value: Number(dream[2]), duration: { mode: "fixed", value: Number(dream[3]), unit: "hours", expiry: "turn-start", anchor: "effect-start" } }] };
            const nightmare = { source: { ...(plan.source ?? {}), name: "Whispering Remnant: nightmares" }, automation: { level: "automatic" }, traits: ["mental"], targeting: { target: "you", range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "save", check: { roll: "save", statistic: "will", basic: false, against: { dc: "fixed", value: Number(dream[1]) } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: stupefied, criticalFailure: stupefied } } };
            return {
                keep: true,
                dc: plan.dc ?? Number(cast[1]),
                castNote: { label: "Hear My Words", text: "The creatures that failed against its Enthrall see and remember the whispering remnant in its hand as something commonplace to the region (a farming tool, a book, a fresh-baked pie) for as long as they stay enthralled.", duration: null },
                castAgain: { plan: nightmare, own: true, when: "{user} wakes from its next sleep" },
                notes: [`If its user doesn't use this to guide those enthralled toward undermining their society, it can't Hear My Words again for ${lock[1]} week${lock[1] === "1" ? "" : "s"}.`, `On waking from its next sleep, its user attempts the DC ${dream[1]} Will save on the card that follows (Stupefied ${dream[2]} for ${dream[3]} hours on a failure).`],
                partial: undefined,
                automation: { level: "automatic" }
            };
        }
    },
    {
        // (Bless cast, read before; its emanation grown 10 feet by a free action at the start of each of its user's turns for the minute, and
        // in no other way: its user's own action, lines of the cast card.)
        name: "Liver Bloodstone of Arazni: Arazni's Fervor",
        sentences: [
            /^You hold the Liver Bloodstone aloft, and the Bloodstone glows with crimson light, filling you and your allies with Arazni's wrath\.$/,
            /^The Liver Bloodstone casts Bless\.$/,
            /^For the next minute, you can use a free action at the beginning of each of your turns to increase the spell's emanation radius by (\d+) feet\.$/,
            /^You can't increase the emanation's radius in any other way\.$/
        ],
        card: ([, , grows], plan) => {
            if (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Bless") return null;
            return {
                keep: true,
                castDuration: { value: 1, unit: "minutes", said: ["For the next minute"] },
                notes: [`For the minute, at the start of each of its turns its user may grow Bless's emanation by ${grows[1]} feet with a free action — not with the spell's own action, nor any other way.`, "Only for a worshipper of Arazni or one she favors (its Requirements)."],
                partial: undefined,
                automation: { level: "automatic" }
            };
        }
    },
    {
        // (A creature looked at: its user's Recall Knowledge about it at +2 (an Effect of PF2e's rule, to the end of the turn), and the DC 27 Will
        // save, read before, for one of the Dominion of the Black, the Elder Mythos or Desna's blasphemers — the starlight a note Effect with its
        // rules: −1 status to saves against divine effects (−2 on a critical failure, for a minute), and from a failure an incorporeal creature's
        // trait gone or another creature Slowed 1 while it shines (PF2e's ActorTraits and a granted Slowed, its own).)
        name: "Starless Scope",
        index: 1,
        sentences: [
            /^You raise the scope to your eye and observe a creature within (\d+) feet\.$/,
            /^You can attempt to identify the creature by Recalling Knowledge\.$/,
            /^The starless scope adds a \+(\d+) item bonus to this check\.$/,
            /^If the creature is associated with the Dominion of the Black or the Elder Mythos, or is a creature whose actions have blasphemed against Desna, the creature must attempt a @Check\[will\|dc:(\d+)[^\]]*\] save\.$/,
            /^Critical Success The creature is unaffected, and the starless scope's lens shatters\.$/,
            /^Success The creature shines with starlight for 1 round\.$/,
            /^During this time, the creature can't be concealed if it is visible\.$/,
            /^If it's invisible, it's concealed rather than being undetected\.$/,
            /^The creature takes a -(\d+) status penalty to saving throws against divine effects while it shimmers with starlight\.$/,
            /^Failure As success, but the creature also suffers an additional effect\.$/,
            /^An incorporeal creature loses its incorporeal trait as long as it shines with starlight\.$/,
            /^Any other creature becomes slowed (\d+) as long as it shines with starlight\.$/,
            /^Critical Failure As failure, but the duration of the starlight is 1 minute, and the status penalty to saving throws against divine effects increases to -(\d+)\.$/
        ],
        card: ([within, , bonus, save, , , , , penalty, , , slowed, worse], plan) => {
            if (plan?.resolution?.kind !== "save" || plan.resolution.check?.against?.value !== Number(save[1])) return null;
            const round = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" };
            const divine = (value) => ({ key: "FlatModifier", selector: "saving-throw", type: "status", value: -value, predicate: [{ or: ["divine", "item:trait:divine"] }], label: "Starlight" });
            const worseOff = [{ key: "ActorTraits", remove: ["incorporeal"] }, { key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.xYTAsEpcJE1Ccni3", predicate: [{ not: "self:trait:incorporeal" }], alterations: [{ mode: "override", property: "badge-value", value: Number(slowed[1]) }], allowDuplicate: true, onDeleteActions: { granter: "cascade", grantee: "cascade" } }];
            const light = (value, time, more) => note("Starlight", `It shines with starlight: while it's visible it can't be Concealed, and if it's Invisible it's Concealed instead of Undetected. –${value} status penalty to saves against divine effects.${more ? ` An incorporeal creature loses its incorporeal trait while it shines; any other is Slowed ${slowed[1]}.` : ""}`, time, { rules: [divine(value), ...(more ? worseOff : [])] });
            const row = (entry) => ({ ...none(), noteEffects: [entry] });
            return {
                keep: true,
                targeting: { ...plan.targeting, range: `${within[1]} feet` },
                resolution: { ...plan.resolution, outcomes: { criticalSuccess: none(), success: row(light(Number(penalty[1]), round, false)), failure: row(light(Number(penalty[1]), round, true)), criticalFailure: row(light(Number(worse[1]), timeOf(1, "minute"), true)) } },
                userEffects: [{ kind: "rules", name: "Starless Scope", words: `+${bonus[1]} item bonus to its Recall Knowledge about the creature it observes`, rules: [{ key: "FlatModifier", selector: "skill-check", type: "item", value: Number(bonus[1]), predicate: ["action:recall-knowledge"], label: "Starless Scope" }], duration: { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" } }],
                notes: ["Its user Recalls Knowledge about the creature (its +2 is on them to the end of the turn).", "Only a creature of the Dominion of the Black or the Elder Mythos, or whose deeds blasphemed Desna, attempts the save (the GM's knowledge): target it then.", "A critical success shatters the scope's lens: the scope doesn't work until a new lens is fitted (a 2-action manipulate activity)."],
                partial: undefined,
                automation: { level: "automatic" }
            };
        }
    },
    {
        // (One of four spells cast from the horn, its charges spent as a staff's (their rank; none for the cantrip) — and its spells cast
        // all the same at none left: the cast card's pick, its user's own spell DC.)
        name: "Horn of Rust",
        index: 0,
        sentences: [/^You expend a number of charges from the Horn of Rust to cast a spell from the following list\.$/, /^Cantrip Divine Lance 1st Noxious Vapors 2nd Shatter 3rd Stinking Cloud\b.*$/],
        card: () => {
            const choice = (id, name, rank) => ({ spell: SPELL(id, name), rank, area: false, targets: true });
            const choices = [choice("qwZBXN6zBoB9BHXE", "Divine Lance", null), choice("1meVElIu1CEVYWkv", "Noxious Vapors", 1), choice("1xbFBQDRs0hT5xZ9", "Shatter", 2), choice("GKpEcy9WId6NJvtx", "Stinking Cloud", 3)];
            return {
                builtin: "cast-spell",
                spell: choices[0].spell,
                rank: null,
                dc: null,
                attack: null,
                tradition: null,
                self: false,
                area: false,
                targets: true,
                choices,
                castDC: { from: "spell", said: "its user's spell DC, as a staff's spell" },
                notes: ["Spend its charges as a staff's (the spell's rank; the cantrip none): with none left it still casts them."]
            };
        }
    },
    {
        // (The shards' aura, read before — the zone, its +1 AC Effect, the DC 19 basic Reflex save at each turn's start —, and the tetanus it
        // gives a creature it damaged: that creature's own DC 19 Fortitude save card after the zone's, its disease handed to Pseudo Afflictions
        // as the poisons are (zone save afterDamage, scripts/after-damage.js); Xar-Azmak's worshippers immune, the GM's to know.)
        name: "Horn of Rust",
        index: 1,
        sentences: [
            /^You blow on the horn to unleash a swirling aura of jagged, rusty metal shards that orbit you in a (\d+)-foot emanation for (\d+) minutes?\.$/,
            /^The shards grant you a \+(\d+) item bonus to AC\.$/,
            /^Creatures and objects that begin their turn in this area take (\d+d\d+) slashing damage from the shards \(@Check\[reflex\|dc:(\d+)[^\]]*\] save\)\.$/,
            /^A creature damaged by this aura is exposed to a potent form of tetanus that has a level equal to the Horn of Rust ?'s level and has a DC (\d+) Fortitude save\.$/,
            /^Worshippers of Xar-Azmak are immune to this effect\.$/,
            /^Effect: Horn of Rust Tetanus An infection introduced through open wounds\b.*\.$/,
            /^Saving Throw @Check\[fortitude\|dc:(\d+)[^\]]*\] Onset (\d+) days Stage 1 Clumsy (\d+) \((\d+) weeks?\) Stage 2 Clumsy (\d+) and can't speak \((\d+) days?\) Stage 3 Paralyzed with spasms \((\d+) days?\) Stage 4 death$/
        ],
        card: ([, , , , , , disease], plan) => {
            const save = plan?.zone?.saves?.[0];
            if (plan?.builtin !== "zone" || !save?.plan || save.plan.resolution?.check?.statistic !== "reflex") return null;
            const [, dc, onset, first, week, second, day, third] = disease;
            const days = (value) => ({ value: Number(value), unit: "days" });
            const stages = [
                { stage: 1, damage: [], conditions: [{ slug: "clumsy", value: Number(first) }], duration: days(Number(week) * 7), text: `Clumsy ${first} (${week} week)` },
                { stage: 2, damage: [], conditions: [{ slug: "clumsy", value: Number(second) }], duration: days(day), text: `Clumsy ${second} and can't speak (${day} day)` },
                { stage: 3, damage: [], conditions: [{ slug: "paralyzed", value: null }], duration: days(third), text: `Paralyzed with spasms (${third} day)` },
                { stage: 4, damage: [], conditions: [], duration: null, death: true, text: "death" }
            ];
            const name = "Horn of Rust Tetanus";
            const exposed = {
                source: { ...(save.plan.source ?? {}), name },
                automation: { level: "automatic" },
                traits: ["disease"],
                rank: 1,
                targeting: { target: "the creature the shards damaged", range: null, area: null },
                trigger: { event: "use" },
                resolution: {
                    kind: "save",
                    check: { roll: "save", statistic: "fortitude", basic: false, against: { dc: "fixed", value: Number(dc) } },
                    sharedDamage: null,
                    outcomes: { criticalSuccess: none(), success: none(), failure: { ...none(), affliction: { name, stage: 1 } }, criticalFailure: { ...none(), affliction: { name, stage: 2 } } },
                    afflictionHandoff: { name, slug: "horn-of-rust-tetanus", traits: ["disease"], level: Number(plan.item?.level) || null, statistic: "fortitude", dc: Number(dc), maximumDuration: null, onset: days(onset), stages }
                },
                notes: ["Worshippers of Xar-Azmak are immune: the GM's to know."]
            };
            const zoneNotes = (plan.zone.notes ?? []).filter((line) => /^Its user also gets\b/.test(line));
            return {
                keep: true,
                zone: { ...plan.zone, notes: [...zoneNotes, "A creature its shards damage attempts the tetanus's Fortitude save on the card that follows (Xar-Azmak's worshippers are immune)."], saves: [{ ...save, notes: undefined, plan: { ...save.plan, notes: undefined, afterDamage: { degrees: ["success", "failure", "criticalFailure"], plan: exposed } } }] },
                notes: undefined,
                partial: undefined,
                automation: { level: "automatic" }
            };
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

// Unique items' and artifacts' activations, built in full (2026-10-27, docs/needs.md; the user: "unique effects that are on unique rarity
// items should be automated ... They are special and should feel special to players"): each activation read sentence by sentence, every
// sentence of its effect one of the reading's own — none dropped —, into the card it plays: a save or a check its user attempts themselves
// (plan.ownSave, the item module's own-save card — src/live/poison-card.js), the creatures' saves, a second save that follows a degree (a
// row's followUps, the ability module's next card), the ways card's choices, PF2e's own rules on an Effect (item.ruleEffects, a note
// Effect's rules), a spell cast, what it tells whispered. What PF2e can't play is a note Effect for its time (the user's ruling of
// 2026-10-25); what's the GM's call ("the GM decides") a line of the card. Pure.
//
// Whisperer of Souls (its lethal or nonlethal choice): "You choose whether the Strike deals lethal or nonlethal damage. If the glaive has a
// reason for doing so, such as slaying a creature whose soul the glaive can absorb, it can defy your choice if you fail a DC 50 Will save."
// — the ways card: each choice, and each with the glaive defying it, its user's own DC 50 Will save; nonlethal is PF2e's AdjustStrike
// adding the weapon's nonlethal trait for the turn.
// Whisperer of Souls (its ritual): "Attempt an Occultism check as if you cast the Collective Memories ritual about a subject ... On a
// critical failure, you and the glaive are drawn into a murmuring void of cold ... for an entire week. At the end of this time, you
// reappear and must attempt a DC 50 Will save." — its user's own Occultism check at the ritual's primary DC (37 for a 7th-rank ritual,
// PF2e's ritual table; the GM may change it), the ritual's results a note Effect for the hour, and on a critical failure the week in the
// void a note Effect and the Will save the card that follows (the row's followUps), its own results as the text gives them.

import { sentencesOf } from "./lasting.js";
import { conditionUuid } from "./row-readings.js";
import { readItemImmunity } from "./immunity.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const fixed = (value, unit) => ({ mode: "fixed", value, unit, expiry: "turn-start", anchor: "effect-start" });
const THIS_TURN = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "effect-start" };
const DEGREES = ["criticalSuccess", "success", "failure", "criticalFailure"];
const condition = (slug, value, duration = null) => ({ kind: "condition", slug, value, duration });
// (A row: its conditions, note Effects and a save that follows it.)
const row = ({ effects = [], noteEffects = [], followUps = [] } = {}) => ({ ...none(), effects, ...(noteEffects.length ? { noteEffects } : {}), ...(followUps.length ? { followUps } : {}) });
const rowsOf = (given) => Object.fromEntries(DEGREES.map((degree) => [degree, given[degree] ?? row()]));
const check = (statistic, dc) => ({ roll: "save", statistic, basic: false, against: { dc: "fixed", value: dc } });
// (A save or a check its user attempts themselves, at a fixed DC: the own-save card, src/live/poison-card.js isOwnSave.)
const ownSave = (statistic, dc, outcomes, { notes = [] } = {}) => ({
    ownSave: true,
    targeting: { target: "self", range: null, area: null },
    resolution: { kind: "save", check: check(statistic, dc), sharedDamage: null, outcomes: rowsOf(outcomes) },
    ...(notes.length ? { notes } : {})
});
// (A second save for the same creature after a degree: the core's outcome.followUps, the ability module's next card.)
const followUp = (statistic, dc, outcomes) => ({ kind: "save", check: check(statistic, dc), outcomes: rowsOf(outcomes) });
// (What it gives its user outright: the item card, its PF2e rules an Effect of their own.)
// (endsOwn: the Effects another of its ways gave, ended — src/live/ends-own.js.)
const own = ({ ruleEffects = [], notes = [], endsOwn = null } = {}) => ({
    targeting: { target: null, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } },
    ...(notes.length ? { notes } : {}),
    ...(ruleEffects.length || endsOwn ? { item: { ...(ruleEffects.length ? { ruleEffects } : {}), ...(endsOwn ? { endsOwn } : {}) } } : {})
});
// (A note Effect on its user, or on the creatures its presser targets: the item card's own row.)
const noteRow = (note, { target = null } = {}) => ({
    targeting: { target, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), noteEffects: [note] } } }
});
// (A way of the ways card: its own plan, as the activation's.)
const wayPlan = ({ item: mine, ...card }, { base, info }) => ({ ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...card, item: { ...info, ...(mine ?? {}) } });
const ways = (list, { base, info }) => ({ builtin: "ways", targeting: { target: null, range: null, area: null }, once: true, ways: list.map(({ name, html, card }) => ({ name, html, plan: wayPlan(card, { base, info }) })) });

// Whisperer of Souls' Strikes made nonlethal: PF2e's AdjustStrike, the glaive's own nonlethal trait (as a merciful rune gives it).
const NONLETHAL_RULES = [{ key: "AdjustStrike", mode: "add", property: "weapon-traits", value: "nonlethal", definition: ["item:slug:whisperer-of-souls"] }];
const NONLETHAL_WORDS = "Its Strikes with the Whisperer of Souls deal nonlethal damage this turn";
const DEFIES = "The glaive defies a choice only when it has a reason to, a soul it could take for one: the GM's call.";

// (The Doomsday Door's week-long rites, a day at a time: a Mythic Point (plan.spend), or doomed 1 higher (PF2e's condition, stacked), or an
// assistant's point or the GM's sacrifice — each day its own way, the card open for the week; then, for one, its seventh day's way.)
const DOWNTIME = "A downtime activity: no other downtime or exploration while it lasts.";
function doorRite(lines, last, { base, info }) {
    const day = (words) => `One day of the seven. ${words}`;
    return {
        ...ways([
            { name: "A day: 1 Mythic Point", html: "<p>A day of the rite, for a Mythic Point.</p>", card: { ...own({ notes: [day("It costs its user a Mythic Point."), ...lines, DOWNTIME] }), spend: { mythicPoints: 1 } } },
            { name: "A day: doomed 1 higher", html: "<p>A day of the rite, its doomed value 1 higher.</p>", card: { ...own({ notes: [day("Its user's doomed value rises by 1."), ...lines, DOWNTIME] }), resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects: [{ kind: "condition", slug: "doomed", value: 1, duration: null, stack: { by: 1 } }] } } } } },
            { name: "A day: an assistant's point or a sacrifice", html: "<p>A day of the rite, paid another way.</p>", card: own({ notes: [day("A creature assisting with the rite spends one of its own Mythic Points (from its sheet), or its user makes a fitting sacrifice in its place, as the GM decides."), ...lines, DOWNTIME] }) },
            ...(last ? [last] : [])
        ], { base, info }),
        once: undefined
    };
}

// Each reading: the plan's source name it's for, a pattern for each of its effect's sentences — every sentence must be one, in order — and
// the card they make (from its matches, the plan read before and the activation's base and item part).
const READINGS = [
    {
        // (Lethal or nonlethal, and the glaive defying the choice: four ways, two of them its user's DC 50 Will save.)
        name: "Whisperer of Souls",
        sentences: [
            /^You choose whether the Strike deals lethal or nonlethal damage\.$/,
            /^If the glaive has a reason for doing so, such as slaying a creature whose soul the glaive can absorb, it can defy your choice if you fail a @Check\[will\|dc:(\d+)\] save\.$/
        ],
        card: ([, defy], plan, { base, info }) => {
            const dc = Number(defy[1]);
            const nonlethal = { label: "Nonlethal Strike", text: `${NONLETHAL_WORDS}.`, duration: THIS_TURN, rules: NONLETHAL_RULES };
            const lethal = { label: "Lethal Strike", text: "The glaive has its way: its Strike deals lethal damage.", duration: THIS_TURN };
            return ways([
                { name: "Nonlethal", html: "<p>The Strike deals nonlethal damage.</p>", card: own({ ruleEffects: [{ name: "nonlethal Strike", words: NONLETHAL_WORDS, rules: NONLETHAL_RULES, duration: THIS_TURN }], notes: ["For the Strike that triggered it: delete the Effect if a later Strike this turn should deal lethal damage."] }) },
                { name: "Lethal", html: "<p>The Strike deals lethal damage.</p>", card: own({ notes: ["The Strike deals lethal damage, as the glaive's Strikes do."] }) },
                { name: `Nonlethal, the glaive defying it (DC ${dc} Will)`, html: `<p>The glaive defies a nonlethal choice: a DC ${dc} Will save.</p>`, card: ownSave("will", dc, { criticalSuccess: row({ noteEffects: [nonlethal] }), success: row({ noteEffects: [nonlethal] }), failure: row({ noteEffects: [lethal] }), criticalFailure: row({ noteEffects: [lethal] }) }, { notes: [DEFIES] }) },
                { name: `Lethal, the glaive defying it (DC ${dc} Will)`, html: `<p>The glaive defies a lethal choice: a DC ${dc} Will save.</p>`, card: ownSave("will", dc, { failure: row({ noteEffects: [{ ...nonlethal, text: `The glaive has its way: ${NONLETHAL_WORDS.charAt(0).toLowerCase()}${NONLETHAL_WORDS.slice(1)}.` }] }), criticalFailure: row({ noteEffects: [{ ...nonlethal, text: `The glaive has its way: ${NONLETHAL_WORDS.charAt(0).toLowerCase()}${NONLETHAL_WORDS.slice(1)}.` }] }) }, { notes: [DEFIES] }) }
            ], { base, info });
        }
    },
    {
        // (Collective Memories at the ritual's primary DC, its user's own Occultism check; a week in the void on a critical failure, then the
        // DC 50 Will save.)
        name: "Whisperer of Souls",
        sentences: [
            /^Attempt an Occultism check as if you cast the Collective Memories ritual about a subject\.$/,
            /^If you roll a success or critical success, you can repeat what the Whisperer of Souls relates to you about the subject\.$/,
            /^On a critical failure, you and the glaive are drawn into a murmuring void of cold, where your mind is assaulted by strange visions for an entire week\.$/,
            /^At the end of this time, you reappear and must attempt a @Check\[will\|dc:(\d+)\] save\.$/,
            /^Success When you return, you can retrain one of your skills into a Lore skill about evil creatures or places, as if you had spent 1 week retraining\.$/,
            /^Failure As success, but you are Stupefied (\d+) for 1 week\.$/,
            /^Critical Failure As success, but your alignment moves one step toward evil and you must retrain one of your skills into a Lore about evil creatures or places\.$/,
            /^You become obsessed with increasing your forbidden knowledge, turning to wicked forces that offer such secrets and compromising your morals further if you must\.$/
        ],
        card: ([, , , back, , stupefied]) => {
            const week = fixed(7, "days");
            const hour = fixed(1, "hours");
            const retrain = "Back from the void, it can retrain one of its skills into a Lore about evil creatures or places, as if it had spent a week retraining.";
            const memories = (words) => ({ label: "Collective Memories", text: `For an hour after, ${words} It can repeat what the Whisperer of Souls tells it of the subject (the GM tells it).`, duration: hour });
            const will = followUp("will", Number(back[1]), {
                criticalSuccess: row({ noteEffects: [{ label: "Back from the void", text: retrain, duration: null }] }),
                success: row({ noteEffects: [{ label: "Back from the void", text: retrain, duration: null }] }),
                failure: row({ effects: [condition("stupefied", Number(stupefied[1]), week)], noteEffects: [{ label: "Back from the void", text: retrain, duration: null }] }),
                criticalFailure: row({ noteEffects: [{ label: "Back from the void", text: "Its alignment moves one step toward evil, and it must retrain one of its skills into a Lore about evil creatures or places. Obsessed with gaining forbidden knowledge, it turns to wicked forces that offer such secrets, compromising its morals further if it must.", duration: null }] })
            });
            return {
                ...ownSave("occultism", 37, {
                    criticalSuccess: row({ noteEffects: [memories("it sorts through mostly coherent memories of the subject, the accurate and useful above the misremembered and the exaggerated.")] }),
                    success: row({ noteEffects: [memories("it learns useful information for further inquiry, though incomplete or enigmatic, likely in several contradictory versions.")] }),
                    criticalFailure: row({ noteEffects: [{ label: "Lost in the void", text: "It and the glaive are drawn into a murmuring void of cold for a week, its mind assaulted by strange visions; then it reappears and attempts the Will save on the card that follows.", duration: week }], followUps: [will] })
                }, { notes: [
                    "DC 37, a 7th-rank ritual's primary check (the GM may change it). A subject that's present raises the result a step, and only vague knowledge of it lowers it a step: the GM's call.",
                    "As a ritual's check, no fortune or misfortune effect changes it."
                ] }),
                trigger: { event: "use", frequency: { max: 1, per: "week", raw: "once per week" } },
                item: { activation: { frequency: { max: 1, per: "week", raw: "once per week" } } }
            };
        }
    },
    {
        // (Its cast of dominate on a dragon of the orb's kind: 500 feet, a dragon only, its status bonus to saves against magic suppressed for
        // the save — PF2e's AdjustModifier on the bestiaries' "+1 Status to All Saves vs. Magic" — the month and the 24 hours' immunity read
        // already.)
        name: "Orb of Dragonkind",
        sentences: [
            /^You cast a 10th-rank dominate spell \(DC \d+\) on a dragon of the type associated with the orb within (\d+) feet, except the effect lasts for 1 month rather than unlimited\.$/,
            /^The dragon does not receive its status bonus to saving throws against magic\.$/,
            /^The dragon is then temporarily immune to further domination via the orb for 24 hours\.$/
        ],
        card: ([cast], plan) => {
            if (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Dominate" || plan.castDuration?.value !== 30 || plan.item?.immunity?.duration?.value !== 24) return null;
            const suppressed = { traits: ["dragon"], name: "no status bonus to saves against magic", words: "No status bonus to its saves against magic", rules: [{ key: "AdjustModifier", selectors: ["saving-throw"], slug: "1-status-to-all-saves-vs-magic", suppress: true }], duration: { value: 1, unit: "minutes", expiry: "turn-start" } };
            return {
                keep: true,
                notes: undefined,
                partial: undefined,
                automation: { level: "automatic" },
                castRange: { feet: Number(cast[1]) },
                castTraits: { immune: [], only: ["dragon"], penalties: [suppressed], said: [] },
                castLines: ["A dragon of the orb's own kind only: a red dragon for the red orb, and so on.", "The dragon gets no status bonus to its saves against magic for it (an Effect on it before the cast)."]
            };
        }
    },
    {
        // (A hand of the deck's cards for each companion till its user's next daily preparations: a note Effect on each ally targeted, a day.)
        name: "The Deck of Destiny",
        sentences: [
            /^When you perform your daily preparations, you can share the Deck of Destiny with your companions, allowing them to invest a hand of up to (\d+) cards each as if they carried the cards\.$/,
            /^When one of your companions activates one of their invested cards, an illusory image of the card appears in their hand, but the card's effects are otherwise unaltered\.$/,
            /^This lasts until the next time you perform your daily preparations\.$/
        ],
        card: ([hand]) => ({
            ...noteRow({ label: "A hand of the Deck of Destiny", text: `It can invest a hand of up to ${hand[1]} of the deck's cards as if it carried them. When it activates one, an illusory image of the card appears in its hand, the card working as it always does. It lasts until the deck's holder next makes their daily preparations.`, duration: fixed(24, "hours") }, { target: "your companions" }),
            notes: ["During its user's daily preparations: target the companions sharing the deck, then Apply."],
            item: { recipient: "targets" }
        })
    },
    {
        // (Its senses from wherever the Deck of Harrowed Tales is, for the hour: a note Effect on its user — a Dismiss is its user removing it.)
        name: "The Lens of the Outreaching Eye",
        sentences: [
            /^By peering through the Lens of the Outreaching Eye, for one hour you can treat the Deck of Harrowed Tales as the source of your hearing and vision, no matter the deck's location in the multiverse\.$/,
            /^You can see in all directions from the deck and hear from it as if using your normal visual senses\.$/,
            /^You can Dismiss the activation\.$/
        ],
        card: () => noteRow({ label: "Through the Deck of Harrowed Tales", text: "It sees and hears from the Deck of Harrowed Tales in place of its own place, wherever in the multiverse the deck is: it sees in all directions from it and hears from it with its normal senses. It can Dismiss this (remove the Effect).", duration: fixed(1, "hours") })
    },
    {
        // (One sense lost and another gained till it's used again: the ways card, each way an Effect of PF2e's rules — Blinded or Deafened
        // granted by it, lifesense, not flankable — that ends the other ways' Effects.)
        name: "The Silent Hag",
        sentences: [
            /^You choose to lose one of your senses and gain another until you use this activation again\.$/,
            /^Choose from one of the following: Your eyes are replaced by dark pits that see only death\.$/,
            /^You become Blinded and gain lifesense, an imprecise sense out to (\d+) feet\.$/,
            /^Lifesense allows you to see the vital essence of living and undead creatures, distinguishing between the vitality energy animating living creatures and void energy animating undead creatures, much as sight distinguishes colors\.$/,
            /^Your ears close up then become covered with hairs that are sensitive to movement\.$/,
            /^You become Deafened, but you can't be flanked\.$/,
            /^Your mouth seals over with flesh\.$/,
            /^You lose the ability to speak, but you do not need to breathe\.$/
        ],
        card: ([, , life], plan, { base, info }) => {
            const choices = [
                { way: "Eyes of death", words: `Blinded, but with lifesense (imprecise, ${life[1]} feet): it sees the vital essence of living and undead creatures, telling vitality from void as sight tells colors`, rules: [{ key: "GrantItem", uuid: conditionUuid("blinded"), onDeleteActions: { grantee: "restrict" } }, { key: "Sense", selector: "lifesense", acuity: "imprecise", range: Number(life[1]) }] },
                { way: "Ears of hair", words: "Deafened, its ears closed and covered with hairs sensitive to movement, but it can't be flanked", rules: [{ key: "GrantItem", uuid: conditionUuid("deafened"), onDeleteActions: { grantee: "restrict" } }, { key: "ActiveEffectLike", mode: "override", path: "system.attributes.flanking.flankable", value: false }] },
                { way: "Sealed mouth", words: "Its mouth sealed over with flesh: it can't speak (no spell with a verbal part, no word of command), but it doesn't need to breathe", rules: [] }
            ];
            const names = choices.map(({ way }) => `The Silent Hag (${way}): ${way}`);
            return ways(choices.map(({ way, words, rules }) => ({ name: way, html: `<p>${words}.</p>`, card: own({ ruleEffects: [{ name: way, words, rules, duration: null }], notes: ["Until it's used again: the sense it gave before ends now."], endsOwn: { label: "other sense", names: names.filter((one) => one !== `The Silent Hag (${way}): ${way}`) } }) })), { base, info });
        }
    },
    {
        // (Its voice carried 200 feet for up to 2 hours: a note Effect on its user.)
        name: "Herald's Ring: Project Voice",
        sentences: [
            /^When you turn the herald's ring around your finger three times in either direction, you gain the ability to easily project your voice up to (\d+) feet without raising the volume of speech, reaching your audience in most venues, including arenas\.$/,
            /^This effect lasts up to (\d+) hours\.$/
        ],
        card: ([reach, lasts]) => noteRow({ label: "Projected voice", text: `It can project its voice up to ${reach[1]} feet without raising it, reaching its audience in most venues, arenas included. Up to ${lasts[1]} hours: it can end it sooner (remove the Effect).`, duration: fixed(Number(lasts[1]), "hours") })
    },
    {
        // (A +2 item bonus to its Recall Knowledge about Nhimbaloth while it Investigates: PF2e's FlatModifier on an Effect, the subject its
        // user's to say.)
        name: "The Whispering Reeds",
        sentences: [/^You gain a \+(\d+) item bonus to skill checks to Recall Knowledge about Nhimbaloth, her faith, or creatures associated with her \(such as incorporeal undead, vampiric mists, wisps, and other incorporeal creatures associated with death\)\.$/],
        card: ([bonus]) => own({
            ruleEffects: [{ name: "Recall Knowledge about Nhimbaloth", words: `+${bonus[1]} item bonus to its Recall Knowledge checks about Nhimbaloth, her faith or creatures tied to her (incorporeal undead, vampiric mists, wisps and other incorporeal creatures of death), while it Investigates`, rules: [{ key: "FlatModifier", selector: "skill-check", type: "item", value: Number(bonus[1]), predicate: ["action:recall-knowledge"], label: "The Whispering Reeds (about Nhimbaloth)" }], duration: null }],
            notes: ["Only about Nhimbaloth, her faith or creatures tied to her: untick it in the roll's dialog for another subject. Remove the Effect once it stops Investigating."]
        })
    },
    {
        // (One of four spells three times a day, each at its own rank but Fear's 3rd: the cast card's picker, Wave of Despair at one creature in
        // place of its cone.)
        name: "The Whispering Reeds",
        sentences: [/^You cast one of the following spells at the lowest level possible \(unless otherwise specified\): Wave of Despair \(one target within 30 feet only\), Fear \(3rd\), Paranoia, or Phantasmal Killer\.$/],
        card: (found, plan) => {
            if (plan?.builtin !== "cast-spell" || (plan.choices ?? []).length !== 4 || plan.choices[0].spell?.name !== "Wave of Despair") return null;
            return {
                keep: true,
                notes: undefined,
                partial: undefined,
                automation: { level: "automatic" },
                choices: plan.choices.map((choice, index) => (index === 0 ? { ...choice, area: false, targets: true } : choice)),
                castLines: ["Wave of Despair at one creature within 30 feet only, in place of its cone: target just that one.", "Each at the lowest rank it can be cast, Fear at 3rd."]
            };
        }
    },
    {
        // (A 10th-rank Resurrect once a year, its user the primary caster: the ways card — the ritual's own DC 50 Occultism check, then the
        // dead creature targeted brought back as that check's result says, each way gated by it (plan.checkGate { statistic, degree }).)
        name: "The Deck of Destiny",
        sentences: [
            /^You attempt to undo a creature's untimely death and return them to life\.$/,
            /^The deck performs a 10th-rank Resurrect ritual\.$/,
            /^This ritual doesn't have any cost and doesn't require any secondary casters\.$/,
            /^Instead, you are the primary caster and must attempt a @Check\[occultism\|dc:(\d+)\] check to complete the ritual as you perform a Harrowing, perform that same harrowing in reverse in an attempt to pull back the threads of fate, and perform one final harrowing to .rewrite. the target's destiny\.$/
        ],
        card: ([, , , check], plan, { base, info }) => {
            const dc = Number(check[1]);
            const gate = (degree) => ({ statistic: "occultism", dc, degree });
            const changed = "changed in some way by its time in the afterlife (a personality shift, a streak of white hair, a strange birthmark: the GM's)";
            const back = (revive, degree) => ({ ...own({ notes: ["Target the dead creature, then Apply."] }), targeting: { target: "the dead creature", range: null, area: null }, checkGate: gate(degree), item: { recipient: "targets", revive } });
            const STATUS = ["attack-roll", "perception", "saving-throw", "skill-check"].map((selector) => ({ key: "FlatModifier", selector, type: "status", value: 1, label: "Resurrected (inspired)" }));
            return {
                ...ways([
                    { name: `The ritual's check (DC ${dc} Occultism)`, html: `<p>Its user, the primary caster, attempts the DC ${dc} Occultism check.</p>`, card: ownSave("occultism", dc, {}, { notes: [
                        "Then pick the way for its result, the dead creature targeted.",
                        "No cost and no secondary casters. A dead creature of up to 20th level, however long ago it died; its body needn't be there if its user knows its name and once touched part of it.",
                        "If Pharasma has decided its time has come, or it doesn't wish to return, the ritual fails once the check is made: the GM's call."
                    ] }) },
                    { name: "Critical success: back with full Hit Points", html: "<p>It returns to life with full Hit Points.</p>", card: back({ hp: "max", keepPools: true, words: `Back from death by a 10th-rank Resurrect: its spells prepared and the points in its pools as when it died, any long-term debilitations still on it, ${changed}`, boon: { name: "inspired", days: 7, words: "+1 status bonus to attack rolls, Perception, saving throws and skill checks, inspired by an agent of its deity it met", rules: STATUS } }, "criticalSuccess") },
                    { name: "Success: back with 1 Hit Point", html: "<p>It returns to life with 1 Hit Point.</p>", card: back({ hp: 1, words: `Back from death by a 10th-rank Resurrect: no spells prepared or points in any pools, any long-term debilitations still on it, ${changed}; at this rank no debilitation from the Boneyard` }, "success") },
                    { name: "Critical failure: something else returns", html: "<p>Something goes horribly wrong.</p>", card: { builtin: "whisper", targeting: { target: null, range: null, area: null }, whisper: { text: "Something goes horribly wrong with the Resurrect: an evil spirit possesses the body, it rises as a special kind of undead, or a worse fate befalls it. The GM decides which." } } }
                ], { base, info }),
                once: undefined,
                trigger: { event: "use", frequency: { max: 1, per: "year", raw: "once per year" } },
                item: { activation: { frequency: { max: 1, per: "year", raw: "once per year" } } }
            };
        }
    },
    {
        // (A 9th-rank Weapon Storm whose damage is all spirit: PF2e's DamageAlteration on its caster's damage of that spell, an Effect before the
        // cast (plan.castCaster) — the spell module rolls spell damage through PF2e, so the caster's rules apply; who's possessed the GM's.)
        name: "Soulcutter (Heroic): Soulcutting Storm",
        sentences: [
            /^Soulcutter casts a 9th-rank Weapon Storm to your specification, but all damage caused by the spell is spirit damage\.$/,
            /^If used to damage a creature that's possessing another creature, this spell does no damage to the possessed creature\.$/
        ],
        card: (found, plan) => {
            if (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Weapon Storm" || plan.rank !== 9) return null;
            return {
                keep: true,
                notes: undefined,
                partial: undefined,
                automation: { level: "automatic" },
                castCaster: { name: "spirit Weapon Storm", words: "All the damage its Weapon Storm deals is spirit damage", rules: [{ key: "DamageAlteration", mode: "override", property: "damage-type", selectors: ["spell-damage"], value: "spirit", predicate: ["item:slug:weapon-storm"] }], duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start" } },
                castLines: ["All its damage is spirit damage (an Effect on its caster till its next turn).", "A creature that's possessed takes none of its damage, only the one possessing it: who that is, the GM's call."]
            };
        }
    },
    {
        // (A demon's sin vulnerability set off at 30 feet, then 24 hours' immunity: the item card at the demon targeted, its own damage rolled and
        // its words whispered to its user (plan.item.sinVulnerability, scripts/sin-vulnerability.js).)
        name: "Soulcutter (Heroic): Shame Demon",
        sentences: [
            /^Soulcutter targets a demon she can see or hear within (\d+) feet, causing the blade's green light to well up around the demon for a moment\.$/,
            /^The demon suffers the effects of its sin vulnerability, if it has any, and is then temporarily immune to Shame Demon for 24 hours\.$/,
            /^If Soulcutter's partner wasn't aware of the normal effects that trigger that demon's sin vulnerability, they learn it at this time\.$/
        ],
        card: ([target, immune]) => {
            const immunity = readItemImmunity(immune.input, { name: "Soulcutter (Heroic)", activation: "Shame Demon" })?.immunity;
            if (!immunity) return null;
            return { ...own({ notes: ["Target the demon (one Soulcutter can see or hear), then Apply."] }), targeting: { target: "a demon", range: `${target[1]} feet`, area: null }, item: { recipient: "targets", sinVulnerability: { only: ["demon"] }, immunity } };
        }
    },
    {
        // (A full day's rest for the allies within 60 feet, at 5 of its charges: the item card at each ally targeted, PF2e's Rest for the Night
        // and a night's Hit Points more (plan.item.rest, scripts/rest.js).)
        name: "Hallajin Key",
        sentences: [
            /^Lumna briefly transforms all allies within (\d+) feet into energy, renewing them as if they had spent a full day resting\.$/,
            /^These allies regain Hit Points and recover from conditions as if they had 24 hours of rest\.$/,
            /^They can make their daily preparations again, with access to all their spell slots and any other daily abilities, even if they already used or expended them\.$/,
            /^Daily preparations happen as part of this activation, even if it would normally require an hour of study, prayer, or communion\.$/
        ],
        card: ([within]) => ({
            ...own({ notes: [`Target its allies within ${within[1]} feet, then Apply.`, "It costs 5 of the key's charges.", "Their daily preparations are made again now, with no hour of study, prayer or communion: their players prepare as at any daily preparations."] }),
            targeting: { target: "its allies", range: null, area: { type: "emanation", value: Number(within[1]) } },
            item: { recipient: "targets", rest: { day: true } }
        })
    },
    {
        // (Home to the Ardis Scholars' manor with every living creature within 60 feet, at 2 of its charges: off this map, a line of the card.)
        name: "Hallajin Key",
        sentences: [/^Lumna returns the key and all living creatures within (\d+) feet to the Ardis Scholars' manor\.$/],
        card: ([within]) => ({
            ...own({ notes: [`Lumna takes the key and every living creature within ${within[1]} feet to the Ardis Scholars' manor: off this map, their tokens go to that scene.`, "It costs 2 of the key's charges."] }),
            targeting: { target: null, range: null, area: { type: "emanation", value: Number(within[1]) } }
        })
    },
    {
        // (One form or the other, each an Effect on its wearer saying what alignment it shows, ending the other's: the ways card.)
        name: "Miogimo's Mask",
        sentences: [/^You switch the mask to its other form\.$/],
        card: (found, plan, { base, info }) => {
            const forms = [["Angelic form", "silvery and angelic", "lawful good", "evil and neutral"], ["Demonic form", "gold-skinned and demonic", "chaotic evil", "good and neutral"]];
            const names = forms.map(([way]) => `Miogimo's Mask (${way}): ${way}`);
            return ways(forms.map(([way, face, shows, targets]) => ({ name: way, html: `<p>The mask's ${face} face.</p>`, card: own({ ruleEffects: [{ name: way, words: `Its mask shows its ${face} face: to a creature detecting its alignment, it seems ${shows}; its Crisis of Faith can target only ${targets} creatures`, rules: [], duration: null }], endsOwn: { label: "other form", names: names.filter((one) => one !== `Miogimo's Mask (${way}): ${way}`) } }) })), { base, info });
        }
    },
    {
        // (Talking Corpse on the soul fragment in the mask: no body, its answers telepathic — the cast card's lines.)
        name: "Miogimo's Mask",
        sentences: [/^You cast Talking Corpse on the soul fragment, except you communicate telepathically and don't require the fragment's body to speak\.$/],
        card: (found, plan) => {
            if (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Talking Corpse") return null;
            return {
                keep: true,
                notes: undefined,
                partial: undefined,
                automation: { level: "automatic" },
                targets: false,
                castLines: ["Only with a soul fragment in the mask.", "On the soul fragment itself: no body is needed, and it answers telepathically."]
            };
        }
    },
    {
        // (An object pulled to its hand from 100 feet: unattended, the map's; held by a creature, PF2e's own Disarm at it — only a critical success
        // takes it, a critical failure a failure (action.degree) — the ways card.)
        name: "Taljjae's Mask (The Nobleman)",
        sentences: [
            /^You hold out a hand and attempt to take something that doesn't belong to you\.$/,
            /^You telekinetically attracts an unattended, unsecured object of up to (\d+) Bulk within (\d+) feet\.$/,
            /^If the object is in a creature's possession, you must critically succeed at an attempt to Disarm that creature, but you can't critically fail\.$/
        ],
        card: ([, object], plan, { base, info, options }) => {
            const [bulk, feet] = [object[1], object[2]];
            const basic = options.basicActions?.disarm;
            if (!basic || basic.builtin) return null;
            return ways([
                { name: "An unattended object", html: `<p>An unattended, unsecured object of up to ${bulk} Bulk within ${feet} feet.</p>`, card: own({ notes: [`An unattended, unsecured object of up to ${bulk} Bulk within ${feet} feet flies to its hand: move it to its inventory.`] }) },
                { name: "Held by a creature: Disarm", html: `<p>Disarm the creature holding it, from up to ${feet} feet away.</p>`, card: {
                    builtin: "item-action",
                    targeting: { target: "the creature targeted", range: `${feet} feet`, area: null },
                    action: { slug: "disarm", name: "Disarm", targeted: true, degree: { criticalFailure: "failure" }, after: `Telekinetic, at a creature within ${feet} feet. Only a critical success takes the object (up to ${bulk} Bulk): it flies to its hand rather than falling. A critical failure is a failure.`, basic }
                } }
            ], { base, info });
        }
    },
    {
        // (Its flare straight up — a light of 100 feet bright and 100 more dim for a minute, plan.item.placedLight — or the arrow at a target,
        // its hit's counteract card against a darkness in the area hit (rank 7, +26; strike.counteract): the ways card.)
        name: "Wintershot: Signal Flare",
        sentences: [
            /^You pull back Wintershot's string and fire an arrow straight upward\.$/,
            /^The arrow soars to a height of (\d+) feet, or until it strikes a solid surface like a ceiling\.$/,
            /^When it reaches its apex, it explodes in a brilliant burst, creating a (\d+)-foot radius area of bright light and dim light in the next (\d+) feet\.$/,
            /^In the night sky, this beacon can be seen clearly for miles\.$/,
            /^The beacon remains lit for up to 1 minute in a color of your choice\.$/,
            /^Alternately, you can fire a Signal Flare like a normal arrow to attempt to strike a Target - if it hits, the arrow inflicts normal damage and attempts to counteract one darkness effect of your choice that affects the area you hit with a counteract rank of (\d+)(?:st|nd|rd|th) and a counteract modifier of \+(\d+)\.$/
        ],
        card: ([, height, burst, , , counter], plan, { base, info }) => {
            const none4 = Object.fromEntries(DEGREES.map((degree) => [degree, none()]));
            return ways([
                { name: "Flare, straight up", html: "<p>The arrow fired straight up bursts into light.</p>", card: { ...own({ notes: [`It bursts ${height[1]} feet up, or where it strikes a ceiling, in a color its user picks (set the light's color); at night it's seen for miles.`] }), item: { placedLight: { bright: Number(burst[1]), dim: Number(burst[1]) + Number(burst[2]), duration: fixed(1, "minutes") } } } },
                { name: "At a target", html: "<p>The arrow fired at a target, counteracting a darkness where it hits.</p>", card: {
                    targeting: { target: "the creature the Strike hits", range: null, area: null },
                    trigger: { event: "strike", on: ["success", "criticalSuccess"] },
                    resolution: { kind: "save", check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } }, outcomes: none4 },
                    strike: { range: "ranged", save: null, ammo: false, notes: [], lines: ["Its damage is the arrow's own."], counteract: { counteract: { rank: Number(counter[1]), modifier: Number(counter[2]), traits: ["darkness"], at: "target", free: { name: "a darkness effect of its user's choice in the area hit" } } } }
                } }
            ], { base, info });
        }
    },
    {
        // (Presented to Charg at the Adventure Path's climax, its requirements met: the curse lifted, a line of the card — and the soulheart
        // destroyed by it, plan.item.destroyed.)
        name: "Soulheart (Angelic): Defy Charg",
        sentences: [/^By presenting the angelic soulheart to Charg at the climax of this Adventure Path, you can fully remove the Bastardhall Curse and free all of the souls trapped within!$/],
        card: () => ({ ...own({ notes: ["Only with Pharasma's and Shelyn's favor earned and Caydserris Arudora defeated, at the Adventure Path's climax.", "Presented to Charg, it fully removes the Bastardhall Curse and frees all of the souls trapped within.", "The soulheart is destroyed by it: Apply removes it."] }), item: { destroyed: true } })
    },
    {
        // (A week's rite, a day at a time — a Mythic Point, or doomed 1 higher (PF2e's condition, stacked), or an assistant's point or the GM's
        // sacrifice — then attuned and shut: the ways card, open for the week.)
        name: "Doomsday Door: Attune Door",
        sentences: [
            /^You attune the Doomsday Door to a location associated with destruction, such as the heart of an active volcano\.$/,
            /^You must know the location exists\.$/,
            /^If it is on a different plane, a planar key must be present\.$/,
            /^Each day you spend Attuning, you must spend 1 Mythic Point or your doomed condition's value increases by 1\.$/,
            /^A creature assisting you with the rite can spend a Mythic Point instead, and you can avoid spending a Mythic Point by making an appropriate sacrifice, as determined by the GM\.$/,
            /^After seven days, the Doomsday Door attunes to your chosen location, then shuts\.$/,
            /^Until then, this activity can reattune to the door to a different location\.$/,
            /^You can also use this activation to negate a Doomsday Door ?'s current attunement\.$/
        ],
        card: (found, plan, { base, info }) => doorRite([
            "A place tied to destruction its user knows exists (the heart of an active volcano); on another plane, only with a planar key there.",
            "After the seventh day the door attunes to it, then shuts. Till then it can be attuned elsewhere instead; this also undoes an attunement."
        ], null, { base, info })
    },
    {
        // (The same week's rite, then the apocalypse the door releases: whispered to the GM and its user, the GM's to determine.)
        name: "Doomsday Door: Open Door",
        sentences: [
            /^You perform an extended rite to open the Doomsday Door ?\.$/,
            /^Each day you spend performing the rite, you must spend 1 Mythic Point or your doomed condition's value increases by 1\.$/,
            /^A creature assisting you with the rite can spend a Mythic Point instead, and you can avoid spending a Mythic Point by making an appropriate sacrifice, as determined by the GM\.$/,
            /^After 7 days, the Doomsday Door opens, releasing an apocalypse related to the location to which the door is attuned\.$/,
            /^The consequences are determined by the GM but are always regional and far-reaching\.$/,
            /^A Doomsday Door attuned to the Void, for example, might release a burst of energy that causes the dead in a radius of hundreds of miles to rise from their graves\.$/
        ],
        card: (found, plan, { base, info }) => doorRite(["Only once the door is attuned."], { name: "The seventh day: it opens", html: "<p>The door opens.</p>", card: { builtin: "whisper", targeting: { target: null, range: null, area: null }, whisper: { text: "The Doomsday Door opens, releasing an apocalypse tied to the place it's attuned to: regional and far-reaching, as the GM determines (one attuned to the Void might raise the dead for hundreds of miles around)." } } }, { base, info })
    },
    // (Ochre Fulcrum Lens's possession: src/compiler/whole-artifacts.js's, the three fulcrum lenses' one reading — 2026-10-28.)
    {
        // (Its next initiative rolled three times, the result of its choice kept — a fortune effect: an Effect on its user with PF2e's RollOption
        // "air-initiative-thrice", scripts/initiative-thrice.js; Performance for initiative its own pick.)
        name: "The Dance",
        sentences: [
            /^Your body begins to move with anticipation, creating a trail of afterimages for a moment\.$/,
            /^You can roll initiative with a Performance check\.$/,
            /^Regardless of what skill you use to roll for initiative, roll the check three times and take the result of your choice\.$/,
            /^This is a fortune effect\.$/
        ],
        card: () => own({
            ruleEffects: [{ name: "initiative three times", words: "Its next initiative roll is rolled three times, the result of its choice kept (a fortune effect)", rules: [{ key: "RollOption", domain: "initiative", option: "air-initiative-thrice" }], duration: fixed(1, "minutes") }],
            notes: ["It can roll initiative with Performance: pick Performance as its initiative before rolling.", "Trailing afterimages as it moves, for a moment."]
        })
    },
    {
        // (Its lines of hot wax — the save read before, its Confused (and Slowed 1) an Effect granting them that the scraping ends — and the goo
        // scraped off (an Interact: plan.item.scrape, scripts/scrape.js): the ways card, open for the fight.)
        name: "The Waxworks",
        sentences: [
            /^You cause two (\d+)-foot lines of hot wax to extend out of the card as you present it\.$/,
            /^The two lines must both start at you and extend in different directions\.$/,
            /^If you are at least (\d+)th level, you can create a third line, and if you're at least (\d+)th level you can create a fourth line\.$/,
            // (Its DC its owner's, the item compiler's stand-in "dc:9003" by now: src/compiler/item-data.js.)
            /^All creatures in the area must attempt a @Check\[fortitude\|(?:against:class-spell|dc:\d+)\|[^\]]*\] save against your class DC or spell DC\.$/,
            /^Critical Success The creature is unaffected\.$/,
            /^Success The creature takes 2d6 persistent fire plus 2d6 persistent mental damage\.$/,
            /^An affected creature or adjacent ally can reduce both of these values by 1d6 by spending an Interact action to scrape off the goo\.$/,
            /^Until the damage is reduced to 1d6 per type, the affected creature is also Confused \(this is an emotion and mental effect\)\.$/,
            /^Failure As success, but 4d6 persistent fire plus 4d6 persistent mental damage\.$/,
            /^Critical Failure As success, but 6d6 persistent fire plus 6d6 persistent mental damage, and the creature's speed is Slowed 1 until the damage is reduced to 1d6 per type\.$/
        ],
        card: ([lines, , more], plan, { base, info }) => {
            const outcomes = plan?.resolution?.outcomes;
            if (plan?.resolution?.kind !== "save" || !outcomes?.criticalFailure?.effects?.some((effect) => effect.slug === "slowed")) return null;
            const grant = (slug, value = null) => ({ key: "GrantItem", uuid: conditionUuid(slug), onDeleteActions: { grantee: "restrict" }, ...(value ? { alterations: [{ mode: "override", property: "badge-value", value }] } : {}) });
            const wax = (slowed) => ({ label: "Hot wax", text: `${slowed ? "Confused and Slowed 1" : "Confused (an emotion and mental effect)"} while its persistent fire and mental damage from the wax are above 1d6 each: it or an adjacent ally scraping the goo off (an Interact) lowers each by 1d6.`, duration: null, rules: [grant("confused"), ...(slowed ? [grant("slowed", 1)] : [])] });
            const waxed = (degree, slowed) => ({ ...outcomes[degree], effects: (outcomes[degree].effects ?? []).filter((effect) => !["confused", "slowed"].includes(effect.slug)), noteEffects: [...(outcomes[degree].noteEffects ?? []), wax(slowed)] });
            const { notes, partial, automation, ...save } = plan;
            const saved = { ...save, resolution: { ...plan.resolution, outcomes: { ...outcomes, success: waxed("success", false), failure: waxed("failure", false), criticalFailure: waxed("criticalFailure", true) } }, notes: [`Two ${lines[1]}-foot lines, each from its user in a different direction (a third from ${more[1]}th level, a fourth from ${more[2]}th): target every creature in them.`, "A creature immune to emotion or mental effects isn't confused by it: remove its Hot wax Effect."] };
            return {
                ...ways([
                    { name: "Hot wax lines", html: "<p>Lines of hot wax.</p>", card: saved },
                    { name: "Scrape off the goo (an Interact)", html: "<p>Scrape the goo off a creature.</p>", card: { ...own({ notes: ["The creature with the goo, or an ally next to it, spends an Interact action: target the creature, then Apply."] }), targeting: { target: "the creature with the goo", range: "touch", area: null }, item: { recipient: "targets", scrape: { types: ["fire", "mental"], die: 6, effect: "Hot wax", from: "The Waxworks" } } } }
                ], { base, info }),
                once: undefined
            };
        }
    },
    {
        // (Its net thrown, read before: its riders now until the creature Escapes at DC 44 (the ability module's escape), a demon's Escapes rolled
        // twice keeping the lower (PF2e's RollTwice on a note Effect, plan.ifTarget), and on a hit the counteract card at the creature for its
        // teleportation and planar travel (rank 9, +38; rolled twice, the higher kept, against a demon — plan.heldCounteract, scripts/hit-counteract.js).)
        name: "Halcyon Heart",
        sentences: [
            /^You pull the net off the halcyon heart and throw it at a creature within (\d+) feet, using your attack bonus for a ranged simple weapon\.$/,
            /^On a hit, the net grows and envelops the creature, which becomes Off-Guard and takes a -10-foot circumstance penalty to its Speeds until it Escapes, and on a critical hit, it's also Immobilized until it Escapes\.$/,
            /^The net also attempts to counteract teleportation effects and planar travel of the creature it's entrapping\.$/,
            /^The Escape DC is (\d+), and the net has a counteract rank of (\d+) and a counteract modifier of \+(\d+)\.$/,
            /^If the target is a demon or connected to a demon, they must roll twice and take the lower result on all attempts to Escape \(this is a misfortune effect\), and for counter act checks, the net rolls twice and takes the higher result \(this is a fortune effect\)\.$/,
            /^You can't Perform with the halcyon heart while it doesn't have its net\.$/,
            /^So long as the net doesn't contain a creature, you can restore it with a single action, which has the concentrate trait\.$/
        ],
        card: ([, , , numbers], plan) => {
            const outcomes = plan?.resolution?.outcomes;
            if (!plan?.ownCheck || !outcomes?.criticalSuccess?.effects?.some((effect) => effect.slug === "immobilized")) return null;
            const escape = { dc: Number(numbers[1]) };
            const held = (row) => ({ ...row, effects: (row.effects ?? []).map((effect) => (effect.kind === "condition" ? { ...effect, duration: effect.duration ? { ...effect.duration, escape } : { mode: "until-escape", escape } } : effect)), modifiers: (row.modifiers ?? []).map((modifier) => ({ ...modifier, escape })) });
            const misfortune = { label: "Netted demon", text: "It rolls twice and takes the lower result on every attempt to Escape the halcyon heart's net (a misfortune effect). Remove this once it escapes.", duration: null, rules: [{ key: "RollTwice", selector: ["skill-check", "attack-roll"], keep: "lower", predicate: ["action:escape"] }] };
            return {
                keep: true,
                notes: [
                    "A demon only, for the misfortune and the fortune: one tied to a demon (its deity a demon lord, a demonic bloodline) counts too, by the GM's call.",
                    "Its net gone, the halcyon heart can't be used to Perform. While the net holds no creature, its user can restore it with a single action (concentrate)."
                ],
                partial: undefined,
                automation: { level: "automatic" },
                resolution: { ...plan.resolution, outcomes: { ...outcomes, criticalSuccess: held(outcomes.criticalSuccess), success: held(outcomes.success) } },
                ifTarget: [...(plan.ifTarget ?? []), ...["success", "criticalSuccess"].map((degree) => ({ traits: ["demon"], degree, noteEffects: [misfortune] }))],
                heldCounteract: { degrees: ["success", "criticalSuccess"], counteract: { rank: Number(numbers[2]), modifier: Number(numbers[3]), traits: ["teleportation"], fortuneVs: ["demon"], free: { name: "its teleportation or planar travel, when it tries one while netted" } } }
            };
        }
    },
    {
        // (Its counteract at the sonic effect that hurt its user, read before: by its result the damage turned back on its source and negated, or
        // its use given back — counteract.reflect and counteract.regain, scripts/counteract.js.)
        name: "Herald's Ring: Reflect Sound",
        sentences: [
            // (Its two sentences one by now, src/compiler/item-data.js: "… counteract the effect with a counteract modifier of +23.")
            /^You use the herald's ring to reflect a portion of the sonic damage back at its source by attempting to counteract the effect with a counteract modifier of \+(\d+)\.$/,
            /^Critical Success All of the damage is reflected back on its source\.$/,
            /^Success Half of the damage is reflected back at its source, and the other half is negated\.$/,
            /^Failure Half of the damage is reflected back at the source, and you take the rest of the damage\.$/,
            /^Critical Failure None of the damage is reflected, but the herald's ring does absorb enough energy so that you can activate it again today\.$/
        ],
        card: (found, plan) => {
            const counteract = plan?.item?.counteract;
            if (plan?.builtin !== "counteract" || !counteract?.free) return null;
            const reflect = { type: "sonic", byDegree: { criticalSuccess: { back: 1 }, success: { back: 0.5, negated: 0.5 }, failure: { back: 0.5 }, criticalFailure: { regain: true } } };
            return {
                keep: true,
                partial: undefined,
                automation: { level: "automatic" },
                item: { ...plan.item, counteract: { ...counteract, free: { name: "the sonic effect that hurt it" }, reflect, regain: { index: plan.item.activation?.index ?? null, frequency: plan.item.activation?.frequency ?? plan.trigger?.frequency ?? null }, notes: [
                    "The effect's DC and rank: the GM's to give. Type the sonic damage it took and target the effect's source.",
                    "A critical success turns all of it back on the source; a success half (the other half negated, given back); a failure half (its user takes the rest); a critical failure none, but the ring can be activated again today."
                ] } }
            };
        }
    },
    {
        // (The shot called back and reloaded — whole, a line; fragmented, the creatures it's lodged in targeted: 15 persistent bleed each and their
        // Clumsy 2 from the fragments gone (PF2e's condition 2 lower) — the ways card.)
        name: "Shot of the First Vault: Reload Order",
        sentences: [
            /^You recall the shot of the First Vault ?, which automatically reloads itself into your weapon\.$/,
            /^If the shot had fragmented, the fragments violently dislodge themselves, dealing (\d+) persistent bleed damage to each creature in which they were embedded\.$/,
            /^The fragments then unite to re-form the shot of the First Vault ?, which automatically reloads itself into your weapon\.$/
        ],
        card: ([, torn], plan, { base, info }) => ways([
            { name: "Whole: it flies back", html: "<p>The shot flies back and reloads itself.</p>", card: own({ notes: ["The shot flies back to its user and reloads itself into its ranged weapon."] }) },
            { name: "Fragmented: the fragments tear out", html: "<p>The fragments tear themselves out.</p>", card: {
                targeting: { target: "each creature with its fragments in it", range: null, area: null },
                resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), damage: { mode: "formulas", formulas: [{ formula: `${torn[1]}[persistent,bleed]` }], rollScope: "target" }, effects: [{ kind: "condition", slug: "clumsy", value: null, duration: null, stack: { by: -2 } }] } } },
                notes: ["Target every creature the fragments are lodged in: each takes the bleed, and the Clumsy 2 the fragments gave it ends.", "The fragments re-form the shot, which reloads itself into its user's ranged weapon."]
            } }
        ], { base, info })
    },
    {
        // (Its user's Strike with the shot, and unless the attack critically fails the creature's DC 45 Reflex save (incapacitation) — the Strike
        // card's save on a hit and on a failure too (strike.failRow); its rows a far push the map's, Axis or the First Vault a note Effect on it.)
        name: "Shot of the First Vault: Vault Deposit",
        sentences: [
            /^You line up a perfectly aimed attack directly toward the First Vault\.$/,
            /^You Strike a creature, then the shot of the First Vault attempts to bring your target with it as it returns to the First Vault\.$/,
            /^Unless your attack roll is a critical failure, the creature must attempt a @Check\[reflex\|dc:(\d+)\] save; this effect has the incapacitation trait\.$/,
            /^Regardless, the shot of the First Vault returns to the First Vault\.$/,
            /^Critical Success The creature is unaffected\.$/,
            /^Success The creature is moved 1d20×50 feet in the direction you fired\.$/,
            /^If this causes it to hit a solid object, it takes 50 bludgeoning damage\.$/,
            /^Failure The creature is transported to a random location on the plane of Axis\.$/,
            /^Critical Failure The creature is transported to the First Vault\.$/,
            /^Unless it is capable of eluding Abadar's precautions, it is likely unable to escape the Vault on its own\.$/
        ],
        card: ([, , reflex], plan, { base, info }) => {
            const none4 = Object.fromEntries(DEGREES.map((degree) => [degree, none()]));
            const away = (label, text) => row({ noteEffects: [{ label, text, duration: null }] });
            const save = {
                ...base,
                traits: [...(base.traits ?? []), "incapacitation"],
                automation: { level: "automatic" },
                targeting: { target: "the creature the Strike targeted", range: null, area: null },
                trigger: { event: "use" },
                resolution: { kind: "save", check: { ...check("reflex", Number(reflex[1])) }, sharedDamage: null, outcomes: rowsOf({
                    success: away("Hurled by the shot", "Hurled 1d20×50 feet the way the shot was fired (roll 1d20, times 50): move it. If that slams it into a solid object, it takes 50 bludgeoning damage (the item's damage link)."),
                    failure: away("Sent to Axis", "Transported to a random place on the plane of Axis: off this map, its token leaves the scene."),
                    criticalFailure: away("In the First Vault", "Transported into the First Vault: off this map, its token leaves the scene. Unless it can elude Abadar's precautions, it likely can't escape the Vault on its own.")
                }) }
            };
            return {
                targeting: { target: "the creature the Strike targets", range: null, area: null },
                trigger: { event: "strike", on: ["success", "criticalSuccess", "failure"] },
                resolution: { kind: "save", check: { roll: "attack", statistic: "strike", against: { dc: "target", statistic: "ac" } }, outcomes: none4 },
                strike: { range: "ranged", save, failRow: true, ammo: false, notes: [], lines: ["Only with the shot loaded in its ranged weapon (at hand for a weapon of reload 0).", "Its save follows a hit or a failure, not a critical failure.", "Whatever happens, the shot returns to the First Vault: take it off its user's sheet."] }
            };
        }
    }
];

// Whether a reading is for this source name (its words aren't worth reading otherwise).
export const hasLegendReading = (name) => READINGS.some((reading) => reading.name === name);

// Its sentences as one reading's, each matched in order → the matches, or null.
function matched(reading, sentences) {
    if (sentences.length !== reading.sentences.length) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? found : null;
}

// The plan (any: a reading is built over what was read before) and its effect's words → the reading's card, or the same plan. name: its
// source name; base, info, frequency: its own (src/compiler/lasting.js activationBase).
// (options: the compile options — the ability module's compiled actions, options.basicActions.)
export function withLegendReading(plan, { name, words, base, info, frequency = null, options = {} }) {
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of READINGS.filter((entry) => entry.name === name)) {
        const found = matched(reading, sentences);
        const card = found ? reading.card(found, plan, { base, info, options }) : null;
        if (!card) continue;
        // (Over the plan read before, its own parts kept: Orb of Dragonkind's cast of dominate.)
        if (card.keep) {
            const { keep, ...changes } = card;
            const next = { ...plan, ...changes };
            for (const key of Object.keys(changes)) if (changes[key] === undefined) delete next[key];
            return next;
        }
        const { item: mine, trigger, ...rest } = card;
        return {
            ...base,
            automation: { level: "automatic" },
            trigger: trigger ?? { event: "use", ...(frequency ? { frequency } : {}) },
            ...rest,
            item: { ...info, ...(mine ?? {}), ...(mine?.activation ? { activation: { ...info.activation, ...mine.activation } } : {}) }
        };
    }
    return plan;
}

// An item's illusion, read sentence by sentence (2026-10-27, docs/needs.md "Illusions and disbelief"): the user's ruling of 2026-10-25 — the
// spells' rule, disbelief a control the GM uses, the creature's check against the item's DC, who saw through it tracked (plan.disbelief, the
// GM's disbelief card, src/live/disbelief-card.js, scripts/disbelief.js). Deck of Mischief's "A creature who Seeks or touches the card can
// attempt to disbelieve this illusion", Camp Shroud's "A creature outside the area that uses the Seek action or Search activity to examine the
// area … can attempt a … check to disbelieve the illusion", Wooden Nickel's Perception "against your Deception DC" (plan.disbelief.against:
// its user's DC, read when the card is posted) with its Crafting check that "will also reveal the item's true nature" (plan.disbelief.also,
// the card's second check). Beside it, as lasting.js reads its own: a note Effect for the illusion's time on its user (the user's ruling for
// a rule PF2e can't play), the card's lines for its user's own choices, the map and objects. Every sentence of its effect one of the
// reading's own, none dropped. Pure.

import { activationBase, effectWords, sentencesOf } from "./lasting.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours" };
const timeOf = (value, unit) => ({ mode: "fixed", value: Number(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
const lastsOf = (value, unit) => ({ value: Number(value), unit: UNITS[String(unit).toLowerCase()] });

// The card's parts: its own row (a note Effect, modifiers) for its user, its lines and its disbelief.
const own = ({ noteEffects = [], effects = [], modifiers = [], notes = [], disbelief = null, target = null, item = null }) => ({
    targeting: { target, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects, modifiers, ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {}),
    ...(disbelief ? { disbelief } : {}),
    ...(item ? { item } : {})
});
// (The GM's disbelief card: Perception against the DC, for a creature that does what the text says.)
const seeThrough = ({ dc = null, when, lasts = null, ends = null, against = null, also = null }) => ({ dc, statistic: "perception", when, ...(against ? { against } : {}), ...(lasts ? { lasts } : {}), ...(ends ? { ends } : {}), ...(also ? { also } : {}) });

// (What it tells: whispered to the GM and its user, the GM filling in what it shows — the user's ruling, src/compiler/decided.js.)
const whisper = (text) => ({ builtin: "whisper", targeting: { target: null, range: null, area: null }, whisper: { text } });

// A tentacle potion's limb by its grade, for the ways card: its words on the drinker for its time (the greater's tentacle's Strike too).
const TENTACLES = {
    Lesser: { hours: 1, holds: "It can't hold items with it." },
    Moderate: { hours: 8, holds: "It can hold an item of up to light Bulk with it, or anchor itself with the whole limb to a branch, balcony, outcrop or the like (the GM's call), its other limbs free for tasks that need both hands." },
    Greater: { hours: 24, holds: "It can hold an item of up to 1 Bulk with it, or help hold one of up to 2 Bulk as a second hand, and attack with it (its Strike, 1d6 bludgeoning, sweep); or anchor itself with the whole limb to a branch, balcony, outcrop or the like (the GM's call), its other limbs free for tasks that need both hands.", attacks: [{ name: "tentacle", dice: 1, die: "d6", type: "bludgeoning", traits: ["unarmed", "sweep"] }] }
};
function tentacleWay(grade, name, { base, info }) {
    const { hours, holds, attacks } = TENTACLES[grade];
    const duration = timeOf(hours, "hours");
    const start = name === "Fortified tail" ? `Its tail is fortified (Flexible Tail, Skillful Tail, the Tailed Goblin heritage or the like, the GM's call), as a ${grade.toLowerCase()} tentacle potion's limb.` : "A long, flexible limb of ectoplasm grows from it, through its clothing and armor.";
    const text = `${start} The limb can't be hidden or disguised. It can do simple Interact actions with it (opening an unlocked door, say), but nothing that takes real dexterity or a check. ${holds} Only one such limb at a time: a stronger tentacle potion replaces a weaker one's. Its user can Dismiss it: remove this Effect.`;
    const card = own({ noteEffects: [{ label: name === "Fortified tail" ? "Fortified tail" : "Tentacle", text, duration }], target: "the drinker" });
    return { name, plan: { ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...card, item: { ...info, ...(attacks ? { attacks: attacks.map((attack) => ({ ...attack, duration })) } : {}) } } };
}

const SHROUDS = ["Minor", "Lesser", "Moderate", "Greater", "Major"];

// Each reading: the plan's source name it's for (an activation's "Item: Activation"), a pattern for each of its effect's sentences — every
// sentence must be one, in order — and the card they make.
const READINGS = [
    {
        // (A card's face swapped for one still in the deck: what's left in it the GM's to say, the swap its user's pick; no time of its own, so
        // the disbelief card stays until the GM's done with it.)
        name: "Deck of Mischief: Card Trick",
        sentences: [
            /^You learn which of the ace and face\b.*\bstill in the deck\.$/,
            /^You can then swap the apparent face\b.*\bone still in the deck\.$/,
            /^A creature who Seeks or touches the (card)\b[^.]*\bdisbelieve this illusion \(@Check\[perception\|dc:(\d+)\]\)\.$/
        ],
        card: ([, , seen]) => own({
            notes: ["Its user learns which ace and face cards are left in the deck (the GM, or the deck's keeper, says which).", "It may then give an ace or face card in its hand the look of one left in the deck: its user's pick."],
            disbelief: seeThrough({ dc: Number(seen[2]), when: "Seeks or touches the card" })
        })
    },
    {
        // (Objects made to look like precious metal for 10 minutes: words on its user for that time, the GM's disbelief card against its user's
        // Deception DC, and the second check its Crafting — a fitting Lore the GM's to roll by hand. Its master in Deception the card's
        // requirement check, src/compiler/requirement.js.)
        name: "Wooden Nickel",
        sentences: [
            /^Prerequisites You are a master in Deception\b.*\bwooden coin\b.*\.$/,
            /^When you Activate the wooden nickel ?, for (\d+) (minutes?), you can cause any object\b.*?\bof (\d+) Bulk or less\b.*\bprecious metal of your choice\.$/,
            /^A creature that touches or Interacts with an affected object can attempt a @Check\[perception\|against:deception[^\]]*\] check\b.*@Check\[crafting\|against:deception[^\]]*\] or an appropriate Lore skill\b.*\btrue nature\.$/,
            /^After \d+ minutes have elapsed since you Activated\b.*\brevert to their true form\.$/
        ],
        card: ([, time]) => own({
            noteEffects: [{ label: "Wooden Nickel", text: `Any object of ${time[3]} Bulk or less it touches can be made to look, feel and smell like valuables of about its size in a precious metal of its choosing; all of them turn back when the ${time[1]} minutes are up.`, duration: timeOf(time[1], time[2]) }],
            disbelief: seeThrough({ when: "touches or Interacts with an affected object", against: "deception", lasts: lastsOf(time[1], time[2]), also: { statistic: "crafting", through: true, what: "sees what the object truly is (a fitting Lore instead: rolled by hand)" } })
        })
    },
    // (A mist around a campfire for up to 12 hours: where it is and what it hides the map's, the GM's disbelief card for a creature outside
    // that Seeks or Searches, put out with the fire.)
    ...SHROUDS.map((grade) => ({
        name: `Camp Shroud (${grade})`,
        sentences: [
            /^Knights make use of this magically treated powder\b.*\.$/,
            /^When you toss the powder into a campfire or other sizable fire, .*\bin an? (\d+)-foot emanation from the fire\.$/,
            /^The mist creates protective illusions that remain for up to (\d+) (hours?)\b.*\bfrom afar\.$/,
            /^You can end the effect earlier by putting out the fire\.$/,
            /^Light and smoke produced in the area aren't visible\b.*\.$/,
            /^The illusions don't prevent sound from traveling\b.*\bfrom being seen\.$/,
            /^A creature outside the area that uses the Seek action or Search activity\b.*@Check\[perception\|dc:(\d+)[^\]]*\] check to disbelieve the illusion\.$/
        ],
        card: ([, area, time, , , , seen]) => own({
            notes: [
                `Tossed into a campfire or another sizable fire: a thin mist fills a ${area[1]}-foot emanation from the fire for up to ${time[1]} hours, the area hard to spot from afar (the map's).`,
                "From outside it, the area's light and smoke can't be seen; sound still carries, and the area and those in it can still be seen."
            ],
            disbelief: seeThrough({ dc: Number(seen[1]), when: "is outside the area and Seeks or Searches to examine it or to look for its smoke and light", lasts: lastsOf(time[1], time[2]), ends: "Putting out the fire ends it." })
        })
    })),
    {
        // (A ship's looks changed for 6 hours: words on its user for that time, a Dismiss its user removing it, the GM's disbelief card for a
        // creature that boards the ship or Seeks.)
        name: "Veiled Figurehead: Veil!",
        sentences: [
            /^You change the appearance of the ship in minor\b.*\.$/,
            /^Its general size and shape can't be changed, but\b.*\bsurface details to your liking\.$/,
            /^Flags and sails can be recolored\b.*\.$/,
            /^Wear and surface damage\b.*\.$/,
            /^The figurehead itself shifts to fit the change\b.*\.$/,
            /^The illusion lasts for (\d+) (hours?) or until you Dismiss this effect\.$/,
            /^Any creature that boards the ship or uses the Seek action\b.*\bdisbelieves the illusion if it succeeds at a @Check\[perception\|dc:(\d+)[^\]]*\] check\.$/
        ],
        card: ([, , , , , time, seen]) => own({
            noteEffects: [{ label: "Veiled ship", text: "Its ship looks changed in small but noticeable ways of its user's choosing — flags and sails recolored and marked anew, its material another color or quality, wear and damage hidden or added, the figurehead given a face to match —, its size and shape the same. Its user can Dismiss it: remove this Effect.", duration: timeOf(time[1], time[2]) }],
            disbelief: seeThrough({ dc: Number(seen[1]), when: "boards the ship or Seeks to examine it", lasts: lastsOf(time[1], time[2]), ends: "Its user can Dismiss it." })
        })
    },
    {
        // (Documents made misleading until it's used again: the documents the GM's, the GM's disbelief card for a creature that inspects one,
        // and Society to Decipher Writing its second check, the real text. Its other activation, the revert, is whispered — src/compiler/decided.js.)
        name: "Misdirecting Haversack",
        sentences: [
            /^Documents inside the haversack become magically disguised\b.*\.$/,
            /^Anyone inspecting a document notices the disguise with a successful @Check\[perception\|dc:(\d+)[^\]]*\] check, but\b.*@Check\[society\|dc:(\d+)[^\]]*\] check to Decipher Writing\.$/,
            /^This lasts until you use this activation again, .*\bending the effect for that document\.$/
        ],
        card: ([, seen]) => own({
            notes: ["Each document in the haversack now looks like one of a similar type with misleading information (the GM's to word).", "It lasts until this activation is used again (for all of them), until the other activation reverts one, or for a document kept an hour out of the haversack."],
            disbelief: seeThrough({ dc: Number(seen[1]), when: "inspects one of the documents", also: { statistic: "society", dc: Number(seen[2]), what: "reads its real text (Decipher Writing)" } })
        })
    },
    {
        // (A name remembered, the GM's to give: whispered, a disguise fooling it as its words say.)
        name: "Glasses of Sociability: Have We Met?",
        sentences: [
            /^You stare at another creature and instantly remember their name\b.*\.$/,
            /^The glasses rely on your latent memories, so\b.*\bdon't penetrate the disguise\.$/,
            /^For example, if a divoynik was disguised as an innkeeper\b.*\.$/
        ],
        card: () => whisper("Its user stares at a creature and remembers its name, if they've met and traded names: the GM says it. A disguise fools it — it gives the name of whoever the creature is disguised as, if its user met them, never the creature's own.")
    },
    {
        // (What undead touched a sample, by the water's color: whispered, the GM's secret check for an undead hiding itself its own line there.)
        name: "Undead Detection Dye",
        sentences: [
            /^The liquid in this test tube is as clear as water\.$/,
            /^You can drop in a sample collected from the environment or a creature\b.*\bin the past 24 hours\.$/,
            /^The water changes color, as seen on the table, .*\.$/,
            /^The higher the undead's level or number of undead\b.*\.$/,
            /^This isn't a foolproof way to identify a disguised creature\b.*\.$/,
            /^If an undead has been disguising its undead nature or its presence in an area, the GM can roll a secret @Check\[deception\|dc:(\d+)[^\]]*\] or @Check\[stealth\|dc:\d+[^\]]*\] check\b.*\.$/,
            /^On a success, the creature avoided leaving traces\.$/,
            /^This can't protect the undead from discovery if it actively uses its undead abilities\b.*\.$/,
            /^Color Undead Detected Red Vampire\b.*\bWhite Other Undead$/
        ],
        card: ([, , , , , secret]) => whisper(`A sample from the surroundings or a creature, dropped in, shows by the water's color what kind of undead touched it in the past 24 hours: red a vampire, orange a wight, yellow a mummy, green a ghost, blue a ghoul, indigo a wraith, purple a shadow, gray mindless undead (a zombie, a skeleton), black a lich, white another undead — deeper for a higher level or more of them, clear for none. The GM says which. Any touch of undead colors it, so it doesn't prove a creature is undead. For an undead hiding its nature or its presence there, the GM may roll its secret Deception or Stealth check (DC ${secret[1]}): on a success it left no trace — not if it used its undead abilities on that area or creature, though it can try to clear the evidence (Cover Tracks, Conceal an Object).`)
    },
    // (A disguise for 2d12 hours, the GM's secret: words on the drinker beside its +4 to its Deception DC — the bonus only against seeing
    // through it, its level added even if untrained, as rule-words.js has Infiltrator's Elixir's —, both for the 24 hours its roll can reach,
    // the GM ending them sooner. Over the plan read before: its bonus kept, its reminder replaced.)
    ...["Lesser", "Moderate", "Greater"].map((grade) => ({
        name: `Potion of Disguise (${grade})`,
        over: true,
        sentences: [
            /^Upon imbibing this potion, you take on the appearance of a specific type of creature for \[\[\/br 2d12 #hours\]\]\{2d12 hours\}\.$|^Upon imbibing this potion, you take on the appearance of a specific type of creature for 2d12 hours\.$/,
            /^The type of creature is determined when the potion is created\.$/,
            /^For example, you might have a potion of elf disguise\b.*\.$/,
            /^Drinking the potion doesn't impart the knowledge of how long\b.*\bthe GM rolls the duration in secret\.$/,
            /^The disguise doesn't change your traits or statistics\b.*\.$/,
            /^It might affect what items you can hold or wear\b.*\.$/,
            grade === "Lesser" ? /^The potion shrinks you down to a minimum of size Small, or maintains your size\b.*\.$/ : /^The potion shrinks you down to a minimum of size Tiny, or increases your size\b.*\bto a maximum of Large\.$/,
            grade === "Lesser" ? /^For example, if you are Medium and drink a potion of fire giant disguise\b.*\.$/ : /^This does not change any of your statistics, with the exception of reducing your reach to 0 as a Tiny creature\.$/,
            /^The creature has to be of a specific kind\b.*\bcan't cause you to mimic a specific individual creature\.$/,
            /^The effects of this potion use the same rules as the Impersonate activity of Deception\.$/,
            /^Onlookers always assume you're the chosen type of creature unless they're actively Seeking\.$/,
            /^You gain a \+4 status bonus to your Deception DC against such Perception checks and add your level even if untrained\.$/,
            ...(grade === "Greater" ? [/^While drinking a greater potion of disguise ?, if you picture the specific form\b.*\.$/, /^You can attempt to Impersonate a specific individual, though you still need to roll Deception\.$/] : [])
        ],
        card: (found, plan) => {
            const row = plan?.resolution?.check?.roll === "automatic" ? plan.resolution.outcomes?.success : null;
            const bonus = row?.modifiers?.length === 1 && row.modifiers[0].selector === "deception-dc" ? row.modifiers[0] : null;
            if (!bonus) return null;
            const size = grade === "Lesser" ? "Its size shrinks to the creature's, but not below Small, and never grows." : "Its size becomes the creature's, from Tiny up to Large, its statistics unchanged except that a Tiny one's reach is 0.";
            const greater = grade === "Greater" ? " Picturing a specific form as it drinks, it takes that form, and it can try to Impersonate a specific individual (still rolling Deception)." : "";
            const text = `It looks like a creature of the kind its potion was made for (a specific kind, never a specific individual), its traits, statistics and abilities its own — though the form may limit what it can hold or wear. ${size}${greater} Onlookers take it for that creature unless they're actively Seeking (PF2e's Impersonate): the +4 status bonus to its Deception DC is only against those Perception checks, and it adds its level even if untrained. It lasts 2d12 hours, rolled by the GM in secret: this Effect and the bonus are set to the 24 hours that roll can reach, for the GM to end sooner.`;
            return { keep: true, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, noteEffects: [{ label: "Disguised", text, duration: bonus.duration }] } } }, unread: undefined, partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } };
        }
    })),
    {
        // (A disguise ready at once for 24 hours: its −2 circumstance penalty to Impersonate with it a modifier of PF2e's own predicates — not
        // with Quick Disguise —, its words on its wearer for that time; trained in Deception, its requirement, the card's check.)
        name: "Emergency Disguise",
        sentences: [
            /^Usage affixed to armor Activate Envision Requirements You're trained in Deception\b.*\.$/,
            /^Each of these talismans stores a specific disguise\b.*\.$/,
            /^When activated, the talisman applies a disguise to its wearer, allowing them to Impersonate\b.*\.$/,
            /^The components the disguise creates can appear to be worth up to (\d+) gp total\.$/,
            /^The instant nature of the disguise leaves a few traces\b.*\bimposing a -(\d+) circumstance penalty on checks to Impersonate using the disguise\.$/,
            /^Wearers with the Quick Disguise feat don't take this penalty\.$/,
            /^Any objects created as a part of the disguise disappear after (\d+) (hours?) or after you remove them\.$/
        ],
        card: ([, , , worth, penalty, , time]) => own({
            modifiers: [{ selector: "deception", value: -Number(penalty[1]), type: "circumstance", predicate: ["action:impersonate", { not: "feat:quick-disguise" }], duration: timeOf(time[1], time[2]) }],
            noteEffects: [{ label: "Emergency disguise", text: `It wears the talisman's stored disguise (its pieces worth up to ${worth[1]} gp in all) and can Impersonate with no time spent putting one together; its −${penalty[1]} to Impersonate with it doesn't apply with Quick Disguise. The disguise's objects vanish after ${time[1]} hours or once removed: remove this Effect then.`, duration: timeOf(time[1], time[2]) }]
        })
    },
    // (An extra limb for its hour or 8 hours: words on the drinker, a Dismiss its removing them. A fortified tail its second way, as the next
    // better potion — the moderate's for the lesser, the greater's (its tentacle's Strike) for the moderate: the ways card, its pick once.)
    ...[["Lesser", "Moderate"], ["Moderate", "Greater"]].map(([grade, better]) => ({
        name: `Tentacle Potion (${grade})`,
        sentences: [
            /^Upon consuming this mottled, foul-tasting liquid, .*\blimb of ectoplasm\.$/,
            /^Your clothing doesn't need to accommodate this limb\b.*\.$/,
            /^The limb lasts (\d+) (hours?), and you can Dismiss the activation\.$/,
            /^You can't hide or disguise the tentacle\.$/,
            /^You can use the limb to perform simple Interact actions\b.*\.$/,
            /^Your limb can't perform actions that require significant manual dexterity\b.*\.$/,
            ...(grade === "Lesser" ? [/^You can't use it to hold items\.$/] : []),
            /^At one time, you can have only one extra limb from any version of this potion\.$/,
            /^Stronger tentacle potions replace the effects of weaker ones\.$/,
            ...(grade === "Moderate" ? [/^You can use the limb to hold an item of up to light Bulk\.$/, /^You can also use the whole limb to hold onto a suitable anchor point\b.*\bsubject to the GM's discretion\.$/, /^While using your limb this way, you have free use of all your other limbs\b.*\.$/] : []),
            /^If you have the Flexible Tail or Skillful Tail feats, the Tailed Goblin heritage, .*\bthis potion can instead fortify your tail\.$/,
            /^A fortified tail benefits from any tentacle potion as if the potion were the next better type\.$/
        ],
        card: (found, plan, own) => ({ builtin: "ways", once: true, targeting: { target: null, range: null, area: null }, ways: [tentacleWay(grade, "Tentacle", own), tentacleWay(better, "Fortified tail", own)] })
    })),
    {
        // (A target called out: it hits only that one, dust on a miss or on anything else — its user's own Strike; who's who the GM's.)
        name: "Trustworthy Round",
        sentences: [
            /^This ammunition was developed in Dongun Hold\b.*\.$/,
            /^Before you can fire a trustworthy round, you must call out a target\.$/,
            /^You don't need to specify a name; .*\bthis also prevents abilities that redirect attacks\.$/,
            /^The round doesn't have any capabilities beyond your own\b.*\.$/,
            /^If you specify a target of "Seltyiel" .*\bthe round would dissolve\.$/
        ],
        card: () => own({ notes: ["Its user calls out its target before firing (a description will do): the round can hit only that creature, and turns to dust on a miss or on touching anything else — no ability can redirect it.", "It knows no more than its user: it hits the creature its user meant, disguised or not, and dissolves at one its user didn't know was the one named (the GM's)."] })
    }
];

// Whether a reading is for this source name (its words aren't worth reading otherwise).
export const hasIllusionReading = (name) => READINGS.some((entry) => entry.name === name);

// Its sentences as one reading's, each matched in order → the matches, or null.
function matched(reading, sentences) {
    if (sentences.length !== reading.sentences.length) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? found : null;
}

// The plan (null, note-only or the GM's no-effect — or any, for a reading over it) and its effect's words → the reading's card, or the same
// plan. name: its source name; base, info, frequency: its own (lasting.js activationBase, or a consumable's basePlan and itemInfo).
export function withIllusionReading(plan, { name, words, base, info, frequency = null }) {
    const readings = READINGS.filter((entry) => entry.name === name && (entry.over || !plan || plan.noteOnly || plan.builtin === "no-effect"));
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of readings) {
        const found = matched(reading, sentences);
        const card = found ? reading.card(found, plan, { base, info }) : null;
        if (!card) continue;
        // (Over the plan read before, its own parts kept.)
        if (card.keep) {
            const { keep, ...changes } = card;
            const next = { ...plan, ...changes };
            for (const key of Object.keys(changes)) if (changes[key] === undefined) delete next[key];
            return next;
        }
        const { item: mine, ...rest } = card;
        return {
            ...base,
            automation: { level: "automatic" },
            trigger: { event: "use", ...(frequency ? { frequency } : {}) },
            ...rest,
            item: { ...info, ...(mine ?? {}) }
        };
    }
    return plan;
}

// (An activation's, as src/compiler/permanent.js calls it: its base from lasting.js.)
export function withActivationIllusion(plan, item, entry) {
    const { base, info, frequency } = activationBase(item, entry);
    if (!hasIllusionReading(base.source.name)) return plan;
    return withIllusionReading(plan, { name: base.source.name, words: effectWords(entry.activation?.html, "activation"), base, info, frequency });
}

// Who sees whom, and several creatures at once (2026-10-27, docs/needs.md "Hidden, undetected, invisible, cover", "Several creatures at
// once"): an activation or a consumable read sentence by sentence as src/compiler/lasting.js reads its own — every sentence one of the
// reading's, in order, none dropped. PF2e keeps Hidden, Undetected, Concealed and Invisible on one actor, not between two creatures, so what
// an item changes of them is words on a note Effect for its time (the user's ruling for a rule PF2e can't play, 2026-10-25), on the creature
// it's about: Chameleon Suit's "For 1 minute, you can Hide without needing cover or concealment to do so" on its user, Glimmering Missive's
// "Visible creatures can't be Concealed while covered by the luminous dust; any Invisible creatures are concealed …" on each creature its
// presser targets in the burst (plan.item.recipient "targets"), Shadowmist Cape's "you're Hidden from that creature until the end of your next
// turn …" on the creature that missed. What PF2e can play goes on that Effect as its rules: Siege Shield's "standard cover for one Medium or
// smaller creature in its square and lesser cover for a Large one" — PF2e's own Effect: Cover's rules at that degree, the ways card's two
// buttons —, Aroma Concealer's "+2 item bonus to Stealth checks to Hide or Sneak against creatures using primarily smell" — a toggle for the
// smell, as PF2e's own Aromatic Ammunition has one. What a creature's sight changes once — Hunter's Bane's attacker now Observed, a flat check
// Goblin-Eye Orb spares its Strike — is a line of the card, the GM's to keep (the user's ruling for the GM's lines and the map). What it
// tells, whispered (Detector Stone, Singing Stone's Stone's Sight); a spell cast (Rhyton of the Radiant Ifrit's Command); berries that heal
// (Feather Token (Holly Bush): plan.item.creates, as Verdant Branch's fruit). Live: the item card, the ability module's note Effects, the
// spell module's cast. Pure.

import { effectWords, withSentenceReadings } from "./lasting.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours", day: "days", days: "days" };
const WORDS = { a: 1, an: 1, one: 1, ten: 10 };
const time = (value, unit) => ({ mode: "fixed", value: WORDS[String(value).toLowerCase()] ?? Number(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
// (Counted from its user's turn: to the start of its next turn, to the end of its next turn, to the end of this one.)
const START = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "source-turn" };
const NEXT_END = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const TURN_END = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const toggle = (option, label) => ({ key: "RollOption", domain: "all", option, toggleable: true, label });

// The card's parts: one row (note Effects, on its user or on each creature targeted), its lines, its item part.
const ownRow = ({ noteEffects = [], notes = [], targeting = { target: null, range: null, area: null }, item = null }) => ({
    targeting,
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), noteEffects } } },
    ...(notes.length ? { notes } : {}),
    ...(item ? { item } : {})
});
const area = (type, value, target = "the creatures in the area") => ({ target, range: null, area: { type, value: Number(value) } });
// (What it tells: whispered to the GM and its user, the GM filling in what it shows — the user's ruling, src/compiler/decided.js.)
const whisper = (text) => ({ builtin: "whisper", targeting: { target: null, range: null, area: null }, whisper: { text } });
const forTargets = { recipient: "targets" };

// Hiding with nothing to hide behind, but no Sneaking without it (Chameleon Suit's and Camouflaging Chromatophores' words).
const HIDE_ANYWHERE = /^For (\d+|an?|one) (minutes?|hours?), you can Hide without needing cover\b.*\.$/;
const NO_SNEAK = /^This doesn't allow you to Sneak\b.*\bcover or concealment\b.*\.$/;
const blendingIn = ([count, unit]) => ({ label: "Blending in", text: "It can Hide without cover or concealment, though it still can't Sneak without ending its movement in cover or concealment.", duration: time(count, unit) });
// (A creature's visibility on PF2e's own Effect: Cover, at one degree — its circumstance bonus to AC, to Reflex saves against areas, to
// Stealth to Hide, Sneak or avoid detection and to Avoid Notice's initiative, and its roll options.)
const coverRules = (level, bonus) => [
    { key: "RollOption", option: `self:cover-bonus:${bonus}` },
    { key: "RollOption", option: `self:cover-level:${level}` },
    { key: "FlatModifier", selector: "ac", type: "circumstance", value: bonus },
    { key: "FlatModifier", selector: "reflex", type: "circumstance", value: bonus, predicate: ["area-effect"] },
    { key: "FlatModifier", selector: "stealth", type: "circumstance", value: bonus, predicate: [{ or: ["action:hide", "action:sneak", "avoid-detection"] }] },
    { key: "FlatModifier", selector: "initiative", type: "circumstance", value: bonus, predicate: ["action:avoid-notice"] }
];

// Each reading: the plan's source name (an activation's "Item: Activation", an unnamed one's its item's), a pattern for each sentence of
// its effect in order, and the card they make (over: read over the plan read before).
const READINGS = [
    {
        // (Undead's attacks sensed for a minute: words on its user — PF2e's flanking rule has no undead's.)
        name: "Peachwood Talisman",
        sentences: [/^Access Tian Xia origin Activate\b.*\.$/, /^It smells of sandalwood\b.*\.$/, /^After activation, for the next (minute|\d+ minutes), you can sense attacks from undead\.$/, /^You aren't Off-Guard to Hidden, Undetected\b.*\bsurprise attack\.$/, /^However, they can still help\b.*\bflank\.$/],
        card: ([, , sense]) => ownRow({ noteEffects: [{ label: "Senses undead", text: "It senses undead's attacks: undead of its level or lower don't make it Off-Guard by being Hidden from it, Undetected by it or flanking it, nor with a surprise attack, though they still help their allies flank.", duration: sense[1] === "minute" ? time(1, "minute") : time(...sense[1].split(" ")) }] })
    },
    ...["", " (Greater)", " (Major)"].map((grade) => ({
        // (Its minute, 10 minutes or hour of hiding anywhere; falling apart after, a line.)
        name: `Chameleon Suit${grade}`,
        sentences: [/^This complex clockwork outerwear\b.*\.$/, /^When activated, the clockwork gears work double-time\b.*\.$/, HIDE_ANYWHERE, NO_SNEAK, /^Once the duration expires, the overworked clockwork\b.*\.$/],
        card: ([, , hide]) => ownRow({ noteEffects: [blendingIn(hide.slice(1))], notes: ["When its time is up, the suit falls apart."] })
    })),
    ...["(Lesser)", "(Greater)"].map((grade) => ({
        name: `Camouflaging Chromatophores ${grade}: Background Adaptation`,
        sentences: [HIDE_ANYWHERE, NO_SNEAK],
        card: ([hide]) => ownRow({ noteEffects: [blendingIn(hide.slice(1))] })
    })),
    {
        // (Each creature in the burst lit up for the hour: words on each one targeted.)
        name: "Glimmering Missive",
        sentences: [/^A glimmering missive sparkles\b.*\.$/, /^When activated, it explodes\b.*\bin a (\d+)-foot burst from a corner\b.*\.$/, /^Creatures in the area are covered\b.*\bluminous for (\d+|an?|one) (hours?|minutes?)\.$/, /^Visible creatures can't be Concealed while covered\b.*\brather than being undetected\.$/],
        card: ([, burst, lasts]) => ownRow({
            targeting: area("burst", burst[1]),
            noteEffects: [{ label: "Glittering dust", text: "Covered in luminous dust: while visible it can't be Concealed, and while Invisible it's Concealed rather than Undetected.", duration: time(lasts[1], lasts[2]) }],
            notes: [`Target the creatures in its ${burst[1]}-foot burst (from a corner of the missive's space), then press Apply.`],
            item: forTargets
        })
    },
    ...["(Lesser)", "(Greater)"].map((grade) => ({
        // (Its drinker's scent hidden: words on the drinker — no PF2e rule tells a Seek by scent from the rest.)
        name: `Olfactory Obfuscator ${grade}`,
        sentences: [/^This frothing fluid causes\b.*\.$/, /^For (\d+) (minutes?|hours?) after drinking this elixir\b.*\bunnoticeable\.$/, /^Creatures with imprecise scent don't detect you\b.*\bprecise scent\.$/, /^You gain a \+(\d+) item bonus against attempts\b.*\bscent-based senses\b.*\.$/],
        card: ([, lasts, , bonus]) => ownRow({
            targeting: { target: "the drinker", range: null, area: null },
            noteEffects: [{ label: "Scent masked", text: `Its scent is nearly unnoticeable: imprecise scent doesn't detect it unless Seeking it, it's Concealed from precise scent, and it has a +${bonus[1]} item bonus against a Seek by creatures using only scent.`, duration: time(lasts[1], lasts[2]) }]
        })
    })),
    ...["(Lesser)", "(Greater)"].map((grade) => ({
        // (The mist's minute on each creature in the cone: an Invisible one is only Concealed.)
        name: `Revealing Mist ${grade}`,
        sentences: [/^Kept in an airtight spray bottle\b.*\bin a (\d+)-foot cone when sprayed\.$/, /^It doesn't affect visibility\b.*\bInvisible creatures in the area\b.*\bConcealed rather than undetected\.$/, /^Revealing mist is ineffective in water\b.*\bdetermined by the GM\.$/, /^It remains in the area for (\d+|an?|one) (minutes?|rounds?)\b.*\bwind\b.*\.$/],
        card: ([cone, , , lasts]) => ownRow({
            targeting: area("cone", cone[1]),
            noteEffects: [{ label: "Revealing mist", text: "In the clinging mist: while Invisible, it's Concealed rather than Undetected.", duration: time(lasts[1], lasts[2]) }],
            notes: [`Target the creatures in its ${cone[1]}-foot cone, then press Apply; an Invisible creature that enters the mist later is Concealed the same way (the map's).`, "It does nothing in water or where something else spreads the mist (the GM's call), and a significant wind disperses it early."],
            item: forTargets
        })
    })),
    {
        // (The first creature the coated weapon damages within the hour glows for a minute: the attack riders' watch on the weapon picked,
        // its note Effect on that creature, the oil spent — scripts/attack-riders.js weaponDamageDealt.)
        name: "Oil of Revelation",
        sentences: [/^This bright oil, first created by humans\b.*\.$/, /^The first time a weapon coated\b.*\bdamages a creature, the wound glows\b.*\bfor (\d+|an?|one) (minutes?|rounds?)\.$/, /^If the creature is Invisible, the light's position\b.*\brather than undetected\.$/, /^The light also negates the Concealed condition\b.*\.$/, /^If the coated weapon doesn't damage\b.*\bwithin (\d+|an?|one) (hours?|minutes?)\b.*\bsloughs off\b.*\.$/],
        card: ([, glows, , , lasts]) => ownRow({
            notes: ["Pick the weapon it coats: the first creature that weapon damages before the oil sloughs off gets the glow."],
            item: { attackRiders: { riders: [{ on: ["dealt"], weapon: true, once: true, note: { label: "Glowing wound", text: "Its wound glows: while Invisible it's only Hidden, not Undetected, to those that couldn't see it, and lighting doesn't make it Concealed.", duration: time(glows[1], glows[2]) } }], duration: time(lasts[1], lasts[2]) } }
        })
    },
    {
        // (The creature in the square pinpointed to the end of its user's turn.)
        name: "Powder",
        sentences: [/^A bag of powder contains\b.*\.$/, /^In addition to other uses for powder\b.*\.$/, /^You can throw the powder\b.*\badjacent square\b.*\.$/, /^If there's a creature in that square\b.*\bObserved until the end of your turn\b.*\.$/, /^The powder quickly falls away\b.*\.$/],
        card: () => ownRow({
            targeting: { target: "1 creature", range: "5 feet", area: null },
            noteEffects: [{ label: "Powdered", text: "Pinpointed by the powder: Observed (not Hidden) by its thrower until the end of the thrower's turn, though still Concealed by its invisibility.", duration: TURN_END }],
            notes: ["Thrown into an adjacent square (an Interact action): target the creature there, then press Apply — an empty square, nothing more."],
            item: forTargets
        })
    },
    {
        // (A Stride, then a Strike while still Undetected: the Strike its user's own, a line of the move card.)
        name: "Lion Claw",
        over: true,
        sentences: [/^Usage affixed to armor Activate\b.*\bRequirements You're undetected by a creature\b.*\bmaster in Stealth\.$/, /^This dried claw from a mighty beast\b.*\.$/, /^When you activate the claw, you learn to pounce\b.*\.$/, /^You Stride and then Strike\b.*\bone creature you were Undetected by\.$/, /^You remain undetected by the creature\b.*\bStrike\.$/],
        card: (found, plan) => (plan?.builtin === "teleport" && plan.teleport?.move?.verb === "Stride" ? {
            keep: true,
            notes: ["Its user must be Undetected by a creature and a master in Stealth.", "Then it Strikes with the affixed weapon a creature it was Undetected by (its own action), still Undetected by it until after that Strike (the GM's to keep)."],
            partial: undefined,
            automation: { level: "automatic" }
        } : null)
    },
    {
        name: "Hunter's Bane",
        sentences: [/^Usage affixed to armor Activate\b.*\bTrigger A Hidden or Undetected enemy hits you\b.*\bRequirements You are trained in Survival\b.*\.$/, /^When you activate the hunter's bane\s*, you sense the exact location\b.*\.$/, /^It becomes Observed by you\b.*\bhidden from you\b.*\bundetected\.$/, /^If the attacker is behind lead\b.*\bno effect\.$/],
        card: () => ownRow({ notes: ["Its wearer, trained in Survival, activates it when a Hidden or Undetected enemy hits it with an attack.", "It senses the attacker's exact location: the attacker is now Observed by it if it was Hidden from it, or Hidden from it if it was Undetected (the GM's to keep) — nothing if the attacker is behind lead."] })
    },
    {
        name: "Goblin-Eye Orb",
        sentences: [/^Usage affixed to a weapon Activate\b.*\bTrigger You attempt a Strike\b.*\bconcealed or hidden to you\.$/, /^Requirements You're an expert with the affixed\b.*\bPerception\.$/, /^This colorful marble dangles\b.*\.$/, /^When you activate the band\b.*\bthe triggering Strike\b.*\bflat check\b.*\.$/],
        card: () => ownRow({ notes: ["Its user, an expert with the affixed firearm or crossbow and in Perception, activates it as it attempts a Strike with it at an enemy that's Concealed or Hidden to it.", "That Strike takes no flat check for the enemy being Concealed or Hidden (its user's roll to skip)."] })
    },
    {
        name: "Ghostshot Wrapping",
        sentences: [/^Trigger You attempt a ranged Strike\b.*\bwhile hidden or undetected\.$/, /^This long strip of linen\b.*\.$/, /^When activated, the talisman's magic dampens the sound\b.*\.$/, /^You don't become automatically observed\b.*\bthe triggering Strike\.$/],
        card: () => ownRow({ notes: ["Its user activates it as it attempts a ranged Strike with the affixed weapon while Hidden or Undetected.", "The shot is silent and seems to come from somewhere else: making it doesn't leave its user Observed by anyone (the GM's to keep it Hidden or Undetected)."] })
    },
    ...["Feather Token (Holly Bush)", "Feather Token (Holly Bush) (Ammunition)"].map((name) => ({
        // (Its 2d4 berries in its user's inventory, each eaten for 1 Hit Point — the bush and its cover the map's.)
        name,
        sentences: [
            ...(name.endsWith("(Ammunition)") ? [] : [/^Each feather token appears\b.*\.$/, /^The feather's shaft\b.*\.$/, /^Activating a feather token causes\b.*\.$/, /^Each feather can be activated only once\b.*\.$/]),
            /^(?:Activate\b.*\b)?When this feather is activated\b.*\binto a living holly bush\b.*\bsingle square\.$/,
            /^This bush can provide standard cover\.$/,
            /^In addition, the bush has (\d+d\d+|\d+) bright-red berries\.$/,
            /^While holly berries are usually poisonous\b.*\.$/,
            /^You can pick and eat a berry\b.*\bto recover (\d+) Hit Points?\.$/,
            /^Once plucked from the bush\b.*\.$/,
            /^If activated on soil\b.*\.$/,
            /^If activated elsewhere, it withers and dies within (\d+d\d+|\d+) days\.$/
        ],
        card: (found) => {
            const at = name.endsWith("(Ammunition)") ? 0 : 4;
            const [berries, heal, withers] = [found[at + 2][1], found[at + 4][1], found[at + 7][1]];
            return ownRow({
                notes: [`It becomes a living holly bush filling one square${at ? "" : " where the shot lands"}, which can give standard cover (the map's).`, "Each berry is picked and eaten from the bush with an Interact action: eaten later than that, it does nothing.", `On soil the bush lives on (with no more berries); elsewhere it withers within ${withers} days (the GM's).`],
                item: { recipient: "user", creates: { name: "Holly Berry", count: berries, heal: `@Damage[${heal}[healing]]` } }
            });
        }
    })),
    {
        // (Its drinker's Stealth while Avoiding Notice: PF2e's own action:avoid-notice — its initiative so —, or a toggle for the rest.)
        name: "Phantom Roll",
        over: true,
        sentences: [/^A phantom roll contains vegetables\b.*\.$/, /^Upon eating the roll, you gain a \+(\d+) item bonus to Stealth checks\b.*\bAvoid Notice exploration activity\.$/, /^You can also Avoid Notice\b.*\bfull Speed\b.*\bhalf Speed\.$/, /^These effects expire (\d+) hours after you eat the roll\b.*\bwhichever comes first\.$/],
        card: ([, bonus, , ends], plan) => {
            const row = plan?.resolution?.outcomes?.success;
            if (!row || !(row.modifiers ?? []).some((modifier) => modifier.selector === "stealth")) return null;
            const note = { label: "Phantom roll", text: `+${bonus[1]} item bonus to Stealth checks during Avoid Notice (its toggle on while Avoiding Notice; PF2e's own Avoid Notice initiative counts too). It can Avoid Notice at full Speed, or with Investigate or Scout at half Speed. It ends sooner at its next daily preparations (remove it then).`, duration: time(ends[1], "hours"), rules: [toggle("phantom-roll-avoid-notice", "Avoiding Notice"), { key: "FlatModifier", selector: "stealth", type: "item", value: Number(bonus[1]), predicate: [{ or: ["action:avoid-notice", "phantom-roll-avoid-notice"] }] }] };
            return { keep: true, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, modifiers: row.modifiers.filter((modifier) => modifier.selector !== "stealth"), noteEffects: [...(row.noteEffects ?? []).filter((entry) => !entry.reminder), note] } } }, unread: undefined, partial: undefined, automation: { level: "automatic" } };
        }
    },
    {
        // (A bonus against smell: PF2e's toggle for it, as its Aromatic Ammunition has.)
        name: "Aroma Concealer",
        over: true,
        sentences: [/^This oily mix of herbs\b.*\.$/, /^The creature receives a \+(\d+) item bonus to Stealth checks\b.*\bHide or Sneak\b.*\bprimarily smell\.$/, /^This bonus also applies\b.*\bTrack the creature by scent\.$/, /^The listed amount is enough\b.*\bMedium or smaller creature\b.*\.$/, /^The effect lasts for (\d+|an?|one) (hours?|minutes?) after applying\.$/],
        card: ([, bonus, , , lasts], plan) => {
            const row = plan?.resolution?.outcomes?.success;
            if (!row || !(row.modifiers ?? []).some((modifier) => modifier.selector === "stealth")) return null;
            const note = { label: "Odour masked", text: `+${bonus[1]} item bonus to Stealth checks to Hide or Sneak against creatures using primarily smell (its toggle on against them), and to the DC to Track it by scent (the GM's).`, duration: time(lasts[1], lasts[2]), rules: [toggle("aroma-concealer-smell", "Against a creature using smell"), { key: "FlatModifier", selector: "stealth", type: "item", value: Number(bonus[1]), predicate: ["aroma-concealer-smell", { or: ["action:hide", "action:sneak"] }] }] };
            return { keep: true, notes: [...(plan.notes ?? []), "One dose covers one Medium or smaller creature, applied over 1 minute."], resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, modifiers: row.modifiers.filter((modifier) => modifier.selector !== "stealth"), noteEffects: [...(row.noteEffects ?? []).filter((entry) => !entry.reminder), note] } } }, unread: undefined, partial: undefined, automation: { level: "automatic" } };
        }
    },
    {
        // (The cast's 1 hour, the fulus' own Duration, not Shared Invisibility's — its other changes the one-off's lines, src/compiler/one-offs.js.)
        name: "Fulu of Concealment",
        over: true,
        sentences: [/^Usage affixed to the ground in four spaces\b.*\bDuration (\d+|an?|one) (hours?|minutes?)\b.*\.$/, /^Choose one of the following traits\b.*\.$/, /^Those within the fulus' circle\b.*\bShared Invisibility\b.*\.$/, /^If any of the fulus are moved or destroyed\b.*\.$/],
        card: ([lasts], plan) => (plan?.builtin === "cast-spell" ? { keep: true, castDuration: { value: WORDS[lasts[1].toLowerCase()] ?? Number(lasts[1]), unit: UNITS[lasts[2].toLowerCase()], said: `Duration ${lasts[1]} ${lasts[2]}` } } : null)
    },
    {
        // (The ally linked to its user for a day: Status's effects each way, words on both.)
        name: "Lady's Knife",
        sentences: [/^You offer this weapon as a romantic\b.*\bto an ally\.$/, /^You and the ally become linked for (\d+|an?|one) (days?|hours?)\.$/, /^During this time, you each benefit\b.*\bStatus, using each other\b.*\.$/],
        card: ([, linked]) => {
            const lasts = time(linked[1], linked[2]);
            return ownRow({
                targeting: { target: "1 ally and you", range: "touch", area: null },
                noteEffects: [{ label: "Linked", text: "Linked by the lady's knife: it has Status's effects on its partner, and the partner on it.", duration: lasts.unit === "days" ? { ...lasts, value: lasts.value * 24, unit: "hours" } : lasts }],
                notes: ["Target the ally and its user, then press Apply: each gets the link."],
                item: forTargets
            });
        }
    },
    {
        // (The foe its user had been hidden from, Off-Guard to its user's allies alone: words on that foe.)
        name: "Mirror Robe",
        sentences: [/^You draw attention toward yourself\.$/, /^Choose one foe to which you were\b.*\bundetected\.$/, /^You reveal yourself to all, becoming observed\.$/, /^The foe you chose diverts its attention\b.*\bOff-Guard to your allies\b.*\byour next turn\.$/, /^If you are Invisible or otherwise\b.*\bthis activation\.$/],
        card: () => ownRow({
            targeting: { target: "1 foe", range: null, area: null },
            noteEffects: [{ label: "Diverted", text: "Its attention turned to the robe's wearer: Off-Guard to the wearer's allies (not to the wearer) until the start of the wearer's next turn.", duration: START }],
            notes: ["Target the foe it had been Hidden from or Undetected by, then press Apply: its wearer reveals itself to all, Observed (the GM's to keep).", "Not while its wearer is Invisible or otherwise can't become Observed."],
            item: forTargets
        })
    },
    {
        // (Hidden from the creature that missed: words on that creature, to the end of its user's next turn.)
        name: "Shadowmist Cape",
        over: true,
        sentences: [/^Attempt a @Check\[stealth[^\]]*\] check against the triggering creature's Perception DC\.$/, /^On a success, you're Hidden\b.*\buntil right after\b.*\.$/, /^On a critical success, you're hidden\b.*\beven if you use hostile actions\b.*\.$/],
        card: (found, plan) => {
            const rows = plan?.resolution?.outcomes;
            const gm = (row, test) => (row?.manualInstructions ?? []).filter((line) => test.test(said(line)));
            const [success, critical] = [gm(rows?.success, /^\{source\} \(success\): you're Hidden from that creature\b/i), gm(rows?.criticalSuccess, /^\{source\} \(critical success[^)]*\): you're hidden from that creature\b/i)];
            if (!success.length || !critical.length) return null;
            const note = (text) => ({ label: "Lost in the mist", text, duration: NEXT_END });
            const left = (row, gone) => ({ ...row, manualInstructions: (row.manualInstructions ?? []).filter((line) => !gone.includes(line)) });
            const clean = (row) => {
                const { manualInstructions, ...rest } = row;
                return manualInstructions?.length ? row : rest;
            };
            const outcomes = {
                ...rows,
                success: clean({ ...left(rows.success, success), noteEffects: [...(rows.success.noteEffects ?? []), note("The cape's wearer is Hidden from it until the end of the wearer's next turn, or until just after the wearer uses a hostile action against it.")] }),
                criticalSuccess: clean({ ...left(rows.criticalSuccess, critical), noteEffects: [...(rows.criticalSuccess.noteEffects ?? []), note("The cape's wearer is Hidden from it until the end of the wearer's next turn, even if the wearer uses hostile actions against it.")] })
            };
            return { keep: true, resolution: { ...plan.resolution, outcomes }, partial: undefined, automation: { level: "automatic" } };
        }
    },
    {
        // (The darts' light on the creature hit, to the start of its user's next turn: words on it; the knife back in hand, a line.)
        name: "Guiding Starknife: Points of Light",
        over: true,
        sentences: [/^The guiding starknife's blades detach\b.*\.$/, /^This damage increases to\b.*\bwith a major striking rune\.$/, /^The guiding starknife then re-forms\b.*\.$/, /^Until the start of your next turn, the damaged creature is outlined\b.*\bconcealment\.$/],
        card: (found, plan) => {
            const row = plan?.resolution?.outcomes?.success;
            const lines = (row?.manualInstructions ?? []).map(said);
            const back = lines.find((line) => /^\{target\}: The guiding starknife then re-forms\b/.test(line));
            const lit = lines.find((line) => /^\{target\}: Until the start of your next turn, the damaged creature is outlined\b/.test(line));
            if (!back || !lit || lines.length !== 2) return null;
            const { manualInstructions, ...rest } = row;
            const success = { ...rest, noteEffects: [...(row.noteEffects ?? []), { label: "Outlined", text: "Outlined in soft light: it can't gain the effects of concealment.", duration: START }] };
            return { keep: true, notes: [...(plan.notes ?? []), "The starknife then re-forms and returns to its user's hand."], resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success } }, partial: undefined, automation: { level: "automatic" } };
        }
    },
    {
        // (A cover propped up for one creature, its degree by that creature's size: the ways card's two, each PF2e's cover rules on it.)
        name: "Siege Shield: Plant Cover",
        sentences: [/^You unequip the shield and prop it\b.*\.$/, /^The shield grants standard cover\b.*\bMedium or smaller creature\b.*\blesser cover for a Large one\.$/],
        card: (found, plan, { base, info }) => {
            const way = (name, level, bonus, who) => ({
                name,
                html: `<p><strong>Effect</strong> ${name}.</p>`,
                plan: {
                    ...base,
                    automation: { level: "automatic" },
                    targeting: { target: `1 ${who} creature in its square`, range: null, area: null },
                    trigger: { event: "use" },
                    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), noteEffects: [] } } },
                    notes: ["Its user unequips the shield and props it on the ground (its own action). Target the creature in the shield's square, then press Apply; remove the Effect once it leaves the square or the shield is taken up (the map's)."],
                    item: { ...info, recipient: "targets", ruleEffects: [{ name: `${level} cover`, words: `${level === "standard" ? "Standard" : "Lesser"} cover from the propped siege shield (+${bonus} circumstance bonus to AC, to Reflex saves against areas and to Stealth to Hide or Sneak)`, rules: coverRules(level, bonus), duration: null }] }
                }
            });
            return { builtin: "ways", once: true, targeting: { target: null, range: null, area: null }, ways: [way("Medium or smaller: standard cover", "standard", 2, "Medium or smaller"), way("Large: lesser cover", "lesser", 1, "Large")] };
        }
    },
    ...[0, 1].map((way) => ({
        // (The elixir, oil or potion it holds used through it, Potion Patch's way — one of its user's, picked: its own card follows, where
        // the creature it's for is chosen. Its reagents' 10 uses a line.)
        name: "Alchemical Atomizer",
        sentences: way === 0
            ? [/^You spray the contents of the atomizer\b.*\badjacent willing ally or unattended object\.$/, /^The target gains the effects\b.*\belixir, oil, or potion\.$/, /^The target must be a valid\b.*\bthe consumable is lost\.$/]
            : [/^You cause the atomizer to mix\b.*\ba square within (\d+) feet\.$/, /^The consumable forms a cloud\b.*\.$/, /^The first willing valid target\b.*\bgains the effect of the consumable\.$/, /^If there are multiple valid targets\b.*\.$/, /^The cloud is consumed upon contact\b.*\bwhichever comes first\.$/],
        card: (found) => ownRow({
            notes: [
                way === 0
                    ? "Pick the elixir, oil or potion it holds: its own card follows, for its user or an adjacent willing ally (or an unattended object) — one it suits, or it's lost."
                    : `Pick the consumable it holds: it's fired as a cloud filling a square within ${found[0][1]} feet. Its own card follows: give it to the first willing creature it suits that enters the square, which decides how it applies (the map's); the cloud is gone then, or at the start of its user's next turn.`,
                "Its reagents last 10 uses; a new batch costs 5 gp and an Interact action."
            ],
            item: { patch: { maxLevel: null, categories: ["elixir", "oil", "potion"] } }
        })
    })),
    // (What it tells, whispered.)
    {
        name: "Detector Stone",
        sentences: [/^You channel your life-force into the stone\b.*\.$/, /^The stone can detect undead within (\d+) feet\b.*\buntil the end of your turn\.$/, /^Undead hiding or disguising themselves\b.*\bthe DC of the check is (\d+) rather than (\d+)\.$/],
        card: ([, far, dc]) => whisper(`Until the end of its user's turn, the stone glows if an undead is within ${far[1]} feet; one that's Hidden or disguised must succeed at a Deception or Stealth check against DC ${dc[1]} (not ${dc[2]}) to stay so from it — the GM rolls and tells.`)
    },
    {
        name: "Detector Stone",
        sentences: [/^You focus on the stone as it glows\b.*\.$/, /^You detect the auras of evil undead in a (\d+)-foot radius\b.*\.$/, /^This has the effects of a (\d+)\w*-rank detect alignment spell\b.*\bevil undead\.$/],
        card: ([, radius, rank]) => whisper(`Its user detects the auras of evil undead within ${radius[1]} feet and learns each one's location and strength (a rank ${rank[1]} detect alignment for evil undead only) — the GM tells what's there.`)
    },
    {
        name: "Singing Stone: Stone's Sight",
        sentences: [/^Placing the singing stone against a rocky surface\b.*\.$/, /^You get a mental image of this area\b.*\b(\d+) feet deep and (\d+) feet in diameter\.$/, /^The image doesn't convey color\b.*\.$/, /^The image is instant\b.*\.$/],
        card: ([, image]) => whisper(`Held against a rocky surface, it gives its user a colourless picture of what's behind or beneath it, ${image[1]} feet deep and ${image[2]} feet across: which objects and creatures there are moving and which are still, at that moment only — the GM tells what's there.`)
    },
    {
        // (One Command for every hostile creature in range, cast by the spell module; its Fatigued beside it a one-off's line, src/compiler/one-offs.js.)
        name: "Rhyton of the Radiant Ifrit: Ifrit's Command",
        // (Over its one-off's card lines, src/compiler/decided.js: the cast now, its lines the same.)
        over: true,
        sentences: [/^An ifrit's hospitality always comes\b.*\.$/, /^You cause the shuyookh to briefly appear\b.*\bissues a (\d+)\w*-rank Command that targets all creatures\b.*\bhostile to you in range\b.*\.$/, /^The shuyookh issues the same command\b.*\.$/, /^Each target that fails its save also\b.*\bbecoming Fatigued as long as\b.*\bthe command\.$/],
        card: ([, command], plan) => (plan && plan.decided !== "one-off" && plan.builtin !== "no-effect" ? null : {
            builtin: "cast-spell",
            spell: { uuid: "Compendium.pf2e.spells-srd.Item.aIHY2DArKFweIrpf", name: "Command" },
            rank: Number(command[1]),
            dc: null,
            attack: null,
            tradition: null,
            self: false,
            area: false,
            targets: true,
            targeting: { target: "all creatures hostile to you in range", range: null, area: null },
            decided: "one-off",
            notes: ["Target every creature hostile to its user in Command's range: the shuyookh gives them all the same command.", "Each that fails its save is also Fatigued for as long as the command affects it."]
        })
    }
];

// Whether a reading is for this source name.
export const hasVisibilityReading = (name) => READINGS.some((entry) => entry.name === name);

// The words a feather token fired from a bow has after its Activate line ("Activate Strike from a ranged weapon When …"), else its effect's.
const FIRED = /^Activat(?:e|ion) Strike from an? (?:ranged|melee|thrown) weapon\s+/;
export function visibilityWords(html, kind, plain) {
    if (kind === "activation" && FIRED.test(plain ?? "")) return String(plain).replace(FIRED, "").trim();
    return effectWords(html, kind);
}

// The plan and its effect's words → the reading's card, or the same plan. As src/compiler/lasting.js withLastingReading (its base, info and
// frequency the same); a card that needs them (Siege Shield's ways) gets them as a third argument.
export function withVisibilityReading(plan, given) {
    const table = READINGS.map((entry) => ({ ...entry, card: (found, read) => entry.card(found, read, given) }));
    return withSentenceReadings(table, plan, given);
}


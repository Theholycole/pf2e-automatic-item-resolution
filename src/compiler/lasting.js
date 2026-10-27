// Sustained, repeating and later effects whose words the readers before left whole (2026-10-27, docs/needs.md "lasting"): an activation or a
// consumable read sentence by sentence, every sentence of its effect one of the reading's own — none dropped —, into what its card plays. A
// note Effect for the time its words give, on its user or on the creatures it's for (the user's ruling for a rule PF2e can't play,
// 2026-10-25); the conditions its creatures get, ended by an Escape; a spell cast; what it tells, whispered; the card's lines for its user's
// own actions, the map, objects and what's out of combat. Hat of Many Minds' "The copy follows your specific instructions and performs a
// single, straightforward task for up to 30 minutes", Twilight Tattoo's "You can Dismiss this effect, and when you Dismiss it, the tattoo
// copies the original text onto a blank writing surface you're touching": a Dismiss is its user removing the Effect. And a Sustain that
// gives again, Blakenshipper's "For the next minute, you can Sustain to continue the music, granting you and all allies within a 60-foot
// emanation 5 temporary Hit Points that last for 1 round": plan.again, its card kept open for that minute and pressed at each Sustain
// (scripts/poisons.js). The item card plays the rest (src/live/card.js), the spell module the casts. And (2026-10-27, batch 3) the adventure
// books' items of these kinds, and their dying and afflictions: Philter of Empty Dreams' "the potion attempts to counteract the addiction" —
// the counteract card's free row, for what no PF2e item holds —, a revival and its fast healing, the ability module's zones, ways cards for
// an item used one of several ways, PF2e's own toggle on the item; each reading says what it builds. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { zoneOf } from "./area-readings.js";
import { plainText } from "./rows.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours", day: "days", days: "days" };
const WORDS = { a: 1, an: 1, one: 1, ten: 10 };
const timeOf = (value, unit) => ({ mode: "fixed", value: WORDS[String(value).toLowerCase()] ?? Number(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
export const sentencesOf = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const SPELL = (id, name) => ({ uuid: `Compendium.pf2e.spells-srd.Item.${id}`, name });

// Its effect's words: an activation's from "Effect" on (or from its traits' close, with no Effect heading — Bivouac Targe's), a
// consumable's without its Activate line.
const ACTIVATE = /^Activat(?:e|ion)\b\s*(?:\d+ (?:minutes?|hours?|rounds?)\s*)?(?:\([^)]*\)\s*)?(?:(?:envision|command|Interact|manipulate|concentrate)(?:,\s*|\s+))*(?:\([^)]*\)\s*)?/i;
export function effectWords(html, kind) {
    const text = plainText(html).replace(/\s*\bCraft Requirements\b.*$/s, "").trim();
    if (kind !== "activation") return text.replace(ACTIVATE, "").trim();
    const effect = /\bEffect\b\s*(.*)$/s.exec(text)?.[1];
    return (effect ?? /^Activat(?:e|ion)\b[^()]*\([^)]*\)\s*(.*)$/s.exec(text)?.[1] ?? "").trim() || null;
}

// The card's parts: a row of its own (a note Effect, conditions) for its user or for the creatures targeted, and its lines.
// (And its modifiers, for its time: Philter of Empty Dreams' +1 to saves, 2026-10-27.)
const ownRow = ({ noteEffects = [], effects = [], modifiers = [], notes = [], target = null, item = null }) => ({
    targeting: { target, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects, modifiers, ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {}),
    ...(item ? { item } : {})
});
// (A spell the spell module casts: its rank, DC, whom it's on.)
// (Its tradition when the text names one, Ring of Recalcitrant Wishes' arcane Wish, 2026-10-27.)
const cast = ({ spell, rank = null, dc = null, self = false, area = false, targets = false, notes = [], tradition = null }) => ({ builtin: "cast-spell", spell, rank, dc, attack: null, tradition, self, area, targets, notes });
// (What it tells: whispered to the GM and its user, the GM filling in what it shows — the user's ruling, src/compiler/decided.js.)
const whisper = (text) => ({ builtin: "whisper", targeting: { target: null, range: null, area: null }, whisper: { text } });

// Each reading: the plan's source name it's for (an activation's "Item: Activation"), a pattern for each of its effect's sentences — every
// sentence must be one, in order — and the card they make (from its matches, and the plan read before for one that builds on it, over).
const READINGS = [
    {
        // (A copy of its user for a task out of combat, of no use in an encounter: its words on its user for its 30 minutes.)
        name: "Hat of Many Minds: Patchwork Double",
        sentences: [
            /^You tear off a patch of cloth to manifest it into a copy of yourself, dressed in your normal clothes, though they resemble the color and fabric of the patch\.$/,
            /^The copy follows your specific instructions and performs a single, straightforward task for up to (\d+) (minutes?|hours?)\.$/,
            /^It takes the copy three times as long to complete the task as it would you, meaning it can perform a task that would take you a maximum of (\d+) minutes\.$/,
            /^It doesn't react quickly enough to be of any use during an encounter, and it can't use your spells or other special abilities - just basic actions and skill actions\.$/,
            /^The copy disappears and returns to the hat as a piece of cloth when the given task has been completed or when you Dismiss Patchwork Double\.$/
        ],
        card: ([, task, most]) => ownRow({ noteEffects: [{ label: "Patchwork Double", text: `A copy of it, torn from the hat, does one straightforward task it's told, taking three times as long (a task of ${most[1]} minutes for its user at most), with basic and skill actions only — no spells or special abilities, and of no use in an encounter. It returns to the hat when the task is done or Patchwork Double is Dismissed (remove this Effect).`, duration: timeOf(task[1], task[2]) }] })
    },
    {
        // (A text held in the tattoo until it's Dismissed, and copied out then: its words on its user, no time.)
        name: "Twilight Tattoo: Inscribe",
        sentences: [
            /^You lay your hand on a piece of text, and your tattoo makes a perfect copy of it, storing it as a ring of swirling letters surrounding the design\.$/,
            /^The tattoo can hold text equivalent to two pages of a book, a single scroll, or a similar area of other surfaces, though it doesn't replicate any magical effect or other special properties of the original words\.$/,
            /^You can Dismiss this effect, and when you Dismiss it, the tattoo copies the original text onto a blank writing surface you're touching\.$/
        ],
        card: () => ownRow({ noteEffects: [{ label: "Inscribe", text: "The tattoo holds a perfect copy of the text its user touched (two pages of a book, a single scroll or the like at most), none of its magic or special properties. Dismissed (remove this Effect), it copies the text onto a blank writing surface its user is touching.", duration: null }] })
    },
    {
        // (Merged with an ordinary item as One with Stone's merge, but no spells: its words on its user for its 10 minutes — One with Stone's
        // 10d6 when the item's damaged said on it, the GM's to roll.)
        name: "Charm of the Ordinary",
        sentences: [
            /^Carved from a chunk of sturdy hardwood, this small charm is shaped like a broom, a wooden barrel, a lantern, or another ordinary item\.$/,
            /^When activated, the pendant becomes a full-size version of the item it represents, and you merge with the item with the effects of One with Stone, except the item doesn't need to be made of stone and doesn't require the volume to fit you and your worn or held possessions\.$/,
            /^While merged with the item, you can hear but can't see; unlike with one with stone , you can't cast spells\.$/,
            /^The effect ends after (ten|\d+) (minutes?|hours?) or when you Dismiss the effect, at which point you are forcibly expelled and the item you occupied becomes a mundane item\.$/
        ],
        card: ([, , , ends]) => ownRow({
            noteEffects: [{ label: "Merged", text: "Merged with the charm's item (One with Stone's merge, though the item isn't stone): it can't move or affect anything outside the item, hears but can't see what's outside, and can't cast spells. If the item takes damage while it's inside, it's expelled and takes 10d6 damage (Magic Passage expels it unharmed). When this ends, or it's Dismissed (remove this Effect), it's expelled, and the item becomes a mundane one.", duration: timeOf(ends[1], ends[2]) }],
            notes: ["The charm becomes a full-size version of the ordinary item it's shaped like (a broom, a wooden barrel, a lantern…), its user inside it: place it on the map."]
        })
    },
    {
        // (The cane a giant viper of silver until it's Dismissed: the ability module's conjured token from PF2e's Giant Viper, on its user's
        // side, rolling initiative — it acts on its own —, its Strikes silver by PF2e's AdjustStrike.)
        name: "Silver Snake Cane: True Silver Snake",
        sentences: [
            /^The cane transforms into a giant viper made of silver\.$/,
            /^All its Strikes are silver\.$/,
            /^It acts independently but obeys you\.$/,
            /^You can Dismiss this activation\.$/
        ],
        card: () => ({
            builtin: "conjure",
            targeting: { target: "self", range: null, area: null },
            creatures: [{ name: "Giant Viper", count: 1, size: null, stats: null, from: { name: "Giant Viper" }, traits: [], initiative: "roll", own: { rules: [{ key: "AdjustStrike", mode: "add", property: "materials", value: "silver" }] } }],
            max: 1,
            lasts: null,
            vanishAtZero: true,
            notes: ["Only a zuhra can activate it (its Prerequisites).", "It acts on its own: it rolls initiative.", "It obeys its user's commands; its Strikes are silver.", "Dismissed (or at 0 Hit Points), it's the cane again: remove its token."]
        })
    },
    {
        // (Engulfed — PF2e's Engulf: Grabbed and Slowed 1 — while the platform's under, for its hour or until each Escapes: the creatures on it
        // targeted, the save card's row, the Escape the ability module's; they breathe, and the plunge is the map's.)
        name: "Lily Pad Platform: Plunge",
        sentences: [
            /^The lily pad platform wraps around everything on top of it and plunges (\d+) feet beneath the surface for (an?|\d+) (hours?|minutes?), after which it returns to the surface\.$/,
            /^While submerged, items take no damage from the water, and creatures can breathe normally but are engulfed \(escape dc=(\d+)\)\.$/
        ],
        card: ([plunge, engulfed]) => {
            const duration = { ...timeOf(plunge[2], plunge[3]), escape: { dc: Number(engulfed[1]) } };
            return ownRow({
                target: "the creatures on the platform",
                effects: [{ kind: "condition", slug: "grabbed", value: null, duration }, { kind: "condition", slug: "slowed", value: 1, duration }],
                notes: [`The platform wraps around everything on it and plunges ${plunge[1]} feet beneath the surface for ${duration.value} ${duration.value === 1 ? duration.unit.replace(/s$/, "") : duration.unit}, then returns to the surface: move its tokens.`, `Engulfed while it's under (PF2e's Engulf): each creature on it is Grabbed and Slowed 1 until it Escapes (DC ${engulfed[1]}) or the platform surfaces; target them and press the button.`, "Under the water, items on it take no damage from the water and its creatures can breathe normally."]
            });
        }
    },
    {
        // (A coffee its drinkers breathe water with for 8 hours: an Effect on each creature targeted, its name the environment module's water
        // breathing; its underwater temperatures the environment module's protection that holds only underwater (plan.temperature where
        // "underwater", the core's 6a14f09: mild and severe heat and cold count as normal) — the brewing, pouring and keeping of the coffee the
        // card's lines.)
        name: "Faydhaan's Dallah: Brew",
        sentences: [
            /^You place a handful of beans in the dallah, and it immediately grinds the beans, fills with water, and brews six cups' worth of coffee\.$/,
            /^Pouring a cupful of coffee into a vessel takes an Interact action, as does drinking a cup\.$/,
            /^A creature that drinks a cup can breathe underwater and is protected from mild or severe temperatures of underwater environments for (\d+) (hours?|minutes?)\.$/,
            /^The coffee can later be transmuted using the dallah's other activation, but this latent magic ends if the dallah is used to brew coffee again\.$/,
            /^Coffee poured from the dallah stays in its vessel until someone drinks it or deliberately pours it out, even if the vessel is in an environment where the coffee would normally escape, such as underwater\.$/
        ],
        card: ([, , drinks]) => ({
            ...ownRow({
            notes: ["It brews six cups of coffee: pouring a cup into a vessel and drinking one each take an Interact action. Target the creatures that drink a cup, then press Apply.", "Poured coffee stays in its vessel until drunk or poured out, even underwater; Faydhaan's Hospitality can transmute it later, until the dallah brews again."],
            item: { recipient: "targets", ruleEffects: [{ name: "water breathing", words: "Can breathe underwater", rules: [], duration: timeOf(drinks[1], drinks[2]) }] }
            }),
            temperature: { counts: { "mild-cold": "normal", "severe-cold": "normal", "mild-heat": "normal", "severe-heat": "normal" }, where: "underwater", duration: timeOf(drinks[1], drinks[2]) }
        })
    },
    {
        // (Two surfaces bonded for good: an object's, and a willing creature's — the card's lines, its DC 50 the GM's when a creature tries.)
        name: "Everlasting Adhesive",
        sentences: [
            /^This peculiar amber adhesive bonds two surfaces together almost inseparably\.$/,
            /^A single flask covers an area up to 1 square foot and must be used all at once to form a single bond between two surfaces\.$/,
            /^If the activation is interrupted, the bond fails, and the adhesive is wasted\.$/,
            /^Once two surfaces are joined with everlasting adhesive, a creature can separate them only with a successful @Check\[athletics\|dc:(\d+)\] check\.$/,
            /^The adhered objects tend to break before the adhesive does unless they're particularly durable, though a creature determined to separate the objects can break off the parts connected by the everlasting adhesive and later Repair the objects\.$/,
            /^The adhesive can affect creatures only if they're willing, and its bond can be broken by exfoliating the outermost layer of skin\.$/
        ],
        card: ([, , , dc]) => ownRow({ notes: ["It bonds two surfaces of up to 1 square foot in one bond (an interrupted activation wastes it).", `Separating them takes a successful DC ${dc[1]} Athletics check; the objects tend to break first, and a creature can break off the bonded parts and Repair the objects later.`, "It bonds a creature only if it's willing, and peeling off the outermost layer of skin breaks the bond."] })
    },
    {
        // (Sound recorded or played back, now or timed to a month later: a note of its words on its user — the user's ruling for sound.)
        name: "Clockwork Recorder",
        sentences: [
            /^You wind the recorder to start recording sound or to play back a recording\.$/,
            /^You can have the recording or playback start immediately or be timed to start at any point up to one month later\.$/
        ],
        card: () => ownRow({ noteEffects: [{ label: "Clockwork Recorder", text: "The recorder records sound (up to 1 hour on its wax cylinder) or plays a recording back, starting now or at the time it was set to, up to a month from now. Remove this Effect when it's done.", duration: null }] })
    },
    {
        // (A message kept for its next float above a wayfinder: a note of its words on its user — the user's ruling for speech.)
        name: "Pathfinder's Coin",
        sentences: [
            /^You give the coin a message of (\d+) words or fewer\.$/,
            /^The message repeats in your voice the next time the coin is floated above a wayfinder \.$/,
            /^A Pathfinder's coin can hold only one message at a time, and it replays its message only once\.$/
        ],
        card: ([words]) => ownRow({ noteEffects: [{ label: "Pathfinder's Coin", text: `The coin holds a message of ${words[1]} words or fewer, which it repeats once in its user's voice the next time it's floated above a wayfinder (remove this Effect then). It holds one message at a time.`, duration: null }] })
    },
    {
        // (A Nightmare at DC 30 the next time its target sleeps, and every sleep after: the spell module's cast, at that creature; its sleeps
        // the GM's.)
        name: "Horrific Effigy: Whispers of Leng",
        sentences: [
            /^You whisper a name and whatever details you recall about that person to the effigy, telling it everything you can about your target\.$/,
            /^The next time the target sleeps, they are subject to a Nightmare spell \(DC (\d+)\)\.$/,
            /^This continues every time the target sleeps until they die, you whisper a new target to the effigy, or the target gets a critical success on their save against the nightmare\.$/
        ],
        card: ([, sleeps]) => cast({ spell: SPELL("Uqj344bezBq3ESdq", "Nightmare"), rank: 4, dc: Number(sleeps[1]), targets: true, notes: ["Its user whispers a name and all it recalls of that person to the effigy: cast it at that creature the next time it sleeps (the GM's).", "Cast it again each time the creature sleeps, until it dies, its user whispers a new target, or it critically succeeds at its save against the nightmare."] })
    },
    {
        // (Books attuned for a month's activation, and its bonus to Search for them: the card's lines — its books are objects, its +2 its user's
        // to add when it Searches for them.)
        name: "Librarian's Baton",
        sentences: [
            /^You focus your attention on the crystal pendulum, repeatedly passing it over the covers of up to (\d+) Bulk of books\.$/,
            /^Doing so causes the librarian's baton to permanently attune itself to those books, while simultaneously removing any attunement it may have had to previous books\.$/,
            /^If an attuned book is damaged significantly, the librarian's baton loses attunement to it \(although it can be reattuned at a later date to the damaged book as long as it retains some of its functionality\)\.$/,
            /^The librarian's baton grants a \+(\d+) item bonus to perception checks to Search for attuned books hidden within (\d+) feet of you\.$/
        ],
        card: ([bulk, , , bonus]) => ownRow({ notes: [`The baton is attuned to the books it passed over (up to ${bulk[1]} Bulk of them), and no longer to any before; a book damaged significantly loses it, though one still of some use can be attuned again.`, `+${bonus[1]} item bonus to Perception checks to Search for attuned books hidden within ${bonus[2]} feet of its user: add it when Searching for them.`] })
    },
    {
        // (Where an attuned book is, and while Sustained whether it moves or changes hands: whispered to the GM and its user.)
        name: "Librarian's Baton",
        sentences: [
            /^When you activate the librarian's baton, concentrate on one of the books to which the baton is attuned\.$/,
            /^The crystal pendulum moves of its own volition, pointing directly toward the location of the book you were concentrating on as a long as the book is within (\d+) miles of you\.$/,
            /^If the book is further away than this, or if the book has been damaged enough that it's no longer attuned, you learn only that the book is out of range or damaged, as appropriate\.$/,
            /^You can Sustain this activation up to (\d+) minutes?, during which time you can sense whether the target book is in motion, is in a creature's possession, or enters the possession of a different creature\.$/,
            /^However, you can't determine the identities of such creatures\.?$/
        ],
        card: ([, far, , sustained]) => whisper(`The pendulum points toward the attuned book its user concentrates on, if it's within ${far[1]} miles; if it's farther or too damaged to stay attuned, only that. While Sustained (up to ${sustained[1]} minute${sustained[1] === "1" ? "" : "s"}), its user senses whether the book is moving, in a creature's possession, or passing to another creature — not who.`)
    },
    {
        // (Field of Life where it's planted, Sustained up to its minute as the spell is: the spell module's cast; the holly a line.)
        name: "Primeval Mistletoe (Greater): Cultivate",
        sentences: [
            /^You plant the greater primeval mistletoe into an area of natural earth or stone\.$/,
            /^Once planted, the plant immediately sprouts into an area of holly bushes that don't impede movement and that pulse with vitality energy, replicating the effects of a Field of Life spell\.$/,
            /^You can Sustain the activation up to 1 minute\.$/,
            /^When this magic ends, the holly bushes revert back into the original greater primeval mistletoe \.$/
        ],
        card: () => cast({ spell: SPELL("x5rGOmhDRDVQPrnW", "Field of Life"), rank: 6, area: true, notes: ["Planted in natural earth or stone, it sprouts into holly bushes that don't impede movement, Field of Life's area; when the spell ends, they're the mistletoe again."] })
    },
    {
        // (A language its user takes from a creature that spoke it, until the next activation: a note of its words on its user — the user's
        // ruling for languages.)
        name: "Aeon Stone (Eastern Star): Absorb Language",
        sentences: [
            /^You touch a creature who spoke a common language in your presence within the previous minute\.$/,
            /^The eastern star aeon stone becomes infused with this language, granting you the ability to understand, speak, and write that language\.$/,
            /^This activation persists until you activate it again\.$/
        ],
        card: () => ownRow({ noteEffects: [{ label: "Absorb Language", text: "Understands, speaks and writes the common language the creature it touched spoke near it in the last minute, until it activates the stone again (remove this Effect then).", duration: null }] })
    },
    {
        // (The shield a pup tent until it's collapsed, its rations replenished weekly: the card's lines — an object, and out of combat.)
        name: "Bivouac Targe: Deploy Encampment",
        sentences: [
            /^You pull a strap near the shield's enarmes to create a makeshift shelter that unfolds over the next minute\.$/,
            /^The shield becomes a pup tent until you spend another minute collapsing it\.$/,
            /^Within the tent is a satchel that holds 1 Bulk of Rations and replenishes every week\.$/
        ],
        card: () => ownRow({ notes: ["The shield unfolds over the minute into a pup tent, its user's shield no longer, until another minute collapses it.", "A satchel in the tent holds 1 Bulk of rations, replenished every week."] })
    },
    {
        // (Its extradimensional space or its normal one open, until it's switched back: the card's lines — objects.)
        name: "Pathfinder's Pouch",
        sentences: [
            /^You switch the pouch to allow access to its extradimensional space instead of its normal space, or vice versa\.$/,
            /^This lasts until you next activate it\.$/,
            /^Items in the other space are inaccessible and hard to find until you switch the pouch back\.$/
        ],
        card: () => ownRow({ notes: ["The pouch opens onto its extradimensional space (1 Bulk) instead of its normal one, or back, until it's activated again; the items in the other are out of reach and hard to find."] })
    },
    {
        // (2nd-rank Translate for every language seen, none heard, until the spectacles are folded: its words on its user, no time — over the cast,
        // whose own hour and single language aren't these.)
        name: "Spectacles of Understanding (Greater)",
        over: true,
        sentences: [/^Unfolding the spectacles onto the bridge of the nose, you gain the effects of 2nd-rank Translate until you fold up the spectacles or the item is no longer invested by you, whichever comes first, except that it applies to all languages you see rather than a single language, and it does not apply to language you hear\.$/],
        card: () => ownRow({ noteEffects: [{ label: "Translate", text: "Understands the meaning of every language it sees, as 2nd-rank Translate (not codes, nor language couched in metaphor) — not language it hears —, until it folds up the spectacles or no longer has them invested (remove this Effect then).", duration: null }] })
    },
    {
        // (A tornado down a 120-foot line, Whirlwind's effects in one pass and not Sustained: a save card at the creatures in its path — not
        // the spell's cylinder, which the cast would give. Whirlwind's 8th-rank 5d10 bludgeoning, half on a success; on a failure each rises 10
        // feet, 20 on a critical failure (double damage), and falls when the tornado ends at the line's end — PF2e's falling damage, half the
        // distance, so 5 more, and Prone; doubled with the critical failure's, 10. Over the cast read before (with PF2e's spells), its frequency
        // and requirement kept.)
        name: "Tornado Trompo",
        over: true,
        sentences: [
            /^You call upon the top's power and give the string a powerful pull\.$/,
            /^The top travels across the ground in a (\d+)-foot line\.$/,
            /^As it does, it unleashes a powerful vortex of winds, becoming a tornado temporarily\.$/,
            /^This tornado has the effects of Whirlwind except that it's not limited by being used outside or in a cramped space and can't be sustained\.$/,
            /^Creatures in the tornado's path must attempt a @Check\[reflex\|dc:(\d+)\] save to determine the effects of the tornado\.$/,
            /^The tornado ends after traveling its full distance, causing any creatures that rose in the air due to a failed save to begin falling immediately\.$/
        ],
        card: ([, line, , , save], plan) => {
            const row = (multiplier, ids, prone = false) => ({ damage: { mode: "shared", multiplier, sourceComponentIds: ids }, effects: prone ? [{ kind: "condition", slug: "prone", value: null, duration: null }] : [] });
            return {
                targeting: { target: "the creatures in the tornado's path", range: null, area: { type: "line", value: Number(line[1]) } },
                resolution: {
                    kind: "save",
                    check: { roll: "save", statistic: "reflex", basic: false, against: { dc: "fixed", value: Number(save[1]) } },
                    sharedDamage: { rollOnce: true, components: [{ id: "0", formula: "5d10[bludgeoning]", type: null, category: null }, { id: "1", formula: "5[bludgeoning]", type: null, category: null }] },
                    outcomes: { criticalSuccess: row(0, []), success: row(0.5, ["0"]), failure: row(1, ["0", "1"], true), criticalFailure: row(2, ["0", "1"], true) }
                },
                notes: [`The top travels the ${line[1]}-foot line along the ground as a tornado with Whirlwind's effects, at its 8th rank — inside or out, cramped or not, and not Sustained —, each creature in its path saving once.`, "On a failure a creature rises 10 feet (20 on a critical failure) and falls when the tornado ends: its rows' falling damage (half the distance) and Prone. One that can fly doesn't fall: take those off it."],
                ...(plan.requirementUnread ? { requirementUnread: plan.requirementUnread } : {})
            };
        }
    },
    {
        // (Its Sustain's 5 temporary Hit Points for its user and allies again, for the minute: plan.again — the same card, 5 in place of 15,
        // kept open and pressed at each Sustain; its linked Effects' TempHP the same numbers.)
        name: "Blakenshipper: Be the Band",
        over: true,
        sentences: [
            /^You work double-time, playing an entire band's composition yourself, bolstering those around you by your mighty effort\.$/,
            /^You and all allies within a (\d+)-foot emanation gain (\d+) temporary Hit Points that last for 1 round\.$/,
            /^For the next (minute|\d+ minutes|\d+ rounds), you can Sustain to continue the music, granting you and all allies within a (\d+)-foot emanation (\d+) temporary Hit Points that last for 1 round; this Sustain action gains the auditory and manipulate traits\.$/,
            /^Effect: Be the Band Effect: Be the Band \(Sustain\)$/
        ],
        card: ([, first, sustain], plan) => {
            const row = plan?.resolution?.outcomes?.success;
            const temp = (row?.effects ?? []).find((effect) => effect.kind === "temp-hp");
            if (!plan?.allyArea || !temp || Number(temp.amount) !== Number(first[2])) return null;
            const time = /^minute$/.test(sustain[1]) ? { value: 1, unit: "minutes" } : { value: Number(sustain[1].split(" ")[0]), unit: UNITS[sustain[1].split(" ")[1]] };
            const { again: _again, notes: _notes, partial: _partial, ...own } = plan;
            const sustained = { ...own, automation: { level: "automatic" }, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, effects: row.effects.map((effect) => (effect === temp ? { ...effect, amount: Number(sustain[3]) } : effect)) } } } };
            return { keep: true, notes: undefined, partial: undefined, automation: { level: "automatic" }, again: { plan: sustained, later: true, repeat: true, time, when: "{user} Sustains it (an action with the auditory and manipulate traits)" } };
        }
    },
    // --- The adventure books' items (2026-10-27, batch 3: sustained and later effects, dying and death, afflictions) ---------------------
    {
        // (Heaven's Wings' counteract after its save, read already — item.counteract, the counteract card beside the save card: its sentence
        // no longer a note. The unholy's –2 is the save's ifTarget.)
        name: "Golden Gloves: Heaven's Wings",
        over: true,
        sentences: [
            /^You throw wide your arms\b.*\bblazing halo\b.*\.$/,
            /^All enemies within a \d+-(?:foot|feet) emanation must\b.*@Check\[fortitude\|dc:\d+\] save or be Dazzled\b.*\.$/,
            /^Unholy creatures take a [-–]2 item penalty\b.*\.$/,
            /^The halo then melts into your body\b.*\bany one affliction\b.*\bcounteract rank of (\d+)\b.*\bmodifier of \+(\d+)\.$/
        ],
        card: ([, , , halo], plan) => {
            const counteract = plan?.item?.counteract;
            if (plan?.resolution?.kind !== "save" || !plan.ifTarget || counteract?.rank !== Number(halo[1]) || counteract?.modifier !== Number(halo[2])) return null;
            const notes = (plan.notes ?? []).filter((note) => !said(note).startsWith("The halo then melts"));
            const left = notes.length || (plan.unread ?? []).length || Object.values(plan.resolution.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length);
            // (On its user alone: "any one affliction you are currently suffering".)
            return { keep: true, notes: notes.length ? notes : undefined, item: { ...plan.item, counteract: { ...counteract, self: true } }, ...(left ? {} : { partial: undefined, automation: { level: "automatic" } }) };
        }
    },
    {
        // (No dreams for 8 hours and +1 to saves against what's dreamlike — no PF2e trait marks those, so a toggle on its note Effect, as
        // Addiction Suppressant's: the item card's bonus for the time; a midnight milk addiction counteracted, the counteract card's free row —
        // the addiction isn't an item PF2e keeps —, its DC and rank the GM's; an intellect devourer in a stolen body drinking it, a line.)
        name: "Philter of Empty Dreams",
        sentences: [
            /^A philter of empty dreams\b.*\bprevents dreams\.$/,
            /^When you drink\b.*\bno dreams for the next (\d+) (hours?)\b.*\+(\d+) item bonus\b.*\bnightmare-themed effects\b.*\bmidnight milk\)\.$/,
            /^If you're suffering\b.*\baddiction to midnight milk\b.*\bcounteract rank of (\d+)\b.*\+(\d+) modifier\b.*\.$/,
            /^If an intellect devourer\b.*\bstolen body\b.*@Check\[fortitude\|dc:(\d+)\] save\b.*\bExit the Body\b.*\.$/
        ],
        card: ([, dreams, addiction, devourer]) => {
            const duration = timeOf(dreams[1], dreams[2]);
            const toggle = "philter-of-empty-dreams:dream";
            return ownRow({
                target: "the drinker",
                modifiers: [{ selector: "saving-throw", value: Number(dreams[3]), type: "item", duration, predicate: [toggle] }],
                noteEffects: [{ label: "No dreams", text: `It has no dreams for ${duration.value} hours. For a save against a dream- or nightmare-themed effect (midnight milk's among them), tick "Against a dream or nightmare" (this Effect's toggle): +${dreams[3]} item bonus. No PF2e trait marks such effects.`, duration, rules: [{ key: "RollOption", option: toggle, toggleable: true, label: "Against a dream or nightmare" }] }],
                notes: [`An intellect devourer controlling a stolen body that drinks it: a DC ${devourer[1]} Fortitude save, or it must Exit the Body at once (the GM rolls it).`],
                item: { counteract: { modifier: Number(addiction[2]), rank: Number(addiction[1]), conditions: [], traits: [], afflictions: [], free: { name: "the addiction to midnight milk", counteredWords: "the addiction ends" }, pick: "one", notes: ["Only for a drinker addicted to midnight milk: the addiction's DC and rank are the GM's to give."] } }
            });
        }
    },
    {
        // (A supernatural deal its drinker made, counteracted: the counteract card's free row, the deal's DC and rank the GM's — no PF2e item
        // holds a contract —, its rank the potion's level halved as PF2e's rule for an item without one; what follows the card's lines.)
        names: ["Potion of Annulment (Lesser)", "Potion of Annulment (Moderate)", "Potion of Annulment (Greater)"],
        sentences: [
            /^A potion of annulment magically breaks\b.*\binfernal contract\b.*\bGeas ritual\.$/,
            /^Upon drinking the potion\b.*\bhighest-\s?level such effect\b.*\bcounteract modifier of \+(\d+)\.$/,
            /^If the check is successful\b.*\bends for all parties\.$/,
            /^You're not penalized for breaking\b.*\bbenefits or rewards\.$/,
            /^Individuals with whom you shared\b.*\bseek vengeance\.$/,
            /^This potion can't rewind time\b.*\bback to life\.$/
        ],
        card: ([, check], _plan, { info }) => ({
            builtin: "counteract",
            targeting: { target: "the drinker", range: null, area: null },
            item: {
                counteract: {
                    modifier: Number(check[1]),
                    rank: Math.max(1, Math.ceil((Number(info?.level) || 0) / 2)),
                    conditions: [],
                    traits: [],
                    afflictions: [],
                    free: { name: "its drinker's highest-level supernatural deal", counteredWords: "the deal ends for all parties" },
                    pick: "one",
                    notes: [
                        "A deal its drinker made (an infernal contract, a sea hag's bargain, the Geas ritual): the GM gives the highest-level one's DC and rank.",
                        "Its own counteract rank is half its level, rounded up: the potion gives none.",
                        "Annulled, the deal binds nobody: its drinker isn't penalized for breaking it but loses all it gave, and those who shared it know and may seek revenge.",
                        "It undoes nothing already done: someone killed to fulfil a contract stays dead."
                    ]
                }
            }
        })
    },
    {
        // (Its protection from the werecreature's full-moon change for its 3 days: a note Effect on its eater — no PF2e rule for the curse.)
        name: "Moonkeep Orchid",
        sentences: [
            /^These magical flowers are infused\b.*\bcurse of the werecreature\.$/,
            /^Intentionally growing these flowers\b.*\blost to time\.$/,
            /^They occasionally grow in places\b.*\bremains a mystery\.$/,
            /^This pale orchid glows\b.*\bmoonlight\.$/,
            /^When you eat the flower\b.*\bprotection for (\d+) (days?)\.$/,
            /^During this time\b.*\bmoon frenzy don't cause you\b.*\bfull control of your faculties\b.*\.$/
        ],
        card: ([, , , , eat]) => ownRow({ target: "the drinker", noteEffects: [{ label: "Moonkeep's protection", text: "Neither its curse of the werecreature nor its moon frenzy makes it change by itself under a full moon, and it keeps full control of its mind then.", duration: timeOf(eat[1], eat[2]) }] })
    },
    {
        // (Its air kept clean for 8 hours: a note Effect named for the environment module's "doesn't need to breathe" — underwater or strangled,
        // it breathes on —, with PF2e's Immunity to olfactory effects; the inhaled diseases its words, as no PF2e immunity picks them out from
        // inhaled poisons.)
        name: "Choral Toga: Elysium's Breath",
        sentences: [
            /^The air around the robe constantly circulates\b.*\.$/,
            /^For (\d+) (hours?), you become immune to diseases\b.*\binhalation, olfactory effects\b.*\bprevent you from breathing\b.*\bunderwater\b.*\bstrangled\)\.$/
        ],
        card: ([, breath]) => ownRow({ noteEffects: [{ label: "doesn't need to breathe", text: "Immune to diseases spread by inhalation and to olfactory effects (PF2e's Immunity holds the olfactory ones), and to whatever would keep it from breathing: underwater, strangled or in foul air, it breathes on.", duration: timeOf(breath[1], breath[2]), rules: [{ key: "Immunity", type: "olfactory" }] }] })
    },
    {
        // (On a living creature, an hour's ward against rising undead if it dies: a note Effect on it; on a fresh corpse, kept till sunrise —
        // the card's line, out of combat.)
        name: "Restful Salve",
        sentences: [
            /^A restful salve is a compound\b.*\bprevent undeath\.$/,
            /^If applied to a fresh corpse\b.*\buntil the sun rises the next morning\.$/,
            /^If applied to a living creature\b.*\blasts for only (\d+) (hours?)\b.*\.$/,
            /^For that duration, the salve wards\b.*\bupon dying\.$/
        ],
        card: ([, , living]) => ownRow({
            target: "the creature it's applied to",
            noteEffects: [{ label: "Restful Salve", text: "Effects that would make it undead as it dies are warded off.", duration: timeOf(living[1], living[2]) }],
            notes: ["On a fresh corpse instead: it doesn't decay, and it can't be made undead or otherwise controlled until the next sunrise (out of combat, the GM's)."]
        })
    },
    {
        // (A changed appearance for its hour, fading over 10 minutes after, stabilizing on a fourth drink in a row: a note Effect on its drinker
        // — an appearance, no game numbers.)
        name: "Potion of Passing Fancy",
        sentences: [
            /^A lesser variant of the Serum\b.*\bdoses at hand\.$/,
            /^Upon drinking the potion, your appearance changes\b.*\bgender expression\.$/,
            /^You have little control over the details\b.*\bheartfelt ideal\.$/,
            /^More importantly\b.*\bfamily resemblance\b.*\bmore anonymously\.$/,
            /^A potion of passing fancy's effects\b.*\blast for (\d+) (hours?)\b.*\bfading over (\d+) minutes\b.*\.$/,
            /^If you extend the effect this way\b.*\bfamily resemblance\b.*\bserum of sex shift ?\.$/
        ],
        card: ([, , , , lasts]) => ownRow({ target: "the drinker", noteEffects: [{ label: "Passing fancy", text: `Its looks take on the sex characteristics of another gender expression, as its deepest ideal would have them, with no family resemblance to its own. When this ends it fades over ${lasts[3]} minutes; another potion before it's gone starts the time again, and a fourth in a row makes the change its own for good, with a family resemblance to its old looks (as Serum of Sex Shift's).`, duration: timeOf(lasts[1], lasts[2]) }] })
    },
    {
        // (Attuned to the beacon until it Dismisses it, dies or attunes to another: a note Effect on its user, no time — out of combat, and what
        // it senses the GM's to tell. Its link for teleports, the other activation, isn't this reading's.)
        name: "Witchwyrd Beacon",
        sentences: [
            /^By touching the witchwyrd beacon\b.*\byou attune yourself to it\.$/,
            /^Up to (four|\d+) creatures can be attuned\b.*\bmust become unattuned\.$/,
            /^You can break your attunement\b.*\bDismissing the effect\.$/,
            /^The attunement automatically ends if\b.*\bdies\b.*\bdifferent witchwyrd beacon ?\.$/,
            /^The effect can also be dispelled normally\.$/,
            /^You can sense whenever the witchwyrd beacon\b.*\bin any way\.$/
        ],
        card: ([, four]) => ownRow({ noteEffects: [{ label: "Attuned", text: `Attuned to its witchwyrd beacon (${four[1]} creatures at most at a time: another attunes only once one of them isn't). It senses whenever that beacon is activated in any way (the GM tells it). It ends when it Dismisses it (remove this Effect), dies or attunes to another beacon, and it can be dispelled (counteracted) as usual.`, duration: null }] })
    },
    {
        // (The tattoo shown — PF2e's own toggle on the item, its +1 to Intimidation and –1 to Make an Impression: the toggle card flipping it,
        // hidden again by the same activation, not while its user is Doomed.)
        name: "Spider Lily Tattoo: Reveal Tattoo",
        sentences: [/^You make the tattoo visible\.$/, /^You can use this activation again\b.*\bnot visible\b.*\bdoomed condition\.$/],
        card: () => ({ builtin: "modes", targeting: { target: "self", range: null, area: null }, modes: [{ name: "Reveal Tattoo", plan: { builtin: "roll-option", option: "spider-lily-tattoo", value: "flip" } }], notes: ["Used again, it hides the tattoo — not while its user is Doomed: then it stays visible."] })
    },
    {
        // (An arcane Wish, the spell module's cast; Drained 3 either way, given as it's used; the ring's judgement of the wish the GM's, a line.)
        name: "Ring Of Recalcitrant Wishes",
        sentences: [
            /^You attempt to make the ring cast\b.*\barcane Wish spell\.$/,
            /^However, if the ring doesn't deem\b.*\bselfless\b.*\bcan't be activated for (\d+) (hours?)\.$/,
            /^You are Drained (\d+), whether or not\b.*\brefuses the wish\.$/,
            /^Once the wish is cast\b.*\bno powers\b.*\brestores the wish to the ring\.$/
        ],
        card: ([, refused, drained]) => ({
            ...cast({ spell: SPELL("6dDtGIUerazSHIOu", "Wish"), rank: 10, tradition: "arcane", notes: [`If the ring doesn't find the wish selfless enough (the GM's call), there's no wish to cast, and the ring can't be activated for ${refused[1]} ${refused[2]}.`, "Once the wish is cast, the ring has no more powers; a wearer's death in an act of great self-sacrifice is said to restore its wish (the GM's)."] }),
            userEffects: [{ slug: "drained", value: Number(drained[1]), duration: null }]
        })
    },
    {
        // (A map from its memories of a place: what it shows whispered to the GM and its user, the GM filling it in; its free-action Dismiss
        // said there.)
        name: "Nomad's Shawl: Mind's Map",
        sentences: [/^You focus your mind's eye\b.*\.$/, /^The beads on the shawl shift colors\b.*\byour memories\.$/, /^You can dismiss this effect\b.*\bfree action\.$/],
        card: () => whisper("Its user focuses on a place it has been before, and the shawl's beads shift colours into a map of that area as it remembers it (the GM fills in what it shows). It can dismiss the map as a free action.")
    },
    {
        // (A message kept, not sent — Message's words whispered to the head, repeated at its next activation: a note Effect on its user, no
        // time — the user's ruling for speech. Not the Message cast the plan read before.)
        name: "Soulspeaker",
        over: (plan) => !plan || plan.noteOnly || plan.builtin === "cast-spell",
        sentences: [/^You cast Message, but instead\b.*\bstored in the soulspeaker ?\.$/, /^The soulspeaker's eyes open\b.*\bnext time it's activated\b.*\brasping whisper\b.*\bmessage expended\.$/],
        card: () => ownRow({ noteEffects: [{ label: "Soulspeaker's message", text: "The shrunken head holds the short message its user whispered to it, its eyes open. The next time it's activated, it repeats the message in a rasping whisper and its eyes close: the message is spent (remove this Effect then, rather than storing another).", duration: null }] })
    },
    {
        // (A command mimed with the puppet: the creature's Will save, its failure a note Effect for its next turn — its first action the
        // command's —, and the Sustain's next command the same save again: plan.again, the later card kept open for the minute.)
        name: "Ebon Marionette",
        sentences: [
            /^When you Activate the ebon marionette\b.*\bcreature within (\d+) feet\b.*\bwith the puppet\.$/,
            /^You might command the creature\b.*\battack an ally\.$/,
            /^Whenever you issue a command\b.*@Check\[will\|dc:(\d+)\] save\b.*\bfollow the command\b.*\bfirst action on its next turn\.$/,
            /^If you command it to do something\b.*\bwith 1 action\.$/,
            /^You can Sustain the Activation\b.*\bup to (\d+) (minutes?)\b.*\banother Will save\.$/,
            /^If the target succeeds\b.*\bthe effect ends\.$/,
            /^Sustaining the Activation has no effect\b.*\bper turn\.$/
        ],
        card: ([envision, , command, , sustain], _plan, { base, info }) => {
            const commanded = { label: "Commanded by the marionette", text: "Its first action on its next turn must carry out the command it was given (what the puppet mimed: dropping its weapon, running away, attacking an ally…); a command of more than 1 action goes only as far as 1 action takes it.", duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" } };
            const failed = () => ({ ...none(), noteEffects: [commanded] });
            const save = {
                targeting: { target: "1 creature", range: `${envision[1]} feet`, area: null },
                resolution: { kind: "save", check: { roll: "save", statistic: "will", basic: false, against: { dc: "fixed", value: Number(command[1]) } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: failed(), criticalFailure: failed() } }
            };
            return {
                ...save,
                again: { plan: { ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...save, item: info }, later: true, repeat: true, time: timeOf(sustain[1], sustain[2]), when: "{user} Sustains the activation to give the creature another command" },
                notes: ["A success ends it: no more Sustains.", "Sustaining while the creature still has a command does nothing: one command a turn at most."]
            };
        }
    },
    {
        // (A bonfire in an adjacent square for 8 hours: the ability module's zone, its 1d6 fire at the start of the turn of a creature that
        // stayed in it; its fuel and dousing the card's lines.)
        name: "Ember Dust",
        sentences: [
            /^This handful of gritty black dust\b.*\bcool to the touch\.$/,
            /^When ember dust is sprinkled\b.*\badjacent unoccupied square\b.*\bbonfire\b.*\.$/,
            /^For (\d+) (hours?), the bonfire blazes\b.*\bany fuel\.$/,
            /^The fire doesn't harm the surface\b.*\bsmothering it completely\.$/,
            /^Anything that's lit from the bonfire\b.*\bquenched normally\.$/,
            /^While it's safe enough\b.*\bat least a full round takes (\d+d\d+) fire damage each round\.$/,
            /^After \d+ hours, the bonfire becomes\b.*\.$/
        ],
        card: ([, , burns, , , fire]) => {
            const area = { type: "square", value: 5 };
            return {
                builtin: "zone",
                actions: null,
                targeting: { target: null, range: "5 feet", area },
                zone: zoneOf({
                    area,
                    centre: "placed",
                    range: 5,
                    lasts: timeOf(burns[1], burns[2]),
                    damage: [{ when: "start", formulas: [`${fire[1]}[fire]`] }],
                    notes: [
                        "Sprinkled in an adjacent unoccupied square (place it there), it's a bonfire filling most of the square, burning without fuel; once its time is up it's a normal fire, burning only as conditions allow.",
                        "It doesn't harm the surface it's on, and only dousing or submerging it in water, or smothering it completely, puts it out; what's lit from it needs fuel and goes out as usual.",
                        `Moving through or around it is safe: a creature that stays in it a full round takes the ${fire[1]} fire, at the start of its turn there.`
                    ]
                })
            };
        }
    },
    {
        // (Tiny for 10 minutes, its reach 0: a note Effect with PF2e's Shrink rules — CreatureSize tiny, reach 0, its equipment resized —, its
        // Dismiss its user removing it.)
        name: "Miniaturization Module: Miniaturize Me!",
        sentences: [/^You instantly shrink, becoming Tiny in size\.$/, /^Your equipment shrinks with you\b.*\bif removed\.$/, /^While Tiny, your reach changes\b.*\.$/, /^You remain Tiny for (\d+) (minutes?), but you can Dismiss this effect\.$/],
        card: ([, , , remain]) => ownRow({ noteEffects: [{ label: "Miniaturized", text: "Tiny, its equipment shrunk with it (an item taken off returns to its size); its reach is 0 feet. It can Dismiss this (remove this Effect).", duration: timeOf(remain[1], remain[2]), rules: [{ key: "CreatureSize", value: "tiny", reach: { override: 0 }, resizeEquipment: true }] }] })
    },
    {
        // (A severed head kept from decay: the card's lines — a corpse's, out of combat. Its questions, the other activation, aren't this
        // reading's.)
        name: "Cresset of Grisly Interrogation",
        sentences: [
            /^You open the cresset\b.*\binside the bowl\.$/,
            /^Once the cage lid is folded back\b.*\bfor no longer than (\d+) minutes\b.*\bno longer subject to decay\b.*\bthe remains\.$/,
            /^This doesn't prevent the rest\b.*\bin the first place\)\.$/,
            /^If the head is later removed\b.*\bcresset of grisly interrogation ?\.$/
        ],
        card: ([, kept]) => ownRow({
            notes: [
                `A severed head (of a Medium or Small humanoid) dead no more than ${kept[1]} minutes, latched into its bowl, no longer decays, and no pests eat it (an object, out of combat).`,
                "The rest of the corpse and its soul can still become undead, and effects that restore life still work, though some (Raise Dead) can't restore a beheaded corpse.",
                "Taken out later, the head decays at once, of no more use in a cresset."
            ]
        })
    },
    {
        // (The giant rat a minion of its user's for its hour, PF2e's minion trait its commands, a week before it can be called again once it's
        // slain — plan.slainWait, scripts/slain-wait.js —, once a day as the item's own words say: over the conjure card read before.)
        name: "Pyrite Rat: Transform Statue",
        over: (plan) => plan?.builtin === "conjure" && plan.creatures?.length === 1,
        sentences: [
            /^You place the statue on solid ground\b.*\bliving Giant Rat\.$/,
            /^In creature form, the giant rat\b.*\bon your turn\.$/,
            /^It gets 2 actions\b.*\breactions\.$/,
            /^You have to spend an action\b.*\bcowers where it is\.$/,
            /^If the rat is slain\b.*\bcan't be transformed again until (\d+|one) (weeks?|days?) has passed\.$/,
            /^If the figurine is destroyed\b.*\blost forever\.$/
        ],
        card: ([, , , , slain], plan) => {
            const [creature] = plan.creatures;
            const wait = { value: /^one$/i.test(slain[1]) ? 1 : Number(slain[1]), unit: `${slain[2].toLowerCase().replace(/s$/, "")}s` };
            const time = plan.lasts?.unit === "hours" ? [`It lasts ${plan.lasts.value} hour${plan.lasts.value === 1 ? "" : "s"}: dismiss it when that's up.`] : [];
            return {
                keep: true,
                creatures: [{ ...creature, traits: [...new Set([...(creature.traits ?? []), "minion"])] }],
                slainWait: wait,
                trigger: { ...(plan.trigger ?? {}), event: "use", frequency: { max: 1, per: "day", raw: "once per day" } },
                notes: ["A minion: it acts when its user commands it (1 action for 2 of its own).", ...time, `Slain, it reverts and can't be activated again for ${wait.value} ${wait.unit.replace(/s$/, "")}: set as it falls.`, "Destroyed as a statue, it shatters, its magic lost for good (an object's)."],
                partial: undefined
            };
        }
    },
    {
        // (A creature dead 2 rounds or less — 3, wound with 2 Interact actions — brought back with 1 Hit Point, then 10 Hit Points a round for the
        // minute: the item card's revival (item.revive, scripts/revive.js) and PF2e's fast healing 10 for the minute (item.fastHealing) on the
        // creature it's latched to; how recently it died the GM's, a line.)
        name: "Clockwork Rejuvenator",
        sentences: [
            /^(?:1 )?or (?:2 )?Interact Requirements The round\b.*\bto wind the device\.$/,
            /^This device has four finger-like latches\b.*\.$/,
            /^After winding the clockwork rejuvenator\b.*\brecently dead creature\b.*\.$/,
            /^If you wound the rejuvenator using 1\b.*\bdied in the last (\d+) rounds, restoring it to (\d+) HP\.$/,
            /^If you wound the rejuvenator using 2\b.*\bdied within the last (\d+) rounds\.$/,
            /^After attaching, the device continues\b.*\bfor (\d+) (minutes?), restoring (\d+) HP per round\b.*\.$/,
            /^Thereafter, the clockwork rejuvenator\b.*\binert\.$/
        ],
        card: ([, , , one, two, whirls]) => ownRow({
            target: "the creature it's latched to",
            notes: [`Only an adjacent creature that died in the last ${one[1]} rounds (wound with 1 Interact action) or ${two[1]} (with 2): the GM's to judge.`],
            item: { recipient: "drinker", revive: { hp: Number(one[2]), words: "Brought back to life by the clockwork rejuvenator" }, fastHealing: [{ value: Number(whirls[3]), duration: timeOf(whirls[1], whirls[2]) }] }
        })
    },
    {
        // (The next death from damage within 8 hours held off — 20 Hit Points, then a day's immunity to it: a note Effect on its drinker for
        // the 8 hours, the user's ruling for a rule PF2e can't play.)
        name: "Ambrosia of Undying Hope",
        sentences: [
            /^This elixir is usually stored\b.*\bstein\.$/,
            /^The dark liquid sparkles\b.*\bFailed in Absalom\.$/,
            /^The next time you would die\b.*\bdamage within (\d+) (hours?)\b.*\bprevents you from dying, you regain (\d+) Hit Points\b.*\bbenefits end\b.*\btemporarily immune\b.*\bfor (\d+) (hours?)\.$/,
            /^The ambrosia can't protect you\b.*\bdeath effects or disintegration\b.*\bvia damage\.$/,
            /^You can only be under the effect\b.*\bat a time\.$/
        ],
        card: ([, , saved]) => ownRow({ target: "the drinker", noteEffects: [{ label: "Undying hope", text: `The next time it would die from damage while this lasts (not from a death effect or disintegration), it doesn't: it regains ${saved[3]} Hit Points, this Effect ends, and it's immune to ambrosia of undying hope for ${saved[4]} ${saved[5]}. Only one ambrosia of undying hope at a time.`, duration: timeOf(saved[1], saved[2]) }] })
    },
    {
        // (Not needing to breathe for each way's time — 24 hours, 7 days with a Mythic Point —: a note Effect named for the environment
        // module's "doesn't need to breathe" beside each way's +1 to saves against inhaled threats, over the ways card read before; the
        // reminder of its whole text no longer needed.)
        names: ["One Day's Breath", "Three Day's Breath"],
        over: (plan) => plan?.builtin === "ways" && plan.ways?.length === 2,
        sentences: [
            /^This glass bottle holds breezes\b.*\bPlane of Air\.$/,
            /^When you inhale the bottle's contents\b.*\bno longer need to breathe\b.*\bfor a time\.$/,
            /^While the effect lasts, you also gain\b.*\binhaled poisons\.$/,
            /^If you spend 1 Mythic Point when\b.*\beffect's duration\.$/,
            /^You don't need to breathe for (\d+) (hours?|days?)\.$/,
            /^While the effect lasts, you gain a \+(\d+) status bonus\b.*\binhaled threats\.$/,
            /^If you spend 1 Mythic Point, you\b.*\bbreathe for (\d+) (days?)\.$/
        ],
        card: ([, , , , plain, bonus, mythic], plan) => {
            const times = [timeOf(plain[1], plain[2]), timeOf(mythic[1], mythic[2])];
            const ways = plan.ways.map((way, index) => {
                const row = way.plan?.resolution?.outcomes?.success;
                const modifier = (row?.modifiers ?? []).find((entry) => entry.selector === "saving-throw" && entry.value === Number(bonus[1]));
                if (!modifier || modifier.duration?.value !== times[index].value || modifier.duration?.unit !== times[index].unit) return null;
                const { partial: _partial, unread: _unread, ...kept } = way.plan;
                const note = { label: "doesn't need to breathe", text: `It doesn't need to breathe; its +${bonus[1]} status bonus to saves against inhaled threats is this card's other Effect.`, duration: modifier.duration };
                return { ...way, plan: { ...kept, automation: { level: "automatic" }, resolution: { ...kept.resolution, outcomes: { ...kept.resolution.outcomes, success: { ...row, noteEffects: [...(row.noteEffects ?? []).filter((entry) => !entry.reminder), note] } } } } };
            });
            return ways.every(Boolean) ? { keep: true, ways, partial: undefined, unread: undefined, automation: { level: "automatic" } } : null;
        }
    },
    {
        // (Upright, a stone column for good — the card's lines; on its side, Barricade Stone (Sphere)'s rolling boulder with its numbers
        // raised: the save card for each creature in its way (basic Reflex DC 27, 6d6 bludgeoning, Prone on a failure, Wounded 1 too on a
        // critical failure), kept open for a minute as it rolls on — plan.again. The ways card picks which.)
        name: "Barricade Stone (Cylinder)",
        sentences: [
            /^The ancient inhabitants of Bloodsalt\b.*\.$/,
            /^In its stone form, a barricade stone\b.*\.$/,
            /^The size and shape\b.*\.$/,
            /^When you activate the barricade stone\b.*\bup to (\d+) feet away\b.*\bsling weapon\.$/,
            /^Upon landing, the stone instantly\b.*\bexpands\.$/,
            /^The stone grows to its maximum size\.$/,
            /^While normally items with the structure trait\b.*\bwhere there are creatures\.$/,
            /^While it's likely to take some time\b.*\(Hardness (\d+), HP (\d+)\)\.$/,
            /^Type: Cylinder When activated\b.*\bdiameter of 5 feet\b.*\bheights of 80 feet\b.*\.$/,
            /^If a dimension can't be reached\b.*\bin that direction\.$/,
            /^You can activate the cylinder horizontally\b.*\.$/,
            /^If you do, the cylinder moves\b.*\bBarricade Stone \(Sphere\).*\bboth DCs increase to (\d+), the damage increases to (\d+d\d+) (bludgeoning)\b.*\bcritically fails\b.*\bWounded (\d+) condition\b.*\.$/
        ],
        card: ([, , , thrown, , , , hard, , , , side], _plan, { base, info }) => {
            const dc = Number(side[1]);
            const prone = { kind: "condition", slug: "prone", value: null, duration: null };
            const shared = (multiplier) => ({ mode: "shared", multiplier, sourceComponentIds: multiplier ? ["0"] : [] });
            const stone = `Hardness ${hard[1]}, ${hard[2]} Hit Points: it can be broken as any stone structure, given time and tools.`;
            const own = { ...base, automation: { level: "automatic" }, trigger: { event: "use" }, item: info };
            const rolling = {
                ...own,
                targeting: { target: "each creature in its way", range: `${thrown[1]} feet`, area: null },
                resolution: {
                    kind: "save",
                    check: { roll: "save", statistic: "reflex", basic: true, against: { dc: "fixed", value: dc } },
                    sharedDamage: { rollOnce: true, components: [{ id: "0", formula: `${side[2]}[${side[3]}]`, type: null, category: null }] },
                    outcomes: { criticalSuccess: { damage: shared(0), effects: [] }, success: { damage: shared(0.5), effects: [] }, failure: { damage: shared(1), effects: [prone] }, criticalFailure: { damage: shared(2), effects: [prone, { kind: "condition", slug: "wounded", value: Number(side[4]), duration: null }] } }
                }
            };
            const upright = { ...own, ...ownRow({ notes: [`Dropped, thrown up to ${thrown[1]} feet or slung, it lands and at once grows for good into a stone cylinder 5, 10 or 20 feet across (by its command) and 80, 40 or 20 feet tall, stopping where a solid surface blocks it: place it on the map, never where there are creatures.`, stone] }) };
            const onSide = {
                ...rolling,
                again: { plan: rolling, later: true, repeat: true, time: timeOf(1, "minute"), when: "the rolling cylinder reaches another creature" },
                notes: [`Thrown or slung on its side, it rolls on as Barricade Stone (Sphere)'s boulder does, 25 feet a round away from its user (the map's); stopped, it can be pushed 5 feet with a DC ${dc} Athletics check. A creature in its way: this save, and the card stays open a minute for the next.`, "Already Wounded, its Wounded value rises by 1 instead (PF2e's rule).", stone]
            };
            return { builtin: "ways", once: true, targeting: { target: null, range: null, area: null }, ways: [{ name: "Upright", html: "<p><strong>Effect</strong> Upright.</p>", plan: upright }, { name: "On its side, rolling", html: "<p><strong>Effect</strong> On its side, rolling.</p>", plan: onSide }] };
        }
    },
    {
        // (PF2e's Quicksand hazard in the squares it's poured on — one or two (1 action) or a 15-foot cone (2) —, for a day or till Dismissed:
        // the ability module's zone, its GM told as a creature sinks in on entering; the hazard's routine — deeper each round, its Swim out —
        // the zone card's lines, as PF2e's hazards are the GM's to run. The ways card picks the area.)
        name: "Dirt Sea in a Jar",
        sentences: [
            /^You pour the contents of the jar\b.*\bunworked ground\.$/,
            /^If you activate this item with one\b.*\bone or two 5-foot squares\b.*\.$/,
            /^If you activate this item with two\b.*\b(\d+)-foot cone\.$/,
            /^The affected space turns into Quicksand\.$/,
            /^Creatures already in the area\b.*\bas a reaction\.$/,
            /^The quicksand doesn't inflict lasting damage\b.*\bsettle naturally\.$/,
            /^This terrain lasts for (\d+|1) (days?|hours?) or until the effect is Dismissed\b.*\bin the jar\.$/
        ],
        card: ([, , cone, , , , lasts], _plan, { base, info }) => {
            const quicksand = (area, time) => ({
                ...base,
                activation: { ...(base?.activation ?? {}), time },
                automation: { level: "automatic" },
                trigger: { event: "use" },
                builtin: "zone",
                actions: null,
                targeting: { target: null, range: `${area.value} feet`, area },
                zone: zoneOf({
                    area,
                    centre: "placed",
                    range: 5,
                    lasts: timeOf(lasts[1], lasts[2]),
                    saves: [{ when: ["initial"], note: "it can Step out of the quicksand as a reaction; staying, it sinks in up to its waist" }, { when: ["enter"], note: "it sinks into the quicksand up to its waist" }],
                    notes: [
                        "Quicksand (PF2e's hazard): each round on the hazard's initiative it pulls every creature in it a step deeper — from its waist to its neck, from its neck under, holding its breath. A creature can Swim (Athletics DC 20) to rise a step, or to move 5 feet while only waist-deep; a critical failure pulls it down a step. Swimming out, it's Prone beside the patch; others can Aid it, or pull it out with the same check.",
                        "Poured only on unworked ground, adjacent to its user (place it there). It doesn't harm surfaces or buildings, though what it surrounds may sink or settle.",
                        "Dismissed, the sand returns to the jar."
                    ]
                }),
                item: info
            });
            const way = (name, area, time) => ({ name, html: `<p><strong>Effect</strong> ${name}.</p>`, plan: quicksand(area, time) });
            return { builtin: "ways", once: true, targeting: { target: null, range: null, area: null }, ways: [way("One action: one square", { type: "square", value: 5 }, "1"), way("One action: two squares in a row", { type: "line", value: 10 }, "1"), way(`Two actions: a ${cone[1]}-foot cone`, { type: "cone", value: Number(cone[1]) }, "2")] };
        }
    }
];

// Whether a reading is for this source name (its words aren't worth reading otherwise).
// (A reading for several grades of one item, names: the adventure books' readings, 2026-10-27.)
const forName = (entry, name) => entry.name === name || (entry.names ?? []).includes(name);
export const hasLastingReading = (name) => READINGS.some((entry) => forName(entry, name));

// Its sentences as one reading's, each matched in order → the matches, or null.
function matched(reading, sentences) {
    if (sentences.length !== reading.sentences.length) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? found : null;
}

// An activation's base, as src/compiler/permanent.js decideActivation makes it, and its item part.
export function activationBase(item, entry) {
    const { activation, index } = entry;
    const frequency = activation.frequency?.max ? activation.frequency : null;
    return {
        base: { modelVersion: MODEL_VERSION, source: { name: `${item.name}${activation.name ? `: ${activation.name}` : ""}`, slug: item.system?.slug ?? null, uuid: item.uuid ?? null, type: item.type }, rank: 1, traits: [...(item.system?.traits?.value ?? [])], activation: { time: activation.time ?? null, traits: activation.traits ?? [] } },
        frequency,
        info: { type: item.type, level: Number(item.system?.level?.value) || 0, recipient: "user", activation: { index, name: activation.name, time: activation.time, frequency, trigger: activation.trigger }, links: 0 }
    };
}

// The plan (null, note-only or the GM's no-effect — or any, for a reading over it) and its effect's words → the reading's card, or the same
// plan. name: its source name; base, info, frequency: its own (activationBase, or a consumable's basePlan and itemInfo).
export const withLastingReading = (plan, given) => withSentenceReadings(READINGS, plan, given);

// The same for any table of readings of this shape (src/compiler/visibility.js's too, 2026-10-27).
export function withSentenceReadings(table, plan, { name, words, base, info, frequency = null }) {
    // (over: true over any plan, or a test of the plan read before — Pyrite Rat's conjure card —, as area-readings.js's, 2026-10-27.)
    const readings = table.filter((entry) => forName(entry, name) && (typeof entry.over === "function" ? entry.over(plan) : entry.over || !plan || plan.noteOnly || plan.builtin === "no-effect"));
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of readings) {
        const found = matched(reading, sentences);
        // (Its base and item part too, for a card that needs its level: Potion of Annulment's counteract rank.)
        const card = found ? reading.card(found, plan, { base, info }) : null;
        if (!card) continue;
        // (Over the plan read before, its own parts kept: Blakenshipper's first card.)
        if (card.keep) {
            const { keep, ...changes } = card;
            const next = { ...plan, ...changes };
            for (const key of Object.keys(changes)) if (changes[key] === undefined) delete next[key];
            return next;
        }
        const { item: own, ...rest } = card;
        return {
            ...base,
            automation: { level: "automatic" },
            trigger: { event: "use", ...(frequency ? { frequency } : {}) },
            ...rest,
            item: { ...info, ...(own ?? {}) }
        };
    }
    return plan;
}

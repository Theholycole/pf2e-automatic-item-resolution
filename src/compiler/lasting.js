// Sustained, repeating and later effects whose words the readers before left whole (2026-10-27, docs/needs.md "lasting"): an activation or a
// consumable read sentence by sentence, every sentence of its effect one of the reading's own — none dropped —, into what its card plays. A
// note Effect for the time its words give, on its user or on the creatures it's for (the user's ruling for a rule PF2e can't play,
// 2026-10-25); the conditions its creatures get, ended by an Escape; a spell cast; what it tells, whispered; the card's lines for its user's
// own actions, the map, objects and what's out of combat. Hat of Many Minds' "The copy follows your specific instructions and performs a
// single, straightforward task for up to 30 minutes", Twilight Tattoo's "You can Dismiss this effect, and when you Dismiss it, the tattoo
// copies the original text onto a blank writing surface you're touching": a Dismiss is its user removing the Effect. And a Sustain that
// gives again, Blakenshipper's "For the next minute, you can Sustain to continue the music, granting you and all allies within a 60-foot
// emanation 5 temporary Hit Points that last for 1 round": plan.again, its card kept open for that minute and pressed at each Sustain
// (scripts/poisons.js). The item card plays the rest (src/live/card.js), the spell module the casts. Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { plainText } from "./rows.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours" };
const WORDS = { a: 1, an: 1, one: 1, ten: 10 };
const timeOf = (value, unit) => ({ mode: "fixed", value: WORDS[String(value).toLowerCase()] ?? Number(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
export const sentencesOf = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
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
const ownRow = ({ noteEffects = [], effects = [], notes = [], target = null, item = null }) => ({
    targeting: { target, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), effects, ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {}),
    ...(item ? { item } : {})
});
// (A spell the spell module casts: its rank, DC, whom it's on.)
const cast = ({ spell, rank = null, dc = null, self = false, area = false, targets = false, notes = [] }) => ({ builtin: "cast-spell", spell, rank, dc, attack: null, tradition: null, self, area, targets, notes });
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
        // breathing; its underwater temperatures in its words, the brewing, pouring and keeping of the coffee the card's lines.)
        name: "Faydhaan's Dallah: Brew",
        sentences: [
            /^You place a handful of beans in the dallah, and it immediately grinds the beans, fills with water, and brews six cups' worth of coffee\.$/,
            /^Pouring a cupful of coffee into a vessel takes an Interact action, as does drinking a cup\.$/,
            /^A creature that drinks a cup can breathe underwater and is protected from mild or severe temperatures of underwater environments for (\d+) (hours?|minutes?)\.$/,
            /^The coffee can later be transmuted using the dallah's other activation, but this latent magic ends if the dallah is used to brew coffee again\.$/,
            /^Coffee poured from the dallah stays in its vessel until someone drinks it or deliberately pours it out, even if the vessel is in an environment where the coffee would normally escape, such as underwater\.$/
        ],
        card: ([, , drinks]) => ownRow({
            notes: ["It brews six cups of coffee: pouring a cup into a vessel and drinking one each take an Interact action. Target the creatures that drink a cup, then press Apply.", "Poured coffee stays in its vessel until drunk or poured out, even underwater; Faydhaan's Hospitality can transmute it later, until the dallah brews again."],
            item: { recipient: "targets", ruleEffects: [{ name: "water breathing", words: "Can breathe underwater, and is protected from mild and severe temperatures in underwater environments", rules: [], duration: timeOf(drinks[1], drinks[2]) }] }
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
    }
];

// Whether a reading is for this source name (its words aren't worth reading otherwise).
export const hasLastingReading = (name) => READINGS.some((entry) => entry.name === name);

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
    const readings = table.filter((entry) => entry.name === name && (entry.over || !plan || plan.noteOnly || plan.builtin === "no-effect"));
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of readings) {
        const found = matched(reading, sentences);
        const card = found ? reading.card(found, plan) : null;
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

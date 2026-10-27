// Moving creatures and the user, Speeds, forms and size, vehicles, and several creatures at once — the adventure books' items (2026-10-27,
// docs/needs.md "Moving creatures and the user"): an activation or a consumable read sentence by sentence, every sentence of its effect one
// of the reading's own — none dropped —, into what its card plays. Void Shackles' Affix Shackle, "You affix the void shackles to a helpless or
// willing creature …": PF2e's own Effect: Manacles on the creature targeted, the shackles' own rules a note Effect on it and their 10d6 void
// a save card kept for it; Anchor Spear's "The spear embeds itself into the creature …": a note Effect on the creature it damaged and its
// Athletics check to pull the spearhead out a card kept for it; Invisible Net's "Any creature that falls on the net doesn't take falling
// damage": its square a zone the environment module's falls read (zone.fall, scripts/falls.js); Gravity Inverter's cylinder: a zone whose
// creatures are Off-Guard inside (PF2e's GrantItem); the narrower words of a bonus read before (Mask of Shifting Monstrosity's, Elixir of the
// Peaks') a note Effect for its time. The rules PF2e can't play are words on a note Effect for their time (the user's ruling 1); its user's
// own moves, the map and objects, lines of the card (ruling 2). Pure.

import { effectWords, sentencesOf } from "./lasting.js";
import { zoneOf } from "./area-readings.js";

const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours", day: "days", days: "days" };
const WORDS = { a: 1, an: 1, one: 1 };
const timeOf = (value, unit) => ({ mode: "fixed", value: WORDS[String(value).toLowerCase()] ?? Number(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
// (PF2e's own: its manacles' Effect, the legs or wrists its ChoiceSet asks for; its Off-Guard condition.)
const MANACLES = { uuid: "Compendium.pf2e.equipment-effects.Item.OJg3cA6viR3sA3jB", label: "Effect: Manacles" };
const OFF_GUARD = "Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg";
// (Until the end of the creature's own turn: a Stride's penalty.)
const THIS_TURN = { mode: "fixed", value: 0, unit: "rounds", expiry: "turn-end", anchor: "target-turn" };
// (Dimension Door's range, for a creature its stone brings beside its thrower: from wherever it was hit.)
const DIMENSION_DOOR = 120;

// The card's parts: a row for its user or the creatures targeted (a note Effect, PF2e's own Effects), and its lines.
const ownRow = ({ noteEffects = [], nativeEffects = [], notes = [], target = null }) => ({
    targeting: { target, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), ...(nativeEffects.length ? { nativeEffects } : {}), ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {})
});
const zoneCard = (zone) => ({ builtin: "zone", actions: null, targeting: { target: null, range: zone.range ? `${zone.range} feet` : null, area: zone.area }, zone });
// (A check kept for the creature the card was for, its own to roll when its words say — plan.again, scripts/live.js: a save, or a skill
// check against a DC as the ability module's save card rolls any statistic.)
const ownCheck = (base, { name, statistic, dc, basic = false, rows }) => ({
    ...base,
    source: { ...base.source, name: `${base.source.name}: ${name}` },
    automation: { level: "automatic" },
    targeting: { target: "self", range: null, area: null },
    trigger: { event: "use" },
    resolution: { kind: "save", check: { roll: "save", statistic, basic, against: { dc: "fixed", value: dc } }, ...(rows.shared ? { sharedDamage: { rollOnce: true, components: [{ id: "0", formula: rows.shared, type: null, category: null }] } } : {}), outcomes: rows.outcomes }
});
const basicRows = () => Object.fromEntries([["criticalSuccess", 0], ["success", 0.5], ["failure", 1], ["criticalFailure", 2]].map(([degree, multiplier]) => [degree, { damage: { mode: "shared", multiplier, sourceComponentIds: multiplier ? ["0"] : [] }, effects: [] }]));
const dealt = (formula) => ({ ...none(), damage: { mode: "formulas", formulas: [{ formula }], rollScope: "outcome" } });
const again = (plan, when) => ({ plan, later: true, repeat: true, own: true, when });
// (Over the plan read before, its success row's reminder of the whole text given way to the note, the sentences read gone from its unread lines:
// the plan whole when nothing else is left.)
function keptWithNote(plan, note, read) {
    const row = plan?.resolution?.outcomes?.success;
    if (!row) return null;
    const unread = (plan.unread ?? []).filter((line) => !read.some((pattern) => pattern.test(said(line))));
    const whole = !unread.length && !(plan.notes ?? []).length && !(row.manualInstructions ?? []).length;
    return { keep: true, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...row, noteEffects: [...(row.noteEffects ?? []).filter((entry) => !entry?.reminder), note] } } }, unread: unread.length ? unread : undefined, ...(whole ? { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } } : {}) };
}

// Each reading: the source names it's for (an activation's "Item: Activation"), whether it reads over the plan read before (by default only
// none, note-only, or the GM's no-effect), a pattern for each of its effect's sentences — every sentence must be one, in order — and the card
// they make (from its matches, the plan before and the item's html; keep: changes to that plan instead of a card of its own).
const READINGS = [
    {
        // (Superior manacles on the creature: PF2e's Effect, its legs or wrists picked as it's applied; the shackles' own rules — the item's text
        // before its activations — on its note Effect; their 10d6 void a basic Fortitude save card kept for it.)
        names: ["Void Shackles: Affix Shackle"],
        sentences: [/^You affix the void shackles to a helpless or willing creature or to any (\d+)\w*- or lower-level soul\.$/, /^The shackles grow in size to accommodate the wrists or ankles of any size creature\.$/],
        card: ([[, level]], _plan, { base, item }) => {
            const text = plainOf(item?.system?.description?.value);
            const pick = [null, SUPERIOR.checks, SUPERIOR.dc];
            const harm = /\bthe wearer of the manacles takes (\d+d\d+) void damage \(DC (\d+) basic Fortitude save\)/i.exec(text);
            const counter = /\bwith a counteract rank of (\d+)\w* and a \+(\d+) modifier\b/i.exec(text);
            const void_ = /\bincreases all DCs to remove them or Escape by 1 to DC (\d+)\b/i.exec(text);
            if (!harm || !counter || !void_) return null;
            const note = { label: "Void shackles", text: `Bound in void shackles (superior manacles): freeing it takes ${pick[1]} successful DC ${pick[2]} Thievery checks to Pick a Lock — in the Void, DC ${void_[1]} for each of those and to Escape. Each failed check to remove them, and each teleportation effect targeting it that the shackles counteract (rank ${counter[1]}, +${counter[2]}, the GM's check), deals it ${harm[1]} void damage (DC ${harm[2]} basic Fortitude: its card). Incorporeal, it still can't pass through solid objects; a soul held can't move on to the afterlife or become undead, and goes where the shackles are carried.`, duration: null };
            const save = ownCheck(base, { name: "Void Crystals", statistic: "fortitude", dc: Number(harm[2]), basic: true, rows: { shared: `${harm[1]}[void]`, outcomes: basicRows() } });
            return {
                ...ownRow({ target: "the creature targeted", nativeEffects: [MANACLES], noteEffects: [note], notes: [`Only on a helpless or willing creature, or a soul of level ${level} or lower; the shackles fit wrists or ankles of any size (pick legs or wrists as PF2e asks).`, "Release Shackle opens them: then remove its Effects."] }),
                again: again(save, `a check to remove the shackles from {user} fails, or the shackles counteract a teleportation effect targeting it`),
                item: { recipient: "targets" }
            };
        }
    },
    {
        // (Its +4 to Deception DC read before, PF2e's own; the look it takes and what the bonus is against, words on its Effect for the 8 hours.)
        names: ["Mask of Shifting Monstrosity: Monstrosity Meld"],
        over: (plan) => (plan?.resolution?.outcomes?.success?.modifiers ?? []).some((modifier) => modifier.selector === "deception-dc"),
        sentences: [
            /^You take on the general appearance of a type of non-humanoid creature that you can see, with the transformation lasting for (\d+) (hours?)\.$/,
            /^Activating this effect doesn't change your traits or statistics, nor does it grant any of the special abilities of the creature you're imitating\.$/,
            /^It does not change your size, so a Medium creature that assumes the shape of a manticore remains Medium sized\.$/,
            /^This effect uses the same rules as the Impersonate activity of Deception\.$/,
            /^Onlookers always assume you're the chosen type of creature unless they're actively Seeking\.$/,
            /^You gain a \+(\d+) item bonus to your Deception DC for \d+ hours?\.$/,
            /^The bonus is only against Perception checks to see through the disguise, and you add your level even if untrained\.$/
        ],
        card: ([[, hours, unit], , , , , [, bonus]], plan) => keptWithNote(plan, { label: "Monstrous look", text: `It looks like a kind of non-humanoid creature it saw (its pick), a disguise as Deception's Impersonate: its traits, statistics, size and abilities don't change. Onlookers take it for that creature unless they're actively Seeking; the +${bonus} item bonus is to its Deception DC only against those Perception checks, and its level counts toward that DC even if it's untrained.`, duration: timeOf(hours, unit) }, [/^The bonus is only against Perception checks to see through the disguise\b/])
    },
    {
        // (Its 30-foot square on the ground for the minute: the zone, its falls the environment module's — no damage while its token is inside.)
        names: ["Invisible Net"],
        sentences: [/^You activate this folded lace handkerchief by spreading it out on the ground, where it grows to cover a (\d+)-foot-by- ?\d+-foot square area\.$/, /^Pale and diaphanous, the spread handkerchief is exceptionally difficult to see from more than (\d+) feet away and evaporates entirely after (\d+|one|a) (minutes?|rounds?)\.$/, /^Any creature that falls on the net doesn't take falling damage\.$/],
        card: ([[, size], [, far, value, unit]]) => zoneCard({ ...zoneOf({ area: { type: "square", value: Number(size) }, centre: "placed", lasts: timeOf(value, unit), notes: [`Spread on the ground where its user places it; from more than ${far} feet away it's very hard to see (the GM's).`, "A creature that falls onto it takes no falling damage (the environment module's fall, while the net lasts)."] }), fall: { noDamage: true } })
    },
    {
        // (Its trigger's creature, the one it damaged: the embedded spear's rule on its Effect, and its own Athletics check to pull it out a card
        // kept for it — its damage by degree; where the spear lands, the map's.)
        names: ["Anchor Spear"],
        sentences: [
            /^The spear embeds itself into the creature, and the spear's haft splits along the silver lines to become a series of hooks attached to a thin but strong cable\.$/,
            /^As long as the anchor spear remains embedded in the creature, any time the creature burrows or climbs, it treats normal terrain as difficult terrain and difficult terrain as greater difficult terrain\.$/,
            /^The creature can spend an Interact action to attempt a @Check\[athletics\|dc:(\d+)\|name:Remove Spearhead\] check to remove the spearhead\.$/,
            /^Critical Success The anchor spear is removed, becomes broken, and falls to the ground in the creature's space\.$/,
            /^Success The anchor spear is removed, the creature takes (\d+d\d+) (\w+) damage, and the spear falls to the ground in a random space adjacent to the creature\.$/,
            /^Failure The anchor spear remains in place, and the creature takes (\d+d\d+) (\w+) damage\.$/,
            /^Critical Failure As failure, except the creature takes (\d+d\d+) (\w+) damage\.$/
        ],
        card: ([, , [, dc], , [, success, successType], [, failure, failureType], [, critical, criticalType]], _plan, { base }) => {
            const note = { label: "Anchor spear embedded", text: `The anchor spear is embedded in it, its haft split into hooks on a cable: each time it Burrows or Climbs, normal terrain is difficult terrain for it and difficult terrain greater difficult terrain. It can spend an Interact action on a DC ${dc} Athletics check to remove the spearhead (its card); once the spear's out, remove this Effect.`, duration: null };
            const removal = ownCheck(base, { name: "Remove Spearhead", statistic: "athletics", dc: Number(dc), rows: { outcomes: { criticalSuccess: none(), success: dealt(`${success}[${successType}]`), failure: dealt(`${failure}[${failureType}]`), criticalFailure: dealt(`${critical}[${criticalType}]`) } } });
            return {
                ...ownRow({ target: "the creature it damaged", noteEffects: [note], notes: ["On a critical success the spear comes out broken, on the ground in the creature's space; on a success it comes out and lands in a random space beside it (the map's: remove the creature's Effect then)."] }),
                again: again(removal, "{user} spends an Interact action to pull out the spearhead"),
                item: { recipient: "targets" }
            };
        }
    },
    {
        // (One item dropped from the saddle: a bomb's ranged Strike its user's own, PF2e's — the map's where it lands.)
        names: ["Bomber's Saddle"],
        over: () => true,
        sentences: [/^You drop a single item from the saddle's compartment, which falls to the ground below\.$/, /^If the item is a bomb, make a ranged Strike with it\.$/],
        card: () => ownRow({ notes: ["Drop one item from the compartment to the ground below (the map's). A bomb dropped is its user's own ranged Strike with that bomb (PF2e's, from the sheet)."] })
    },
    {
        // (Its cylinder for the rounds: creatures inside float, Off-Guard (PF2e's GrantItem for those inside); their rise, their Push Off and
        // their fall when it ends, the map's and their own.)
        names: ["Gravity Inverter"],
        sentences: [
            /^When you Activate a gravity inverter, you can either place it in an adjacent space or toss it up to (\d+) feet away\.$/,
            /^Once you've done so, this metallic device implodes, creating a (\d+)-foot-radius, (\d+)-foot-tall cylinder of unstable gravity that lasts for (\d+) (rounds?|minutes?)\.$/,
            /^All creatures and objects in the area when a gravity inverter is activated, who enter the area, or who begin their turn in the area float upward (\d+) feet, stopping harmlessly if they collide with a solid object or reach the top of the cylinder\.$/,
            /^While floating, a creature is Off-Guard and can't move unless they Push Off a surface or Fly\.$/,
            /^Pushing Off is a single action that has the move trait, allowing the creature to move half its Speed in a straight line through the area \(if the creature remains in the area, this momentum will be disrupted by the gravity inverter at the beginning of the creature's next turn, as noted above\)\.$/,
            /^At the end of the duration, this gravity well fades - all creatures floating fall to the ground, taking falling damage as appropriate\.$/,
            /^Creatures who can fly are immune to this fall damage\.$/
        ],
        card: ([[, toss], [, radius, tall, value, unit], [, rise]]) => zoneCard(zoneOf({
            area: { type: "burst", value: Number(radius) },
            centre: "placed",
            range: Number(toss),
            lasts: timeOf(value, unit),
            inside: [{ rules: [{ key: "GrantItem", uuid: OFF_GUARD, allowDuplicate: true, onDeleteActions: { granter: "cascade", grantee: "cascade" } }] }],
            notes: [
                `Placed beside its user or tossed up to ${toss} feet: a cylinder ${tall} feet tall. Each creature and object in it as it's made, entering it or starting its turn in it floats up ${rise} feet, stopping harmlessly at a solid object or the top (raise its token: the map's).`,
                "Floating, a creature is Off-Guard (while it's inside) and can't move except to Fly or Push Off: a single action with the move trait, half its Speed in a straight line through the area, its momentum stopped as its next turn starts, if it's still inside.",
                "When it ends, every creature still floating falls to the ground (lower its token: the environment module's falling damage); a creature that can fly takes none from that fall."
            ]
        }))
    },
    {
        // (Its bonus read before, PF2e's own on the actions' roll options, and its cold protection (src/compiler/temperature.js): the mountains they
        // need and the saves against high altitude, words on its Effect for its time.)
        names: [/^Elixir of the Peaks \((?:Lesser|Moderate|Greater|Major)\)$/],
        read: (plan) => {
            const row = plan?.resolution?.outcomes?.success;
            const bonus = (row?.modifiers ?? []).find((modifier) => modifier.selector === "athletics" && modifier.duration);
            const narrow = /^The bonus is only while you are in mountainous terrain, where it also protects you from severe cold and adds to saving throws against high altitude\.$/;
            if (!bonus || !plan.temperature || !(plan.unread ?? []).some((line) => narrow.test(said(line)))) return null;
            return keptWithNote(plan, { label: "Mountain elixir", text: `Only while it's in mountainous terrain: its +${bonus.value} item bonus to Athletics checks to Climb, High Jump and Long Jump, its protection from the cold, and +${bonus.value} to its saving throws against high altitude's effects (the GM's to add: PF2e has no option for them).`, duration: bonus.duration }, [narrow]);
        }
    },
    {
        // (Two ways, the stone used up by either: thrown at a space within 100 feet, its user teleported there (the teleport card, as Dimension
        // Door does it); or hurled at a creature, its user's ranged Strike at its highest ranged proficiency, a hit teleporting the creature beside
        // its user unless it resists — the Will save after the hit, a failure the space its user picks (plan.placed, scripts/placed-moves.js).)
        names: [/^Bonmuan Swapping Stone \((?:Lesser|Moderate|Greater|Major)\)$/],
        over: (plan) => plan?.builtin === "cast-spell" && plan.spell?.name === "Dimension Door",
        sentences: [
            /^This small, opalescent stone glows with a light that constantly shifts between colors\.$/,
            /^When you activate the stone, you throw it into a space within (\d+) feet\.$/,
            /^The stone then casts Dimension Door on you and transports you to itself\.$/,
            /^This destroys the stone\.$/,
            /^You can instead hurl the stone at a creature in an attempt to bring that creature closer to you\.$/,
            /^Make a ranged Strike against a creature using your highest proficiency with a ranged weapon\.$/,
            /^The swapping stone has a range increment of (\d+) feet\.$/,
            /^On a hit, the stone shatters against the creature, casting dimension door on the creature and causing it to instantly teleport to a space adjacent to you\.$/,
            /^An unwilling creature can resist this teleportation with a successful @Check\[will\|dc:(\d+)\|traits:teleportation\] save\.$/
        ],
        card: ([, [, within], , , , , [, increment], , [, dc]], _plan, { base, info }) => {
            const way = (fields) => ({ ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...fields, item: { ...info } });
            const resist = { ...base, source: { ...base.source, name: `${base.source.name}: Dimension Door` }, traits: [...(base.traits ?? []), "teleportation"], automation: { level: "automatic" }, targeting: { target: "the creature hit", range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "save", check: { roll: "save", statistic: "will", basic: false, against: { dc: "fixed", value: Number(dc) } }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } }, placed: { rows: { failure: { within: DIMENSION_DOOR }, criticalFailure: { within: DIMENSION_DOOR } }, nearSource: 5, teleport: true, lines: ["Teleported by Dimension Door into a space beside the stone's thrower"] }, notes: ["A willing creature needn't resist: take its row as a failure."] };
            const hurl = way({
                targeting: { target: "1 creature", range: `${increment} feet`, area: null },
                ownCheck: { kind: "attack", modifier: null, choose: ["ranged-proficiency"], increment: Number(increment) },
                resolution: { kind: "check", check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" }, modifier: null }, outcomes: { criticalSuccess: none(), success: none(), failure: none(), criticalFailure: none() } },
                thenSave: resist,
                notes: ["Its ranged Strike: Dexterity and its user's highest proficiency with a ranged weapon, range increment " + `${increment} feet. A hit shatters it on the creature: the Will save follows.`]
            });
            const throwAt = way({ builtin: "teleport", targeting: { target: "self", range: null, area: null }, teleport: { within: Number(within), lines: [`Thrown into a space within ${within} feet, it casts Dimension Door on its user and takes it there; the stone's gone`] } });
            return { builtin: "ways", targeting: { target: null, range: null, area: null }, once: true, ways: [
                { name: `Thrown at a space: Dimension Door takes its user there (within ${within} feet)`, html: `<p><strong>Effect</strong> Thrown into a space within ${within} feet: Dimension Door takes its user to it.</p>`, plan: throwAt },
                { name: "Hurled at a creature: a hit brings it beside its user", html: "<p><strong>Effect</strong> A ranged Strike at a creature: on a hit, it's teleported beside its user unless it resists.</p>", plan: hurl }
            ], notes: undefined, partial: undefined, spell: undefined, rank: undefined, dc: undefined, attack: undefined, tradition: undefined, self: undefined };
        }
    },
    {
        // (A Mythic Point spent, and a night's travel to the Dimension of Dreams: out of combat, its card's lines.)
        names: ["Dream Hunter's Lodge: Oneiric Expedition"],
        sentences: [
            /^Spend 1 Mythic Point\.$/,
            /^You and all creatures inside the lodge fall into a magical slumber, and the lodge disappears from existence\.$/,
            /^After (\d+) hours, the lodge reappears in the Dimension of Dreams \(or in the Universe, if the lodge was already in the Dimension of Dreams\), as if transported there by an Interplanar Teleport spell\.$/,
            /^Upon arrival, creatures inside the lodge awaken, fully rested \(but this effect does not increase the number of times per day you can do your daily preparations\)\.$/
        ],
        card: ([, , [, hours]]) => ({ ...ownRow({ notes: [`Its user and every creature inside sleep and the lodge vanishes; ${hours} hours later it's back in the Dimension of Dreams (or the Universe, from there), as by Interplanar Teleport, and they wake fully rested — no extra daily preparations (out of combat: the GM takes them to that scene).`] }), spend: { mythicPoints: 1 } })
    },
    {
        // (Its own move action, the one that set it off, no reactions: its user's own move, a line.)
        names: ["Runescribed Disk"],
        sentences: [
            /^Trigger You use an action with the move trait Requirements You're an expert in Acrobatics\.$/,
            /^This decorative silver disk is inscribed with magical runes, similar in appearance to a miniature teleportation circle\b/,
            /^When you activate the disk, you flicker out of sight, seeming to teleport directly to your destination as you accelerate your flow of time dramatically for the duration of your move action\.$/,
            /^Your movement doesn't trigger reactions\.$/
        ],
        card: () => ownRow({ notes: ["The move action that set it off (its user expert in Acrobatics) triggers no reactions: so fast it seems to teleport to where it ends (its own move on the map)."] })
    },
    {
        // (Attuned to the beacon: words on its user's Effect, no end of its own; what it senses, the GM's.)
        names: ["Witchwyrd Beacon"],
        sentences: [
            /^By touching the witchwyrd beacon and focusing on it for 10 minutes, you attune yourself to it\.$/,
            /^Up to four creatures can be attuned to a single witchwyrd beacon at any one time - to attune another creature, one of the previous four must become unattuned\.$/,
            /^You can break your attunement to a witchwyrd beacon by Dismissing the effect\.$/,
            /^The attunement automatically ends if the attuned creature dies or if the attuned creature attunes themselves to a different witchwyrd beacon ?\.$/,
            /^The effect can also be dispelled normally\.$/,
            /^You can sense whenever the witchwyrd beacon you are attuned to is activated in any way\.$/
        ],
        card: () => ownRow({ noteEffects: [{ label: "Attuned to the beacon", text: "Attuned to its witchwyrd beacon (four creatures at most): it senses whenever that beacon is activated in any way (the GM tells it). It ends when it Dismisses it, dies or attunes to another beacon, or when it's dispelled.", duration: null }] })
    },
    {
        // (The beacon linked to its site: a teleport's accuracy, out of combat — its card's lines.)
        names: ["Witchwyrd Beacon"],
        sentences: [
            /^You place the witchwyrd beacon on a flat, stable, and immobile surface, then adjust its rings to link it to the site\.$/,
            /^Once linked, any creature can use a teleportation effect to target the witchwyrd beacon directly, regardless of line of sight\.$/,
            /^You can Translocate or Gate to the beacon as if you could see its location, and if you travel to it via an effect like Interplanar Teleport, the beacon eliminates the imprecision of the spell\.$/,
            /^The beacon doesn't change the range of effects, only their accuracy\.$/,
            /^Once the beacon is used in this manner, it loses its link and must be reactivated again to grant this benefit to attuned creatures\.$/
        ],
        card: () => ownRow({ notes: ["Linked to the site where it's set down: any creature's teleportation can aim at the beacon without line of sight — Translocate or Gate to it as if its place were seen, Interplanar Teleport without its imprecision, no range longer. Once used so, the link's gone until it's linked again (the GM's, out of combat)."] })
    },
    {
        // (A Mythic Point spent into the silver bracelet: its wearer's one skill check at mythic proficiency, words on its Effect till it's used;
        // the golden wearer's lower maximum and the bracelet's return, lines.)
        names: ["Beloved's Bracelets: Grant Mythic Power"],
        sentences: [
            /^The wearer of the golden bracelet imbues the silver bracelet with a portion of their mythic power by spending 1 Mythic Point\.$/,
            /^Until the silver bracelet is no longer imbued with mythic power, the maximum number of Mythic Points the wearer of the golden bracelet can have is reduced by 1\.$/,
            /^Whenever the wearer of the silver bracelet would attempt a skill check, they can choose to make the check at mythic proficiency\.$/,
            /^If they do, the silver bracelet loses its mythic power and the wearer of the golden bracelet is immediately aware of this\b/,
            /^If the creature who had invested in the silver bracelet dies before expending the mythic power in it, the silver bracelet immediately teleports into the possession of the wearer of the golden bracelet\b/
        ],
        card: () => ({
            ...ownRow({ target: "the silver bracelet's wearer", noteEffects: [{ label: "Silver bracelet's mythic power", text: "Its silver bracelet holds mythic power: once, it can make a skill check at mythic proficiency (its pick, before rolling). Then the power's gone — remove this Effect —, and the golden bracelet's wearer knows at once, wherever it is.", duration: null }], notes: ["Target the silver bracelet's wearer. Meanwhile its user's maximum Mythic Points are 1 lower (its sheet's).", "If the silver bracelet's wearer dies with the power unspent, the bracelet appears in its user's possession, wherever it is."] }),
            spend: { mythicPoints: 1 },
            item: { recipient: "targets" }
        })
    },
    {
        // (Its +1 to saves against emotion and mental effects read before, PF2e's own on the ally targeted: how long it lasts and the new save
        // its handing over allows, words on that ally's Effect.)
        names: ["Admirer's Bouquet"],
        over: (plan) => (plan?.resolution?.outcomes?.success?.modifiers ?? []).some((modifier) => modifier.selector === "saving-throw") && plan.item?.recipient === "targets",
        sentences: [
            /^You hand the admirer's bouquet to the triggering ally\.$/,
            /^The triggering ally gains a \+(\d+) item bonus to saves against emotion and mental effects\.$/,
            /^The bonus ends once the ally no longer carries the bouquet \(end it by hand\)\.$/,
            /^If they're currently suffering from a debilitating emotion or mental effect as the result of a saving throw made during the previous turn, they can immediately attempt a new saving throw against that effect upon being given the bouquet\b/,
            /^An admirer's bouquet can allow for a new saving throw in this way only once per day\.$/
        ],
        card: ([, [, bonus]], plan) => keptWithNote(plan, { label: "Admirer's bouquet", text: `It carries the admirer's bouquet: a +${bonus} item bonus to saves against emotion and mental effects while it does (remove this Effect once it doesn't). Given it while a debilitating emotion or mental effect from a save it made during the previous turn holds it, it can attempt a new save against that effect at once, with this +${bonus} — once a day for the bouquet.`, duration: null }, [/^The bonus ends once the ally no longer carries\b/, /^If they're currently suffering from a debilitating emotion\b/, /^An admirer's bouquet can allow for a new saving throw\b/])
    },
    {
        // (Its house shrunk to a gourd, its room a pocket for the night: out of combat and the map's, lines of the card.)
        names: ["Gourd Home"],
        sentences: [
            /^By rapping on the door from either outside or inside, you cause the gourd home to shrink back into its normal size and appear to be a non-magical gourd sitting on the ground\.$/,
            /^For the following (\d+) hours, the interior of the gourd home becomes an extradimensional space whose size appears unchanged to those within\.$/,
            /^If anyone outside picks up or damages the gourd, or if anyone inside the gourd home attempts to exit, all creatures within the gourd home immediately reappear in the area surrounding the gourd, and the gourd home becomes inactive for (\d+) hours\.$/
        ],
        card: ([, [, hours], [, inactive]]) => ownRow({ notes: [`Rapped on its door (from inside or out, its house on earth or soil): it shrinks to what looks like a plain gourd on the ground, its room an extradimensional space for ${hours} hours that looks the same size to those within. Anyone outside picking up or damaging the gourd, or anyone inside trying to leave, puts everyone inside back around the gourd, and it's inactive for ${inactive} hours (the map's, out of combat).`] })
    },
    {
        // (Its two scrying spells at once and its user's voice through them: what it shows whispered to the GM and its user — the information
        // ruling —, over the cast of one of them.)
        names: ["Elysian Clairglass: Seek and Speak"],
        over: (plan) => plan?.builtin === "cast-spell",
        sentences: [
            /^The Elysian clairglass casts clairaudience and clairvoyance on the area you are currently observing with it\.$/,
            /^As long as you're holding the Elysian clairglass ?, you can speak through the floating eye or ear created by its spells\b/
        ],
        card: () => ({ builtin: "whisper", targeting: { target: null, range: null, area: null }, whisper: { text: "Clairaudience and Clairvoyance on the area its user is watching through the clairglass: the GM tells what it hears and sees there for the spells' time. While holding the clairglass, its user can speak through their floating eye or ear, as a whisper only one creature in range hears, a booming voice they all hear, or anything between." }, decided: "information", spell: undefined, rank: undefined, dc: undefined, attack: undefined, tradition: undefined, self: undefined, area: undefined, targets: undefined, notes: undefined, partial: undefined })
    },
    {
        // (Its hour of bubbles: what it can do and what a bubble does, words on its drinker's Effect; a bubble's rise, the map's.)
        names: ["Effervescent Decoction"],
        sentences: [
            /^This bubbly potion is purportedly made from winds gathered from the Mana Wastes and distilled into a liquor\.$/,
            /^For (\d+|one|an?) (hours?|minutes?) after you imbibe the decoction, you can belch fizzy foam around willing creatures or unattended objects, surrounding them with a pink bubble\.$/,
            /^Once per minute, you can belch a bubble by using two Interact actions\.$/,
            /^This has effects similar to a Levitate spell, except you can't control the bubbles; they rise (\d+) feet per round on their own\.$/,
            /^The bubble is sturdy enough to resist minor bumps or heavy winds, but if the item or creature takes any damage, the bubble pops, causing the levitation effect to end\.$/,
            /^If the creature surrounded by the bubble uses a move action rather than just ride within the bubble, the bubble also pops\.$/
        ],
        card: ([, [, value, unit], , [, rise]]) => ownRow({ target: "the drinker", noteEffects: [{ label: "Bubble belching", text: `Once a minute, with two Interact actions, it can belch a pink bubble around a willing creature or an unattended object: Levitate's effects, but not steered — it rises ${rise} feet a round on its own (raise the token: the map's), sturdy against bumps and wind. It pops, ending the levitation, when what's inside takes any damage, or when a creature inside uses a move action rather than riding along.`, duration: timeOf(value, unit) }] })
    },
    {
        // (Its hit's target: each Stride for 2 rounds needs a Fortitude save — its own card, kept for the rounds, a failure −10 feet for that
        // Stride; its leaden limbs, words on its Effect.)
        names: ["Dupe's Gold Nugget"],
        sentences: [
            /^Trigger You hit with a ranged Strike with the affixed weapon Requirements You're an expert with the affixed weapon\.$/,
            /^This nugget of gold and lead amalgam is attached to the weapon by thick, twisted wire or chain\.$/,
            /^When activated, the target's limbs become like lead weights\.$/,
            /^For (\d+) (rounds?|minutes?), each time the target Strides it must attempt a @Check\[fortitude\|dc:(\d+)\] save\.$/,
            /^On a failure, it takes a -(\d+)-foot status penalty to its Speed for that Stride \(to a minimum Speed of (\d+) feet\)\.$/,
            /^On a critical success, the dupe's gold nugget effect ends early\.$/
        ],
        card: ([, , , [, value, unit, dc], [, feet, least]], _plan, { base }) => {
            const time = timeOf(value, unit);
            const slowed = { ...none(), modifiers: [{ selector: "land-speed", value: -Number(feet), type: "status", duration: THIS_TURN }] };
            const stride = { ...ownCheck(base, { name: "Leaden Stride", statistic: "fortitude", dc: Number(dc), rows: { outcomes: { criticalSuccess: none(), success: none(), failure: slowed, criticalFailure: slowed } } }), notes: [`A failure: −${feet} feet to its Speed for this Stride (${least} feet at least). A critical success ends the nugget's effect: remove its Effect.`] };
            return {
                ...ownRow({ target: "the creature hit", noteEffects: [{ label: "Leaden limbs", text: `Its limbs are like lead: each time it Strides, it first attempts a DC ${dc} Fortitude save (its card) — a failure, −${feet} feet status to its Speed for that Stride (${least} feet at least); a critical success ends this.`, duration: time }], notes: ["Its user is an expert with the affixed weapon, and the hit was a ranged Strike with it."] }),
                again: { ...again(stride, "{user} Strides"), time: { value: time.value, unit: time.unit } },
                item: { recipient: "targets" }
            };
        }
    },
    {
        // (A minute's reckoning by the stars: what it tells whispered to the GM and its user; its bonus to identify the stars, which no PF2e
        // option names, the GM's to add.)
        names: ["Mariner's Astrolabe: Calculate"],
        sentences: [
            /^Astrolabes can be used for navigation in unfamiliar or featureless locations\.$/,
            /^To use an astrolabe, the holder must be trained in Survival\.$/,
            /^By spending 1 minute to measure the height of the stars and planets, a holder who knows the time and date can determine the latitude, and a holder who knows their latitude can determine the date and time\.$/,
            /^An astrolabe also grants a \+(\d+) item bonus to checks to identify celestial bodies\.$/,
            /^A standard astrolabe functions only on steady ground\.$/,
            /^A mariner's astrolabe contains additional stabilizers that make it suitable for use on moving surfaces, such as the deck of a ship\.$/
        ],
        card: ([, , , [, bonus]]) => ({ builtin: "whisper", targeting: { target: null, range: null, area: null }, whisper: { text: `A minute's measuring of the stars and planets (its holder trained in Survival, even on a moving deck): knowing the time and date, it learns its latitude; knowing its latitude, the date and time — the GM tells. Its +${bonus} item bonus to checks to identify celestial bodies is the GM's to add (PF2e has no option for them).` }, decided: "information" })
    },
    {
        // (The whistle unfolded into its calliope: +1 to Performance while it's set up (PF2e's whole roll, the user's ruling for a narrow bonus),
        // the bonus's narrower words and its collapse on its user's Effect; where it stands, the map's.)
        names: ["Marvelous Calliope"],
        sentences: [
            /^You blow a tune upon the slide whistle, causing the whistle to expand\.$/,
            /^The whistle sprouts from one into several, and then creates a large wooden frame and keyboard\.$/,
            /^By the time the unfolding is complete, the whistle fully transforms into a calliope, a wagon-sized contraption consisting of several steam whistles played like an organ\.$/,
            /^The calliope is heavy and anchored in place\.$/,
            /^You have a \+(\d+) item bonus to Performance checks to play the calliope\.$/,
            /^The calliope has a tendency to produce music for a few seconds after you cease playing it, adding a jaunty and overlong conclusion to your music\.$/,
            /^If you use an Interact action to pull the small metal ring on the underside of the marvelous calliope ?, the calliope collapses back down into a slide whistle\.$/
        ],
        card: ([, , , , [, bonus]]) => {
            const row = ownRow({ noteEffects: [{ label: "Calliope unfolded", text: `Its calliope stands unfolded, wagon-sized, heavy and anchored in place, its music running on a few seconds after playing stops. The +${bonus} item bonus is to Performance checks to play it. Pulling the ring underneath (an Interact) folds it back into a slide whistle: remove this Effect then.`, duration: null }], notes: ["Place the wagon-sized calliope where it unfolds (the map's)."] });
            const success = row.resolution.outcomes.success;
            return { ...row, resolution: { ...row.resolution, outcomes: { success: { ...success, modifiers: [{ selector: "performance", value: Number(bonus), type: "item", duration: null }] } } } };
        }
    }
];
// (PF2e's Superior Manacles' freeing, its six successful DC 42 Thievery checks: the shackles "function as superior manacles".)
const SUPERIOR = { checks: "six", dc: 42 };
const plainOf = (html) => String(html ?? "").replace(/@Damage\[\(?([^[\]]+?)\)?\[([\w,]+)\]\](?:\{[^}]*\})?/g, (_all, formula, type) => `${formula} ${type}`).replace(/@Check\[(\w+)\|dc:(\d+)(\|basic)?[^\]]*\](?:\{[^}]*\})?/g, (_all, save, dc, basic) => `DC ${dc}${basic ? " basic" : ""} ${save.charAt(0).toUpperCase()}${save.slice(1)}`).replace(/\[\[\/\w+ [^\]]*\]\]\{([^}]*)\}/g, "$1").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const forName = (reading, name) => reading.names.some((entry) => (entry instanceof RegExp ? entry.test(String(name ?? "")) : entry === name));
// Whether a reading is for this source name (its words aren't worth reading otherwise).
export const hasMovingReading = (name) => READINGS.some((reading) => forName(reading, name));

// Its sentences as one reading's, each matched in order → the matches, or null.
function matched(reading, sentences) {
    if (sentences.length !== reading.sentences.length) return null;
    const found = sentences.map((sentence, index) => reading.sentences[index].exec(sentence));
    return found.every(Boolean) ? found : null;
}

// The plan and the activation's (or consumable's) html → the reading's card, or the same plan. name: its source name; kind "activation" or
// "consumable"; base, info, frequency: its own (permanent.js activationBase, or a consumable's basePlan and itemInfo); item: the whole item.
export function withMovingReading(plan, { name, html, kind = "activation", base, info, frequency = null, item = null }) {
    const readings = READINGS.filter((reading) => forName(reading, name) && (reading.read || (reading.over ? reading.over(plan) : !plan || plan.noteOnly || plan.builtin === "no-effect")));
    if (!readings.length) return plan;
    const words = effectWords(html, kind);
    const sentences = words ? sentencesOf(words) : [];
    for (const reading of readings) {
        const found = reading.read ? true : matched(reading, sentences);
        const card = reading.read ? reading.read(plan, { html, base, info, item }) : found ? reading.card(found, plan, { base, info, item }) : null;
        if (!card) continue;
        // (Over the plan read before, its own parts kept; undefined ones gone.)
        if (card.keep) {
            const { keep, ...changes } = card;
            const next = { ...plan, ...changes };
            for (const key of Object.keys(changes)) if (changes[key] === undefined) delete next[key];
            return next;
        }
        const { item: own, ...rest } = card;
        const next = { ...base, automation: { level: "automatic" }, trigger: { event: "use", ...(frequency ? { frequency } : {}) }, ...rest, item: { ...info, ...(own ?? {}) } };
        for (const key of Object.keys(rest)) if (rest[key] === undefined) delete next[key];
        return next;
    }
    return plan;
}

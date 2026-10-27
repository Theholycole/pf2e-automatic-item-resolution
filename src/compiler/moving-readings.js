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

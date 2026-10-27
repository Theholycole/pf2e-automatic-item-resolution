// Unique items' and artifacts' own rules (2026-10-27, docs/needs.md; the user: "unique effects that are on unique rarity items should be
// automated", each built in full rather than a card's line). Each reader below matches its activation's own sentences (its trigger, its Effect),
// anchored, and builds what its card plays; what's left of its words is lore (src/compiler/lore-lines.js) or nothing. A plan built from nothing
// gets the activation's base and item part (src/compiler/triggered.js keptBase). Outermost of src/compiler/permanent.js decideActivation's
// readers, before the user's rulings (src/compiler/decided.js).
//
// - One more use of a feat its user just used (withFeatUse): Ancestral Embrace's "Trigger You use an ancestry feat that has a limited number of
//   uses per day … You gain an additional use of the ancestry feat. If you do not use it before the next time you make your daily preparations,
//   the use is lost." → builtin "feat-use", plan.featUse { category, per }: the feat-use card (src/live/feat-use-card.js, scripts/feat-uses.js)
//   picks one of its user's feats of that kind whose uses a day are spent, and gives one back (PF2e's frequency value, which its next daily
//   preparations set to its maximum again: the extra use lost).
// - A ritual cast more easily (withEasierRitual): Ancestral Embrace's "Trigger You begin casting a legend lore ritual … Ancestral Embrace
//   reduces the casting time of this ritual to 1 hour, and you don't need secondary casters for this ritual." → a note Effect on its user for
//   that casting's hour (no casting time or caster count PF2e or the spell module's ritual card plays).
// - A battle form of the item's own instead of a deity's (withOwnAvatar): Ancestral Embrace's "The armor casts Avatar, granting these specific
//   additional abilities instead of those associated with a deity: Speed 70 feet, air walk, … Melee spear (reach 15 feet, thrown 50 feet),
//   Damage 6d6+6 piercing Ranged blowgun (range 120 feet), Damage 1d6+3 piercing plus 5d6 poison." → its user's Effect for Avatar's minute with
//   PF2e's BattleForm rule: Avatar's own statistics (Huge; its level + 25 for AC; temporary Hit Points 30; darkvision; Athletics +35; its attacks at +33)
//   with the item's Speeds and Strikes, the extra poison dice a DamageDice on the blowgun; walking on air and ignoring difficult terrain, the
//   map's, its words.
// - A blow absorbed beside a cast (withAbsorbedBlow): Forgefather's Seal's Retributive Rebuff, "The attack's damage is reduced by 100 and you
//   cast Earthquake (DC 40), centered directly on the triggering creature" → the cast as read, and plan.alsoReadied: the readied card's
//   resistance 100 to all damage against the triggering attack, spent by that damage (scripts/fortune.js), posted beside the cast card
//   (scripts/live.js). Where its area goes and how big — "from as small as the size of the creature and up to a 60-foot burst" — the
//   map's: lines of the cast card.
// - An item mended outright (withMended): Forgefather's Seal's Seal of Mending, "repair an item within reach … restores the item to full Hit
//   Points, even if the item was destroyed … magic items and artifacts of its level or lower" → the objects card's repair (op "repair",
//   reach: its user's items and those of the creatures within its reach, up to the item's level), and "the seal's ability to automatically
//   repair shields becomes inactive until the next time you make your daily preparations": objects.pauses, an Effect on its user until then
//   that its shields' repair at each turn's start waits for (src/compiler/shield-repair.js, scripts/shield-repair.js). Most of the item
//   there to mend: the GM's call, a line.
// - A cast with a check for more (withCheckedCreation): Cane of the Maelstrom's "casts a 5th-rank Creation spell, except the duration is
//   unlimited and you can create delicate or complex objects by succeeding at an applicable Crafting skill check" → its unlimited time as read
//   (src/compiler/cast-duration.js), and the cast card's two choices: the spell as it is, or the spell with plan.choices[1].castCheck — its
//   user's PF2e Crafting check rolled with the cast (scripts/casts.js), its DC the object's, the GM's.
// - A body slain turned to soil (withSoiledBody): Shadowed Scale, the Jungle Secret's "Requirements Your last action was a melee Strike that
//   killed a living creature … You cause the body to decompose into a pile of fertile soil … it can only be returned to life with the use of
//   powerful magic such as Miracle or Wish" → its gate (src/compiler/strike-gate.js: that Strike its user's last, its creature dead now), and a
//   note Effect on that body for good (plan.atTarget: the ability module's card at the creature struck), its RollOption the mark its other
//   activation looks for.
// - A summon by the body's level (withSoilSummon): its "Requirements You are adjacent to the body of a creature you killed that has decomposed
//   into soil … You cast Summon Plant or Fungus; the spell is heightened to a level equal to one-half of the slain creature's level, rounded
//   up" → plan.castRankBy { mark, within, half }: the cast at half the targeted body's level (rounded up), refused unless that body has the
//   mark and is adjacent (scripts/casts.js). What the plant becomes when the spell ends, rooted flora: the map's, a line.
// - A weapon's damage type changed till changed again (withDamageTypeWays): Kaldemash's Lament's "Kaldemash's Lament's damage type changes to
//   either electricity, fire, or force until you change the type again" (PF2e's item has no toggle for it) → the ways card, one way per type,
//   each its user's Effect with no end of PF2e's DamageAlteration on the weapon's Strike damage (its slug's), the last one replaced
//   (item.ruleEffects[].replaces, scripts/live.js).
// - A gun that flies and fires on its own (withFlyingGun): Kaldemash's Lament's "You release the star gun and it begins to move independently …
//   for 3 rounds … you can Sustain the activation to have it make a Strike against a creature. It makes a ranged Strike using your attack
//   modifier while wielding it or a +31 bonus, whichever is higher … creatures it targets are Off-Guard to the gun's attacks." → its user's
//   Effect for the 3 rounds: PF2e's EphemeralEffect of Off-Guard on its Strikes with it, and item.ruleEffects[].attackFloor — the +31 made up
//   with a FlatModifier when its user's own modifier with it is lower (scripts/live.js, as it's applied). Each Sustain is its user's own
//   Strike with it (PF2e's multiple attack penalty as normal); its space, its 30 feet, grabs failing and its return to the hand, the map's, its
//   words.
// - A candle whose light is a consecrated area (withConsecratedLight, withPutOut, withLimned): Soulspark Candle's "When lit, the candle sheds
//   bright light for 20 feet and dim light for a further 20 feet … The area within the candle's light is a consecrated space. Worshippers of
//   Pharasma within this area gain a +3 status bonus to attack rolls, skill checks, saving throws, and Perception checks. Undead creatures and
//   worshippers of Urgathoa within this area take a –3 status penalty to those checks." Lit ("You light the candle"): the ability module's
//   zone around its user for as long as it burns, its rules on each creature inside as PF2e's own Effect: Soulspark Candle has them (by
//   deity, PF2e's deity:primary and self:mode:undead), and plan.ownLight, PF2e's TokenLight on its user (scripts/zones.js). Put out ("You put
//   out the candle with ritual prayers"): item.putsOut — the item's zones and light gone (scripts/live.js), its limned undead's Effects then a
//   minute more. Its other words (black flame by undead, no snuffing by weather, no heat, never used up) are the zone's lines.
//   Its undead limned ("All undead creatures in the area are limned in blue, heatless fire …"): a note Effect on each undead targeted (only
//   those, plan.onlyAgainst; haunts aren't creatures), with its visibility words and its mark — the light's end gives it its minute.
//   "The candle is lit": plan.gate.lit, refused unless its user has its light (scripts/live.js).
// - A bond with a willing creature (withBond): The Marriage's "Choose one adjacent willing creature … you form a magical bond with that creature
//   that persists until you activate The Marriage again … telepathy to a distance of 120 feet … you know the other's direction from you, distance
//   from you, and any conditions affecting them. If your bonded target becomes Blinded, Confused, … or Stunned, you can use a reaction to attempt
//   to counter the condition … The modifier on this counter check is equal to your class DC – 10. If you fail to counter the condition, that
//   condition also afflicts you, and the bond with the other still ends." → builtin "bond", plan.bond: the bond card (src/live/bond-card.js,
//   scripts/bonds.js) gives both an Effect for the bond (the last bond of the item's gone), and when PF2e gives the bonded creature one of those
//   conditions its user gets the counteract card for it — its class DC − 10, the item's rank (half its level), the condition its user's too on a
//   failure, the bond over either way. Being willing is the creatures' own; awareness and telepathy are the Effects' words.
// - A consumable found for the need at hand (withFoundConsumable): The Unicorn's "Inside, you'll find a Common consumable alchemical or magic
//   item you need … The GM always decides what consumable item is discovered, and it must be equal to or lower than your level. If the
//   consumable isn't used within 1 minute of being discovered, the item vanishes. If there's no appropriate item …, the daily use of The Unicorn
//   is not expended." → builtin "found-item", plan.found: the found card (src/live/found-card.js, scripts/found.js) takes the GM's pick by name
//   (PF2e's equipment), checks it's a common alchemical or magical consumable of its user's level or lower, and puts it in its user's
//   inventory to vanish after the minute (scripts/expiring.js); none picked, the activation's use is given back. Its examples and the
//   container its user opens: lines.
// - A cast at a set DC on a creature of the item's own kind (withScryingAs): Viridian Crown's View Subject, "This functions as if the Viridian
//   Crown cast Scrying to your specifications. The target can resist the scrying effect with a DC 43 Will save if they wish." → the spell
//   module's cast (builtin "cast-spell") at that DC; whom it may scry (an elf who accepted its user's rule, known by name or met) and a willing
//   target's choice not to resist, lines of the cast card.
// Pure.

import { keptBase, ownCard } from "./triggered.js";
import { plainText } from "./rows.js";
import { readStrikeGate } from "./strike-gate.js";

const sentencesOf = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z@(])/).map((sentence) => sentence.trim()).filter(Boolean);
// Its Effect's words: after "Effect", without its Craft Requirements.
const effectOf = (html) => /\bEffect\b\s*(.*)$/s.exec(plainText(html).replace(/\s*\bCraft Requirements\b.*$/s, ""))?.[1]?.trim() ?? "";
const matches = (patterns, sentences) => patterns.length === sentences.length && patterns.every((pattern, at) => pattern.test(sentences[at]));
const MINUTE = { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" };
const hours = (value) => ({ mode: "fixed", value: Number(value), unit: "hours", expiry: "turn-start", anchor: "effect-start" });
// (Nothing read for it yet: no plan, or the GM's no-effect.)
const unread = (plan) => !plan || plan.builtin === "no-effect";
const slugOf = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// --- One more use of a feat its user just used -------------------------------------------------------------------------------------------------

const FEAT_TRIGGER = /^You use an? (ancestry|class|general|skill) feat that has a limited number of uses per day$/i;
const FEAT_USE = [/^You gain an additional use of the (ancestry|class|general|skill) feat\.$/i, /^If you do not use it before the next time you make your daily preparations, the use is lost\.$/i];
function withFeatUse(plan, { activation, index }, item) {
    const trigger = FEAT_TRIGGER.exec(String(activation.trigger ?? ""));
    const sentences = sentencesOf(effectOf(activation.html));
    if (!trigger || !matches(FEAT_USE, sentences) || FEAT_USE[0].exec(sentences[0])[1].toLowerCase() !== trigger[1].toLowerCase()) return plan;
    // (PF2e's frequencies a day: "day", and 24 hours.)
    return { ...keptBase(plan, item, { activation, index }), builtin: "feat-use", automation: { level: "automatic" }, featUse: { category: trigger[1].toLowerCase(), per: ["day", "PT24H"] } };
}

// --- A ritual cast more easily ---------------------------------------------------------------------------------------------------------------------

const RITUAL_TRIGGER = /^You begin casting an? ([a-z][a-z' -]+?) ritual\b(.*)$/i;
const RITUAL_EASED = /^[\w' -]+? reduces the casting time of this ritual to (\d+) (hours?|minutes?), and you don't need secondary casters for this ritual\.$/i;
function withEasierRitual(plan, { activation, index }, item) {
    const trigger = RITUAL_TRIGGER.exec(String(activation.trigger ?? ""));
    const sentences = sentencesOf(effectOf(activation.html));
    if (!trigger || sentences.length !== 1 || !RITUAL_EASED.test(sentences[0])) return plan;
    const [, amount, unit] = RITUAL_EASED.exec(sentences[0]);
    const ritual = trigger[1].replace(/\b\w/g, (letter) => letter.toUpperCase());
    const about = trigger[2].replace(/^\s*to learn legends\s*/i, "").trim();
    const time = `${amount} ${Number(amount) === 1 ? unit.replace(/s$/, "") : unit.replace(/s?$/, "s")}`;
    const duration = /^hour/i.test(unit) ? hours(amount) : { ...MINUTE, value: Number(amount) };
    const text = `This casting of ${ritual}${about ? ` (${about})` : ""} takes ${time} to cast, and it needs no secondary casters.`;
    return { ...ownCard(keptBase(plan, item, { activation, index }), { noteEffects: [{ label: `${ritual} in ${time}`, text, duration }] }), noteOnly: undefined, partial: undefined };
}

// --- A battle form of the item's own instead of a deity's --------------------------------------------------------------------------------------

// Avatar's own statistics, whatever the deity (PF2e's spell, 10th rank): its AC its level + 25, temporary Hit Points 30, darkvision, its attacks
// at +33, Athletics +35 unless its own is higher, Huge with hands, for 1 minute.
const AVATAR = { size: "huge", ac: 25, tempHP: 30, attack: 33, athletics: 35 };
const OWN_AVATAR = /^The [\w' -]+? casts Avatar, granting these specific additional abilities instead of those associated with a deity: (.+?) (Melee .+)$/;
const FORM_STRIKE = /(Melee|Ranged) (?:\d )?([a-z][a-z' -]*?) \(([^)]*)\), Damage (\d+)d(\d+)(?:\+(\d+))? ([a-z]+)(?: plus (\d+)d(\d+) ([a-z]+))?(?=\s+(?:Melee|Ranged)\b|\.?$)/g;
// (Its movement's words: Speeds PF2e's form takes, and what's the map's.)
const MOVES = [
    [/^Speed (\d+) feet$/i, (match, form) => { form.speeds.land = Number(match[1]); }],
    [/^(burrow|climb|fly|swim) Speed (\d+) feet$/i, (match, form) => { form.speeds[match[1].toLowerCase()] = Number(match[2]); }],
    [/^air walk$/i, (match, form) => { form.words.push("walks on air as on solid ground (up or down at most 45 degrees)"); }],
    [/^ignore difficult terrain and greater difficult terrain$/i, (match, form) => { form.words.push("ignores difficult terrain and greater difficult terrain"); }]
];
function withOwnAvatar(plan, { activation, index }, item) {
    const sentences = sentencesOf(effectOf(activation.html));
    const said = sentences.length === 1 ? OWN_AVATAR.exec(sentences[0]) : null;
    if (!said || plan?.spell?.name !== "Avatar") return plan;
    const form = { speeds: {}, words: [] };
    for (const token of said[1].split(/,\s*/)) {
        const move = MOVES.map(([pattern, apply]) => ({ match: pattern.exec(token.trim()), apply })).find((entry) => entry.match);
        if (!move) return plan;
        move.apply(move.match, form);
    }
    const strikes = {};
    const extra = [];
    const read = [...said[2].matchAll(FORM_STRIKE)];
    if (!read.length || read.map((match) => match[0]).join(" ").replace(/\.$/, "") !== said[2].replace(/\.$/, "")) return plan;
    for (const [, kind, name, traitWords, dice, die, bonus, type, moreDice, moreDie, moreType] of read) {
        const ranged = kind === "Ranged";
        const traits = ["unarmed"];
        let range = null;
        for (const trait of traitWords.split(/,\s*/)) {
            const reach = /^reach (\d+) feet$/i.exec(trait);
            const thrown = /^thrown (\d+) feet$/i.exec(trait);
            const far = /^range (increment )?(\d+) feet$/i.exec(trait);
            if (reach) traits.push(`reach-${reach[1]}`);
            else if (thrown) traits.push(`thrown-${thrown[1]}`);
            else if (far) range = far[1] ? { increment: Number(far[2]) } : { max: Number(far[2]) };
            else return plan;
        }
        if (ranged && !range) return plan;
        const slug = slugOf(name);
        strikes[slug] = { label: name.replace(/^./, (letter) => letter.toUpperCase()), category: "unarmed", ability: ranged ? "dex" : "str", modifier: AVATAR.attack, ownIfHigher: false, traits, damage: { dice: Number(dice), die: `d${die}`, modifier: Number(bonus ?? 0), damageType: type }, ...(range ? { range } : {}) };
        if (moreDice) extra.push({ key: "DamageDice", selector: "strike-damage", predicate: [`item:slug:${slug}`], diceNumber: Number(moreDice), dieSize: `d${moreDie}`, damageType: moreType, label: `${strikes[slug].label} (${moreType})` });
    }
    if (form.speeds.land == null) return plan;
    const rules = [{ key: "BattleForm", hasHands: true, overrides: { size: AVATAR.size, armorClass: { modifier: `${AVATAR.ac} + @actor.level`, ignoreCheckPenalty: true, ignoreSpeedPenalty: true }, tempHP: AVATAR.tempHP, senses: { darkvision: {} }, skills: { athletics: { modifier: AVATAR.athletics, ownIfHigher: true } }, speeds: form.speeds, strikes } }, ...extra];
    const attacks = read.map(([, , name, traitWords, dice, die, bonus, type, moreDice, moreDie, moreType]) => `${name} (${traitWords}) ${dice}d${die}${bonus ? `+${bonus}` : ""} ${type}${moreDice ? ` plus ${moreDice}d${moreDie} ${moreType}` : ""}`);
    const speeds = Object.entries(form.speeds).map(([kind, feet]) => (kind === "land" ? `Speed ${feet} feet` : `${kind} Speed ${feet} feet`));
    const text = `Avatar of the armor's own: a Huge battle form with hands, AC ${AVATAR.ac} + its level (no armor check or Speed penalty), ${AVATAR.tempHP} temporary Hit Points, darkvision, Athletics +${AVATAR.athletics} unless its own is higher; ${speeds.join(", ")}${form.words.length ? `, and it ${form.words.join(" and ")}` : ""}. Its only Strikes, at +${AVATAR.attack}: ${attacks.join("; ")}. Remove this Effect to Dismiss the spell.`;
    const base = keptBase(plan, item, { activation, index });
    const { spell, rank, dc, attack, tradition, self, targets, notes, partial, builtin, ...rest } = { ...plan, ...base };
    return { ...ownCard({ ...rest, rank: 10, traits: [...new Set([...(base.traits ?? []), "polymorph"])] }, { noteEffects: [{ label: "Avatar", text, duration: MINUTE, rules }] }), noteOnly: undefined };
}

// --- A blow absorbed beside a cast ---------------------------------------------------------------------------------------------------------

const ABSORBED = /^The attack's damage is reduced by (\d+) and you cast ([A-Z][\w' -]+?) \(DC (\d+)\), centered directly on the triggering creature\.$/;
const AREA_PICKED = /^You decide the area of the [\w' -]+? when you Cast the Spell, from as small as the size of the creature and up to an? (\d+)-foot burst\.$/;
const ABSORBS = /^The [\w' -]+? glows and your armor shakes as it absorbs the blow\.$/;
function withAbsorbedBlow(plan, { activation }) {
    const sentences = sentencesOf(effectOf(activation.html));
    const absorbed = sentences.map((sentence) => ABSORBED.exec(sentence)).find(Boolean);
    if (plan?.builtin !== "cast-spell" || !absorbed || plan.spell?.name !== absorbed[2] || Number(plan.dc) !== Number(absorbed[3]) || !/\bhit by an attack\b/i.test(String(activation.trigger ?? ""))) return plan;
    const area = sentences.map((sentence) => AREA_PICKED.exec(sentence)).find(Boolean);
    if (!sentences.every((sentence) => ABSORBED.test(sentence) || AREA_PICKED.test(sentence) || ABSORBS.test(sentence))) return plan;
    const notes = (plan.notes ?? []).filter((note) => !ABSORBED.test(String(note).trim()) && !AREA_PICKED.test(String(note).trim()));
    const lines = [`Centered on the creature that hit its user${area ? `: lay its area from that creature's size up to a ${area[1]}-foot burst` : ""}.`];
    const readied = { builtin: "readied-bonus", automation: { level: "automatic" }, targeting: { target: "the user", range: null, area: null }, trigger: { event: "use" }, bonus: { modifiers: [], resistance: { type: "all-damage", value: Number(absorbed[1]) }, duration: { value: 0, unit: "rounds", expiry: "turn-end" }, spend: [], against: true }, notes: [`Only against the attack that hit: its damage ${absorbed[1]} less.`] };
    const { partial, ...rest } = plan;
    return { ...rest, ...(notes.length ? { notes } : { notes: undefined }), castLines: [...(plan.castLines ?? []), ...lines], alsoReadied: readied, ...(notes.length ? { partial } : { automation: { ...(plan.automation ?? {}), level: "automatic" } }) };
}

// --- An item mended outright ---------------------------------------------------------------------------------------------------------------

const MEND = [
    /^You call upon (?:on )?the restorative powers of the [\w' -]+? to repair an item within reach\.$/,
    /^The [\w' -]+? instantly restores the item to full Hit Points, even if the item was destroyed, using the effects of the Remake spell, so long as the majority of the item is available for the repair\.$/,
    /^The [\w' -]+? can restore even magic items and artifacts of its level or lower\.$/,
    /^Once you have used this ability, the [\w' -]+?'s ability to automatically repair shields becomes inactive until the next time you make your daily preparations\.$/
];
function withMended(plan, { activation, index }, item) {
    if (!matches(MEND, sentencesOf(effectOf(activation.html)))) return plan;
    const level = Number(item.system?.level?.value) || 0;
    return {
        ...keptBase(plan, item, { activation, index }),
        builtin: "objects",
        automation: { level: "automatic" },
        targeting: { target: "self", range: null, area: null },
        objects: { op: "repair", reach: true, destroyed: true, maxLevel: level, pauses: { what: "shield-repair", untilRest: true } },
        notes: ["Only while most of the item is there to mend (the GM's call), as Remake needs."]
    };
}

// --- A cast with a check for more ---------------------------------------------------------------------------------------------------------

const CHECKED = /^The [\w' -]+? casts an? (\d+)(?:st|nd|rd|th)-rank ([A-Z][\w' -]+?) spell, except the duration is unlimited and you can create (delicate or complex objects) by succeeding at an applicable (Crafting) skill check when you activate this ability\.$/;
function withCheckedCreation(plan) {
    const note = (plan?.notes ?? []).find((entry) => CHECKED.test(String(entry).trim()));
    const said = note ? CHECKED.exec(String(note).trim()) : null;
    if (plan?.builtin !== "cast-spell" || !said || plan.spell?.name !== said[2] || Number(plan.rank) !== Number(said[1]) || plan.castDuration?.unit !== "unlimited" || plan.choices) return plan;
    const notes = plan.notes.filter((entry) => entry !== note);
    const one = { spell: plan.spell, rank: plan.rank };
    const checked = { ...one, when: `${said[3].replace(/s$/, "").replace(/objects$/, "object")}: a ${said[4]} check`, castCheck: { statistic: said[4].toLowerCase(), why: `to make it a ${said[3].replace(/ objects$/, " object")}`, dc: null } };
    const { partial, ...rest } = plan;
    return { ...rest, choices: [one, checked], ...(notes.length ? { notes, partial } : { notes: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } }) };
}

// --- A body slain turned to soil, and a summon by its level ----------------------------------------------------------------------------------

const SOILED = [/^You cause the body to decompose into a pile of fertile soil\.$/, /^The creature's body is completely destroyed at the start of your next turn, and it can only be returned to life with the use of powerful magic such as (Miracle) or (Wish)\.$/];
const SOIL_MARK = "decomposed-into-soil";
function withSoiledBody(plan, { activation, index }, item) {
    const sentences = sentencesOf(effectOf(activation.html));
    const gate = readStrikeGate(plainText(activation.html));
    if (!matches(SOILED, sentences) || !gate?.strike?.killed) return plan;
    const [, first, second] = SOILED[1].exec(sentences[1]);
    const text = `Its body decomposes into fertile soil and is wholly destroyed as its slayer's next turn starts; from then on only powerful magic such as ${first} or ${second} can return it to life.`;
    const base = keptBase(plan, item, { activation, index });
    return { ...ownCard({ ...base, targeting: { target: "the creature it killed", range: null, area: null } }, { noteEffects: [{ label: "Decomposed into soil", text, duration: null, rules: [{ key: "RollOption", domain: "all", option: SOIL_MARK }] }] }), atTarget: true, gate: { ...(plan?.gate ?? {}), ...gate }, noteOnly: undefined };
}

const SOIL_SUMMON = /^You cast ([A-Z][\w' -]+?); the spell is heightened to a level equal to one-half of the slain creature's level, rounded up\.$/;
const ROOTED = /^When the spell's duration ends, the [\w' -]+? returns to the soil, where it roots itself and becomes a non-creature piece of flora\.$/;
const BY_SOIL = /^You are adjacent to the body of a creature you killed that has decomposed into soil$/i;
function withSoilSummon(plan, { activation }) {
    const note = (plan?.notes ?? []).find((entry) => SOIL_SUMMON.test(String(entry).trim()));
    if (plan?.builtin !== "cast-spell" || !note || plan.spell?.name !== SOIL_SUMMON.exec(String(note).trim())[1] || !BY_SOIL.test(String(activation.requirements ?? ""))) return plan;
    const rooted = plan.notes.find((entry) => ROOTED.test(String(entry).trim()));
    const notes = plan.notes.filter((entry) => entry !== note && entry !== rooted);
    const lines = ["Target the decomposed body: the spell's rank is half that creature's level, rounded up.", ...(rooted ? ["When the spell ends, the plant roots in that soil as ordinary flora."] : [])];
    const { partial, requirementUnread, ...rest } = plan;
    return { ...rest, castRankBy: { mark: SOIL_MARK, within: 5, half: true, target: "the decomposed body" }, castLines: [...(plan.castLines ?? []), ...lines], ...(notes.length ? { notes, partial } : { notes: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } }) };
}

// --- A weapon's damage type changed till changed again, and a gun that flies on its own ------------------------------------------------------

const RETYPE = [/^You adjust the damage that [\w' -]+? deals before firing\.$/, /^[\w' -]+? ?'s damage type changes to either ((?:\w+, )*\w+,? or \w+) until you change the type again\.$/];
function withDamageTypeWays(plan, { activation, index }, item) {
    const sentences = sentencesOf(effectOf(activation.html));
    if (!unread(plan) || item?.type !== "weapon" || !item.system?.slug || !matches(RETYPE, sentences)) return plan;
    const types = RETYPE[1].exec(sentences[1])[1].split(/,\s*(?:or\s+)?|\s+or\s+/).map((type) => type.trim().toLowerCase()).filter(Boolean);
    const base = keptBase(plan, item, { activation, index });
    const way = (type) => {
        const rules = [{ key: "DamageAlteration", selectors: ["strike-damage"], predicate: [`item:slug:${item.system.slug}`], mode: "override", property: "damage-type", value: type }];
        return { name: type.replace(/^./, (letter) => letter.toUpperCase()), plan: { ...ownCard(base, {}), item: { ...base.item, ruleEffects: [{ name: `${type} damage`, words: `Its Strikes with ${item.name} deal ${type} damage until its type is changed again`, rules, duration: null, replaces: "damage-type" }] } } };
    };
    return { ...base, builtin: "ways", automation: { level: "automatic" }, ways: types.map(way) };
}

const FLYING = [
    /^You leave [\w' -]+? to fire on its own\.$/,
    /^You release the [\w' -]+? and it begins to move independently, flying through the air and firing\.$/,
    /^You still gain the benefits of the gun's (quickstrike) rune while it's moving independently\.$/,
    /^It has a space of 5 feet but doesn't block or impede enemies attempting to move through that space\.$/,
    /^It always remains within (\d+) feet of you and intentionally resists being taken or otherwise moved; all attempts to Grab it fail\.$/,
    /^[\w' -]+? moves this way for (\d+) rounds, after which it returns to your hand\.$/,
    /^If you don't have a free hand to hold it, the gun instead holsters itself on your person\.$/,
    /^While [\w' -]+? is moving independently, you can Sustain the activation to have it make a Strike against a creature\.$/,
    /^It makes a ranged Strike using your attack modifier while wielding it or a \+(\d+) bonus, whichever is higher\.$/,
    /^This attack increases your multiple attack penalty as normal, and the gun uses your multiple attack penalty when determining its attack bonus\.$/,
    /^Since the star gun is constantly moving and attempting to line up the appropriate shot, creatures it targets are Off-Guard to the gun's attacks\.$/
];
function withFlyingGun(plan, { activation, index }, item) {
    const sentences = sentencesOf(effectOf(activation.html));
    if (item?.type !== "weapon" || !item.system?.slug || !matches(FLYING, sentences)) return plan;
    const said = FLYING.map((pattern, at) => pattern.exec(sentences[at]));
    const [feet, rounds, floor] = [Number(said[4][1]), Number(said[5][1]), Number(said[8][1])];
    const own = [`item:slug:${item.system.slug}`];
    const rules = [{ key: "EphemeralEffect", affects: "target", predicate: own, selectors: ["strike-attack-roll", "strike-damage"], uuid: "Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg" }];
    const words = `${item.name} flies and fires on its own for ${rounds} rounds, within ${feet} feet of its user (a 5-foot space that blocks no enemy; it can't be Grabbed, taken or moved), then returns to its user's hand, or holsters itself on them without a free hand. Each Sustain is one ranged Strike with it at a creature: its user's attack modifier with it, or +${floor} if that's higher, with the multiple attack penalty as normal; the creature is Off-Guard to it. Its ${said[2][1]} rune still works`;
    const base = keptBase(plan, item, { activation, index });
    return { ...ownCard(base, {}), item: { ...base.item, ruleEffects: [{ name: "flying on its own", words, rules, duration: { mode: "fixed", value: rounds, unit: "rounds", expiry: "turn-start" }, attackFloor: { value: floor, slug: item.system.slug } }] }, noteOnly: undefined };
}

// --- A candle whose light is a consecrated area -----------------------------------------------------------------------------------------------

const SHEDS = /\bWhen lit, the [\w' -]+? sheds bright light for (\d+) feet and dim light for a further (\d+) feet\./i;
const CONSECRATED = /\bThe area within the [\w' -]+?'s light is a consecrated space\. Worshippers of ([A-Z]\w+) within this area gain a \+(\d+) status bonus to attack rolls, skill checks, saving throws, and Perception checks\. Undead creatures and worshippers of ([A-Z]\w+) within this area take a [–-](\d+) status penalty to those checks\./i;
const LIMN_MARK = "limned-in-candlelight";
// Its light and its area's rules, from the item's own text: { bright, dim, rules, deities } or null.
function candleOf(item) {
    const text = plainText(item?.system?.description?.value);
    const sheds = SHEDS.exec(text);
    const area = CONSECRATED.exec(text);
    if (!sheds || !area) return null;
    const selector = ["attack", "skill-check", "saving-throw", "perception"];
    const deity = (name) => `deity:primary:${name.toLowerCase()}`;
    const rules = [
        { key: "FlatModifier", predicate: [deity(area[1])], selector, slug: `${slugOf(item.name)}-${area[1].toLowerCase()}`, type: "status", value: Number(area[2]) },
        { key: "FlatModifier", predicate: [{ or: [deity(area[3]), "self:mode:undead"] }], selector, slug: `${slugOf(item.name)}-undead`, type: "status", value: -Number(area[4]) }
    ];
    return { bright: Number(sheds[1]), dim: Number(sheds[1]) + Number(sheds[2]), rules, blessed: area[1], foe: area[3], bonus: Number(area[2]), penalty: Number(area[4]) };
}
const CANDLE_LINES = [
    [/\bWhen an undead creature or a haunt comes within the light of an? [\w' -]+?, the candle's flame turns from red to black\b/i, "Its flame turns black, crackling and sparking, while an undead or a haunt is in its light (the GM says when)."],
    [/\bThe candle can't be snuffed by weather, water, or accident but can be purposefully snuffed through ritual prayer\./i, "Weather, water or accident can't snuff it; only its own prayer puts it out (its other activation)."],
    [/\bThe candle doesn't release heat and can't be used to start a fire\. The candle is never exhausted, regardless of how long it burns\./i, "It gives no heat, can't start a fire, and never burns down."]
];
const candleLines = (item) => CANDLE_LINES.filter(([pattern]) => pattern.test(plainText(item?.system?.description?.value))).map(([, line]) => line);

function withConsecratedLight(plan, { activation, index }, item) {
    const candle = candleOf(item);
    if (!unread(plan) || !candle || !/^You light the [\w' -]+?\.$/.test(effectOf(activation.html))) return plan;
    const base = keptBase(plan, item, { activation, index });
    const lines = [`Consecrated: within its light, worshippers of ${candle.blessed} get +${candle.bonus} status to attack rolls, skill checks, saves and Perception; undead and worshippers of ${candle.foe}, −${candle.penalty}.`, ...candleLines(item)];
    return {
        ...base,
        builtin: "zone",
        automation: { level: "automatic" },
        actions: null,
        targeting: { target: null, range: null, area: { type: "emanation", value: candle.dim } },
        zone: { area: { type: "emanation", value: candle.dim }, centre: "self", range: null, lasts: null, untilReused: true, concealed: false, terrain: [], others: false, hazard: null, saves: [], damage: [], effect: null, modifiers: [], inside: [{ rules: candle.rules }], notes: lines },
        ownLight: { bright: candle.bright, dim: candle.dim, duration: null, note: "until it's put out" }
    };
}

const LIT = /^The candle is lit\b/i;
function withPutOut(plan, { activation, index }, item) {
    if (!unread(plan) || !candleOf(item) || !LIT.test(String(activation.requirements ?? "")) || !/^You put out the [\w' -]+? with ritual prayers to [A-Z]\w+\.$/.test(effectOf(activation.html))) return plan;
    const base = keptBase(plan, item, { activation, index });
    return { ...ownCard(base, {}), item: { ...base.item, putsOut: { lingers: { option: LIMN_MARK, duration: MINUTE } } }, gate: { lit: true } };
}

const LIMNED = [
    /^You command the candle to illuminate the dead\.$/,
    /^All (undead) creatures in the area are limned in blue, heatless fire for as long as they remain in the area, plus 1 minute after they leave the area or the light goes out\.$/,
    /^Visible undead can't be Concealed while limned in these flames\.$/,
    /^Invisible undead are concealed while limned in these flames, rather than being undetected\.$/,
    /^Haunts are unaffected by this light\.$/
];
function withLimned(plan, { activation, index }, item) {
    const candle = candleOf(item);
    if (!unread(plan) || !candle || !LIT.test(String(activation.requirements ?? "")) || !matches(LIMNED, sentencesOf(effectOf(activation.html)))) return plan;
    const base = keptBase(plan, item, { activation, index });
    const text = "Limned in blue, heatless fire: while visible it can't be Concealed, and while Invisible it's Concealed rather than Undetected. It lasts while it's in the candle's light, and 1 minute more once it leaves the light (the map's: set this Effect to 1 minute then) or the light goes out.";
    return { ...ownCard({ ...base, targeting: { target: "each undead in the candle's light", range: null, area: { type: "emanation", value: candle.dim } } }, { noteEffects: [{ label: "Limned in blue fire", text, duration: null, rules: [{ key: "RollOption", domain: "all", option: LIMN_MARK }] }] }), atTarget: true, onlyAgainst: { traits: ["undead"] }, gate: { lit: true }, notes: ["Target the undead in the candle's light (haunts aren't affected)."] };
}

// --- A bond with a willing creature ----------------------------------------------------------------------------------------------------------------

const BOND = [
    /^Choose one adjacent willing creature\.$/,
    /^By brushing [\w' -]+? against their body, you form a magical bond with that creature that persists until you activate [\w' -]+? again to form a bond with a different creature\.$/,
    /^While the bond persists, you and the other creature can communicate via telepathy to a distance of (\d+) feet\.$/,
    /^As long as you and the target are on the same plane of existence and are both alive, you each remain aware of the other's state\s*[-–—]\s*you know the other's direction from you, distance from you, and any conditions affecting them\.$/,
    /^If your bonded target becomes ((?:[A-Z][a-z]+, )+or [A-Z][a-z]+), you can use a reaction to attempt to counter the condition affecting the target, which also ends the bond between you and the target\.$/,
    /^The modifier on this counter check is equal to your class DC\s*[-–]\s*10\.$/,
    /^If you fail to counter the condition, that condition also afflicts you, and the bond with the other still ends\.$/
];
function withBond(plan, { activation, index }, item) {
    const sentences = sentencesOf(effectOf(activation.html));
    if (!unread(plan) || !matches(BOND, sentences)) return plan;
    const telepathy = Number(BOND[2].exec(sentences[2])[1]);
    const conditions = BOND[4].exec(sentences[4])[1].split(/,\s*(?:or\s+)?/).map((name) => name.trim().toLowerCase()).filter(Boolean);
    const rank = Math.max(1, Math.ceil((Number(item.system?.level?.value) || 0) / 2));
    return { ...keptBase(plan, item, { activation, index }), builtin: "bond", automation: { level: "automatic" }, targeting: { target: "1 adjacent willing creature", range: "touch", area: null }, bond: { reach: 5, telepathy, conditions, counter: { modifier: "class-dc", rank, failCopies: true } } };
}

// --- A consumable found for the need at hand ------------------------------------------------------------------------------------------------------

const FOUND = [
    /^You pass [\w' -]+? across an adjacent closed container and then open the container\.$/,
    /^Inside, you'll find an? (Common) consumable (alchemical) or (magic) item you need to solve a problem or deal with a situation close at hand\.$/,
    /^For example, if you're badly wounded, you might find an? ([a-z][\w' -]+?)\.$/,
    /^If you've been poisoned, you could discover an? ([a-z][\w' -]+?)\.$/,
    /^If you're faced with a written clue in a language you don't understand, the container might hold an? ([a-z][\w' -]+?)\.$/,
    /^The GM always decides what consumable item is discovered, and it must be equal to or lower than your level\.$/,
    /^If the consumable isn't used within (\d+) (minutes?|rounds?|hours?) of being discovered, the item vanishes\.$/,
    /^If there's no appropriate item to solve your situation, the GM can rule that no object is found; in this case, the daily use of [\w' -]+? is not expended\.$/
];
function withFoundConsumable(plan, { activation, index }, item) {
    const sentences = sentencesOf(effectOf(activation.html));
    if (!unread(plan) || !matches(FOUND, sentences)) return plan;
    const said = FOUND.map((pattern, at) => pattern.exec(sentences[at]));
    const unit = /^min/i.test(said[6][2]) ? "minutes" : /^hour/i.test(said[6][2]) ? "hours" : "rounds";
    const examples = [`badly wounded, a ${said[2][1]}`, `poisoned, a ${said[3][1]}`, `a written clue in a language it can't read, a ${said[4][1]}`];
    return {
        ...keptBase(plan, item, { activation, index }),
        builtin: "found-item",
        automation: { level: "automatic" },
        found: { rarity: said[1][1].toLowerCase(), kinds: ["alchemical", "magical"], maxLevel: "user", vanish: { value: Number(said[6][1]), unit }, refundsNone: true },
        notes: [`Its user passes it over a closed container next to them and opens it. The GM picks what's inside for the trouble at hand (for example: ${examples.join("; ")}).`]
    };
}

// --- A cast at a set DC on a creature of the item's own kind --------------------------------------------------------------------------------------

const SCRY_AS = [
    /^You focus your thoughts, and the [\w' -]+? shows you an image of an? (\w+) who has accepted your rule\.$/,
    /^You must know the \w+'s name or have met them in person\.$/,
    /^This functions as if the [\w' -]+? cast ([A-Z][\w' -]+?) to your specifications\.$/,
    /^The target can resist the [\w ]+? effect with a @Check\[(will|fortitude|reflex)\|dc:(\d+)\] save if they wish\.$/
];
function withScryingAs(plan, { activation, index }, item) {
    // (Its words with the save's @Check kept, which plainText turns into its own words.)
    const plain = sentencesOf(/\bEffect\b\s*(.*)$/s.exec(String(activation.html ?? "").replace(/<[^>]+>/g, " ").replace(/@UUID\[[^\]]+\]\{([^}]*)\}/g, "$1").replace(/\s+/g, " "))?.[1]?.trim() ?? "");
    if (!unread(plan) || !matches(SCRY_AS, plain)) return plan;
    const said = SCRY_AS.map((pattern, at) => pattern.exec(plain[at]));
    const spell = new RegExp(String.raw`@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]+)\]\{${said[2][1]}\}`).exec(String(activation.html ?? ""));
    if (!spell) return plan;
    const base = keptBase(plan, item, { activation, index });
    return {
        builtin: "cast-spell",
        source: base.source,
        spell: { uuid: spell[1], name: said[2][1] },
        rank: null,
        dc: Number(said[3][2]),
        attack: null,
        tradition: null,
        self: false,
        targets: false,
        trigger: base.trigger,
        item: base.item,
        automation: { level: "automatic" },
        castLines: [`Only an ${said[0][1]} who has accepted its user's rule, whose name its user knows or whom it has met.`, `The target may choose not to resist (no ${said[3][1].replace(/^./, (letter) => letter.toUpperCase())} save) if it wishes.`]
    };
}

// The cast's rank from a creature's level (plan.castRankBy): half of it rounded up, at least 1.
export const rankFromLevel = (by, level) => Math.max(1, by?.half ? Math.ceil((Number(level) || 0) / 2) : Number(level) || 1);

// The plan, its entry ({ activation, index }) and item → the plan with the item's own rule built, or the same plan.
export function withUniqueRules(plan, entry, item) {
    if (!entry?.activation) return plan;
    for (const reader of [withFeatUse, withEasierRitual, withOwnAvatar, withAbsorbedBlow, withMended, withCheckedCreation, withSoiledBody, withSoilSummon, withDamageTypeWays, withFlyingGun, withConsecratedLight, withPutOut, withLimned, withBond, withFoundConsumable, withScryingAs]) {
        const next = reader(plan, entry, item);
        if (next !== plan) return next;
    }
    return plan;
}

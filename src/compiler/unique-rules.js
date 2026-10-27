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
// Pure.

import { keptBase, ownCard } from "./triggered.js";
import { plainText } from "./rows.js";

const sentencesOf = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z@(])/).map((sentence) => sentence.trim()).filter(Boolean);
// Its Effect's words: after "Effect", without its Craft Requirements.
const effectOf = (html) => /\bEffect\b\s*(.*)$/s.exec(plainText(html).replace(/\s*\bCraft Requirements\b.*$/s, ""))?.[1]?.trim() ?? "";
const matches = (patterns, sentences) => patterns.length === sentences.length && patterns.every((pattern, at) => pattern.test(sentences[at]));
const MINUTE = { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" };
const hours = (value) => ({ mode: "fixed", value: Number(value), unit: "hours", expiry: "turn-start", anchor: "effect-start" });
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

// The plan, its entry ({ activation, index }) and item → the plan with the item's own rule built, or the same plan.
export function withUniqueRules(plan, entry, item) {
    if (!entry?.activation) return plan;
    for (const reader of [withFeatUse, withEasierRitual, withOwnAvatar]) {
        const next = reader(plan, entry, item);
        if (next !== plan) return next;
    }
    return plan;
}

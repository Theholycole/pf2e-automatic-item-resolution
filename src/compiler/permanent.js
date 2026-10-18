// Permanent items' activations (worn items, weapons, armor, shields, ammunition, containers): PF2e keeps them only as
// text ("Activate—Name [2] (manipulate) / Frequency once per day / Trigger … / Effect …"), so each activation is split
// out and read as its own ability — the ability compiler's reading of its block, then the item readings consumables
// get (the drinker aside: an activation acts for its user). Staves are the spell module's (their spells, charges).
// Pure.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { actionTypeOf, triggerOn } from "./activation.js";
import { othersTargeting, targetedRecipient, allyAreaPlan, castPlan, checkGated, effectLinks, fitPlan, ownPlan, withStatedHealing } from "./consumables.js";
import { castWordsPlan, fillCast } from "./cast-words.js";
import { rollTwiceOver, rollTwicePlan } from "./fortune.js";
import { readiedBonusOver, readiedBonusPlan } from "./readied-bonus.js";
import { rageOver, ragePlan } from "./rage.js";
import { ownCheckOver, ownCheckPlan } from "./own-checks.js";
import { directDamageOver, directDamagePlan, energyChoicePlan, negatingSavePlan } from "./direct-damage.js";
import { readReductions, reductionNotes, reductionPlan } from "./reduce.js";
import { readRecovery, recoveryNotes, recoveryPlan } from "./recovery.js";
import { beadsPlan } from "./beads.js";
import { focusPlan } from "./focus.js";
import { compileStrike, strikeOver } from "./strikes.js";
import { hitAuraPlan } from "./hit-auras.js";
import { rerollOver, rerollPlan } from "./rerolls.js";
import { castMentionOnly, guardText, guardValues } from "./guards.js";
import { withDegreeEffects } from "./degree-effects.js";
import { auraZonePlan, choiceAuraWays } from "./aura-zones.js";
import { ownerDCs, withItemData } from "./item-data.js";
import { itemActionOver, itemActionPlan } from "./item-actions.js";
import { claimedBySpellModule } from "./index.js";
import { allyAreaRow, keepsWounded, noteRow, ownRow, plainText } from "./rows.js";
import { pf2eRulesPlan } from "./pf2e-rules.js";
import { saveOrPlan } from "./save-or.js";
import { spellstrikePlan } from "./spellstrike.js";
import { withPrimedNotes, withWhilePersistent, withZeroHPNote } from "./primed.js";
import { withHitDelivery } from "./hit-delivery.js";
import { withoutFlavor, withoutLater } from "./flavor.js";
import { optionPlan } from "./option-on.js";
import { coveredSquarePlan, raisedAreaPlan, raisedWallsPlan } from "./covered-square.js";
import { perceptionCheckPlan } from "./perception-check.js";
import { readTypeChoice, withRowTypeChoice, withTypeChoices } from "./type-choice.js";
import { readCounteract } from "./counteract.js";
import { pickedSentence, skillPickOf } from "./skill-pick.js";
import { damageMaterial } from "./materials.js";
import { readRuneLoan, runeLoanPlan } from "./rune-loans.js";
import { readUntilRage, untilRagePlan } from "./rage-time.js";

const PERMANENT_TYPES = new Set(["equipment", "weapon", "armor", "shield", "ammo", "backpack"]);
const GLYPHS = { 1: "1", a: "1", 2: "2", d: "2", 3: "3", t: "3", r: "reaction", f: "free" };

// An item whose activations this module reads: a permanent item with an Activate — not a staff, a wand or a spellheart
// (the spell module's: their spells, charges, item casts; its wand readers cover every wand that changes its spell, Wand
// of Widening's kind included), nor a bomb (a consumable weapon: its own card, src/compiler/bombs.js).
// (The spell module claims more by their casts — Searing Blade, Sky Hammer, Dragon's Eye Charm, Trident of the
// Azarketis — and the item spellshapes, Dragon's Breath runes, grimoires: options.claims, the spell module's, leaves them
// to it; handlesItem's.)
const SPELL_MODULE_TRAITS = ["staff", "wand", "spellheart"];
export function handlesPermanent(item, options = {}) {
    return PERMANENT_TYPES.has(item?.type) && !SPELL_MODULE_TRAITS.some((trait) => (item.system?.traits?.value ?? []).includes(trait)) && !(item.type === "weapon" && item.system?.group === "bomb")
        && /<strong>\s*Activat/i.test(String(item.system?.description?.value ?? "")) && !claimedBySpellModule(item, options);
}

const field = (block, name) => {
    const match = new RegExp(String.raw`<strong>\s*${name}\s*</strong>\s*([\s\S]*?)(?=<strong>\s*(?:Activat|Frequency|Trigger|Requirements?|Effect)\b|<hr|$)`, "i").exec(block);
    return match ? plainText(match[1]).replace(/[;.]\s*$/, "").trim() || null : null;
};

// "once per day", "once per hour", "once per 10 minutes", "three times per day" → { max, per, raw }.
export function readFrequency(text) {
    const match = /\b(once|twice|three times|(\d+) times) per (round|turn|minute|10 minutes|hour|day|encounter)\b/i.exec(String(text ?? ""));
    if (!match) return text ? { raw: text } : null;
    const max = match[2] ? Number(match[2]) : { once: 1, twice: 2, "three times": 3 }[match[1].toLowerCase()];
    return { max, per: match[3].toLowerCase().replace(" ", "-"), raw: text };
}

// The item's activations: [{ name, time, traits, frequency, trigger, requirements, html }] — html is its block (its
// Activate line to the next one), which the ability compiler reads as an ability's.
export function splitActivations(html) {
    const text = String(html ?? "");
    const starts = [...text.matchAll(/<strong>\s*Activat(?:e|ion)\b/gi)].map((match) => match.index);
    return starts.map((start, index) => {
        const block = text.slice(start, starts[index + 1] ?? text.length);
        const head = /<strong>\s*Activat(?:e|ion)\s*(?:[—–-]\s*([^<]*?))?\s*<\/strong>([\s\S]*?)(?=<\/p>|<br|<hr|<strong>|$)/i.exec(block);
        const glyph = /<span class="action-glyph">\s*([^<\s]+)\s*<\/span>/i.exec(head?.[2] ?? "")?.[1]?.toLowerCase();
        const words = plainText(head?.[2] ?? "");
        let time = GLYPHS[glyph] ?? /^(\d+\s+(?:minutes?|hours?|rounds?|days?))\b/i.exec(words)?.[1]?.toLowerCase() ?? (/^Cast a Spell\b/i.test(words) ? "cast" : null);
        if (!time && /\b(?:Interact|command|envision)\b/i.test(words)) time = "1";
        const traits = /\(([^)]*)\)/.exec(words)?.[1]?.split(",").map((trait) => trait.trim().toLowerCase()).filter(Boolean) ?? [];
        return {
            name: head?.[1] ? plainText(head[1]) : null,
            time,
            traits,
            frequency: readFrequency(field(block, "Frequency")),
            trigger: field(block, "Trigger"),
            requirements: field(block, "Requirements?"),
            html: block
        };
    });
}

// One activation as an ability for the ability compiler: its block as the description, its own actions.
function asActivationAbility(item, activation) {
    const { actionType, actions } = actionTypeOf(activation.time ?? null);
    return { ...item, name: activation.name ? `${item.name}: ${activation.name}` : item.name, type: "action", system: { ...(item.system ?? {}), description: { value: activation.html }, actionType: { value: actionType }, actions: { value: actions } } };
}

const recipientUser = (item) => ({ ...item, system: { ...(item.system ?? {}), category: "permanent" } });

// Each activation → { activation, plan } (plan null when nothing is read). options: as compileItem's.
// (Each save against its owner's DC as the core's { dc: "owner" }: src/compiler/item-data.js.)
export function compileActivations(item, options = {}) {
    return sharedAttacks(compileEach(item, options)).map((entry) => ({ ...entry, plan: ownerDCs(entry.plan) }));
}

// An activation that makes "an attack …, as described in the rune's other activation" (Swallow-Spike's second): that other
// activation's own attack, at this activation's time and lines.
const OTHER_ACTIVATION = /\bas described in the (?:rune's|item's|armor's|weapon's) other activation\.?\s*$/i;
function sharedAttacks(entries) {
    const attack = entries.find((entry) => entry.plan?.ownCheck?.kind === "attack");
    if (!attack) return entries;
    return entries.map((entry) => {
        if (entry.plan || entry === attack || !OTHER_ACTIVATION.test(plainText(entry.activation.html)) || !/\b(?:attack|Strike)\b/i.test(plainText(entry.activation.html))) return entry;
        const { activation } = entry;
        const source = { ...attack.plan.source, name: attack.plan.source.name.replace(/: .*$/, "") + (activation.name ? `: ${activation.name}` : "") };
        return { ...entry, plan: { ...attack.plan, source, activation: { time: activation.time, traits: activation.traits }, trigger: { event: "use" }, item: { ...attack.plan.item, activation: { index: entry.index, name: activation.name, time: activation.time, frequency: activation.frequency?.max ? activation.frequency : null, trigger: activation.trigger } } } };
    });
}

function compileEach(item, options = {}) {
    if (!handlesPermanent(item, options)) return [];
    // (Its own data in its text first — a weapon's striking and potency runes, src/compiler/item-data.js.)
    const html = withItemData(item.system?.description?.value, item);
    return splitActivations(html).map((found, index) => {
        // (A damage type its user's loading picks, listed after it: compiled without the list, src/compiler/type-choice.js.)
        const typeChoice = readTypeChoice(found.html);
        const activation = typeChoice ? { ...found, html: typeChoice.html } : found;
        // (The activation's own block, its user the recipient: a worn item acts for its wearer, "you".)
        const part = recipientUser({ ...item, system: { ...(item.system ?? {}), description: { value: activation.html } } });
        const base = {
            modelVersion: MODEL_VERSION,
            source: { name: activation.name ? `${item.name}: ${activation.name}` : item.name, slug: item.system?.slug ?? null, uuid: item.uuid ?? null, type: item.type },
            rank: 1,
            traits: [...(item.system?.traits?.value ?? [])],
            activation: { time: activation.time, traits: activation.traits }
        };
        // (A Focus Point for its user, src/compiler/focus.js: the item module's own builtin.)
        // (Spellstrike Ammunition's spell cast into it, src/compiler/spellstrike.js: the module's own card.)
        let plan = focusPlan(activation.html, base) ?? spellstrikePlan(activation.html, base);
        let read = null;
        if (!plan) {
            try {
                read = compileAbility(asActivationAbility(item, activation), options);
                // (Nothing read: once more without its Trigger and Requirements lines, src/compiler/index.js: Catoblepas Maul's "Your
                // last action was a successful Strike".)
                // (Only a resolution it reads that way, not a builtin: a spell its trigger names isn't cast.)
                const triggerless = String(activation.html).replace(/<p>\s*<strong>\s*(?:Trigger|Requirements?)\s*<\/strong>[\s\S]*?<\/p>/gi, "");
                if (!read || read.builtin === "no-effect") {
                    const retry = compileAbility(asActivationAbility(item, { ...activation, html: triggerless }), options);
                    if (retry && !retry.builtin) read = retry;
                }
                // (Nothing read still: once more without its Effect's opening flavor, src/compiler/flavor.js.)
                for (const bare of new Set([withoutFlavor(activation.html), withoutFlavor(triggerless)])) {
                    if ((read && read.builtin !== "no-effect") || bare === activation.html || bare === triggerless) continue;
                    const retry = compileAbility(asActivationAbility(item, { ...activation, html: bare }), options);
                    if (retry && !retry.builtin) read = retry;
                }
                // (Nothing read still: once more without what waits for something later, its words the plan's notes, src/compiler/flavor.js.)
                const later = !read || read.builtin === "no-effect" ? withoutLater(triggerless) : null;
                if (later) {
                    const retry = compileAbility(asActivationAbility(item, { ...activation, html: later.html }), options);
                    if (retry && !retry.builtin && retry.resolution) read = { ...retry, notes: [...(retry.notes ?? []), ...later.notes], partial: true };
                }
            } catch {
                read = null;
            }
            // (A spell only named as an example isn't cast: src/compiler/guards.js.)
            if (castMentionOnly(read, activation.html)) read = null;
            const own = read?.builtin === "no-effect" ? ownPlan(part, base, options) : null;
            plan = own ?? (read ? fitPlan(part, read, base, options) : ownPlan(part, base, options));
        }
        // (A note alone from the ability compiler gives way to the item's own row when that reads something: Silkspinner's Shield's
        // climb Speed.)
        if (plan?.noteOnly) {
            const row = rowPlanFor(part, base);
            if (row && !row.noteOnly) plan = row;
        }
        if (!plan && options.spellEffects) plan = castPlan(part);
        // (A cast in other words, by the spell's name: src/compiler/cast-words.js.)
        if ((!plan || plan.noteOnly) && options.spells) plan = castWordsPlan(part, options) ?? plan;
        // (The ability compiler's cast, with what its words say and it left out: on its user, a DC, a modifier.)
        plan = fillCast(plan, activation.html, options);
        if (!plan) plan = rowPlanFor(part, base);
        // (A Strike with riders, src/compiler/strikes.js: Duelist's Beacon.)
        plan = strikeOver(plan, compileStrike(part, base, options));
        // (A wound that makes the creature hit give off an aura, src/compiler/hit-auras.js: Ghoul Stiletto's stench.)
        plan = hitAuraPlan(activation.html, base, part, options) ?? plan;
        // (A reroll of the roll that triggered it, src/compiler/rerolls.js: Starfaring Cloak.)
        plan = rerollOver(plan, rerollPlan(activation.html, base));
        // (Its user's next roll of a kind rolled twice, src/compiler/fortune.js: Sunweave.)
        plan = rollTwiceOver(plan, rollTwicePlan(plainText(activation.html), base, { trigger: activation.trigger }));
        // (A bonus for a moment, src/compiler/readied-bonus.js: Sparkwarden.)
        plan = readiedBonusOver(plan, readiedBonusPlan(plainText(activation.html), base, { trigger: activation.trigger }));
        // (A Rage with more temporary Hit Points, src/compiler/rage.js: Instinct Crowns.)
        plan = rageOver(plan, ragePlan(plainText(activation.html), base));
        // (A skill action taken with it, src/compiler/item-actions.js: Bronze Bull Pendant's Shove.)
        plan = itemActionOver(plan, itemActionPlan(activation.html, base, { ...options, item }));
        // (A check with the item's own modifier, src/compiler/own-checks.js: Tentacle Cannon's Grapple at +13.)
        plan = ownCheckOver(plan, ownCheckPlan(plainText(activation.html), base, options));
        // (Damage outright to the creature it names, src/compiler/direct-damage.js: Forge Warden's.)
        // (A save plan one save can't hold goes first, src/compiler/guards.js, so the target's outright part can be read.)
        plan = guardValues(directDamageOver(guardText(plan, plainText(activation.html)), directDamagePlan(plainText(activation.html), base, { item })));
        // (A row's own linked Effect, src/compiler/degree-effects.js: Cape of Justice's Enact Justice failure.)
        plan = withDegreeEffects(plan, activation.html, options.itemEffects);
        // (What a failed save primes for later, and what its damage dropping the creature does: notes, src/compiler/primed.js.)
        plan = withZeroHPNote(withPrimedNotes(plan, plainText(activation.html)), plainText(activation.html));
        // (Healing its text gives its user beside a linked Effect, src/compiler/consumables.js: Kindler Cameo.)
        plan = withStatedHealing(plan, activation.html, html);
        plan = withWhilePersistent(plan, plainText(activation.html));
        // (A poison or curse its hit gives, src/compiler/hit-delivery.js: Lionfish Spear's at the creature hit, Alghollthu Lash's on its next.)
        plan = withHitDelivery(plan, plainText(activation.html), { trigger: activation.trigger, itemType: item.type });
        // (Damage of its user's choice of two types, each row giving both: the card's picker, src/compiler/type-choice.js.)
        plan = withRowTypeChoice(plan, plainText(activation.html));
        // (An aura's save as it's made and on entering, its damage type picked: the ways card, a zone for each type — Bloodburn Censer.)
        plan = choiceAuraWays(plan, activation, base, { withWhile: (entry) => withWhilePersistent(entry, plainText(activation.html)) }) ?? plan;
        // (An aura that acts at a turn's start or end in it, for a while, src/compiler/aura-zones.js: Arctic Worm Chitin Shield, Alluring
        // Lantern, Sandstorm Top — over a save at the creatures targeted once.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect" || plan.resolution?.kind === "save") plan = auraZonePlan(activation.html, base, base.source?.name) ?? plan;
        // (Damage a successful save negates, src/compiler/direct-damage.js: Mycoweave Shield's spores.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = negatingSavePlan(plainText(activation.html), base) ?? plan;
        // (Damage of the energy its maker chose, the card's picker: Energy-Absorbing runes.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = energyChoicePlan(plainText(activation.html), base, plainText(html)) ?? plan;
        // (What it gives its user and allies in an area, src/compiler/rows.js: Knight Captain's Lance.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = allyAreaPlan(plainText(activation.html), base, allyAreaRow(plainText(activation.html))) ?? plan;
        // (An Effect behind a check the text opens with: only on its success, a note.)
        plan = checkGated(plan, plainText(activation.html));
        // (A condition it lowers on its user, src/compiler/reduce.js: Coin of Comfort; a plan of its own when it's all.)
        const reduce = readReductions(plainText(activation.html));
        if ((!plan || plan.builtin === "no-effect") && reduce.length) plan = reductionPlan(base, reduce, reductionNotes(plainText(activation.html)));
        // (With a note alone, the note is the rest of it.)
        else if (reduce.length && plan.noteOnly) {
            const { noteOnly, ...rest } = plan;
            plan = { ...rest, partial: true };
        }
        // (A bead that detonates as a Fireball of the dice it says, src/compiler/beads.js: Necklace of Fireballs.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = beadsPlan(item?.system?.description?.value, base) ?? plan;
        // (A flat check to end persistent damage at once, src/compiler/recovery.js: Ring of Torag.)
        const recovery = readRecovery(plainText(activation.html));
        if (recovery && !plan) plan = recoveryPlan(base, recoveryNotes(plainText(activation.html)));
        else if (recovery && plan.noteOnly) {
            const { noteOnly, ...rest } = plan;
            plan = { ...rest, partial: true };
        }
        // (A condition until the end of its user's rage, src/compiler/rage-time.js: Barbarians+ crowns.)
        // (Only when nothing else is read: Instinct Crown (Fury)'s PF2e Effect does it already.)
        const rageRead = readUntilRage(plainText(activation.html), item);
        const untilRage = rageRead && (!plan || plan.noteOnly) ? rageRead : null;
        if (untilRage) plan = untilRagePlan(base, untilRage.notes);
        // (A weapon lent a property rune for a while, src/compiler/rune-loans.js.)
        const runeItem = { ...item, system: { ...(item.system ?? {}), description: { value: activation.html } } };
        const rune = readRuneLoan(plainText(activation.html), runeItem);
        if (rune && (!plan || plan.noteOnly)) plan = runeLoanPlan(base);
        // (A creature's Perception check against the item's DC, src/compiler/perception-check.js: Mercurial Mantle's Cunning Dodge.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = perceptionCheckPlan(activation.html, base, item, options) ?? plan;
        // (A square it covers for a while, with a save on entering, src/compiler/covered-square.js: Spider Gun's Web Shot.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = coveredSquarePlan(activation.html, base, item, options) ?? plan;
        // (Walls it raises, with a save in their space, src/compiler/covered-square.js: Alkenstar Phalanx — over the save read alone.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect" || plan.resolution?.kind === "save") plan = raisedWallsPlan(activation.html, base, item, options) ?? plan;
        // (An area of stalagmites it raises for a while, src/compiler/covered-square.js: Stoneraiser Javelin.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = raisedAreaPlan(activation.html, base, item, options) ?? plan;
        // (A save or a result no row holds — death, a push, a pull to its user — src/compiler/save-or.js: Vorpal, Hauling.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = saveOrPlan(activation.html, base) ?? plan;
        // (Activated ammunition whose own PF2e rules do it, src/compiler/pf2e-rules.js: Elemental Ammunition.)
        if (!plan || plan.strike?.fromNotes) plan = pf2eRulesPlan(item, base, plainText(activation.html)) ?? plan;
        // (A counteract on its user, src/compiler/counteract.js — Heartstone's "attempts to counteract one disease affecting you": the
        // consumables' counteract card.)
        const counteract = readCounteract(activation.html, { level: item.system?.level?.value });
        if ((!plan || plan.noteOnly || plan.builtin === "no-effect") && counteract) plan = { ...base, builtin: "counteract", automation: { level: "automatic" }, targeting: counteract.within ? { target: "1 creature", range: counteract.within, area: null } : { target: "the drinker", range: null, area: null }, trigger: { event: "use" } };
        // (One of the item's own PF2e toggles, named as the activation is, switched on for a while: src/compiler/option-on.js.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = optionPlan(item, activation, base) ?? plan;
        if (!plan) return { activation, plan: null, index };
        plan = damageMaterial(withTypeChoices(plan, typeChoice), plainText(activation.html));
        // (A skill its user picked when the item was made, named in the item's own text, src/compiler/skill-pick.js: Words of Wisdom's
        // phrase — the card's picker; what it reads off the unread list, and the plan whole again when that was all.)
        const skillPick = skillPickOf(plainText(html), plainText(activation.html), plan);
        if (skillPick) {
            const unread = (plan.unread ?? []).filter((sentence) => !pickedSentence(sentence));
            const whole = !unread.length;
            const success = plan.resolution?.outcomes?.success;
            plan = { ...plan, ...(whole ? { automation: { level: "automatic" } } : { unread }), ...(whole && success ? { resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...success, noteEffects: [] } } } } : {}) };
            if (whole) {
                delete plan.partial;
                delete plan.unread;
            }
        }
        const frequency = activation.frequency?.max ? activation.frequency : null;
        const { resist, speeds, senses, light, levelTemp, weapon, strikeDamage, suppress, coats, coatLasts, ...kept } = plan;
        // (Granted to the creatures the presser targets: who and how far, for the simulator.)
        const others = targetedRecipient(plan, plainText(activation.html));
        return {
            activation,
            index,
            plan: {
                ...kept,
                ...(others ? { targeting: { ...(kept.targeting ?? {}), ...othersTargeting(plainText(activation.html)) } } : {}),
                ...(plan.trigger || frequency ? { trigger: { ...(plan.trigger ?? {}), ...(frequency ? { frequency } : {}) } } : {}),
                // ("drinker": a creature it heals other than its user, "a willing, living, adjacent creature" — chosen on the card.)
                // (Its Trigger's words, and what they're read as: src/compiler/activation.js triggerOn.)
                item: { type: item.type, level: Number(item.system?.level?.value) || 0, recipient: others ? "targets" : plan.otherRecipient ? "drinker" : "user", activation: { index, name: activation.name, time: activation.time, frequency, trigger: activation.trigger, ...(activation.trigger ? { triggerOn: triggerOn(activation.trigger) } : {}) }, links: effectLinks(part).length, ...(reduce.length ? { reduce } : {}), ...(resist ? { resist } : {}), ...(speeds ? { speeds } : {}), ...(senses ? { senses } : {}), ...(light ? { light } : {}), ...(levelTemp ? { levelTemp } : {}), ...(weapon ? { weapon } : {}), ...(strikeDamage ? { strikeDamage } : {}), ...(suppress ? { suppress } : {}), ...(skillPick ? { skillPick } : {}), ...(recovery ? { recovery } : {}), ...(rune ? { rune } : {}), ...(untilRage ? { untilRage: { conditions: untilRage.conditions } } : {}), ...(counteract && plan.builtin === "counteract" ? { counteract } : {}), ...(keepsWounded(plainText(activation.html)) ? { keepWounded: true } : {}), ...(coats ? { delivery: "injury", coats, ...(coatLasts ? { coatLasts } : {}) } : {}) }
            }
        };
    });
}

// The activation's own row or note (rows.js), as the consumables' automatic row.
function rowPlanFor(item, base) {
    const row = ownRow(item);
    const partial = Boolean(row?.unread?.length);
    const note = !row || partial ? noteRow(item) : null;
    if (!row && !note) return null;
    return {
        ...base,
        automation: { level: row && !partial ? "automatic" : "guided" },
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: row?.effects ?? [], modifiers: row?.modifiers ?? [], noteEffects: note?.noteEffects ?? [] } } },
        ...(!row ? { noteOnly: true } : {}),
        ...(partial ? { partial: true, unread: row.unread } : {}),
        ...(row?.other ? { otherRecipient: true } : {}),
        // (Its resistance: the item card's own Effect, as plan.item.resist.)
        ...(row?.resistances ? { resist: row.resistances } : {}),
        // (A Speed of a new kind, the same: plan.item.speeds.)
        ...(row?.speeds ? { speeds: row.speeds } : {}),
        ...(row?.senses ? { senses: row.senses } : {}),
        ...(row?.light ? { light: row.light } : {}),
        ...(row?.levelTemp ? { levelTemp: row.levelTemp } : {}),
        // (A change to its user's weapon, the same: plan.item.weapon; extra damage on its Strikes, plan.item.strikeDamage.)
        ...(row?.weapon ? { weapon: row.weapon } : {}),
        ...(row?.strikeDamage ? { strikeDamage: row.strikeDamage } : {}),
        ...(row?.suppress ? { suppress: row.suppress } : {})
    };
}

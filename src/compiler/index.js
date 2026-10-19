// The item compiler: PF2e's items as plans for the resolution core. Pure:
// Node, Web Workers and Foundry.
//
// A consumable's text is read by the ability module's compiler (its saves,
// afflictions, PF2e effects and zones), as an action with the item's own
// activation; src/compiler/consumables.js adds what the item's own data says
// (the drinker, PF2e's healing roll, its linked Effect). Spell-casting items
// (scrolls, wands, catalysts, spell gems) stay with the spell module:
// handlesItem() leaves them out.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { readActivations } from "./activation.js";
import { asAbility } from "./ability-shape.js";
import { othersTargeting, targetedRecipient, allyAreaPlan, checkGated, fitPlan, ownPlan, pf2eRoll, recipientOf, withStatedHealing } from "./consumables.js";
import { allyAreaRow, keepsWounded, noteRow, ownRow, plainText } from "./rows.js";
import { isSnare, snareChoices, snareThen, snareZone } from "./snares.js";
import { auraZonePlan } from "./aura-zones.js";
import { belchedCloudPlan, coatedSquarePlan, exhaledSquarePlan, placedChimePlan } from "./covered-square.js";
import { compileStrike, strikeOver } from "./strikes.js";
import { rerollOver, rerollPlan } from "./rerolls.js";
import { castMentionOnly, guardText, guardValues } from "./guards.js";
import { withDegreeEffects } from "./degree-effects.js";
import { readTypeChoice, withTypeChoices } from "./type-choice.js";
import { castWordsPlan, fillCast } from "./cast-words.js";
import { rollTwiceOver, rollTwicePlan } from "./fortune.js";
import { readiedBonusOver, readiedBonusPlan } from "./readied-bonus.js";
import { rageOver, ragePlan } from "./rage.js";
import { ownCheckOver, ownCheckPlan } from "./own-checks.js";
import { spellgunPlan } from "./spellguns.js";
import { readRuneLoan, runeLoanPlan } from "./rune-loans.js";
import { directDamageOver, directDamagePlan, retaliationPlan } from "./direct-damage.js";
import { readReductions, reductionNotes, reductionPlan } from "./reduce.js";
import { readRecovery, recoveryNotes, recoveryPlan } from "./recovery.js";
import { itemActionOver, itemActionPlan } from "./item-actions.js";
import { readTeaCeremony } from "./tea.js";
import { readCounteract } from "./counteract.js";
import { ownerDCs, withItemData } from "./item-data.js";
import { overUnverified, withoutUnverifiedLinks } from "./unverified-links.js";
import { affixedTargeting, withPrimedNotes, withWhilePersistent, withZeroHPNote } from "./primed.js";
import { withHitDelivery } from "./hit-delivery.js";
import { cleanNotes } from "./notes.js";
import { thrownPlan } from "./thrown.js";
import { conjuredPlan } from "./conjured.js";
import { GENERIC_SPELLGUN, MODULE_ID, loadedPlan } from "./generic-spellgun.js";
import { saveOrPlan } from "./save-or.js";
import { withoutFlavor } from "./flavor.js";
import { damageMaterial } from "./materials.js";
import { waysPlan } from "./ways.js";
import { firstDegreeOf, firstDegreeSentence } from "./first-degree.js";
import { readRestore, restoreNotes, restorePlan } from "./restore.js";

export { readActivations, actionTypeOf } from "./activation.js";
export { itemDuration, noteRow, ownRow, plainText } from "./rows.js";
export { isSnare, snareZone } from "./snares.js";
export { spellIndex } from "./cast-words.js";
export { castPlan, effectLinks, fitPlan, grantedSpells, nativeHealing, ownPlan, pf2eRoll, recipientOf, spellEffectApplications } from "./consumables.js";

// The consumable categories the spell module resolves (the user's split, 2026-10-10).
export const SPELL_MODULE_CATEGORIES = Object.freeze(["scroll", "wand", "catalyst", "spell-gem"]);

// An item this module compiles: a consumable outside the spell module's categories, and not a catalyst by its trait
// either (20 of PF2e's 107 catalysts are filed as "other": Void Salts, Irritating Seedpod — the spell module's too).
// options.claims: the spell module's claims(item) when it's there (its api in Foundry, its src/compiler/item-claims.js in
// Node) — an item it acts on (Djezet Dose's spellshape) is left to it. Without it, the categories and trait alone.
export function handlesItem(item, options = {}) {
    return item?.type === "consumable" && !SPELL_MODULE_CATEGORIES.includes(item.system?.category) && !(item.system?.traits?.value ?? []).includes("catalyst") && !claimedBySpellModule(item, options);
}

// The spell module's claims (options.claims), false when it isn't given or fails.
export function claimedBySpellModule(item, { claims = null } = {}) {
    if (typeof claims !== "function") return false;
    try {
        return claims(item) === true;
    } catch {
        return false;
    }
}

export { asAbility } from "./ability-shape.js";

// One item → a plan, { builtin }, or null.
// options: the ability compiler's (basicActions, actor) and spellEffects, PF2e's spell Effects by spell name in lower case
// ({ "haste": { uuid, name } }; spellEffectIndex() builds it from the spell-effects pack's items); claims, the spell
// module's (handlesItem).
// (Each save against its owner's DC as the core's { dc: "owner" }: src/compiler/item-data.js.)
// (A third-party module's own Effect its text doesn't bear out: the text read instead, when that reads to more than a note,
// src/compiler/unverified-links.js.)
export function compileItem(given, options = {}) {
    const unlinked = withoutUnverifiedLinks(given, options);
    const instead = unlinked ? overUnverified(compileOne(unlinked.item, options), unlinked.dropped, given?.system?.description?.value) : null;
    return ownerDCs(instead ?? compileOne(given, options));
}

function compileOne(given, options = {}) {
    if (!handlesItem(given, options)) return null;
    // (The generic spellgun: the plan of the spell loaded into it, src/compiler/generic-spellgun.js; none until one is.)
    if (given?.flags?.[MODULE_ID]?.[GENERIC_SPELLGUN]) {
        const loaded = loadedPlan(given);
        return loaded ? { ...loaded, source: { ...loaded.source, name: given.name, slug: given.system?.slug ?? null, uuid: given.uuid ?? null, type: given.type }, item: { ...itemInfo(given), recipient: "user" } } : null;
    }
    // (Its own data in its text first — "@item.level", a rune — and a damage-with-a-save as basic, src/compiler/item-data.js.)
    // (A damage type its user picks, listed in the text, src/compiler/type-choice.js: compiled without the list, the card's picker.)
    const itemHtml = withItemData(given?.system?.description?.value, given);
    const typeChoice = readTypeChoice(itemHtml);
    const html = typeChoice ? typeChoice.html : itemHtml;
    const item = html === given?.system?.description?.value ? given : { ...given, system: { ...given.system, description: { ...(given.system?.description ?? {}), value: html } } };
    // (Nothing read: once more without its Trigger line, which only says when to use it — Putrescent Glob's "You damage a creature
    // that is Sickened 1 with a Strike" keeps the ability compiler from its effect.)
    const firstRead = compileAbility(asAbility(item), options);
    // (Only a resolution it reads that way, not a builtin: a spell its trigger names isn't cast — Shadowpiercer's darkness.)
    const retry = !firstRead || firstRead.builtin === "no-effect" ? compileAbility(asAbility(withoutTrigger(item)), options) : null;
    let abilityRead = retry && !retry.builtin ? retry : firstRead;
    // (Nothing read still: once more without its Effect's opening flavor, src/compiler/flavor.js.)
    for (const bare of new Set([withoutFlavor(html), withoutFlavor(withoutTrigger(item).system?.description?.value)])) {
        if ((abilityRead && abilityRead.builtin !== "no-effect") || bare === html || bare === withoutTrigger(item).system?.description?.value) continue;
        const flavorless = compileAbility(asAbility({ ...item, system: { ...item.system, description: { ...(item.system?.description ?? {}), value: bare } } }), options);
        if (flavorless && !flavorless.builtin) abilityRead = flavorless;
    }
    // (A spell only named as an example isn't cast: src/compiler/guards.js.)
    const read = castMentionOnly(abilityRead, html) ? null : abilityRead;
    const base = basePlan(item);
    // (A snare whose damage type its crafter chose, src/compiler/snares.js: Striking Snare's stones or spikes — the ways card's
    // pick, each way the snare's zone, the card closed once one is placed.)
    const chosen = isSnare(item) ? snareChoices(html) : null;
    if (chosen) {
        const ways = chosen.map(({ name, html: wayHtml }) => ({ name, html: wayHtml, plan: compileOne({ ...given, system: { ...given.system, description: { ...(given.system?.description ?? {}), value: wayHtml } } }, options) }));
        if (ways.every((way) => way.plan?.builtin === "zone")) return { ...base, builtin: "ways", once: true, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways, item: itemInfo(item) };
    }
    // (A snare that leaves an area where it was, src/compiler/snares.js: Smoke Screen Snare's smoke — the ability module's zone.then.)
    const leaves = snareThen(item, base);
    if (leaves) return { ...leaves, item: itemInfo(item) };
    // (A snare: the ability module's zone, set off once by the first creature to enter its square.)
    const snare = snareZone(item, read);
    // (Its condition for as long as a persistent damage lasts: Freezing Embrace Snare's clumsy.)
    if (snare) return withWhilePersistent({ ...snare, item: itemInfo(item) }, plainText(item?.system?.description?.value));
    // (An aura that acts at a turn's start or end in it, for a while, src/compiler/aura-zones.js: Noisome Garum's stench.)
    const aura = auraZonePlan(html, base, item.name);
    if (aura) return { ...aura, item: itemInfo(item) };
    // (A square its user coats for a while, src/compiler/covered-square.js: Colorful Coating's.)
    const coated = coatedSquarePlan(html, base, item, options);
    if (coated) return { ...coated, item: itemInfo(item) };
    // (A chime placed within reach that troubles only some creatures around it, src/compiler/covered-square.js: Aetheric Irritant.)
    const chime = placedChimePlan(html, base, item, options);
    if (chime) return { ...chime, item: itemInfo(item) };
    // (A square that harms only some creatures, src/compiler/covered-square.js: Sanctified Beans' vapors.)
    const exhaled = exhaledSquarePlan(html, base, item, options);
    if (exhaled) return { ...exhaled, item: itemInfo(item) };
    // (A cloud its user breathes into an adjacent square, src/compiler/covered-square.js: Capsaicin Tonic's.)
    const belched = belchedCloudPlan(html, base);
    if (belched) return { ...belched, item: itemInfo(item) };
    // (The ability compiler's last fallback, "no-effect" — the GM's — gives way to a reading of the item's own: its
    // linked Effect, PF2e's healing, a spell's Effect, its row; not to a note alone.)
    const own = read?.builtin === "no-effect" ? ownPlan(item, base, options) ?? rowPlan(item, base) : null;
    let plan = own && !own.noteOnly ? own : (read ? fitPlan(item, read, base, options) : ownPlan(item, base, options)) ?? rowPlan(item, base);
    // (A save only for a drinker of some kind, Elysian Dew's "If you're unholy and drink this potion, it fails to work, and you must
    // succeed at a … save": the item's own linked Effect, that sentence a note.)
    const kinded = plan?.resolution?.kind === "save" ? KIND_GATED.exec(plainText(html))?.[0]?.replace(/@Check\[(fortitude|reflex|will)\|dc:(\d+)[^\]]*\](?:\{[^}]*\})?/gi, (_all, statistic, dc) => `DC ${dc} ${statistic[0].toUpperCase()}${statistic.slice(1).toLowerCase()}`) : null;
    const linked = kinded ? ownPlan(item, base, options) : null;
    if (linked?.resolution?.kind === "effect") plan = { ...linked, automation: { level: "guided" }, notes: [...(linked.notes ?? []), kinded] };
    // (A note alone from the ability compiler gives way to the item's own row when that reads something.)
    if (plan?.noteOnly) {
        const row = rowPlan(item, base);
        if (row && !row.noteOnly) plan = row;
    }
    // (Used in one of several ways, each its own Activate block, src/compiler/ways.js: Toadskin Salve's reactions — over nothing, a note
    // or a reading of only part of it.)
    if (!plan || plan.noteOnly || plan.partial || plan.builtin === "no-effect") plan = waysPlan(item, base, options) ?? plan;
    // (An item thrown as a Strike that PF2e can't roll, src/compiler/thrown.js: Sack of Rotten Fruit, Life Salt, Oil.)
    if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = thrownPlan(html, base, item, options) ?? plan;
    // (A creature it becomes, src/compiler/conjured.js: Beetle Gel, Marvelous Miniature (Horse).)
    plan = conjuredPlan(html, base, item) ?? plan;
    // (A cast in other words, by the spell's name: src/compiler/cast-words.js.)
    if ((!plan || plan.noteOnly) && options.spells) plan = castWordsPlan(item, options) ?? plan;
    // (The ability compiler's cast, with what its words say and it left out: on its user, a DC, a modifier.)
    plan = fillCast(plan, item?.system?.description?.value, options);
    // (A Strike with riders, src/compiler/strikes.js: Fear Gem.)
    plan = strikeOver(plan, compileStrike(item, base, options));
    // (A reroll of the roll that triggered it, src/compiler/rerolls.js: Lucky Rabbit's Foot.)
    plan = rerollOver(plan, rerollPlan(item?.system?.description?.value, base));
    // (Its user's next roll of a kind rolled twice, src/compiler/fortune.js: Gorum's Tear.)
    plan = rollTwiceOver(plan, rollTwicePlan(plainText(item?.system?.description?.value), base));
    // (A bonus for a moment, src/compiler/readied-bonus.js: Conrasu Coin.)
    plan = readiedBonusOver(plan, readiedBonusPlan(plainText(item?.system?.description?.value), base));
    // (A Rage with more temporary Hit Points, src/compiler/rage.js.)
    plan = rageOver(plan, ragePlan(plainText(item?.system?.description?.value), base));
    // (A skill action taken with it, src/compiler/item-actions.js: Onyx Panther's Sneak.)
    plan = itemActionOver(plan, itemActionPlan(item?.system?.description?.value, base, { ...options, item }));
    // (A check with the item's own modifier, src/compiler/own-checks.js.)
    plan = ownCheckOver(plan, ownCheckPlan(plainText(item?.system?.description?.value), base, options));
    // (A spellgun's attack with its user's spell or firearm attack modifier, src/compiler/spellguns.js — over any other reading:
    // Bewildering Spellgun's attack isn't the Will save its success row names.)
    plan = spellgunPlan(item?.system?.description?.value, base) ?? plan;
    // (Damage outright to the creature it names, src/compiler/direct-damage.js: Murderer's Knot.)
    // (A save plan one save can't hold goes first, src/compiler/guards.js, so the target's outright part can be read.)
    plan = directDamageOver(guardText(plan, plainText(item?.system?.description?.value)), directDamagePlan(plainText(item?.system?.description?.value), base, { item }));
    // (A counteract on the drinker, src/compiler/counteract.js: its own card; with another reading, beside its card.)
    const counteracting = readCounteract(item?.system?.description?.value, { level: item?.system?.level?.value });
    if ((!plan || plan.noteOnly || plan.builtin === "no-effect") && counteracting) {
        // (A spell on a creature nearby: that creature, within that distance.)
        plan = { ...base, builtin: "counteract", automation: { level: "automatic" }, targeting: counteracting.within ? { target: "1 creature", range: counteracting.within, area: null } : { target: "the drinker", range: null, area: null }, trigger: { event: "use" } };
    }
    // (A save or a result no row holds — death, a push, a pull to its user — src/compiler/save-or.js.)
    if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = saveOrPlan(item?.system?.description?.value, base) ?? plan;
    // (Damage to a creature that touches its drinker, for the item's time, src/compiler/direct-damage.js: Potion of Fire Retaliation.)
    if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = retaliationPlan(plainText(item?.system?.description?.value), base) ?? plan;
    // (What it gives its user and allies in an area, src/compiler/rows.js.)
    if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = allyAreaPlan(plainText(item?.system?.description?.value), base, allyAreaRow(plainText(item?.system?.description?.value))) ?? plan;
    // (An Effect behind a check the text opens with: only on its success, a note.)
    plan = checkGated(plan, plainText(item?.system?.description?.value));
    // (A condition it lowers on its user or drinker, src/compiler/reduce.js: Lion Badge; a plan of its own when it's all.)
    const reduce = readReductions(plainText(item?.system?.description?.value));
    if (!plan && reduce.length) plan = reductionPlan(base, reduce, reductionNotes(plainText(item?.system?.description?.value)));
    // (With a note alone, the note is the rest of it: Serene Smelling Salts' immunity beside its lowered frightened.)
    else if (reduce.length && plan.noteOnly) plan = { ...withoutNoteOnly(plan), partial: true };
    // (A flat check to end persistent damage at once, src/compiler/recovery.js: Quenching Potion; with a note alone, the note
    // is the rest of it.)
    const recovery = readRecovery(plainText(item?.system?.description?.value));
    if (recovery && !plan) plan = recoveryPlan(base, recoveryNotes(plainText(item?.system?.description?.value)));
    else if (recovery && plan.noteOnly) plan = { ...withoutNoteOnly(plan), partial: true };
    // (Restored to its maximum Hit Points and rid of afflictions, src/compiler/restore.js: Elixir of Rejuvenation; with a note alone,
    // the note is the rest of it.)
    if (readRestore(plainText(item?.system?.description?.value))) plan = !plan ? restorePlan(base, restoreNotes(plainText(item?.system?.description?.value))) : plan.noteOnly ? { ...withoutNoteOnly(plan), partial: true } : plan;
    // (A weapon lent a property rune for a while, src/compiler/rune-loans.js: Burial Oil; a note alone gives way to it.)
    const rune = readRuneLoan(plainText(item?.system?.description?.value), item);
    if (rune && (!plan || plan.noteOnly)) plan = runeLoanPlan(base);
    if (!plan) return null;
    // (What a failed save primes for later, a note Effect from those rows; a fulu's affixed creature, src/compiler/primed.js.)
    plan = affixedTargeting(withZeroHPNote(withPrimedNotes(plan, plainText(item?.system?.description?.value)), plainText(item?.system?.description?.value)), plainText(given?.system?.description?.value));
    // (Healing its text gives its user beside a linked Effect, when PF2e's data has none: Wine of the Blood.)
    plan = withStatedHealing(plan, item?.system?.description?.value);
    // (A condition for as long as a persistent damage lasts: Freezing Embrace Snare's clumsy, src/compiler/primed.js.)
    plan = withWhilePersistent(plan, plainText(item?.system?.description?.value));
    // (A poison its hit gives, src/compiler/hit-delivery.js: Viper's Fang's venom on its Strike's hit.)
    plan = withHitDelivery(plan, plainText(item?.system?.description?.value), { trigger: /\bTrigger\s+(.+?)(?:\s+(?:Requirements?|Effect)\b|$)/s.exec(plainText(item?.system?.description?.value))?.[1] ?? null, itemType: item.type });
    const source = plan.source ? { ...plan.source, type: item.type, uuid: item.uuid ?? plan.source.uuid ?? null } : plan.source;
    const { resist, speeds, senses, light, levelTemp, weapon, strikeDamage, firstDegree, suppress, coats, coatLasts, ...rest } = plan;
    const info = { ...itemInfo(item), ...(resist ? { resist } : {}), ...(speeds ? { speeds } : {}), ...(senses ? { senses } : {}), ...(light ? { light } : {}), ...(levelTemp ? { levelTemp } : {}), ...(weapon ? { weapon } : {}), ...(strikeDamage ? { strikeDamage } : {}), ...(firstDegree ? { firstDegree } : {}), ...(suppress ? { suppress } : {}), ...(coats ? { delivery: "injury", coats, ...(coatLasts ? { coatLasts } : {}) } : {}) };
    // (A valued condition read with no value: a note, not the condition, src/compiler/guards.js.)
    // ("allies": granted to the creatures the presser targets, src/compiler/consumables.js: Therapeutic Snap Peas.)
    const recipient = targetedRecipient(plan, plainText(item?.system?.description?.value)) ? "targets" : plan.otherRecipient ? "drinker" : info.recipient;
    // (Who and how far, for the simulator: "up to 5 creatures" within "30 feet".)
    const targeting = recipient === "targets" ? { ...(rest.targeting ?? {}), ...othersTargeting(plainText(item?.system?.description?.value)) } : rest.targeting;
    // (Damage treated as silver: that material in its formulas, src/compiler/materials.js.)
    // (A row's own linked Effect, src/compiler/degree-effects.js: Crackling Bubble Gum's failure.)
    // (Its notes without the Activate line, the crafting or a Destruction line: src/compiler/notes.js.)
    if (Array.isArray(rest.notes)) rest.notes = cleanNotes(rest.notes);
    if (Array.isArray(rest.strike?.notes)) rest.strike = { ...rest.strike, notes: cleanNotes(rest.strike.notes) };
    return withDegreeEffects(damageMaterial(withTypeChoices(guardText(guardValues({ ...rest, ...(targeting ? { targeting } : {}), ...(source ? { source } : {}), item: { ...info, recipient } }), plainText(item?.system?.description?.value)), typeChoice), plainText(item?.system?.description?.value)), item?.system?.description?.value, options.itemEffects);
}

// What the text does to the drinker or user, as the core's check family's automatic row (no roll: the success
// row): its conditions, temporary Hit Points, healing and modifiers; else a note of its text for its time
// (plan.item.noteOnly, counted apart in the census as the spell module counts its note-only spells).
// A row that reads only part of the text (Megaphone Mutagen's drawback, not its benefit for auditory actions) also
// carries the note, and counts as partial (plan.partial): "Effect + note", as the spell module counts its own.
function rowPlan(item, base) {
    const found = ownRow(item);
    // (A time's first critical failure made a failure, src/compiler/first-degree.js: Lockpicker's Oil — its sentence read.)
    const firstDegree = found ? firstDegreeOf(plainText(item?.system?.description?.value), found.modifiers) : null;
    const row = firstDegree ? { ...found, unread: (found.unread ?? []).filter((sentence) => !firstDegreeSentence(sentence)) } : found;
    const partial = Boolean(row?.unread?.length);
    const note = !row || partial ? noteRow(item) : null;
    if (!row && !note) return null;
    const success = { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: row?.effects ?? [], modifiers: row?.modifiers ?? [], noteEffects: note?.noteEffects ?? [] };
    return {
        ...base,
        automation: { level: row && !partial ? "automatic" : "guided" },
        targeting: { target: recipientOf(item) === "drinker" ? "the drinker" : null, range: null, area: null },
        trigger: { event: "use" },
        resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success } },
        ...(!row ? { noteOnly: true } : {}),
        ...(partial ? { partial: true, unread: row.unread } : {}),
        ...(row?.other ? { otherRecipient: true } : {}),
        // (Its resistance: the item card's own Effect, beside the core's row, as plan.item.resist.)
        ...(row?.resistances ? { resist: row.resistances } : {}),
        // (A Speed of a new kind, the same: plan.item.speeds.)
        ...(row?.speeds ? { speeds: row.speeds } : {}),
        ...(row?.senses ? { senses: row.senses } : {}),
        // (A light its user sheds: plan.item.light.)
        ...(row?.light ? { light: row.light } : {}),
        // (Temporary Hit Points from the targeted creature's level: plan.item.levelTemp.)
        ...(row?.levelTemp ? { levelTemp: row.levelTemp } : {}),
        // (A change to its user's weapon, the same: plan.item.weapon; extra damage on its Strikes, plan.item.strikeDamage.)
        ...(row?.weapon ? { weapon: row.weapon } : {}),
        ...(row?.strikeDamage ? { strikeDamage: row.strikeDamage } : {}),
        // (A condition's penalty ignored, the same: plan.item.suppress.)
        ...(row?.suppress ? { suppress: row.suppress } : {}),
        ...(firstDegree ? { firstDegree } : {})
    };
}

// A note-only plan that now does something too: the same, counted as partial ("Effect + note").
function withoutNoteOnly(plan) {
    const { noteOnly, ...rest } = plan;
    return rest;
}

// The item with its text's Trigger paragraph left out.
export function withoutTrigger(item) {
    const html = String(item?.system?.description?.value ?? "");
    const without = html.replace(/<p>\s*<strong>\s*Trigger\s*<\/strong>[\s\S]*?<\/p>/i, "");
    return without === html ? item : { ...item, system: { ...item.system, description: { ...(item.system?.description ?? {}), value: without } } };
}

// The skeleton of a plan the item module builds itself.
function basePlan(item) {
    const activation = readActivations(item?.system?.description?.value)[0] ?? null;
    const traits = [...(item.system?.traits?.value ?? [])];
    return {
        modelVersion: MODEL_VERSION,
        source: { name: item.name, slug: item.system?.slug ?? null, uuid: item.uuid ?? null, type: item.type },
        rank: 1,
        traits,
        activation: { time: activation?.time ?? null, traits: activation?.traits ?? [] }
    };
}

// What the live layer and the simulator need to know about the item itself.
const KIND_GATED = /\bIf you(?:'re| are) (?:an? )?\w+(?: or \w+)? and (?:drink|consume|eat|imbibe) (?:this|the) [\w' -]+?, (?:it fails to work, and )?you must (?:succeed at|attempt)\b[^.]*\./i;

function itemInfo(item) {
    return {
        type: item.type,
        category: item.system?.category ?? null,
        level: Number(item.system?.level?.value) || 0,
        uses: item.system?.uses ? { max: Number(item.system.uses.max) || 1, autoDestroy: Boolean(item.system.uses.autoDestroy) } : null,
        // "drinker": the creature who drinks or eats it (the user or an adjacent creature they feed it to); "user": its user.
        recipient: recipientOf(item),
        // How a poison (or another affliction item) reaches a creature: "injury" (on a weapon), "contact", "inhaled", "ingested".
        // (Its trait, else the text's "an uncommon injury poison": Darkening Poison has no trait for it.)
        delivery: ["injury", "contact", "inhaled", "ingested"].find((trait) => (item.system?.traits?.value ?? []).includes(trait))
            ?? (["poison", "drug"].includes(item.system?.category) ? /\b(injury|contact|inhaled|ingested) (?:poison|drug)\b/i.exec(String(item.system?.description?.value ?? "").replace(/<[^>]+>/g, " "))?.[1]?.toLowerCase() ?? null : null),
        // What PF2e's own Use rolls (its healing or damage), so live play doesn't roll it again.
        pf2eRoll: pf2eRoll(item),
        activations: readActivations(item?.system?.description?.value),
        // (What it counteracts on its drinker: the counteract card, src/compiler/counteract.js.)
        ...(readCounteract(item?.system?.description?.value, { level: item?.system?.level?.value }) ? { counteract: readCounteract(item?.system?.description?.value, { level: item?.system?.level?.value }) } : {}),
        // (A tea's Tea Ceremony: the card's tick, src/compiler/tea.js.)
        ...(readTeaCeremony(item?.system?.description?.value) ? { ceremony: readTeaCeremony(item?.system?.description?.value) } : {}),
        // (The conditions it lowers: the item card's, after its row, src/compiler/reduce.js.)
        ...(readReductions(plainText(item?.system?.description?.value)).length ? { reduce: readReductions(plainText(item?.system?.description?.value)) } : {}),
        // (Its flat check to end persistent damage: the item card's, after its row, src/compiler/recovery.js.)
        ...(readRecovery(plainText(item?.system?.description?.value)) ? { recovery: readRecovery(plainText(item?.system?.description?.value)) } : {}),
        // (A property rune it lends a weapon: the item card's, src/compiler/rune-loans.js.)
        ...(readRuneLoan(plainText(item?.system?.description?.value), item) ? { rune: readRuneLoan(plainText(item?.system?.description?.value), item) } : {}),
        // (Restored to its maximum Hit Points, its afflictions removed: the item card's, src/compiler/restore.js.)
        ...(readRestore(plainText(item?.system?.description?.value)) ? { restore: readRestore(plainText(item?.system?.description?.value)) } : {}),
        // (Back from dying without raising Wounded, src/compiler/rows.js.)
        ...(keepsWounded(plainText(item?.system?.description?.value)) ? { keepWounded: true } : {})
    };
}

// PF2e's spell Effects by the spell's name in lower case, from the spell-effects pack's items ("Spell Effect: Haste" → "haste").
export function spellEffectIndex(effects) {
    const index = {};
    for (const effect of effects ?? []) {
        const name = /^Spell Effect:\s*(.+)$/i.exec(effect?.name ?? "")?.[1]?.trim();
        if (!name) continue;
        const uuid = effect.uuid ?? (effect._id ? `Compendium.pf2e.spell-effects.Item.${effect._id}` : null);
        if (uuid) index[name.toLowerCase()] ??= { uuid, name: effect.name };
    }
    return index;
}

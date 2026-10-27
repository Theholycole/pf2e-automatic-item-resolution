// Permanent items' activations (worn items, weapons, armor, shields, ammunition, containers): PF2e keeps them only as
// text ("Activate—Name [2] (manipulate) / Frequency once per day / Trigger … / Effect …"), so each activation is split
// out and read as its own ability — the ability compiler's reading of its block, then the item readings consumables
// get (the drinker aside: an activation acts for its user). Staves are the spell module's (their spells, charges).
// Pure.

import { chosenAllyPlan, withAllyEffectThenCard } from "./chosen-ally.js";
import { alliesMovePlan, moveActionsPlan, ownMovePlan } from "./move-actions.js";
import { afterEffectPlan, withAfterApplied, withAfterEnds, withCastFlatCheck, withFelledReward, withSaveAfterApplied, withSlain } from "./after-ends.js";
import { withToggleOff, withToggleOn } from "./toggle-off.js";
import { withFormExtras } from "./form-extras.js";
import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { actionTypeOf, triggerOn } from "./activation.js";
import { forTargets, othersTargeting, targetedRecipient, allyAreaPlan, castPlan, checkGated, effectLinks, fitPlan, ownPlan, withStatedHealing } from "./consumables.js";
import { castWordsPlan, fillCast } from "./cast-words.js";
import { spellPickPlan } from "./spell-picks.js";
import { vehicleEffectPlan, vehiclePlan, withVehicleQuickened } from "./vehicles.js";
import { rollTwiceOver, rollTwicePlan } from "./fortune.js";
import { readiedBonusOver, readiedBonusPlan, withEscalatingBonus } from "./readied-bonus.js";
import { rageOver, ragePlan } from "./rage.js";
import { ownCheckOver, ownCheckPlan } from "./own-checks.js";
import { withDrain } from "./drain.js";
import { directDamageOver, directDamagePlan, energyChoicePlan, negatingSavePlan, retaliationBeside, retaliationPlan, withoutDamageRestated } from "./direct-damage.js";
import { withActivationNeeds } from "./small-needs.js";
import { readReductions, readRegain, readSpeedPenaltyEnds, reductionNotes, reductionPlan, unlessMagicalOf } from "./reduce.js";
import { readRecovery, recoveryNotes, recoveryPlan, recoverySaid } from "./recovery.js";
import { beadsPlan } from "./beads.js";
import { focusPlan } from "./focus.js";
import { compileStrike, strikeOver } from "./strikes.js";
import { hitAuraPlan } from "./hit-auras.js";
import { aroundAllies, hitAroundPlan, oneThenAroundPlan } from "./hit-around.js";
import { cleanNotes } from "./notes.js";
import { thrownPlan } from "./thrown.js";
import { withImmunity } from "./immunity.js";
import { conjuredPlan } from "./conjured.js";
import { withSpecialReadings } from "./special-readings.js";
import { baneWaysPlan, modularWaysPlan, tattooWaysPlan, victoryWaysPlan } from "./bane.js";
import { teleportPlan } from "./teleport.js";
import { withMove } from "./move.js";
import { withOwnMoves } from "./own-moves.js";
import { farMovesPlan, withPlaneSent, withTravelCast } from "./far-moves.js";
import { hoovesPlan, movingNotesPlan } from "./moving-notes.js";
import { isSpecialItem, withDecided } from "./decided.js";
import { withTemperature } from "./temperature.js";
import { heightWaysPlan, withFalls } from "./falls.js";
import { withRaiseShield } from "./raise-shield.js";
import { withRowReadings } from "./row-readings.js";
import { appearancePlan, withDisbelief } from "./disbelief.js";
import { withCooldown } from "./cooldown.js";
import { withWeatherIgnores } from "./weather.js";
import { objectsPlan } from "./objects.js";
import { withPullToward } from "./pull-toward.js";
import { withPlacedCheck, withPlacedSave } from "./placed.js";
import { takePlan } from "./take-condition.js";
import { givenTempPlan } from "./given-temp.js";
import { shoveFartherPlan } from "./shove-farther.js";
import { withScaled } from "./scaled.js";
import { readLinkedTable, readTable } from "./random-table.js";
import { mythicWaysPlan, rerollOver, rerollPlan } from "./rerolls.js";
import { castMentionOnly, guardText, guardValues } from "./guards.js";
import { withDegreeEffects } from "./degree-effects.js";
import { auraZonePlan, choiceAuraWays } from "./aura-zones.js";
import { withStrikeDamage } from "./strike-as.js";
import { withPinningWays } from "./end-early.js";
import { withActionPenalty } from "./action-penalty.js";
import { withLodgedThroat } from "./throat.js";
import { withEffectAround, withStrikeCounteract } from "./strike-counteract.js";
import { withFuses } from "./fuses.js";
import { withFatigueIgnored } from "./fatigue-ignored.js";
import { withCastSmoke } from "./cast-smoke.js";
import { withGrowingBleed } from "./growing-bleed.js";
import { withGrabAbility } from "./grab-ability.js";
import { withHitNoteHeld } from "./hit-note-held.js";
import { withStrikeLines } from "./strike-lines.js";
import { compelledHitWays } from "./compelled-hit.js";
import { withPersistentHold } from "./persistent-hold.js";
import { withStrikeIf } from "./strike-if.js";
import { withMomentumWays } from "./momentum-ways.js";
import { withRedirectedStrike } from "./redirected-strike.js";
import { withKindWays } from "./kind-ways.js";
import { withSilhouette } from "./silhouette.js";
import { withImpaled } from "./impaled.js";
import { withLureLight } from "./lure-light.js";
import { othersActionsPlan } from "./others-actions.js";
import { anywhereStrikePlan } from "./anywhere-strike.js";
import { benefitWaysPlan } from "./benefit-ways.js";
import { extinguishPlan } from "./extinguish.js";
import { splitArrowPlan } from "./split-arrow.js";
import { withRangeFree } from "./range-free.js";
import { withDarkLight } from "./dark-light.js";
import { withTrample } from "./trample.js";
import { withInflated } from "./aloft.js";
import { withUndeadWard } from "./undead-ward.js";
import { withCannibalCall } from "./cannibal-call.js";
import { withDisguiseWords } from "./disguise.js";
import { withSeeThrough } from "./see-through.js";
import { withCastArrival } from "./cast-arrival.js";
import { withLampLight } from "./lamp.js";
import { withCryptidShape } from "./cryptid-shape.js";
import { reshapePlan } from "./reshape.js";
import { withSelfFighting } from "./self-fighting.js";
import { withActivationRules } from "./item-rules.js";
import { songWaysPlan } from "./songs.js";
import { isBareFigurine, ownerDCs, withItemData } from "./item-data.js";
import { itemActionOver, itemActionPlan } from "./item-actions.js";
import { playedBySpellModule, spellModuleShare } from "./index.js";
import { withSpend } from "./spend.js";
import { withMythicUpgrade } from "./mythic-upgrade.js";
import { withExtraWay, withInsteadWay } from "./instead-way.js";
import { namedOptions, namedOptionsPlan } from "./named-options.js";
import { withMark } from "./marked.js";
import { withAttackRiders } from "./attack-riders.js";
import { installedPlan, readInstalled } from "./installed.js";
import { floatingPlan } from "./floating.js";
import { withAreaTraitNote } from "./area-trait.js";
import { allyAreaRow, dropsToOne, keepsWounded, noteRow, ownRow, plainText, itemDuration } from "./rows.js";
import { pf2eRulesPlan } from "./pf2e-rules.js";
import { degreeSentencesPlan, failureNotesPlan, saveOrPlan } from "./save-or.js";
import { spellstrikePlan } from "./spellstrike.js";
import { withPrimedNotes, withWhilePersistent, withZeroHPNote } from "./primed.js";
import { withHitDelivery } from "./hit-delivery.js";
import { withoutFlavor, withoutFlavorNotes, withoutLater } from "./flavor.js";
import { withSlotCost } from "./slot-cost.js";
import { effectStrikePlan } from "./effect-strike.js";
import { choiceOptionPlan, optionPlan } from "./option-on.js";
import { coveredSquarePlan, raisedAreaPlan, raisedWallsPlan, sprayedSmokePlan, spotlightPlan, emanationBonusPlan } from "./covered-square.js";
import { perceptionCheckPlan } from "./perception-check.js";
import { offGuardNextPlan } from "./off-guard-next.js";
import { preventConditionPlan } from "./prevent-condition.js";
import { withStartTurnHeal } from "./turn-heals.js";
import { activationBase, effectWords, hasLastingReading, withLastingReading } from "./lasting.js";
import { hasAreaReading, withAreaReadings } from "./area-readings.js";
import { hasBookStrikesReading, withBookStrikes } from "./book-strikes.js";
import { hasCreatureReading, withCreatureReading } from "./creature-readings.js";
import { hasMovingReading, withMovingReading } from "./moving-readings.js";
import { hasTriggerReading, withTriggerReading } from "./trigger-readings.js";
import { hasAdventureReading, withAdventureReading } from "./adventure-readings.js";
import { hasLegendReading, withLegendReading } from "./legend-readings.js";
import { withActivationIllusion } from "./illusions.js";
import { hasVisibilityReading, visibilityWords, withVisibilityReading } from "./visibility.js";
import { DRAGON_TYPES, readTypeChoice, withRowTypeChoice, withTypeChoices } from "./type-choice.js";
import { counteractLeaves, readCounteract, withCounteractLeaves } from "./counteract.js";
import { pickedSentence, skillPickOf } from "./skill-pick.js";
import { damageMaterial, withMaterialRider } from "./materials.js";
import { readRuneLoan, runeLoanPlan } from "./rune-loans.js";
import { readUntilRage, untilRagePlan } from "./rage-time.js";
import { withActionLimit, withCastNotes, withGmCalls, withHonestPartial, withUntracedRules, withZoneUntraced } from "./honest.js";
import { withCastChanges } from "./cast-changes.js";
import { withSaveEnds } from "./save-ends.js";
import { withStrikeGate } from "./strike-gate.js";
import { withKindSaves } from "./kind-saves.js";
import { withEscapeEnds } from "./escape-ends.js";
import { withUserConditions } from "./user-conditions.js";
import { onOffPlan } from "./on-off.js";
import { withEffectThenCard } from "./effect-then-card.js";
import { withRuneSteps } from "./rune-steps.js";
import { withTriggered } from "./triggered.js";
import { withAfflictionActivations } from "./affliction-readings.js";
import { withAsThough, withUserActions } from "./user-actions.js";
import { artifactWords, hasArtifactReading, withArtifactReading } from "./artifact-readings.js";

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
        && (/<strong>\s*Activat/i.test(String(item.system?.description?.value ?? "")) || isBareFigurine(item)) && spellModuleShare(item, options) !== "all";
}

const field = (block, name) => {
    const match = new RegExp(String.raw`<strong>\s*${name}\s*</strong>\s*([\s\S]*?)(?=<strong>\s*(?:Activat|Frequency|Trigger|Requirements?|Effect)\b|<hr|$)`, "i").exec(block);
    return match ? plainText(match[1]).replace(/[;.]\s*$/, "").trim() || null : null;
};

// "once per day", "once per hour", "once per 10 minutes", "three times per day" → { max, per, raw }.
// (And a week's or a month's, Passage Pane's "once per week", or a year's or a century's, Void Mirror's: the activations card counts those
// too — 2026-10-27.)
export function readFrequency(text) {
    const match = /\b(once|twice|three times|(\d+) times) per (round|turn|minute|10 minutes|hour|day|week|month|year|century|encounter)\b/i.exec(String(text ?? ""));
    if (!match) return text ? { raw: text } : null;
    const max = match[2] ? Number(match[2]) : { once: 1, twice: 2, "three times": 3 }[match[1].toLowerCase()];
    return { max, per: match[3].toLowerCase().replace(" ", "-"), raw: text };
}

// The item's activations: [{ name, time, traits, frequency, trigger, requirements, html }] — html is its block (its
// Activate line to the next one), which the ability compiler reads as an ability's.
// (An affliction under a heading of its own after the activations — Devil's Trident's "<h3>Sewer Haze</h3>", its traits, Saving Throw, Onset
// and stages: the block of the activation that names it, in the inline form an ability's affliction takes ("<p><strong>Sewer Haze</strong>
// (disease, virulent)</p>" and its lines) — 2026-10-27, its activation read nothing before.)
const HEADED_AFFLICTION = /<h[1-6]>\s*([^<]+?)\s*<\/h[1-6]>\s*<section class="traits">([\s\S]*?)<\/section>([\s\S]*?<strong>\s*Saving Throw\s*<\/strong>[\s\S]*?)(?=<h[1-6]\b|<hr\b|$)/gi;
function headedAfflictions(text) {
    return [...String(text ?? "").matchAll(HEADED_AFFLICTION)].map((match) => {
        const traits = [...match[2].matchAll(/<p>\s*([^<]+?)\s*<\/p>/g)].map((trait) => trait[1].trim().toLowerCase());
        if (!traits.some((trait) => /^(?:disease|poison|curse|ingested|inhaled|contact|injury)$/.test(trait))) return null;
        const lines = match[3].replace(/^\s*<p>(?!\s*<strong>)[\s\S]*?<\/p>\s*/, "");
        return { name: match[1].trim(), html: `<p><strong>${match[1].trim()}</strong> (${traits.join(", ")})</p>${lines}` };
    }).filter(Boolean);
}

// The affliction an activation hands over from a heading of its own (splitActivations' headedAffliction): its own name and traits, and the
// exposure's DC when the activation gives one ("succeed at a DC 25 Fortitude save or become infected with sewer haze" — the disease's DC 23
// is its stages').
function withHeadedAffliction(plan, activation) {
    const headed = activation.headedAffliction;
    const handoff = plan?.resolution?.afflictionHandoff;
    if (!headed || !handoff) return plan;
    const exposure = new RegExp(String.raw`@Check\[(\w+)\|dc:(\d+)[^\]]*\] save or become infected with ${headed.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").exec(activation.html);
    const slug = headed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const outcomes = Object.fromEntries(Object.entries(plan.resolution.outcomes ?? {}).map(([degree, row]) => [degree, row?.affliction ? { ...row, affliction: { ...row.affliction, name: headed.name } } : row]));
    const check = exposure ? { ...plan.resolution.check, statistic: exposure[1].toLowerCase(), against: { ...plan.resolution.check.against, value: Number(exposure[2]) } } : plan.resolution.check;
    return { ...plan, resolution: { ...plan.resolution, check, outcomes, afflictionHandoff: { ...handoff, name: headed.name, slug, traits: headed.traits } } };
}

export function splitActivations(html) {
    const text = String(html ?? "");
    const starts = [...text.matchAll(/<strong>\s*Activat(?:e|ion)\b/gi)].map((match) => match.index);
    const headed = headedAfflictions(text);
    return starts.map((start, index) => {
        // (To a section heading after it, if one comes first: Essence Forge's "<h2>Essence Forge Crafting</h2>" table isn't its last activation's.)
        const whole = text.slice(start, starts[index + 1] ?? text.length);
        // (Nor an artifact's Destruction paragraph after it: Orb of Dragonkind's "… explodes … to all creatures within 90 feet" isn't its
        // breath's range.)
        const heading = whole.search(/<h[1-6]\b|<p>\s*<strong>\s*Destruction\s*<\/strong>/i);
        const cut = heading > 0 ? whole.slice(0, heading) : whole;
        // (Nor an affliction's stat block after it that it doesn't name: Sweet Hag's Eye's Sickeningly Sweet, the eye eaten, isn't its Meltaway
        // Mint's save — 2026-10-26.)
        const affliction = /<p>\s*<strong>([^<]+)<\/strong>\s*\([a-z, ]*\b(?:ingested|inhaled|contact|injury|poison|disease|curse)\b[a-z, ]*\)[\s\S]*?<strong>\s*Saving Throw\s*<\/strong>/i.exec(cut);
        const own = affliction && affliction.index > 0 && !new RegExp(`\\b${affliction[1].trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(plainText(cut.slice(0, affliction.index))) ? cut.slice(0, affliction.index) : cut;
        // (One under its own heading that this activation names: given to it.)
        const named = headed.find((entry) => new RegExp(`\\b${entry.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(plainText(own)) && !own.includes(entry.html));
        const block = named ? `${own}${named.html}` : own;
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
            html: block,
            ...(named ? { headedAffliction: { name: named.name, traits: [...named.html.matchAll(/\(([^)]*)\)<\/p>/g)][0]?.[1]?.split(", ") ?? [] } } : {})
        };
    });
}

// One activation as an ability for the ability compiler: its block as the description, its own actions. (modifiers: false — without
// the item's own PF2e modifiers, for a read that took them for the activation's; its toggles stay.)
function asActivationAbility(item, activation, { modifiers = true } = {}) {
    const { actionType, actions } = actionTypeOf(activation.time ?? null);
    const rules = modifiers ? {} : { rules: (item.system?.rules ?? []).filter((rule) => rule?.key !== "FlatModifier") };
    return { ...item, name: activation.name ? `${item.name}: ${activation.name}` : item.name, type: "action", system: { ...(item.system ?? {}), ...rules, description: { value: activation.html }, actionType: { value: actionType }, actions: { value: actions } } };
}

const recipientUser = (item) => ({ ...item, system: { ...(item.system ?? {}), category: "permanent" } });

// The readings of 2026-10-27's Strike group, outermost in an activation's chain (after the readers of the notes they take): a light that lures
// the creatures beginning their turns in it (src/compiler/lure-light.js: Mamlambo Scale); one of two effects
// by the actions spent, the 1-action one a Strike's (src/compiler/momentum-ways.js: Horned Hand Rests); a bonus against the kind of creature
// its user selects (src/compiler/kind-ways.js: Undead Compendium); a flat shadow's form (src/compiler/silhouette.js: Silhouette Cloak); a
// creature impaled on a shield's blades (src/compiler/impaled.js: Highhelm War Shields); a
// Strike turned on another on a failed save (src/compiler/redirected-strike.js: Cauthooj Bagpipes' Throw Song); what a Strike gains against a
// foe in a condition (src/compiler/strike-if.js: Minotaur Chair); a Strike card's notes that are its user's to do, its lines
// (src/compiler/strike-lines.js); and a hit's note Effect that holds its Strike card's notes (src/compiler/hit-note-held.js).
function strikeGroupReadings(plan, entry, item) {
    const html = entry.activation?.html;
    const momentum = withMomentumWays(withLureLight(plan, html), html);
    const kinds = withKindWays(momentum, item?.system?.description?.value);
    const form = withSilhouette(kinds, plainText(html), plainText(item?.system?.description?.value));
    const impaled = withImpaled(form, item?.system?.description?.value);
    return withHitNoteHeld(withStrikeLines(withStrikeIf(withRedirectedStrike(impaled))));
}

// Each activation → { activation, plan } (plan null when nothing is read). options: as compileItem's.
// (Each save against its owner's DC as the core's { dc: "owner" }: src/compiler/item-data.js.)
export function compileActivations(item, options = {}) {
    // (An item the spell module shares — its spellshapes or casts there: those activations left to it, src/compiler/index.js spellModuleShare.)
    const share = spellModuleShare(item, options);
    // (What its use costs, a Mythic Point: src/compiler/spend.js.)
    // (And a Mythic Point it can spend for more: the ways card's two buttons, src/compiler/mythic-upgrade.js.)
    // (A row's own reading of what the ability compiler left as a note, src/compiler/row-readings.js: Reducer Round's shrink, Splintering Spear's
    // bleed on a failure.)
    // (An illusion a creature can see through, src/compiler/disbelief.js — the GM's disbelief card once it applies.)
    // (A temporary immunity after its use, src/compiler/immunity.js — held to, or a note.)
    // (Partial when a result row leaves the GM something to do, src/compiler/honest.js.)
    // (Last, the user's rulings for what has no game numbers — speech, minds, information — src/compiler/decided.js.)
    // (And outermost, the Strike group's readings of 2026-10-27: strikeGroupReadings.)
    // (And after the areas' readings, the adventure books' Strike group's of 2026-10-27: bookStrikesOf.)
    return sharedRecharges(sharedAttacks(compileEach(item, options)).map((entry) => ({ ...entry, plan: specialOf(item, entry, artifactsOf(item, entry, adventureOf(item, entry, triggersOf(item, entry, creaturesOf(item, entry, withActivationIllusion(visibilityOf(item, entry, withAfflictionActivations(withVehicleQuickened(withActivationNeeds(lastingOf(item, entry, strikeGroupReadings(withSelfFighting(reshapePlan(withCryptidShape(withLampLight(withCastArrival(withSeeThrough(withDisguiseWords(withCannibalCall(withUndeadWard(withInflated(withDarkLight(withTrample(withActivationRules(withGrabAbility(withGrowingBleed(withEffectAround(withCastSmoke(withEscalatingBonus(withFatigueIgnored(withFuses(withStrikeCounteract(withLodgedThroat(withPinningWays(withActionPenalty(withStrikeDamage(withPausedPassive(decideActivation(item, entry, withTravelCast(withCounteractLeaves(withCastNotes(withGmCalls(withZoneUntraced(withUntracedRules(withHonestPartial(withStrikeGate(withUserConditions(withEscapeEnds(withActionLimit(withKindSaves(withSaveEnds(withRuneSteps(withImmunity(withAreaTraitNote(withAttackRiders(withMythicUpgrade(withExtraWay(withInsteadWay(withSpend(withMark(withCooldown(withWeatherIgnores(withDisbelief(withRowReadings(withFelledReward(withCastFlatCheck(withSaveAfterApplied(withAfterApplied(withAfterEnds(withSlain(ownerDCs(withCastChanges(entry.plan, item, options)), entry.activation.html)), entry.activation.html), entry.activation.html)), entry.activation.html), entry.activation.html, item), entry.activation.html), entry.activation.html), entry.activation.html, entry.activation.name), plainText(entry.activation.html), item), plainText(entry.activation.html), options), plainText(entry.activation.html), entry.activation.html), entry.activation.html), plainText(entry.activation.html), entry.activation.html), entry.activation.html), entry.activation.html), entry.activation.html, { name: item.name, activation: entry.activation.name }), plainText(entry.activation.html), item), plainText(entry.activation.html)), plainText(entry.activation.html))), entry.activation.html), plainText(entry.activation.html)), plainText(entry.activation.html)), itemDuration(plainText(entry.activation.html))), plainText(entry.activation.html)), plainText(entry.activation.html))), options, item)))), item), plainText(entry.activation?.html)))))), plainText(entry.activation?.html))))), entry.activation?.html))), entry, item, () => withActivationInfo(item, entry, activationBasePlan(item, entry))), entry.activation.html, { item, activation: entry.activation }), options.spells ?? {}), entry.activation.html, { item, activation: entry.activation }), entry.activation.html), entry.activation.html, item.system?.description?.value), entry.activation.html, { item, activation: entry.activation }), entry.activation.html, { item, activation: entry.activation })), entry.activation.html), entry.activation.html, options.spells ?? {}), entry.activation.html, { item, activation: entry.activation }), entry.activation.html, { item, activation: entry.activation, index: entry.index }), entry, item)), entry.activation.html)), item, entry)), item, entry))))), options) })).map((entry) => ({ ...entry, plan: areasOf(item, entry, entry.plan) })).map((entry) => ({ ...entry, plan: movesOf(item, entry, entry.plan) })).map((entry) => ({ ...entry, plan: bookStrikesOf(item, entry, entry.plan, options) })).map((entry) => ({ ...entry, plan: legendsOf(item, entry, entry.plan, options) })).map((entry) => withNamedOptions(item, entry, options)).filter((entry) => !playedBySpellModule(entry, share, item)));
}

// (Triggers, numbers from another roll, rerolls and results for some creatures only, src/compiler/trigger-readings.js: Horn of the Sun Aurochs'
// sunlight-vulnerable creatures, Grisly Scythe's void critical hit — outermost, over what the readers before and the user's rulings left.)
function triggersOf(item, entry, plan) {
    const { base, info, frequency } = activationBase(item, entry);
    if (!hasTriggerReading(base.source.name)) return plan;
    return withTriggerReading(plan, { name: base.source.name, words: effectWords(entry.activation?.html, "activation"), html: entry.activation?.html, base, info, frequency, item });
}

// (A unique item's or an artifact's activation read whole, src/compiler/artifact-readings.js: its cards built in full — outermost, over what
// every reader before made of it.)
function artifactsOf(item, entry, plan) {
    const name = `${item.name}${entry.activation?.name ? `: ${entry.activation.name}` : ""}`;
    if (!hasArtifactReading(name)) return plan;
    const { base, info, frequency } = activationBase(item, entry);
    return withArtifactReading(plan, { name, index: entry.index, words: artifactWords(entry.activation?.html, "activation"), text: plainText(item.system?.description?.value), base, info, frequency });
}

// (Sustained, repeating and later effects the readers before left whole, src/compiler/lasting.js: a note Effect and the card's lines — last,
// over what the user's rulings left.)
// (Who sees whom and several creatures at once, src/compiler/visibility.js: its readings, as lasting's — last of all.)
function visibilityOf(item, entry, plan) {
    if (!hasVisibilityReading(`${item.name}${entry.activation?.name ? `: ${entry.activation.name}` : ""}`)) return plan;
    const { base, info, frequency } = activationBase(item, entry);
    return withVisibilityReading(plan, { name: base.source.name, words: visibilityWords(entry.activation?.html, "activation", plainText(entry.activation?.html)), base, info, frequency });
}

function lastingOf(item, entry, plan) {
    if (!hasLastingReading(`${item.name}${entry.activation?.name ? `: ${entry.activation.name}` : ""}`)) return plan;
    const { base, info, frequency } = activationBase(item, entry);
    return withLastingReading(plan, { name: base.source.name, words: effectWords(entry.activation?.html, "activation"), base, info, frequency });
}

// (Areas it makes and what its words leave beside them, src/compiler/area-readings.js: a zone, a note Effect, a whisper — last, over what the
// readers before and the user's rulings left.)
function areasOf(item, entry, plan) {
    const { base, info, frequency } = activationBase(item, entry);
    if (!hasAreaReading(base.source.name)) return plan;
    return withAreaReadings(plan, { name: base.source.name, html: entry.activation?.html, kind: "activation", base, info, frequency, item });
}

// (Moving creatures and the user, forms, several creatures at once — the adventure books' items, src/compiler/moving-readings.js: Void
// Shackles' manacles, Anchor Spear's embedded spear — after the areas' readings, over what the readers before and the user's rulings left.)
function movesOf(item, entry, plan) {
    const { base, info, frequency } = activationBase(item, entry);
    if (!hasMovingReading(base.source.name)) return plan;
    return withMovingReading(plan, { name: base.source.name, html: entry.activation?.html, kind: "activation", base, info, frequency, item });
}

// (The adventure books' items of the Strike group, src/compiler/book-strikes.js: Deafening Music Box's zone, Mindrender Baton's command — after
// the areas' readings, over what every reader before and the user's rulings left.)
function bookStrikesOf(item, entry, plan, options = {}) {
    const { base, info, frequency } = activationBase(item, entry);
    if (!hasBookStrikesReading(base.source.name)) return plan;
    return withBookStrikes(plan, { name: base.source.name, html: entry.activation?.html, kind: "activation", base, info, frequency, item, options });
}

// (A unique item's or an artifact's activation built in full, src/compiler/legend-readings.js — the user's of 2026-10-27: last of all, over
// what every reader before and the user's rulings left.)
function legendsOf(item, entry, plan, options = {}) {
    const { base, info, frequency } = activationBase(item, entry);
    if (!hasLegendReading(base.source.name)) return plan;
    return withLegendReading(plan, { name: base.source.name, words: effectWords(entry.activation?.html, "activation"), base, info, frequency, options });
}

// (Creatures it makes or controls, and its user's companion, src/compiler/creature-readings.js: Kotodama Bells' object, Collar of Empathy's
// senses — last, over what the readers before left whole.)
function creaturesOf(item, entry, plan) {
    const name = `${item.name}${entry.activation?.name ? `: ${entry.activation.name}` : ""}`;
    if (!hasCreatureReading(name)) return plan;
    const { base, info, frequency } = activationBase(item, entry);
    return withCreatureReading(plan, { name: base.source.name, words: effectWords(entry.activation?.html, "activation"), html: entry.activation?.html, item: plainText(item.system?.description?.value), base, info, frequency });
}

// (The adventure books' items no other reading takes, src/compiler/adventure-readings.js: Cape of Justice's shuriken, Assassin's Bracers' cast
// with its Effects — outermost, over what the readers before left.)
function adventureOf(item, entry, plan) {
    const name = `${item.name}${entry.activation?.name ? `: ${entry.activation.name}` : ""}`;
    if (!hasAdventureReading(name)) return plan;
    const { base, info, frequency } = activationBase(item, entry);
    return withAdventureReading(plan, { name: base.source.name, words: effectWords(entry.activation?.html, "activation"), html: entry.activation?.html, item: plainText(item.system?.description?.value), whole: item.system?.description?.value, base, info, frequency });
}

// (A unique item's or an artifact's own rules, src/compiler/special-readings.js — last of all; its lore then decided again, 2026-10-27.)
function specialOf(item, entry, plan, options = {}) {
    if (!isSpecialItem(item)) return plan;
    const { base, info, frequency } = activationBase(item, entry);
    const next = withSpecialReadings(plan, { name: base.source.name, html: entry.activation?.html, text: plainText(entry.activation?.html), words: effectWords(entry.activation?.html, "activation"), base, info, frequency, item, options });
    return next === plan || !(next?.partial || next?.noteOnly) ? next : decideActivation(item, entry, next);
}

// (A wait its activations share, Retrieval Belt's "Neither Store Item nor Retrieve Item can be activated again for 1 minute" said in one of
// them: the other gets the same wait, sharing it back — src/compiler/cooldown.js.)
function sharedRecharges(entries) {
    const named = (name) => entries.find((entry) => entry.activation?.name && entry.activation.name.toLowerCase() === String(name).toLowerCase());
    return entries.map((entry) => {
        if (!entry.plan || entry.plan.trigger?.recharge) return entry;
        const from = entries.find((other) => (other.plan?.trigger?.recharge?.shared ?? []).some((name) => named(name) === entry));
        if (!from) return entry;
        const { shared, ...time } = from.plan.trigger.recharge;
        return { ...entry, plan: { ...entry.plan, trigger: { ...(entry.plan.trigger ?? {}), recharge: { ...time, shared: [from.activation.name] } } } };
    });
}

// (An activation's plan as the user decided, src/compiler/decided.js: one built from nothing gets its own base and item part.)
// (An Effect that offers named options, src/compiler/named-options.js: each option read as the activation with that option for its Effect — the
// ways card's buttons — in place of the one option read before.)
function withNamedOptions(item, entry, options) {
    const found = namedOptions(entry.activation?.html);
    if (!found) return entry;
    const plans = found.map((option) => compileActivations({ ...item, system: { ...(item.system ?? {}), description: { value: option.html } } }, options)[0]?.plan ?? null);
    const own = entry.plan ?? plans.find(Boolean);
    if (!own) return entry;
    const base = { modelVersion: own.modelVersion, source: own.source, rank: own.rank, traits: own.traits, activation: own.activation, trigger: own.trigger, item: own.item };
    const plan = namedOptionsPlan(found, plans, base);
    if (!plan) return entry;
    // (Each way's card the activation's own: its index and frequency.)
    return { ...entry, plan: { ...plan, ways: plan.ways.map((way) => ({ ...way, plan: { ...way.plan, item: { ...(way.plan.item ?? {}), ...(own.item?.activation ? { activation: own.item.activation } : {}) } } })) } };
}

function decideActivation(item, entry, read) {
    // (A trigger's own effect first, src/compiler/triggered.js: Lost Ember's Off-Guard or Confused suppressed.)
    // (Then its user's own action or rule as its sentences say, src/compiler/user-actions.js: Bastion of the Inheritor's entrench bonus.)
    const plan = withUserActions(withTriggered(read, entry, item), entry, item);
    const { activation } = entry;
    const base = activationBasePlan(item, entry);
    const next = withDecided(plan, { text: plainText(activation.html), base, kind: "activation", trigger: Boolean(activation.trigger), name: base.source.name, special: isSpecialItem(item) });
    if (!next || next === plan || next.item) return next;
    return withActivationInfo(item, entry, next);
}

// An activation's own base plan (its source, traits and time), and its item part — for a plan made where none was read. (Not lasting.js's
// activationBase, its base with its info and frequency.)
function activationBasePlan(item, { activation }) {
    return { modelVersion: MODEL_VERSION, source: { name: `${item.name}${activation.name ? `: ${activation.name}` : ""}`, slug: item.system?.slug ?? null, uuid: item.uuid ?? null, type: item.type }, rank: 1, traits: [...(item.system?.traits?.value ?? [])], activation: { time: activation.time ?? null, traits: activation.traits ?? [] } };
}
function withActivationInfo(item, { activation, index }, plan) {
    const frequency = activation.frequency?.max ? activation.frequency : null;
    return { ...plan, ...(frequency ? { trigger: { ...(plan.trigger ?? {}), frequency } } : {}), item: { type: item.type, level: Number(item.system?.level?.value) || 0, recipient: "user", activation: { index, name: activation.name, time: activation.time, frequency, trigger: activation.trigger }, links: 0 } };
}

// Only after its user's action succeeds, Glamorous Buckler's "On a successful Feint, the target is Dazzled for 1 round" (src/compiler/item-data.js
// words it "This applies only after a successful Feint check"): plan.gate { action } — the card applies it only when its user's latest roll of
// that action in the chat was a success (scripts/poisons.js), the note gone.
const GATE = /^This applies only after a successful ([A-Z][\w ]+?) check\.$/;
function withActionGate(plan) {
    const note = (plan?.notes ?? []).find((entry) => GATE.test(String(entry)));
    if (!note) return plan;
    const action = GATE.exec(note)[1].toLowerCase().replace(/\s+/g, "-");
    const outcomes = Object.fromEntries(Object.entries(plan.resolution?.outcomes ?? {}).map(([degree, row]) => [degree, row?.manualInstructions ? { ...row, manualInstructions: row.manualInstructions.filter((line) => !String(typeof line === "string" ? line : line?.text).includes(note)) } : row]));
    for (const row of Object.values(outcomes)) if (row?.manualInstructions && !row.manualInstructions.length) delete row.manualInstructions;
    const notes = plan.notes.filter((entry) => entry !== note);
    const left = [...notes, ...(plan.unread ?? []), ...Object.values(outcomes).flatMap((row) => row?.manualInstructions ?? [])];
    return { ...plan, gate: { action }, resolution: { ...plan.resolution, outcomes }, notes, ...(left.length ? {} : { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } }) };
}

// A penalty to attack rolls its nonlethal attacks don't take, Pacifying's "A pacified creature takes a –2 penalty to attack rolls on any attacks
// that aren't nonlethal" (src/compiler/item-data.js words it "Its nonlethal attacks don't take that penalty"): the penalty predicated on the
// attack not being nonlethal (PF2e's item:trait:nonlethal), the note gone.
const NONLETHAL_NOTE = "Its nonlethal attacks don't take that penalty (by hand).";
function withNonlethalExempt(plan) {
    if (!plan || !(plan.notes ?? []).includes(NONLETHAL_NOTE)) return plan;
    const exempt = (row) => (row?.modifiers?.some((modifier) => modifier.selector === "attack-roll" && modifier.value < 0) ? { ...row, modifiers: row.modifiers.map((modifier) => (modifier.selector === "attack-roll" && modifier.value < 0 ? { ...modifier, predicate: [...(modifier.predicate ?? []), { not: "item:trait:nonlethal" }] } : modifier)) } : row);
    const outcomes = Object.fromEntries(Object.entries(plan.resolution?.outcomes ?? {}).map(([degree, row]) => [degree, exempt(row)]));
    if (JSON.stringify(outcomes) === JSON.stringify(plan.resolution?.outcomes ?? {})) return plan;
    const notes = plan.notes.filter((note) => note !== NONLETHAL_NOTE);
    const left = [...notes, ...(plan.unread ?? []), ...Object.values(outcomes).flatMap((row) => row?.manualInstructions ?? [])];
    return { ...plan, resolution: { ...plan.resolution, outcomes }, notes, ...(left.length ? {} : { partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } }) };
}

// "The fire shield activation recharges" → { index, name } of the other activation whose text names it (Smoldering Armor's "You gain the
// effects of Fire Shield"), or null.
function rechargeOf(html, activations, index) {
    const said = /\bEffect\s+The ([\w' -]+?) activation recharges\.?\s*(?:Craft Requirements\b.*)?$/i.exec(plainText(html));
    if (!said) return null;
    const name = said[1].trim();
    const at = (activations ?? []).findIndex((other, other_index) => other_index !== index && new RegExp(String.raw`\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\b`, "i").test(plainText(other.html)));
    return at >= 0 ? { index: at, name } : null;
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

// Effects its user picks one of, listed in a sentence: Heartripper Blade's "Choose one of the following effects: restore 2d8 Hit
// Points; reduce the value of your Clumsy, Enfeebled, or Stupefied conditions by 1; or reduce the stage of one toxin or disease you're
// suffering by one stage (…)". The ways card's pick, each way its own activation compiled alone ("You regain … Hit Points", "You reduce
// …"); a way nothing reads stays a note, and the plan is partial then.
const STAGE_DOWN = /^reduce the stage of one ((?:toxin|poison|disease)(?: or (?:toxin|poison|disease))?) you're suffering by (one|\d) stages? \(this can't reduce the stage below stage 1 or cure the affliction\)$/i;
const CHOOSE_EFFECTS = /\bChoose one of the following effects:\s*((?:[^.(]|\([^)]*\)|\.(?=\d))+)\./i;
function chosenEffectsPlan(html, base, item, options, own = null) {
    // (Its links as their words: a condition's link has periods in it.)
    const choose = CHOOSE_EFFECTS.exec(String(html ?? "").replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1"));
    if (!choose) return null;
    const options_ = choose[1].split(/;\s*(?:or\s+)?/).map((option) => option.trim()).filter(Boolean);
    if (options_.length < 2) return null;
    const ways = [];
    const left = [];
    for (const option of options_) {
        // (A toxin's or disease's stage lowered, "reduce the stage of one toxin or disease you're suffering by one stage (this can't reduce the
        // stage below stage 1 or cure the affliction)": the item card's, item.afflictionStage — scripts/foundry.js lowerAfflictionStage.)
        const stage = STAGE_DOWN.exec(option);
        if (stage) {
            const traits = stage[1].split(/\s+or\s+/).map((word) => (/^toxin$/i.test(word) ? "poison" : word.toLowerCase()));
            const plan = { ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] } } }, item: { ...(base.item ?? {}), activation: own ?? base.item?.activation, afflictionStage: { traits, by: Number(stage[2] === "one" ? 1 : stage[2]), min: 1 } } };
            ways.push({ name: `Reduce the stage of one ${stage[1]} by one`, html: `<p>You ${option.charAt(0).toLowerCase()}${option.slice(1)}.</p>`, plan });
            continue;
        }
        const body = /^restore (@Damage\[.*?\]\])(?:\s+Hit Points)?$/i.exec(option);
        const sentence = body ? `You regain ${body[1]} Hit Points.` : `You ${option.charAt(0).toLowerCase()}${option.slice(1)}.`;
        const [entry] = compileEach({ ...item, system: { ...(item.system ?? {}), description: { value: `<p><strong>Activate</strong> <span class="action-glyph">1</span></p><p><strong>Effect</strong> ${sentence}</p>` } } }, options);
        const plan = entry?.plan;
        // (An automatic check with nothing in its row reads nothing.)
        const row = plan?.resolution?.kind === "check" && plan.resolution.check?.roll === "automatic" ? plan.resolution.outcomes?.success : null;
        const empty = row && !row.effects?.length && !row.modifiers?.length && !plan.item?.reduce?.length && !plan.builtin;
        if (!plan || plan.noteOnly || plan.builtin === "no-effect" || empty) {
            left.push(option);
            continue;
        }
        const name = option.replace(/@Damage\[(\d+d\d+(?:\+\d+)?)\[healing\]\]/i, "$1 Hit Points").replace(/\s*\([^)]*\)/g, "");
        ways.push({ name: `${name.charAt(0).toUpperCase()}${name.slice(1)}`, html: `<p>${sentence}</p>`, plan: { ...plan, source: base.source, activation: base.activation, item: { ...(plan.item ?? {}), activation: own ?? plan.item?.activation } } });
    }
    if (ways.length < 2 && !(ways.length && left.length)) return null;
    const notes = left.map((option) => `Or: ${option.replace(/@Damage\[(\d+d\d+)\[healing\]\]/i, "$1 Hit Points")} (by hand).`);
    return { ...base, builtin: "ways", automation: { level: notes.length ? "guided" : "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways, ...(notes.length ? { notes, partial: true } : {}) };
}

// Ammunition of several grades, the weakest loaded deciding: Alchemist's Flamethrower's "Creatures in the area take fire damage based on the
// weakest alchemist's fire loaded into the flamethrower, as noted below. Creatures that critically fail the basic Reflex save additionally
// take the listed persistent fire damage", its list of grades each with its damage, save, line and persistent damage. The ways card's pick of
// the grade loaded (2026-10-26), each way that basic save in that line, the critical failure's persistent damage beside its own.
const GRADE_ROW = /<li>\s*<strong>([^<]+)<\/strong>\s*:\s*The [\w' -]+? deals (@Damage\[[^\]]*?\[[^\]]*\][^\]]*\])\s*\((@Check\[[^\]]*\])\) in an? (@Template\[[^\]]*\])\.\s*(?:@Damage\[(\d+(?:d\d+)?)\[persistent,(\w+)\]\]\s*damage\.)?\s*<\/li>/gi;
function gradeWaysPlan(html, base, item, options, own) {
    const text = String(html ?? "");
    if (!/\bbased on the weakest [\w' -]+? loaded\b/i.test(plainText(text))) return null;
    const rows = [...text.matchAll(GRADE_ROW)];
    if (rows.length < 2) return null;
    const head = text.slice(0, Math.max(0, text.indexOf("<p><strong>Effect</strong>")));
    const ways = [];
    for (const [, name, damage, check, template, persistent, type] of rows) {
        const body = `<p><strong>Effect</strong> Each creature in a ${template} takes ${damage} damage with a ${check} save.</p>`;
        const [entry] = compileEach({ ...item, system: { ...(item.system ?? {}), description: { value: `${/^\s*<p>/.test(head) ? head : `<p>${head}`}${body}` } } }, options);
        let plan = entry?.plan;
        if (!plan?.resolution?.sharedDamage) return null;
        const row = plan.resolution.outcomes?.criticalFailure;
        if (persistent && row?.damage?.mode === "shared") plan = { ...plan, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, criticalFailure: { ...row, damage: { mode: "mixed", shared: row.damage, formulas: [{ formula: `${persistent}[persistent,${type.toLowerCase()}]` }], rollScope: "target" } } } } };
        ways.push({ name: name.trim(), html: body, plan: { ...plan, source: base.source, activation: base.activation, item: { ...(plan.item ?? {}), activation: own ?? plan.item?.activation } } });
    }
    return { ...base, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways };
}

// A breath whose area, damage type and save are its user's draconic benefactor's: Pact of the Herald and Host's torrent of energy (a cone,
// or a longer line), "dealing 1d6 damage per level. Each creature in the area must attempt a basic saving throw against the higher of
// your class DC or spell DC", its three save links after. The ways card's pick of the save, each way that basic
// save at its user's better DC in the cone (the line a note), its damage type the dragon's (picked on the save card).
const BENEFACTOR_BREATH = /\bYou exhale a torrent of energy in an? (@Template\[[^\]]*\]) or an? (@Template\[[^\]]*\]), dealing @Damage\[([^\]|]*?)(?:\|([^\]]*))?\](?:\{[^}]*\})?\.\s*Each creature in the area must attempt a basic saving throw against the higher of your class DC or spell DC\./i;
// (Its save links as item-data.js leaves them, "dc:9003" — the owner's better DC.)
const BENEFACTOR_SAVE = /@Check\[(fortitude|reflex|will)\|(?:against:class-spell|dc:9003)\|basic[^\]]*\]/gi;
function benefactorBreathPlan(html, base, item, options, own) {
    const text = String(html ?? "");
    const breath = BENEFACTOR_BREATH.exec(text);
    if (!breath) return null;
    // (Its Activate and Frequency lines, a paragraph again: an activation's block starts inside its first one.)
    const lines = text.slice(0, Math.max(0, text.indexOf("<p><strong>Effect</strong>")));
    const head = /^\s*<p>/.test(lines) ? lines : `<p>${lines}`;
    const ways = [];
    for (const [check, save] of text.matchAll(BENEFACTOR_SAVE)) {
        const body = `<p><strong>Effect</strong> Each creature in a ${breath[1]} takes @Damage[${breath[3]}[untyped]${breath[4] ? `|${breath[4]}` : ""}] damage with a ${check} save.</p>`;
        const [entry] = compileEach({ ...item, system: { ...(item.system ?? {}), description: { value: `${head}${body}` } } }, options);
        const plan = entry?.plan;
        if (!plan?.resolution?.sharedDamage) return null;
        const name = `${save.charAt(0).toUpperCase()}${save.slice(1).toLowerCase()}`;
        const typed = withTypeChoices(plan, { types: DRAGON_TYPES.map((type) => ({ label: `${type.charAt(0).toUpperCase()}${type.slice(1)}`, type })) });
        ways.push({ name, html: body, plan: { ...typed, notes: [...(typed.notes ?? []), `Its area can be a ${/distance:(\d+)/.exec(breath[2])?.[1] ?? 60}-foot line instead (place it by hand); its damage type is your benefactor's (picked on the card).`], partial: true, item: { ...(plan.item ?? {}), activation: own ?? plan.item?.activation } } });
    }
    if (ways.length < 2) return null;
    const rest = plainText(text.slice(breath.index + breath[0].length)).split(/(?<=[.!?])\s+(?=[A-Z])/).filter((sentence) => /\bcan't use this ability again\b/i.test(sentence));
    return { ...base, builtin: "ways", automation: { level: "guided" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways, ...(rest.length ? { notes: rest.map((sentence) => sentence.trim()), partial: true } : { partial: true }) };
}

// Fruit it grows that heal when eaten: Verdant Branch's "producing 1d4 ripe and flavorful fruits. A creature can pick and eat a fruit with
// an Interact action to regain 2d6+5 Hit Points", Satchel of Numberless Seeds' tree "producing 5 fruits. A creature who eats the fruit with
// an Interact action regains 1d6+2 Hit Points". The item card makes them consumables in its user's inventory (plan.item.creates: { name,
// count, heal }), each eaten as the module's own heal. When they wither — "The fruits wither away after 10 minutes", "After an hour, the tree and
// all its fruits wither away" — is creates.lasts { value, unit }: gone from the inventory then (scripts/expiring.js, 2026-10-26).
const WITHER = /^(?:The fruits wither away after (\d+|an?|one) (minutes?|hours?)|After (\d+|an?|one) (minutes?|hours?), the tree and all its fruits wither away)\.$/i;
const FRUIT = /\bproducing (?:\[\[\/r (\d*d\d+)\]\](?:\{[^}]*\})?|(\d+)) (?:ripe and flavorful )?fruits\b[^.]*\.\s*A creature (?:can pick and eat a fruit|who eats the fruit) with an Interact action (?:to )?regains? (@Damage\[(?:[^\[\]]|\[[^\]]*\])*\](?:\{[^}]*\})?) Hit Points\b/i;
function fruitPlan(html, base, item) {
    const fruit = FRUIT.exec(String(html ?? ""));
    if (!fruit) return null;
    const withering = plainText(String(html ?? "")).split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter((sentence) => /\bwither\b/i.test(sentence));
    const timed = withering.map((sentence) => WITHER.exec(sentence)).find(Boolean);
    const count = (words) => ({ a: 1, an: 1, one: 1 })[String(words).toLowerCase()] ?? Number(words);
    const lasts = timed ? { value: count(timed[1] ?? timed[3]), unit: (timed[2] ?? timed[4]).toLowerCase().replace(/s?$/, "s") } : null;
    const notes = withering.filter((sentence) => !WITHER.test(sentence)).map((sentence) => `${sentence.replace(/\.$/, "")} (by hand).`);
    return { ...base, automation: { level: notes.length ? "guided" : "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] } } }, creates: { name: `${item?.name ?? "Item"} Fruit`, count: fruit[1] ?? Number(fruit[2]), heal: fruit[3].replace(/\{[^}]*\}$/, ""), ...(lasts ? { lasts } : {}) }, ...(notes.length ? { notes, partial: true } : {}) };
}

// An item whose effect is a roll on its own table, src/compiler/random-table.js: each row compiled alone as the item's use.
function tablePlan(html, base, item, options, own) {
    const read = readTable(html, (rowHtml) => compileEach({ ...item, system: { ...(item.system ?? {}), description: { value: `<p><strong>Activate</strong> <span class="action-glyph">2</span></p>${rowHtml}` } } }, options)[0]?.plan ?? null);
    // (Or a RollTable it links: drawn live, the row drawn compiled then.)
    const linked = read ? null : readLinkedTable(html, item?.system?.description?.value);
    if (linked) {
        const words = plainText(String(html ?? "")).replace(/^.*?\bEffect\b\s*/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).filter((sentence) => /\b(?:DC|spell attack|target|decisions?)\b/i.test(sentence) && !/\broll\b[^.]*\btable\b/i.test(sentence));
        return { ...base, builtin: "table", automation: { level: "guided" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, table: { uuid: linked.uuid, name: linked.name, rows: [], ...(linked.dc ? { dc: linked.dc } : {}), ...(linked.attack ? { attack: linked.attack } : {}) }, ...(words.length ? { notes: words.map((sentence) => sentence.trim()) } : {}), partial: true };
    }
    if (!read) return null;
    const rows = read.rows.map((row) => (row.plan ? { ...row, plan: { ...row.plan, source: base.source, item: { ...(row.plan.item ?? {}), activation: own ?? row.plan.item?.activation } } } : row));
    const before = plainText(String(html ?? "").replace(/<table\b[\s\S]*$/i, "")).replace(/^.*?\bEffect\b\s*/s, "").split(/(?<=[.!?])\s+(?=[A-Z])/).filter((sentence) => /\b(?:target|spell|decisions?)\b/i.test(sentence) && !/\broll\b[^.]*\btable\b/i.test(sentence));
    return { ...base, builtin: "table", automation: { level: "guided" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, table: { die: read.die, rows }, ...(before.length ? { notes: before.map((sentence) => sentence.trim()) } : {}), partial: true };
}

function compileEach(item, options = {}) {
    if (!handlesPermanent(item, options)) return [];
    // (Its own data in its text first — a weapon's striking and potency runes, src/compiler/item-data.js.)
    const html = withItemData(item.system?.description?.value, item);
    return splitActivations(html).map((found, index, activations) => {
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
        // (Another of its activations recharged, Smoldering Armor's "The fire shield activation recharges": that one's uses today given back,
        // item.recharges { index, name } — the activation whose text names it.)
        const recharge = rechargeOf(activation.html, activations, index);
        // (A Focus Point for its user, src/compiler/focus.js: the item module's own builtin.)
        // (Spellstrike Ammunition's spell cast into it, src/compiler/spellstrike.js: the module's own card.)
        // (A Mythic Point gained only when nothing else is read: Preordained Spear's doomed value lowered is its card, the point a note.)
        const gain = focusPlan(activation.html, base);
        const mythicGain = gain?.focus?.resource === "mythic" ? gain : null;
        let plan = (mythicGain ? null : gain) ?? spellstrikePlan(activation.html, base);
        let read = null;
        if (!plan) {
            try {
                read = compileAbility(asActivationAbility(item, activation), options);
                // (Not the item's standing save bonuses, PF2e's own rules — an activation that takes minutes reads as a passive: Crown of the
                // Kobold King's Nightmare cast read as its +1 to saves against fear. Once more without its modifiers: the cast, or Shawl of
                // Seasons' own toggle of a season.)
                if (read?.builtin === "save-bonus") read = compileAbility(asActivationAbility(item, activation, { modifiers: false }), options);
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
            // (Its user's own Effect beside a save for others, src/compiler/effect-then-card.js: Final Scalecloak's nimbus, then its attackers' card.)
            if (plan?.resolution?.kind === "save") plan = withEffectThenCard(plan, plainText(activation.html), ownPlan(part, base, options), part, { activation: true });
            // (The chosen ally's own Effect, then the save it makes later, src/compiler/chosen-ally.js: Bewitching Bloom (Magnolia).)
            if (plan?.resolution?.kind === "save") plan = withAllyEffectThenCard(plan, activation.html, ownPlan(part, base, options));
        }
        // (A note alone from the ability compiler gives way to the item's own row when that reads something: Silkspinner's Shield's
        // climb Speed.)
        if (plan?.noteOnly) {
            const row = rowPlanFor(part, base);
            if (row && !row.noteOnly) plan = row;
        }
        if (!plan && options.spellEffects) plan = castPlan(part);
        // (One of a kind of PF2e's spells, its user's pick, src/compiler/spell-picks.js: Mage's Hat (Greater)'s summon spell.)
        if ((!plan || plan.noteOnly || plan.builtin === "no-effect") && options.spells) plan = spellPickPlan(part, options, item.system?.description?.value) ?? plan;
        // (A cast in other words, by the spell's name: src/compiler/cast-words.js — over the GM's no-effect too, Lion's Call's Locate, unless it
        // counteracts — the counteract card's, Draconal Mask's —, 2026-10-27.)
        if ((!plan || plan.noteOnly || (plan.builtin === "no-effect" && !readCounteract(activation.html, { level: item.system?.level?.value }))) && options.spells) plan = castWordsPlan(part, options) ?? plan;
        // (One spell of several its words name, Spark Dancer's "casts either Fireball or Lightning Bolt, depending on …": the words' choices,
        // 2026-10-27.)
        else if (plan?.builtin === "cast-spell" && !plan.choices?.length && options.spells) {
            const words = castWordsPlan(part, options);
            if ((words?.choices?.length ?? 0) > 1 && words.choices.some((choice) => choice.spell?.uuid === plan.spell?.uuid)) plan = { ...plan, choices: words.choices };
        }
        // (The ability compiler's cast, with what its words say and it left out: on its user, a DC, a modifier.)
        plan = fillCast(plan, activation.html, options);
        if (!plan) plan = rowPlanFor(part, base);
        // (A Strike with riders, src/compiler/strikes.js: Duelist's Beacon.)
        plan = strikeOver(plan, compileStrike(part, base, options));
        // (A wound that makes the creature hit give off an aura, src/compiler/hit-auras.js: Ghoul Stiletto's stench.)
        plan = hitAuraPlan(activation.html, base, part, options) ?? plan;
        // (A Strike whose hit sets off one of several songs around the creature hit, src/compiler/songs.js: Singing Shortbow's Harmonic Shot.)
        plan = songWaysPlan(activation.html, base, part, options) ?? plan;
        // (Saves for the creatures around the one it hits, src/compiler/hit-around.js: Dispersing Bullet, Singularity Ammunition.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = hitAroundPlan(activation.html, base, part, options) ?? plan;
        // (An item thrown as a Strike that PF2e can't roll, src/compiler/thrown.js: Lady's Chalice, Halcyon Heart's net, Rod of Razors.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = thrownPlan(activation.html, base, part, options) ?? plan;
        // (A creature it becomes, src/compiler/conjured.js: Wondrous Figurines, Fossil Fragments — its entry after the activation's block when
        // that's the only one. Over any other reading: what the creature does, Bismuth Leopards' dazzling, is its own.)
        plan = conjuredPlan(activation.html, base, part, html) ?? (activations.length === 1 ? conjuredPlan(html, base, part, html) : null) ?? plan;
        // (A vehicle it becomes or acts on, src/compiler/vehicles.js: Folding Boat's Rowboat, Kraken Figurehead's tentacles.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = vehiclePlan(activation.html, base) ?? vehicleEffectPlan(activation.html, base, options.spells ?? {}) ?? plan;
        // (A reroll of the roll that triggered it, src/compiler/rerolls.js: Starfaring Cloak.)
        plan = rerollOver(plan, mythicWaysPlan(activation.html, base) ?? rerollPlan(activation.html, base));
        // (Its user's next roll of a kind rolled twice, src/compiler/fortune.js: Sunweave.)
        plan = rollTwiceOver(plan, rollTwicePlan(plainText(activation.html), base, { trigger: activation.trigger }));
        // (A bonus for a moment, src/compiler/readied-bonus.js: Sparkwarden.)
        plan = readiedBonusOver(plan, readiedBonusPlan(plainText(activation.html), base, { trigger: activation.trigger }));
        // (A Rage with more temporary Hit Points, src/compiler/rage.js: Instinct Crowns.)
        plan = rageOver(plan, ragePlan(plainText(activation.html), base));
        // (A skill action taken with it, src/compiler/item-actions.js: Bronze Bull Pendant's Shove.)
        plan = itemActionOver(plan, itemActionPlan(activation.html, base, { ...options, item }));
        // (A result as though by another action's, src/compiler/user-actions.js: Self-Emptying Pocket's Create a Diversion.)
        plan = withAsThough(plan, activation.html, item, options);
        // (A check with the item's own modifier, src/compiler/own-checks.js: Tentacle Cannon's Grapple at +13.)
        plan = ownCheckOver(plan, ownCheckPlan(plainText(activation.html), base, options));
        // (Damage outright to the creature it names, src/compiler/direct-damage.js: Forge Warden's.)
        // (A save plan one save can't hold goes first, src/compiler/guards.js, so the target's outright part can be read.)
        plan = guardValues(directDamageOver(guardText(plan, plainText(activation.html)), directDamagePlan(plainText(activation.html), base, { item })), activation.html);
        // (Temporary Hit Points from a share of the damage it deals the creature, src/compiler/drain.js: Exsanguinate's half its bleed.)
        plan = withDrain(plan, plainText(activation.html), base, { item });
        // (A row's own linked Effect, src/compiler/degree-effects.js: Cape of Justice's Enact Justice failure.)
        plan = withDegreeEffects(plan, activation.html, options.itemEffects);
        // (What a failed save primes for later, and what its damage dropping the creature does: notes, src/compiler/primed.js.)
        plan = withZeroHPNote(withPrimedNotes(plan, plainText(activation.html)), plainText(activation.html));
        // (Healing its text gives its user beside a linked Effect, src/compiler/consumables.js: Kindler Cameo.)
        plan = withStatedHealing(plan, activation.html, html);
        plan = withWhilePersistent(plan, plainText(activation.html));
        // (Healing at the start of each turn for a while unless a damage type came first, src/compiler/turn-heals.js: Infernal Health.)
        plan = withStartTurnHeal(plan, plainText(activation.html));
        // (A poison or curse its hit gives, src/compiler/hit-delivery.js: Lionfish Spear's at the creature hit, Alghollthu Lash's on its next.)
        plan = withHitDelivery(plan, plainText(activation.html), { trigger: activation.trigger, itemType: item.type });
        // (Damage of its user's choice of two types, each row giving both: the card's picker, src/compiler/type-choice.js.)
        plan = withRowTypeChoice(plan, plainText(activation.html));
        // (An aura's save as it's made and on entering, its damage type picked: the ways card, a zone for each type — Bloodburn Censer.)
        plan = choiceAuraWays(plan, activation, base, { withWhile: (entry) => withWhilePersistent(entry, plainText(activation.html)) }) ?? plan;
        // (An aura that acts at a turn's start or end in it, for a while, src/compiler/aura-zones.js: Arctic Worm Chitin Shield, Alluring
        // Lantern, Sandstorm Top — over a save at the creatures targeted once.)
        // (Or over PF2e's own aura Effect for its user, Nightmare's Lament's Aura: Fuming Cloak — that Effect the zone's for its user, beside the
        // turn-start save it doesn't play, 2026-10-27.)
        const nativeAura = plan?.resolution?.kind === "effect" && (plan.resolution.applications ?? []).length === 1 && /^Aura: /.test(plan.resolution.applications[0].label ?? "") && plan.resolution.applications[0].recipients === "self" ? plan.resolution.applications[0] : null;
        if (!plan || plan.noteOnly || plan.builtin === "no-effect" || plan.resolution?.kind === "save" || nativeAura) {
            const zoned = auraZonePlan(activation.html, base, base.source?.name);
            if (zoned) plan = nativeAura && !zoned.ownEffect ? { ...zoned, ownEffect: { uuid: nativeAura.uuid, label: nativeAura.label } } : zoned;
        }
        // (Damage a successful save negates, src/compiler/direct-damage.js: Mycoweave Shield's spores.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = negatingSavePlan(plainText(activation.html), base) ?? plan;
        // (Damage of the energy its maker chose, the card's picker: Energy-Absorbing runes.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = energyChoicePlan(plainText(activation.html), base, plainText(html)) ?? plan;
        // (What it gives its user and allies in an area, src/compiler/rows.js: Knight Captain's Lance.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = allyAreaPlan(plainText(activation.html), base, allyAreaRow(plainText(activation.html))) ?? plan;
        // (What it gives the one willing ally its user chooses, PF2e's own rules on that ally's Effect, src/compiler/chosen-ally.js: Bewitching
        // Bloom's Cherry Blossom, Amaranth, Bellflower, Lilac, Red Rose.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = chosenAllyPlan(activation.html, base) ?? plan;
        // (Its user's own moves with a Speed for them, src/compiler/move-actions.js: Dragonaut's Wingsuit's Drake's Glide.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = moveActionsPlan(activation.html, base) ?? plan;
        // (Its allies' own reaction moves, src/compiler/move-actions.js: Guiding Cajon Drum.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = alliesMovePlan(activation.html, base) ?? plan;
        // (Its user's own one move as the whole of it, src/compiler/move-actions.js: Viper Rapier's Step, Little Love's Leap.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = ownMovePlan(activation.html, base) ?? plan;
        // (A condition for a time and another after it, src/compiler/after-ends.js: Heart of Sarnax's Bestow Vim.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = afterEffectPlan(activation.html, base) ?? plan;
        // (An illusion on its user's clothes, its disbelief the GM's control, src/compiler/disbelief.js: Costume Change.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = appearancePlan(activation.html, base) ?? plan;
        // (Its allies' bonus beside its enemies' save — Horn of the Archon's "Allies in the area gain a +1 status bonus to attack rolls and saving
        // throws for 1 round" — the allies' card first, then the save's: plan.again.)
        // ("In the area" is the save's own emanation; the save's sentences, the allies' notes, are the save card's.)
        const sharedArea = plan?.resolution?.kind === "save" && !plan.builtin && !plan.again && plan.targeting?.area?.type === "emanation" ? plan.targeting.area.value : null;
        const alliesRow = sharedArea ? allyAreaRow(plainText(activation.html).replace(/\bAllies in the area (gain|receive)\b/, `Allies within a ${sharedArea}-foot emanation $1`)) : null;
        const SAVE_WORDS = /\b(?:saving throw|save|Critical Success|Success|Failure|Critical Failure|immune|Enemies|enemies)\b/;
        if (alliesRow && alliesRow.notes.every((note) => SAVE_WORDS.test(note))) plan = { ...allyAreaPlan(plainText(activation.html), base, { ...alliesRow, notes: [] }), again: { plan, later: false } };
        // (An Effect behind a check the text opens with: only on its success, a note.)
        plan = checkGated(plan, plainText(activation.html));
        // (A condition it lowers on its user, src/compiler/reduce.js: Coin of Comfort; a plan of its own when it's all.)
        // (Break Bonds' "unless the effect is magical and of 12th level or higher": on each condition it ends.)
        const unlessMagical = unlessMagicalOf(plainText(activation.html));
        const reduce = readReductions(plainText(activation.html)).map((entry) => (unlessMagical && entry.by === "all" ? { ...entry, unlessMagical } : entry));
        // (And the Speed penalties it ends with them: Cayden's Tankard, Spleen Bloodstone of Arazni.)
        const speedEnds = reduce.length ? readSpeedPenaltyEnds(plainText(activation.html)) : null;
        // (A Mythic Point it gives back, src/compiler/reduce.js readRegain: the card's, once applied.)
        const regain = readRegain(plainText(activation.html));
        if ((!plan || plan.builtin === "no-effect") && reduce.length) plan = reductionPlan(base, reduce, reductionNotes(plainText(activation.html)));
        // (With a note alone, the note is the rest of it.)
        else if (reduce.length && plan.noteOnly) {
            const { noteOnly, ...rest } = plan;
            plan = { ...rest, partial: true };
        }
        // (Its own sentence no longer what the plan leaves, beside its healing: Flickering Aeon Stone's "If you have the clumsy, …
        // condition, the value of each of these conditions is reduced by 1" — read whole, it saying nothing more.)
        if (reduce.length && plan?.partial) {
            const lowered = (sentence) => {
                const read = readReductions(String(sentence)).map((entry) => (unlessMagical && entry.by === "all" ? { ...entry, unlessMagical } : entry));
                const same = read.length > 0 && read.every((entry) => reduce.some((own) => JSON.stringify(own) === JSON.stringify(entry)));
                // (One whose Speed penalties and "unless" are read too: Cayden's Tankard's, Break Bonds'.)
                if (same && speedEnds && readSpeedPenaltyEnds(String(sentence))) return true;
                // (Not one with a clause of its own besides, Grim Ring's "…, and the undead that caused the condition takes 2d6 vitality damage".)
                return same && !reductionNotes(`Effect ${sentence}`).length && !/,\s*and\b|\bdamage\b/i.test(String(sentence));
            };
            const unread = (plan.unread ?? []).filter((sentence) => !lowered(sentence));
            const notes = (plan.notes ?? []).filter((sentence) => !lowered(sentence));
            const manual = Object.values(plan.resolution?.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length);
            if (unread.length !== (plan.unread ?? []).length || notes.length !== (plan.notes ?? []).length) plan = { ...plan, ...(plan.unread ? { unread: unread.length ? unread : undefined } : {}), ...(plan.notes ? { notes: notes.length ? notes : undefined } : {}), ...(!unread.length && !notes.length && !manual ? { partial: undefined, ...(plan.automation?.level === "guided" ? { automation: { ...plan.automation, level: "automatic" } } : {}) } : {}) };
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
        // (Its own sentence no longer what the plan leaves: Assassin's Skin's "The persistent bleed damage ends." beside its healing.)
        if (recovery && plan?.partial && [...(plan.unread ?? []), ...(plan.notes ?? [])].some(recoverySaid)) {
            const unread = (plan.unread ?? []).filter((sentence) => !recoverySaid(sentence));
            const notes = (plan.notes ?? []).filter((sentence) => !recoverySaid(sentence));
            plan = { ...plan, ...(plan.unread ? { unread: unread.length ? unread : undefined } : {}), ...(plan.notes ? { notes: notes.length ? notes : undefined } : {}), ...(!unread.length && !notes.length ? { partial: undefined } : {}) };
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
        // (A creature its user picks off-guard to its next attack this turn, src/compiler/off-guard-next.js: Boots of the Dead's One of You.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = offGuardNextPlan(activation.html, base) ?? plan;
        // (A condition its user avoids gaining, src/compiler/prevent-condition.js: Immortal Bastion's Doomed or Wounded, Urn of Ashes' Doomed.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = preventConditionPlan(activation.html, base) ?? plan;
        // (A square it covers for a while, with a save on entering, src/compiler/covered-square.js: Spider Gun's Web Shot.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = coveredSquarePlan(activation.html, base, item, options) ?? plan;
        // (Walls it raises, with a save in their space, src/compiler/covered-square.js: Alkenstar Phalanx — over the save read alone.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect" || plan.resolution?.kind === "save") plan = raisedWallsPlan(activation.html, base, item, options) ?? plan;
        if (recharge && (!plan || plan.noteOnly || plan.builtin === "no-effect")) plan = { ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] } } } };
        // (A shield changing form until activated again: Sapling Shield's buckler and tower shield.)
        const shieldForm = shieldFormOf(activation.html);
        if (shieldForm && (!plan || plan.noteOnly || plan.builtin === "no-effect")) plan = { ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] } } }, shieldForm };
        // (Ammunition made against one type of creature, src/compiler/bane.js: Bane Ammunition — the type picked on the ways card.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = baneWaysPlan(activation.html, base, part, options) ?? plan;
        // (A hit that compels its creature's next action, src/compiler/compelled-hit.js: Mindlock Shot — the action picked on the ways card.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = compelledHitWays(activation.html, base) ?? plan;
        // (Other creatures' own reactions it allows, src/compiler/others-actions.js: Singing Bowl of the Versatile Stance's stance change, Chainbreaker's
        // ally's Escape after its Strike's hit.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = othersActionsPlan(activation.html, base, item) ?? plan;
        // (A Strike beyond its weapon's reach or range, free of penalties, src/compiler/anywhere-strike.js: the Impossible rune.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = anywhereStrikePlan(activation.html, base) ?? plan;
        // (A Strike with one of several benefits its user picks, src/compiler/benefit-ways.js: Morphing Weapon's Reshape — the ways card.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = benefitWaysPlan(activation.html, base, { ...options, item }) ?? plan;
        // (Ammunition that douses persistent damage by its attack roll's degree, src/compiler/extinguish.js: Extinguishing Ball.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = extinguishPlan(activation.html, base) ?? plan;
        // (A Strike whose hit splits into one more roll at several others, src/compiler/split-arrow.js: Splithead Bow's Five-Headed Arrow.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = splitArrowPlan(activation.html, base, item) ?? plan;
        // (No range penalty out to an increment for a while, src/compiler/range-free.js: Falconsight Eye — PF2e's roll option on its note Effect.)
        plan = withRangeFree(plan, plainText(activation.html));
        // (A tattoo of one animal, src/compiler/bane.js: Tooth and Claw Tattoo's attack — the animal picked on the ways card.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = tattooWaysPlan(activation.html, base, item) ?? plan;
        // (A short teleport for its user, src/compiler/teleport.js: Dweomerveil's Dimension Leap — the space picked on the canvas.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = teleportPlan(activation.html, base) ?? plan;
        // (Its user's own move, a Stride or Step on the map — the teleport card's, as a move: src/compiler/move.js.)
        plan = withMove(plan, activation.html, base);
        // (Protection from heat or cold for its time, src/compiler/temperature.js: Rime Jar's, Slithermaw's Bane's pick.)
        plan = withTemperature(plan, activation.html, base);
        // (A fall eased by how high it's deployed, src/compiler/falls.js: Parachute Mail's — the height picked on the ways card.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = heightWaysPlan(activation.html, base, { own: { index, name: activation.name, time: activation.time, frequency: activation.frequency?.max ? activation.frequency : null, trigger: activation.trigger }, whole: html, level: Number(item.system?.level?.value) || 0, type: item.type }) ?? plan;
        // (A fall it eases, src/compiler/falls.js: Tumbler's Belt's 120 feet shorter — the environment module's to apply.)
        plan = withFalls(plan, activation.html, base);
        // (Its user's own moves as card lines, src/compiler/own-moves.js: Eagle Wing's glide, Pocket Watch of Stethelos' paused time.)
        plan = withOwnMoves(plan, activation.html, base);
        // (Off the map, or only objects moved: lines of the card, or whispered — src/compiler/far-moves.js: Homeward Wayfinder, the Paired runes.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = farMovesPlan(activation.html, base) ?? plan;
        // (A creature sent to another plane on a row, src/compiler/far-moves.js: Maw of Hungry Shadows' critical failure.)
        plan = withPlaneSent(plan);
        // (What holds a creature or a way in place, words on its user's note Effect, and stepping stones' lines, src/compiler/moving-notes.js:
        // Magnetizing, Immovable Arm, Warding Escutcheon's door, Stepping Stone Shot; Guangu of the Steppe's two Effects, the ways card.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = movingNotesPlan(activation.html, base, item) ?? plan;
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = hoovesPlan(activation.html, base, { own: { index, name: activation.name, time: activation.time, frequency: activation.frequency?.max ? activation.frequency : null, trigger: activation.trigger }, level: Number(item.system?.level?.value) || 0, type: item.type }) ?? plan;
        // (Its user's shield raised, src/compiler/raise-shield.js: Shield of Snakes' Snap Up — PF2e's own Raise a Shield on Apply.)
        plan = withRaiseShield(plan, activation.html, base);
        // (One of its user's items moved or changed, or itself, src/compiler/objects.js: Retrieval Belt, The Forge, Lady's Knife.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = objectsPlan(activation.html, base, item) ?? plan;
        // (A check's success that pulls the creature toward its user, src/compiler/pull-toward.js: Tentacle Cannon's Grasping Deep Shot.)
        plan = withPullToward(plan);
        // (A creature moved to a space its user picks, src/compiler/placed.js: Whip-Tongue Sling's Tongue Twister.)
        plan = withPlacedCheck(withPlacedSave(plan));
        // (A retaliation beside its own result, Thunder Mail's for the next minute: plan.alsoRetaliation, src/compiler/direct-damage.js.)
        const besideNote = (plan?.notes ?? []).find((note) => retaliationBeside(typeof note === "string" ? note : note?.text, base));
        if (besideNote && !plan.builtin && !plan.retaliation) {
            const notes = plan.notes.filter((note) => note !== besideNote);
            plan = { ...plan, alsoRetaliation: retaliationBeside(typeof besideNote === "string" ? besideNote : besideNote.text, base), notes: notes.length ? notes : undefined };
            if (plan.partial && !notes.length && !(plan.unread ?? []).length && !Object.values(plan.resolution?.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length)) {
                delete plan.partial;
                plan.automation = { ...(plan.automation ?? {}), level: "automatic" };
            }
        }
        // (An ally's persistent damage taken onto its user, src/compiler/take-condition.js: Bloodstained Waistcoat's Staunch Bleeding.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = takePlan(activation.html, base) ?? plan;
        // (Temporary Hit Points for another creature, src/compiler/given-temp.js: Skeletal Claw's undead.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = givenTempPlan(activation.html, base) ?? plan;
        // (One creature's damage and condition, then a save for the others near it — Staff of Sun Wukong's Meteor Slam: src/compiler/hit-around.js.)
        plan = oneThenAroundPlan(activation.html, base, part, options) ?? plan;
        // (Saves for the allies of the creature it hurts, beside its own row: plan.around, src/compiler/hit-around.js.)
        if (plan?.resolution?.kind === "check" && plan.resolution.check?.roll === "automatic" && plan.targeting?.target === "1 creature") {
            const allies = aroundAllies(activation.html, part, options);
            if (allies) {
                const plainSaid = allies.said.map((sentence) => plainText(`<p>${sentence}</p>`).trim());
                const said = (line) => plainSaid.some((sentence) => String(line).replace(/^\{target\}:\s*/, "").trim() === sentence);
                const outcomes = Object.fromEntries(Object.entries(plan.resolution.outcomes).map(([degree, row]) => [degree, row?.manualInstructions ? { ...row, manualInstructions: row.manualInstructions.filter((line) => !said(line)) } : row]));
                plan = { ...plan, resolution: { ...plan.resolution, outcomes }, around: allies.entries, notes: (plan.notes ?? []).filter((note) => !said(note)) };
            }
        }
        // (A successful Shove pushed farther: Avalanche Boots' ways, src/compiler/shove-farther.js.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = shoveFartherPlan(activation.html, base) ?? plan;
        // (Beside a card of its own that gives it back — plan.item.regain, Preordained Spear's — no note: 2026-10-25.)
        if (mythicGain) plan = !plan || plan.noteOnly || plan.builtin === "no-effect" ? mythicGain : regain ? plan : (plan.notes ?? []).some((note) => /\bMythic Point\b/.test(note)) ? plan : { ...plan, notes: [...(plan.notes ?? []), "Its user also gains 1 Mythic Point (by hand)."] };
        // (A Speed while it's on, Steamflight Pack's fly Speed — its switch turns it off again: src/compiler/on-off.js.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = onOffPlan(activation.html, item, base) ?? plan;
        // (Fruit it grows that heal when eaten: Verdant Branch's — consumables in its user's inventory.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = fruitPlan(activation.html, base, item) ?? plan;
        // (A roll on its own table, src/compiler/random-table.js: Madcap Top's d20, Pistol of Wonder's d% — each row's own card; over any
        // other reading when its text says the roll decides it — Jabali's Dice's first row's spell Effect isn't its every use.)
        const rolled = /\b(?:roll|draw)\b[^.]*\b(?:to determine|on the (?:following |[\w' -]+ )?table|chosen randomly)\b/i.test(plainText(activation.html));
        if (!plan || plan.noteOnly || plan.builtin === "no-effect" || rolled) plan = tablePlan(activation.html, base, item, options, { index, name: activation.name, time: activation.time, frequency: activation.frequency?.max ? activation.frequency : null, trigger: activation.trigger }) ?? plan;
        // (Ammunition of several grades, the weakest loaded deciding: Alchemist's Flamethrower — the grade picked on the ways card, over its first
        // grade read alone.)
        plan = gradeWaysPlan(activation.html, base, item, options, { index, name: activation.name, time: activation.time, frequency: activation.frequency?.max ? activation.frequency : null, trigger: activation.trigger }) ?? plan;
        // (A breath that's its user's draconic benefactor's: Pact of the Herald and Host — the save picked on the ways card.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = benefactorBreathPlan(activation.html, base, item, options, { index, name: activation.name, time: activation.time, frequency: activation.frequency?.max ? activation.frequency : null, trigger: activation.trigger }) ?? plan;
        // (Effects its user picks one of, listed in a sentence: Heartripper Blade's — the ways card.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = chosenEffectsPlan(activation.html, base, item, options, { index, name: activation.name, time: activation.time, frequency: activation.frequency?.max ? activation.frequency : null, trigger: activation.trigger }) ?? plan;
        // (A shot whose rider is the gun's modular configuration's, src/compiler/bane.js: Hydrocannon's Tinker Shot — picked on the ways card.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = modularWaysPlan(activation.html, base, part, options) ?? plan;
        // (A resistance by a recalled creature's trait, src/compiler/bane.js: Victory Plate.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect" || plan.resolution?.kind === "check" && !plan.resolution.outcomes?.success?.effects?.length) plan = victoryWaysPlan(activation.html, base, item) ?? plan;
        // (Smoke sprayed into an adjacent square, src/compiler/covered-square.js: Beekeeper's Smoker.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = sprayedSmokePlan(activation.html, base) ?? plan;
        // (An area of stalagmites it raises for a while, src/compiler/covered-square.js: Stoneraiser Javelin.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = raisedAreaPlan(activation.html, base, item, options) ?? plan;
        // (A save or a result no row holds — death, a push, a pull to its user — src/compiler/save-or.js: Vorpal, Hauling.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = saveOrPlan(activation.html, base) ?? plan;
        // (A condition its own check gives its user, not the creature whose DC it's against: Shadowmist Cape's "On a success, you're Hidden
        // from that creature" — the card's words, not the target's condition.)
        plan = ownConditionsAside(plan, plainText(activation.html));
        // (A line its reworded text marks for the GM, item-data.js's "… (by hand).": the plan's note, when nothing reads it.)
        plan = byHandNotes(plan, plainText(activation.html));
        // (Damage only the table knows the amount of, typed on the save card, src/compiler/scaled.js: Twisting Gale's Strike damage again.)
        plan = withScaled(plan, plainText(activation.html));
        // (Its degrees in sentences, Gearblade's "On a failure, … takes … damage. On a critical failure, they take …".)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = degreeSentencesPlan(activation.html, base) ?? plan;
        // (A no-damage attack whose degrees are PF2e's own Effects on the target, src/compiler/effect-strike.js: Doom Switch's Bragging Rights.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = effectStrikePlan(activation.html, base) ?? plan;
        // (Damage for whoever touches or hits its user for a while, src/compiler/direct-damage.js: Numerian Steel Breastplate's field — the
        // card kept open, as a retaliation potion's.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = retaliationPlan(plainText(activation.html), base) ?? plan;
        // (A save whose failure is the GM's to carry out, its words on the card: Cauthooj Bagpipes' Throw Song, Planar Ribbon.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = failureNotesPlan(activation.html, base) ?? plan;
        // (Activated ammunition whose own PF2e rules do it, src/compiler/pf2e-rules.js: Elemental Ammunition.)
        if (!plan || plan.strike?.fromNotes) plan = pf2eRulesPlan(item, base, plainText(activation.html)) ?? plan;
        // (Its critical hit's hold for as long as that persistent damage lasts, src/compiler/persistent-hold.js: Garrote Shot — the Strike card's.)
        plan = withPersistentHold(plan, item, plainText(activation.html));
        // (A counteract on its user, src/compiler/counteract.js — Heartstone's "attempts to counteract one disease affecting you": the
        // consumables' counteract card.)
        const counteract = readCounteract(activation.html, { level: item.system?.level?.value });
        // (Partial when its notes leave a rule the card doesn't play, counteractLeaves.)
        if ((!plan || plan.noteOnly || plan.builtin === "no-effect") && counteract) plan = { ...base, builtin: "counteract", automation: { level: counteractLeaves(counteract).length ? "guided" : "automatic" }, targeting: counteract.within ? { target: "1 creature", range: counteract.within, area: null } : { target: "the drinker", range: null, area: null }, trigger: { event: "use" }, ...(counteractLeaves(counteract).length ? { partial: true } : {}) };
        // (One of the item's own PF2e toggles, named as the activation is, switched on for a while: src/compiler/option-on.js.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = optionPlan(item, activation, base) ?? plan;
        // (Or one of the ways of a toggle named for it, the item's own PF2e implementation, over any row read from its words: Shawl of Seasons.)
        if (plan?.builtin !== "modes") plan = choiceOptionPlan(item, activation, base) ?? plan;
        // (A spell slot it costs, src/compiler/slot-cost.js: Magic+ scepters — spent by the card, or a way per rank when its numbers are the
        // slot's, each compiled in that rank's words.)
        // (The block as its own description: its opening paragraph tag back, which the split leaves off.)
        plan = withSlotCost(plan, activation.html, base, (words) => compileActivations({ ...item, system: { ...(item.system ?? {}), description: { value: /^\s*<p\b/i.test(words) ? words : `<p>${words}` } } }, options)[0]?.plan ?? null);
        // (An alchemical item installed in it, its numbers the activation's, src/compiler/installed.js: Living Leaf Weave's elixir of life —
        // the card's pick of its user's own, used up.)
        // (Over a reminder alone too — Troll Hide's text on a note Effect, no row of its own.)
        const reminderOnly = (entry) => !entry?.builtin && Object.values(entry?.resolution?.outcomes ?? {}).every((row) => !(row?.effects ?? []).length && !(row?.modifiers ?? []).length && (row?.damage?.mode ?? "none") === "none" && !row?.forcedMovement);
        const installedRead = readInstalled(plainText(activation.html));
        const installed = installedRead && (!plan || plan.noteOnly || reminderOnly(plan)) ? installedRead : null;
        if (installed) plan = installedPlan(base, installed);
        // (A placed burst of light whose creatures get a bonus inside, src/compiler/covered-square.js: Inspiring Spotlight — over any other
        // reading, the zone's.)
        plan = spotlightPlan(activation.html, base) ?? emanationBonusPlan(activation.html, base) ?? plan;
        // (A shield that guards its user by itself, src/compiler/floating.js: Floating Shield's own AC bonus.)
        if (!plan || plan.noteOnly) plan = floatingPlan(plainText(activation.html), base, item) ?? plan;
        if (!plan) return { activation, plan: null, index };
        plan = withMaterialRider(damageMaterial(withTypeChoices(plan, typeChoice), plainText(activation.html)));
        // (A skill its user picked when the item was made, named in the item's own text, src/compiler/skill-pick.js: Words of Wisdom's
        // phrase — the card's picker; what it reads off the unread list, and the plan whole again when that was all.)
        const skillPick = skillPickOf(plainText(html), plainText(activation.html), plan);
        // (A note alone, when the pick is all it does — Stone of Unrivaled Skill: the item card's own row, its Effect the pick's.)
        if (skillPick?.any && (!plan || plan.noteOnly)) plan = { ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] } } } };
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
        // (Not its opening flavor among what it leaves the GM, src/compiler/flavor.js; nor its damage said again, src/compiler/direct-damage.js.)
        // (A healing of the item's own it stops for a while, src/compiler/toggle-off.js: Splithead Bow's Two-Headed Arrow.)
        plan = withToggleOff(plan, activation.html, item);
        plan = withToggleOn(withFormExtras(plan), activation.html, item);
        plan = withActionGate(withNonlethalExempt(withoutDamageRestated(withoutFlavorNotes(plan, activation.html), { reduce })));

        plan = withHeadedAffliction(plan, activation);
        const frequency = activation.frequency?.max ? activation.frequency : null;
        // (Granted to the creatures the presser targets: who and how far, for the simulator; its linked Effects theirs, not its user's.)
        const others = targetedRecipient(plan, plainText(activation.html));
        const { resist, speeds, senses, light, levelTemp, weapon, attacks, fastHealing, shieldForm: form, strikeDamage, suppress, ruleEffects, coats, coatLasts, creates, move, ...kept } = others ? forTargets(plan) : plan;
        return {
            activation,
            index,
            plan: {
                ...kept,
                // (Its notes without the Activate line before their first sentence, the crafting or a Destruction line: src/compiler/notes.js.)
                ...(Array.isArray(kept.notes) ? { notes: cleanNotes(kept.notes) } : {}),
                ...(Array.isArray(kept.strike?.notes) ? { strike: { ...kept.strike, notes: cleanNotes(kept.strike.notes) } } : {}),
                ...(others ? { targeting: { ...(kept.targeting ?? {}), ...othersTargeting(plainText(activation.html)) } } : {}),
                ...(plan.trigger || frequency ? { trigger: { ...(plan.trigger ?? {}), ...(frequency ? { frequency } : {}) } } : {}),
                // ("drinker": a creature it heals other than its user, "a willing, living, adjacent creature" — chosen on the card.)
                // (Its Trigger's words, and what they're read as: src/compiler/activation.js triggerOn.)
                item: { type: item.type, level: Number(item.system?.level?.value) || 0, recipient: others ? "targets" : plan.otherRecipient ? "drinker" : "user", activation: { index, name: activation.name, time: activation.time, frequency, trigger: activation.trigger, ...(activation.trigger ? { triggerOn: triggerOn(activation.trigger) } : {}) }, links: effectLinks(part).length, ...(ruleEffects ? { ruleEffects } : {}), ...(reduce.length ? { reduce } : {}), ...(speedEnds ? { speedPenaltiesEnd: speedEnds } : {}), ...(regain ? { regain } : {}), ...(resist ? { resist } : {}), ...(move ? { move } : {}), ...(speeds ? { speeds } : {}), ...(senses ? { senses } : {}), ...(light ? { light } : {}), ...(levelTemp ? { levelTemp } : {}), ...(weapon ? { weapon } : {}), ...(attacks ? { attacks } : {}), ...(fastHealing ? { fastHealing } : {}), ...(creates ? { creates } : {}), ...(form ? { shieldForm: form } : {}), ...(strikeDamage ? { strikeDamage } : {}), ...(suppress ? { suppress } : {}), ...(skillPick ? { skillPick } : {}), ...(recovery ? { recovery } : {}), ...(rune ? { rune } : {}), ...(untilRage ? { untilRage: { conditions: untilRage.conditions, ...(untilRage.fastHealing ? { fastHealing: untilRage.fastHealing } : {}) } } : {}), ...(counteract && (plan.builtin === "counteract" || !counteract.free) ? { counteract: plan.builtin === "counteract" ? counteract : readCounteract(activation.html, { level: item.system?.level?.value, extras: false }) } : {}), ...(keepsWounded(plainText(activation.html)) ? { keepWounded: true } : {}), ...(dropsToOne(plainText(activation.html)) ? { dropToOne: true } : {}), ...(recharge ? { recharges: recharge } : {}), ...(coats ? { delivery: "injury", coats, ...(coatLasts ? { coatLasts } : {}) } : {}), ...(installed ? { installed: { name: installed.name, count: installed.count, modifiers: installed.modifiers, ...(installed.resistance ? { resistance: installed.resistance } : {}), ...(installed.damage ? { damage: installed.damage } : {}), ...(installed.fastHealing ? { fastHealing: true } : {}), ...(installed.strength ? { strength: installed.strength } : {}), ...(installed.shortensOnHit ? { shortensOnHit: installed.shortensOnHit } : {}), ...(installed.deactivatedBy ? { deactivatedBy: installed.deactivatedBy } : {}), duration: installed.duration } } : {}) }
            }
        };
    });
}

// A check against a creature's DC whose rows give its user a condition ("you're Hidden from that creature"): those conditions off the target's
// rows, the row's words for the GM instead.
function ownConditionsAside(plan, text) {
    if (plan?.resolution?.kind !== "check" || plan.resolution.check?.against?.dc !== "target") return plan;
    const own = new Set([...String(text ?? "").matchAll(/\byou(?:'re| are| become)(?: also)? (\w+)/gi)].map((match) => match[1].toLowerCase()));
    if (!own.size) return plan;
    const outcomes = Object.fromEntries(Object.entries(plan.resolution.outcomes ?? {}).map(([degree, row]) => {
        const kept = (row.effects ?? []).filter((effect) => !own.has(String(effect.slug ?? "").toLowerCase()));
        if (kept.length === (row.effects ?? []).length) return [degree, row];
        const label = { criticalSuccess: "critical success", success: "success", failure: "failure", criticalFailure: "critical failure" }[degree];
        const said = new RegExp(String.raw`\b(?:On|If you roll) an? ${label}, ([^.]+)\.`, "i").exec(String(text ?? ""))?.[1];
        const words = (row.manualInstructions ?? []).length ? row.manualInstructions : [`{source} (${label}): ${said ?? [...own].join(", ")} (by hand).`];
        return [degree, { ...row, effects: kept, manualInstructions: words.map((line) => line.replace(/^\{target\}/, "{source}")) }];
    }));
    const moved = Object.entries(outcomes).some(([degree, row]) => row !== plan.resolution.outcomes[degree]);
    return moved ? { ...plan, resolution: { ...plan.resolution, outcomes }, automation: { level: "guided" }, partial: true } : plan;
}

// A shield that changes into another kind until it's activated again, Sapling Shield's "The buckler becomes a tower shield, gaining the
// corresponding AC bonus, Speed penalty, and ability to Take Cover. It keeps the same Hit Points and Broken Threshold, but its Hardness and
// Bulk increase by 2 in this form": plan.item.shieldForm — live play gives its user an Effect with PF2e's ItemAlteration on that shield (a
// tower shield's +2 AC and –5-foot Speed, its Hardness and Bulk 2 higher), and activating it again takes the Effect off. Its Take Cover as a
// tower shield is PF2e's own Take Cover, whose Effect: Cover its user sets to greater cover with the shield raised — the card's line.
const TOWER = /\bThe buckler becomes a tower shield, gaining the corresponding AC bonus, Speed penalty, and ability to (?:@UUID\[[^\]]*\]\{)?Take Cover\b/i;
function shieldFormOf(html) {
    const text = String(html ?? "");
    if (!TOWER.test(text)) return null;
    const plain = text.replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const harder = /\bits Hardness and Bulk increase by (\d+) in this form\b/i.exec(plain)?.[1];
    return { name: "tower shield", acBonus: 2, speedPenalty: -5, ...(harder ? { harder: Number(harder) } : {}), toggle: true, takeCover: true };
}

// The sentences of the text that end "(by hand)." — the GM's lines a reworded text gives (src/compiler/item-data.js) — on the plan's notes.
function byHandNotes(plan, text) {
    if (!plan || plan.noteOnly) return plan;
    const lines = (String(text ?? "").match(/[^.]*\(by hand\)\./g) ?? []).map((line) => line.trim());
    const known = JSON.stringify(plan);
    const fresh = lines.filter((line) => !known.includes(line.replace(/\s*\(by hand\)\.$/, "")));
    return fresh.length ? { ...plan, notes: [...(plan.notes ?? []), ...fresh], partial: true, automation: { level: "guided" } } : plan;
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
        // (An unarmed attack it grants: plan.item.attacks, PF2e's Strike rule.)
        ...(row?.attacks ? { attacks: row.attacks } : {}),
        ...(row?.fastHealing ? { fastHealing: row.fastHealing } : {}),
        ...(row?.strikeDamage ? { strikeDamage: row.strikeDamage } : {}),
        ...(row?.suppress ? { suppress: row.suppress } : {}),
        // (PF2e's own rules on its user, with no reading of their own: plan.item.ruleEffects.)
        ...(row?.ruleEffects ? { ruleEffects: row.ruleEffects } : {})
    };
}

// (A pause of the item's own extra damage, Skeletal Claw's "As long as any of these temporary Hit Points remain, the skeletal claw doesn't deal
// additional void damage": that damage is no rule PF2e's data plays (the item has no DamageDice), its user's to add by hand — so its pause is a
// line of the card, nothing to apply. 2026-10-27.)
const PAUSED = /^As long as any of these temporary Hit Points remain, the [\w' -]+? doesn't deal additional (\w+) damage\.$/i;
function withPausedPassive(plan, item) {
    const notes = (plan?.notes ?? []).map((note) => String(typeof note === "string" ? note : note?.text ?? "").trim());
    const paused = notes.find((note) => PAUSED.test(note));
    if (!paused || !plan.partial || (item?.system?.rules ?? []).some((rule) => rule?.key === "DamageDice")) return plan;
    const others = notes.filter((note) => note !== paused);
    if (others.length || (plan.unread ?? []).length || Object.values(plan.resolution?.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length)) return plan;
    return { ...plan, partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" } };
}

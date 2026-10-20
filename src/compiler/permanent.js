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
import { directDamageOver, directDamagePlan, energyChoicePlan, negatingSavePlan, retaliationPlan } from "./direct-damage.js";
import { readReductions, reductionNotes, reductionPlan } from "./reduce.js";
import { readRecovery, recoveryNotes, recoveryPlan } from "./recovery.js";
import { beadsPlan } from "./beads.js";
import { focusPlan } from "./focus.js";
import { compileStrike, strikeOver } from "./strikes.js";
import { hitAuraPlan } from "./hit-auras.js";
import { aroundAllies, hitAroundPlan } from "./hit-around.js";
import { cleanNotes } from "./notes.js";
import { thrownPlan } from "./thrown.js";
import { conjuredPlan } from "./conjured.js";
import { baneWaysPlan, modularWaysPlan, tattooWaysPlan, victoryWaysPlan } from "./bane.js";
import { teleportPlan } from "./teleport.js";
import { takePlan } from "./take-condition.js";
import { givenTempPlan } from "./given-temp.js";
import { shoveFartherPlan } from "./shove-farther.js";
import { withScaled } from "./scaled.js";
import { readLinkedTable, readTable } from "./random-table.js";
import { mythicWaysPlan, rerollOver, rerollPlan } from "./rerolls.js";
import { castMentionOnly, guardText, guardValues } from "./guards.js";
import { withDegreeEffects } from "./degree-effects.js";
import { auraZonePlan, choiceAuraWays } from "./aura-zones.js";
import { isBareFigurine, ownerDCs, withItemData } from "./item-data.js";
import { itemActionOver, itemActionPlan } from "./item-actions.js";
import { playedBySpellModule, spellModuleShare } from "./index.js";
import { withSpend } from "./spend.js";
import { withMythicUpgrade } from "./mythic-upgrade.js";
import { withMark } from "./marked.js";
import { withAttackRiders } from "./attack-riders.js";
import { installedPlan, readInstalled } from "./installed.js";
import { floatingPlan } from "./floating.js";
import { withAreaTraitNote } from "./area-trait.js";
import { allyAreaRow, keepsWounded, noteRow, ownRow, plainText } from "./rows.js";
import { pf2eRulesPlan } from "./pf2e-rules.js";
import { degreeSentencesPlan, failureNotesPlan, saveOrPlan } from "./save-or.js";
import { spellstrikePlan } from "./spellstrike.js";
import { withPrimedNotes, withWhilePersistent, withZeroHPNote } from "./primed.js";
import { withHitDelivery } from "./hit-delivery.js";
import { withoutFlavor, withoutFlavorNotes, withoutLater } from "./flavor.js";
import { withSlotCost } from "./slot-cost.js";
import { effectStrikePlan } from "./effect-strike.js";
import { choiceOptionPlan, optionPlan } from "./option-on.js";
import { coveredSquarePlan, raisedAreaPlan, raisedWallsPlan, sprayedSmokePlan } from "./covered-square.js";
import { perceptionCheckPlan } from "./perception-check.js";
import { DRAGON_TYPES, readTypeChoice, withRowTypeChoice, withTypeChoices } from "./type-choice.js";
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
        && (/<strong>\s*Activat/i.test(String(item.system?.description?.value ?? "")) || isBareFigurine(item)) && spellModuleShare(item, options) !== "all";
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
        // (To a section heading after it, if one comes first: Essence Forge's "<h2>Essence Forge Crafting</h2>" table isn't its last activation's.)
        const whole = text.slice(start, starts[index + 1] ?? text.length);
        // (Nor an artifact's Destruction paragraph after it: Orb of Dragonkind's "… explodes … to all creatures within 90 feet" isn't its
        // breath's range.)
        const heading = whole.search(/<h[1-6]\b|<p>\s*<strong>\s*Destruction\s*<\/strong>/i);
        const block = heading > 0 ? whole.slice(0, heading) : whole;
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

// One activation as an ability for the ability compiler: its block as the description, its own actions. (modifiers: false — without
// the item's own PF2e modifiers, for a read that took them for the activation's; its toggles stay.)
function asActivationAbility(item, activation, { modifiers = true } = {}) {
    const { actionType, actions } = actionTypeOf(activation.time ?? null);
    const rules = modifiers ? {} : { rules: (item.system?.rules ?? []).filter((rule) => rule?.key !== "FlatModifier") };
    return { ...item, name: activation.name ? `${item.name}: ${activation.name}` : item.name, type: "action", system: { ...(item.system ?? {}), ...rules, description: { value: activation.html }, actionType: { value: actionType }, actions: { value: actions } } };
}

const recipientUser = (item) => ({ ...item, system: { ...(item.system ?? {}), category: "permanent" } });

// Each activation → { activation, plan } (plan null when nothing is read). options: as compileItem's.
// (Each save against its owner's DC as the core's { dc: "owner" }: src/compiler/item-data.js.)
export function compileActivations(item, options = {}) {
    // (An item the spell module shares — its spellshapes or casts there: those activations left to it, src/compiler/index.js spellModuleShare.)
    const share = spellModuleShare(item, options);
    // (What its use costs, a Mythic Point: src/compiler/spend.js.)
    // (And a Mythic Point it can spend for more: the ways card's two buttons, src/compiler/mythic-upgrade.js.)
    return sharedAttacks(compileEach(item, options)).map((entry) => ({ ...entry, plan: withAreaTraitNote(withAttackRiders(withMythicUpgrade(withSpend(withMark(ownerDCs(entry.plan), plainText(entry.activation.html), item), plainText(entry.activation.html), options), plainText(entry.activation.html), entry.activation.html), entry.activation.html), entry.activation.html) })).filter((entry) => !playedBySpellModule(entry, share, item));
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
// count, heal }), each eaten as the module's own heal; when they wither is a note.
const FRUIT = /\bproducing (?:\[\[\/r (\d*d\d+)\]\](?:\{[^}]*\})?|(\d+)) (?:ripe and flavorful )?fruits\b[^.]*\.\s*A creature (?:can pick and eat a fruit|who eats the fruit) with an Interact action (?:to )?regains? (@Damage\[(?:[^\[\]]|\[[^\]]*\])*\](?:\{[^}]*\})?) Hit Points\b/i;
function fruitPlan(html, base, item) {
    const fruit = FRUIT.exec(String(html ?? ""));
    if (!fruit) return null;
    const notes = plainText(String(html ?? "")).split(/(?<=[.!?])\s+(?=[A-Z])/).filter((sentence) => /\bwither\b/i.test(sentence)).map((sentence) => `${sentence.trim().replace(/\.$/, "")} (by hand).`);
    return { ...base, automation: { level: notes.length ? "guided" : "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] } } }, creates: { name: `${item?.name ?? "Item"} Fruit`, count: fruit[1] ?? Number(fruit[2]), heal: fruit[3].replace(/\{[^}]*\}$/, "") }, ...(notes.length ? { notes, partial: true } : {}) };
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
        // (Saves for the creatures around the one it hits, src/compiler/hit-around.js: Dispersing Bullet, Singularity Ammunition.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = hitAroundPlan(activation.html, base, part, options) ?? plan;
        // (An item thrown as a Strike that PF2e can't roll, src/compiler/thrown.js: Lady's Chalice, Halcyon Heart's net, Rod of Razors.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = thrownPlan(activation.html, base, part, options) ?? plan;
        // (A creature it becomes, src/compiler/conjured.js: Wondrous Figurines, Fossil Fragments — its entry after the activation's block when
        // that's the only one. Over any other reading: what the creature does, Bismuth Leopards' dazzling, is its own.)
        plan = conjuredPlan(activation.html, base, part, html) ?? (activations.length === 1 ? conjuredPlan(html, base, part, html) : null) ?? plan;
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
        // (A shield changing form until activated again: Sapling Shield's buckler and tower shield.)
        const shieldForm = shieldFormOf(activation.html);
        if (shieldForm && (!plan || plan.noteOnly || plan.builtin === "no-effect")) plan = { ...base, automation: { level: "guided" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [], noteEffects: [] } } }, shieldForm, notes: shieldForm.notes, partial: true };
        // (Ammunition made against one type of creature, src/compiler/bane.js: Bane Ammunition — the type picked on the ways card.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = baneWaysPlan(activation.html, base, part, options) ?? plan;
        // (A tattoo of one animal, src/compiler/bane.js: Tooth and Claw Tattoo's attack — the animal picked on the ways card.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = tattooWaysPlan(activation.html, base, item) ?? plan;
        // (A short teleport for its user, src/compiler/teleport.js: Dweomerveil's Dimension Leap — the space picked on the canvas.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = teleportPlan(activation.html, base) ?? plan;
        // (An ally's persistent damage taken onto its user, src/compiler/take-condition.js: Bloodstained Waistcoat's Staunch Bleeding.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = takePlan(activation.html, base) ?? plan;
        // (Temporary Hit Points for another creature, src/compiler/given-temp.js: Skeletal Claw's undead.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = givenTempPlan(activation.html, base) ?? plan;
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
        if (mythicGain) plan = !plan || plan.noteOnly || plan.builtin === "no-effect" ? mythicGain : (plan.notes ?? []).some((note) => /\bMythic Point\b/.test(note)) ? plan : { ...plan, notes: [...(plan.notes ?? []), "Its user also gains 1 Mythic Point (by hand)."] };
        // (Fruit it grows that heal when eaten: Verdant Branch's — consumables in its user's inventory.)
        if (!plan || plan.noteOnly || plan.builtin === "no-effect") plan = fruitPlan(activation.html, base, item) ?? plan;
        // (A roll on its own table, src/compiler/random-table.js: Madcap Top's d20, Pistol of Wonder's d% — each row's own card; over any
        // other reading when its text says the roll decides it — Jabali's Dice's first row's spell Effect isn't its every use.)
        const rolled = /\b(?:roll|draw)\b[^.]*\b(?:to determine|on the (?:following |[\w' -]+ )?table|chosen randomly)\b/i.test(plainText(activation.html));
        if (!plan || plan.noteOnly || plan.builtin === "no-effect" || rolled) plan = tablePlan(activation.html, base, item, options, { index, name: activation.name, time: activation.time, frequency: activation.frequency?.max ? activation.frequency : null, trigger: activation.trigger }) ?? plan;
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
        // (A counteract on its user, src/compiler/counteract.js — Heartstone's "attempts to counteract one disease affecting you": the
        // consumables' counteract card.)
        const counteract = readCounteract(activation.html, { level: item.system?.level?.value });
        if ((!plan || plan.noteOnly || plan.builtin === "no-effect") && counteract) plan = { ...base, builtin: "counteract", automation: { level: "automatic" }, targeting: counteract.within ? { target: "1 creature", range: counteract.within, area: null } : { target: "the drinker", range: null, area: null }, trigger: { event: "use" } };
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
        // (A shield that guards its user by itself, src/compiler/floating.js: Floating Shield's own AC bonus.)
        if (!plan || plan.noteOnly) plan = floatingPlan(plainText(activation.html), base, item) ?? plan;
        if (!plan) return { activation, plan: null, index };
        plan = damageMaterial(withTypeChoices(plan, typeChoice), plainText(activation.html));
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
        // (Not its opening flavor among what it leaves the GM, src/compiler/flavor.js.)
        plan = withoutFlavorNotes(plan, activation.html);

        const frequency = activation.frequency?.max ? activation.frequency : null;
        const { resist, speeds, senses, light, levelTemp, weapon, attacks, fastHealing, shieldForm: form, strikeDamage, suppress, coats, coatLasts, creates, ...kept } = plan;
        // (Granted to the creatures the presser targets: who and how far, for the simulator.)
        const others = targetedRecipient(plan, plainText(activation.html));
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
                item: { type: item.type, level: Number(item.system?.level?.value) || 0, recipient: others ? "targets" : plan.otherRecipient ? "drinker" : "user", activation: { index, name: activation.name, time: activation.time, frequency, trigger: activation.trigger, ...(activation.trigger ? { triggerOn: triggerOn(activation.trigger) } : {}) }, links: effectLinks(part).length, ...(reduce.length ? { reduce } : {}), ...(resist ? { resist } : {}), ...(speeds ? { speeds } : {}), ...(senses ? { senses } : {}), ...(light ? { light } : {}), ...(levelTemp ? { levelTemp } : {}), ...(weapon ? { weapon } : {}), ...(attacks ? { attacks } : {}), ...(fastHealing ? { fastHealing } : {}), ...(creates ? { creates } : {}), ...(form ? { shieldForm: form } : {}), ...(strikeDamage ? { strikeDamage } : {}), ...(suppress ? { suppress } : {}), ...(skillPick ? { skillPick } : {}), ...(recovery ? { recovery } : {}), ...(rune ? { rune } : {}), ...(untilRage ? { untilRage: { conditions: untilRage.conditions, ...(untilRage.fastHealing ? { fastHealing: untilRage.fastHealing } : {}) } } : {}), ...(counteract && (plan.builtin === "counteract" || !counteract.free) ? { counteract } : {}), ...(keepsWounded(plainText(activation.html)) ? { keepWounded: true } : {}), ...(coats ? { delivery: "injury", coats, ...(coatLasts ? { coatLasts } : {}) } : {}), ...(installed ? { installed: { name: installed.name, count: installed.count, modifiers: installed.modifiers, ...(installed.resistance ? { resistance: installed.resistance } : {}), ...(installed.damage ? { damage: installed.damage } : {}), ...(installed.fastHealing ? { fastHealing: true } : {}), duration: installed.duration } } : {}) }
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
// tower shield's +2 AC and –5-foot Speed), and activating it again takes the Effect off. Its Hardness and Bulk are the GM's.
const TOWER = /\bThe buckler becomes a tower shield, gaining the corresponding AC bonus, Speed penalty, and ability to (?:@UUID\[[^\]]*\]\{)?Take Cover\b/i;
function shieldFormOf(html) {
    const text = String(html ?? "");
    if (!TOWER.test(text)) return null;
    const plain = text.replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const harder = /\bits Hardness and Bulk increase by (\d+) in this form\b/i.exec(plain)?.[1];
    return { name: "tower shield", acBonus: 2, speedPenalty: -5, toggle: true, notes: [...(harder ? [`In this form its Hardness and Bulk are ${harder} higher (by hand).`] : []), "It can Take Cover as a tower shield does."] };
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
        ...(row?.suppress ? { suppress: row.suppress } : {})
    };
}

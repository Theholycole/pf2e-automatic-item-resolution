// Permanent items' activations (worn items, weapons, armor, shields, ammunition, containers): PF2e keeps them only as
// text ("Activate—Name [2] (manipulate) / Frequency once per day / Trigger … / Effect …"), so each activation is split
// out and read as its own ability — the ability compiler's reading of its block, then the item readings consumables
// get (the drinker aside: an activation acts for its user). Staves are the spell module's (their spells, charges).
// Pure.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { actionTypeOf } from "./activation.js";
import { castPlan, effectLinks, fitPlan, ownPlan } from "./consumables.js";
import { focusPlan } from "./focus.js";
import { compileStrike, strikeOver } from "./strikes.js";
import { claimedBySpellModule } from "./index.js";
import { noteRow, ownRow, plainText } from "./rows.js";

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
export function compileActivations(item, options = {}) {
    if (!handlesPermanent(item, options)) return [];
    return splitActivations(item.system?.description?.value).map((activation, index) => {
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
        let plan = focusPlan(activation.html, base);
        let read = null;
        if (!plan) {
            try {
                read = compileAbility(asActivationAbility(item, activation), options);
            } catch {
                read = null;
            }
            const own = read?.builtin === "no-effect" ? ownPlan(part, base, options) : null;
            plan = own ?? (read ? fitPlan(part, read, base, options) : ownPlan(part, base, options));
        }
        if (!plan && options.spellEffects) plan = castPlan(part);
        if (!plan) plan = rowPlanFor(part, base);
        // (A Strike with riders, src/compiler/strikes.js: Duelist's Beacon.)
        plan = strikeOver(plan, compileStrike(part, base));
        if (!plan) return { activation, plan: null, index };
        const frequency = activation.frequency?.max ? activation.frequency : null;
        return {
            activation,
            index,
            plan: {
                ...plan,
                ...(plan.trigger || frequency ? { trigger: { ...(plan.trigger ?? {}), ...(frequency ? { frequency } : {}) } } : {}),
                // ("drinker": a creature it heals other than its user, "a willing, living, adjacent creature" — chosen on the card.)
                item: { type: item.type, level: Number(item.system?.level?.value) || 0, recipient: plan.otherRecipient ? "drinker" : "user", activation: { index, name: activation.name, time: activation.time, frequency, trigger: activation.trigger }, links: effectLinks(part).length }
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
        ...(row?.other ? { otherRecipient: true } : {})
    };
}

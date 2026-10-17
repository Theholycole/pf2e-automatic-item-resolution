// Spellguns: "You Activate the spellgun by aiming it at one creature and making your choice of a spell attack roll or a
// firearm attack roll against the target's AC. This spellgun has a range increment of 30 feet. The spellgun blasts a
// powerful jet of water that deals @Damage[2d6[bludgeoning]] … Critical Success The target takes double damage and is
// knocked back 10 feet. Success The target takes full damage and is knocked back 5 feet." (Torrent, Sparking and Moonlit
// Spellguns.) The plan is the own-check attack's (src/compiler/own-checks.js): the core's check family against the
// target's AC, its damage on a success and double on a critical success, with each degree's riders read as the bombs'
// are. The modifier is its user's choice, so it isn't in the text: plan.ownCheck.choose ["spell", "firearm"], which live
// play turns into the user's spell attack or firearm attack modifier on the card (scripts/poisons.js). Moonlit's "The
// damage is 1d8 fire damage at night, or 1d6 fire damage at other times" is a damage picker (plan.damageChoices). Pure.

import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { riderRow } from "./bombs.js";
import { plainText } from "./rows.js";

// (Against AC, or a defense's DC: a third-party bola's "against the target's Reflex DC".)
const SPELLGUN = /\bmaking your choice of a spell attack roll or a firearm attack roll against the target's (AC|Fortitude DC|Reflex DC|Will DC)\b/i;
const DAMAGE_LINK = /@Damage\[((?:[^[\]]|\[[^[\]]*\])*)\]/g;
const RANGE = /\brange increment of (\d+) feet\b/i;
const NIGHT = /\bThe damage is (@Damage\[(?:[^[\]]|\[[^[\]]*\])*\](?:\{[^}]*\})?) at night, or (@Damage\[(?:[^[\]]|\[[^[\]]*\])*\](?:\{[^}]*\})?) at other times\b/i;
// (A degree's damage words, taken out before its riders are read: "takes double damage, takes double persistent damage,".)
const DAMAGE_WORDS = /\b(?:takes|take) (?:double|full) damage(?:,? (?:and )?(?:takes )?(?:double|full) persistent damage)?,?\s*(?:and\s+)?/gi;

// "@Damage[1d4[persistent,fire]]" → "1d4[persistent,fire]" (before any "|options").
const formulasIn = (html) => [...String(html ?? "").matchAll(DAMAGE_LINK)].map((match) => match[1].split("|")[0].trim());
const component = (formula, id) => {
    const typed = /^(.+?)\[(?:(persistent),)?(\w+)\]$/.exec(formula);
    return { id: String(id), formula, type: typed?.[3]?.toLowerCase() ?? null, category: typed?.[2] ? "persistent" : null };
};
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });

// A degree row's text (plain) → its riders and what it says that they don't: { row, notes }. Each "is …" clause on its own,
// so one's time isn't another's: "is Blinded for 1 round, and is Dazzled while the persistent damage lasts" — blinded for
// a round; dazzled with no time of its own, and a note of how long.
// (Its persistent damage's type, persistent: a condition "while the persistent damage lasts" is the ability module's condition for
// as long as that damage lasts, duration { mode: "while", persistent } — ability 17daa23.)
function degreeRow(words, persistent = null) {
    const notes = [];
    let row = none();
    const add = (riders) => {
        row = { ...row, effects: [...row.effects, ...(riders.effects ?? []).filter((effect) => !row.effects.some((other) => other.slug === effect.slug))], modifiers: [...row.modifiers, ...(riders.modifiers ?? [])], ...(riders.forcedMovement ? { forcedMovement: riders.forcedMovement } : {}) };
    };
    for (const sentence of String(words ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((part) => part.trim()).filter(Boolean)) {
        // ("If it has a weakness to silver …, it's also Enfeebled 1": the GM's.)
        if (/^If\b/i.test(sentence)) {
            notes.push(sentence);
            continue;
        }
        const clauses = sentence.replace(/^The target\s+/i, "").replace(DAMAGE_WORDS, "").replace(/\btakes \d+d\d+(?:\s*\+\s*\d+)? \w+(?: damage)?(?:\s+and\s+(?=is\b))?\s*/i, "").replace(/\.$/, "").split(/,?\s*(?:and\s+)?(?=\b(?:is|becomes)\s)/i).map((clause) => clause.trim()).filter(Boolean);
        for (const clause of clauses) {
            const riders = riderRow(`The target ${clause.replace(/\s+while\b.*$/i, "")}.`);
            if ((riders.effects ?? []).length || (riders.modifiers ?? []).length || riders.forcedMovement) {
                const lasting = persistent && /\bwhile the persistent damage lasts\b/i.test(clause);
                add(lasting ? { ...riders, effects: (riders.effects ?? []).map((effect) => (effect.kind === "condition" ? { ...effect, duration: { mode: "while", persistent } } : effect)) } : riders);
                if (lasting) continue;
                // (What its time leaves to the GM: "while the persistent damage lasts", "but can attempt a … save at the end of each of
                // its turns to end the effect".)
                if (/\bwhile\b|\bbut can\b|\bsave\b/i.test(clause)) notes.push(`The target ${clause}.`);
            } else if (!/^(?:full|double)?\s*(?:persistent )?(?:damage)?,?$/i.test(clause)) notes.push(`The target ${clause}.`);
        }
    }
    return { row, notes };
}

// The html → { components, choices, range, critical, success, notes } or null.
export function readSpellgun(html) {
    const text = plainText(html);
    const against = SPELLGUN.exec(text);
    if (!against) return null;
    const [before] = String(html).split(/<strong>\s*Critical Success\s*<\/strong>/i);
    const night = NIGHT.exec(String(html));
    // (Its damage in its critical success's row, not before: Reaper's Spellgun's "Critical Success The target takes 4d6 void and is
    // Drained 2 …" — the same on a success, "As critical success, but …", not doubled.)
    let formulas = night ? [] : formulasIn(before);
    const criticalHtml = String(html).split(/<strong>\s*Critical Success\s*<\/strong>/i)[1]?.split(/<strong>\s*Success\s*<\/strong>/i)[0] ?? "";
    const rowDamage = !formulas.length && !night && formulasIn(criticalHtml).length > 0;
    if (rowDamage) formulas = formulasIn(criticalHtml);
    const choices = night ? [{ label: "At night", formula: formulasIn(night[1])[0] }, { label: "At other times", formula: formulasIn(night[2])[0] }] : null;
    const damaged = formulas.length || choices?.[0]?.formula;
    const degrees = text.replace(/^.*?(?=\bCritical Success\b)/s, "");
    const criticalWords = /\bCritical Success\b\s*(.*?)(?=\bSuccess\b|$)/s.exec(degrees)?.[1] ?? "";
    const successWords = /(?:^|[.\s])Success\b\s*(.*?)(?=\bThe damage is\b|\bFailure\b|$)/s.exec(degrees.replace(/\bCritical Success\b/, "CRITICAL"))?.[1] ?? "";
    const persistent = (damaged ? (choices ? [choices[0].formula] : formulas).map(component) : []).find((entry) => entry.category === "persistent")?.type ?? null;
    const critical = degreeRow(criticalWords, persistent);
    // ("As critical success, except the target is Clumsy instead of slowed": the critical success's row, that condition swapped;
    // "As critical success, but for the drained condition, the target is Drained 1, or …": that condition's value.)
    const swap = /^\s*As critical success, except (?:the target is )?(\w+) instead of (\w+)/i.exec(successWords);
    const revalue = /^\s*As critical success, but for the (\w+) condition, the target is \w+ (\d+)([^.]*)\./i.exec(successWords);
    // (A success that is the critical success at full damage, with a smaller Speed penalty of N feet: the critical success's row,
    // that penalty in place of its own.)
    const smaller = /^\s*As critical success, except the target takes full damage(?: and takes an? [–-](\d+)-foot (\w+) penalty)?\.?\s*$/i.exec(successWords.trim());
    const success = smaller
        ? { row: { ...critical.row, modifiers: critical.row.modifiers.map((modifier) => (smaller[1] && /speed/i.test(modifier.selector ?? "") ? { ...modifier, value: -Number(smaller[1]) } : modifier)) }, notes: [] }
        : swap
        ? { row: { ...critical.row, effects: critical.row.effects.map((effect) => (effect.slug === swap[2].toLowerCase() ? { ...effect, slug: swap[1].toLowerCase() } : effect)) }, notes: [] }
        : revalue
            ? { row: { ...critical.row, effects: critical.row.effects.map((effect) => (effect.slug === revalue[1].toLowerCase() ? { ...effect, value: Number(revalue[2]) } : effect)) }, notes: revalue[3].trim() ? [`${revalue[1]} ${revalue[2]}${revalue[3]}.`] : [] }
            : degreeRow(successWords, persistent);
    // (No damage and nothing read on its degrees: not one.)
    const rides = (row) => (row.effects ?? []).length || (row.modifiers ?? []).length || row.forcedMovement;
    if (!damaged && !rides(critical.row) && !rides(success.row)) return null;
    return {
        against: against[1] === "AC" ? "ac" : against[1].split(" ")[0].toLowerCase(),
        multipliers: { critical: rowDamage ? 1 : 2, success: 1 },
        components: damaged ? (choices ? [choices[0].formula] : formulas).map(component) : [],
        choices,
        range: RANGE.exec(text)?.[1] ? `${RANGE.exec(text)[1]} feet` : null,
        critical: critical.row,
        success: success.row,
        notes: [...new Set([...critical.notes.map((note) => `Critical success: ${note}`), ...success.notes.map((note) => `Success: ${note}`)])]
    };
}

export function spellgunPlan(html, base) {
    const read = readSpellgun(html);
    if (!read) return null;
    const ids = read.components.map((entry) => entry.id);
    const hit = (row, multiplier) => ({ ...row, damage: ids.length ? { mode: "shared", multiplier, sourceComponentIds: ids } : none().damage });
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: read.notes.length ? "guided" : "automatic" },
        targeting: { target: "1 creature", range: read.range, area: null },
        trigger: { event: "use" },
        ownCheck: { kind: "attack", modifier: null, choose: ["spell", "firearm"] },
        resolution: {
            kind: "check",
            check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: read.against } },
            ...(read.components.length ? { sharedDamage: { rollOnce: true, components: read.components } } : {}),
            outcomes: { criticalSuccess: hit(read.critical, read.multipliers.critical), success: hit(read.success, read.multipliers.success), failure: none(), criticalFailure: none() }
        },
        ...(read.choices ? { damageChoices: read.choices } : {}),
        ...(read.notes.length ? { notes: read.notes, partial: true } : {})
    };
}

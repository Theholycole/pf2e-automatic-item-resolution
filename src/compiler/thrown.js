// An item thrown as a Strike that isn't a weapon PF2e can roll: Lady's Chalice's "This is a simple thrown weapon with a range of 5 feet …
// If it hits, it deals 2d6 spirit damage and 2 spirit splash damage", Sack of Rotten Fruit's "When you Strike a creature with a sack of
// rotten fruit, … the creature takes @Damage[1d4[bludgeoning]] damage and must attempt an @Check[fortitude|dc:15] save. On a failure, the
// creature is Sickened 1", Halcyon Heart's net "using your attack bonus for a ranged simple weapon. On a hit, … becomes Off-Guard and takes a
// –10-foot circumstance penalty to its Speeds until it Escapes, and on a critical hit, it's also Immobilized". Its user's own attack — a
// simple thrown weapon's: their Dexterity modifier and simple weapon proficiency (ownCheck.choose ["thrown"], scripts/poisons.js) — against
// the target's AC; a hit's damage (doubled on a critical hit) and conditions; the save its hit then calls for, plan.thenSave (the same
// card's second step at the creature hit). What else it says — splash, a flat check to ignite, who it works on — notes. Pure.

import { compileAbility } from "../../../pf2e-automatic-ability-resolution/src/compiler/index.js";
import { MODEL_VERSION } from "../../../pf2e-resolution-core/src/model/constants.js";
import { riderRow } from "./bombs.js";

const THROWN = /\b(?:by throwing it as a Strike|throw it with another action as a ranged attack|using your attack bonus for a ranged simple weapon|This is a simple thrown weapon|When you Strike a creature with an? [\w' -]+?, the [\w' -]+? is consumed|This is a ranged weapon attack)\b/i;
const RANGE = /\brange (?:increment )?of (\d+) feet\b|\brange increment of a thrown [\w' -]+? is (\d+) feet\b|\bthrow it at a creature within (\d+) feet\b/i;
const HIT = /^(?:If it hits|On a hit(?: against an? \w+)?|If you hit|When you Strike a creature with an? [\w' -]+?)\b|\bon a hit\b/i;
const TYPES = "acid|bludgeoning|cold|electricity|fire|force|mental|piercing|poison|slashing|sonic|spirit|vitality|void|bleed";
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const sentencesOf = (text) => String(text ?? "").replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "").split(/(?<=[.!?])\s+(?=[A-Z@])/).map((sentence) => sentence.trim()).filter(Boolean);
const plainOf = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
// (A note's words without Foundry's links: "@UUID[…]{Escape}" → "Escape", "[[/r 1d20+38 #Counteract]]{+38}" → "+38", "@Check[flat|dc:10]" →
// "DC 10 flat check".)
const readable = (sentence) => sentence
    .replace(/@Check\[flat\|dc:(\d+)[^\]]*\](?:\{[^}]*\})?/gi, "DC $1 flat check")
    .replace(/@Check\[(\w+)\|dc:(\d+)[^\]]*\](?:\{[^}]*\})?/gi, "DC $2 $1")
    .replace(/\[\[\/\w+ [^\]]*\]\]\{([^}]*)\}/g, "$1")
    .replace(/@\w+\[(?:[^[\]]|\[[^\]]*\])*\]\{([^}]*)\}/g, "$1")
    .replace(/@Damage\[\(?([^[\]]+?)\)?\[([\w,]+)\]\]/g, (_all, formula, type) => `${formula} ${type.replace(/,/g, " ")}`);

// Its damage on a hit: an @Damage link ("@Damage[1d4[bludgeoning]]", "@Damage[1[persistent,vitality]]") or words ("2d6 spirit damage").
function damageOf(sentence) {
    const linked = /@Damage\[\(?(\d+(?:d\d+)?(?:\s*[+-]\s*\d+)?)\)?\[(?:(persistent),)?(\w+)\]\]/i.exec(sentence);
    if (linked) return { formula: linked[1].replace(/\s+/g, ""), category: linked[2] ? "persistent" : null, type: linked[3].toLowerCase() };
    const said = new RegExp(String.raw`\b(\d+(?:d\d+)?(?:\+\d+)?) (?:(persistent) )?(${TYPES}) damage\b`, "i").exec(sentence);
    return said ? { formula: said[1], category: said[2] ? "persistent" : null, type: said[3].toLowerCase() } : null;
}

// The save the hit calls for, its sentence as the target's: "… must attempt an @Check[fortitude|dc:15] save. On a failure, the creature is
// Sickened 1" → the target's save, Sickened 1 its failure's; "the undead must succeed at a @Check[will|dc:20] or be unable to …".
function thenSaveOf(sentences, at, item, options) {
    const sentence = sentences[at];
    const must = /\bmust (?:attempt|succeed at|succeed on) an? (@Check\[(?:fortitude|reflex|will)\|[^\]]*\])(?:\{[^}]*\})?(?: save| saving throw)?(?: or (be|become) ([^.]+))?\./i.exec(sentence);
    if (!must) return null;
    const failure = !must[2] ? /^On a failure, the (?:creature|target) is (.+?)\.$/i.exec(sentences[at + 1] ?? "") : null;
    const words = must[2] ? `The target must succeed at a ${must[1]} save or ${must[2]} ${must[3]}.` : failure ? `The target must succeed at a ${must[1]} save or be ${failure[1]}.` : null;
    if (!words) return null;
    const read = compileAbility({ ...item, type: "action", system: { ...(item?.system ?? {}), description: { value: `<p><strong>Effect</strong> ${words}</p>` }, actionType: { value: "passive" }, actions: { value: null } } }, options);
    const targeting = { target: "the creature hit", range: null, area: null };
    const reads = read?.resolution?.kind === "save" && read.resolution.check?.against?.dc === "fixed" && ["failure", "criticalFailure"].some((degree) => (read.resolution.outcomes?.[degree]?.effects ?? []).length);
    if (reads) return { plan: { ...read, trigger: { event: "use" }, targeting }, used: failure ? [at + 1] : [] };
    // (A failure that's no condition, Life Salt's "or be unable to attack you as long as it continues taking the persistent vitality
    // damage": the save, its failure a note Effect on the creature.)
    const check = /@Check\[(fortitude|reflex|will)\|dc:(\d+)/i.exec(must[1]);
    if (!check || !must[2]) return null;
    const failed = { ...none(), noteEffects: [{ text: `Failed save: ${must[2]} ${must[3]}.` }] };
    return { plan: { ...(read ?? {}), source: item?.source ?? read?.source ?? { name: item?.name ?? null }, modelVersion: MODEL_VERSION, automation: { level: "guided" }, trigger: { event: "use" }, targeting, resolution: { kind: "save", check: { roll: "save", statistic: check[1].toLowerCase(), basic: false, against: { dc: "fixed", value: Number(check[2]) } }, outcomes: { criticalSuccess: none(), success: none(), failure: failed, criticalFailure: failed } } }, used: [] };
}

// The activation's (or item's) html, its base, the item → the attack plan, or null.
export function thrownPlan(html, base, item, options = {}) {
    const text = plainOf(html);
    const thrown = THROWN.exec(text);
    // (A weapon's own Strike is PF2e's; not an attack its activation makes of another kind, Rod of Razors' flechette.)
    if (!thrown || (item?.type === "weapon" && !/^This is a ranged weapon attack$/i.test(thrown[0]))) return null;
    const range = RANGE.exec(text);
    const sentences = sentencesOf(text);
    const at = sentences.findIndex((sentence) => HIT.test(sentence));
    if (at < 0) return null;
    const hitSentence = sentences[at];
    // (Its damage a sentence after the hit, Oil's "If the oil ignites, the target takes @Damage[1d6[fire]] damage": that, the flat check
    // before it a note.)
    const later = damageOf(hitSentence) ? null : sentences.slice(at + 1).findIndex((sentence) => /^If [^,]+, the target takes @Damage\[/i.test(sentence));
    const damage = damageOf(hitSentence) ?? (later >= 0 && later !== null ? damageOf(sentences[at + 1 + later]) : null);
    // (Its conditions on a hit, and what a critical hit adds: "…, and on a critical hit, it's also Immobilized until it Escapes".)
    const [ordinary, critical] = hitSentence.split(/,?\s*and on a critical hit,\s*/i);
    const rows = riderRow(ordinary.replace(/^.*?\b(?:which|it)\s+(becomes|is)\b/i, "The target $1"));
    const critRows = critical ? riderRow(`The target is ${critical.replace(/^it's also\s*/i, "").replace(/\.$/, "")}.`) : null;
    const then = thenSaveOf(sentences, at, item, options);
    // (Of a precious material, Rod of Razors' "The flechette is an adamantine weapon": the material in its damage's flavor, which PF2e's damage
    // roll and the core read for a weakness or resistance to it.)
    const material = /\bThe [\w' -]+? is an? (adamantine|silver|cold iron) weapon\b/i.exec(text)?.[1]?.toLowerCase().replace(" ", "-") ?? null;
    const flavored = (formula, type, category) => (material ? `${formula}[${[category, type, material].filter(Boolean).join(",")}]` : formula);
    const component = damage ? { id: "0", formula: flavored(damage.formula, damage.type, damage.category), type: damage.type, category: damage.category } : null;
    // (Its weapon traits, Rod of Razors' "the deadly d10 and volley 30 feet traits": deadly, one die more on a critical hit, not doubled — a
    // component of its own on that row alone; volley, –2 to the attack at a target within that distance, taken off on Apply.)
    const deadly = component ? /\bdeadly (d\d+)\b/i.exec(text)?.[1] ?? null : null;
    const volley = Number(/\bvolley (\d+) feet\b/i.exec(text)?.[1]) || null;
    const adjacent = /\binto an adjacent space\b/i.test(text);
    const deadlyComponent = deadly ? { id: "deadly", formula: flavored(`1${deadly}`, component.type, null), type: component.type, category: null } : null;
    const hit = (multiplier, extra = []) => ({ damage: component ? { mode: "shared", multiplier, sourceComponentIds: ["0", ...(deadly && multiplier === 2 ? ["deadly"] : [])], ...(deadly && multiplier === 2 ? { componentMultipliers: { deadly: 1 } } : {}) } : { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [...(rows.effects ?? []), ...extra], modifiers: [...(rows.modifiers ?? [])] });
    if (!component && !(rows.effects ?? []).length && !(rows.modifiers ?? []).length) return null;
    const used = new Set([at, ...(then?.used ?? []), ...(later >= 0 && later !== null ? [at + 1 + later] : [])]);
    const notes = [
        // (Splash beside the hit's damage, the hit's limits — "against an undead" — and a later damage's gate.)
        ...(/\bsplash damage\b/i.test(hitSentence) ? [`Its splash: ${/(\d+ \w+ splash damage[^.]*)/i.exec(hitSentence)?.[1] ?? "splash damage"} to each creature within 5 feet of the target (by hand).`] : []),
        ...(/^On a hit against an? (\w+)\b/i.test(hitSentence) ? [`Only against an ${/^On a hit against an? (\w+)\b/i.exec(hitSentence)[1]}.`] : []),
        ...(later >= 0 && later !== null ? [`Its damage only when ${/^If ([^,]+),/i.exec(sentences[at + 1 + later])[1]}.`] : []),
        ...(/\bdeadly (d\d+)\b/i.test(text) && !deadly ? [`Deadly ${/\bdeadly (d\d+)\b/i.exec(text)[1]}: a critical hit adds that die of damage (by hand).`] : []),
        ...sentences.filter((sentence, index) => !used.has(index) && /\b(?:damage|splash|flat check|@Check|DC|Escape|undead|attack|can't|counteract|deadly|volley)\b/i.test(sentence) && !THROWN.test(sentence)).map(readable)
    ];
    return {
        ...base,
        modelVersion: MODEL_VERSION,
        automation: { level: notes.length ? "guided" : "automatic" },
        targeting: { target: "1 creature", range: range ? `${range[1] ?? range[2] ?? range[3]} feet` : null, area: null },
        trigger: { event: "use" },
        // (Its range a range increment, as a weapon's is: –2 for each increment past the first, out to six — taken off on Apply; "throw it at a
        // creature within 20 feet", Halcyon Heart's, a limit with no penalty.)
        // (Lady's Chalice's "splashes … into an adjacent space": 5 feet, whatever its range.)
        ownCheck: { kind: "attack", modifier: null, choose: ["thrown"], ...(adjacent ? { within: 5 } : range && (range[1] ?? range[2]) ? { increment: Number(range[1] ?? range[2]) } : {}), ...(!adjacent && range?.[3] ? { within: Number(range[3]) } : {}), ...(volley ? { volley } : {}), ...(deadly ? { deadly } : {}) },
        resolution: {
            kind: "check",
            check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" }, modifier: null },
            ...(component ? { sharedDamage: { rollOnce: true, components: [component, ...(deadlyComponent ? [deadlyComponent] : [])] } } : {}),
            outcomes: { criticalSuccess: hit(2, critRows?.effects ?? []), success: hit(1), failure: none(), criticalFailure: none() }
        },
        ...(then ? { thenSave: then.plan } : {}),
        ...(notes.length ? { notes, partial: true } : {})
    };
}

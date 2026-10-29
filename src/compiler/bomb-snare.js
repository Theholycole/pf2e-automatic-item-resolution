// A snare of three bombs (2026-10-28, docs/needs.md): Bomb Snare's "You create a snare that causes three 3rd-level moderate alchemical bombs of
// the same type to explode when a creature triggers the snare. The target and all creatures in adjacent squares must attempt a DC 24 Reflex
// save, as the snare deals damage equal to three times the direct hit damage from one of the component bombs … Failure The creature takes full
// damage. It also takes all other effects of a direct hit from one of the component bombs (such as Off-Guard from bottled lightning or
// persistent damage from an acid flask). Critical Failure The creature takes double damage, plus all other effects of a direct hit". The
// snare's zone as src/compiler/snares.js reads it (its burst of a save on the creature that sets it off and those beside it, the ability
// module's zone.burst), on the ways card: one way for each of PF2e's damaging 3rd-level moderate bombs — options.bombs, its index of PF2e's
// alchemical bombs (bombIndex, built from the packs as options.spells is) —, each burst's save with that bomb's direct hit damage tripled
// (half on a success), and on a failure (double on a critical one) the rest of its hit: its riders and persistent damage, its own save after
// (the row's followUps, the core's second save card at the creature), and what PF2e can't play as note Effects (Vexing Vapor's flat check to
// concentrate, Tenderizer Grenade's softened resistances, Goo Grenade's Escape). A rider only some creatures take is a line. Pure.

import { bombRiders, compileBomb, gatedRiders, isBomb } from "./bombs.js";
import { sentencesOf } from "./lasting.js";
import { plainText } from "./rows.js";

const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const ITS_TURN_END = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "target-turn" };
const YOUR_TURN_END = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end", anchor: "source-turn" };
const timeOf = (value, unit) => ({ mode: "fixed", value, unit, expiry: "turn-start", anchor: "effect-start" });

// What else a bomb's hit does that its riders don't hold (its plain text, its html) → { notes (note Effects), lines (the zone card's),
// modifiers (a change to its riders' penalties), byHand (its persistent damage left to the GM) }. (A hit on an unattended fire, Water
// Bomb's, isn't a snare's: it sets off on creatures.)
const EXTRAS = [
    // (Vexing Vapor: a DC 5 flat check before each concentrate action of the creature hit, to its next turn's end.)
    [/\bOn a hit, the target must succeed at a @Check\[flat\|dc:(\d+)\] check before taking actions with the concentrate trait\. This lasts until the end of its next turn\b/i, (found) => ({ notes: [{ label: "Flat check to concentrate", text: `It must succeed at a DC ${found[1]} flat check before each action it takes with the concentrate trait.`, duration: ITS_TURN_END }] })],
    // (Tenderizer Grenade: its B/P/S resistances lowered by "an amount based on the bomb's type" — not given, the GM's — and off-guard to bites.)
    [/\bAny resistances the target has against bludgeoning, piercing, and slashing damage are reduced by an amount based on the bomb's type\. In addition, the target is [^.]*?\bOff-Guard against jaws Strikes, fangs Strikes, or similar Strikes with a creature's mouth\. These additional effects last until\s+the end of your next turn\b/i, () => ({ notes: [{ label: "Tenderized", text: "Its resistances to bludgeoning, piercing and slashing damage are lower (by the grenade's amount: the GM's), and it's off-guard against jaws, fangs and other Strikes made with a mouth.", duration: YOUR_TURN_END }] })],
    // (Sticky Algae Bomb: a glowing trail for an hour, to Track it by in water.)
    [/\bthe target is tagged by the bioluminescent substance and leaves a highly visible trail for the next hour\. The DC to Track a creature using this trail is (\d+), but the trail appears only in water\./i, (found) => ({ notes: [{ label: "Glowing trail", text: `It leaves a glowing trail behind it in water: DC ${found[1]} to Track it by the trail.`, duration: timeOf(1, "hours") }] })],
    // (Water Bomb: a flat check at DC 10 to end persistent acid or fire at once.)
    [/\bOn a hit, if the target is suffering from Persistent Acid or Persistent Fire Damage, it can attempt a flat check to end that persistent damage immediately\. As this is particularly effective assistance, the DC of the flat check is reduced from 15 to (\d+) for this check\./i, (found) => ({ notes: [{ label: "Doused", text: `If it's taking persistent acid or fire damage, it can attempt a DC ${found[1]} flat check right away to end it.`, duration: timeOf(1, "rounds") }] })],
    // (Steelscour: nothing on flesh — only a metal creature takes its persistent acid, the GM's to give.)
    [/\bIt deals (\d+d\d+) persistent acid damage that ignores up to (\d+) hardness from metal\. Steelscour has no effect on living or undead flesh\b/i, (found) => ({ byHand: true, lines: [`Only a metal creature that fails takes its ${found[1]} persistent acid damage (it ignores up to ${found[2]} of a metal's Hardness): give it by hand.`] })],
    // (Sulfur Bomb: a minute's immunity to sulfur bombs after.)
    [/\bCreatures hit with this bomb are temporarily immune to the effects of the bomb for (\d+) minutes?\./i, (found) => ({ notes: [{ label: "Immune to sulfur bombs", text: "It's immune to the effects of sulfur bombs for now.", duration: timeOf(Number(found[1]), "minutes") }] })],
    // (Goo Grenade: an Escape or three Interact actions end its penalty and persistent damage — the penalty's escape { dc }, the ability
    // module's; the rest a note Effect gone with the same Escape.)
    [/\bThe target can end any penalties, conditions, and persistent damage caused by the bomb by \[\[\/act escape[^\]]*\bdc=(\d+)[^\]]*\]\]\{Escaping\} or spending a total of (\w+) Interact actions to pry themselves free of the ooze\. These Interact actions don't have to be consecutive, and other creatures can provide the actions as well\./i, (found) => ({ escape: Number(found[1]), notes: [{ label: "Clinging goo", text: `An Escape (DC ${found[1]}) or ${found[2]} Interact actions in all (others can spend them too) free it: its Speed penalty and persistent acid end.`, duration: null, escape: { dc: Number(found[1]) } }] })]
];

function extrasOf(doc) {
    const html = String(doc.system?.description?.value ?? "");
    const plain = plainText(html);
    const extras = { notes: [], lines: [], escape: null, byHand: false };
    for (const [pattern, read] of EXTRAS) {
        const found = pattern.exec(plain) ?? pattern.exec(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
        if (!found) continue;
        const got = read(found);
        extras.notes.push(...(got.notes ?? []));
        extras.lines.push(...(got.lines ?? []));
        if (got.escape) extras.escape = got.escape;
        if (got.byHand) extras.byHand = true;
    }
    // (Water Bomb's nonlethal damage: the card's line, as the ability module's Swallow Whole says it.)
    if ((doc.system?.traits?.value ?? []).includes("nonlethal")) extras.lines.push("Its damage is nonlethal.");
    return extras;
}

// PF2e's alchemical bombs by name (lower case) → { name, level, damage { dice, die, type } | null, persistent { number, faces, type } | null,
// riders (its hit's row: effects, modifiers, forcedMovement), only { kind ("living", "void-healing"), effects } (a rider only some creatures
// take), followUp (its own save after a hit: { kind: "save", check, outcomes }, the core's row followUps), extras (extrasOf) }. docs: PF2e's
// equipment documents (or those of its bombs).
export function bombIndex(docs) {
    const index = {};
    for (const doc of docs ?? []) {
        if (!isBomb(doc) || !(doc.system?.traits?.value ?? []).includes("alchemical")) continue;
        const damage = doc.system?.damage ?? {};
        const dice = Number(damage.dice) || 0;
        const persistent = damage.persistent && Number(damage.persistent.number) > 0 ? { number: Number(damage.persistent.number), faces: Number(damage.persistent.faces) || null, type: damage.persistent.type ?? damage.damageType ?? "untyped" } : null;
        const compiled = compileBomb(doc);
        const { success } = bombRiders(doc);
        // (A rider of its hit only some creatures take, Ghost Charge's: not a critical hit's alone, Tallow Bomb's.)
        const gated = gatedRiders(plainText(doc.system?.description?.value));
        const save = compiled?.item?.save?.plan?.resolution;
        index[String(doc.name).toLowerCase()] = {
            name: doc.name,
            level: Number(doc.system?.level?.value) || 0,
            damage: dice > 0 ? { dice, die: damage.die || null, type: damage.damageType ?? "untyped" } : null,
            persistent,
            riders: { effects: success.effects, modifiers: success.modifiers, ...(success.forcedMovement ? { forcedMovement: success.forcedMovement } : {}) },
            only: gated?.rows?.success ? { kind: gated.only, effects: gated.rows.success.effects } : null,
            followUp: save?.kind === "save" && save.check ? { kind: "save", check: save.check, outcomes: save.outcomes } : null,
            extras: extrasOf(doc)
        };
    }
    return index;
}

// Its damage times a number: "2d6" × 3 → "6d6"; a flat 1 × 3 → "3".
const times = (damage, count) => (damage.die ? `${damage.dice * count}${damage.die}` : `${damage.dice * count}`);
const persistentWords = (persistent) => `${persistent.faces ? `${persistent.number}d${persistent.faces}` : persistent.number}`;
const persistentFormula = (persistent) => `${persistentWords(persistent)}[persistent,${persistent.type}]`;
const conditionWords = (effect) => `${effect.slug.replace(/(^|-)(\w)/g, (_all, dash, letter) => `${dash}${letter.toUpperCase()}`)}${effect.value ? ` ${effect.value}` : ""}`;
const saveWords = (check) => `DC ${check.against?.value} ${String(check.statistic).replace(/^\w/, (letter) => letter.toUpperCase())} save`;

// The burst's save for one bomb: its resolution.
function burstFor(resolution, bomb, count) {
    const components = bomb.damage ? [{ id: "bomb", formula: times(bomb.damage, count), type: bomb.damage.type, category: null }] : [];
    const shared = (multiplier) => (components.length ? { mode: "shared", multiplier, sourceComponentIds: ["bomb"] } : { mode: "none", multiplier: 0, sourceComponentIds: [] });
    // (Its persistent damage with the other effects of a direct hit: once, not doubled — nor at all where it's the GM's, Steelscour's.)
    const lasting = bomb.persistent && !bomb.extras.byHand ? bomb.persistent : null;
    const withPersistent = (damage) => (!lasting ? damage : damage.mode === "none" ? { mode: "formulas", formulas: [{ formula: persistentFormula(lasting) }], rollScope: "target" } : { mode: "mixed", shared: damage, formulas: [{ formula: persistentFormula(lasting) }], rollScope: "target" });
    // (Goo Grenade's penalty ended by an Escape: the modifier's own escape.)
    const modifiers = bomb.riders.modifiers.map((modifier) => (bomb.extras.escape ? { ...modifier, escape: { dc: bomb.extras.escape } } : modifier));
    const hit = (multiplier) => ({
        ...none(),
        damage: withPersistent(shared(multiplier)),
        effects: [...bomb.riders.effects],
        modifiers,
        ...(bomb.riders.forcedMovement ? { forcedMovement: bomb.riders.forcedMovement } : {}),
        ...(bomb.extras.notes.length ? { noteEffects: bomb.extras.notes.map((note) => ({ ...note })) } : {}),
        ...(bomb.followUp ? { followUps: [bomb.followUp] } : {})
    });
    return {
        ...resolution,
        sharedDamage: components.length ? { rollOnce: true, components } : null,
        outcomes: { criticalSuccess: none(), success: { ...none(), damage: shared(0.5) }, failure: hit(1), criticalFailure: hit(2) }
    };
}

// What a bomb's way says: "Bottled Lightning (Moderate): 6d6 electricity; on a failure, Off-Guard".
function wayName(bomb, count) {
    const rest = [
        ...bomb.riders.effects.map(conditionWords),
        ...(bomb.riders.modifiers.length ? ["its penalty"] : []),
        ...(bomb.persistent && !bomb.extras.byHand ? [`${persistentWords(bomb.persistent)} persistent ${bomb.persistent.type}`] : []),
        ...(bomb.followUp ? [`its ${saveWords(bomb.followUp.check)}`] : []),
        ...bomb.extras.notes.map((note) => note.label.toLowerCase())
    ];
    return `${bomb.name}: ${bomb.damage ? `${times(bomb.damage, count)} ${bomb.damage.type}` : "no direct damage"}${rest.length ? `; on a failure, ${rest.join(", ")}` : ""}`;
}

// The zone card's lines for a bomb's way.
function wayLines(bomb, count) {
    const only = bomb.only ? `${bomb.only.kind === "living" ? "Only a living creature" : "Only an undead creature or one with void healing"} that fails takes its hit's ${bomb.only.effects.map(conditionWords).join(", ")} too: give it by hand.` : null;
    return [
        `Three ${bomb.name} bombs: ${bomb.damage ? `${times(bomb.damage, count)} ${bomb.damage.type} damage` : "no direct damage"}, no splash; a failure takes the rest of a direct hit too.`,
        ...(bomb.followUp ? [`A creature that fails then attempts the bomb's own ${saveWords(bomb.followUp.check)} (its card follows).`] : []),
        ...(only ? [only] : []),
        ...bomb.extras.lines
    ];
}

const SNARE = [
    /^You create a snare that causes (three) (\d+)(?:st|nd|rd|th)-level (moderate) alchemical bombs of the same type to explode when a creature triggers the snare\.$/,
    /^The target and all creatures in adjacent squares must attempt a @Check\[reflex\|[^\]]*\bdc:(\d+)[^\]]*\] save, as the snare deals damage equal to three times the direct hit damage from one of the component bombs \([^)]*\) with no splash damage or other effects\.$/,
    /^Critical Success The creature is unaffected\.$/,
    /^Success The creature takes half damage and no other effects\.$/,
    /^Failure The creature takes full damage\.$/,
    /^It also takes all other effects of a direct hit from one of the component bombs \([^)]*\)\.$/,
    /^Critical Failure The creature takes double damage, plus all other effects of a direct hit \(as failure\)\.$/
];

// The snare's plan (snares.js's zone with its burst) and its context → the ways card of its bombs, or the same plan.
export function withBombSnare(plan, { kind, words, item, options }) {
    if (kind !== "consumable" || item?.name !== "Bomb Snare" || plan?.builtin !== "zone" || !plan.zone?.burst?.plan) return plan;
    const sentences = sentencesOf(words);
    if (sentences.length !== SNARE.length || !SNARE.every((pattern, index) => pattern.test(sentences[index]))) return plan;
    const [, , level, grade] = SNARE[0].exec(sentences[0]);
    const count = 3;
    // (Its craft requirements' "damaging" bomb: one with damage or persistent damage of its own — not Glue Bomb.)
    const bombs = Object.values(options?.bombs ?? {}).filter((bomb) => bomb.level === Number(level) && new RegExp(`\\(${grade}\\)$`, "i").test(bomb.name) && (bomb.damage || bomb.persistent)).sort((a, b) => a.name.localeCompare(b.name));
    if (bombs.length < 2) return plan;
    const burst = plan.zone.burst;
    const ways = bombs.map((bomb) => ({
        name: wayName(bomb, count),
        html: "",
        plan: { ...plan, zone: { ...plan.zone, burst: { ...burst, plan: { ...burst.plan, resolution: burstFor(burst.plan.resolution, bomb, count), notes: undefined } }, notes: [...(plan.zone.notes ?? []), ...wayLines(bomb, count)] } }
    }));
    return {
        ...plan,
        builtin: "ways",
        // (Its crafter's choice, made once: the ways card closes after it — Striking Snare's.)
        once: true,
        zone: undefined,
        actions: undefined,
        partial: undefined,
        automation: { level: "automatic" },
        targeting: { target: null, range: null, area: null },
        ways
    };
}

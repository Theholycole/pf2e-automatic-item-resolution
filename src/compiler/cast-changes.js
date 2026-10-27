// A spell cast with the item's changes (2026-10-27, docs/needs.md "A spell cast with the item's changes"): what a cast card's notes say that
// the card can play, or that's only its user's, the map's or the GM's to do — the user's rulings 1 and 2.
// - Lines of the cast card (plan.castLines, src/live/cast-card.js), not notes left to the table: Headwrap of Wisdom's Augury from "your own
//   instincts rather than an external source" (flavor), Faerie Queen's Bower's "with the protected area beginning from your square and
//   extending to a place of relative safety" and Helm of the Tides' "If you cast it at night, the spell's area becomes 100 feet long by 100
//   feet wide" (where and how big its user lays the area: the map's), Malefic Mirror's "The target must be within the owner's domain
//   (typically within 20 miles of the mirror)" (off the map, the GM's) and "The viewer's familiarity with the target doesn't affect the
//   spell's DC" (the card's DC as given), Perfection's First Step's 10 minutes of writing "at any time before you activate the treatise"
//   (its user's own, beforehand), Rime Foil's "Special" pairing (flavor), Wildwood Ink's recharge by its user's own casting of One with
//   Plants (its user's spell; the activations card warns the GM of a second use as of any other).
// - A rank by the part used, Fan of Soothing Winds' "the first two beads cast 4th-rank heal , the center two cast 3rd-rank heal , and the last
//   two cast 2nd-rank heal": plan.choices, the spell at each rank with its beads (the card's picker), "once per day per bead" six uses a day;
//   and "the save DC for an undead creature is 28", plan.dc. Its cone and its air trait stay notes, the spell module's to play.
// - Another DC on a condition its user knows, Rime Foil's "If the target has been damaged by a shattered plan in the last round, the DC is
//   instead DC 24": a second choice of the same spell at that DC.
// - A kineticist's own numbers, Gate Attenuator's "If you're a kineticist and the spell's element matches one of your kinetic elements, you can
//   use your impulse attack modifier instead of the spell attack modifier or your impulse DC instead of the spell DC": plan.castImpulse { said }
//   and each choice's element (from "air Gust of Wind earth Pummeling Rubble …") — live, scripts/casts.js casts at the better of the item's
//   and its caster's impulse numbers when the caster's kinetic elements include the spell's. "It gains that element's trait if it doesn't
//   already have it": a line when each spell has it already (options.spells' traits), else a note, the plan partial — the spell module adds
//   no trait to a cast.
// Innermost in the chains (src/compiler/permanent.js, index.js): src/compiler/honest.js withCastNotes then reads what's left. Pure.

const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const sentences = (note) => said(note).split(/(?<=[.!?])\s*(?=[A-Z])/).map((one) => one.trim()).filter(Boolean);

// (Each a sentence of its own; short runs of the items' words, wildcards between.)
const LINES = [
    /^You gain the effects of an? [A-Z][\w' -]+? spell, except that you receive the result\b[^.]*\binstincts\b[^.]*\.$/,
    /^The [\w' ]+? casts \d+(?:st|nd|rd|th)-rank [A-Z][\w' -]+?, with the protected area beginning\b[^.]*?\byour square\b[^.]*\.$/,
    /^If you cast it at night,[^.]*\barea becomes \d+ feet long by \d+ feet wide\.$/,
    /^The target must be within\b[^.]*\bdomain \(typically within \d+ miles\b[^.]*\.$/,
    /^The viewer's familiarity with the target\b[^.]*\bthe spell's DC\.$/,
    /^This activity takes \d+ minutes, but can occur at any time\b[^.]*\bactivate\b[^.]*\.$/,
    /^Special The [\w' ]+? pairs with the [\w' ]+?\s*\.$/,
    /^If you've already Activated the [\w' ]+?, you can supply a separate casting of [\w' -]+? to recharge\b[^.]*\.$/,
    /^This allows you to Activate the [\w' ]+? again\b[^.]*\.$/,
    /^You can do so multiple times\b[^.]*\bcast [\w' -]+? to recharge\b[^.]*\.$/
];
const BEADS = /^The rank of the spell depends on\b[^:]*\bbead\b[^:]*: (.+)\.$/i;
const BEAD = /\bthe (\w+) two(?: beads)? cast (\d+)(?:st|nd|rd|th)-rank\b/gi;
const UNDEAD_DC = /\bthe save DC for an undead creature is (\d+)\b/i;
const DC_IF = /^If (the target has been [^,]+?), the DC is instead DC (\d+)(?: (?:Fortitude|Reflex|Will))?\.$/i;
const IMPULSE = /If you're a kineticist\b[^.]*\bkinetic elements\b[^.]*\bimpulse attack modifier\b[^.]*\bimpulse DC\b[^.]*\./;
const BY_ELEMENT = /^The spell corresponds to the element\b[^:]*\bgains that element's trait\b[^:]*: (.+)$/i;
const ELEMENTS = ["air", "earth", "fire", "metal", "water", "wood"];

// The plan, the item's source (its text's bead count) and the compile options (PF2e's spells by name) → the plan with its changes read,
// or the same plan.
export function withCastChanges(plan, item = null, options = {}) {
    if (plan?.builtin !== "cast-spell" || !(plan.notes ?? []).length) return plan;
    const lines = [];
    const kept = [];
    let next = { ...plan };
    let unplayed = false;
    for (const note of plan.notes) {
        const left = [];
        for (const sentence of sentences(note)) {
            if (LINES.some((pattern) => pattern.test(sentence))) {
                lines.push(sentence);
                continue;
            }
            const beads = BEADS.exec(sentence);
            const ranks = beads ? [...beads[1].matchAll(BEAD)] : [];
            if (ranks.length > 1 && plan.spell?.uuid && !plan.choices?.length) {
                next.choices = ranks.map((match) => ({ spell: plan.spell, rank: Number(match[2]), when: `the ${match[1].toLowerCase()} two beads` }));
                // (Once a day per bead: as many uses a day as it has beads, "six cloud-shaped glass beads".)
                const count = /\b(two|three|four|five|six|seven|eight)\b[^.]*?\bbeads\b/i.exec(String(item?.system?.description?.value ?? ""))?.[1];
                const uses = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 }[String(count).toLowerCase()];
                if (uses && /\bper bead\b/i.test(plan.trigger?.frequency?.raw ?? "")) next = withUses(next, uses);
                continue;
            }
            // (Its DC, the undead's save: Heal's only save.)
            const undead = UNDEAD_DC.exec(sentence);
            if (undead && !Number.isFinite(Number(next.dc ?? NaN))) next.dc = Number(undead[1]);
            const dcIf = DC_IF.exec(sentence);
            if (dcIf && plan.spell?.uuid && Number.isFinite(Number(plan.dc)) && !plan.choices?.length) {
                next.choices = [{ spell: plan.spell, rank: plan.rank ?? null, dc: plan.dc }, { spell: plan.spell, rank: plan.rank ?? null, dc: Number(dcIf[2]), when: `if ${dcIf[1].replace(/^the target has been\b/i, "the target was")}` }];
                continue;
            }
            const byElement = BY_ELEMENT.exec(sentence);
            if (byElement && (plan.choices?.length ?? 0) > 1) {
                const elements = elementsOf(byElement[1], plan.choices);
                if (elements) {
                    next.choices = plan.choices.map((choice, index) => ({ ...choice, element: elements[index] }));
                    // (Each spell with its element's trait already: nothing more to give it.)
                    const lacking = plan.choices.filter((choice, index) => !(options.spells?.[String(choice.spell?.name ?? "").toLowerCase()]?.traits ?? []).includes(elements[index]));
                    if (!lacking.length) lines.push(sentence);
                    else {
                        unplayed = true;
                        left.push(sentence);
                    }
                    continue;
                }
            }
            left.push(sentence);
        }
        // (The kineticist's numbers, glued to the sentence before it in Gate Attenuator (Major)'s "…spell DC of 37.If you're a kineticist …".)
        const joined = left.join(" ");
        const impulse = IMPULSE.exec(joined);
        if (impulse) next.castImpulse = { said: impulse[0] };
        const rest = impulse ? joined.replace(impulse[0], " ").replace(/\s+/g, " ").trim() : joined;
        if (rest) kept.push(left.length === sentences(note).length && !impulse ? note : rest);
    }
    if (!lines.length && !next.choices && !next.castImpulse && next.dc === plan.dc && !unplayed) return plan;
    if (next.castImpulse && !next.choices?.some((choice) => choice.element)) delete next.castImpulse;
    if (kept.length) next.notes = kept;
    else delete next.notes;
    if (lines.length) next.castLines = [...(plan.castLines ?? []), ...lines];
    // (A trait the cast can't give: partial, its sentence a note.)
    if (unplayed) {
        next.partial = true;
        next.automation = { ...(next.automation ?? {}), level: "guided" };
    }
    return next;
}

// Its spells' elements in the choices' order, from "air Gust of Wind earth Pummeling Rubble …"; null unless each is named.
function elementsOf(list, choices) {
    const text = ` ${list.toLowerCase()} `;
    const found = choices.map((choice) => {
        const at = text.indexOf(` ${String(choice.spell?.name ?? "").toLowerCase()} `);
        const before = at > 0 ? text.slice(0, at).trim().split(/\s+/).at(-1) : null;
        return ELEMENTS.includes(before) ? before : null;
    });
    return found.every(Boolean) && new Set(found).size === found.length ? found : null;
}

const withUses = (plan, max) => {
    const frequency = { ...plan.trigger.frequency, max };
    return { ...plan, trigger: { ...plan.trigger, frequency }, ...(plan.item?.activation?.frequency ? { item: { ...plan.item, activation: { ...plan.item.activation, frequency } } } : {}) };
};

// The better of the item's numbers and a kineticist's impulse ones for the chosen spell (Gate Attenuator's), or the item's: { dc, attack,
// impulse } — impulse true when either is its caster's. elements: its caster's kinetic elements; dc, attack: its impulse DC and modifier.
export function impulseNumbers({ dc = null, attack = null } = {}, choice = null, { elements = [], dc: impulseDC = null, attack: impulseAttack = null } = {}) {
    const element = choice?.element ?? null;
    if (!element || !elements.includes(element)) return { dc, attack, impulse: false };
    const betterDC = Number.isFinite(Number(impulseDC)) && Number(impulseDC) > Number(dc ?? 0) ? Number(impulseDC) : dc;
    const betterAttack = Number.isFinite(Number(impulseAttack)) && impulseAttack !== null && Number(impulseAttack) > Number(attack ?? -Infinity) ? Number(impulseAttack) : attack;
    return { dc: betterDC, attack: betterAttack, impulse: betterDC !== dc || betterAttack !== attack };
}

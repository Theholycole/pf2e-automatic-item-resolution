// An activation that costs its user a spell slot (a Magic+ scepter's cost line, a slot of some lowest rank): plan.spend.spellSlot. The
// card spends one of its user's slots when it's applied (scripts/spend.js), and refuses with none left.
// - What it does the same whatever the slot: spellSlot { min } — the lowest slot at that rank or above that its user has left.
// - What scales with the slot's rank (healing dice for each of its ranks, an aura lasting a round for each, a counteract at its rank): the
//   ways card, one way per rank from the
//   lowest to 10th, each compiled with that rank's numbers in its words, each spending a slot of that rank — spellSlot { rank }.
// Pure.

const ORDINAL = String.raw`(\d+)(?:st|nd|rd|th)`;
// (Or in other words, "a spell slot of rank 4 or higher".)
const SLOT = String.raw`a spell slot of (?:at least ${ORDINAL} rank|rank (\d+) or higher)`;
const COST = new RegExp(String.raw`<p>\s*<strong>\s*Cost\s*<\/strong>\s*${SLOT}\s*<\/p>`, "i");
const COST_PLAIN = new RegExp(String.raw`\bCost ${SLOT}\b`, "i");

// The activation's html (or plain text) → { min } or null.
export function readSlotCost(text) {
    const said = COST.exec(String(text ?? "")) ?? COST_PLAIN.exec(String(text ?? ""));
    return said ? { min: Number(said[1] ?? said[2]) } : null;
}

// Its words for one rank: the html with the cost line gone and each "rank of the spell" filled in, and whether any was (scales).
const OF_RANK = String.raw`rank of the (?:expended spell|spell you expended)`;
export function atRank(html, rank) {
    let scales = false;
    const swap = (pattern, replace) => (text) => text.replace(pattern, (...match) => {
        scales = true;
        return replace(...match);
    });
    const steps = [
        // (Healing or damage dice for each rank of the slot's spell: that many dice.)
        swap(/@Damage\[(\d+)d(\d+)(\[[^\]]*\])\](\{[^}]*\})? (Hit Points|damage) per rank of the (?:expended )?spell\b/gi, (all, count, faces, kind, label, what) => `@Damage[${Number(count) * rank}d${faces}${kind}] ${what}`),
        // (An aura or an effect lasting a round for each rank of the slot's spell, said a few ways: that many rounds.)
        swap(new RegExp(String.raw`\b(lasts )?(?:for )?a number of rounds[^.<]*?equal to[^.<]*?\b${OF_RANK}\b`, "gi"), (all, lasts) => `${lasts ?? ""}for ${rank} round${rank === 1 ? "" : "s"}`),
        // (A counteract at the expended slot's rank: its counteract rank.)
        swap(new RegExp(String.raw`\busing the ${OF_RANK} as the spell rank\b[^.]*?\bfor your counteract\b[^.]*?\bmodifier\b`, "gi"), () => `with a counteract rank of ${rank}`)
    ];
    // (Its effect after the block's rule, with no Effect heading of its own — a Magic+ statblock's: the heading, so its Frequency line
    // isn't read as running into the effect's first sentence.)
    let text = String(html ?? "").replace(COST, "");
    if (!/<strong>\s*Effect\s*<\/strong>/i.test(text)) text = text.replace(/<hr\s*\/?>\s*<p>/i, (rule) => `${rule}<strong>Effect</strong> `);
    for (const step of steps) text = step(text);
    return { html: text, scales };
}

// The activation's plan with its slot cost: one plan spending the lowest slot, or (a rank's numbers) the ways card of its ranks.
// compileAt(html) compiles the activation in those words (src/compiler/permanent.js) → its plan or null.
export function withSlotCost(plan, html, base, compileAt) {
    const cost = readSlotCost(html);
    if (!cost) return plan;
    const scaled = atRank(html, cost.min);
    if (!scaled.scales) return plan ? { ...plan, spend: { ...(plan.spend ?? {}), spellSlot: { min: cost.min } } } : plan;
    const ways = [];
    for (let rank = cost.min; rank <= 10; rank++) {
        const { html: words } = atRank(html, rank);
        const wayPlan = compileAt(words);
        // (A way that's only a reminder for its rank's time is still one: the slot spent, its Effect timed — a Rotting Aura's rounds.)
        if (!wayPlan || wayPlan.builtin === "no-effect") return plan ? { ...plan, spend: { ...(plan.spend ?? {}), spellSlot: { min: cost.min } } } : plan;
        ways.push({ name: `A rank ${rank} slot`, html: words, plan: { ...wayPlan, spend: { ...(wayPlan.spend ?? {}), spellSlot: { rank } } } });
    }
    const partial = ways.some((way) => way.plan.partial || way.plan.noteOnly);
    return { ...base, builtin: "ways", automation: { level: partial ? "guided" : "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use", ...(plan?.trigger?.frequency ? { frequency: plan.trigger.frequency } : {}) }, ways, ...(partial ? { partial: true } : {}) };
}

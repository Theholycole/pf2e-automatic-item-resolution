// A form of one of two sizes, each its own rank and time (2026-10-27, docs/needs.md): Cloak of the False Foe's Cryptid Shape, "The transformation
// also grants the effects of either a 3rd-rank Humanoid Form spell that lasts for 1 hour if you turn into a Medium cryptid, or a 5th-rank
// humanoid form spell that lasts for 10 minutes if you turn into a Large cryptid." → the cast card, its picker the two (rank 3 for a Medium
// cryptid, rank 5 for a Large), each with its own time (choice.castDuration, set on the spell's Effects as scripts/casts.js does the item's).
// The cryptid's look and its wounds, and the DC 30 Medicine check that sees through them, are lines of the card — information, the GM's. Pure.

const SHAPE = /\bThe transformation also grants the effects of either an? (\d+)(?:st|nd|rd|th)-rank (?:@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.\w+)\]\{)?Humanoid Form\}? spell that lasts for (\d+) (hours?|minutes?) if you turn into a (Medium) cryptid, or an? (\d+)(?:st|nd|rd|th)-rank humanoid form spell that lasts for (\d+) (hours?|minutes?) if you turn into a (Large) cryptid\./i;
const WOUNDS = /\bWhile you're in cryptid form, any wounds left by your spells and Strikes appear to be the result of the cryptid's unarmed attacks and special abilities to a casual inspection\. This doesn't alter the actual damage type inflicted or the effects of such attack\. Someone closely studying the wounds can, with a successful @Check\[medicine\|dc:(\d+)\] check, realize that magic has altered the appearance of the injuries\./i;
const unit = (word) => (/^hour/i.test(word) ? "hours" : "minutes");

// The activation's note-only plan, its html and PF2e's spells by name → the cast card's plan, or the same plan.
export function withCryptidShape(plan, html, spells = {}) {
    const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const shape = plan?.noteOnly ? SHAPE.exec(text) : null;
    const spell = spells["humanoid form"];
    if (!shape || !spell) return plan;
    const wounds = WOUNDS.exec(text);
    const choice = (rank, value, words, size) => ({ spell: { uuid: shape[2] ?? spell.uuid, name: spell.name }, rank: Number(rank), self: true, area: false, targets: false, when: `a ${size} cryptid, ${value} ${words.toLowerCase()}`, castDuration: { value: Number(value), unit: unit(words) } });
    const choices = [choice(shape[1], shape[3], shape[4], shape[5]), choice(shape[6], shape[7], shape[8], shape[9])];
    const { noteOnly, resolution, targeting, ...rest } = plan;
    return {
        ...rest,
        builtin: "cast-spell",
        spell: choices[0].spell,
        rank: choices[0].rank,
        dc: null,
        attack: null,
        tradition: null,
        self: true,
        area: false,
        targets: false,
        choices,
        automation: { level: "automatic" },
        notes: [
            "The cloak reshapes its wearer into a cryptid feared in local lore (or one its crafter imagined).",
            ...(wounds ? [`While in cryptid form, wounds from its spells and Strikes look like the cryptid's attacks to a casual look (their damage unchanged); a DC ${wounds[1]} Medicine check studying them sees the magic (the GM's).`] : [])
        ]
    };
}

// Paradigm Cube's Change Paradigm (2026-10-28, its allies' bonuses the ability module's zone.inside who "allies"): "Select one of the six
// colors of the cube that hasn't been activated today, then roll the cube on the ground at your feet and attempt a DC 11 flat check. On a
// success, your chosen color activates as detailed below. On a failure, roll 1d6 to randomly determine which effect manifests … If you spend
// 1 Mythic Point as part of this activation, your chosen color automatically activates without requiring a flat check, and the chosen
// effect's mythic enhancement unlocks. Once activated, the illusion created fills a 60-foot emanation from you and lasts for 1 minute."
// The ways card: each colour picked (its own once a day, the colour's key shared with its mythic way), its flat check the table card's
// d20 (11 or more the colour picked, less a d6 table of the six); or with a Mythic Point (plan.spend), no flat check and its mythic
// enhancement too. Each colour is the ability module's zone on its user for the minute: its allies' +2 item bonus inside (PF2e's
// FlatModifier, predicated on the action), a mythic enhancement's checks "at mythic proficiency" a proficiency modifier of the creature's
// level + 10 (PF2e keeps the better proficiency, as The Vision's master Lore is read), Yellow's frightened foes Slowed 1 (PF2e's condition
// granted while they're frightened), Blue's and the Rage's temporary Hit Points the words of the Effect inside. Its lighting, its
// darkness, the map's; tapping the colour again ends it, a card line. Pure.

const plain = (html) => String(html ?? "").replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/@Template\[[^\]]*\](?:\{([^}]*)\})?/g, (all, label) => label ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const sentences = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);
const item = (selector, value, predicate) => ({ key: "FlatModifier", selector, type: "item", value, ...(predicate ? { predicate } : {}) });
// (At mythic proficiency: its proficiency its level + 10, PF2e taking the better of it and its own.)
const mythic = (selector, predicate) => ({ key: "FlatModifier", selector, type: "proficiency", slug: "paradigm-cube-mythic", label: "Paradigm Cube (mythic proficiency)", value: "@actor.level + 10", ...(predicate ? { predicate } : {}) });
const toggle = (option, label) => ({ key: "RollOption", domain: "all", option, toggleable: true, label });
const SLOWED = "Compendium.pf2e.conditionitems.Item.xYTAsEpcJE1Ccni3";
const ILLUSION = "paradigm-cube:illusion-or-confusion";

// The six colours: each its sentences before its enhancement (its colour's words, then its allies' bonus), its enhancement's, and what they
// make — the allies' rules and words, the enhancement's for allies and for foes, and the card's lines (its light, the map's).
const COLOURS = [
    {
        colour: "Red",
        before: [/^Red is the color of anger and impatience\.$/, /^A crimson haze covers the area, setting everyone within the area on edge\.$/, /^Allies in the area gain a \+(\d) item bonus to Intimidation checks to Coerce\.$/],
        enhancement: /^Allies' saving throws against mental and incapacitation effects are attempted at mythic proficiency\.$/,
        allies: (bonus) => ({ rules: [item("intimidation", bonus, ["action:coerce"])], words: `+${bonus} item bonus to Intimidation checks to Coerce` }),
        mythicAllies: { rules: [mythic("saving-throw", [{ or: ["item:trait:mental", "item:trait:incapacitation"] }])], words: "its saves against mental and incapacitation effects at mythic proficiency" },
        lines: ["A crimson haze: everyone inside is on edge."]
    },
    {
        colour: "Orange",
        before: [/^Orange is the color of glory and opulence\.$/, /^The area becomes bedecked in elegant images, glamorous decor, and spectacular displays, and becomes brightly lit\.$/, /^Allies in the area gain a \+(\d) item bonus to Performance checks, and allies who Rage in the area gain an additional (\d+) temporary Hit Points above what they would normally gain\.$/],
        enhancement: /^Allies' Perception checks and Diplomacy checks to Make an Impression or Request are attempted at mythic proficiency\.$/,
        allies: (bonus, rage) => ({ rules: [item("performance", bonus)], words: `+${bonus} item bonus to Performance checks; Raging here, ${rage} more temporary Hit Points than its Rage gives (add them)` }),
        mythicAllies: { rules: [mythic("perception"), mythic("diplomacy", [{ or: ["action:make-an-impression", "action:request"] }])], words: "its Perception checks, and its Diplomacy to Make an Impression or Request, at mythic proficiency" },
        lines: ["Elegant images and spectacular displays; the area is brightly lit (the map's lighting)."]
    },
    {
        colour: "Yellow",
        before: [/^Yellow is the color of terror and discord\.$/, /^The area's illumination, if any, takes on an unnerving, murky yellow tinge and becomes dim light\.$/, /^Allies in the area gain a \+(\d) item bonus to Intimidation checks to Demoralize\.$/],
        enhancement: /^Enemy creatures in the area who gain the frightened condition become Slowed 1 as long as they remain frightened, as the yellow light seems to cling to them and slow their movements to a nightmarish crawl\.$/,
        allies: (bonus) => ({ rules: [item("intimidation", bonus, ["action:demoralize"])], words: `+${bonus} item bonus to Intimidation checks to Demoralize` }),
        mythicFoes: { rules: [{ key: "GrantItem", uuid: SLOWED, predicate: ["self:condition:frightened"], reevaluateOnUpdate: true, allowDuplicate: false, onDeleteActions: { granter: "cascade", grantee: "cascade" } }], words: "Frightened here, it's Slowed 1 while it stays frightened (the yellow light clinging to it; still frightened once it leaves, keep it Slowed till that ends)" },
        lines: ["Its light, if any, a murky yellow dim light (the map's lighting)."]
    },
    {
        colour: "Green",
        before: [/^Green is the color of logic and clarity\.$/, /^Visible text in the area becomes softly illuminated when read\.$/, /^Allies in the area gain a \+(\d) item bonus to Lore checks to Recall Knowledge\.$/],
        enhancement: /^Attempts made by allies to counteract or disbelieve illusions or to save against confusion effects are attempted at mythic proficiency\.$/,
        allies: (bonus) => ({ rules: [item("lore-skill-check", bonus, ["action:recall-knowledge"])], words: `+${bonus} item bonus to Lore checks to Recall Knowledge` }),
        mythicAllies: { rules: [toggle(ILLUSION, "Disbelieving an illusion or saving against confusion"), mythic(["perception", "saving-throw"], [ILLUSION])], words: "disbelieving illusions and saving against confusion at mythic proficiency (its toggle on for those), and its counteract checks against illusions too (its level + 10 for their proficiency)" },
        lines: ["Visible text inside glows softly as it's read."]
    },
    {
        colour: "Blue",
        before: [/^Blue is the color of debilitating sadness and fractures in one's emotional facade\.$/, /^Somber light replaces the normal lighting, filling the area with dim illumination, and moods darken\.$/, /^Allies in the area gain a \+(\d) item bonus to Perception checks to Sense Motive\.$/],
        enhancement: /^An enemy in the area that fails an attack roll, saving throw, or skill check becomes Stupefied 1 from sadness until the end of their next turn \(Stupefied 2 on a critical failure\)\.$/,
        allies: (bonus) => ({ rules: [item("perception", bonus, ["action:sense-motive"])], words: `+${bonus} item bonus to Perception checks to Sense Motive` }),
        mythicFoes: { rules: [], words: "When it fails an attack roll, a saving throw or a skill check here, it's Stupefied 1 until the end of its next turn, Stupefied 2 on a critical failure (apply it then)" },
        lines: ["Somber dim light in place of its lighting (the map's lighting)."]
    },
    {
        colour: "Indigo",
        before: [/^Indigo is the color of ignorance and the unknown\.$/, /^The area becomes cloaked in darkness, as per the darkness spell heightened to (\d)th rank\.$/, /^Allies in the area gain a \+(\d) item bonus to Stealth checks to Hide\.$/],
        enhancement: /^Allies' saving throws against fear, curse, or visual effects are attempted at mythic proficiency\.$/,
        allies: (_rank, bonus) => ({ rules: [item("stealth", bonus, ["action:hide"])], words: `+${bonus} item bonus to Stealth checks to Hide` }),
        mythicAllies: { rules: [mythic("saving-throw", [{ or: ["item:trait:fear", "item:trait:curse", "item:trait:visual"] }])], words: "its saves against fear, curse and visual effects at mythic proficiency" },
        lines: [(rank) => `Darkness as ${rank}th-rank Darkness: darkvision can't see through it, greater darkvision can (the map's lighting).`]
    }
];

const EFFECT = [
    /^Select one of the six colors of the cube that hasn't been activated today, then roll the cube on the ground at your feet and attempt a @Check\[flat\|dc:(\d+)\]\.$/,
    /^On a success, your chosen color activates as detailed below\.$/,
    /^On a failure, roll (1d6) to randomly determine which effect manifests; if the result of the roll is a color that's already been activated today, no effect occurs\.$/,
    /^The paradigm cube then immediately returns to your hand\.$/,
    /^If you spend 1 Mythic Point as part of this activation, your chosen color automatically activates without requiring a flat check, and the chosen effect's mythic enhancement unlocks\.$/,
    /^Once activated, the illusion created fills a @Template\[(?:type:)?emanation\|distance:(\d+)\] from you and lasts for (\d+) (minutes?|rounds?)\.$/,
    /^You can end the effect early by activating Change Paradigm again by tapping the currently active color\.$/
];
const UNITS = { minute: "minutes", minutes: "minutes", round: "rounds", rounds: "rounds" };
const PARAGRAPH = /<p>\s*<strong>\s*(\d)\s*[—–-]\s*(\w+)\s*<\/strong>\s*\(([^)]*)\)([\s\S]*?)<strong>\s*Mythic Enhancement:\s*<\/strong>([\s\S]*?)<\/p>/g;

// The activation's html, { base, info } → the ways card, or null.
export function paradigmCubePlan(html, { base, info }) {
    const text = String(html ?? "");
    const effect = /<strong>\s*Effect\s*<\/strong>([\s\S]*?)<\/p>/.exec(text);
    const said = effect ? sentences(effect[1].replace(/<[^>]+>/g, " ").replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/\s+/g, " ").trim()) : [];
    if (said.length !== EFFECT.length) return null;
    const found = said.map((sentence, index) => EFFECT[index].exec(sentence));
    if (!found.every(Boolean)) return null;
    const [flat, , random, , , area] = found;
    const paragraphs = [...text.matchAll(PARAGRAPH)];
    if (paragraphs.length !== COLOURS.length) return null;
    const lasts = { mode: "fixed", value: Number(area[2]), unit: UNITS[area[3]], expiry: "turn-start", anchor: "effect-start" };
    const read = [];
    for (const [index, [, number, colour, traits, before, after]] of paragraphs.entries()) {
        const spec = COLOURS[index];
        const words = sentences(plain(before));
        const matches = words.map((sentence, at) => spec.before[at]?.exec(sentence) ?? null);
        const enhanced = spec.enhancement.exec(plain(after));
        if (Number(number) !== index + 1 || colour !== spec.colour || words.length !== spec.before.length || !matches.every(Boolean) || !enhanced) return null;
        // (Its numbers, in its sentences' order: the bonus, Orange's Rage, Indigo's Darkness rank.)
        const numbers = matches.flatMap((match) => match.slice(1)).map(Number);
        read.push({ ...spec, traits: traits.split(/,\s*/).map((trait) => trait.trim().toLowerCase()), numbers });
    }
    const zoneOf = (spec, withMythic) => {
        const allies = spec.allies(...spec.numbers);
        const inside = [
            { who: "allies", label: spec.colour, text: `${spec.colour} paradigm: ${allies.words}${withMythic && spec.mythicAllies ? `; ${spec.mythicAllies.words}` : ""}.`, rules: [...allies.rules, ...(withMythic && spec.mythicAllies ? spec.mythicAllies.rules : [])] },
            ...(withMythic && spec.mythicFoes ? [{ who: "foes", label: spec.colour, text: `${spec.colour} paradigm: ${spec.mythicFoes.words}.`, rules: spec.mythicFoes.rules }] : [])
        ];
        const lines = spec.lines.map((line) => (typeof line === "function" ? line(spec.numbers[0]) : line));
        return {
            ...base,
            automation: { level: "automatic" },
            trigger: { event: "use" },
            builtin: "zone",
            actions: null,
            traits: [...new Set([...(base?.traits ?? []), ...spec.traits])],
            targeting: { target: null, range: null, area: { type: "emanation", value: Number(area[1]) } },
            zone: { area: { type: "emanation", value: Number(area[1]) }, centre: "self", range: null, lasts, untilReused: false, concealed: false, terrain: [], others: false, hazard: null, saves: [], damage: [], effect: null, modifiers: [], inside, notes: [...lines, "Its user can end it early by tapping the active colour again (end the zone)."] },
            item: { ...info }
        };
    };
    const tableOf = (die, rows, notes) => ({ ...base, automation: { level: "automatic" }, trigger: { event: "use" }, builtin: "table", targeting: { target: null, range: null, area: null }, table: { die, rows }, notes, item: { ...info } });
    const randomly = tableOf(random[1], read.map((spec, index) => ({ low: index + 1, high: index + 1, text: `${index + 1}: ${spec.colour}`, plan: zoneOf(spec, false) })), ["A colour at random. If it's one already used today, nothing happens (end its zone)."]);
    const dc = Number(flat[1]);
    const daily = { max: 1, per: "day", raw: "once per day per color" };
    const ways = [
        ...read.map((spec) => ({
            name: `${spec.colour}: the DC ${dc} flat check`,
            html: `<p>${spec.colour} picked: the flat check.</p>`,
            plan: tableOf("1d20", [{ low: 1, high: dc - 1, text: `Failure: ${random[1]} for a colour at random`, plan: randomly }, { low: dc, high: 20, text: `Success: ${spec.colour} activates`, plan: zoneOf(spec, false) }], [`Its DC ${dc} flat check, the cube rolled at its user's feet (back in their hand after): ${dc} or more, ${spec.colour} activates; less, ${random[1]} picks the colour.`]),
            frequency: daily,
            frequencyKey: spec.colour.toLowerCase()
        })),
        ...read.map((spec) => ({
            name: `${spec.colour}, spending a Mythic Point (its mythic enhancement)`,
            html: `<p>${spec.colour}, with its mythic enhancement.</p>`,
            plan: { ...zoneOf(spec, true), spend: { mythicPoints: 1 } },
            frequency: daily,
            frequencyKey: spec.colour.toLowerCase()
        }))
    ];
    return {
        builtin: "ways",
        targeting: { target: null, range: null, area: null },
        trigger: { event: "use", frequency: { max: 6, per: "day", raw: "six times per day (but only once per day per color)" } },
        once: true,
        ways
    };
}

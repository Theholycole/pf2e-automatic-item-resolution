// Ships and vehicles (2026-10-27, docs/needs.md "Ships and vehicles"): PF2e's vehicle actors on the map, and what an item does to one.
// - A vehicle an item becomes, linked to PF2e's vehicles: Marvelous Miniature (Boat)'s "It transforms into a Cutter. The cutter lasts 1
//   day.", Folding Boat's "The other form is a Rowboat" (the greater one's a Cutter "piloted and crewed by ethereal sailors"), Anglerfish
//   Lantern (Submersible)'s "The lantern transforms into a Bathysphere for 1 hour". The ability module's conjure builtin, as for a creature
//   (src/compiler/conjured.js, which leaves vehicles to this): its token beside its user for its time, dismissed from its card (folding the
//   boat back), gone at 0 Hit Points (broken). Or one the text gives the numbers of, a marker token: Feather Token (Swan Boat)'s boat with "a
//   Speed of 50 feet" on the water for a day, Wind-Up Cart's "AC 15, Hardness 2, 24 Hit Points" at a speed of 30 feet for its minute.
// - A note Effect on the vehicle its user targets ("1 vehicle", src/live/route.js), for its time: Feather Token (Anchor)'s stopped boat for a
//   day, Kraken Figurehead's spectral tentacles for 10 minutes (an aura the ship's own length: no zone reads a vehicle's length), Feather Token
//   (Fan)'s and Wind At Your Back's Speed bonus (PF2e's vehicles' Speeds are words no rule changes) — their other way the ways card's (Gust
//   of Wind, the cast card's; a group's longer Hustle, its user's note Effect).
// - About Face!'s ship turned about: its token's turn on the map, a line of its card.
// - Mariner's Mien's Set the Course: Quickened for its minute, what the extra action is for and its end on leaving the vehicle a note Effect
//   beside it.
// Every sentence of the effect read: a line of the card (the map's, its user's own, an object's or out of combat), or a note and the plan
// partial. Pure.

const VEHICLE = /@UUID\[(Compendium\.pf2e\.vehicles\.Actor\.[A-Za-z0-9]{16})\]\{([^}]+)\}/;
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const plainOf = (html) => String(html ?? "").replace(/@Check\[(\w+)\|dc:(\d+)[^\]]*\](?:\{[^}]*\})?/gi, "DC $2 $1").replace(/@Template\[(\w+)\|distance:(\d+)\]/gi, "$2-foot $1").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const sentencesOf = (text) => text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((one) => one.trim()).filter(Boolean);
// (The effect's words: an activation's from its Effect on, a consumable's after its Activate line; its Craft Requirements left out.)
// (An ammunition's "Activate Strike from a ranged weapon" too, Feather Token (Swan Boat)'s.)
const effectOf = (plain) => plain.replace(/\s*\bCraft Requirements\b.*$/s, "").replace(/^.*?\bEffect\b\s*/s, "").replace(/(?:^|(?<=[.!?]\s))\s*Activate\s+(?:\d|[A-Z]\b)?\s*(?:Strike from an? (?:ranged|melee|thrown) weapon\s*)?(?:\([^)]*\))?\s*/, " ").trim();
const HOURS = { day: 24, days: 24, hour: 1, hours: 1 };
const fixed = (value, unit) => ({ mode: "fixed", value, unit, expiry: "turn-start", anchor: "effect-start" });

// What every feather token or marvelous miniature says of them all: flavor.
const FLAVOR = [/^Every marvelous miniature is\b/, /^The miniature is made from\b/, /^Marvelous miniatures sometimes come packaged\b/, /^Activating a marvelous miniature causes it\b/, /^Each miniature can be activated only once\b/,
    /^Each feather token appears to be\b/, /^The feather's shaft\b/, /^Activating a feather token causes it\b/, /^Each feather can be activated only once\b/, /^This simple carved box can fold or unfold\b/, /^This primitive device can be cobbled together\b/];
// The lines of a vehicle's card: where it can be used (the map's), its forms and what's stored (objects), its crew and capacity, how it ends.
const LINES = [
    /\bcan be activated only when (?:tossed|shot) into a large body of water\b/i,
    /^The [\w' ]+? can take two shapes\.$/i,
    /^The first is a wooden box\b[^.]*\bcan store up to \d+ Bulk of items\.$/i,
    /^If the chosen form can't fit in the space, it takes the largest shape that does fit\.$/i,
    /^You can activate the boat again to revert it\b[^.]*\.$/i,
    /^If the boat is occupied, the item can't be activated\.$/i,
    /^Much like a magical structure, a [\w' ]+? can't harm creatures when it unfolds\b[^.]*\.$/i,
    /^Any items that were stored inside the box appear in the boat or ship\.$/i,
    /^Items stored on the boat or ship form that are too large\b[^.]*\.$/i,
    /^A [\w' ]+? with the Broken condition must be repaired before it can change form again\.$/i,
    /^The ethereal sailors don't prevent you\b[^.]*\.$/i,
    /^You lower the [\w' ]+? into water at least \d+ feet deep while issuing a command\.$/i,
    /^This vehicle possesses an? \d+-foot cone light that can be swiveled\b[^.]*\.$/i,
    /^When the effect ends, any occupants are ejected harmlessly\.$/i,
    /^If the bathysphere becomes broken, the effect ends and the [\w' ]+? is broken as well\.$/i,
    /^It can be loaded with up to \d+ Bulk of items\.$/i,
    /^Most creatures aren't small enough to fit on the cart\b[^.]*\.$/i,
    /^If it strikes an obstruction, it attempts to continue its movement, pushing with an Athletics bonus of \+\d+, once per round\.$/i,
    /^After its \d+-minute duration completes, the cart collapses back into scrap\.$/i
];
const lineOf = (sentence) => LINES.some((pattern) => pattern.test(sentence));

// A vehicle (or a marker for one) the item becomes → the conjure plan, or null. html: the activation's (or the consumable's) html.
export function vehiclePlan(html, base) {
    const plain = plainOf(html);
    const words = effectOf(plain);
    const linked = VEHICLE.exec(String(html ?? ""));
    const swan = /\bIt transforms into a (swan-shaped boat) capable of carrying up to\b[^.]*\.\s*The boat moves on the water at a Speed of (\d+) feet, and lasts (\d+) (days?|hours?)\./i.exec(words);
    const cart = /\bOnce activated, the cart moves forward at a speed of (\d+) feet per round on your turn for up to (\d+) minutes?\./i.exec(words);
    const cartStats = /\bThe [\w' -]+? has AC (\d+), Hardness (\d+), (\d+) Hit Points, and a Break Threshold of (\d+)\./i.exec(words);
    if (!linked && !swan && !(cart && cartStats)) return null;
    const sentences = sentencesOf(words).filter((sentence) => !FLAVOR.some((pattern) => pattern.test(sentence)));
    const left = [];
    const lines = [];
    let lasts = null;
    let creature = null;
    for (const sentence of sentences) {
        if (linked && sentence.includes(linked[2]) && /\b(?:transforms into|The other form is)\b/i.test(sentence)) {
            creature = { name: linked[2], count: 1, size: null, stats: null, from: { uuid: linked[1] }, traits: [], initiative: null };
            const time = /\bfor (\d+) (hours?|days?)\b/i.exec(sentence);
            if (time) lasts = fixed(Number(time[1]) * HOURS[time[2].toLowerCase()], "hours");
            // (The greater boat's ethereal crew: its own, a line.)
            if (/\bpiloted and crewed by ethereal sailors\b/i.test(sentence)) lines.push("Ethereal sailors pilot and crew it.");
            continue;
        }
        const lastsDay = /^The [\w' -]+? lasts (\d+) (days?|hours?)\.$/i.exec(sentence);
        if (lastsDay) {
            lasts = fixed(Number(lastsDay[1]) * HOURS[lastsDay[2].toLowerCase()], "hours");
            continue;
        }
        if (swan && sentence.includes(swan[1])) {
            const carries = /\bcapable of carrying up to ([^.]+?)\./i.exec(sentence)?.[1];
            creature = { name: "Swan Boat", count: 1, size: "gargantuan", stats: { speeds: { land: 0, swim: Number(swan[2]) } }, from: null, traits: [], initiative: null };
            lines.push(`A swan-shaped boat that carries up to ${carries}, at a swim Speed of ${swan[2]} feet: a marker of it.`);
            lasts = fixed(Number(swan[3]) * HOURS[swan[4].toLowerCase()], "hours");
            continue;
        }
        if (swan && /^The boat moves on the water at a Speed of\b/i.test(sentence)) continue;
        if (cart && cart[0].includes(sentence)) {
            lasts = fixed(Number(cart[2]), "minutes");
            lines.push(`It moves ${cart[1]} feet forward on its user's turn (the map's).`);
            continue;
        }
        if (cartStats && cartStats[0].includes(sentence)) {
            creature = { name: "Wind-Up Cart", count: 1, size: "tiny", stats: { ac: Number(cartStats[1]), hp: Number(cartStats[3]), speeds: { land: Number(cart[1]) } }, from: null, traits: [], initiative: null };
            lines.push(`Hardness ${cartStats[2]}, Break Threshold ${cartStats[4]}: an object's.`);
            continue;
        }
        if (lineOf(sentence)) {
            lines.push(sentence);
            continue;
        }
        left.push(sentence);
    }
    if (!creature) return null;
    const lastsLine = lasts?.unit === "hours" ? [`It lasts ${lasts.value} hour${lasts.value === 1 ? "" : "s"}: dismiss it when that's up.`] : [];
    return {
        ...base,
        builtin: "conjure",
        automation: { level: left.length ? "guided" : "automatic" },
        targeting: { target: "self", range: null, area: null },
        trigger: { event: "use" },
        creatures: [creature],
        max: 1,
        lasts,
        vanishAtZero: true,
        vehicle: true,
        notes: [...lines, ...lastsLine, ...left],
        ...(left.length ? { partial: true } : {})
    };
}

// A note Effect on the vehicle its user targets: { label, text, duration } → the plan.
const vehicleNote = (base, note, notes = []) => ({
    ...base,
    automation: { level: "automatic" },
    targeting: { target: "1 vehicle", range: null, area: null },
    trigger: { event: "use" },
    resolution: { kind: "check", check: { roll: "automatic", statistic: "automatic" }, outcomes: { criticalSuccess: none(), success: { ...none(), noteEffects: [note] }, failure: none(), criticalFailure: none() } },
    ...(notes.length ? { notes } : {})
});
// (Its user's own, for its time: Wind At Your Back's longer Hustle.)
const userNote = (base, note) => ({ ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), noteEffects: [note] } } } });

// (Short runs of the items' words, wildcards between.)
const ANCHOR = /\btransforms into a massive anchor\b[^.]*\bboat to immediately stop\.\s*After (\d+) days?, the anchor vanishes\b[^.]*\.\s*The anchor is attached\b[^.]*?\bremoved by ([A-Z][\w ]+?) or destroyed \(Hardness (\d+), HP (\d+)\)\./i;
const TENTACLES = /\bspectral tentacles to erupt\b[^.]*\bhull\.\s*These tentacles lash out in an emanation\b[^.]*\bship's length\b[^.]*?\bfor (\d+) minutes\.\s*Creatures in the aura\b[^.]*?\btake an? [-–](\d+) circumstance penalty to Athletics checks to Swim\b[^.]*\./i;
const FAN = /\btoward the sail of a vessel\b[^.]*?\+(\d+)-foot circumstance bonus to its Speed for (\d+) hours\.\s*If fanned in any other direction\b[^.]*?\bcasting of ([A-Z][\w ]+?) \(DC (\d+)\)\./i;
const WIND = /\bFor the next (\d+) hours, it floats behind you\b[^.]*\bHustle during exploration\b[^.]*?× (\d+) instead of × (\d+)\.\s*You must all remain within (\d+) feet\b[^.]*\.\s*If you activate the item aboard a vehicle\b[^.]*?\+(\d+)-foot circumstance bonus to its Speeds\b[^.]*\.\s*If the vehicle is powered by wind\b[^.]*?\+(\d+) feet\.\s*When the \d+ hours are up\b[^.]*\./i;
const ABOUT_FACE = /\bThe ship makes a 180-degree turn in place, then continues\b[^.]*\./i;

// The activation's (or consumable's) html, its base, and the spells by name (the fan's Gust of Wind) → the plan, or null.
export function vehicleEffectPlan(html, base, spells = {}) {
    const words = effectOf(plainOf(html));
    const anchor = ANCHOR.exec(words);
    if (anchor) {
        return vehicleNote(base, { label: "Anchored", text: `The boat is stopped by a magical anchor on a chain of force: it can't move for ${anchor[1]} day${anchor[1] === "1" ? "" : "s"}, unless ${anchor[2]} counteracts the chain or it's destroyed (Hardness ${anchor[3]}, HP ${anchor[4]}).`, duration: fixed(Number(anchor[1]) * 24, "hours") }, ["Only on a boat: target the boat."]);
    }
    const tentacles = TENTACLES.exec(words);
    if (tentacles) {
        // (Its rule's own sentence on the note, word for word: the penalty is the GM's to give in the aura.)
        const rule = sentencesOf(words).find((sentence) => /^Creatures in the aura\b/i.test(sentence)) ?? "";
        return vehicleNote(base, { label: "Spectral tentacles", text: `${rule} (An emanation of the ship's length, for ${tentacles[1]} minutes.)`, duration: fixed(Number(tentacles[1]), "minutes") }, ["Target the ship it's on."]);
    }
    const fan = FAN.exec(words);
    const gust = fan ? spells[fan[3].toLowerCase()] : null;
    if (fan && gust) {
        const sail = vehicleNote(base, { label: "Fanned sail", text: `A +${fan[1]}-foot circumstance bonus to its Speed.`, duration: fixed(Number(fan[2]), "hours") }, ["Fanned toward the sail of a vessel: target the vessel."]);
        const cast = { ...base, builtin: "cast-spell", spell: { uuid: gust.uuid, name: gust.name }, rank: null, dc: Number(fan[4]), attack: null, tradition: null, self: false, area: gust.area, targets: gust.targets };
        return { ...base, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, once: true, ways: [{ name: "Toward a sail", html: `<p>The vessel's sail: a +${fan[1]}-foot circumstance bonus to its Speed for ${fan[2]} hours.</p>`, plan: sail }, { name: "Any other way", html: `<p>A ${gust.name} (DC ${fan[4]}).</p>`, plan: cast }] };
    }
    const wind = WIND.exec(words);
    if (wind) {
        const time = fixed(Number(wind[1]), "hours");
        const group = userNote(base, { label: "Wind at your back", text: `The group can Hustle during exploration for its lowest Constitution modifier × ${wind[2]} minutes instead of × ${wind[3]}, while all stay within ${wind[4]} feet of each other.`, duration: time });
        const vehicle = vehicleNote(base, { label: "Wind at its back", text: `A +${wind[5]}-foot circumstance bonus to its Speeds (+${wind[6]} feet if wind powers it, as a sailing ship).`, duration: time }, ["Aboard a vehicle: target the vehicle."]);
        return { ...base, builtin: "ways", automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, once: true, ways: [{ name: "The group", html: `<p>A longer Hustle for ${wind[1]} hours.</p>`, plan: { ...group, notes: [`After ${wind[1]} hours the cloud floats back into its user's hands.`] } }, { name: "Aboard a vehicle", html: `<p>The vehicle's Speeds +${wind[5]} feet (+${wind[6]} by wind) for ${wind[1]} hours.</p>`, plan: { ...vehicle, notes: [...vehicle.notes, `After ${wind[1]} hours the cloud floats back into its user's hands.`] } }] };
    }
    if (ABOUT_FACE.test(words)) {
        return { ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, notes: ["The ship turns 180 degrees in place (turn its token about), then heads that way from its next turn on (the map's)."] };
    }
    return null;
}

// Mariner's Mien's "You become Quickened for 1 minute or until you leave the vehicle, whichever comes first, and can use the extra action to
// Take Control of the vehicle or, if you're already piloting it, Drive or Stop the vehicle.": its Quickened that minute, and a note Effect
// beside it for what the action is for and its early end — the plan as it was, or that.
const SET_COURSE = /^You become Quickened for (\d+) minutes? or until you leave the vehicle, whichever comes first, and can use the extra action to (Take Control of the vehicle or, if you're already piloting it, Drive or Stop the vehicle)\.$/i;
export function withVehicleQuickened(plan) {
    const unread = (plan?.unread ?? []).find((entry) => SET_COURSE.test(String(entry).trim()));
    const success = plan?.resolution?.outcomes?.success;
    const quickened = (success?.effects ?? []).find((effect) => effect?.slug === "quickened");
    if (!unread || !quickened) return plan;
    const [, minutes, use] = SET_COURSE.exec(String(unread).trim());
    const duration = fixed(Number(minutes), "minutes");
    const effects = success.effects.map((effect) => (effect === quickened ? { ...effect, duration } : effect));
    const noteEffects = [...(success.noteEffects ?? []).filter((note) => !note?.reminder), { label: "Quickened's extra action", text: `Its extra action only to ${use.replace(/ the vehicle\b/g, " the vehicle")}; it ends sooner if its user leaves the vehicle.`, duration }];
    const rest = (plan.unread ?? []).filter((entry) => entry !== unread);
    const next = { ...plan, resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success: { ...success, effects, noteEffects } } } };
    if (rest.length) next.unread = rest;
    else delete next.unread;
    if (next.partial && !rest.length && !(next.notes ?? []).length && !Object.values(next.resolution.outcomes).some((row) => (row?.manualInstructions ?? []).length)) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}

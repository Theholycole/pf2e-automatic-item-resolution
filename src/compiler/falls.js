// A fall an item eases, through PF2e Automatic Environment Resolution (2026-10-26, its session's contract: core a05e18c, environment
// c434cc6): an Effect on the creature flagged `flags["pf2e-automatic-environment-resolution"].fall = { shorter?, noDamage?, source }`, read
// as the environment module rolls a creature's falling damage (the largest shorter comes off, any noDamage means none). The item card's
// Effect for an activation or a consumable — Tumbler's Belt's "Treat your fall as if it were 120 feet shorter" (a reaction: a round),
// Aerial Cloak's 30 feet, Jade Cat's "For 1 minute after you activate the cat, you treat all falls as 20 feet shorter", Dragonaut's
// Wingsuit's "Your fall slows to 60 feet per round for 1 minute, and if you reach the ground during this time you take no damage from the
// fall" (no damage, a minute) — and, for an item worn with it always on, scripts/falls.js's api.fallEases (Gliding Membranes' "Treat
// falls as 25 feet shorter", Angelic Opera Cloak's "never take falling damage"). What else a sentence says stays a note. Pure.

export const ENVIRONMENT_ID = "pf2e-automatic-environment-resolution";
const WORDS = { one: 1, a: 1, an: 1 };
const UNITS = { round: "rounds", minute: "minutes", hour: "hours" };
export const plainOf = (html) => String(html ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const SENTENCES = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((sentence) => sentence.trim()).filter(Boolean);

const SHORTER = /\b(?:you )?treat (?:your fall|all falls|falls) as (?:if it were )?(\d+) feet shorter\b/i;
// (And PF2e's Gentle Landing, no falling damage: Cape of the Open Sky's "whenever you fall while wearing the cape …, the cape automatically
// casts Gentle Landing on you", Soft-Landing's "You gain the effects of Gentle Landing for 1 minute".)
// (And Emerald Grasshopper's "you flutter in the air until the end of your turn, then fall harmlessly at a rate of 60 feet per round until you
// reach the ground", 2026-10-27: no damage, its rate and its flutter words on the Effect, until the end of its next turn.)
// (And Alchemists+'s Osteoanabolic Broth's "take no fall damage", beside its resistance, 2026-10-28.)
const NO_DAMAGE = /\b(?:you take no damage from the fall|never take falling damage|take no fall damage|whenever you fall\b[^.]*?\bcasts? Gentle Landing on you|You gain the effects of Gentle Landing|fall harmlessly at a rate of \d+ feet per round)\b/i;
// (Tumbler's Belt's "Regardless of whether you take damage or not from the fall, you land on your feet": landsOnFeet, no Prone — the
// environment module's, 2026-10-26.)
const ON_FEET = /\bRegardless of whether you take damage or not from the fall, you land on your feet\b/i;
const FOR = /\b[Ff]or (\d+|one|an?) (round|minute|hour)s?\b/;
// (Diver's Gloves' "You take damage as if the fall were half the distance, to a minimum fall of 5 feet", 2026-10-27: half the damage, as
// Parachute Mail's halved — the environment module's flag, its words on the Effect —, with the shortest fall it counts.)
const HALF_DISTANCE = /\bYou take damage as if the fall were half the distance, to a minimum fall of (\d+) feet\b/i;
// (What a fall's sentence says besides, 2026-10-26 — words on the fall's Effect, the creature's own to play: Aerial Cloak's "and glide to a space
// of your choice at the bottom of your fall, which must be within 20 feet of where you would've landed" (glide), Dragonaut's Wingsuit's "Your
// fall slows to 60 feet per round" (rate); Jade Cat's "you are not Off-Guard when you Balance, and narrow surfaces and uneven ground are not
// difficult terrain for you" — a roll note on its Balance, as PF2e's own Steady Balance has it (balance: the note's words).)
const GLIDE = /,? and glide to a space of your choice at the bottom of your fall, which must be within (\d+) feet of where you would've landed\b/i;
const RATE = /\b(?:Your fall slows to|fall harmlessly at a rate of) (\d+) feet per round\b/i;
const FLUTTER = /\byou flutter in the air until the end of your turn, then\b/i;
const BALANCE = /,? you are not Off-Guard when you Balance, and narrow surfaces and uneven ground are not difficult terrain for you\b/i;
export const BALANCE_NOTE = "You aren't off-guard when you Balance, and narrow surfaces and uneven ground aren't difficult terrain for you.";

// The text → { shorter?, noDamage?, said: [sentences], duration? } or null. duration: the sentence's "For 1 minute …", else a reaction's round.
export function readFall(text, { reaction = false } = {}) {
    const said = [];
    let shorter = null;
    let noDamage = false;
    let duration = null;
    let onFeet = false;
    const extra = {};
    for (const sentence of SENTENCES(text)) {
        if (ON_FEET.test(sentence)) {
            onFeet = true;
            said.push(sentence);
            continue;
        }
        const half = HALF_DISTANCE.exec(sentence);
        if (half) {
            extra.halved = true;
            extra.minFeet = Number(half[1]);
            said.push(sentence);
            continue;
        }
        const short = SHORTER.exec(sentence);
        const none = NO_DAMAGE.test(sentence);
        if (!short && !none) continue;
        if (short) shorter = Math.max(shorter ?? 0, Number(short[1]));
        if (none) noDamage = true;
        const glide = GLIDE.exec(sentence);
        const rate = RATE.exec(sentence);
        if (glide) extra.glide = Number(glide[1]);
        if (rate) extra.rate = Number(rate[1]);
        if (BALANCE.test(sentence)) extra.balance = BALANCE_NOTE;
        said.push(sentence);
        // (A flutter till its turn's end, then the fall: until the end of its next turn.)
        if (FLUTTER.test(sentence)) {
            extra.flutter = true;
            duration ??= { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end" };
        }
        const time = FOR.exec(sentence);
        if (time && !duration) duration = { mode: "fixed", value: WORDS[time[1].toLowerCase()] ?? Number(time[1]), unit: UNITS[time[2].toLowerCase()], expiry: "turn-start" };
    }
    if (!shorter && !noDamage && !extra.halved) return null;
    return { ...(shorter ? { shorter } : {}), ...(noDamage ? { noDamage: true } : {}), ...(onFeet ? { landsOnFeet: true } : {}), ...extra, said, duration: duration ?? (reaction ? { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end" } : null) };
}

// The fall in words: "Its falls count as 120 feet shorter; it lands on its feet", "It takes no damage from a fall".
export function fallText(fall) {
    const parts = [fall.flutter ? "it flutters in the air until the end of its turn" : null, fall.rate ? `${fall.flutter ? "then " : ""}it falls ${fall.rate} feet a round` : null, fall.noDamage ? "it takes no damage from a fall" : null, fall.halved && !fall.noDamage ? `it takes half the damage from a fall${fall.minFeet ? ` (as if it fell half as far, ${fall.minFeet} feet at least)` : ""}` : null, fall.shorter && !fall.noDamage ? `its falls count as ${fall.shorter} feet shorter` : null, fall.landsOnFeet ? "it lands on its feet" : null, fall.glide ? `it can land in a space of its choice within ${fall.glide} feet of where it would have` : null, fall.balance ? "it isn't off-guard when it Balances, and narrow surfaces and uneven ground aren't difficult terrain for it" : null].filter(Boolean);
    const words = parts.join("; ");
    return words.charAt(0).toUpperCase() + words.slice(1);
}

// (A sentence that says only the fall: no longer a note. One that says more, Jade Cat's Balance and terrain, stays one.)
const MORE = /\b(?:Off-Guard|Balance|difficult terrain|glide|space|bonus|penalty|check|Speed|slows?)\b/i;
const onlyFall = (sentence) => !MORE.test(sentence.replace(GLIDE, " ").replace(BALANCE, " ").replace(RATE, " ").replace(SHORTER, " ").replace(NO_DAMAGE, " ").replace(FOR, " ").replace(FLUTTER, " "));
const said = (entry) => String(typeof entry === "string" ? entry : entry?.text ?? "").trim();
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
// (Diver's Gloves: the barrier its words picture, and the Swim after — its user's own move, a line of the card, 2026-10-27.)
const DIVE = /^The gloves create a hydrodynamic barrier around you, dispersing the damage\b/i;
const SWIM_AFTER = /^You then Swim with the effects of a critical success for the check\.$/i;
const RULE = /\b(?:bonus|penalty|saving throws?|saves?|resistance|weakness|Strike|check|DC|attack|Speed|Hit Points|damage|condition|Off-Guard|terrain|space|feet)\b/i;

// The plan (or none), the activation's (or consumable's) html, its base → the plan with plan.fall, the item card's Effect for the
// environment module; one with nothing read becomes its own card.
export function withFalls(plan, html, base) {
    const text = plainOf(html);
    // (And Diver's Gloves' "Trigger You would take damage from falling into water", 2026-10-27.)
    const reaction = /\bTrigger (?:You're|You are) falling\b|\bTrigger You (?:begin to )?fall\b|\bTrigger You would take damage from falling\b/i.test(text);
    const read = readFall(text.replace(/^.*?\bEffect\b\s*/s, ""), { reaction });
    if (!read || plan?.fall || plan?.builtin && plan.builtin !== "no-effect") return plan;
    const { said: sentences, ...fall } = read;
    const kept = sentences.filter((sentence) => !onlyFall(sentence));
    const gone = (entry) => sentences.some((sentence) => onlyFall(sentence) && (said(entry).includes(sentence.replace(/\.$/, "")) || sentence.includes(said(entry).replace(/\.$/, ""))));
    const empty = !plan || plan.noteOnly || plan.builtin === "no-effect";
    if (empty) {
        const body = text.replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
        const rest = SENTENCES(body).filter((sentence) => !sentences.includes(sentence) && !DIVE.test(sentence));
        const lines = rest.filter((sentence) => SWIM_AFTER.test(sentence)).map(() => "Then its user Swims as on a critical success at the check (its own move on the map).");
        const notes = [...rest.filter((sentence) => !SWIM_AFTER.test(sentence) && RULE.test(sentence) && !/^(?:Activate|Usage|Trigger|Requirements?|Frequency)\b/.test(sentence)), ...kept];
        return { ...base, builtin: undefined, noteOnly: undefined, automation: { level: notes.length ? "guided" : "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { ...(base?.trigger ?? {}), event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, fall, ...(notes.length || lines.length ? { notes: [...lines, ...notes] } : {}), ...(notes.length ? { partial: true } : {}) };
    }
    const notes = (plan.notes ?? []).filter((entry) => !gone(entry));
    const unread = (plan.unread ?? []).filter((entry) => !gone(entry));
    const next = { ...plan, fall, notes: notes.length ? notes : undefined, ...(plan.unread ? { unread } : {}) };
    if (next.partial && !notes.length && !unread.length && !Object.values(next.resolution?.outcomes ?? {}).some((row) => (row?.manualInstructions ?? []).length)) {
        delete next.partial;
        next.automation = { ...(next.automation ?? {}), level: "automatic" };
    }
    return next;
}

// An item's passive text (before its activations) → its fall when worn: { shorter?, noDamage? } or null.
export function passiveFallOf(text) {
    const passive = String(text ?? "").split(/\bActivat(?:e|ion)\b/)[0];
    const read = readFall(passive);
    return read ? { ...(read.shorter ? { shorter: read.shorter } : {}), ...(read.noDamage ? { noDamage: true } : {}) } : null;
}

// A worn consumable that eases its wearer's falls by an amount and stays around it (2026-10-26, the environment module's reduceBy, env
// f06ece4): Impact Foam Chassis' "it Activates automatically whenever you fall at least 10 feet, causing a layer of soft, flexible impact foam
// to expand beneath and around you … The impact foam decreases the falling damage by up to the listed amount, taking damage equal to the
// amount of falling damage the foam reduced … if the foam has any Hit Points remaining, it remains surrounding you for up to 1 minute",
// "prevents up to 20 falling damage and has 20 Hit Points" → { reduceBy, minFeet, hp }: api.fallEases(actor) gives the environment module its
// reduceBy while it's worn; after the fall (its "fell" hook), the chassis is used up and the foam with the Hit Points it has left is an
// Effect around its wearer (scripts/falls.js).
const FOAM = /\bActivates automatically whenever you fall at least (\d+) feet\b[^]*?\bdecreases the falling damage by up to the listed amount\b[^]*?\bprevents up to (\d+) falling damage and has (\d+) Hit Points\b/i;
export function readFoam(text) {
    const match = FOAM.exec(String(text ?? ""));
    return match ? { reduceBy: Number(match[2]), minFeet: Number(match[1]), hp: Number(match[3]) } : null;
}

// After a fall (the environment module's "fell" hook: { feet, reductions [{ itemUuid, amount }] }), which worn chassis activated and the
// foam's Hit Points left: the one whose reduction it was, else — its fall long enough, no damage to take off — the one easing most, untouched.
// worn: [{ uuid, reduceBy, minFeet, hp }] → { uuid, amount, left } or null.
export function foamUsed({ feet = 0, reductions = [] } = {}, worn = []) {
    const fell = Number(feet) || 0;
    const reduced = (reductions ?? []).find((entry) => entry?.itemUuid && worn.some((one) => one.uuid === entry.itemUuid));
    const chassis = reduced ? worn.find((one) => one.uuid === reduced.itemUuid) : [...worn].filter((one) => fell >= (Number(one.minFeet) || 0)).sort((a, b) => b.reduceBy - a.reduceBy)[0];
    if (!chassis) return null;
    const amount = Math.max(0, Number(reduced?.amount) || 0);
    return { uuid: chassis.uuid, amount, left: Math.max(0, chassis.hp - amount) };
}

// A fall eased by how high it's deployed (2026-10-27, docs/needs.md): Parachute Mail's Deploy Parachute, "Once activated, the parachute will
// fully deploy within 1 round. If it is deployed at a height greater than 100 feet, the parachute will prevent you from receiving falling damage.
// If deployed at a height of less than 100 feet, it will reduce the damage taken from falling by half." The ways card's two buttons, its user's
// word for the height: each the item card's fall Effect for the reaction's round — no damage (the environment module's noDamage), or half the
// damage (fall.halved: words on the Effect, a flag the environment module can read). Its deploying and its repacking, "It takes 10 minutes and
// a successful DC 15 Crafting check to successfully repack the parachute", lines of each way's card. Pure.
const DEPLOYED = /^Once activated, the parachute will fully deploy within (\d+) rounds?\. If it is deployed at a height greater than (\d+) feet, the parachute will prevent you from receiving falling damage\. If deployed at a height of less than \2 feet, it will reduce the damage taken from falling by half\.$/i;
const REPACK = /\bIt takes (\d+) minutes and a successful (?:@Check\[crafting\|dc:(\d+)\]|DC (\d+) Crafting) check to successfully repack the parachute\./i;
// own: the activation's { index, name, time, frequency, trigger }; whole: the item's description.
export function heightWaysPlan(html, base, { own = null, whole = "", level = 0, type = null } = {}) {
    const body = plainOf(html).replace(/^.*?\bEffect\b\s*/s, "").replace(/\s*\bCraft Requirements\b.*$/s, "");
    const deployed = DEPLOYED.exec(body);
    if (!deployed) return null;
    const [, rounds, height] = deployed;
    const repack = REPACK.exec(String(whole ?? ""));
    const notes = [`It deploys fully within ${rounds} round${rounds === "1" ? "" : "s"}.`, ...(repack ? [`Used, it deploys again only once repacked: ${repack[1]} minutes and a DC ${repack[2] ?? repack[3]} Crafting check (its user's own).`] : [])];
    const round = { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-end" };
    const way = (name, fall) => ({ name, html: `<p><strong>Effect</strong> ${name}.</p>`, plan: { ...base, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: none() } }, fall: { ...fall, duration: round }, notes, item: { type, level, recipient: "user", activation: own } } });
    return { ...base, builtin: "ways", once: true, automation: { level: "automatic" }, targeting: { target: null, range: null, area: null }, trigger: { event: "use" }, ways: [way(`Deployed higher than ${height} feet: no falling damage`, { noDamage: true }), way(`Deployed lower than ${height} feet: half the falling damage`, { halved: true })] };
}

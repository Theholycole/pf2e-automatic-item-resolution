// An item's own data in its text, filled in before it's read (Magic+'s dragonbreath weapons: a damage formula built on
// @item.system.runes.striking with a @Check save, and a save DC that rises with the weapon's potency rune): its runes and
// level as numbers, simple arithmetic in a dice count worked out, the DC its potency rune gives. The text read is then the
// item's as it is. Pure.

const PATHS = {
    "@item.system.runes.striking": (item) => Number(item?.system?.runes?.striking) || 0,
    "@item.system.runes.potency": (item) => Number(item?.system?.runes?.potency) || 0,
    "@item.level": (item) => Number(item?.system?.level?.value) || 0,
    "@item.system.level.value": (item) => Number(item?.system?.level?.value) || 0
};

// "((1 + 1) * 2)" → 4: digits, + - * / and parentheses only.
function arithmetic(expression) {
    if (!/^[\d\s+\-*/()]+$/.test(expression)) return null;
    try {
        const value = Function(`"use strict"; return (${expression});`)();
        return Number.isFinite(value) ? Math.floor(value) : null;
    } catch {
        return null;
    }
}

// The owner's own DC (PF2e's "@Check[reflex|against:class-spell]": a harrow card's "against your class DC or spell DC", Lung
// Bloodstone's class DC): read with a number standing in for it, which ownerDCs(plan) then makes the core's
// against { dc: "owner", statistic: "class" | "spell" | "class-spell" }. Live play fills in the owner's DC (fillOwnerDCs);
// without it, the core's save family takes the caster's spell DC.
export const OWNER_DCS = Object.freeze({ 9001: "class", 9002: "spell", 9003: "class-spell" });
const STAND_IN = Object.freeze({ class: 9001, spell: 9002, "class-spell": 9003 });
const OWNER_WORDS = Object.freeze({ class: "your class DC", spell: "your spell DC", "class-spell": "your class DC or spell DC" });

const FRIGHTENED = "@UUID[Compendium.pf2e.conditionitems.Item.TBSHQspnbcqxsmjL]";
const BLINDED = "@UUID[Compendium.pf2e.conditionitems.Item.XgEqL1kFApUbl5Z2]";
const IMMOBILIZED = "@UUID[Compendium.pf2e.conditionitems.Item.eIcWbB5o3pP6OIMe]";

// A Wondrous Figurine written without the family's Activate block, Bismuth Leopards' "When activated, it transforms into a pair of …
// Leopards": the family's own (Onyx Dog's), 2 actions, and its minion trait in creature form, src/compiler/conjured.js.
const FIGURINE_BLOCK = "<p><strong>Activate</strong> <span class=\"action-glyph\">2</span> command, Interact</p><hr /><p><strong>Effect</strong> You activate the statue by placing it on solid ground and then speaking its name. In creature form, the figurine has the minion trait.</p>";
export const isBareFigurine = (item, html = item?.system?.description?.value) => /^Wondrous Figurine\b/.test(String(item?.name ?? "")) && !/<strong>\s*Activat/i.test(String(html ?? "")) && /\b(?:becomes|transforms into|turns into)\b[^.]*?@UUID\[[^\]]*\.Actor\./i.test(String(html ?? ""));

export function withItemData(html, item) {
    // (A save link written without its "dc:" — a third-party module's "@Check[will|23]": the DC it means.)
    let text = String(html ?? "").replace(/@Check\[(fortitude|reflex|will)\|(\d+)\]/gi, "@Check[$1|dc:$2]");
    if (isBareFigurine(item, text)) text = `${FIGURINE_BLOCK}${text}`;
    // (A save at its wielder's better DC, Meloth's Lifedrinker's "takes @Damage[6d6[mental]] damage with a Will save; the DC is equal
    // to the wielder's class or spell DC, whichever is higher": its owner's class-or-spell DC, a basic save, as PF2e writes it.)
    text = text.replace(/\btakes (@Damage\[[^\]]*\]\])(?: damage)? with an? (Fortitude|Reflex|Will) save; the DC is equal to the wielder's class or spell DC, whichever is higher\b/g, (whole, damage, save) => `takes ${damage} damage with a @Check[${save.toLowerCase()}|against:class-spell|basic] save`);
    // (Extra Strike damage a number of dice set by the armor's save bonus, a Battlezoo hide's: its resilient rune's, 1 + the rune, at most
    // 4 — the dice in words, as the Strike-damage reader takes them.)
    text = text.replace(/\bYour melee Strikes deal additional (\w+) damage for (\d+ (?:minutes?|rounds?))\.\s*The amount of \1 damage dealt is equal to (\d+)d(\d+) × the (?:armor|item)'s item bonus to (?:saving throws|saves) against \1 effects\./gi, (whole, type, time, count, faces) => `Your melee Strikes deal ${Number(count) * Math.min(4, 1 + (Number(item?.system?.runes?.resilient) || 0))}d${faces} additional ${type} damage for ${time}.`);
    // (A spell's effect given its DC first, Dread Blindfold's "This has the effect of a DC 37 vision of death spell": the spell, then its DC,
    // as the cast reader takes it.)
    text = text.replace(/\bThis has the effects? of an? DC (\d+) ((?:<em>)?[a-z][a-z' -]+?(?:<\/em>)?) spell\b/gi, (whole, dc, name) => `This has the effect of ${name} (DC ${dc})`);
    // (A swarm sent at the triggering enemy, Wasp Guard's "The swarm flies to the triggering enemy's space and swarms about them,
    // dealing @Damage[1d8[persistent,poison]] damage": that enemy takes it.)
    text = text.replace(/\bThe \w+ (?:flies|moves|rushes) to the triggering (enemy|creature)'s space and [^,.]*, dealing (@Damage\[[^\]]*\]\])(?: damage)?\./g, (whole, who, damage) => `The triggering ${who} takes ${damage} damage.`);
    // (A save with its failure's damage and a critical failure's exposure, Tarantula Ampoule's effigy: "If the target fails a
    // @Check[fortitude|dc:21] save, it takes @Damage[(1d10+4)[piercing]] damage. If the target critically fails the save, it's also exposed
    // to tarantula venom." — its degree rows, as the ability compiler reads them: the exposure its critical failure's note.)
    text = text.replace(/\bIf the target fails an? (@Check\[(?:fortitude|reflex|will)\|[^\]]*\](?:\{[^}]*\})?) save, it takes (@Damage\[(?:[^[\]]|\[[^\]]*\])*\](?:\{[^}]*\})?) damage\. If the target critically fails the save, it's also exposed to ([\w' -]+?)\.(?=<\/p>|\s|$)/g, (whole, check, damage, what) => `The target must attempt a ${check} save.</p><p><strong>Critical Success</strong> The target is unaffected.</p><p><strong>Success</strong> The target is unaffected.</p><p><strong>Failure</strong> The target takes ${damage} damage.</p><p><strong>Critical Failure</strong> The target takes ${damage} damage and is exposed to ${what}.`);
    // (A save for whoever the affixed weapon hits, Golden Silencer's "A target hit by a ranged Strike from the affixed weapon must succeed at
    // a @Check[fortitude|dc:20] save or be silenced as well …": its next ranged Strike's, on a hit.)
    text = text.replace(/\bA target hit by an? (ranged |melee )?Strike from the affixed weapon must succeed at\b/g, (whole, range) => `The next ${range ?? ""}Strike you make with the affixed weapon is silent. On a hit, the target must succeed at`);
    // (A cloud's time and cover in words the zone reader takes, the Spun Clouds' "The cloud dissipates after 1 minute" and Black's "A dark
    // storm cloud conceals creatures within it".)
    // (And Red's "Any creature in the cloud, or that later enters the cloud, must succeed at …": those there as it's made, and on entering.)
    text = text.replace(/\bThe cloud dissipates after (\d+) (minutes?|rounds?)\./g, "The cloud lasts for $1 $2.").replace(/\bA dark storm cloud conceals creatures within it\./g, "Creatures within the cloud are Concealed.").replace(/\bAny creature in the cloud, or that later enters the cloud, must\b/g, "Each creature within the area when it uses this, or that enters the cloud, must");
    // (One check against each enemy's DC, Gorget of the Primal Roar's "attempting a single @Check[intimidation] check compared to the Will
    // DCs of all enemies within 30 feet": the check against each one's DC, the creatures its presser targets.)
    text = text.replace(/\battempting a single @Check\[(\w+)\] check compared to the (Fortitude|Reflex|Will|Perception) DCs of all enemies within (\d+) feet\b/g, (whole, skill, defense, feet) => `attempting a @Check[${skill}|against:${defense.toLowerCase()}] check against the ${defense} DC of each enemy within ${feet} feet`);
    // (A next Strike's extra damage told as its projectile's, Blade of Fallen Stars' "On your next ranged Strike, the weapon fires … In addition
    // to the normal Strike damage, the projectile also deals @Damage[6d8[cold]] damage and creates …": the next Strike's extra damage.)
    text = text.replace(/\bOn your next (ranged |melee )?Strike, the weapon [^.]*\.\s*In addition to the normal Strike damage, the [\w ]+? also deals (@Damage\[(?:[^[\]]|\[[^\]]*\])*\])(?:\{[^}]*\})? damage( and )?/g, (whole, range, damage, and) => `The next ${range ?? ""}Strike you make with the weapon deals an additional ${damage} damage${and ? ". It also " : ""}`);
    // (Extra damage on every Strike for a while told as a construct's, Solar Shellflower's "For the next 1 minute, whenever you Strike an enemy
    // with the solar shellflower, the construct fires a smaller jet of fire that automatically hits the target, dealing @Damage[3d4[persistent,
    // fire]] … or twice that on a critical hit": its Strikes' extra damage for that time — PF2e's extra dice double on a critical hit anyway.)
    text = text.replace(/\bFor the next (\d+) (minutes?|rounds?), whenever you Strike an enemy with the (?:<em>)?[\w' -]+?(?:<\/em>)?\s*, the [\w' -]+? that automatically hits the target, dealing @Damage\[(\d+d\d+)\[(persistent,)?(\w+)\]\](?:\{[^}]*\})? or twice that on a critical hit\./g, (whole, count, unit, dice, persistent, type) => `For ${count} ${unit}, your Strikes with the weapon deal ${dice} additional ${persistent ? "persistent " : ""}${type} damage.`);
    // (Healing gated on what the item holds, Essence Forge's "If the essence value in the forge is equal to or greater than 50 gp, the forge
    // heals you for @Damage[(3d8+10)[healing]] HP. Otherwise the absorbed essence has no effect.": the healing, its gate a note.)
    text = text.replace(/\bIf the essence value in the forge is equal to or greater than ([\d,]+ gp), the forge heals you for (@Damage\[(?:[^[\]]|\[[^\]]*\])*\])(?:\{[^}]*\})? HP\. Otherwise the absorbed essence has no effect\./g, (whole, value, healing) => `You regain ${healing} Hit Points. It heals only when the essence in the forge is worth at least ${value}.`);
    // (A heading's space inside its bold tag and a bold action glyph, a third-party module's markup: PF2e's own, as the activation
    // reader takes it.)
    text = text.replace(/<strong>(Activate|Trigger|Effect|Requirements?|Frequency) <\/strong>/g, "<strong>$1</strong> ").replace(/<span class="action-glyph"><strong>([^<]+)<\/strong><\/span>/g, '<span class="action-glyph">$1</span>');
    // (Its DC first, its type named: a third-party module's "@Check[dc:28|type:fortitude]" — PF2e's order.)
    text = text.replace(/@Check\[dc:(\d+)\|type:(\w+)((?:\|[^\]]*)?)\]/gi, "@Check[$2|dc:$1$3]");
    // (A save link without the word: Life's Last Breath's "The target must succeed at a @Check[fortitude|dc:38] or take 4d6 void
    // damage" — the target's, not a passive one's: Dawnlight's "Creatures with darkvision … must succeed at a @Check[…] or be …".)
    text = text.replace(/(\b[Tt]he target must succeed at an? @Check\[(?:fortitude|reflex|will)\b[^\]]*\](?:\{[^}]*\})?) or (be|become|take)\b/gi, "$1 save or $2");
    // (A save "or be" made rather than succeeded at, its worse time "(or … on critical failure)": Golden Gloves' "All enemies within a
    // 40-feet emanation must make a @Check[fortitude|dc:41] save or be Dazzled for 1 minute (or Blinded for 1 minute on critical
    // failure)" — as the reader takes it.)
    text = text.replace(/\b(\d+)-feet (emanation|burst|cone|line|radius)\b/g, "$1-foot $2");
    // (An area in words before the save its creatures attempt, as PF2e's own text links it: "All enemies within a 40-foot emanation
    // must … save" — the reader takes the area from the link.)
    text = text.replace(/\b(in|within) an? (\d+)-foot (emanation|burst|cone|line)\b(?= (?:must|attempts?)\b[^.]*?@Check\[(?:fortitude|reflex|will)\b)/g, (whole, word, feet, shape) => `${word} a @Template[type:${shape}|distance:${feet}]{${feet}-foot ${shape}}`);
    text = text.replace(/\bmust make an? (@Check\[(?:fortitude|reflex|will)\b[^\]]*\](?:\{[^}]*\})?) save or (be|become)\b((?:@UUID\[[^\]]*\]\{[^}]*\}|[^.(@])*)\((?:or )?([^)]*?) on (?:a )?critical failure\)/g, (whole, check, verb, first, worse) => `must succeed at a ${check} save or ${verb}${first}(${worse} on a critical failure)`);
    // (A bonus to the triggering save and the rest against the same affliction for a while, Fulu of the Stoic Ox's "you gain a +2 status
    // bonus on the triggering Fortitude save and on all Fortitude saves against the same disease for the next minute": saves against
    // diseases (poisons) for that minute, the triggering one among them.)
    text = text.replace(/\bgain an? \+(\d+) (status|circumstance|item) bonus on the triggering (Fortitude|Reflex|Will) save and on (?:all )?\3 saves against the same (disease|poison) for the next minute\b/g, (whole, value, type, save, against) => `gain a +${value} ${type} bonus to ${save} saves against ${against}s for 1 minute`);
    // (Its holder's own resistance beside what it does to others, Maelstromic Destabilizer's "For the next minute, the creature holding
    // the gadget gains resistance 2 to spirit damage, while all creatures … in a 10-foot emanation gains weakness 2 to spirit damage":
    // its own sentence, the others' a note.)
    text = text.replace(/\bFor the next minute, the creature holding the gadget gains resistance (\d+) to (\w+) damage, while all creatures\b/g, "For the next minute, you gain resistance $1 to $2 damage. Meanwhile all creatures");
    // (Its user's mount, Heedless Spurs' "Your mount takes 2d6 bleed and gains the quickened condition for 1 minute or until the
    // persistent bleed damage ends, whichever comes first": the creature targeted, the other way it ends a note.)
    text = text.replace(/\bYour mount takes (@Damage\[(?:[^\[\]]|\[[^\]]*\])*\](?:\{[^}]*\})?) and gains the quickened condition for (\d+ (?:rounds?|minutes?)) or until the persistent bleed damage ends, whichever comes first\./g, (whole, damage, time) => `The target takes ${damage} damage and is quickened for ${time}. Target your mount; its quickened condition also ends when the persistent bleed damage ends.`);
    // (Damage to each enemy in a banner's aura that's been hurt, Banner of Piercing Shards' "The magical banner deals 1d4 persistent bleed
    // damage to any enemy within the banner's aura that has been dealt damage since the end of your last turn": at each creature
    // targeted, who they are a note.)
    text = text.replace(/\bThe magical banner deals (@Damage\[(?:[^\[\]]|\[[^\]]*\])*\](?:\{[^}]*\})?) damage to any enemy within the banner's aura that ([^.<]+)\./g, (whole, damage, which) => `The target takes ${damage} damage. Target each enemy within the banner's aura that ${which}.`);
    // (A save "or become" a condition for a time, its worse value for a critical failure at the end of the sentence — some
    // third-party alchemical items: read as the reader's "save or become X for 1 round (Y on a critical failure)".)
    text = text.replace(/\bmust (?:make|attempt) an? (@Check\[(?:fortitude|reflex|will)\b[^\]]*\](?:\{[^}]*\})?) save, or become (@UUID\[[^\]]+\]\{[^}]+\}|[A-Z][a-z]+ \d+) for (\d+ (?:rounds?|minutes?))\b[^,.]*, or (@UUID\[[^\]]+\]\{[^}]+\}|[A-Z][a-z]+ \d+) if they critically fail (?:their|the) save\./g, (whole, check, first, time, worse) => `must succeed at a ${check} save or become ${first} for ${time} (${worse} for ${time} on a critical failure).`);
    // (Creatures along a released creature's flight that save or take damage — a third-party alchemical item: a line as long as its
    // flight.)
    text = text.replace(/\b(?:flies|charges) up to (\d+) feet; creatures within its path during its flight make an? (@Check\[(?:fortitude|reflex|will)\b[^\]]*\](?:\{[^}]*\})?) save or take\b/g, (whole, feet, check) => `flies along its path. Each creature in a @Template[type:line|distance:${feet}]{${feet}-foot line} must succeed at a ${check} save or take`);
    // (Moved a square, Expulsion Snare's "save or be moved into an adjacent square (chosen by you when you craft the snare)": a 5-foot
    // push, the square its crafter's.)
    text = text.replace(/\b(save|saving throw) or be moved into an adjacent square\b/g, "$1 or be pushed 5 feet into an adjacent square");
    // (An area that forces a save, Eye of the Moonwarden's "Bright moonlight shines out of the gem in a 30-foot emanation, forcing
    // hostile creatures in the area to make a @Check[fortitude|dc:26] save or be Blinded for 1 round": its creatures in that area
    // must succeed at it.)
    text = text.replace(/\bin an? (@Template\[[^\]]*\](?:\{[^}]*\})?|\d+-foot (?:emanation|burst|cone|line)), forcing ([\w ]+?) in the area to (?:make|attempt) an? (@Check\[(?:fortitude|reflex|will)\b[^\]]*\](?:\{[^}]*\})?) save or (be|become)\b/g, (whole, area, who, check, verb) => {
        const words = /^(\d+)-foot (\w+)$/.exec(area);
        const template = words ? `@Template[type:${words[2]}|distance:${words[1]}]{${area}}` : area;
        return `in the area. ${who.charAt(0).toUpperCase()}${who.slice(1)} in a ${template} must succeed at a ${check} save or ${verb}`;
    });
    // (After its user's own action succeeds, Glamorous Buckler's "Trigger You Feint … Effect On a successful Feint, the target is
    // Dazzled for 1 round": the target's, the success a note — its user presses Apply only then.)
    text = text.replace(/\bOn a successful (Feint|Demoralize|Trip|Shove|Grapple|Disarm|Reposition|Create a Diversion), the target is\b((?:@UUID\[[^\]]*\]\{[^}]*\}|[^.<@])+)\./g, (whole, action, rest) => `The target is${rest}. This applies only after a successful ${action} check.`);
    // (A hit's condition after a flavor sentence, Growth Gun's "On a hit, the creature becomes covered in a mass of flesh that …. The
    // creature becomes Slowed 1 for 1 round, …": one sentence, as the Strike's rider reader takes it.)
    text = text.replace(/\bOn a hit, the (creature|target) becomes [^.@<]+\.\s*The (?:creature|target) becomes (@UUID\[[^\]]+\]\{[^}]+\})/g, (whole, who, link) => `On a hit, the ${who} becomes ${link}`);
    // (A save "or be overcome" with a penalty for a time, Stage Fright Missive's "The activating creature must succeed at a
    // @Check[will|dc:20] save or be overcome with embarrassment for 1 hour, taking a –1 status penalty to Deception, Diplomacy,
    // Intimidation, and Performance checks": its failure row, the rest after it.)
    text = text.replace(/\bThe (?:activating creature|target|creature) must succeed at an? (@Check\[(?:fortitude|reflex|will)\b[^\]]*\](?:\{[^}]*\})?) save or be overcome with \w+ for (\d+ (?:rounds?|minutes?|hours?)), taking an? ([-–−]\d+ (?:status|circumstance|item) penalty to [^.<]+)\.\s*([^<]*)<\/p>/g, (whole, check, time, penalty, rest) => `The target must attempt a ${check} save.${rest.trim() ? ` ${rest.trim()}` : ""}</p><p><strong>Failure</strong> The target takes a ${penalty} for ${time}.</p>`);
    // (Thrown to a point that explodes, not a Strike at a creature: Blindpepper Bomb's "Activate Strike … The bomb can be thrown up to
    // 30 feet, causing it to explode, … in a 15-foot-radius burst. All creatures in the area must succeed at a … save" — read as an
    // activation that's an area's save.)
    if (/\bcan be thrown up to \d+ feet, causing it to explode\b/i.test(text)) text = text.replace(/(<strong>\s*Activate\s*<\/strong>\s*<span class="action-glyph">[^<]*<\/span>)\s*Strike\s*(?=<\/p>)/i, "$1 (manipulate)");
    // (A condition and then a lesser one, Blindpepper Bomb's "Blinded for 1 round and then Dazzled for 1 round": dazzled for both
    // rounds, as being blinded covers it; its critical failure's "blinded for 1 round, Sickened 1, and dazzled until it removes the
    // sickened condition" as the reader takes it, the dazzled one src/compiler/guards.js's.)
    text = text.replace(/(@UUID\[[^\]]+\]\{Blinded\}) for (\d+) rounds? and then (@UUID\[[^\]]+\]\{Dazzled\}) for (\d+) rounds?\b/g, (whole, blinded, first, dazzled, then) => `${blinded} for ${first} ${Number(first) === 1 ? "round" : "rounds"} and ${dazzled} for ${Number(first) + Number(then)} rounds`);
    text = text.replace(/\bthe creature is blinded for (\d+) rounds?, (@UUID\[[^\]]+\]\{Sickened \d+\}), and dazzled until it removes the sickened condition\./g, (whole, rounds, sickened) => `the creature is ${BLINDED}{Blinded} for ${rounds} ${Number(rounds) === 1 ? "round" : "rounds"} and ${sickened}. It's dazzled until it removes the sickened condition.`);
    // (A degree row's damage by its type, Blast Lance's "The target takes half the fire damage", "takes the full fire damage": the
    // reader's "half damage", "full damage".)
    text = text.replace(/(<strong>\s*(?:Success|Failure)\s*<\/strong>\s*The (?:target|creature|foe) takes) (half|the full) (?:the )?(?:acid|cold|electricity|fire|force|sonic|bludgeoning|piercing|slashing|poison|mental|spirit|vitality|void) damage\b/gi, (whole, start, amount) => `${start} ${/half/i.test(amount) ? "half" : "full"} damage`);
    // (A frightful presence by name, Dragonscale Amulet's "an aura that terrifies all foes in a 60-foot radius, as the frightful
    // presence ability with a @Check[will|dc:34] save": that ability's rows.)
    text = text.replace(/\bYou exude an aura that terrifies all foes in a (\d+)-foot radius, as the frightful presence ability with a (@Check\[will\|[^\]]*\])(?:\{[^}]*\})? save\.\s*<\/p>/i, (whole, feet, check) => `Each foe in a @Template[type:emanation|distance:${feet}] must attempt a ${check} save. A creature that succeeds is temporarily immune for 1 minute.</p><p><strong>Critical Success</strong> The creature is unaffected.</p><p><strong>Success</strong> The creature is ${FRIGHTENED}{Frightened 1}.</p><p><strong>Failure</strong> The creature is ${FRIGHTENED}{Frightened 2}.</p><p><strong>Critical Failure</strong> The creature is ${FRIGHTENED}{Frightened 4}.</p>`);
    // (A bow's critical specialization by name, Antler Arrow's "save or become stuck to the surface, taking the critical
    // specialization effects of a bow": Immobilized, until it pulls free.)
    text = text.replace(/\bor become stuck to the surface, taking the critical specialization effects of a bow\./i, `or become ${IMMOBILIZED}{Immobilized}. It's stuck to the surface until it pulls the missile free: an Interact action and a DC 10 Athletics check.`);
    // (Moved to a space its user picks, Roc-Shaft Arrow's "save or be moved to a space you choose within 10 feet (20 feet on a
    // critical failure)": the core's push that far, the space a note — as Hauling's.)
    text = text.replace(/\b(save) or be moved to a space you choose within (\d+) feet \((\d+) feet on a critical failure\)\./gi, "$1 or be pushed $2 feet ($3 feet on a critical failure). Its attacker picks the space within that distance; move its token there.");
    // (A save whose condition lasts longer on a critical failure, its two times given one after the other: as the reader takes it,
    // "save or be X for N rounds (M rounds on a critical failure)".)
    text = text.replace(/\bmust (?:make|attempt) an? (@Check\[(?:fortitude|reflex|will)\b[^\]]*\](?:\{[^}]*\})?) save(?: to [^,.]+)?, becoming ((?:@UUID\[[^\]]+\]\{[^}]+\})|[A-Z][a-z]+(?: \d+)?) for (\d+) (rounds?|minutes?) on a failure or (\d+) (rounds?|minutes?) on a critical failure\b/gi, (whole, check, condition, value, unit, more, moreUnit) => `must succeed at a ${check} save or be ${condition} for ${value} ${unit} (${more} ${moreUnit} on a critical failure)`);
    // (Its failure rows in one sentence, Stony Hag Eye's "save. On a failure, it's Slowed 1 for 1 minute; on a critical failure, if
    // the creature is already slowed, it's permanently petrified": degree rows, the critical failure's the failure's and the rest
    // its note.)
    text = text.replace(/(@Check\[(?:fortitude|reflex|will)\b[^\]]*\](?:\{[^}]*\})? save\.)\s*On a failure, it's (@UUID\[[^\]]+\]\{[^}]+\}) for (\d+ (?:rounds?|minutes?)); on a critical failure, (if [^,.]+), it's ([^.]+)\.\s*/g, (whole, check, link, time, condition, worse) => `${check}</p><p><strong>Failure</strong> The target is ${link} for ${time}.</p><p><strong>Critical Failure</strong> The target is ${link} for ${time}. ${condition.charAt(0).toUpperCase()}${condition.slice(1)}, it's ${worse}.</p><p>`);
    // (A grapple at the item's own Athletics modifier given later, Octopus Potion's "The arms share your multiple attack penalty and attempt to
    // Grapple a random enemy within 15 feet of you. … The Athletics modifier is +12": the check at +12, as the own-check reader takes
    // it; its "[[/r 1d4 #Added Effect]]" table roll as its dice and its table's "Added Effect" in lower case, so neither is read as the
    // Effect's start.)
    const ownModifier = /\bThe Athletics modifier is (?:\[\[\/r 1d20\+(\d+)[^\]]*\]\](?:\{[^}]*\})?|\+(\d+))/i.exec(text);
    if (ownModifier) text = text.replace(/\bThe arms share your multiple attack penalty and attempt to ((?:@UUID\[[^\]]*\]\{)?Grapple\}?) ([^.<]+)\./, (whole, grapple, whom) => `The arms attempt to ${grapple} ${whom} with a +${ownModifier[1] ?? ownModifier[2]} modifier. They share your multiple attack penalty.`).replace(/\[\[\/r (\d+d\d+) #Added Effect\]\]/g, "$1").replace(/\bAdded Effect\b/g, "Added effect");
    // (A penalty given to the triggering creature, North Wind's Night Verse's "You point the night verse at the triggering creature. A gust
    // … freezes its bones, imparting a –5-foot status penalty to its Speeds for 1 round": the target's.)
    if (/\bat the triggering creature\./i.test(text)) text = text.replace(/,\s*imparting (an? [-–−]\d+(?:-foot)? (?:status|circumstance|item) penalty to its [^.<]+)\./g, ". The target takes $1.");
    // (A missile that hits on its own, Cape of Justice's "The shuriken hits automatically and deals 1d4+1 force damage, or 2d4+2 force
    // damage if the target is your designated offender": damage outright at the target, the other case a note.)
    text = text.replace(/\bThe [\w-]+ hits automatically and deals (@Damage\[(?:[^\[\]]|\[[^\]]*\])*\](?:\{[^}]*\})?) damage(?:, or (@Damage\[(?:[^\[\]]|\[[^\]]*\])*\](?:\{[^}]*\})?) damage if the target is ([^.]+))?\./g, (whole, damage, other, which) => `The target takes ${damage} damage.${other ? ` A target that's ${which} takes ${other} damage instead.` : ""}`);
    // (A damage link with its save and no "damage" word, Black Hole Armor's "Each creature in the burst takes @Damage[10d8[piercing]]
    // with a @Check[reflex|dc:35] save": the reader's "… damage with a … save".)
    text = text.replace(/(\btakes? @Damage\[(?:[^\[\]]|\[[^\]]*\])*\](?:\{[^}]*\})?) with an? (@Check\[(?:type:)?(?:fortitude|reflex|will)\b)/g, "$1 damage with a $2");
    // (Other damage for one kind of creature in the middle of the sentence, Lance of Sun's Radiance's "Creatures in the area take 6d8
    // spirit damage, or 6d12 spirit damage if they're a dragon (… basic save)": the damage and its save, the dragon's a note.)
    text = text.replace(/(\btake @Damage\[(?:[^\[\]]|\[[^\]]*\])*\](?:\{[^}]*\})? damage), or (@Damage\[(?:[^\[\]]|\[[^\]]*\])*\](?:\{[^}]*\})?) damage if they're an? ([\w-]+) (\(@Check\[[^\]]*\](?:\{[^}]*\})? save\))\./g, (whole, base, other, kind, save) => `${base} ${save}. A ${kind} takes ${other} damage instead.`);
    // (A lock's bonus for anyone picking it, Lockpicker's Oil's "Anyone attempting to Pick the Lock within the next minute gains a +1
    // status bonus to the Thievery check": its user's, for that minute — anyone else's a note.)
    text = text.replace(/\bAnyone attempting to (?:@UUID\[[^\]]*\]\{)?(Pick (?:the|a) Lock)\}? within the next minute gains an? \+(\d+) (status|circumstance|item) bonus to the (\w+) check\./g, (whole, action, value, type, skill) => `You gain a +${value} ${type} bonus to ${skill} checks to Pick a Lock for 1 minute. Anyone else attempting to Pick that Lock within the minute gains the bonus too.`);
    // (Damage and a save with no degrees given, Ice Slick Snare's "it takes @Damage[2d6[cold]] damage and must attempt a
    // @Check[reflex|dc:22|traits:damaging-effect] saving throw", where PF2e's own text ends: a basic save against that damage.)
    if (!/\b(?:Critical Success|Critical Failure)\b/.test(text)) text = text.replace(/(\btakes @Damage\[(?:[^\[\]]|\[[^\]]*\])*\](?:\{[^}]*\})?) damage and must attempt an? @Check\[(fortitude|reflex|will)\|dc:(\d+)(?![^\]]*\bbasic\b)[^\]]*\] saving throw\./g, "$1 damage with a @Check[$2|dc:$3|basic] saving throw.");
    // (A vaccine's bonus against "other strains of the same disease", which PF2e can't tell apart: its bonus to saves against
    // diseases, the strain's immunity a note.)
    text = text.replace(/\bA vaccine grants a creature immunity to a specific strain of disease ([^,.]*), and an? \+(\d+) (item|status|circumstance) bonus on all saving throws against other strains of the same disease\./g, (whole, level, value, type) => `You gain a +${value} ${type} bonus to saving throws against diseases. Its immunity to the one strain of disease it was made for (${level}) is the GM's, and the bonus is only against other strains of that disease.`);
    // (A bonus narrower than PF2e's roll, applied to the whole roll for its time, the narrower words a note: Phantom Roll's "+1 item
    // bonus to Stealth checks you attempt during the Avoid Notice exploration activity", Infiltrator's Elixir's "+4 status bonus to
    // your Deception DC to avoid others seeing through your disguise", Armor Polishing Kit's "Creatures wearing armor that has been
    // maintained by this kit gain a +1 circumstance bonus on Diplomacy checks to Make an Impression on soldiers, guards, …".)
    text = text.replace(/\byou gain an? \+(\d+) (item|status|circumstance) bonus to (\w+) checks you attempt during the (?:@UUID\[[^\]]*\]\{)?([A-Z][\w ]+?)\}? exploration activity\./g, (whole, value, type, skill, activity) => `you gain a +${value} ${type} bonus to ${skill} checks. The bonus is only for ${skill} checks during the ${activity} exploration activity.`);
    text = text.replace(/\bYou gain an? \+(\d+) (item|status|circumstance) bonus to your (\w+) DC (to avoid others seeing through your disguise)(, and [^.]*)?\./g, (whole, value, type, skill, scope, rest) => `You gain a +${value} ${type} bonus to your ${skill} DC. The bonus is only ${scope}${rest ?? ""}.`);
    text = text.replace(/\bCreatures wearing armor that has been maintained by this kit gain an? \+(\d+) (item|status|circumstance) bonus on (\w+) checks to ((?:@UUID\[[^\]]*\]\{)?[A-Z][\w ]+?\}?) on ([^.]+)\./g, (whole, value, type, skill, action, whom) => `You gain a +${value} ${type} bonus to ${skill} checks to ${action}. The bonus is only on ${whom}, for whoever wears the armor maintained by this kit.`);
    // (A cloud that moves with its user, Smogger's "creates a 10-foot-radius emanation of smog centered on you, which moves with you. You
    // and other creatures in the smog are Concealed while inside the smog, and other creatures are concealed to you … The smogger can
    // maintain this effect for up to 1 minute": as the ability compiler reads a zone on its user, Concealed inside, for that time.)
    const kept = /\bThe (?:<em>)?[\w' -]+?(?:<\/em>)? can maintain this effect for up to (\d+ (?:minutes?|rounds?|hours?)), and the wearer of the (?:<em>)?[\w' -]+?(?:<\/em>)? can Dismiss the effect\./i.exec(text);
    if (kept) text = text.replace(/\bof (smog|smoke|fog) centered on you, which moves with you\. You and other creatures in the \1 are (@UUID\[[^\]]*\]\{Concealed\}) while inside the \1, and other creatures are concealed to you and other creatures in the \1\./i, (whole, cloud, link) => `of ${cloud} centered on you for ${kept[1]}, which moves with you; creatures within the ${cloud} are ${link}, and other creatures are concealed to them.`).replace(kept[0], "Its wearer can Dismiss the effect.");
    // (A cloud given by its radius in words, Smoke Fan's "it creates a cloud of colored smoke. The smoke fills a 5-foot radius. … The smoke
    // lasts for 1 minute": a burst there for that time, as the ability compiler reads a zone; "the smoke's area" the smoke.)
    text = text.replace(/\bit creates a cloud of ([\w ]*?smoke)\. The smoke fills a (\d+)-foot radius\.([\s\S]*?)\bThe smoke lasts for (\d+ (?:minutes?|rounds?))(?: or until (?:dissipated|dispersed) by a strong wind)?\./i, (whole, smoke, feet, between, time) => `it creates a cloud of ${smoke} that fills a @Template[burst|distance:${feet}] for ${time}.${between.replace(/\bthe smoke's area\b/i, "the smoke")} A strong wind disperses it.`);
    // (A mist given its radius later, Metalmist Sphere's "creates an opaque mist in a burst centered on one corner of your space. Creatures
    // within that area are concealed … The mist lasts for 1 minute or until dispersed by a strong wind. … The radius of the burst is 5
    // feet": that burst for that time, Concealed inside, as the ability compiler reads a zone.)
    const radius = /\bThe radius of the burst is (\d+) feet\.\s*/i.exec(text);
    const mistTime = /\bThe mist lasts for (\d+ (?:minutes?|rounds?)) or until (?:dispersed|dissipated) by a strong wind\.\s*/i.exec(text);
    if (radius && mistTime) text = text.replace(/\bcreates an opaque mist in a burst centered on one corner of your space\. Creatures within that area are concealed, and all other creatures are concealed to them\./i, `creates an opaque mist in a @Template[burst|distance:${radius[1]}] centered on one corner of your space for ${mistTime[1]}. Creatures within the mist are Concealed, and all other creatures are concealed to them.`).replace(mistTime[0], "A strong wind disperses it. ").replace(radius[0], "");
    // (A balm used during Assisted Recovery, a third-party one naming its damage types a sentence before the flat check it gives the
    // creature touched: that check against persistent damage of those types, at the creature touched — the recovery reader's.)
    text = text.replace(/\bas part of your Assisted Recovery against ((?:\w+)(?:,? (?:or|and) \w+)*) damage\.(\s*)The creature (?:touched|you touch) (?:immediately )?attempts an? (@Check\[flat\|dc:\d+\](?:\{[^}]*\})?) to end the persistent damage\b/g, (whole, types, space, check) => `as part of your Assisted Recovery against ${types} damage.${space}A creature you touch immediately attempts a ${check} to end persistent ${types} damage`);
    // (A weapon that sheds a trait and gains extra damage for a round, a third-party whip's activation: its own Strikes' damage and its
    // trait gone, as the row reader takes a weapon's.)
    text = text.replace(/\bFor (\d+) (rounds?|minutes?), [^.—–]*?[—–]\s*it (?:loses|drops) the (\w+) trait and (?:attacks|Strikes) (?:also |additionally )?deal @Damage\[(\d+d\d+)\[(\w+)\]\] damage\./g, (whole, count, unit, trait, dice, type) => `For ${count} ${unit}, the weapon loses the ${trait} trait. For ${count} ${unit}, your Strikes with the weapon deal ${dice} additional ${type === "bleed" ? "persistent bleed" : type} damage.`);
    // (A fulu affixed to a creature, Thousand-Pains Fulu's "A creature to which the fulu is affixed must attempt a
    // @Check[fortitude|dc:27|basic]. … The fulu deals @Damage[7d6[piercing]] as hair, nails, and connective tissues stab inward":
    // the target's basic save against that damage; the persistent damage it primes for later stays a note.)
    const affixed = /\bA creature to which the fulu is affixed must attempt an? (@Check\[(?:fortitude|reflex|will)\|[^\]]*\bbasic\b[^\]]*\])\./.exec(text);
    const fuluDeals = /\s*\bThe fulu deals (@Damage\[[^\]]*\]\])(?: damage)?[^.]*\./.exec(text);
    if (affixed && fuluDeals) text = text.replace(fuluDeals[0], "").replace(affixed[0], `The target takes ${fuluDeals[1]} damage with a ${affixed[1]} save.`);
    // (Ammunition that releases something around its target, a third-party one: its damage to "the creature" there and a condition while
    // that damage lasts — on a hit, the Strike's extra persistent damage and the condition, its end the GM's.)
    text = text.replace(/(\bThis (?:ammo|ammunition) releases [^.]*? around (?:its|the) target\.) (?:The|That) creature takes @Damage\[\((\d+d\d+)\)\[(\w+),persistent\]\] damage\. (?:As|So) long as it (?:keeps taking|continues to take) this \w+ damage, it is (@UUID\[[^\]]*\]\{(\w+)\})([^.]*)\./g, (whole, opening, dice, type, condition, name, rest) => `${opening} On a hit, the target is ${condition}. The Strike deals an additional @Damage[${dice}[persistent,${type}]] damage. It stays ${name} while it takes the persistent damage${rest}.`);
    // (A creature's own check modifier given as an inline roll ahead of its skill's name, a third-party alchemical creature's Shove: the
    // plain modifier, as the own-check reader takes it.)
    text = text.replace(/\bwith an? (?:\[\[\/r 1d20\+(\d+)\]\](?:\{[^}]*\})?|\+(\d+)) (?:Athletics|Acrobatics) modifier to its check\b/g, (whole, rolled, plain) => `with a +${rolled ?? plain} modifier`);
    // (Wind Ocarina's gusts: "The area is difficult terrain to creatures attempting to move through it", difficult terrain.)
    text = text.replace(/\bThe area is difficult terrain to creatures attempting to move through it\./g, "The area is difficult terrain.");
    // (Allies who Stand at once, Core Bugle's Reveille "You and all allies within a 30-foot emanation can immediately Stand as a free action":
    // prone ended on its user and the allies targeted, as the reduction reader takes it.)
    text = text.replace(/\bYou and all allies within (?:a |an )?@Template\[(?:type:)?emanation\|distance:(\d+)\](?:\{[^}]*\})? can immediately Stand as a free action; this doesn't provoke reactions\./g, (whole, feet) => `You end the prone conditions on yourself and allies of your choice within ${feet} feet: each Stands as a free action, which doesn't provoke reactions.`);
    // (A drake rifle's Drake Shot: "As long as the Strike isn't a critical failure, the drake rifle deals @Damage[(1 *
    // @item.system.damage.dice[splash])[@item.system.damage.damageType]]{1 splash damage per weapon damage die} to the target and
    // creatures within 5 feet of the target" — its splash on the Strike's damage roll, a failure's a note — and "On a hit, the drake
    // rifle provides one of the following additional effects based on its damage type: <li>Fire A massive explosion knocks the target
    // back. The target is pushed 10 feet away from you, and if it's on the ground, it falls Prone." — its own type's rider, as the
    // Strike reader takes it.)
    text = text.replace(/\bAs long as the Strike isn't a critical failure, the [\w' -]+? deals @Damage\[\(1 \* @item\.system\.damage\.dice\[splash\]\)\[@item\.system\.damage\.damageType\]\](?:\{[^}]*\})? to the target and creatures within (?:@Template\[[^\]]*\]\{)?(\d+) feet\}? of the target\.(?:\s*This splash damage is of the same type as its normal damage\.)?/g, (whole, feet) => {
        // (Its source data counts the striking rune apart; PF2e's prepared data has it in the dice already.)
        const dice = Math.max(Number(item?.system?.damage?.dice) || 1, 1 + (Number(item?.system?.runes?.striking) || 0));
        const type = String(item?.system?.damage?.damageType ?? "").toLowerCase();
        return type ? `The Strike deals ${dice} ${type} splash damage for this Strike. On a failure, the target and creatures within ${feet} feet of it still take that splash damage.` : whole;
    });
    text = text.replace(/<p>On a hit, the [\w' -]+? provides one of the following additional effects based on its damage type:<\/p>\s*<ul>\s*<li>\s*<strong>\w+<\/strong>\s*[^.<]*\.\s*([\s\S]*?)<\/li>\s*<\/ul>/g, (whole, rider) => `<p>On a hit, ${rider.replace(/\s*\(@UUID\[[^\]]*\]\{Effect: [^}]+\}\)/g, "").replace(/, and if it's on the ground, it falls (@UUID\[[^\]]*\]\{Prone\})\./, " and falls $1. A target that isn't on the ground doesn't fall Prone.")}</p>`);
    // (An attack with a talisman's ranged weapon, Alchemist's Damper's "Trigger You attack with the affixed firearm": its Strike, as the
    // Strike reader takes it.)
    text = text.replace(/\bYou attack with the affixed (firearm|crossbow|bow)\b/g, "You attempt a ranged Strike with the affixed $1");
    // (Deafened to everything but itself, Mordant Mask's "You become Deafened to all other noise until the end of your next turn":
    // Deafened, as PF2e's condition is.)
    text = text.replace(/(@UUID\[[^\]]+\]\{Deafened\}) to all other (?:noise|sounds?)\b/g, "$1");
    // (A condition for its user's next turn, Bloodline Robe's "You're Quickened on your next turn": until that turn's end.)
    text = text.replace(/\b(You're|You are) (@UUID\[[^\]]+\]\{[^}]+\}) on your next turn\b/g, "$1 $2 until the end of your next turn");
    // (Its damage or healing for its owner's level: the Harrow Court's "The damage increases to … if you're at least 15th level".)
    text = byOwnerLevel(text, item?.ownerLevel);
    // (A weapon's own Strike damage, its owner's Strength with it: Buzzsaw Axe's "take damage equal to the weapon's melee damage,
    // including your Strength modifier" — its dice, die and type, and the owner's modifier when live play gives it.)
    if (item?.type === "weapon" && Number.isFinite(Number(item?.ownerAbilities?.str))) {
        const str = Number(item.ownerAbilities.str);
        text = text.replace(/\btake damage equal to the weapon's melee damage, including your Strength modifier\b/gi, `take @Damage[(${weaponDice(item)}${item.system?.damage?.die ?? "d6"}${str >= 0 ? "+" : ""}${str})[${item.system?.damage?.damageType ?? "untyped"}]] damage`);
    }
    // (Its owner's own numbers, when live play gives them: Wolf Fang's "@Damage[(@actor.abilities.str.mod)[bludgeoning]] damage equal
    // to your Strength modifier", Pact of the Herald and Host's "(@actor.level)d6".)
    text = withOwnerNumbers(text, item);
    // (Dice per weapon damage die — Unholy Bloodshed's: one die where no weapon says more, src/compiler/runes.js giving its weapon's.)
    text = perWeaponDie(text, item?.type === "weapon" ? weaponDice(item) : 1, item?.type === "weapon" ? item.system?.damage?.damageType ?? null : null);
    // (A skill check written without its link against the creature that triggered it, Shadowmist Cape's "Attempt a Stealth check against the
    // triggering creature's Perception DC. If you roll a success, you're Hidden from that creature …", Storyteller's Opus's Deception: the
    // link the ability compiler reads, its degrees as "On a success".)
    const unlinked = /\bAttempt an? (Acrobatics|Athletics|Deception|Diplomacy|Intimidation|Performance|Stealth|Thievery) check against the triggering ([\w ]+?)'s (Perception|Fortitude|Reflex|Will) DC\./;
    if (unlinked.test(text)) {
        text = text.replace(unlinked, (all, skill, who, defense) => `Attempt a @Check[${skill.toLowerCase()}|against:${defense.toLowerCase()}] check against the triggering ${who}'s ${defense} DC.`)
            .replace(/\bIf you roll a (critical )?success, /g, (all, critical) => `On a ${critical ?? ""}success, `)
            .replace(/\bIf you succeed, /g, "On a success, ");
    }
    // (Damage as many as the weapon's damage dice, Scizore of the Crab's "dealing slashing damage equal to the scizore of the crab's number
    // of damage dice": that number — its die count and striking rune — at the creature it holds.)
    if (item?.type === "weapon") text = text.replace(/,?\s*dealing (\w+) damage equal to the (?:<em>)?[\w' -]+?(?:<\/em>)?(?: )?'s number of damage dice\./i, (all, type) => `. The target takes @Damage[${weaponDice(item)}[${type.toLowerCase()}]] damage.`);
    // (A condition that "increases to" a value on a failed save, as the ability compiler reads one: Putrescent Glob's "the creature
    // you damaged must succeed at a … save or its sickened condition increases to Sickened 2" — "The target must succeed at a
    // … save or be Sickened 2".)
    // (Its "and it can't reduce its sickened condition until …" as the reader takes it: "its sickened value can't be reduced below 2 …".)
    text = text.replace(/\b(?:When you activate [^,.<]+, )?[Tt]he (?:creature you damaged|creature you hit|target) must succeed at an? (@Check\[[^\]]*\](?:\{[^}]*\})?) save or its (\w+) condition increases to (@UUID\[[^\]]*\]\{[^}]*?(\d+)\})(?:, and it can't reduce its \w+ condition( until [^.]+)?)?/g, (whole, check, slug, link, value, until) => `The target must succeed at a ${check} save or be ${link}${until !== undefined || /can't reduce/.test(whole) ? `, and its ${slug} value can't be reduced below ${value}${until ?? ""}` : ""}`);
    // (A save link with no DC in an activation its user's spell triggers, Maw of Hungry Shadows' "Your last action was to cast a
    // spell prepared from this grimoire …, who must attempt a @Check[fortitude] save": its user's spell DC.)
    if (/\bYour last action was to cast a spell\b/i.test(text)) text = text.replace(/@Check\[(fortitude|reflex|will)\]/gi, "@Check[$1|against:spell]");
    // (A save against the owner's own DC: its stand-in.)
    text = text.replace(/@Check\[((?:type:)?(?:fortitude|reflex|will))\|([^\]]*?)\bagainst:(class-spell|class|spell)\b/gi, (whole, statistic, before, kind) => `@Check[${statistic}|${before}dc:${STAND_IN[kind.toLowerCase()]}`);
    if (!/@item\./.test(text) && !/\bpotency rune\b/i.test(text) && !DAMAGE_SAVE.test(text)) return text;
    for (const [path, read] of Object.entries(PATHS)) text = text.split(path).join(String(read(item)));
    // (A dice count that's now arithmetic: "((1 + 1) * 2)d6" → "4d6".)
    text = text.replace(/\(([\d\s+\-*/()]+)\)d(\d+)/g, (whole, expression, faces) => {
        const count = arithmetic(expression);
        return count === null ? whole : `${count}d${faces}`;
    });
    text = basicDamageSaves(text);
    // (A higher save DC with a +2 potency rune, another with a +3: the DC for its rune.)
    const raised = /\bThe save DC increases to (\d+) if [^.]*?\+(\d) potency rune(?:, or to (\d+) with a \+(\d) potency rune)?/i.exec(text);
    if (raised) {
        const potency = Number(item?.system?.runes?.potency) || 0;
        const dc = raised[3] && potency >= Number(raised[4]) ? raised[3] : potency >= Number(raised[2]) ? raised[1] : null;
        if (dc) text = text.replace(/(@Check\[(?:type:)?(?:fortitude|reflex|will)\|dc:)\d+/gi, `$1${dc}`);
    }
    return text;
}

// "… that does @Damage[4d6[force]] damage with a @Check[reflex|dc:23] save." — damage with a save and no degree rows of its
// own reads only one way, a basic save (PF2e's own text always says so; some third-party text leaves the word out). And
// Lacquered Waist Drum's "This deals @Damage[5d8[vitality]] damage (@Check[fortitude|dc:28] save) to that creature".
const DAMAGE_SAVE = /@Damage\[(?:[^\[\]]|\[[^\]]*\])+\] damage (?:with a |\()@Check\[(?:type:)?(?:fortitude|reflex|will)\|(?![^\]]*\bbasic\b)[^\]]*\] save\b/i;
function basicDamageSaves(text) {
    // (Not where its own activation has degree rows: up to the next one.)
    return text.replace(new RegExp(DAMAGE_SAVE.source, "gi"), (sentence, at) => {
        const next = text.slice(at).search(/<strong>\s*Activate\b/i);
        const own = next < 0 ? text.slice(at) : text.slice(at, at + next);
        if (/\bCritical (?:Success|Failure)\b/.test(own) || /\bCritical (?:Success|Failure)\b/.test(text.slice(text.lastIndexOf("Activate", at) < 0 ? 0 : text.lastIndexOf("Activate", at), at))) return sentence;
        return sentence.replace(/(@Check\[(?:type:)?(?:fortitude|reflex|will)\|[^\]]*)\]/i, "$1|basic]");
    });
}

// Each stand-in of the owner's DC in a plan as the core's { dc: "owner", statistic }; a cast's DC number (The Cyclone's) as
// dc null and ownerDC, for live play to fill in; and in its words as "your class DC".
export function ownerDCs(plan) {
    if (!plan || !JSON.stringify(plan).match(/\b900[123]\b/)) return plan;
    const walk = (value) => {
        if (typeof value === "string") return value.replace(/\bDC (900[123])\b/g, (whole, number) => OWNER_WORDS[OWNER_DCS[number]]).replace(/\bdc:(900[123])\b/g, (whole, number) => `against:${OWNER_DCS[number]}`);
        if (Array.isArray(value)) return value.map(walk);
        if (!value || typeof value !== "object") return value;
        if (value.dc === "fixed" && OWNER_DCS[value.value]) {
            const { value: _, ...rest } = value;
            return { ...rest, dc: "owner", statistic: OWNER_DCS[value.value] };
        }
        const walked = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, walk(entry)]));
        return typeof value.dc === "number" && OWNER_DCS[value.dc] ? { ...walked, dc: null, ownerDC: OWNER_DCS[value.dc] } : walked;
    };
    return walk(plan);
}

// The plan with each owner's DC filled in from dcs ({ class, spell }: numbers or null): "class-spell" the higher one. The
// checks it can't fill stay as they are; filled reports whether any was left.
export function fillOwnerDCs(plan, dcs = {}) {
    let missing = false;
    const of = (statistic) => {
        const values = (statistic === "class-spell" ? [dcs.class, dcs.spell] : [dcs[statistic]]).map(Number).filter((value) => Number.isFinite(value) && value > 0);
        return values.length ? Math.max(...values) : null;
    };
    const walk = (value) => {
        if (Array.isArray(value)) return value.map(walk);
        if (!value || typeof value !== "object") return value;
        if (value.dc === "owner") {
            const dc = of(value.statistic);
            if (dc === null) {
                missing = true;
                return value;
            }
            const { statistic: _, ...rest } = value;
            return { ...rest, dc: "fixed", value: dc };
        }
        const walked = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, walk(entry)]));
        // (A cast's DC: with none of the owner's, the spell module's own.)
        if (value.ownerDC && value.dc == null) {
            const { ownerDC, ...rest } = walked;
            return { ...rest, dc: of(ownerDC) };
        }
        return walked;
    };
    const filled = plan && /"owner"|"ownerDC"/.test(JSON.stringify(plan)) ? walk(plan) : plan;
    return { plan: filled, missing };
}

export const hasOwnerDC = (plan) => Boolean(plan) && /"dc":"owner"|"ownerDC"/.test(JSON.stringify(plan));

// "The damage increases to @Damage[8d6[…]] if you're at least 15th level, to @Damage[9d6[…]] if you're at least 17th level …"
// (The Desert, The Trumpet; The Midwife's healing): with its owner's level known (live play passes item.ownerLevel), the
// step for that level in place of the damage before it, and the sentence gone; unknown, as it was.
const LINK = String.raw`@Damage\[(?:[^\[\]]|\[[^\]]*\])+\](?:\{[^}]*\})?`;
const SCALING = new RegExp(String.raw`\s*The (?:damage|amount of healing granted|healing) increases to ${LINK}[^.]*? if you're at least \d+(?:st|nd|rd|th) level(?:,? (?:and )?(?:to )?${LINK}[^.]*? if you're at least \d+(?:st|nd|rd|th) level)*\.`, "i");
export function byOwnerLevel(html, level) {
    const text = String(html ?? "");
    const scaling = SCALING.exec(text);
    if (!scaling || !Number.isFinite(Number(level)) || level === null) return text;
    const steps = [...scaling[0].matchAll(new RegExp(String.raw`(${LINK})[^@]*? if you're at least (\d+)(?:st|nd|rd|th) level`, "gi"))].map((match) => ({ link: match[1], level: Number(match[2]) }));
    const step = steps.filter((entry) => entry.level <= Number(level)).sort((a, b) => b.level - a.level)[0];
    const before = text.slice(0, scaling.index);
    const base = [...before.matchAll(new RegExp(LINK, "gi"))].at(-1);
    if (step && !base) return text;
    const raised = step ? `${before.slice(0, base.index)}${step.link.replace(/\{[^}]*\}$/, "")}${before.slice(base.index + base[0].length)}` : before;
    return `${raised}${text.slice(scaling.index + scaling[0].length)}`;
}

// "@actor.level" and "@actor.abilities.str.mod" as the owner's (item.ownerLevel, item.ownerAbilities { str: 4, … }), and the
// words saying so ("equal to your Strength modifier") gone with them; unknown, as written.
const ABILITY_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
export function withOwnerNumbers(html, item) {
    let text = String(html ?? "");
    const level = Number(item?.ownerLevel);
    // (Healing that a feat of its owner's changes, when live play gives its feats: Lover's Knot's "you regain 2d6 Hit Points. If you
    // have the Battle Medicine feat, you instead regain 2d6+7 Hit Points" — the one for its owner.)
    if (Array.isArray(item?.ownerFeats)) {
        // (Each amount a roll link, "@Damage[2d6[healing]]{2d6 Hit Points}", or words; the feat a link or its name.)
        const amount = String.raw`(@Damage\[(?:[^\[\]]|\[[^\]]*\])*\](?:\{[^}]*\})?|[^.<@]+? Hit Points)`;
        const pattern = new RegExp(String.raw`\b(you regain) ${amount}\. If you have the (?:@UUID\[[^\]]*\]\{([^}]*)\}|([\w' -]+?)) feat, you instead regain ${amount}\.`, "gi");
        text = text.replace(pattern, (whole, regain, usual, linked, named, better) => `${regain} ${item.ownerFeats.includes(String(linked ?? named).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-")) ? better : usual}.`);
    }
    // (Healing for its owner's level in words, The Rakshasa's "You regain Hit Points equal to twice your level".)
    const known = Number.isFinite(level) && item?.ownerLevel !== null && item?.ownerLevel !== undefined;
    if (known) text = text.replace(/\b(You regain) Hit Points equal to (twice |three times )?your level\b/g, (whole, regain, times) => `${regain} ${level * ({ "twice ": 2, "three times ": 3 }[times ?? ""] ?? 1)} Hit Points`);
    if (!/@actor\./.test(text)) return text;
    const abilities = item?.ownerAbilities ?? null;
    let used = [];
    text = text.replace(/@actor\.level\b/g, (whole) => (Number.isFinite(level) && item?.ownerLevel !== null && item?.ownerLevel !== undefined ? String(level) : whole));
    text = text.replace(/@actor\.abilities\.(str|dex|con|int|wis|cha)\.mod\b/g, (whole, key) => {
        if (!Number.isFinite(Number(abilities?.[key]))) return whole;
        used.push(ABILITY_NAMES[key]);
        return String(Number(abilities[key]));
    });
    // (A number in brackets: "(4)[bludgeoning]" → "4[bludgeoning]", "(15)d6" → "15d6".)
    text = text.replace(/\((-?\d+)\)(?=\[|d\d)/g, "$1");
    for (const name of new Set(used)) text = text.replace(new RegExp(String.raw`\s+equal to your ${name} modifier\b`, "g"), "");
    return text;
}

// A weapon's damage dice: its own (1) and its striking rune's.
export const weaponDice = (weapon) => (Number(weapon?.system?.damage?.dice) || 1) + (Number(weapon?.system?.runes?.striking) || 0);

// "takes Persistent Bleed Damage equal to 1d8 per weapon damage die of the etched weapon" → "takes 3d8 persistent bleed damage"
// (dice: the weapon's); "1d6 per weapon damage die" → "3d6"; Swarming's "take damage equal to double the weapon's number of
// damage dice" → "take 6 piercing damage" (type: the weapon's damage type, untyped without one).
export function perWeaponDie(html, dice, type = null) {
    const per = String.raw`(\d+)d(\d+) per (?:weapon )?damage die(?: of the (?:etched |affixed )?weapon)?`;
    return String(html ?? "")
        .replace(/\btake damage equal to (double|twice|triple) the weapon's number of damage dice\b/gi, (whole, times) => `take @Damage[${({ double: 2, twice: 2, triple: 3 })[times.toLowerCase()] * dice}[${type ?? "untyped"}]] damage`)
        .replace(new RegExp(String.raw`\btakes (?:@UUID\[[^\]]*\]\{)?Persistent (\w+) Damage\}? equal to ${per}`, "gi"), (whole, type, count, faces) => `takes ${Number(count) * dice}d${faces} persistent ${type.toLowerCase()} damage`)
        .replace(new RegExp(String.raw`\b${per}`, "gi"), (whole, count, faces) => `${Number(count) * dice}d${faces}`);
}

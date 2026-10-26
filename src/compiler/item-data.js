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
    // (Its Craft Requirements paragraph right after result rows, how it's made, not what it does: off, or the ability compiler reads it into the
    // last row — Whirlwind Vial's critical failure "… knocked Prone. Craft Requirements Supply magical residue …", a line by hand. Only that
    // paragraph — what follows it is the item's, Dragonplate's table, Vaccine's Duration — and only after rows: elsewhere it's left as it was.)
    text = text.replace(/(<strong>\s*(?:Critical )?(?:Success|Failure)\s*<\/strong>(?:(?!<strong>\s*Craft Requirements)[\s\S])*?<\/p>\s*)(?:<hr\s*\/?>\s*)?<p>\s*<strong>\s*Craft Requirements\s*<\/strong>[\s\S]*?<\/p>/gi, "$1");
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
    // (More of them, each bonus to the actions PF2e names in the roll's options, the narrower words a note: Elixir of the Peaks' "+1 item bonus
    // to Athletics checks made to Climb, High Jump, or Long Jump" while in mountainous terrain, Oozepick's thieves' tools "+2 item bonus to
    // Thievery checks to Pick a Lock or Disable a Device" against its own mechanism, Conspirator's Cookie's Make an Impression or Request "in
    // the chosen language", Mender's Soup's Repair, Aroma Concealer's Hide or Sneak against creatures using smell, Potion of Disguise's
    // Deception DC against Perception checks, Fungal Walk Musk's AC against fungus creatures' melee attacks.)
    const link = (name) => String.raw`(?:@UUID\[[^\]]*\]\{)?${name}\}?`;
    text = text.replace(new RegExp(String.raw`\bFor (1 hour|1 day|7 days), drinking this elixir while in mountainous terrain protects you from the effects of severe cold and grants you an? \+(\d+) item bonus to Athletics checks made to Climb, ${link("High Jump")}, or ${link("Long Jump")}, as well as to saving throws against the effects of high altitude\.`, "i"), (all, time, value) => `You gain a +${value} item bonus to Athletics checks to Climb, High Jump, or Long Jump for ${time}. The bonus is only while you are in mountainous terrain, where it also protects you from severe cold and adds to saving throws against high altitude.`);
    text = text.replace(new RegExp(String.raw`\bThe ooze is treated as a set of thieves' tools that last for (\d+ hours?) and provide an? \+(\d+) item bonus to Thievery checks to ${link("Pick a Lock")} or ${link("Disable a Device")} against the mechanism into which they were first poured\.`, "i"), (all, time, value) => `You gain a +${value} item bonus to Thievery checks to Pick a Lock or Disable a Device for ${time}. The bonus is only against the mechanism the ooze was first poured into, where the ooze counts as thieves' tools.`);
    text = text.replace(new RegExp(String.raw`\bA conspirator's cookie grants you an? \+(\d+) item bonus to Diplomacy checks to ${link("Make an Impression")} or ${link("Request")} in the chosen language and you can add your level even if untrained\.`, "i"), (all, value) => `You gain a +${value} item bonus to Diplomacy checks to Make an Impression or Request for 1 hour. The bonus is only in the chosen language, and you can add your level even if untrained.`);
    text = text.replace(/\bYou gain an? \+(\d+) item bonus to Crafting checks to Repair and restore an additional (\d+) Hit Points to items you successfully Repair during this time\./i, (all, value, hp) => `You gain a +${value} item bonus to Crafting checks to Repair for 24 hours. Items you successfully Repair during this time regain an additional ${hp} Hit Points, by hand.`);
    text = text.replace(new RegExp(String.raw`\bThe creature receives an? \+(\d+) item bonus to Stealth checks to ${link("Hide")} or ${link("Sneak")} against creatures using primarily smell\. This bonus also applies to the DC to ${link("Track")} the creature by scent\.`, "i"), (all, value) => `You gain a +${value} item bonus to Stealth checks to Hide or Sneak for 1 hour. The bonus is only against creatures using primarily smell, and it also applies to the DC to Track you by scent.`);
    // (Mask of Shifting Monstrosity's for its "transformation lasting for 8 hours"; a potion's for 24, its 2d12 hours the GM's.)
    const lasting = /\bwith the transformation lasting for (\d+ hours)\b/i.exec(text)?.[1] ?? null;
    text = text.replace(/\bYou gain an? \+(\d+) (status|item) bonus to your Deception DC against such Perception checks and add your level even if untrained\./i, (all, value, type) => lasting
        ? `You gain a +${value} ${type} bonus to your Deception DC for ${lasting}. The bonus is only against Perception checks to see through the disguise, and you add your level even if untrained.`
        : `You gain a +${value} ${type} bonus to your Deception DC for 24 hours. The bonus is only against Perception checks to see through the disguise, and you add your level even if untrained; the disguise lasts as long as the GM rolled in secret, ended by hand.`);
    // (Oathbow's oath: "your attacks with the bow against that creature deal 1d6 additional damage, and you gain a +2 circumstance bonus to
    // Survival checks to Track that creature" for its 7 days — the bow's own extra damage, marked to the creature (src/compiler/marked.js),
    // and the Track bonus, whose creature is a note.)
    text = text.replace(/\bFor the next (\d+) days or until that creature is slain, your attacks with the bow against that creature deal (\d+d\d+) additional damage, and you gain an? \+(\d+) circumstance bonus to Survival checks to Track that creature\./i, (all, days, dice, value) => `For ${days} days, your Strikes with the weapon deal ${dice} additional damage. That damage is only against that creature, and the oath ends early if it's slain. You gain a +${value} circumstance bonus to Survival checks to Track for ${days} days; the bonus is only to Track that creature.`);
    // (Fulu Compendium's Paralyzing Page: undead "affected by a Spirit-Sealing Fulu with a … save DC of 25" — that fulu's own save, Will or
    // Paralyzed for 1 round, at that DC for the creatures in the emanation; only undead, and the fulu's incapacitation, notes.)
    text = text.replace(/\bAll undead creatures in an? (@Template\[(?:type:)?emanation\|distance:\d+\]) are affected by an? (?:@UUID\[[^\]]*\]\{)?Spirit-Sealing Fulu\}? with an? (@Check\[will\|dc:(\d+)[^\]]*\]) save DC of \3\./i, (all, template, check) => `All undead creatures in a ${template} must attempt a ${check} save or be @UUID[Compendium.pf2e.conditionitems.Item.6uEgoh53GbXuHpTF]{Paralyzed} for 1 round, as a Spirit-Sealing Fulu would (its incapacitation trait applies).`);
    // (Bangles of Crowns' "a +1 circumstance bonus to checks against the triggering creature for 1 round": the checks for the round, against
    // that creature alone by its mark, src/compiler/marked.js.)
    text = text.replace(/\bYou gain an? \+(\d+) circumstance bonus to checks against the triggering creature for (1 round)\./i, (all, value, time) => `You gain a +${value} circumstance bonus to checks for ${time}. The bonus is only against the triggering creature.`);
    // (Vine Arrow's hit, its rider in the next paragraph: "The target takes a –10-foot circumstance penalty to its Speeds for 2d4 rounds, or
    // until it Escapes against a DC of 19" — the hit's own, for its rolled rounds (the bombs' rider reader), the Escape a note, since "against
    // a" would read as a condition.)
    text = text.replace(/\bwrapping the target in vines\.(?:<\/p>)?\s*(?:<p>)?The target takes an? ([–-]\d+-foot circumstance penalty to its Speeds for \[\[\/r \d+d\d+\]\] rounds), or until it ((?:@UUID\[[^\]]*\]\{)?Escapes\}?) against a DC of (\d+)\./i, (all, penalty, escapes, dc) => `wrapping the target in vines: the target takes a ${penalty}. The penalty ends early if the target ${escapes} (DC ${dc}).`);
    // (Herald's Ring's "by attempting to counteract the effect. The ring has a counteract modifier of +23": the modifier in the counteract's
    // own sentence, as src/compiler/counteract.js reads one aimed at the triggering effect.)
    text = text.replace(/\bto counteract the effect\. The (?:<em>)?[\w' -]+?(?:<\/em>)? has a counteract modifier of\b/i, "to counteract the effect with a counteract modifier of");
    // (Admonishing Band's shot "with the effects of Warning Shot": that feat's Demoralize, as the item-action reader takes it — at a foe out
    // to the firearm's maximum range, with no penalty for one that doesn't share a language with you.)
    text = text.replace(/\bWhen you activate it, you fire your gun into the air with the effects of (?:@UUID\[[^\]]*\]\{)?Warning Shot\}?\./i, "When you activate it, you attempt to Demoralize a foe by firing your gun into the air. The foe can be as far as the firearm's maximum range, and the check takes no penalty for a foe that doesn't share a language with you.");
    // (Admirer's Bouquet handed over, "If they accept the bouquet, they gain a +1 item bonus to saves against emotion and mental effects as
    // long as they continue to carry the admirer's bouquet": the triggering ally's, for as long as it carries the bouquet.)
    text = text.replace(/\bIf they accept the bouquet, they gain (an? \+\d+ item bonus to saves against emotion and mental effects) as long as they continue to carry the admirer's bouquet\./i, "The triggering ally gains $1. The bonus ends once the ally no longer carries the bouquet (end it by hand).");
    // (Iron Cudgel's "you use Brutal Finish, as the fighter feat": that feat's Strike — with a melee weapon in two hands, one more weapon
    // damage die (two at 18th level, by its owner's level), the die alone on a failure, the turn over after it; the feat's own extra die,
    // src/compiler/strike-damage.js FEAT_DIE.)
    text = text.replace(/\bWhen you activate the cudgel, you use (?:@UUID\[[^\]]*\]\{)?Brutal Finish\}?, as the fighter feat\. You must meet the normal requirements, including those of the press trait\.(<\/p>\s*<p>)If you have the Brutal Finish feat, add an additional weapon damage die on a success or a failure to the normal results\./i, (all, paragraph) => {
        const dice = Number(item?.ownerLevel) >= 18 ? "two" : "one";
        return `When you activate the cudgel, make a melee Strike with a weapon you're wielding in two hands. The Strike deals ${dice === "two" ? "an extra two dice" : "an extra die"} of weapon damage. On a failure, you deal damage equal to ${dice} weapon damage ${dice === "two" ? "dice" : "die"}. After the Strike, your turn ends.${paragraph}With the Brutal Finish feat, one more weapon damage die on a hit and on a failure.`;
    });
    // (Viper Rapier's "The target is affected as if successfully poisoned with cave worm venom (DC 43)": that venom's own stages at that DC,
    // as PF2e's Cave Worm Venom gives them — the ability module's affliction save card at the creature missed.)
    text = text.replace(/\bThe target is affected as if successfully poisoned with cave worm venom \(DC (\d+)\)\.<\/p>/i, (all, dc) => `The target is exposed to cave worm venom.</p><p><strong>Saving Throw</strong> @Check[fortitude|dc:${dc}]</p><p><strong>Maximum Duration</strong> 6 rounds</p><p><strong>Stage 1</strong> @Damage[5d6[poison]] damage and @UUID[Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7]{Enfeebled 2} (1 round)</p><p><strong>Stage 2</strong> @Damage[6d6[poison]] damage and enfeebled 2 (1 round)</p><p><strong>Stage 3</strong> @Damage[8d6[poison]] damage and enfeebled 2 (1 round)</p>`);
    // (Gravebane Ammunition's "If the target takes vitality damage, it must succeed at a … save": the creatures vitality damage harms are those
    // with void healing — the hit's save for them, src/compiler/strikes.js withSaveOnly.)
    text = text.replace(/\bOn a successful Strike, the attack deals an additional (@Damage\[[^\]]*\]\]?) damage to creatures with void healing\. If the target takes vitality damage, it must succeed at\b/i, (all, damage) => `On a successful Strike, the attack deals an additional ${damage} damage to creatures with void healing. On a hit, a target with void healing must succeed at`);
    // (Jawbreaker Shield's "If the shield bash hits, the target takes damage and must attempt a DC 31 Fortitude saving throw": the hit's
    // save, as the Strike reader takes it — the bash's own damage PF2e's.)
    text = text.replace(/\bIf the (shield bash|Strike) hits, the target takes damage and must attempt a DC (\d+) (Fortitude|Reflex|Will) saving throw\./i, (all, what, dc, save) => `On a hit, the target attempts a @Check[${save.toLowerCase()}|dc:${dc}] save.`);
    // (Megaphone Mutagen's "+1 item bonus to skill checks you make as part of auditory actions, except Deception and Diplomacy checks": those
    // checks by PF2e's options, src/compiler/rows.js; the longer range of its user's auditory actions and spells a note.)
    text = text.replace(/\bbonus to skill checks you make as part of (auditory|visual) actions, except ([A-Z]\w+) and ([A-Z]\w+) checks\./gi, (all, trait, first, second) => `bonus to skill checks for ${trait.toLowerCase()} actions, except ${first} and ${second} checks.`);
    // (Starshot Arrow's "When you activate and shoot a starshot arrow, you take no range penalties against any target that you can personally
    // detect": the Strike that fires it with PF2e's ignore-range-penalty option to its sixth increment, the detecting a note.)
    text = text.replace(/\bWhen you activate and shoot a (?:<em>)?starshot arrow(?:<\/em>)?, you take no range penalties against any target that you can personally detect\./i, "For the Strike with which you consume the ammunition, you take no range increment penalty on your attack, even if the target is all the way out to the sixth range increment. The target must be one you can personally detect.");
    // (Scope of Limning's Outline: "If your next Strike from the weapon to which the scope is attached hits a creature, … causing the creature
    // to glow until the end of your next turn" — the readied Strike, and src/compiler/hit-notes.js's note Effect on the creature hit for
    // that round.)
    text = text.replace(/\bIf your next Strike from the weapon to which the scope is attached hits a creature, the sound of the impact transforms into light, causing the creature to glow until the end of your next turn\.\s*A visible creature/i, "The next Strike you make with the weapon to which the scope is attached outlines its target in light. If your Strike hits, the creature glows for 1 round, to the end of your next turn: a visible creature");
    // (Sawtooth Reaper's Bloodmist Whirl: its next Strike's target Off-Guard (src/compiler/strike-damage.js), read after the fog that
    // "conceals you for 1 round or until you Strike" — that, and Ensnaring Disarm's free Strike, the readied Strike's notes.)
    text = text.replace(/\bYou whirl the chain of the sawtooth reaper, creating a crimson fog that conceals you for 1 round or until you Strike\.\s*The next Strike you make treats the target as ((?:@UUID\[[^\]]*\]\{)?Off-Guard\}?), and when you use Ensnaring Disarm you can also Strike the same target as a free action\./i, (all, offGuard) => `The next Strike you make treats the target as ${offGuard}. When you use Ensnaring Disarm, you can also Strike the same target as a free action. A crimson fog from the whirled chain conceals you for 1 round or until you Strike (Concealed, by hand).`);
    // (Hyldarf's Fang's Linnorm's Fang: "The next Strike you make with Hyldarf's Fang before the end of your next turn delivers the venom to
    // the target" — src/compiler/hit-delivery.js's coat of the hand cannon itself, for its round; its venom's "Saving Throw DC 34", no save named,
    // the Fortitude save of PF2e's injury poisons.)
    text = text.replace(/\bThe next Strike you make with Hyldarf's Fang before the end of your next turn delivers the venom to the target\./i, "The next creature you successfully Strike with this weapon within the next 1 round is exposed to Hyldarf's venom. Only the next Strike: a miss wastes it.");
    text = text.replace(/(Hyldarf's Venom(?:<\/strong>)?\s*\(fire, injury, poison\)(?:<\/p>)?\s*(?:<p>)?(?:<strong>)?Saving Throw(?:<\/strong>)?)\s*DC (\d+)\b/i, (all, lead, dc) => `${lead} @Check[fortitude|dc:${dc}|traits:poison]`);
    // (Emetic Paste's "The paste grants the target a +2 item bonus to that save and to all saving throws to reduce the sickened condition for
    // 1 hour": its Fortitude saves for the hour, at the creature targeted — its user or a sickened creature in reach —, those saves' being
    // to reduce the Sickened and the one it attempts at once, a note.)
    text = text.replace(/\bThe paste makes it easy for the sickened creature to purge, granting it an immediate Fortitude save to reduce its sickened condition\.\s*The paste grants the target an? \+(\d+) item bonus to that save and to all saving throws to reduce the sickened condition for 1 hour\./i, (all, value) => `Choose a creature within reach (you, or a sickened creature). You gain a +${value} item bonus to Fortitude saves for 1 hour. The bonus is only to saves to reduce the sickened condition, and the creature attempts one such save at once.`);
    // (Spirit Bulb's "When you activate the bulb, you either eat it to have it cast a 5th-rank Plant Form spell affecting you, or plant it …
    // to have it cast a 5th-rank Summon Plant or Fungus spell": the cast card's choice of the two, the first on its user.)
    text = text.replace(/\bWhen you activate the bulb, you either eat it to have it cast a (\d+)(st|nd|rd|th)-rank ((?:@UUID\[[^\]]*\]\{)?Plant Form\}?) spell affecting you, or plant it in the ground next to you to have it cast a \1\2-rank ((?:@UUID\[[^\]]*\]\{)?Summon Plant or Fungus\}?) spell\./i, (all, rank, suffix, form, summon) => `You cast a ${rank}${suffix}-rank ${form} spell affecting you or a ${rank}${suffix}-rank ${summon} spell: eat the bulb for the first, or plant it in the ground next to you for the second.`);
    // (Sky Hammer's Comet Fall: "A 6th-rank arcane Fireball spell explodes, centered on the sky hammer. The spell DC is 45." — a cast of that
    // Fireball, at that rank and DC: the spell module's to play when it reads it (its own reading has the centre and its user's immunity),
    // else the cast card's, those two notes.)
    text = text.replace(/\bA (\d+)(st|nd|rd|th)-rank (arcane|divine|occult|primal) ((?:@UUID\[[^\]]*\]\{)?Fireball\}?) spell explodes, centered on the (<em>)?sky hammer(<\/em>)?\.\s*The spell DC is (\d+)\./i, (all, rank, suffix, tradition, spell, open = "", close = "", dc) => `The hammer casts ${spell} as a ${rank}${suffix}-rank ${tradition} spell (DC ${dc}), centered on the ${open}sky hammer${close}.`);
    // (Worldscale Shield's Absorb Blow: "The worldscale shield completely absorbs the blow, preventing all damage that you would have taken
    // from the attack" — its trigger's physical damage, src/compiler/readied-bonus.js's immunity for that attack.)
    text = text.replace(/\bThe (<em>)?worldscale shield(<\/em>)? completely absorbs the blow, preventing all damage that you would have taken from the attack\./i, "You gain immunity to physical damage against the triggering attack.");
    // (Third-party ones, their own words not kept: a lodestone's bonus against forced movement, to DCs and checks, till its user's next turn
    // ends — saving throws and the Fortitude DC, PF2e's forced-movement option; a pearl's status bonus to saves against curses for a minute,
    // its better degree on the save that triggered it a note; a drake steak's Intimidation against creatures that smell, for its 24 hours; a
    // honey lozenge's Performance with the voice, for its hour.)
    text = text.replace(/\bYou gain an? \+(\d+) item bonus to DCs[^.]*?checks against forced movement[^.]*?the end of your next turn\./i, (all, n) => `Until the end of your next turn, you gain a +${n} item bonus to saving throws and Fortitude DC against forced movement.`);
    text = text.replace(/\bWhen you Activate it, you gain an? \+(\d+) status bonus to the triggering save[^.]*?curses for (1 minute)\.\s*On the triggering save, if the outcome[^.]*?failure, you get a success instead\. If the outcome[^.]*?critical failure, you get a failure instead\./i, (all, value, time) => `You gain a +${value} status bonus to saving throws against curses for ${time}. The save that triggered it is also one degree better if it fails, by hand.`);
    text = text.replace(/\bAfter Activating the steak, you gain an? \+(\d+) circumstance bonus on Intimidation checks against creatures[^.]*?scent[^.]*?\./i, (all, value) => `You gain a +${value} circumstance bonus to Intimidation checks for 24 hours. The bonus is only against creatures that sense by scent.`);
    text = text.replace(/\bFor up to 1 hour, you have an? \+(\d+) item bonus to Performance checks when[^.]*?voice\./i, (all, value) => `You gain a +${value} item bonus to Performance checks for 1 hour. The bonus is only when you perform with your voice.`);
    // (Invisible inside robes that stay visible, Hollow Robes' Empty Robes: not PF2e's Invisible, which would hide the wearer, only its
    // "+2 item bonus to Intimidation checks made while the robes appear to be empty" for the minute; what can't be seen, a note.)
    text = text.replace(/\bThe wearer becomes (?:@UUID\[[^\]]*\]\{)?Invisible\}? inside the robes for one minute\. Since the wearer's gear \(including the robes\) remain visible, they don't become (?:@UUID\[[^\]]*\]\{)?Concealed\}?, but they can't be visually identified unless the viewer can see invisible creatures\. The unsettling nature of this effect grants the wearer an? \+(\d+) item bonus to Intimidation checks made while the robes appear to be empty\./i, (all, value) => `You gain a +${value} item bonus to Intimidation checks for 1 minute. The wearer is unseen inside the robes for that minute, but the robes stay visible: no one can identify the wearer by sight unless they can see invisible creatures, and the wearer isn't hidden or concealed.`);
    // (And area buffs for the creatures in them, the presser's targets, as Knight Captain's Lance's: Undead
    // Compendium's "You and up to four allies that hear you … gain a +2 item bonus on attack rolls and saving throws against that type of
    // undead", Rhyton of the Radiant Ifrit's toast "against those creatures".)
    text = text.replace(/\bYou and up to four allies that hear you read the information aloud during the activation gain an? \+(\d+) item bonus on attack rolls and saving throws against that type of undead for the next (\d+ minutes)\./i, (all, value, time) => `You and allies within 30 feet of you gain a +${value} item bonus to attack rolls and saving throws against undead for ${time}. The bonus is only for you and up to four allies who heard you, and only against the type of undead you chose.`);
    text = text.replace(/\bYou gain an? \+(\d+) item bonus to Deception, Diplomacy, or Intimidation checks against those creatures for (\d+ hours?)\./i, (all, value, time) => `You gain a +${value} item bonus to Deception, Diplomacy, and Intimidation checks for ${time}. The bonus is only against the creatures you toasted.`);
    text = text.replace(/\bThe musk also grants you an? \+(\d+) item bonus to AC against melee attacks from fungus creatures with no vision for the same period of time\./i, (all, value) => `You gain a +${value} item bonus to AC against fungi for 1 day. The bonus is only against the melee attacks of fungus creatures with no vision.`);
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
    // (A named state that is a penalty, Pacifying's "The damaged creature must succeed at a @Check[will|dc:20] save or be pacified. A pacified
    // creature takes a –2 penalty to attack rolls on any attacks that aren't nonlethal for 1 minute": the penalty, the save's failure.)
    text = text.replace(/\b(?:The|the) damaged creature must succeed at an? (@Check\[[^\]]*\](?:\{[^}]*\})?) save or be (\w+)\. An? \2 creature takes an? ([–-]\d+) penalty to attack rolls on any attacks that aren't nonlethal for (\d+ (?:rounds?|minutes?))(?:,\s*and (\w))?/, (all, check, state, value, time, next) => `The target must succeed at a ${check} save or take a ${value} penalty to attack rolls for ${time}. Its nonlethal attacks don't take that penalty (by hand).${next ? ` ${next.toUpperCase()}` : ""}`);
    // (A roll's dice in braces, Mirror Robe's "[[/r {1d20+9} #Mirror Robe Deception]]{+9}": the roll as PF2e writes it elsewhere.)
    text = text.replace(/\[\[\/(\w+) \{(1d20\s*[+-]\s*\d+)\}/g, "[[/$1 $2");
    // (An action the item takes for its user at its own modifier, Mirror Robe's "The mirror robe Creates a Diversion for you with a +9 Deception
    // modifier": the own-check reader's "attempts to Create a Diversion with a +9 modifier".)
    text = text.replace(/\b(The (?:<em>)?[\w' -]+?(?:<\/em>)?) Creates a Diversion for you with an? \[\[\/r 1d20\s*\+\s*(\d+)[^\]]*\]\](?:\{[^}]*\})? Deception modifier/, (all, who, modifier) => `${who} attempts to Create a Diversion for you with a +${modifier} modifier`);
    // (An intelligent item's own maneuver with no number, Anima Robe's "The Anima Robe billows … and attempts to Feint a creature you're adjacent to"
    // beside its stat block's "Skills Deception [[/r 1d20+35 #Deception]]{+35}": that skill's modifier, the own-check reader's words, 2026-10-26.)
    const skills = /\bSkills\b([\s\S]*?)(?:\b(?:Int|Str|Dex)\b\s*[+-]\d|<\/p>)/.exec(text)?.[1] ?? "";
    const skillOf = (name) => Number(new RegExp(String.raw`\b${name}\s*\[\[\/r 1d20\s*\+\s*(\d+)`, "i").exec(skills)?.[1]) || null;
    const SKILL_FOR = { feint: "Deception", "create a diversion": "Deception", demoralize: "Intimidation", grapple: "Athletics", shove: "Athletics", trip: "Athletics", disarm: "Athletics", reposition: "Athletics" };
    if (skills) text = text.replace(/\battempts to (@UUID\[[^\]]*\]\{(Feint|Demoralize|Create a Diversion|Grapple|Shove|Trip|Disarm|Reposition)\}|(Feint|Demoralize|Create a Diversion|Grapple|Shove|Trip|Disarm|Reposition))( a creature[^.<]*?)?\./g, (all, link, linked, bare, rest) => {
        const modifier = skillOf(SKILL_FOR[(linked ?? bare).toLowerCase()]);
        return modifier ? `attempts to ${link}${rest ?? ""} with a +${modifier} modifier.` : all;
    });
    // (A spell its armor wraps it in, Smoldering Armor's "The armor is sheathed in a Fire Shield": the spell's effects on its wearer.)
    text = text.replace(/\bThe (?:<em>)?[\w' -]+?(?:<\/em>)? is sheathed in an? (@UUID\[Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]+\]\{[^}]+\})/, "You gain the effects of $1");
    // (A command to drop Prone, Deravon's Helm's "The targeted creature must make a @Check[will|dc:18] save to resist being compelled to drop
    // Prone as its first action on their next turn (on a critical failure, the target must spend all three actions on its next turn
    // remaining prone)": the save or Prone, its turn's words for the GM.)
    text = text.replace(/\bThe targeted creature must make an? (@Check\[[^\]]*\](?:\{[^}]*\})?) save to resist being compelled to drop (?:@UUID\[[^\]]*\]\{)?Prone\}? as its first action on their next turn \(on a critical failure, ([^)]*)\)\.(?:\s*(If the target is an? \w+, they take an? [–-]\d+ status penalty to the save)\.)?/i, (all, check, critical, kind) => `The target must succeed at a ${check} save or fall Prone. It drops prone as its first action on its next turn; on a critical failure, ${critical} (by hand).${kind ? ` ${kind} (by hand).` : ""}`);
    // (Damage only the table knows the amount of — a Strike's damage, the distance traveled, the charges stored: a stand-in of 1 (or one
    // die) for the save card, its amount typed on that card, src/compiler/scaled.js. Twisting Gale's "You deal sonic damage equal to your
    // normal Strike damage … in a 30-foot cone behind your target. Creatures in the area, not including your target, must attempt a …
    // basic save", Juggernaut Plate's "you deal bludgeoning damage equal to the total distance traveled (… basic save)", Kaldemash's
    // Lament's "You deal Strike damage to all creatures in a 30-foot cone (… basic save)", Conflagration Club's "1d6 damage per charge
    // stored in the club" — its type the charges', picked on the card.)
    text = text.replace(/\bYou deal (\w+) damage equal to your normal Strike damage with the (?:<em>)?[\w' -]+?(?:<\/em>)? in an? (@Template\[[^\]]*\])([^.]*)\.\s*Creatures in the area, not including your target, must attempt an? (@Check\[[^\]]*\]) save([^.]*)\./i, (all, type, area, where, check, against) => `Each creature in a ${area}${where}, not including your target, takes @Damage[1[${type.toLowerCase()}]] damage with a ${check} save${against}. Its damage is your normal Strike damage (typed on the card).`)
        .replace(/\bIf you smash an enemy, you deal (\w+) damage equal to the total distance traveled \((@Check\[[^\]]*\]) save\)\./i, (all, type, check) => `The target takes @Damage[1[${type.toLowerCase()}]] damage (${check} save). Its damage is the total distance traveled in feet (typed on the card).`)
        .replace(/\bYou deal Strike damage to all creatures in an? (@Template\[[^\]]*\]) \((@Check\[[^\]]*\]) save\)\./i, (all, area, check) => `Each creature in a ${area} takes @Damage[1[untyped]] damage (${check} save). Its damage is your Strike damage (typed on the card).`)
        .replace(/\btakes (@Damage\[1d(\d+)\[untyped\][^\]]*\]) damage per charge stored in the club, with an? (@Check\[[^\]]*\]) save\. The damage type is the same type the charges were attuned to\./i, (all, damage, die, check) => `takes ${damage} damage, with a ${check} save. Its damage is 1d${die} per charge stored in the club (typed on the card). Its type is the charges' energy (picked on the card).`);
    // (Damage back at the foe whose attack its shield blocked, Rebound Fulu's "takes damage equal to your shield's Hardness or the damage they
    // would have dealt before the Shield Block reaction, whichever is less": the amount typed on its card, src/compiler/scaled.js.)
    text = text.replace(/\bThe foe that triggered the Shield Block reaction takes damage equal to your shield's Hardness or the damage they would have dealt before the Shield Block reaction, whichever is less\./i, "The triggering creature takes @Damage[1[untyped]] damage. Its damage is your shield's Hardness or the damage it would have dealt before the Shield Block, whichever is less (typed on the card).");
    // (A condition on whoever carries it, resisted with a save: Azarim's Enfeebled 2 "as long as the creature carries" it — the save card at
    // the creature targeted, a failure's Enfeebled 2 until removed by hand. A creature the text gives no save is the GM's to fail.)
    text = text.replace(/\bThe creature who carries (?:<em>)?Azarim(?:<\/em>)? becomes (@UUID\[[^\]]*\]\{Enfeebled 2\})\. This condition persists as long as the creature carries (?:<em>)?Azarim(?:<\/em>)?\. A non-lawful creature can attempt to resist this effect with an? (@Check\[[^\]]*\]) save, but lawful creatures don't gain a save to resist\./i, (all, condition, check) => `The creature carrying it must succeed at a ${check} save or become ${condition} for as long as it carries it. A lawful creature gets no save: it fails.`);
    // (A net thrown farther, Spring-Loaded Net Launcher's "you can target a creature up to 60 feet away … otherwise functions as an unattached
    // Net": the Net's own words for an unattached net, at that range — src/compiler/thrown.js reads them as Halcyon Heart's.)
    text = text.replace(/\bAs normal, you make a ranged attack roll against a Medium or smaller creature, but you can target a creature up to (\d+) feet away, instead of only 20 feet away\. The net trap otherwise functions as an unattached (@UUID\[[^\]]*\]\{Net\}|Net)\./i, (all, range, net) => `You throw it at a creature within ${range} feet (a Medium or smaller one), using your attack bonus for a ranged simple weapon. On a hit, the net envelops the creature, which becomes Off-Guard and takes a –10-foot circumstance penalty to its Speeds until it Escapes, and on a critical hit, it is also Immobilized until it Escapes. The Escape DC is 16 (it functions as an unattached ${net}).`);
    // (Damage a shield keeps off up to a multiple of its Hardness, Resolute Shield's "prevents you from taking an amount of damage up to twice the
    // shield's Hardness": that much resistance against the triggering damage, from the shield's own Hardness — src/compiler/readied-bonus.js
    // reads it as Scapular of Shields'. What the shield itself takes is the GM's.)
    const hardness = Number(item?.system?.hardness);
    if (Number.isFinite(hardness) && hardness > 0) text = text.replace(/\bThe [\w' -]+? prevents you from taking an amount of damage up to (twice|three times) the shield's Hardness\./i, (all, times) => `You gain ${hardness * (times === "twice" ? 2 : 3)} resistance to ${/\bphysical damage\b/i.test(text) ? "physical" : "all"} damage against the triggering damage.`);
    // (A bonus for the creatures in its vapors, Healing Vapor's "can affect up to four living creatures at one time … While affected, a creature
    // also gains a +1 item bonus to saving throws against diseases and poisons": for the creatures targeted, as an area buff's, for the
    // vapors' 10 minutes — only while they're in them, a note.)
    text = text.replace(/\bWhile affected, a creature also gains an? \+(\d+) item bonus to saving throws against diseases and poisons\./i, (all, value) => `You and allies within 5 feet of you gain a +${value} item bonus to saving throws against diseases and poisons for 10 minutes. The bonus is only for up to four living creatures in the vapors, while they stay in them.`);
    // (A holy weakness triggered again, else damage, Freedom's Flame's "The target's holy weakness is triggered again or, if the target doesn't
    // have a holy weakness, it takes 15 spirit damage": the damage at the creature targeted, its weakness instead the GM's.)
    text = text.replace(/\bThe target's holy weakness is triggered again or, if the target doesn't have a holy weakness, it takes (@Damage\[[^\]]*\]\]) damage\./i, (all, damage) => `The target takes ${damage} damage. If the target has a holy weakness, its holy weakness is triggered again instead (by hand).`);
    // (A spell by the element it's attuned to, Gate Attenuator's "casts a 5th-rank spell, with a spell attack modifier of +18 and spell DC of 28 …
    // The spell corresponds to the element the item is attuned to" and its list "air Pressure Zone, earth Sand Form, …": the listed spells as
    // the cast card's choices, at that rank, attack and DC.)
    const byElement = [...text.matchAll(/<p><strong>(?:air|earth|fire|metal|water|wood)<\/strong> (@UUID\[Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]+\]\{[^}]+\})<\/p>/g)].map((match) => match[1]);
    if (byElement.length > 1) text = text.replace(/\bThe (?:<em>)?[\w' -]+?(?:<\/em>)? casts an? (\d+)(st|nd|rd|th)-rank spell, with a spell attack modifier of \+(\d+) and (?:a )?spell DC of (\d+)\./i, (all, rank, suffix, attack, dc) => `The item casts a ${rank}${suffix}-rank ${byElement.slice(0, -1).join(", ")}, or ${byElement.at(-1)} (the one of the element it's attuned to), with a spell attack modifier of +${attack} and a spell DC of ${dc}.`);
    // (A counteract its user is "affected by" as a spell, Key to the Stomach's "You're affected by a 5th-rank Cleanse Affliction spell to remove a
    // poison (counteract modifier +15)": the counteract card on its user, as src/compiler/counteract.js reads one aimed at "you".)
    text = text.replace(/\bYou're affected by an? (\d+)(?:st|nd|rd|th)-rank (@UUID\[[^\]]*\]\{Cleanse Affliction\}|Cleanse Affliction) spell to remove an? (poison|disease|curse) \(counteract modifier (?:\[\[\/r 1d20\+(\d+)[^\]]*\]\](?:\{[^}]*\})?|\+(\d+))\)\./i, (all, rank, spell, kind, rolled, plain) => `The item attempts to counteract one ${kind} affecting you, using a ${rank}th-rank counteract and a +${rolled ?? plain} counteract modifier (as ${spell}).`);
    // (A save "to resist being" a condition, a worse one on a critical failure, Briar's "Nyrissa must make a successful … save to resist being
    // Stunned 1 (Stunned 3 on a critical failure)": the save's rows at the creature targeted.)
    text = text.replace(/\b(?:[A-Z][\w']+|The target) must make a successful (@Check\[(?:fortitude|reflex|will)\|[^\]]*\]) save to resist being (@UUID\[[^\]]*\]\{[A-Z][a-z]+(?: \d+)?\}) \((@UUID\[[^\]]*\]\{[A-Z][a-z]+(?: \d+)?\}) on a critical failure\)\./g, (all, check, condition, worse) => `The target must attempt a ${check} save.</p><p><strong>Success</strong> The target is unaffected.</p><p><strong>Failure</strong> The target is ${condition}.</p><p><strong>Critical Failure</strong> The target is ${worse}.</p><p>`);
    // (Vitality damage at the undead around it, one die per 10 Hit Points its user was healed, Last Hope's "For every 10 Hit Points you are
    // healed, you restore 1d10 Hit Points to all other living creatures and deal that amount of vitality damage to all undead creatures in
    // the area": the basic save card at the undead targeted, the dice typed on it — the living creatures' healing the GM's.)
    text = text.replace(/\bFor every 10 Hit Points you are healed, you restore 1d10 Hit Points to all other living creatures and deal that amount of vitality damage to all undead creatures in the area, with an? (@Check\[[^\]]*\]) save\./i, (all, check) => `Each undead creature in the area takes @Damage[1d10[vitality]] damage (${check} save). Its damage is 1d10 per 10 Hit Points you were healed; each other living creature in the area regains as much, by hand (typed on the card).`);
    // (The rust's damage at a metal creature, Rusting Carapace's "A targeted creature or hazard gets a … basic save … The rust deals 8d6 damage
    // to a creature or hazard, plus 2d6 persistent damage on a failed save": that basic save at the creature targeted, the persistent damage its
    // failure's; an item's, the GM's.)
    text = text.replace(/\bA targeted creature or hazard gets an? (@Check\[fortitude\|[^\]]*\]) save;[^.]*\. The rust deals (@Damage\[\d+d\d+\[untyped\]\]) damage to a creature or hazard, plus @Damage\[(\d+d\d+)\[persistent, ?untyped\]\](?:\{[^}]*\})? damage on a failed save; it deals @Damage\[(\d+d\d+)\[untyped\]\] damage to an item, plus @Damage\[(\d+d\d+)\[persistent, ?untyped\]\](?:\{[^}]*\})? damage on a failed save\./i, (all, check, damage, persistent, item, itemPersistent) => `The target takes ${damage} damage (${check} save). On a failed save, it also takes @Damage[${persistent}[persistent,untyped]] damage. An item takes ${item} instead, plus ${itemPersistent} persistent on a failed save (by hand).`);
    // (Or the damage its user's shield blocked, its Hardness 10 higher, at a creature its user picks: Spiral Labyrinth's "Increase the shield's
    // Hardness by 10 for the Shield Block. The amount of damage your shield blocks is reflected onto a target you choose within 15 feet".)
    text = text.replace(/\bIncrease the shield's Hardness by (\d+) for the Shield Block\. The amount of damage your shield blocks is reflected onto a target you choose within (\d+) feet with an? (@Check\[[^\]]*\]) save\./i, (all, hardness, range, check) => `A target you choose within ${range} feet takes @Damage[1[untyped]] damage (${check} save). Its damage is the damage your shield blocked, its Hardness ${hardness} higher for that Shield Block (typed on the card).`);
    // (A bonus with three scopes, Hagbane Biscuit's "+1 status bonus Perception checks to pierce a hag's disguise, to skill checks to Recall
    // Knowledge about hags, and to saving throws made against hags' abilities and spells": the saves against hags read (PF2e's origin
    // trait), the other two by hand.)
    text = text.replace(/\bgranting you an? \+(\d+) (status|item|circumstance) bonus Perception checks to pierce a hag's disguise, to skill checks to (@UUID\[[^\]]*\]\{Recall Knowledge\}|Recall Knowledge) about hags, and to saving throws made against hags' abilities and spells\./i, (all, value, type) => `granting you a +${value} ${type} bonus to saving throws against hags. You also gain that bonus to Perception checks to pierce a hag's disguise and to Recall Knowledge about hags (by hand).`);
    // (A reaction that gives the first activation's benefits for a moment, Silhouette Cloak's "gaining the benefits of the first activation until
    // the end of the current creature's turn. The damage resistance applies to the triggering damage": that activation's resistance until the
    // end of the turn, its other benefits by hand.)
    const first = /\byou gain resistance \d+ to all damage except [^.]+\.(?:\s*This increases to resistance \d+ against nonmagical damage\.)?/i.exec(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    if (first) text = text.replace(/\bgaining the benefits of the first activation until the end of the current creature's turn\. The damage resistance applies to the triggering damage\./i, `gaining the first activation's resistance. Until the end of the current turn, ${first[0].charAt(0).toLowerCase()}${first[0].slice(1)} Its other benefits of the first activation apply until then too (by hand).`);
    // (A portion's use as its own activation, Tallowheart Mass's "If you rub a portion between your hands, the mass melts into your flesh and
    // you gain the Quickened condition for 1 minute": its user's, as the conditions reader takes one.)
    text = text.replace(/\bIf you rub a portion between your hands, the mass melts into your flesh and you gain the (@UUID\[[^\]]*\]\{Quickened\}|Quickened) condition for (\d+ (?:minutes?|rounds?))\./i, (all, quickened, time) => `You become ${quickened} for ${time}.`);
    // (A missive's benefit for its recipient, Heartening Missive (Bull)'s "The recipient gains a +1 item bonus to Fortitude saves for the next
    // 24 hours": that bonus on the creature it reaches — the one the presser targets, as for a creature touched.)
    text = text.replace(/\bThe recipient gains an? (\+\d+ (?:item|status|circumstance) bonus to (?:Fortitude|Reflex|Will) saves) for the next (\d+ (?:hours|minutes))\./, (all, bonus, time) => `It's for a creature you touch, its recipient. You gain a ${bonus} for ${time}.`);
    // (Cover against what triggered it, Limestone Shield's "granting you standard cover from that effect": cover's circumstance bonus to its
    // user's AC and Reflex saves versus that effect, as the moment's-bonus reader takes it.)
    text = text.replace(/,? granting you (lesser|standard|greater) cover from (?:that|the triggering) (?:effect|attack)\./i, (all, kind) => `. You gain a +${{ lesser: 1, standard: 2, greater: 4 }[kind.toLowerCase()]} circumstance bonus to your AC and Reflex saves against the triggering effect, as ${kind.toLowerCase()} cover.`);
    // (PF2e's Recall Knowledge with the item's bonus, Jug of Fond Remembrance's "and then Recall Knowledge about a creature you can see, with a
    // +2 circumstance bonus to the check": the action reader's "attempt a Recall Knowledge check with a +2 circumstance bonus".)
    text = text.replace(/\band then (@UUID\[[^\]]*\]\{Recall Knowledge\}|Recall Knowledge) about a creature you can see, with an? \+(\d+) (circumstance|item|status) bonus to the check\./i, (all, link, value, type) => `and then attempt a Recall Knowledge check with a +${value} ${type} bonus about a creature you can see.`);
    // (Its wielder's next attack rolled twice in the weapon's own words, Aerekostes's "On the next attack made using Aerekostes before the end
    // of their next turn, their wielder rolls twice and takes the better result": the user's, as the roll-twice reader takes it.)
    text = text.replace(/\bOn the next attack made using (?:<em>)?[\w' -]+?(?:<\/em>)? before the end of their next turn, their wielder rolls twice and takes the better result\./i, "You roll your next attack roll with it twice and take the better result. Only an attack before the end of your next turn.");
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

// The world setting's DCs (scripts/item-dcs.js, the user's answer of 2026-10-19): each save another creature attempts against the item's
// own DC — and a cast's DC — raised to its user's class DC or spell DC when that's higher. → { plan, raised: [{ from, to, which }] },
// the plan with a note saying so. The caller leaves out its user's own saves. Pure.
// (plus: a bonus on top of the higher of the two, Potent Poisoner's +4 under the user's house rule of 2026-10-19 — { value, name };
// reason: why, for the note.)
export function raiseItemDCs(plan, dcs = {}, { plus = null, reason = "the world setting", label = null } = {}) {
    const best = [["class", Number(dcs.class)], ["spell", Number(dcs.spell)]].filter(([, value]) => Number.isFinite(value) && value > 0).sort((a, b) => b[1] - a[1])[0];
    if (!plan || !best) return { plan, raised: [] };
    const [which, value] = best;
    const bonus = Number(plus?.value) || 0;
    const raised = [];
    const up = (from) => {
        if (!Number.isFinite(Number(from))) return from;
        const to = Math.max(Number(from), value) + bonus;
        if (to <= Number(from)) return from;
        raised.push({ from: Number(from), to, which });
        return to;
    };
    const walk = (node) => {
        if (Array.isArray(node)) return node.map(walk);
        if (!node || typeof node !== "object") return node;
        const out = Object.fromEntries(Object.entries(node).map(([key, entry]) => [key, walk(entry)]));
        if (node.roll === "save" && node.against?.dc === "fixed") out.against = { ...out.against, value: up(node.against.value) };
        return out;
    };
    let next = walk(plan);
    // (A cast's own DC, the spell module's to use, and its choices'.)
    if (next.builtin === "cast-spell") {
        if (next.dc !== null && next.dc !== undefined) next = { ...next, dc: up(next.dc) };
        if (Array.isArray(next.choices)) next = { ...next, choices: next.choices.map((choice) => (choice.dc !== null && choice.dc !== undefined ? { ...choice, dc: up(choice.dc) } : choice)) };
    }
    if (!raised.length) return { plan, raised };
    const froms = [...new Set(raised.map((entry) => entry.from))].sort((a, b) => a - b);
    const tos = [...new Set(raised.map((entry) => entry.to))].sort((a, b) => a - b);
    const base = froms.every((from) => from <= value) ? `its user's ${label ?? which} DC${bonus ? ` ${value} + ${bonus} (${plus.name})` : ""}` : `+${bonus} (${plus?.name ?? "bonus"})`;
    const note = `Its DC is ${tos.join(" and ")}, ${base}, over the item's own ${froms.join(" and ")} (${reason}).`;
    return { plan: { ...next, notes: [...(next.notes ?? []), note] }, raised };
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
// (And The Survivor's "The amount of Hit Point restored increases to … if you are at least 15th level, …".)
const SCALING = new RegExp(String.raw`\s*The (?:damage|amount of healing granted|healing|amount of Hit Points? restored) increases to ${LINK}[^.]*? if you(?:'re| are) at least \d+(?:st|nd|rd|th) level(?:,? (?:and )?(?:to )?${LINK}[^.]*? if you(?:'re| are) at least \d+(?:st|nd|rd|th) level)*\.`, "i");
export function byOwnerLevel(html, level) {
    const text = String(html ?? "");
    const scaling = SCALING.exec(text);
    if (!scaling || !Number.isFinite(Number(level)) || level === null) return text;
    const steps = [...scaling[0].matchAll(new RegExp(String.raw`(${LINK})[^@]*? if you(?:'re| are) at least (\d+)(?:st|nd|rd|th) level`, "gi"))].map((match) => ({ link: match[1], level: Number(match[2]) }));
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

// Unique items' and artifacts' activations read sentence by sentence (2026-10-27, the user: their every effect built): every sentence of the
// effect one of the reading's own, none dropped, into what its card plays — as src/compiler/lasting.js's readings (its withSentenceReadings).
// Passage Pane's lock onto a Boneyard location (its user's own Religion check, plan.ownSave: the save card on its user, a success a note
// Effect on them, "Locked on"), its rift (a note Effect for its 24 hours at most, onto that location or else a random point of the Dead Roads)
// and its closing (that Effect ended, item.endsOwn). Pure.

import { withSentenceReadings } from "./lasting.js";
import { LEVEL_DCS } from "./counteract.js";

const UNITS = { round: "rounds", rounds: "rounds", minute: "minutes", minutes: "minutes", hour: "hours", hours: "hours" };
const timeOf = (value, unit) => ({ mode: "fixed", value: Number(value), unit: UNITS[String(unit).toLowerCase()], expiry: "turn-start", anchor: "effect-start" });
const none = () => ({ damage: { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [], modifiers: [] });
const ownRow = ({ noteEffects = [], notes = [], target = null, item = null }) => ({
    targeting: { target, range: null, area: null },
    resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), ...(noteEffects.length ? { noteEffects } : {}) } } },
    ...(notes.length ? { notes } : {}),
    ...(item ? { item } : {})
});
// (Its user's own check against a DC, as the save card rolls it on them — PF2e's statistic of that name, a skill's too.)
const ownCheck = ({ statistic, dc, rows, notes = [] }) => ({
    targeting: { target: "self", range: null, area: null },
    ownSave: true,
    resolution: { kind: "save", check: { roll: "save", statistic, basic: false, against: { dc: "fixed", value: Number(dc) } }, sharedDamage: null, outcomes: Object.fromEntries(["criticalSuccess", "success", "failure", "criticalFailure"].map((degree) => [degree, { ...none(), ...(rows[degree] ? { noteEffects: rows[degree] } : {}) }])) },
    ...(notes.length ? { notes } : {})
});

// (Its user's own Strength modifier, as live play gives it — unknown, PF2e's own formula term.)
const strOf = (item) => (Number.isFinite(Number(item?.ownerAbilities?.str)) ? Number(item.ownerAbilities.str) : null);
const plus = (dice, str) => (str === null ? `${dice}+@actor.abilities.str.mod` : str ? `${dice}${str > 0 ? "+" : ""}${str}` : dice);
const COUNT = ["one", "two", "three"];

const PANE_NEEDS = "Only while the mirror's mounted firmly on a solid surface and its user is bonded with it.";
const RIFT = "Rift to the Boneyard";
const LOCKED = "Locked on";

const stun = (value) => ({ ...none(), effects: [{ kind: "condition", slug: "stunned", value, duration: null }] });

// (PF2e's statistic slugs: a Lore skill's "warfare-lore".)
const statisticSlug = (words) => String(words).trim().toLowerCase().replace(/\s+(?:save|check)$/, "").replace(/\s+/g, "-");
const COMMANDER = "Commander of Flame";
const COMMANDER_TEXT = "The Army of Fire follows its orders as long as the army can see and hear it, whatever language it speaks; it senses the army's presence and can give orders as the spear's holder does. It still needs the spear in hand to muster the army. If it doesn't hold the spear for 1 week, the spear returns to Cuetzmonquali.";

const days = (value) => ({ mode: "fixed", value: Number(value), unit: "days", expiry: "turn-start", anchor: "effect-start" });
const NO_BONUSES = "It can't benefit from circumstance or status bonuses";

// (Its user's unarmed Strike against a creature's DC: the check at their unarmed attack modifier, filled in live — check.attackFrom, scripts/live.js.)
const unarmedCheck = (against, rows, base) => ({ modelVersion: base?.modelVersion, source: base?.source, rank: 1, traits: ["attack"], automation: { level: "automatic" }, trigger: { event: "zone" }, targeting: { target: "a creature in the area", range: null, area: null }, resolution: { kind: "check", check: { roll: "skill", statistic: "unarmed", against: { dc: "target", statistic: against }, modifier: null, attackFrom: "unarmed" }, sharedDamage: rows.sharedDamage ?? null, outcomes: rows.outcomes } });

const RESEARCHED = (dc, rank) => `Only once its user has Researched this ritual: 12 RP from DC ${dc} Occultism checks (${rank}).`;
const researchOf = (html) => /Research<\/strong>\s*Accumulate (\d+) RP by making @Check\[occultism\|dc:(\d+)\] \((\w+)\) checks/i.exec(String(html ?? ""));

const SPELL_BY_NAME = (options, name) => options?.spells?.[String(name).toLowerCase()] ?? null;
const RUNE_STEPS = { "striking rune": "striking", "greater striking rune": "greaterStriking", "major striking rune": "majorStriking" };

const READINGS = [
    {
        // (Its 1d6 more void at the living creature its critical hit struck — the item card's damage at it —, and a victim slain by that hit
        // drained to a husk: its runes raised for good the first time at each of its wielder's levels — +2 potency at 10th, greater striking at
        // 12th, +3 at 16th, major striking at 19th (plan.lifedrink, scripts/lifedrink.js, once the card is applied and the creature is dead).)
        name: "Meloth's Lifedrinker (Level 7): Lifedrink",
        over: true,
        sentences: [
            /^Meloth's Lifedrinker inflicts (\d+d\d+) additional (\w+) damage to the living creature\.$/,
            /^If the creature struck by the critical hit is slain by its damage, the blade impales its victim\.$/,
            /^Black, oily energy like wet smoke pours from the victim's eyes and flows to the ebon sword, desiccating the corpse in an instant as all of its liquid seeps into the Lifedrinker, leaving the body a dried-out husk\.$/,
            /^The first time this happens when its wielder is at least (\d+)th level, Meloth's Lifedrinker's \+(\d) weapon potency rune permanently becomes a \+(\d) weapon potency rune\.$/,
            /^The first time this happens when its wielder is at least (\d+)th level, Meloth's Lifedrinker's (striking rune) permanently becomes a (greater striking rune)\.$/,
            /^The first time this happens when its wielder is at least (\d+)th level, Meloth's Lifedrinker's \+(\d) weapon potency rune permanently becomes a \+(\d) weapon potency rune\.$/,
            /^And the first time this happens when its wielder is at least (\d+)th level, Meloth's Lifedrinker's (greater striking rune) permanently becomes a (major striking rune) ?\.$/
        ],
        card: ([, , , p1, s1, p2, s2], plan) => {
            if (plan?.resolution?.outcomes?.success?.damage?.mode !== "shared") return null;
            const success = { ...plan.resolution.outcomes.success, manualInstructions: undefined };
            delete success.manualInstructions;
            const potency = (found) => ({ level: Number(found[1]), rune: "potency", from: Number(found[2]), to: Number(found[3]) });
            const striking = (found) => ({ level: Number(found[1]), rune: "striking", from: RUNE_STEPS[found[2]], to: RUNE_STEPS[found[3]] });
            return {
                keep: true,
                notes: ["Only at a living creature of its wielder's level or higher that its critical hit struck."],
                partial: undefined,
                automation: { ...(plan.automation ?? {}), level: "automatic" },
                resolution: { ...plan.resolution, outcomes: { ...plan.resolution.outcomes, success } },
                lifedrink: { upgrades: [potency(p1), striking(s1), potency(p2), striking(s2)].sort((a, b) => a.level - b.level), words: "The blade impales its victim: black, oily smoke pours from its eyes into the sword, leaving the body a dried-out husk." }
            };
        }
    },
    {
        // (One of the spells its fan holds, by its owner's feats — Gust of Wind at 1st rank, Wall of Wind at 3rd with Wind God's Fan, Lightning
        // Bolt at 5th with Thunder God's Fan, one more use a day each, three at most —, at its user's class or spell DC, whichever is higher (the
        // cast card's choices); or a cantrip of its heritage or an ancestry feat, its own action, not counted (way.refund).)
        name: "Tengu Feather Fan: Wave Fan",
        sentences: [
            /^You cast your choice of one spell contained in your tengu feather fan ?\.$/,
            /^You can instead cast a cantrip you've gained from a heritage or an ancestry feat; this doesn't use up one of the fan's daily activations\.$/,
            /^This activation takes the spell's normal number of actions\.$/,
            /^The spell's DC is your class DC or spell DC, whichever is higher\.$/
        ],
        card: (found, plan, { base, info, item, options }) => {
            const feats = new Set(item?.ownerFeats ?? []);
            const contained = [["gust of wind", 1, null], ["wall of wind", 3, "wind-gods-fan"], ["lightning bolt", 5, "thunder-gods-fan"]].filter(([, , feat]) => !feat || feats.has(feat));
            const choices = contained.map(([name, rank]) => [SPELL_BY_NAME(options, name), rank]).filter(([spell]) => spell).map(([spell, rank]) => ({ spell: { uuid: spell.uuid, name: spell.name }, rank, area: spell.area, targets: spell.targets }));
            if (!choices.length) return null;
            const uses = Math.min(3, contained.length);
            const frequency = { max: uses, per: "day", raw: uses === 1 ? "once per day" : uses === 2 ? "twice per day" : "three times per day" };
            const own = (card) => ({ ...base, automation: { level: "automatic" }, trigger: { event: "use", frequency }, ...card, item: { ...info, activation: { ...(info?.activation ?? {}), frequency }, ...(card.item ?? {}) } });
            const [first] = choices;
            const cast = own({ builtin: "cast-spell", targeting: { target: null, range: null, area: null }, spell: first.spell, rank: first.rank, dc: null, ownerDC: "class-spell", attack: null, tradition: "primal", self: false, area: Boolean(first.area), targets: Boolean(first.targets), ...(choices.length > 1 ? { choices } : {}), notes: ["It takes the spell's own number of actions."] });
            const cantrip = own({ ...ownRow({ notes: ["Its user casts a cantrip of its heritage or an ancestry feat from its sheet (its own action): this use isn't one of the fan's."] }) });
            return { builtin: "ways", targeting: { target: null, range: null, area: null }, trigger: { event: "use", frequency }, item: { ...info, activation: { ...(info?.activation ?? {}), frequency } }, ways: [{ name: "A spell the fan holds", html: "<p>A spell from the fan.</p>", plan: cast }, { name: "A cantrip of its heritage or an ancestry feat (not counted)", html: "<p>A cantrip instead.</p>", plan: cantrip, refund: true }] };
        }
    },
    {
        // (Dominate cast on its own wielder, DC 24 (the spell module's cast): first a note Effect on them with PF2e's rules for that Will save —
        // −2 and one degree worse for a worshipper of Lamashtu or a chaotic creature (by its trait) — and then Jax's orders, a note Effect for as
        // long as she keeps renewing it (the user's ruling for a creature's behaviour). plan.userEffects kind "note", scripts/live.js.)
        name: "Jax",
        over: true,
        sentences: [
            /^Jax deems you an unworthy agent of justice\.$/,
            /^She casts Dominate on you \(@Check\[will\|dc:(\d+)\|[^\]]*\]\)\.$/,
            /^If you're chaotic or a worshipper of Lamashtu, you take a -(\d+) penalty to your Will save, and the result of your save is one degree of success worse than the result you rolled\.$/,
            /^Jax orders you to fight banditry and protect innocent travelers in the Spellscar Desert, renewing the spell as often as necessary until you cease your lawless ways\.$/
        ],
        card: ([, , penalty], plan) => {
            if (plan?.builtin !== "cast-spell" || plan.spell?.name !== "Dominate") return null;
            const who = [{ or: ["deity:primary:lamashtu", "self:trait:chaotic"] }, "item:slug:dominate"];
            const judged = { kind: "note", note: { label: "Jax's judgment", text: `Against Jax's Dominate: a worshipper of Lamashtu or a chaotic creature takes a –${penalty[1]} penalty to the Will save, and its result is one degree worse.`, rules: [{ key: "FlatModifier", selector: "will", type: "untyped", value: -Number(penalty[1]), predicate: who }, { key: "AdjustDegreeOfSuccess", selector: "will", adjustment: { all: "one-degree-worse" }, predicate: who }], duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } } };
            const orders = { kind: "note", note: { label: "Jax's orders", text: "While Jax's Dominate holds it (remove this Effect if the save threw it off): it's ordered to fight banditry and protect innocent travelers in the Spellscar Desert, and she renews the spell as often as she must until it ceases its lawless ways.", duration: null } };
            return { keep: true, notes: undefined, partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" }, userEffects: [...(plan.userEffects ?? []), judged, orders] };
        }
    },
    {
        // (Its memories harvested from a prepared creature as it dies: the ways card's three ways — the 10-minute surgery, its user's Medicine
        // check at DC 28 against the creature (a failure its death; the ability module's card for a skill check at a fixed DC, 2026-10-28: its
        // rows on the creature); the harvest, the creature's corpse a note Effect for good (PF2e's AdjustDegreeOfSuccess, its save against
        // Talking Corpse one degree worse), one more of the sponge's four (item.store, scripts/live.js: refused once full, the item's other
        // activation too); squeezing it out, all of them gone.)
        name: "Mindsponge: Absorb Memories",
        sentences: [
            /^You use the mindsponge to harvest the memories and mental energy of a specially prepared target as it dies\.$/,
            /^To prepare the target \(who must be willing or helpless\), you must perform a (\d+)-minute surgery to expose a portion of the target's brain without killing them\.$/,
            /^This requires a successful @Check\[(\w+)\|dc:(\d+)\] \((\w+)\) check; if you fail this check, the target dies before you can use the mindsponge ?\.$/,
            /^Memories and psychic energy absorbed aren't taken from the target's soul but from energies temporarily infused within the body, so that a creature slain in this way who is later brought back to life retains their harvested memories and energy\.$/,
            /^The corpse of someone who has had their memories harvested is difficult to communicate with via talking corpse - treat the saving throw result against that spell as one degree of success lower than the actual result\.$/,
            /^A mindsponge can store the memories and energy of up to (four|\d+) creatures at a time\.$/,
            /^Once full, it cannot be activated at all, other than to squeeze it as an Interact action with the concentrate trait, which causes all of the memories within to drip out as cold ectoplasm, which swiftly evaporates if not used or contained\.$/
        ],
        card: ([, surgery, check, , , stores], plan, { base, info }) => {
            const max = { four: 4 }[stores[1]] ?? Number(stores[1]);
            const own = (card) => ({ ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...card, item: { ...info, ...(card.item ?? {}) } });
            const prepare = own({
                activation: { ...(base?.activation ?? {}), time: `${surgery[1]} minutes` },
                targeting: { target: "1 willing or helpless creature", range: "touch", area: null },
                resolution: { kind: "check", check: { roll: "skill", statistic: check[1].toLowerCase(), against: { dc: "fixed", value: Number(check[2]) } }, sharedDamage: null, outcomes: { criticalSuccess: { ...none(), noteEffects: [{ label: "Prepared for the mindsponge", text: "Its brain partly exposed by surgery, without killing it: the mindsponge can harvest its memories as it dies.", duration: null }] }, success: { ...none(), noteEffects: [{ label: "Prepared for the mindsponge", text: "Its brain partly exposed by surgery, without killing it: the mindsponge can harvest its memories as it dies.", duration: null }] }, failure: { ...none(), terminal: { kind: "death" } }, criticalFailure: { ...none(), terminal: { kind: "death" } } } },
                notes: [`A ${surgery[1]}-minute surgery: its user's ${check[1]} check at DC ${check[2]} (it must be a ${check[3]} in ${check[1]}). On a failure, the creature dies before the mindsponge is used.`]
            });
            const harvest = own({
                ...ownRow({
                    target: "the prepared creature as it dies",
                    noteEffects: [{ label: "Memories harvested", text: "Its memories and psychic energy are in the mindsponge — not taken from its soul: brought back to life, it keeps them. Its save against Talking Corpse is one degree worse.", rules: [{ key: "AdjustDegreeOfSuccess", selector: "saving-throw", adjustment: { all: "one-degree-worse" }, predicate: ["item:slug:talking-corpse"] }], duration: null }]
                }),
                item: { ...info, recipient: "targets", store: { max, add: 1 } }
            });
            const squeeze = own({ ...ownRow({ notes: ["The memories drip out as cold ectoplasm, which soon evaporates unless it's used or contained."] }), activation: { ...(base?.activation ?? {}), time: "1", traits: ["concentrate"] }, item: { ...info, store: { max, release: true } } });
            return { builtin: "ways", targeting: { target: null, range: null, area: null }, ways: [{ name: "Prepare the creature (surgery)", html: "<p>The surgery.</p>", plan: prepare }, { name: "Absorb its memories", html: "<p>The harvest.</p>", plan: harvest }, { name: "Squeeze it out (Interact)", html: "<p>Squeezed.</p>", plan: squeeze }] };
        }
    },
    // (Emerald Fulcrum Lens's possession: src/compiler/whole-artifacts.js's, the three fulcrum lenses' one reading — 2026-10-28.)
    {
        // (A hex of impending doom on a creature its user sees, for a minute: the item card marks it; its Will save card (DC 28), kept open for
        // that minute, is pressed at the end of each of its user's turns they hit it with the hex blaster — one save a turn, however many hits.
        // Its critical failure's curse: a note Effect whose RollOption "air-doom-curse:<DC>:<days>" scripts/doom-hex.js reads — fallen
        // Unconscious while cursed, it stays so for a day (unless the curse goes), then a Fortitude save at that DC, death and incapacitation,
        // or it dies.)
        name: "Hex Blaster",
        over: true,
        sentences: [
            /^You afflict a creature you can see with a hex of impending doom\.$/,
            /^The hex lasts for (\d+) (minutes?)\.$/,
            /^As long as the creature is hexed, when you hit it with a round from the hex blaster, the creature must attempt a @Check\[will\|dc:(\d+)\] save at the end of your turn; the creature attempts a single Will save regardless of the number of times you hit it\.$/,
            /^Critical Success The creature is unaffected\.$/,
            /^Success The creature is Frightened (\d+)\.$/,
            /^It also takes (\d+d\d+) persistent mental damage\.$/,
            /^Failure The creature is Frightened (\d+)\.$/,
            /^It also takes (\d+d\d+) persistent mental damage\.$/,
            /^Critical Failure The creature is frightened (\d+) and Slowed (\d+) for (\d+) (minutes?)\.$/,
            /^It also takes (\d+d\d+) persistent mental damage and is cursed with a hex of impending doom\.$/,
            /^If the target falls Unconscious from damage dealt by this Strike or the persistent mental damage, it remains unconscious for (\d+) (days?) or until this curse is removed\.$/,
            /^After 1 day, if the creature is still unconscious, it must succeed at a @Check\[fortitude\|dc:(\d+)\|traits:death,incapacitation\] save or die; this effect has the death and incapacitation traits\.$/
        ],
        card: ([, hex, will, , s1, d1, f2, d2, cf, d4, sleep, fort], plan, { base, info }) => {
            if (plan?.resolution?.kind !== "save") return null;
            const lasts = timeOf(hex[1], hex[2]);
            const frightened = (value) => ({ kind: "condition", slug: "frightened", value: Number(value), duration: null });
            const persistent = (formula) => ({ mode: "formulas", formulas: [{ formula: `${formula}[persistent,mental]` }], rollScope: "outcome" });
            const curse = { label: "Hex of impending doom", text: `Cursed: falling Unconscious from the hex blaster's damage or this persistent mental damage, it stays unconscious for ${sleep[1]} ${sleep[2]} or until the curse is removed; after that day, still unconscious, it must succeed at a DC ${fort[1]} Fortitude save (death, incapacitation) or die. Removing the curse ends this Effect.`, rules: [{ key: "RollOption", domain: "all", option: `air-doom-curse:${fort[1]}:${sleep[1]}` }], duration: null };
            const save = {
                ...base,
                automation: { level: "automatic" },
                trigger: { event: "use" },
                targeting: { target: "the hexed creature", range: null, area: null },
                resolution: {
                    kind: "save",
                    check: { roll: "save", statistic: "will", basic: false, against: { dc: "fixed", value: Number(will[1]) } },
                    sharedDamage: null,
                    outcomes: {
                        criticalSuccess: none(),
                        success: { ...none(), damage: persistent(d1[1]), effects: [frightened(s1[1])] },
                        failure: { ...none(), damage: persistent(d2[1]), effects: [frightened(f2[1])] },
                        criticalFailure: { ...none(), damage: persistent(d4[1]), effects: [frightened(cf[1]), { kind: "condition", slug: "slowed", value: Number(cf[2]), duration: timeOf(cf[3], cf[4]) }], noteEffects: [curse] }
                    }
                }
            };
            return {
                ...ownRow({ target: "1 creature it can see", notes: ["Target the creature to hex, then Apply: it's marked for the minute, and its Will save card waits for the hits."] }),
                item: { ...info, recipient: "user", mark: { slug: "hex-blaster-hex", duration: lasts } },
                again: { plan: save, later: true, repeat: true, time: lasts, when: "{user} hits the hexed creature with a round from the hex blaster: press it at the end of that turn (one save a turn, however many hits)" }
            };
        }
    },
    {
        // (The creature regarded: its user speaks and understands its language for 24 hours (a note Effect, the user's ruling for speech), the
        // creature marked for that time (its TokenMark); then, flipping the lenses down while observing it, a secret counteract check +23 (rank
        // half the item's level) against an illusion, morph or polymorph on it, only to see through — rolled for the GM alone (whisper.secret).)
        name: "Spectacles of Discernment: Reveal the Truth",
        sentences: [
            /^You raise the spectacles to regard a target creature through them; the target must be within (\d+) feet\.$/,
            /^You immediately gain the ability to speak and understand the language the target creature is currently speaking, or its native language if it's not currently talking, for (\d+) (hours?)\.$/,
            /^During this time, you can Interact with the spectacles of discernment to flip down a pair of supplementary lenses\.$/,
            /^When you do so, if you're observing the creature you originally targeted, roll a secret counteract check with a counteract modifier of \+(\d+) against any illusion, morph, or polymorph effect affecting the target, but only for the purpose of determining whether you see through the disguise or not\.$/
        ],
        card: ([within, speak, , lenses], plan, { base, info, item }) => {
            const time = timeOf(speak[1], speak[2]);
            const rank = Math.ceil((Number(item?.system?.level?.value) || 0) / 2);
            const own = (card) => ({ ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...card, item: { ...info, ...(card.item ?? {}) } });
            const regard = own({
                ...ownRow({
                    target: `1 creature within ${within[1]} feet`,
                    noteEffects: [{ label: "Its language", text: `It speaks and understands the language the marked creature is speaking now, or its native language if it isn't talking, for ${speak[1]} ${speak[2]} (the GM says which).`, duration: time }],
                    notes: [`Target the creature it regards, within ${within[1]} feet.`]
                }),
                item: { ...info, recipient: "user", mark: { slug: "spectacles-of-discernment-mark", duration: time } }
            });
            const flip = own({
                builtin: "whisper",
                targeting: { target: null, range: null, area: null },
                whisper: { text: "The spectacles' lenses flipped down at the creature they marked: if its user is observing it, the secret check below says whether they see through an illusion, morph or polymorph on it (it isn't ended).", secret: { formula: `1d20+${lenses[1]}`, words: `Secret counteract check (+${lenses[1]}, counteract rank ${rank}) against any illusion, morph or polymorph effect on the marked creature, only to see through it` } }
            });
            return { builtin: "ways", targeting: { target: null, range: null, area: null }, ways: [{ name: "Reveal the Truth", html: "<p>The creature regarded.</p>", plan: regard }, { name: "Flip down the lenses (Interact)", html: "<p>The lenses flipped down.</p>", plan: flip }] };
        }
    },
    {
        // (The door inside its back cover opens on an extradimensional space as a Spacious Pouch (Type II) is: that container, PF2e's own item, made
        // on its user the first time and flagged as the grimoire's (item.space, scripts/live.js) — its Bulk held as the pouch's; opened again
        // after.)
        name: "What Doors We Open: Open the Door Within",
        sentences: [
            /^The inside back cover of What Doors We Open features a realistic depiction of a bejeweled door set in a stone wall\.$/,
            /^When you Open the Door Within, you open that door to reveal an extradimensional space that otherwise functions identically to an? ([\w ]+\(Type [IV]+\))\.$/
        ],
        card: ([, space], plan, { html }) => {
            const uuid = new RegExp(String.raw`@UUID\[(Compendium\.pf2e\.equipment-srd\.Item\.[A-Za-z0-9]+)\]\{${space[1].replace(/[()]/g, "\\$&")}\}`).exec(String(html ?? ""))?.[1];
            if (!uuid) return null;
            return ownRow({ notes: ["Its items go with the grimoire: give the space to whoever takes the book."], item: { space: { uuid, name: "The Door Within", like: space[1] } } });
        }
    },
    {
        // (Speak to the Void: its user's next skill check — the Recall Knowledge it makes now — with Nature and Occultism at legendary proficiency
        // (PF2e's ActiveEffectLike upgrading their ranks on the readied Effect, bonus.rules), its failure 10d6 mental to its user and its critical
        // failure 100 (bonus.after, scripts/fortune.js).)
        name: "Void Mirror",
        sentences: [
            /^The first activation ritual is known as "Speak to the Void" and allows the user to contact an intelligence in a distant part of the universe, provided the mirror shows that location \(regardless of distance\)\.$/,
            /^This alien intelligence infuses the user's mind with answers, allowing the user to Recall Knowledge using Nature or Occultism as if they were legendary proficiency with the skill \(including the \+8 proficiency bonus\)\.$/,
            /^If this check fails, the character takes (\d+d\d+) (\w+) damage \((\d+) \w+ damage on a critical failure\) as the imparted knowledge does more harm than good\.$/
        ],
        card: ([, , fails], plan, { html }) => {
            const research = researchOf(html);
            const type = fails[2].toLowerCase();
            return {
                builtin: "readied-bonus",
                targeting: { target: "self", range: null, area: null },
                bonus: {
                    modifiers: [],
                    rules: ["nature", "occultism"].map((skill) => ({ key: "ActiveEffectLike", mode: "upgrade", path: `system.skills.${skill}.rank`, value: 4 })),
                    duration: { value: 1, unit: "minutes", expiry: "turn-start" },
                    spend: ["skill-check"],
                    after: { failure: { formula: fails[1], type }, criticalFailure: { formula: fails[3], type } },
                    words: "Nature and Occultism at legendary proficiency (+8) for the Recall Knowledge it makes now"
                },
                notes: [
                    ...(research ? [RESEARCHED(research[2], research[3])] : []),
                    "Only about a place the mirror shows, however far away. Its user Recalls Knowledge now with Nature or Occultism (PF2e's own check), the GM's DC."
                ]
            };
        }
    },
    {
        // (Call from the Void: an alien creature of its user's pick — an aberration, beast, fungus, ooze or plant of its user's level + 4 or lower —
        // the conjure card's, its user's Occultism check against that creature's Will DC rolled first (plan.attitudeCheck, scripts/zones.js): its
        // attitude by the degree (helpful, indifferent, hostile: its side and a note Effect on it), its user Stunned 3 on a critical failure.
        // Returning it: the ways card's second way, its Will save against its user's Occultism DC (plan.dcFromUser), a success its 24 hours'
        // immunity.)
        name: "Void Mirror",
        over: true,
        sentences: [
            /^The second activation ritual is known as "Call from the Void\." The user performs a 1-hour-long rite before the Void Mirror ?, during which they indicate a type of (aberration), (beast), (fungus), (ooze), or (plant) creature that's an alien life form from the planet the user is currently located on\.$/,
            /^The target creature must be a level equal to or less than the user's level \+(\d+)\.$/,
            /^As the rite ends, the user attempts an @Check\[(\w+)\|defense:(\w+)\] check against the target creature's \w+ DC\.$/,
            /^Critical Success The creature is drawn across the universe to appear in a space adjacent to the Void Mirror ?\.$/,
            /^The creature's initial attitude toward the user is (helpful), but this attitude can shift quickly if the creature realizes its goals and personality differs dramatically from the user's, or if the user makes a request of the creature that's against its nature\.$/,
            /^As long both the creature and the user are within (\d+) feet of the Void Mirror ?, the user can return the creature to its original location by Dismissing this activation\.$/,
            /^The creature can attempt a (Will) save against the user's (Occultism) DC to resist being returned; if it succeeds, it's temporarily immune for (\d+) (hours?)\.$/,
            /^Success As critical success, but the creature is (indifferent) upon arrival\.$/,
            /^Failure As critical success, but the creature is (hostile) upon arrival\.$/,
            /^Critical Failure As failure, but magical feedback from the failed activation causes the user to become Stunned (\d+)\.$/
        ],
        card: ([kinds, above, check, , helpful, near, resist, indifferent, hostile, stunned], plan, { base, info, item, html }) => {
            const level = Number(item?.ownerLevel);
            if (!Number.isFinite(level)) return null;
            const research = researchOf(html);
            const own = (card) => ({ ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...card, item: { ...info, ...(card.item ?? {}) } });
            const call = own({
                builtin: "conjure",
                targeting: { target: "self", range: null, area: null },
                creatures: [{ name: "Called creature", count: 1, size: null, stats: null, from: null, traits: [], initiative: "roll" }],
                pick: { any: kinds.slice(1, 6), maxLevel: level + Number(above[1]) },
                attitudeCheck: { statistic: check[1].toLowerCase(), against: check[2].toLowerCase(), degrees: { criticalSuccess: helpful[1], success: indifferent[1], failure: hostile[1], criticalFailure: hostile[1] }, stunned: Number(stunned[1]) },
                max: 1,
                lasts: null,
                vanishAtZero: false,
                notes: [
                    ...(research ? [RESEARCHED(research[2], research[3])] : []),
                    "An hour's rite before the mirror: its user picks the alien creature, from the planet they're on; it appears beside the mirror (move its token there).",
                    `Before it comes, its user's ${check[1]} check against its ${check[2]} DC sets its attitude: helpful on a critical success, indifferent on a success, hostile on a failure (and Stunned ${stunned[1]} for its user on a critical failure).`,
                    "Helpful, it can turn quickly if its goals and nature differ dramatically from its user's, or at a request against its nature (the GM's)."
                ]
            });
            const returned = own({
                targeting: { target: "the called creature", range: null, area: null },
                dcFromUser: resist[2].toLowerCase(),
                trigger: { event: "use", immunity: { scope: "target", raw: `It's temporarily immune to being returned for ${resist[3]} ${resist[4]}.`, duration: { value: Number(resist[3]), unit: resist[4].toLowerCase().replace(/s?$/, "s") }, degrees: ["criticalSuccess", "success"], against: "all", slug: "void-mirror-return" } },
                resolution: { kind: "save", check: { roll: "save", statistic: resist[1].toLowerCase(), basic: false, against: { dc: "fixed", value: 0 } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: { ...none(), noteEffects: [{ label: "Returned", text: "Sent back across the universe to where it came from: dismiss its token (the conjure card's Dismiss).", duration: null }] }, criticalFailure: { ...none(), noteEffects: [{ label: "Returned", text: "Sent back across the universe to where it came from: dismiss its token (the conjure card's Dismiss).", duration: null }] } } },
                notes: [`Only while both it and its user are within ${near[1]} feet of the mirror. Target it: its ${resist[1]} save against its user's ${resist[2]} DC.`]
            });
            return { builtin: "ways", targeting: { target: null, range: null, area: null }, ways: [{ name: "Call from the Void", html: "<p>The rite's end: the creature called.</p>", plan: call }, { name: "Return it (Dismiss)", html: "<p>The creature returned.</p>", plan: returned }] };
        }
    },
    {
        // (Become the Void: seven days' rite, its check unnamed — Occultism at the mirror's level DC (the GM may change it) —; transformed on a
        // success, the form the GM's, a note Effect for good; 10d6+40 bludgeoning on a failure; slain on a critical failure (the row's death),
        // Tchekuth incubating in the body for 7 days.)
        name: "Void Mirror",
        sentences: [
            /^The third activation ritual is known as "Become the Void" and requires the user to continue performing the rite for (\d+) consecutive days \(as if they were performing a multi-day ritual\)\.$/,
            /^If the user fails to perform this rite for one of these 7 consecutive days, they immediately suffer the critical failure effect below\.$/,
            /^Critical Success The user's body, mind, and soul are infused with alien energies drawn from the Dark Tapestry, which transforms the user into an aberration of a level no higher than their current level \+(\d+)\.$/,
            /^This new form could be an existing aberration or a unique one of the GM's creation\.$/,
            /^The user retains their memories and spellcasting ability \(including any rituals they know\) but becomes chaotic evil and loses all other abilities they possessed in their previous form\.$/,
            /^Success As critical success, but the aberration the user transforms into can be of a level no higher than half the user's current level\.$/,
            /^Failure The user's attempt to change is a painful mistake that deals (\d+d\d+\+\d+) (\w+) damage as their body twists, bends and breaks\.$/,
            /^Ultimately, they are not transformed\.$/,
            /^Critical Failure The user is slain, but their body shifts and transforms into a brand new creature as the bodiless alien intelligence Tchekuth incubates within the user's flesh, mind and soul\.$/,
            /^This transformation takes another (\d+) days to complete but can be halted indefinitely if the Void Mirror is placed in a specially constructed frame aimed at the body's location \(regardless of any solid object between the mirror and the body\)\.$/,
            /^Slowing or stopping this transformation via other means requires complex rituals or divine intervention, subject to the GM's whim\.$/,
            /^After 7 days, the body completes its transformation and Tchekuth rises once more as a physical threat\.$/
        ],
        card: ([rite, , above, , , , hurt, , , incubates], plan, { item, html }) => {
            const level = Number(item?.ownerLevel);
            if (!Number.isFinite(level)) return null;
            const dc = LEVEL_DCS[Math.max(0, Math.min(25, Number(item?.system?.level?.value) || 0))];
            const research = researchOf(html);
            const form = (most) => [{ label: "Become the Void", text: `Transformed into an aberration of level ${most} or lower — an existing one or one of the GM's making: it keeps its memories and spellcasting (its rituals too), becomes chaotic evil, and loses all its other abilities.`, duration: null }];
            const card = ownCheck({
                statistic: "occultism",
                dc,
                rows: { criticalSuccess: form(level + Number(above[1])), success: form(Math.floor(level / 2)) },
                notes: [
                    ...(research ? [RESEARCHED(research[2], research[3])] : []),
                    `The rite takes ${rite[1]} consecutive days; missing one of them means the critical failure's effect at once (apply that row).`,
                    `Its check isn't named: Occultism at the mirror's level DC ${dc} (the GM may change it).`
                ]
            });
            const outcomes = card.resolution.outcomes;
            return {
                ...card,
                resolution: {
                    ...card.resolution,
                    sharedDamage: { rollOnce: true, components: [{ id: "0", formula: hurt[1], type: hurt[2].toLowerCase(), category: null }] },
                    outcomes: {
                        ...outcomes,
                        failure: { ...outcomes.failure, damage: { mode: "shared", multiplier: 1, sourceComponentIds: ["0"] } },
                        criticalFailure: { ...outcomes.criticalFailure, terminal: { kind: "death" }, noteEffects: [{ label: "Tchekuth incubates", text: `Slain: its body is becoming a new creature as the alien intelligence Tchekuth incubates in it. In ${incubates[1]} days Tchekuth rises; the Void Mirror in a specially built frame aimed at the body halts it while it's there (any other way takes complex rituals or divine help, the GM's).`, duration: days(Number(incubates[1])) }] }
                    }
                }
            };
        }
    },
    {
        // (A mob of shadowy figures in a 20-foot burst within 120 feet, for a minute: a zone, its user's unarmed Strike against each creature's
        // Fortitude DC as it rises (Grabbed for the minute or until it Escapes against its user's class DC, and 3d6 bludgeoning), again at the end
        // of each turn a creature not yet grabbed ends there, and 1d6 bludgeoning at the end of each turn of one that is (the ability module's
        // condition filters on a zone's entries, only.conditions and only.lacks.conditions, 2026-10-28). The figures' AC and Hit Points, moving the burst from 15th level, and ground that can't hold it are the zone card's lines (the map's).)
        name: "The Uprising",
        sentences: [
            /^The card calls forth a mob of shadowy figures who batter and hinder your enemies\.$/,
            /^Target a (\d+)-foot burst at any point on solid ground with (\d+) feet, and the mob of figures rises up from the ground, persisting for (\d+) (minutes?|rounds?)\.$/,
            /^Make an unarmed Strike against the (Fortitude|Reflex|Will) DC of any number of creatures in this burst \(you can choose to not attack some creatures in the area if you wish\)\.$/,
            /^Any creature you succeed against is Grabbed and takes (\d+d\d+) (\w+) damage\.$/,
            /^Whenever a creature ends its turn in the area, the figures attempt to Grab that creature if they haven't already, and they deal (\d+d\d+) (\w+) damage to any creature already grabbed\.$/,
            /^The mob's Escape DC is equal to your class DC\.$/,
            /^A creature can attack a figure in an attempt to release its grip\.$/,
            /^It's AC is equal to your class DC, and it's destroyed if it takes (\d+) or more damage\.$/,
            /^Even if destroyed, additional figures continue to rise up in the area until the effect's duration ends\.$/,
            /^You can Dismiss this effect\.$/,
            /^If you are at least (\d+)th level, you can use a two-action activity, which has the concentrate trait, to move the burst up to (\d+) feet, which causes any currently grabbed creatures to be released and left behind\.$/,
            /^If part of the burst appears or moves into an area that can't support it on the ground, that portion of the burst disappears until it is supported\.$/
        ],
        card: ([, burst, strike, hit, ends, , , figure, , , move], plan, { base }) => {
            const lasts = timeOf(burst[3], burst[4]);
            const grab = { kind: "condition", slug: "grabbed", value: null, duration: { ...lasts, escape: { ownerDC: "class" } } };
            const struck = (damage) => ({ damage: damage ? { mode: "shared", multiplier: 1, sourceComponentIds: ["0"] } : { mode: "none", multiplier: 0, sourceComponentIds: [] }, effects: [grab], modifiers: [] });
            const rises = unarmedCheck(strike[1].toLowerCase(), { sharedDamage: { rollOnce: false, components: [{ id: "0", formula: hit[1], type: hit[2].toLowerCase(), category: null }] }, outcomes: { criticalSuccess: struck(true), success: struck(true), failure: none(), criticalFailure: none() } }, base);
            const grabs = unarmedCheck(strike[1].toLowerCase(), { outcomes: { criticalSuccess: struck(false), success: struck(false), failure: none(), criticalFailure: none() } }, base);
            return {
                builtin: "zone",
                actions: null,
                targeting: { target: null, range: `${burst[2]} feet`, area: { type: "burst", value: Number(burst[1]) } },
                zone: {
                    area: { type: "burst", value: Number(burst[1]) },
                    centre: "placed",
                    range: Number(burst[2]),
                    lasts,
                    untilReused: false, concealed: false, terrain: [], others: false, hazard: null, effect: null, modifiers: [],
                    saves: [{ when: ["initial"], plan: rises }, { when: ["end"], only: { lacks: { conditions: ["grabbed"] } }, plan: grabs }],
                    damage: [{ when: "end", only: { conditions: ["grabbed"] }, formulas: [`${ends[1]}[${ends[2].toLowerCase()}]`] }],
                    notes: [
                        "On solid ground: a part of the burst over ground that can't hold it is gone until it's held again.",
                        "Its user picks which creatures in it they Strike as it rises (dismiss the cards of those they spare).",
                        `A figure holding a creature: AC equal to its user's class DC; ${figure[1]} damage or more destroys it and frees that creature (end its Grabbed). More keep rising until the minute's up.`,
                        "Its user can Dismiss it (end the zone).",
                        `From ${move[1]}th level, a two-action concentrate activity moves the burst up to ${move[2]} feet (move the zone's region): the creatures grabbed are released and left behind (end their Grabbed).`
                    ]
                }
            };
        }
    },
    {
        // (A glimpse of someone its user will meet in the next 24 hours, and whether to trust them: what it tells, whispered to the GM and its
        // user — the GM's to fill in — with the card's secret flat check rolled for the GM alone (plan.whisper.flat: DC 6, 2 lower while The
        // Carnival is invested, 3 from 17th level, never below 2), a failure always "neither"; and, a divination with a flat check, its user
        // Stupefied 1 for a round (the card's own invested rule).)
        name: "The Carnival",
        sentences: [
            /^You peer into the future and witness yourself walking through a colorful but vaguely sinister carnival, meeting a variety of strange people\.$/,
            /^One of these people looks more genuine than the others and resembles someone you're likely to meet for the first time in the next (\d+) hours \(if anyone\)\.$/,
            /^This resemblance might be metaphorical, such a clown signifying someone who is silly or a stilt-walker representing someone who is tall\.$/,
            /^You also get a sense for whether this person can be trusted, should be distrusted, or neither, based on how they're most likely to interact with you and your allies\.$/,
            /^The GM decides who this new person might be, then rolls a secret @Check\[flat\|dc:(\d+)\]\.$/,
            /^On a failure, the result is always "neither," making it hard to determine whether a "neither" result is accurate\.$/
        ],
        card: ([, meet, , , flat], plan, { item }) => {
            const level = Number(item?.ownerLevel) || 0;
            const dc = Math.max(2, Number(flat[1]) - (level >= 17 ? 3 : 2));
            return {
                builtin: "whisper",
                targeting: { target: null, range: null, area: null },
                whisper: {
                    text: `A vision of a sinister carnival: among its strange people one looks more genuine, resembling — perhaps only in a manner of speaking — someone its user is likely to meet for the first time in the next ${meet[1]} hours (if anyone), and with it a sense of whether they can be trusted, should be distrusted, or neither. The GM says who.`,
                    flat: { dc, failure: "The answer is \"neither\", whatever the truth." }
                },
                userEffects: [{ slug: "stupefied", value: 1, duration: { mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "effect-start" } }]
            };
        }
    },
    {
        // (No circumstance or status bonuses for the creature that fails — PF2e has no rule to take them away, so its note Effect for the row's time
        // (the user's ruling) —, and on a failure for its allies within 15 feet of it too, said on the same Effect.)
        name: "The Empty Throne",
        over: true,
        sentences: [
            /^You overwhelm a target you can see within (\d+) feet with feelings of helplessness and loss\.$/,
            /^The creature must attempt a @Check\[will\|dc:\d+\] save with a DC equal to your class DC or spell DC\.$/,
            /^Critical Success The target is unaffected\.$/,
            /^Success The target can't benefit from circumstance or status bonuses for 1 round\.$/,
            /^Failure The target can't benefit from circumstance or status bonuses for 1 day, and the target's allies are unable to benefit from circumstance or status bonuses while within (\d+) feet of the target\.$/,
            /^Critical Failure As failure, except the duration is 1 week\.$/
        ],
        card: ([range, , , , allies], plan) => {
            if (plan?.resolution?.kind !== "save") return null;
            const lost = (duration, words, around) => ({ ...none(), noteEffects: [{ label: "Helpless and bereft", text: `${NO_BONUSES} ${words}.${around ? ` Its allies can't benefit from them either while within ${allies[1]} feet of it.` : ""}`, duration }] });
            const outcomes = plan.resolution.outcomes;
            const row = (degree, next) => ({ ...outcomes[degree], ...next, manualInstructions: undefined });
            const rows = {
                criticalSuccess: row("criticalSuccess", none()),
                success: row("success", lost({ mode: "fixed", value: 1, unit: "rounds", expiry: "turn-start", anchor: "effect-start" }, "for 1 round", false)),
                failure: row("failure", lost(days(1), "for 1 day", true)),
                criticalFailure: row("criticalFailure", lost(days(7), "for 1 week", true))
            };
            for (const entry of Object.values(rows)) delete entry.manualInstructions;
            return { keep: true, partial: undefined, automation: { ...(plan.automation ?? {}), level: "automatic" }, targeting: { ...(plan.targeting ?? {}), range: `${range[1]} feet` }, resolution: { ...plan.resolution, outcomes: rows } };
        }
    },
    {
        // (One question of the region's spirits as by a Commune ritual: its user's Nature check, DC 30, with the card's own +2 item bonus to it
        // (+3 from 17th level) — its degrees Commune's, what the spirits say the GM's, whispered on the row's note —; a critical failure its
        // Stupefied 4 for a week that nothing removes.)
        name: "The Owl",
        sentences: [
            /^After spending an hour meditating, you can ask one question of the region's spirits, as if you had just performed a Commune ritual\.$/,
            /^Attempt a @Check\[(\w+)\|dc:(\d+)\|traits:activate-the-owl\] check to determine the result\.$/
        ],
        card: ([, check], plan, { item }) => {
            const level = Number(item?.ownerLevel) || 0;
            const answer = (label, text) => [{ label, text, duration: { mode: "fixed", value: 1, unit: "minutes", expiry: "turn-start", anchor: "effect-start" } }];
            const card = ownCheck({
                statistic: check[1].toLowerCase(),
                dc: check[2],
                rows: {
                    criticalSuccess: answer("The spirits answer", "A more powerful spirit of nature, strongly aligned with its user's interests, answers its one yes-or-no question about the region's animals, beasts, fey, fungi, plants, land and resources within 3 miles: it won't deceive (though it may not know), and gives up to five words when clarity matters. The GM answers."),
                    success: answer("The spirits answer", "The region's spirits of nature answer its one yes-or-no question with one word (\"Yes\", \"No\", \"Likely\", \"Unknown\"), as their own agenda has it — perhaps deceptively. The GM answers."),
                    failure: answer("No answer", "It fails to reach an appropriate spirit: no answer."),
                    criticalFailure: [{ label: "The enormity of the cosmos", text: "Stupefied 4 for 1 week; nothing can remove it.", rules: [{ key: "GrantItem", uuid: "Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg", onDeleteActions: { grantee: "restrict" }, alterations: [{ mode: "override", property: "badge-value", value: 4 }] }], duration: days(7) }]
                },
                notes: ["An hour's meditation first; then its user asks its one question, the card's bonus on the Nature check."]
            });
            return { ...card, resolution: { ...card.resolution, check: { ...card.resolution.check, bonus: { value: level >= 17 ? 3 : 2, type: "item" } } } };
        }
    },
    {
        // (Two activations in one block — PF2e's text runs the second's Activate line on in the first's paragraph: tying its user's soul to the spear,
        // once a day, and mustering the Army of Fire, once a week — the ways card's ways, each its own frequency (way.frequency). Against a living
        // Commander: its user's best of the four, against the highest of the Commander's four DCs (plan.bestOf, plan.dcFromTarget: scripts/live.js,
        // the Commander targeted), rolled on its user — a success its Commander of Flame Effect, a failure the Commander knowing it for 24 hours.
        // With none living: that Effect at once. The muster's teleports: the army's tokens or its user's, on the map.)
        name: "Spear of the Destroyer's Flame",
        sentences: [
            /^You attempt to tie your soul to the spear\.$/,
            /^If the current Commander of Flame still lives, you must attempt either an? ((?:Will|Fortitude|Reflex) save), ([\w ]+? check), ([\w ]+? check), or ([\w ]+? check)\.$/,
            /^The DC of this check is equal to the current Commander's (\w+) DC, ([\w ]+?) DC, ([\w ]+?) DC, or ([\w ]+?) DC, whichever is highest\.$/,
            /^On a success, you become the Commander of Flame\.$/,
            /^On a failure, the current Commander knows your name and appearance and is aware of your exact location for (\d+) (hours?)\.$/,
            /^Activate 1 hour \(envision, Interact\) Frequency (once per week) Effect You use the spear's power to muster the Army of Fire\.$/,
            /^You can choose to either call the Army of Fire to your location or move yourself to the army's location\.$/,
            /^When calling the army, you select an area you can see within (\d+) feet\.$/,
            /^The army is instantly teleported to the location you select, spreading out as necessary to arrive safely\.$/,
            /^When moving yourself, you instantly teleport yourself to a location within (\d+) feet of the army\.$/,
            /^The army is composed of souls given form as burning humanoids, elementals, spirits, and undead\.$/
        ],
        card: ([, attempt, dcs, , failure, muster, , call, , move], plan, { base, info }) => {
            const own = (card) => ({ ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...card, item: { ...info, ...(card.item ?? {}) } });
            const becomes = [{ label: COMMANDER, text: COMMANDER_TEXT, duration: null }];
            const known = [{ label: "Known to the Commander", text: `The current Commander of Flame knows its name and appearance and is aware of its exact location for ${failure[1]} ${failure[2]}.`, duration: timeOf(failure[1], failure[2]) }];
            const stats = attempt.slice(1, 5).map(statisticSlug);
            const against = ownCheck({ statistic: stats[0], dc: 0, rows: { criticalSuccess: becomes, success: becomes, failure: known, criticalFailure: known }, notes: ["Target the living Commander of Flame first: the DC is the highest of their four, rolled with its user's best of the four."] });
            const day = { max: 1, per: "day", raw: "once per day" };
            const tie = (name, card) => ({ name, html: "<p>You attempt to tie your soul to the spear.</p>", plan: own({ ...card, activation: { ...(base?.activation ?? {}), time: "1 minute" } }), frequency: day, frequencyKey: "tie" });
            return {
                builtin: "ways",
                targeting: { target: null, range: null, area: null },
                ways: [
                    tie("Tie its soul: against the living Commander", { ...against, bestOf: stats, dcFromTarget: { statistics: dcs.slice(1, 5).map(statisticSlug) } }),
                    tie("Tie its soul: no Commander living", ownRow({ noteEffects: becomes })),
                    {
                        name: "Muster the Army of Fire (once per week)",
                        html: `<p>${muster[0].replace(/^Activate 1 hour \(envision, Interact\) Frequency once per week Effect /, "")}</p>`,
                        frequency: { max: 1, per: "week", raw: muster[1] },
                        plan: own({ ...ownRow({ notes: [
                            `Call the army: it teleports at once to an area its user can see within ${call[1]} feet, spreading out to arrive safely (put its tokens there).`,
                            `Or move itself: its user teleports at once to a spot within ${move[1]} feet of the army (move its token there).`,
                            "The army: souls given form as burning humanoids, elementals, spirits and undead."
                        ] }), activation: { ...(base?.activation ?? {}), time: "1 hour" } })
                    }
                ]
            };
        }
    },
    {
        // (PF2e's Retributive Strike as its user's own: the ally the enemy damaged gains resistance to all damage, 2 + its user's level, against
        // that damage — the fortune card's readied bonus for the creature targeted, gone with the damage —; its melee Strike at the enemy in reach,
        // and its champion feats' benefits (PF2e's own toggle on its sheet), its user's own.)
        name: "Piereta",
        sentences: [/^Piereta makes a Retributive Strike, resolved as though you had used the ability, including any benefits from champion feats you have\.$/],
        card: (found, plan, { item }) => {
            const level = Number(item?.ownerLevel);
            if (!Number.isFinite(level)) return null;
            return {
                builtin: "readied-bonus",
                targeting: { target: "the ally the enemy damaged", range: null, area: null },
                bonus: { modifiers: [], resistance: { type: "all-damage", value: level + 2 }, against: true, duration: { value: 0, unit: "rounds", expiry: "turn-end" }, spend: [], recipient: "target" },
                notes: [
                    "Retributive Strike's trigger: an enemy damages its user's ally, both within 15 feet of its user (its champion's aura). Target that ally, then Apply: its resistance is against that damage.",
                    "If the enemy is within reach, its user makes a melee Strike against it (their own Strike, with any champion feats' benefits — PF2e's Retributive Strike toggle on its sheet)."
                ]
            };
        }
    },
    {
        // (Its partner back from death at full Hit Points, keeping the spells prepared and the points in its pools it had: the revival on its user
        // (item.revive hp "max", keepPools — scripts/revive.js); its long-term debilitations kept, and the look it takes on, note Effects.)
        name: "Briar",
        sentences: [
            /^Briar resurrects its partner\.$/,
            /^The partner returns to life with full Hit Points and the same spells prepared and points in their pools they had when they died, but still suffering from any long-term debilitations of the old body\.$/,
            /^The target is also permanently changed in some way that shifts their appearance slightly toward that of Nyrissa's, such as a green streak in the hair, a few thorny growths on the body, or a slight greenish cast to their skin\.$/
        ],
        card: () => ownRow({
            noteEffects: [{ label: "Touched by Nyrissa", text: "Its look has shifted for good a little toward Nyrissa's: a green streak in the hair, a few thorny growths, or a slight greenish cast to the skin (its player picks).", duration: null }],
            item: { recipient: "user", revive: { hp: "max", keepPools: true, words: "Back from death by Briar with full Hit Points, the spells prepared and the points in its pools it had when it died; it still has any long-term debilitations of its old body" } }
        })
    },
    {
        // (Its first Strike at Nyrissa in a round: its partner's +4 item bonus to saves against her spells for a minute — the item card's Effect,
        // its TokenMark at her, the bonus predicated on her as the save's origin — then her Fortitude save card, DC 50: Stunned 1, or 3 on a
        // critical failure; no other creature's.)
        name: "Briar",
        over: true,
        sentences: [
            /^The target must attempt a @Check\[fortitude\|dc:(\d+)\] save\.$/,
            /^Success The target is unaffected\.$/,
            /^Failure The target is Stunned (\d+)\.$/,
            /^Critical Failure The target is Stunned (\d+)\.$/,
            /^Briar's partner gains a \+(\d+) item bonus to all saving throws against Nyrissa's spells for (\d+) (minutes?|rounds?)\.$/
        ],
        card: ([save, , failure, critical, bonus], plan, { base }) => {
            if (plan?.resolution?.kind !== "save") return null;
            const slug = "briar-nyrissa";
            const duration = timeOf(bonus[2], bonus[3]);
            const nyrissa = {
                ...base,
                automation: { level: "automatic" },
                trigger: { event: "use" },
                targeting: { target: "Nyrissa", range: null, area: null },
                ifTarget: [{ named: "nyrissa", lacks: true, immune: true }],
                resolution: { kind: "save", check: { roll: "save", statistic: "fortitude", basic: false, against: { dc: "fixed", value: Number(save[1]) } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: stun(Number(failure[1])), criticalFailure: stun(Number(critical[1])) } }
            };
            return {
                ...ownRow({ target: "Nyrissa", notes: ["Target Nyrissa, the creature struck: the bonus is against her spells, then her save's card follows."] }),
                resolution: { kind: "check", check: { roll: "automatic" }, outcomes: { success: { ...none(), modifiers: [{ selector: "saving-throw", value: Number(bonus[1]), type: "item", duration, predicate: [`origin:mark:${slug}`, "item:type:spell"] }] } } },
                again: { plan: nyrissa, later: false },
                item: { recipient: "user", mark: { slug, duration } }
            };
        }
    },
    {
        // (3rd-rank Circle of Protection against undead in place of an alignment, a 10-foot emanation around the athame: a zone on its user for a
        // minute, each creature inside +1 status to AC against undead creatures' attacks and to saves against their effects, +3 against a summoned
        // undead's attacks and (its toggle) an undead's effect that directly controls it; a summoned undead entering attempts a Will save at the
        // athame's level DC to come in — only a summoned undead, by the ability module's only.all (2026-10-28).)
        name: "Spiral Athame",
        over: true,
        sentences: [
            /^You point the Spiral Athame to the sky and pray, warding creatures against undead\.$/,
            /^This has the effect of (\d)(?:st|nd|rd|th)-rank Circle of Protection, except it wards against undead creatures rather than creatures of a specified alignment, and the emanation is centered on the Spiral Athame ?\.$/
        ],
        card: ([, rank], plan, { item }) => {
            if (plan?.builtin !== "cast-spell" || Number(rank[1]) !== 3) return null;
            const dc = LEVEL_DCS[Math.max(0, Math.min(25, Number(item?.system?.level?.value) || 0))];
            const toggle = "spiral-athame-ward:controlling";
            const keep = { kind: "save", check: { roll: "save", statistic: "will", basic: false, against: { dc: "fixed", value: dc } }, sharedDamage: null, outcomes: { criticalSuccess: none(), success: none(), failure: { ...none(), noteEffects: [{ label: "Kept out of the ward", text: "This summoned undead can't willingly enter the Spiral Athame's ward; its later tries use this result.", duration: timeOf(1, "minute") }] }, criticalFailure: { ...none(), noteEffects: [{ label: "Kept out of the ward", text: "This summoned undead can't willingly enter the Spiral Athame's ward; its later tries use this result.", duration: timeOf(1, "minute") }] } } };
            return {
                builtin: "zone",
                actions: null,
                targeting: { target: null, range: null, area: { type: "emanation", value: 10 } },
                zone: {
                    area: { type: "emanation", value: 10 },
                    centre: "self",
                    range: null,
                    lasts: timeOf(1, "minute"),
                    untilReused: false, concealed: false, terrain: [], others: false, hazard: null, damage: [], effect: null, modifiers: [],
                    saves: [{ when: ["enter"], only: { all: ["undead", "summoned"] }, plan: { modelVersion: plan.modelVersion, source: plan.source, rank: 3, traits: ["divine", "necromancy"], trigger: { event: "zone" }, targeting: { target: "a summoned undead entering", range: null, area: null }, automation: { level: "automatic" }, resolution: keep } }],
                    inside: [{ rules: [
                        { key: "FlatModifier", slug: "spiral-athame-ward", selector: ["ac", "saving-throw"], type: "status", value: 1, predicate: ["origin:trait:undead"] },
                        { key: "FlatModifier", slug: "spiral-athame-ward-summoned", selector: "ac", type: "status", value: 3, predicate: ["origin:trait:undead", "origin:trait:summoned"] },
                        { key: "RollOption", domain: "saving-throw", option: toggle, toggleable: true, label: "Against an undead's effect that directly controls it", value: false },
                        { key: "FlatModifier", slug: "spiral-athame-ward-controlling", selector: "saving-throw", type: "status", value: 3, predicate: ["origin:trait:undead", toggle] }
                    ] }],
                    notes: [
                        "A 10-foot ward around the athame's holder for 1 minute: inside, +1 status to AC against undead's attacks and to saves against their effects; +3 against a summoned undead's attack, and (switch it on) against an undead's effect directly controlling the creature.",
                        `A summoned undead entering attempts a DC ${dc} Will save (the athame's level DC: the GM may change it); failing, it can't willingly enter, its later tries using that result.`
                    ]
                }
            };
        }
    },
    {
        // (A conjured javelin's ranged Strike — a javelin's, with the club's +3 and its damage dice — and its gazelle's leap to as many creatures
        // near the one hit as the actions spent: the ways card's three ways, each its user's thrown attack (Dexterity and simple weapon
        // proficiency, +3 item) at a creature within 60 feet, its hit's second step the gazelle's damage at up to that many creatures its
        // presser targets within 20 feet of the first (thenSave, maxTargets). The javelin's and the gazelle's ghost touch: plan.damageOptions,
        // the rune's roll option on their damage (the ability module's, 2026-10-28).)
        name: "Hunter's Dawn",
        sentences: [
            /^You swing Hunter's Dawn and launch a magically conjured javelin at a target within (\d+) feet, making a ranged Strike\.$/,
            /^The javelin has the statistics of a javelin but gains the magical properties of Hunter's Dawn and disappears immediately after hitting or missing its target\.$/,
            /^On a successful hit, you deal damage \((\d+d\d+) (\w+), due to the atlatl's greater striking rune, plus your Strength modifier\); in addition, a gazelle leaps from the hit target to one or more targets within (\d+) feet of the first, dealing (\d+d\d+) (\w+) damage plus your Strength modifier\.$/,
            /^The number of additional targets hit in this way is equal to the number of actions you spend to activate this ability \(one additional target if you used one action, two additional targets for two actions, and so forth\)\.$/
        ],
        card: ([launch, , hit], plan, { item, base }) => {
            const str = strOf(item);
            const potency = Number(item?.system?.runes?.potency) || 0;
            const way = (actions) => {
                const gazelle = {
                    ...base,
                    automation: { level: "automatic" },
                    targeting: { target: `up to ${COUNT[actions - 1]} creature${actions === 1 ? "" : "s"} within ${hit[3]} feet of the one hit`, range: null, area: null },
                    trigger: { event: "use" },
                    maxTargets: actions,
                    resolution: { kind: "check", check: { roll: "automatic" }, sharedDamage: { rollOnce: true, components: [{ id: "0", formula: plus(hit[4], str), type: hit[5].toLowerCase(), category: null }] }, outcomes: { success: { damage: { mode: "shared", multiplier: 1, sourceComponentIds: ["0"] }, effects: [], modifiers: [] } } },
                    damageOptions: ["item:rune:property:ghost-touch"]
                };
                const hitRow = (multiplier) => ({ damage: { mode: "shared", multiplier, sourceComponentIds: ["0"] }, effects: [], modifiers: [] });
                return {
                    name: `${actions} action${actions === 1 ? "" : "s"}: the javelin and ${COUNT[actions - 1]} gazelle leap${actions === 1 ? "" : "s"}`,
                    plan: {
                        ...base,
                        automation: { level: "automatic" },
                        activation: { ...(base?.activation ?? {}), time: String(actions) },
                        targeting: { target: "1 creature", range: `${launch[1]} feet`, area: null },
                        trigger: { event: "use" },
                        ownCheck: { kind: "attack", modifier: null, choose: ["thrown"], within: Number(launch[1]), ...(potency ? { itemBonus: potency } : {}) },
                        resolution: { kind: "check", check: { roll: "skill", statistic: "attack", against: { dc: "target", statistic: "ac" }, modifier: null }, sharedDamage: { rollOnce: true, components: [{ id: "0", formula: plus(hit[1], str), type: hit[2].toLowerCase(), category: null }] }, outcomes: { criticalSuccess: hitRow(2), success: hitRow(1), failure: none(), criticalFailure: none() } },
                        damageOptions: ["item:rune:property:ghost-touch"],
                        thenSave: gazelle,
                        notes: [
                            `A conjured javelin, gone once it hits or misses: its user's thrown attack${potency ? ` with the club's +${potency}` : ""}.`,
                            `On a hit, the gazelle leaps on: target up to ${COUNT[actions - 1]} other creature${actions === 1 ? "" : "s"} within ${hit[3]} feet of the one hit, then press its step (nothing on a miss).`
                        ]
                    }
                };
            };
            return { builtin: "ways", targeting: { target: null, range: null, area: null }, once: true, ways: [1, 2, 3].map(way) };
        }
    },
    {
        // (The creature hit marked — its user's TokenMark, until a new one's marked or it dies, its dispelling the GM's at DC 46 —, and once a day
        // 5th-rank Locate on it however far: the ways card's two ways, the Locate's own once a day (way.frequency).)
        name: "Hunter's Dawn",
        sentences: [
            /^The target is marked\.$/,
            /^Once per day, you can cast a (\d+)(?:st|nd|rd|th)-rank Locate spell on the marked target, regardless of its distance from you or your ability to cast spells\.$/,
            /^This effect persists until it is dispelled \(counterspell DC (\d+)\), the creature dies, or a new target is marked\.$/
        ],
        card: ([, locate, persists], plan, { base, info, html }) => {
            const uuid = /@UUID\[(Compendium\.pf2e\.spells-srd\.Item\.[A-Za-z0-9]+)\]\{Locate\}/.exec(String(html ?? ""))?.[1];
            if (!uuid) return null;
            const slug = "hunters-dawn-mark";
            const mark = { ...base, automation: { level: "automatic" }, trigger: { event: "use" }, ...ownRow({ target: "the creature hit" }), item: { ...info, recipient: "user", mark: { slug, duration: null, endsOnDeath: true, words: `until it dies or another is marked; dispelling it takes a counteract check against DC ${persists[1]}` } } };
            const cast = { ...base, automation: { level: "automatic" }, trigger: { event: "use", frequency: { max: 1, per: "day", raw: "once per day" } }, builtin: "cast-spell", spell: { uuid, name: "Locate" }, rank: Number(locate[1]), dc: null, attack: null, tradition: null, self: false, area: false, targets: true, targeting: { target: "the marked creature", range: null, area: null }, notes: ["Target the marked creature: Locate reaches it however far away it is, whether or not its user can cast spells."], item: { ...info } };
            return {
                builtin: "ways",
                targeting: { target: null, range: null, area: null },
                ways: [
                    { name: "Mark the creature hit", html: "<p>The target is marked.</p>", plan: mark },
                    { name: `Cast ${locate[1]}th-rank Locate on the marked creature (once per day)`, html: `<p>${locate[0]}</p>`, plan: cast, frequency: { max: 1, per: "day", raw: "once per day" } }
                ]
            };
        }
    },
    {
        // (Its user's Religion check: a success locks the mirror onto the place they focus on, only they seeing it — their note Effect until it
        // opens its rift there.)
        name: "Passage Pane",
        sentences: [
            /^You focus on a location in the Boneyard that you wish to travel to\.$/,
            /^You must have either seen or visited this location before or be able to describe the location in detail and its purpose or name, as appropriate\.$/,
            /^Attempt a @Check\[(\w+)\|dc:(\d+)\] check\.$/,
            /^On a success, the mirror locks onto your desired location, and you \(and only you\) see this location reflected in the mirror's pane\.$/
        ],
        card: ([, , check]) => {
            const lock = [{ label: LOCKED, text: "The mirror is locked onto the Boneyard location its user focused on; only they see it reflected in its pane. Its rift opens there.", duration: null }];
            return ownCheck({
                statistic: check[1].toLowerCase(),
                dc: check[2],
                rows: { criticalSuccess: lock, success: lock },
                notes: ["Its user focuses on a Boneyard location they've seen or visited, or can describe in detail (its purpose or name).", PANE_NEEDS]
            });
        }
    },
    {
        // (Its rift, open for 24 hours at most: onto the location it's locked on, else a random point of the Dead Roads.)
        name: "Passage Pane",
        sentences: [
            /^You urge the mirror to open a rift to the Boneyard\.$/,
            /^Creatures can travel through this rift in either direction\.$/,
            /^If you've successfully forced the mirror to lock onto a specific location, the mirror's pane becomes a rift to the Boneyard that opens onto that location\.$/,
            /^If you haven't forced the mirror to lock onto a specific location, the mirror's pane becomes a rift to a random location on the Dead Roads\.$/,
            /^This rift remains open until you close it, up to a maximum of (\d+) (hours?|minutes?)\.$/,
            /^As long as the rift is open, the mirror is immovable, no one can form a bond with the mirror, and no one but you can Activate the mirror\.$/
        ],
        card: ([, , , , open]) => ownRow({
            noteEffects: [{ label: RIFT, text: `The mirror's pane is a rift to the Boneyard, which creatures can travel through either way: onto the location it's locked on (its user's ${LOCKED} Effect), or else onto a random point on the Dead Roads. It's open until its user closes it, ${open[1]} ${open[2]} at most. While it's open the mirror is immovable, no one can bond with it, and no one but its user can Activate it.`, duration: timeOf(open[1], open[2]) }],
            notes: [`Locked on (its user's ${LOCKED} Effect): the rift opens onto that location; otherwise onto a random point on the Dead Roads, the GM's pick.`, PANE_NEEDS]
        })
    },
    {
        // (Its rift closed: the Effect its other activation gave ended.)
        name: "Passage Pane",
        over: true,
        sentences: [/^You close the rift\.$/],
        card: () => ownRow({ notes: ["Only while the mirror is an open rift and its user is bonded with it."], item: { endsOwn: { label: RIFT } } })
    }
];

// The plan and its activation's { name, words, html, base, info, frequency, item } → the reading's card, or the same plan.
export function withSpecialSentences(plan, given) {
    const own = READINGS.map((reading) => ({ ...reading, card: (found, read) => reading.card(found, read, given) }));
    return withSentenceReadings(own, plan, given);
}

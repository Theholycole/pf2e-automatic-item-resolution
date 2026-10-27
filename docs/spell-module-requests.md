# What the items need from the spell module

The spell module (`pf2e-automatic-resolution`) casts the items' spells. This module never edits its tree, so what an item needs from it is kept here until a session works on it. Each item's rule is a line of its card until then. *(Started 2026-10-27, from the first six-agent batch.)*

| # | What the spell module would need | Items |
|---|---|---|
| 1 | A cast-plan field for a spell whose attack is a weapon's Strike, such as `plan.castStrike { weapon: "etched", damageAbility: "wis" }`. Spiritual Armament cast from the item: its attack and each Sustain's attack use the etched weapon's own Strike (attack and damage) with Wisdom in place of Strength for damage, and offer Flurry of Blows in place of the Strike. | Flurrying |
| 2 | A `castFromItem` option to cast a spell without one of its traits, such as `withoutTraits: ["mental"]`: the cast's Effects and checks lack it, so a mindless creature is affected. | Ivory Baton (both grades): Dominate on mindless constructs |
| 3 | A spell-storing (Spell Reservoir) stored spell cast two ways. On a Strike's hit: at the creature hit, the Strike's degree as the spell attack's (`castFromItem` with an attack degree), a fixed save DC (30 for Channeled Release), then emptied. At a chosen target: with the item's own spell attack and DC. | Spell Reservoir (Channeled Release); Animate Dreamer (Unleash Spell: +25, DC 33) |
| 4 | A rider on its user's next spell with a trait that deals damage. Each creature it damages gets a condition for a time, a worse one on a critically failed save or a critical spell attack: `{ nextSpell: { traits: ["cold"], damages: true, rows: { default: [...], critical: [...] } } }`. | Tome of Scintillating Sleet (Dazzled 3 rounds; Blinded 1 round, then Dazzled 3) |
| 5 | A cast at the caster's champion focus-spell rank, at the creature its user just hit, with a status penalty to that save equal to the weapon's damage dice (Calm); and a self cast of Protection. | Blessed Reformer (both activations) |
| 6 | Optional: `castFlatCheck` with damage on a failure instead of a lost spell: each time the creature Casts a Spell within a week, a DC 11 flat check, 2d12 force on a failure. A note Effect for now. | Magekiller Bullet |

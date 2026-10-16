// The gun staff (packs/_source/items, the user's request of 2026-10-16): a firearm merged with a staff, as PF2e's Musket
// Staff of Force is a +1 flintlock musket with a Reinforced Stock attached that also holds a staff's spells. When it first
// goes into an inventory, its owner picks a two-handed firearm and a staff (scripts/generic-items.js), and the item becomes:
// - the firearm: its damage, range, reload, ammunition, group and base item, held in two hands;
// - the staff: its spell list (the description's last list, which PF2e Dailies prepares a staff from), its magical and staff
//   traits and its other ones (not its club traits), its rules and runes, and at least a +1 potency rune, as the Musket
//   Staff's;
// - a Reinforced Stock attached (PF2e's sub-item), with the gun staff's runes, so its Strikes have them too.
// Its level is the staff's (one higher when the +1 is added, as the Musket Staff's 4 to a 3rd-level Staff of Fire) or the
// firearm's, whichever is higher; its price the staff's, the firearm's and the +1's. Pure: the sources in, the update out.

export const MODULE_ID = "pf2e-automatic-item-resolution";
// flags[MODULE_ID][GUN_STAFF]: { firearm: null, staff: null } until merged; then { firearm: { uuid, name }, staff: { uuid, name } }.
export const GUN_STAFF = "gunStaff";
export const REINFORCED_STOCK = "Compendium.pf2e.equipment-srd.Item.tHIb3ynOHj7dGiCH";

// The staff's traits that are its club's, not the gun staff's.
const CLUB_TRAITS = /^(?:two-hand-d\d+|monk|parry|trip|reach|shove|sweep|backswing|disarm|finesse|agile)$/;
const RARITY = ["common", "uncommon", "rare", "unique"];
// A +1 weapon potency rune: 35 gp, level 2.
const POTENCY_PRICE = 35;

const traitsOf = (item) => item?.system?.traits?.value ?? [];
export const isPending = (item) => Boolean(item?.flags?.[MODULE_ID]?.[GUN_STAFF]) && !item.flags[MODULE_ID][GUN_STAFF].staff;

// A firearm a gun staff can be built on: a two-handed one (the user's limit), not already magic or a staff.
export function isBaseFirearm(item) {
    return item?.type === "weapon" && item.system?.group === "firearm" && item.system?.usage?.value === "held-in-two-hands" && !traitsOf(item).includes("magical") && !traitsOf(item).includes("staff");
}
// Why a firearm can't be: for the picker's warning (null when it can).
export function firearmProblem(item) {
    if (item?.type !== "weapon" || item.system?.group !== "firearm") return `${item?.name ?? "That"} isn't a firearm.`;
    if (item.system?.usage?.value !== "held-in-two-hands") return `${item.name} isn't a two-handed firearm: a gun staff takes two-handed firearms only.`;
    if (traitsOf(item).includes("staff")) return `${item.name} is a staff already.`;
    if (traitsOf(item).includes("magical")) return `${item.name} is a magic firearm: pick a base one.`;
    return null;
}
// A staff to merge: a magical weapon with the staff trait that isn't a firearm (PF2e Dailies' staff, less its coda instruments).
export function isStaff(item) {
    return item?.type === "weapon" && traitsOf(item).includes("staff") && traitsOf(item).includes("magical") && item.system?.group !== "firearm";
}

// A price ({ pp, gp, sp, cp }) in copper, and back. (Every coin, so an update leaves none of the old price behind.)
const COPPER = { pp: 1000, gp: 100, sp: 10, cp: 1 };
const copperOf = (price) => Object.entries(COPPER).reduce((sum, [coin, worth]) => sum + (Number(price?.[coin]) || 0) * worth, 0);
function priceOf(copper) {
    const price = { pp: 0 };
    let left = Math.round(copper);
    for (const coin of ["gp", "sp", "cp"]) {
        price[coin] = Math.floor(left / COPPER[coin]);
        left -= price[coin] * COPPER[coin];
    }
    return price;
}

// "Staff of Fire" and an Arquebus → "Arquebus Staff of Fire"; "Animal Staff" → "Animal Arquebus Staff"; "Birchstaff" →
// "Arquebus Birchstaff".
export function gunStaffName(firearm, staff) {
    return /\bStaff\b/.test(staff.name) ? staff.name.replace(/\bStaff\b/, `${firearm.name} Staff`) : `${firearm.name} ${staff.name}`;
}

const link = (item) => (item.uuid ? `@UUID[${item.uuid}]{${item.name}}` : item.name);
const plus = (runes) => `+${runes.potency}${runes.striking ? ` ${["", "striking", "greater striking", "major striking"][runes.striking] ?? "striking"}` : ""}`;

// The update that makes the gun staff (current: its own source now) from the firearm's and the staff's sources, and the
// Reinforced Stock's (null: none; a combination firearm has its own melee usage and takes no attachment).
export function gunStaffUpdate(current, firearm, staff, { stock = null, id = null } = {}) {
    const runes = { potency: Math.max(1, Number(staff.system?.runes?.potency) || 0), striking: Number(staff.system?.runes?.striking) || 0, property: [...(staff.system?.runes?.property ?? [])] };
    const added = !(Number(staff.system?.runes?.potency) >= 1);
    const level = Math.max((Number(staff.system?.level?.value) || 0) + (added ? 1 : 0), Number(firearm.system?.level?.value) || 0);
    const copper = copperOf(staff.system?.price?.value) + copperOf(firearm.system?.price?.value) + (added ? POTENCY_PRICE * 100 : 0);
    const rarity = RARITY[Math.max(RARITY.indexOf(firearm.system?.traits?.rarity ?? "common"), RARITY.indexOf(staff.system?.traits?.rarity ?? "common"), 0)];
    const traits = [...new Set([...traitsOf(firearm), "magical", "staff", ...traitsOf(staff).filter((trait) => !CLUB_TRAITS.test(trait))])].sort();
    const combination = traitsOf(firearm).includes("combination");
    const { uuid: _, ...stockSource } = stock ?? {};
    const attached = stock && !combination
        ? [{ ...stockSource, _id: id ?? stock._id, system: { ...stock.system, runes: { ...runes, property: [...runes.property] }, equipped: { carryType: "worn" }, containerId: null } }]
        : [];
    const intro = `<p>This ${plus(runes)} ${link(firearm)} is merged with ${link(staff)}${attached.length ? `, with a ${link(stock)} permanently attached; its runes apply to Strikes with the stock as well` : ""}. It's a firearm and a staff at once: it holds the staff's spells and is prepared following the same rules as a staff.</p>`;
    // (Not the firearm's identification: PF2e keeps the item's name, image and description there, and makes it again from the new ones.)
    const { identification: _identification, ...firearmSystem } = structuredClone(firearm.system ?? {});
    const system = {
        ...firearmSystem,
        description: { ...(firearm.system?.description ?? {}), value: `${intro}\n<hr />\n${staff.system?.description?.value ?? ""}` },
        level: { value: level },
        price: { value: priceOf(copper) },
        traits: { ...(firearm.system?.traits ?? {}), value: traits, rarity },
        runes,
        specific: { material: { grade: null, type: null }, runes: { potency: 0, property: [], striking: 0 } },
        rules: [...structuredClone(firearm.system?.rules ?? []), ...structuredClone(staff.system?.rules ?? [])],
        subitems: attached,
        slug: null,
        // (Where it is and how it's carried stay as they are.)
        quantity: current?.system?.quantity ?? 1,
        containerId: current?.system?.containerId ?? null,
        equipped: current?.system?.equipped ?? firearm.system?.equipped ?? { carryType: "worn" }
    };
    return {
        name: gunStaffName(firearm, staff),
        img: firearm.img ?? current?.img,
        system,
        [`flags.${MODULE_ID}.${GUN_STAFF}`]: { firearm: { uuid: firearm.uuid ?? null, name: firearm.name }, staff: { uuid: staff.uuid ?? null, name: staff.name } }
    };
}

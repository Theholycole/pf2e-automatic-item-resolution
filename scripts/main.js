// PF2e Automatic Item Resolution: registers the item compiler with the
// resolution core, so the core's users (the Combat Simulator, live play) get a
// plan for a consumable from registry.planFor(item). Live cards come with
// batch 1 (docs/design.md).

import { compileItem, handlesItem } from "../src/compiler/index.js";

const MODULE_ID = "pf2e-automatic-item-resolution";
const ABILITY_ID = "pf2e-automatic-ability-resolution";

// The ability module's compiled basic actions (the riders some items' text names).
const basicActions = () => game.modules.get(ABILITY_ID)?.api?.basicActions ?? {};

// A Foundry item as plain data, keeping its uuid (the compiler is pure).
const dataOf = (item) => (typeof item?.toObject === "function" ? { ...item.toObject(false), uuid: item.uuid } : item);

const compile = (item) => compileItem(dataOf(item), { basicActions: basicActions() });

// Registered when the script loads, so the order modules load in doesn't matter.
Hooks.once("pf2eResolutionCoreReady", (core) => {
    core.registry.registerCompiler({ module: MODULE_ID, name: "items", handles: handlesItem, compile });
});

Hooks.once("ready", () => {
    const module = game.modules.get(MODULE_ID);
    if (module) module.api = Object.freeze({ compileItem: compile, handlesItem });
});

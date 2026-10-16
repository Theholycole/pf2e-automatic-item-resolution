// Builds the module's compendium packs (LevelDB) from their JSON sources: packs/_source/<pack>/*.json → packs/<pack>, as the
// spell module builds its own. Each source file is one document; the pack is rebuilt from scratch. Run it with no Foundry
// world using the pack:
//   node tools/build-packs.mjs [path to Foundry's resources/app]
// The LevelDB library is Foundry's own (classic-level, from its node_modules), so the format matches the Foundry that reads it.
import { readdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const foundryApp = process.argv[2] ?? process.env.FOUNDRY_APP ?? path.join(process.env.HOME ?? "", "Documents/FoundryVTT-Linux-14.367(1)/resources/app");
const { ClassicLevel } = createRequire(path.join(foundryApp, "package.json"))("classic-level");

// Each pack: its folder under packs/_source, and the document collection its keys use.
const PACKS = [{ name: "items", collection: "items" }];

for (const pack of PACKS) {
    const sourceDir = path.join(root, "packs/_source", pack.name);
    const target = path.join(root, "packs", pack.name);
    const files = (await readdir(sourceDir)).filter((file) => file.endsWith(".json")).sort();
    const docs = await Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(sourceDir, file), "utf8"))));
    for (const doc of docs) if (!/^[A-Za-z0-9]{16}$/.test(doc._id ?? "")) throw Error(`${pack.name}: ${doc.name ?? "a document"} needs a 16-character _id.`);
    await rm(target, { recursive: true, force: true });
    const db = new ClassicLevel(target, { keyEncoding: "utf8", valueEncoding: "json" });
    await db.open();
    const batch = db.batch();
    for (const doc of docs) batch.put(`!${pack.collection}!${doc._id}`, doc);
    await batch.write();
    await db.close();
    console.log(`${pack.name}: ${docs.length} document${docs.length === 1 ? "" : "s"} → packs/${pack.name}`);
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { clearVault, createInitialVault, readVault, restoreSampleAssets, updateVault, VAULT_KEY, type Vault } from "../app/vault-store.ts";
import { imageExtension, saveImageToVault } from "../app/vault-save.ts";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const generated = { name: "Copper hotpot", model: "Seedream", dataUrl: "data:image/png;base64,test", width: 2048, height: 1536 };

test("first save retains all seven samples without first opening Vault", () => {
  const storage = new MemoryStorage();
  const original = createInitialVault();
  saveImageToVault(generated, storage);
  const saved = readVault(storage);
  assert.equal(saved.assets.length, 8);
  assert.deepEqual(saved.assets.slice(0, 7), original.assets);
  assert.deepEqual(saved.folders.slice(0, 3), original.folders);
  assert.equal(saved.folders[3].name, "Generated");
  assert.deepEqual(saved.folders[3].assetIds, [saved.assets[7].id]);
});

test("consecutive saves append unique assets to the same Generated folder", () => {
  const storage = new MemoryStorage();
  saveImageToVault(generated, storage);
  const first = readVault(storage);
  saveImageToVault({ ...generated, name: "Second hotpot" }, storage);
  const saved = readVault(storage);
  assert.equal(saved.assets.length, 9);
  assert.deepEqual(saved.assets.slice(0, 8), first.assets);
  assert.equal(saved.folders.length, 4);
  assert.equal(new Set(saved.folders[3].assetIds).size, 2);
});

test("saves preserve existing custom assets and folder metadata", () => {
  const storage = new MemoryStorage();
  const custom: Vault = {
    assets: [{ id: "custom-art", name: "My artwork", type: "Prop", model: "Custom", src: "/custom.png", width: 32, height: 32 }],
    folders: [{ id: "my-folder", name: "My project", note: "Keep this note", assetIds: ["custom-art"] }],
  };
  storage.setItem(VAULT_KEY, JSON.stringify(custom));
  saveImageToVault(generated, storage);
  const saved = readVault(storage);
  assert.equal(saved.assets.length, 2);
  assert.deepEqual(saved.assets[0], custom.assets[0]);
  assert.deepEqual(saved.folders[0], custom.folders[0]);
});

test("explicitly cleared libraries stay empty on read and do not reseed on save", () => {
  const storage = new MemoryStorage();
  clearVault(storage);
  assert.deepEqual(readVault(storage), { folders: [], assets: [] });
  saveImageToVault(generated, storage);
  assert.equal(readVault(storage).assets.length, 1);
});

test("updates read the latest persisted library, preserving intervening saves", () => {
  const storage = new MemoryStorage();
  const stale = readVault(storage);
  saveImageToVault(generated, storage);
  updateVault((current) => ({ ...current, folders: current.folders.map((folder) => folder.id === stale.folders[0].id ? { ...folder, name: "Renamed" } : folder) }), storage);
  const saved = readVault(storage);
  assert.equal(saved.assets.length, 8);
  assert.equal(saved.folders[0].name, "Renamed");
});

test("restoring missing samples repairs legacy first-save data without replacing generated art", () => {
  const storage = new MemoryStorage();
  clearVault(storage);
  saveImageToVault(generated, storage);
  const original = readVault(storage);
  const restored = restoreSampleAssets(storage);
  assert.equal(restored.assets.length, 8);
  assert.deepEqual(restored.assets[0], original.assets[0]);
  assert.deepEqual(restored.folders[0], original.folders[0]);
  assert.deepEqual(restoreSampleAssets(storage), restored);
});

test("sample restoration retains renamed samples and folder metadata", () => {
  const storage = new MemoryStorage();
  const partial = createInitialVault();
  partial.assets = partial.assets.filter((asset) => asset.id !== "hotpot-portrait");
  partial.assets[0].name = "Custom table name";
  partial.folders[1].name = "My dining set";
  partial.folders[1].assetIds = ["table-portrait", "ingredients-portrait"];
  storage.setItem(VAULT_KEY, JSON.stringify(partial));
  const restored = restoreSampleAssets(storage);
  assert.equal(restored.assets.length, 7);
  assert.equal(restored.assets[0].name, "Custom table name");
  assert.equal(restored.folders[1].name, "My dining set");
  assert.equal(new Set(restored.folders[1].assetIds).size, 3);
});

for (const raw of ["broken json", "null", "{}", '{"folders":[],"assets":[{}]}', '{"folders":[{"id":"x"}],"assets":[]}']) {
  test(`unreadable data is not overwritten: ${raw}`, () => {
    const storage = new MemoryStorage();
    storage.setItem(VAULT_KEY, raw);
    assert.throws(() => saveImageToVault(generated, storage), /left unchanged/);
    assert.equal(storage.getItem(VAULT_KEY), raw);
  });
}

test("quota failures leave the previous library intact and provide recovery guidance", () => {
  const original = JSON.stringify(createInitialVault());
  const storage = {
    getItem: () => original,
    setItem: () => { throw new DOMException("Full", "QuotaExceededError"); },
  };
  assert.throws(() => saveImageToVault(generated, storage), /storage is full.*Download/);
  assert.equal(storage.getItem(), original);
});

test("sample objects are independent between reads", () => {
  const storage = new MemoryStorage();
  const first = readVault(storage);
  first.assets.pop();
  first.folders[0].assetIds.length = 0;
  assert.equal(readVault(storage).assets.length, 7);
  assert.equal(readVault(storage).folders[0].assetIds.length, 3);
});

test("download extensions derive from MIME type, not a base64 URL", () => {
  assert.equal(imageExtension("image/jpeg"), "jpg");
  assert.equal(imageExtension("image/webp"), "webp");
  assert.equal(imageExtension("image/png"), "png");
});

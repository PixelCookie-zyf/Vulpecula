export const VAULT_KEY = "vulpecula-vault-v2";
const VAULT_CHANGED = "vulpecula-vault-changed";

export type VaultAsset = {
  id: string;
  name: string;
  type: string;
  src: string;
  model: string;
  width: number;
  height: number;
};

export type VaultFolder = {
  id: string;
  name: string;
  note: string;
  assetIds: string[];
};

export type Vault = { folders: VaultFolder[]; assets: VaultAsset[] };
type VaultStorage = Pick<Storage, "getItem" | "setItem">;

// One source for the sample library, including saves made before visiting Vault.
export function createInitialVault(): Vault {
  return {
    assets: [
      { id: "hotpot-portrait", name: "Twin-flavor Hotpot", type: "Prop", src: "/assets/hotpot.png", model: "Gemini", width: 304, height: 438 },
      { id: "table-portrait", name: "Round Dining Table", type: "Prop", src: "/assets/table.png", model: "Gemini", width: 320, height: 438 },
      { id: "lantern-portrait", name: "Hanging Lantern", type: "Prop", src: "/assets/lantern-v3.png", model: "Gemini", width: 281, height: 438 },
      { id: "storefront-portrait", name: "Hotpot Restaurant", type: "Environment", src: "/assets/storefront.png", model: "Gemini", width: 316, height: 438 },
      { id: "tea-portrait", name: "Ceramic Tea Set", type: "Prop", src: "/assets/tea-set.png", model: "Gemini", width: 303, height: 432 },
      { id: "ingredients-portrait", name: "Fresh Ingredients", type: "Food", src: "/assets/ingredients.png", model: "Gemini", width: 320, height: 432 },
      { id: "chef-portrait", name: "Restaurant Chef", type: "Character", src: "/assets/chef-v3.png", model: "Gemini", width: 281, height: 432 },
    ],
    folders: [
      { id: "restaurant-world", name: "Restaurant World", note: "Sample collection", assetIds: ["storefront-portrait", "lantern-portrait", "chef-portrait"] },
      { id: "dining-set", name: "Dining Set", note: "Sample collection", assetIds: ["hotpot-portrait", "table-portrait", "ingredients-portrait"] },
      { id: "tea-studies", name: "Tea Studies", note: "Sample collection", assetIds: ["tea-portrait"] },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVault(value: unknown): value is Vault {
  if (!isRecord(value) || !Array.isArray(value.assets) || !Array.isArray(value.folders)) return false;
  return value.assets.every((asset) => isRecord(asset)
    && [asset.id, asset.name, asset.type, asset.src, asset.model].every((field) => typeof field === "string")
    && typeof asset.width === "number" && Number.isFinite(asset.width) && asset.width > 0
    && typeof asset.height === "number" && Number.isFinite(asset.height) && asset.height > 0)
    && value.folders.every((folder) => isRecord(folder)
      && [folder.id, folder.name, folder.note].every((field) => typeof field === "string")
      && Array.isArray(folder.assetIds) && folder.assetIds.every((id) => typeof id === "string"));
}

export function readVault(storage: VaultStorage = window.localStorage): Vault {
  const raw = storage.getItem(VAULT_KEY);
  if (raw === null) return createInitialVault();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Your Vault could not be read. The saved data has been left unchanged.");
  }
  if (!isVault(parsed)) {
    throw new Error("Your Vault has an unsupported format. The saved data has been left unchanged.");
  }
  return parsed;
}

export function writeVault(vault: Vault, storage: VaultStorage = window.localStorage): Vault {
  try {
    storage.setItem(VAULT_KEY, JSON.stringify(vault));
  } catch (error) {
    if (error instanceof Error && error.name === "QuotaExceededError") {
      throw new Error("Your Vault storage is full. Download this image, then free up space and try saving again.");
    }
    throw new Error("Your browser could not save the Vault. Check storage permissions and try again.");
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(VAULT_CHANGED));
  return vault;
}

export function updateVault(change: (vault: Vault) => Vault, storage: VaultStorage = window.localStorage): Vault {
  // Read at the time of the action; never persist an older React snapshot on mount.
  return writeVault(change(readVault(storage)), storage);
}

export function clearVault(storage: VaultStorage = window.localStorage): Vault {
  // Missing storage means first visit; an explicit empty library must stay empty.
  return writeVault({ folders: [], assets: [] }, storage);
}

export function restoreSampleAssets(storage: VaultStorage = window.localStorage): Vault {
  return updateVault((vault) => {
    const samples = createInitialVault();
    const existingIds = new Set(vault.assets.map((asset) => asset.id));
    const missingAssets = samples.assets.filter((asset) => !existingIds.has(asset.id));
    const missingIds = new Set(missingAssets.map((asset) => asset.id));
    const folders = vault.folders.map((folder) => ({ ...folder, assetIds: [...folder.assetIds] }));
    for (const sample of samples.folders) {
      const addedIds = sample.assetIds.filter((id) => missingIds.has(id));
      if (!addedIds.length) continue;
      const existing = folders.find((folder) => folder.id === sample.id);
      if (existing) existing.assetIds = [...new Set([...existing.assetIds, ...addedIds])];
      else folders.push({ ...sample, assetIds: addedIds });
    }
    return { ...vault, folders, assets: [...vault.assets, ...missingAssets] };
  }, storage);
}

export function readVaultSummary(): { count: number; bytes: number } {
  const vault = readVault();
  return { count: vault.assets.length, bytes: (window.localStorage.getItem(VAULT_KEY)?.length ?? 0) * 2 };
}

export function subscribeToVault(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === VAULT_KEY || event.key === null) onChange();
  };
  window.addEventListener(VAULT_CHANGED, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(VAULT_CHANGED, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

import { updateVault } from "./vault-store.ts";

export function saveImageToVault(input: {
  name: string;
  type?: string;
  model: string;
  dataUrl: string;
  width: number;
  height: number;
}, storage?: Pick<Storage, "getItem" | "setItem">): void {
  const id = crypto.randomUUID();
  const asset = {
    id,
    name: input.name,
    type: input.type ?? "Generated",
    src: input.dataUrl,
    model: input.model,
    width: input.width,
    height: input.height,
  };
  updateVault((vault) => {
    const generated = vault.folders.find((folder) => folder.id === "generated")
      ?? vault.folders.find((folder) => folder.name === "Generated");
    const folders = generated
      ? vault.folders.map((folder) => folder.id === generated.id
        ? { ...folder, assetIds: [...folder.assetIds, id], note: "Updated just now" }
        : folder)
      : [...vault.folders, { id: "generated", name: "Generated", note: "Updated just now", assetIds: [id] }];
    return { ...vault, folders, assets: [...vault.assets, asset] };
  }, storage);
}

export function imageExtension(mimeType: string): string {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[mimeType] ?? "png";
}

export function measureDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Could not read the generated image."));
    image.src = dataUrl;
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

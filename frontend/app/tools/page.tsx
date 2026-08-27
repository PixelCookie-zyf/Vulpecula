"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Download,
  Eraser,
  FolderPlus,
  Images,
  MousePointerClick,
  RefreshCw,
  Scan,
  Search,
  Shrink,
  Sparkles,
  Upload,
  UserRound,
  Moon,
  Sun,
} from "lucide-react";
import { SegmentedNav } from "../segmented-nav";
import { useAmbientTheme } from "../use-ambient-theme";
import { revealThemeChange } from "../reveal-transition";
import { snapPixels } from "./pixel-snapper";
import { TrayDrawer, useTray } from "../tray-drawer";
import { saveToTray } from "../tray-store";
import { blobToDataUrl, imageExtension, saveImageToVault } from "../vault-save";
import { readVault, type VaultAsset as VaultAssetRef, type VaultFolder as VaultFolderRef } from "../vault-store";

type ToolId = "snap" | "cutout" | "compress";

type SourceImage = {
  name: string;
  url: string;
  imageData: ImageData;
  width: number;
  height: number;
  bytes: number;
};

type ResultImage = {
  url: string;
  blob: Blob;
  bytes: number;
  width: number;
  height: number;
  note: string;
  pixelated?: boolean;
  extension: string;
};


const toolMeta: Array<{ id: ToolId; label: string; icon: typeof Scan }> = [
  { id: "snap", label: "Pixel Snap", icon: Scan },
  { id: "cutout", label: "Cutout", icon: Eraser },
  { id: "compress", label: "Compress", icon: Shrink },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function blobToObjectUrl(canvas: HTMLCanvasElement, type: string, quality?: number) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error("Could not encode the image.");
  return { blob, url: URL.createObjectURL(blob) };
}

function imageDataToCanvas(imageData: ImageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext("2d")!.putImageData(imageData, 0, 0);
  return canvas;
}

function removeBackground(source: ImageData, tolerance: number, pick: { x: number; y: number } | null) {
  const { width: w, height: h, data } = source;
  const out = new Uint8ClampedArray(data);
  const visited = new Uint8Array(w * h);
  const tol = Math.pow(tolerance * 2.2, 2) * 3;
  const stack: Array<{ index: number; ref: [number, number, number] }> = [];

  const matches = (pixelIndex: number, ref: [number, number, number]) => {
    const i = pixelIndex * 4;
    const dr = out[i] - ref[0];
    const dg = out[i + 1] - ref[1];
    const db = out[i + 2] - ref[2];
    return dr * dr + dg * dg + db * db <= tol;
  };

  if (pick) {
    const index = pick.y * w + pick.x;
    stack.push({
      index,
      ref: [out[index * 4], out[index * 4 + 1], out[index * 4 + 2]],
    });
  } else {
    for (let x = 0; x < w; x++) {
      stack.push({ index: x, ref: [out[x * 4], out[x * 4 + 1], out[x * 4 + 2]] });
      const bottom = (h - 1) * w + x;
      stack.push({ index: bottom, ref: [out[bottom * 4], out[bottom * 4 + 1], out[bottom * 4 + 2]] });
    }
    for (let y = 0; y < h; y++) {
      stack.push({ index: y * w, ref: [out[y * w * 4], out[y * w * 4 + 1], out[y * w * 4 + 2]] });
      const right = y * w + w - 1;
      stack.push({ index: right, ref: [out[right * 4], out[right * 4 + 1], out[right * 4 + 2]] });
    }
  }

  while (stack.length > 0) {
    const { index, ref } = stack.pop()!;
    if (visited[index]) continue;
    visited[index] = 1;
    if (!matches(index, ref)) continue;
    out[index * 4 + 3] = 0;
    const x = index % w;
    const y = (index / w) | 0;
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x < w - 1 ? index + 1 : -1,
      y > 0 ? index - w : -1,
      y < h - 1 ? index + w : -1,
    ];
    for (const n of neighbors) {
      if (n >= 0 && !visited[n]) {
        stack.push({ index: n, ref });
      }
    }
  }

  return new ImageData(out, w, h);
}

export default function ToolsPage() {
  const [ambient, setAmbient] = useAmbientTheme();
  const [tool, setTool] = useState<ToolId>("snap");
  const [source, setSource] = useState<SourceImage | null>(null);
  const [result, setResult] = useState<ResultImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const [kColors, setKColors] = useState(16);
  const [pixelSizeMode, setPixelSizeMode] = useState<"auto" | "manual">("auto");
  const [pixelSize, setPixelSize] = useState(8);

  const [tolerance, setTolerance] = useState(24);
  const [pick, setPick] = useState<{ x: number; y: number } | null>(null);
  const [pickMode, setPickMode] = useState(false);

  const [format, setFormat] = useState<"webp" | "jpg" | "png">("webp");
  const [quality, setQuality] = useState(80);

  const [trayOpen, setTrayOpen] = useState(false);
  const { staged: stagedItems, trash: trashItems, refresh: refreshTray } = useTray();
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const [vaultAssets, setVaultAssets] = useState<VaultAssetRef[]>([]);
  const [vaultFolders, setVaultFolders] = useState<VaultFolderRef[]>([]);
  const [pickerFolder, setPickerFolder] = useState<string>("all");
  const [pickerQuery, setPickerQuery] = useState("");
  const [savedToVault, setSavedToVault] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
  }, []);

  const toggleAmbient = (event: React.MouseEvent<HTMLButtonElement>) => {
    const next = ambient === "light" ? "dim" : "light";
    revealThemeChange(() => setAmbient(next), { x: event.clientX, y: event.clientY });
  };

  const saveResultToTray = async () => {
    if (!result || !source) return;
    try {
      await saveToTray({
        name: downloadName,
        blob: result.blob,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
      });
      await refreshTray();
    } catch {
      setError("Could not save to the tray.");
    }
  };

  const loadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("That file is not an image.");
      return;
    }
    setError(null);
    setResult(null);
    setPick(null);
    setPickMode(false);
    setShowOriginal(false);
    setSavedToVault(false);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const url = URL.createObjectURL(file);
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = url;
      setSource({
        name: file.name.replace(/\.[^.]+$/, ""),
        url,
        imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
        width: canvas.width,
        height: canvas.height,
        bytes: file.size,
      });
    } catch {
      setError("Could not read that image.");
    }
  }, []);

  const switchTool = (id: ToolId) => {
    setTool(id);
    setResult(null);
    setError(null);
    setPick(null);
    setPickMode(false);
    setShowOriginal(false);
    setSavedToVault(false);
  };

  const openVaultPicker = () => {
    try {
      const vault = readVault();
      setVaultAssets(vault.assets);
      setVaultFolders(vault.folders);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not read the Vault.");
      return;
    }
    setPickerFolder("all");
    setPickerQuery("");
    setVaultPickerOpen(true);
  };

  const pickerVisibleAssets = vaultAssets.filter((asset) => {
    const inFolder = pickerFolder === "all" || vaultFolders
      .find((folder) => folder.id === pickerFolder)
      ?.assetIds.includes(asset.id);
    const query = pickerQuery.trim().toLowerCase();
    const matches = !query || asset.name.toLowerCase().includes(query) || asset.type.toLowerCase().includes(query);
    return Boolean(inFolder) && matches;
  });

  const loadFromVault = async (asset: VaultAssetRef) => {
    setVaultPickerOpen(false);
    try {
      const res = await fetch(asset.src);
      const blob = await res.blob();
      await loadFile(new File([blob], `${asset.name}.${imageExtension(blob.type)}`, { type: blob.type || "image/png" }));
    } catch {
      setError("Could not load that vault image.");
    }
  };

  const saveResultToVault = async () => {
    if (!result || !source) return;
    try {
      const dataUrl = await blobToDataUrl(result.blob);
      saveImageToVault({
        name: `${source.name}-${tool}`,
        type: "Edited",
        model: "Toolkit",
        dataUrl,
        width: result.width,
        height: result.height,
      });
      setSavedToVault(true);
      window.setTimeout(() => setSavedToVault(false), 2000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save to the Vault.");
    }
  };

  const runTool = async () => {
    if (!source || busy) return;
    setBusy(true);
    setError(null);
    setShowOriginal(false);
    setSavedToVault(false);
    try {
      if (tool === "snap") {
        const snapped = snapPixels(source.imageData, {
          kColors,
          pixelSizeOverride: pixelSizeMode === "manual" ? pixelSize : undefined,
        });
        const canvas = imageDataToCanvas(snapped.imageData);
        const { blob, url } = await blobToObjectUrl(canvas, "image/png");
        if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
        resultUrlRef.current = url;
        setResult({
          url,
          blob,
          bytes: blob.size,
          width: snapped.gridWidth,
          height: snapped.gridHeight,
          note: `Detected grid ${snapped.gridWidth} × ${snapped.gridHeight} · pixel ≈ ${snapped.pixelSize.toFixed(1)} px`,
          pixelated: true,
          extension: "png",
        });
      } else if (tool === "cutout") {
        const cleaned = removeBackground(source.imageData, tolerance, pick);
        const canvas = imageDataToCanvas(cleaned);
        const { blob, url } = await blobToObjectUrl(canvas, "image/png");
        if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
        resultUrlRef.current = url;
        setResult({
          url,
          blob,
          bytes: blob.size,
          width: source.width,
          height: source.height,
          note: pick ? "Removed the connected region you picked." : "Removed the background connected to the edges.",
          extension: "png",
        });
      } else {
        const base = imageDataToCanvas(source.imageData);
        const canvas = document.createElement("canvas");
        canvas.width = source.width;
        canvas.height = source.height;
        const ctx = canvas.getContext("2d")!;
        if (format === "jpg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(base, 0, 0);
        const type = format === "webp" ? "image/webp" : format === "jpg" ? "image/jpeg" : "image/png";
        const { blob, url } = await blobToObjectUrl(canvas, type, quality / 100);
        if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
        resultUrlRef.current = url;
        const saved = Math.max(0, Math.round((1 - blob.size / source.bytes) * 100));
        setResult({
          url,
          blob,
          bytes: blob.size,
          width: source.width,
          height: source.height,
          note: format === "png"
            ? `PNG · lossless · ${saved}% smaller than the original ${formatBytes(source.bytes)}`
            : `${format.toUpperCase()} · quality ${quality}${format === "jpg" ? " · flattened onto white" : ""} · ${saved}% smaller than the original ${formatBytes(source.bytes)}`,
          extension: format,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleStageClick = async (event: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== "cutout" || !pickMode || !source || busy) return;
    const img = event.currentTarget.querySelector("img");
    if (!img) return;
    const imgRect = img.getBoundingClientRect();
    const x = Math.floor(((event.clientX - imgRect.left) / imgRect.width) * source.width);
    const y = Math.floor(((event.clientY - imgRect.top) / imgRect.height) * source.height);
    if (x < 0 || y < 0 || x >= source.width || y >= source.height) return;
    const nextPick = { x, y };
    setPick(nextPick);
    setError(null);
    setBusy(true);
    try {
      const cleaned = removeBackground(source.imageData, tolerance, nextPick);
      const canvas = imageDataToCanvas(cleaned);
      const { blob, url } = await blobToObjectUrl(canvas, "image/png");
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = url;
      setResult({
        url,
        blob,
        bytes: blob.size,
        width: source.width,
        height: source.height,
        note: "Removed the connected region you picked.",
        extension: "png",
      });
      setPickMode(false);
      setShowOriginal(false);
    } catch {
      setError("Could not process that pick.");
    } finally {
      setBusy(false);
    }
  };

  const displayUrl = pickMode || showOriginal || !result ? source?.url : result.url;
  const downloadName = source ? `${source.name}-${tool === "snap" ? "snapped" : tool === "cutout" ? "cutout" : "compressed"}.${result?.extension ?? "png"}` : "asset.png";

  return (
    <main className="vault-scene" data-ambient={ambient}>
      <header className="vault-header">
        <Link className="vault-wordmark" href="/" aria-label="Back to Vulpecula home">
          <ArrowLeft aria-hidden="true" strokeWidth={1.7} />
          <span>Vulpecula</span>
        </Link>

        <SegmentedNav activeHref="/tools" />

        <div className="vault-header-tools">
          <div className="header-cluster">
            <button
              className="cluster-btn cluster-wide"
              type="button"
              aria-label="Staging tray"
              title={`Staging tray · ${stagedItems.length} ${stagedItems.length === 1 ? "item" : "items"}`}
              onClick={() => {
                setTrayOpen(true);
                void refreshTray();
              }}
            >
              <Archive aria-hidden="true" strokeWidth={1.8} />
              {stagedItems.length > 0 && <span>{stagedItems.length}</span>}
            </button>
            <span className="cluster-divider" aria-hidden="true" />
            <Link className="cluster-btn" href="/account" aria-label="Account" title="Account">
              <UserRound aria-hidden="true" strokeWidth={1.8} />
            </Link>
            <span className="cluster-divider" aria-hidden="true" />
            <button
              className="cluster-btn"
              type="button"
              aria-label={ambient === "light" ? "Switch to dark mode" : "Switch to light mode"}
              title={ambient === "light" ? "Dark mode" : "Light mode"}
              onClick={toggleAmbient}
            >
              {ambient === "light"
                ? <Moon aria-hidden="true" strokeWidth={1.8} />
                : <Sun aria-hidden="true" strokeWidth={1.8} />}
            </button>
          </div>
        </div>
      </header>

      <section className="vault-content">
        <div className="vault-title-row">
          <div>
            <span className="vault-eyebrow">ASSET UTILITIES</span>
            <h1>Toolkit</h1>
            <p>Normalize, cut out, and compress game assets—right in your browser.</p>
          </div>
          <div className="tools-title-side">
            {source && (
              <span className="vault-count">
                {source.name} · {source.width} × {source.height} px · {formatBytes(source.bytes)}
              </span>
            )}
          </div>
        </div>

        <div className="tool-tabs" role="tablist" aria-label="Tools">
          {toolMeta.map(({ id, label, icon: Icon }) => (
            <button
              className={tool === id ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={tool === id}
              key={id}
              onClick={() => switchTool(id)}
            >
              <Icon aria-hidden="true" strokeWidth={1.9} />
              {label}
            </button>
          ))}
        </div>

        <div
          className="tool-workspace"
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void loadFile(file);
          }}
        >
          {!source ? (
            <div className="tool-empty">
              <button
                className={`tool-dropzone${dragOver ? " is-dragover" : ""}`}
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload aria-hidden="true" strokeWidth={1.5} />
                <strong>Drop an image here</strong>
                <span>or click to browse — PNG, WebP, JPG</span>
              </button>
              <button className="tool-secondary-button" type="button" onClick={openVaultPicker}>
                <Images aria-hidden="true" strokeWidth={1.8} />
                Pick from Vault
              </button>
            </div>
          ) : (
            <>
              <div
                className={`tool-stage${tool === "cutout" && pickMode ? " is-pickable" : ""}`}
                onClick={handleStageClick}
              >
                {displayUrl && (
                  <img
                    className={[
                      result && !pickMode && !showOriginal && result.pixelated ? "is-pixelated" : "",
                      result && !pickMode && !showOriginal ? "reveal-in" : "",
                    ].filter(Boolean).join(" ")}
                    src={displayUrl}
                    alt={pickMode || showOriginal || !result ? "Original image" : "Processed result"}
                  />
                )}
                {tool === "cutout" && pickMode && (
                  <span className="tool-stage-hint">
                    <MousePointerClick aria-hidden="true" strokeWidth={1.8} />
                    Click the background color to remove it
                  </span>
                )}
              </div>

              <aside className="tool-controls">
                <div className="tool-control-head">
                  <Sparkles aria-hidden="true" strokeWidth={1.7} />
                  <span>{toolMeta.find((t) => t.id === tool)?.label}</span>
                </div>

                {tool === "snap" && (
                  <>
                    <div className="tool-control-group">
                      <div className="tool-slider-row">
                        <label htmlFor="snap-colors">Palette colors</label>
                        <span>{kColors}</span>
                      </div>
                      <input
                        id="snap-colors"
                        type="range"
                        min="2"
                        max="64"
                        value={kColors}
                        onChange={(event) => setKColors(Number(event.target.value))}
                      />
                    </div>
                    <div className="tool-control-group">
                      <div className="tool-slider-row">
                        <label htmlFor="snap-pixel-size">Pixel size</label>
                        <span>{pixelSizeMode === "auto" ? "Auto detect" : `${pixelSize} px`}</span>
                      </div>
                      <div className="tool-segment">
                        <button
                          className={pixelSizeMode === "auto" ? "is-active" : ""}
                          type="button"
                          onClick={() => setPixelSizeMode("auto")}
                        >
                          Auto
                        </button>
                        <button
                          className={pixelSizeMode === "manual" ? "is-active" : ""}
                          type="button"
                          onClick={() => setPixelSizeMode("manual")}
                        >
                          Manual
                        </button>
                      </div>
                      {pixelSizeMode === "manual" && (
                        <input
                          id="snap-pixel-size"
                          type="range"
                          min="2"
                          max="64"
                          value={pixelSize}
                          onChange={(event) => setPixelSize(Number(event.target.value))}
                        />
                      )}
                    </div>
                  </>
                )}

                {tool === "cutout" && (
                  <>
                    <div className="tool-control-group">
                      <div className="tool-slider-row">
                        <label htmlFor="cutout-tolerance">Tolerance</label>
                        <span>{tolerance}</span>
                      </div>
                      <input
                        id="cutout-tolerance"
                        type="range"
                        min="2"
                        max="100"
                        value={tolerance}
                        onChange={(event) => setTolerance(Number(event.target.value))}
                      />
                    </div>
                    <p className="tool-control-hint">
                      {pick
                        ? `Picked point: ${pick.x}, ${pick.y}`
                        : "Auto mode removes everything connected to the edges."}
                    </p>
                    <button
                      className={`tool-secondary-button${pickMode ? " is-picking" : ""}`}
                      type="button"
                      onClick={() => setPickMode((current) => !current)}
                    >
                      <MousePointerClick aria-hidden="true" strokeWidth={1.8} />
                      {pickMode ? "Cancel picking" : "Pick background color"}
                    </button>
                    <button
                      className="tool-secondary-button"
                      type="button"
                      onClick={() => {
                        setPick(null);
                        setPickMode(false);
                        setResult(null);
                      }}
                    >
                      <RefreshCw aria-hidden="true" strokeWidth={1.8} />
                      Reset to auto
                    </button>
                  </>
                )}

                {tool === "compress" && (
                  <>
                    <div className="tool-control-group">
                      <span className="tool-control-label">Format</span>
                      <div className="tool-segment">
                        <button
                          className={format === "webp" ? "is-active" : ""}
                          type="button"
                          onClick={() => setFormat("webp")}
                        >
                          WebP
                        </button>
                        <button
                          className={format === "jpg" ? "is-active" : ""}
                          type="button"
                          onClick={() => setFormat("jpg")}
                        >
                          JPG
                        </button>
                        <button
                          className={format === "png" ? "is-active" : ""}
                          type="button"
                          onClick={() => setFormat("png")}
                        >
                          PNG
                        </button>
                      </div>
                    </div>
                    {format !== "png" && (
                      <div className="tool-control-group">
                        <div className="tool-slider-row">
                          <label htmlFor="compress-quality">Quality</label>
                          <span>{quality}</span>
                        </div>
                        <input
                          id="compress-quality"
                          type="range"
                          min="10"
                          max="100"
                          value={quality}
                          onChange={(event) => setQuality(Number(event.target.value))}
                        />
                      </div>
                    )}
                  </>
                )}

                <button className="tool-run-button" type="button" onClick={runTool} disabled={busy}>
                  {busy ? "Processing…" : tool === "snap" ? "Snap to grid" : tool === "cutout" ? "Remove background" : "Compress"}
                </button>

                {result && (
                  <>
                    <button
                      className="tool-secondary-button"
                      type="button"
                      onMouseDown={() => setShowOriginal(true)}
                      onMouseUp={() => setShowOriginal(false)}
                      onMouseLeave={() => setShowOriginal(false)}
                    >
                      {showOriginal ? "Showing original…" : "Hold to compare"}
                    </button>
                    <button
                      className="tool-secondary-button"
                      type="button"
                      onClick={saveResultToVault}
                    >
                      <FolderPlus aria-hidden="true" strokeWidth={1.8} />
                      {savedToVault ? "Saved to Vault ✓" : "Save to Vault"}
                    </button>
                    <button
                      className="tool-secondary-button"
                      type="button"
                      onClick={saveResultToTray}
                    >
                      <Archive aria-hidden="true" strokeWidth={1.8} />
                      Save to tray
                    </button>
                    <a className="tool-run-button is-download" href={result.url} download={downloadName}>
                      <Download aria-hidden="true" strokeWidth={1.8} />
                      Download {result.extension.toUpperCase()}
                    </a>
                  </>
                )}

                {result && <p className="tool-note">{result.note} · {formatBytes(result.bytes)}</p>}
                {error && <p className="tool-error">{error}</p>}

                <button
                  className="tool-secondary-button tool-new-image"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload aria-hidden="true" strokeWidth={1.8} />
                  Load new image
                </button>
                <button
                  className="tool-secondary-button"
                  type="button"
                  onClick={openVaultPicker}
                >
                  <Images aria-hidden="true" strokeWidth={1.8} />
                  Pick from Vault
                </button>
              </aside>
            </>
          )}
        </div>

        {source && tool === "cutout" && (
          <p className="tool-footnote">
            Tip: use “Pick background color” to click any background pixel directly, or adjust the tolerance and run again.
          </p>
        )}
      </section>

      {vaultPickerOpen && (
        <div className="composer-backdrop" onClick={() => setVaultPickerOpen(false)} role="presentation">
          <section
            className="vault-picker"
            role="dialog"
            aria-modal="true"
            aria-label="Pick an image from the Vault"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="composer-head">
              <div>
                <span>FROM VAULT</span>
                <h2>Pick an image</h2>
              </div>
              <button type="button" onClick={() => setVaultPickerOpen(false)} aria-label="Close">
                ×
              </button>
            </header>
            <label className="vault-picker-search">
              <Search aria-hidden="true" strokeWidth={1.7} />
              <input
                type="search"
                value={pickerQuery}
                onChange={(event) => setPickerQuery(event.target.value)}
                placeholder="Search by name or type…"
                aria-label="Search vault images"
              />
            </label>
            {vaultFolders.length > 0 && (
              <div className="vault-picker-tabs" role="tablist" aria-label="Vault folders">
                <button
                  className={pickerFolder === "all" ? "is-active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={pickerFolder === "all"}
                  onClick={() => setPickerFolder("all")}
                >
                  All ({vaultAssets.length})
                </button>
                {vaultFolders.map((folder) => (
                  <button
                    className={pickerFolder === folder.id ? "is-active" : ""}
                    type="button"
                    role="tab"
                    aria-selected={pickerFolder === folder.id}
                    key={folder.id}
                    onClick={() => setPickerFolder(folder.id)}
                  >
                    {folder.name} ({folder.assetIds.length})
                  </button>
                ))}
              </div>
            )}
            {pickerVisibleAssets.length === 0 ? (
              <p className="tool-note" style={{ marginTop: 18 }}>
                {vaultAssets.length === 0
                  ? "Your Vault is empty—generate or save something first."
                  : "No images match this folder or search."}
              </p>
            ) : (
              <div className="vault-picker-grid">
                {pickerVisibleAssets.map((asset) => (
                  <button className="vault-picker-item" type="button" key={asset.id} onClick={() => void loadFromVault(asset)}>
                    <span className="vault-picker-thumb">
                      <img src={asset.src} alt={asset.name} />
                    </span>
                    <strong>{asset.name}</strong>
                    <small>{asset.width} × {asset.height}</small>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <TrayDrawer
        open={trayOpen}
        onClose={() => setTrayOpen(false)}
        staged={stagedItems}
        trash={trashItems}
        refresh={refreshTray}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void loadFile(file);
          event.target.value = "";
        }}
      />
    </main>
  );
}

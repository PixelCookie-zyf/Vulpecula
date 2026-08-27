"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Archive,
  ArrowUp,
  Check,
  ChevronDown,
  ImagePlus,
  Moon,
  Palette,
  Scaling,
  Sun,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SegmentedNav } from "./segmented-nav";
import { TrayDrawer, useTray } from "./tray-drawer";
import { useAmbientTheme } from "./use-ambient-theme";
import { revealThemeChange } from "./reveal-transition";
import { composeStyledPrompt, defaultStylePresets, readStylePresets, type StylePreset } from "./style-presets";
import { measureDataUrl, saveImageToVault } from "./vault-save";

type GenerationStage = "idle" | "generating" | "done" | "error";

const assetCards = [
  { name: "Twin-flavor Hotpot", type: "PROP", src: "/assets/hotpot.png", prompt: "A twin-flavor hotpot with simmering red spicy and clear mushroom broth in a divided copper pot, 45° isometric view, transparent background" },
  { name: "Round Dining Table", type: "FURNITURE", src: "/assets/table.png", prompt: "A round wooden dining table with four stools, warm wood tones, 45° isometric view, transparent background" },
  { name: "Hanging Lantern", type: "PROP", src: "/assets/lantern-v3.png", prompt: "A red Chinese hanging lantern with golden tassel and warm glow, 45° isometric view, transparent background" },
  { name: "Hotpot Restaurant", type: "ENVIRONMENT", src: "/assets/storefront.png", prompt: "A cozy two-story hotpot restaurant storefront with hanging lanterns and a wooden signboard, 45° isometric view, transparent background" },
  { name: "Ceramic Tea Set", type: "PROP", src: "/assets/tea-set.png", prompt: "A ceramic tea set with teapot and cups on a wooden tray, celadon glaze, 45° isometric view, transparent background" },
  { name: "Fresh Ingredients", type: "FOOD", src: "/assets/ingredients.png", prompt: "A wooden box of fresh hotpot ingredients with sliced meats, mushrooms and vegetables, 45° isometric view, transparent background" },
  { name: "Restaurant Chef", type: "CHARACTER", src: "/assets/chef-v3.png", prompt: "A cheerful chibi restaurant chef character in white uniform giving a thumbs up, 45° isometric view, transparent background" },
];

const headlineCharacters = Array.from("Create Your Constellation!");
const headlineCenter = (headlineCharacters.length - 1) / 2;

const modelOptions = [
  { id: "gemini", name: "Gemini", kind: "Image", icon: "gemini" },
  { id: "flux", name: "FLUX", kind: "Image", icon: "flux" },
  { id: "seedream", name: "Seedream", kind: "Image", icon: "bytedance" },
  { id: "minimax", name: "MiniMax", kind: "Image", icon: "minimax" },
] as const;

const sizeOptions = [
  { id: "square", value: "1024 × 1024", label: "Square" },
  { id: "landscape", value: "1536 × 1024", label: "Landscape" },
  { id: "portrait", value: "1024 × 1536", label: "Portrait" },
] as const;

const ratioOptions = [
  { id: "1:1", label: "Square", width: 1, height: 1 },
  { id: "4:3", label: "Standard", width: 4, height: 3 },
  { id: "3:2", label: "Photo", width: 3, height: 2 },
  { id: "16:9", label: "Wide", width: 16, height: 9 },
  { id: "4:5", label: "Portrait", width: 4, height: 5 },
  { id: "9:16", label: "Story", width: 9, height: 16 },
] as const;

const pixelSizePresets = [32, 64, 128, 256] as const;

const presetPixelRatios: Record<string, string> = { square: "1:1", landscape: "3:2", portrait: "2:3" };

function randomAsset() {
  return assetCards[Math.floor(Math.random() * assetCards.length)];
}

function clampDimension(value: number) {
  return Math.min(4096, Math.max(16, Math.round(value)));
}

export default function Home() {
  const [ambient, setAmbient] = useAmbientTheme();
  const [trayOpen, setTrayOpen] = useState(false);
  const { staged: trayStaged, trash: trayTrash, refresh: refreshTray } = useTray();
  const [composerOpen, setComposerOpen] = useState(false);
  const [stage, setStage] = useState<GenerationStage>("idle");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [savedToVault, setSavedToVault] = useState(false);
  const [savingToVault, setSavingToVault] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [assetPrompt, setAssetPrompt] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<(typeof modelOptions)[number]["id"]>("gemini");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [stylePresets, setStylePresets] = useState<StylePreset[]>(defaultStylePresets);
  const [selectedStyleId, setSelectedStyleId] = useState(defaultStylePresets[0].id);
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [sizeMode, setSizeMode] = useState<"ratio" | "pixels">("ratio");
  const [selectedRatioId, setSelectedRatioId] = useState<(typeof ratioOptions)[number]["id"]>("4:3");
  const [selectedSizeId, setSelectedSizeId] = useState<(typeof sizeOptions)[number]["id"] | "custom">("square");
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [customWidth, setCustomWidth] = useState(1280);
  const [customHeight, setCustomHeight] = useState(960);
  const resizeDrag = useRef<{ pointerId: number; x: number; y: number; width: number; height: number } | null>(null);
  const cardFanRef = useRef<HTMLDivElement | null>(null);
  const generateAbort = useRef<AbortController | null>(null);

  const stageActive = stage === "generating";

  function openAssetComposer(prompt?: string) {
    const source = randomAsset();
    setAssetPrompt(prompt ?? source.prompt);
    generateAbort.current?.abort();
    generateAbort.current = null;
    setStage("idle");
    setGeneratedImage(null);
    setStageError(null);
    setSavedToVault(false);
    setSaveError(null);
    setComposerOpen(true);
  }

  useEffect(() => {
    queueMicrotask(() => {
      setStylePresets(readStylePresets());
      try {
        const raw = window.localStorage.getItem("vulpecula-prefs");
        if (!raw) return;
        const prefs = JSON.parse(raw) as { model?: string; ratio?: string };
        const modelId = prefs.model === "seedance" ? "seedream" : prefs.model;
        if (modelOptions.some((model) => model.id === modelId)) {
          setSelectedModelId(modelId as (typeof modelOptions)[number]["id"]);
        }
        if (ratioOptions.some((ratio) => ratio.id === prefs.ratio)) {
          setSelectedRatioId(prefs.ratio as (typeof ratioOptions)[number]["id"]);
        }
      } catch {}
    });
  }, []);

  const selectedModel = modelOptions.find((model) => model.id === selectedModelId) ?? modelOptions[0];
  const selectedStyle = stylePresets.find((style) => style.id === selectedStyleId) ?? stylePresets[0] ?? null;
  const selectedRatio = ratioOptions.find((ratio) => ratio.id === selectedRatioId) ?? ratioOptions[0];
  const selectedSize = sizeOptions.find((size) => size.id === selectedSizeId) ?? sizeOptions[0];
  const selectedSizeValue = sizeMode === "ratio"
    ? selectedRatio.id
    : selectedSizeId === "custom"
      ? `${customWidth} × ${customHeight}`
      : selectedSize.value;
  const customPreviewScale = Math.min(166 / customWidth, 94 / customHeight);
  const customPreviewWidth = Math.round(customWidth * customPreviewScale);
  const customPreviewHeight = Math.round(customHeight * customPreviewScale);

  function submitPrompt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = promptDraft.trim();
    if (!prompt) return;
    openAssetComposer(prompt);
  }

  function closeComposer() {
    generateAbort.current?.abort();
    generateAbort.current = null;
    setStage("idle");
    setComposerOpen(false);
  }

  function assetNameFromPrompt(prompt: string) {
    const stem = prompt.split(/[,,.。]/)[0]?.trim().slice(0, 42) ?? "";
    return stem.length >= 4 ? stem : "Generated asset";
  }

  async function saveGeneratedToVault() {
    if (!generatedImage || savedToVault || savingRef.current) return;
    savingRef.current = true;
    setSavingToVault(true);
    setSaveError(null);
    try {
      const size = await measureDataUrl(generatedImage);
      saveImageToVault({
        name: assetNameFromPrompt(assetPrompt),
        model: selectedModel.name,
        dataUrl: generatedImage,
        width: size.width,
        height: size.height,
      });
      setSavedToVault(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save to the Vault.");
    } finally {
      savingRef.current = false;
      setSavingToVault(false);
    }
  }

  async function runGeneration() {
    if (stageActive) return;
    const prompt = assetPrompt.trim();
    if (!prompt) return;
    generateAbort.current?.abort();
    const controller = new AbortController();
    generateAbort.current = controller;
    setGeneratedImage(null);
    setSavedToVault(false);
    setStageError(null);
    setStage("generating");
    setSaveError(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: selectedModelId,
          prompt: composeStyledPrompt(prompt, selectedStyle),
          aspectRatio: sizeMode === "ratio"
            ? selectedRatio.id
            : presetPixelRatios[selectedSizeId],
          width: sizeMode === "pixels" && selectedSizeId === "custom" ? customWidth : undefined,
          height: sizeMode === "pixels" && selectedSizeId === "custom" ? customHeight : undefined,
        }),
      });
      const payload = (await response.json()) as { image?: string; error?: string };
      if (!response.ok || !payload.image) {
        throw new Error(payload.error ?? `Generation failed (${response.status}).`);
      }
      setGeneratedImage(payload.image);
      setStage("done");
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setStage("idle");
        return;
      }
      setStageError((error as Error).message || "Generation failed.");
      setStage("error");
    } finally {
      if (generateAbort.current === controller) generateAbort.current = null;
    }
  }

  function toggleAmbient(event: React.MouseEvent<HTMLButtonElement>) {
    const next = ambient === "light" ? "dim" : "light";
    revealThemeChange(() => setAmbient(next), { x: event.clientX, y: event.clientY });
  }

  function handleHeroPointerMove(event: React.PointerEvent<HTMLElement>) {
    const fan = cardFanRef.current;
    if (!fan) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce), (hover: none)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    fan.style.setProperty("--parallax-x", x.toFixed(4));
    fan.style.setProperty("--parallax-y", y.toFixed(4));
  }

  function handleHeroPointerLeave() {
    const fan = cardFanRef.current;
    if (!fan) return;
    fan.style.setProperty("--parallax-x", "0");
    fan.style.setProperty("--parallax-y", "0");
  }

  function startCanvasResize(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeDrag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: customWidth,
      height: customHeight,
    };
  }

  function moveCanvasResize(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = resizeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dragUnit = Math.max(1, Math.round(Math.max(drag.width, drag.height) / 160));
    setCustomWidth(clampDimension(drag.width + (event.clientX - drag.x) * dragUnit));
    setCustomHeight(clampDimension(drag.height + (event.clientY - drag.y) * dragUnit));
  }

  function finishCanvasResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (resizeDrag.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    resizeDrag.current = null;
  }

  return (
    <main className="scene" data-ambient={ambient}>
      <section className="product-window">
        <div className="sky" aria-hidden="true">
          <span className="aurora aurora-a" />
          <span className="aurora aurora-b" />
          <svg className="constellation constellation-fox" viewBox="0 0 360 220" fill="none">
            <polyline points="18,128 46,112 116,114 192,100 226,108 284,74 332,104" />
            <polyline points="46,112 56,78" />
            <polyline points="46,112 78,88" />
            <polyline points="46,112 72,142 92,190" />
            <polyline points="192,100 206,186" />
            <circle cx="18" cy="128" r="2.2" />
            <circle cx="46" cy="112" r="3" />
            <circle cx="56" cy="78" r="2" />
            <circle cx="78" cy="88" r="1.8" />
            <circle cx="72" cy="142" r="2" />
            <circle cx="92" cy="190" r="1.8" />
            <circle cx="116" cy="114" r="2.4" />
            <circle cx="192" cy="100" r="3.2" />
            <circle cx="206" cy="186" r="1.8" />
            <circle cx="226" cy="108" r="2.2" />
            <circle cx="284" cy="74" r="2.6" />
            <circle cx="332" cy="104" r="2" />
          </svg>
          <svg className="constellation constellation-goose" viewBox="0 0 120 70" fill="none">
            <polyline points="8,34 20,30 44,34 72,30" />
            <polyline points="44,34 40,12" />
            <circle cx="8" cy="34" r="2.2" />
            <circle cx="20" cy="30" r="2" />
            <circle cx="44" cy="34" r="2.6" />
            <circle cx="40" cy="12" r="2" />
            <circle cx="72" cy="30" r="2" />
          </svg>
          <i className="star star-1" />
          <i className="star star-2" />
          <i className="star star-3" />
          <i className="star star-4" />
          <i className="star star-5" />
          <i className="star star-6" />
          <i className="star star-7" />
          <i className="star star-8" />
        </div>
        <header className="minimal-header">
          <div className="wordmark" aria-label="Vulpecula">
            <span className="wordmark-name">Vulpecula</span>
          </div>

          <SegmentedNav activeHref="/" />

          <div className="header-tools">
            <div className="header-cluster">
              <button
                className="cluster-btn cluster-wide"
                type="button"
                aria-label="Staging tray"
                title={`Staging tray · ${trayStaged.length} ${trayStaged.length === 1 ? "item" : "items"}`}
                onClick={() => {
                  setTrayOpen(true);
                  void refreshTray();
                }}
              >
                <Archive aria-hidden="true" strokeWidth={1.8} />
                {trayStaged.length > 0 && <span>{trayStaged.length}</span>}
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

        <section className="landing-hero" onPointerMove={handleHeroPointerMove} onPointerLeave={handleHeroPointerLeave}>
          <div className="project-eyebrow">VULPECULA CREATIVE STUDIO</div>
          <h1 aria-label="Create Your Constellation!">
            {headlineCharacters.map((character, index) => {
              const position = (index - headlineCenter) / headlineCenter;
              const curve = Math.pow(Math.abs(position), 2) * 0.22;
              const rotation = position * 4.5;
              const modifier = character === "!"
                ? " headline-punctuation"
                : character === " "
                  ? " headline-space"
                  : "";

              return (
                <span
                  aria-hidden="true"
                  className={`headline-character-wrap${modifier}`}
                  key={`${character}-${index}`}
                  style={{ "--char-index": index } as React.CSSProperties}
                >
                  <span
                    className="headline-character"
                    style={{
                      transform: `translateY(${curve.toFixed(3)}em) rotate(${rotation.toFixed(2)}deg)`,
                    }}
                  >
                    {character === " " ? "\u00A0" : character}
                  </span>
                </span>
              );
            })}
          </h1>

          <div className="card-fan" aria-label="Featured game assets" ref={cardFanRef}>
            {assetCards.map((asset, index) => (
              <button
                className={`asset-art-card card-${index + 1}`}
                type="button"
                key={asset.name}
                aria-label={`View ${asset.name}`}
                onClick={() => openAssetComposer(asset.prompt)}
              >
                <Image
                  src={asset.src}
                  alt={asset.name}
                  width={360}
                  height={500}
                  unoptimized
                />
                <span className="asset-card-label">
                  <small>{asset.type}</small>
                  <strong>{asset.name}</strong>
                  <i aria-hidden="true">↗</i>
                </span>
              </button>
            ))}
          </div>

          <div className="hero-footer">
            <p>Create characters, worlds, and props in one cohesive visual language.</p>
          </div>

          <form className="prompt-composer" onSubmit={submitPrompt}>
            <textarea
              aria-label="Describe the game asset you want to create"
              onChange={(event) => setPromptDraft(event.target.value)}
              placeholder="Describe the asset you want to create…"
              rows={1}
              value={promptDraft}
            />
            <div className="prompt-toolbar">
              <div className="prompt-actions">
                <button className="prompt-reference" type="button" title="Add a reference image">
                  <ImagePlus aria-hidden="true" strokeWidth={1.8} />
                  Reference
                </button>
              </div>
              <div className="prompt-settings">
                <div className="prompt-options">
                  <div
                    className="size-picker"
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setSizeMenuOpen(false);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setSizeMenuOpen(false);
                    }}
                  >
                    <button
                      className="prompt-chip prompt-size"
                      type="button"
                      aria-expanded={sizeMenuOpen}
                      aria-haspopup="dialog"
                      onClick={() => {
                        setSizeMenuOpen((open) => !open);
                        setModelMenuOpen(false);
                      }}
                    >
                      <Scaling aria-hidden="true" strokeWidth={1.7} />
                      {selectedSizeValue}
                      <ChevronDown aria-hidden="true" strokeWidth={1.8} />
                    </button>
                    {sizeMenuOpen && (
                      <div
                        className="selection-menu size-menu"
                        role="dialog"
                        aria-label="Output dimensions"
                      >
                        <div className="dimension-mode-toggle" role="tablist" aria-label="Dimension type">
                          <button
                            className={sizeMode === "ratio" ? "is-active" : ""}
                            type="button"
                            role="tab"
                            aria-selected={sizeMode === "ratio"}
                            onClick={() => setSizeMode("ratio")}
                          >
                            Ratio
                          </button>
                          <button
                            className={sizeMode === "pixels" ? "is-active" : ""}
                            type="button"
                            role="tab"
                            aria-selected={sizeMode === "pixels"}
                            onClick={() => setSizeMode("pixels")}
                          >
                            Pixels
                          </button>
                        </div>

                        {sizeMode === "ratio" ? (
                          <div className="ratio-grid" role="listbox" aria-label="Aspect ratio">
                            {ratioOptions.map((ratio) => (
                              <button
                                className="ratio-option"
                                type="button"
                                role="option"
                                aria-selected={ratio.id === selectedRatioId}
                                key={ratio.id}
                                onClick={() => {
                                  setSelectedRatioId(ratio.id);
                                  setSizeMenuOpen(false);
                                }}
                              >
                                <span className="ratio-preview-frame" aria-hidden="true">
                                  <span style={{ aspectRatio: `${ratio.width} / ${ratio.height}` }} />
                                </span>
                                <strong>{ratio.id}</strong>
                                <small>{ratio.label}</small>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <>
                            {sizeOptions.map((size) => (
                              <button
                                className="selection-option size-option"
                                type="button"
                                aria-pressed={size.id === selectedSizeId}
                                key={size.id}
                                onClick={() => {
                                  setSelectedSizeId(size.id);
                                  setSizeMenuOpen(false);
                                }}
                              >
                                <span className={`size-preview preview-${size.id}`} aria-hidden="true" />
                                <span className="selection-option-copy">
                                  <strong>{size.value}</strong>
                                  <small>{size.label}</small>
                                </span>
                                {size.id === selectedSizeId && <Check aria-hidden="true" strokeWidth={2} />}
                              </button>
                            ))}
                            <button
                              className="selection-option size-option"
                              type="button"
                              aria-pressed={selectedSizeId === "custom"}
                              onClick={() => setSelectedSizeId("custom")}
                            >
                              <span className="custom-size-glyph" aria-hidden="true" />
                              <span className="selection-option-copy">
                                <strong>Custom</strong>
                                <small>{customWidth} × {customHeight}</small>
                              </span>
                              {selectedSizeId === "custom" && <Check aria-hidden="true" strokeWidth={2} />}
                            </button>
                            {selectedSizeId === "custom" && (
                              <div className="custom-size-editor">
                                <div className="pixel-size-presets">
                                  <span>PIXEL</span>
                                  {pixelSizePresets.map((size) => (
                                    <button
                                      className={customWidth === size && customHeight === size ? "is-selected" : ""}
                                      type="button"
                                      key={size}
                                      onClick={() => {
                                        setCustomWidth(size);
                                        setCustomHeight(size);
                                      }}
                                    >
                                      {size}
                                    </button>
                                  ))}
                                </div>
                                <div className="custom-canvas-stage" aria-label="Custom canvas preview">
                                  <div
                                    className={`custom-canvas${Math.max(customWidth, customHeight) <= 256 ? " is-pixel-canvas" : ""}`}
                                    style={{ width: customPreviewWidth, height: customPreviewHeight }}
                                  >
                                    <button
                                      className="canvas-resize-handle"
                                      type="button"
                                      aria-label="Drag to resize the canvas"
                                      onPointerDown={startCanvasResize}
                                      onPointerMove={moveCanvasResize}
                                      onPointerUp={finishCanvasResize}
                                      onPointerCancel={finishCanvasResize}
                                    />
                                  </div>
                                </div>
                                <div className="custom-dimensions">
                                  <label>
                                    <span>W</span>
                                    <input
                                      type="number"
                                      min="16"
                                      max="4096"
                                      step="1"
                                      aria-label="Custom canvas width"
                                      value={customWidth}
                                      onChange={(event) => setCustomWidth(clampDimension(Number(event.target.value)))}
                                    />
                                  </label>
                                  <span aria-hidden="true">×</span>
                                  <label>
                                    <span>H</span>
                                    <input
                                      type="number"
                                      min="16"
                                      max="4096"
                                      step="1"
                                      aria-label="Custom canvas height"
                                      value={customHeight}
                                      onChange={(event) => setCustomHeight(clampDimension(Number(event.target.value)))}
                                    />
                                  </label>
                                </div>
                                <button className="custom-size-done" type="button" onClick={() => setSizeMenuOpen(false)}>
                                  Done
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div
                    className="style-picker"
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setStyleMenuOpen(false);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setStyleMenuOpen(false);
                    }}
                  >
                    <button
                      className="prompt-chip"
                      type="button"
                      aria-expanded={styleMenuOpen}
                      aria-haspopup="listbox"
                      onClick={() => {
                        setStyleMenuOpen((open) => !open);
                        setModelMenuOpen(false);
                      }}
                    >
                      <Palette aria-hidden="true" strokeWidth={1.7} />
                      {selectedStyle?.name ?? "No style"}
                      <ChevronDown aria-hidden="true" strokeWidth={1.8} />
                    </button>
                    {styleMenuOpen && (
                      <div className="selection-menu style-menu" role="listbox" aria-label="Art style">
                        <span className="selection-menu-label">STYLE</span>
                        {stylePresets.length === 0 && (
                          <span className="style-menu-empty">No styles yet — add them in Settings.</span>
                        )}
                        {stylePresets.map((style) => (
                          <button
                            className="selection-option style-option"
                            type="button"
                            role="option"
                            aria-selected={style.id === selectedStyleId}
                            key={style.id}
                            title={style.prompt}
                            onClick={() => {
                              setSelectedStyleId(style.id);
                              setStyleMenuOpen(false);
                            }}
                          >
                            <span className="selection-option-copy">
                              <strong>{style.name}</strong>
                              <small>{style.prompt || "No style fragment — uses your prompt as-is."}</small>
                            </span>
                            {style.id === selectedStyleId && <Check aria-hidden="true" strokeWidth={2} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div
                    className="model-picker"
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setModelMenuOpen(false);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setModelMenuOpen(false);
                    }}
                  >
                    <button
                      className="prompt-model"
                      type="button"
                      aria-expanded={modelMenuOpen}
                      aria-haspopup="listbox"
                      onClick={() => {
                        setModelMenuOpen((open) => !open);
                        setSizeMenuOpen(false);
                      }}
                    >
                      <span className={`model-brand-icon brand-${selectedModel.icon}`} aria-hidden="true" />
                      {selectedModel.name}
                      <ChevronDown aria-hidden="true" strokeWidth={1.8} />
                    </button>
                    {modelMenuOpen && (
                      <div className="selection-menu model-menu" role="listbox" aria-label="Generation model">
                        <span className="selection-menu-label">MODEL</span>
                        {modelOptions.map((model) => (
                          <button
                            className="selection-option model-option"
                            type="button"
                            role="option"
                            aria-selected={model.id === selectedModelId}
                            key={model.id}
                            onClick={() => {
                              setSelectedModelId(model.id);
                              setModelMenuOpen(false);
                            }}
                          >
                            <span className={`model-brand-icon brand-${model.icon}`} aria-hidden="true" />
                            <span className="selection-option-copy">
                              <strong>{model.name}</strong>
                              <small>{model.kind}</small>
                            </span>
                            {model.id === selectedModelId && <Check aria-hidden="true" strokeWidth={2} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  className="prompt-send"
                  type="submit"
                  aria-label="Continue with this prompt"
                  disabled={!promptDraft.trim()}
                >
                  <ArrowUp aria-hidden="true" strokeWidth={2} />
                </button>
              </div>
            </div>
          </form>
        </section>
      </section>

      {composerOpen && (
        <div className="composer-backdrop" onClick={closeComposer} role="presentation">
          <section
            className="composer"
            role="dialog"
            aria-modal="true"
            aria-label="Create a new game asset"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="composer-head">
              <div>
                <span>NEW ASSET</span>
                <h2>Create a new game asset</h2>
              </div>
              <button
                type="button"
                onClick={closeComposer}
                aria-label={stageActive ? "Cancel generation" : "Close"}
              >
                ×
              </button>
            </div>
            <div className="composer-canvas" data-stage={stage}>
              {stage === "done" && generatedImage && (
                <img className="composer-canvas-result" src={generatedImage} alt="Generated asset" />
              )}
              {stage === "generating" && (
                <div className="composer-materialize" aria-hidden="true">
                  <div className="composer-materialize-grid">
                    {Array.from({ length: 72 }, (_, index) => (
                      <i key={index} />
                    ))}
                  </div>
                  <span className="composer-scanline" />
                  <div className="composer-dots"><i /><i /><i /></div>
                </div>
              )}
              {stage === "error" && (
                <div className="composer-canvas-hint composer-canvas-error">
                  <span className="composer-canvas-glyph" aria-hidden="true" />
                  <small>{stageError}</small>
                </div>
              )}
              {stage === "idle" && (
                <div className="composer-canvas-hint" aria-hidden="true">
                  <span className="composer-canvas-glyph" />
                  <small>Your asset will appear here</small>
                </div>
              )}
            </div>
            <textarea
              aria-label="Asset description"
              onChange={(event) => setAssetPrompt(event.target.value)}
              value={assetPrompt}
            />
            <div className="reference-row">
              <span>{selectedStyle?.name ?? "No style"}</span>
              <span>{selectedModel.name}</span>
              <span>{selectedSizeValue}</span>
            </div>
            <div className="composer-bottom">
              <p aria-live="polite">
                {stage === "done"
                  ? saveError ?? (savedToVault
                    ? <><i /> Saved to your Vault.</>
                    : "Ready — save it to your Vault or generate again.")
                  : stage === "error"
                    ? stageError
                    : stage === "generating"
                      ? `Generating with ${selectedModel.name}…`
                      : `${selectedModel.name} · ${selectedSizeValue}`}
              </p>
              <div className="composer-bottom-actions">
                {stage === "done" && !savedToVault && generatedImage && (
                  <button className="composer-save" type="button" disabled={savingToVault} onClick={() => { void saveGeneratedToVault(); }}>
                    {savingToVault ? "Saving…" : "Save to Vault"}
                  </button>
                )}
                {stage === "done" && generatedImage && (
                  <a className="composer-download" href={generatedImage} download={`${assetNameFromPrompt(assetPrompt)}.${generatedImage.startsWith("data:image/jpeg") ? "jpg" : "png"}`}>Download</a>
                )}
                <button type="button" onClick={() => { void runGeneration(); }} disabled={stageActive || savingToVault}>
                  {stageActive
                    ? "Generating…"
                    : stage === "done"
                      ? "Generate again"
                      : stage === "error"
                        ? "Try again"
                        : `Generate with ${selectedModel.name}`}
                </button>
              </div>
            </div>
            {stageActive && (
              <div className="composer-progress"><span /></div>
            )}
          </section>
        </div>
      )}
      <TrayDrawer
        open={trayOpen}
        onClose={() => setTrayOpen(false)}
        staged={trayStaged}
        trash={trayTrash}
        refresh={refreshTray}
      />
    </main>
  );
}

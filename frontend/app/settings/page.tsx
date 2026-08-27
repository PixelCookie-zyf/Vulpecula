"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Moon,
  Sun,
  UserRound,
} from "lucide-react";
import { SegmentedNav } from "../segmented-nav";
import { useAmbientTheme } from "../use-ambient-theme";
import { revealThemeChange } from "../reveal-transition";
import { useTray } from "../tray-drawer";
import { defaultStylePresets, readStylePresets, writeStylePresets, type StylePreset } from "../style-presets";
import { clearVault, readVaultSummary, restoreSampleAssets, subscribeToVault } from "../vault-store";

const PREFS_KEY = "vulpecula-prefs";
const modelOptions = ["gemini", "flux", "seedream", "minimax"] as const;
const ratioOptions = ["1:1", "4:3", "3:2", "16:9", "4:5", "9:16"] as const;

type Prefs = { model: (typeof modelOptions)[number]; ratio: (typeof ratioOptions)[number] };

function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { model: "gemini", ratio: "4:3" };
    const parsed = JSON.parse(raw) as { model?: string; ratio?: string };
    if (parsed.model === "seedance") parsed.model = "seedream";
    return {
      model: modelOptions.includes(parsed.model as (typeof modelOptions)[number])
        ? (parsed.model as Prefs["model"])
        : "gemini",
      ratio: ratioOptions.includes(parsed.ratio as (typeof ratioOptions)[number])
        ? (parsed.ratio as Prefs["ratio"])
        : "4:3",
    };
  } catch {
    return { model: "gemini", ratio: "4:3" };
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function SettingsPage() {
  const [ambient, setAmbient] = useAmbientTheme();
  const { staged, trash, refresh } = useTray();
  const [prefs, setPrefs] = useState<Prefs>({ model: "gemini", ratio: "4:3" });
  const [vaultCount, setVaultCount] = useState(0);
  const [vaultBytes, setVaultBytes] = useState(0);
  const [styles, setStyles] = useState<StylePreset[]>(defaultStylePresets);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refreshVault = () => {
      if (cancelled) return;
      try {
        const summary = readVaultSummary();
        setVaultCount(summary.count);
        setVaultBytes(summary.bytes);
        setStorageError(null);
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : "Could not read the Vault.");
      }
    };
    queueMicrotask(() => {
      if (cancelled) return;
      setPrefs(readPrefs());
      setStyles(readStylePresets());
      refreshVault();
    });
    const unsubscribe = subscribeToVault(refreshVault);
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  const toggleAmbient = (event: React.MouseEvent<HTMLButtonElement>) => {
    const next = ambient === "light" ? "dim" : "light";
    revealThemeChange(() => setAmbient(next), { x: event.clientX, y: event.clientY });
  };

  const updatePrefs = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {}
  };

  const commitStyles = (next: StylePreset[]) => {
    setStyles(next);
    writeStylePresets(next);
  };

  const updateStyle = (id: string, patch: Partial<StylePreset>) => {
    commitStyles(styles.map((style) => (style.id === id ? { ...style, ...patch } : style)));
  };

  const trayBytes = [...staged, ...trash].reduce((sum, item) => sum + item.bytes, 0);

  return (
    <main className="vault-scene" data-ambient={ambient}>
      <header className="vault-header">
        <Link className="vault-wordmark" href="/" aria-label="Back to Vulpecula home">
          <ArrowLeft aria-hidden="true" strokeWidth={1.7} />
          <span>Vulpecula</span>
        </Link>

        <SegmentedNav activeHref="/settings" />

        <div className="vault-header-tools">
          <div className="header-cluster">
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
            <span className="vault-eyebrow">SETTINGS</span>
            <h1>Settings</h1>
            <p>Appearance, defaults, and your local data.</p>
          </div>
        </div>

        <section className="settings-section">
          <header>
            <h2>Appearance</h2>
            <p>Choose how Vulpecula looks on this device.</p>
          </header>
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Theme</strong>
              <small>Switch anytime from the header button too.</small>
            </div>
            <div className="tool-segment settings-segment">
              <button
                className={ambient === "light" ? "is-active" : ""}
                type="button"
                onClick={() => setAmbient("light")}
              >
                Light
              </button>
              <button
                className={ambient === "dim" ? "is-active" : ""}
                type="button"
                onClick={() => setAmbient("dim")}
              >
                Dark
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <header>
            <h2>Generation defaults</h2>
            <p>Pre-filled every time you open the composer.</p>
          </header>
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Default model</strong>
              <small>Used when the composer opens.</small>
            </div>
            <div className="tool-segment settings-segment">
              {modelOptions.map((model) => (
                <button
                  className={prefs.model === model ? "is-active" : ""}
                  type="button"
                  key={model}
                  onClick={() => updatePrefs({ model })}
                >
                  {model === "seedream" ? "Seedream" : model === "minimax" ? "MiniMax" : model === "flux" ? "FLUX" : "Gemini"}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Default ratio</strong>
              <small>Applied to the size picker on open.</small>
            </div>
            <div className="tool-segment settings-segment">
              {ratioOptions.map((ratio) => (
                <button
                  className={prefs.ratio === ratio ? "is-active" : ""}
                  type="button"
                  key={ratio}
                  onClick={() => updatePrefs({ ratio })}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <header>
            <h2>Style presets</h2>
            <p>Type a short idea — the style appends this art direction to every generation. Edit them freely.</p>
          </header>
          <div className="style-editor-list">
            {styles.map((style) => (
              <article className="style-editor-row" key={style.id}>
                <input
                  className="style-editor-name"
                  type="text"
                  value={style.name}
                  maxLength={40}
                  placeholder="Style name"
                  aria-label="Style name"
                  onChange={(event) => updateStyle(style.id, { name: event.target.value })}
                />
                <textarea
                  className="style-editor-prompt"
                  value={style.prompt}
                  rows={2}
                  maxLength={600}
                  placeholder="Prompt fragment appended to every generation (leave empty to pass your prompt through unchanged)"
                  aria-label="Style prompt fragment"
                  onChange={(event) => updateStyle(style.id, { prompt: event.target.value })}
                />
                <button
                  className="style-editor-remove"
                  type="button"
                  aria-label={`Delete ${style.name || "style"}`}
                  title="Delete style"
                  onClick={() => commitStyles(styles.filter((entry) => entry.id !== style.id))}
                >
                  ×
                </button>
              </article>
            ))}
            {styles.length === 0 && (
              <p className="style-editor-empty">No styles — generations will use your prompt as-is.</p>
            )}
          </div>
          <div className="style-editor-foot">
            <button
              className="tool-secondary-button"
              type="button"
              onClick={() =>
                commitStyles([
                  ...styles,
                  { id: crypto.randomUUID(), name: "New style", hint: "", prompt: "" },
                ])
              }
            >
              Add style
            </button>
            <button
              className="tool-secondary-button"
              type="button"
              onClick={() => {
                if (styles.length === 0 || window.confirm("Restore the default styles? Your edits will be replaced.")) {
                  commitStyles(defaultStylePresets);
                }
              }}
            >
              Restore defaults
            </button>
          </div>
        </section>

        <section className="settings-section">
          <header>
            <h2>Data &amp; storage</h2>
            <p>Your library and edits stay in this browser. Generation prompts are sent to the selected AI provider.</p>
          </header>
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Vault library</strong>
              <small>{vaultCount} {vaultCount === 1 ? "image" : "images"} · {formatBytes(vaultBytes)} in local storage</small>
            </div>
            <button
              className="tool-secondary-button is-danger-soft"
              type="button"
              onClick={() => {
                if (!window.confirm("Clear the entire vault library? This cannot be undone.")) return;
                try {
                  clearVault();
                } catch (error) {
                  setStorageError(error instanceof Error ? error.message : "Could not clear the Vault.");
                }
              }}
            >
              Clear vault
            </button>
          </div>
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Sample library</strong>
              <small>Restore the seven starter assets without replacing your saved images.</small>
            </div>
            <button className="tool-secondary-button" type="button" onClick={() => {
              try {
                restoreSampleAssets();
              } catch (error) {
                setStorageError(error instanceof Error ? error.message : "Could not restore sample assets.");
              }
            }}>Restore sample assets</button>
          </div>
          {storageError && <p className="storage-error" role="alert">{storageError}</p>}
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Staging tray</strong>
              <small>{staged.length} staged · {trash.length} in trash · {formatBytes(trayBytes)} in browser storage</small>
            </div>
            <button
              className="tool-secondary-button is-danger-soft"
              type="button"
              onClick={() => {
                if (!window.confirm("Empty the trash now? Staged items are kept.")) return;
                void (async () => {
                  const { emptyTrash } = await import("../tray-store");
                  await emptyTrash();
                  await refresh();
                })();
              }}
            >
              Empty trash
            </button>
          </div>
        </section>

        <section className="settings-section">
          <header>
            <h2>About</h2>
          </header>
          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Vulpecula</strong>
              <small>v0.1.0 · Personal AI image workspace</small>
            </div>
            <span className="plan-badge">BYOK</span>
          </div>
        </section>
      </section>
    </main>
  );
}

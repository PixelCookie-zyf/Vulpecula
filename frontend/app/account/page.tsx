"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Archive,
  Images,
  Moon,
  Settings,
  Sun,
  UserRound,
} from "lucide-react";
import { SegmentedNav } from "../segmented-nav";
import { useAmbientTheme } from "../use-ambient-theme";
import { revealThemeChange } from "../reveal-transition";
import { useTray } from "../tray-drawer";
import { readVaultSummary, subscribeToVault } from "../vault-store";

type VaultSnapshot = { count: number; bytes: number };

function readVaultSnapshot(): VaultSnapshot {
  try {
    return readVaultSummary();
  } catch {
    return { count: 0, bytes: 0 };
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AccountPage() {
  const [ambient, setAmbient] = useAmbientTheme();
  const { staged, trash } = useTray();
  const [vault, setVault] = useState<VaultSnapshot>({ count: 0, bytes: 0 });

  useEffect(() => {
    let cancelled = false;
    const refresh = () => { if (!cancelled) setVault(readVaultSnapshot()); };
    queueMicrotask(refresh);
    const unsubscribe = subscribeToVault(refresh);
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  const toggleAmbient = (event: React.MouseEvent<HTMLButtonElement>) => {
    const next = ambient === "light" ? "dim" : "light";
    revealThemeChange(() => setAmbient(next), { x: event.clientX, y: event.clientY });
  };

  const trayBytes = [...staged, ...trash].reduce((sum, item) => sum + item.bytes, 0);

  const stats = [
    { label: "VAULT IMAGES", value: String(vault.count), hint: formatBytes(vault.bytes) },
    { label: "STAGED IN TRAY", value: String(staged.length), hint: "kept 30 days" },
    { label: "IN TRASH", value: String(trash.length), hint: "emptied after 15 days" },
    { label: "TRAY STORAGE", value: formatBytes(trayBytes), hint: "browser local" },
  ];

  const links = [
    { href: "/settings", label: "Settings", hint: "Theme, defaults, and local data", icon: Settings },
    { href: "/vault", label: "Vault", hint: "Every world, character, and prop", icon: Images },
    { href: "/tools", label: "Toolkit", hint: "Snap, cut out, and compress", icon: Archive },
  ];

  return (
    <main className="vault-scene" data-ambient={ambient}>
      <header className="vault-header">
        <Link className="vault-wordmark" href="/" aria-label="Back to Vulpecula home">
          <ArrowLeft aria-hidden="true" strokeWidth={1.7} />
          <span>Vulpecula</span>
        </Link>

        <SegmentedNav activeHref="/account" />

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
            <span className="vault-eyebrow">ACCOUNT</span>
            <h1>Your workspace</h1>
            <p>Your local library, storage, and shortcuts.</p>
          </div>
          <span className="vault-count">Local workspace</span>
        </div>

        <section className="profile-card">
          <span className="profile-avatar" aria-hidden="true">
            <UserRound strokeWidth={1.6} />
          </span>
          <div className="profile-copy">
            <strong>Vulpecula Artist</strong>
            <small>On this browser · Your own API keys</small>
          </div>
          <span className="plan-badge">BYOK</span>
        </section>

        <div className="stat-grid">
          {stats.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.hint}</small>
            </article>
          ))}
        </div>

        <div className="link-card-grid">
          {links.map(({ href, label, hint, icon: Icon }) => (
            <Link className="link-card" href={href} key={href}>
              <span className="link-card-icon"><Icon aria-hidden="true" strokeWidth={1.7} /></span>
              <span className="link-card-copy">
                <strong>{label}</strong>
                <small>{hint}</small>
              </span>
              <i aria-hidden="true">↗</i>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

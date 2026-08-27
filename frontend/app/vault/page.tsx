"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  Check,
  Copy,
  FolderDown,
  FolderOpen,
  Moon,
  MoreHorizontal,
  PencilLine,
  Search,
  Sun,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SegmentedNav } from "../segmented-nav";
import { saveBlobToFolder, TrayDrawer, useTray } from "../tray-drawer";
import { useAmbientTheme } from "../use-ambient-theme";
import { revealThemeChange } from "../reveal-transition";

import { createInitialVault, readVault, subscribeToVault, updateVault, type Vault, type VaultAsset, type VaultFolder } from "../vault-store";
import { imageExtension } from "../vault-save";

type ActiveMenu = {
  kind: "folder" | "asset";
  id: string;
} | null;

export default function VaultPage() {
  const [ambient, setAmbient] = useAmbientTheme();
  const [vault, setVault] = useState<Vault>(createInitialVault);
  const { folders, assets } = vault;
  const [storageError, setStorageError] = useState<string | null>(null);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderNameDraft, setFolderNameDraft] = useState("");
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [assetNameDraft, setAssetNameDraft] = useState("");
  const [masonryColumnCount, setMasonryColumnCount] = useState(4);
  const [pathCopied, setPathCopied] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const { staged: trayStaged, trash: trayTrash, refresh: refreshTray } = useTray();

  const toggleAmbient = (event: React.MouseEvent<HTMLButtonElement>) => {
    const next = ambient === "light" ? "dim" : "light";
    revealThemeChange(() => setAmbient(next), { x: event.clientX, y: event.clientY });
  };

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (cancelled) return;
      try {
        setVault(readVault());
        setStorageError(null);
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : "Could not read the Vault.");
      }
    };
    queueMicrotask(refresh);
    const unsubscribe = subscribeToVault(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const commitVault = (change: (current: Vault) => Vault) => {
    try {
      setVault(updateVault(change));
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Could not save the Vault.");
    }
  };

  useEffect(() => {
    const updateColumnCount = () => {
      if (window.innerWidth < 560) setMasonryColumnCount(1);
      else if (window.innerWidth < 880) setMasonryColumnCount(2);
      else if (window.innerWidth < 1280) setMasonryColumnCount(3);
      else setMasonryColumnCount(4);
    };

    updateColumnCount();
    window.addEventListener("resize", updateColumnCount);
    return () => window.removeEventListener("resize", updateColumnCount);
  }, []);

  useEffect(() => {
    if (!activeMenu) return;
    const closeMenu = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-vault-menu]")) return;
      setActiveMenu(null);
    };
    window.addEventListener("pointerdown", closeMenu);
    return () => window.removeEventListener("pointerdown", closeMenu);
  }, [activeMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setActiveMenu(null);
      setEditingFolderId(null);
      if (selectedAssetId) {
        setSelectedAssetId(null);
        setEditingAssetId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedAssetId]);

  const openFolder = folders.find((folder) => folder.id === openFolderId) ?? null;
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;

  const visibleAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!openFolder) return [];

    return assets.filter((asset) => {
      const belongsToFolder = openFolder.assetIds.includes(asset.id);
      const matchesQuery = !normalizedQuery
        || asset.name.toLowerCase().includes(normalizedQuery)
        || asset.type.toLowerCase().includes(normalizedQuery);
      return belongsToFolder && matchesQuery;
    });
  }, [assets, openFolder, query]);

  const visibleFolders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return folders;
    return folders.filter((folder) => folder.name.toLowerCase().includes(normalizedQuery));
  }, [folders, query]);

  const masonryColumns = useMemo(() => {
    const count = Math.max(1, Math.min(masonryColumnCount, visibleAssets.length));
    const columns = Array.from({ length: count }, () => [] as VaultAsset[]);
    const heights = Array.from({ length: count }, () => 0);

    visibleAssets.forEach((asset) => {
      const shortestColumn = heights.indexOf(Math.min(...heights));
      columns[shortestColumn].push(asset);
      heights[shortestColumn] += asset.height / asset.width + 0.22;
    });

    return columns;
  }, [masonryColumnCount, visibleAssets]);

  const saveFolderName = (folderId: string) => {
    const nextName = folderNameDraft.trim();
    if (nextName) {
      commitVault((current) => ({ ...current, folders: current.folders.map((folder) => (
        folder.id === folderId ? { ...folder, name: nextName, note: "Updated just now" } : folder
      )) }));
    }
    setEditingFolderId(null);
  };

  const deleteFolder = (folder: VaultFolder) => {
    if (!window.confirm(`Delete “${folder.name}” and all images inside it?`)) return;
    commitVault((current) => {
      const assetIds = new Set(current.folders.find((item) => item.id === folder.id)?.assetIds ?? []);
      const remainingFolders = current.folders.filter((item) => item.id !== folder.id);
      const stillReferenced = new Set(remainingFolders.flatMap((item) => item.assetIds));
      return { ...current, folders: remainingFolders, assets: current.assets.filter((asset) => !assetIds.has(asset.id) || stillReferenced.has(asset.id)) };
    });
    if (openFolderId === folder.id) setOpenFolderId(null);
    setActiveMenu(null);
  };

  const startAssetRename = (asset: VaultAsset) => {
    setSelectedAssetId(asset.id);
    setEditingAssetId(asset.id);
    setAssetNameDraft(asset.name);
    setActiveMenu(null);
  };

  const saveAssetName = (assetId: string) => {
    const nextName = assetNameDraft.trim();
    if (nextName) {
      commitVault((current) => ({ ...current, assets: current.assets.map((asset) => (
        asset.id === assetId ? { ...asset, name: nextName } : asset
      )) }));
    }
    setEditingAssetId(null);
  };

  const deleteAsset = (asset: VaultAsset) => {
    if (!window.confirm(`Delete “${asset.name}” from your vault?`)) return;
    commitVault((current) => ({
      ...current,
      assets: current.assets.filter((item) => item.id !== asset.id),
      folders: current.folders.map((folder) => ({
        ...folder,
        assetIds: folder.assetIds.filter((assetId) => assetId !== asset.id),
      })),
    }));
    setSelectedAssetId(null);
    setEditingAssetId(null);
    setActiveMenu(null);
  };

  const copyAssetPath = async () => {
    if (!selectedAsset) return;
    try {
      await navigator.clipboard.writeText(new URL(selectedAsset.src, window.location.origin).href);
      setPathCopied(true);
      window.setTimeout(() => setPathCopied(false), 1500);
    } catch {}
  };

  const saveAssetToFolder = async () => {
    if (!selectedAsset) return;
    try {
      const res = await fetch(selectedAsset.src);
      const blob = await res.blob();
      await saveBlobToFolder(blob, `${selectedAsset.name}.${imageExtension(blob.type)}`);
    } catch {}
  };

  return (
    <main className="vault-scene" data-ambient={ambient}>
      <header className="vault-header">
        <Link className="vault-wordmark" href="/" aria-label="Back to Vulpecula home">
          <ArrowLeft aria-hidden="true" strokeWidth={1.7} />
          <span>Vulpecula</span>
        </Link>

        <SegmentedNav activeHref="/vault" />

        <div className="vault-header-tools">
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

      <section className="vault-content">
        <div className="vault-title-row">
          <div>
            <span className="vault-eyebrow">IMAGE LIBRARY</span>
            <h1>Vault</h1>
            <p>Every world, character, and prop—kept close.</p>
          </div>
          <span className="vault-count">
            {openFolder ? `${visibleAssets.length} assets` : `${folders.length} folders`}
          </span>
        </div>

        <div className="vault-toolbar">
          <label className="vault-search">
            <Search aria-hidden="true" strokeWidth={1.7} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={openFolder ? `Search in ${openFolder.name}` : "Search your vault"}
              aria-label={openFolder ? `Search in ${openFolder.name}` : "Search your vault"}
            />
          </label>

          {openFolder ? (
            <div className="vault-folder-path">
              <button
                type="button"
                onClick={() => {
                  setOpenFolderId(null);
                  setQuery("");
                  setActiveMenu(null);
                }}
              >
                <ArrowLeft aria-hidden="true" strokeWidth={1.7} />
                All folders
              </button>
              <span aria-hidden="true">/</span>
              <strong><FolderOpen aria-hidden="true" strokeWidth={1.7} />{openFolder.name}</strong>
            </div>
          ) : (
            <span className="vault-toolbar-label">YOUR FOLDERS</span>
          )}
        </div>

        {!openFolder && visibleFolders.length > 0 && (
          <div className="vault-folder-grid">
            {visibleFolders.map((folder, folderIndex) => {
              const previewAssets = folder.assetIds
                .slice(0, 4)
                .map((assetId) => assets.find((asset) => asset.id === assetId))
                .filter((asset): asset is VaultAsset => Boolean(asset));

              return (
                <article
                  className={`vault-folder folder-tone-${folderIndex + 1}`}
                  key={folder.id}
                  style={{ "--stagger": Math.min(folderIndex, 7) } as React.CSSProperties}
                >
                  <button
                    className="folder-open-button"
                    type="button"
                    aria-label={`Open ${folder.name}`}
                    onClick={() => {
                      setOpenFolderId(folder.id);
                      setQuery("");
                      setActiveMenu(null);
                    }}
                  >
                    <span className="folder-visual">
                      <span className="folder-tab" />
                      <span className="folder-card-stack">
                        {previewAssets.map((asset, assetIndex) => (
                          <span className={`folder-preview preview-${assetIndex + 1}`} key={asset.id}>
                            <Image src={asset.src} alt="" fill sizes="180px" unoptimized />
                          </span>
                        ))}
                      </span>
                      <span className="folder-front" />
                    </span>
                  </button>

                  <div className="folder-copy">
                    {editingFolderId === folder.id ? (
                      <form
                        className="folder-rename-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          saveFolderName(folder.id);
                        }}
                      >
                        <input
                          autoFocus
                          value={folderNameDraft}
                          onChange={(event) => setFolderNameDraft(event.target.value)}
                          aria-label="Folder name"
                        />
                        <button type="submit" aria-label="Save folder name"><Check aria-hidden="true" /></button>
                        <button type="button" aria-label="Cancel rename" onClick={() => setEditingFolderId(null)}><X aria-hidden="true" /></button>
                      </form>
                    ) : (
                      <span>
                        <strong>{folder.name}</strong>
                        <small>{folder.assetIds.length} {folder.assetIds.length === 1 ? "asset" : "assets"} · {folder.note}</small>
                      </span>
                    )}

                    <div className="vault-menu-wrap" data-vault-menu>
                      <button
                        className="vault-menu-trigger"
                        type="button"
                        aria-label={`Manage ${folder.name}`}
                        aria-expanded={activeMenu?.kind === "folder" && activeMenu.id === folder.id}
                        onClick={() => setActiveMenu((current) => (
                          current?.kind === "folder" && current.id === folder.id
                            ? null
                            : { kind: "folder", id: folder.id }
                        ))}
                      >
                        <MoreHorizontal aria-hidden="true" />
                      </button>
                      {activeMenu?.kind === "folder" && activeMenu.id === folder.id && (
                        <div className="vault-context-menu" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setFolderNameDraft(folder.name);
                              setEditingFolderId(folder.id);
                              setActiveMenu(null);
                            }}
                          >
                            <PencilLine aria-hidden="true" />Rename
                          </button>
                          <button className="is-danger" type="button" role="menuitem" onClick={() => deleteFolder(folder)}>
                            <Trash2 aria-hidden="true" />Delete folder
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {openFolder && visibleAssets.length > 0 && (
          <div
            className="vault-masonry-grid"
            style={{ gridTemplateColumns: `repeat(${masonryColumns.length}, minmax(0, 310px))` }}
            aria-label={`${openFolder.name} assets`}
          >
            {masonryColumns.map((column, columnIndex) => (
              <div className="vault-masonry-column" key={`column-${columnIndex}`}>
                {column.map((asset) => {
                  const imageWidth = Math.min(asset.width, 310);
                  const cardWidth = Math.max(imageWidth, 150);
                  return (
                  <article
                    className="masonry-card"
                    key={asset.id}
                    style={{ width: cardWidth, "--stagger": Math.min(visibleAssets.indexOf(asset), 9) } as React.CSSProperties}
                  >
                    <button className="masonry-card-open" type="button" onClick={() => setSelectedAssetId(asset.id)}>
                      <span
                        className="masonry-card-image"
                        style={{
                          aspectRatio: `${asset.width} / ${asset.height}`,
                          width: imageWidth < cardWidth ? imageWidth : "100%",
                          marginInline: imageWidth < cardWidth ? "auto" : undefined,
                        }}
                      >
                        <Image src={asset.src} alt="" fill sizes="(max-width: 700px) 50vw, 25vw" unoptimized />
                      </span>
                      <span className="masonry-card-copy">
                        <span>
                          <small>{asset.type}</small>
                          <strong>{asset.name}</strong>
                          <em>{asset.width} × {asset.height} px</em>
                        </span>
                        <i aria-hidden="true">↗</i>
                      </span>
                    </button>

                    <div className="asset-menu-wrap" data-vault-menu>
                      <button
                        className="asset-menu-trigger"
                        type="button"
                        aria-label={`Manage ${asset.name}`}
                        aria-expanded={activeMenu?.kind === "asset" && activeMenu.id === asset.id}
                        onClick={() => setActiveMenu((current) => (
                          current?.kind === "asset" && current.id === asset.id
                            ? null
                            : { kind: "asset", id: asset.id }
                        ))}
                      >
                        <MoreHorizontal aria-hidden="true" />
                      </button>
                      {activeMenu?.kind === "asset" && activeMenu.id === asset.id && (
                        <div className="vault-context-menu asset-context-menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => startAssetRename(asset)}>
                            <PencilLine aria-hidden="true" />Rename
                          </button>
                          <button className="is-danger" type="button" role="menuitem" onClick={() => deleteAsset(asset)}>
                            <Trash2 aria-hidden="true" />Delete image
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {((!openFolder && visibleFolders.length === 0) || (openFolder && visibleAssets.length === 0)) && (
          <div className="vault-empty">
            <strong>{openFolder ? "No images here" : "No folders found"}</strong>
            <span>{query ? "Try another search." : "This folder is empty."}</span>
          </div>
        )}
        {storageError && <p className="storage-error" role="alert">{storageError}</p>}
      </section>

      {selectedAsset && (
        <div className="vault-preview-backdrop" role="presentation" onMouseDown={() => {
          setSelectedAssetId(null);
          setEditingAssetId(null);
        }}>
          <section
            className="vault-preview"
            role="dialog"
            aria-modal="true"
            aria-label={selectedAsset.name}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="vault-preview-close"
              type="button"
              aria-label="Close preview"
              onClick={() => {
                setSelectedAssetId(null);
                setEditingAssetId(null);
              }}
            >
              <X aria-hidden="true" strokeWidth={1.8} />
            </button>

            <div className="vault-preview-image">
              <div className="vault-preview-image-frame">
                <div
                  className={`vault-preview-image-art ${selectedAsset.height >= selectedAsset.width ? "is-portrait" : "is-landscape"}`}
                  style={{
                    aspectRatio: `${selectedAsset.width} / ${selectedAsset.height}`,
                    ...(selectedAsset.height >= selectedAsset.width
                      ? { height: `min(100%, ${selectedAsset.height}px)` }
                      : { width: `min(100%, ${selectedAsset.width}px)` }),
                  }}
                >
                  <Image
                    className="vault-preview-image-element"
                    src={selectedAsset.src}
                    alt={selectedAsset.name}
                    fill
                    sizes="65vw"
                    unoptimized
                  />
                </div>
              </div>
            </div>

            <div className="vault-preview-copy">
              <span>{selectedAsset.type}</span>
              {editingAssetId === selectedAsset.id ? (
                <form
                  className="asset-rename-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveAssetName(selectedAsset.id);
                  }}
                >
                  <input
                    autoFocus
                    value={assetNameDraft}
                    onChange={(event) => setAssetNameDraft(event.target.value)}
                    aria-label="Image name"
                  />
                  <button type="submit" aria-label="Save image name"><Check aria-hidden="true" /></button>
                  <button type="button" aria-label="Cancel rename" onClick={() => setEditingAssetId(null)}><X aria-hidden="true" /></button>
                </form>
              ) : (
                <div className="vault-preview-title">
                  <h2>{selectedAsset.name}</h2>
                </div>
              )}

              <dl>
                <div><dt>Model</dt><dd>{selectedAsset.model}</dd></div>
                <div><dt>Dimensions</dt><dd>{selectedAsset.width} × {selectedAsset.height} px</dd></div>
                <div><dt>Created</dt><dd>Today</dd></div>
              </dl>

              <div className="vault-preview-actions">
                <button type="button" onClick={copyAssetPath}>
                  {pathCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {pathCopied ? "Copied" : "Copy path"}
                </button>
                <button type="button" onClick={() => { void saveAssetToFolder(); }}>
                  <FolderDown aria-hidden="true" />
                  Save to folder
                </button>
                <button type="button" onClick={() => startAssetRename(selectedAsset)}>
                  <PencilLine aria-hidden="true" />Rename
                </button>
                <button className="is-danger" type="button" onClick={() => deleteAsset(selectedAsset)}>
                  <Trash2 aria-hidden="true" />Delete
                </button>
              </div>
            </div>
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

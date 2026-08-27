"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, Check, Copy, Download, FolderDown, Trash2 } from "lucide-react";
import {
  STAGED_DAYS,
  TRASH_DAYS,
  daysLeft,
  emptyTrash,
  listTray,
  removeForever,
  restoreItem,
  trashItem,
  type TrayItem,
} from "./tray-store";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function useTray() {
  const [staged, setStaged] = useState<TrayItem[]>([]);
  const [trash, setTrash] = useState<TrayItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      const lists = await listTray();
      setStaged(lists.staged);
      setTrash(lists.trash);
    } catch {}
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  return { staged, trash, refresh };
}

function downloadItem(item: TrayItem) {
  const url = URL.createObjectURL(item.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = item.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type SavePicker = (options?: {
  suggestedName?: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;

export async function saveBlobToFolder(blob: Blob, suggestedName: string): Promise<void> {
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (!picker) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = suggestedName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  try {
    const handle = await picker({ suggestedName });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch {}
}

async function saveItemToFolder(item: TrayItem) {
  await saveBlobToFolder(item.blob, item.name);
}

async function copyItemToClipboard(item: TrayItem) {
  try {
    const bitmap = await createImageBitmap(item.blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (png) await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  } catch {}
}

function TrayThumb({ item }: { item: TrayItem }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(item.blob);
    queueMicrotask(() => setUrl(objectUrl));
    return () => URL.revokeObjectURL(objectUrl);
  }, [item.blob]);
  return (
    <span className="tray-thumb">
      {url && <img src={url} alt={item.name} />}
    </span>
  );
}

export function TrayDrawer({
  open,
  onClose,
  staged,
  trash,
  refresh,
}: {
  open: boolean;
  onClose: () => void;
  staged: TrayItem[];
  trash: TrayItem[];
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"staged" | "trash">("staged");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyItem = async (item: TrayItem) => {
    await copyItemToClipboard(item);
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 1500);
  };

  useEffect(() => {
    if (open) queueMicrotask(() => setTab("staged"));
  }, [open]);

  if (!open) return null;

  const items = tab === "staged" ? staged : trash;

  return (
    <>
      <div className="tray-backdrop" onClick={onClose} role="presentation" />
      <aside className="tray-drawer" role="dialog" aria-modal="true" aria-label="Staging tray">
        <header className="tray-head">
          <div>
            <span>STAGING TRAY</span>
            <h2>Saved results</h2>
          </div>
          <button className="tray-close" type="button" onClick={onClose} aria-label="Close tray">
            ×
          </button>
        </header>

        <div className="tray-tabs" role="tablist" aria-label="Tray sections">
          <button
            className={tab === "staged" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={tab === "staged"}
            onClick={() => setTab("staged")}
          >
            Staged ({staged.length})
          </button>
          <button
            className={tab === "trash" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={tab === "trash"}
            onClick={() => setTab("trash")}
          >
            Trash ({trash.length})
          </button>
        </div>

        <div className="tray-list">
          {tab === "staged" && staged.length === 0 && (
            <div className="tray-empty">
              <Archive aria-hidden="true" />
              <strong>Nothing staged yet</strong>
              <span>Save a result and it will wait here for {STAGED_DAYS} days.</span>
            </div>
          )}
          {tab === "trash" && trash.length === 0 && (
            <div className="tray-empty">
              <Trash2 aria-hidden="true" />
              <strong>Trash is empty</strong>
              <span>Deleted items rest here for {TRASH_DAYS} days before being removed forever.</span>
            </div>
          )}
          {items.map((item) => (
            <article className="tray-row" key={item.id}>
              <TrayThumb item={item} />
              <div className="tray-row-copy">
                <strong>{item.name}</strong>
                <small>{item.width} × {item.height} px · {formatBytes(item.bytes)}</small>
                <em>{daysLeft(item)} {daysLeft(item) === 1 ? "day" : "days"} left</em>
              </div>
              <div className="tray-row-actions">
                <button type="button" aria-label="Save to folder" title="Save to folder…" onClick={() => { void saveItemToFolder(item); }}>
                  <FolderDown aria-hidden="true" />
                </button>
                <button type="button" aria-label="Copy image" title="Copy image" onClick={() => { void copyItem(item); }}>
                  {copiedId === item.id ? <Check aria-hidden="true" className="is-success" /> : <Copy aria-hidden="true" />}
                </button>
                <button type="button" aria-label="Download" title="Download" onClick={() => downloadItem(item)}>
                  <Download aria-hidden="true" />
                </button>
                {tab === "staged" ? (
                  <button type="button" aria-label="Move to trash" title="Move to trash" onClick={() => { void trashItem(item.id).then(refresh); }}>
                    <Trash2 aria-hidden="true" />
                  </button>
                ) : (
                  <>
                    <button type="button" aria-label="Restore" title="Restore" onClick={() => { void restoreItem(item.id).then(refresh); }}>
                      <ArchiveRestore aria-hidden="true" />
                    </button>
                    <button type="button" aria-label="Delete forever" title="Delete forever" className="is-danger" onClick={() => { void removeForever(item.id).then(refresh); }}>
                      <Trash2 aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>

        <footer className="tray-foot">
          <p>Staged items move to trash after {STAGED_DAYS} days · trash empties after {TRASH_DAYS} days.</p>
          {tab === "trash" && trash.length > 0 && (
            <button
              className="tool-secondary-button"
              type="button"
              onClick={() => { void emptyTrash().then(refresh); }}
            >
              Empty trash
            </button>
          )}
        </footer>
      </aside>
    </>
  );
}

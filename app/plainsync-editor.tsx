"use client";

import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import {
  AlertTriangle,
  Bold,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  Cloud,
  CloudOff,
  Code2,
  Columns2,
  Copy,
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  Heading2,
  Italic,
  Laptop,
  Link as LinkIcon,
  List,
  ListChecks,
  LoaderCircle,
  Menu,
  Moon,
  PencilLine,
  Quote,
  Search,
  Share2,
  Sun,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type RemoteDocument = {
  id: string;
  token: string;
  revision: number;
};

type LocalDocument = {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  remote?: RemoteDocument;
};

type ServerDocument = {
  id: string;
  title: string;
  content: string;
  revision: number;
  updatedAt: number;
};

type EditorMode = "write" | "split" | "read";
type SyncState = "local" | "saved" | "saving" | "offline" | "conflict";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const STORAGE_KEY = "plainsync.documents.v1";
const ACTIVE_KEY = "plainsync.active-document.v1";
const THEME_KEY = "plainsync.theme.v1";

const welcomeDocument: LocalDocument = {
  id: "welcome",
  title: "Welcome to PlainSync",
  updatedAt: Date.now(),
  content: `# Welcome to PlainSync

**Markdown that stays yours.** Write here, open the same file in your favorite editor, or invite someone with a link.

## Start in seconds

- Import any \`.md\` file with **Open file**
- Use **Share** to create a live document link
- Export clean Markdown whenever you want
- Install PlainSync as an app on macOS or Windows

> Your local drafts stay in this browser. Shared documents sync through your own PlainSync server.

## Agent-friendly by design

PlainSync stores plain Markdown rather than a proprietary document format. That means Codex, Claude, scripts, Git, and humans can work on the same artifact.

\`\`\`bash
# The self-hosted alpha runs with one command
docker compose up -d
\`\`\`

- [x] Exact Markdown source
- [x] Live preview
- [x] Local-first drafts
- [x] Shareable synchronized documents
- [ ] Threaded comments and suggestions — next milestone
`,
};

function newDocument(title = "Untitled document", content = "# Untitled document\n\nStart writing…\n"): LocalDocument {
  return {
    id: crypto.randomUUID(),
    title,
    content,
    updatedAt: Date.now(),
  };
}

function documentFromServer(
  server: ServerDocument,
  token: string,
  localId = crypto.randomUUID(),
): LocalDocument {
  return {
    id: localId,
    title: server.title,
    content: server.content,
    updatedAt: server.updatedAt,
    remote: { id: server.id, token, revision: server.revision },
  };
}

function parseSharedLink(): { id: string; token: string } | null {
  const id = new URLSearchParams(window.location.search).get("doc");
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = hash.get("key");
  return id && token ? { id, token } : null;
}

function shareUrl(remote: RemoteDocument): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("doc", remote.id);
  url.hash = `key=${encodeURIComponent(remote.token)}`;
  return url.toString();
}

function documentFingerprint(document: Pick<LocalDocument, "title" | "content">): string {
  return `${document.title}\u0000${document.content}`;
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function PlainSyncEditor() {
  const [documents, setDocuments] = useState<LocalDocument[]>([welcomeDocument]);
  const [activeId, setActiveId] = useState(welcomeDocument.id);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<EditorMode>("split");
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [syncState, setSyncState] = useState<SyncState>("local");
  const [toast, setToast] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [remoteConflict, setRemoteConflict] = useState<ServerDocument | null>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentsRef = useRef(documents);
  const lastServerFingerprint = useRef<Record<string, string>>({});

  const activeDocument = documents.find((document) => document.id === activeId) ?? documents[0];
  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return documents;
    return documents.filter(
      (document) =>
        document.title.toLowerCase().includes(normalized) ||
        document.content.toLowerCase().includes(normalized),
    );
  }, [documents, query]);

  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": { height: "100%", backgroundColor: "transparent" },
        ".cm-scroller": {
          fontFamily: "var(--font-mono)",
          lineHeight: "1.75",
          padding: "30px 0 60px",
        },
        ".cm-content": { padding: "0 36px", caretColor: "var(--accent)" },
        ".cm-gutters": { display: "none" },
        ".cm-activeLine": { backgroundColor: "var(--editor-active)" },
        ".cm-activeLineGutter": { backgroundColor: "transparent" },
        ".cm-selectionBackground, ::selection": {
          backgroundColor: "var(--selection) !important",
        },
        ".cm-focused": { outline: "none" },
      }),
    ],
    [],
  );

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    const hydrationFrame = window.requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed = stored ? (JSON.parse(stored) as LocalDocument[]) : null;
        if (parsed?.length) {
          setDocuments(parsed);
          setActiveId(localStorage.getItem(ACTIVE_KEY) ?? parsed[0].id);
        }
        const storedTheme = localStorage.getItem(THEME_KEY);
        const preferredDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        setTheme(storedTheme === "dark" || (!storedTheme && preferredDark) ? "dark" : "light");
      } catch {
        setDocuments([welcomeDocument]);
      }
      setReady(true);
    });

    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
    return () => {
      window.cancelAnimationFrame(hydrationFrame);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (ready) localStorage.setItem(THEME_KEY, theme);
  }, [ready, theme]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
    localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId, documents, ready]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const updateDocument = useCallback(
    (id: string, update: Partial<LocalDocument> | ((document: LocalDocument) => LocalDocument)) => {
      setDocuments((current) =>
        current.map((document) => {
          if (document.id !== id) return document;
          if (typeof update === "function") return update(document);
          return { ...document, ...update, updatedAt: Date.now() };
        }),
      );
    },
    [],
  );

  const fetchRemote = useCallback(
    async (id: string, token: string): Promise<ServerDocument | null> => {
      try {
        const response = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("This shared link is invalid or expired.");
        const payload = (await response.json()) as { document: ServerDocument };
        return payload.document;
      } catch (error) {
        setSyncState("offline");
        showToast(error instanceof Error ? error.message : "Could not open the shared document.");
        return null;
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (!ready) return;
    const link = parseSharedLink();
    if (!link) return;
    let cancelled = false;

    void (async () => {
      setSyncState("saving");
      const server = await fetchRemote(link.id, link.token);
      if (!server || cancelled) return;
      lastServerFingerprint.current[server.id] = documentFingerprint(server);
      setDocuments((current) => {
        const existing = current.find((document) => document.remote?.id === server.id);
        if (existing) {
          setActiveId(existing.id);
          return current.map((document) =>
            document.id === existing.id
              ? documentFromServer(server, link.token, existing.id)
              : document,
          );
        }
        const imported = documentFromServer(server, link.token);
        setActiveId(imported.id);
        return [imported, ...current];
      });
      setSyncState("saved");
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchRemote, ready]);

  useEffect(() => {
    if (!ready || !activeDocument?.remote || remoteConflict) return;
    const documentSnapshot = activeDocument;
    const remote = documentSnapshot.remote;
    if (lastServerFingerprint.current[remote.id] === documentFingerprint(documentSnapshot)) return;

    const timeout = window.setTimeout(async () => {
      setSyncState("saving");
      try {
        const response = await fetch(`/api/documents/${encodeURIComponent(remote.id)}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${remote.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: documentSnapshot.title,
            content: documentSnapshot.content,
            expectedRevision: remote.revision,
          }),
        });
        const payload = (await response.json()) as {
          document?: ServerDocument;
          error?: string;
        };
        if (response.status === 409 && payload.document) {
          setRemoteConflict(payload.document);
          setSyncState("conflict");
          return;
        }
        if (!response.ok || !payload.document) {
          throw new Error(payload.error || "Unable to sync.");
        }
        lastServerFingerprint.current[remote.id] = documentFingerprint(payload.document);
        updateDocument(documentSnapshot.id, (current) => ({
          ...current,
          updatedAt: payload.document!.updatedAt,
          remote: { ...current.remote!, revision: payload.document!.revision },
        }));
        setSyncState("saved");
      } catch {
        setSyncState("offline");
      }
    }, 750);

    return () => window.clearTimeout(timeout);
  }, [activeDocument, ready, remoteConflict, updateDocument]);

  useEffect(() => {
    if (!ready || !activeDocument?.remote) return;
    const remote = activeDocument.remote;
    const localId = activeDocument.id;
    const interval = window.setInterval(async () => {
      if (document.visibilityState === "hidden" || remoteConflict) return;
      const server = await fetchRemote(remote.id, remote.token);
      if (!server) return;
      const current = documentsRef.current.find((document) => document.id === localId);
      if (!current?.remote || server.revision <= current.remote.revision) return;
      const previousServerFingerprint = lastServerFingerprint.current[remote.id];
      if (documentFingerprint(current) !== previousServerFingerprint) {
        setRemoteConflict(server);
        setSyncState("conflict");
        return;
      }
      lastServerFingerprint.current[remote.id] = documentFingerprint(server);
      updateDocument(localId, documentFromServer(server, remote.token, localId));
      setSyncState("saved");
    }, 3000);
    return () => window.clearInterval(interval);
  }, [activeDocument?.id, activeDocument?.remote, fetchRemote, ready, remoteConflict, updateDocument]);

  const addDocument = useCallback((document = newDocument()) => {
    setDocuments((current) => [document, ...current]);
    setActiveId(document.id);
    setMode("split");
    setSidebarOpen(false);
    window.setTimeout(() => editorRef.current?.view?.focus(), 50);
  }, []);

  const importFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".md") && !file.name.toLowerCase().endsWith(".markdown")) {
        showToast("Choose a Markdown (.md) file.");
        return;
      }
      const content = await file.text();
      const title = file.name.replace(/\.(md|markdown)$/i, "");
      addDocument(newDocument(title, content));
      showToast(`${file.name} opened locally`);
    },
    [addDocument, showToast],
  );

  const onFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await importFile(file);
    event.target.value = "";
  };

  const exportDocument = useCallback(async () => {
    if (!activeDocument) return;
    const safeName = activeDocument.title.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "document";
    const fileName = `${safeName}.md`;
    const browser = window as typeof window & {
      showSaveFilePicker?: (options: unknown) => Promise<{
        createWritable: () => Promise<{ write: (value: string) => Promise<void>; close: () => Promise<void> }>;
      }>;
    };

    try {
      if (browser.showSaveFilePicker) {
        const handle = await browser.showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(activeDocument.content);
        await writable.close();
      } else {
        const blob = new Blob([activeDocument.content], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      showToast("Markdown saved to disk");
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") showToast("Could not save the file.");
    }
  }, [activeDocument, showToast]);

  const copyShareLink = useCallback(
    async (remote: RemoteDocument) => {
      await navigator.clipboard.writeText(shareUrl(remote));
      showToast("Private edit link copied");
    },
    [showToast],
  );

  const shareDocument = useCallback(async () => {
    if (!activeDocument) return;
    if (activeDocument.remote) {
      await copyShareLink(activeDocument.remote);
      return;
    }
    setSyncState("saving");
    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: activeDocument.title, content: activeDocument.content }),
      });
      const payload = (await response.json()) as {
        document?: ServerDocument;
        writeToken?: string;
        error?: string;
      };
      if (!response.ok || !payload.document || !payload.writeToken) {
        throw new Error(payload.error || "Sharing is unavailable on this server.");
      }
      const remote: RemoteDocument = {
        id: payload.document.id,
        token: payload.writeToken,
        revision: payload.document.revision,
      };
      lastServerFingerprint.current[remote.id] = documentFingerprint(activeDocument);
      updateDocument(activeDocument.id, { remote });
      const nextUrl = shareUrl(remote);
      history.replaceState(null, "", nextUrl);
      await navigator.clipboard.writeText(nextUrl);
      setSyncState("saved");
      showToast("Shared document created — link copied");
    } catch (error) {
      setSyncState("offline");
      showToast(error instanceof Error ? error.message : "Sharing is unavailable.");
    }
  }, [activeDocument, copyShareLink, showToast, updateDocument]);

  const wrapSelection = useCallback(
    (before: string, after = before, placeholder = "text") => {
      const view = editorRef.current?.view;
      if (!view) return;
      const selection = view.state.selection.main;
      const selected = view.state.doc.sliceString(selection.from, selection.to) || placeholder;
      const inserted = `${before}${selected}${after}`;
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: inserted },
        selection: { anchor: selection.from + before.length, head: selection.from + before.length + selected.length },
      });
      view.focus();
    },
    [],
  );

  const prefixLine = useCallback((prefix: string) => {
    const view = editorRef.current?.view;
    if (!view) return;
    const selection = view.state.selection.main;
    const line = view.state.doc.lineAt(selection.from);
    view.dispatch({ changes: { from: line.from, insert: prefix } });
    view.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (event.shiftKey) void shareDocument();
        else void exportDocument();
      }
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        fileInputRef.current?.click();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exportDocument, shareDocument]);

  const resolveConflict = (choice: "remote" | "local") => {
    if (!remoteConflict || !activeDocument?.remote) return;
    const remote = activeDocument.remote;
    if (choice === "remote") {
      lastServerFingerprint.current[remote.id] = documentFingerprint(remoteConflict);
      updateDocument(activeDocument.id, documentFromServer(remoteConflict, remote.token, activeDocument.id));
      setSyncState("saved");
    } else {
      lastServerFingerprint.current[remote.id] = documentFingerprint(remoteConflict);
      updateDocument(activeDocument.id, (current) => ({
        ...current,
        remote: { ...current.remote!, revision: remoteConflict.revision },
      }));
      setSyncState("saving");
    }
    setRemoteConflict(null);
  };

  const installApp = async () => {
    if (!installPrompt) {
      showToast("Use your browser menu and choose ‘Install PlainSync’.");
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const wordCount = activeDocument?.content.trim()
    ? activeDocument.content.trim().split(/\s+/).length
    : 0;

  if (!ready || !activeDocument) {
    return (
      <main className="boot-screen" aria-label="Loading PlainSync">
        <div className="brand-mark"><FileText size={22} /></div>
        <LoaderCircle className="spin" size={22} />
      </main>
    );
  }

  return (
    <main
      className={`app-shell ${sidebarOpen ? "sidebar-is-open" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setIsDragging(false);
      }}
      onDrop={(event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) void importFile(file);
      }}
    >
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept=".md,.markdown,text/markdown,text/plain"
        onChange={onFileInput}
      />

      <aside className="sidebar" aria-label="Documents">
        <div className="sidebar-header">
          <div className="brand-lockup">
            <div className="brand-mark"><FileText size={18} /></div>
            <div><strong>PlainSync</strong><span>Open Markdown workspace</span></div>
          </div>
          <button className="icon-button mobile-only" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="sidebar-actions">
          <button className="primary-sidebar-button" onClick={() => addDocument()}>
            <FilePlus2 size={16} /> New document
          </button>
          <button className="secondary-sidebar-button" onClick={() => fileInputRef.current?.click()}>
            <FolderOpen size={16} /> Open file
          </button>
        </div>

        <label className="search-box">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search local docs" />
        </label>

        <div className="document-list">
          <div className="list-label">Your documents <span>{documents.length}</span></div>
          {filteredDocuments.map((document) => (
            <button
              className={`document-row ${document.id === activeId ? "active" : ""}`}
              key={document.id}
              onClick={() => { setActiveId(document.id); setRemoteConflict(null); setSidebarOpen(false); }}
            >
              <span className="document-icon"><FileText size={15} /></span>
              <span className="document-copy">
                <strong>{document.title}</strong>
                <small>{document.remote ? "Shared" : "Local"} · {formatRelativeTime(document.updatedAt)}</small>
              </span>
              {document.remote ? <Cloud size={13} className="remote-dot" /> : null}
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <button onClick={() => void installApp()}><Laptop size={16} /> Install desktop app</button>
          <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer"><Braces size={16} /> Apache 2.0 source</a>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button" aria-label="Toggle documents" onClick={() => setSidebarOpen((value) => !value)}>
              <Menu size={19} />
            </button>
            <div className="title-area">
              <input
                aria-label="Document title"
                value={activeDocument.title}
                onChange={(event) => updateDocument(activeDocument.id, { title: event.target.value })}
              />
              <SyncStatus state={activeDocument.remote ? syncState : "local"} />
            </div>
          </div>

          <div className="topbar-actions">
            <button className="icon-button subtle-action" aria-label="Toggle theme" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button className="button secondary-action" onClick={() => void exportDocument()}>
              <Download size={16} /> <span>Save .md</span>
            </button>
            <button className="button share-action" onClick={() => void shareDocument()} disabled={syncState === "saving"}>
              {syncState === "saving" ? <LoaderCircle className="spin" size={16} /> : activeDocument.remote ? <Copy size={16} /> : <Share2 size={16} />}
              <span>{activeDocument.remote ? "Copy link" : "Share"}</span>
            </button>
          </div>
        </header>

        <div className="commandbar">
          <div className="format-tools" aria-label="Markdown formatting">
            <ToolButton label="Bold" onClick={() => wrapSelection("**")}><Bold size={16} /></ToolButton>
            <ToolButton label="Italic" onClick={() => wrapSelection("_")}><Italic size={16} /></ToolButton>
            <ToolButton label="Heading" onClick={() => prefixLine("## ")}><Heading2 size={17} /></ToolButton>
            <span className="tool-divider" />
            <ToolButton label="Link" onClick={() => wrapSelection("[", "](https://)", "link text")}><LinkIcon size={16} /></ToolButton>
            <ToolButton label="Inline code" onClick={() => wrapSelection("`")}><Code2 size={16} /></ToolButton>
            <ToolButton label="Quote" onClick={() => prefixLine("> ")}><Quote size={16} /></ToolButton>
            <ToolButton label="List" onClick={() => prefixLine("- ")}><List size={17} /></ToolButton>
            <ToolButton label="Task" onClick={() => prefixLine("- [ ] ")}><ListChecks size={17} /></ToolButton>
          </div>

          <div className="mode-switcher" aria-label="Editor view">
            <button className={mode === "write" ? "active" : ""} onClick={() => setMode("write")}><PencilLine size={15} /><span>Write</span></button>
            <button className={mode === "split" ? "active" : ""} onClick={() => setMode("split")}><Columns2 size={15} /><span>Split</span></button>
            <button className={mode === "read" ? "active" : ""} onClick={() => setMode("read")}><BookOpen size={15} /><span>Read</span></button>
          </div>
        </div>

        {remoteConflict ? (
          <div className="conflict-banner" role="alert">
            <AlertTriangle size={18} />
            <div><strong>Two versions changed at once.</strong><span>Choose which version to keep. Nothing has been overwritten.</span></div>
            <button onClick={() => resolveConflict("remote")}>Use shared</button>
            <button className="conflict-primary" onClick={() => resolveConflict("local")}>Keep mine</button>
          </div>
        ) : null}

        <div className={`editor-grid mode-${mode}`}>
          <section className="source-pane" aria-label="Markdown source">
            <CodeMirror
              ref={editorRef}
              value={activeDocument.content}
              onChange={(content) => updateDocument(activeDocument.id, { content })}
              extensions={extensions}
              theme={theme}
              basicSetup={{
                lineNumbers: false,
                foldGutter: false,
                highlightActiveLineGutter: false,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                highlightSelectionMatches: true,
              }}
              aria-label="Markdown editor"
            />
          </section>

          <section className="preview-pane" aria-label="Rendered preview">
            <article className="markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
                components={{
                  a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
                }}
              >
                {activeDocument.content}
              </ReactMarkdown>
            </article>
          </section>
        </div>

        <footer className="statusbar">
          <div><span>Markdown</span><span>UTF-8</span></div>
          <div><span>{wordCount.toLocaleString()} words</span><span>{activeDocument.content.length.toLocaleString()} characters</span></div>
        </footer>
      </section>

      {isDragging ? (
        <div className="drop-overlay"><FolderOpen size={28} /><strong>Drop your Markdown file</strong><span>It opens locally and stays on this device.</span></div>
      ) : null}
      {toast ? <div className="toast" role="status"><Check size={16} />{toast}</div> : null}
    </main>
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button className="tool-button" aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function SyncStatus({ state }: { state: SyncState }) {
  const values: Record<SyncState, { icon: React.ReactNode; label: string }> = {
    local: { icon: <Check size={12} />, label: "Saved on this device" },
    saved: { icon: <Cloud size={12} />, label: "Synced" },
    saving: { icon: <LoaderCircle className="spin" size={12} />, label: "Syncing" },
    offline: { icon: <CloudOff size={12} />, label: "Offline — saved locally" },
    conflict: { icon: <AlertTriangle size={12} />, label: "Needs your choice" },
  };
  return <span className={`sync-status sync-${state}`}>{values[state].icon}{values[state].label}<ChevronDown size={11} /></span>;
}

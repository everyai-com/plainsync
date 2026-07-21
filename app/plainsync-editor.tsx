"use client";

import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { Awareness } from "y-protocols/awareness";
import { yCollab } from "y-codemirror.next";
import * as Y from "yjs";
import {
  Bold,
  BookOpen,
  Braces,
  Camera,
  Check,
  CheckCircle2,
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
  History,
  Italic,
  Laptop,
  Link as LinkIcon,
  List,
  ListChecks,
  LoaderCircle,
  Menu,
  MessageSquare,
  Moon,
  PencilLine,
  Quote,
  Search,
  Share2,
  Send,
  Sun,
  Users,
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
  role: AccessRole;
  accessTokens?: { edit: string; suggest: string; read: string };
};

type AccessRole = "edit" | "suggest" | "read";

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

type SharedComment = {
  id: string;
  documentId: string;
  parentId: string | null;
  body: string;
  quote: string;
  relativeStart: string | null;
  relativeEnd: string | null;
  authorName: string;
  resolved: boolean;
  createdAt: number;
  updatedAt: number;
};

type DocumentVersion = {
  id: string;
  documentId: string;
  title: string;
  content: string;
  revision: number;
  label: string | null;
  actor: string;
  createdAt: number;
};

type Participant = {
  sessionId: string;
  name: string;
  color: string;
  lastSeen: number;
};

type CollaborationSession = {
  documentId: string;
  localId: string;
  doc: Y.Doc;
  text: Y.Text;
  awareness: Awareness;
  pending: Uint8Array[];
};

type EditorMode = "write" | "split" | "read";
type SyncState = "local" | "saved" | "saving" | "offline";
type DetailPanel = "share" | "comments" | "history" | null;

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const STORAGE_KEY = "plainsync.documents.v1";
const ACTIVE_KEY = "plainsync.active-document.v1";
const THEME_KEY = "plainsync.theme.v1";
const PROFILE_KEY = "plainsync.profile.v1";
const REMOTE_ORIGIN = { plainsync: "remote" };
const presenceColors = ["#2e6a51", "#b56235", "#5a62a8", "#9b4770", "#337b8d", "#82672c"];

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
- [x] Conflict-free multiplayer editing
- [x] Comments, access roles, and version history
- [ ] Suggest/accept/reject workflow — next milestone
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
  role: AccessRole,
  localId = crypto.randomUUID(),
): LocalDocument {
  return {
    id: localId,
    title: server.title,
    content: server.content,
    updatedAt: server.updatedAt,
    remote: { id: server.id, token, revision: server.revision, role },
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

function shareUrlForToken(remote: RemoteDocument, token: string): string {
  return shareUrl({ ...remote, token });
}

function bytesToBase64(value: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < value.length; index += 0x8000) {
    binary += String.fromCharCode(...value.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) result[index] = binary.charCodeAt(index);
  return result;
}

function displayDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
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
  const [detailPanel, setDetailPanel] = useState<DetailPanel>(null);
  const [comments, setComments] = useState<SharedComment[]>([]);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [profileName, setProfileName] = useState("Guest");
  const [collaboration, setCollaboration] = useState<CollaborationSession | null>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentsRef = useRef(documents);
  const collaborationRef = useRef<CollaborationSession | null>(null);
  const sessionId = useRef(crypto.randomUUID());
  const presenceColor = presenceColors[0];

  const activeDocument = documents.find((document) => document.id === activeId) ?? documents[0];
  const activeRemoteId = activeDocument?.remote?.id;
  const activeRemoteToken = activeDocument?.remote?.token;
  const activeRemoteRole = activeDocument?.remote?.role;
  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return documents;
    return documents.filter(
      (document) =>
        document.title.toLowerCase().includes(normalized) ||
        document.content.toLowerCase().includes(normalized),
    );
  }, [documents, query]);

  const extensions = useMemo(() => {
    const editorExtensions = [
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
      EditorView.editable.of(activeDocument?.remote?.role !== "read" && activeDocument?.remote?.role !== "suggest"),
    ];
    if (collaboration && collaboration.localId === activeDocument?.id) {
      editorExtensions.push(yCollab(collaboration.text, collaboration.awareness));
    }
    return editorExtensions;
  }, [activeDocument?.id, activeDocument?.remote?.role, collaboration]);

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    collaborationRef.current = collaboration;
  }, [collaboration]);

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
        const storedProfile = localStorage.getItem(PROFILE_KEY);
        const fallbackName = `Guest ${Math.floor(100 + Math.random() * 900)}`;
        setProfileName(storedProfile?.trim().slice(0, 50) || fallbackName);
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
    if (ready) localStorage.setItem(PROFILE_KEY, profileName);
  }, [profileName, ready]);

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
    async (id: string, token: string): Promise<{ document: ServerDocument; role: AccessRole } | null> => {
      try {
        const response = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("This shared link is invalid or expired.");
        const payload = (await response.json()) as { document: ServerDocument; role: AccessRole };
        return payload;
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
      const result = await fetchRemote(link.id, link.token);
      if (!result || cancelled) return;
      const { document: server, role } = result;
      setDocuments((current) => {
        const existing = current.find((document) => document.remote?.id === server.id);
        if (existing) {
          setActiveId(existing.id);
          return current.map((document) =>
            document.id === existing.id
              ? documentFromServer(server, link.token, role, existing.id)
              : document,
          );
        }
        const imported = documentFromServer(server, link.token, role);
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
    if (!ready || !activeRemoteId || !activeRemoteToken || !activeRemoteRole) return;
    const remote = { id: activeRemoteId, token: activeRemoteToken, role: activeRemoteRole };
    const localId = activeId;
    if (collaborationRef.current?.documentId === remote.id && collaborationRef.current.localId === localId) return;

    collaborationRef.current?.awareness.destroy();
    collaborationRef.current?.doc.destroy();
    let cancelled = false;
    const doc = new Y.Doc();
    const text = doc.getText("markdown");
    const awareness = new Awareness(doc);
    awareness.setLocalStateField("user", { name: profileName, color: presenceColor });
    const session: CollaborationSession = {
      documentId: remote.id,
      localId,
      doc,
      text,
      awareness,
      pending: [],
    };
    setSyncState("saving");

    void (async () => {
      try {
        const response = await fetch(`/api/documents/${encodeURIComponent(remote.id)}/sync`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${remote.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stateVector: bytesToBase64(Y.encodeStateVector(doc)),
            presence: {
              sessionId: sessionId.current,
              name: profileName,
              color: presenceColor,
            },
          }),
        });
        const payload = (await response.json()) as {
          document?: ServerDocument;
          role?: AccessRole;
          update?: string;
          participants?: Participant[];
          error?: string;
        };
        if (!response.ok || !payload.document || !payload.update || !payload.role) {
          throw new Error(payload.error || "Unable to start collaboration.");
        }
        Y.applyUpdate(doc, base64ToBytes(payload.update), REMOTE_ORIGIN);
        if (cancelled) return;
        doc.on("update", (update: Uint8Array, origin: unknown) => {
          if (origin !== REMOTE_ORIGIN) session.pending.push(update);
          updateDocument(localId, { content: text.toString() });
        });
        updateDocument(localId, (document) => ({
          ...document,
          title: payload.document!.title,
          content: text.toString(),
          updatedAt: payload.document!.updatedAt,
          remote: { ...document.remote!, revision: payload.document!.revision, role: payload.role! },
        }));
        setParticipants(payload.participants ?? []);
        setCollaboration(session);
        setComments([]);
        setVersions([]);
        setSyncState("saved");
      } catch (error) {
        if (!cancelled) {
          setSyncState("offline");
          showToast(error instanceof Error ? error.message : "Unable to start collaboration.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (collaborationRef.current === session) collaborationRef.current = null;
      awareness.destroy();
      doc.destroy();
    };
  }, [activeId, activeRemoteId, activeRemoteRole, activeRemoteToken, presenceColor, profileName, ready, showToast, updateDocument]);

  useEffect(() => {
    if (!collaboration || !activeRemoteId || !activeRemoteToken || !activeRemoteRole || collaboration.localId !== activeId) return;
    const remote = { id: activeRemoteId, token: activeRemoteToken, role: activeRemoteRole };
    let stopped = false;
    let syncing = false;

    const exchange = async () => {
      if (stopped || syncing || document.visibilityState === "hidden") return;
      syncing = true;
      const pending = collaboration.pending.splice(0);
      const current = documentsRef.current.find((document) => document.id === collaboration.localId);
      try {
        setSyncState(pending.length ? "saving" : "saved");
        const response = await fetch(`/api/documents/${encodeURIComponent(remote.id)}/sync`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${remote.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            update: pending.length ? bytesToBase64(Y.mergeUpdates(pending)) : undefined,
            stateVector: bytesToBase64(Y.encodeStateVector(collaboration.doc)),
            title: remote.role === "edit" ? current?.title : undefined,
            presence: {
              sessionId: sessionId.current,
              name: profileName,
              color: presenceColor,
            },
            actor: "human",
          }),
        });
        const payload = (await response.json()) as {
          document?: ServerDocument;
          role?: AccessRole;
          update?: string;
          participants?: Participant[];
          error?: string;
        };
        if (!response.ok || !payload.document || !payload.update || !payload.role) {
          throw new Error(payload.error || "Unable to synchronize.");
        }
        if (payload.update) Y.applyUpdate(collaboration.doc, base64ToBytes(payload.update), REMOTE_ORIGIN);
        setParticipants(payload.participants ?? []);
        updateDocument(collaboration.localId, (document) => ({
          ...document,
          title: payload.document!.title,
          content: collaboration.text.toString(),
          updatedAt: payload.document!.updatedAt,
          remote: { ...document.remote!, revision: payload.document!.revision, role: payload.role! },
        }));
        setSyncState("saved");
      } catch (error) {
        collaboration.pending.unshift(...pending);
        setSyncState("offline");
        if (pending.length) showToast(error instanceof Error ? error.message : "Changes are saved locally.");
      } finally {
        syncing = false;
      }
    };

    void exchange();
    const interval = window.setInterval(() => void exchange(), 1400);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [activeId, activeRemoteId, activeRemoteRole, activeRemoteToken, collaboration, presenceColor, profileName, showToast, updateDocument]);

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
        accessTokens?: { edit: string; suggest: string; read: string };
        error?: string;
      };
      if (!response.ok || !payload.document || !payload.writeToken || !payload.accessTokens) {
        throw new Error(payload.error || "Sharing is unavailable on this server.");
      }
      const remote: RemoteDocument = {
        id: payload.document.id,
        token: payload.writeToken,
        revision: payload.document.revision,
        role: "edit",
        accessTokens: payload.accessTokens,
      };
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

  const installApp = async () => {
    if (!installPrompt) {
      showToast("Use your browser menu and choose ‘Install PlainSync’.");
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const loadComments = useCallback(async () => {
    const remote = documentsRef.current.find((document) => document.id === activeId)?.remote;
    if (!remote) return;
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(remote.id)}/comments`, {
        headers: { Authorization: `Bearer ${remote.token}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as { comments?: SharedComment[]; error?: string };
      if (!response.ok || !payload.comments) throw new Error(payload.error || "Unable to load comments.");
      setComments(payload.comments);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load comments.");
    }
  }, [activeId, showToast]);

  const loadHistory = useCallback(async () => {
    const remote = documentsRef.current.find((document) => document.id === activeId)?.remote;
    if (!remote) return;
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(remote.id)}/history`, {
        headers: { Authorization: `Bearer ${remote.token}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as { versions?: DocumentVersion[]; error?: string };
      if (!response.ok || !payload.versions) throw new Error(payload.error || "Unable to load history.");
      setVersions(payload.versions);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load history.");
    }
  }, [activeId, showToast]);

  useEffect(() => {
    if (detailPanel === "comments") void loadComments();
    if (detailPanel === "history") void loadHistory();
  }, [detailPanel, loadComments, loadHistory]);

  const addComment = async () => {
    const remote = activeDocument?.remote;
    if (!remote || remote.role === "read" || !commentDraft.trim()) return;
    const view = editorRef.current?.view;
    const selection = view?.state.selection.main;
    const quote = selection && selection.to > selection.from
      ? view.state.doc.sliceString(selection.from, selection.to)
      : "";
    let relativeStart: string | undefined;
    let relativeEnd: string | undefined;
    if (selection && collaboration && collaboration.localId === activeDocument.id) {
      relativeStart = bytesToBase64(
        Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(collaboration.text, selection.from)),
      );
      relativeEnd = bytesToBase64(
        Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(collaboration.text, selection.to)),
      );
    }
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(remote.id)}/comments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${remote.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          body: commentDraft,
          quote,
          relativeStart,
          relativeEnd,
          authorName: profileName,
        }),
      });
      const payload = (await response.json()) as { comment?: SharedComment; error?: string };
      if (!response.ok || !payload.comment) throw new Error(payload.error || "Unable to add comment.");
      setComments((current) => [...current, payload.comment!]);
      setCommentDraft("");
      showToast(quote ? "Comment anchored to selection" : "Document comment added");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to add comment.");
    }
  };

  const setCommentResolved = async (comment: SharedComment, resolved: boolean) => {
    const remote = activeDocument?.remote;
    if (!remote || remote.role !== "edit") return;
    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(remote.id)}/comments/${encodeURIComponent(comment.id)}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${remote.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ resolved }),
        },
      );
      const payload = (await response.json()) as { comment?: SharedComment; error?: string };
      if (!response.ok || !payload.comment) throw new Error(payload.error || "Unable to update comment.");
      setComments((current) => current.map((item) => item.id === comment.id ? payload.comment! : item));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update comment.");
    }
  };

  const createSnapshot = async () => {
    const remote = activeDocument?.remote;
    if (!remote || remote.role !== "edit") return;
    const label = window.prompt("Snapshot name", `Snapshot ${new Date().toLocaleDateString()}`);
    if (!label) return;
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(remote.id)}/history`, {
        method: "POST",
        headers: { Authorization: `Bearer ${remote.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ label, actor: profileName }),
      });
      const payload = (await response.json()) as { version?: DocumentVersion; error?: string };
      if (!response.ok || !payload.version) throw new Error(payload.error || "Unable to create snapshot.");
      setVersions((current) => [payload.version!, ...current]);
      showToast("Named snapshot created");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to create snapshot.");
    }
  };

  const restoreVersion = (version: DocumentVersion) => {
    if (!activeDocument?.remote || activeDocument.remote.role !== "edit") return;
    if (!window.confirm(`Restore revision ${version.revision}? The current version stays in history.`)) return;
    if (collaboration && collaboration.localId === activeDocument.id) {
      collaboration.doc.transact(() => {
        if (collaboration.text.length) collaboration.text.delete(0, collaboration.text.length);
        if (version.content) collaboration.text.insert(0, version.content);
      });
    } else {
      updateDocument(activeDocument.id, { content: version.content });
    }
    updateDocument(activeDocument.id, { title: version.title });
    setDetailPanel(null);
    showToast("Revision restored and queued for sync");
  };

  const copyRoleLink = async (role: AccessRole) => {
    const remote = activeDocument?.remote;
    if (!remote) return;
    const token = remote.accessTokens?.[role] ?? (role === remote.role ? remote.token : undefined);
    if (!token) {
      showToast("This browser only has the link you opened.");
      return;
    }
    await navigator.clipboard.writeText(shareUrlForToken(remote, token));
    showToast(`${role === "edit" ? "Editor" : role === "suggest" ? "Commenter" : "Read-only"} link copied`);
  };

  const wordCount = activeDocument?.content.trim()
    ? activeDocument.content.trim().split(/\s+/).length
    : 0;
  const canEdit = !activeDocument?.remote || activeDocument.remote.role === "edit";

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
              onClick={() => { setActiveId(document.id); setDetailPanel(null); setSidebarOpen(false); }}
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
          <a href="https://github.com/everyai-com/plainsync" target="_blank" rel="noreferrer"><Braces size={16} /> Apache 2.0 source</a>
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
                disabled={!canEdit}
                onChange={(event) => updateDocument(activeDocument.id, { title: event.target.value })}
              />
              <SyncStatus state={activeDocument.remote ? syncState : "local"} />
            </div>
          </div>

          <div className="topbar-actions">
            {activeDocument.remote ? (
              <div className="presence-stack" aria-label={`${participants.length} people present`}>
                {participants.slice(0, 3).map((participant) => (
                  <span
                    key={participant.sessionId}
                    className="presence-avatar"
                    style={{ backgroundColor: participant.color }}
                    title={participant.name}
                  >
                    {participant.name.slice(0, 1).toUpperCase()}
                  </span>
                ))}
                <button className="icon-button collaboration-action" aria-label="Comments" onClick={() => setDetailPanel("comments")}>
                  <MessageSquare size={17} />
                  {comments.filter((comment) => !comment.resolved).length ? <small>{comments.filter((comment) => !comment.resolved).length}</small> : null}
                </button>
                <button className="icon-button collaboration-action" aria-label="History" onClick={() => setDetailPanel("history")}>
                  <History size={17} />
                </button>
              </div>
            ) : null}
            <button className="icon-button subtle-action" aria-label="Toggle theme" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button className="button secondary-action" onClick={() => void exportDocument()}>
              <Download size={16} /> <span>Save .md</span>
            </button>
            <button
              className="button share-action"
              onClick={() => activeDocument.remote ? setDetailPanel("share") : void shareDocument()}
              disabled={syncState === "saving"}
            >
              {syncState === "saving" ? <LoaderCircle className="spin" size={16} /> : <Share2 size={16} />}
              <span>Share</span>
            </button>
          </div>
        </header>

        <div className="commandbar">
          <div className="format-tools" aria-label="Markdown formatting">
            <ToolButton label="Bold" disabled={!canEdit} onClick={() => wrapSelection("**")}><Bold size={16} /></ToolButton>
            <ToolButton label="Italic" disabled={!canEdit} onClick={() => wrapSelection("_")}><Italic size={16} /></ToolButton>
            <ToolButton label="Heading" disabled={!canEdit} onClick={() => prefixLine("## ")}><Heading2 size={17} /></ToolButton>
            <span className="tool-divider" />
            <ToolButton label="Link" disabled={!canEdit} onClick={() => wrapSelection("[", "](https://)", "link text")}><LinkIcon size={16} /></ToolButton>
            <ToolButton label="Inline code" disabled={!canEdit} onClick={() => wrapSelection("`")}><Code2 size={16} /></ToolButton>
            <ToolButton label="Quote" disabled={!canEdit} onClick={() => prefixLine("> ")}><Quote size={16} /></ToolButton>
            <ToolButton label="List" disabled={!canEdit} onClick={() => prefixLine("- ")}><List size={17} /></ToolButton>
            <ToolButton label="Task" disabled={!canEdit} onClick={() => prefixLine("- [ ] ")}><ListChecks size={17} /></ToolButton>
          </div>

          <div className="mode-switcher" aria-label="Editor view">
            <button className={mode === "write" ? "active" : ""} onClick={() => setMode("write")}><PencilLine size={15} /><span>Write</span></button>
            <button className={mode === "split" ? "active" : ""} onClick={() => setMode("split")}><Columns2 size={15} /><span>Split</span></button>
            <button className={mode === "read" ? "active" : ""} onClick={() => setMode("read")}><BookOpen size={15} /><span>Read</span></button>
          </div>
        </div>

        <div className={`editor-grid mode-${mode}`}>
          <section className="source-pane" aria-label="Markdown source">
            <CodeMirror
              key={`${activeDocument.id}:${collaboration?.documentId ?? "local"}`}
              ref={editorRef}
              value={activeDocument.content}
              onChange={(content) => { if (canEdit) updateDocument(activeDocument.id, { content }); }}
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

      {detailPanel ? (
        <aside className="detail-panel" aria-label={`${detailPanel} panel`}>
          <div className="detail-panel-header">
            <div>
              {detailPanel === "share" ? <Share2 size={17} /> : detailPanel === "comments" ? <MessageSquare size={17} /> : <History size={17} />}
              <strong>{detailPanel === "share" ? "Share document" : detailPanel === "comments" ? "Comments" : "Version history"}</strong>
            </div>
            <button className="icon-button" aria-label="Close panel" onClick={() => setDetailPanel(null)}><X size={18} /></button>
          </div>

          {detailPanel === "share" && activeDocument.remote ? (
            <div className="detail-panel-body share-panel">
              <div className="access-summary">
                <Users size={18} />
                <div><strong>Link-based access</strong><span>Your server stores only hashed keys. The key stays after the # in each URL.</span></div>
              </div>
              <label className="profile-field">
                <span>Your display name</span>
                <input value={profileName} maxLength={50} onChange={(event) => setProfileName(event.target.value)} />
              </label>
              <button className="access-link-card" onClick={() => void copyRoleLink("edit")}>
                <PencilLine size={17} /><span><strong>Editor link</strong><small>Write, comment, restore and share</small></span><Copy size={15} />
              </button>
              <button className="access-link-card" onClick={() => void copyRoleLink("suggest")}>
                <MessageSquare size={17} /><span><strong>Commenter link</strong><small>Read and add anchored comments</small></span><Copy size={15} />
              </button>
              <button className="access-link-card" onClick={() => void copyRoleLink("read")}>
                <BookOpen size={17} /><span><strong>Read-only link</strong><small>Read and follow live changes</small></span><Copy size={15} />
              </button>
              {!activeDocument.remote.accessTokens ? <p className="panel-note">Only the access link opened in this browser is available here.</p> : null}
            </div>
          ) : null}

          {detailPanel === "comments" && activeDocument.remote ? (
            <div className="detail-panel-body comments-panel">
              {activeDocument.remote.role !== "read" ? (
                <div className="comment-composer">
                  <textarea
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    placeholder="Select text to anchor a comment, or comment on the whole document…"
                    rows={4}
                  />
                  <div><span>Commenting as {profileName}</span><button onClick={() => void addComment()} disabled={!commentDraft.trim()}><Send size={14} /> Add</button></div>
                </div>
              ) : <p className="panel-note">This is a read-only link. Ask for a commenter link to join the discussion.</p>}
              <div className="comment-list">
                {comments.length === 0 ? <div className="empty-panel"><MessageSquare size={24} /><strong>No comments yet</strong><span>Select text in the editor, then start the conversation.</span></div> : null}
                {comments.map((comment) => (
                  <article className={`comment-card ${comment.resolved ? "resolved" : ""}`} key={comment.id}>
                    <div className="comment-meta"><strong>{comment.authorName}</strong><span>{displayDate(comment.createdAt)}</span></div>
                    {comment.quote ? <blockquote>{comment.quote}</blockquote> : null}
                    <p>{comment.body}</p>
                    {activeDocument.remote?.role === "edit" ? (
                      <button className="resolve-button" onClick={() => void setCommentResolved(comment, !comment.resolved)}>
                        <CheckCircle2 size={14} /> {comment.resolved ? "Reopen" : "Resolve"}
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {detailPanel === "history" && activeDocument.remote ? (
            <div className="detail-panel-body history-panel">
              {activeDocument.remote.role === "edit" ? (
                <button className="snapshot-button" onClick={() => void createSnapshot()}><Camera size={15} /> Name current version</button>
              ) : null}
              <div className="version-list">
                {versions.map((version) => (
                  <article className="version-card" key={version.id}>
                    <div><strong>{version.label || `Revision ${version.revision}`}</strong><span>{displayDate(version.createdAt)} · {version.actor}</span></div>
                    <p>{version.content.slice(0, 120).replace(/\s+/g, " ") || "Empty document"}</p>
                    {activeDocument.remote?.role === "edit" ? <button onClick={() => restoreVersion(version)}>Restore</button> : null}
                  </article>
                ))}
                {versions.length === 0 ? <div className="empty-panel"><History size={24} /><strong>No saved versions yet</strong><span>Versions appear as the shared document changes.</span></div> : null}
              </div>
            </div>
          ) : null}
        </aside>
      ) : null}

      {isDragging ? (
        <div className="drop-overlay"><FolderOpen size={28} /><strong>Drop your Markdown file</strong><span>It opens locally and stays on this device.</span></div>
      ) : null}
      {toast ? <div className="toast" role="status"><Check size={16} />{toast}</div> : null}
    </main>
  );
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button className="tool-button" aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>;
}

function SyncStatus({ state }: { state: SyncState }) {
  const values: Record<SyncState, { icon: React.ReactNode; label: string }> = {
    local: { icon: <Check size={12} />, label: "Saved on this device" },
    saved: { icon: <Cloud size={12} />, label: "Synced" },
    saving: { icon: <LoaderCircle className="spin" size={12} />, label: "Syncing" },
    offline: { icon: <CloudOff size={12} />, label: "Offline — saved locally" },
  };
  return <span className={`sync-status sync-${state}`}>{values[state].icon}{values[state].label}<ChevronDown size={11} /></span>;
}

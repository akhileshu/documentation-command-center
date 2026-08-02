const ROOT = "better-docs-v2";
const MAX_RECENT = 8;
const EXCLUDED_PATHS = [
  "better-docs-v2/reference/exports",
];
const FILE_TYPES = [
  { value: "markdown", label: "Markdown", extensions: new Set(["md"]) },
  { value: "attachments", label: "All attachments", extensions: null },
  { value: "excalidraw", label: "Excalidraw", extensions: null },
  { value: "drawio", label: "Draw.io", extensions: null },
  { value: "image", label: "Images", extensions: new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "tif", "tiff"]) },
  { value: "video", label: "Video", extensions: new Set(["mp4", "webm", "mov", "mkv", "avi", "m4v"]) },
  { value: "audio", label: "Audio", extensions: new Set(["mp3", "wav", "m4a", "ogg", "flac", "aac", "opus"]) },
  { value: "pdf", label: "PDF", extensions: new Set(["pdf"]) },
  { value: "all", label: "All files", extensions: null },
];
const host = dv.container;
const GALLERY_PREFERENCE_KEY = "better-docs-v2.command-center.gallery.includeUnsupported";
const GALLERY_RUNTIME_KEY = "__betterDocsCommandCenterGallery";
const GALLERY_UNSUPPORTED_EXTENSIONS = new Set(["md", "pdf", "drawio", "excalidraw", "excalidrawlib"]);
const previewWindowState = window.__dccPreviewWindow ??= { leaf: null };

host.classList.add("doc-command-center");

const state = {
  depth: 2,
  query: "",
  countMode: "nested",
  fileType: "markdown",
  pinnedPath: null,
  galleryRoot: null,
  includeUnsupported: readGalleryPreference(),
};

function readGalleryPreference() {
  try {
    return window.localStorage.getItem(GALLERY_PREFERENCE_KEY) === "true";
  } catch (error) {
    return false;
  }
}

function saveGalleryPreference(value) {
  try {
    window.localStorage.setItem(GALLERY_PREFERENCE_KEY, String(value));
  } catch (error) {
    // Private browsing or vault embeds may deny localStorage access.
  }
}

function galleryDocument() {
  return host.doc
    ?? (typeof activeDocument !== "undefined" ? activeDocument : document);
}

function galleryRuntime() {
  return window[GALLERY_RUNTIME_KEY] ?? null;
}

function closeGalleryOverlay(clearRuntime = true) {
  const root = state.galleryRoot ?? galleryDocument().body.querySelector(".doc-gallery-backdrop");
  if (root) root.remove();
  state.galleryRoot = null;
  if (clearRuntime) delete window[GALLERY_RUNTIME_KEY];
}

async function openInPreviewWindow(file) {
  const savedLeaf = previewWindowState.leaf;
  const reusableLeaf = savedLeaf && (
    app.workspace.getLeafById?.(savedLeaf.id)
    ?? (savedLeaf.containerEl?.isConnected ? savedLeaf : null)
  );
  const leaf = reusableLeaf ?? app.workspace.getLeaf("window");

  previewWindowState.leaf = leaf;
  await leaf.openFile(file);
}

function isExcluded(path) {
  return EXCLUDED_PATHS.some(excluded =>
    path === excluded || path.startsWith(`${excluded}/`)
  );
}

function selectedFileType() {
  return FILE_TYPES.find(type => type.value === state.fileType) ?? FILE_TYPES[0];
}

function specialFileType(file) {
  const path = file.path.toLowerCase();
  if (path.endsWith(".excalidraw.md") || path.endsWith(".excalidraw") || path.endsWith(".excalidrawlib")) return "excalidraw";
  if (path.endsWith(".drawio") || path.endsWith(".drawio.svg") || path.endsWith(".drawio.png") || path.endsWith(".drawio.pdf")) return "drawio";
  return null;
}

function matchesFileType(file) {
  const type = selectedFileType();
  if (type.value === "all") return true;

  const specialType = specialFileType(file);
  if (type.value === "attachments") {
    return Boolean(specialType) || fileExtension(file) !== "md";
  }
  if (specialType) return specialType === type.value;

  return type.extensions?.has(file.extension.toLowerCase()) ?? false;
}

const vaultFiles = () => app.vault
  .getFiles()
  .filter(file =>
    (file.path === ROOT || file.path.startsWith(`${ROOT}/`))
    && !isExcluded(file.path)
    && matchesFileType(file)
  );

function applyPinnedScope(files) {
  if (!state.pinnedPath) return files;
  return files.filter(file =>
    file.path === state.pinnedPath || file.path.startsWith(`${state.pinnedPath}/`)
  );
}

function createNode(name, path = "") {
  return {
    name,
    path,
    folders: new Map(),
    files: [],
  };
}

function buildTree(files) {
  const root = createNode(ROOT, ROOT);

  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;

    for (let index = 1; index < parts.length - 1; index += 1) {
      const folderName = parts[index];
      const folderPath = parts.slice(0, index + 1).join("/");

      if (!node.folders.has(folderName)) {
        node.folders.set(folderName, createNode(folderName, folderPath));
      }

      node = node.folders.get(folderName);
    }

    node.files.push(file);
  }

  calculateAggregateCounts(root);
  return root;
}

function calculateAggregateCounts(node) {
  let folderCount = 0;
  let fileCount = node.files.length;

  for (const folder of node.folders.values()) {
    const counts = calculateAggregateCounts(folder);
    folderCount += 1 + counts.folderCount;
    fileCount += counts.fileCount;
  }

  node.aggregateCounts = { folderCount, fileCount };
  return node.aggregateCounts;
}

function normalize(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function fileMatches(file, query) {
  if (!query) return true;
  return normalize(`${file.name} ${file.path}`).includes(query);
}

function nodeMatches(node, query) {
  if (!query) return true;
  if (normalize(node.path).includes(query)) return true;
  if (node.files.some(file => fileMatches(file, query))) return true;
  return [...node.folders.values()].some(folder => nodeMatches(folder, query));
}

function sortedFolders(node) {
  return [...node.folders.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  );
}

function sortedFiles(node, query) {
  return node.files
    .filter(file => fileMatches(file, query))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }));
}

function makeInternalLink(path, label) {
  const link = document.createElement("a");
  link.className = "internal-link doc-command-center-link";
  link.href = path;
  link.dataset.href = path;
  link.textContent = label;
  link.title = path;
  link.addEventListener("click", event => {
    event.preventDefault();
    app.workspace.openLinkText(path, "", false);
  });
  return link;
}

function addFileRow(parent, file) {
  const row = parent.createDiv({ cls: "doc-tree-file" });
  const primary = row.createSpan({ cls: "doc-tree-primary" });
  primary.createSpan({ cls: "doc-tree-file-mark", text: "·" });
  primary.appendChild(makeInternalLink(file.path, file.name));
  row.createSpan({ cls: "doc-tree-count" });
  row.createSpan({ cls: "doc-tree-count" });
  row.createSpan({ cls: "doc-tree-pin-cell" });
}

function findNode(node, path) {
  if (node.path === path) return node;
  for (const folder of node.folders.values()) {
    const result = findNode(folder, path);
    if (result) return result;
  }
  return null;
}

function renderFolderEntry(folder, parent, depth, query, forceOpen = false) {
  const details = parent.createEl("details", { cls: "doc-tree-folder" });
  // Depth buttons choose the initial open state; they never remove descendants.
  details.open = forceOpen || state.depth === Infinity || depth < state.depth;

  const summary = details.createEl("summary");
  const primary = summary.createSpan({ cls: "doc-tree-primary" });
  primary.createSpan({ cls: "doc-tree-folder-mark", text: "▸" });
  primary.createSpan({ text: folder.name });
  const counts = visibleCounts(folder, query);
  summary.createSpan({ cls: "doc-tree-count", text: String(counts.folderCount) });
  summary.createSpan({ cls: "doc-tree-count", text: String(counts.fileCount) });

  const pin = summary.createEl("button", {
    cls: `doc-tree-pin${state.pinnedPath === folder.path ? " is-pinned" : ""}`,
    text: state.pinnedPath === folder.path ? "●" : "○",
  });
  pin.type = "button";
  pin.setAttribute("aria-label", state.pinnedPath === folder.path ? `Unpin ${folder.name}` : `Pin ${folder.name} as root`);
  pin.title = state.pinnedPath === folder.path ? "Unpin folder" : "Pin folder as root";
  pin.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    state.pinnedPath = state.pinnedPath === folder.path ? null : folder.path;
    render();
  });

  const content = details.createDiv({ cls: "doc-tree-children" });
  renderFolder(folder, content, depth + 1, query);
}

function renderFolder(node, parent, depth, query) {
  const folderEntries = sortedFolders(node).filter(folder => nodeMatches(folder, query));

  for (const folder of folderEntries) {
    renderFolderEntry(folder, parent, depth, query);
  }

  for (const file of sortedFiles(node, query)) {
    addFileRow(parent, file);
  }
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function visibleCounts(node, query) {
  if (state.countMode === "direct") {
    if (!query || normalize(node.path).includes(query)) {
      return {
        folderCount: node.folders.size,
        fileCount: node.files.length,
      };
    }

    return {
      folderCount: [...node.folders.values()].filter(folder => nodeMatches(folder, query)).length,
      fileCount: node.files.filter(file => fileMatches(file, query)).length,
    };
  }

  if (!query || normalize(node.path).includes(query)) {
    return node.aggregateCounts;
  }

  let folderCount = 0;
  let fileCount = node.files.filter(file => fileMatches(file, query)).length;

  for (const folder of node.folders.values()) {
    if (!nodeMatches(folder, query)) continue;
    const counts = visibleCounts(folder, query);
    folderCount += 1 + counts.folderCount;
    fileCount += counts.fileCount;
  }

  return { folderCount, fileCount };
}

function getHealth(files) {
  const paths = new Set(files.map(file => file.path));
  const unresolvedTargets = new Set();
  const incoming = new Map(files.map(file => [file.path, 0]));

  for (const [source, targets] of Object.entries(app.metadataCache.unresolvedLinks ?? {})) {
    if (!paths.has(source)) continue;
    for (const target of Object.keys(targets ?? {})) {
      unresolvedTargets.add(target);
    }
  }

  for (const [source, targets] of Object.entries(app.metadataCache.resolvedLinks ?? {})) {
    if (!paths.has(source)) continue;
    for (const target of Object.keys(targets ?? {})) {
      if (incoming.has(target)) incoming.set(target, incoming.get(target) + 1);
    }
  }

  const orphanCount = [...incoming.values()].filter(count => count === 0).length;
  return {
    unresolved: unresolvedTargets.size,
    orphans: orphanCount,
  };
}

function getStats(files) {
  const folders = new Set();

  for (const file of files) {
    const parts = file.path.split("/");
    for (let index = 1; index < parts.length - 1; index += 1) {
      folders.add(parts.slice(0, index + 1).join("/"));
    }
  }

  const recent = [...files]
    .sort((a, b) => b.stat.mtime - a.stat.mtime)
    .slice(0, MAX_RECENT);

  return { folderCount: folders.size, recent };
}

function addMetric(parent, label, value, detail = "") {
  const card = parent.createDiv({ cls: "doc-metric" });
  card.createDiv({ cls: "doc-metric-value", text: String(value) });
  card.createDiv({ cls: "doc-metric-label", text: label });
  if (detail) card.createDiv({ cls: "doc-metric-detail", text: detail });
}

function addButton(parent, label, selected, onClick) {
  const button = parent.createEl("button", {
    cls: `doc-depth-button${selected ? " is-selected" : ""}`,
    text: label,
  });
  button.type = "button";
  button.setAttribute("aria-pressed", String(selected));
  button.addEventListener("click", onClick);
  return button;
}

function renderRecent(parent, recent, typeLabel) {
  const panel = parent.createDiv({ cls: "doc-panel" });
  panel.createEl("h2", { text: "Recently updated" });

  if (recent.length === 0) {
    panel.createDiv({ cls: "doc-empty-state", text: `No ${typeLabel.toLowerCase()} files found.` });
    return;
  }

  const list = panel.createEl("ul", { cls: "doc-recent-list" });
  for (const file of recent) {
    const item = list.createEl("li");
    item.appendChild(makeInternalLink(file.path, file.name));
    item.createSpan({ cls: "doc-recent-date", text: formatDate(file.stat.mtime) });
  }
}

function galleryFiles(files, query) {
  return files
    .filter(file => fileMatches(file, query) && (isGalleryPreviewable(file) || (state.includeUnsupported && isGalleryUnsupported(file))))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, {
      numeric: true,
      sensitivity: "base",
    }));
}

function fileExtension(file) {
  return String(file.extension ?? "").toLowerCase();
}

function isImageFile(file) {
  return FILE_TYPES.find(type => type.value === "image").extensions.has(fileExtension(file));
}

function isVideoFile(file) {
  return FILE_TYPES.find(type => type.value === "video").extensions.has(fileExtension(file));
}

function isAudioFile(file) {
  return FILE_TYPES.find(type => type.value === "audio").extensions.has(fileExtension(file));
}

function isGalleryPreviewable(file) {
  return isImageFile(file) || isVideoFile(file) || isAudioFile(file);
}

function isGalleryUnsupported(file) {
  return !isGalleryPreviewable(file)
    && (Boolean(specialFileType(file)) || GALLERY_UNSUPPORTED_EXTENSIONS.has(fileExtension(file)));
}

function isPdfFile(file) {
  return fileExtension(file) === "pdf";
}

const resourcePathCache = new Map();

function resourcePathFor(file) {
  if (!resourcePathCache.has(file.path)) {
    resourcePathCache.set(file.path, app.vault.getResourcePath(file));
  }
  return resourcePathCache.get(file.path);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes ?? 0} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}

function addGalleryFallback(parent, file, typeLabel, message) {
  const card = parent.createDiv({ cls: "doc-gallery-fallback" });
  card.createDiv({ cls: "doc-gallery-file-type", text: typeLabel });
  card.createEl("h3", { text: file.name });
  card.createDiv({ cls: "doc-gallery-fallback-message", text: message });
  card.createEl("code", { text: file.path });
  card.createDiv({ cls: "doc-gallery-file-size", text: formatBytes(file.stat.size) });
}

function renderGalleryPreview(parent, file) {
  const specialType = specialFileType(file);
  const extension = fileExtension(file);

  if (specialType === "excalidraw") {
    addGalleryFallback(parent, file, "Excalidraw source", "Open this drawing in Obsidian to use the Excalidraw editor.");
    return;
  }

  if (specialType === "drawio" && !["svg", "png"].includes(extension)) {
    addGalleryFallback(parent, file, "Draw.io source", "Open this source file in Obsidian or its configured Draw.io editor.");
    return;
  }

  if (isPdfFile(file)) {
    addGalleryFallback(parent, file, "PDF · Native viewer", "Open this PDF in Obsidian for fast native page rendering.");
    return;
  }

  const resourcePath = resourcePathFor(file);

  if (isImageFile(file)) {
    const image = parent.createEl("img", { cls: "doc-gallery-preview-image" });
    image.src = resourcePath;
    image.alt = file.name;
    return;
  }

  if (isVideoFile(file)) {
    const video = parent.createEl("video", { cls: "doc-gallery-preview-media" });
    video.src = resourcePath;
    video.controls = true;
    video.preload = "metadata";
    return;
  }

  if (isAudioFile(file)) {
    const audio = parent.createEl("audio", { cls: "doc-gallery-preview-audio" });
    audio.src = resourcePath;
    audio.controls = true;
    audio.preload = "none";
    return;
  }

  if (extension === "md") {
    addGalleryFallback(parent, file, "Markdown · Native viewer", "Open this note in Obsidian for its full rendered view.");
    return;
  }

  addGalleryFallback(parent, file, extension ? extension.toUpperCase() : "File", "This file does not have an embedded preview.");
}

function openGallery(resultFiles, typeLabel, initialPath = null) {
  if (resultFiles.length === 0) return;

  closeGalleryOverlay(false);
  const modalDocument = galleryDocument();
  const backdrop = modalDocument.body.createDiv({ cls: "doc-gallery-backdrop" });
  state.galleryRoot = backdrop;
  backdrop.setAttribute("role", "presentation");
  const dialog = backdrop.createDiv({ cls: "doc-gallery-dialog" });
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", `${typeLabel} gallery`);
  dialog.tabIndex = -1;

  const header = dialog.createDiv({ cls: "doc-gallery-header" });
  const heading = header.createDiv();
  const title = heading.createEl("h2", { cls: "doc-gallery-title" });
  const path = heading.createDiv({ cls: "doc-gallery-path" });
  const position = header.createDiv({ cls: "doc-gallery-position" });
  const close = header.createEl("button", { cls: "doc-gallery-close", text: "×" });
  close.type = "button";
  close.setAttribute("aria-label", "Close gallery");

  const body = dialog.createDiv({ cls: "doc-gallery-body" });
  const previous = body.createEl("button", { cls: "doc-gallery-nav", text: "‹" });
  previous.type = "button";
  previous.setAttribute("aria-label", "Previous result");
  const preview = body.createDiv({ cls: "doc-gallery-preview" });
  const next = body.createEl("button", { cls: "doc-gallery-nav", text: "›" });
  next.type = "button";
  next.setAttribute("aria-label", "Next result");

  const thumbnails = dialog.createDiv({ cls: "doc-gallery-thumbnails" });
  const thumbnailButtons = [];
  const footer = dialog.createDiv({ cls: "doc-gallery-footer" });
  footer.createSpan({
    cls: "doc-gallery-hint",
    text: "← → Navigate · Enter: Open in Obsidian · Esc: Close",
  });
  const unsupportedToggle = footer.createEl("button", {
    cls: "doc-gallery-unsupported-toggle",
    text: `Unsupported: ${state.includeUnsupported ? "shown" : "hidden"}`,
  });
  unsupportedToggle.type = "button";
  unsupportedToggle.setAttribute("aria-pressed", String(state.includeUnsupported));
  unsupportedToggle.title = "Include files without an embedded gallery preview";
  const open = footer.createEl("button", { cls: "doc-gallery-open", text: "Open in Obsidian" });
  open.type = "button";

  function closeGallery() {
    closeGalleryOverlay();
  }

  close.addEventListener("click", closeGallery);
  unsupportedToggle.addEventListener("click", () => {
    state.includeUnsupported = !state.includeUnsupported;
    saveGalleryPreference(state.includeUnsupported);
    const refreshedFiles = galleryFiles(applyPinnedScope(vaultFiles()), normalize(state.query));
    closeGalleryOverlay();
    if (refreshedFiles.length > 0) openGallery(refreshedFiles, selectedFileType().label);
  });
  backdrop.addEventListener("click", event => {
    if (event.target === backdrop) closeGallery();
  });

  for (const [index, file] of resultFiles.entries()) {
    const thumbnail = thumbnails.createEl("button", { cls: "doc-gallery-thumbnail" });
    thumbnail.type = "button";
    thumbnail.setAttribute("aria-label", `View ${file.name}`);
    thumbnail.title = file.path;

    if (isImageFile(file) && specialFileType(file) !== "excalidraw") {
      const image = thumbnail.createEl("img");
      image.src = resourcePathFor(file);
      image.alt = "";
      image.loading = "lazy";
    } else {
      thumbnail.createSpan({ cls: "doc-gallery-thumbnail-type", text: fileExtension(file).toUpperCase() || "FILE" });
    }

    thumbnail.createSpan({ cls: "doc-gallery-thumbnail-label", text: file.name });
    thumbnail.addEventListener("click", () => show(index));
    thumbnailButtons.push(thumbnail);
  }

  let activeIndex = 0;

  function openCurrentFile() {
    void openInPreviewWindow(resultFiles[activeIndex]);
  }

  function show(index) {
    activeIndex = Math.max(0, Math.min(index, resultFiles.length - 1));
    const file = resultFiles[activeIndex];
    window[GALLERY_RUNTIME_KEY] = { path: file.path, typeLabel };
    title.textContent = file.name;
    path.textContent = file.path;
    position.textContent = `${activeIndex + 1} of ${resultFiles.length}`;
    previous.disabled = activeIndex === 0;
    next.disabled = activeIndex === resultFiles.length - 1;
    open.onclick = openCurrentFile;

    for (const [thumbnailIndex, thumbnail] of thumbnailButtons.entries()) {
      thumbnail.classList.toggle("is-active", thumbnailIndex === activeIndex);
    }

    preview.empty();
    renderGalleryPreview(preview, file);
  }

  previous.addEventListener("click", () => show(activeIndex - 1));
  next.addEventListener("click", () => show(activeIndex + 1));
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") closeGallery();
    if (event.key === "Enter" && event.target === dialog) {
      event.preventDefault();
      openCurrentFile();
    }
    if (event.key === "ArrowLeft" && activeIndex > 0) {
      event.preventDefault();
      show(activeIndex - 1);
    }
    if (event.key === "ArrowRight" && activeIndex < resultFiles.length - 1) {
      event.preventDefault();
      show(activeIndex + 1);
    }
  });

  const initialIndex = initialPath
    ? Math.max(0, resultFiles.findIndex(file => file.path === initialPath))
    : 0;
  show(initialIndex);
  dialog.focus({ preventScroll: true });
}

function restoreGalleryAfterRender(resultFiles, typeLabel) {
  const saved = galleryRuntime();
  if (!saved || galleryDocument().body.querySelector(".doc-gallery-backdrop")) return;
  if (resultFiles.length === 0) {
    delete window[GALLERY_RUNTIME_KEY];
    return;
  }
  openGallery(resultFiles, typeLabel, saved.path);
}

function render() {
  const activeElement = document.activeElement;
  const preserveSearchFocus = activeElement?.classList?.contains("doc-tree-search");
  const selectionStart = preserveSearchFocus ? activeElement.selectionStart : null;
  const selectionEnd = preserveSearchFocus ? activeElement.selectionEnd : null;

  host.empty();
  const type = selectedFileType();
  const files = applyPinnedScope(vaultFiles());
  const tree = buildTree(files);
  const pinnedNode = state.pinnedPath ? findNode(tree, state.pinnedPath) : null;
  const query = normalize(state.query);
  const resultFiles = galleryFiles(files, query);
  const stats = getStats(files);
  if (pinnedNode) stats.folderCount = pinnedNode.aggregateCounts.folderCount;
  const health = state.fileType === "markdown"
    ? getHealth(files)
    : { unresolved: "—", orphans: "—" };

  const header = host.createDiv({ cls: "doc-command-center-header" });
  const heading = header.createDiv();
  heading.createEl("h1", { text: "Documentation Command Center" });
  heading.createDiv({ cls: "doc-command-center-subtitle", text: `${type.label} view of ${ROOT}/` });

  const reset = header.createEl("button", { cls: "doc-refresh-button", text: "Reset view" });
  reset.type = "button";
  reset.addEventListener("click", () => {
    state.fileType = "markdown";
    state.query = "";
    state.depth = 0;
    state.countMode = "nested";
    state.pinnedPath = null;
    closeGalleryOverlay();
    render();
  });

  const metrics = host.createDiv({ cls: "doc-metrics" });
  addMetric(metrics, type.label, files.length);
  addMetric(metrics, "Folders", stats.folderCount);
  addMetric(metrics, "Unresolved links", health.unresolved, state.fileType === "markdown" ? "scoped to this root" : "Markdown only");
  addMetric(metrics, "Orphan notes", health.orphans, state.fileType === "markdown" ? "no incoming links detected" : "Markdown only");

  const controls = host.createDiv({ cls: "doc-tree-controls" });
  const fileType = controls.createEl("select", { cls: "doc-file-type-select" });
  fileType.setAttribute("aria-label", "Filter vault tree by file type");
  for (const optionData of FILE_TYPES) {
    const option = fileType.createEl("option", { text: optionData.label });
    option.value = optionData.value;
  }
  fileType.value = state.fileType;
  fileType.addEventListener("change", event => {
    state.fileType = event.target.value;
    render();
  });

  const search = controls.createEl("input", {
    cls: "doc-tree-search",
    type: "search",
    placeholder: "Search notes and folders…",
  });
  search.setAttribute("aria-label", "Search notes and folders");
  search.value = state.query;
  if (preserveSearchFocus) {
    search.focus({ preventScroll: true });
    if (selectionStart !== null && selectionEnd !== null) {
      search.setSelectionRange(selectionStart, selectionEnd);
    }
  }
  search.addEventListener("input", event => {
    state.query = event.target.value;
    window.clearTimeout(search._commandCenterTimer);
    search._commandCenterTimer = window.setTimeout(render, 120);
  });

  const countControls = controls.createDiv({ cls: "doc-count-controls" });
  const countToggle = countControls.createEl("button", {
    cls: "doc-depth-button doc-count-toggle",
    text: `Counts: ${state.countMode}`,
  });
  countToggle.type = "button";
  countToggle.setAttribute("aria-pressed", String(state.countMode === "nested"));
  countToggle.title = "Toggle between direct-child and all-descendant counts";
  countToggle.addEventListener("click", () => {
    state.countMode = state.countMode === "nested" ? "direct" : "nested";
    render();
  });

  const depthControls = controls.createDiv({ cls: "doc-depth-controls" });
  for (const [label, depth] of [["Collapse all", 0], ["Level 1", 1], ["Level 2", 2], ["Level 3", 3], ["All", Infinity]]) {
    addButton(depthControls, label, state.depth === depth, () => {
      state.depth = depth;
      render();
    });
  }

  const treePanel = host.createDiv({ cls: "doc-panel doc-tree-panel" });
  const treeHeading = treePanel.createDiv({ cls: "doc-panel-heading" });
  treeHeading.createEl("h2", { text: "Vault tree" });
  const treeHeadingActions = treeHeading.createDiv({ cls: "doc-tree-heading-actions" });
  treeHeadingActions.createSpan({
    cls: "doc-result-count",
    text: query ? `Filtered by “${state.query}”` : `${files.length} ${type.label.toLowerCase()}`,
  });
  const galleryButton = treeHeadingActions.createEl("button", {
    cls: "doc-gallery-trigger",
    text: "▦",
  });
  galleryButton.type = "button";
  galleryButton.setAttribute("aria-label", `Open ${resultFiles.length} current results in gallery`);
  galleryButton.title = `Open ${resultFiles.length} current results in gallery`;
  galleryButton.disabled = resultFiles.length === 0;
  galleryButton.addEventListener("click", () => openGallery(resultFiles, type.label));

  if (state.pinnedPath) {
    const pinBar = treePanel.createDiv({ cls: "doc-pinned-bar" });
    pinBar.createSpan({
      text: pinnedNode ? `Pinned root: ${state.pinnedPath}` : `Pinned root has no ${type.label.toLowerCase()} files: ${state.pinnedPath}`,
    });
    const unpin = pinBar.createEl("button", { cls: "doc-unpin-button", text: "Unpin" });
    unpin.type = "button";
    unpin.addEventListener("click", () => {
      state.pinnedPath = null;
      render();
    });
  }

  const treeArea = treePanel.createDiv({ cls: "doc-tree" });
  if (!pinnedNode && state.pinnedPath) {
    treeArea.createDiv({ cls: "doc-empty-state", text: "No matching files are available in the pinned folder." });
  } else if (query && !nodeMatches(pinnedNode ?? tree, query)) {
    treeArea.createDiv({ cls: "doc-empty-state", text: "No matching notes or folders." });
  } else {
    const columns = treeArea.createDiv({ cls: "doc-tree-columns" });
    columns.createSpan({ text: "Name" });
    columns.createSpan({ cls: "doc-tree-column-label", text: "Folders" });
    columns.createSpan({ cls: "doc-tree-column-label", text: "Files" });
    columns.createSpan({ cls: "doc-tree-column-label", text: "Pin" });
    if (pinnedNode) {
      renderFolderEntry(pinnedNode, treeArea, 0, query, true);
    } else {
      renderFolder(tree, treeArea, 0, query);
    }
  }

  renderRecent(host, stats.recent, type.label);
  restoreGalleryAfterRender(resultFiles, type.label);
}

render();

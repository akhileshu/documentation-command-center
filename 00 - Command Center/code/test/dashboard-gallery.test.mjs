import { readFileSync } from "node:fs";

const root = "/mnt/work/workspace/docs";
const notePath = `${root}/better-docs-v2/00 - Command Center/Documentation Command Center.md`;
const scriptPath = `${root}/better-docs-v2/00 - Command Center/code/script.js`;
const note = readFileSync(notePath, "utf8");
const script = readFileSync(scriptPath, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(note.includes('await app.vault.read'), "Dataview block must load the external script");
assert(script.includes('value: "attachments", label: "All attachments"'), "All attachments option is missing");
assert(script.includes("GALLERY_UNSUPPORTED_EXTENSIONS"), "Unsupported gallery allowlist is missing");
assert(script.includes('text: "Reset view"'), "Reset view control is missing");
assert(script.indexOf('value: "markdown"') < script.indexOf('value: "attachments"'), "All attachments must follow Markdown");
assert(script.includes('state.fileType = "markdown";') && script.includes('state.pinnedPath = null;'), "Reset must clear filter and pin");
assert(script.includes('state.depth = 0;') && script.includes('state.query = "";'), "Reset must collapse and clear search");
assert(script.includes('setAttribute("aria-pressed", String(state.includeUnsupported))'), "Gallery toggle must expose pressed state");
assert(!script.includes('app.workspace.openLinkText(file.path, "", false);\n      closeGallery();'), "Opening an item must not close the gallery");
assert(script.includes("__dccPreviewWindow"), "Gallery must retain a reusable preview window");
assert(script.includes('app.workspace.getLeaf("window")'), "Gallery must create a pop-out leaf when needed");
assert(script.includes("openInPreviewWindow(file)"), "Gallery must route opens through the reusable preview window");
assert(!script.includes('app.workspace.openLinkText(file.path, "", "window")'), "Gallery must not create a new window for every item");
assert(script.includes('querySelector(".doc-gallery-backdrop")'), "Gallery cleanup must recover overlays after rerender");
assert(!script.includes('function render() {\n  const activeElement = document.activeElement;\n  const preserveSearchFocus = activeElement?.classList?.contains("doc-tree-search");\n  const selectionStart = preserveSearchFocus ? activeElement.selectionStart : null;\n  const selectionEnd = preserveSearchFocus ? activeElement.selectionEnd : null;\n\n  closeGalleryOverlay();'), "Dashboard rerender must not close the gallery");
assert(script.includes("GALLERY_RUNTIME_KEY"), "Gallery state must survive Dataview rerenders");
assert(script.includes("restoreGalleryAfterRender"), "Gallery must be restored after dashboard rerender");
assert(script.includes('state.pinnedPath = null;\n    closeGalleryOverlay();\n    render();'), "Reset must explicitly close the gallery");
assert(script.includes("Enter: Open in Obsidian"), "Gallery must show the Enter keyboard hint");
assert(script.includes('event.key === "Enter"'), "Gallery must handle Enter keyboard activation");
assert(script.includes("openCurrentFile"), "Gallery Enter action must reuse the current-file opener");
console.log("dashboard gallery contracts passed");


This document records the gallery decisions made during the DataviewJS prototype. The native plugin now implements the same lightweight-preview/native-viewer strategy.

![[Pasted image 20260802173220.png]]

![[Pasted image 20260802173052.png]]


---

## performance improvement

```
Proposed Plan


  # Fast Hybrid Gallery Preview

  ## Summary

  The gallery’s PDF slowness comes from creating a new <iframe> PDF viewer for every item. DataviewJS can access vault
  resources, but it cannot safely embed and reuse Obsidian’s internal native PDF/document views. Obsidian also defers native
  views for performance, and forcing those views to load manually can remove that optimization. Obsidian Vault API
  (https://docs.obsidian.md/Reference/TypeScript%2BAPI/App/vault), Obsidian deferred views
  (https://docs.obsidian.md/plugins/guides/defer-views)

  Use a hybrid architecture:

  - Keep lightweight previews inside the gallery.
  - Use Obsidian’s native viewer for detailed PDF, Markdown, Excalidraw, and Draw.io viewing.
  - Remove embedded PDF iframes from the modal.

  ## Implementation Changes

  Update:

  - better-docs-v2/00 - Command Center/Documentation Command Center.md
  - .obsidian/snippets/command-center.css

  ### Gallery behavior

  - Images, audio, and video continue to preview inside the modal.
  - PDF items show an instant metadata card:
      - Filename
      - Path
      - File size
      - PDF indicator
      - Open in Obsidian action

  - Markdown files show a lightweight note card and open natively for full detail.
  - Excalidraw files open through the installed Excalidraw plugin.
  - Draw.io files open through Obsidian/the configured Draw.io plugin.
  - Previous/next navigation changes metadata immediately without initializing heavy viewers.
  - The gallery remains scoped to the current filtered and pinned results.

  ### Performance improvements

  - Delete the modal PDF <iframe> preview path.
  - Render only the active image/audio/video element.
  - Keep thumbnails lightweight and lazy-loaded.
  - Use preload="metadata" for video and avoid eager media loading.
  - Cache resource URLs and lightweight metadata during the gallery session.
  - Optionally prefetch only the adjacent image result, never all gallery files.
  - Avoid reading full Markdown or PDF contents just to display a gallery card.
  - Preserve native handoff through app.workspace.openLinkText(...).

  ### User experience

  - Make Open in Obsidian the primary action for heavy or unsupported formats.
  - Keep the current modal backdrop blur and focus treatment.
  - Show a small status such as Native viewer on PDF, Markdown, Excalidraw, and Draw.io cards.
  - Preserve keyboard arrows, thumbnails, result position, Escape close, and backdrop close.

  ## Test Plan

  - Opening the gallery no longer creates a PDF iframe.
  - Navigating across many PDFs remains responsive.
  - PDF cards appear immediately.
  - Open in Obsidian opens the native PDF viewer.
  - Markdown, Excalidraw, and Draw.io files open in their native/plugin views.
  - Images still render inside the modal.
  - Audio and video controls remain functional.
  - Only the active media element is initialized.
  - Large PDFs do not cause visible modal freezes or repeated page-render initialization.
  - Existing keyboard accessibility and reduced-motion behavior remain intact.

  ## Assumptions

  - Exact native PDF rendering inside the custom DataviewJS modal is not required.
  - “Same speed” means immediate gallery navigation plus native-speed detailed viewing.
  - No new custom Obsidian plugin is introduced.
  - A dedicated native gallery plugin would only be considered if the hybrid approach is insufficient.
```

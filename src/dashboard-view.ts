import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import {
	buildTree,
	depthIsOpen,
	FILE_TYPES,
	FileType,
	fileMatches,
	filterBookmarkedFiles,
	filterFiles,
	galleryFiles,
	getHealth,
	getStats,
	matchesNode,
	specialFileType,
	TreeNode,
	VaultFile,
	visibleCounts,
} from './domain';
import { DataviewApiLike, resolveDataviewListFiles } from './dataview-list';
import { internalLinkAttributes } from './link';
import { CommandCenterSettings } from './settings';

export const VIEW_TYPE_COMMAND_CENTER = 'documentation-command-center';

type Depth = number;

interface ViewState {
	depth: Depth;
	query: string;
	countMode: 'nested' | 'direct';
	fileType: FileType;
	pinnedPath: string | null;
	activeTab: 'tree' | 'bookmarks' | 'my-lists';
	selectedListId: string | null;
	includeUnsupported: boolean;
	galleryPath: string | null;
	galleryOpen: boolean;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'tif', 'tiff']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'opus']);
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);
	if (text !== undefined) element.textContent = text;
	if (className) element.className = className;
	return element;
}

function button(label: string, className = 'dcc-button'): HTMLButtonElement {
	const element = el('button', label, className);
	element.type = 'button';
	return element;
}

function fileExtension(file: VaultFile): string {
	return String(file.extension ?? '').toLocaleLowerCase();
}

function isImage(file: VaultFile): boolean { return IMAGE_EXTENSIONS.has(fileExtension(file)); }
function isVideo(file: VaultFile): boolean { return VIDEO_EXTENSIONS.has(fileExtension(file)); }
function isAudio(file: VaultFile): boolean { return AUDIO_EXTENSIONS.has(fileExtension(file)); }

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes || 0} B`;
	const units = ['KB', 'MB', 'GB'];
	let value = bytes / 1024;
	let unit = units[0];
	for (let index = 1; index < units.length && value >= 1024; index += 1) {
		value /= 1024;
		unit = units[index];
	}
	return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}

export class CommandCenterView extends ItemView {
	private readonly settings: CommandCenterSettings;
	private readonly allFiles: () => TFile[];
	private readonly persistBookmarks: () => void;
	private readonly getDataviewApi: () => DataviewApiLike | null;
	private state: ViewState;
	private searchTimer: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		settings: CommandCenterSettings,
		allFiles: () => TFile[],
		persistBookmarks: () => void,
		getDataviewApi: () => DataviewApiLike | null,
	) {
		super(leaf);
		this.settings = settings;
		this.allFiles = allFiles;
		this.persistBookmarks = persistBookmarks;
		this.getDataviewApi = getDataviewApi;
		this.state = this.defaultState();
	}

	getViewType(): string { return VIEW_TYPE_COMMAND_CENTER; }
	getDisplayText(): string { return 'Documentation command center'; }
	getIcon(): string { return 'layout-dashboard'; }

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
		this.searchTimer = null;
		this.state.galleryOpen = false;
		this.state.galleryPath = null;
		this.contentEl.empty();
	}

	refresh(): void {
		if (this.contentEl.isConnected) this.render();
	}

	private defaultState(): ViewState {
		return {
			depth: this.settings.defaultDepth,
			query: '',
			countMode: 'nested',
			fileType: this.settings.defaultFileType,
			pinnedPath: null,
			activeTab: 'tree',
			selectedListId: this.settings.savedLists[0]?.id ?? null,
			includeUnsupported: false,
			galleryPath: null,
			galleryOpen: false,
		};
	}

	private toVaultFiles(files: TFile[]): VaultFile[] { return files; }

	private filteredFiles(): TFile[] {
		return filterFiles(this.toVaultFiles(this.allFiles()), {
			root: this.settings.rootPath,
			excludedPaths: this.settings.excludedPaths,
			fileType: this.state.fileType,
		}) as TFile[];
	}

	private scopedFiles(): TFile[] {
		if (!this.state.pinnedPath) return this.filteredFiles();
		return this.filteredFiles().filter(file => file.path === this.state.pinnedPath || file.path.startsWith(`${this.state.pinnedPath}/`));
	}

	private makeLink(file: VaultFile): HTMLAnchorElement {
		const attributes = internalLinkAttributes(file.path);
		const link = el('a', file.name, attributes.className);
		link.href = attributes.href;
		link.dataset.href = attributes.dataHref;
		link.title = attributes.title;
		link.addEventListener('click', event => {
			event.preventDefault();
			void this.app.workspace.openLinkText(file.path, '', false);
		});
		link.addEventListener('mouseover', event => {
			this.app.workspace.trigger('hover-link', {
				event,
				source: 'documentation-command-center',
				hoverParent: this,
				targetEl: link,
				linktext: file.path,
			});
		});
		return link;
	}

	private render(): void {
		const root = this.contentEl;
		const activeElement = document.activeElement;
		const preserveSearchFocus = activeElement?.classList.contains('dcc-search') === true;
		const activeSearch = preserveSearchFocus ? activeElement as HTMLInputElement : null;
		const selectionStart = activeSearch?.selectionStart ?? null;
		const selectionEnd = activeSearch?.selectionEnd ?? null;
		root.empty();
		root.addClass('dcc-view');

		const header = el('header', undefined, 'dcc-header');
		const heading = el('div');
		heading.append(el('h1', 'Documentation Command Center'));
		heading.append(el('p', this.settings.rootPath ? `Scoped to ${this.settings.rootPath}/` : 'Complete visibility across your vault.', 'dcc-subtitle'));
		const reset = button('Reset view');
		reset.addEventListener('click', () => { this.state = this.defaultState(); this.render(); });
		header.append(heading, reset);
		root.append(header);

		root.append(this.renderControls(preserveSearchFocus, selectionStart, selectionEnd));
		this.renderResults(root);

		if (this.state.galleryOpen && this.state.galleryPath) {
			const results = galleryFiles(this.scopedFiles(), this.state.query.trim().toLocaleLowerCase(), this.state.includeUnsupported) as TFile[];
			if (results.length > 0) this.openGallery(results, this.state.galleryPath);
			else {
				this.state.galleryOpen = false;
				this.state.galleryPath = null;
			}
		}
	}

	private renderResults(root: HTMLElement): void {
		root.querySelector('.dcc-results')?.remove();
		const results = el('div', undefined, 'dcc-results');
		const files = this.scopedFiles();
		let visibleFiles = files;
		let listError: string | null = null;
		if (this.state.activeTab === 'bookmarks') {
			visibleFiles = filterBookmarkedFiles(files, this.settings.bookmarkedPaths) as TFile[];
		} else if (this.state.activeTab === 'my-lists') {
			const selectedList = this.settings.savedLists.find(list => list.id === this.state.selectedListId) ?? this.settings.savedLists[0];
			if (selectedList) {
				this.state.selectedListId = selectedList.id;
				const api = this.getDataviewApi();
				if (!api) listError = 'Dataview is not enabled. Enable Dataview to run saved lists.';
				else {
					try {
						visibleFiles = resolveDataviewListFiles(api, selectedList.query, files) as TFile[];
					} catch (error) {
						listError = error instanceof Error ? error.message : 'Unable to run this Dataview list.';
						visibleFiles = [];
					}
				}
			} else {
				listError = 'No saved lists yet. Add one in plugin settings.';
			}
		}
		const query = this.state.query.trim().toLocaleLowerCase();
		const tree = buildTree(visibleFiles, this.settings.rootPath || 'Vault', this.settings.rootPath);
		const stats = getStats(visibleFiles, this.settings.recentFileLimit);
		const metadataCache = this.app.metadataCache as unknown as { unresolvedLinks?: Record<string, Record<string, number>>; resolvedLinks?: Record<string, Record<string, number>> };
		const health = this.state.fileType === 'markdown'
			? getHealth(visibleFiles, metadataCache.unresolvedLinks, metadataCache.resolvedLinks)
			: { unresolved: '—', orphans: '—' };
		const metrics = el('section', undefined, 'dcc-metrics');
		this.addMetric(metrics, FILE_TYPES.find(type => type.value === this.state.fileType)?.label ?? 'Files', visibleFiles.length);
		this.addMetric(metrics, 'Folders', stats.folderCount);
		this.addMetric(metrics, 'Unresolved links', health.unresolved, this.state.fileType === 'markdown' ? 'scoped to this view' : 'Markdown only');
		this.addMetric(metrics, 'Orphan notes', health.orphans, this.state.fileType === 'markdown' ? 'no incoming links' : 'Markdown only');
		results.append(metrics, this.renderTree(tree, visibleFiles, query, listError), this.renderRecent(stats.recent));
		root.append(results);
	}

	private addMetric(parent: HTMLElement, label: string, value: number | string, detail = ''): void {
		const card = el('div', undefined, 'dcc-metric');
		card.append(el('strong', String(value), 'dcc-metric-value'), el('span', label, 'dcc-metric-label'));
		if (detail) card.append(el('small', detail, 'dcc-metric-detail'));
		parent.append(card);
	}

	private renderControls(preserveSearchFocus: boolean, selectionStart: number | null, selectionEnd: number | null): HTMLElement {
		const controls = el('section', undefined, 'dcc-controls');
		const typeSelect = el('select', undefined, 'dcc-file-type-select');
		typeSelect.setAttribute('aria-label', 'Filter vault tree by file type');
		for (const type of FILE_TYPES) {
			const option = el('option', type.label);
			option.value = type.value;
			typeSelect.append(option);
		}
		typeSelect.value = this.state.fileType;
		typeSelect.addEventListener('change', () => { this.state.fileType = typeSelect.value as FileType; this.render(); });
		controls.append(typeSelect);

		const search = el('input', undefined, 'dcc-search');
		search.type = 'search';
		search.placeholder = 'Search notes and folders…';
		search.setAttribute('aria-label', 'Search notes and folders');
		search.value = this.state.query;
		if (preserveSearchFocus) {
			search.focus({ preventScroll: true });
			if (selectionStart !== null && selectionEnd !== null) search.setSelectionRange(selectionStart, selectionEnd);
		}
		search.addEventListener('input', () => {
			this.state.query = search.value;
			if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
			this.searchTimer = window.setTimeout(() => {
				this.searchTimer = null;
				this.renderResults(this.contentEl);
			}, 120);
		});
		controls.append(search);

		const count = button(`Counts: ${this.state.countMode}`, 'dcc-button');
		count.setAttribute('aria-pressed', String(this.state.countMode === 'nested'));
		count.addEventListener('click', () => { this.state.countMode = this.state.countMode === 'nested' ? 'direct' : 'nested'; this.render(); });
		controls.append(count);

		const depths = el('div', undefined, 'dcc-depth-controls');
		for (const [label, depth] of [['Collapse all', 0], ['Level 1', 1], ['Level 2', 2], ['Level 3', 3], ['All', Infinity] ] as const) {
			const depthButton = button(label, `dcc-button${this.state.depth === depth ? ' is-selected' : ''}`);
			depthButton.setAttribute('aria-pressed', String(this.state.depth === depth));
			depthButton.addEventListener('click', () => { this.state.depth = depth; this.render(); });
			depths.append(depthButton);
		}
		controls.append(depths);
		return controls;
	}

	private renderTree(tree: TreeNode, files: TFile[], query: string, listError: string | null = null): HTMLElement {
		const panel = el('section', undefined, 'dcc-panel dcc-tree-panel');
		const heading = el('div', undefined, 'dcc-panel-heading');
		heading.append(el('h2', this.state.activeTab === 'bookmarks' ? 'Bookmarked folders' : this.state.activeTab === 'my-lists' ? 'My lists' : 'Vault tree'));
		const tabs = el('div', undefined, 'dcc-tabs');
		tabs.setAttribute('role', 'tablist');
		for (const [label, tab] of [['Vault tree', 'tree'], ['Bookmarked folders', 'bookmarks'], ['My lists', 'my-lists']] as const) {
			const tabButton = button(label, `dcc-tab${this.state.activeTab === tab ? ' is-selected' : ''}`);
			tabButton.setAttribute('role', 'tab');
			tabButton.setAttribute('aria-selected', String(this.state.activeTab === tab));
			tabButton.addEventListener('click', () => { this.state.activeTab = tab; this.render(); });
			tabs.append(tabButton);
		}
		heading.append(tabs);
		if (this.state.activeTab === 'my-lists') {
			const listSelect = el('select', undefined, 'dcc-list-select');
			listSelect.setAttribute('aria-label', 'Select saved dataview list');
			for (const list of this.settings.savedLists) {
				const option = el('option', list.title);
				option.value = list.id;
				listSelect.append(option);
			}
			listSelect.value = this.state.selectedListId ?? '';
			listSelect.disabled = this.settings.savedLists.length === 0;
			listSelect.addEventListener('change', () => { this.state.selectedListId = listSelect.value || null; this.render(); });
			heading.append(listSelect);
		}
		const gallery = button('▦', 'dcc-gallery-trigger');
		const galleryResults = galleryFiles(files, query, this.state.includeUnsupported) as TFile[];
		gallery.setAttribute('aria-label', `Open ${galleryResults.length} current results in gallery`);
		gallery.disabled = galleryResults.length === 0;
		gallery.addEventListener('click', () => this.openGallery(galleryResults));
		heading.append(gallery);
		panel.append(heading);
		if (listError) panel.append(el('p', listError, 'dcc-list-error'));
		if (this.state.pinnedPath) {
			const pinBar = el('div', undefined, 'dcc-pinned-bar');
			const typeLabel = FILE_TYPES.find(type => type.value === this.state.fileType)?.label.toLocaleLowerCase() ?? 'matching files';
			const hasFiles = files.length > 0;
			pinBar.append(el('span', hasFiles ? `Pinned root: ${this.state.pinnedPath}` : `Pinned root has no ${typeLabel}: ${this.state.pinnedPath}`));
			const unpin = button('Unpin', 'dcc-unpin-button');
			unpin.setAttribute('aria-label', 'Unpin folder root');
			unpin.addEventListener('click', () => { this.state.pinnedPath = null; this.render(); });
			pinBar.append(unpin);
			panel.append(pinBar);
		}
		const columns = el('div', undefined, 'dcc-tree-columns');
		columns.append(el('span', 'Name', 'dcc-tree-column-name'), el('span', 'Folders', 'dcc-tree-column-count'), el('span', 'Files', 'dcc-tree-column-count'), el('span', 'Bookmark', 'dcc-tree-column-bookmark'), el('span', 'Pin', 'dcc-tree-column-pin'));
		panel.append(columns);
		const area = el('div', undefined, 'dcc-tree');
		if (query && !matchesNode(tree, query)) area.append(el('p', 'No matching notes or folders.', 'dcc-empty'));
		else this.renderNode(tree, area, 0, query);
		panel.append(area);
		return panel;
	}

	private renderNode(node: TreeNode, parent: HTMLElement, depth: number, query: string): void {
		const folders = [...node.folders.values()].filter(folder => matchesNode(folder, query)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
		for (const folder of folders) {
			const details = el('details', undefined, 'dcc-folder');
			details.style.setProperty('--dcc-depth', String(depth));
			details.open = depthIsOpen(depth, this.state.depth);
			const summary = el('summary');
			const primary = el('span', undefined, 'dcc-tree-primary');
			primary.append(el('span', '▸', 'dcc-tree-folder-mark'), el('span', folder.name, 'dcc-tree-name'));
			const counts = visibleCounts(folder, this.state.countMode, query);
			summary.append(primary, el('span', String(counts.folderCount), 'dcc-tree-count'), el('span', String(counts.fileCount), 'dcc-tree-count'));
			const isBookmarked = this.settings.bookmarkedPaths.includes(folder.path);
			const bookmark = button(isBookmarked ? '★' : '☆', 'dcc-bookmark');
			bookmark.setAttribute('aria-label', isBookmarked ? `Remove bookmark from ${folder.name}` : `Bookmark ${folder.name}`);
			bookmark.setAttribute('aria-pressed', String(isBookmarked));
			bookmark.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				this.toggleBookmark(folder.path);
			});
			summary.append(bookmark);
			const pin = button(this.state.pinnedPath === folder.path ? '●' : '○', 'dcc-pin');
			pin.setAttribute('aria-label', this.state.pinnedPath === folder.path ? `Unpin ${folder.name}` : `Pin ${folder.name} as root`);
			pin.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); this.state.pinnedPath = this.state.pinnedPath === folder.path ? null : folder.path; this.render(); });
			summary.append(pin);
			details.append(summary);
			const children = el('div', undefined, 'dcc-tree-children');
			this.renderNode(folder, children, depth + 1, query);
			details.append(children);
			parent.append(details);
		}
		const currentFiles = node.files.filter(file => fileMatches(file, query)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
		for (const file of currentFiles) {
			const row = el('div', undefined, 'dcc-tree-file');
			row.style.setProperty('--dcc-depth', String(depth));
			row.append(el('span', `· ${file.name}`, 'dcc-tree-name'), el('span'), el('span'), el('span'), el('span'));
			const link = this.makeLink(file);
			row.firstElementChild?.replaceChildren(el('span', '·', 'dcc-file-mark'), link);
			parent.append(row);
		}
	}

	private toggleBookmark(path: string): void {
		this.settings.bookmarkedPaths = this.settings.bookmarkedPaths.includes(path)
			? this.settings.bookmarkedPaths.filter(bookmarkedPath => bookmarkedPath !== path)
			: [...this.settings.bookmarkedPaths, path].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
		this.persistBookmarks();
		this.render();
	}

	private renderRecent(files: VaultFile[]): HTMLElement {
		const panel = el('section', undefined, 'dcc-panel');
		panel.append(el('h2', 'Recently updated'));
		if (files.length === 0) panel.append(el('p', 'No files found.', 'dcc-empty'));
		const list = el('ul', undefined, 'dcc-recent-list');
		for (const file of files) {
			const item = el('li');
			item.append(this.makeLink(file), el('time', formatDate(file.stat.mtime), 'dcc-recent-date'));
			list.append(item);
		}
		panel.append(list);
		return panel;
	}

	private openGallery(files: TFile[], initialPath: string | null = null): void {
		if (files.length === 0) return;
		this.state.galleryOpen = true;
		this.state.galleryPath = initialPath ?? files[0]?.path ?? null;
		const backdrop = el('div', undefined, 'dcc-gallery-backdrop');
		const dialog = el('div', undefined, 'dcc-gallery-dialog');
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		dialog.tabIndex = -1;
		const close = button('×', 'dcc-gallery-close');
		close.setAttribute('aria-label', 'Close gallery');
		const heading = el('div', undefined, 'dcc-gallery-heading');
		const title = el('h2');
		const path = el('div', undefined, 'dcc-gallery-path');
		heading.append(title, path);
		const position = el('span', undefined, 'dcc-gallery-position');
		const header = el('header', undefined, 'dcc-gallery-header');
		header.append(heading, position, close);
		const preview = el('div', undefined, 'dcc-gallery-preview');
		const previous = button('‹', 'dcc-gallery-nav');
		previous.setAttribute('aria-label', 'Previous result');
		const next = button('›', 'dcc-gallery-nav');
		next.setAttribute('aria-label', 'Next result');
		const body = el('div', undefined, 'dcc-gallery-body');
		body.append(previous, preview, next);
		const thumbnails = el('div', undefined, 'dcc-gallery-thumbnails');
		const footer = el('footer', undefined, 'dcc-gallery-footer');
		footer.append(el('span', '← → Navigate · Enter: Open in new tab · Esc: Close', 'dcc-gallery-hint'));
		const unsupportedToggle = button(`Unsupported: ${this.state.includeUnsupported ? 'shown' : 'hidden'}`, 'dcc-gallery-unsupported-toggle');
		unsupportedToggle.setAttribute('aria-pressed', String(this.state.includeUnsupported));
		unsupportedToggle.title = 'Include files without an embedded gallery preview';
		const open = button('Open in new tab', 'dcc-gallery-open');
		footer.append(unsupportedToggle, open);
		dialog.append(header, body, thumbnails, footer);
		backdrop.append(dialog);
		this.contentEl.append(backdrop);

		let index = 0;
		const closeGallery = () => {
			this.state.galleryOpen = false;
			this.state.galleryPath = null;
			backdrop.remove();
		};
		const openCurrentFile = () => {
			const file = files[index];
			if (file) this.openInNewTab(file);
		};
		const show = (nextIndex: number) => {
			index = Math.max(0, Math.min(nextIndex, files.length - 1));
			const file = files[index];
			if (!file) return;
			this.state.galleryPath = file.path;
			title.textContent = file.name;
			path.textContent = file.path;
			position.textContent = `${index + 1} of ${files.length}`;
			previous.disabled = index === 0;
			next.disabled = index === files.length - 1;
			open.onclick = openCurrentFile;
			preview.replaceChildren(this.galleryPreview(file));
			for (const [thumbnailIndex, thumbnail] of Array.from(thumbnails.children).entries()) {
				thumbnail.classList.toggle('is-active', thumbnailIndex === index);
			}
		};
		for (const [thumbnailIndex, file] of files.entries()) {
			const thumbnail = button('', 'dcc-gallery-thumbnail');
			thumbnail.setAttribute('aria-label', `View ${file.name}`);
			thumbnail.title = file.path;
			if (isImage(file) && specialFileType(file) !== 'excalidraw') {
				const image = el('img');
				image.src = this.app.vault.getResourcePath(file);
				image.alt = '';
				image.loading = 'lazy';
				thumbnail.append(image);
			} else {
				thumbnail.append(el('span', fileExtension(file).toUpperCase() || 'FILE', 'dcc-gallery-thumbnail-type'));
			}
			thumbnail.append(el('span', file.name, 'dcc-gallery-thumbnail-label'));
			thumbnail.addEventListener('click', () => show(thumbnailIndex));
			thumbnails.append(thumbnail);
		}
		close.addEventListener('click', closeGallery);
		unsupportedToggle.addEventListener('click', () => {
			this.state.includeUnsupported = !this.state.includeUnsupported;
			const currentPath = this.state.galleryPath;
			backdrop.remove();
			this.state.galleryOpen = false;
			this.openGallery(galleryFiles(this.scopedFiles(), this.state.query, this.state.includeUnsupported) as TFile[], currentPath);
		});
		backdrop.addEventListener('click', event => { if (event.target === backdrop) closeGallery(); });
		previous.addEventListener('click', () => show(index - 1));
		next.addEventListener('click', () => show(index + 1));
		dialog.addEventListener('keydown', event => {
			if (event.key === 'Escape') {
				event.preventDefault();
				closeGallery();
			}
			if (event.key === 'ArrowLeft') {
				event.preventDefault();
				show(index - 1);
			}
			if (event.key === 'ArrowRight') {
				event.preventDefault();
				show(index + 1);
			}
			if (event.key === 'Enter' && event.target === dialog) {
				event.preventDefault();
				openCurrentFile();
			}
		});
		const initialIndex = initialPath ? Math.max(0, files.findIndex(file => file.path === initialPath)) : 0;
		show(initialIndex);
		dialog.focus({ preventScroll: true });
	}

	private galleryPreview(file: TFile): HTMLElement {
		const extension = fileExtension(file);
		const special = specialFileType(file);
		if (isImage(file) && special !== 'excalidraw') {
			const image = el('img', undefined, 'dcc-gallery-image');
			image.src = this.app.vault.getResourcePath(file);
			image.alt = file.name;
			return image;
		}
		if (isVideo(file)) {
			const video = el('video', undefined, 'dcc-gallery-media');
			video.src = this.app.vault.getResourcePath(file);
			video.controls = true;
			video.preload = 'metadata';
			return video;
		}
		if (isAudio(file)) {
			const audio = el('audio', undefined, 'dcc-gallery-audio');
			audio.src = this.app.vault.getResourcePath(file);
			audio.controls = true;
			return audio;
		}
		const fallback = el('div', undefined, 'dcc-gallery-fallback');
		fallback.append(el('strong', special ? `${special} source` : extension.toUpperCase() || 'File'), el('h3', file.name), el('p', 'Open this file in Obsidian for its native viewer.'), el('code', `${file.path} · ${formatBytes(file.stat.size)}`));
		return fallback;
	}

	private openInNewTab(file: TFile): void {
		void this.app.workspace.getLeaf('tab').openFile(file);
	}
}

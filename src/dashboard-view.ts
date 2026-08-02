import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import {
	buildTree,
	FILE_TYPES,
	FileType,
	fileMatches,
	filterFiles,
	getHealth,
	getStats,
	matchesNode,
	specialFileType,
	TreeNode,
	VaultFile,
	visibleCounts,
} from './domain';
import { CommandCenterSettings } from './settings';

export const VIEW_TYPE_COMMAND_CENTER = 'documentation-command-center';

type Depth = number;

interface ViewState {
	depth: Depth;
	query: string;
	countMode: 'nested' | 'direct';
	fileType: FileType;
	pinnedPath: string | null;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'tif', 'tiff']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'opus']);
// Native DOM creation keeps this view usable in test environments without Obsidian's HTMLElement helpers.
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
	private readonly openFile: (file: TFile) => void;
	private readonly executeCommand: (id: string) => boolean;
	private state: ViewState;
	private galleryLeaf: WorkspaceLeaf | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		settings: CommandCenterSettings,
		allFiles: () => TFile[],
		openFile: (file: TFile) => void,
		executeCommand: (id: string) => boolean,
	) {
		super(leaf);
		this.settings = settings;
		this.allFiles = allFiles;
		this.openFile = openFile;
		this.executeCommand = executeCommand;
		this.state = this.defaultState();
	}

	getViewType(): string { return VIEW_TYPE_COMMAND_CENTER; }
	getDisplayText(): string { return 'Documentation command center'; }
	getIcon(): string { return 'layout-dashboard'; }

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		this.galleryLeaf = null;
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
		const link = el('a', file.name, 'dcc-link');
		link.href = file.path;
		link.title = file.path;
		link.addEventListener('click', event => {
			event.preventDefault();
			const target = this.app.vault.getAbstractFileByPath(file.path);
			if (target instanceof TFile) this.openFile(target);
		});
		return link;
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('dcc-view');
		const files = this.scopedFiles();
		const query = this.state.query.trim().toLocaleLowerCase();
		const tree = buildTree(files, this.settings.rootPath || 'Vault', this.settings.rootPath);

		const header = el('header', undefined, 'dcc-header');
		const heading = el('div');
		heading.append(el('h1', 'Documentation Command Center'));
		heading.append(el('p', this.settings.rootPath ? `Scoped to ${this.settings.rootPath}/` : 'Complete visibility across your vault.', 'dcc-subtitle'));
		const reset = button('Reset view');
		reset.addEventListener('click', () => { this.state = this.defaultState(); this.render(); });
		header.append(heading, reset);
		root.append(header);

		const stats = getStats(files, this.settings.recentFileLimit);
		const metadataCache = this.app.metadataCache as unknown as { unresolvedLinks?: Record<string, Record<string, number>>; resolvedLinks?: Record<string, Record<string, number>> };
		const health = this.state.fileType === 'markdown'
			? getHealth(files, metadataCache.unresolvedLinks, metadataCache.resolvedLinks)
			: { unresolved: '—', orphans: '—' };
		const metrics = el('section', undefined, 'dcc-metrics');
		this.addMetric(metrics, FILE_TYPES.find(type => type.value === this.state.fileType)?.label ?? 'Files', files.length);
		this.addMetric(metrics, 'Folders', stats.folderCount);
		this.addMetric(metrics, 'Unresolved links', health.unresolved, this.state.fileType === 'markdown' ? 'scoped to this view' : 'Markdown only');
		this.addMetric(metrics, 'Orphan notes', health.orphans, this.state.fileType === 'markdown' ? 'no incoming links' : 'Markdown only');
		root.append(metrics);

		root.append(this.renderControls());
		root.append(this.renderTree(tree, files, query));
		root.append(this.renderRecent(stats.recent));
		root.append(this.renderQuickActions());
	}

	private addMetric(parent: HTMLElement, label: string, value: number | string, detail = ''): void {
		const card = el('div', undefined, 'dcc-metric');
		card.append(el('strong', String(value), 'dcc-metric-value'), el('span', label, 'dcc-metric-label'));
		if (detail) card.append(el('small', detail, 'dcc-metric-detail'));
		parent.append(card);
	}

	private renderControls(): HTMLElement {
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
		search.addEventListener('input', () => { this.state.query = search.value; this.render(); });
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

	private renderTree(tree: TreeNode, files: TFile[], query: string): HTMLElement {
		const panel = el('section', undefined, 'dcc-panel dcc-tree-panel');
		const heading = el('div', undefined, 'dcc-panel-heading');
		heading.append(el('h2', 'Vault tree'));
		const gallery = button('▦', 'dcc-gallery-trigger');
		gallery.setAttribute('aria-label', `Open ${files.length} current results in gallery`);
		gallery.disabled = files.length === 0;
		gallery.addEventListener('click', () => this.openGallery(files.filter(file => fileMatches(file, query))));
		heading.append(gallery);
		panel.append(heading);
		const columns = el('div', undefined, 'dcc-tree-columns');
		columns.append(el('span', 'Name'), el('span', 'Folders'), el('span', 'Files'), el('span', 'Pin'));
		panel.append(columns);
		const area = el('div', undefined, 'dcc-tree');
		if (query && !matchesNode(tree, query)) area.append(el('p', 'No matching notes or folders.', 'dcc-empty'));
		else this.renderNode(tree, area, 0, query, true);
		panel.append(area);
		return panel;
	}

	private renderNode(node: TreeNode, parent: HTMLElement, depth: number, query: string, isRoot = false): void {
		const folders = [...node.folders.values()].filter(folder => matchesNode(folder, query)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
		for (const folder of folders) {
			const details = el('details', undefined, 'dcc-folder');
			details.open = isRoot || this.state.depth === Infinity || depth < this.state.depth;
			const summary = el('summary');
			const name = el('span', `▸ ${folder.name}`, 'dcc-tree-name');
			const counts = visibleCounts(folder, this.state.countMode, query);
			summary.append(name, el('span', String(counts.folderCount), 'dcc-tree-count'), el('span', String(counts.fileCount), 'dcc-tree-count'));
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
			row.append(el('span', `· ${file.name}`, 'dcc-tree-name'), el('span'), el('span'), el('span'));
			const link = this.makeLink(file);
			row.firstElementChild?.replaceChildren(el('span', '·', 'dcc-file-mark'), link);
			parent.append(row);
		}
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

	private renderQuickActions(): HTMLElement {
		const panel = el('section', undefined, 'dcc-panel dcc-actions');
		panel.append(el('h2', 'Quick actions'));
		const actions = [
			['New note', 'file-new'],
			['New folder', 'file-new-folder'],
			['Open graph view', 'graph:open'],
		];
		for (const [label, command] of actions as Array<[string, string]>) {
			const action = button(label);
			action.addEventListener('click', () => {
				if (!this.executeCommand(command)) new Notice(`The Obsidian command “${label}” is unavailable.`);
			});
			panel.append(action);
		}
		const refresh = button('Refresh dashboard');
		refresh.addEventListener('click', () => this.render());
		panel.append(refresh);
		return panel;
	}

	private openGallery(files: TFile[]): void {
		if (files.length === 0) return;
		const backdrop = el('div', undefined, 'dcc-gallery-backdrop');
		const dialog = el('div', undefined, 'dcc-gallery-dialog');
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		dialog.tabIndex = -1;
		const close = button('×', 'dcc-gallery-close');
		close.setAttribute('aria-label', 'Close gallery');
		const title = el('h2');
		const position = el('span', undefined, 'dcc-gallery-position');
		const header = el('header', undefined, 'dcc-gallery-header');
		header.append(title, position, close);
		const preview = el('div', undefined, 'dcc-gallery-preview');
		const previous = button('‹', 'dcc-gallery-nav');
		const next = button('›', 'dcc-gallery-nav');
		const body = el('div', undefined, 'dcc-gallery-body');
		body.append(previous, preview, next);
		const footer = el('footer', undefined, 'dcc-gallery-footer');
		footer.append(el('span', '← → Navigate · Enter: Open in Obsidian · Esc: Close', 'dcc-gallery-hint'));
		const open = button('Open in Obsidian', 'dcc-gallery-open');
		footer.append(open);
		dialog.append(header, body, footer);
		backdrop.append(dialog);
		this.contentEl.append(backdrop);

		let index = 0;
		const closeGallery = () => backdrop.remove();
		const openCurrent = () => {
			const file = files[index];
			if (file) this.openInPreviewWindow(file);
		};
		const show = (nextIndex: number) => {
			index = Math.max(0, Math.min(nextIndex, files.length - 1));
			const file = files[index];
			if (!file) return;
			title.textContent = file.name;
			position.textContent = `${index + 1} of ${files.length}`;
			previous.disabled = index === 0;
			next.disabled = index === files.length - 1;
			open.onclick = openCurrent;
			preview.replaceChildren(this.galleryPreview(file));
		};
		close.addEventListener('click', closeGallery);
		backdrop.addEventListener('click', event => { if (event.target === backdrop) closeGallery(); });
		previous.addEventListener('click', () => show(index - 1));
		next.addEventListener('click', () => show(index + 1));
		dialog.addEventListener('keydown', event => {
			if (event.key === 'Escape') closeGallery();
			if (event.key === 'ArrowLeft') show(index - 1);
			if (event.key === 'ArrowRight') show(index + 1);
			if (event.key === 'Enter' && event.target === dialog) openCurrent();
		});
		show(0);
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

	private openInPreviewWindow(file: TFile): void {
		if (!file) return;
		const leaf = this.galleryLeaf ?? (this.galleryLeaf = this.app.workspace.getLeaf('window'));
		void leaf.openFile(file);
	}
}

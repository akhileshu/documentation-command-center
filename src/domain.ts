export interface VaultFile {
	path: string;
	name: string;
	extension: string;
	stat: { mtime: number; size: number };
}

export type FileType =
	| 'markdown'
	| 'attachments'
	| 'excalidraw'
	| 'drawio'
	| 'image'
	| 'video'
	| 'audio'
	| 'pdf'
	| 'all';

export interface TreeNode {
	name: string;
	path: string;
	folders: Map<string, TreeNode>;
	files: VaultFile[];
	aggregateCounts: Counts;
}

export interface Counts {
	folderCount: number;
	fileCount: number;
}

export interface FileTypeOption {
	value: FileType;
	label: string;
}

export const FILE_TYPES: FileTypeOption[] = [
	{ value: 'markdown', label: 'Markdown' },
	{ value: 'attachments', label: 'All attachments' },
	{ value: 'excalidraw', label: 'Excalidraw' },
	{ value: 'drawio', label: 'Draw.io' },
	{ value: 'image', label: 'Images' },
	{ value: 'video', label: 'Video' },
	{ value: 'audio', label: 'Audio' },
	{ value: 'pdf', label: 'PDF' },
	{ value: 'all', label: 'All files' },
];

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'tif', 'tiff']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'opus']);

export function normalize(value: string | null | undefined): string {
	return (value ?? '').trim().toLocaleLowerCase();
}

export function fileExtension(file: VaultFile): string {
	return String(file.extension ?? '').toLocaleLowerCase();
}

export function specialFileType(file: VaultFile): 'excalidraw' | 'drawio' | null {
	const path = file.path.toLocaleLowerCase();
	if (path.endsWith('.excalidraw.md') || path.endsWith('.excalidraw') || path.endsWith('.excalidrawlib')) return 'excalidraw';
	if (path.endsWith('.drawio') || path.endsWith('.drawio.svg') || path.endsWith('.drawio.png') || path.endsWith('.drawio.pdf')) return 'drawio';
	return null;
}

export function matchesFileType(file: VaultFile, type: FileType): boolean {
	if (type === 'all') return true;
	const special = specialFileType(file);
	if (type === 'attachments') return Boolean(special) || fileExtension(file) !== 'md';
	if (special) return special === type;
	if (type === 'markdown') return fileExtension(file) === 'md';
	if (type === 'image') return IMAGE_EXTENSIONS.has(fileExtension(file));
	if (type === 'video') return VIDEO_EXTENSIONS.has(fileExtension(file));
	if (type === 'audio') return AUDIO_EXTENSIONS.has(fileExtension(file));
	return type === 'pdf' && fileExtension(file) === 'pdf';
}

export function isExcludedPath(path: string, excludedPaths: string[]): boolean {
	return excludedPaths.some(excluded => path === excluded || path.startsWith(`${excluded}/`));
}

export function filterFiles(
	files: VaultFile[],
	options: { root: string; excludedPaths: string[]; fileType: FileType },
): VaultFile[] {
	const root = options.root.trim().replace(/^\/+|\/+$/g, '');
	return files.filter(file =>
		(!root || file.path === root || file.path.startsWith(`${root}/`)) &&
		!isExcludedPath(file.path, options.excludedPaths) &&
		matchesFileType(file, options.fileType),
	);
}

function emptyCounts(): Counts {
	return { folderCount: 0, fileCount: 0 };
}

function createNode(name: string, path: string): TreeNode {
	return { name, path, folders: new Map(), files: [], aggregateCounts: emptyCounts() };
}

export function buildTree(files: VaultFile[], rootName = 'Vault', rootPath = ''): TreeNode {
	const normalizedRoot = rootPath.replace(/^\/+|\/+$/g, '');
	const root = createNode(rootName, normalizedRoot);
	for (const file of files) {
		const relativePath = normalizedRoot && file.path.startsWith(`${normalizedRoot}/`)
			? file.path.slice(normalizedRoot.length + 1)
			: file.path;
		const parts = relativePath.split('/');
		let node = root;
		for (let index = 0; index < parts.length - 1; index += 1) {
			const folderName = parts[index]!;
			const relativeFolderPath = parts.slice(0, index + 1).join('/');
			const folderPath = normalizedRoot ? `${normalizedRoot}/${relativeFolderPath}` : relativeFolderPath;
			if (!node.folders.has(folderName)) node.folders.set(folderName, createNode(folderName, folderPath));
			node = node.folders.get(folderName)!;
		}
		node.files.push(file);
	}
	calculateAggregateCounts(root);
	return root;
}

function calculateAggregateCounts(node: TreeNode): Counts {
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

export function fileMatches(file: VaultFile, query: string): boolean {
	return !query || normalize(`${file.name} ${file.path}`).includes(normalize(query));
}

export function matchesNode(node: TreeNode, query: string): boolean {
	const normalizedQuery = normalize(query);
	if (!normalizedQuery) return true;
	return normalize(node.path).includes(normalizedQuery) ||
		node.files.some(file => fileMatches(file, normalizedQuery)) ||
		[...node.folders.values()].some(folder => matchesNode(folder, normalizedQuery));
}

export function visibleCounts(node: TreeNode, mode: 'direct' | 'nested', query = ''): Counts {
	const normalizedQuery = normalize(query);
	if (mode === 'nested' && (!normalizedQuery || normalize(node.path).includes(normalizedQuery))) return node.aggregateCounts;
	if (mode === 'direct' && (!normalizedQuery || normalize(node.path).includes(normalizedQuery))) {
		return { folderCount: node.folders.size, fileCount: node.files.length };
	}
	let folderCount = 0;
	let fileCount = node.files.filter(file => fileMatches(file, normalizedQuery)).length;
	for (const folder of node.folders.values()) {
		if (!matchesNode(folder, normalizedQuery)) continue;
		const counts = visibleCounts(folder, mode, normalizedQuery);
		folderCount += mode === 'nested' ? 1 + counts.folderCount : 1;
		if (mode === 'nested') fileCount += counts.fileCount;
	}
	return { folderCount, fileCount };
}

export function getStats(files: VaultFile[], recentLimit: number): { folderCount: number; recent: VaultFile[] } {
	const folders = new Set<string>();
	for (const file of files) {
		const parts = file.path.split('/');
		for (let index = 1; index < parts.length; index += 1) folders.add(parts.slice(0, index).join('/'));
	}
	const recent = [...files].sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, Math.max(0, recentLimit));
	return { folderCount: folders.size, recent };
}

export function getHealth(
	files: VaultFile[],
	unresolvedLinks: Record<string, Record<string, number>> = {},
	resolvedLinks: Record<string, Record<string, number>> = {},
): { unresolved: number; orphans: number } {
	const paths = new Set(files.map(file => file.path));
	const incoming = new Map(files.map(file => [file.path, 0]));
	const unresolved = new Set<string>();
	for (const [source, targets] of Object.entries(unresolvedLinks)) {
		if (!paths.has(source)) continue;
		for (const target of Object.keys(targets)) unresolved.add(target);
	}
	for (const [source, targets] of Object.entries(resolvedLinks)) {
		if (!paths.has(source)) continue;
		for (const target of Object.keys(targets)) if (incoming.has(target)) incoming.set(target, incoming.get(target)! + 1);
	}
	return { unresolved: unresolved.size, orphans: [...incoming.values()].filter(count => count === 0).length };
}

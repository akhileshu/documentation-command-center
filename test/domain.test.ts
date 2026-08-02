import { describe, expect, it } from 'vitest';
import {
	buildTree,
	depthIsOpen,
	filterFiles,
	galleryFiles,
	getHealth,
	getStats,
	matchesNode,
	visibleCounts,
} from '../src/domain';
import { normalizeSettings } from '../src/settings-model';
import { internalLinkAttributes } from '../src/link';

const files = [
	{ path: 'docs/guide/start.md', name: 'start.md', extension: 'md', stat: { mtime: 10, size: 100 } },
	{ path: 'docs/guide/api.md', name: 'api.md', extension: 'md', stat: { mtime: 30, size: 200 } },
	{ path: 'docs/assets/logo.png', name: 'logo.png', extension: 'png', stat: { mtime: 20, size: 300 } },
	{ path: 'private/secret.md', name: 'secret.md', extension: 'md', stat: { mtime: 40, size: 400 } },
];

describe('vault filtering and tree model', () => {
	it('applies expansion depth to every folder level', () => {
		expect(depthIsOpen(0, 0)).toBe(false);
		expect(depthIsOpen(0, 1)).toBe(true);
		expect(depthIsOpen(1, 1)).toBe(false);
		expect(depthIsOpen(99, Infinity)).toBe(true);
	});

	it('filters the whole vault by root, exclusions, and file type', () => {
		expect(filterFiles(files, { root: 'docs', excludedPaths: ['docs/assets'], fileType: 'markdown' }).map(file => file.path))
			.toEqual(['docs/guide/start.md', 'docs/guide/api.md']);
	});

	it('keeps matching folders when a descendant file matches the query', () => {
		const tree = buildTree(files.slice(0, 3), 'Vault');
		expect(matchesNode(tree, 'api')).toBe(true);
		expect(matchesNode(tree, 'missing')).toBe(false);
	});

	it('calculates direct and nested counts for folders', () => {
		const tree = buildTree(files.slice(0, 3), 'Vault');
		const docs = tree.folders.get('docs');
		expect(docs).toBeDefined();
		expect(visibleCounts(docs!, 'nested')).toEqual({ folderCount: 2, fileCount: 3 });
		expect(visibleCounts(docs!, 'direct')).toEqual({ folderCount: 2, fileCount: 0 });
	});

	it('renders a configured root relative to the dashboard while preserving absolute paths', () => {
		const tree = buildTree(files.slice(0, 3), 'docs', 'docs');
		const guide = tree.folders.get('guide');
		expect(guide?.path).toBe('docs/guide');
		expect(guide?.files[0]?.path).toBe('docs/guide/start.md');
	});

	it('filters gallery results by query and unsupported-file preference', () => {
		const galleryFiles = [
			...files,
			{ path: 'docs/guide/notes.md', name: 'notes.md', extension: 'md', stat: { mtime: 50, size: 10 } },
		];
		expect(galleryFilesForTest(galleryFiles, 'logo', false).map(file => file.path)).toEqual(['docs/assets/logo.png']);
		expect(galleryFilesForTest(galleryFiles, 'logo', true).map(file => file.path)).toEqual(['docs/assets/logo.png']);
		expect(galleryFilesForTest(galleryFiles, 'notes', false).map(file => file.path)).toEqual([]);
		expect(galleryFilesForTest(galleryFiles, 'notes', true).map(file => file.path)).toEqual(['docs/guide/notes.md']);
	});
});

function galleryFilesForTest(input: typeof files, query: string, includeUnsupported: boolean) {
	return galleryFiles(input, query, includeUnsupported);
}

describe('vault statistics', () => {
	it('returns recent files newest first and counts unique folders', () => {
		const stats = getStats(files.slice(0, 3), 2);
		expect(stats.folderCount).toBe(3);
		expect(stats.recent.map(file => file.path)).toEqual(['docs/guide/api.md', 'docs/assets/logo.png']);
	});

	it('counts unresolved targets and notes without incoming links', () => {
		const health = getHealth(
			files.slice(0, 2),
			{
				'docs/guide/start.md': { 'Missing note': 1 },
			},
			{
				'docs/guide/api.md': { 'docs/guide/start.md': 1 },
			},
		);
		expect(health).toEqual({ unresolved: 1, orphans: 1 });
	});
});

describe('settings migration', () => {
	it('uses safe defaults when Obsidian has no saved data on first run', () => {
		expect(normalizeSettings(null)).toEqual({
			rootPath: '',
			excludedPaths: [],
			recentFileLimit: 8,
			defaultDepth: 0,
			defaultFileType: 'markdown',
			settingsVersion: 2,
		});
	});

	it('migrates settings without a schema version to collapse-all defaults', () => {
		expect(normalizeSettings({ defaultDepth: 2 })).toMatchObject({ defaultDepth: 0, settingsVersion: 2 });
		expect(normalizeSettings({ settingsVersion: 2, defaultDepth: 2 })).toMatchObject({ defaultDepth: 2, settingsVersion: 2 });
	});

	it('creates the native Obsidian link contract for dynamically-rendered notes', () => {
		 expect(internalLinkAttributes('docs/guide/start.md')).toEqual({
			className: 'internal-link doc-command-center-link',
			href: 'docs/guide/start.md',
			dataHref: 'docs/guide/start.md',
			title: 'docs/guide/start.md',
		});
	});
});

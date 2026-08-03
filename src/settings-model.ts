export interface CommandCenterSettings {
	rootPath: string;
	excludedPaths: string[];
	recentFileLimit: number;
	defaultDepth: number;
	defaultFileType: 'markdown' | 'attachments' | 'excalidraw' | 'drawio' | 'image' | 'video' | 'audio' | 'pdf' | 'all';
	bookmarkedPaths: string[];
	savedLists: SavedList[];
	settingsVersion: number;
}

export interface SavedList {
	id: string;
	title: string;
	query: string;
}

export const DEFAULT_SETTINGS: CommandCenterSettings = {
	rootPath: '',
	excludedPaths: [],
	recentFileLimit: 8,
	defaultDepth: 0,
	defaultFileType: 'markdown',
	bookmarkedPaths: [],
	savedLists: [],
	settingsVersion: 4,
};

export function normalizeSettings(data: Partial<CommandCenterSettings> | null | undefined): CommandCenterSettings {
	const rootPath = typeof data?.rootPath === 'string' ? data.rootPath.trim().replace(/^\/+|\/+$/g, '') : DEFAULT_SETTINGS.rootPath;
	const excludedPaths = Array.isArray(data?.excludedPaths)
		? data.excludedPaths.filter((path): path is string => typeof path === 'string').map(path => path.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean)
		: DEFAULT_SETTINGS.excludedPaths;
	const recentFileLimit = typeof data?.recentFileLimit === 'number' && Number.isFinite(data.recentFileLimit)
		? Math.min(50, Math.max(1, Math.floor(data.recentFileLimit)))
		: DEFAULT_SETTINGS.recentFileLimit;
	const validDepths = [0, 1, 2, 3, Infinity];
	const hasCompatibleSchema = data?.settingsVersion === 2 || data?.settingsVersion === 3 || data?.settingsVersion === DEFAULT_SETTINGS.settingsVersion;
	const defaultDepth = hasCompatibleSchema && typeof data?.defaultDepth === 'number' && validDepths.includes(data.defaultDepth)
		? data.defaultDepth
		: DEFAULT_SETTINGS.defaultDepth;
	const validFileTypes = new Set<CommandCenterSettings['defaultFileType']>(['markdown', 'attachments', 'excalidraw', 'drawio', 'image', 'video', 'audio', 'pdf', 'all']);
	const candidateFileType = data?.defaultFileType;
	const defaultFileType = candidateFileType && validFileTypes.has(candidateFileType) ? candidateFileType : DEFAULT_SETTINGS.defaultFileType;
	const bookmarkedPaths = (data?.settingsVersion === 3 || data?.settingsVersion === DEFAULT_SETTINGS.settingsVersion) && Array.isArray(data.bookmarkedPaths)
		? [...new Set(data.bookmarkedPaths
			.filter((path): path is string => typeof path === 'string')
			.map(path => path.trim().replace(/^\/+|\/+$/g, ''))
			.filter(Boolean))]
		: DEFAULT_SETTINGS.bookmarkedPaths;
	const savedLists = data?.settingsVersion === DEFAULT_SETTINGS.settingsVersion && Array.isArray(data.savedLists)
		? data.savedLists
			.filter((list): list is SavedList => Boolean(list) && typeof list === 'object' && typeof list.id === 'string' && typeof list.title === 'string' && typeof list.query === 'string')
			.map(list => ({ id: list.id.trim(), title: list.title.trim(), query: list.query.trim() }))
			.filter(list => Boolean(list.id && list.title && list.query))
			.filter((list, index, all) => all.findIndex(candidate => candidate.id === list.id) === index)
		: DEFAULT_SETTINGS.savedLists;
	return { rootPath, excludedPaths, recentFileLimit, defaultDepth, defaultFileType, bookmarkedPaths, savedLists, settingsVersion: DEFAULT_SETTINGS.settingsVersion };
}

export function reconcileBookmarkPaths(paths: string[], oldPath: string, newPath: string | null): string[] {
	const updated = paths
		.map(path => {
			if (path !== oldPath && !path.startsWith(`${oldPath}/`)) return path;
			if (!newPath) return null;
			return `${newPath}${path.slice(oldPath.length)}`;
		})
		.filter((path): path is string => path !== null);
	return [...new Set(updated)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

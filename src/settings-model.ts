export interface CommandCenterSettings {
	rootPath: string;
	excludedPaths: string[];
	recentFileLimit: number;
	defaultDepth: number;
	defaultFileType: 'markdown' | 'attachments' | 'excalidraw' | 'drawio' | 'image' | 'video' | 'audio' | 'pdf' | 'all';
}

export const DEFAULT_SETTINGS: CommandCenterSettings = {
	rootPath: '',
	excludedPaths: [],
	recentFileLimit: 8,
	defaultDepth: 2,
	defaultFileType: 'markdown',
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
	const defaultDepth = typeof data?.defaultDepth === 'number' && validDepths.includes(data.defaultDepth)
		? data.defaultDepth
		: DEFAULT_SETTINGS.defaultDepth;
	const validFileTypes = new Set<CommandCenterSettings['defaultFileType']>(['markdown', 'attachments', 'excalidraw', 'drawio', 'image', 'video', 'audio', 'pdf', 'all']);
	const candidateFileType = data?.defaultFileType;
	const defaultFileType = candidateFileType && validFileTypes.has(candidateFileType) ? candidateFileType : DEFAULT_SETTINGS.defaultFileType;
	return { rootPath, excludedPaths, recentFileLimit, defaultDepth, defaultFileType };
}

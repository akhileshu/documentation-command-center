import { App, PluginSettingTab, Setting } from 'obsidian';
import type DocumentationCommandCenter from './main';

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
	const defaultFileType = validFileTypes.has(data?.defaultFileType ?? 'markdown') ? data!.defaultFileType! : DEFAULT_SETTINGS.defaultFileType;
	return { rootPath, excludedPaths, recentFileLimit, defaultDepth, defaultFileType };
}

export class CommandCenterSettingTab extends PluginSettingTab {
	plugin: DocumentationCommandCenter;

	constructor(app: App, plugin: DocumentationCommandCenter) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Root folder')
			.setDesc('Leave empty to include the entire vault.')
			.addText(text => text
				.setPlaceholder('Entire vault')
				.setValue(this.plugin.settings.rootPath)
				.onChange(async value => {
					this.plugin.settings.rootPath = value.trim().replace(/^\/+|\/+$/g, '');
					await this.plugin.saveSettings();
					this.plugin.refreshViews();
				}));

		new Setting(containerEl)
			.setName('Excluded paths')
			.setDesc('One vault-relative folder or file path per line.')
			.addTextArea(text => text
				.setPlaceholder('Archive, private')
				.setValue(this.plugin.settings.excludedPaths.join('\n'))
				.onChange(async value => {
					this.plugin.settings.excludedPaths = value.split(/\r?\n/).map(path => path.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean);
					await this.plugin.saveSettings();
					this.plugin.refreshViews();
				}));

		new Setting(containerEl)
			.setName('Recently updated limit')
			.setDesc('Number of recently updated files shown on the dashboard.')
			.addText(text => {
				text.inputEl.type = 'number';
				text.setValue(String(this.plugin.settings.recentFileLimit));
				text.onChange(async value => {
					const limit = Number.parseInt(value, 10);
					if (!Number.isFinite(limit) || limit < 1) return;
					this.plugin.settings.recentFileLimit = Math.min(limit, 50);
					await this.plugin.saveSettings();
					this.plugin.refreshViews();
				});
				return text;
			});

		new Setting(containerEl)
			.setName('Default expansion depth')
			.setDesc('The tree depth used when the dashboard opens.')
			.addDropdown(dropdown => dropdown
				.addOptions({ '0': 'Collapse all', '1': 'Level 1', '2': 'Level 2', '3': 'Level 3', 'Infinity': 'All' })
				.setValue(this.plugin.settings.defaultDepth === Infinity ? 'Infinity' : String(this.plugin.settings.defaultDepth))
				.onChange(async value => {
					this.plugin.settings.defaultDepth = value === 'Infinity' ? Infinity : Number(value);
					await this.plugin.saveSettings();
					this.plugin.refreshViews();
				}));

		new Setting(containerEl)
			.setName('Default file type')
			.setDesc('The file type selected when the dashboard opens.')
			.addDropdown(dropdown => dropdown
				.addOptions({ markdown: 'Markdown', attachments: 'All attachments', excalidraw: 'Excalidraw', drawio: 'Draw.io', image: 'Images', video: 'Video', audio: 'Audio', pdf: 'PDF', all: 'All files' })
				.setValue(this.plugin.settings.defaultFileType)
				.onChange(async value => {
					this.plugin.settings.defaultFileType = value as CommandCenterSettings['defaultFileType'];
					await this.plugin.saveSettings();
					this.plugin.refreshViews();
				}));
	}
}

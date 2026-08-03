import { App, PluginSettingTab, Setting } from 'obsidian';
import type DocumentationCommandCenter from './main';
import { CommandCenterSettings, SavedList } from './settings-model';

export { DEFAULT_SETTINGS, normalizeSettings } from './settings-model';
export type { CommandCenterSettings } from './settings-model';

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

		new Setting(containerEl)
			.setName('Saved dataview lists')
			.setDesc('Manage list queries shown in the my lists dashboard tab. Dataview must be enabled to run them.');
		const listsContainer = containerEl.createDiv('dcc-settings-lists');
		for (const list of this.plugin.settings.savedLists) {
			this.renderSavedList(listsContainer, list);
		}

		let newTitle = '';
		let newQuery = '';
		new Setting(containerEl)
			.setName('Add a list')
			.addText(text => text.setPlaceholder('List title').onChange(value => { newTitle = value; }))
			.addTextArea(text => text.setPlaceholder('```dataview\nLIST\nFROM #tag\nSORT file.name ASC\n```').onChange(value => { newQuery = value; }))
			.addButton(button => button.setButtonText('Add list').setCta().onClick(async () => {
				const title = newTitle.trim();
				const query = newQuery.trim();
				if (!title || !query) return;
				const list: SavedList = { id: `list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, query };
				this.plugin.settings.savedLists.push(list);
				await this.plugin.saveSettings();
				this.display();
			}));
	}

	private renderSavedList(container: HTMLElement, list: SavedList): void {
		new Setting(container)
			.setName(list.title)
			.setDesc('Dataview list query')
			.addText(text => text.setValue(list.title).onChange(async value => {
				const title = value.trim();
				if (!title) return;
				list.title = title;
				await this.plugin.saveSettings();
				this.plugin.refreshViews();
			}))
			.addTextArea(text => text.setValue(list.query).onChange(async value => {
				list.query = value.trim();
				await this.plugin.saveSettings();
				this.plugin.refreshViews();
			}))
			.addButton(button => button.setButtonText('Delete').setWarning().onClick(async () => {
				this.plugin.settings.savedLists = this.plugin.settings.savedLists.filter(candidate => candidate.id !== list.id);
				await this.plugin.saveSettings();
				this.display();
			}));
	}
}

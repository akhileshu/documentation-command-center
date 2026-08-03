import { Plugin, TFile } from 'obsidian';
import { CommandCenterView, VIEW_TYPE_COMMAND_CENTER } from './dashboard-view';
import { CommandCenterSettingTab, CommandCenterSettings, normalizeSettings } from './settings';
import { reconcileBookmarkPaths } from './settings-model';
import type { DataviewApiLike } from './dataview-list';

export default class DocumentationCommandCenter extends Plugin {
	settings!: CommandCenterSettings;

	async onload(): Promise<void> {
		this.registerHoverLinkSource('documentation-command-center', {
			display: 'Documentation Command Center',
			defaultMod: false,
		});
		this.settings = normalizeSettings((await this.loadData()) as Partial<CommandCenterSettings>);
		this.registerView(VIEW_TYPE_COMMAND_CENTER, leaf => new CommandCenterView(
			leaf,
			this.settings,
			() => this.app.vault.getFiles(),
			() => { void this.saveSettings(); },
			() => this.getDataviewApi(),
		));

		this.addRibbonIcon('layout-dashboard', 'Open documentation command center', () => void this.openDashboard());
		this.addCommand({ id: 'open-dashboard', name: 'Open dashboard', callback: () => void this.openDashboard() });
		this.addCommand({ id: 'refresh-dashboard', name: 'Refresh dashboard', callback: () => this.refreshViews() });
		this.addSettingTab(new CommandCenterSettingTab(this.app, this));

		this.registerEvent(this.app.vault.on('create', () => this.refreshViews()));
		this.registerEvent(this.app.vault.on('modify', () => this.refreshViews()));
		this.registerEvent(this.app.vault.on('delete', file => {
			this.settings.bookmarkedPaths = reconcileBookmarkPaths(this.settings.bookmarkedPaths, file.path, null);
			void this.saveSettings();
			this.refreshViews();
		}));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			this.settings.bookmarkedPaths = reconcileBookmarkPaths(this.settings.bookmarkedPaths, oldPath, file.path);
			void this.saveSettings();
			this.refreshViews();
		}));
		this.registerEvent(this.app.metadataCache.on('resolved', () => this.refreshViews()));
	}

	async openDashboard(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_COMMAND_CENTER)[0];
		if (existing) {
			await this.app.workspace.revealLeaf(existing);
			return;
		}
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: VIEW_TYPE_COMMAND_CENTER, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_COMMAND_CENTER)) {
			const view = leaf.view;
			if (view instanceof CommandCenterView) view.refresh();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private getDataviewApi(): DataviewApiLike | null {
		const plugins = (this.app as unknown as { plugins?: { getPlugin(id: string): unknown } }).plugins;
		const dataview = plugins?.getPlugin('dataview') as { api?: DataviewApiLike } | undefined;
		return dataview?.api ?? null;
	}
}

export function isMarkdownFile(file: TFile): boolean {
	return file.extension.toLocaleLowerCase() === 'md';
}

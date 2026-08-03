import type { VaultFile } from './domain';

export interface ParsedDataviewListQuery {
	source: string;
	sortDirection: 'asc' | 'desc';
}

export interface DataviewApiLike {
	pages(source: string): { array(): unknown[] };
}

function queryLines(query: string): string[] {
	const trimmed = query.trim();
	const fenced = trimmed.match(/^```dataview\s*([\s\S]*?)\s*```$/i);
	return (fenced?.[1] ?? trimmed).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

export function parseDataviewListQuery(query: string): ParsedDataviewListQuery {
	const lines = queryLines(query);
	if (lines[0]?.toLocaleUpperCase() !== 'LIST') throw new Error('Only the LIST query form is supported.');
	if (lines.length < 2) throw new Error('A LIST query requires a FROM source.');
	const from = lines[1]?.match(/^FROM\s+(.+)$/i);
	if (!from?.[1]?.trim()) throw new Error('A LIST query requires a FROM source.');
	let sortDirection: ParsedDataviewListQuery['sortDirection'] = 'asc';
	for (const line of lines.slice(2)) {
		const sort = line.match(/^SORT\s+file\.name(?:\s+(ASC|DESC))?$/i);
		if (sort) {
			sortDirection = sort[1]?.toLocaleLowerCase() === 'desc' ? 'desc' : 'asc';
			continue;
		}
		if (/^LIST\b/i.test(line)) throw new Error('Only the LIST query form is supported.');
		throw new Error(`Unsupported Dataview list clause: ${line}`);
	}
	return { source: from[1].trim(), sortDirection };
}

export function resolveDataviewListFiles(api: DataviewApiLike, query: string, files: VaultFile[]): VaultFile[] {
	const parsed = parseDataviewListQuery(query);
	const paths = new Set(api.pages(parsed.source).array().map(page => {
		const candidate = page as { file?: { path?: unknown } };
		return typeof candidate.file?.path === 'string' ? candidate.file.path : null;
	}).filter((path): path is string => path !== null));
	return files
		.filter(file => paths.has(file.path))
		.sort((a, b) => {
			const result = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
			return parsed.sortDirection === 'desc' ? -result : result;
		});
}

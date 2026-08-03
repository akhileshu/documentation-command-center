import { describe, expect, it } from 'vitest';
import { parseDataviewListQuery, resolveDataviewListFiles } from '../src/dataview-list';

const files = [
	{ path: 'docs/go.md', name: 'go.md', extension: 'md', stat: { mtime: 10, size: 10 } },
	{ path: 'docs/js.md', name: 'js.md', extension: 'md', stat: { mtime: 20, size: 10 } },
];

describe('Dataview list queries', () => {
	it('parses a fenced LIST query with a source and sort direction', () => {
		expect(parseDataviewListQuery('```dataview\nLIST\nFROM #go\nSORT file.name ASC\n```'))
			.toEqual({ source: '#go', sortDirection: 'asc' });
	});

	it('rejects unsupported query clauses', () => {
		expect(() => parseDataviewListQuery('LIST file.name\nFROM #go')).toThrow('Only the LIST query form is supported');
		expect(() => parseDataviewListQuery('LIST\nFROM #go\nWHERE file.name = "go.md"')).toThrow('Unsupported Dataview list clause');
	});

	it('resolves Dataview pages back to vault files', () => {
		const api = { pages: () => ({ array: () => [{ file: { path: 'docs/js.md' } }, { file: { path: 'missing.md' } }] }) };
		expect(resolveDataviewListFiles(api, 'LIST\nFROM #go', files).map(file => file.path)).toEqual(['docs/js.md']);
	});
});

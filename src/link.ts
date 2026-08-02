export interface InternalLinkAttributes {
	className: string;
	href: string;
	dataHref: string;
	title: string;
}

export function internalLinkAttributes(path: string): InternalLinkAttributes {
	return {
		className: 'internal-link doc-command-center-link',
		href: path,
		dataHref: path,
		title: path,
	};
}

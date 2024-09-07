export function Meta() {
	return {
		layout: 'minimal.hbs',
	}
}

export function Header() {
	return {
		title: 'Alphabet Number',
		content: `
			<link rel="stylesheet" href="./alphabet-number.css" />
			<script defer src="./alphabet-number.js"></script>
		`,
	}
}

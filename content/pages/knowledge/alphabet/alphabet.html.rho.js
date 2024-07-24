export function Meta() {
	return {
		layout: 'minimal.hbs',
	}
}

export function Header() {
	return {
		title: 'Alphabet',
		content: `
			<link rel="stylesheet" href="./alphabet.css" />
			<script src="./alphabet.js"></script>
		`,
	}
}

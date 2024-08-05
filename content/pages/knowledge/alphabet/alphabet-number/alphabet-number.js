const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const mainEl = document.querySelector('main')
const letterEl = document.querySelector('.letter')
const correctEl = document.querySelector('.correct')
const inputEl = document.querySelector('.input')

function generateNumber() {
	const letter = Math.floor(Math.random() * 26)

	letterEl.textContent = alphabet[letter]
}

const formEl = document.querySelector('.form')
formEl.addEventListener('submit', (ev) => {
	ev.preventDefault()
	const letterIndex = inputEl.value
	if (
		letterIndex < 1 ||
		letterIndex > 26 ||
		alphabet[letterIndex - 1] !== letterEl.textContent
	) {
		const correctEl = document.querySelector('.correct')
		correctEl.textContent = 0
		mainEl.classList.add('red')
		setTimeout(() => {
			mainEl.classList.remove('red')
		}, 100)
	} else {
		correctEl.textContent = Number(correctEl.textContent) + 1
	}
	inputEl.value = ''
	generateNumber()
})

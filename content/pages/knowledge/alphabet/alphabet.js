let currentLetter = ''

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
function promptAnswer() {
	const promptEl = document.querySelector('.prompt')
	const letter = alphabet[Math.floor(Math.random() * alphabet.length)]
	currentLetter = letter
	promptEl.textContent = `Where is the letter ${letter}?`
}

document.addEventListener('DOMContentLoaded', () => {
	const alphabetEl = document.querySelector('.alphabet')

	for (const letter of alphabet) {
		const letterEl = document.createElement('div')
		letterEl.classList.add('letter')
		letterEl.setAttribute('data-letter', letter)
		letterEl.textContent = letter
		alphabetEl.appendChild(letterEl)

		if (['D', 'L', 'T'].includes(letter)) {
			const letterEl = document.createElement('div')
			alphabetEl.appendChild(letterEl)
		}
	}

	promptAnswer()
})

const alphabetMainEl = document.querySelector('.alphabet-main')
alphabetMainEl.addEventListener('click', (event) => {
	const letterEl = event.target.closest('.letter')
	if (!letterEl) return

	const letter = letterEl.getAttribute('data-letter')
	if (currentLetter === letter) {
		const totalEl = document.querySelector('.total')
		totalEl.innerHTML = Number(totalEl.innerHTML) + 1
		promptAnswer()
	} else {
		const alphabetMainEl = document.querySelector('.alphabet-main')
		alphabetMainEl.classList.add('red')
		setTimeout(() => {
			alphabetMainEl.classList.remove('red')
		}, 100)
		const totalEl = document.querySelector('.total')
		totalEl.innerHTML = 0
	}
})

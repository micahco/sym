const puppeteer = require('puppeteer');

(async () => {
	const browser = await puppeteer.launch()
	const page = await browser.newPage()

	const URL = 'https://rateyourmusic.com/release/album/friendzone/dx-vol-2/'
	console.log('GOTO: ' + URL)
	await page.goto(URL)

	let data = []
	while (true) {
		let newResults = await page.evaluate(() => {
			let results = []
			let catalog = document.querySelectorAll('.catalog_line')
			catalog.forEach((catalog_line) => {
				results.push({
					user: catalog_line.querySelector('div.catalog_header > span.catalog_user > a').textContent,
					rating: catalog_line.querySelector('div.catalog_header > span.catalog_rating > img').getAttribute('title').replace(' stars', ''),
				})
			})
			return results
		})
		data = data.concat(newResults)
		if (await page.$('a.navlinknext') == null) {
			break
		}
		let navlinkcurrent = await page.$eval('.navlinkcurrent', el => el.textContent)
		await page.$eval('a.navlinknext', elem => (elem).click());
		await page.waitForFunction(`document.querySelector('.navlinkcurrent').textContent != ${navlinkcurrent}`);
	}
	console.log(data)

	console.log('closing browser')
	await browser.close()
})();
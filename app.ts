import { launch } from 'puppeteer';

interface UserRating {
	user: string | null;
	stars: number;
}

interface ReleaseData {
	URL: string | null;
	title: string | null;
	artist: string | null;
	userRatings: UserRating[];
}

interface Rating {
	URL: string | null;
	title: string | null;
	artist: string | null;
	stars: number;
}

// max number of rating page iterations (15 ratings per page)
const PAGE_INDEX_LIMITER: number = 10;

(async () => {
	const URLs: string[] = [
		'https://rateyourmusic.com/release/unauth/hank-williams-iii/boot-2/',
		'https://rateyourmusic.com/release/unauth/hank-williams-iii/boot-3/'
	];

	let userKey: any[] = [];
	let ratings: Rating[][] = []
	for (const URL of URLs) {
		const release: ReleaseData = await getRelease(URL);
		for (const ur of release.userRatings) {
			const r: Rating = {
				URL: release.URL,
				title: release.title,
				artist: release.artist,
				stars: ur.stars
			}
			const indexOfUser = userKey.indexOf(ur.user);
			if (indexOfUser === -1) {
				userKey.push(ur.user)
				ratings.push([r])
			} else {
				ratings[indexOfUser].push(r)
			}
		}
	}

})();

async function getRelease(URL: string): Promise<ReleaseData> {

	// launch puppeteer
	const browser = await launch();
	const page = await browser.newPage();
	console.log(`scraping: ${URL}`);
	await page.goto(URL);

	// scrape pages for user ratings
	let userRatings: UserRating[] = [];
	let pageIndex = 1;
	while (pageIndex < PAGE_INDEX_LIMITER) {

		// get this page user ratings
		let pageUserRatings: UserRating[] = await page.evaluate(() => {
			let data: UserRating[] = [];
			document.querySelectorAll('.catalog_line').forEach((el: Element) => {
				const ur: UserRating = {
					user: el.querySelector('div.catalog_header > span.catalog_user > a')!.textContent,
					stars: parseFloat(el.querySelector('div.catalog_header > span.catalog_rating > img')!.getAttribute('title')!.replace(' stars', ''))
				}
				data.push(ur);
			})
			return data;
		})
		userRatings = userRatings.concat(pageUserRatings);

		// check if next page exists
		if (await page.$('a.navlinknext') == null) {
			break;
		}

		// get current page number
		let navlinkcurrent = await page.$eval('.navlinkcurrent', (el: any) => el.textContent);

		// click next page button
		await page.$eval('a.navlinknext', (el: any) => (el).click());

		// wait for page to change
		await page.waitForFunction(`document.querySelector('.navlinkcurrent').textContent != ${navlinkcurrent}`);

		pageIndex++;
	}

	// scrape release information from page
	const title = await page.$eval('div.album_title', (el: any) => el.innerText);
	const artist = await page.$eval('a.artist', (el: any) => el.innerText);

	// close puppeteer
	await browser.close();

	return { URL, title, artist, userRatings };
}
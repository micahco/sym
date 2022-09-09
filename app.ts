import { launch } from 'puppeteer';

interface CatalogLine {
	username: string | null;
	stars: number;
}

interface Release {
	url: string | null;
	title: string | null;
	artist: string | null;
}

interface CatalogData {
	release: Release;
	catalogLines: CatalogLine[];
}

interface Rating {
	release: Release;
	stars: number;
}

class App {
	private catalog: CatalogData[];
	private pageIndexLimiter: number;
	private urls: string[];

	constructor(pageIndexLimiter: number) {
		this.catalog = [];
		this.pageIndexLimiter = pageIndexLimiter;
		this.urls = [
			'https://rateyourmusic.com/release/unauth/hank-williams-iii/boot-2/',
			'https://rateyourmusic.com/release/unauth/hank-williams-iii/boot-3/'
		];
	}

	public async run(): Promise<void> {
		for (const url of this.urls) {
			await this.scrape(url);
		}
		this.parse()
	}

	private async scrape(url: string): Promise<void> {

		// launch puppeteer
		const browser = await launch();
		const page = await browser.newPage();
		console.log(`scraping: ${url}`);
		await page.goto(url);
	
		// scrape pages for data
		let catalogLines: CatalogLine[] = [];
		let pageIndex = 1;
		while (pageIndex < this.pageIndexLimiter) {
	
			// page data
			let pageCatalogLines: CatalogLine[] = await page.evaluate(() => {
				let data: CatalogLine[] = [];
				document.querySelectorAll('.catalog_line').forEach((el: Element) => {
					const cl: CatalogLine = {
						username: el.querySelector('div.catalog_header > span.catalog_user > a')!.textContent,
						stars: parseFloat(el.querySelector('div.catalog_header > span.catalog_rating > img')!.getAttribute('title')!.replace(' stars', ''))
					}
					data.push(cl);
				})
				return data;
			})
			catalogLines = catalogLines.concat(pageCatalogLines);
	
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
		const release = { url, title, artist }
	
		// close puppeteer
		await browser.close();
	
		this.catalog.push({ release, catalogLines });
	}

	private parse(): void {
		let userKey: any[] = [];
		let ratings: Rating[][] = []
		for (const cd of this.catalog) {
			for (const cl of cd.catalogLines) {
				const r: Rating = {
					release: cd.release,
					stars: cl.stars
				}
				const indexOfUser = userKey.indexOf(cl.username);
				if (indexOfUser === -1) {
					userKey.push(cl.username)
					ratings.push([r])
				} else {
					ratings[indexOfUser].push(r)
				}
			}
		}
		console.log(userKey)
	}
}

let app = new App(10);
app.run();
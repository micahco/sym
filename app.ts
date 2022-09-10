import * as fs from 'fs';
import * as readline from 'readline';
import { stdout } from 'process';
import { launch } from 'puppeteer';
// adblock
import { PuppeteerBlocker } from '@cliqz/adblocker-puppeteer';
import fetch from 'cross-fetch';

interface Config {
	pageLimit: number;
	matchCount: number;
}

interface CatalogLine {
	username: string;
	stars: number;
}

interface CatalogData {
	release: Release;
	catalogLines: CatalogLine[];
}

interface Release {
	url: string;
	title: string;
	artist: string;
}

interface Rating {
	release: Release;
	stars: number;
}

declare const RYMmediaPage: any;

class App {
	private cfg: Config;
	private urls: string[];
	private catalog: CatalogData[];
	private userData: Map<string, Rating[]>;
	private matchData: Map<string, Rating[]> | null;

	constructor(cfg: Config) {
		this.cfg = cfg;
		this.urls = [];
		this.catalog = [];
		this.userData = new Map();
		this.matchData = null;
	}

	public async run(): Promise<void> {
		await this.read();
		for (const url of this.urls) {
			await this.scrape(url);
		}
		this.parse();
		this.analyze();
		console.log(this.matchData);
	}

	private async read() {
		const fileStream = fs.createReadStream('urls.txt');
		const rl = readline.createInterface({
			input: fileStream,
			crlfDelay: Infinity
		});
		for await (const line of rl) {
			this.urls.push(line)
		}
	}

	private async scrape(url: string): Promise<void> {

		// launch puppeteer
		const browser = await launch( {headless: true} );
		const page = await browser.newPage();

		// adblock
		PuppeteerBlocker.fromPrebuiltAdsAndTracking(fetch).then((blocker) => {
			blocker.enableBlockingInPage(page);
		});

		// open url
		console.log(`${url}`);	
		await page.goto(url, { waitUntil: "domcontentloaded" });

		// scrape release information from page
		const id = await page.$eval('input.album_shortcut', (el: any) => el.value.replace(/[^0-9]/g, ''))
		const title = await page.$eval('div.album_title', (el: any) => el.innerText);
		const artist = await page.$eval('a.artist', (el: any) => el.innerText);
		const release = { url, title, artist }
		
		// scrape pages for data
		let catalogLines: CatalogLine[] = [];
		let pageIndex = 1;
		while (pageIndex <= this.cfg.pageLimit) {
			stdout.write(`Scraping page ${pageIndex}\r`);

			// page data
			let pageCatalogLines: CatalogLine[] = await page.evaluate(() => {
				let data: CatalogLine[] = [];
				document.querySelectorAll('.catalog_line').forEach((el: Element) => {
					const cl: CatalogLine = {
						username: el.querySelector('div.catalog_header > span.catalog_user > a')!.textContent as string,
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

			// go to next page
			const nextPage = '/' + (pageIndex + 1);
			await page.evaluate((id, nextPage)=> {
				RYMmediaPage.navCatalog('l', id, true, 'ratings', nextPage);
			}, id, nextPage)
	
			// wait for page to change
			const sel = '#catalog_list > span > span.navlinkcurrent';
			await page.waitForFunction((cur, sel) => {
				return document.querySelector(sel)?.textContent != cur
			}, 
				{polling: 'mutation'}, pageIndex.toString(), sel);

			pageIndex++;
		}
		console.log('\ndone');
	
		// close puppeteer
		await browser.close();
		this.catalog.push({ release, catalogLines });
	}

	private parse(): void {
		for (const cd of this.catalog) {
			for (const cl of cd.catalogLines) {
				const r: Rating = {
					release: cd.release,
					stars: cl.stars
				}
				let user = cl.username;
				let ratings = [r];
				if (this.userData.has(user)) {
					ratings = ratings.concat(this.userData.get(user) as Rating[]);
				}
				this.userData.set(user, ratings)
			}
		}
	}

	private analyze(): void {
		this.matchData = new Map(
			Array.from(this.userData).filter(([user, ratings]) => {
				return ratings.length > this.cfg.matchCount;
			})
		);
	}
}

(async () => {
	console.time('total')
	const app = new App({
		pageLimit: 10,
		matchCount: 1
	});
	await app.run();
	console.timeEnd('total');
})();
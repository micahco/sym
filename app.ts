import fs from 'fs';
import readline from 'readline';
import { stdout } from 'process';
import { setTimeout } from "timers/promises";
import fetch from 'cross-fetch';
import { launch, Page } from 'puppeteer';
import { PuppeteerBlocker } from '@cliqz/adblocker-puppeteer';

interface Config {
	pageLimit: number;
	sameUserRatings: number;
}

interface CatalogLine {
	username: string;
	stars: number;
}

interface CatalogData {
	title: string;
	artist: string;
	catalogLines: CatalogLine[];
}

interface Rating {
	title: string;
	artist: string;
	stars: number;
}

declare const RYMmediaPage: any;

class App {
	private cfg: Config;

	constructor(cfg: Config) {
		this.cfg = cfg;
	}

	public async run(): Promise<void> {

		// launch puppeteer
		const browser = await launch({
			headless: true,
			args: ['--disable-gpu', '--no-sandbox', '--lang=en-US', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
		});
		const page = await browser.newPage();

		// adblock
		PuppeteerBlocker.fromPrebuiltAdsAndTracking(fetch).then((blocker) => {
			blocker.enableBlockingInPage(page);
		});

		// get urls from txt
		const urls = await this.getLinesFromFile('urls.txt');
		
		// scrape catalog data from each url
		const catalog = []
		for (const url of urls) {
			const cd = await this.getCatalogData(page, url);
			catalog.push(cd);
		}

		// close puppeteer
		await browser.close();

		// generate data
		const data = this.parseCatalog(catalog);
		const arr = this.filterDataToArray(data);
		const json = JSON.stringify(arr, null, '\t');
		fs.writeFileSync('data.json', json);
		console.log('saved: data.json')
	}

	private async getLinesFromFile(filename: string): Promise<string[]> {
		const fileStream = fs.createReadStream(filename);
		const rl = readline.createInterface({
			input: fileStream,
			crlfDelay: Infinity
		});
		const lines: string[] = [];
		for await (const line of rl) {
			lines.push(line)
		}
		return lines;
	}

	private async getCatalogData(page: Page, url: string): Promise<CatalogData> {

		// open url;	
		await page.goto(url, {
			waitUntil: 'load', 
			timeout: 90000
		});

		// scrape release information
		const title = await page.$eval('div.album_title', (el: any) => el.innerText);
		const artist = await page.$eval('a.artist', (el: any) => el.innerText);
		console.log(`scraping: ${artist} - ${title}`);
		
		// scrape pages for data
		let catalogLines: CatalogLine[] = [];
		let pageIndex = 1;
		while (pageIndex <= this.cfg.pageLimit) {
			stdout.write(`page ${pageIndex}\r`);

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
			await page.evaluate(() => {
				const sel = '#catalog_list > span > a.navlinknext';
				const btn = document.querySelector(sel) as HTMLElement;
				btn.click();
			});
	
			// wait for page to change
			const sel = '#catalog_list > span > span.navlinkcurrent';
			await page.waitForFunction((cur, sel) => {
				return document.querySelector(sel)?.textContent != cur
			}, {
				timeout: 5000,
				polling: 'mutation'
			}, pageIndex.toString(), sel)
				.catch(() => {
					// timeout bug
					console.log(`error: not responding [${pageIndex}]`);
					pageIndex = Infinity;
				});

			pageIndex++;
		}
		stdout.write(`\t\u2705\r`); //	✔
		return { title, artist, catalogLines };
	}

	private parseCatalog(catalog: CatalogData[]): Map<string, Rating[]> {
		const data: Map<string, Rating[]> = new Map();
		for (const cd of catalog) {
			for (const cl of cd.catalogLines) {
				const newRating: Rating = {
					title: cd.title,
					artist: cd.artist,
					stars: cl.stars
				}
				let user = cl.username;
				let newRatingList = [newRating];
				if (data.has(user)) {
					const oldRatingList = data.get(user) as Rating[];
					// check if rating is duplicate
					for (const oldRating of oldRatingList) {
						if (oldRating.title == newRating.title) {
							newRatingList = [];
							break;
						}
					}
					newRatingList = newRatingList.concat(oldRatingList);
				}
				data.set(user, newRatingList)
			}
		}
		return data;
	}

	private filterDataToArray(data: Map<string, Rating[]>): [string, Rating[]][] {
		return Array.from(data).filter(([user, ratings]) => {
			return ratings.length >= this.cfg.sameUserRatings;
		})
	}
}

(async () => {
	console.time('total')
	const app = new App({
		pageLimit: 200,
		sameUserRatings: 2
	});
	await app.run();
	console.timeEnd('total');
})();
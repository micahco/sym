"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer_1 = require("puppeteer");
// max number of rating page iterations (15 ratings per page)
const PAGE_INDEX_LIMITER = 10;
(() => __awaiter(void 0, void 0, void 0, function* () {
    const URLs = [
        'https://rateyourmusic.com/release/unauth/hank-williams-iii/boot-2/',
        'https://rateyourmusic.com/release/unauth/hank-williams-iii/boot-3/'
    ];
    let userKey = [];
    let ratings = [];
    for (const URL of URLs) {
        const release = yield getRelease(URL);
        for (const ur of release.userRatings) {
            const r = {
                URL: release.URL,
                title: release.title,
                artist: release.artist,
                stars: ur.stars
            };
            const indexOfUser = userKey.indexOf(ur.user);
            if (indexOfUser === -1) {
                userKey.push(ur.user);
                ratings.push([r]);
            }
            else {
                ratings[indexOfUser].push(r);
            }
        }
    }
}))();
function getRelease(URL) {
    return __awaiter(this, void 0, void 0, function* () {
        // launch puppeteer
        const browser = yield (0, puppeteer_1.launch)();
        const page = yield browser.newPage();
        console.log(`scraping: ${URL}`);
        yield page.goto(URL);
        // scrape pages for user ratings
        let userRatings = [];
        let pageIndex = 1;
        while (pageIndex < PAGE_INDEX_LIMITER) {
            // get this page user ratings
            let pageUserRatings = yield page.evaluate(() => {
                let data = [];
                document.querySelectorAll('.catalog_line').forEach((el) => {
                    const ur = {
                        user: el.querySelector('div.catalog_header > span.catalog_user > a').textContent,
                        stars: parseFloat(el.querySelector('div.catalog_header > span.catalog_rating > img').getAttribute('title').replace(' stars', ''))
                    };
                    data.push(ur);
                });
                return data;
            });
            userRatings = userRatings.concat(pageUserRatings);
            // check if next page exists
            if ((yield page.$('a.navlinknext')) == null) {
                break;
            }
            // get current page number
            let navlinkcurrent = yield page.$eval('.navlinkcurrent', (el) => el.textContent);
            // click next page button
            yield page.$eval('a.navlinknext', (el) => (el).click());
            // wait for page to change
            yield page.waitForFunction(`document.querySelector('.navlinkcurrent').textContent != ${navlinkcurrent}`);
            pageIndex++;
        }
        // scrape release information from page
        const title = yield page.$eval('div.album_title', (el) => el.innerText);
        const artist = yield page.$eval('a.artist', (el) => el.innerText);
        // close puppeteer
        yield browser.close();
        return { URL, title, artist, userRatings };
    });
}

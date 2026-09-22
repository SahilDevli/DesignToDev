const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const w of [1482, 1024, 768, 375, 320, 1920]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.goto('http://localhost:5199/');
    await p.waitForSelector('main'); await p.waitForTimeout(2500);
    const r = await p.evaluate(() => {
      const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x*10)/10, Math.round((r.y+scrollY)*10)/10, Math.round(r.width*10)/10, Math.round(r.height*10)/10]; };
      const all = (s) => [...document.querySelectorAll(s)].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.x*10)/10, Math.round((r.y+scrollY)*10)/10, Math.round(r.width*10)/10, Math.round(r.height*10)/10]; });
      return { doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], nav: q('header'), h1: q('h1'), h2: all('main h2'), band: q('main section:nth-of-type(2) > div:last-child'), cards: all('article'), media: all('figure > div:first-child'), cardsR: all('figure > div:last-child'), quotes: all('blockquote'), authors: all('figcaption'), footer: q('footer') };
    });
    console.log(w, JSON.stringify(r));
    await p.screenshot({ path: `.figma-tmp/home/built-${w}.png`, fullPage: true });
    await p.close();
  }
  await b.close();
})();

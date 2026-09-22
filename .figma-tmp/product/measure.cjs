const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const w of [1440, 1920, 1024, 1100, 768, 375, 320]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.goto('http://localhost:5198/');
    await p.waitForSelector('main'); await p.waitForTimeout(2500);
    const r = await p.evaluate(() => {
      const f = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x*10)/10, Math.round((r.y+scrollY)*10)/10, Math.round(r.width*10)/10, Math.round(r.height*10)/10]; };
      const q = (s) => { const e = document.querySelector(s); return e ? f(e) : null; };
      const all = (s) => [...document.querySelectorAll(s)].map(f);
      const cards = all('article');
      return { doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], nav: q('header'), search: q('form[role=search]'), h2: all('main h2'), cards: [cards[0], cards[1], cards[4], cards[8], cards[15]], img: q('main img[alt*=sofa]'), text: q('main section p'), btns: all('main section:nth-of-type(2) button'), footer: q('footer') };
    });
    console.log(w, JSON.stringify(r));
    await p.screenshot({ path: `.figma-tmp/product/built-${w}.png`, fullPage: true });
    await p.close();
  }
  await b.close();
})();

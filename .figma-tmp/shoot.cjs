const {chromium}=require('playwright');
const path=require('path');
(async()=>{
  const b=await chromium.launch();
  const url='http://localhost:5599/index.html';
  for(const [name,w] of [['1482',1482],['1440',1440],['1024',1024],['768',768],['375',375]]){
    const p=await b.newPage({viewport:{width:w,height:1000},deviceScaleFactor:1});
    await p.goto(url,{waitUntil:'networkidle'});
    await p.evaluate(()=>document.fonts.ready);
    await p.waitForTimeout(600);
    const docW=await p.evaluate(()=>document.documentElement.scrollWidth);
    const docH=await p.evaluate(()=>document.documentElement.scrollHeight);
    console.log(name,'scrollWidth',docW,'height',docH,'overflow:',docW>w?'YES!!':'no');
    if(name==='1482'||name==='375')await p.screenshot({path:`.figma-tmp/built-${name}.png`,fullPage:true});
    if(name==='1440'){
      const m=await p.evaluate(()=>{
        const r=el=>{if(!el)return null;const b=el.getBoundingClientRect();return `${Math.round(b.x)},${Math.round(b.y+window.scrollY)} ${Math.round(b.width)}x${Math.round(b.height)}`;};
        const q=s=>document.querySelector(s);
        const all=s=>document.querySelectorAll(s);
        return {
          nav:r(q('header')),
          hero:r(q('section')),
          h1:r(q('h1')),
          h2a:r(all('h2')[0]),
          band:r(q('[class*=productsBand]')),
          grid:r(q('[class*=productGrid]')),
          card1:r(all('article')[0]),
          card2:r(all('article')[1]),
          h2b:r(all('h2')[1]),
          rev1:r(all('li[class*=homePage__review_]')[0]),
          rev1img:r(all('[class*=reviewImage]')[0]),
          rev1card:r(all('[class*=reviewCard]')[0]),
          rev2img:r(all('[class*=reviewImage]')[1]),
          rev2card:r(all('[class*=reviewCard]')[1]),
          rev3:r(all('li[class*=homePage__review_]')[2]),
          footer:r(q('footer')),
          doc:r(document.body),
        };
      });
      console.log(JSON.stringify(m,null,1));
    }
    await p.close();
  }
  await b.close();
})();

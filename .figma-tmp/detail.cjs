const fs=require('fs');
const j=JSON.parse(fs.readFileSync('.figma-tmp/screen.json','utf8'));
const root=j.nodes['376:556'].document;
const c=x=>x?`rgba(${Math.round(x.r*255)},${Math.round(x.g*255)},${Math.round(x.b*255)},${+(x.a??1).toFixed(2)})`:'';
function fills(n){return (n.fills||[]).map(f=>f.type==='IMAGE'?`IMAGE:${f.imageRef} ${f.scaleMode}`:f.type==='SOLID'?`${c(f.color)}${f.opacity!==undefined&&f.opacity!==1?' o'+f.opacity:''}`:f.type).join(' | ');}
function walk(n,d,path){
  const pad='  '.repeat(d);
  const b=n.absoluteBoundingBox;
  let s=`${pad}${n.type} "${n.name}" ${b?`${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}`:''}`;
  const f=fills(n); if(f)s+=`\n${pad}   fill: ${f}`;
  if(n.strokes&&n.strokes.length)s+=`\n${pad}   stroke: ${n.strokes.map(x=>c(x.color)).join(',')} w:${n.strokeWeight} align:${n.strokeAlign}`;
  if(n.cornerRadius!==undefined)s+=`\n${pad}   radius: ${n.cornerRadius}`;
  if(n.rectangleCornerRadii)s+=`\n${pad}   radii: ${n.rectangleCornerRadii.join('/')}`;
  if(n.effects&&n.effects.length)s+=`\n${pad}   effects: ${n.effects.map(e=>`${e.type} ${c(e.color)} off:${e.offset?e.offset.x+','+e.offset.y:''} blur:${e.radius} spread:${e.spread||0} vis:${e.visible!==false}`).join(' | ')}`;
  if(n.opacity!==undefined&&n.opacity!==1)s+=`\n${pad}   opacity: ${n.opacity}`;
  if(n.layoutMode)s+=`\n${pad}   layout: ${n.layoutMode} gap:${n.itemSpacing} pad:${n.paddingTop||0}/${n.paddingRight||0}/${n.paddingBottom||0}/${n.paddingLeft||0} prim:${n.primaryAxisAlignItems} cnt:${n.counterAxisAlignItems} sizing:${n.primaryAxisSizingMode}/${n.counterAxisSizingMode}`;
  if(n.type==='TEXT'){
    const st=n.style||{};
    s+=`\n${pad}   text: "${(n.characters||'').replace(/\n/g,'\n')}"`;
    s+=`\n${pad}   font: ${st.fontFamily} ${st.fontWeight} ${st.fontSize}px/${st.lineHeightPx?Math.round(st.lineHeightPx)+'px':st.lineHeightPercent+'%'} ls:${st.letterSpacing} align:${st.textAlignHorizontal}/${st.textAlignVertical} case:${st.textCase||''} decor:${st.textDecoration||''} autoresize:${st.textAutoResize||''}`;
    if(n.styleOverrideTable&&Object.keys(n.styleOverrideTable).length)s+=`\n${pad}   OVERRIDES: ${JSON.stringify(n.styleOverrideTable)}`;
    if(n.characterStyleOverrides&&n.characterStyleOverrides.some(x=>x))s+=`\n${pad}   charOverrides: present`;
  }
  console.log(s);
  (n.children||[]).forEach(ch=>walk(ch,d+1));
}
const target=process.argv[2];
function find(n){ if(n.name===target)return n; for(const ch of n.children||[]){const r=find(ch); if(r)return r;} return null;}
walk(target?find(root):root,0);

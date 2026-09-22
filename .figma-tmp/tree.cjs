const fs=require('fs');
const j=JSON.parse(fs.readFileSync('.figma-tmp/screen.json','utf8'));
const root=j.nodes['376:556'].document;
function bb(n){const b=n.absoluteBoundingBox;return b?`${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}`:'';}
function walk(n,d){
  if(d>4)return;
  const pad='  '.repeat(d);
  let extra='';
  if(n.layoutMode)extra+=` [${n.layoutMode} gap:${n.itemSpacing} pad:${n.paddingTop}/${n.paddingRight}/${n.paddingBottom}/${n.paddingLeft} align:${n.primaryAxisAlignItems||''}/${n.counterAxisAlignItems||''}]`;
  if(n.type==='TEXT')extra+=` "${(n.characters||'').slice(0,60).replace(/\n/g,'\n')}"`;
  if(n.componentId)extra+=` <inst ${n.componentId}>`;
  console.log(`${pad}${n.type} "${n.name}" ${bb(n)}${extra}`);
  (n.children||[]).forEach(c=>walk(c,d+1));
}
walk(root,0);

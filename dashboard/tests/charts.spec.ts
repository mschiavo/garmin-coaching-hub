import {test,expect} from '@playwright/test';

test('all chart types have visible axes, ticks and grid',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/tests/fixture.html');
 const panels=page.locator('section.plot');await expect(panels).toHaveCount(8);
 for(const panel of await panels.all()){
  await panel.scrollIntoViewIfNeeded();
  await expect(panel.locator('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value').first()).toBeVisible();
  await expect(panel.locator('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value').first()).toBeVisible();
  await expect(panel.locator('.recharts-cartesian-grid')).toBeVisible();
  const xTexts=await panel.locator('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value').allTextContents();
  expect(xTexts.some(t=>/\d/.test(t))).toBeTruthy();
  const texts=await panel.locator('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value').allTextContents();
  expect(texts.some(t=>/\d/.test(t))).toBeTruthy();
 }
 const ratio=page.locator('section.load-chart').last();
 await ratio.scrollIntoViewIfNeeded();
 const ref=ratio.locator('line.recharts-reference-line-line');
 await expect(ref).toHaveCount(1);
 // Validate the actual painted SVG segment, not its zero-height bounding box.
 await expect.poll(async()=>ref.evaluate(el=>{
  const line=el as SVGLineElement;
  const style=getComputedStyle(line);
  const x1=line.x1.baseVal.value,x2=line.x2.baseVal.value;
  const y1=line.y1.baseVal.value,y2=line.y2.baseVal.value;
  const panel=line.closest('section.load-chart');
  const grid=panel?.querySelector('.recharts-cartesian-grid') as SVGGraphicsElement|null;
  if(!grid)return false;
  const b=grid.getBBox();
  const matrix=line.getScreenCTM();
  if(!matrix||![x1,x2,y1,y2,b.x,b.y,b.width,b.height].every(Number.isFinite))return false;
  const a=new DOMPoint(x1,y1).matrixTransform(matrix),z=new DOMPoint(x2,y2).matrixTransform(matrix);
  for(let n:Element|null=line;n;n=n.parentElement){
   const css=getComputedStyle(n);
   if(css.display==='none'||css.visibility!=='visible'||Number(css.opacity)===0)return false;
  }
  return Math.abs(a.x-z.x)>10 && Math.abs(a.y-z.y)<0.5 &&
   b.width>0 && b.height>0 && y1>=b.y-1 && y1<=b.y+b.height+1 &&
   Math.min(x1,x2)>=b.x-1 && Math.max(x1,x2)<=b.x+b.width+1 &&
   style.stroke==='rgb(255, 198, 109)' && parseFloat(style.strokeWidth)>0 &&
   Number(style.strokeOpacity)>0 && style.strokeDasharray!=='none';
 })).toBe(true);
 expect(errors).toEqual([]);
});

test('interactive tooltips and accessible week inspector',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/tests/fixture.html');
 const first=page.locator('section.chart-cartesian').first();
 const grid=first.locator('.recharts-cartesian-grid');await grid.scrollIntoViewIfNeeded();
 const box=await grid.boundingBox();expect(box).not.toBeNull();
 if(info.project.name==='mobile') await page.touchscreen.tap(box!.x+box!.width/2,box!.y+box!.height/2);
 else await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
 await expect(first.locator('.recharts-tooltip-wrapper')).toBeVisible();
 await expect(first.locator('.recharts-tooltip-wrapper')).toContainText('Volume');
 const load=page.locator('section.load-chart').first();await load.scrollIntoViewIfNeeded();
 const dot=load.locator('.recharts-line-dot').nth(3);await expect(dot).toBeVisible();
 if(info.project.name==='mobile') await dot.tap(); else await dot.hover();
 await expect(load.locator('.load-tooltip')).toBeVisible();
 await expect(load.locator('.load-tooltip')).toContainText('Volume:');
 await expect(load.locator('.load-tooltip')).toContainText('2026');
 await load.locator('select').selectOption({index:2});
 await expect(load.locator('.load-inspector-values')).toContainText('km');
 expect(errors).toEqual([]);
});

test('production bundles initialize without errors or credentials',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)?route.continue():route.abort();});
 await page.goto('http://127.0.0.1:4180/');
 await expect(page.getByRole('heading',{name:'Configurazione necessaria'})).toBeVisible();
 expect(errors).toEqual([]);
});

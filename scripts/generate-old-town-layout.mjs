/** Photo/map-informed composition; positions are meters, not surveyed coordinates. */
import { writeFileSync } from 'node:fs';
const instances = [];
function add(id, assetId, label, x, z, rotationY = 0) {
  instances.push({id, assetId, label, transform:{x,y:0,z,rotationY}});
}
add('plaza.paving','plaza.paving-base','Central pedestrian square',0,0);
// Approach from Mountain Avenue and Walnut Street edge.
for (const [x,z] of [[-29,-10],[-29,6],[-29,18],[-13,24],[3,24],[19,24]])
  add(`oldtown.approach.${instances.length}`,'plaza.paving-patch-large','Entry paving',x,z);
for (let z=-24;z<=24;z+=8) add(`oldtown.walnut.${z+24}`,'street.road-tile','Walnut Street',29,z);
add('plaza.goose-fountain','plaza.goose-fountain','Goose fountain',-16,-1);
add('oldtown.inlay','oldtown.oval-inlay','Oval event-space paving band',1,0);
add('plaza.splash-pad','plaza.splash-pad','Vernal pool / splash pad',-3,0);
add('plaza.pavilion-stage','oldtown.stage','Old Town Square stage',20,0,-Math.PI/2);
add('plaza.play-area','plaza.play-area','Play sculptures and sitting wall',-28,3,Math.PI/2);
add('plaza.street-janitor','plaza.street-janitor','Street janitor',-20,-6);
// Two distinctive blocks frame the fountain and Mountain Avenue approach.
add('oldtown.miller','oldtown.miller-block','Miller Block (photo interpretation)',-27,-14,.2);
add('oldtown.coopersmith','oldtown.coopersmith-block','CooperSmith’s block (photo interpretation)',-26,18,Math.PI);
for (const [i,x,type] of [[0,-11,1],[1,-4.1,3],[2,2.8,4],[3,10.1,2],[4,17,5]])
  add(`oldtown.north.shop-${i}`,`street.building${type}`,'North storefront '+(i+1),x,-17.5);
for (const [i,x,type] of [[0,-10,4],[1,-2.5,1],[2,4.6,2],[3,11.5,3],[4,18.2,1]])
  add(`oldtown.south.shop-${i}`,`street.building${type}`,'South storefront '+(i+1),x,18,Math.PI);
// Trees are independent instances; the open center remains clear for walking.
for (const z of [-8.5,8.5]) for (const [i,x] of [-9,0,9,16].entries()) {
  const side=z<0?'north':'south';
  add(`oldtown.${side}.tree-${i}`,'oldtown.shade-tree','Shade tree',x,z,(i%3)*.7);
  if(i<3) {
    add(`oldtown.${side}.bed-${i}`,'oldtown.flower-bed','Flower and shrub bed',x+3.8,z);
    add(`oldtown.${side}.bench-${i}`,'oldtown.bench','Bench facing square',x,z+(z<0?1.7:-1.7),z<0?0:Math.PI);
  }
}
for(const [i,x] of [-11,-3,5,13].entries()) {
  add(`oldtown.lights-${i}`,'oldtown.light-span','Festoon lights',x,0);
  for(const z of [-8,8])add(`oldtown.lamp-${i}-${z<0?'n':'s'}`,'oldtown.lamp','Banner lamp',x,z,z<0?0:Math.PI);
}
for (const [i,x,z] of [[0,-29,11],[1,-24,11],[2,-19,11],[3,-12,-12],[4,-5,-12],[5,4,-12],[6,12,-12],[7,3,12],[8,10,12]])
 add(`oldtown.table-${i}`,'plaza.cafe-table-set','Patio table',x,z);
for (const [i,x,z] of [[0,-22,-6],[1,-11,10.5],[2,14,-10.5],[3,23,9]]) add(`oldtown.bin-${i}`,'street.trash-can','Street bin',x,z);
add('oldtown.fireplace','oldtown.fireplace','Communal fireplace',14,11,Math.PI);
const world={schemaVersion:2,worldId:'old-town-square',canonicalRevision:4,units:'meters',coordinateSystem:'right-handed-y-up',areas:[{id:'old-town-square.central-plaza',label:'Old Town Square',chunks:[{x:-1,z:-1,playable:true},{x:0,z:-1,playable:true},{x:-1,z:0,playable:true},{x:0,z:0,playable:true}],instances}]};
writeFileSync(new URL('../src/game/content/world-layout.json',import.meta.url),JSON.stringify(world,null,2)+'\n');
console.log(`Authored ${instances.length} individually editable instances.`);

import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseImpoundedCar} from './impound-release.js';
test('closing or resolving impound restores assigned/free state without overriding another active incident',async()=>{
 for(const status of ['closed','resolved']) {
  for(const [driver,blocking,expected] of [[{status:'active'},0,'assigned'],[null,0,'free'],[{status:'terminated'},0,'free'],[{status:'active'},1,null]] as const){
   let changed: string|null=null;
   const tx={incident:{count:async()=>blocking},carAssignment:{findFirst:async()=>driver?{driver}:null},car:{update:async({data}:any)=>changed=data.status}};
   await releaseImpoundedCar(tx,{id:'case',incidentType:'impound',status},{id:'car',status:'impound'});
   assert.equal(changed,expected);
  }
 }
});
test('archiving alone, a still-open case or unrelated car state never releases a vehicle',async()=>{
 const tx={incident:{count:async()=>{throw Error('must not mutate')}}};
 for(const [status,carStatus] of [['open','impound'],['archived','impound'],['closed','maintenance'],['closed','written_off']]) {
  await releaseImpoundedCar(tx,{id:'case',incidentType:'impound',status},{id:'car',status:carStatus});
 }
});

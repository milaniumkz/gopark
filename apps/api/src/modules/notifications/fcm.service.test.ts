import test from 'node:test';
import assert from 'node:assert/strict';
import {FcmService} from './fcm.service.js';
for(const code of ['messaging/server-unavailable','messaging/registration-token-not-registered']) {
 test(`push failure ${code} disables only permanently invalid tokens`, async()=>{
  let disabled=0;
  const service=new FcmService({client:{manager:{findUnique:async()=>({userId:'user'})},devicePushToken:{findMany:async()=>[{token:'fixture-token'}],updateMany:async()=>{disabled++;}}}} as never);
  (service as any).getAdmin=()=>({messaging:()=>({sendEachForMulticast:async()=>({responses:[{success:false,error:Object.assign(Error('fixture error'),{code})}]})})});
  const operation=service.sendToManager('manager','Fixture','Fixture');
  if(code==='messaging/server-unavailable') await assert.rejects(operation,/fixture error/);
  else await operation;
  assert.equal(disabled,code==='messaging/registration-token-not-registered'?1:0);
 });
}

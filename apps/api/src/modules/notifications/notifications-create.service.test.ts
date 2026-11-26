import test from 'node:test';
import assert from 'node:assert/strict';
import {NotificationsCreateService} from './notifications-create.service.js';

test('driver and every manager receive durable request records even if push never returns',async()=>{
 let release!:()=>void;const pending=new Promise<void>(r=>release=r);
 const saved:any[]=[];const events:string[]=[];
 const service=new NotificationsCreateService({create:async(topic:string)=>{events.push(topic);}} as never,
 {sendToDriver:async()=>pending,sendToManager:async()=>pending,sendToCrmStaffByManager:async()=>pending} as never);
 (service as any).driverRepository={getById:async()=>({id:'fixture-driver',managerId:'regular',fullName:'Fixture Driver',companyName:'Fixture'})};
 (service as any).userRepository={listAdminByCompany:async()=>[{role:'manager',managerLevel:'senior',managerProfileId:'senior'}]};
 (service as any).repository={create:async(input:object)=>{const row={...input,id:'notification'};saved.push(row);return row;}};
 (service as any).managerAlertRepository={create:async(input:object)=>{const row={...input,id:`alert-${saved.length}`};saved.push(row);return row;}};
 (service as any).settingsRepository={getOverview:async()=>({notificationChannels:['in_app','push']})};
 let timer!:ReturnType<typeof setTimeout>;
 try{
  await Promise.race([Promise.all([
   service.createDriverStatusRequestCreated('fixture-driver'),
   service.createManagerStatusRequestCreated('fixture-driver','force_majeure','2026-11-26'),
  ]),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Push blocked durable request delivery')),500);})]);
  assert.equal(saved.filter(r=>r.driverId==='fixture-driver').length,1);
  assert.deepEqual(saved.filter(r=>r.managerId).map(r=>r.managerId),['regular','senior']);
  assert.equal(events.filter(t=>t==='manager_alert.dispatch').length,2);
  assert.equal(events.filter(t=>t==='notification.dispatch').length,1);
 }finally{clearTimeout(timer);release();}
});

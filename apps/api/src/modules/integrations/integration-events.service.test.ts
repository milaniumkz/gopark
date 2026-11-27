import test from 'node:test';
import assert from 'node:assert/strict';
import {IntegrationEventsService} from './integration-events.service.js';
test('durable manager alert actually dispatches push to the manager and CRM',async()=>{
 const calls:string[]=[];
 const service=new IntegrationEventsService({sendToManager:async()=>{calls.push('manager');},sendToCrmStaffByManager:async()=>{calls.push('crm');}} as never, {} as never);
 const result=await service.handle('manager_alert.dispatch',{managerId:'manager',title:'Request',details:'Fixture request'});
 assert.equal(result.accepted,true);
 assert.deepEqual(calls.sort(),['crm','manager']);
});
test('failed push is not acknowledged as a delivered outbox event',async()=>{
 const service=new IntegrationEventsService({sendToManager:async()=>{throw Error('temporary delivery error');},sendToCrmStaffByManager:async()=>{}} as never,{} as never);
 await assert.rejects(service.handle('manager_alert.dispatch',{managerId:'manager'}),/temporary delivery/);
});

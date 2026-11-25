import test from 'node:test';
import assert from 'node:assert/strict';
import {MobileDriverService} from './mobile-driver.service.js';
import {OutboxService} from '../outbox/outbox.service.js';

async function promptly<T>(work:Promise<T>):Promise<T> {
 let timer!:ReturnType<typeof setTimeout>;
 try {return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Acknowledgement blocked by notification transport')),500);})]);}
 finally {clearTimeout(timer);}
}
test('saved payment is acknowledged once while both push deliveries remain pending',async()=>{
 let finish!:()=>void;let registrations=0;let notifications=0;
 const blocked=new Promise<void>(r=>finish=r);
 const payment={id:'fixture-payment',status:'succeeded',amount:2300};
 const service=new MobileDriverService({getDriverActiveContractSnapshot:async()=>({id:'fixture-contract'}),getDriverDebtSummarySnapshot:async()=>({overdueDebt:0,nextPaymentAmount:2300})} as never,
 {registerPayment:async()=>{registrations++;return payment;}} as never,
 {assertCanAccessDriver:async()=>undefined} as never,
 {createDriverPaymentRegistered:async()=>{notifications++;await blocked;throw Error('push offline');},createManagerPaymentRegistered:async()=>{notifications++;await blocked;}} as never);
 try {assert.equal(await promptly(service.createFakeBankPayment('fixture-driver',{amount:2300},{id:'fixture-driver',role:'driver'})),payment);assert.equal(registrations,1);assert.equal(notifications,2);}
 finally {finish();}
 await new Promise(r=>setImmediate(r));
});
test('database/payment failures are not reported as successful and do not send notices',async()=>{
 let notifications=0;
 const service=new MobileDriverService({getDriverActiveContractSnapshot:async()=>({id:'fixture-contract'}),getDriverDebtSummarySnapshot:async()=>({overdueDebt:0,nextPaymentAmount:2300})} as never,
 {registerPayment:async()=>{throw Error('database unavailable');}} as never,
 {assertCanAccessDriver:async()=>undefined} as never,
 {createDriverPaymentRegistered:async()=>{notifications++;},createManagerPaymentRegistered:async()=>{notifications++;}} as never);
 await assert.rejects(service.createFakeBankPayment('fixture-driver',{amount:2300},{id:'fixture-driver',role:'driver'}),/database unavailable/);assert.equal(notifications,0);
});
test('durable outbox event returns while Redis enqueue is pending; future events are not enqueued early',async()=>{
 let finish!:()=>void;const blocked=new Promise<boolean>(r=>finish=()=>r(true));let saved=0,enqueued=0;
 const service=new OutboxService({enqueueEvent:async()=>{enqueued++;return blocked;}} as never);
 (service as any).repository={create:async(input:object)=>{saved++;return {...input,id:'fixture-event'};}};
 try {const event=await promptly(service.create('payment.registered','payment','fixture-payment',{}));assert.equal(event.id,'fixture-event');assert.equal(saved,1);assert.equal(enqueued,1);
 await service.create('future','payment','fixture-payment',{},new Date(Date.now()+60000).toISOString());assert.equal(enqueued,1);}
 finally {finish();}
});

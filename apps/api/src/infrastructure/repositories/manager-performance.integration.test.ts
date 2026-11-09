import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { MobileManagerService } from "../../modules/mobile-manager/mobile-manager.service.js";
import { DriverMobileReadService } from "../../modules/mobile-read/driver-mobile-read.service.js";
import { DriverStatusRequestPolicyService } from "../../modules/mobile-read/driver-status-request-policy.service.js";
import { MobileAccessService } from "../../modules/mobile-read/mobile-access.service.js";
import type { NotificationsCreateService } from "../../modules/notifications/notifications-create.service.js";

test("300-driver manager reads stay scoped with a three-year daily schedule", {skip:process.env.REPAIR_INTEGRATION!=="true",timeout:120000},async()=>{
  assert.equal(new URL(process.env.DATABASE_URL!).pathname,"/gopark_contract_test");
  const {PrismaClient}=createRequire(import.meta.url)("@prisma/client");const p=new PrismaClient();
  const descriptor=Object.getOwnPropertyDescriptor(PrismaService.prototype,"client")!;
  Object.defineProperty(PrismaService.prototype,"client",{configurable:true,get:()=>p});
  const company=`isolated-load-${randomUUID()}`;const users=[randomUUID(),randomUUID()];const managers=[randomUUID(),randomUUID()];
  const drivers=Array.from({length:300},(_,i)=>({id:randomUUID(),firstName:"Synthetic",lastName:`Driver${i}`,phone:`${company}-${i}`,companyName:company,managerId:managers[i<10?0:1]}));
  const cars=drivers.map((d,i)=>({id:randomUUID(),vin:`${company}-${i}`,plateNumber:`LOAD-${i}`,make:"Test",model:"Test",companyName:company,managerId:d.managerId,status:"assigned"}));
  try {
    await p.user.createMany({data:users.map(id=>({id,firstName:"Synthetic",lastName:"Manager",role:"manager",passwordHash:"isolated-fixture",companyName:company}))});
    await p.manager.create({data:{id:managers[1],userId:users[1],title:"Senior",level:"senior"}});
    await p.manager.create({data:{id:managers[0],userId:users[0],title:"Regular",seniorManagerId:managers[1]}});
    await p.driver.createMany({data:drivers});await p.car.createMany({data:cars});
    await p.contract.createMany({data:drivers.map((d,i)=>({id:randomUUID(),driverId:d.id,carId:cars[i]!.id,contractNumber:`${company}-${i}`,status:"active",principalAmount:2484000,financedAmount:2484000,installmentAmount:2300,installmentDay:1,termMonths:36,startDate:new Date("2026-11-05"),endDate:new Date("2029-10-19")}))});
    await p.carAssignment.createMany({data:drivers.map((d,i)=>({driverId:d.id,carId:cars[i]!.id,startedAt:new Date("2026-11-05")}))});
    await p.$executeRaw`INSERT INTO obligations(id,contract_id,driver_id,type,due_date,amount,metadata) SELECT gen_random_uuid(),c.id,c.driver_id,'installment'::obligation_type,DATE '2026-11-05'+n*INTERVAL '1 day',2300,'{"installmentAmount":2300}'::jsonb FROM contracts c JOIN drivers d ON d.id=c.driver_id CROSS JOIN generate_series(0,1079) n WHERE d.company_name=${company}`;
    await p.driverCreditBalance.create({data:{driverId:drivers[0]!.id,amount:3500}});
    await p.obligation.updateMany({where:{driverId:drivers[1]!.id,dueDate:new Date("2026-11-05")},data:{paidAmount:500}});
    await p.driverStatusRequest.create({data:{driverId:drivers[2]!.id,type:"day_off",status:"approved",period:"2026-11-06",note:"Isolated fixture"}});
    await p.obligation.updateMany({where:{driverId:drivers[3]!.id,dueDate:new Date("2026-11-05")},data:{deferredUntil:new Date("2026-11-10")}});
    const selected=await p.driver.findMany({where:{id:{in:drivers.slice(0,5).map(d=>d.id)}},select:{id:true,contracts:{where:{status:"active"},select:{id:true}}}});
    const policy=new DriverStatusRequestPolicyService();
    const credits={[drivers[0]!.id]:3500};const today="2026-11-09";
    const batch=await policy.getEffectiveDebtPolicies(selected.map((d:any)=>({id:d.id,activeContractId:d.contracts[0].id})),today,credits);
    for(const d of selected) assert.deepEqual(batch[d.id],await policy.getEffectiveDebtPolicy(d.id,today,credits[d.id]??0));
    await p.$executeRawUnsafe("ANALYZE");
    const service=new MobileManagerService(new DriverMobileReadService(),new MobileAccessService(),{} as NotificationsCreateService);
    const regular={id:users[0]!,role:"manager" as const,managerLevel:"regular" as const,companyName:company};
    const senior={id:users[1]!,role:"manager" as const,managerLevel:"senior" as const,companyName:company};
    const started=performance.now();const own=await service.getVehicles(regular);const ownMs=performance.now()-started;
    assert.equal(own.length,10);assert.ok(own.every(c=>c.managerId===managers[0]));
    const allStarted=performance.now();const all=await service.getVehicles(senior);const allMs=performance.now()-allStarted;assert.equal(all.length,300);
    for (const car of all.slice(0,5)) {
      const obligations=await p.obligation.findMany({where:{contract:{carId:car.id,status:"active"}},orderBy:{dueDate:"asc"}});
      const open=obligations.filter((o:any)=>o.type==="installment").map((o:any)=>({amount:Math.max(0,Number(o.metadata?.installmentAmount??o.amount)-Math.max(0,Number(o.paidAmount))),date:(o.deferredUntil??o.dueDate).toISOString().slice(0,10),deferred:!!o.deferredUntil})).filter((o:any)=>o.amount>0).sort((a:any,b:any)=>a.date.localeCompare(b.date));
      assert.equal(car.currentDebt,open.reduce((n:number,o:any)=>n+o.amount,0));assert.equal(car.nextDueAmount,open[0]?.amount??0);assert.equal(car.nextDueDate,open[0]?.date??null);assert.equal(car.hasDeferredPayment,open.some((o:any)=>o.deferred));
    }

    const driversStarted=performance.now();const list=await service.getDrivers(senior);const driversMs=performance.now()-driversStarted;assert.equal(list.length,300);
    const summaryStarted=performance.now();const summary=await service.getSummary(senior);const summaryMs=performance.now()-summaryStarted;assert.equal(summary.assignedDrivers,300);assert.equal(summary.activeCars,300);
    console.log(JSON.stringify({syntheticDrivers:300,scheduleRows:324000,regular10CarsMs:Math.round(ownMs),senior300CarsMs:Math.round(allMs),senior300DriversMs:Math.round(driversMs),seniorSummaryMs:Math.round(summaryMs)}));
  } finally {
    await p.driverStatusRequest.deleteMany({where:{driverId:{in:drivers.map(d=>d.id)}}});await p.driverCreditBalance.deleteMany({where:{driverId:{in:drivers.map(d=>d.id)}}});
    await p.obligation.deleteMany({where:{driverId:{in:drivers.map(d=>d.id)}}});await p.carAssignment.deleteMany({where:{driverId:{in:drivers.map(d=>d.id)}}});await p.contract.deleteMany({where:{driverId:{in:drivers.map(d=>d.id)}}});await p.car.deleteMany({where:{id:{in:cars.map(c=>c.id)}}});await p.driver.deleteMany({where:{id:{in:drivers.map(d=>d.id)}}});await p.manager.deleteMany({where:{id:{in:managers}}});await p.user.deleteMany({where:{id:{in:users}}});
    Object.defineProperty(PrismaService.prototype,"client",descriptor);await p.$disconnect();
  }
});

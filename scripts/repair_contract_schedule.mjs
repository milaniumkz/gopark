// Explicit maintenance action only: verified backup and unpaid contract required.
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
const { PrismaClient } = await import('/app/apps/api/node_modules/@prisma/client/default.js');
const p = new PrismaClient();
try {
  const number = process.env.CONTRACT_NUMBER;
  if (!/^\d{1,12}$/.test(number ?? '')) throw Error('Explicit numeric contract number required');
  const current = await p.contract.findUniqueOrThrow({where:{contractNumber:number},include:{driver:{select:{weeklyDayOff:true}}}});
  if (process.argv[2] === 'preview') {
    process.stdout.write(JSON.stringify(current));
  } else {
    const before = JSON.parse(fs.readFileSync(0,'utf8'));
    if (!isDeepStrictEqual(JSON.parse(JSON.stringify(current)),before)) throw Error('Contract changed since backup; inspect again');
    if (current.status !== 'active') throw Error('Only an active unpaid contract may be repaired');
    if (await p.payment.count({where:{contractId:current.id}})) throw Error('Payments exist; automatic repair forbidden');
    const invalid = await p.obligation.count({where:{contractId:current.id,OR:[{paidAmount:{gt:0}},{deferredUntil:{not:null}},{deferredByStatusRequestId:{not:null}}]}});
    if (invalid) throw Error('Paid or deferred schedule exists; automatic repair forbidden');
    const daily = Math.round(Number(current.installmentAmount)*100);
    const total = Math.round(Number(current.financedAmount)*100);
    if (!(daily>0 && total>0 && Number.isSafeInteger(daily) && Number.isSafeInteger(total))) throw Error('Invalid amounts');
    let remaining = Math.ceil(total/daily);
    if (remaining>100000) throw Error('Unexpected contract length');
    const end = new Date(current.startDate);
    const off = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(current.driver.weeklyDayOff ?? '');
    while (true) {
      if (end.getUTCDay()!==off && --remaining===0) break;
      end.setUTCDate(end.getUTCDate()+1);
    }
    const endDate=end.toISOString().slice(0,10);
    // Import requires the checked release containing the exact-principal schedule fix.
    await import('/app/apps/api/dist/apps/api/src/common/contracts/installment-schedule.js');
    const { ContractPrismaRepository } = await import('/app/apps/api/dist/apps/api/src/infrastructure/repositories/contract.prisma.repository.js');
    const repo=new ContractPrismaRepository({client:p});
    const updated=await repo.update(current.id,{endDate,installmentAmount:Number(current.installmentAmount)});
    if (!updated || Math.round(updated.currentDebt*100)!==total || updated.endDate!==endDate) throw Error('Repaired contract verification failed');
    const rows=await p.obligation.findMany({where:{contractId:current.id,type:'installment'},orderBy:{dueDate:'asc'}});
    if (rows.length!==Math.ceil(total/daily) || rows.reduce((n,r)=>n+Math.round(Number(r.metadata?.installmentAmount??r.amount)*100),0)!==total) throw Error('Schedule total verification failed');
    if (rows.some(r=>r.dueDate.getUTCDay()===off)) throw Error('Rest day was charged');
    await p.auditLog.create({data:{action:'contract.schedule.repaired',entityType:'contract',entityId:current.id,correlationId:randomUUID(),beforeData:{endDate:before.endDate,termMonths:before.termMonths},afterData:{endDate,currentDebt:updated.currentDebt,installmentAmount:updated.installmentAmount,source:'explicit-maintenance'}}});
    console.log(JSON.stringify({contractNumber:number,financedAmount:Number(current.financedAmount),dailyAmount:Number(current.installmentAmount),endDate,paymentDays:rows.length,currentDebt:updated.currentDebt}));
  }
} finally { await p.$disconnect(); }

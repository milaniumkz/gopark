export function isImpoundRelease(incident: {incidentType?: string; status: string}, car: {status: string}): boolean {
  return incident.incidentType === 'impound' && car.status === 'impound' && ['resolved', 'closed'].includes(incident.status);
}
export async function releaseImpoundedCar(tx: any, incident: any, car: any): Promise<void> {
  if (!isImpoundRelease(incident, car)) return;
  const blocking = await tx.incident.count({where:{id:{not:incident.id},carId:car.id,status:'open'}});
  if (blocking) return;
  const assignment = await tx.carAssignment.findFirst({where:{carId:car.id,endedAt:null},include:{driver:true},orderBy:{startedAt:'desc'}});
  await tx.car.update({where:{id:car.id},data:{status:assignment && assignment.driver.status !== 'terminated' ? 'assigned' : 'free'}});
}

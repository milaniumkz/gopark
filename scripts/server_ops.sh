#!/usr/bin/env bash
set -euo pipefail
BASE="/home/client"
CONFIG_DIR="$BASE/gopark"
CURRENT="${BASE}/gopark-current"
if [ -L "$CURRENT" ]; then APP_DIR="$(readlink -f "$CURRENT")"; else APP_DIR="$CONFIG_DIR"; fi
cd "$APP_DIR"
compose() {
  local args=(-p gopark --env-file "$CONFIG_DIR/.env" -f docker-compose.server.yml)
  if [ -f release-images.yml ]; then args+=(-f release-images.yml); fi
  docker compose "${args[@]}" "$@"
}

case "$OPERATION" in
  driver-request-diagnostic)
    test -n "${DRIVER_PHONE:-}"
    docker exec -i -e DRIVER_PHONE gopark-api node --input-type=module <<'JS'
import {createRequire} from "node:module";const require=createRequire(import.meta.url);const {PrismaClient}=require("./apps/api/node_modules/@prisma/client");const p=new PrismaClient();
try {
 const phone=process.env.DRIVER_PHONE;
 const all=await p.driver.findMany({select:{id:true,userId:true,phone:true,managerId:true,firstName:true,lastName:true,companyName:true}});
 const accounts=await p.user.findMany({select:{id:true,phone:true,email:true,role:true}});
 const matchedAccounts=accounts.filter(u=>(u.phone??"").replace(/\D/g,"").endsWith(phone)||(u.email??"").split("@")[0]===phone);
 let matches=all.filter(d=>d.phone.replace(/\D/g,"").endsWith(phone)||matchedAccounts.some(u=>u.id===d.userId));
 const matchedManagers=await p.manager.findMany({where:{userId:{in:matchedAccounts.filter(u=>u.role==="manager").map(u=>u.id)}},select:{id:true,userId:true,level:true,user:{select:{companyName:true}}}});
 const selectedViaManager=matches.length===0&&matchedManagers.length>0;
 if(selectedViaManager)matches=all.filter(d=>matchedManagers.some(m=>d.managerId===m.id||d.managerId===m.userId||(m.level==="senior"&&d.companyName===m.user.companyName)));
 const ids=matches.map(d=>d.id),users=[...new Set([...matches.map(d=>d.userId).filter(Boolean),...matchedAccounts.map(u=>u.id)])];
 const requests=await p.driverStatusRequest.findMany({where:{driverId:{in:[...ids,...users]}},orderBy:{createdAt:"desc"},take:20});
 const managers=await p.manager.findMany({where:{id:{in:matches.map(d=>d.managerId).filter(Boolean)}},select:{id:true,userId:true}});
 const alerts=await p.managerAlert.findMany({where:{createdAt:{gte:new Date(Date.now()-7*86400000)},OR:matches.map(d=>({details:{contains:[d.firstName,d.lastName].join(" ")}}))},select:{managerId:true,createdAt:true,title:true}});
 const {MobileManagerService}=await import("./apps/api/dist/apps/api/src/modules/mobile-manager/mobile-manager.service.js");
 const {DriverMobileReadService}=await import("./apps/api/dist/apps/api/src/modules/mobile-read/driver-mobile-read.service.js");
 const {MobileAccessService}=await import("./apps/api/dist/apps/api/src/modules/mobile-read/mobile-access.service.js");
 const read=new DriverMobileReadService(), service=new MobileManagerService(read,new MobileAccessService(),{});
 const pendingChecks=[];
 for(const r of requests.filter(r=>r.status==="pending")){
  const d=matches.find(d=>d.id===r.driverId);if(!d)continue;
  const recipients=await p.manager.findMany({where:{OR:[{id:d.managerId??""},{level:"senior",user:{companyName:d.companyName}}]},select:{id:true,userId:true,level:true,user:{select:{companyName:true}}}});
  const driverVisible=(await read.listDriverStatusRequests(d.id)).some(x=>x.id===r.id);
  const receiptChecks=[];
  for(const m of recipients){
   const visible=(await service.getStatusRequests({id:m.userId,role:"manager",companyName:m.user.companyName,managerLevel:m.level})).some(x=>x.id===r.id);
   const alertCount=await p.managerAlert.count({where:{managerId:m.id,title:"Новый запрос водителя",details:{contains:r.period},createdAt:{gte:new Date(r.createdAt.getTime()-5000),lte:new Date(r.createdAt.getTime()+60000)}}});
   const devices=await p.devicePushToken.groupBy({by:["app","platform"],where:{userId:m.userId,disabledAt:null},_count:{_all:true}});
   const relatedAlerts=await p.managerAlert.findMany({where:{managerId:m.id,title:"Новый запрос водителя",details:{contains:r.period}},select:{id:true}});
   const events=await p.outboxEvent.groupBy({by:["status"],where:{topic:"manager_alert.dispatch",aggregateId:{in:relatedAlerts.map(a=>a.id)}},_count:{_all:true}});
   receiptChecks.push({level:m.level,visible,alertRecorded:alertCount>0,devices:devices.map(d=>({app:d.app,platform:d.platform,count:d._count._all})),outbox:events.map(e=>({status:e.status,count:e._count._all}))});
  }
  pendingChecks.push({type:r.type,createdAt:r.createdAt.toISOString(),driverVisible,noteMentionsIllness:/больнич|боле|здоров/iu.test(r.note??""),recipients:receiptChecks});
 }
 console.log(JSON.stringify({pendingChecks}));
 const notices=await p.notification.groupBy({by:["templateCode","status"],where:{driverId:{in:ids},createdAt:{gte:new Date(Date.now()-7*86400000)}},_count:{_all:true}});
 const incidents=await p.incident.findMany({where:{driverId:{in:ids},incidentType:{in:["force_majeure","sick","illness"]}},select:{incidentType:true,status:true,occurredAt:true},take:10});
 console.log(JSON.stringify({matchedDrivers:matches.length,selectedViaManager,matchedAccounts:matchedAccounts.map(u=>({role:u.role,hasDriverProfile:all.some(d=>d.userId===u.id)})),possibleSameSuffixProfiles:all.filter(d=>d.phone.replace(/\D/g,"").endsWith(phone.slice(-6))).length,hasAssignedManager:matches.map(d=>!!d.managerId),managerProfilesFound:managers.length,requests:requests.map(r=>({type:r.type,status:r.status,period:r.period,createdAt:r.createdAt.toISOString(),hasNote:!!r.note,canonicalDriver:ids.includes(r.driverId)})),alertsLast7d:alerts.length,assignedManagerAlerts:alerts.filter(a=>managers.some(m=>a.managerId===m.id||a.managerId===m.userId)).length,notices:notices.map(n=>({template:n.templateCode,status:n.status,count:n._count._all})),relatedIncidents:incidents}));
}finally{await p.$disconnect();}
JS
    for container in gopark-api gopark-crm-web gopark-https; do docker logs --since=48h --tail=10000 "$container" 2>&1 || true; done | docker exec -i -e DRIVER_PHONE gopark-api node --input-type=module -e '
import {createRequire} from "node:module";import{readFileSync}from"node:fs";const require=createRequire(import.meta.url);const{PrismaClient}=require("./apps/api/node_modules/@prisma/client");const p=new PrismaClient();try{
const all=await p.driver.findMany({select:{id:true,userId:true,phone:true}});const accounts=await p.user.findMany({select:{id:true,phone:true,email:true}});const phone=process.env.DRIVER_PHONE;const users=accounts.filter(u=>(u.phone??"").replace(/\D/g,"").endsWith(phone)||(u.email??"").split("@")[0]===phone).map(u=>u.id);const ids=all.filter(d=>d.phone.replace(/\D/g,"").endsWith(phone)||users.includes(d.userId)).map(d=>d.id);
const lines=readFileSync(0,"utf8").split("\n").filter(l=>ids.some(id=>l.includes(id))&&l.includes("status-requests"));const statuses={};
for(const l of lines){const m=l.match(/ -> (\d{3}) (\d+)ms/);if(m&&l.includes("POST"))statuses[m[1]]=(statuses[m[1]]??0)+1;}
console.log(JSON.stringify({requestPostStatuses:statuses,gatewayTimeoutLines:lines.filter(l=>/HTTP[^ ]*" 504|upstream timed out/.test(l)).length,sampledLogLines:lines.length}));
}finally{await p.$disconnect();}'
    ;;
  recover-redis-queue)
    umask 077
    BACKUP="$BASE/backups/queue-recovery-$(date -u +%Y%m%dT%H%M%S)-$$"
    mkdir -p "$BACKUP"
    docker exec gopark-postgres pg_dump -U gopark gopark | gzip > "$BACKUP/database.sql.gz"
    gzip -t "$BACKUP/database.sql.gz"
    cp "$BASE/gopark/.env" "$BACKUP/server.env"
    timeout 30s docker cp gopark-redis:/data "$BACKUP/redis-data"
    test -d "$BACKUP/redis-data"
    docker restart -t 10 gopark-redis
    ready=false
    for attempt in $(seq 1 15); do
      if timeout 3s docker exec gopark-redis redis-cli ping | grep -qx PONG; then ready=true; break; fi
      sleep 1
    done
    test "$ready" = true
    docker restart -t 10 gopark-worker
    ready=false
    for attempt in $(seq 1 20); do
      if docker exec gopark-worker node -e 'fetch("http://127.0.0.1:3001/health",{signal:AbortSignal.timeout(1000)}).then(async r=>{if(!r.ok)process.exit(1);const h=await r.json();if(h.service!=="gopark-outbox-worker")process.exit(1);console.log(JSON.stringify(h))}).catch(()=>process.exit(1))'; then ready=true; break; fi
      sleep 1
    done
    test "$ready" = true
    curl --max-time 10 -fsS http://127.0.0.1:3000/api/health
    echo "Preserved Redis volume, database and configuration backup: $BACKUP"
    ;;
  notification-delivery-diagnostic)
    timeout 5s docker exec gopark-redis redis-cli ping || echo "Redis PING did not complete"
    docker inspect --format '{{.Name}} {{json .NetworkSettings.Networks}}' gopark-api gopark-worker gopark-redis
    for c in gopark-api gopark-worker; do docker logs --since=48h --tail=5000 "$c" 2>&1 || true; done | docker exec -i gopark-api node --input-type=module -e 'import{readFileSync}from"node:fs";const s=readFileSync(0,"utf8");console.log(JSON.stringify({fcmFailures:(s.match(/FCM send failed/g)||[]).length,fcmDisabled:(s.match(/FCM disabled:/g)||[]).length,invalidTokens:(s.match(/invalid push token/g)||[]).length,workerStarted:s.includes("gopark-outbox-worker] listening"),queueErrors:(s.match(/WRONGPASS|NOAUTH|ECONNREFUSED/g)||[]).length}));'
    docker exec gopark-worker node --input-type=module -e 'try{const r=await fetch("http://127.0.0.1:3001/health",{signal:AbortSignal.timeout(5000)});const h=await r.json();console.log(JSON.stringify({workerHealth:r.status,service:h.service,appRuntime:h.appRuntime}));}catch(e){console.log(JSON.stringify({workerHealthError:e.name}));}'
    docker exec -i gopark-api node --input-type=module <<'JS'
import{createRequire}from"node:module";import{existsSync}from"node:fs";const require=createRequire(import.meta.url);const{Redis}=require("./apps/api/node_modules/ioredis");const configured=new URL(process.env.REDIS_URL);const result={configuredHost:configured.hostname,configuredPort:configured.port,credentialsPresent:!!configured.password,firebaseFileExists:existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH??"")};for(const [label,url]of[["configured",configured.href],["internal",(()=>{const u=new URL(configured);u.hostname="redis";u.port="6379";return u.href;})()]]){const c=new Redis(url,{lazyConnect:true,connectTimeout:3000,maxRetriesPerRequest:0,retryStrategy:()=>null,enableOfflineQueue:false});c.on("error",()=>{});try{await c.connect();result[label]=await c.ping();}catch(e){result[label]=e.code??e.name;}finally{c.disconnect();}}console.log(JSON.stringify(result));
JS
    docker exec -i gopark-api node --input-type=module <<'JS'
import{createRequire}from"node:module";const require=createRequire(import.meta.url);const{PrismaClient}=require("./apps/api/node_modules/@prisma/client");const{Queue}=require("./apps/api/node_modules/bullmq");const{Redis}=require("./apps/api/node_modules/ioredis");const p=new PrismaClient(),connection=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:1}),q=new Queue("gopark-outbox",{connection});setTimeout(()=>{console.log("Queue diagnostic timed out");connection.disconnect();process.exit(2);},15000).unref();try{console.log(JSON.stringify({outbox:await p.outboxEvent.groupBy({by:["status"],_count:{_all:true}}),queue:await q.getJobCounts(),firebaseConfigured:!!(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||process.env.FIREBASE_SERVICE_ACCOUNT_PATH)}));}finally{await q.close();await connection.quit();await p.$disconnect();}
JS
    ;;
  driver-payment-diagnostic)
    test -n "${DRIVER_SEARCH:-}"
    docker exec -i -e DRIVER_SEARCH gopark-api node --input-type=module <<'JS'
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {PrismaClient}=require("./apps/api/node_modules/@prisma/client");
const p=new PrismaClient();
try {
  const term=process.env.DRIVER_SEARCH.trim();
  const matches=await p.driver.findMany({where:{OR:[{firstName:{contains:term,mode:"insensitive"}},{lastName:{contains:term,mode:"insensitive"}}]},select:{id:true}});
  const payments=await p.payment.findMany({where:{driverId:{in:matches.map(d=>d.id)},createdAt:{gte:new Date(Date.now()-86400000)}},orderBy:{createdAt:"desc"},take:50,select:{id:true,driverId:true,status:true,amount:true,createdAt:true}});
  const latest=payments[0];
  const ledger=latest?await p.ledgerEntry.count({where:{OR:[{paymentId:latest.id},{externalReference:latest.id}]}}):0;
  const events=latest?await p.outboxEvent.count({where:{topic:"payment.registered",aggregateId:latest.id}}):0;
  const duplicates=payments.filter((a,i)=>payments.slice(i+1).some(b=>a.driverId===b.driverId&&a.amount.toString()===b.amount.toString()&&Math.abs(a.createdAt-b.createdAt)<120000)).length;
  console.log(JSON.stringify({matchedDrivers:matches.length,paymentsLast24h:payments.length,succeededLast24h:payments.filter(p=>p.status==="succeeded").length,latestAt:latest?.createdAt.toISOString()??null,latestStatus:latest?.status??null,latestLedgerRecorded:ledger>0,latestOutboxRecorded:events>0,possibleRepeatPairs:duplicates}));
} finally { await p.$disconnect(); }
JS
    for container in gopark-api gopark-crm-web gopark-https; do docker logs --since=48h --tail=10000 "$container" 2>&1 || true; done | docker exec -i -e DRIVER_SEARCH gopark-api node --input-type=module -e '
import {createRequire} from "node:module"; import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url); const {PrismaClient}=require("./apps/api/node_modules/@prisma/client");const p=new PrismaClient();
try {const term=process.env.DRIVER_SEARCH.trim();const users=await p.driver.findMany({where:{OR:[{firstName:{contains:term,mode:"insensitive"}},{lastName:{contains:term,mode:"insensitive"}}]},select:{id:true}});
const rows=readFileSync(0,"utf8").split("\n").filter(l=>users.some(d=>l.includes(d.id)));
const posts=rows.filter(l=>l.includes("POST")&&/payment/.test(l));const statuses={};let maxPostMs=0,maxReadMs=0;
for(const line of rows){const m=line.match(/ -> (\d{3}) (\d+)ms/);if(!m)continue;if(line.includes("POST")&&/payment/.test(line)){statuses[m[1]]=(statuses[m[1]]??0)+1;maxPostMs=Math.max(maxPostMs,Number(m[2]));}else if(line.includes("GET"))maxReadMs=Math.max(maxReadMs,Number(m[2]));}
console.log(JSON.stringify({paymentPostLogLines:posts.length,paymentPostCompletedStatuses:statuses,maxPaymentPostMs:maxPostMs,maxDriverReadMs:maxReadMs,gatewayTimeoutLines:rows.filter(l=>/HTTP[^ ]*" 504|upstream timed out/.test(l)).length}));
}finally{await p.$disconnect();}'
    ;;
  release-diagnostic)
    cat "$BASE/gopark-current-sha"
    docker inspect --format '{{.Name}} {{.Config.Image}} running={{.State.Running}}' gopark-api gopark-worker gopark-crm-web
    docker exec -i gopark-api node --input-type=module <<'JS'
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("./apps/api/node_modules/@prisma/client");
const p = new PrismaClient();
try {
  await Promise.all([
    p.incident.findFirst({select:{serviceDetails:true,accidentDetails:true,statusHistory:true}}),
    p.partMovement.findFirst({select:{requesterCompany:true,incidentId:true,expenseId:true}}),
    p.managerCalendarComment.findFirst({select:{id:true}}),
    p.car.count({where:{status:"written_off"}}),
  ]);
  console.log("Service, inventory and manager calendar database reads OK");
} finally { await p.$disconnect(); }
JS
    docker exec gopark-crm-web sha256sum /usr/share/nginx/html/index.html
    curl --max-time 20 -fsS https://185.138.185.36/api/health
    printf '\n'
    ;;
  manager-performance-diagnostic)
    docker exec gopark-api node --input-type=module -e 'const {PrismaClient}=await import("./apps/api/node_modules/@prisma/client/default.js");const {MobileManagerService}=await import("./apps/api/dist/apps/api/src/modules/mobile-manager/mobile-manager.service.js");const {DriverMobileReadService}=await import("./apps/api/dist/apps/api/src/modules/mobile-read/driver-mobile-read.service.js");const {MobileAccessService}=await import("./apps/api/dist/apps/api/src/modules/mobile-read/mobile-access.service.js");const p=new PrismaClient();let failed=false;try{const users=await p.user.findMany({where:{role:"manager",status:"active"},select:{id:true,companyName:true,manager:{select:{level:true}}}});const service=new MobileManagerService(new DriverMobileReadService(),new MobileAccessService(),{});const results=[];for(const user of users){try{const actor={id:user.id,role:"manager",companyName:user.companyName,managerLevel:user.manager?.level??"regular"};let start=performance.now();const summary=await service.getSummary(actor);const summaryMs=Math.round(performance.now()-start);start=performance.now();const cars=await service.getVehicles(actor);const vehiclesMs=Math.round(performance.now()-start);start=performance.now();const drivers=await service.getDrivers(actor);results.push({level:actor.managerLevel,drivers:drivers.length,cars:cars.length,summaryMs,vehiclesMs,driversMs:Math.round(performance.now()-start),summaryMatches:summary.assignedDrivers===drivers.length});if(summary.assignedDrivers!==drivers.length)failed=true;}catch(e){failed=true;results.push({error:e.constructor.name});}}console.log(JSON.stringify({managerAccounts:users.length,results,passed:!failed}));}finally{await p.$disconnect();process.exit(failed?1:0)}'
    ;;
  driver-home-diagnostic)
    docker exec gopark-api node --input-type=module -e 'const {PrismaClient}=await import("./apps/api/node_modules/@prisma/client/default.js");const {DriverMobileReadService}=await import("./apps/api/dist/apps/api/src/modules/mobile-read/driver-mobile-read.service.js");const p=new PrismaClient();try{const drivers=await p.driver.findMany({select:{id:true,userId:true}});const service=new DriverMobileReadService();let ok=0;const errors=[];for(const d of drivers){try{const snapshot=await service.getDriverHomeSnapshot(d.id,d.userId);if(!Number.isFinite(snapshot.finance.yandexBalance))throw Error("Non-numeric balance");ok++;}catch(e){errors.push({driverId:d.id,type:e.constructor.name,message:e.message});}}console.log(JSON.stringify({driversChecked:drivers.length,successfulSummaries:ok,errors}));}finally{await p.$disconnect();process.exit(0)}'
    ;;
  verify-owner-reset)
    docker exec gopark-api node -e 'fetch("http://127.0.0.1:3000/api/health").then(async r=>{if(!r.ok)throw Error("API unhealthy");console.log(await r.text())}).catch(e=>{console.error(e.message);process.exit(1)})'
    docker exec gopark-crm-web nginx -t
    docker exec gopark-crm-web nginx -s reload
    docker exec gopark-redis timeout 10 redis-cli PING | grep -qx PONG
    curl --max-time 10 --retry 5 --retry-delay 2 --retry-all-errors -fsS http://127.0.0.1:3000/api/health
    docker exec gopark-api node --input-type=module -e 'const {PrismaClient}=await import("./apps/api/node_modules/@prisma/client/default.js");const p=new PrismaClient();try{const owners=await p.user.findMany({select:{id:true,email:true,role:true,status:true}});const tables=await p.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname=\x27public\x27 AND tablename NOT IN (\x27users\x27,\x27_prisma_migrations\x27)");const nonempty=[];for(const t of tables){if(!/^[a-z_][a-z0-9_]*$/i.test(t.tablename))throw Error("Unexpected table name");const r=await p.$queryRawUnsafe(`SELECT count(*) AS n FROM public.${t.tablename}`);if(Number(r[0].n)!==0)nonempty.push({table:t.tablename,count:String(r[0].n)});}console.log(JSON.stringify({accounts:owners,nonemptyBusinessTables:nonempty}));if(owners.length!==1||owners[0].role!=="owner"||nonempty.length)throw Error("Post-reset verification failed");}finally{await p.$disconnect()}'
    ;;
  recover-redis)
    umask 077
    BACKUP="$BASE/backups/redis-recovery-$(date -u +%Y%m%dT%H%M%S)-$$"
    mkdir -p "$BACKUP/data"
    docker stop --time 15 gopark-redis >/dev/null
    trap 'docker start gopark-redis >/dev/null' EXIT
    docker cp gopark-redis:/data/. "$BACKUP/data/"
    test -n "$(find "$BACKUP/data" -type f -print -quit)"
    echo "Redis data backup: $BACKUP"
    docker start gopark-redis >/dev/null
    trap - EXIT
    for attempt in $(seq 1 15); do
      if docker exec gopark-redis timeout 5 redis-cli PING | grep -qx PONG; then break; fi
      sleep 2
    done
    docker exec gopark-redis timeout 5 redis-cli PING | grep -qx PONG
    ;;
  redis-state)
    docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' gopark-redis
    docker logs --tail 40 gopark-redis 2>&1 | tail -25
    docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' gopark-redis
    ;;
  redis-diagnostic)
    docker exec gopark-api node --input-type=module -e 'import {createRequire} from "node:module";const require=createRequire("/app/apps/api/package.json");const Redis=require("ioredis");const u=new URL(process.env.REDIS_URL);console.log(JSON.stringify({redis:{host:u.hostname,port:u.port||"6379",database:u.pathname.slice(1)||"0",authenticated:!!(u.username||u.password),protocol:u.protocol}}));const r=new Redis(process.env.REDIS_URL,{lazyConnect:true,connectTimeout:5000,maxRetriesPerRequest:1,retryStrategy:()=>null});try{await r.connect();console.log(JSON.stringify({ping:await r.ping(),keys:await r.dbsize()}));}finally{r.disconnect();}'
    ;;
  reset-keep-owner)
    test -s "$RESET_SQL_PATH"
    test "$(docker exec gopark-postgres psql -U gopark -d gopark -Atc "SELECT count(*) FROM users WHERE role::text='owner' AND status::text='active'")" = 1
    REDIS_DB=$(docker exec gopark-api node -e 'const u=new URL(process.env.REDIS_URL);const db=u.pathname.slice(1)||"0";if(!/^[0-9]+$/.test(db))throw Error("Invalid Redis DB");process.stdout.write(db)')
    docker exec gopark-redis timeout 10 redis-cli -n "$REDIS_DB" PING | grep -qx PONG
    umask 077
    BACKUP="$BASE/backups/owner-only-reset-$(date -u +%Y%m%dT%H%M%S)-$$"
    mkdir -p "$BACKUP"
    resume_services() { docker start gopark-api gopark-worker >/dev/null; docker exec gopark-crm-web nginx -s reload; }
    trap resume_services EXIT
    docker stop --time 30 gopark-api gopark-worker >/dev/null
    docker exec gopark-postgres pg_dump -U gopark -d gopark -Fc > "$BACKUP/database.dump"
    docker exec -i gopark-postgres pg_restore --list < "$BACKUP/database.dump" > "$BACKUP/database.contents"
    test -s "$BACKUP/database.dump"
    test -s "$BACKUP/database.contents"
    cp "$CONFIG_DIR/.env" "$BACKUP/server.env"
    cat "$BASE/gopark-current-sha" > "$BACKUP/release-sha"
    docker exec gopark-redis timeout 10 redis-cli SAVE > "$BACKUP/redis-save.log"
    docker cp gopark-redis:/data/dump.rdb "$BACKUP/redis.rdb"
    test -s "$BACKUP/redis.rdb"
    echo "Verified database, Redis and configuration backup: $BACKUP"
    docker exec -i gopark-postgres psql -U gopark -d gopark -v ON_ERROR_STOP=1 < "$RESET_SQL_PATH"
    docker exec gopark-redis timeout 10 redis-cli -n "$REDIS_DB" FLUSHDB | grep -qx OK
    resume_services
    trap - EXIT
    for attempt in $(seq 1 30); do
      if curl --max-time 5 -fsS http://127.0.0.1:3000/api/health; then break; fi
      sleep 2
    done
    curl --max-time 5 -fsS http://127.0.0.1:3000/api/health
    docker exec gopark-api node --input-type=module -e 'const {PrismaClient}=await import("./apps/api/node_modules/@prisma/client/default.js");const p=new PrismaClient();try{const owners=await p.user.findMany({select:{id:true,email:true,role:true,status:true}});const tables=await p.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname=\x27public\x27 AND tablename NOT IN (\x27users\x27,\x27_prisma_migrations\x27)");const nonempty=[];for(const t of tables){if(!/^[a-z_][a-z0-9_]*$/i.test(t.tablename))throw Error("Unexpected table name");const r=await p.$queryRawUnsafe(`SELECT count(*) AS n FROM public.${t.tablename}`);if(Number(r[0].n)!==0)nonempty.push({table:t.tablename,count:String(r[0].n)});}console.log(JSON.stringify({accounts:owners,nonemptyBusinessTables:nonempty}));if(owners.length!==1||owners[0].role!=="owner"||nonempty.length)throw Error("Post-reset verification failed");}finally{await p.$disconnect()}'
    ;;
  prepare-database-reset)
    umask 077
    BACKUP="$BASE/backups/before-requested-reset-$(date -u +%Y%m%dT%H%M%S)-$$"
    mkdir -p "$BACKUP"
    docker exec gopark-postgres pg_dump -U gopark -d gopark -Fc > "$BACKUP/database.dump"
    test -s "$BACKUP/database.dump"
    docker exec -i gopark-postgres pg_restore --list < "$BACKUP/database.dump" > "$BACKUP/database.contents"
    test -s "$BACKUP/database.contents"
    cp "$CONFIG_DIR/.env" "$BACKUP/server.env"
    cat "$BASE/gopark-current-sha" > "$BACKUP/release-sha"
    echo "Verified pre-reset database and configuration backup: $BACKUP"
    docker exec gopark-api node --input-type=module -e 'const {PrismaClient}=await import("./apps/api/node_modules/@prisma/client/default.js");const p=new PrismaClient();try{const admins=await p.user.findMany({where:{role:{in:["owner","admin"]}},select:{id:true,role:true,email:true,phone:true,status:true,firstName:true,lastName:true}});console.log(JSON.stringify({administrators:admins,counts:{users:await p.user.count(),drivers:await p.driver.count(),cars:await p.car.count(),contracts:await p.contract.count(),incidents:await p.incident.count()}}));}finally{await p.$disconnect()}'
    ;;
  send-vehicle-service)
    test -n "$VEHICLE_PLATE"
    [[ "$WORKSHOP" =~ ^(main|body|both)$ ]]
    umask 077
    BACKUP="$BASE/backups/service-handoff-$(date -u +%Y%m%dT%H%M%S)-$$"
    mkdir -p "$BACKUP"
    docker exec -e "LOOKUP_PLATE=$VEHICLE_PLATE" gopark-api node --input-type=module -e 'const {PrismaClient}=await import("./apps/api/node_modules/@prisma/client/default.js");const p=new PrismaClient();try{const norm=s=>String(s??"").replace(/[^A-Za-z0-9]/g,"").toUpperCase();const cars=(await p.car.findMany({select:{id:true,plateNumber:true,status:true}})).filter(c=>norm(c.plateNumber).includes(norm(process.env.LOOKUP_PLATE)));if(cars.length!==1)throw Error("Expected exactly one matching vehicle");const cases=await p.incident.findMany({where:{carId:cars[0].id,status:"open",incidentType:{in:["repair","accident"]}}});if(cases.length!==1)throw Error("Expected exactly one active incident; refusing to choose a record");process.stdout.write(JSON.stringify({car:cars[0],incident:cases[0]}));}finally{await p.$disconnect()}' > "$BACKUP/incident-before.json"
    test -s "$BACKUP/incident-before.json"
    docker exec -i -e "TARGET_WORKSHOP=$WORKSHOP" gopark-api node --input-type=module -e 'import fs from "node:fs";import {isDeepStrictEqual} from "node:util";const before=JSON.parse(fs.readFileSync(0,"utf8"));const {PrismaClient}=await import("./apps/api/node_modules/@prisma/client/default.js");const {IncidentPrismaRepository}=await import("./apps/api/dist/apps/api/src/infrastructure/repositories/incident.prisma.repository.js");const p=new PrismaClient();try{const current=await p.incident.findUnique({where:{id:before.incident.id}});if(!current||current.status!=="open"||!isDeepStrictEqual(JSON.parse(JSON.stringify(current)),before.incident))throw Error("Incident changed; refresh and retry");const shop=process.env.TARGET_WORKSHOP;if(!["main","body","both"].includes(shop))throw Error("Invalid workshop");const active=["sent_to_service","awaiting_repair","in_repair"].includes(current.serviceStage);if(!active&&current.serviceStage!=="accident")throw Error("Unsupported current stage for handoff");if(!(active&&current.serviceDetails?.workshop===shop)){const d=current.serviceDetails??{};const reason=d.reason?.trim()||current.repairNote?.trim()||current.description?.trim()||(current.incidentType==="accident"?"ДТП":"Ремонт");await new IncidentPrismaRepository({client:p}).update(current.id,{serviceStage:active?current.serviceStage:"sent_to_service",serviceDetails:{...d,reason,workshop:shop,repairCategory:d.repairCategory??(current.incidentType==="accident"?"accident":"repair")},...(!d.expectedPayer&&!(d.payments?.length)?{servicePayer:null}:{})});}const item=await p.incident.findUniqueOrThrow({where:{id:current.id}});const car=await p.car.findUniqueOrThrow({where:{id:before.car.id},select:{plateNumber:true,status:true}});if(item.serviceDetails?.workshop!==shop||!["sent_to_service","awaiting_repair","in_repair"].includes(item.serviceStage))throw Error("Handoff verification failed");console.log(JSON.stringify({car,incidentId:item.id,stage:item.serviceStage,workshop:item.serviceDetails.workshop,expectedPayer:item.serviceDetails.expectedPayer??null,payer:item.servicePayer??null,sentAt:item.serviceDetails.sentAt??null,arrivedAt:item.serviceDetails.arrivedAt??null}));}finally{await p.$disconnect()}' < "$BACKUP/incident-before.json"
    echo "Saved handoff preimage on the server: $BACKUP"
    ;;
  release-impounded-vehicles)
    test -n "$VEHICLE_PLATE"
    umask 077
    BACKUP="$BASE/backups/impound-release-$(date -u +%Y%m%dT%H%M%S)-$$"
    mkdir -p "$BACKUP"
    docker exec gopark-postgres pg_dump -U gopark gopark | gzip > "$BACKUP/database.sql.gz"
    gzip -t "$BACKUP/database.sql.gz"
    cp "$BASE/gopark/.env" "$BACKUP/server.env"
    docker exec -i -e TARGET_PLATES="$VEHICLE_PLATE" gopark-api node --input-type=module <<'JS'
import{createRequire}from"node:module";import{randomUUID}from"node:crypto";const require=createRequire(import.meta.url);const{PrismaClient}=require("./apps/api/node_modules/@prisma/client");const p=new PrismaClient();try{const norm=s=>String(s??"").replace(/[^A-Za-z0-9]/g,"").toUpperCase();const keys=[...new Set(process.env.TARGET_PLATES.trim().split(/\s+/).map(norm))];const result=await p.$transaction(async tx=>{const all=await tx.car.findMany({select:{id:true,plateNumber:true,status:true}});const cars=keys.map(k=>{const found=all.filter(c=>norm(c.plateNumber)===k);if(found.length!==1)throw Error("Expected one exact vehicle per plate");return found[0];});const result=[];for(const car of cars){if(!["impound","assigned","free"].includes(car.status))throw Error("Vehicle status requires separate review");if(await tx.incident.count({where:{carId:car.id,status:"open"}}))throw Error("Active incident must be reviewed before release");const assignment=await tx.carAssignment.findFirst({where:{carId:car.id,endedAt:null},include:{driver:true},orderBy:{startedAt:"desc"}});const next=assignment&&assignment.driver.status!=="terminated"?"assigned":"free";if(car.status==="impound"){await tx.car.update({where:{id:car.id},data:{status:next}});await tx.auditLog.create({data:{action:"vehicle.impound.released",entityType:"car",entityId:car.id,correlationId:randomUUID(),beforeData:{status:car.status},afterData:{status:next,reason:"Owner confirmed physical release from impound"}}});}result.push({plate:car.plateNumber,status:next,driverStillAssigned:!!assignment});}return result;});console.log(JSON.stringify({released:result}));}finally{await p.$disconnect();}
JS
    echo "Verified database/configuration backup: $BACKUP"
    ;;
  vehicle-diagnostic)
    test -n "$VEHICLE_PLATE"
    docker exec -i -e LOOKUP_PLATE="$VEHICLE_PLATE" gopark-api node --input-type=module <<'JS'
import{createRequire}from"node:module";const require=createRequire(import.meta.url);const{PrismaClient}=require("./apps/api/node_modules/@prisma/client");const p=new PrismaClient();try{const norm=s=>String(s??"").replace(/[^A-Za-z0-9]/g,"").toUpperCase();const cars=(await p.car.findMany({select:{id:true,plateNumber:true,status:true}})).filter(c=>norm(c.plateNumber).includes(norm(process.env.LOOKUP_PLATE)));for(const c of cars){const assignments=await p.carAssignment.findMany({where:{carId:c.id},orderBy:{startedAt:"desc"},take:5,select:{startedAt:true,endedAt:true,driver:{select:{id:true,status:true,contracts:{where:{status:"active"},select:{id:true}}}}}});const contracts=await p.contract.findMany({where:{carId:c.id},select:{contractNumber:true,status:true,driverId:true}});const cases=await p.incident.findMany({where:{carId:c.id},select:{status:true,incidentType:true,serviceStage:true,driverId:true,statusHistory:true}});console.log(JSON.stringify({plate:c.plateNumber,vehicleStatus:c.status,assignments:assignments.map(a=>({startedAt:a.startedAt,endedAt:a.endedAt,driverStatus:a.driver.status,hasActiveContract:a.driver.contracts.length>0})),contracts:contracts.map(k=>({number:k.contractNumber,status:k.status,assignedToCurrentDriver:assignments.some(a=>!a.endedAt&&a.driver.id===k.driverId)})),cases:cases.map(k=>({status:k.status,type:k.incidentType,stage:k.serviceStage,hasDriver:!!k.driverId,history:(k.statusHistory??[]).map(h=>({status:h.status,serviceStage:h.serviceStage,at:h.at??h.changedAt}))}))}));}}finally{await p.$disconnect();}
JS
    test -n "$VEHICLE_PLATE"
    cat "$BASE/gopark-current-sha"
    docker exec -e "LOOKUP_PLATE=$VEHICLE_PLATE" gopark-api node --input-type=module -e 'const {PrismaClient}=await import("./apps/api/node_modules/@prisma/client/default.js");const p=new PrismaClient();try{const norm=s=>String(s??"").replace(/[^A-Za-z0-9]/g,"").toUpperCase();const key=norm(process.env.LOOKUP_PLATE);const cars=(await p.car.findMany({select:{id:true,plateNumber:true,status:true}})).filter(c=>norm(c.plateNumber).includes(key));const cases=await p.incident.findMany({where:{carId:{in:cars.map(c=>c.id)}},orderBy:{createdAt:"desc"},take:20,select:{id:true,carId:true,incidentType:true,status:true,serviceStage:true,createdAt:true,occurredAt:true,serviceDetails:true,accidentDetails:true}});console.log(JSON.stringify({cars,incidents:cases.map(({serviceDetails,accidentDetails,...i})=>({...i,workshop:serviceDetails?.workshop??null,hasReason:!!serviceDetails?.reason,repairCategory:serviceDetails?.repairCategory??null,hasAccidentDetails:!!accidentDetails,sentAt:serviceDetails?.sentAt??null,arrivedAt:serviceDetails?.arrivedAt??null}))}));}finally{await p.$disconnect()}'
    ;;
  repair-consistency)
    docker exec gopark-api node --input-type=module -e 'const {PrismaClient}=await import("./apps/api/node_modules/@prisma/client/default.js");const p=new PrismaClient();try{const cars=await p.car.findMany({where:{status:"maintenance"},select:{id:true,status:true,assignments:{where:{endedAt:null},select:{driverId:true}}}});const driverIds=cars.flatMap(c=>c.assignments.map(a=>a.driverId));const incidents=await p.incident.findMany({where:{OR:[{carId:{in:cars.map(c=>c.id)}},{driverId:{in:driverIds}}]},select:{id:true,carId:true,driverId:true,incidentType:true,status:true,serviceStage:true,occurredAt:true,serviceDetails:true}});console.log(JSON.stringify({repairCars:cars,relatedIncidents:incidents.map(({serviceDetails,...i})=>({...i,workshop:serviceDetails?.workshop??null,hasReason:!!serviceDetails?.reason}))}));const recent=await p.incident.findMany({where:{incidentType:{in:["repair","accident"]}},orderBy:{createdAt:"desc"},take:20,select:{id:true,carId:true,createdAt:true,occurredAt:true,status:true,serviceStage:true,serviceDetails:true}});console.log(JSON.stringify({recentRepairs:recent.map(({serviceDetails,...i})=>({...i,workshop:serviceDetails?.workshop??null}))}));}finally{await p.$disconnect()}'
    ;;
  manager-vehicles)
    docker exec gopark-api node --input-type=module -e 'const {PrismaClient}=await import("./apps/api/node_modules/@prisma/client/default.js");const p=new PrismaClient();try{const users=await p.user.findMany({where:{role:"manager"},select:{id:true,firstName:true,lastName:true,companyName:true,manager:{select:{id:true,level:true,_count:{select:{cars:true,drivers:true}}}}}});console.log(JSON.stringify(users));const cars=await p.car.findMany({select:{id:true,managerId:true,companyName:true,status:true,assignments:{where:{endedAt:null},select:{driver:{select:{managerId:true,companyName:true}}}}}});console.log(JSON.stringify({cars}));}finally{await p.$disconnect()}'
    ;;
  contract-numbers)
    docker exec gopark-postgres psql -U gopark -d gopark -v ON_ERROR_STOP=1 -c 'SELECT contract_number, status FROM contracts ORDER BY created_at;'
    docker exec gopark-api node --input-type=module -e 'const {PrismaClient}=await import("./apps/api/node_modules/@prisma/client/default.js");const {ContractPrismaRepository}=await import("./apps/api/dist/apps/api/src/infrastructure/repositories/contract.prisma.repository.js");const client=new PrismaClient();try{console.log(JSON.stringify({nextContractNumber:await new ContractPrismaRepository({client}).getNextNumber()}))}finally{await client.$disconnect()}'
    ;;
  repair-contract-schedule)
    [[ "$CONTRACT_NUMBER" =~ ^[0-9]{1,12}$ ]]
    test -s "$REPAIR_SCRIPT_PATH"
    umask 077
    BACKUP="$BASE/backups/contract-schedule-$(date -u +%Y%m%dT%H%M%S)-$$"
    mkdir -p "$BACKUP"
    docker exec gopark-postgres pg_dump -U gopark -d gopark -Fc > "$BACKUP/database.dump"
    docker exec -i gopark-postgres pg_restore --list < "$BACKUP/database.dump" > "$BACKUP/database.contents"
    test -s "$BACKUP/database.dump"
    test -s "$BACKUP/database.contents"
    cp "$CONFIG_DIR/.env" "$BACKUP/server.env"
    docker cp "$REPAIR_SCRIPT_PATH" gopark-api:/tmp/gopark-repair-contract.mjs
    docker exec -e "CONTRACT_NUMBER=$CONTRACT_NUMBER" gopark-api node /tmp/gopark-repair-contract.mjs preview > "$BACKUP/contract-before.json"
    test -s "$BACKUP/contract-before.json"
    echo "Verified backup before schedule repair: $BACKUP"
    docker exec -i -e "CONTRACT_NUMBER=$CONTRACT_NUMBER" gopark-api node /tmp/gopark-repair-contract.mjs repair < "$BACKUP/contract-before.json"
    ;;
  contract-term-diagnostic)
    docker exec gopark-postgres psql -U gopark -d gopark -v ON_ERROR_STOP=1 -x -c "SELECT c.contract_number, d.first_name, d.last_name, d.weekly_day_off, c.start_date::date, c.end_date::date, c.term_months, c.principal_amount, c.upfront_amount, c.financed_amount, c.installment_amount, c.created_at, (SELECT coalesce(sum(o.paid_amount),0) FROM obligations o WHERE o.contract_id=c.id) AS schedule_paid, (SELECT coalesce(sum(o.amount-o.paid_amount),0) FROM obligations o WHERE o.contract_id=c.id) AS raw_debt, (SELECT count(*) FROM payments p WHERE p.contract_id=c.id) AS payments_count, (SELECT coalesce(sum(p.amount),0) FROM payments p WHERE p.contract_id=c.id) AS payments_total, (c.end_date::date-c.start_date::date+1) AS calendar_days, (SELECT count(*) FROM obligations o WHERE o.contract_id=c.id AND o.type::text='installment') AS schedule_rows, (SELECT sum(o.amount) FROM obligations o WHERE o.contract_id=c.id AND o.type::text='installment') AS schedule_total FROM contracts c JOIN drivers d ON d.id=c.driver_id ORDER BY c.created_at DESC LIMIT 1;"
    ;;
  status)
    compose ps
    cat "$BASE/gopark-current-sha" 2>/dev/null || true
    curl -fsS http://127.0.0.1:3000/api/health
    ;;
  dashboard-totals)
    # Aggregate diagnostics only: no names, phone numbers or record identifiers.
    docker exec gopark-postgres psql -U gopark -d gopark -v ON_ERROR_STOP=1 -c "SELECT CURRENT_DATE AS server_date; SELECT status, count(*) AS drivers FROM drivers GROUP BY status; SELECT c.status AS contract_status, d.status AS driver_status, count(*) AS contracts, sum(c.installment_amount) AS daily_payment FROM contracts c LEFT JOIN drivers d ON d.id=c.driver_id GROUP BY c.status,d.status; SELECT o.due_date::date AS due_date, o.type, c.status AS contract_status, d.status AS driver_status, EXISTS(SELECT 1 FROM car_assignments a JOIN cars car ON car.id=a.car_id WHERE a.driver_id=o.driver_id AND a.ended_at IS NULL AND car.status='assigned') AS assigned, count(*) AS obligations, sum(o.amount) AS charged, sum(o.paid_amount) AS paid, sum(GREATEST(COALESCE((o.metadata->>'installmentAmount')::numeric,o.amount)-LEAST(o.paid_amount,COALESCE((o.metadata->>'installmentAmount')::numeric,o.amount)),0)) AS open_installment FROM obligations o LEFT JOIN contracts c ON c.id=o.contract_id LEFT JOIN drivers d ON d.id=o.driver_id WHERE o.due_date::date BETWEEN CURRENT_DATE AND CURRENT_DATE+6 GROUP BY o.due_date::date,o.type,c.status,d.status,assigned ORDER BY o.due_date::date,o.type;"
    docker exec gopark-api node --input-type=module -e 'const {DashboardService}=await import("./apps/api/dist/apps/api/src/modules/dashboard/dashboard.service.js");const date=new Date().toISOString().slice(0,10);const overview=await new DashboardService().getOverview("today",null,date,date);console.log(JSON.stringify({date,plannedPayment:overview.plannedPayment,debt:overview.debt,actualPayment:overview.actualPayment,overpayment:overview.overpayment}));process.exit(0)'
    ;;
  incident-schema)
    cat "$BASE/gopark-current-sha" 2>/dev/null || true
    find "$APP_DIR/apps/api/prisma/migrations" -maxdepth 2 -type f -name migration.sql -printf '%P\n' 2>/dev/null || true
    docker exec gopark-postgres psql -U gopark -d gopark -v ON_ERROR_STOP=1 -c "SELECT to_regclass('public._prisma_migrations') AS migration_table; SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='incidents' ORDER BY ordinal_position;"
    if docker exec gopark-postgres psql -U gopark -d gopark -Atc "SELECT to_regclass('public._prisma_migrations') IS NOT NULL" | grep -q '^t$'; then
      docker exec gopark-postgres psql -U gopark -d gopark -c 'SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at;'
    fi
    ;;
  logs)
    compose logs --tail=200 api worker crm-web | sed -E 's/(Authorization: Bearer )[A-Za-z0-9._-]+/\1[redacted]/g'
    ;;
  recover-contract-runtime)
    # Restore only compiled module files in the existing application containers.
    # Database, Redis, configuration and volumes are untouched.
    RECOVERY_DIR=$(mktemp -d /tmp/gopark-contract-runtime.XXXXXX)
    docker cp gopark-api:/app/apps/api/dist/packages/contracts/src/. "$RECOVERY_DIR/"
    test -f "$RECOVERY_DIR/platform.js"
    for container in gopark-api gopark-worker; do
      docker cp "$RECOVERY_DIR/." "$container:/app/packages/contracts/src/"
    done
    docker restart gopark-api gopark-worker
    docker restart gopark-crm-web
    for attempt in $(seq 1 30); do
      if curl --max-time 5 -fsS http://127.0.0.1:3000/api/health; then
        echo 'Recovered application health'
        exit 0
      fi
      sleep 2
    done
    exit 1
    ;;
  restart)
    compose restart api worker crm-web
    curl -fsS http://127.0.0.1:3000/api/health
    ;;
  redeploy)
    compose up -d --no-deps --force-recreate api worker crm-web
    curl -fsS http://127.0.0.1:3000/api/health
    ;;
  rollback)
    test -n "$ROLLBACK_SHA"
    TARGET="$BASE/gopark-releases/$ROLLBACK_SHA"
    test -d "$TARGET"
    cd "$TARGET"
    compose build api crm-web
    compose up -d --no-deps --force-recreate api worker crm-web
    ln -sfn "$TARGET" "$CURRENT"
    echo "$ROLLBACK_SHA" > "$BASE/gopark-current-sha"
    curl -fsS http://127.0.0.1:3000/api/health
    ;;
  *)
    echo "Unsupported operation"
    exit 2
    ;;
esac

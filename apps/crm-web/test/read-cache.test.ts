import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadCache } from '../src/lib/read-cache.js';

test('parallel sections share a read; snapshots do not suppress fresh network reads', async () => {
  let calls=0;const c=new ReadCache();
  const read=()=>c.read('user','cars',async()=>++calls);
  assert.deepEqual(await Promise.all(Array.from({length:20},read)),Array(20).fill(1));
  assert.equal(c.snapshot('user','cars'),1);
  assert.equal(await read(),2);
});
test('mutation clears snapshots and separates new reads from older pending responses', async () => {
  const c=new ReadCache();let finish!:(n:number)=>void;
  const old=c.read('user','payments',()=>new Promise<number>(r=>finish=r));
  await Promise.resolve();c.invalidate();
  await c.read('user','payments',async()=>200);
  finish(100);await old;assert.equal(c.snapshot('user','payments'),200);
});
test('failed reads retry and accounts, expiry, capacity and live messages remain isolated', async () => {
  let now=0;const c=new ReadCache(()=>now,100,2);
  await assert.rejects(c.read('one','cars',async()=>{throw new Error('fixture');}));
  await c.read('one','cars',async()=>1);assert.equal(c.snapshot('two','cars'),undefined);
  await c.read('two','cars',async()=>2);now=101;assert.equal(c.snapshot('two','cars'),undefined);
  for(const p of ['a','b','c']) await c.read('two',p,async()=>p);
  assert.equal(c.snapshot('two','a'),undefined);
  await c.read('two','chats/x',async()=>['message']);assert.equal(c.snapshot('two','chats/x'),undefined);
  await c.read('two','contracts/next-number',async()=>7);assert.equal(c.snapshot('two','contracts/next-number'),undefined);
});
test('an old account response cannot replace a new account snapshot', async()=>{
  const c=new ReadCache();let finish!:(n:number)=>void;
  const old=c.read('one','drivers',()=>new Promise<number>(r=>finish=r));
  await Promise.resolve();await c.read('two','drivers',async()=>2);finish(1);await old;
  assert.equal(c.snapshot('two','drivers'),2);
});

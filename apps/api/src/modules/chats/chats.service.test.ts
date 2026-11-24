import test from "node:test";
import assert from "node:assert/strict";
import { ChatsService } from "./chats.service.js";

for (const failing of [false, true]) {
  test(`saved chat is acknowledged without waiting for ${failing ? 'failed' : 'slow'} push`, async () => {
    let finish!: () => void;
    const delivery = new Promise<void>((resolve) => { finish = resolve; });
    let calls = 0;
    const service = new ChatsService({ client: null } as never, {
      createDriverChatMessageReceived: async () => {
        calls++;
        await delivery;
        if (failing) throw new Error('test push failure');
      },
    } as never);
    const user = { id: 'fixture-owner', role: 'owner' as const };
    let timeout!: ReturnType<typeof setTimeout>;
    const stalled = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Acknowledgement waited for push")), 500);
    });
    try {
      const started = await Promise.race([service.create({ driverId:'fixture-driver', body:'First' }, user), stalled]);
      assert.equal(calls, 1);
      // Notification delivery remains pending; message is already readable.
      const sent = await Promise.race([service.sendMessage(started.id, { body:'Second' }, user), stalled]);
      assert.equal(calls, 2);
      assert.deepEqual(sent.messages.map(m => m.body), ['First', 'Second']);
      assert.deepEqual((await service.get(started.id,user)).messages, sent.messages);
    } finally {
      clearTimeout(timeout);
      finish();
    }
    await new Promise(resolve => setImmediate(resolve));
  });
}

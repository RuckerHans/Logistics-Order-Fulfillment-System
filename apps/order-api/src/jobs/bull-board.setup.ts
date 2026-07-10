import type { BaseAdapter } from '@bull-board/api/dist/src/queueAdapters/base';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';

export function setupBullBoard(queues: Queue[]): ExpressAdapter {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    // bullmq's installed version widened Job.progress beyond what this
    // @bull-board/api version's types expect (string, not just number |
    // object) — a type-only mismatch between two independently-versioned
    // packages, not a real runtime incompatibility.
    queues: queues.map((q) => new BullMQAdapter(q) as unknown as BaseAdapter),
    serverAdapter,
  });

  return serverAdapter;
}

/// <reference lib="webworker" />
import { ChunkBuilder } from './chunkBuilder';
import { transferablesOf, type WorkerInbound } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let builder: ChunkBuilder | null = null;

self.onmessage = (ev: MessageEvent<WorkerInbound>) => {
  const msg = ev.data;
  if (msg.type === 'configure') {
    if (builder) builder.configure(msg.seed, msg.options);
    else builder = new ChunkBuilder(msg.seed, msg.options);
    return;
  }
  if (msg.type === 'build') {
    if (!builder) throw new Error('chunk.worker: build before configure');
    const result = builder.build(msg);
    self.postMessage(result, transferablesOf(result));
  }
};

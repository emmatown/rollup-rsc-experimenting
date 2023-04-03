"use client";
import { ReactElement, ReactNode, startTransition, use } from "react";
import { hydrateRoot } from "react-dom/client";
import { createFromReadableStream } from "react-server-dom-webpack/client.browser";
import { Router } from "./router";

const chunkPromises = new Map<string, Promise<unknown>>();
const chunks = new Map<string, unknown>();

(globalThis as any).__webpack_chunk_load__ = (chunk: string) => {
  if (chunkPromises.has(chunk)) {
    return chunkPromises.get(chunk)!;
  }
  const promise = import(`/assets/${chunk}`).then((loaded) => {
    chunks.set(chunk, loaded);
    return loaded;
  });
  chunkPromises.set(chunk, promise);
  return promise;
};

(globalThis as any).__webpack_require__ = (id: string) => {
  if (!chunks.has(id)) {
    throw new Error(`Module ${id} not found`);
  }
  return chunks.get(id);
};

const encoder = new TextEncoder();

const readable = new ReadableStream<Uint8Array>({
  start(controller) {
    const handleChunk = (val: string): any => {
      controller.enqueue(encoder.encode(val));
    };
    const serverDataGlobal: string[] = ((self as any).__data ??= []);
    serverDataGlobal.forEach(handleChunk);
    serverDataGlobal.push = handleChunk;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => controller.close(), {
        once: true,
      });
    } else {
      controller.close();
    }
  },
});

const data = createFromReadableStream<ReactElement>(readable);

startTransition(() => {
  hydrateRoot(
    document,
    <Router initialData={data} initialUrl={window.location.href} />
  );
});

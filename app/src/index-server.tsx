import {
  ClientManifest,
  renderToReadableStream,
} from "react-server-dom-webpack/server.browser";
import { Root } from "./app";
import { ReactNode } from "react";

export async function handleRequest(
  request: Request,
  opts: {
    assets: Map<string, string>;
    clientManifest: ClientManifest;
    clientEntryModules: string[];
    clientSsr: typeof import("./client-ssr");
  }
) {
  if (request.method !== "GET") {
    return new Response(null, {
      status: 405,
    });
  }
  const url = new URL(request.url);
  if (url.pathname.startsWith("/assets/")) {
    const rest = url.pathname.slice("/assets/".length);
    const asset = opts.assets.get(rest);
    if (asset) {
      return new Response(asset, {
        status: 200,
        headers: {
          "content-type": "application/javascript",
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    }
    return new Response(null, {
      status: 404,
    });
  }

  const allChunksNeeded = new Set<string>(opts.clientEntryModules);
  let chunksToFlush: string[] = [];

  // i would have thought there would be an easier way to get the chunks used
  const manifest = Object.defineProperties(
    {},
    Object.fromEntries(
      Object.entries(opts.clientManifest).map(([key, value]) => {
        return [
          key,
          {
            get() {
              for (const chunk of value.chunks) {
                if (allChunksNeeded.has(chunk)) {
                  continue;
                }
                allChunksNeeded.add(chunk);
                chunksToFlush.push(chunk);
              }
              return value;
            },
          },
        ];
      })
    )
  );

  const rscResponse = renderToReadableStream(
    <Root url={request.url} />,
    manifest
  );
  if (request.headers.get("accept") === "text/x-component") {
    return new Response(rscResponse, {
      headers: { "content-type": "text/x-component" },
    });
  }
  try {
    const { Router, createFromReadableStream, ssrRenderToReadableStream } =
      opts.clientSsr;
    const [rscResponseForSSR, rscResponseForInline] = rscResponse.tee();
    const root = createFromReadableStream<ReactNode>(rscResponseForSSR);
    const ssrStream = await ssrRenderToReadableStream(
      <Router initialUrl={request.url} initialData={root} />,
      {
        bootstrapModules: opts.clientEntryModules.map(
          (mod) => `/assets/${mod}`
        ),
      }
    );

    const inlineDataTransformStream = new TransformStream();

    inlineRscStream(
      inlineDataTransformStream.writable,
      rscResponseForInline,
      () => {
        let modules = chunksToFlush.map((chunk) => `/assets/${chunk}`);
        chunksToFlush = [];
        return modules;
      }
    );
    const out = ssrStream.pipeThrough(
      createInlineDataStream(inlineDataTransformStream.readable)
    );

    return new Response(out, {
      headers: { "content-type": "text/html" },
    });
  } catch (err: any) {
    return new Response(`${err.stack}`, {
      headers: { "content-type": "text/plain" },
    });
  }
}

// https://github.com/vercel/next.js/blob/400ccf7b1c802c94127d8d8e0d5e9bdf9aab270c/packages/next/src/server/node-web-streams-helper.ts#L255-L296
function createInlineDataStream(
  dataStream: ReadableStream<Uint8Array>
): TransformStream<Uint8Array, Uint8Array> {
  let dataStreamFinished: Promise<void> | null = null;
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk);

      if (!dataStreamFinished) {
        const dataStreamReader = dataStream.getReader();

        // NOTE: streaming flush
        // We are buffering here for the inlined data stream because the
        // "shell" stream might be chunkenized again by the underlying stream
        // implementation, e.g. with a specific high-water mark. To ensure it's
        // the safe timing to pipe the data stream, this extra tick is
        // necessary.
        dataStreamFinished = new Promise((res) =>
          setTimeout(async () => {
            try {
              while (true) {
                const { done, value } = await dataStreamReader.read();
                if (done) {
                  return res();
                }
                controller.enqueue(value);
              }
            } catch (err) {
              controller.error(err);
            }
            res();
          }, 0)
        );
      }
    },
    flush() {
      if (dataStreamFinished) {
        return dataStreamFinished;
      }
    },
  });
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

async function inlineRscStream(
  writable: WritableStream<Uint8Array>,
  rscStream: ReadableStream<Uint8Array>,
  getModulesToFlush: () => string[]
) {
  let bootstrapped = false;
  const rscReader = rscStream.getReader();
  const writer = writable.getWriter();
  while (true) {
    const { done, value } = await rscReader.read();
    if (done) {
      writer.close();
      break;
    }
    const responsePartial = textDecoder.decode(value);
    let scripts = `<script>${
      bootstrapped ? "__data" : "(__data=self.__data||[])"
    }.push(${escapeJsonStringForHtml(
      JSON.stringify(responsePartial)
    )})</script>`;
    const modules = getModulesToFlush();
    if (modules.length) {
      for (const module of modules) {
        scripts += `<script type="module" src="${module}" async></script>`;
      }
    }

    bootstrapped = true;
    writer.write(textEncoder.encode(scripts));
  }
}

// https://github.com/zertosh/htmlescape/blob/02dbcc367dd3069b73253ac08d87a40d37984239/htmlescape.js
const ESCAPE_LOOKUP: Record<string, string> = {
  "&": "\\u0026",
  ">": "\\u003e",
  "<": "\\u003c",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

const ESCAPE_REGEX = /[&><\u2028\u2029]/g;

function escaper(match: string) {
  return ESCAPE_LOOKUP[match];
}

function escapeJsonStringForHtml(str: string) {
  return str.replace(ESCAPE_REGEX, escaper);
}

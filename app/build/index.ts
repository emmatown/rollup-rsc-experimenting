import { PreRenderedChunk, RollupOutput, watch } from "rollup";
import fs from "fs/promises";
import { assert } from "emery";
import { buildToNodeHandler } from "@edge-runtime/node-utils";
import http from "http";
import { InputOptions } from "rollup";
import { toModuleId, wrapPlugins, getEnvForChunk } from "@rollup-rsc/core";
import commonJs from "@rollup/plugin-commonjs";
import replace from "@rollup/plugin-replace";
import nodeResolve from "@rollup/plugin-node-resolve";
import { createFilter } from "@rollup/pluginutils";
import { transform } from "esbuild";
import { FetchEvent } from "@edge-runtime/primitives";
import { ClientManifest } from "react-server-dom-webpack/server.browser";

(globalThis as any).FetchEvent = FetchEvent;

const chunkPromises = new Map<string, Promise<unknown>>();
const chunks = new Map<string, unknown>();

function loadChunk(chunk: string) {
  if (chunks.has(chunk)) {
    return chunks.get(chunk)!;
  }
  if (chunkPromises.has(chunk)) {
    return chunkPromises.get(chunk)!;
  }
  const promise = import(`../dist/${chunk}`).then((loaded) => {
    chunks.set(chunk, loaded);
    return loaded;
  });
  chunkPromises.set(chunk, promise);
  return promise;
}

(globalThis as any).__webpack_chunk_load__ = async (chunk: string) =>
  loadChunk(chunk);

(globalThis as any).__webpack_require__ = (id: string) => {
  if (!chunks.has(id)) {
    throw new Error(`Module ${id} not found`);
  }
  return chunks.get(id);
};

const extensions = [".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx"];

const filter = createFilter("**/*.{ts,tsx,mts,mjs,js,jsx}", "node_modules/**");

const mode: "production" | "development" = "development";

const toNodeHandler = buildToNodeHandler(globalThis as any, {
  defaultOrigin: "http://localhost:3000",
});

const rollupConfig: InputOptions = {
  input: {
    "server/index": toModuleId("src/index-server.tsx", "server"),
    "client/index": toModuleId("src/index-client.tsx", "client"),
    "client/client-ssr": toModuleId("src/client-ssr.tsx", "client"),
  },
  plugins: wrapPlugins([
    { kind: "client", plugins: nodeResolve({ extensions }) },
    {
      kind: "server",
      plugins: nodeResolve({ extensions, exportConditions: ["react-server"] }),
    },
    {
      name: "esbuild-transform",
      async transform(code, id) {
        if (!filter(id)) {
          return null;
        }
        const loader = id.endsWith(".tsx")
          ? "tsx"
          : id.endsWith(".ts") || id.endsWith(".mts")
          ? "ts"
          : "jsx";
        const transformed = await transform(code, {
          loader,
          jsx: "automatic",
          sourcefile: id,
        });
        return {
          code: transformed.code,
          map: transformed.map ? transformed.map : undefined,
        };
      },
    },
    commonJs({ sourceMap: true }),
    replace({
      preventAssignment: true,
      values: { "process.env.NODE_ENV": JSON.stringify(mode) },
      sourceMap: true,
    }),
  ]),
};

(async () => {
  let handler: http.RequestListener = (req, res) => {
    res.setHeader("refresh", "2");
    res.writeHead(200);
    res.write("<p>Loading</p>");
    res.end();
  };
  const server = http.createServer((req, res) => {
    handler(req, res);
  });
  server.listen(3000, () => {
    console.log("Server started on port 3000");
  });
  const fileNames = (ext: string) => (chunkInfo: PreRenderedChunk) => {
    return `${getEnvForChunk(chunkInfo)}/[name]-[hash].${ext}`;
  };
  const watcher = watch({
    ...rollupConfig,
    watch: {
      skipWrite: true,
    },
  });
  watcher.on("event", async (event) => {
    console.log(event.code);
    if (event.code === "ERROR") {
      event.result?.close();
      console.log(event.error);
    }
    if (event.code === "BUNDLE_END") {
      await fs.rm("dist", { recursive: true, force: true });
      await fs.mkdir("dist");
      await fs.writeFile(
        "dist/package.json",
        JSON.stringify({ type: "module" })
      );
      const output = await event.result.write({
        dir: "dist",
        format: "esm",
        entryFileNames: `[name]-[hash].js`,
        chunkFileNames: fileNames("js"),
      });
      event.result.close();

      const clientChunks = output.output.filter(
        (o): o is typeof o & { type: "chunk" } =>
          o.type === "chunk" && getEnvForChunk(o) === "client"
      );
      const assets = new Map(
        clientChunks.map((x) => [x.fileName, x.code] as const)
      );
      const clientManifest = createClientManifest(output);

      const clientSSREntry = findEntryChunkWithName(
        output,
        "client/client-ssr"
      );
      const clientSsr = await import(`../dist/${clientSSREntry.fileName}`);
      const serverEntry = findEntryChunkWithName(output, "server/index");
      const server = (await import(
        `../dist/${serverEntry.fileName}`
      )) as typeof import("../src/index-server");
      const clientEntry = findEntryChunkWithName(output, "client/index");
      const clientEntryModules = [clientEntry.fileName, ...clientEntry.imports];

      handler = toNodeHandler((req) =>
        server.handleRequest(req, {
          clientManifest,
          assets,
          clientEntryModules,
          clientSsr,
        })
      );
      console.log("updated build");
    }
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

function findEntryChunkWithName(output: RollupOutput, name: string) {
  const chunk = output.output.find(
    (x): x is typeof x & { type: "chunk" } =>
      x.type === "chunk" && x.isEntry && x.name === name
  );
  assert(chunk !== undefined);
  return chunk;
}

function createClientManifest(output: RollupOutput) {
  const clientManifest: ClientManifest = {};
  for (const chunk of output.output) {
    if (chunk.type !== "chunk" || getEnvForChunk(chunk) !== "client") {
      continue;
    }
    for (const exportName of chunk.exports) {
      const id = `${chunk.fileName}#${exportName}`;
      clientManifest[id] = {
        async: false,
        chunks: [chunk.fileName, ...chunk.imports],
        id: chunk.fileName,
        name: exportName,
      };
    }
  }
  return clientManifest;
}

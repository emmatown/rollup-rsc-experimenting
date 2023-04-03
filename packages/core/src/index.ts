import { PreRenderedChunk } from "rollup";
import { parseModuleId } from "./module-id";

export { parseModuleId, toModuleId } from "./module-id";
import { PluginForWrapping, rawWrapPlugins } from "./wrap-plugin";
import { plugin } from "./plugin";
import fs from "fs/promises";
import { assert } from "emery";

export function wrapPlugins(plugins: PluginForWrapping[]) {
  return rawWrapPlugins({ kind: "unwrapped", plugins: plugin() }, ...plugins, {
    name: "load",
    load(id) {
      this.addWatchFile(id);
      return fs.readFile(id, "utf-8");
    },
  });
}

export function getEnvForChunk(chunk: PreRenderedChunk) {
  const moduleId = chunk.facadeModuleId ?? chunk.moduleIds[0];
  assert(moduleId !== undefined);
  return parseModuleId(moduleId).kind;
}

import {
  InputPluginOption,
  Plugin,
  PluginContext,
  TransformPluginContext,
} from "rollup";
import weakMemoize from "@emotion/weak-memoize";
import { assert } from "emery";
import { parseModuleId, toModuleId } from "../module-id";
import {
  wrapPluginContext,
  wrapTransformPluginContext,
} from "./plugin-context";
import { wrapHook } from "./wrap-hook";

async function flattenPlugins(plugins: InputPluginOption): Promise<Plugin[]> {
  const resolved = await plugins;
  if (resolved == null || resolved === false) return [];
  if (Array.isArray(resolved)) {
    return Promise.all(resolved.map(flattenPlugins)).then((plugins) =>
      plugins.flat()
    );
  }
  return [resolved];
}

const implementedKeys = new Set([
  "name",
  "api",
  "version",
  "cacheKey",
  "buildStart",
  "buildEnd",
  "generateBundle",
  "load",
  "resolveId",
  "transform",
  "shouldTransformCachedModule",
  "options",
  "renderChunk",
  // this isn't an actual key on rollup plugins but @rollup/plugin-node-resolve has it on it's plugin
  // so we have it here so it's ignored
  "getPackageInfoForId",
  // the same as above but for terser
  "numOfWorkersUsed",
]);

export function wrapPlugin(plugin: Plugin, env: "client" | "server"): Plugin {
  const getWrappedPluginContext = weakMemoize(
    (context: PluginContext): PluginContext => wrapPluginContext(context, env)
  );
  const getWrappedTransformPluginContext = weakMemoize(
    (context: TransformPluginContext): TransformPluginContext =>
      wrapTransformPluginContext(context, env)
  );

  const keys = Object.keys(plugin);
  const unimplementedMethods = keys.filter((key) => !implementedKeys.has(key));
  if (unimplementedMethods.length) {
    throw new Error(
      `Plugin ${
        plugin.name
      } has unimplemented methods: ${unimplementedMethods.join(", ")}`
    );
  }
  return {
    ...plugin,
    ...wrapHook(
      "generateBundle",
      plugin.generateBundle,
      (inner, context, options, bundle, isWrite) => {
        const wrapped = getWrappedPluginContext(context);
        return inner(wrapped, throwingProxy, throwingProxy, isWrite);
      }
    ),
    ...wrapHook(
      "resolveId",
      plugin.resolveId,
      async (inner, context, source, importer, opts) => {
        let envFromId;
        if (importer === undefined) {
          const parsedSource = parseModuleId(source);
          envFromId = parsedSource.kind;
          source = parsedSource.inner;
        } else {
          const parsedSource = parseModuleId(importer);
          envFromId = parsedSource.kind;
          importer = parsedSource.inner;
        }
        if (env !== envFromId) {
          return null;
        }
        const wrapped = getWrappedPluginContext(context);
        const resolved = await inner(wrapped, source, importer, opts);
        if (resolved == null || resolved === false) return resolved;
        const resolvedObj =
          typeof resolved === "string" ? { id: resolved } : resolved;
        return {
          ...resolvedObj,
          id: toModuleId(resolvedObj.id, env),
        };
      }
    ),
    ...wrapHook(
      "transform",
      plugin.transform,
      async (inner, context, code, id) => {
        const wrapped = getWrappedTransformPluginContext(context);
        const parsedId = parseModuleId(id);
        if (parsedId.kind !== env) {
          return null;
        }
        return inner(wrapped, code, parsedId.inner);
      }
    ),
    ...wrapHook(
      "shouldTransformCachedModule",
      plugin.shouldTransformCachedModule,
      async (inner, context, options) => {
        // TODO: using the real implementation makes @rollup/plugin-commonjs error somewhere
        // so just doing the naive thing for now
        const wrapped = getWrappedPluginContext(context);
        const parsedId = parseModuleId(options.id);
        if (parsedId.kind !== env) {
          return false;
        }
        return inner(wrapped, {
          ...options,
          id: parsedId.inner,
          resolvedSources: Object.fromEntries(
            Object.entries(options.resolvedSources).map(
              ([source, resolved]) => {
                const parsedId = parseModuleId(resolved.id);
                if (parsedId.kind !== env) {
                  throw new Error(
                    `shouldTransformCachedModule: "resolvedSources" contains a module from the wrong environment ${env}`
                  );
                }

                return [
                  source,
                  {
                    ...resolved,
                    id: parsedId.inner,
                  },
                ];
              }
            )
          ),
        });
      }
    ),
    ...wrapHook("options", plugin.options, async (inner, context, options) => {
      const flattenedPlugins = await flattenPlugins(options.plugins);
      const updatedOptions = await inner(context, {
        ...options,
        plugins: flattenedPlugins,
      });
      if (updatedOptions == null) return updatedOptions;
      const newFlattenedPlugins = await flattenPlugins(updatedOptions.plugins);
      const existingPlugins = new Set(flattenedPlugins);
      const newPlugins = newFlattenedPlugins.map((plugin) =>
        existingPlugins.has(plugin) ? plugin : wrapPlugin(plugin, env)
      );
      const rscPluginIndex = newPlugins.findIndex(
        (plugin) => plugin.name === "server-components"
      );

      assert(rscPluginIndex !== -1, "server-components plugin not found");

      const rscPlugin = newPlugins.splice(rscPluginIndex, 1)[0];

      newPlugins.unshift(rscPlugin);

      return {
        ...updatedOptions,
        plugins: newPlugins,
      };
    }),
    ...wrapHook("load", plugin.load, async (inner, context, id) => {
      const wrapped = getWrappedPluginContext(context);
      const parsedId = parseModuleId(id);
      if (parsedId.kind !== env) {
        return null;
      }
      return inner(wrapped, parsedId.inner);
    }),
    ...wrapHook(
      "renderChunk",
      plugin.renderChunk,
      async (inner, context, code, chunk, options, meta) => {
        const wrapped = getWrappedPluginContext(context);

        return inner(
          wrapped,
          code,
          new Proxy(
            {
              fileName: chunk.fileName,
              sourcemap: chunk,
            },
            {
              get(target: any, key) {
                if (target[key] !== undefined) return target[key];
                throw new Error(`unimplemented ${key.toString()}`);
              },
            }
          ) as any,
          options,
          throwingProxy
        );
      }
    ),
  };
}

const throwingProxy: any = new Proxy(
  {},
  {
    get(target, key) {
      throw new Error(`unimplemented ${key.toString()}`);
    },
  }
);

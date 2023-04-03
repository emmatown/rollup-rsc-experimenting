import {
  ModuleInfo,
  PluginContext,
  TransformPluginContext,
  ModuleOptions,
  PartialNull,
  CustomPluginOptions,
} from "rollup";
import { parseModuleId, toModuleId } from "../module-id";

function toInnerIds(input: readonly string[]) {
  return input.map((x) => parseModuleId(x).inner);
}

function wrapModuleInfo(moduleInfo: ModuleInfo): ModuleInfo {
  return {
    assertions: moduleInfo.assertions,
    ast: moduleInfo.ast,
    code: moduleInfo.code,
    syntheticNamedExports: moduleInfo.syntheticNamedExports,
    id: parseModuleId(moduleInfo.id).inner,
    exports: moduleInfo.exports,
    isEntry: moduleInfo.isEntry,
    exportedBindings: moduleInfo.exportedBindings,
    hasDefaultExport: moduleInfo.hasDefaultExport,
    isExternal: moduleInfo.isExternal,
    meta: moduleInfo.meta,
    moduleSideEffects: moduleInfo.moduleSideEffects,
    isIncluded: moduleInfo.isIncluded,
    importers: toInnerIds(moduleInfo.importers),
    dynamicallyImportedIds: toInnerIds(moduleInfo.dynamicallyImportedIds),
    dynamicImporters: toInnerIds(moduleInfo.dynamicImporters),
    importedIds: toInnerIds(moduleInfo.importedIds),
    implicitlyLoadedBefore: toInnerIds(moduleInfo.implicitlyLoadedBefore),
    implicitlyLoadedAfterOneOf: toInnerIds(
      moduleInfo.implicitlyLoadedAfterOneOf
    ),
    dynamicallyImportedIdResolutions:
      moduleInfo.dynamicallyImportedIdResolutions.map((x) => ({
        ...x,
        id: parseModuleId(x.id).inner,
      })),
    importedIdResolutions: moduleInfo.importedIdResolutions.map((x) => ({
      ...x,
      id: parseModuleId(x.id).inner,
    })),
    get hasModuleSideEffects() {
      return moduleInfo.hasModuleSideEffects;
    },
  };
}

function unimplemented(): never {
  throw new Error("unimplemented");
}

export function wrapPluginContext(
  wrappedContext: PluginContext,
  env: "client" | "server"
): PluginContext {
  return {
    emitFile: unimplemented,
    getFileName: unimplemented,
    getModuleIds: unimplemented,
    getWatchFiles: unimplemented,
    cache: wrappedContext.cache,
    meta: wrappedContext.meta,
    addWatchFile: wrappedContext.addWatchFile,
    error: wrappedContext.error,
    warn: wrappedContext.warn,
    async load(
      options: { id: string; resolveDependencies?: boolean } & Partial<
        PartialNull<ModuleOptions>
      >
    ): Promise<ModuleInfo> {
      const loaded = await wrappedContext.load({
        ...options,
        id: toModuleId(options.id, env),
      });
      return wrapModuleInfo(loaded);
    },
    getModuleInfo(id: string): ModuleInfo | null {
      const moduleInfo = wrappedContext.getModuleInfo(toModuleId(id, env));
      if (moduleInfo === null) return null;
      return wrapModuleInfo(moduleInfo);
    },
    parse(input: string, options?: unknown) {
      return wrappedContext.parse(input, options);
    },
    async resolve(
      source: string,
      importer: string | undefined,
      options?: {
        assertions?: Record<string, string> | undefined;
        custom?: CustomPluginOptions | undefined;
        isEntry?: boolean | undefined;
        skipSelf?: boolean | undefined;
      }
    ) {
      const resolved = await wrappedContext.resolve(
        importer === undefined ? toModuleId(source, env) : source,
        importer === undefined ? undefined : toModuleId(importer, env),
        options
      );
      if (resolved === null) return null;
      const parsed = parseModuleId(resolved.id);
      if (parsed.kind !== env) {
        throw new Error(
          `Resolved module ${resolved.id} is not in the ${env} environment.`
        );
      }
      return { ...resolved, id: parsed.inner };
    },
    setAssetSource() {
      throw new Error("unimplemented");
    },
    get moduleIds(): never {
      throw new Error("unimplemented");
    },
  };
}

function assign<A extends {}, B extends {}>(a: A, b: B): A & B {
  return Object.assign(a, b);
}

export function wrapTransformPluginContext(
  wrappedContext: TransformPluginContext,
  env: "client" | "server"
): TransformPluginContext {
  return assign(wrapPluginContext(wrappedContext, env), {
    getCombinedSourcemap() {
      return wrappedContext.getCombinedSourcemap();
    },
  });
}

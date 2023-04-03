import { ModuleInfo, Plugin, TransformPluginContext } from "rollup";
import { parseModuleId, toModuleId } from "./module-id";
import { getModuleDirectives } from "./directives";
import MagicString from "magic-string";
import { assert } from "emery";
import path from "path";
import fs from "fs";

const clientRefHelperId = "\0client-ref-helper";
export const clientRefHelperIdFromServer = toModuleId(
  clientRefHelperId,
  "server"
);
const clientRefHelper = fs.readFileSync(
  path.join(__dirname, "client-ref-helper.js"),
  "utf-8"
);

export function plugin(): Plugin {
  return {
    name: "server-components",
    resolveFileUrl(options) {
      const parsedModuleId = parseModuleId(options.moduleId);
      if (parsedModuleId.kind === "server" && options.referenceId !== null) {
        const moduleInfo = this.getModuleInfo(options.moduleId);
        assert(moduleInfo !== null);
        if (
          moduleInfo.importedIds.length === 1 &&
          moduleInfo.importedIds[0] === clientRefHelperIdFromServer
        ) {
          return `'${options.fileName}'`;
        }
      }
    },
    resolveId: {
      order: "pre",
      async handler(source, importer, opts) {
        if (opts.custom?.serverComponentsFromExternalPlugin) {
          return null;
        }
        if (importer === undefined) {
          // TODO: make relative entries work
          parseModuleId(source);
          return source;
        }
        let importerParsedId;
        try {
          importerParsedId = parseModuleId(importer);
        } catch (cause) {
          this.error(
            `importers must always start with \\0server: or \\0client: but ${JSON.stringify(
              importer
            )} doesn't (attempting to resolve ${JSON.stringify(source)})`
          );
        }

        if (source === clientRefHelperId) {
          return toModuleId(clientRefHelperId, importerParsedId.kind);
        }
        const resolved = await this.resolve(source, importer, {
          ...opts,
          skipSelf: true,
        });

        if (resolved === null) {
          this.error({
            code: "UNRESOLVED_IMPORT",
            exporter: source,
            id: importer,
            message: `Could not resolve ${JSON.stringify(
              source
            )} from ${JSON.stringify(importer)}`,
          });
        }
        try {
          parseModuleId(resolved.id);
        } catch {
          this.error(
            `Bad resolved import ${resolved.id} ${JSON.stringify(
              source
            )} from ${JSON.stringify(importer)} (resolved by ${
              resolved.resolvedBy
            }})`
          );
        }
        return {
          ...resolved,
          meta: { ...resolved.meta, source },
        };
      },
    },
    load(id) {
      if (id === clientRefHelperIdFromServer) {
        return clientRefHelper;
      }
    },
    async transform(code, id) {
      const parsedId = parseModuleId(id);
      const directives = getModuleDirectives(code);
      const useClientDirective = directives.find(
        (directive) => directive.value === "use client"
      );
      if (useClientDirective !== undefined) {
        if (parsedId.kind === "server") {
          const clientId = toModuleId(parsedId.inner, "client");
          const loaded = await this.load({
            id: clientId,
            resolveDependencies: true,
          });
          const referenceId = this.emitFile({
            type: "chunk",
            id: clientId,
            implicitlyLoadedAfterOneOf: [id],
          });
          const exports = await getExportsOfModule(this, loaded);
          return generateClientRefModule(referenceId, exports);
        }
        const magicString = new MagicString(code);
        magicString.remove(useClientDirective.start, useClientDirective.end);
        return {
          code: magicString.toString(),
          map: magicString.generateMap(),
        };
      }
      return null;
    },
  };
}

function generateClientRefModule(referenceId: string, exports: string[]) {
  return `import { createProxy } from ${JSON.stringify(clientRefHelperId)};
var proxy = createProxy(import.meta.ROLLUP_FILE_URL_${referenceId});
${exports
  .map(
    (exportName, i) =>
      `export var e${i} = proxy[${JSON.stringify(exportName)}];`
  )
  .join("\n")}
export { ${exports
    .map((exportName, i) => `e${i} as ${exportName}`)
    .join(", ")} };
`;
}

async function getExportsOfModule(
  context: TransformPluginContext,
  loaded: ModuleInfo
) {
  assert(loaded.exportedBindings !== null);
  assert(loaded.importedIdResolutions !== null);

  const names: string[] = [];
  const starReexportSources: string[] = [];
  for (const [source, exports] of Object.entries(loaded.exportedBindings)) {
    for (const exportName of exports) {
      if (exportName === "*") {
        starReexportSources.push(source);
        continue;
      }
      names.push(exportName);
    }
  }
  if (starReexportSources.length) {
    const sourceToId = new Map<string, string>();
    for (const resolved of loaded.importedIdResolutions) {
      assert(
        typeof resolved.meta.source === "string",
        `missing source in resolution for ${resolved.id}`
      );
      sourceToId.set(resolved.meta.source, resolved.id);
    }
    await Promise.all(
      starReexportSources.map(async (source) => {
        const id = sourceToId.get(source);
        assert(id !== undefined, `missing id for ${source}`);
        const moduleInfo = await context.load({ id });
        const innerNames = await getExportsOfModule(context, moduleInfo);
        names.push(...innerNames);
      })
    );
  }
  return names;
}

import { InputPluginOption, Plugin } from "rollup";
import { wrapPlugin } from "./wrap-plugin";

type PluginType = "server" | "client" | "common" | "unwrapped";

function mapPlugins(
  plugins: InputPluginOption,
  fn: (plugin: Plugin) => Plugin
): InputPluginOption {
  if (plugins == null || typeof plugins === "boolean") return plugins;
  if (Array.isArray(plugins)) {
    return plugins.map((plugin) => mapPlugins(plugin, fn));
  }
  if ("then" in plugins) {
    return plugins.then((plugin) => mapPlugins(plugin, fn));
  }
  return fn(plugins);
}

export type PluginForWrapping =
  | InputPluginOption
  | { kind: PluginType; plugins: InputPluginOption };

export function rawWrapPlugins(
  ...plugins: PluginForWrapping[]
): InputPluginOption {
  return [
    plugins.map((_plugin): InputPluginOption => {
      if (_plugin == null || typeof _plugin === "boolean") return _plugin;
      const plugin =
        "kind" in _plugin ? _plugin : { kind: "common", plugins: _plugin };
      if (plugin.kind === "unwrapped") {
        return plugin.plugins;
      }

      if (plugin.kind === "common") {
        return [
          mapPlugins(plugin.plugins, (plugin) => wrapPlugin(plugin, "server")),
          mapPlugins(plugin.plugins, (plugin) => wrapPlugin(plugin, "client")),
        ];
      }
      if (plugin.kind === "server") {
        return mapPlugins(plugin.plugins, (plugin) =>
          wrapPlugin(plugin, "server")
        );
      }
      if (plugin.kind === "client") {
        return mapPlugins(plugin.plugins, (plugin) =>
          wrapPlugin(plugin, "client")
        );
      }
    }),
  ];
}

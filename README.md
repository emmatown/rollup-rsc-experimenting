# rollup-rsc-experimenting

This is just some experimenting of a Rollup implementation of the bundler integration needed for server components.

- The bundler integration stuff is in `packages/core`. The short version of how it works is there are essentially two different module graphs for the client and server but they're in the same module graph from Rollup's perspective so it's easy to emit a reference to a client module from a server module (note each physical module on disk could exist in both the client and server modules, internally, each module id denotes whether it's in the server vs client graph). The main bit that makes it work is in [packages/core/src/plugin.ts](packages/core/src/plugin.ts) and then there's a bunch of code to wrap other plugins so they see each server and client module graph independently.
- There's an app using the plugin in `app`. It renders the server components on the server, does SSR of the client components, inlines the initial server component payload and once loaded lets you refresh the server components and go to a different path with potentially different client components.

To run it:

```
pnpm install && pnpm dev
```

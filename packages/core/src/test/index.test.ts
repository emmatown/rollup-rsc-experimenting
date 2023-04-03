import { expect, test } from "@jest/globals";
import { Plugin, rollup } from "rollup";
import { js, rollupOutputToFiles, testdir } from "./test-utils";
import { toModuleId, wrapPlugins } from "..";
import { createRequire } from "module";
import commonJs from "@rollup/plugin-commonjs";
import { clientRefHelperIdFromServer } from "../plugin";

const basicResolvePlugin: Plugin = {
  name: "basic resolve",
  resolveId(source, importer) {
    if (!importer) return null;
    const resolvedPath = createRequire(importer).resolve(source);
    return resolvedPath;
  },
};

const replaceClientRefCreatorPlugin: Plugin = {
  name: "simple client ref creator",
  load(id) {
    if (id === clientRefHelperIdFromServer) {
      return js`
        export function createProxy(a) {
          return a;
        }
      `;
    }
  },
};

test("nothing happening", async () => {
  const dir = await testdir({
    "index.js": js`
      console.log(A);
    `,
  });
  const build = await rollup({
    input: toModuleId(`${dir}/index.js`, "server"),
    plugins: wrapPlugins([]),
  });
  const generated = await build.generate({});
  expect(rollupOutputToFiles(generated)).toMatchInlineSnapshot(`
    ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ index.js ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
    console.log(A);

  `);
});

test("importing a module without use client", async () => {
  const dir = await testdir({
    "index.js": js`
      import { A } from "./other.js";
      console.log(A);
    `,
    "other.js": js`
      export const A = 1;
    `,
  });
  const build = await rollup({
    input: toModuleId(`${dir}/index.js`, "server"),
    plugins: wrapPlugins([basicResolvePlugin]),
  });
  const generated = await build.generate({});
  expect(rollupOutputToFiles(generated)).toMatchInlineSnapshot(`
    ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ index.js ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
    const A = 1;

    console.log(A);

  `);
});

test("importing a module without use client with commonjs", async () => {
  const dir = await testdir({
    "index.js": js`
      import { A } from "./other.cjs";
      console.log(A);
    `,
    "other.cjs": js`
      exports.A = 1;
    `,
  });
  const build = await rollup({
    input: toModuleId(`${dir}/index.js`, "server"),
    plugins: wrapPlugins([basicResolvePlugin, commonJs()]),
  });
  const generated = await build.generate({});
  expect(rollupOutputToFiles(generated)).toMatchInlineSnapshot(`
    ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ index.js ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
    var A = 1;

    console.log(A);

  `);
});

test("basic use client", async () => {
  const dir = await testdir({
    "index.js": js`
      import { A } from "./a";
      console.log(A);
    `,
    "a.js": js`
      "use client";
      export const A = 1;
    `,
  });
  const build = await rollup({
    input: toModuleId(`${dir}/index.js`, "server"),
    plugins: [replaceClientRefCreatorPlugin, wrapPlugins([basicResolvePlugin])],
  });
  const generated = await build.generate({});
  expect(rollupOutputToFiles(generated)).toMatchInlineSnapshot(`
    ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ index.js ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
    function createProxy(a) {
      return a;
    }

    var proxy = createProxy('a-638f64e1.js');
    var e0 = proxy["A"];

    console.log(e0);

    ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ a-638f64e1.js ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
    const A = 1;

    export { A };

  `);
});

test("a bunch of use clients", async () => {
  const dir = await testdir({
    "index.js": js`
      import { A } from "./a";
      import Something from "./another";
      import "./common";
      console.log(A, Something);
    `,
    "a.js": js`
      "use client";
      import "./common";
      export const A = 1;
    `,
    "common.js": js`
      console.log("common");
    `,
    "another.js": js`
      "use client";
      export default function Something() {}
    `,
  });
  const build = await rollup({
    input: toModuleId(`${dir}/index.js`, "server"),
    plugins: [replaceClientRefCreatorPlugin, wrapPlugins([basicResolvePlugin])],
  });
  const generated = await build.generate({});
  expect(rollupOutputToFiles(generated)).toMatchInlineSnapshot(`
    ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ index.js ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
    function createProxy(a) {
      return a;
    }

    var proxy$1 = createProxy('a-13fec2d4.js');
    var e0$1 = proxy$1["A"];

    var proxy = createProxy('another-90af4539.js');
    var e0 = proxy["default"];

    console.log("common");

    console.log(e0$1, e0);

    ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ a-13fec2d4.js ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
    console.log("common");

    const A = 1;

    export { A };

    ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ another-90af4539.js ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
    function Something() {}

    export { Something as default };

  `);
});

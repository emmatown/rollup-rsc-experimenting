import path from "path";
import fs from "fs/promises";
import nonPromiseFs from "fs";
import outdent from "outdent";
import fastGlob from "fast-glob";
import { expect } from "@jest/globals";
import onExit from "signal-exit";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { RollupOutput } from "rollup";

export const js = outdent;
export const ts = outdent;
export const tsx = outdent;

type Fixture = {
  [key: string]: string | { kind: "symlink"; path: string };
};

// basically replicating https://github.com/nodejs/node/blob/72f9c53c0f5cc03000f9a4eb1cf31f43e1d30b89/lib/fs.js#L1163-L1174
// for some reason the builtin auto-detection doesn't work, the code probably doesn't go into that logic or something
async function getSymlinkType(targetPath: string): Promise<"dir" | "file"> {
  const stat = await fs.stat(targetPath);
  return stat.isDirectory() ? "dir" : "file";
}

const tempDir = nonPromiseFs.realpathSync(tmpdir());

export async function testdir(dir: Fixture) {
  const temp = path.join(tempDir, randomUUID());
  onExit(() => {
    nonPromiseFs.rmSync(temp, { recursive: true, force: true });
  });
  await Promise.all(
    Object.keys(dir).map(async (filename) => {
      const output = dir[filename];
      const fullPath = path.join(temp, filename);
      const dirname = path.dirname(fullPath);
      await fs.mkdir(dirname, { recursive: true });
      if (typeof output === "string") {
        await fs.writeFile(fullPath, output);
      } else {
        const targetPath = path.resolve(temp, output.path);
        const symlinkType = await getSymlinkType(targetPath);
        await fs.symlink(targetPath, fullPath, symlinkType);
      }
    })
  );
  return temp;
}

expect.addSnapshotSerializer({
  print(_val) {
    const val = _val as Record<string, string>;
    const contentsByFilename: Record<string, string[]> = {};
    Object.entries(val).forEach(([filename, contents]) => {
      if (contentsByFilename[contents] === undefined) {
        contentsByFilename[contents] = [];
      }
      contentsByFilename[contents].push(filename);
    });
    return Object.entries(contentsByFilename)
      .map(([contents, filenames]) => {
        return `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ ${filenames.join(
          ", "
        )} ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n${contents}`;
      })
      .join("\n");
  },
  test(val) {
    return val && val[dirPrintingSymbol];
  },
});

const dirPrintingSymbol = Symbol("dir printing symbol");

export async function getFiles(dir: string, glob: string[] = ["**"]) {
  const files = await fastGlob(glob, { cwd: dir });
  const filesObj: Record<string, string> = {
    [dirPrintingSymbol]: true,
  };
  await Promise.all(
    files.map(async (filename) => {
      filesObj[filename] = await fs.readFile(path.join(dir, filename), "utf-8");
    })
  );
  let newObj: Record<string, string> = { [dirPrintingSymbol]: true };
  files.sort().forEach((filename) => {
    newObj[filename] = filesObj[filename];
  });
  return newObj;
}

export function rollupOutputToFiles(output: RollupOutput) {
  const files: Record<string, string> = {
    [dirPrintingSymbol]: true,
  };
  for (const chunk of output.output) {
    if (chunk.type !== "chunk") {
      continue;
    }
    files[chunk.fileName] = chunk.code;
    if (chunk.map) {
      files[`${chunk.fileName}.map`] = chunk.map.toString();
    }
  }
  return files;
}

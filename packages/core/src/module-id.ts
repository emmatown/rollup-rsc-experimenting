import { assert } from "emery";

const idPattern = /\0(server|client):(.+)/;

type ModuleKind = "server" | "client";

export function parseModuleId(id: string): {
  inner: string;
  kind: ModuleKind;
  isEntry: boolean;
} {
  const match = idPattern.exec(id);
  assert(match !== null, `bad id: ${id}`);
  const kind = match[1] as ModuleKind;
  const inner = match[2];
  return { inner, kind, isEntry: false };
}

export function toModuleId(inner: string, kind: ModuleKind): string {
  if (inner.startsWith("\0server:") || inner.startsWith("\0client:")) {
    throw new Error(`unexpected already wrapped id: ${inner}`);
  }
  return `\0${kind}:${inner}`;
}

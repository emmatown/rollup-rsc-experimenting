import { Plugin } from "rollup";

type Hook<Fn> = Fn | { handler: Fn; order?: "pre" | "post" | null } | undefined;

export function wrapHook<
  Key extends keyof Plugin,
  This,
  Params extends any[],
  Return
>(
  key: Key,
  hook: Hook<(this: This, ...args: Params) => Return>,
  wrap: (
    fn: (context: This, ...args: Params) => Return,
    context: This,
    ...args: Params
  ) => Return
): {
  [_ in Key]?: {
    handler: (this: This, ...args: Params) => Return;
    order?: "pre" | "post" | null;
  };
} {
  if (hook === undefined) return {};
  const hookObj = typeof hook === "function" ? { handler: hook } : hook;
  const handler: {
    handler: (this: This, ...args: Params) => Return;
    order?: "pre" | "post" | null;
  } = {
    handler(...args: Params) {
      return wrap(
        (context, ...args) => hookObj.handler.apply(context, args),
        this,
        ...args
      );
    },
    order: hookObj.order,
  };
  return {
    [key]: handler,
  } as { [_ in typeof key]: typeof handler };
}

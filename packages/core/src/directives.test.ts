import { test, expect } from "@jest/globals";
import { Directive, getModuleDirectives } from "./directives";

function remove(str: string, directive: Directive) {
  return str.slice(0, directive.start) + str.slice(directive.end);
}

test("basic", () => {
  const input = `"use strict";blah`;
  const result = getModuleDirectives(input);
  expect(result).toEqual([{ value: "use strict", start: 0, end: 13 }]);
  expect(remove(input, result[0]).toString()).toEqual("blah");
});

test("without semi", () => {
  const input = `"use strict"\nblah`;
  const result = getModuleDirectives(input);
  expect(result).toEqual([{ value: "use strict", start: 0, end: 12 }]);
  expect(remove(input, result[0]).toString()).toEqual("\nblah");
});

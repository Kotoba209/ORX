import assert from "node:assert/strict";
import test from "node:test";
import { buildFileTree } from "./projectTree.ts";

test("buildFileTree groups project files into sorted directories", () => {
  const tree = buildFileTree([
    { path: "apps/api/src/index.ts", kind: "source", bytes: 100 },
    { path: "README.md", kind: "document", bytes: 20 },
    { path: "apps/web/package.json", kind: "config", bytes: 30 },
  ]);

  assert.deepEqual(tree.map((node) => node.name), ["apps", "README.md"]);
  assert.equal(tree[0].kind, "directory");
  assert.deepEqual(tree[0].children.map((node) => node.name), ["api", "web"]);
  assert.equal(tree[0].children[0].children[0].children[0].path, "apps/api/src/index.ts");
});

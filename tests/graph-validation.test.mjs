import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { EXPECTED_GRAPH_SHA256, validateGraph } from "../scripts/validate-graph.mjs";

const rawGraph = await readFile(new URL("../data/knowledge-graph.json", import.meta.url));
const graph = JSON.parse(rawGraph.toString("utf8"));

test("committed graph passes schema, integrity, scope, and privacy gates", () => {
  assert.deepEqual(validateGraph(graph), []);
  assert.equal(createHash("sha256").update(rawGraph).digest("hex"), EXPECTED_GRAPH_SHA256);
});

test("privacy gate rejects every prohibited public payload class", () => {
  const cases = [
    ["source body", (copy) => { copy.nodes[0].sourceCode = "print('private')"; }],
    ["knowledgeMeta content", (copy) => { copy.nodes[0].knowledgeMeta = { content: "private" }; }],
    ["Figma thumbnail", (copy) => { copy.nodes[0].summary = "https://figma.com/thumbnail/x"; }],
    ["absolute path", (copy) => { copy.nodes[0].filePath = "/srv/findesk/main.py"; }],
    ["embedded absolute path", (copy) => { copy.nodes[0].summary = "Generated from /srv/Findesk-prod/auth/main.py"; }],
    ["etc absolute path", (copy) => { copy.nodes[0].summary = "Generated from /etc/findesk/secrets.yaml"; }],
    ["mount absolute path", (copy) => { copy.nodes[0].summary = "Generated from /mnt/private/Findesk/auth/main.py"; }],
    ["app absolute path", (copy) => { copy.nodes[0].summary = "Generated from /app/Findesk/auth/main.py"; }],
    ["out-of-scope path", (copy) => { copy.nodes[0].filePath = "payments/private.py"; }],
    ["private URL", (copy) => { copy.nodes[0].summary = "http://10.0.0.4/admin"; }],
    ["credential", (copy) => { copy.nodes[0].summary = "api_key=super-secret-value"; }],
    ["excluded fixture", (copy) => { copy.nodes[0].filePath = "auth/fixtures/users.json"; }],
  ];
  for (const [name, mutate] of cases) {
    const copy = structuredClone(graph);
    mutate(copy);
    assert.ok(validateGraph(copy).length > 0, `${name} should be rejected`);
  }
});

test("integrity gate rejects wrong provenance and dangling references", () => {
  const copy = structuredClone(graph);
  copy.project.gitCommitHash = "0".repeat(40);
  copy.edges[0].target = "missing:node";
  const errors = validateGraph(copy);
  assert.ok(errors.some((error) => error.includes("gitCommitHash")));
  assert.ok(errors.some((error) => error.includes("dangling")));
});

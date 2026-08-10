import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export const EXPECTED_PROJECT_SHA = "e1390364ef861739de12ea9de30eb116ed95536e";
export const EXPECTED_GRAPH_SHA256 = "38ecb74fa29430028109042bb94140f01434aa05e4a3277f184a5076213eaa6e";

const forbiddenPath = /(^|\/)(tests?|fixtures?|\.env(?:\.[^/]*)?|uploads?|dumps?|dist|build|vendor|node_modules|\.venv|venv)(\/|$)/i;
const absolutePath = /^(?:\/[\w.-]|[A-Za-z]:[\\/]|\\\\)/;
const embeddedAbsolutePath = /(?:^|[\s"'(])(?:\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*|[A-Za-z]:[\\/]|\\\\)/;
const privateUrl = /https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|[^\s/]*(?:\.internal|\.local))(?:[/:]|$)/i;
const credentialValue = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[opsu]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b|(?:password|passwd|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["']?[^\s"']{8,})/i;
const sourceBodyKeys = new Set(["sourceCode", "body", "code", "rawContent"]);

function fail(errors, message) {
  errors.push(message);
}

export function validateGraph(graph) {
  const errors = [];
  if (!graph || typeof graph !== "object") return ["graph must be an object"];
  if (graph.version !== "1.0.0" || graph.kind !== "codebase") fail(errors, "unexpected upstream graph schema/version");
  if (graph.project?.gitCommitHash !== EXPECTED_PROJECT_SHA) fail(errors, `project.gitCommitHash must equal ${EXPECTED_PROJECT_SHA}`);
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.layers) || !Array.isArray(graph.tour)) {
    fail(errors, "nodes, edges, layers, and tour must be arrays");
    return errors;
  }

  const ids = new Set();
  let auth = 0;
  let officeUser = 0;
  for (const node of graph.nodes) {
    if (!node?.id || ids.has(node.id)) fail(errors, `missing or duplicate node id: ${node?.id}`);
    ids.add(node?.id);
    const path = node?.filePath;
    if (typeof path === "string") {
      if (absolutePath.test(path)) fail(errors, `absolute path: ${path}`);
      if (forbiddenPath.test(path)) fail(errors, `excluded path: ${path}`);
      if (!path.startsWith("auth/") && !path.startsWith("office-user/")) fail(errors, `out-of-scope path: ${path}`);
      if (path.startsWith("auth/")) auth += 1;
      if (path.startsWith("office-user/")) officeUser += 1;
    }
  }
  if (!auth || !officeUser) fail(errors, "graph must cover both auth/ and office-user/");

  graph.edges.forEach((edge, index) => {
    if (!ids.has(edge?.source) || !ids.has(edge?.target)) fail(errors, `edge ${index} has a dangling reference`);
  });
  graph.layers.forEach((layer, index) => {
    if (!layer?.id || !Array.isArray(layer.nodeIds)) fail(errors, `layer ${index} is malformed`);
    else layer.nodeIds.forEach((id) => { if (!ids.has(id)) fail(errors, `layer ${layer.id} references missing node ${id}`); });
  });
  if (graph.tour.length !== 12) fail(errors, "tour must contain exactly 12 steps");
  graph.tour.forEach((step, index) => {
    if (step?.order !== index + 1 || typeof step?.title !== "string" || typeof step?.description !== "string" || step.description.length < 120 || !Array.isArray(step?.nodeIds) || step.nodeIds.length < 2) {
      fail(errors, `tour step ${index + 1} is not rich or correctly ordered`);
      return;
    }
    step.nodeIds.forEach((id) => { if (!ids.has(id)) fail(errors, `tour step ${step.order} references missing node ${id}`); });
  });

  const visit = (value, path = []) => {
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, [...path, String(index)]));
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        const next = [...path, key];
        const edgeEndpoint = key === "source" && path[0] === "edges";
        if (sourceBodyKeys.has(key) || (key === "source" && !edgeEndpoint) || (key === "content" && path.at(-1) === "knowledgeMeta")) fail(errors, `forbidden source/content field: ${next.join(".")}`);
        visit(child, next);
      }
      return;
    }
    if (typeof value !== "string") return;
    if (embeddedAbsolutePath.test(value)) fail(errors, `absolute private path at ${path.join(".")}`);
    if (/figma/i.test(value) && /https?:\/\//i.test(value)) fail(errors, `Figma URL at ${path.join(".")}`);
    if (privateUrl.test(value)) fail(errors, `private URL/IP at ${path.join(".")}`);
    if (credentialValue.test(value)) fail(errors, `credential-like value at ${path.join(".")}`);
  };
  visit(graph);
  return errors;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const file = process.argv[2];
  if (!file) throw new Error("usage: validate-graph.mjs <knowledge-graph.json>");
  const rawGraph = await readFile(file);
  const digest = createHash("sha256").update(rawGraph).digest("hex");
  const graph = JSON.parse(rawGraph.toString("utf8"));
  const errors = validateGraph(graph);
  if (digest !== EXPECTED_GRAPH_SHA256) errors.push(`graph SHA-256 must equal ${EXPECTED_GRAPH_SHA256}`);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`validated ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.layers.length} layers, ${graph.tour.length} tour steps`);
  }
}

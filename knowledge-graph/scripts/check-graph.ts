/**
 * check-graph.ts — headless verifier for data/graph.json (NO network needed).
 *
 * Asserts the deterministic guarantees the diagnosis engine will rely on:
 * schema, unique ids, edge integrity, grade direction, acyclicity, the demo
 * descent chain L7 -> L6 -> L5 -> L4, coverage counts per MVP, coordinates.
 *
 * Run: npx --yes tsx scripts/check-graph.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { KnowledgeGraphSchema, type KnowledgeNode } from "../lib/schemas";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const file = path.resolve(process.cwd(), "data", "graph.json");
if (!fs.existsSync(file)) {
  console.error("FAIL  data/graph.json not found — run: npx tsx scripts/build-graph.ts");
  process.exitCode = 1;
} else {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const parsed = KnowledgeGraphSchema.safeParse(raw);
  check("schema: graph.json parses with KnowledgeGraphSchema", parsed.success, parsed.success ? "" : String(parsed.error));

  if (parsed.success) {
    const nodes: KnowledgeNode[] = parsed.data.nodes;
    const byId = new Map(nodes.map((n) => [n.id, n]));

    check("ids: unique", new Set(nodes.map((n) => n.id)).size === nodes.length);

    const grade7NumberAlgebraIds = [
      "l7-so-huu-ti-khai-niem",
      "l7-phep-tinh-so-huu-ti",
      "l7-can-bac-hai",
      "l7-so-thuc",
      "l7-ti-le-thuc",
      "l7-dai-luong-ti-le",
      "l7-bieu-thuc-dai-so",
      "l7-da-thuc-mot-bien",
    ];
    const grade7NumberAlgebra = nodes.filter(
      (node) => node.lop === 7 && node.mach === "Số và Đại số",
    );
    check(
      "grade 7: complete Number and Algebra target set",
      grade7NumberAlgebraIds.every((id) => byId.has(id)) &&
        grade7NumberAlgebra.length === grade7NumberAlgebraIds.length,
      grade7NumberAlgebra.map((node) => node.id).join(", "),
    );
    const proportional = byId.get("l7-dai-luong-ti-le");
    check(
      "grade 7: proportional quantities has approved prerequisites",
      proportional?.tienQuyet.includes("l7-ti-le-thuc") === true &&
        proportional?.tienQuyet.includes("l7-phep-tinh-so-huu-ti") === true,
    );

    const real = nodes.filter((n) => !n.mo);
    // Bounds widened 17/7 (P1 expansion + final strand audit) — see SPEC "MVP chốt".
    check(`size: 24–45 nodes total (got ${nodes.length})`, nodes.length >= 24 && nodes.length <= 45);
    check(`size: 15–28 real nodes (got ${real.length})`, real.length >= 15 && real.length <= 28);

    const badRef = nodes.flatMap((n) => n.tienQuyet.filter((p) => !byId.has(p)).map((p) => `${n.id}->${p}`));
    check("edges: every tienQuyet id exists", badRef.length === 0, badRef.join(", "));

    const badDir = nodes.flatMap((n) =>
      n.tienQuyet.filter((p) => byId.has(p) && byId.get(p)!.lop > n.lop).map((p) => `${p}(L${byId.get(p)!.lop})->${n.id}(L${n.lop})`)
    );
    check("edges: prerequisite grade <= node grade", badDir.length === 0, badDir.join(", "));

    // Acyclicity (Kahn)
    const indeg = new Map(nodes.map((n) => [n.id, n.tienQuyet.length]));
    const out = new Map<string, string[]>();
    for (const n of nodes) for (const p of n.tienQuyet) out.set(p, [...(out.get(p) ?? []), n.id]);
    const queue = nodes.filter((n) => n.tienQuyet.length === 0).map((n) => n.id);
    let seen = 0;
    while (queue.length) {
      const id = queue.shift()!;
      seen++;
      for (const nx of out.get(id) ?? []) {
        indeg.set(nx, indeg.get(nx)! - 1);
        if (indeg.get(nx) === 0) queue.push(nx);
      }
    }
    check("graph: acyclic (DAG)", seen === nodes.length);

    // Demo descent chain: ancestors of the L7 target must include L6 -> L5 -> L4 chain nodes.
    const ancestors = (id: string): Set<string> => {
      const acc = new Set<string>();
      const stack = [...(byId.get(id)?.tienQuyet ?? [])];
      while (stack.length) {
        const cur = stack.pop()!;
        if (acc.has(cur)) continue;
        acc.add(cur);
        stack.push(...(byId.get(cur)?.tienQuyet ?? []));
      }
      return acc;
    };
    const anc = ancestors("l7-phep-tinh-so-huu-ti");
    for (const must of ["l6-phep-tinh-phan-so", "l5-quy-dong-phan-so", "l4-tinh-chat-phan-so", "l4-khai-niem-phan-so"]) {
      check(`demo chain: ${must} is an ancestor of l7-phep-tinh-so-huu-ti`, anc.has(must));
    }

    // Forward warning (chiều xuôi): the L5 root cause must have dim descendants in L8–10.
    const descendants = (id: string): Set<string> => {
      const acc = new Set<string>();
      const stack = [...(out.get(id) ?? [])];
      while (stack.length) {
        const cur = stack.pop()!;
        if (acc.has(cur)) continue;
        acc.add(cur);
        stack.push(...(out.get(cur) ?? []));
      }
      return acc;
    };
    const desc = descendants("l5-quy-dong-phan-so");
    const dimDesc = [...desc].filter((d) => byId.get(d)?.mo);
    check(`forward warning: l5-quy-dong-phan-so has dim descendants in L8–10 (got ${dimDesc.length})`, dimDesc.length >= 2);

    const orphan = real.filter((n) => n.lop >= 5 && n.tienQuyet.length === 0);
    check("diagnosis: every real node from L5 up has >=1 prerequisite (no orphans)", orphan.length === 0, orphan.map((n) => n.id).join(", "));

    const thinYccd = real.filter((n) => n.yccd.length < 2);
    check("content: every real node has >=2 verbatim YCCĐ bullets", thinYccd.length === 0, thinYccd.map((n) => `${n.id}(${n.yccd.length})`).join(", "));

    const noisyYccd = nodes.filter((n) => n.yccd.some((y) => y.includes("\\") || y.includes("![") || y.includes("*")));
    check("content: YCCĐ text is clean (no escapes / image refs / markdown)", noisyYccd.length === 0, noisyYccd.map((n) => n.id).join(", "));

    const coords = new Set(nodes.map((n) => `${n.x},${n.y}`));
    check("layout: all (x,y) present and distinct", coords.size === nodes.length);

    const caps = new Set(nodes.map((n) => n.cap));
    check("story: all 3 school levels present (TH, THCS, THPT)", caps.has("TH") && caps.has("THCS") && caps.has("THPT"));
  }
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exitCode = 1;

export interface MasteredChain {
  id: string;
  memberIds: string[];
  parentId: string | null;
  childIds: string[];
  avgAccuracy: number | null;
}

interface ChainNode {
  id: string;
  isRoot: boolean;
}

interface ChainEdge {
  sourceId: string;
  targetId: string;
}

/**
 * Detects maximal linear runs of consecutive mastered nodes (single parent,
 * single child within the run) so they can be collapsed into one summary
 * node. Branch points, the root, and the frontier (first non-mastered node)
 * are never absorbed into a chain.
 */
export function computeMasteredChains(
  nodes: ChainNode[],
  edges: ChainEdge[],
  statusOf: (id: string) => string,
  accuracyOf?: (id: string) => number | null,
): MasteredChain[] {
  const outMap = new Map<string, string[]>();
  const inMap = new Map<string, string[]>();
  for (const e of edges) {
    outMap.set(e.sourceId, [...(outMap.get(e.sourceId) || []), e.targetId]);
    inMap.set(e.targetId, [...(inMap.get(e.targetId) || []), e.sourceId]);
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const isCandidate = (id: string): boolean => {
    const node = nodeById.get(id);
    if (!node || node.isRoot) return false;
    if (statusOf(id) !== "mastered") return false;
    const outCount = (outMap.get(id) || []).length;
    const inCount = (inMap.get(id) || []).length;
    return outCount <= 1 && inCount <= 1;
  };

  const isContinuationOfParent = (id: string): boolean => {
    const parents = inMap.get(id) || [];
    if (parents.length !== 1) return false;
    const parent = parents[0];
    if (!isCandidate(parent)) return false;
    const parentOut = outMap.get(parent) || [];
    return parentOut.length === 1 && parentOut[0] === id;
  };

  const chains: MasteredChain[] = [];
  const consumed = new Set<string>();

  for (const n of nodes) {
    const id = n.id;
    if (consumed.has(id)) continue;
    if (!isCandidate(id)) continue;
    if (isContinuationOfParent(id)) continue; // will be swept up from its chain head

    const members = [id];
    consumed.add(id);
    let cur = id;
    while (true) {
      const outs = outMap.get(cur) || [];
      if (outs.length !== 1) break;
      const next = outs[0];
      if (consumed.has(next) || !isCandidate(next)) break;
      members.push(next);
      consumed.add(next);
      cur = next;
    }

    if (members.length < 2) {
      consumed.delete(id);
      continue;
    }

    const parents = inMap.get(members[0]) || [];
    const parentId = parents.length === 1 ? parents[0] : null;
    const lastId = members[members.length - 1];
    const childIds = outMap.get(lastId) || [];

    let avgAccuracy: number | null = null;
    if (accuracyOf) {
      const values = members.map(accuracyOf).filter((v): v is number => v !== null && v !== undefined);
      if (values.length > 0) {
        avgAccuracy = Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
      }
    }

    chains.push({ id: `chain:${members[0]}`, memberIds: members, parentId, childIds, avgAccuracy });
  }

  return chains;
}

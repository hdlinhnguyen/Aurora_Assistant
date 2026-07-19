/**
 * Truy vết gốc rễ: tìm đường đi ngược cây tiên quyết từ nút học sinh vừa sai
 * về nút gốc rễ được hệ thống chẩn đoán (adaptive downgrade / distractor mapping).
 * Thuần hàm như masteredChains.ts — không gọi API, chạy trên edges đã tải sẵn.
 */

export interface TraceEdgeLike {
  sourceId: string; // nút tiên quyết (cha)
  targetId: string; // nút phụ thuộc (con)
}

/**
 * BFS ngược chiều edges (con → cha) để tìm đường ngắn nhất từ failedNodeId
 * lên rootCauseId. Trả về mảng node id theo thứ tự [failedNode, ..., rootCause].
 * Nếu hai nút không nối nhau qua tiên quyết (dữ liệu thiếu edge), trả về đường
 * trực tiếp 2 phần tử để animation vẫn chạy được thay vì vỡ.
 */
export function computeTracePath(
  failedNodeId: string,
  rootCauseId: string,
  edges: TraceEdgeLike[],
): string[] {
  if (!failedNodeId || !rootCauseId) return [];
  if (failedNodeId === rootCauseId) return [failedNodeId];

  const parentsOf = new Map<string, string[]>();
  for (const e of edges) {
    const list = parentsOf.get(e.targetId);
    if (list) list.push(e.sourceId);
    else parentsOf.set(e.targetId, [e.sourceId]);
  }

  const prev = new Map<string, string>();
  const seen = new Set<string>([failedNodeId]);
  const queue: string[] = [failedNodeId];

  while (queue.length > 0) {
    const cur = queue.shift() as string;
    if (cur === rootCauseId) {
      const path: string[] = [cur];
      while (path[path.length - 1] !== failedNodeId) {
        const p = prev.get(path[path.length - 1]);
        if (!p) break;
        path.push(p);
      }
      return path.reverse();
    }
    for (const parent of parentsOf.get(cur) ?? []) {
      if (!seen.has(parent)) {
        seen.add(parent);
        prev.set(parent, cur);
        queue.push(parent);
      }
    }
  }

  return [failedNodeId, rootCauseId];
}

/** Cặp (cha, con) liên tiếp trên path — để tô màu edge tương ứng khi truy vết. */
export function tracePathEdgePairs(path: string[]): Array<{ parentId: string; childId: string }> {
  const pairs: Array<{ parentId: string; childId: string }> = [];
  for (let i = 0; i + 1 < path.length; i++) {
    pairs.push({ parentId: path[i + 1], childId: path[i] });
  }
  return pairs;
}

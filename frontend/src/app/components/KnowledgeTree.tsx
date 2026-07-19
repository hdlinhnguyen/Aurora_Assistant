"use client";

import { useState, useRef, useEffect, MouseEvent } from "react";
import { apiFetch } from "@/lib/api";
import { BKT_INITIAL_MASTERY, TopicMastery, masteryPercent as toMasteryPercent } from "@/lib/mastery";
import { computeMasteredChains, MasteredChain } from "@/lib/masteredChains";
import { toast } from "sonner";
import { Plus, Trash, Trash2, ZoomIn, ZoomOut, Move, Link2, Eye, Edit2, Folder, MinusCircle, PlusCircle, BookOpen, Undo, Redo, RefreshCw, Layers, LayoutGrid, CheckCircle2, AlertCircle, PlayCircle, Lock, Compass, X, Check, HelpCircle, AlertTriangle } from "lucide-react";


interface NodeItem {
  id: string;
  subject: string;
  name: string;
  theory: string;
  topicGroup?: string;
  posX: number;
  posY: number;
  isRoot: boolean;
}

export function selectDefaultFocusNode(
  nodes: NodeItem[],
  focusedNodeId?: string | null,
  currentNodeId?: string,
  initialNodeId?: string,
) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const preferredNodeId = [focusedNodeId, currentNodeId, initialNodeId].find(
    (nodeId): nodeId is string => Boolean(nodeId && nodeIds.has(nodeId)),
  );

  return preferredNodeId ?? nodes.find((node) => node.isRoot)?.id ?? nodes[0]?.id ?? null;
}

interface EdgeItem {
  id: string;
  subject: string;
  sourceId: string;
  targetId: string;
}

interface KnowledgeTreeProps {
  subject: string;
  nodes: NodeItem[];
  edges: EdgeItem[];
  mode: "teacher" | "student" | "view-only";
  studentNodeStatus?: Record<string, "mastered" | "struggle" | "learning" | "locked" | "initial">;
  nodeAccuracy?: Record<string, { correct: number; incorrect: number; total: number }>;
  masteryByTopic?: Record<string, TopicMastery>;
  initialNodeId?: string;
  currentNodeId?: string;
  onNodeClick?: (node: NodeItem) => void;
  onRefresh?: () => void;
  focusedNodeId?: string | null;
  onFocusedNodeChange?: (nodeId: string) => void;
  onClearFocus?: () => void;
  onShowContentClick?: (node: NodeItem) => void;
  /** Truy vết gốc rễ: path = [nút vừa sai, ..., nút gốc rễ]. Kích hoạt animation lan màu + camera pan. */
  traceHighlight?: { path: string[] } | null;
  /** CTA "Ôn lại nút này" trên banner khi truy vết chạy xong. */
  onTraceCta?: (rootId: string) => void;
}

export default function KnowledgeTree({
  subject,
  nodes,
  edges,
  mode,
  studentNodeStatus = {},
  nodeAccuracy = {},
  masteryByTopic = {},
  initialNodeId,
  currentNodeId,
  onNodeClick,
  onRefresh,
  focusedNodeId,
  onFocusedNodeChange,
  onClearFocus,
  onShowContentClick,
  traceHighlight,
  onTraceCta,
}: KnowledgeTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [linkingSource, setLinkingSource] = useState<string | null>(null);
  const [isLinkingMode, setIsLinkingMode] = useState(false);
  const [localNodes, setLocalNodes] = useState<NodeItem[]>(nodes);

  // Advanced features: Collapse state, Hover path tracing & Focused view
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const activeSelectedNodeId = selectedNodeId || focusedNodeId;
  const [isFocusedView, setIsFocusedView] = useState(false);
  const [showGroups, setShowGroups] = useState(false);

  // "Điểm cần chú ý" focus view (view-only mode): mastered-chain auto-collapse
  const viewOnlyMode = mode === "view-only";
  const [expandedChainIds, setExpandedChainIds] = useState<Set<string>>(new Set());

  // --- Truy vết gốc rễ: bước hiện tại trên path (-1 = không truy vết) ---
  const [traceStep, setTraceStep] = useState(-1);
  const tracePath = traceHighlight?.path ?? [];
  const traceActive = tracePath.length > 0;
  const traceDone = traceActive && traceStep >= tracePath.length - 1;
  const traceRootId = traceActive ? tracePath[tracePath.length - 1] : null;

  useEffect(() => {
    if (!traceActive) {
      setTraceStep(-1);
      return;
    }
    setTraceStep(0);
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      if (i >= tracePath.length) {
        clearInterval(iv);
        return;
      }
      setTraceStep(i);
    }, 900);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceHighlight]);

  // Camera đi theo nút đang "cháy" trên đường truy vết
  useEffect(() => {
    if (!traceActive || traceStep < 0) return;
    const container = containerRef.current;
    if (!container) return;
    const node = localNodes.find((n) => n.id === tracePath[traceStep]);
    if (!node) return;
    const cw = container.clientWidth || 800;
    const ch = container.clientHeight || 500;
    const s = 0.95;
    setScale(s);
    setPan({
      x: Math.round(cw / 2 - (node.posX + 115) * s),
      y: Math.round(ch / 2 - (node.posY + 42.5) * s),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceStep, traceActive]);
  
  // Custom modal dialog states (replaces prompt, confirm & alert)
  const [treeModalState, setTreeModalState] = useState<{
    open: boolean;
    mode: "add" | "add_child";
    parentNode?: NodeItem | null;
    inputValue: string;
  }>({ open: false, mode: "add", inputValue: "" });

  const [treeConfirmState, setTreeConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });
  
  // Track pan start coordinates
  const panStartRef = useRef({ x: 0, y: 0 });
  // Track drag offset
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setLocalNodes(nodes);
  }, [nodes]);

  // When parent changes focusedNodeId (e.g. roadmap click), clear internal selection so prop takes priority
  useEffect(() => {
    if (focusedNodeId) {
      setSelectedNodeId(null);
    }
  }, [focusedNodeId]);

  // Manage history stack internally for Undo/Redo (Ctrl+Z / Ctrl+Y)
  const [history, setHistory] = useState<{ nodes: NodeItem[]; edges: EdgeItem[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Initialize history when nodes are loaded
  useEffect(() => {
    if (history.length === 0 && nodes && nodes.length > 0) {
      setHistory([{ nodes, edges }]);
      setHistoryIndex(0);
    } else if (history.length > 0 && nodes) {
      const currentHistNodes = history[historyIndex]?.nodes || [];
      if (nodes.length !== currentHistNodes.length) {
        setHistory([{ nodes, edges }]);
        setHistoryIndex(0);
      }
    }
  }, [nodes, edges]);

  const handleUndo = async () => {
    if (historyIndex <= 0) return;
    const prevIndex = historyIndex - 1;
    const prevState = history[prevIndex];
    setHistoryIndex(prevIndex);
    
    // Update local UI
    setLocalNodes(prevState.nodes);
    
    // Sync position changes back to the server
    for (const prevNode of prevState.nodes) {
      const currentNode = localNodes.find(n => n.id === prevNode.id);
      if (currentNode && (currentNode.posX !== prevNode.posX || currentNode.posY !== prevNode.posY)) {
        try {
          await apiFetch(`/subjects/nodes/${prevNode.id}`, {
            method: "PUT",
            body: JSON.stringify({ posX: prevNode.posX, posY: prevNode.posY }),
          });
        } catch (e) {
          console.error("Failed to sync undo position:", e);
        }
      }
    }
    if (onRefresh) onRefresh();
  };

  const handleRedo = async () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    const nextState = history[nextIndex];
    setHistoryIndex(nextIndex);
    
    // Update local UI
    setLocalNodes(nextState.nodes);
    
    // Sync position changes back to the server
    for (const nextNode of nextState.nodes) {
      const currentNode = localNodes.find(n => n.id === nextNode.id);
      if (currentNode && (currentNode.posX !== nextNode.posX || currentNode.posY !== nextNode.posY)) {
        try {
          await apiFetch(`/subjects/nodes/${nextNode.id}`, {
            method: "PUT",
            body: JSON.stringify({ posX: nextNode.posX, posY: nextNode.posY }),
          });
        } catch (e) {
          console.error("Failed to sync redo position:", e);
        }
      }
    }
    if (onRefresh) onRefresh();
  };

  // Keyboard shortcut listener for Ctrl+Z and Ctrl+Y
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.getAttribute("contenteditable") === "true")) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          handleUndo();
        } else if (e.key.toLowerCase() === "y") {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [history, historyIndex, localNodes]);

  // Reset focus view and history when subject changes
  useEffect(() => {
    setHistory([]);
    setHistoryIndex(-1);
    setIsFocusedView(false);
    setSelectedNodeId(null);
  }, [subject]);

  // Zoom helpers
  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.15, 2.5));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.15, 0.4));

  // Wheel zoom: zoom toward cursor position for natural feel
  // Uses a native non-passive listener so preventDefault() works to block page scroll
  const wheelCallbackRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelCallbackRef.current = (e: WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.4, Math.min(scale * zoomFactor, 2.5));

    const newPanX = cursorX - (cursorX - pan.x) * (newScale / scale);
    const newPanY = cursorY - (cursorY - pan.y) * (newScale / scale);

    setScale(newScale);
    setPan({ x: Math.round(newPanX), y: Math.round(newPanY) });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: WheelEvent) => wheelCallbackRef.current(e);
    container.addEventListener("wheel", handler, { passive: false });
    return () => container.removeEventListener("wheel", handler);
  }, []);
  const handleResetZoom = () => {
    const container = containerRef.current;
    if (!container || displayNodes.length === 0) {
      setPan({ x: 0, y: 0 });
      setScale(1);
      return;
    }

    const xs = displayNodes.map(n => n.posX);
    const ys = displayNodes.map(n => n.posY);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs) + 230; // node width
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys) + 85;  // node height

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;

    const containerWidth = container.clientWidth || 800;
    const containerHeight = container.clientHeight || 500;

    const padding = 40;
    const scaleX = (containerWidth - padding * 2) / graphWidth;
    const scaleY = (containerHeight - padding * 2) / graphHeight;
    const newScale = Math.max(0.5, Math.min(Math.min(scaleX, scaleY), 1.2));

    const graphCenterX = minX + graphWidth / 2;
    const graphCenterY = minY + graphHeight / 2;
    const containerCenterX = containerWidth / 2;
    const containerCenterY = containerHeight / 2;

    const panX = containerCenterX - graphCenterX * newScale;
    const panY = containerCenterY - graphCenterY * newScale;

    setPan({ x: Math.round(panX), y: Math.round(panY) });
    setScale(newScale);
  };

  // Auto-center on load (view-only mode has its own fit effect below, which
  // also runs on load — skip here so the two don't fight over pan/scale)
  useEffect(() => {
    if (viewOnlyMode) return;
    if (nodes && nodes.length > 0 && containerRef.current) {
      const timer = setTimeout(() => {
        handleResetZoom();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [nodes, viewOnlyMode]);

  // Fit a set of node boxes into the viewport: returns the scale + translate
  // that centers them, given the ACTUAL measured container size (never a
  // hardcoded constant, since the panel is flexibly sized).
  const fitBoxes = (
    boxes: { x: number; y: number; w: number; h: number }[],
    containerWidth: number,
    containerHeight: number,
    padding: number,
    maxScale: number,
    minScale: number = 0.35,
  ) => {
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w));
    const maxY = Math.max(...boxes.map((b) => b.y + b.h));
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    let newScale = Math.min((containerWidth - padding * 2) / w, (containerHeight - padding * 2) / h, maxScale);
    newScale = Math.max(newScale, minScale);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return { scale: newScale, tx: containerWidth / 2 - cx * newScale, ty: containerHeight / 2 - cy * newScale };
  };

  // Re-center when switching between focused/overview mode
  useEffect(() => {
    if (!containerRef.current || localNodes.length === 0) return;
    if (traceActive) return; // camera đang thuộc về animation truy vết gốc rễ

    const timer = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const containerWidth = container.clientWidth || 800;
      const containerHeight = container.clientHeight || 500;
      const nodeWidth = 230;
      const nodeHeight = 85;

      if (viewOnlyMode) {
        // Neighbor-only focus (sidebar/tree click) vs. fit-all ("Xem toàn cảnh")
        const focusBoxes = activeSelectedNodeId
          ? displayNodes.filter((n) => neighborFocusSet.has(n.id)).map((n) => ({ x: n.posX, y: n.posY, w: nodeWidth, h: nodeHeight }))
          : [];
        const boxes = focusBoxes.length > 0
          ? focusBoxes
          : displayNodes.map((n) => ({ x: n.posX, y: n.posY, w: nodeWidth, h: nodeHeight }));
        if (boxes.length === 0) return;
        const padding = focusBoxes.length > 0 ? 110 : 70;
        const maxScale = focusBoxes.length > 0 ? 1.15 : 1;
        // Fit-all must be able to shrink a lot further than the focused case —
        // a subject with many top-level branches can be very wide/bushy.
        // The focused case keeps a high floor so it always reads as "zoomed
        // in": a node with several widely-separated prerequisite parents can
        // otherwise force a huge neighbor bounding box and end up zoomed OUT
        // instead — better to let distant neighbors extend past the viewport
        // (pannable) than to lose the "zoomed in" feel entirely.
        const minScale = focusBoxes.length > 0 ? 0.65 : 0.1;
        const fitted = fitBoxes(boxes, containerWidth, containerHeight, padding, maxScale, minScale);
        setScale(fitted.scale);

        const focusNode = activeSelectedNodeId ? displayNodes.find((n) => n.id === activeSelectedNodeId) : null;
        if (focusNode) {
          // Center on the clicked node itself, not the neighbor group's bbox
          // centroid — a node with far-flung neighbors would otherwise pull
          // the pan toward the group's average position, potentially pushing
          // the actual focused node off-screen.
          const nodeCenterX = focusNode.posX + nodeWidth / 2;
          const nodeCenterY = focusNode.posY + nodeHeight / 2;
          setPan({
            x: Math.round(containerWidth / 2 - nodeCenterX * fitted.scale),
            y: Math.round(containerHeight / 2 - nodeCenterY * fitted.scale),
          });
        } else {
          setPan({ x: Math.round(fitted.tx), y: Math.round(fitted.ty) });
        }
        return;
      }

      if (isFocusedView && activeSelectedNodeId) {
        // Center the selected node in the viewport
        // Find the selected node from displayNodes (which has focused-view coords)
        const selectedNode = displayNodes.find(n => n.id === activeSelectedNodeId);
        if (!selectedNode) {
          handleResetZoom();
          return;
        }

        const nodeCenterX = selectedNode.posX + nodeWidth / 2;
        const nodeCenterY = selectedNode.posY + nodeHeight / 2;

        const targetScale = 1.0;
        const panX = containerWidth / 2 - nodeCenterX * targetScale;
        const panY = containerHeight / 2 - nodeCenterY * targetScale;

        setScale(targetScale);
        setPan({ x: Math.round(panX), y: Math.round(panY) });
      } else if (activeSelectedNodeId) {
        // Center the selected node in overview mode without changing current scale
        const selectedNode = localNodes.find(n => n.id === activeSelectedNodeId);
        if (selectedNode) {
          const nodeWidth = 230;
          const nodeHeight = 85;
          const nodeCenterX = selectedNode.posX + nodeWidth / 2;
          const nodeCenterY = selectedNode.posY + nodeHeight / 2;

          const containerWidth = container.clientWidth || 800;
          const containerHeight = container.clientHeight || 500;

          const targetScale = scale || 1.0;
          const panX = containerWidth / 2 - nodeCenterX * targetScale;
          const panY = containerHeight / 2 - nodeCenterY * targetScale;

          setPan({ x: Math.round(panX), y: Math.round(panY) });
        }
      } else {
        handleResetZoom();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isFocusedView, activeSelectedNodeId, viewOnlyMode, expandedChainIds, localNodes, traceActive]);

  // Auto-layout: matches backend algorithm (global topological levels, centered)
  const handleAutoLayout = async () => {
    const NODE_SPACING = 350.0;
    const LEFT_MARGIN = 100.0;
    const TOP_MARGIN = 80.0;
    const LEVEL_HEIGHT = 260.0;

    // Build adjacency and in-degree
    const adj: Record<string, string[]> = {};
    const inDeg: Record<string, number> = {};
    localNodes.forEach(n => { adj[n.id] = []; inDeg[n.id] = 0; });
    edges.forEach(e => {
      if (adj[e.sourceId] !== undefined && inDeg[e.targetId] !== undefined) {
        adj[e.sourceId].push(e.targetId);
        inDeg[e.targetId]++;
      }
    });

    // BFS topological sort
    const queue: string[] = [];
    const levels: Record<string, number> = {};
    Object.keys(inDeg).forEach(id => {
      if (inDeg[id] === 0) { queue.push(id); levels[id] = 0; }
    });
    let head = 0;
    while (head < queue.length) {
      const curr = queue[head++];
      for (const child of adj[curr]) {
        inDeg[child]--;
        levels[child] = Math.max(levels[child] || 0, (levels[curr] || 0) + 1);
        if (inDeg[child] === 0) queue.push(child);
      }
    }
    localNodes.forEach(n => { if (levels[n.id] === undefined) levels[n.id] = 0; });

    // Group by level
    const nodesByLevel: Record<number, string[]> = {};
    let maxLevel = 0;
    Object.entries(levels).forEach(([id, lvl]) => {
      if (!nodesByLevel[lvl]) nodesByLevel[lvl] = [];
      nodesByLevel[lvl].push(id);
      if (lvl > maxLevel) maxLevel = lvl;
    });

    // Assign positions matching backend: 280px per node, centered, 200px per level
    const newPositions: Record<string, { posX: number; posY: number }> = {};
    for (let lvl = 0; lvl <= maxLevel; lvl++) {
      const levelNodes = nodesByLevel[lvl] || [];
      const count = levelNodes.length;
      const totalLevelWidth = NODE_SPACING * count;

      levelNodes.forEach((id, idx) => {
        let posX: number;
        if (count === 1) {
          posX = LEFT_MARGIN + totalLevelWidth / 2.0 - 100.0;
        } else {
          posX = LEFT_MARGIN + idx * NODE_SPACING;
        }
        const posY = TOP_MARGIN + lvl * LEVEL_HEIGHT;
        newPositions[id] = { posX, posY };
      });
    }

    // Apply positions locally
    const updatedNodes = localNodes.map(n => ({
      ...n,
      posX: newPositions[n.id]?.posX ?? n.posX,
      posY: newPositions[n.id]?.posY ?? n.posY,
    }));

    // Push to undo history
    const nextHistory = history.slice(0, historyIndex + 1);
    setHistory([...nextHistory, { nodes: updatedNodes, edges }]);
    setHistoryIndex(nextHistory.length);

    setLocalNodes(updatedNodes);
    setPan({ x: 0, y: 0 });
    setScale(1);

    // Save all positions to backend if mode is teacher
    if (mode === "teacher") {
      for (const n of updatedNodes) {
        try {
          await apiFetch(`/subjects/nodes/${n.id}`, {
            method: "PUT",
            body: JSON.stringify({ posX: n.posX, posY: n.posY }),
          });
        } catch (err) {
          console.error("Failed to save auto-layout position:", err);
        }
      }
    }
    if (onRefresh) onRefresh();
  };

  // Pan canvas logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if (linkingSource) return;
    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement).tagName === "rect") {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    } else if (draggedNode && mode === "teacher" && !isFocusedView) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const x = (e.clientX - rect.left - pan.x) / scale - dragOffsetRef.current.x;
      const y = (e.clientY - rect.top - pan.y) / scale - dragOffsetRef.current.y;
      
      setLocalNodes((prev) =>
        prev.map((n) => (n.id === draggedNode ? { ...n, posX: Math.round(x), posY: Math.round(y) } : n))
      );
    }
  };

  const handleMouseUp = async (e: React.MouseEvent) => {
    if (isPanning) {
      setIsPanning(false);
    } else if (draggedNode && mode === "teacher" && !isFocusedView) {
      const nodeToSave = localNodes.find((n) => n.id === draggedNode);
      const prevNodes = history[historyIndex]?.nodes || [];
      const originalNode = prevNodes.find((n) => n.id === draggedNode) || nodes.find((n) => n.id === draggedNode);
      
      if (nodeToSave && originalNode) {
        const hasMoved = nodeToSave.posX !== originalNode.posX || nodeToSave.posY !== originalNode.posY;
        
        if (hasMoved) {
          const nextHistory = history.slice(0, historyIndex + 1);
          const newState = { nodes: localNodes, edges };
          setHistory([...nextHistory, newState]);
          setHistoryIndex(nextHistory.length);
          
          try {
            await apiFetch(`/subjects/nodes/${nodeToSave.id}`, {
              method: "PUT",
              body: JSON.stringify({
                posX: nodeToSave.posX,
                posY: nodeToSave.posY,
              }),
            });
            if (onRefresh) onRefresh();
          } catch (err) {
            console.error("Failed to save node position:", err);
          }
        }
      }
      setDraggedNode(null);
    }
  };

  const handleNodeDragStart = (e: React.MouseEvent, nodeId: string, posX: number, posY: number) => {
    e.stopPropagation();
    if (mode !== "teacher" || isLinkingMode || isFocusedView) return;
    setDraggedNode(nodeId);
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const clickX = (e.clientX - rect.left - pan.x) / scale;
    const clickY = (e.clientY - rect.top - pan.y) / scale;
    
    dragOffsetRef.current = {
      x: clickX - posX,
      y: clickY - posY,
    };
  };

  const handleNodeClick = (node: NodeItem) => {
    // Handle linking mode first
    if (isLinkingMode) {
      if (!linkingSource) {
        setLinkingSource(node.id);
      } else if (linkingSource !== node.id) {
        createNewEdge(linkingSource, node.id);
        setLinkingSource(null);
        setIsLinkingMode(false);
      }
      return;
    }

    setSelectedNodeId(node.id);
    if (onFocusedNodeChange) {
      onFocusedNodeChange(node.id);
    }

    // Call prop callback to notify parent tutor page
    if (onNodeClick) {
      onNodeClick(node);
    }
  };

  const createNewEdge = async (sourceId: string, targetId: string) => {
    try {
      await apiFetch(`/subjects/${encodeURIComponent(subject)}/edges`, {
        method: "POST",
        body: JSON.stringify({ sourceId, targetId }),
      });
      toast.success("Đã tạo liên kết tiên quyết mới!");
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error("Không thể tạo liên kết: " + (err.message || err));
    }
  };

  const handleDeleteEdge = async (edgeId: string) => {
    setTreeConfirmState({
      open: true,
      title: "Xóa liên kết tiên quyết",
      message: "Bạn có chắc chắn muốn xóa liên kết tiên quyết này?",
      onConfirm: async () => {
        try {
          await apiFetch(`/subjects/edges/${edgeId}`, { method: "DELETE" });
          toast.success("Đã xóa liên kết tiên quyết!");
          if (onRefresh) onRefresh();
        } catch (err: any) {
          toast.error("Lỗi khi xóa liên kết: " + (err.message || err));
        }
      },
    });
  };

  const handleAddNode = () => {
    setTreeModalState({
      open: true,
      mode: "add",
      inputValue: "",
    });
  };

  const submitAddNode = async (name: string) => {
    if (!name || !name.trim()) return;
    try {
      await apiFetch(`/subjects/${encodeURIComponent(subject)}/nodes`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          theory: "Nội dung lý thuyết đang được cập nhật...",
          posX: 400 + Math.random() * 50,
          posY: 200 + Math.random() * 50,
          isRoot: false,
        }),
      });
      toast.success(`Đã thêm nút kiến thức "${name.trim()}"!`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error("Lỗi tạo nút mới: " + (err.message || err));
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    setTreeConfirmState({
      open: true,
      title: "Xóa nút kiến thức",
      message: "Xóa nút này sẽ xóa toàn bộ câu hỏi và liên kết liên quan. Bạn có chắc chắn?",
      onConfirm: async () => {
        try {
          await apiFetch(`/subjects/nodes/${nodeId}`, { method: "DELETE" });
          toast.success("Đã xóa nút kiến thức!");
          if (onRefresh) onRefresh();
        } catch (err: any) {
          toast.error("Lỗi khi xóa nút: " + (err.message || err));
        }
      },
    });
  };

  const handleAddChildNode = (parent: NodeItem) => {
    setTreeModalState({
      open: true,
      mode: "add_child",
      parentNode: parent,
      inputValue: "",
    });
  };

  const submitAddChildNode = async (parent: NodeItem, name: string) => {
    if (!name || !name.trim()) return;
    try {
      const child = await apiFetch(`/subjects/${encodeURIComponent(subject)}/nodes`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          theory: "Nội dung lý thuyết đang được cập nhật...",
          posX: parent.posX + (Math.random() - 0.5) * 40,
          posY: parent.posY + 120,
          isRoot: false,
        }),
      });

      await apiFetch(`/subjects/${encodeURIComponent(subject)}/edges`, {
        method: "POST",
        body: JSON.stringify({
          sourceId: parent.id,
          targetId: child.id,
        }),
      });

      toast.success(`Đã thêm nút con "${name.trim()}" cho "${parent.name}"!`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error("Lỗi khi thêm nút con: " + (err.message || err));
    }
  };

  const handleStartLinkFromNode = (nodeId: string) => {
    setLinkingSource(nodeId);
    setIsLinkingMode(true);
  };

  const getEdgeStyle = (edge: EdgeItem) => {
    if (mode === "teacher") {
      return { stroke: "#cbd5e1", strokeWidth: 3, strokeDasharray: "none", isFlow: false };
    }

    const srcStatus = chainById.has(edge.sourceId) ? "mastered" : (studentNodeStatus[edge.sourceId] || "locked");
    const tgtStatus = chainById.has(edge.targetId) ? "mastered" : (studentNodeStatus[edge.targetId] || "locked");

    if (srcStatus === "mastered" && tgtStatus === "mastered") {
      return { stroke: "#10b981", strokeWidth: 4, isFlow: true };
    }
    if (srcStatus === "mastered" && (tgtStatus === "learning" || tgtStatus === "struggle")) {
      return { stroke: "#f97316", strokeWidth: 3.5, isFlow: true };
    }
    return { stroke: "#cbd5e1", strokeWidth: 2, strokeDasharray: "5, 5", isFlow: false };
  };

  const isNodeSelectable = (node: NodeItem) => {
    if (mode === "teacher") return true;
    if (node.isRoot) return true;

    const status = studentNodeStatus[node.id];
    return status && status !== "locked";
  };

  const getNodeColorClass = (node: NodeItem, isActiveOrHighlighted: boolean = false) => {
    if (mode === "teacher") {
      return "border-slate-200 bg-white text-slate-800 hover:border-[var(--mint)]/60 shadow-sm";
    }

    // fallback for root nodes when state is not initialized
    let status = studentNodeStatus[node.id];
    if (!status && node.isRoot) {
      status = "initial";
    }
    if (!status) {
      status = "locked";
    }
    // mastered-chain summary nodes are synthetic (no studentNodeStatus entry) but always read as "mastered"
    if (chainById.has(node.id)) {
      status = "mastered";
    }

    switch (status) {
      case "mastered":
        return "border-emerald-400/80 bg-gradient-to-br from-emerald-50 via-white to-emerald-100 text-emerald-950 shadow-md shadow-emerald-100/40 hover:shadow-emerald-200/50 font-bold";
      case "struggle":
        return "border-rose-400/80 bg-gradient-to-br from-rose-50 via-white to-rose-100 text-rose-950 shadow-md shadow-rose-100/40 hover:shadow-rose-200/50 font-bold animate-[struggle-glow_2s_infinite]";
      case "learning":
        return "border-orange-400/80 bg-gradient-to-br from-amber-50 via-white to-orange-100 text-orange-950 shadow-md shadow-orange-100/40 hover:shadow-orange-200/50 ring-2 ring-orange-300/60 font-bold";
      case "initial":
        return "border-blue-400/80 bg-gradient-to-br from-blue-50 via-white to-blue-100 text-blue-950 shadow-md shadow-blue-100/40 hover:shadow-blue-200/50 ring-2 ring-blue-300/60 font-bold animate-pulse-subtle";
      default:
        // locked status
        if (isActiveOrHighlighted) {
          return "border-slate-350 bg-white text-slate-850 shadow-md font-semibold opacity-100 cursor-pointer";
        }
        return "border-slate-200/70 bg-slate-50 text-slate-400/80 opacity-60 cursor-not-allowed";
    }
  };

  // --- COLLAPSE LOGIC ---
  const isNodeHidden = (nodeId: string): boolean => {
    const checkHidden = (id: string, visited: Set<string> = new Set()): boolean => {
      if (visited.has(id)) return false;
      visited.add(id);

      const parentEdges = edges.filter((e) => e.targetId === id);
      if (parentEdges.length === 0) return false;

      // Hidden if ANY parent is collapsed or hidden
      return parentEdges.some((e) => {
        if (collapsedNodes[e.sourceId]) return true;
        return checkHidden(e.sourceId, visited);
      });
    };
    return checkHidden(nodeId);
  };

  // --- HOVER PATH TRACING ---
  const getAncestors = (id: string, visited: Set<string> = new Set()): Set<string> => {
    const ancestors = new Set<string>();
    const traverse = (currId: string) => {
      if (visited.has(currId)) return;
      visited.add(currId);
      edges.filter(e => e.targetId === currId).forEach(e => {
        ancestors.add(e.sourceId);
        traverse(e.sourceId);
      });
    };
    traverse(id);
    return ancestors;
  };

  const getDescendants = (id: string, visited: Set<string> = new Set()): Set<string> => {
    const descendants = new Set<string>();
    const traverse = (currId: string) => {
      if (visited.has(currId)) return;
      visited.add(currId);
      edges.filter(e => e.sourceId === currId).forEach(e => {
        descendants.add(e.targetId);
        traverse(e.targetId);
      });
    };
    traverse(id);
    return descendants;
  };

  // Only use the explicitly selected node for path highlighting (not hover)
  const activeTargetId = activeSelectedNodeId;
  const highlightedNodes = new Set<string>();
  const highlightedEdges = new Set<string>();

  if (activeTargetId) {
    highlightedNodes.add(activeTargetId);
    const ancestors = getAncestors(activeTargetId);
    const descendants = getDescendants(activeTargetId);
    ancestors.forEach(id => highlightedNodes.add(id));
    descendants.forEach(id => highlightedNodes.add(id));

    edges.forEach(edge => {
      const isAncestorPath = (ancestors.has(edge.sourceId) || edge.sourceId === activeTargetId) && (ancestors.has(edge.targetId) || edge.targetId === activeTargetId);
      const isDescendantPath = (descendants.has(edge.sourceId) || edge.sourceId === activeTargetId) && (descendants.has(edge.targetId) || edge.targetId === activeTargetId);
      if (isAncestorPath || isDescendantPath) {
        highlightedEdges.add(edge.id);
      }
    });
  }

  // --- MASTERED-CHAIN AUTO-COLLAPSE (view-only mode) ---
  // Consecutive mastered topics (a simple linear run, no branching) collapse
  // into one "N chủ đề đã hoàn thành" summary node by default, decluttering
  // the tree. Expanding a summary node reveals its real member nodes again.
  const nodeByIdMap = new Map(localNodes.map((n) => [n.id, n]));
  const accuracyPctOf = (id: string): number | null => {
    const acc = nodeAccuracy[id];
    if (!acc || acc.total <= 0) return null;
    return Math.round((acc.correct / acc.total) * 100);
  };
  // Khi truy vết gốc rễ, không gộp chuỗi mastered — nút trên path phải luôn hiện
  const masteredChains: MasteredChain[] = viewOnlyMode && !traceActive
    ? computeMasteredChains(localNodes, edges, (id) => studentNodeStatus[id] || "locked", accuracyPctOf)
    : [];
  const expandedChains = masteredChains.filter((c) => expandedChainIds.has(c.id));
  const totalExpandedChainMembers = expandedChains.reduce((sum, c) => sum + c.memberIds.length, 0);

  let chainNodes: NodeItem[] = localNodes;
  let chainEdges: EdgeItem[] = edges;

  if (viewOnlyMode && masteredChains.length > 0) {
    const hiddenMemberIds = new Set<string>();
    const summaryNodes: NodeItem[] = [];
    const summaryEdges: EdgeItem[] = [];

    masteredChains.forEach((chain) => {
      if (expandedChainIds.has(chain.id)) return; // expanded: show real members, no synthetic node/edges

      chain.memberIds.forEach((id) => hiddenMemberIds.add(id));
      const headNode = nodeByIdMap.get(chain.memberIds[0]);
      summaryNodes.push({
        id: chain.id,
        subject,
        name: `${chain.memberIds.length} chủ đề đã hoàn thành`,
        theory: "",
        posX: headNode?.posX ?? 0,
        posY: headNode?.posY ?? 0,
        isRoot: false,
      });
      if (chain.parentId) {
        summaryEdges.push({ id: `${chain.id}::in`, subject, sourceId: chain.parentId, targetId: chain.id });
      }
      chain.childIds.forEach((childId) => {
        summaryEdges.push({ id: `${chain.id}::out::${childId}`, subject, sourceId: chain.id, targetId: childId });
      });
    });

    chainNodes = localNodes.filter((n) => !hiddenMemberIds.has(n.id)).concat(summaryNodes);
    chainEdges = edges.filter((e) => !hiddenMemberIds.has(e.sourceId) && !hiddenMemberIds.has(e.targetId)).concat(summaryEdges);
  }

  // --- VIEW-ONLY LAYOUT: recompute a clean, generously-spaced layout ---
  // The teacher's saved posX/posY reflect their own editor layout, which can
  // be tightly packed (nodes are often added with only ~35px of clearance).
  // View-only never allows dragging, so it's safe to lay out fresh purely
  // for display — nothing here is persisted — giving edges room to read.
  if (viewOnlyMode && chainNodes.length > 0) {
    const VO_NODE_SPACING = 420;
    const VO_LEVEL_HEIGHT = 320;
    const VO_LEFT_MARGIN = 60;
    const VO_TOP_MARGIN = 60;

    const voAdj: Record<string, string[]> = {};
    const voInDegree: Record<string, number> = {};
    chainNodes.forEach((n) => { voAdj[n.id] = []; voInDegree[n.id] = 0; });
    chainEdges.forEach((e) => {
      if (voAdj[e.sourceId] !== undefined && voInDegree[e.targetId] !== undefined) {
        voAdj[e.sourceId].push(e.targetId);
        voInDegree[e.targetId]++;
      }
    });

    const voQueue: string[] = [];
    const voLevels: Record<string, number> = {};
    Object.keys(voInDegree).forEach((id) => {
      if (voInDegree[id] === 0) { voQueue.push(id); voLevels[id] = 0; }
    });
    let voHead = 0;
    while (voHead < voQueue.length) {
      const curr = voQueue[voHead++];
      voAdj[curr].forEach((child) => {
        voLevels[child] = Math.max(voLevels[child] ?? 0, (voLevels[curr] ?? 0) + 1);
        voInDegree[child]--;
        if (voInDegree[child] === 0) voQueue.push(child);
      });
    }
    chainNodes.forEach((n) => { if (voLevels[n.id] === undefined) voLevels[n.id] = 0; });

    const voByLevel: Record<number, string[]> = {};
    let voMaxLevel = 0;
    Object.entries(voLevels).forEach(([id, lvl]) => {
      if (!voByLevel[lvl]) voByLevel[lvl] = [];
      voByLevel[lvl].push(id);
      if (lvl > voMaxLevel) voMaxLevel = lvl;
    });

    const voPositions: Record<string, { x: number; y: number }> = {};
    for (let lvl = 0; lvl <= voMaxLevel; lvl++) {
      const levelNodes = voByLevel[lvl] || [];
      const count = levelNodes.length;
      const totalWidth = VO_NODE_SPACING * count;
      levelNodes.forEach((id, idx) => {
        const x = count === 1
          ? VO_LEFT_MARGIN + totalWidth / 2 - 100
          : VO_LEFT_MARGIN + idx * VO_NODE_SPACING;
        voPositions[id] = { x, y: VO_TOP_MARGIN + lvl * VO_LEVEL_HEIGHT };
      });
    }

    chainNodes = chainNodes.map((n) => ({
      ...n,
      posX: voPositions[n.id]?.x ?? n.posX,
      posY: voPositions[n.id]?.y ?? n.posY,
    }));
  }

  const chainById = new Map(masteredChains.map((c) => [c.id, c]));

  // --- DYNAMIC FOCUSED VIEW LAYOUT REARRANGEMENT ---
  let displayNodes = chainNodes.filter(n => !isNodeHidden(n.id));
  let displayEdges = chainEdges.filter(e => !isNodeHidden(e.sourceId) && !isNodeHidden(e.targetId));

  // --- NEIGHBOR-ONLY FOCUS (view-only mode "Điểm cần chú ý" sidebar) ---
  // Unlike isFocusedView's full ancestor/descendant closure below (teacher
  // mode), this dims everything except the focused node's immediate
  // parent(s)/child(ren) in the CURRENT (possibly chain-collapsed) graph.
  const neighborFocusSet = new Set<string>();
  if (viewOnlyMode && activeSelectedNodeId) {
    neighborFocusSet.add(activeSelectedNodeId);
    displayEdges.forEach((e) => {
      if (e.sourceId === activeSelectedNodeId) neighborFocusSet.add(e.targetId);
      if (e.targetId === activeSelectedNodeId) neighborFocusSet.add(e.sourceId);
    });
  }

  if (isFocusedView && activeSelectedNodeId) {
    const focusedNodeItems = localNodes.filter((n) => highlightedNodes.has(n.id));
    const focusedEdgeItems = edges.filter((e) => highlightedEdges.has(e.id));

    // Local topological sort to arrange only the focused nodes nicely
    const localAdj: Record<string, string[]> = {};
    const localInDegree: Record<string, number> = {};

    focusedNodeItems.forEach(n => {
      localInDegree[n.id] = 0;
      localAdj[n.id] = [];
    });

    focusedEdgeItems.forEach(e => {
      if (localInDegree[e.sourceId] !== undefined && localInDegree[e.targetId] !== undefined) {
        localAdj[e.sourceId].push(e.targetId);
        localInDegree[e.targetId]++;
      }
    });

    const queue: string[] = [];
    const localLevels: Record<string, number> = {};

    Object.keys(localInDegree).forEach(id => {
      if (localInDegree[id] === 0) {
        queue.push(id);
        localLevels[id] = 0;
      }
    });

    while (queue.length > 0) {
      const curr = queue.shift()!;
      localAdj[curr].forEach(neighbor => {
        if (localLevels[neighbor] === undefined || localLevels[neighbor] < localLevels[curr] + 1) {
          localLevels[neighbor] = localLevels[curr] + 1;
        }
        localInDegree[neighbor]--;
        if (localInDegree[neighbor] === 0) {
          queue.push(neighbor);
        }
      });
    }

    focusedNodeItems.forEach(n => {
      if (localLevels[n.id] === undefined) {
        localLevels[n.id] = 0;
      }
    });

    const nodesByLocalLevel: Record<number, string[]> = {};
    let maxLocalLevel = 0;
    Object.entries(localLevels).forEach(([id, lvl]) => {
      if (!nodesByLocalLevel[lvl]) nodesByLocalLevel[lvl] = [];
      nodesByLocalLevel[lvl].push(id);
      if (lvl > maxLocalLevel) maxLocalLevel = lvl;
    });

    const localCoords: Record<string, { x: number; y: number }> = {};
    for (let lvl = 0; lvl <= maxLocalLevel; lvl++) {
      const levelNodes = nodesByLocalLevel[lvl] || [];
      const count = levelNodes.length;
      const nodeSpacing = 350;
      const totalWidth = nodeSpacing * count;
      const startX = 100;

      levelNodes.forEach((id, idx) => {
        let posX = startX;
        if (count === 1) {
          posX = startX + totalWidth / 2 - 100;
        } else {
          posX = startX + idx * nodeSpacing;
        }
        const posY = 80 + lvl * 250;
        localCoords[id] = { x: posX, y: posY };
      });
    }

    displayNodes = focusedNodeItems.map(n => ({
      ...n,
      posX: localCoords[n.id]?.x ?? n.posX,
      posY: localCoords[n.id]?.y ?? n.posY
    }));

    displayEdges = focusedEdgeItems;
  }

  // --- CLUSTER GROUPING calculation ---
  const groups: Record<string, NodeItem[]> = {};
  displayNodes.forEach(node => {
    const groupName = node.topicGroup || "Chủ đề học tập";
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(node);
  });

  const groupBoxes = Object.entries(groups).map(([groupName, groupNodes]) => {
    const xs = groupNodes.map(n => n.posX);
    const ys = groupNodes.map(n => n.posY);
    if (xs.length === 0 || ys.length === 0) return null;

    const paddingX = 30;
    const paddingTop = 35;
    const paddingBottom = 30;

    const minX = Math.min(...xs) - paddingX;
    const minY = Math.min(...ys) - paddingTop;
    const maxX = Math.max(...xs) + 230 + paddingX;
    const maxY = Math.max(...ys) + 85 + paddingBottom;

    return {
      name: groupName,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }).filter((box): box is NonNullable<typeof box> => box !== null);

  // --- SVG EDGE renderer ---
  const renderEdge = (edge: EdgeItem) => {
    if (isNodeHidden(edge.sourceId) || isNodeHidden(edge.targetId)) return null;

    const srcNode = displayNodes.find((n) => n.id === edge.sourceId);
    const tgtNode = displayNodes.find((n) => n.id === edge.targetId);
    if (!srcNode || !tgtNode) return null;

    const nodeWidth = 230;
    const nodeHeight = 85;
    const startX = srcNode.posX + nodeWidth / 2;
    const startY = srcNode.posY + nodeHeight;
    const endX = tgtNode.posX + nodeWidth / 2;
    const endY = tgtNode.posY;

    const style = getEdgeStyle(edge);
    const controlPointY = startY + (endY - startY) / 2;
    const pathD = `M ${startX} ${startY} C ${startX} ${controlPointY}, ${endX} ${controlPointY}, ${endX} ${endY}`;

    // Edge nằm trên đường truy vết gốc rễ và đã được "thắp sáng" tới bước hiện tại?
    // path[i] = con, path[i+1] = cha; edge cha→con sáng khi traceStep đạt tới cha (i+1).
    const traceChildIdx = traceActive ? tracePath.indexOf(edge.targetId) : -1;
    const isTraceEdgeLit =
      traceChildIdx !== -1 &&
      tracePath[traceChildIdx + 1] === edge.sourceId &&
      traceStep >= traceChildIdx + 1;

    const isNeighborHighlightVO = viewOnlyMode && neighborFocusSet.has(edge.sourceId) && neighborFocusSet.has(edge.targetId);
    const isHighlighted = viewOnlyMode ? isNeighborHighlightVO : highlightedEdges.has(edge.id);
    // View-only mode never recolors edges purple (that's the teacher-mode ancestor/descendant path highlight)
    const recolorPurple = isHighlighted && !viewOnlyMode;
    const opacity = isTraceEdgeLit
      ? 1
      : viewOnlyMode
        ? (activeSelectedNodeId ? (isNeighborHighlightVO ? 0.9 : 0.15) : 0.9)
        : (isFocusedView ? (isHighlighted ? 1 : 0.45) : 1);

    return (
      <g key={edge.id} className="group/edge" style={{ opacity, transition: "opacity 0.2s" }}>
        {mode === "teacher" && !isFocusedView && (
          <path
            d={pathD}
            fill="none"
            stroke="transparent"
            strokeWidth={15}
            className="cursor-pointer"
            onClick={() => handleDeleteEdge(edge.id)}
            style={{ pointerEvents: "auto" }}
          />
        )}

        <path
          d={pathD}
          fill="none"
          stroke={recolorPurple ? "var(--color-secondary)" : style.stroke}
          strokeWidth={isHighlighted ? style.strokeWidth + 1.5 : style.strokeWidth}
          strokeDasharray={style.strokeDasharray}
          markerEnd={style.strokeDasharray ? "" : `url(#arrow-${recolorPurple ? "purple" : (style.stroke === "#10b981" ? "green" : style.stroke === "#f97316" ? "orange" : "gray")})`}
          className={style.isFlow || isHighlighted ? "animate-flow-line" : ""}
          style={{ strokeDashoffset: style.isFlow || isHighlighted ? 0 : undefined }}
        />

        {/* Lớp phủ đỏ chạy ngược cây khi truy vết gốc rễ */}
        {isTraceEdgeLit && (
          <path
            d={pathD}
            fill="none"
            stroke="#ef4444"
            strokeWidth={style.strokeWidth + 2.5}
            className="animate-flow-line"
            style={{ filter: "drop-shadow(0 0 6px rgba(239,68,68,.6))" }}
          />
        )}

        {mode === "teacher" && !isFocusedView && (
          <foreignObject
            x={(startX + endX) / 2 - 12}
            y={(startY + endY) / 2 - 12}
            width={24}
            height={24}
            className="hidden group-hover/edge:block"
            style={{ pointerEvents: "auto" }}
          >
            <button
              onClick={() => handleDeleteEdge(edge.id)}
              className="h-6 w-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:bg-rose-600 transition-colors cursor-pointer text-[10px] font-bold"
            >
              ✕
            </button>
          </foreignObject>
        )}
      </g>
    );
  };

  return (
    <div className="relative w-full h-full border border-border bg-card/70 overflow-hidden shadow-inner flex flex-col min-h-[450px]">
      {/* Sticky Top Toolbar - Outside Canvas Scroll/Pan Area */}
      <div className="w-full border-b border-border bg-card/90 px-4 py-3 flex items-center justify-between gap-4 z-20 shadow-sm">
        {/* Left Side: Zoom and Undo/Redo */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 border border-slate-200/50 rounded-2xl p-1 shadow-inner items-center">
            <button
              onClick={handleZoomIn}
              className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm active:scale-95 transition-all cursor-pointer"
              title="Phóng to"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={handleZoomOut}
              className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm active:scale-95 transition-all cursor-pointer"
              title="Thu nhỏ"
            >
              <ZoomOut size={14} />
            </button>
            {!viewOnlyMode && (
              <button
                onClick={handleResetZoom}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm active:scale-95 transition-all cursor-pointer"
                title="Căn giữa"
              >
                <Move size={14} />
              </button>
            )}
            <button
              onClick={() => setShowGroups(!showGroups)}
              className={`h-8 w-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                showGroups
                  ? "bg-white text-slate-800 shadow-sm border border-slate-200/40"
                  : "text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm"
              }`}
              title={showGroups ? "Ẩn nhóm chủ đề" : "Hiện nhóm chủ đề"}
            >
              <Layers size={14} />
            </button>
          </div>

          {mode === "teacher" && !isFocusedView && (
            <div className="flex bg-slate-100 border border-slate-200/50 rounded-2xl p-1 shadow-inner items-center ml-1">
              <button
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                title="Hoàn tác (Ctrl+Z)"
                className={`h-8 w-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                  historyIndex > 0
                    ? "hover:bg-white text-slate-800 hover:shadow-sm"
                    : "text-slate-400/40 cursor-not-allowed"
                }`}
              >
                <Undo size={14} />
              </button>
              <button
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                title="Làm lại (Ctrl+Y)"
                className={`h-8 w-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                  historyIndex < history.length - 1
                    ? "hover:bg-white text-slate-800 hover:shadow-sm"
                    : "text-slate-400/40 cursor-not-allowed"
                }`}
              >
                <Redo size={14} />
              </button>
            </div>
          )}

          {mode === "teacher" && !isFocusedView && (
            <div className="flex items-center gap-1.5 ml-2">
              <button
                onClick={handleAutoLayout}
                className="h-8 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 text-xs font-black shadow-sm active:scale-95 transition-all cursor-pointer"
                title="Tự động sắp xếp cây theo cấu trúc"
              >
                <LayoutGrid size={13} className="text-slate-500" />
                <span>Sắp xếp</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Overall vs Focused Map Selectors */}
        {activeSelectedNodeId && !viewOnlyMode && (
          <div className="flex border border-border bg-muted rounded-xl p-0.5 shadow-sm">
            <button
              onClick={() => setIsFocusedView(false)}
              className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                !isFocusedView
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sơ đồ tổng thể
            </button>
            <button
              onClick={() => setIsFocusedView(true)}
              className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                isFocusedView
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sơ đồ tập trung
            </button>
          </div>
        )}
      </div>

      {isLinkingMode && (
        <div className="absolute top-16 left-4 z-10 bg-orange-100 border border-orange-200 text-orange-800 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg shadow-sm">
          {!linkingSource ? "👉 Hãy bấm nút CHA đầu tiên..." : "👉 Hãy bấm tiếp nút CON..."}
        </div>
      )}

      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="flex-1 cursor-grab active:cursor-grabbing w-full h-full relative"
        style={{ overflow: "hidden" }}
      >
        {viewOnlyMode && (
          <button
            onClick={() => {
              setSelectedNodeId(null);
              if (onClearFocus) onClearFocus();
            }}
            className="absolute top-4 left-4 z-20 rounded-xl bg-foreground text-background px-4 py-2.5 text-xs font-bold whitespace-nowrap shadow-lg cursor-pointer active:scale-95 transition-all"
          >
            Xem toàn cảnh
          </button>
        )}

        {viewOnlyMode && expandedChainIds.size > 0 && (
          <button
            onClick={() => {
              setExpandedChainIds(new Set());
              setSelectedNodeId(null);
              if (onClearFocus) onClearFocus();
            }}
            className="absolute top-4 right-4 z-20 rounded-xl bg-card border border-border px-4 py-2.5 text-xs font-bold whitespace-nowrap shadow-sm cursor-pointer active:scale-95 transition-all text-foreground/80"
          >
            ▲ Thu gọn {totalExpandedChainMembers} chủ đề nền tảng
          </button>
        )}

        {viewOnlyMode && !traceActive && (
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-3.5 bg-card/90 backdrop-blur border border-border rounded-2xl px-4 py-2 shadow-sm">
            {[
              { color: "bg-emerald-500", label: "Đã xong" },
              { color: "bg-orange-500", label: "Đang học" },
              { color: "bg-rose-600", label: "Cần lưu ý" },
              { color: "bg-slate-400", label: "Đang khóa" },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                <span className={`h-2 w-2 rounded-full shrink-0 ${l.color}`} />
                {l.label}
              </span>
            ))}
          </div>
        )}

        {/* Banner truy vết gốc rễ */}
        {traceActive && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
            {!traceDone ? (
              <div className="flex items-center gap-2 bg-red-600/95 text-white px-4 py-2 rounded-2xl shadow-lg text-xs font-black">
                <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                Đang truy vết gốc rễ lỗ hổng...
              </div>
            ) : (
              (() => {
                const rootNode = localNodes.find((n) => n.id === traceRootId);
                return (
                  <div className="flex flex-col items-center gap-2 bg-card/95 backdrop-blur border-2 border-red-500 px-5 py-3 rounded-2xl shadow-xl pointer-events-auto animate-[fadeIn_0.3s_ease-out]">
                    <div className="text-sm font-black text-red-600 text-center">
                      🔍 Gốc rễ: {rootNode?.name ?? "Nút nền tảng"}
                      {rootNode?.topicGroup ? <span className="text-slate-500 font-bold"> · {rootNode.topicGroup}</span> : null}
                    </div>
                    <div className="text-[11px] text-slate-500 font-bold text-center max-w-xs">
                      Lỗ hổng ở bài này khiến em gặp khó ở bài đang học. Củng cố lại nhé!
                    </div>
                    {onTraceCta && traceRootId && (
                      <button
                        onClick={() => onTraceCta(traceRootId)}
                        className="mt-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-black transition-all active:scale-95"
                      >
                        Ôn lại nút này
                      </button>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        )}

        <svg
          width="100%"
          height="100%"
          className="absolute inset-0 select-none"
          style={{ pointerEvents: "auto" }}
        >
          <defs>
            <marker id="arrow-gray" markerWidth="10" markerHeight="7" refX="22" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#cbd5e1" />
            </marker>
            <marker id="arrow-green" markerWidth="10" markerHeight="7" refX="22" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
            </marker>
            <marker id="arrow-orange" markerWidth="10" markerHeight="7" refX="22" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#f97316" />
            </marker>
            <marker id="arrow-purple" markerWidth="10" markerHeight="7" refX="22" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--color-secondary)" />
            </marker>
          </defs>

          {/* Inner translated/scaled group to prevent clipping */}
          <g
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: "0 0",
              // Camera lướt mượt theo từng bước truy vết; pan/zoom tay thì tức thời
              transition: traceActive ? "transform 0.75s ease-in-out" : undefined,
            }}
          >
            {/* Group Clustering Boundaries - Pass 1: Dashed rectangles (behind edges) */}
            {showGroups && (
              <g opacity={activeTargetId ? 0.8 : 0.95} style={{ transition: "opacity 0.3s" }}>
                {groupBoxes.map((box, idx) => (
                  <rect
                    key={idx}
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    fill="var(--color-muted)"
                    fillOpacity={0.03}
                    stroke="var(--color-border)"
                    strokeWidth={1.5}
                    strokeDasharray="6,4"
                    rx={16}
                  />
                ))}
              </g>
            )}

            {/* Edges rendering */}
            <g style={{ pointerEvents: "auto" }}>{displayEdges.map((e) => renderEdge(e))}</g>

            {/* Group Clustering Boundaries - Pass 2: Folder labels (on top of edges) */}
            {showGroups && (
              <g opacity={activeTargetId ? 0.8 : 0.95} style={{ transition: "opacity 0.3s" }}>
                {(() => {
                  const usedCoords = new Set<string>();
                  return groupBoxes.map((box, idx) => {
                    let labelY = box.y - 20;
                    let coordKey = `${Math.round(box.x)},${Math.round(labelY)}`;
                    while (usedCoords.has(coordKey)) {
                      labelY -= 22;
                      coordKey = `${Math.round(box.x)},${Math.round(labelY)}`;
                    }
                    usedCoords.add(coordKey);

                    return (
                      <foreignObject
                        key={`label-${idx}`}
                        x={box.x + 16}
                        y={labelY}
                        width={box.width - 32}
                        height={22}
                        className="overflow-visible"
                      >
                        <div className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-foreground bg-card/95 border border-border px-2.5 py-1.5 rounded-xl shadow-sm select-none whitespace-nowrap truncate max-w-full">
                          <Folder size={11} className="text-[var(--mint)]" />
                          <span className="truncate">{box.name}</span>
                        </div>
                      </foreignObject>
                    );
                  });
                })()}
              </g>
            )}

            {/* Nodes rendering */}
            <g style={{ pointerEvents: "auto" }}>
              {displayNodes.map((node) => {
                const summaryChain = chainById.get(node.id);
                const isSummary = !!summaryChain;
                const selectable = isSummary ? true : isNodeSelectable(node);
                const isHighlighted = highlightedNodes.has(node.id);
                const isActiveNode = node.id === activeSelectedNodeId;
                const colorClass = getNodeColorClass(node, isHighlighted || isActiveNode);
                const nodeWidth = 230;
                const nodeHeight = 85;

                const opacity = viewOnlyMode
                  ? (activeSelectedNodeId ? (neighborFocusSet.has(node.id) ? 1 : 0.3) : 1)
                  : (isFocusedView ? (isHighlighted ? 1 : 0.6) : 1);

                const isCollapsed = collapsedNodes[node.id];
                const childrenEdges = edges.filter(e => e.sourceId === node.id);
                const hasChildren = childrenEdges.length > 0;

                const status = isSummary ? "mastered" : (studentNodeStatus[node.id] || "locked");
                const accuracyPct = isSummary ? null : accuracyPctOf(node.id);

                // Mastery ring calculation (not meaningful for the synthetic summary node)
                const bktState = masteryByTopic[node.id];
                const displayedMasteryPercent = toMasteryPercent(
                  bktState?.masteryProbability ?? BKT_INITIAL_MASTERY,
                );
                const showMastery = mode !== "teacher" && !isSummary;
                const ringPad = 6;
                const ringW = nodeWidth + ringPad * 2;
                const ringH = nodeHeight + ringPad * 2;
                const ringR = 22;
                const ringPerimeter = 2 * (ringW - 2 * ringR) + 2 * (ringH - 2 * ringR) + 2 * Math.PI * ringR;
                const ringFill = (displayedMasteryPercent / 100) * ringPerimeter;
                const ringGap = ringPerimeter - ringFill;
                const ringColor = !bktState || bktState.masteryStatus === "unknown"
                  ? "#64748b"
                  : bktState.masteryStatus === "uncertain"
                  ? "#d97706"
                  : displayedMasteryPercent >= 80
                    ? "#10b981"
                    : displayedMasteryPercent >= 50
                      ? "#2563eb"
                      : "#ef4444";

                const isHovered = hoveredNodeId === node.id;
                // Truy vết gốc rễ: vị trí của node trên path (-1 nếu không thuộc path)
                const traceIdx = traceActive ? tracePath.indexOf(node.id) : -1;
                const traceLit = traceIdx !== -1 && traceIdx <= traceStep;
                const isTraceRoot = traceLit && node.id === traceRootId;
                const traceColor = isTraceRoot ? "#dc2626" : traceIdx === 0 ? "#f97316" : "#ef4444";
                return (
                  <g
                    key={node.id}
                    className="group/node transition-all duration-200"
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    style={{
                      opacity: traceActive ? (traceLit ? 1 : 0.35) : opacity,
                      transform: isActiveNode 
                        ? "scale(1.06)" 
                        : isHovered 
                          ? "scale(1.03)" 
                          : "scale(1)",
                      transformOrigin: `${node.posX + nodeWidth / 2}px ${node.posY + nodeHeight / 2}px`,
                      transition: "transform 0.2s ease, opacity 0.2s ease",
                      cursor: selectable ? "pointer" : "default"
                    }}
                  >
                    {/* Vòng cháy truy vết gốc rễ */}
                    {traceLit && (
                      <g
                        style={
                          isTraceRoot && traceDone
                            ? { animation: "shake 0.6s ease-in-out 2", transformOrigin: `${node.posX + nodeWidth / 2}px ${node.posY + nodeHeight / 2}px` }
                            : undefined
                        }
                      >
                        <rect
                          x={node.posX - 10}
                          y={node.posY - 10}
                          width={nodeWidth + 20}
                          height={nodeHeight + 20}
                          rx={22}
                          fill={`${traceColor}14`}
                          stroke={traceColor}
                          strokeWidth={isTraceRoot ? 5 : 3.5}
                          strokeDasharray={isTraceRoot && traceDone ? undefined : "10 6"}
                          className={isTraceRoot && traceDone ? "" : "animate-flow-line"}
                          style={{ filter: `drop-shadow(0 0 10px ${traceColor}80)` }}
                        />
                        {isTraceRoot && traceDone && (
                          <foreignObject x={node.posX - 10} y={node.posY - 44} width={nodeWidth + 20} height={30} className="overflow-visible">
                            <div className="flex justify-center">
                              <span className="bg-red-600 text-white text-[11px] font-black px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
                                🔍 Gốc rễ ở đây!
                              </span>
                            </div>
                          </foreignObject>
                        )}
                      </g>
                    )}
                    {/* Mastery Progress Ring */}
                    {showMastery && (
                      <rect
                        x={node.posX - ringPad}
                        y={node.posY - ringPad}
                        width={ringW}
                        height={ringH}
                        rx={ringR}
                        ry={ringR}
                        fill="none"
                        stroke={ringColor}
                        strokeWidth={3.5}
                        strokeDasharray={`${ringFill} ${ringGap}`}
                        strokeDashoffset={0}
                        strokeLinecap="round"
                        style={{
                          filter: `drop-shadow(0 0 4px ${ringColor}40)`,
                          transition: "stroke-dasharray 0.6s ease, stroke 0.4s ease",
                        }}
                      />
                    )}
                    {/* Mastery ring background track */}
                    {showMastery && (
                      <rect
                        x={node.posX - ringPad}
                        y={node.posY - ringPad}
                        width={ringW}
                        height={ringH}
                        rx={ringR}
                        ry={ringR}
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth={1.5}
                        opacity={0.4}
                        style={{ pointerEvents: "none" }}
                      />
                    )}
                    <foreignObject
                      x={node.posX}
                      y={node.posY}
                      width={nodeWidth}
                      height={nodeHeight}
                      className="overflow-visible"
                      style={{ pointerEvents: "auto" }}
                    >
                      <div className="relative h-full w-full">
                        {/* Decorative "stack of cards" backing — signals more is folded into the summary */}
                        {isSummary && (
                          <>
                            <div
                              className="absolute inset-0 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-100"
                              style={{ transform: "translate(8px, 8px) rotate(1.4deg)" }}
                            />
                            <div
                              className="absolute inset-0 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50"
                              style={{ transform: "translate(4px, 4px) rotate(0.7deg)" }}
                            />
                          </>
                        )}
                        <div
                        onMouseDown={(e) => handleNodeDragStart(e, node.id, node.posX, node.posY)}
                        onClick={() => {
                          if (isSummary) {
                            setExpandedChainIds((prev) => new Set(prev).add(node.id));
                            setSelectedNodeId(null);
                            if (onClearFocus) onClearFocus();
                            return;
                          }
                          // Always select/highlight when clicked so it becomes opaque and readable
                          if (onFocusedNodeChange) {
                            onFocusedNodeChange(node.id);
                          }
                          setSelectedNodeId(node.id);

                          if (selectable) {
                            handleNodeClick(node);
                          } else if (mode !== "view-only") {
                            toast.warning(`Chủ đề "${node.name}" đang bị khóa. Em hãy học và hoàn thành các bài học tiên quyết trước nhé!`);
                          }
                        }}
                        className={`h-full w-full rounded-2xl border-2 p-3 flex flex-col justify-between items-start shadow-sm select-none transition-all duration-200 relative ${colorClass} ${
                          isActiveNode
                            ? "ring-[3px] ring-[var(--purple)] border-[var(--purple)] shadow-lg shadow-[var(--purple)]/20 z-10"
                            : isHighlighted
                              ? "ring-1 ring-[var(--purple)]/40 border-[var(--purple)]/40"
                              : ""
                        }`}
                      >
                        {/* Top Metadata Row: Status label */}
                        <div className="w-full flex justify-between items-center border-b border-slate-100/60 pb-1">
                          <div className="flex items-center gap-1">
                            {node.isRoot ? (
                              <Compass size={11} className="text-[var(--mint)] animate-spin-slow" />
                            ) : status === "mastered" ? (
                              <CheckCircle2 size={11} className="text-emerald-500" />
                            ) : status === "struggle" ? (
                              <AlertCircle size={11} className="text-rose-500 animate-pulse" />
                            ) : status === "learning" ? (
                              <PlayCircle size={11} className="text-orange-500 animate-pulse" />
                            ) : status === "initial" ? (
                              <Compass size={11} className="text-blue-500" />
                            ) : (
                              <Lock size={11} className="text-slate-400" />
                            )}
                            <span className="text-[8px] font-black uppercase tracking-wider">
                              {node.isRoot ? "ĐIỂM GỐC" : isSummary ? "TÓM TẮT" : {
                                mastered: "ĐÃ XONG",
                                struggle: "CẦN LƯU Ý",
                                learning: "ĐANG HỌC",
                                initial: "ĐẦU VÀO",
                                locked: "ĐANG KHÓA"
                              }[status]}
                            </span>
                          </div>
                          {isSummary ? (
                            summaryChain?.avgAccuracy !== null && summaryChain?.avgAccuracy !== undefined && (
                              <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full border tabular-nums leading-none shrink-0 bg-emerald-50 text-emerald-700 border-emerald-300/60">
                                TB {summaryChain.avgAccuracy}%
                              </span>
                            )
                          ) : showMastery && (
                            <span
                              className="text-[8px] font-black px-1.5 py-0.5 rounded-full border tabular-nums leading-none shrink-0"
                              style={{
                                backgroundColor: !bktState || bktState.masteryStatus === "unknown" ? "#f1f5f9" : displayedMasteryPercent >= 80 ? "#ecfdf5" : displayedMasteryPercent >= 50 ? "#eff6ff" : "#fef2f2",
                                color: ringColor,
                                borderColor: ringColor + "40",
                              }}
                            >
                              BKT {displayedMasteryPercent}%
                            </span>
                          )}
                        </div>

                        {/* Title text */}
                        <div className="text-[10px] font-black w-full text-left leading-snug uppercase tracking-tight line-clamp-2 overflow-hidden text-ellipsis flex items-center pt-1.5">
                          {node.name}
                        </div>

                        {/* Metric line: accuracy for struggle/learning nodes, hint for the summary node */}
                        {(isSummary || ((status === "struggle" || status === "learning") && accuracyPct !== null)) && (
                          <div className="text-[8px] font-semibold w-full text-left leading-snug opacity-75">
                            {isSummary ? "Bấm để xem lại chi tiết" : `${accuracyPct}% đúng`}
                          </div>
                        )}

                        {/* Expand / Collapse Sub-tree trigger (hidden in focused view / summary nodes / view-only) */}
                        {hasChildren && !isFocusedView && !isSummary && mode !== "view-only" && (
                          <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setCollapsedNodes(prev => ({
                                ...prev,
                                [node.id]: !prev[node.id]
                              }));
                            }}
                            className="absolute -bottom-3 left-1/2 -translate-x-1/2 h-5 w-5 rounded-full border border-border bg-card hover:bg-muted active:scale-90 flex items-center justify-center shadow-sm text-foreground transition-all cursor-pointer z-30"
                            title={isCollapsed ? "Mở rộng nhánh kiến thức con" : "Thu gọn nhánh kiến thức con"}
                          >
                            {isCollapsed ? (
                              <PlusCircle size={12} className="text-[var(--mint)]" />
                            ) : (
                              <MinusCircle size={12} className="text-muted-foreground" />
                            )}
                          </button>
                        )}

                        {mode === "teacher" && !isFocusedView && (
                          <div className="absolute -top-4 left-1/2 -translate-x-1/2 hidden group-hover/node:flex items-center bg-card border border-border rounded-full px-1.5 py-0.5 shadow-md gap-1.5 z-30">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddChildNode(node);
                              }}
                              className="h-5 w-5 rounded-full text-[var(--mint)] hover:bg-muted flex items-center justify-center transition-colors cursor-pointer"
                              title="Thêm nút con tiên quyết"
                            >
                              <Plus size={10} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartLinkFromNode(node.id);
                              }}
                              className="h-5 w-5 rounded-full text-orange-500 hover:bg-muted flex items-center justify-center transition-colors cursor-pointer"
                              title="Nối từ nút này"
                            >
                              <Link2 size={10} />
                            </button>
                            <span className="h-3 w-[1px] bg-border" />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteNode(node.id);
                              }}
                              className="h-5 w-5 rounded-full text-rose-500 hover:bg-muted flex items-center justify-center transition-colors cursor-pointer"
                              title="Xóa nút"
                            >
                              <Trash size={10} />
                            </button>
                          </div>
                        )}
                        </div>
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </g>
          </g>
        </svg>
      </div>

      {/* Tree Custom Node Modal (Add / Add Child Node) */}
      {treeModalState.open && (
        <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-card border border-border shadow-2xl rounded-3xl p-6 max-w-md w-full flex flex-col gap-4 animate-[scaleUp_0.2s_ease-out]">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="font-[var(--font-display)] font-extrabold text-foreground text-sm uppercase tracking-wide flex items-center gap-2">
                <PlusCircle size={16} className="text-[var(--mint)]" />
                <span>
                  {treeModalState.mode === "add_child"
                    ? `Thêm Nút Con Cho "${treeModalState.parentNode?.name}"`
                    : "Thêm Nút Kiến Thức Mới"}
                </span>
              </h3>
              <button
                onClick={() => setTreeModalState({ ...treeModalState, open: false })}
                className="h-7 w-7 rounded-full bg-muted hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (treeModalState.mode === "add_child" && treeModalState.parentNode) {
                  submitAddChildNode(treeModalState.parentNode, treeModalState.inputValue);
                } else {
                  submitAddNode(treeModalState.inputValue);
                }
                setTreeModalState({ ...treeModalState, open: false, inputValue: "" });
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                  Tên nút kiến thức
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={treeModalState.inputValue}
                  onChange={(e) => setTreeModalState({ ...treeModalState, inputValue: e.target.value })}
                  placeholder="Ví dụ: Phép nhân phân số, Định lý Pythagoras..."
                  className="w-full bg-muted border border-border rounded-2xl px-4 py-2.5 text-xs font-bold text-foreground focus:bg-card focus:outline-none focus:ring-1 focus:ring-[var(--mint)] transition-all"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setTreeModalState({ ...treeModalState, open: false })}
                  className="px-4 py-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--mint)] hover:brightness-95 text-foreground text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Check size={14} /> Xác nhận tạo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tree Confirmation Dialog */}
      {treeConfirmState.open && (
        <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-card border border-border shadow-2xl rounded-3xl p-6 max-w-md w-full flex flex-col gap-4 animate-[scaleUp_0.2s_ease-out]">
            <div className="flex items-start gap-3 border-b border-border pb-3">
              <div className="p-2 bg-rose-100 text-rose-600 rounded-2xl shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-foreground text-sm uppercase tracking-wide">
                  {treeConfirmState.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {treeConfirmState.message}
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setTreeConfirmState({ ...treeConfirmState, open: false })}
                className="px-4 py-2 border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  treeConfirmState.onConfirm();
                  setTreeConfirmState({ ...treeConfirmState, open: false });
                }}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 size={14} /> Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

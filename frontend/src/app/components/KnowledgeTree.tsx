"use client";

import { useState, useRef, useEffect, MouseEvent } from "react";
import { apiFetch } from "@/lib/api";
import { BKT_INITIAL_MASTERY, TopicMastery, masteryPercent as toMasteryPercent } from "@/lib/mastery";
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
  onShowContentClick?: (node: NodeItem) => void;
}

export default function KnowledgeTree({
  subject,
  nodes,
  edges,
  mode,
  studentNodeStatus = {},
  masteryByTopic = {},
  initialNodeId,
  currentNodeId,
  onNodeClick,
  onRefresh,
  focusedNodeId,
  onFocusedNodeChange,
  onShowContentClick,
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
  const handleResetZoom = () => {
    const container = containerRef.current;
    if (!container || localNodes.length === 0) {
      setPan({ x: 0, y: 0 });
      setScale(1);
      return;
    }

    const xs = localNodes.map(n => n.posX);
    const ys = localNodes.map(n => n.posY);
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

  // Auto-center on load
  useEffect(() => {
    if (nodes && nodes.length > 0 && containerRef.current) {
      const timer = setTimeout(() => {
        handleResetZoom();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [nodes]);

  // Auto-layout: matches backend algorithm (global topological levels, centered)
  const handleAutoLayout = async () => {
    const NODE_SPACING = 280.0;
    const LEFT_MARGIN = 100.0;
    const TOP_MARGIN = 80.0;
    const LEVEL_HEIGHT = 200.0;

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

    const srcStatus = studentNodeStatus[edge.sourceId] || "locked";
    const tgtStatus = studentNodeStatus[edge.targetId] || "locked";

    if (srcStatus === "mastered" && tgtStatus === "mastered") {
      return { stroke: "#10b981", strokeWidth: 4, isFlow: true };
    }
    if (srcStatus === "mastered" && (tgtStatus === "learning" || tgtStatus === "struggle")) {
      return { stroke: "#f97316", strokeWidth: 3.5, isFlow: true };
    }
    return { stroke: "#cbd5e1", strokeWidth: 2, strokeDasharray: "5, 5", isFlow: false };
  };

  const isNodeSelectable = (node: NodeItem) => {
    if (mode === "teacher" || mode === "view-only") return true;
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

    switch (status) {
      case "mastered":
        return "border-emerald-400/80 bg-gradient-to-br from-emerald-50 via-white to-emerald-100 text-emerald-950 shadow-md shadow-emerald-100/40 hover:shadow-emerald-200/50 font-bold";
      case "struggle":
        return "border-rose-400/80 bg-gradient-to-br from-rose-50 via-white to-rose-100 text-rose-950 shadow-md shadow-rose-100/40 hover:shadow-rose-200/50 font-bold animate-pulse";
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

  // --- DYNAMIC FOCUSED VIEW LAYOUT REARRANGEMENT ---
  let displayNodes = localNodes.filter(n => !isNodeHidden(n.id));
  let displayEdges = edges.filter(e => !isNodeHidden(e.sourceId) && !isNodeHidden(e.targetId));

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
      const nodeSpacing = 280;
      const totalWidth = nodeSpacing * count;
      const startX = 100;

      levelNodes.forEach((id, idx) => {
        let posX = startX;
        if (count === 1) {
          posX = startX + totalWidth / 2 - 100;
        } else {
          posX = startX + idx * nodeSpacing;
        }
        const posY = 80 + lvl * 180;
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

    const isHighlighted = highlightedEdges.has(edge.id);
    const opacity = isFocusedView ? (isHighlighted ? 1 : 0.45) : 1;

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
          stroke={isHighlighted ? "var(--color-secondary)" : style.stroke}
          strokeWidth={isHighlighted ? style.strokeWidth + 1.5 : style.strokeWidth}
          strokeDasharray={style.strokeDasharray}
          markerEnd={style.strokeDasharray ? "" : `url(#arrow-${isHighlighted ? "purple" : (style.stroke === "#10b981" ? "green" : style.stroke === "#f97316" ? "orange" : "gray")})`}
          className={style.isFlow || isHighlighted ? "animate-flow-line" : ""}
          style={{ strokeDashoffset: style.isFlow || isHighlighted ? 0 : undefined }}
        />

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
          <div className="flex bg-muted border border-border rounded-xl p-0.5 shadow-sm items-center">
            <button
              onClick={handleZoomIn}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-card hover:text-foreground active:scale-95 transition-all cursor-pointer"
              title="Phóng to"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={handleZoomOut}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-card hover:text-foreground active:scale-95 transition-all cursor-pointer"
              title="Thu nhỏ"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={handleResetZoom}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-card hover:text-foreground active:scale-95 transition-all cursor-pointer"
              title="Căn giữa"
            >
              <Move size={14} />
            </button>
            <button
              onClick={() => setShowGroups(!showGroups)}
              className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                showGroups
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
              title={showGroups ? "Ẩn nhóm chủ đề" : "Hiện nhóm chủ đề"}
            >
              <Layers size={14} />
            </button>
          </div>

          {mode === "teacher" && !isFocusedView && (
            <div className="flex bg-muted border border-border rounded-xl p-0.5 shadow-sm items-center">
              <button
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                title="Hoàn tác (Ctrl+Z)"
                className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                  historyIndex > 0
                    ? "hover:bg-card text-foreground"
                    : "text-muted-foreground/30 cursor-not-allowed"
                }`}
              >
                <Undo size={14} />
              </button>
              <button
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                title="Làm lại (Ctrl+Y)"
                className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                  historyIndex < history.length - 1
                    ? "hover:bg-card text-foreground"
                    : "text-muted-foreground/30 cursor-not-allowed"
                }`}
              >
                <Redo size={14} />
              </button>
            </div>
          )}

          {!isFocusedView && (
            <div className="flex items-center gap-1.5 ml-2">
              <button
                onClick={handleAutoLayout}
                className="h-8 px-3 rounded-xl border border-border bg-card text-foreground hover:bg-muted flex items-center gap-1.5 text-xs font-bold shadow-sm hover:brightness-95 active:scale-95 transition-all cursor-pointer"
                title="Tự động sắp xếp cây theo cấu trúc"
              >
                <LayoutGrid size={13} /> Sắp xếp
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Overall vs Focused Map Selectors */}
        {activeSelectedNodeId && (
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
                const selectable = isNodeSelectable(node);
                const isHighlighted = highlightedNodes.has(node.id);
                const isActiveNode = node.id === activeSelectedNodeId;
                const colorClass = getNodeColorClass(node, isHighlighted || isActiveNode);
                const nodeWidth = 230;
                const nodeHeight = 85;

                const opacity = isFocusedView ? (isHighlighted ? 1 : 0.6) : 1;

                const isCollapsed = collapsedNodes[node.id];
                const childrenEdges = edges.filter(e => e.sourceId === node.id);
                const hasChildren = childrenEdges.length > 0;

                const status = studentNodeStatus[node.id] || "locked";

                // Mastery ring calculation
                const bktState = masteryByTopic[node.id];
                const displayedMasteryPercent = toMasteryPercent(
                  bktState?.masteryProbability ?? BKT_INITIAL_MASTERY,
                );
                const showMastery = mode !== "teacher";
                const ringPad = 6;
                const ringW = nodeWidth + ringPad * 2;
                const ringH = nodeHeight + ringPad * 2;
                const ringR = 18;
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

                return (
                  <g 
                    key={node.id} 
                    className="group/node"
                    style={{ opacity, transition: "opacity 0.2s" }}
                  >
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
                      <div
                        onMouseDown={(e) => handleNodeDragStart(e, node.id, node.posX, node.posY)}
                        onClick={() => {
                          // Always select/highlight when clicked so it becomes opaque and readable
                          if (onFocusedNodeChange) {
                            onFocusedNodeChange(node.id);
                          }
                          setSelectedNodeId(node.id);

                          if (selectable) {
                            handleNodeClick(node);
                          } else {
                            toast.warning(`Chủ đề "${node.name}" đang bị khóa. Em hãy học và hoàn thành các bài học tiên quyết trước nhé!`);
                          }
                        }}
                        className={`h-full w-full rounded-2xl border-2 p-3 flex flex-col justify-between items-start shadow-sm select-none transition-all duration-200 relative ${colorClass} ${
                          selectable ? "cursor-pointer hover:shadow-md hover:scale-[1.03]" : "cursor-pointer hover:shadow-md hover:scale-[1.01]"
                        } ${isActiveNode
                            ? "ring-[3px] ring-[var(--purple)] border-[var(--purple)] scale-[1.06] shadow-lg shadow-[var(--purple)]/20 z-10"
                            : isHighlighted
                              ? "ring-1 ring-[var(--purple)]/40 border-[var(--purple)]/40 scale-[1.01]"
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
                              {node.isRoot ? "ĐIỂM GỐC" : {
                                mastered: "ĐÃ XONG",
                                struggle: "CẦN LƯU Ý",
                                learning: "ĐANG HỌC",
                                initial: "ĐẦU VÀO",
                                locked: "ĐANG KHÓA"
                              }[status]}
                            </span>
                          </div>
                          {showMastery && (
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
                        <div className="text-[10px] font-black w-full text-left leading-snug uppercase tracking-tight line-clamp-2 overflow-hidden text-ellipsis flex-1 flex items-center pt-1.5">
                          {node.name}
                        </div>

                        {/* Expand / Collapse Sub-tree trigger (hidden in focused view) */}
                        {hasChildren && !isFocusedView && (
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

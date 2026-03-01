import { useQuery } from '@tanstack/react-query';
import { getScanGraph } from '../../api/results';
import { useRef, useState, useCallback, useMemo, useEffect, useLayoutEffect, lazy, Suspense } from 'react';
import ForceGraph2D, { type ForceGraphMethods as ForceGraph2DMethods } from 'react-force-graph-2d';
import type { ForceGraphMethods as ForceGraph3DMethods } from 'react-force-graph-3d';

// Lazy-load 3D graph (Three.js is ~1MB) — only loaded when user toggles to 3D mode
const ForceGraph3D = lazy(() => import('react-force-graph-3d'));

interface GraphViewProps {
  scanId: string;
}

interface BackendNode {
  id: string;
  label: string;
  x: number;
  y: number;
  size: string;
  color: string;
}

interface BackendEdge {
  id: string;
  source: string;
  target: string;
}

interface GraphNode {
  id: string;
  name: string;
  val: number;
  color: string;
  isRoot: boolean;
  nodeType: string;
}

interface GraphLink {
  source: string;
  target: string;
}

const LEGEND_TYPES = [
  { key: 'Root',       color: '#ef4444' },
  { key: 'IP Address', color: '#f59e0b' },
  { key: 'Domain',     color: '#06b6d4' },
  { key: 'Email',      color: '#8b5cf6' },
  { key: 'URL',        color: '#10b981' },
  { key: 'ASN',        color: '#ec4899' },
  { key: 'Other',      color: '#6b7280' },
] as const;

// Heuristic to detect the type of an OSINT entity from its label
function detectNodeColor(label: string, isRoot: boolean): string {
  if (isRoot) return '#ef4444'; // red
  const l = label.toLowerCase();
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(l)) return '#f59e0b'; // orange - IP
  if (/^[a-f0-9:]{6,}$/.test(l)) return '#f59e0b'; // orange - IPv6
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(l)) return '#06b6d4'; // cyan - domain
  if (/@/.test(l)) return '#8b5cf6'; // purple - email
  if (/^https?:\/\//.test(l)) return '#10b981'; // green - URL
  if (/^AS\d+/i.test(l)) return '#ec4899'; // pink - ASN
  return '#6b7280'; // gray - other
}

function detectNodeType(label: string, isRoot: boolean): string {
  if (isRoot) return 'Root';
  const l = label.toLowerCase();
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(l)) return 'IP Address';
  if (/^[a-f0-9:]{6,}$/.test(l)) return 'IP Address';
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(l)) return 'Domain';
  if (/@/.test(l)) return 'Email';
  if (/^https?:\/\//.test(l)) return 'URL';
  if (/^AS\d+/i.test(l)) return 'ASN';
  return 'Other';
}

export default function GraphView({ scanId }: GraphViewProps) {
  const graph2DRef = useRef<ForceGraph2DMethods>(undefined);
  const graph3DRef = useRef<ForceGraph3DMethods>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set());
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const [containerWidth, setContainerWidth] = useState(0);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  const { data: backendData, isLoading } = useQuery({
    queryKey: ['scanGraph', scanId],
    queryFn: async () => {
      const { data } = await getScanGraph(scanId);
      return data as { nodes: BackendNode[]; edges: BackendEdge[] };
    },
  });

  // useLayoutEffect fires synchronously after React commits the DOM but before
  // the browser paints, so clientWidth is always the real layout value.
  // Depends on backendData: during the isLoading early-return the containerRef
  // div hasn't mounted yet, so we re-run once data arrives and the div exists.
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    setContainerWidth(containerRef.current.clientWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w > 0) setContainerWidth(w);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [backendData]);

  // Build adjacency for neighbor highlighting
  const adjacency = useMemo(() => {
    if (!backendData?.edges) return new Map<string, Set<string>>();
    const adj = new Map<string, Set<string>>();
    for (const edge of backendData.edges) {
      if (!adj.has(edge.source)) adj.set(edge.source, new Set());
      if (!adj.has(edge.target)) adj.set(edge.target, new Set());
      adj.get(edge.source)!.add(edge.target);
      adj.get(edge.target)!.add(edge.source);
    }
    return adj;
  }, [backendData]);

  // Transform backend data to react-force-graph format
  const graphData = useMemo(() => {
    if (!backendData) return { nodes: [], links: [] };

    const nodeIds = new Set(backendData.nodes.map((n) => n.id));

    const nodes: GraphNode[] = backendData.nodes.map((n) => {
      const isRoot = n.color === '#f00';
      const neighbors = adjacency.get(n.id)?.size || 0;
      return {
        id: n.id,
        name: n.label,
        val: isRoot ? 10 : Math.max(1, Math.min(8, neighbors)),
        color: detectNodeColor(n.label, isRoot),
        isRoot,
        nodeType: detectNodeType(n.label, isRoot),
      };
    });

    // Deduplicate and filter orphan edges
    const seenLinks = new Set<string>();
    const links: GraphLink[] = [];
    for (const edge of backendData.edges) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
      const key = `${edge.source}-${edge.target}`;
      const keyRev = `${edge.target}-${edge.source}`;
      if (seenLinks.has(key) || seenLinks.has(keyRev)) continue;
      seenLinks.add(key);
      links.push({ source: edge.source, target: edge.target });
    }

    return { nodes, links };
  }, [backendData, adjacency]);

  // Per-type node counts (for legend badges)
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of graphData.nodes) {
      counts.set(n.nodeType, (counts.get(n.nodeType) || 0) + 1);
    }
    return counts;
  }, [graphData.nodes]);

  // Filtered dataset — excludes hidden node types and their edges
  const filteredGraphData = useMemo(() => {
    if (hiddenTypes.size === 0) return graphData;
    const visibleIds = new Set(
      graphData.nodes.filter((n) => !hiddenTypes.has(n.nodeType)).map((n) => n.id),
    );
    return {
      nodes: graphData.nodes.filter((n) => visibleIds.has(n.id)),
      links: graphData.links.filter((l) => {
        const srcId = typeof l.source === 'object' ? (l.source as any).id : l.source;
        const tgtId = typeof l.target === 'object' ? (l.target as any).id : l.target;
        return visibleIds.has(srcId) && visibleIds.has(tgtId);
      }),
    };
  }, [graphData, hiddenTypes]);

  // Clear selected node if its type is hidden
  useEffect(() => {
    if (selectedNode && hiddenTypes.has(selectedNode.nodeType)) {
      setSelectedNode(null);
    }
  }, [hiddenTypes, selectedNode]);

  function toggleType(key: string) {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const handleNodeHover = useCallback(
    (node: any) => {
      const nodeId = node?.id as string | undefined;
      setHoverNode(nodeId || null);

      if (!nodeId) {
        setHighlightNodes(new Set());
        setHighlightLinks(new Set());
        return;
      }

      const neighbors = adjacency.get(nodeId) || new Set<string>();
      const hn = new Set<string>([nodeId, ...neighbors]);
      setHighlightNodes(hn);

      const hl = new Set<string>();
      for (const nid of neighbors) {
        hl.add(`${nodeId}-${nid}`);
        hl.add(`${nid}-${nodeId}`);
      }
      setHighlightLinks(hl);
    },
    [adjacency],
  );

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node as GraphNode);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleZoomToFit = useCallback(() => {
    if (mode === '2d') {
      graph2DRef.current?.zoomToFit(400, 40);
    } else {
      graph3DRef.current?.zoomToFit(400, 40);
    }
  }, [mode]);

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode & { x: number; y: number };
      const label = n.name;
      const radius = Math.sqrt(n.val) * 2;
      const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(n.id);
      const alpha = isHighlighted ? 1 : 0.15;

      // Node circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = n.color;
      ctx.globalAlpha = alpha;
      ctx.fill();

      // Border for root nodes
      if (n.isRoot) {
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      // Label (only for root nodes, hovered node, or when zoomed in enough)
      if (n.isRoot || n.id === hoverNode || globalScale > 2) {
        const fontSize = Math.max(10 / globalScale, 1.5);
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = n.color;
        ctx.globalAlpha = alpha;
        const displayLabel = label.length > 30 ? label.slice(0, 30) + '...' : label;
        ctx.fillText(displayLabel, n.x, n.y + radius + 1);
      }

      ctx.globalAlpha = 1;
    },
    [highlightNodes, hoverNode],
  );

  const nodePointerAreaPaint = useCallback(
    (node: any, color: string, ctx: CanvasRenderingContext2D) => {
      const n = node as GraphNode & { x: number; y: number };
      const radius = Math.sqrt(n.val) * 2 + 2; // slightly larger for easier clicking
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    [],
  );

  const linkColor = useCallback(
    (link: any) => {
      if (highlightNodes.size === 0) return 'rgba(156,163,175,0.3)';
      const key = `${typeof link.source === 'object' ? link.source.id : link.source}-${typeof link.target === 'object' ? link.target.id : link.target}`;
      return highlightLinks.has(key) ? 'rgba(156,163,175,0.8)' : 'rgba(156,163,175,0.05)';
    },
    [highlightNodes, highlightLinks],
  );

  const linkWidth = useCallback(
    (link: any) => {
      if (highlightNodes.size === 0) return 0.5;
      const key = `${typeof link.source === 'object' ? link.source.id : link.source}-${typeof link.target === 'object' ? link.target.id : link.target}`;
      return highlightLinks.has(key) ? 1.5 : 0.3;
    },
    [highlightNodes, highlightLinks],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-[var(--sf-primary)] border-t-transparent" />
      </div>
    );
  }

  if (!backendData || !backendData.nodes || backendData.nodes.length === 0) {
    return <p className="text-[var(--sf-text-muted)]">No graph data available yet.</p>;
  }

  const isFiltering = hiddenTypes.size > 0;

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-3 flex items-center gap-3">
        <span className="text-xs text-[var(--sf-text-muted)]">
          {isFiltering
            ? `${filteredGraphData.nodes.length} / ${graphData.nodes.length} nodes`
            : `${graphData.nodes.length} nodes`}
        </span>
        <span className="text-xs text-[var(--sf-text-muted)]">
          {isFiltering
            ? `${filteredGraphData.links.length} / ${graphData.links.length} edges`
            : `${graphData.links.length} edges`}
        </span>

        <div className="ml-auto flex gap-2">
          {/* 2D/3D toggle */}
          <div className="flex overflow-hidden rounded-md border border-[var(--sf-border)]">
            <button
              onClick={() => setMode('2d')}
              className={`px-3 py-1.5 text-xs font-medium ${
                mode === '2d'
                  ? 'bg-[var(--sf-primary)] text-white'
                  : 'bg-[var(--sf-bg)] text-[var(--sf-text)] hover:bg-[var(--sf-bg-secondary)]'
              }`}
            >
              2D
            </button>
            <button
              onClick={() => setMode('3d')}
              className={`px-3 py-1.5 text-xs font-medium ${
                mode === '3d'
                  ? 'bg-[var(--sf-primary)] text-white'
                  : 'bg-[var(--sf-bg)] text-[var(--sf-text)] hover:bg-[var(--sf-bg-secondary)]'
              }`}
            >
              3D
            </button>
          </div>

          <button
            onClick={handleZoomToFit}
            className="rounded-md border border-[var(--sf-border)] bg-[var(--sf-bg)] px-3 py-1.5 text-xs font-medium text-[var(--sf-text)] hover:bg-[var(--sf-bg-secondary)]"
          >
            Zoom to Fit
          </button>
        </div>
      </div>

      {/* Legend — each item is a clickable filter toggle */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        {LEGEND_TYPES.map(({ key, color }) => {
          const count = typeCounts.get(key) || 0;
          if (count === 0) return null;
          const hidden = hiddenTypes.has(key);
          return (
            <button
              key={key}
              onClick={() => toggleType(key)}
              title={hidden ? `Show ${key} nodes` : `Hide ${key} nodes`}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 transition-all ${
                hidden
                  ? 'border-[var(--sf-border)] opacity-40'
                  : 'border-[var(--sf-border)] hover:bg-[var(--sf-bg-secondary)]'
              }`}
            >
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: hidden ? '#9ca3af' : color }}
              />
              <span className={`text-[var(--sf-text)] ${hidden ? 'line-through' : ''}`}>{key}</span>
              <span className="text-[var(--sf-text-muted)]">({count})</span>
            </button>
          );
        })}
        {isFiltering && (
          <button
            onClick={() => setHiddenTypes(new Set())}
            className="ml-1 text-xs text-[var(--sf-primary)] underline-offset-2 hover:underline"
          >
            Show all
          </button>
        )}
      </div>

      {/* Graph container — ref here so canvas width matches exactly */}
      <div ref={containerRef} className="overflow-hidden rounded-lg border border-[var(--sf-border)]" style={{ height: 600 }}>
        {containerWidth === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-[var(--sf-primary)] border-t-transparent" />
          </div>
        ) : mode === '2d' ? (
          <ForceGraph2D
            ref={graph2DRef}
            graphData={filteredGraphData}
            width={containerWidth}
            height={600}
            backgroundColor="transparent"
            nodeCanvasObject={nodeCanvasObject}
            nodePointerAreaPaint={nodePointerAreaPaint}
            linkColor={linkColor}
            linkWidth={linkWidth}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onBackgroundClick={handleBackgroundClick}
            enableNodeDrag={true}
            cooldownTicks={200}
            warmupTicks={100}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            nodeLabel=""
          />
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-[var(--sf-primary)] border-t-transparent" />
                <span className="ml-2 text-sm text-[var(--sf-text-muted)]">Loading 3D engine...</span>
              </div>
            }
          >
            <ForceGraph3D
              ref={graph3DRef}
              graphData={filteredGraphData}
              width={containerWidth}
              height={600}
              backgroundColor="rgba(0,0,0,0)"
              nodeColor={(node: any) => (node as GraphNode).color}
              nodeVal={(node: any) => (node as GraphNode).val}
              nodeLabel={(node: any) => (node as GraphNode).name}
              linkColor={() => 'rgba(156,163,175,0.3)'}
              linkWidth={0.5}
              onNodeClick={handleNodeClick}
              onBackgroundClick={handleBackgroundClick}
              enableNodeDrag={true}
              cooldownTicks={200}
              warmupTicks={100}
            />
          </Suspense>
        )}
      </div>

      {/* Selected node info */}
      {selectedNode && (
        <div className="mt-3 rounded-lg border border-[var(--sf-border)] p-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: selectedNode.color }}
            />
            <h4 className="text-sm font-medium">Selected Node</h4>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div>
              <span className="text-[var(--sf-text-muted)]">Label:</span>{' '}
              <span className="font-mono">{selectedNode.name}</span>
            </div>
            <div>
              <span className="text-[var(--sf-text-muted)]">Type:</span>{' '}
              {selectedNode.nodeType}
            </div>
            <div>
              <span className="text-[var(--sf-text-muted)]">Connections:</span>{' '}
              {adjacency.get(selectedNode.id)?.size || 0}
            </div>
            {selectedNode.isRoot && (
              <span className="inline-block rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                Root Entity
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

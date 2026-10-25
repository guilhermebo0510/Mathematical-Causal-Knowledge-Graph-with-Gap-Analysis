import { useI18n } from "./i18n";
import { useRef, type PointerEvent } from "react";
export interface MapSnapshot {
  nodes: { id: string; x: number; y: number; kind: string; flagged: boolean }[];
  edges: { source: string; target: string }[];
  bounds: { x1: number; y1: number; w: number; h: number };
  extent: { x1: number; y1: number; w: number; h: number };
}
export function GraphNavigator({
  snapshot,
  onMove,
  selected,
  onSelect,
}: {
  snapshot: MapSnapshot;
  onMove: (x: number, y: number) => void;
  selected?: string | null;
  onSelect?: (id: string) => void;
}) {
  const { t, language, locale, number: formatNumber, date: formatDate } = useI18n();
  const { bounds, extent, nodes, edges } = snapshot;
  const drag = useRef<{
    x: number;
    y: number;
    cx: number;
    cy: number;
    scale: number;
    left: number;
    top: number;
    w: number;
    h: number;
  } | null>(null);
  const scale = Math.min(
    244 / Math.max(bounds.w, 1),
    124 / Math.max(bounds.h, 1),
  );
  const offsetX = (260 - bounds.w * scale) / 2;
  const offsetY = (140 - bounds.h * scale) / 2;
  const x = (value: number) => (value - bounds.x1) * scale + offsetX;
  const y = (value: number) => (value - bounds.y1) * scale + offsetY;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  function navigate(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    onMove(
      (((event.clientX - rect.left) * 260) / rect.width - offsetX) / scale +
        bounds.x1,
      (((event.clientY - rect.top) * 140) / rect.height - offsetY) / scale +
        bounds.y1,
    );
  }
  return (
    <div className="navigator-map">
      <svg
        preserveAspectRatio="none"
        viewBox="0 0 260 140"
        role="img"
        tabIndex={0}
        onKeyDown={(event) => {
          const dx =
            event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          const dy =
            event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
          if (dx || dy) {
            event.preventDefault();
            onMove(
              extent.x1 + extent.w / 2 + (dx * extent.w) / 4,
              extent.y1 + extent.h / 2 + (dy * extent.h) / 4,
            );
          }
        }}
        aria-label={t("Navegador do grafo: clique ou arraste para mover a câmera")}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const camera =
            (event.target as SVGElement).dataset.testid === "map-camera";
          if (camera)
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              cx: extent.x1 + extent.w / 2,
              cy: extent.y1 + extent.h / 2,
              scale,
              left: rect.left,
              top: rect.top,
              w: rect.width,
              h: rect.height,
            };
          event.currentTarget.setPointerCapture(event.pointerId);
          if (!camera) navigate(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) {
            const d = drag.current;
            if (d)
              onMove(
                d.cx + ((event.clientX - d.x) * 260) / d.w / d.scale,
                d.cy + ((event.clientY - d.y) * 140) / d.h / d.scale,
              );
            else navigate(event);
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <rect
          data-testid="map-camera"
          x={x(extent.x1)}
          y={y(extent.y1)}
          width={extent.w * scale}
          height={extent.h * scale}
          className="map-camera"
        />
        {edges.map((edge, index) => {
          const a = byId.get(edge.source),
            b = byId.get(edge.target);
          return (
            a &&
            b && (
              <line
                key={index}
                x1={x(a.x)}
                y1={y(a.y)}
                x2={x(b.x)}
                y2={y(b.y)}
                className="map-edge"
              />
            )
          );
        })}
        {nodes.map((node) => (
          <rect
            key={node.id}
            x={x(node.x) - 5}
            y={y(node.y) - 3}
            width={10}
            height={6}
            rx={1}
            className={
              "map-node " +
              node.kind +
              (node.flagged ? " flagged" : "") +
              (node.id === selected ? " selected" : "")
            }
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect?.(node.id);
            }}
          >
            <title>
              {node.id}
              {node.flagged ? t(" · investigar") : ""}
            </title>
          </rect>
        ))}
      </svg>
      <div className="map-caption">
        <span>
          {nodes.length}{t(" nós · ")}{edges.length}{t(" relações")}</span>
        <span>{t("Arraste a câmera · Setas: navegar")}</span>
      </div>
    </div>
  );
}

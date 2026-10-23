import { useEffect, useRef } from "react";
import cytoscape, { type Core } from "cytoscape";
import type { Graph, Run } from "./types";

interface Props {
  graph: Graph;
  run: Run | null;
  selected: string | null;
  focus: "all" | "findings";
  onSelect: (id: string) => void;
  fitToken: number;
}

export function GraphView({
  graph,
  run,
  selected,
  focus,
  onSelect,
  fitToken,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<Core | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    if (!container.current) return;
    const failed = new Set(
      run?.checks
        .filter((c) => c.status === "failed")
        .flatMap((c) => c.node_ids),
    );
    const visible = new Set(
      focus === "findings" && failed.size
        ? failed
        : graph.nodes.map((n) => n.id),
    );
    if (focus === "findings") {
      for (let step = 0; step < 2; step++) {
        for (const edge of graph.edges) {
          if (visible.has(edge.source) || visible.has(edge.target)) {
            visible.add(edge.source);
            visible.add(edge.target);
          }
        }
      }
    }
    const cy = cytoscape({
      container: container.current,
      elements: [
        ...graph.nodes
          .filter((n) => visible.has(n.id))
          .map((n) => ({ data: { ...n, flagged: failed.has(n.id) ? 1 : 0 } })),
        ...graph.edges
          .filter((e) => visible.has(e.source) && visible.has(e.target))
          .map((e) => ({ data: e })),
      ],
      layout: {
        name: "breadthfirst",
        directed: true,
        padding: 34,
        spacingFactor: 1.15,
        avoidOverlap: true,
      },
      minZoom: 0.18,
      maxZoom: 2.5,
      wheelSensitivity: 0.18,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#e8eee9",
            "border-color": "#c0cec3",
            "border-width": 1.5,
            label: "data(label)",
            color: "#344e3f",
            "font-size": 11,
            "font-family": "Arial, sans-serif",
            "text-valign": "bottom",
            "text-margin-y": 9,
            "text-wrap": "wrap",
            "text-max-width": "115px",
            width: 27,
            height: 27,
            "overlay-opacity": 0,
          },
        },
        {
          selector: 'node[kind="equation"]',
          style: {
            shape: "round-rectangle",
            width: 150,
            height: 47,
            "background-color": "#edf4ee",
            "border-color": "#81a48b",
            "border-width": 1.5,
            "text-valign": "center",
            "text-margin-y": 0,
            "text-max-width": "135px",
            "font-weight": 600,
            color: "#254f39",
          },
        },
        {
          selector: 'node[kind="assumption"]',
          style: {
            shape: "diamond",
            "background-color": "#eee8f3",
            "border-color": "#b8a9c6",
          },
        },
        {
          selector: 'node[kind="requirement"]',
          style: {
            shape: "hexagon",
            "background-color": "#f1eada",
            "border-color": "#cdbb91",
          },
        },
        {
          selector: 'node[kind="observation"]',
          style: {
            shape: "round-rectangle",
            "background-color": "#e2edf3",
            "border-color": "#9db9cb",
            width: 38,
          },
        },
        {
          selector: "node[flagged=1]",
          style: {
            "border-color": "#c17d42",
            "border-width": 3,
            "background-color": "#fff0df",
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.3,
            "line-color": "#c2cfc6",
            "target-arrow-color": "#a4b9ab",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.7,
            "curve-style": "bezier",
            opacity: 0.8,
          },
        },
        {
          selector: ":selected",
          style: {
            "border-color": "#286b49",
            "border-width": 3,
            "background-color": "#cbe3d2",
          },
        },
      ],
    });
    instance.current = cy;
    cy.on("tap", "node", (event) => select.current(event.target.id()));
    const observer = new ResizeObserver(() => {
      cy.resize();
      cy.fit(undefined, 34);
    });
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      cy.destroy();
      instance.current = null;
    };
  }, [graph, run, focus]);

  useEffect(() => {
    const cy = instance.current;
    cy?.elements().unselect();
    if (selected) cy?.getElementById(selected).select();
  }, [selected, graph, run, focus]);

  useEffect(() => {
    instance.current?.fit(undefined, 34);
  }, [fitToken]);

  return (
    <div
      className="graph-canvas"
      ref={container}
      role="img"
      aria-label="Grafo interativo de equações, variáveis e evidências. Use a lista de elementos para navegar por teclado."
    />
  );
}

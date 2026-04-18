import { MarkerType, type Edge, type Node } from "@xyflow/react";
import {
  predicateToString,
  relationToString,
  type ColumnRef,
  type Predicate,
} from "./sqlParser";
import type { AlgebraNode } from "./sqlToAlgebra";

export interface OperatorGraphData {
  nodes: Node[];
  edges: Edge[];
}

const X_GAP = 220;
const Y_GAP = 140;

export function buildOperatorGraph(node: AlgebraNode): OperatorGraphData {
  const state = {
    nodes: [] as Node[],
    edges: [] as Edge[],
    nextId: 1,
  };

  placeNode(node, 0, 0, state);

  const minX = Math.min(...state.nodes.map((graphNode) => graphNode.position.x), 0);
  for (const graphNode of state.nodes) {
    graphNode.position.x = graphNode.position.x - minX + 40;
  }

  return {
    nodes: state.nodes,
    edges: state.edges,
  };
}

function measureWidth(node: AlgebraNode): number {
  switch (node.type) {
    case "table":
      return 1;
    case "selection":
    case "projection":
      return measureWidth(node.child);
    case "join":
      return measureWidth(node.left) + measureWidth(node.right);
  }
}

function placeNode(
  node: AlgebraNode,
  depth: number,
  xStart: number,
  state: { nodes: Node[]; edges: Edge[]; nextId: number },
): { id: string; center: number } {
  const id = `node-${state.nextId++}`;

  switch (node.type) {
    case "table": {
      const center = xStart + 0.5;
      state.nodes.push(createNode(id, labelTable(node.relation), "table", center, depth));
      return { id, center };
    }
    case "selection": {
      const child = placeNode(node.child, depth + 1, xStart, state);
      state.nodes.push(
        createNode(
          id,
          `σ ${labelPredicates(node.predicates)}`,
          "selection",
          child.center,
          depth,
        ),
      );
      state.edges.push(createEdge(child.id, id));
      return { id, center: child.center };
    }
    case "projection": {
      const child = placeNode(node.child, depth + 1, xStart, state);
      state.nodes.push(
        createNode(
          id,
          `π ${labelColumns(node.columns)}`,
          "projection",
          child.center,
          depth,
        ),
      );
      state.edges.push(createEdge(child.id, id));
      return { id, center: child.center };
    }
    case "join": {
      const leftWidth = measureWidth(node.left);
      const left = placeNode(node.left, depth + 1, xStart, state);
      const right = placeNode(node.right, depth + 1, xStart + leftWidth, state);
      const center = (left.center + right.center) / 2;

      state.nodes.push(
        createNode(id, `⋈ ${predicateToString(node.predicate)}`, "join", center, depth),
      );
      state.edges.push(createEdge(left.id, id));
      state.edges.push(createEdge(right.id, id));
      return { id, center };
    }
  }
}

function createNode(
  id: string,
  label: string,
  kind: "table" | "selection" | "projection" | "join",
  center: number,
  depth: number,
): Node {
  const styles: Record<typeof kind, React.CSSProperties> = {
    table: {
      background: "#f4efe1",
      border: "1px solid #ccbfa0",
      color: "#43311d",
    },
    selection: {
      background: "#e5f5ec",
      border: "1px solid #89c79f",
      color: "#194d2f",
    },
    projection: {
      background: "#ecedf9",
      border: "1px solid #96a0dc",
      color: "#1f2e6b",
    },
    join: {
      background: "#ffe9dc",
      border: "1px solid #e4a471",
      color: "#6b3510",
    },
  };

  return {
    id,
    data: { label },
    position: {
      x: center * X_GAP,
      y: depth * Y_GAP,
    },
    draggable: false,
    selectable: false,
    style: {
      ...styles[kind],
      width: 180,
      borderRadius: 18,
      padding: 12,
      fontSize: 13,
      fontWeight: 600,
      textAlign: "center",
      boxShadow: "0 14px 30px rgba(17, 24, 39, 0.08)",
    },
  };
}

function createEdge(source: string, target: string): Edge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    type: "smoothstep",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    style: {
      stroke: "#586174",
      strokeWidth: 1.4,
    },
  };
}

function labelTable(relation: { tableName: string; alias?: string }): string {
  return relationToString({
    id: relation.alias ?? relation.tableName,
    tableName: relation.tableName,
    alias: relation.alias,
  }).toUpperCase();
}

function labelPredicates(predicates: Predicate[]): string {
  return predicates.map(predicateToString).join(" AND ");
}

function labelColumns(columns: ColumnRef[] | "*"): string {
  return columns === "*" ? "*" : columns.map((column) => column.raw).join(", ");
}

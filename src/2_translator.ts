import type { QueryNode } from "./helpers/types";

export function stringifyGraph(node: QueryNode): string {
  switch (node.type) {
    case "PROJECTION":
      return `π ${node.params.columns.join(", ")} (${stringifyGraph(node.child)})`;

    case "SELECTION":
      return `σ ${node.params.condition} (${stringifyGraph(node.child)})`;

    case "JOIN":
      return `((${stringifyGraph(node.left)}) |X| ${node.params.on} (${stringifyGraph(node.right)}))`;

    case "TABLE":
      return node.params.name;

    default:
      return "";
  }
}

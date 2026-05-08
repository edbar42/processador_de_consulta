import type { QueryNode } from "./helpers/types";

export function stringifyGraph(node: QueryNode): string {
    switch (node.type) {
        case "PROJECTION":
            console.log("PROJECTION", node.params.columns.join(", "));
            return `π ${node.params.columns.join(", ")} (${stringifyGraph(node.child)})`;

        case "SELECTION":
            console.log("SELECTION", node.params.condition);
            return `σ ${node.params.condition} (${stringifyGraph(node.child)})`;

        case "JOIN":
            console.log("JOIN", node.params.on);
            return `((${stringifyGraph(node.left)}) |X| ${node.params.on} (${stringifyGraph(node.right)}))`;

        case "TABLE":
            return node.params.name;

        default:
            return "";
    }
}

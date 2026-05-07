import type { QueryNode } from "./helpers/types";

export default function optimize(root: QueryNode): QueryNode {
    console.log(
        "\x1b[33m%s\x1b[0m",
        `
        4_optimize
        `,
    );
    // Primeiro descemos as seleções
    let optimized = pushdownSelections(root);

    // Depois aplicamos as projeções
    // Passamos as colunas vazias; a coleta começa no nó PROJECTION raiz
    optimized = pushdownProjections(optimized, []);

    return optimized;
}

// Mantém o Sigma colado na Tabela
function pushdownSelections(node: QueryNode): QueryNode {
    if (node.type === "SELECTION") {
        const conditions = node.params.condition.split(" ∧ ");
        return findHomeForSelections(node.child, conditions);
    }

    if (node.type === "PROJECTION") {
        return { ...node, child: pushdownSelections(node.child) };
    }

    if (node.type === "JOIN") {
        return {
            ...node,
            left: pushdownSelections(node.left),
            right: pushdownSelections(node.right),
        };
    }
    return node;
}

// Redução de Campos
// Aplica a projeção o mais cedo possível, cercando tabelas e seleções
// para garantir que apenas colunas essenciais participem dos JOINS e
function pushdownProjections(
    node: QueryNode,
    requiredCols: string[],
): QueryNode {
    if (node.type === "PROJECTION") {
        return {
            ...node,
            child: pushdownProjections(node.child, node.params.columns),
        };
    }

    if (node.type === "JOIN") {
        const colsInJoin = extractColumns(node.params.on);
        const allNeeded = [...requiredCols, ...colsInJoin];
        return {
            ...node,
            left: pushdownProjections(node.left, allNeeded),
            right: pushdownProjections(node.right, allNeeded),
        };
    }

    if (node.type === "SELECTION" || node.type === "TABLE") {
        const tableName = getTableName(node);
        if (!tableName) return node;

        const myCols = requiredCols
            .filter((c) =>
                c.toLowerCase().startsWith(tableName.toLowerCase() + "."),
            )
            .map((c) => c.split(".")[1]);

        const uniqueCols = Array.from(new Set(myCols));

        if (uniqueCols.length === 0) return node;

        // Injeta a Projeção por FORA do nó atual (seja ele Selection ou Table)
        return {
            type: "PROJECTION",
            params: { columns: uniqueCols },
            child: node,
        };
    }

    return node;
}

// --- AUXILIARES AJUSTADOS ---

function findHomeForSelections(
    node: QueryNode,
    conditions: string[],
): QueryNode {
    if (node.type === "TABLE") {
        const tableName = node.params.name.toLowerCase();
        const relevant = conditions.filter((c) =>
            c.toLowerCase().startsWith(tableName + "."),
        );

        if (relevant.length === 0) return node;

        return {
            type: "SELECTION",
            params: { condition: relevant.join(" ∧ ") },
            child: node,
        };
    }

    if (node.type === "JOIN") {
        return {
            ...node,
            left: findHomeForSelections(node.left, conditions),
            right: findHomeForSelections(node.right, conditions),
        };
    }

    return node;
}

function getTableName(node: QueryNode): string | null {
    if (node.type === "TABLE") return node.params.name;
    if (node.type === "SELECTION") return getTableName(node.child);
    return null;
}

function extractColumns(text: string): string[] {
    const matches = text.match(/[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+/g);
    return matches ? matches : [];
}

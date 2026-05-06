import type { QueryNode } from "./helpers/types";

export default function optimize(root: QueryNode): QueryNode {
  // 1. Primeiro descemos as seleções (Passo 2)
  let optimized = pushdownSelections(root);

  // 2. Depois aplicamos as projeções (Passo 3)
  // Passamos as colunas vazias; a coleta começa no nó PROJECTION raiz
  optimized = pushdownProjections(optimized, []);

  return optimized;
}

/**
 * Ajuste para o Passo 2: Mantém o Sigma colado na Tabela
 */
function pushdownSelections(node: QueryNode): QueryNode {
  if (node.type === "PROJECTION") {
    return { ...node, child: pushdownSelections(node.child) };
  }

  if (node.type === "SELECTION") {
    const conditions = node.params.condition.split(" ∧ ");
    return findHomeForSelections(node.child, conditions);
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

/**
 * Ajuste para o Passo 3: Envolve o Sigma com um Pi
 */
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

  // Se encontrar um SELECTION ou uma TABLE, é hora de aplicar o Pi "do professor"
  if (node.type === "SELECTION" || node.type === "TABLE") {
    const tableName = getTableName(node);
    if (!tableName) return node;

    // O segredo do professor: ele projeta apenas o que é exigido pela SAÍDA ou JOIN
    // Ele ignora a coluna usada no Sigma (como o 'id') na projeção final do ramo
    const myCols = requiredCols
      .filter((c) => c.toLowerCase().startsWith(tableName.toLowerCase() + "."))
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

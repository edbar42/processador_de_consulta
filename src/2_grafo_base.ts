import printGraph from "./helpers/teste";
import type { ParsedQuery, QueryNode } from "./helpers/types";

export function buildCanonicalGraph(query: ParsedQuery): QueryNode {
    // 1 - Começando com o FROM. Ele é a base da tabela
    let root: QueryNode = {
        type: "TABLE",
        params: { name: query.from },
    };

    console.log("\n\n\n\n\n\nNOVO GRAFO!!!!!!\n\n\n\n\n\n");

    console.log("\n\n-------- FROM \n\n");
    printGraph(root);

    // 2 - Os JOIN
    query.joins.forEach((join) => {
        root = {
            type: "JOIN",
            params: { on: join.on }, // Armazena o predicado de junção (ex: tb1.id = tb2.fk)
            left: root, // O acumulado de tabelas/joins anteriores
            right: {
                type: "TABLE", // A nova tabela que entra à direita da junção
                params: { name: join.table },
            },
        };
    });

    console.log("\n\n-------- JOINs \n\n");
    printGraph(root);

    // 3 - Os WHERE
    if (query.wheres && query.wheres.length > 0) {
        // Transforma o array de filtros em uma string única separada pelo operador lógico E (∧)
        const condition = query.wheres
            .map((w) => `${w.left} ${w.operator} ${w.right}`)
            .join(" ∧ ");

        root = {
            type: "SELECTION",
            params: { condition },
            child: root, // O 'filho' é o topo da pilha de Joins construída acima
        };
    }

    console.log("\n\n-------- WHEREs \n\n");
    printGraph(root);

    // 4 - O SELECT
    root = {
        type: "PROJECTION",
        params: { columns: query.select },
        child: root,
    };

    console.log("\n\n-------- SELECT \n\n");
    printGraph(root);

    return root;
}

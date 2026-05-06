import type { ParsedQuery, QueryNode } from "./helpers/types";

export function buildCanonicalGraph(query: ParsedQuery): QueryNode {
    // Começando com o FROM. Ele é a base da tabela
    let root: QueryNode = {
        type: "TABLE",
        params: { name: query.from },
    };

    // --- FASE 2: JUNÇÕES (NÓS BINÁRIOS) ---
    // Para cada JOIN no SQL, criamos um nó de Junção |X|
    // A estrutura é recursiva à esquerda: o nó JOIN atual torna-se o 'filho esquerdo'
    // do próximo JOIN, empilhando as tabelas conforme a ordem de declaração.
    query.joins.forEach((join) => {
        root = {
            type: "JOIN",
            params: { on: join.on }, // Armazena o predicado de junção (ex: tb1.id = tb2.fk)
            left: root, // O acumulado de tabelas/joins anteriores
            right: {
                // A nova tabela que entra à direita da junção
                type: "TABLE",
                params: { name: join.table },
            },
        };
    });

    // --- FASE 3: SELEÇÃO GLOBAL (NÓ UNÁRIO) ---
    // No Passo 1 (Canônico), os filtros do WHERE não são distribuídos.
    // Eles são aplicados como uma Seleção (σ) única sobre o resultado final de todos os JOINS.
    // Isso é o que torna o Passo 1 ineficiente (processa muitas tuplas desnecessárias).
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

    // --- FASE 4: PROJEÇÃO (A RAIZ DA ÁRVORE) ---
    // A última operação é a Projeção (π), definida pelas colunas no SELECT.
    // Na árvore de operadores, a raiz é a última operação a ser executada cronologicamente,
    // mas a primeira na hierarquia visual do grafo[cite: 4].
    root = {
        type: "PROJECTION",
        params: { columns: query.select },
        child: root, // O 'filho' é o nó de Seleção (ou de Join, se não houver WHERE)
    };

    // Retorna a AST (Árvore de Sintaxe Abstrata) completa para ser usada no tradutor ou otimizador
    return root;
}

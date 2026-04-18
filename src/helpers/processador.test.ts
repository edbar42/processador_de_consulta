import { describe, expect, it } from "vitest";
import { buildExecutionPlan } from "./executionPlan";
import { optimizeAlgebra } from "./optimizer";
import { schemaMetadata } from "./schemas";
import { parseSqlQuery, type ParsedQuery } from "./sqlParser";
import { algebraToString, queryToAlgebra, type AlgebraNode } from "./sqlToAlgebra";
import validarConsulta from "./validador_query";

function assertUnaryNode(
  node: AlgebraNode,
  type: "projection" | "selection",
): Extract<AlgebraNode, { type: "projection" | "selection" }> {
  expect(node.type).toBe(type);
  if (node.type !== type) {
    throw new Error(`Expected ${type} node`);
  }

  return node;
}

function assertJoinNode(node: AlgebraNode): Extract<AlgebraNode, { type: "join" }> {
  expect(node.type).toBe("join");
  if (node.type !== "join") {
    throw new Error("Expected join node");
  }

  return node;
}

function findTableBranch(node: AlgebraNode, tableName: string): AlgebraNode | null {
  switch (node.type) {
    case "table":
      return node.relation.tableName === tableName ? node : null;
    case "selection":
    case "projection":
      return findTableBranch(node.child, tableName);
    case "join":
      return findTableBranch(node.left, tableName) ?? findTableBranch(node.right, tableName);
  }
}

describe("parseSqlQuery e validarConsulta", () => {
  it("aceita um select simples", () => {
    const parsed = parseSqlQuery(
      "SELECT Nome FROM Cliente WHERE idCliente = 1",
      schemaMetadata,
    );

    expect(parsed.select).not.toBe("*");
    if (parsed.select === "*") {
      throw new Error("projection should not be wildcard");
    }

    expect(parsed.from.tableName).toBe("cliente");
    expect(parsed.select[0].relationId).toBe("cliente");
    expect(parsed.where).toHaveLength(1);
  });

  it("aceita alias e múltiplos joins", () => {
    const parsed = parseSqlQuery(
      "SELECT c.Nome, p.DataPedido FROM Cliente c JOIN Pedido p ON c.idCliente = p.Cliente_idCliente JOIN Status s ON p.Status_idStatus = s.idStatus WHERE p.ValorTotalPedido > 100 AND s.idStatus = 1",
      schemaMetadata,
    );

    expect(parsed.from.id).toBe("c");
    expect(parsed.joins).toHaveLength(2);
    expect(parsed.where).toHaveLength(2);
    expect(parsed.joins[1].predicate.relationIds).toEqual(["p", "s"]);
  });

  it("rejeita tabela desconhecida", () => {
    expect(validarConsulta("SELECT nome FROM Funcionario", schemaMetadata)).toEqual({
      valida: false,
      erro: "Tabela não encontrada: funcionario",
    });
  });

  it("rejeita atributo desconhecido", () => {
    expect(validarConsulta("SELECT cpf FROM Cliente", schemaMetadata)).toEqual({
      valida: false,
      erro: "Atributo não reconhecido: cpf",
    });
  });

  it("rejeita atributo ambíguo sem qualificador", () => {
    expect(
      validarConsulta(
        "SELECT descricao FROM Produto JOIN Categoria ON Produto.Categoria_idCategoria = Categoria.idCategoria",
        schemaMetadata,
      ),
    ).toEqual({
      valida: false,
      erro: "Atributo ambíguo: descricao",
    });
  });

  it("rejeita operador não suportado", () => {
    expect(
      validarConsulta("SELECT Nome FROM Cliente WHERE idCliente != 1", schemaMetadata),
    ).toEqual({
      valida: false,
      erro: "Sintaxe SQL básica inválida ou comandos não suportados.",
    });
  });

  it("rejeita join desconectado", () => {
    expect(
      validarConsulta(
        "SELECT Cliente.Nome FROM Cliente JOIN Pedido ON Pedido.idPedido = Pedido.Status_idStatus",
        schemaMetadata,
      ),
    ).toEqual({
      valida: false,
      erro: "A junção com pedido deve ligar a nova tabela a uma relação já em uso.",
    });
  });
});

describe("álgebra relacional", () => {
  it("mantém projeção na raiz e joins na ordem original do SQL", () => {
    const parsed = parseSqlQuery(
      "SELECT Cliente.Nome, Status.Descricao FROM Cliente JOIN Pedido ON Cliente.idCliente = Pedido.Cliente_idCliente JOIN Status ON Pedido.Status_idStatus = Status.idStatus WHERE Pedido.ValorTotalPedido > 100",
      schemaMetadata,
    );
    const algebra = queryToAlgebra(parsed);

    const projection = assertUnaryNode(algebra, "projection");
    const selection = assertUnaryNode(projection.child, "selection");
    const selectionChild = assertJoinNode(selection.child);

    expect(selectionChild.right.type).toBe("table");
    if (selectionChild.right.type !== "table") {
      throw new Error("Expected right branch to be a table");
    }
    expect(selectionChild.right.relation.tableName).toBe("status");
    expect(selectionChild.left.type).toBe("join");
    expect(algebraToString(algebra)).toContain("⋈");
  });
});

describe("otimização e plano de execução", () => {
  it("empurra seleções para baixo, adiciona projeções antecipadas e reordena joins", () => {
    const parsed = parseSqlQuery(
      "SELECT Cliente.Nome FROM Cliente JOIN Pedido ON Cliente.idCliente = Pedido.Cliente_idCliente JOIN Status ON Pedido.Status_idStatus = Status.idStatus WHERE Status.idStatus = 1 AND Pedido.ValorTotalPedido > 100",
      schemaMetadata,
    );
    const raw = queryToAlgebra(parsed);
    const optimized = optimizeAlgebra(raw, parsed, schemaMetadata);
    const projection = assertUnaryNode(optimized, "projection");
    const rootJoin = assertJoinNode(projection.child);
    const statusBranch = findTableBranch(rootJoin, "status");

    expect(statusBranch).not.toBeNull();
    expect(statusBranch?.type).toBe("table");
    if (statusBranch?.type !== "table") {
      throw new Error("Expected status branch to end at a table node");
    }
    expect(rootJoin.left.type === "join" || rootJoin.right.type === "join").toBe(true);
    expect(statusBranch.relation.tableName).toBe("status");
    expect(algebraToString(optimized)).toContain("status.idstatus = 1");
    expect(algebraToString(optimized)).toContain("pedido.valortotalpedido > 100");
  });

  it("gera um plano de execução pós-ordem com resultados estáveis", () => {
    const parsed = parseSqlQuery(
      "SELECT Cliente.Nome FROM Cliente JOIN Pedido ON Cliente.idCliente = Pedido.Cliente_idCliente WHERE Pedido.ValorTotalPedido > 100",
      schemaMetadata,
    );
    const optimized = optimizeAlgebra(queryToAlgebra(parsed), parsed, schemaMetadata);
    const plan = buildExecutionPlan(optimized);

    expect(plan.map((step) => step.order)).toEqual(
      Array.from({ length: plan.length }, (_, index) => index + 1),
    );
    expect(plan[0].operation).toBe("Table Scan");
    expect(plan.at(-1)?.operation).toBe("Projection");
    expect(plan.map((step) => step.resultName)).toEqual(
      Array.from({ length: plan.length }, (_, index) => `R${index + 1}`),
    );
  });

  it("falha ao otimizar uma junção que exigiria produto cartesiano", () => {
    const parsed: ParsedQuery = {
      select: [
        {
          relationId: "cliente",
          columnName: "nome",
          raw: "cliente.nome",
        },
      ],
      from: { id: "cliente", tableName: "cliente" },
      joins: [
        {
          relation: { id: "pedido", tableName: "pedido" },
          predicate: {
            raw: "pedido.idpedido = 1",
            operator: "=",
            left: {
              relationId: "pedido",
              columnName: "idpedido",
              raw: "pedido.idpedido",
            },
            rightLiteral: 1,
            relationIds: ["pedido"],
          },
        },
      ],
      where: [],
    };

    expect(() =>
      optimizeAlgebra(queryToAlgebra(parsed), parsed, schemaMetadata),
    ).toThrow("Não foi possível otimizar a consulta sem criar produto cartesiano.");
  });
});

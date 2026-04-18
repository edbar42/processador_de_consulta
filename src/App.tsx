import { useState } from "react";
import "./App.css";
import OperatorGraph from "./components/OperatorGraph";
import { buildOperatorGraph, type OperatorGraphData } from "./helpers/operatorGraph";
import { parseSqlQuery } from "./helpers/sqlParser";
import { schemaMetadata } from "./helpers/schemas";
import { algebraToString, queryToAlgebra } from "./helpers/sqlToAlgebra";
import validarConsulta from "./helpers/validador_query";

interface ProcessResult {
  algebra: string;
  graph: OperatorGraphData;
}

function App() {
  const [query, setQuery] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);

  function handleProcessar() {
    setErro(null);
    setResult(null);

    if (!query.trim()) {
      setErro("Digite uma consulta SQL.");
      return;
    }

    const validacao = validarConsulta(query, schemaMetadata);
    if (!validacao.valida) {
      setErro(validacao.erro ?? "Consulta inválida.");
      return;
    }

    try {
      const parsed = parseSqlQuery(query, schemaMetadata);
      const algebraTree = queryToAlgebra(parsed);

      setResult({
        algebra: algebraToString(algebraTree),
        graph: buildOperatorGraph(algebraTree),
      });
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao processar a consulta.");
    }
  }

  return (
    <div className="app-shell">
      <div className="app-container">
        <header className="hero">
          <p className="eyebrow">Banco de Dados</p>
          <h1>Processador de Consultas</h1>
          <p className="hero-copy">
            Valide a consulta SQL, visualize a álgebra relacional, o grafo de
            operadores e o plano de execução otimizado.
          </p>
        </header>

        <section className="panel input-panel">
          <label htmlFor="sql-input">Consulta SQL</label>
          <textarea
            id="sql-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="SELECT Cliente.Nome, Pedido.DataPedido FROM Cliente JOIN Pedido ON Cliente.idCliente = Pedido.Cliente_idCliente WHERE Pedido.ValorTotalPedido > 100"
            rows={5}
          />
          <button type="button" onClick={handleProcessar}>
            Processar
          </button>
        </section>

        {erro && (
          <section className="panel error-section">
            <h2>Erro</h2>
            <p className="error-msg">{erro}</p>
          </section>
        )}

        {result && (
          <>
            <section className="panel result-section">
              <h2>Álgebra Relacional</h2>
              <pre className="algebra-expr">{result.algebra}</pre>
            </section>

            <section className="panel graph-panel">
              <div className="section-header">
                <div>
                  <h2>Grafo de Operadores</h2>
                  <p className="section-copy">
                    A raiz representa a projeção final e as folhas representam as tabelas
                    usadas na consulta.
                  </p>
                </div>
              </div>

              <OperatorGraph nodes={result.graph.nodes} edges={result.graph.edges} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default App;

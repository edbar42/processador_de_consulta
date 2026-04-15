import { useState } from "react";
import "./App.css";
import validarConsulta from "./helpers/validador_query";
import { schemaMetadata } from "./helpers/schemas";
import { sqlToAlgebra, algebraToString } from "./helpers/sqlToAlgebra";
import type { AlgebraNode } from "./helpers/sqlToAlgebra";

function App() {
  const [query, setQuery] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [algebraExpr, setAlgebraExpr] = useState<string | null>(null);
  const [algebraTree, setAlgebraTree] = useState<AlgebraNode | null>(null);

  function handleProcessar() {
    setErro(null);
    setAlgebraExpr(null);
    setAlgebraTree(null);

    if (!query.trim()) {
      setErro("Digite uma consulta SQL.");
      return;
    }

    const resultado = validarConsulta(query, schemaMetadata);

    if (!resultado.valida) {
      setErro(resultado.erro ?? "Consulta inválida.");
      return;
    }

    try {
      const tree = sqlToAlgebra(query);
      setAlgebraTree(tree);
      setAlgebraExpr(algebraToString(tree));
    } catch (e) {
      setErro(`Erro ao converter: ${e instanceof Error ? e.message : e}`);
    }
  }

  return (
    <div className="app-container">
      <h1>Processador de Consultas</h1>

      <section className="input-section">
        <label htmlFor="sql-input">Consulta SQL:</label>
        <textarea
          id="sql-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ex: SELECT Nome, Preco FROM Produto WHERE Preco > 100"
          rows={4}
        />
        <button onClick={handleProcessar}>Processar</button>
      </section>

      {erro && (
        <section className="error-section">
          <p className="error-msg">{erro}</p>
        </section>
      )}

      {algebraExpr && (
        <section className="result-section">
          <h2>Álgebra Relacional</h2>
          <pre className="algebra-expr">{algebraExpr}</pre>
        </section>
      )}

      {algebraTree && (
        <section className="result-section" id="graph-placeholder">
          {/* Grafos serão adicionados na HU3 */}
        </section>
      )}
    </div>
  );
}

export default App;

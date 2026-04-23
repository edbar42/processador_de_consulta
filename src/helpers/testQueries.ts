type query = {
  label: string;
  query: string;
};

export const TestQueries: query[] = [
  {
    label: "Clientes com pedidos",
    query:
      "SELECT Cliente.Nome, Pedido.DataPedido FROM Cliente JOIN Pedido ON Cliente.idCliente = Pedido.Cliente_idCliente WHERE Pedido.ValorTotalPedido > 100",
  },
  {
    label: "Pedidos por status",
    query:
      "SELECT Cliente.Nome, Status.Descricao FROM Cliente JOIN Pedido ON Cliente.idCliente = Pedido.Cliente_idCliente JOIN Status ON Pedido.Status_idStatus = Status.idStatus WHERE Status.idStatus = 1 AND Pedido.ValorTotalPedido > 100",
  },
  {
    label: "Produtos e categorias",
    query:
      "SELECT Produto.Nome, Categoria.Descricao FROM Produto JOIN Categoria ON Produto.Categoria_idCategoria = Categoria.idCategoria WHERE Produto.Preco >= 50",
  },
  {
    label: "Clientes e enderecos",
    query:
      "SELECT Cliente.Nome, Endereco.Cidade, Endereco.UF FROM Cliente JOIN Endereco ON Cliente.idCliente = Endereco.Cliente_idCliente WHERE Endereco.UF = 'CE'",
  },
];

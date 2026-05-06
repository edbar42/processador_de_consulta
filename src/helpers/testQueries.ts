type query = {
    label: string;
    query: string;
};

export const TestQueries: query[] = [
    {
        label: "Clientes com pedidos",
        query: "SELECT Cliente.Nome, Pedido.DataPedido FROM Cliente JOIN Pedido ON Cliente.idCliente = Pedido.Cliente_idCliente WHERE Pedido.ValorTotalPedido > 100",
    },
    {
        label: "Pedidos por status",
        query: "SELECT Cliente.Nome, Status.Descricao FROM Cliente JOIN Pedido ON Cliente.idCliente = Pedido.Cliente_idCliente JOIN Status ON Pedido.Status_idStatus = Status.idStatus WHERE Status.idStatus = 1 AND Pedido.ValorTotalPedido > 100",
    },
    {
        label: "Produtos e categorias",
        query: "SELECT Produto.Nome, Categoria.Descricao FROM Produto JOIN Categoria ON Produto.Categoria_idCategoria = Categoria.idCategoria WHERE Produto.Preco >= 50",
    },
    {
        label: "Clientes e enderecos",
        query: "SELECT Cliente.Nome, Endereco.Cidade, Endereco.UF FROM Cliente JOIN Endereco ON Cliente.idCliente = Endereco.Cliente_idCliente WHERE Endereco.UF = 'CE'",
    },
    {
        label: "exemplo slide aula",
        query: `Select Tb1.Nome, tb3.sal\nFrom Tb1\nJoin Tb2 on tb1.pk = tb2.fk Join tb3 on tb2.pk = tb3.fk\nWHERE tb1.id > 300 and tb3.sal <> 0`,
    },
    {
        label: "exemplo prof 1",
        query: `SELECT cliente.nome, pedido.idPedido, pedido.DataPedido, pedido.ValorTotalPedido \nFROM Cliente\nJOIN pedido ON cliente.idcliente = pedido.Cliente_idCliente\nWHERE cliente.TipoCliente_idTipoCliente = 1 and pedido.ValorTotalPedido = 0;`,
    },
    {
        label: "exemplo prof 2",
        query: `SELECT Tb1.Nome, tb3.sal\nFROM Tb1\nJOIN Tb2 on tb1.pk = tb2.fk\nJOIN tb3 on tb2.pk = tb3.fk\nWHERE tb1.id > 300 AND tb3.sal <> 0`,
    },
];

# Chat Seed Application

Aplicação Node.js com TypeScript para conectar ao MongoDB, popular o banco com conversas de chat e migrar para PostgreSQL.

## Pré-requisitos

- Docker e Docker Compose
- Node.js v22.11 (opcional, para rodar localmente)
- MongoDB v7 com replicaSet (opcional, para rodar localmente)
- PostgreSQL v16 (opcional, para rodar localmente)

## Como rodar

1. **Subir os contêineres**:
   ```bash
   docker-compose up -d --build
   ```

2. **Popular o Mongo**:
   ```bash
   docker-compose exec app npm run seed
   ```

3. **Executar a Migração para o PostgreSQL**
    ```bash
   docker-compose exec app npm run migrate
   ```

## Observações sobre a aplicação

- Ao rodar a aplicação e rodar o seed, por padrão será criado em média 50.000;
- caso queira aumentar a quantidade basta alterar dentro de "seed.ts":

- - ```await seedDatabase(db, 50000, 1000);```
- - onde o 50000 é a quantidade de registros aproximado e o 1000 é um 'divisor', onde processa as inserções de mil em mil.

- sobre a migração, ela tem basicamente duas etapas (duas funções):
- - 1ª: migrateBulk -> responsável por buscar os dados do MongoDB em lotes, e realizar as inserções no PostgreSQL, ou seja, enquanto ele estiver rodando, e for setado algum valor novo no banco, ele também será migrado para o postgre. Ele também abre uma "Stream" com o mongo, onde ele recebe um "evento" e se for de delete, ele também deleta o registro no Postegre, deixando assim sempre atualizado com o Monogo.
- - 2º: syncChanges -> após o migrateBulk finalizar, ou seja, não encontrar mais nenhum dado para realizar a migração, essa função entra em cena. O objetivo dela é ficar observando qualquer alteração no mongo, caso seja deletado algum registro, ou adicionado um novo registro, ela replica a alteração no Postgre, deixando assim ele atualizado.

- Sobre o tempo de migração, depende da máquina em si, e também do tamanho dos registros. Mas baseado em minhas configurações (Docker rodando com 8GB de RAM, e 4 núcleos), migrar mais de 1.5 milhões de registros, levou um pouco mais de 3 horas.

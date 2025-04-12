# Chat Seed Application

Aplicação Node.js com TypeScript para conectar ao MongoDB, popular o banco com conversas de chat e migrar para PostgreSQL.

## Pré-requisitos

- Docker e Docker Compose
- Node.js v22.11 (opcional, para rodar localmente)

## Como rodar

1. **Subir os contêineres**:
   ```bash
   docker-compose up -d
   ```

2. **Popular o Mongo**:
   ```bash
   docker-compose exec app npm run seed
   ```

3. **Executar a Migração para o PostgreSQL**
    ```bash
   docker-compose exec app npm run migrate
   ```
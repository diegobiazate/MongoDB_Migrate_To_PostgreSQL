import { Pool } from 'pg';

const pgConfig = {
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'chatdb',
  password: process.env.PG_PASSWORD || 'postgres',
  port: parseInt(process.env.PG_PORT || '5432'),
};

let pool: Pool;

export async function connectToPostgres(): Promise<Pool> {
  if (!pool) {
    pool = new Pool(pgConfig);
    console.log('Connected to PostgreSQL');
  }
  return pool;
}

export async function closePostgresConnection(): Promise<void> {
  if (pool) {
    await pool.end();
    console.log('PostgreSQL connection closed');
  }
}

// Criar tabelas (chamado uma vez no início da migração)
export async function initializePostgresSchema(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id VARCHAR(255) PRIMARY KEY,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id VARCHAR(255) REFERENCES conversations(id),
        sender_id VARCHAR(255) REFERENCES users(id),
        content TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        read BOOLEAN NOT NULL
      );
    `);
    console.log('PostgreSQL schema initialized');
  } catch (error) {
    console.error('Error initializing schema:', error);
    throw error;
  } finally {
    client.release();
  }
}
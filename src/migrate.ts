import { MongoClient, Db, ChangeStream } from 'mongodb';
import { Pool, PoolClient } from 'pg';
import { Conversation, PgUser, PgConversation, PgMessage } from './types';
import { connectToDatabase, closeDatabaseConnection } from './db';
import { closePostgresConnection, connectToPostgres, initializePostgresSchema } from './pgdb';

async function migrateBulk(db: Db, pgPool: Pool): Promise<{ conversations: number; messages: number }> {
  console.log('Starting bulk migration...');
  const collection = db.collection<Conversation>('conversations');
  const batchSize = 5000;
  let totalConversations = 0;
  let totalMessages = 0;

  const pgClient = await pgPool.connect();

  const changeStream: ChangeStream<Conversation> = collection.watch([], { fullDocument: 'updateLookup' });
  try {
    changeStream.on('change', async (change: any) => {
    await pgClient.query('BEGIN');
    if (change.operationType === 'delete' && change.documentKey) {
      const convId = change.documentKey._id.toString();
      await pgClient.query(`DELETE FROM messages WHERE conversation_id = $1`, [convId]);
      await pgClient.query(`DELETE FROM conversations WHERE id = $1`, [convId]);
      console.log(`Deleted conversation ${convId}`);
    }
    await pgClient.query('COMMIT');
    });
  } catch (error) {
    console.error(`Error processing change:`, error);
    await pgClient.query('ROLLBACK');
  }

  try {
    // Iterar conversas em lotes
    for await (const conversations of collection.find().batchSize(batchSize).stream()) {
      const batch = Array.isArray(conversations) ? conversations : [conversations];

      // Preparar lotes para PostgreSQL
      const users: PgUser[] = [];
      const pgConversations: PgConversation[] = [];
      const messages: PgMessage[] = [];

      for (const conv of batch) {
        if (!conv._id) continue;

        // Extrair participantes únicos
        const uniqueParticipants = Array.from(new Set(conv.participants));
        for (const participantId of uniqueParticipants) {
          users.push({ id: participantId as string });
        }

        // Adicionar conversa
        pgConversations.push({
          id: conv._id.toString(),
          created_at: conv.createdAt,
          updated_at: conv.updatedAt,
        });

        // Adicionar mensagens
        for (const msg of conv.messages) {
          messages.push({
            id: msg._id,
            conversation_id: conv._id.toString(),
            sender_id: msg.senderId,
            content: msg.content,
            timestamp: msg.timestamp,
            read: msg.read,
          });
        }
      }

      // Inserir no PostgreSQL em transação
      await pgClient.query('BEGIN');
      try {
        // Inserir usuários
        if (users.length > 0) {
          const userValues = users
            .map((u, i) => `($${i + 1})`)
            .join(',');
          await pgClient.query(
            `INSERT INTO users (id) VALUES ${userValues} ON CONFLICT (id) DO NOTHING`,
            users.map(u => u.id)
          );
        }

        // Inserir conversas
        if (pgConversations.length > 0) {
          const convValues = pgConversations
            .map((c, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
            .join(',');
          await pgClient.query(
            `INSERT INTO conversations (id, created_at, updated_at) VALUES ${convValues} ON CONFLICT (id) DO NOTHING`,
            pgConversations.flatMap(c => [c.id, c.created_at, c.updated_at])
          );
        }

        // Inserir mensagens em sub-lotes
        const subBatchSize = 10000; // ~10.000 mensagens por sub-lote
        for (let i = 0; i < messages.length; i += subBatchSize) {
          const subBatch = messages.slice(i, i + subBatchSize);
          if (subBatch.length > 0) {
            const msgValues = subBatch
              .map((m, j) => `($${j * 5 + 1}, $${j * 5 + 2}, $${j * 5 + 3}, $${j * 5 + 4}, $${j * 5 + 5})`)
              .join(',');
            await pgClient.query(
              `INSERT INTO messages (conversation_id, sender_id, content, timestamp, read) VALUES ${msgValues} ON CONFLICT DO NOTHING`,
              subBatch.flatMap(m => [m.conversation_id, m.sender_id, m.content, m.timestamp, m.read])
            );
          }
        }

        await pgClient.query('COMMIT');
        totalConversations += batch.length;
        totalMessages += messages.length;
        console.log(`Migrated ${batch.length} conversations, ${messages.length} messages (Total: ${totalConversations}, ${totalMessages})`);
      } catch (error) {
        await pgClient.query('ROLLBACK');
        throw error;
      }
    }

    // Criar índices após a migração
    await pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    `);
    console.log('Created PostgreSQL indexes');

    console.log('Bulk migration completed');
    return { conversations: totalConversations, messages: totalMessages };
  } catch (error) {
    console.error('Bulk migration error:', error);
    throw error;
  } finally {
    pgClient.release();
    await changeStream.close();
  }
}

async function syncChanges(db: Db, pgPool: Pool): Promise<void> {
  console.log('Starting incremental sync...');
  const collection = db.collection<Conversation>('conversations');
  const changeStream: ChangeStream<Conversation> = collection.watch([], { fullDocument: 'updateLookup' });

  try {
    changeStream.on('change', async (change: any) => {
      const pgClient = await pgPool.connect();
      try {
        await pgClient.query('BEGIN');
        if (change.operationType === 'insert') {
          const conv = change.fullDocument as Conversation;
          if (!conv._id) return;

          const uniqueParticipants = Array.from(new Set(conv.participants));
          if (uniqueParticipants.length > 0) {
            const userValues = uniqueParticipants
              .map((_, i) => `($${i + 1})`)
              .join(',');
            await pgClient.query(
              `INSERT INTO users (id) VALUES ${userValues} ON CONFLICT (id) DO NOTHING`,
              uniqueParticipants
            );
          }

          await pgClient.query(
            `INSERT INTO conversations (id, created_at, updated_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
            [conv._id.toString(), conv.createdAt, conv.updatedAt]
          );

          for (const msg of conv.messages) {
            await pgClient.query(
              `INSERT INTO messages (conversation_id, sender_id, content, timestamp, read) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
              [conv._id.toString(), msg.senderId, msg.content, msg.timestamp, msg.read]
            );
          }
          console.log(`Inserted conversation ${conv._id}`);

        } else if (change.operationType === 'update' && change.documentKey) {
          const convId = change.documentKey._id.toString();
          const updates = change.updateDescription?.updatedFields;

          if (updates) {
            if (updates.createdAt || updates.updatedAt) {
              await pgClient.query(
                `UPDATE conversations SET created_at = COALESCE($1, created_at), updated_at = COALESCE($2, updated_at) WHERE id = $3`,
                [updates.createdAt, updates.updatedAt, convId]
              );
            }

            if (updates.participants) {
              const uniqueParticipants = Array.from(new Set(updates.participants));
              if (uniqueParticipants.length > 0) {
                const userValues = uniqueParticipants
                  .map((_, i) => `($${i + 1})`)
                  .join(',');
                await pgClient.query(
                  `INSERT INTO users (id) VALUES ${userValues} ON CONFLICT (id) DO NOTHING`,
                  uniqueParticipants
                );
              }
            }

            if (updates.messages && change.fullDocument) {
              const fullDoc = change.fullDocument as Conversation;
              for (const msg of fullDoc.messages) {
                await pgClient.query(
                  `INSERT INTO messages (conversation_id, sender_id, content, timestamp, read) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
                  [convId, msg.senderId, msg.content, msg.timestamp, msg.read]
                );
              }
            }
          }
          console.log(`Updated conversation ${convId}`);

        } else if (change.operationType === 'delete' && change.documentKey) {
          const convId = change.documentKey._id.toString();
          await pgClient.query(`DELETE FROM messages WHERE conversation_id = $1`, [convId]);
          await pgClient.query(`DELETE FROM conversations WHERE id = $1`, [convId]);
          console.log(`Deleted conversation ${convId}`);
        }
        await pgClient.query('COMMIT');
      } catch (error) {
        console.error(`Error processing change:`, error);
        await pgClient.query('ROLLBACK');
      } finally {
        pgClient.release();
      }
    });

    await new Promise(() => {});
  } catch (error) {
    console.error('Sync error:', error);
    throw error;
  } finally {
    await changeStream.close();
  }
}

async function validateMigration(db: Db, pgPool: Pool): Promise<void> {
  const mongoConvCount = await db.collection('conversations').countDocuments({});
  const mongoMsgCount = await db
    .collection('conversations')
    .aggregate([{ $unwind: '$messages' }, { $count: 'total' }])
    .toArray()
    .then((res: any) => res[0]?.total || 0);

  const pgConvCount = (await pgPool.query('SELECT COUNT(*) FROM conversations')).rows[0].count;
  const pgMsgCount = (await pgPool.query('SELECT COUNT(*) FROM messages')).rows[0].count;

  console.log(`Validation results:
    MongoDB: ${mongoConvCount} conversations, ${mongoMsgCount} messages
    PostgreSQL: ${pgConvCount} conversations, ${pgMsgCount} messages`);

  if (mongoConvCount === parseInt(pgConvCount) && mongoMsgCount === parseInt(pgMsgCount)) {
    console.log('Migration validated successfully');
  } else {
    console.warn('Mismatch detected! Check data integrity.');
  }
}

async function main() {
  let mongoClient: MongoClient | null = null;
  let pgPool: Pool | null = null;

  try {
    const { client, db } = await connectToDatabase();
    pgPool = await connectToPostgres();
    await initializePostgresSchema(pgPool);
    mongoClient = client;

    const { conversations, messages } = await migrateBulk(db, pgPool);
    await validateMigration(db, pgPool);

    console.log(`Bulk migration done: ${conversations} conversations, ${messages} messages`);
    console.log('Press Ctrl+C to stop syncing');
    await syncChanges(db, pgPool);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    if (mongoClient) await closeDatabaseConnection();
    if (pgPool) await closePostgresConnection();
  }
}

if (require.main === module) {
  main();
}
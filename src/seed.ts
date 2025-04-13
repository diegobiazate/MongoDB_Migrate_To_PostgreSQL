import { Db, ObjectId } from 'mongodb';
import { faker } from '@faker-js/faker';
import { Conversation, Message } from './types';
import { connectToDatabase, closeDatabaseConnection } from './db';

// Função para gerar mensagens fictícias
function generateMessages(
  senderIds: string[],
  count: number,
  startDate: Date
): Message[] {
  const messages: Message[] = [];

  for (let i = 0; i < count; i++) {
    const senderId = senderIds[Math.floor(Math.random() * senderIds.length)];
    const timestamp = new Date(
      startDate.getTime() + i * 60 * 1000 // Mensagens espaçadas por 1 minuto
    );
    const contentType = Math.random();
    let content: string;

    if (contentType < 0.3) {
      content = faker.lorem.sentence({ min: 3, max: 8 });
    } else if (contentType < 0.6) {
      content = faker.lorem.sentences({ min: 1, max: 2 });
    } else {
      content = faker.lorem.paragraph({ min: 1, max: 3 });
    }

    messages.push({
      senderId,
      content,
      timestamp,
      read: Math.random() > 0.3,
    });
  }
  return messages;
}

// Função para gerar conversas fictícias
function generateConversations(count: number): Conversation[] {
  const conversations: Conversation[] = [];
  const userIds = Array.from({ length: 100 }, () => new ObjectId().toString());

  for (let i = 0; i < count; i++) {
    const participants = [
      userIds[Math.floor(Math.random() * userIds.length)],
      userIds[Math.floor(Math.random() * userIds.length)],
    ].filter((v, idx, arr) => arr.indexOf(v) === idx);
    if (participants.length < 2) continue;

    const createdAt = new Date(
      Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)
    );
    const messageCount = Math.floor(Math.random() * 50) + 20;
    const messages = generateMessages(participants, messageCount, createdAt);

    conversations.push({
      participants,
      messages,
      createdAt,
      updatedAt: messages[messages.length - 1].timestamp,
    });
  }
  return conversations;
}

// Função principal de seed
export async function seedDatabase(
  db: Db,
  conversationCount: number = 1000,
  batchSize: number = 1000
): Promise<void> {
  try {
    const collection = db.collection<Conversation>('conversations');

    // // Limpar coleção existente
    // await collection?.deleteMany({});
    // console.log('Cleared existing conversations');

    let totalInserted = 0;
    let totalMessages = 0;

    // Processar em lotes
    for (let i = 0; i < conversationCount; i += batchSize) {
      const currentBatchSize = Math.min(batchSize, conversationCount - i);
      console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(conversationCount / batchSize)}...`);

      // Gerar e inserir conversas do lote atual
      const conversations = generateConversations(currentBatchSize);
      await collection.insertMany(conversations, { ordered: false });
      
      totalInserted += conversations.length;
      totalMessages += conversations.reduce((sum, conv) => sum + conv.messages.length, 0);

      // Forçar coleta de lixo
      if (global.gc) {
        global.gc();
      }

      console.log(`Progress: ${totalInserted}/${conversationCount} conversations (${Math.round((totalInserted / conversationCount) * 100)}%)`);
    }

    // Relatório final
    console.log(`\nSeed completed successfully!`);
    console.log(`Total conversations inserted: ${totalInserted}`);
    console.log(`Total messages inserted: ${totalMessages}`);
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
}

// Executar seed se chamado diretamente
if (require.main === module) {
  (async () => {
    try {
      const { db } = await connectToDatabase();
      await seedDatabase(db, 50000, 1000); // Processar em lotes de 1000
    } catch (error) {
      console.error('Seed failed:', error);
    } finally {
      await closeDatabaseConnection();
    }
  })();
}
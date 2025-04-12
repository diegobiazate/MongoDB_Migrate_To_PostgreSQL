import { MongoClient, Db } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/chatdb?replicaSet=rs0';
let client: MongoClient | null = null;
let dbInstance: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (!client || !dbInstance) {
    client = await MongoClient.connect(MONGO_URI);
    dbInstance = client.db();
    console.log('Connected to MongoDB');
  }
  return { client, db: dbInstance };
}

export async function closeDatabaseConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    dbInstance = null;
    console.log('MongoDB connection closed');
  }
}
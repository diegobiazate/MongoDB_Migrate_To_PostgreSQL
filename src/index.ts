import { connectToDatabase, closeDatabaseConnection } from './db';

async function main() {
  try {
    const db = await connectToDatabase();
    console.log('Chat application running. Database connected.');
    
    // Aqui você pode adicionar lógica adicional (e.g., API para chat)
  } catch (error) {
    console.error('Application error:', error);
  } finally {
    // Mantém a conexão aberta para a aplicação
    // await closeDatabaseConnection();
  }
}

main();
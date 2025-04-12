export interface Message {
  _id?: string;
  senderId: string;
  content: string;
  timestamp: Date;
  read: boolean;
}

export interface Conversation {
  _id?: string;
  participants: string[];
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PgUser {
  id: string;
}

export interface PgConversation {
  id: string;
  created_at: Date;
  updated_at: Date;
}

export interface PgMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  timestamp: Date;
  read: boolean;
}
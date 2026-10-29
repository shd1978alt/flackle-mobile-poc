export interface User {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  email?: string;
}

export interface Server {
  id: string;
  name: string;
  icon_url?: string | null;
}

export interface Reaction {
  emoji: string;
  count: number;
  me: boolean;
}

export interface ReplyTo {
  id: string;
  content?: string | null;
  sender_id?: string;
  sender_username?: string;
  sender_display_name?: string | null;
  sender_avatar_url?: string | null;
  has_attachments?: boolean;
  deleted?: boolean;
}

export type SendStatus = 'sending' | 'failed' | 'unconfirmed';

export interface Message {
  id: string;
  conversation_id?: string;
  content: string;
  type: string;
  is_deleted: boolean;
  created_at: string;
  updated_at?: string;
  edited_at?: string | null;
  sender: User;
  reactions: Reaction[];
  reply_to?: ReplyTo | null;
  // client-only
  nonce?: string;
  status?: SendStatus;
  error?: string;
}

export interface Member {
  role?: string;
  joined_at?: string;
  user: User;
}

export interface Conversation {
  id: string;
  type: 'dm' | 'group' | string;
  name?: string | null;
  icon_url?: string | null;
  members: Member[];
  last_message_at?: string | null;
  last_message?: Message | null;
}

export type PresenceStatus = 'online' | 'dnd' | 'invisible';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Chat: { conversationId: string };
};

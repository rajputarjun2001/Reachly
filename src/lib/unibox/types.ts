export type ConversationStatus = "open" | "archived";

export type MessageDirection = "outbound" | "inbound" | "system";

export type ConversationRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  title: string;
  status: ConversationStatus;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  workspace_id: string;
  direction: MessageDirection;
  body: string;
  sent_at: string;
  created_at: string;
};

export type ConversationSummary = ConversationRow & {
  lead_first_name: string | null;
  lead_last_name: string | null;
  lead_company: string | null;
  lead_job_title: string | null;
};

export type ConversationWithMessages = ConversationSummary & {
  messages: MessageRow[];
};

export type PaginatedConversations = {
  conversations: ConversationSummary[];
  total: number;
  page: number;
  pageSize: number;
};

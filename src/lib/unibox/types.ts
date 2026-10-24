export type ConversationStatus = "open" | "archived";

export type MessageDirection = "outbound" | "inbound" | "system";

/** Workspace-only record — not an external message and never delivered. */
export type InternalNoteKind = "note" | "draft";

export type InternalNoteRow = {
  id: string;
  workspace_id: string;
  conversation_id: string | null;
  lead_id: string | null;
  kind: InternalNoteKind;
  body: string;
  created_at: string;
  updated_at: string;
};

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
  has_unread: boolean;
  lead_first_name: string | null;
  lead_last_name: string | null;
  lead_company: string | null;
  lead_job_title: string | null;
  lead_linkedin_url: string | null;
  campaign_name: string | null;
  account_label: string | null;
  /** True when the thread is tied to a lead and a LinkedIn account, so replies can be sent. */
  can_reply: boolean;
};

export type ConversationWithMessages = ConversationSummary & {
  messages: MessageRow[];
  internal_notes: InternalNoteRow[];
};

export type PaginatedConversations = {
  conversations: ConversationSummary[];
  total: number;
  page: number;
  pageSize: number;
};

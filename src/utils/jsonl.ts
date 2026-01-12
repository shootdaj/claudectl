import { readFile, stat } from "fs/promises";

/**
 * Types for session message parsing
 */
export interface SessionMessage {
  uuid: string;
  parentUuid: string | null;
  sessionId: string;
  timestamp: string;
  type: "user" | "assistant" | "summary" | string;
  cwd: string;
  version?: string;
  gitBranch?: string;
  slug?: string;
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string; thinking?: string }>;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

export interface SessionMetadata {
  createdAt: Date;
  lastAccessedAt: Date;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  cwd: string;
  /** Session slug (auto-generated name like "optimized-plotting-pancake") */
  slug?: string;
  /** Summary title from Claude's summary messages */
  summaryTitle?: string;
  /** First user message (fallback for display title) */
  firstUserMessage?: string;
  gitBranch?: string;
  model?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
}

/**
 * Message types to ignore when counting conversation messages
 */
const INTERNAL_MESSAGE_TYPES = new Set([
  "file-history-snapshot",
  "file-history-update",
  "system",
]);

/**
 * Parse a JSONL file and return all parsed lines
 */
export async function parseJsonl(filePath: string): Promise<SessionMessage[]> {
  const text = await readFile(filePath, "utf-8");
  return parseJsonlText(text);
}

/**
 * Parse JSONL text content (for testing without file I/O)
 */
export function parseJsonlText(text: string): SessionMessage[] {
  const lines = text.trim().split("\n").filter(Boolean);
  const messages: SessionMessage[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as SessionMessage;
      messages.push(parsed);
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  return messages;
}

/**
 * Summary message structure
 */
interface SummaryMessage {
  type: "summary";
  summary: string;
  leafUuid?: string;
}

/**
 * Extract metadata from session messages
 */
export function extractMetadata(messages: SessionMessage[]): SessionMetadata {
  // Filter out internal message types for counting
  const conversationMessages = messages.filter(
    (m) => !INTERNAL_MESSAGE_TYPES.has(m.type)
  );

  // Also look for summary messages (they have type: "summary")
  const summaryMessages = messages.filter((m) => m.type === "summary") as unknown as SummaryMessage[];

  // Get the most recent summary title (summaries are generated as conversation progresses)
  let summaryTitle: string | undefined;
  if (summaryMessages.length > 0) {
    const lastSummary = summaryMessages[summaryMessages.length - 1];
    if (lastSummary.summary) {
      summaryTitle = lastSummary.summary;
    }
  }

  if (conversationMessages.length === 0) {
    return {
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      messageCount: 0,
      userMessageCount: 0,
      assistantMessageCount: 0,
      cwd: "",
      summaryTitle,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };
  }

  // Find first message with valid timestamp for createdAt
  let firstMsgWithTimestamp = conversationMessages.find((m) => m.timestamp);
  if (!firstMsgWithTimestamp) {
    // Fall back to any message with timestamp (including internal ones)
    firstMsgWithTimestamp = messages.find((m) => m.timestamp);
  }
  const firstMsg = firstMsgWithTimestamp || conversationMessages[0];

  // Find last message with valid timestamp for lastAccessedAt
  // Some message types (like 'summary') don't have timestamps
  let lastMsgWithTimestamp: SessionMessage | undefined;
  for (let i = conversationMessages.length - 1; i >= 0; i--) {
    if (conversationMessages[i].timestamp) {
      lastMsgWithTimestamp = conversationMessages[i];
      break;
    }
  }
  // Fall back to any message with timestamp if conversation messages don't have one
  if (!lastMsgWithTimestamp) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].timestamp) {
        lastMsgWithTimestamp = messages[i];
        break;
      }
    }
  }
  const lastMsg = lastMsgWithTimestamp || firstMsg;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let userMessageCount = 0;
  let assistantMessageCount = 0;
  let model: string | undefined;
  let slug: string | undefined;
  let firstUserMessage: string | undefined;

  for (const msg of conversationMessages) {
    if (msg.type === "user") {
      userMessageCount++;

      // Capture first user message for display title
      if (!firstUserMessage && msg.message?.content) {
        const content = msg.message.content;
        if (typeof content === "string") {
          firstUserMessage = content;
        }
      }
    } else if (msg.type === "assistant") {
      assistantMessageCount++;

      // Extract token usage from assistant messages
      if (msg.message?.usage) {
        const usage = msg.message.usage;
        totalInputTokens += usage.input_tokens || 0;
        totalInputTokens += usage.cache_creation_input_tokens || 0;
        totalInputTokens += usage.cache_read_input_tokens || 0;
        totalOutputTokens += usage.output_tokens || 0;
      }

      // Get model from assistant message
      if (msg.message?.model && !model) {
        model = msg.message.model;
      }
    }

    // Get slug from slug field (can appear on any message)
    if (msg.slug && !slug) {
      slug = msg.slug;
    }
  }

  return {
    createdAt: new Date(firstMsg.timestamp),
    lastAccessedAt: new Date(lastMsg.timestamp),
    messageCount: conversationMessages.length,
    userMessageCount,
    assistantMessageCount,
    cwd: firstMsg.cwd || "",
    slug,
    summaryTitle,
    firstUserMessage,
    gitBranch: firstMsg.gitBranch,
    model,
    totalInputTokens,
    totalOutputTokens,
  };
}

/**
 * Parse session metadata from a file
 * Uses file mtime as fallback for invalid timestamps
 */
export async function parseSessionMetadata(
  filePath: string
): Promise<SessionMetadata> {
  const messages = await parseJsonl(filePath);
  const metadata = extractMetadata(messages);

  // Use file mtime as fallback for invalid dates
  const stats = await stat(filePath);
  const fileMtime = stats?.mtime ? new Date(stats.mtime) : new Date();

  // Fix invalid createdAt
  if (isNaN(metadata.createdAt.getTime())) {
    metadata.createdAt = fileMtime;
  }

  // Fix invalid lastAccessedAt
  if (isNaN(metadata.lastAccessedAt.getTime())) {
    metadata.lastAccessedAt = fileMtime;
  }

  return metadata;
}

/**
 * Get the user-visible content from a message
 */
export function getMessageContent(msg: SessionMessage): string {
  if (!msg.message?.content) {
    return "";
  }

  const content = msg.message.content;

  if (typeof content === "string") {
    return content;
  }

  // Content is an array of blocks
  const textBlocks = content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!);

  return textBlocks.join("\n");
}

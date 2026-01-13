/**
 * Message Converter
 *
 * Generic conversion layer between JSONL messages and UI formats.
 * Converts structured Claude Code messages to both:
 * - Chat format (for mobile chat UI)
 * - Terminal format (for desktop terminal view)
 *
 * This is a protocol translator, not a plugin system.
 * It handles any tool_use/tool_result generically.
 */

import type { JsonlMessage, ContentBlock } from "./jsonl-watcher";

/**
 * Chat message format for the mobile chat UI
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  timestamp: Date;
  content: ChatContent[];
  costUSD?: number;
  durationMs?: number;
  model?: string;
}

/**
 * Content types in a chat message
 */
export type ChatContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; tool: ToolCall }
  | { type: "tool_result"; toolUseId: string; result: ToolResult };

/**
 * Generic tool call representation
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
  // Computed display hints
  displayTitle: string;
  displaySummary?: string;
}

/**
 * Generic tool result representation
 */
export interface ToolResult {
  content: string;
  isError: boolean;
  // Computed display hints
  truncated: boolean;
  lineCount: number;
}

/**
 * Terminal-style message format
 */
export interface TerminalMessage {
  id: string;
  role: "user" | "assistant" | "system";
  timestamp: Date;
  text: string; // Plain text representation
  costUSD?: number;
}

/**
 * Detect if message content suggests a yes/no question
 */
export function detectQuickActions(text: string): string[] {
  const actions: string[] = [];

  // Common patterns for yes/no questions
  const yesNoPatterns = [
    /\?\s*$/,  // Ends with question mark
    /should I/i,
    /shall I/i,
    /do you want/i,
    /would you like/i,
    /proceed\?/i,
    /continue\?/i,
    /\(y\/n\)/i,
    /\[y\/n\]/i,
  ];

  const hasQuestion = yesNoPatterns.some((p) => p.test(text));

  if (hasQuestion) {
    actions.push("y", "n");
  }

  // Check for permission prompts
  if (/allow|permit|approve|accept/i.test(text)) {
    if (!actions.includes("y")) {
      actions.push("y", "n");
    }
  }

  return actions;
}

/**
 * Convert a JSONL message to chat format
 */
export function toChatMessage(jsonl: JsonlMessage): ChatMessage {
  const chatContent: ChatContent[] = [];

  // Handle missing message property
  if (!jsonl.message) {
    return {
      id: jsonl.uuid,
      role: jsonl.type === "summary" ? "system" : jsonl.type,
      timestamp: new Date(jsonl.timestamp),
      content: chatContent,
      costUSD: jsonl.costUSD,
      durationMs: jsonl.durationMs,
    };
  }

  // Handle different content types
  if (typeof jsonl.message.content === "string") {
    // Simple text message
    if (jsonl.message.content.trim()) {
      chatContent.push({ type: "text", text: jsonl.message.content });
    }
  } else if (Array.isArray(jsonl.message.content)) {
    // Array of content blocks
    for (const block of jsonl.message.content) {
      const converted = convertContentBlock(block);
      if (converted) {
        chatContent.push(converted);
      }
    }
  }

  const result = {
    id: jsonl.uuid,
    role: jsonl.type === "summary" ? "system" : jsonl.type,
    timestamp: new Date(jsonl.timestamp),
    content: chatContent,
    costUSD: jsonl.costUSD,
    durationMs: jsonl.durationMs,
    model: jsonl.message.model,
  };

  return result as ChatMessage;
}

/**
 * Convert a single content block to chat content
 */
function convertContentBlock(block: ContentBlock): ChatContent | null {
  switch (block.type) {
    case "text":
      if (block.text?.trim()) {
        return { type: "text", text: block.text };
      }
      return null;

    case "tool_use":
      const toolInput = block.input || {};
      return {
        type: "tool_use",
        tool: {
          id: block.id || "",
          name: block.name || "unknown",
          input: toolInput,
          displayTitle: formatToolTitle(block.name || "unknown", toolInput),
          displaySummary: formatToolSummary(block.name || "unknown", toolInput),
        },
      };

    case "tool_result":
      const resultText = extractResultText(block.content);
      return {
        type: "tool_result",
        toolUseId: block.tool_use_id || "",
        result: {
          content: resultText,
          isError: block.is_error || false,
          truncated: resultText.length > 1000,
          lineCount: resultText.split("\n").length,
        },
      };

    default:
      return null;
  }
}

/**
 * Format a human-readable title for a tool call
 */
function formatToolTitle(name: string, input: Record<string, any>): string {
  // Handle common tools with nice formatting
  switch (name.toLowerCase()) {
    case "edit":
      return `Edit: ${input.file_path || "file"}`;
    case "write":
      return `Write: ${input.file_path || "file"}`;
    case "read":
      return `Read: ${input.file_path || "file"}`;
    case "bash":
      const cmd = input.command?.split("\n")[0]?.slice(0, 50) || "command";
      return `Bash: ${cmd}${cmd.length >= 50 ? "..." : ""}`;
    case "glob":
      return `Glob: ${input.pattern || "pattern"}`;
    case "grep":
      return `Grep: ${input.pattern || "pattern"}`;
    case "task":
      return `Task: ${input.description || "task"}`;
    case "todowrite":
      return "Todo: Updating task list";
    case "webfetch":
      return `Fetch: ${input.url?.slice(0, 40) || "URL"}`;
    case "websearch":
      return `Search: ${input.query?.slice(0, 40) || "query"}`;
    default:
      // Generic: just show the tool name
      return name;
  }
}

/**
 * Format a brief summary of tool input
 */
function formatToolSummary(name: string, input: Record<string, any>): string | undefined {
  switch (name.toLowerCase()) {
    case "edit":
      if (input.old_string && input.new_string) {
        const oldLines = input.old_string.split("\n").length;
        const newLines = input.new_string.split("\n").length;
        const added = Math.max(0, newLines - oldLines);
        const removed = Math.max(0, oldLines - newLines);
        return `+${added} -${removed} lines`;
      }
      return undefined;
    case "bash":
      return input.description || undefined;
    case "read":
      if (input.offset || input.limit) {
        return `lines ${input.offset || 0}-${(input.offset || 0) + (input.limit || 0)}`;
      }
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Extract text from tool_result content (which can be nested)
 */
function extractResultText(content: string | ContentBlock[] | undefined): string {
  if (!content) return "";

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block.type === "text" && block.text) return block.text;
        return "";
      })
      .join("\n");
  }

  return "";
}

/**
 * Convert a JSONL message to terminal format (plain text)
 */
export function toTerminalMessage(jsonl: JsonlMessage): TerminalMessage {
  let text = "";

  // Handle missing message property
  if (!jsonl.message) {
    return {
      id: jsonl.uuid,
      role: jsonl.type === "summary" ? "system" : jsonl.type,
      timestamp: new Date(jsonl.timestamp),
      text: "",
      costUSD: jsonl.costUSD,
    };
  }

  if (typeof jsonl.message.content === "string") {
    text = jsonl.message.content;
  } else if (Array.isArray(jsonl.message.content)) {
    const parts: string[] = [];

    for (const block of jsonl.message.content) {
      if (block.type === "text" && block.text) {
        parts.push(block.text);
      } else if (block.type === "tool_use") {
        // Format tool call for terminal
        const title = formatToolTitle(block.name || "unknown", block.input || {});
        parts.push(`[${title}]`);
      } else if (block.type === "tool_result") {
        const result = extractResultText(block.content);
        if (result) {
          // Truncate long results in terminal view
          const truncated = result.length > 500 ? result.slice(0, 500) + "..." : result;
          parts.push(truncated);
        }
      }
    }

    text = parts.join("\n");
  }

  return {
    id: jsonl.uuid,
    role: jsonl.type === "summary" ? "system" : jsonl.type,
    timestamp: new Date(jsonl.timestamp),
    text,
    costUSD: jsonl.costUSD,
  };
}

/**
 * Convert multiple messages to chat format
 */
export function toChatMessages(messages: JsonlMessage[]): ChatMessage[] {
  return messages.map(toChatMessage);
}

/**
 * Convert multiple messages to terminal format
 */
export function toTerminalMessages(messages: JsonlMessage[]): TerminalMessage[] {
  return messages.map(toTerminalMessage);
}

/**
 * Get quick actions from the last assistant message
 */
export function getQuickActionsFromMessages(messages: ChatMessage[]): string[] {
  // Find the last assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      // Get text content
      const textContent = msg.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join(" ");

      return detectQuickActions(textContent);
    }
  }

  return [];
}

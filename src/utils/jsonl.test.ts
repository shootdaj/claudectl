import { describe, test, expect } from "bun:test";
import { join } from "path";
import {
  parseJsonl,
  parseJsonlText,
  extractMetadata,
  parseSessionMetadata,
  getMessageContent,
  type SessionMessage,
} from "./jsonl";

const FIXTURES_DIR = join(import.meta.dir, "../test-fixtures/sessions");

describe("jsonl", () => {
  describe("parseJsonlText", () => {
    test("parses valid JSONL", () => {
      const text = `{"type":"user","uuid":"1"}
{"type":"assistant","uuid":"2"}`;

      const messages = parseJsonlText(text);
      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe("user");
      expect(messages[1].type).toBe("assistant");
    });

    test("skips malformed lines", () => {
      const text = `{"type":"user","uuid":"1"}
not valid json
{"type":"assistant","uuid":"2"}`;

      const messages = parseJsonlText(text);
      expect(messages).toHaveLength(2);
    });

    test("handles empty input", () => {
      expect(parseJsonlText("")).toHaveLength(0);
      expect(parseJsonlText("\n\n")).toHaveLength(0);
    });
  });

  describe("parseJsonl", () => {
    test("parses sample session file", async () => {
      const filePath = join(FIXTURES_DIR, "sample-session.jsonl");
      const messages = await parseJsonl(filePath);

      // 5 messages: 1 snapshot + 2 user + 2 assistant
      expect(messages).toHaveLength(5);
    });
  });

  describe("extractMetadata", () => {
    test("extracts metadata from messages", () => {
      const messages: SessionMessage[] = [
        {
          type: "file-history-snapshot",
          uuid: "snap1",
          parentUuid: null,
          sessionId: "sess1",
          timestamp: "2025-12-19T09:00:00.000Z",
          cwd: "/test",
        },
        {
          type: "user",
          uuid: "msg1",
          parentUuid: null,
          sessionId: "sess1",
          timestamp: "2025-12-19T10:00:00.000Z",
          cwd: "/test/project",
          gitBranch: "main",
          message: { role: "user", content: "Hello" },
        },
        {
          type: "assistant",
          uuid: "msg2",
          parentUuid: "msg1",
          sessionId: "sess1",
          timestamp: "2025-12-19T10:01:00.000Z",
          cwd: "/test/project",
          slug: "my-session-name",
          message: {
            role: "assistant",
            model: "claude-opus-4-5-20251101",
            content: [{ type: "text", text: "Hi there!" }],
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_creation_input_tokens: 200,
            },
          },
        },
      ];

      const metadata = extractMetadata(messages);

      // Filters out file-history-snapshot
      expect(metadata.messageCount).toBe(2);
      expect(metadata.userMessageCount).toBe(1);
      expect(metadata.assistantMessageCount).toBe(1);
      expect(metadata.cwd).toBe("/test/project");
      expect(metadata.gitBranch).toBe("main");
      expect(metadata.slug).toBe("my-session-name");
      expect(metadata.firstUserMessage).toBe("Hello");
      expect(metadata.model).toBe("claude-opus-4-5-20251101");
      expect(metadata.totalInputTokens).toBe(300); // 100 + 200
      expect(metadata.totalOutputTokens).toBe(50);
      expect(metadata.createdAt.toISOString()).toBe("2025-12-19T10:00:00.000Z");
      expect(metadata.lastAccessedAt.toISOString()).toBe("2025-12-19T10:01:00.000Z");
    });

    test("handles empty messages array", () => {
      const metadata = extractMetadata([]);

      expect(metadata.messageCount).toBe(0);
      expect(metadata.userMessageCount).toBe(0);
      expect(metadata.assistantMessageCount).toBe(0);
      expect(metadata.cwd).toBe("");
    });

    test("handles messages with only internal types", () => {
      const messages: SessionMessage[] = [
        {
          type: "file-history-snapshot",
          uuid: "snap1",
          parentUuid: null,
          sessionId: "sess1",
          timestamp: "2025-12-19T09:00:00.000Z",
          cwd: "/test",
        },
      ];

      const metadata = extractMetadata(messages);
      expect(metadata.messageCount).toBe(0);
    });
  });

  describe("parseSessionMetadata", () => {
    test("parses metadata from sample file", async () => {
      const filePath = join(FIXTURES_DIR, "sample-session.jsonl");
      const metadata = await parseSessionMetadata(filePath);

      expect(metadata.messageCount).toBe(4); // 2 user + 2 assistant (excluding snapshot)
      expect(metadata.userMessageCount).toBe(2);
      expect(metadata.assistantMessageCount).toBe(2);
      expect(metadata.cwd).toBe("/Users/test/myproject");
      expect(metadata.gitBranch).toBe("main");
      expect(metadata.slug).toBe("helpful-coding-assistant");
      expect(metadata.firstUserMessage).toBe("Hello, can you help me?");
      expect(metadata.model).toBe("claude-opus-4-5-20251101");
      // Token counts: first assistant (100+200+50+50) + second (150+25)
      expect(metadata.totalInputTokens).toBe(500); // 100+200+50 + 150
      expect(metadata.totalOutputTokens).toBe(75); // 50 + 25
    });
  });

  describe("getMessageContent", () => {
    test("extracts string content", () => {
      const msg: SessionMessage = {
        type: "user",
        uuid: "1",
        parentUuid: null,
        sessionId: "s1",
        timestamp: "2025-12-19T10:00:00.000Z",
        cwd: "/test",
        message: { role: "user", content: "Hello world" },
      };

      expect(getMessageContent(msg)).toBe("Hello world");
    });

    test("extracts content from array of blocks", () => {
      const msg: SessionMessage = {
        type: "assistant",
        uuid: "1",
        parentUuid: null,
        sessionId: "s1",
        timestamp: "2025-12-19T10:00:00.000Z",
        cwd: "/test",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "Let me think..." },
            { type: "text", text: "Here is my response." },
            { type: "text", text: "And more text." },
          ],
        },
      };

      expect(getMessageContent(msg)).toBe("Here is my response.\nAnd more text.");
    });

    test("handles missing content", () => {
      const msg: SessionMessage = {
        type: "user",
        uuid: "1",
        parentUuid: null,
        sessionId: "s1",
        timestamp: "2025-12-19T10:00:00.000Z",
        cwd: "/test",
      };

      expect(getMessageContent(msg)).toBe("");
    });
  });
});

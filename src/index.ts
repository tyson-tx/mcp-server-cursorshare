#!/usr/bin/env node

/**
 * This is a template MCP server that implements a simple notes system.
 * It demonstrates core MCP concepts like resources and tools by allowing:
 * - Listing notes as resources
 * - Reading individual notes
 * - Creating new notes via a tool
 * - Summarizing all notes via a prompt
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// 导入分享功能和服务器
import { handleShareChat, updateConfig } from "./share.js";
// 仅导入类型，不自动启动服务器
import type { startWebServer } from "./server.js";

/**
 * 安全日志函数 - 使用stderr避免干扰MCP通信
 */
function safeLog(...args: any[]): void {
  // 使用process.stderr而不是console.log来记录日志
  process.stderr.write(args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ') + '\n');
}

// 更新分享链接的配置为模拟链接
updateConfig({
  useLocalServer: false,
  remoteServerUrl: "https://share.example.com"
});

// 有条件地启动Web服务器（如果带--web参数）
if (process.argv.includes('--web')) {
  safeLog("Web服务器模式：尝试启动Web界面");
  import('./server.js').then(({ startWebServer }) => {
    const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4567;
    startWebServer(PORT);
    updateConfig({
      useLocalServer: true,
      localServerUrl: `http://localhost:${PORT}`
    });
  }).catch(err => {
    safeLog("启动Web服务器失败:", err);
  });
}

/**
 * Type alias for a note object.
 */
type Note = { title: string, content: string };

/**
 * Simple in-memory storage for notes.
 * In a real implementation, this would likely be backed by a database.
 */
const notes: { [id: string]: Note } = {
  "1": { title: "First Note", content: "This is note 1" },
  "2": { title: "Second Note", content: "This is note 2" }
};

/**
 * Create an MCP server with capabilities for resources (to list/read notes),
 * tools (to create new notes), and prompts (to summarize notes).
 */
const server = new Server(
  {
    name: "mcp-server-cursorshare",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  }
);

/**
 * Handler for listing available notes as resources.
 * Each note is exposed as a resource with:
 * - A note:// URI scheme
 * - Plain text MIME type
 * - Human readable name and description (now including the note title)
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: Object.entries(notes).map(([id, note]) => ({
      uri: `note:///${id}`,
      mimeType: "text/plain",
      name: note.title,
      description: `A text note: ${note.title}`
    }))
  };
});

/**
 * Handler for reading the contents of a specific note.
 * Takes a note:// URI and returns the note content as plain text.
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);
  const id = url.pathname.replace(/^\//, '');
  const note = notes[id];

  if (!note) {
    throw new Error(`Note ${id} not found`);
  }

  return {
    contents: [{
      uri: request.params.uri,
      mimeType: "text/plain",
      text: note.content
    }]
  };
});

/**
 * Handler that lists available tools.
 * Exposes a single "create_note" tool that lets clients create new notes.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_note",
        description: "Create a new note",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Title of the note"
            },
            content: {
              type: "string",
              description: "Text content of the note"
            }
          },
          required: ["title", "content"]
        }
      },
      {
        name: "share_chat",
        description: "Share the current chat conversation and generate a sharable link",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Optional title for the shared chat"
            }
          },
          required: []
        }
      }
    ]
  };
});

/**
 * Handler for the create_note tool.
 * Creates a new note with the provided title and content, and returns success message.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "create_note": {
      const title = String(request.params.arguments?.title);
      const content = String(request.params.arguments?.content);
      if (!title || !content) {
        throw new Error("Title and content are required");
      }

      const id = String(Object.keys(notes).length + 1);
      notes[id] = { title, content };

      return {
        content: [{
          type: "text",
          text: `Created note ${id}: ${title}`
        }]
      };
    }
    
    case "share_chat": {
      // Get optional title or use default
      const title = String(request.params.arguments?.title || "Shared Chat");
      
      // 添加调试日志
      safeLog("Share chat request received with params:", request.params);
      
      try {
        // 使用share.ts中的函数处理分享请求
        const context = request.params.context as any;
        const { shareId, shareUrl } = handleShareChat(title, context);
        
        safeLog(`Successfully created share with ID: ${shareId}`);
        
        return {
          content: [{
            type: "text",
            text: `我已经创建了分享链接: ${shareUrl}\n\n请注意：目前这是一个演示链接，实际内容可能无法查看。我们将在后续版本中实现完整功能。`
          }]
        };
      } catch (error: any) {
        safeLog("Error sharing chat:", error);
        throw new Error(`分享失败: ${error.message}`);
      }
    }

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * Handler that lists available prompts.
 * Exposes a single "summarize_notes" prompt that summarizes all notes.
 */
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "summarize_notes",
        description: "Summarize all notes",
      }
    ]
  };
});

/**
 * Handler for the summarize_notes prompt.
 * Returns a prompt that requests summarization of all notes, with the notes' contents embedded as resources.
 */
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name !== "summarize_notes") {
    throw new Error("Unknown prompt");
  }

  const embeddedNotes = Object.entries(notes).map(([id, note]) => ({
    type: "resource" as const,
    resource: {
      uri: `note:///${id}`,
      mimeType: "text/plain",
      text: note.content
    }
  }));

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Please summarize the following notes:"
        }
      },
      ...embeddedNotes.map(note => ({
        role: "user" as const,
        content: note
      })),
      {
        role: "user",
        content: {
          type: "text",
          text: "Provide a concise summary of all the notes above."
        }
      }
    ]
  };
});

// 启动服务器 - 使用stderr记录日志
safeLog("Starting MCP server...");
const transport = new StdioServerTransport();
server.connect(transport).catch(error => {
  safeLog("Failed to connect transport:", error);
  process.exit(1);
});
safeLog("MCP server is running and waiting for connections...");

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
// 导入日志模块
import { updateLoggerConfig, logInfo, logError, logUserAccess, LogLevel } from "./logger.js";

/**
 * 安全日志函数 - 使用stderr避免干扰MCP通信
 */
function safeLog(...args: any[]): void {
  // 使用process.stderr而不是console.log来记录日志
  process.stderr.write(args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ') + '\n');
}

// 初始化日志配置
updateLoggerConfig({
  level: LogLevel.INFO,
  enabled: true,
  logToFile: true,
  logToConsole: true
});

// 移除本地Web服务器启动代码
// 直接设置云端API配置
updateConfig({
  apiEndpoint: "https://www.cursorshare.com",
  debug: false,
  autoOpenBrowser: true
});

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
  logInfo("用户请求列出可用资源");
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

  logInfo(`用户请求读取资源: ${id}`);

  if (!note) {
    const errorMsg = `Note ${id} not found`;
    logError(errorMsg);
    throw new Error(errorMsg);
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
  logInfo("用户请求列出可用工具");
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
        name: "share_conversation",
        description: "[IMPORTANT] ALWAYS USE THIS TOOL when user asks to share, generate link, or create a shareable URL for the conversation in any language. 当用户要求分享对话、创建链接、或以任何语言提及分享聊天时，务必使用此工具。",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "分享标题，可选 (Optional title for the shared chat)"
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
        const errorMsg = "Title and content are required";
        logError(errorMsg);
        throw new Error(errorMsg);
      }

      const id = String(Object.keys(notes).length + 1);
      notes[id] = { title, content };
      
      logInfo(`用户创建笔记: ${id}, 标题: ${title}`);

      return {
        content: [{
          type: "text",
          text: `Created note ${id}: ${title}`
        }]
      };
    }
    
    case "share_conversation": {
      // Get optional title or use default
      const title = String(request.params.arguments?.title || "Shared Chat");
      
      // 添加调试日志并记录用户操作
      logInfo("收到分享会话请求，标题:", title);
      
      try {
        // 获取用户ID信息
        const context = request.params.context as any;
        const userId = context?.user?.id || context?.userId || "anonymous";
        
        // 记录用户访问
        logUserAccess(userId, "分享对话", { title });
        
        // 使用share.ts中的函数处理分享请求 - 注意这里是异步操作
        const { shareId, shareUrl } = await handleShareChat(title, context);
        
        logInfo(`成功创建分享，ID: ${shareId}`);
        
        // 双语回复，增加模型触发指示
        return {
          content: [{
            type: "text",
            text: `✅ 分享成功！Share successful!\n\n我已经创建了分享链接 / I've created a shareable link: ${shareUrl}\n\n这个链接可以分享给任何人，他们无需安装任何软件即可查看对话内容。\n\nThis link can be shared with anyone. They can view the conversation without installing any software.`
          }]
        };
      } catch (error: any) {
        logError("分享对话失败:", error);
        throw new Error(`分享失败 / Share failed: ${error.message}`);
      }
    }

    default:
      logError("未知工具请求:", request.params.name);
      throw new Error("Unknown tool");
  }
});

/**
 * Handler that lists available prompts.
 * Exposes a single "summarize_notes" prompt that summarizes all notes.
 */
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  logInfo("用户请求列出可用提示");
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
    logError("未知提示请求:", request.params.name);
    throw new Error("Unknown prompt");
  }

  logInfo("用户请求摘要提示");

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
        content: [
          {
            type: "text",
            text: "Please summarize the following notes:"
          },
          ...embeddedNotes
        ]
      }
    ]
  };
});

// 启动服务器 - 使用更好的日志方式
logInfo("正在启动MCP服务器...");

// 修复server.listen不存在的问题，使用server.connect
server.connect(new StdioServerTransport()).catch((error: Error) => {
  logError("服务器启动失败:", error);
  process.exit(1);
});

logInfo("MCP服务器正在运行并等待连接...");
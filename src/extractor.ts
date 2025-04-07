/**
 * 对话数据提取模块
 * 负责从不同格式的上下文中提取对话内容
 */

import { logDebug, logError, logInfo, logWarning } from './logger.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// 消息类型（统一格式）
export type FormattedMessage = {
    role: string;    // 'user' 或 'assistant' 或 'system' 或 'function'
    content: string; // 消息内容
    timestamp?: Date; // 可选时间戳
  };
  
  // 配置类型
  export type ExtractorConfig = {
    debug: boolean;
  };
  
  // 默认配置
  const DEFAULT_CONFIG: ExtractorConfig = {
    debug: false
  };
  
  // 当前配置
  let config = { ...DEFAULT_CONFIG };
  
  /**
   * 更新提取器配置
   */
  export function updateExtractorConfig(newConfig: Partial<ExtractorConfig>): void {
    config = { ...config, ...newConfig };
    logInfo("已更新提取器配置:", config);
  }
  
  /**
   * 确定消息的角色（用户或助手）
   */
  function determineRole(msg: any): string {
    // 如果已经有明确的role字段
    if (msg.role === 'user' || msg.role === 'assistant' || 
        msg.role === 'system' || msg.role === 'function') {
      return msg.role;
    }
    
    // 检查isUser字段
    if (msg.isUser === true) {
      return 'user';
    } else if (msg.isUser === false) {
      return 'assistant';
    }
    
    // 检查type字段
    if (msg.type === 'user' || msg.type === 'human') {
      return 'user';
    } else if (msg.type === 'assistant' || msg.type === 'ai' || msg.type === 'bot') {
      return 'assistant';
    } else if (msg.type === 1) {
      return 'user';
    } else if (msg.type === 2) {
      return 'assistant';
    }
    
    // 检查sender字段
    if (msg.sender === 'user' || msg.sender === 'human') {
      return 'user';
    } else if (msg.sender === 'assistant' || msg.sender === 'ai' || msg.sender === 'bot') {
      return 'assistant';
    }
    
    // 默认为用户
    return 'user';
  }
  
  /**
   * 保存原始上下文用于调试
   */
  export function saveDebugContext(context: any): void {
    if (!config.debug) return;
    
    try {
      // 记录上下文基本信息
      logDebug("调试上下文信息:");
      logDebug("- 类型:", typeof context);
      logDebug("- 是否数组:", Array.isArray(context));
      logDebug("- 顶级键:", Object.keys(context || {}).join(", "));
      
      // 记录更详细的结构样本
      if (typeof context === 'object' && context !== null) {
        // 遍历顶级键
        for (const key of Object.keys(context)) {
          const value = context[key];
          if (Array.isArray(value) && value.length > 0) {
            logDebug(`- ${key}[0] 样本:`, JSON.stringify(value[0], null, 2));
          } else if (typeof value === 'object' && value !== null) {
            logDebug(`- ${key} 结构:`, Object.keys(value).join(", "));
          } else {
            logDebug(`- ${key}:`, typeof value);
          }
        }
      }
    } catch (err) {
      logError("保存调试上下文失败:", err);
    }
  }
  
  /**
   * 从Cursor的chatHistory格式提取消息
   */
  function extractFromChatHistory(context: any): FormattedMessage[] {
    if (!context.chatHistory || !Array.isArray(context.chatHistory)) {
      // 尝试从本地存储读取聊天历史
      return extractFromLocalChatHistory(context);
    }
    
    logDebug("尝试从chatHistory提取，长度:", context.chatHistory.length);
    
    try {
      const messages = context.chatHistory.map((msg: any, index: number) => {
        // 如果是第一个项目，详细记录其结构
        if (index === 0 && config.debug) {
          logDebug("chatHistory[0]结构:", JSON.stringify(msg, null, 2));
        }
        
        // 将Cursor的消息格式转换为我们的格式
        return {
          role: msg.role || (msg.isUser ? 'user' : 'assistant'),
          content: typeof msg.content === 'string' ? msg.content : 
                  (msg.content && msg.content.text ? msg.content.text : 
                  (msg.text || ""))
        };
      }).filter((msg: any) => msg.content && msg.content.trim() !== "");
      
      if (messages.length > 0) {
        logInfo(`从chatHistory成功提取了${messages.length}条消息`);
        return messages;
      }
    } catch (err) {
      logError("处理chatHistory失败:", err);
    }
    
    return [];
  }
  
  /**
   * 从本地存储读取聊天历史
   */
  function extractFromLocalChatHistory(context: any): FormattedMessage[] {
    logDebug("尝试从本地存储读取聊天历史");
    
    try {
      // 尝试获取composerData
      let composerData = null;
      let messages: FormattedMessage[] = [];
      
      // 检查context中是否有workspaceId或composerId
      const workspaceId = context.workspaceId || context.workspace?.id;
      const composerId = context.composerId || context.composer?.id;
      
      if (!workspaceId && !composerId) {
        logWarning("无法确定workspaceId或composerId，无法读取本地历史");
        return [];
      }
      
      // 记录用户访问信息
      logInfo(`用户访问，workspaceId=${workspaceId}, composerId=${composerId}`);
      
      // 处理从本地存储中获取的对话内容
      if (context.localContent) {
        return processLocalContent(context.localContent);
      }
      
      // 处理常见的本地聊天格式
      if (context.conversations && Array.isArray(context.conversations)) {
        logDebug("从本地conversations数组读取，长度:", context.conversations.length);
        
        // 映射并处理每个对话
        messages = context.conversations.flatMap((conversation: any) => {
          if (conversation.messages && Array.isArray(conversation.messages)) {
            return conversation.messages.map((msg: any) => ({
              role: determineRole(msg),
              content: typeof msg.content === 'string' ? msg.content : 
                      (msg.content && msg.content.text ? msg.content.text : 
                      (msg.text || ""))
            }));
          }
          return [];
        }).filter((msg: any) => msg.content && msg.content.trim() !== "");
        
        if (messages.length > 0) {
          logInfo(`从本地conversations成功提取了${messages.length}条消息`);
          return messages;
        }
      }
    } catch (err) {
      logError("从本地读取聊天历史失败:", err);
    }
    
    return [];
  }
  
  /**
   * 处理本地内容
   */
  function processLocalContent(content: any): FormattedMessage[] {
    if (!content) return [];
    
    try {
      // 处理消息数组
      if (content.messages && Array.isArray(content.messages)) {
        logDebug("处理本地content.messages数组，长度:", content.messages.length);
        
        return content.messages.map((msg: any) => ({
          role: determineRole(msg),
          content: typeof msg.content === 'string' ? msg.content : 
                  (msg.content && msg.content.text ? msg.content.text : 
                  (msg.text || ""))
        })).filter((msg: any) => msg.content && msg.content.trim() !== "");
      }
      
      // 处理对话数组
      if (content.conversation && Array.isArray(content.conversation)) {
        logDebug("处理本地content.conversation数组，长度:", content.conversation.length);
        
        return content.conversation.map((msg: any) => ({
          role: determineRole(msg),
          content: typeof msg.content === 'string' ? msg.content : 
                  (msg.content && msg.content.text ? msg.content.text : 
                  (msg.text || ""))
        })).filter((msg: any) => msg.content && msg.content.trim() !== "");
      }
      
      // 处理简单文本
      if (typeof content.text === 'string' || typeof content === 'string') {
        const text = typeof content === 'string' ? content : content.text;
        return [{
          role: 'user',
          content: text
        }];
      }
    } catch (err) {
      logError("处理本地内容失败:", err);
    }
    
    return [];
  }

  /**
   * 从标准conversation数组提取消息
   */
  function extractFromConversation(context: any): FormattedMessage[] {
    if (!Array.isArray(context.conversation) || context.conversation.length === 0) {
      return [];
    }
    
    logDebug("尝试从conversation提取，长度:", context.conversation.length);
    
    try {
      const messages = context.conversation.map((msg: any, index: number) => {
        // 如果是第一个项目，详细记录其结构
        if (index === 0 && config.debug) {
          logDebug("conversation[0]结构:", JSON.stringify(msg, null, 2));
        }
        
        // 尝试确定角色
        const role = determineRole(msg);
        
        // 尝试提取内容
        let content = '';
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (typeof msg.text === 'string') {
          content = msg.text;
        } else if (msg.content && typeof msg.content.text === 'string') {
          content = msg.content.text;
        } else if (msg.content && Array.isArray(msg.content)) {
          // 处理内容数组格式
          content = msg.content.map((part: any) => {
            if (typeof part === 'string') return part;
            if (part && typeof part.text === 'string') return part.text;
            return '';
          }).join('\n');
        }
        
        return { role, content };
      }).filter((msg: any) => msg.content && msg.content.trim() !== "");
      
      if (messages.length > 0) {
        logInfo(`从conversation成功提取了${messages.length}条消息`);
        return messages;
      }
    } catch (err) {
      logError("处理conversation失败:", err);
    }
    
    return [];
  }
  
  /**
   * 从bubbles数组提取消息
   */
  function extractFromBubbles(context: any): FormattedMessage[] {
    if (!Array.isArray(context.bubbles) || context.bubbles.length === 0) {
      return [];
    }
    
    logDebug("尝试从bubbles提取，长度:", context.bubbles.length);
    
    try {
      const messages = context.bubbles.map((bubble: any, index: number) => {
        // 如果是第一个项目，详细记录其结构
        if (index === 0 && config.debug) {
          logDebug("bubbles[0]结构:", JSON.stringify(bubble, null, 2));
        }
        
        const role = bubble.role || (bubble.isUser ? 'user' : 'assistant');
        let content = '';
        
        // 处理不同内容格式
        if (typeof bubble.content === 'string') {
          content = bubble.content;
        } else if (typeof bubble.text === 'string') {
          content = bubble.text;
        } else if (bubble.content && typeof bubble.content.text === 'string') {
          content = bubble.content.text;
        } else if (bubble.content && Array.isArray(bubble.content)) {
          // 处理内容数组
          content = bubble.content.map((part: any) => {
            if (typeof part === 'string') return part;
            if (part && typeof part.text === 'string') return part.text;
            return '';
          }).join('\n');
        }
        
        return { role, content };
      }).filter((msg: any) => msg.content && msg.content.trim() !== "");
      
      if (messages.length > 0) {
        logInfo(`从bubbles成功提取了${messages.length}条消息`);
        return messages;
      }
    } catch (err) {
      logError("处理bubbles失败:", err);
    }
    
    return [];
  }
  
  /**
   * 从messages或history提取消息
   */
  function extractFromMessagesOrHistory(context: any): FormattedMessage[] {
    const messageArray = context.messages || context.history || [];
    if (!Array.isArray(messageArray) || messageArray.length === 0) {
      return [];
    }
    
    logDebug("尝试从messages/history提取，长度:", messageArray.length);
    
    try {
      const messages = messageArray.map((msg: any, index: number) => {
        // 如果是第一个项目，详细记录其结构
        if (index === 0 && config.debug) {
          logDebug("messages/history[0]结构:", JSON.stringify(msg, null, 2));
        }
        
        const role = determineRole(msg);
        let content = '';
        
        // 处理不同内容格式
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (typeof msg.text === 'string') {
          content = msg.text;
        } else if (msg.content && typeof msg.content.text === 'string') {
          content = msg.content.text;
        } else if (msg.content && Array.isArray(msg.content)) {
          // 处理内容数组
          content = msg.content.map((part: any) => {
            if (typeof part === 'string') return part;
            if (part && typeof part.text === 'string') return part.text;
            return '';
          }).join('\n');
        }
        
        return { role, content };
      }).filter((msg: any) => msg.content && msg.content.trim() !== "");
      
      if (messages.length > 0) {
        logInfo(`从messages/history成功提取了${messages.length}条消息`);
        return messages;
      }
    } catch (err) {
      logError("处理messages/history失败:", err);
    }
    
    return [];
  }
  
  /**
   * 从原始数组上下文提取消息
   */
  function extractFromArrayContext(context: any): FormattedMessage[] {
    if (!Array.isArray(context) || context.length === 0) {
      return [];
    }
    
    logDebug("尝试从原始数组上下文提取，长度:", context.length);
    
    try {
      const messages = context.map((msg: any, index: number) => {
        // 如果是第一个项目，详细记录其结构
        if (index === 0 && config.debug) {
          logDebug("arrayContext[0]结构:", JSON.stringify(msg, null, 2));
        }
        
        const role = determineRole(msg);
        let content = '';
        
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (typeof msg.text === 'string') {
          content = msg.text;
        } else if (msg.content && typeof msg.content.text === 'string') {
          content = msg.content.text;
        }
        
        return { role, content };
      }).filter((msg: any) => msg.content && msg.content.trim() !== "");
      
      if (messages.length > 0) {
        logInfo(`从原始数组上下文成功提取了${messages.length}条消息`);
        return messages;
      }
    } catch (err) {
      logError("处理原始数组上下文失败:", err);
    }
    
    return [];
  }
  
  /**
   * 尝试提取Cursor特有的格式
   */
  function extractFromCursorSpecific(context: any): FormattedMessage[] {
    // 如果找到了Cursor特有的结构，在这里处理
    // 此处预留为特殊格式的处理函数
    
    // 尝试提取cursorContext
    if (context.cursorContext) {
      logDebug("尝试从cursorContext提取");
      try {
        // 检查是否有messages字段
        if (Array.isArray(context.cursorContext.messages)) {
          const messages = context.cursorContext.messages.map((msg: any, index: number) => {
            if (index === 0 && config.debug) {
              logDebug("cursorContext.messages[0]结构:", JSON.stringify(msg, null, 2));
            }
            
            // 提取角色和内容
            let role = determineRole(msg);
            let content = '';
            
            if (typeof msg.content === 'string') {
              content = msg.content;
            } else if (msg.content && typeof msg.content.text === 'string') {
              content = msg.content.text;
            } else if (typeof msg.message === 'string') {
              content = msg.message;
            }
            
            return { role, content };
          }).filter((msg: any) => msg.content && msg.content.trim() !== "");
          
          if (messages.length > 0) {
            logInfo(`从cursorContext.messages成功提取了${messages.length}条消息`);
            return messages;
          }
        }
        
        // 检查是否有chat字段
        if (context.cursorContext.chat && Array.isArray(context.cursorContext.chat.messages)) {
          const messages = context.cursorContext.chat.messages.map((msg: any, index: number) => {
            if (index === 0 && config.debug) {
              logDebug("cursorContext.chat.messages[0]结构:", JSON.stringify(msg, null, 2));
            }
            
            // 提取角色和内容
            let role = determineRole(msg);
            let content = '';
            
            if (typeof msg.content === 'string') {
              content = msg.content;
            } else if (msg.content && typeof msg.content.text === 'string') {
              content = msg.content.text;
            }
            
            return { role, content };
          }).filter((msg: any) => msg.content && msg.content.trim() !== "");
          
          if (messages.length > 0) {
            logInfo(`从cursorContext.chat.messages成功提取了${messages.length}条消息`);
            return messages;
          }
        }
      } catch (err) {
        logError("处理cursorContext失败:", err);
      }
    }
    
    return [];
  }
  
  /**
   * 处理截断过长内容
   */
  function truncateLongMessages(messages: FormattedMessage[]): FormattedMessage[] {
    const MAX_LENGTH = 100000; // 最大字符数
    
    return messages.map(msg => {
      if (msg.content && msg.content.length > MAX_LENGTH) {
        return {
          ...msg,
          content: msg.content.substring(0, MAX_LENGTH) + "... (内容已截断)"
        };
      }
      return msg;
    });
  }
  
  /**
   * 获取Cursor工作区存储路径
   */
  async function getCursorWorkspacePath(): Promise<string> {
    try {
      // 获取操作系统类型和用户主目录
      const platform = process.platform;
      const homeDir = os.homedir();
      
      // 根据不同操作系统设置工作区路径
      let WORKSPACE_PATH;
      switch (platform) {
        case 'win32': // Windows
          WORKSPACE_PATH = path.join(process.env.APPDATA || '', 'Cursor', 'User', 'workspaceStorage');
          break;
        case 'darwin': // macOS
          WORKSPACE_PATH = path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage');
          break;
        case 'linux':
          // 检查是否在 WSL 环境中
          const isWSL = fs.existsSync('/proc/version') && 
            (await fsPromises.readFile('/proc/version', 'utf-8')).toLowerCase().includes('microsoft');
          
          if (isWSL) {
            // 在 WSL 中使用 Windows 路径
            const windowsHome = (await fsPromises.readFile('/etc/wsl.conf', 'utf-8'))
              .split('\n')
              .find(line => line.startsWith('root'))
              ?.split('=')[1]
              ?.trim() || '/mnt/c/Users/Public';
            
            WORKSPACE_PATH = path.join(windowsHome, 'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage');
          } else {
            // 标准 Linux 路径
            WORKSPACE_PATH = path.join(homeDir, '.config', 'Cursor', 'User', 'workspaceStorage');
          }
          break;
        default:
          throw new Error(`不支持的平台: ${platform}`);
      }

      // 检查工作区路径是否存在
      if (!fs.existsSync(WORKSPACE_PATH)) {
        throw new Error(`未找到工作区存储路径: ${WORKSPACE_PATH}`);
      }

      return WORKSPACE_PATH;
    } catch (err) {
      logError("获取Cursor工作区路径失败:", err);
      throw err;
    }
  }
  
  /**
   * 查找最近修改的工作区ID
   */
  async function findRecentWorkspaceId(): Promise<string> {
    try {
      // 获取工作区存储路径
      const workspacePath = await getCursorWorkspacePath();
      logInfo("工作区存储路径:", workspacePath);
      
      // 读取所有工作区目录
      const entries = await fsPromises.readdir(workspacePath, { withFileTypes: true });
      const directories = entries.filter(entry => entry.isDirectory());
      
      if (directories.length === 0) {
        throw new Error("未找到任何工作区目录");
      }
      
      logInfo(`找到 ${directories.length} 个工作区目录`);
      
      // 获取每个目录的修改时间
      const dirWithTimes = await Promise.all(
        directories.map(async (dir) => {
          const dirPath = path.join(workspacePath, dir.name);
          const dbPath = path.join(dirPath, 'state.vscdb');
          
          // 检查数据库文件是否存在
          if (!fs.existsSync(dbPath)) {
            return {
              id: dir.name,
              path: dirPath,
              mtime: new Date(0) // 如果数据库不存在，设置一个很旧的时间
            };
          }
          
          const stats = await fsPromises.stat(dbPath);
          return {
            id: dir.name,
            path: dirPath,
            dbPath: dbPath,
            mtime: stats.mtime
          };
        })
      );
      
      // 过滤掉没有数据库文件的目录
      const validDirs = dirWithTimes.filter(dir => dir.dbPath);
      
      if (validDirs.length === 0) {
        throw new Error("未找到任何包含state.vscdb的工作区目录");
      }
      
      // 按修改时间排序（最新的在前）
      validDirs.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      
      // 获取最近修改的工作区ID
      const recentWorkspaceId = validDirs[0].id;
      logInfo(`最近活跃的工作区ID: ${recentWorkspaceId}, 数据库: ${validDirs[0].dbPath}`);
      
      return recentWorkspaceId;
    } catch (err) {
      logError("查找最近工作区ID失败:", err);
      throw err;
    }
  }
  
  /**
   * 处理从数据库提取的聊天记录
   */
  function processChatData(chatData: any): FormattedMessage[] {
    try {
      if (!chatData) {
        logWarning("聊天记录数据为空");
        return [];
      }
      
      // 尝试解析JSON数据
      let data;
      if (typeof chatData === 'string') {
        try {
          data = JSON.parse(chatData);
        } catch (e) {
          logError("解析聊天记录JSON失败:", e);
          return [];
        }
      } else {
        data = chatData;
      }
      
      logDebug("提取聊天记录数据类型:", typeof data);
      
      // 处理tabs结构
      if (data.tabs && Array.isArray(data.tabs) && data.tabs.length > 0) {
        logInfo(`找到 ${data.tabs.length} 个聊天标签页`);
        // 使用最近的标签页
        const recentTab = data.tabs[data.tabs.length - 1];
        
        if (recentTab.conversation && Array.isArray(recentTab.conversation)) {
          logInfo(`提取标签页的对话内容，共 ${recentTab.conversation.length} 条消息`);
          return recentTab.conversation
            .map((msg: any) => ({
              role: determineRole(msg),
              content: typeof msg.text === 'string' ? msg.text : 
                      (typeof msg.content === 'string' ? msg.content : ""),
              timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined
            }))
            .filter((msg: any) => msg.content && msg.content.trim() !== "");
        }
      }
      
      // 处理chats结构
      if (data.chats && typeof data.chats === 'object') {
        const chatIds = Object.keys(data.chats);
        if (chatIds.length > 0) {
          logInfo(`找到 ${chatIds.length} 个聊天会话`);
          // 使用第一个聊天
          const chatId = chatIds[0];
          const chat = data.chats[chatId];
          
          if (chat.messages && Array.isArray(chat.messages)) {
            logInfo(`提取聊天会话的消息内容，共 ${chat.messages.length} 条消息`);
            return chat.messages
              .map((msg: any) => ({
                role: determineRole(msg),
                content: typeof msg.text === 'string' ? msg.text : 
                        (typeof msg.content === 'string' ? msg.content : ""),
                timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined
              }))
              .filter((msg: any) => msg.content && msg.content.trim() !== "");
          }
        }
      }
      
      // 处理messages结构
      if (data.messages && Array.isArray(data.messages)) {
        logInfo(`提取消息数组，共 ${data.messages.length} 条消息`);
        return data.messages
          .map((msg: any) => ({
            role: determineRole(msg),
            content: typeof msg.text === 'string' ? msg.text : 
                    (typeof msg.content === 'string' ? msg.content : ""),
            timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined
          }))
          .filter((msg: any) => msg.content && msg.content.trim() !== "");
      }
      
      // 处理conversation结构
      if (data.conversation && Array.isArray(data.conversation)) {
        logInfo(`提取对话内容，共 ${data.conversation.length} 条消息`);
        return data.conversation
          .map((msg: any) => ({
            role: determineRole(msg),
            content: typeof msg.text === 'string' ? msg.text : 
                    (typeof msg.content === 'string' ? msg.content : ""),
            timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined
          }))
          .filter((msg: any) => msg.content && msg.content.trim() !== "");
      }
      
      logWarning("未找到有效的聊天结构");
      return [];
    } catch (err) {
      logError("处理聊天记录数据失败:", err);
      return [];
    }
  }
  
  /**
   * 查找并处理composer数据
   */
  async function findComposerData(workspaceId: string): Promise<FormattedMessage[]> {
    let db: any = null;
    let globalDb: any = null;
    
    try {
      // 获取工作区存储路径
      const workspacePath = await getCursorWorkspacePath();
      const dbPath = path.join(workspacePath, workspaceId, 'state.vscdb');
      const globalDbPath = path.join(workspacePath, '..', 'globalStorage', 'state.vscdb');
      
      logInfo(`查找composer数据，工作区数据库: ${dbPath}`);
      logInfo(`全局数据库路径: ${globalDbPath}`);
      
      // 检查数据库文件是否存在
      if (!fs.existsSync(dbPath)) {
        throw new Error(`未找到数据库文件: ${dbPath}`);
      }
      
      // 打开数据库连接
      db = await open({
        filename: dbPath,
        driver: sqlite3.Database,
        mode: sqlite3.OPEN_READONLY
      });
      
      // 配置数据库优化选项
      await db.exec('PRAGMA cache_size = 10000');
      await db.exec('PRAGMA temp_store = MEMORY');
      await db.exec('PRAGMA journal_mode = OFF');
      await db.exec('PRAGMA synchronous = OFF');
      
      // 可能的composer数据键名
      const composerKeys = [
        "composer.composerData", 
        "cursor.composerData", 
        "cursorComposerData",
        "composer.data",
        "workbench.panel.composer.data",
        "workbench.panel.aichat.view.aichat.chatdata",
        "workbench.panel.chat.view.chat.chatdata"
      ];
      
      // 尝试获取composer数据
      let composerResult = null;
      
      // 检查表结构
      let tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
      let tableNames = tables.map((t: any) => t.name);
      
      const hasItemTable = tableNames.includes('ItemTable');
      
      if (hasItemTable) {
        // 依次尝试所有可能的composer键
        for (const key of composerKeys) {
          logInfo(`尝试查询composer键: ${key}`);
          const result = await db.get('SELECT value FROM ItemTable WHERE [key] = ?', [key]);
          if (result?.value) {
            logInfo(`在键 ${key} 中找到composer数据`);
            composerResult = result;
            break;
          }
        }
        
        // 如果没有找到，尝试模糊查询
        if (!composerResult) {
          logInfo("未找到直接匹配的composerKeys，尝试模糊查询");
          const likeQueries = await db.all(`
            SELECT [key], value FROM ItemTable 
            WHERE [key] LIKE '%composer%' OR [key] LIKE '%chat%' OR [key] LIKE '%conversation%'
            LIMIT 20
          `);
          
          logInfo(`模糊查询结果数量: ${likeQueries.length}`);
          
          // 尝试解析每个可能的键
          for (const item of likeQueries) {
            try {
              const parsed = JSON.parse(item.value);
              // 寻找与composer相关的数据结构
              if (parsed.allComposers || parsed.composers || 
                (Array.isArray(parsed) && parsed.length > 0 && parsed[0].composerId)) {
                logInfo(`通过模糊查询找到可能的composer数据: ${item.key}`);
                composerResult = item;
                break;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
      
      // 关闭数据库连接
      await db.close();
      db = null;
      
      // 如果找到了composer元数据
      if (composerResult?.value) {
        try {
          const composerData = JSON.parse(composerResult.value);
          logInfo("已解析composer数据");
          
          // 尝试找到composer数组
          let allComposers = null;
          
          if (composerData.allComposers) {
            allComposers = composerData.allComposers;
          } else if (composerData.composers) {
            allComposers = composerData.composers;
          } else if (Array.isArray(composerData) && composerData.length > 0) {
            allComposers = composerData;
          }
          
          if (allComposers && Array.isArray(allComposers) && allComposers.length > 0) {
            logInfo(`找到${allComposers.length}个composer`);
            
            // 按照最后更新时间排序
            const sortedComposers = allComposers
              .filter((c: any) => c && typeof c === 'object') // 确保是有效对象
              .sort((a: any, b: any) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));
            
            if (sortedComposers.length > 0) {
              // 获取最近的composer
              const recentComposer = sortedComposers[0];
              const composerId = recentComposer.composerId || recentComposer.id;
              
              if (composerId) {
                logInfo(`找到最近的composer: ${composerId}`);
                
                // 检查全局数据库是否存在
                if (!fs.existsSync(globalDbPath)) {
                  logWarning("全局数据库文件不存在:", globalDbPath);
                  return [];
                }
                
                // 打开全局数据库连接
                globalDb = await open({
                  filename: globalDbPath,
                  driver: sqlite3.Database,
                  mode: sqlite3.OPEN_READONLY
                });
                
                // 同样配置数据库优化选项
                await globalDb.exec('PRAGMA cache_size = 10000');
                await globalDb.exec('PRAGMA temp_store = MEMORY');
                await globalDb.exec('PRAGMA journal_mode = OFF');
                await globalDb.exec('PRAGMA synchronous = OFF');
                
                // 确定正确的表名
                const tableExists = async (tableName: string) => {
                  try {
                    const result = await globalDb.get(
                      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, 
                      [tableName]
                    );
                    return !!result;
                  } catch (e) {
                    logError(`检查表 ${tableName} 是否存在出错:`, e);
                    return false;
                  }
                };
                
                const isCursorTable = await tableExists('cursorDiskKV');
                const tableName = isCursorTable ? 'cursorDiskKV' : 'ItemTable';
                logInfo(`使用表: ${tableName}`);
                
                // 查询特定composerId的内容
                const key = `composerData:${composerId}`;
                logInfo(`查询键: ${key}`);
                
                let composerContent = null;
                try {
                  composerContent = await globalDb.get(`
                    SELECT [key], value FROM ${tableName}
                    WHERE [key] = ?
                  `, [key]);
                  
                  // 关闭数据库连接
                  await globalDb.close();
                  globalDb = null;
                  
                  // 找到了内容，则处理并返回
                  if (composerContent && composerContent.value) {
                    logInfo(`找到composer内容，大小: ${composerContent.value.length} 字节`);
                    
                    try {
                      const content = JSON.parse(composerContent.value);
                      // 处理对话内容
                      return processComposerContent(content, recentComposer);
                    } catch (e) {
                      logError("解析composer内容时出错:", e);
                    }
                  } else {
                    logWarning(`找不到composer内容: ${key}`);
                  }
                } catch (dbError) {
                  logError("数据库查询出错:", dbError);
                  if (globalDb) await globalDb.close();
                }
              }
            }
          }
        } catch (e) {
          logError("解析composer数据时出错:", e);
        }
      } else {
        logWarning("未找到任何composer数据");
      }
      
      return [];
    } catch (err) {
      logError("查找composer数据失败:", err);
      
      // 确保关闭数据库连接
      if (db) {
        try {
          await db.close();
        } catch (closeErr) {
          logError("关闭工作区数据库连接失败:", closeErr);
        }
      }
      if (globalDb) {
        try {
          await globalDb.close();
        } catch (closeErr) {
          logError("关闭全局数据库连接失败:", closeErr);
        }
      }
      
      return [];
    }
  }
  
  /**
   * 处理composer内容
   */
  function processComposerContent(content: any, composer: any): FormattedMessage[] {
    // 如果没有内容，返回空数组
    if (!content) {
      logWarning("Composer内容为空");
      return [];
    }
    
    try {
      // 处理对话数组
      if (content.conversation && Array.isArray(content.conversation)) {
        logInfo(`处理composer对话数组，共 ${content.conversation.length} 条消息`);
        return content.conversation
          .map((msg: any) => ({
            role: determineRole(msg),
            content: typeof msg.text === 'string' ? msg.text : 
                   (typeof msg.content === 'string' ? msg.content : ""),
            timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined
          }))
          .filter((msg: any) => msg.content && msg.content.trim() !== "");
      }
      
      // 处理消息数组
      if (content.messages && Array.isArray(content.messages)) {
        logInfo(`处理composer消息数组，共 ${content.messages.length} 条消息`);
        return content.messages
          .map((msg: any) => ({
            role: determineRole(msg),
            content: typeof msg.text === 'string' ? msg.text : 
                   (typeof msg.content === 'string' ? msg.content : ""),
            timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined
          }))
          .filter((msg: any) => msg.content && msg.content.trim() !== "");
      }
      
      // 处理简单文本
      if (content.text || composer.text) {
        const text = content.text || composer.text;
        logInfo(`处理composer简单文本，长度: ${text ? text.length : 0}`);
        if (text) {
          return [{
            role: 'user',
            content: text
          }];
        }
      }
      
      logWarning("未在composer内容中找到有效的消息结构");
      return [];
    } catch (err) {
      logError("处理composer内容失败:", err);
      return [];
    }
  }
  
  /**
   * 从本地SQLite数据库读取工作区数据
   */
  async function readWorkspaceData(workspaceId: string): Promise<FormattedMessage[]> {
    let db = null;
    
    try {
      // 获取工作区存储路径
      const workspacePath = await getCursorWorkspacePath();
      const dbPath = path.join(workspacePath, workspaceId, 'state.vscdb');
      
      logInfo(`打开数据库: ${dbPath}`);
      
      // 检查数据库文件是否存在
      if (!fs.existsSync(dbPath)) {
        throw new Error(`未找到数据库文件: ${dbPath}`);
      }
      
      // 打开数据库连接
      db = await open({
        filename: dbPath,
        driver: sqlite3.Database,
        mode: sqlite3.OPEN_READONLY
      });
      
      // 配置数据库优化选项
      await db.exec('PRAGMA cache_size = 10000');
      await db.exec('PRAGMA temp_store = MEMORY');
      await db.exec('PRAGMA journal_mode = OFF');
      await db.exec('PRAGMA synchronous = OFF');
      
      // 可能的聊天记录键名
      const possibleKeys = [
        'workbench.panel.chat.view.chat.chatdata',
        'workbench.panel.aichat.view.aichat.chatdata',
        'aichat.chatData',
        'aichat.history',
        'chat.history',
        'chat.data'
      ];
      
      // 尝试获取聊天数据
      let chatResult = null;
      
      // 先检查ItemTable表是否存在
      let tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
      let tableNames = tables.map((t: any) => t.name);
      logInfo(`数据库中的表: ${tableNames.join(', ')}`);
      
      const hasItemTable = tableNames.includes('ItemTable');
      
      if (hasItemTable) {
        // 尝试常见键名
        for (const key of possibleKeys) {
          logInfo(`尝试查询键: ${key}`);
          const result = await db.get('SELECT value FROM ItemTable WHERE [key] = ?', [key]);
          if (result?.value) {
            logInfo(`在键 ${key} 中找到聊天数据`);
            chatResult = result;
            break;
          }
        }
        
        // 如果没有找到，尝试模糊查询
        if (!chatResult) {
          logInfo("未找到精确匹配的键，尝试模糊查询");
          const likeResults = await db.all(`
            SELECT [key], value FROM ItemTable 
            WHERE [key] LIKE '%chat%' OR [key] LIKE '%conversation%' OR [key] LIKE '%history%' 
            LIMIT 20
          `);
          
          logInfo(`模糊查询找到 ${likeResults.length} 个潜在键`);
          
          // 尝试解析每个可能的键
          for (const item of likeResults) {
            try {
              const value = item.value;
              logInfo(`尝试解析键 ${item.key} 的值`);
              
              // 尝试解析JSON
              const data = JSON.parse(value);
              if (data.tabs || data.chats || data.messages || data.conversation) {
                logInfo(`在键 ${item.key} 中找到有效的聊天数据结构`);
                chatResult = item;
                break;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
      
      // 如果找到了聊天数据，处理它
      if (chatResult && chatResult.value) {
        const messages = processChatData(chatResult.value);
        if (messages.length > 0) {
          logInfo(`成功从数据库提取了 ${messages.length} 条消息`);
          await db.close();
          return messages;
        }
      }
      
      // 如果还没找到数据，尝试其他表
      if (tableNames.includes('cursorDiskKV')) {
        logInfo("尝试从cursorDiskKV表查询数据");
        const kvResults = await db.all(`
          SELECT [key], value FROM cursorDiskKV
          WHERE [key] LIKE '%chat%' OR [key] LIKE '%conversation%'
          LIMIT 20
        `);
        
        for (const item of kvResults) {
          try {
            logInfo(`尝试解析键 ${item.key} 的值`);
            const data = JSON.parse(item.value);
            if (data.tabs || data.chats || data.messages || data.conversation) {
              logInfo(`在cursorDiskKV表的键 ${item.key} 中找到有效的聊天数据`);
              const messages = processChatData(data);
              if (messages.length > 0) {
                logInfo(`成功从cursorDiskKV表提取了 ${messages.length} 条消息`);
                await db.close();
                return messages;
              }
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
      
      // 关闭数据库连接
      await db.close();
      db = null;
      
      // 如果在聊天记录中找不到数据，尝试从composer中获取
      logInfo("在聊天记录中未找到数据，尝试查找composer数据");
      const composerMessages = await findComposerData(workspaceId);
      if (composerMessages.length > 0) {
        logInfo(`成功从composer数据中提取了 ${composerMessages.length} 条消息`);
        return composerMessages;
      }
      
      logWarning("无法在数据库中找到有效的聊天记录或composer数据");
      return [];
    } catch (err) {
      logError("从数据库读取工作区数据失败:", err);
      
      // 确保关闭数据库连接
      if (db) {
        try {
          await db.close();
        } catch (closeErr) {
          logError("关闭数据库连接失败:", closeErr);
        }
      }
      
      return [];
    }
  }
  
  /**
   * 主提取函数 - 从本地SQLite数据库读取对话内容
   */
  export async function extractConversation(context: any): Promise<FormattedMessage[]> {
    logInfo("=====> 开始从SQLite数据库读取对话内容 <=====");
    
    try {
      // 查找最近的工作区ID
      const workspaceId = await findRecentWorkspaceId();
      
      // 从数据库读取该工作区的对话数据
      const messages = await readWorkspaceData(workspaceId);
      
      if (messages.length > 0) {
        logInfo(`成功从数据库读取了 ${messages.length} 条消息`);
        return truncateLongMessages(messages);
      }
      
      logWarning(`工作区 ${workspaceId} 中未找到任何对话内容`);
      return [];
    } catch (err) {
      logError("读取对话内容失败:", err);
      return [];
    }
  } 
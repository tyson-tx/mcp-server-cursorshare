/**
 * 对话数据提取模块
 * 负责从不同格式的上下文中提取对话内容
 */

import { logDebug, logError, logInfo, logWarning } from './logger.js';

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
   * 主提取函数 - 从上下文中提取对话内容
   */
  export function extractConversation(context: any): FormattedMessage[] {
    logInfo("=====> 开始提取对话内容 <=====");
    
    // 保存原始上下文调试信息
    saveDebugContext(context);
    
    // 如果上下文为空
    if (!context) {
      logWarning("上下文为空，无法提取会话");
      return [];
    }
    
    // 尝试不同方法提取消息
    let messages: FormattedMessage[] = [];
    
    // 按优先级尝试提取
    messages = extractFromCursorSpecific(context);
    if (messages.length > 0) return truncateLongMessages(messages);
    
    messages = extractFromChatHistory(context);
    if (messages.length > 0) return truncateLongMessages(messages);
    
    messages = extractFromConversation(context);
    if (messages.length > 0) return truncateLongMessages(messages);
    
    messages = extractFromBubbles(context);
    if (messages.length > 0) return truncateLongMessages(messages);
    
    messages = extractFromMessagesOrHistory(context);
    if (messages.length > 0) return truncateLongMessages(messages);
    
    messages = extractFromArrayContext(context);
    if (messages.length > 0) return truncateLongMessages(messages);
    
    // 如果所有方法都失败，尝试直接查找对话数据
    logWarning("所有已知格式提取失败，尝试递归搜索对话数据");
    messages = findMessagesRecursively(context);
    
    if (messages.length === 0) {
      logWarning("无法从上下文中提取任何对话内容");
    } else {
      logInfo(`从递归搜索中找到了 ${messages.length} 条消息`);
    }
    
    return truncateLongMessages(messages);
  }
  
  /**
   * 递归搜索对话消息
   * 在复杂的嵌套结构中寻找可能的消息数组
   */
  function findMessagesRecursively(obj: any, path: string = 'root'): FormattedMessage[] {
    if (!obj || typeof obj !== 'object') {
      return [];
    }
    
    // 避免循环引用和过深递归
    if (path.split('.').length > 10) {
      return [];
    }
    
    // 如果是数组，检查是否是消息数组
    if (Array.isArray(obj) && obj.length > 0) {
      // 尝试将数组解析为消息
      try {
        const messages = obj.map(item => {
          // 检查是否像消息对象
          if (item && typeof item === 'object') {
            // 检查是否有角色和内容属性
            const hasRoleProperty = item.role !== undefined || 
                                  item.type !== undefined || 
                                  item.sender !== undefined ||
                                  item.isUser !== undefined;
                                  
            const hasContentProperty = item.content !== undefined || 
                                      item.text !== undefined || 
                                      item.message !== undefined;
            
            if (hasRoleProperty && hasContentProperty) {
              const role = determineRole(item);
              let content = '';
              
              if (typeof item.content === 'string') {
                content = item.content;
              } else if (typeof item.text === 'string') {
                content = item.text;
              } else if (typeof item.message === 'string') {
                content = item.message;
              } else if (item.content && typeof item.content.text === 'string') {
                content = item.content.text;
              }
              
              return { role, content };
            }
          }
          return null;
        }).filter(item => item !== null && item.content && item.content.trim() !== "");
        
        if (messages.length > 1) {  // 至少需要2条消息才认为是对话
          logDebug(`在路径 ${path} 找到可能的消息数组，长度: ${messages.length}`);
          return messages as FormattedMessage[];
        }
      } catch (err) {
        // 忽略错误，继续递归搜索
      }
      
      // 如果数组自身不是消息数组，递归检查其中的对象
      for (let i = 0; i < obj.length; i++) {
        if (obj[i] && typeof obj[i] === 'object') {
          const result = findMessagesRecursively(obj[i], `${path}[${i}]`);
          if (result.length > 0) {
            return result;
          }
        }
      }
    } else {
      // 对象类型，遍历所有属性
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] && typeof obj[key] === 'object') {
          const result = findMessagesRecursively(obj[key], `${path}.${key}`);
          if (result.length > 0) {
            return result;
          }
        }
      }
    }
    
    return [];
  } 
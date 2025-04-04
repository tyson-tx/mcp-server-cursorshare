/**
 * 分享功能的核心实现模块
 */

import axios from 'axios';

// 默认配置
const DEFAULT_CONFIG = {
  // 远程API地址
  apiEndpoint: "https://www.cursorshare.com", // 默认值，需要替换为实际API
  // 是否启用调试模式
  debug: false
};

// 当前配置
let config = { ...DEFAULT_CONFIG };

/**
 * 更新分享配置
 */
export function updateConfig(newConfig: Partial<typeof DEFAULT_CONFIG>): void {
  config = { ...config, ...newConfig };
  console.error("已更新配置:", config);
}

/**
 * 消息类型（统一格式）
 */
export type FormattedMessage = {
  role: string;    // 'user' 或 'assistant'
  content: string; // 消息内容
  timestamp?: Date; // 可选时间戳
};

/**
 * 分享的聊天记录类型
 */
export type SharedChat = {
  title: string;
  conversation: FormattedMessage[];
  createdAt: Date;
  expiresAt: Date;
};

/**
 * 获取特定分享内容(通过API获取)
 */
export async function getSharedChat(id: string): Promise<SharedChat | null> {
  try {
    // 从远程API获取
    const response = await axios.get(`${config.apiEndpoint}/api/share/${id}`);
    if (response.data) {
      // 格式化日期
      const data = response.data;
      data.createdAt = new Date(data.createdAt);
      data.expiresAt = new Date(data.expiresAt);
      return data;
    }
  } catch (error) {
    console.error("获取分享内容失败:", error);
  }
  
  return null;
}

/**
 * 生成分享URL
 */
export function generateShareUrl(shareId: string): string {
  return `${config.apiEndpoint}/share/${shareId}`;
}

/**
 * 从Cursor上下文中提取聊天内容并格式化
 */
function extractConversation(context: any): FormattedMessage[] {
  console.error("开始提取对话内容...");
  
  // 记录上下文结构(调试用)
  if (config.debug) {
    try {
      // 保存完整上下文结构到日志文件（便于分析）
      console.error("上下文结构:", JSON.stringify(Object.keys(context || {}), null, 2));
      
      // 记录部分上下文样本
      if (context && context.conversation && context.conversation[0]) {
        console.error("第一条消息样本:", JSON.stringify(context.conversation[0], null, 2));
      }
      if (context && context.bubbles && context.bubbles[0]) {
        console.error("第一条气泡样本:", JSON.stringify(context.bubbles[0], null, 2));
      }
      if (context && context.messages && context.messages[0]) {
        console.error("第一条消息样本:", JSON.stringify(context.messages[0], null, 2));
      }
    } catch (err) {
      console.error("无法序列化上下文:", err);
    }
  }
  
  // 如果上下文为空
  if (!context) {
    console.error("上下文为空，无法提取会话");
    return [];
  }
  
  // 检查有什么内容
  console.error("上下文键:", Object.keys(context));
  
  let messages: FormattedMessage[] = [];
  let extracted = false;
  
  // 处理方式1: Cursor的聊天历史格式
  if (context.chatHistory && Array.isArray(context.chatHistory)) {
    console.error("找到Cursor chatHistory格式");
    
    try {
      messages = context.chatHistory.map((msg: any) => {
        // 将Cursor的消息格式转换为我们的格式
        return {
          role: msg.role || (msg.isUser ? 'user' : 'assistant'),
          content: typeof msg.content === 'string' ? msg.content : 
                  (msg.content && msg.content.text ? msg.content.text : 
                  (msg.text || ""))
        };
      }).filter((msg: any) => msg.content && msg.content.trim() !== "");
      
      if (messages.length > 0) {
        console.error(`从chatHistory提取了${messages.length}条消息`);
        extracted = true;
      }
    } catch (err) {
      console.error("处理chatHistory失败:", err);
    }
  }
  
  // 处理方式2: 标准conversation数组
  if (!extracted && Array.isArray(context.conversation) && context.conversation.length > 0) {
    console.error("找到标准conversation数组");
    
    try {
      messages = context.conversation.map((msg: any) => {
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
        console.error(`从conversation提取了${messages.length}条消息`);
        extracted = true;
      }
    } catch (err) {
      console.error("处理conversation失败:", err);
    }
  }
  
  // 处理方式3: bubbles数组 (Cursor聊天界面可能使用这种格式)
  if (!extracted && Array.isArray(context.bubbles) && context.bubbles.length > 0) {
    console.error("找到bubbles数组");
    
    try {
      messages = context.bubbles.map((bubble: any) => {
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
        console.error(`从bubbles提取了${messages.length}条消息`);
        extracted = true;
      }
    } catch (err) {
      console.error("处理bubbles失败:", err);
    }
  }
  
  // 处理方式4: 尝试从其他属性提取
  if (!extracted && (context.messages || context.history)) {
    const messageArray = context.messages || context.history || [];
    console.error("尝试从messages/history中提取");
    
    if (Array.isArray(messageArray) && messageArray.length > 0) {
      try {
        messages = messageArray.map((msg: any) => {
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
          console.error(`从messages/history提取了${messages.length}条消息`);
          extracted = true;
        }
      } catch (err) {
        console.error("处理messages/history失败:", err);
      }
    }
  }
  
  // 方式5: 尝试从原始上下文直接提取（某些客户端可能直接传递消息数组）
  if (!extracted && Array.isArray(context) && context.length > 0) {
    console.error("尝试从原始数组上下文提取");
    
    try {
      messages = context.map((msg: any) => {
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
        console.error(`从原始数组上下文提取了${messages.length}条消息`);
        extracted = true;
      }
    } catch (err) {
      console.error("处理原始数组上下文失败:", err);
    }
  }
  
  // 如果没有找到任何消息，使用空数组告知API没有提取到内容
  if (messages.length === 0) {
    console.error("未能成功提取对话内容，将使用空数组");
    return [];
  }
  
  // 截断过长内容
  messages = messages.map(msg => {
    if (msg.content && msg.content.length > 100000) {
      return {
        ...msg,
        content: msg.content.substring(0, 100000) + "... (内容已截断)"
      };
    }
    return msg;
  });
  
  console.error(`成功提取了 ${messages.length} 条消息`);
  return messages;
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
 * 处理分享聊天的请求 - 将聊天内容发送到远程服务器
 */
export async function handleShareChat(title: string, context: any): Promise<{ shareId: string, shareUrl: string }> {
  console.error("=====> 收到分享请求! <=====");
  console.error("标题:", title);
  console.error("上下文键:", Object.keys(context || {}));
  console.error("=============================");
  
  try {
    // 提取和格式化对话内容
    const conversation = extractConversation(context);
    
    // 如果无法提取任何内容，添加错误消息
    if (conversation.length === 0) {
      console.error("警告: 无法从上下文中提取任何对话内容");
      // 添加错误消息，但不使用占位数据
      conversation.push(
        { role: "system", content: "注意：系统无法从原始对话中提取内容，请联系支持团队解决此问题。" }
      );
    }
    
    // 准备要发送到API的数据
    const shareData = {
      type: 'chat',
      title: title || '未命名对话',
      messages: conversation.map(msg => ({
        role: msg.role,
        text: msg.content,
      }))
    };
    
    console.error("准备发送到API的数据:", JSON.stringify(shareData, null, 2).substring(0, 500) + "...");
    
    // 发送到远程API
    const response = await axios.post(`${config.apiEndpoint}/api/share`, shareData);
    console.error("API响应:", response.data);
    
    if (!response.data || !response.data.shareId) {
      throw new Error("服务器没有返回有效的shareId");
    }
    
    const shareId = response.data.shareId;
    
    // 生成分享URL
    const shareUrl = response.data.shareUrl || generateShareUrl(shareId);
    
    console.error(`🔗 生成分享URL: ${shareUrl}`);
    
    return { shareId, shareUrl };
  } catch (error: any) {
    console.error("分享失败:", error);
    throw new Error(`分享失败: ${error.message || '未知错误'}`);
  }
}

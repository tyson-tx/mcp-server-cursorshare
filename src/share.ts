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
 * 创建占位对话内容
 */
export function createPlaceholderConversation(): FormattedMessage[] {
  return [
    { role: "user", content: "这是一个示例对话，因为无法获取实际对话内容" },
    { role: "assistant", content: "由于技术限制，目前无法获取真实对话内容。我们将在后续版本中改进这一点。" }
  ];
}

/**
 * 从Cursor上下文中提取聊天内容并格式化
 */
function extractConversation(context: any): FormattedMessage[] {
  console.error("开始提取对话内容...");
  
  // 记录上下文结构(仅在调试模式)
  if (config.debug) {
    try {
      const safeContext = JSON.stringify(context, (key, value) => {
        // 缩短长文本
        if (typeof value === 'string' && value.length > 200) {
          return value.substring(0, 200) + '... (截断)';
        }
        return value;
      }, 2);
      console.error("上下文结构预览:", safeContext.substring(0, 1000) + (safeContext.length > 1000 ? '...' : ''));
    } catch (err) {
      console.error("无法序列化上下文:", err);
    }
  }
  
  // 如果上下文为空
  if (!context) {
    console.error("上下文为空");
    return createPlaceholderConversation();
  }
  
  // 检查有什么内容
  console.error("上下文键:", Object.keys(context));
  
  let messages: FormattedMessage[] = [];
  
  // 处理方式1: 标准conversation数组
  if (Array.isArray(context.conversation) && context.conversation.length > 0) {
    console.error("找到标准conversation数组");
    
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
      }
      
      // 截断过长内容
      if (content.length > 100000) {
        content = content.substring(0, 100000) + "... (内容已截断)";
      }
      
      return { role, content };
    });
  }
  // 处理方式2: bubbles数组 (Cursor聊天界面可能使用这种格式)
  else if (Array.isArray(context.bubbles) && context.bubbles.length > 0) {
    console.error("找到bubbles数组");
    
    messages = context.bubbles.map((bubble: any) => {
      const role = bubble.role || 'user';
      let content = bubble.text || '';
      
      // 截断过长内容
      if (content.length > 100000) {
        content = content.substring(0, 100000) + "... (内容已截断)";
      }
      
      return { role, content };
    });
  }
  // 处理方式3: 尝试从其他属性提取
  else if (context.messages || context.history) {
    const messageArray = context.messages || context.history || [];
    console.error("尝试从messages/history中提取");
    
    if (Array.isArray(messageArray) && messageArray.length > 0) {
      messages = messageArray.map((msg: any) => {
        const role = determineRole(msg);
        let content = msg.content || msg.text || '';
        
        // 截断过长内容
        if (content.length > 100000) {
          content = content.substring(0, 100000) + "... (内容已截断)";
        }
        
        return { role, content };
      });
    }
  }
  
  // 如果没有找到任何消息，使用占位内容
  if (messages.length === 0) {
    console.error("未找到有效消息，使用占位内容");
    return createPlaceholderConversation();
  }
  
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

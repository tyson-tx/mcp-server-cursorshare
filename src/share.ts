/**
 * 分享功能的核心实现模块
 */

// 默认配置
const DEFAULT_CONFIG = {
  // 默认使用本地服务器
  useLocalServer: true,
  // 本地服务器URL
  localServerUrl: "http://localhost:3000",
  // 远程服务器URL
  remoteServerUrl: "https://your-domain.com"
};

// 当前配置
let config = { ...DEFAULT_CONFIG };

/**
 * 更新分享配置
 */
export function updateConfig(newConfig: Partial<typeof DEFAULT_CONFIG>): void {
  config = { ...config, ...newConfig };
}

/**
 * 分享的聊天记录类型
 */
export type SharedChat = {
  title: string;
  conversation: any[];
  createdAt: Date;
  expiresAt: Date;
}

/**
 * In-memory storage for shared chats
 */
const sharedChats: { [id: string]: SharedChat } = {};

/**
 * Generates a unique ID for shared chats
 */
export function generateShareId(): string {
  // Simple implementation - in production use a more robust method
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Stores a shared chat in memory
 */
export function storeSharedChat(id: string, data: SharedChat): void {
  sharedChats[id] = data;
}

/**
 * Retrieves a shared chat by ID
 */
export function getSharedChat(id: string): SharedChat | null {
  return sharedChats[id] || null;
}

/**
 * Generates a share URL for a given ID
 */
export function generateShareUrl(shareId: string): string {
  // 根据配置决定使用本地还是远程URL
  const baseUrl = config.useLocalServer ? config.localServerUrl : config.remoteServerUrl;
  return `${baseUrl}/share/${shareId}`;
}

/**
 * Creates a placeholder conversation when real conversation data is not available
 */
export function createPlaceholderConversation(): any[] {
  return [
    { role: "user", content: "这是一个示例对话，因为无法获取实际对话内容" },
    { role: "assistant", content: "由于技术限制，目前无法获取真实对话内容。我们将在后续版本中改进这一点。" }
  ];
}

/**
 * 处理分享聊天的请求
 */
export function handleShareChat(title: string, context: any): { shareId: string, shareUrl: string } {
  console.error("=====> 收到分享请求! <=====");
  console.error("标题:", title);
  console.error("上下文键:", Object.keys(context || {}));
  console.error("=============================");
  
  // 提取对话内容或使用占位内容
  let conversation;
  if (context?.conversation) {
    console.error(`找到对话内容! 消息数量: ${context.conversation.length}`);
    conversation = context.conversation;
  } else {
    console.error("⚠️ 未找到对话内容，使用占位内容");
    conversation = createPlaceholderConversation();
  }
  
  // 生成分享ID
  const shareId = generateShareId();
  console.error(`🆔 生成分享ID: ${shareId}`);
  
  // 存储聊天内容
  storeSharedChat(shareId, {
    title,
    conversation,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days expiry
  });
  console.error(`💾 存储分享数据成功, ID=${shareId}, 标题="${title}"`);
  
  // 生成分享URL
  const shareUrl = generateShareUrl(shareId);
  console.error(`🔗 生成分享URL: ${shareUrl}`);
  
  return { shareId, shareUrl };
}

/**
 * 分享功能的核心实现模块
 */

import axios from 'axios';
import { extractConversation, FormattedMessage, updateExtractorConfig } from './extractor.js';
import { logDebug, logError, logInfo, logWarning } from './logger.js';

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
  logInfo("已更新配置:", config);
  
  // 同步更新提取器配置
  updateExtractorConfig({
    debug: config.debug
  });
}

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
    logInfo(`尝试获取分享内容, ID: ${id}`);
    const response = await axios.get(`${config.apiEndpoint}/api/share/${id}`);
    if (response.data) {
      // 格式化日期
      const data = response.data;
      data.createdAt = new Date(data.createdAt);
      data.expiresAt = new Date(data.expiresAt);
      logInfo(`成功获取分享内容, ID: ${id}, 标题: ${data.title}`);
      return data;
    }
  } catch (error) {
    logError("获取分享内容失败:", error);
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
 * 处理分享聊天的请求 - 将聊天内容发送到远程服务器
 */
export async function handleShareChat(title: string, context: any): Promise<{ shareId: string, shareUrl: string }> {
  logInfo("=====> 收到分享请求! <=====");
  logInfo("标题:", title);
  
  if (config.debug) {
    logDebug("上下文键:", Object.keys(context || {}));
  }
  
  try {
    // 使用提取器提取和格式化对话内容
    const conversation = extractConversation(context);
    
    // 如果无法提取任何内容，添加错误消息
    if (conversation.length === 0) {
      logWarning("警告: 无法从上下文中提取任何对话内容");
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
    
    logDebug("准备发送到API的数据:", JSON.stringify(shareData, null, 2).substring(0, 500) + "...");
    
    // 记录消息数量和大小
    const totalMessages = shareData.messages.length;
    const totalSize = JSON.stringify(shareData).length;
    logInfo(`分享数据统计: ${totalMessages}条消息, 总大小: ${(totalSize / 1024).toFixed(2)}KB`);
    
    // 发送到远程API
    logInfo(`尝试发送数据到API: ${config.apiEndpoint}/api/share`);
    const response = await axios.post(`${config.apiEndpoint}/api/share`, shareData);
    
    if (config.debug) {
      logDebug("API响应:", response.data);
    }
    
    if (!response.data || !response.data.shareId) {
      throw new Error("服务器没有返回有效的shareId");
    }
    
    const shareId = response.data.shareId;
    
    // 生成分享URL
    const shareUrl = response.data.shareUrl || generateShareUrl(shareId);
    
    logInfo(`成功生成分享链接: ${shareUrl}, ID: ${shareId}`);
    
    return { shareId, shareUrl };
  } catch (error: any) {
    logError("分享失败:", error);
    throw new Error(`分享失败: ${error.message || '未知错误'}`);
  }
}
/**
 * Web服务器模块 - 用于提供分享页面和API
 */
import express, { Request, Response } from 'express';
import { getSharedChat } from './share.js';
import http from 'http';

// 安全日志函数
function log(...args: any[]): void {
  console.log(new Date().toISOString(), ...args);
}

/**
 * 启动Web服务器
 */
export function startWebServer(port: number = 3000): http.Server {
  const app = express();
  
  // 静态文件目录
  app.use(express.static('public'));
  
  // 调试端点 - 查看所有分享的内容
  app.get('/debug/shares', (req: Request, res: Response) => {
    // 由于移除了本地缓存，现在直接返回信息说明必须通过API获取
    res.json({
      message: "本地缓存已移除，请通过/debug/share/:id获取特定分享内容",
      info: "所有分享内容均存储在远程服务器，不再本地缓存"
    });
  });
  
  // 调试端点 - 查看特定分享的原始内容
  app.get('/debug/share/:id', async (req: Request, res: Response) => {
    const id = req.params.id;
    try {
      const chat = await getSharedChat(id);
      
      if (!chat) {
        return res.status(404).json({ error: '分享内容不存在或已过期' });
      }
      
      // 返回详细信息，包括原始消息格式
      res.json({
        id: id,
        title: chat.title,
        createdAt: chat.createdAt,
        expiresAt: chat.expiresAt,
        messageCount: chat.conversation.length,
        conversation: chat.conversation,
      });
    } catch (error) {
      res.status(500).json({ error: '获取分享内容失败' });
    }
  });
  
  // API路由 - 获取分享内容
  app.get('/api/share/:id', async (req: Request, res: Response) => {
    const id = req.params.id;
    try {
      const chat = await getSharedChat(id);
      
      if (!chat) {
        return res.status(404).json({ error: '分享内容不存在或已过期' });
      }
      
      res.json(chat);
    } catch (error) {
      res.status(500).json({ error: '获取分享内容失败' });
    }
  });
  
  // 分享页面路由
  app.get('/share/:id', async (req: Request, res: Response) => {
    const id = req.params.id;
    try {
      const chat = await getSharedChat(id);
      
      if (!chat) {
        return res.status(404).send('分享内容不存在或已过期');
      }
      
      // 发送HTML页面
      res.send(`
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${chat.title} - CursorShare</title>
          <style>
            body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              line-height: 1.6;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
              background: #f5f5f5;
              color: #333;
            }
            h1 {
              color: #2c3e50;
              border-bottom: 1px solid #eee;
              padding-bottom: 10px;
            }
            .chat {
              margin-top: 20px;
            }
            .message {
              margin-bottom: 15px;
              padding: 12px 15px;
              border-radius: 8px;
              max-width: 80%;
            }
            .user {
              background: #e1f5fe;
              align-self: flex-start;
              margin-right: auto;
            }
            .assistant {
              background: #f0f4c3;
              align-self: flex-end;
              margin-left: auto;
            }
            .meta {
              font-size: 0.8em;
              color: #666;
            }
            .role {
              font-weight: bold;
              margin-bottom: 5px;
            }
          </style>
        </head>
        <body>
          <h1>${chat.title}</h1>
          <div class="meta">
            分享时间: ${chat.createdAt.toLocaleString()}
          </div>
          <div class="chat">
            ${chat.conversation.map((msg: any) => `
              <div class="message ${msg.role || 'user'}">
                <div class="role">${msg.role === 'assistant' ? 'AI' : '用户'}</div>
                <div class="content">${msg.content || ''}</div>
              </div>
            `).join('')}
          </div>
          <script>
            // 如有需要可添加交互脚本
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      res.status(500).send('加载分享内容失败');
    }
  });
  
  // 启动服务器
  const server = app.listen(port, () => {
    log(`Web服务器已启动，监听端口 ${port}`);
    log(`分享页面地址: http://localhost:${port}/share/[分享ID]`);
    log(`调试页面地址: http://localhost:${port}/debug/shares`);
  });
  
  return server;
} 
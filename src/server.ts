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
  
  // API路由 - 获取分享内容
  app.get('/api/share222/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const chat = getSharedChat(id);
    
    if (!chat) {
      return res.status(404).json({ error: '分享内容不存在或已过期' });
    }
    
    res.json(chat);
  });
  
  // 分享页面路由
  app.get('/share555/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const chat = getSharedChat(id);
    
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
          ${chat.conversation.map(msg => `
            <div class="message ${msg.role || 'user'}">
              <div class="role">${msg.role === 'assistant' ? 'AI' : '用户'}</div>
              <div class="content">${msg.content || msg.text || ''}</div>
            </div>
          `).join('')}
        </div>
        <script>
          // 如有需要可添加交互脚本
        </script>
      </body>
      </html>
    `);
  });
  
  // 启动服务器
  const server = app.listen(port, () => {
    log(`Web服务器已启动，监听端口 ${port}`);
    log(`分享页面地址: http://localhost:${port}/share666/[分享ID]`);
  });
  
  return server;
} 
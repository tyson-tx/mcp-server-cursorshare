/**
 * 日志模块 - 负责将日志保存到本地文件
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 日志级别
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// 日志配置
export type LoggerConfig = {
  level: LogLevel;         // 日志级别
  enabled: boolean;        // 是否启用日志
  logToConsole: boolean;   // 是否同时输出到控制台
  logToFile: boolean;      // 是否输出到文件
  logDir: string;          // 日志文件目录
  logFileName: string;     // 日志文件名 (固定)
};

// 默认配置
const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  enabled: true,
  logToConsole: true,
  logToFile: true,
  logDir: path.join(os.homedir(), '.cursor', 'logs'),
  logFileName: 'cursor.log'
};

// 当前配置
let config: LoggerConfig = { ...DEFAULT_CONFIG };

// 日志文件的完整路径
let logFilePath: string = '';

/**
 * 更新日志配置
 */
export function updateLoggerConfig(newConfig: Partial<LoggerConfig>): LoggerConfig {
  config = { ...config, ...newConfig };
  
  // 确保日志目录存在
  ensureLogDirectory();
  
  // 初始化日志文件
  initLogFile();
  
  return config;
}

/**
 * 确保日志目录存在
 */
function ensureLogDirectory(): void {
  if (config.logToFile) {
    try {
      if (!fs.existsSync(config.logDir)) {
        fs.mkdirSync(config.logDir, { recursive: true });
      }
    } catch (err) {
      console.error(`创建日志目录失败: ${config.logDir}`, err);
      // 回退到系统临时目录
      config.logDir = path.join(os.tmpdir(), 'cursor-logs');
      if (!fs.existsSync(config.logDir)) {
        fs.mkdirSync(config.logDir, { recursive: true });
      }
    }
  }
}

/**
 * 初始化日志文件
 * 创建或重置日志文件
 */
function initLogFile(): void {
  try {
    logFilePath = path.join(config.logDir, config.logFileName);
    
    // 以写入模式打开文件，这将清空现有内容
    fs.writeFileSync(logFilePath, '', { flag: 'w' });
    
    // 写入初始日志头
    const startupMessage = formatLogMessage('INFO', `日志系统启动 - 版本 1.0.0 - 时间: ${new Date().toISOString()}`);
    fs.appendFileSync(logFilePath, startupMessage + '\n');
    
    console.error(`日志初始化完成，路径: ${logFilePath}`);
  } catch (err) {
    console.error('初始化日志文件失败:', err);
  }
}

/**
 * 格式化日志消息
 */
function formatLogMessage(level: string, ...args: any[]): string {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  
  return `[${timestamp}] [${level}] ${message}`;
}

/**
 * 写入日志到文件
 */
function writeToLogFile(message: string): void {
  if (!config.logToFile || !config.enabled || !logFilePath) return;
  
  try {
    // 使用追加模式写入日志
    fs.appendFileSync(logFilePath, message + '\n', { flag: 'a' });
  } catch (err) {
    // 只输出到控制台，避免递归错误
    if (config.logToConsole) {
      console.error('写入日志文件失败:', err);
    }
  }
}

/**
 * 用户访问记录
 */
export function logUserAccess(userId: string, action: string, details?: any): void {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  log(LogLevel.INFO, `用户访问 [${userId}] ${action}${detailsStr}`);
}

/**
 * 记录错误
 */
export function logError(message: string, error?: any): void {
  const errorDetails = error ? ` - ${error.message || JSON.stringify(error)}` : '';
  log(LogLevel.ERROR, `${message}${errorDetails}`);
  
  // 如果有堆栈信息，额外记录
  if (error && error.stack) {
    log(LogLevel.ERROR, `堆栈信息: ${error.stack}`);
  }
}

/**
 * 记录警告
 */
export function logWarning(message: string, ...args: any[]): void {
  log(LogLevel.WARN, message, ...args);
}

/**
 * 记录信息
 */
export function logInfo(message: string, ...args: any[]): void {
  log(LogLevel.INFO, message, ...args);
}

/**
 * 记录调试信息
 */
export function logDebug(message: string, ...args: any[]): void {
  log(LogLevel.DEBUG, message, ...args);
}

/**
 * 基础日志函数
 */
function log(level: LogLevel, ...args: any[]): void {
  if (!config.enabled || level < config.level) return;
  
  let levelStr: string;
  let consoleMethod: 'error' | 'warn' | 'info' | 'debug';
  
  switch (level) {
    case LogLevel.ERROR:
      levelStr = 'ERROR';
      consoleMethod = 'error';
      break;
    case LogLevel.WARN:
      levelStr = 'WARN';
      consoleMethod = 'warn';
      break;
    case LogLevel.INFO:
      levelStr = 'INFO';
      consoleMethod = 'info';
      break;
    case LogLevel.DEBUG:
    default:
      levelStr = 'DEBUG';
      consoleMethod = 'debug';
      break;
  }
  
  const formattedMessage = formatLogMessage(levelStr, ...args);
  
  // 写入文件
  writeToLogFile(formattedMessage);
  
  // 输出到控制台
  if (config.logToConsole) {
    // 为了避免干扰MCP通信，所有日志都使用stderr
    process.stderr.write(formattedMessage + '\n');
  }
}

// 初始化日志目录
ensureLogDirectory();

// 初始化日志文件
initLogFile(); 
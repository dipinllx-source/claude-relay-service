const winston = require('winston')
const path = require('path')
const fs = require('fs')
const { maskToken } = require('./tokenMask')

// 确保日志目录存在
const logDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

// 创建专用的 token 刷新日志记录器
const tokenRefreshLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }),
    winston.format.json(),
    winston.format.printf((info) => JSON.stringify(info, null, 2))
  ),
  transports: [
    // 文件传输 - 每日轮转
    new winston.transports.File({
      filename: path.join(logDir, 'token-refresh.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 30, // 保留30天
      tailable: true
    }),
    // 错误单独记录
    new winston.transports.File({
      filename: path.join(logDir, 'token-refresh-error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 30
    })
  ],
  // 错误处理
  exitOnError: false
})

// 在开发环境添加控制台输出
if (process.env.NODE_ENV !== 'production') {
  tokenRefreshLogger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple())
    })
  )
}

/**
 * 记录 token 刷新开始
 *
 * @param {string} trigger - 刷新触发来源，合法值：
 *   - 'cache_expired'   缓存中 expiresAt 判断为过期
 *   - 'upstream_error'  上游 401 等 token 异常被捕获后触发
 *   - 'manual_refresh'  管理员手动触发或默认入口
 *   非法值会按字面量记录，不做强校验。
 */
function logRefreshStart(accountId, accountName, platform = 'claude', reason = '', trigger = '') {
  tokenRefreshLogger.info({
    event: 'token_refresh_start',
    accountId,
    accountName,
    platform,
    reason,
    trigger,
    timestamp: new Date().toISOString()
  })
}

/**
 * 记录 token 刷新成功
 */
function logRefreshSuccess(accountId, accountName, platform = 'claude', tokenData = {}) {
  const maskedTokenData = {
    accessToken: tokenData.accessToken ? maskToken(tokenData.accessToken) : '[NOT_PROVIDED]',
    refreshToken: tokenData.refreshToken ? maskToken(tokenData.refreshToken) : '[NOT_PROVIDED]',
    expiresAt: tokenData.expiresAt || tokenData.expiry_date || '[NOT_PROVIDED]',
    scopes: tokenData.scopes || tokenData.scope || '[NOT_PROVIDED]'
  }

  tokenRefreshLogger.info({
    event: 'token_refresh_success',
    accountId,
    accountName,
    platform,
    tokenData: maskedTokenData,
    timestamp: new Date().toISOString()
  })
}

/**
 * 记录 token 刷新失败
 *
 * @param {string} category - 失败分类，便于按类别检索：
 *   'invalid_grant' / 'oauth_network' / 'cloudflare_blocked' /
 *   'cli_subprocess' / 'cli_no_op' / 'file_path_error'
 *   非法或缺失值会按字面量记录，不做强校验。
 */
function logRefreshError(
  accountId,
  accountName,
  platform = 'claude',
  error,
  attemptNumber = 1,
  category = ''
) {
  const errorInfo = {
    message: error.message || error.toString(),
    code: error.code || 'UNKNOWN',
    statusCode: error.response?.status || 'N/A',
    responseData: error.response?.data || 'N/A'
  }

  tokenRefreshLogger.error({
    event: 'token_refresh_error',
    accountId,
    accountName,
    platform,
    error: errorInfo,
    attemptNumber,
    category,
    timestamp: new Date().toISOString()
  })
}

/**
 * 记录 token 刷新跳过（由于并发锁）
 */
function logRefreshSkipped(
  accountId,
  accountName,
  platform = 'claude',
  reason = 'locked',
  trigger = ''
) {
  tokenRefreshLogger.info({
    event: 'token_refresh_skipped',
    accountId,
    accountName,
    platform,
    reason,
    trigger,
    timestamp: new Date().toISOString()
  })
}

/**
 * 记录 token 使用情况
 */
function logTokenUsage(accountId, accountName, platform = 'claude', expiresAt, isExpired) {
  // expiresAt 可能是数字字符串（"1778147659391"）、数字或 ISO 字符串。
  // 数字字符串走 Number() 路径才能得到 epoch ms；ISO 字符串走 Date.parse() 路径。
  let remainingMinutes = 'N/A'
  if (expiresAt) {
    const numeric = Number(expiresAt)
    const epochMs = Number.isFinite(numeric) ? numeric : Date.parse(expiresAt)
    if (Number.isFinite(epochMs)) {
      remainingMinutes = Math.floor((epochMs - Date.now()) / 60000)
    }
  }
  tokenRefreshLogger.debug({
    event: 'token_usage_check',
    accountId,
    accountName,
    platform,
    expiresAt,
    isExpired,
    remainingMinutes,
    timestamp: new Date().toISOString()
  })
}

/**
 * 记录批量刷新任务
 */
function logBatchRefreshStart(totalAccounts, platform = 'all') {
  tokenRefreshLogger.info({
    event: 'batch_refresh_start',
    totalAccounts,
    platform,
    timestamp: new Date().toISOString()
  })
}

/**
 * 记录批量刷新结果
 */
function logBatchRefreshComplete(results) {
  tokenRefreshLogger.info({
    event: 'batch_refresh_complete',
    results: {
      total: results.total || 0,
      success: results.success || 0,
      failed: results.failed || 0,
      skipped: results.skipped || 0
    },
    timestamp: new Date().toISOString()
  })
}

module.exports = {
  logger: tokenRefreshLogger,
  logRefreshStart,
  logRefreshSuccess,
  logRefreshError,
  logRefreshSkipped,
  logTokenUsage,
  logBatchRefreshStart,
  logBatchRefreshComplete
}

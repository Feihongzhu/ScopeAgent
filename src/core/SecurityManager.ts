import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../functions/logger';

/**
 * 文件安全检查结果
 */
export interface SecurityCheckResult {
    safe: boolean;
    issues: string[];
    fileSize: number;
    fileType: string;
    checkTime: number;
}

/**
 * 安全配置
 */
export interface SecurityConfig {
    maxFileSize: number;           // 最大文件大小（字节）
    allowedExtensions: string[];   // 允许的文件扩展名
    maxProcessingTime: number;     // 最大处理时间（毫秒）
    enableVirusCheck: boolean;     // 是否启用病毒检查
    maxConcurrentChecks: number;   // 最大并发检查数
}

/**
 * 安全管理器 - 负责文件安全检查和限制
 */
export class SecurityManager {
    private logger: Logger;
    private config: SecurityConfig;
    private activeChecks: Set<string> = new Set();

    // 默认安全配置
    private static readonly DEFAULT_CONFIG: SecurityConfig = {
        maxFileSize: 50 * 1024 * 1024,  // 50MB
        allowedExtensions: ['.xml', '.txt', '.log', '.json', '.csv'],
        maxProcessingTime: 30000,        // 30秒
        enableVirusCheck: false,         // 默认关闭病毒检查
        maxConcurrentChecks: 5
    };

    // 危险文件模式
    private static readonly DANGEROUS_PATTERNS = [
        /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.scr$/i, /\.com$/i,
        /\.pif$/i, /\.vbs$/i, /\.js$/i, /\.jar$/i, /\.dll$/i,
        /<script[^>]*>/i, /javascript:/i, /vbscript:/i,
        /eval\s*\(/i, /exec\s*\(/i, /system\s*\(/i
    ];

    constructor(logger: Logger, config?: Partial<SecurityConfig>) {
        this.logger = logger;
        this.config = { ...SecurityManager.DEFAULT_CONFIG, ...config };
    }

    /**
     * 检查文件是否安全
     */
    async checkFileSecurity(filePath: string): Promise<SecurityCheckResult> {
        const startTime = Date.now();
        const issues: string[] = [];
        
        try {
            // 检查并发限制
            if (this.activeChecks.size >= this.config.maxConcurrentChecks) {
                issues.push('超过最大并发检查数限制');
                return this.createSecurityResult(false, issues, 0, 'unknown', startTime);
            }

            this.activeChecks.add(filePath);

            // 1. 基本路径安全检查
            if (!this.isPathSafe(filePath)) {
                issues.push('文件路径不安全，可能存在路径遍历攻击');
                return this.createSecurityResult(false, issues, 0, 'unknown', startTime);
            }

            // 2. 文件存在性检查
            if (!fs.existsSync(filePath)) {
                issues.push('文件不存在');
                return this.createSecurityResult(false, issues, 0, 'unknown', startTime);
            }

            // 3. 文件大小检查
            const stats = fs.statSync(filePath);
            if (stats.size > this.config.maxFileSize) {
                issues.push(`文件大小超限: ${this.formatFileSize(stats.size)} > ${this.formatFileSize(this.config.maxFileSize)}`);
                return this.createSecurityResult(false, issues, stats.size, 'oversized', startTime);
            }

            // 4. 文件类型检查
            const fileExtension = path.extname(filePath).toLowerCase();
            if (!this.config.allowedExtensions.includes(fileExtension)) {
                issues.push(`不支持的文件类型: ${fileExtension}`);
                return this.createSecurityResult(false, issues, stats.size, 'unsupported', startTime);
            }

            // 5. 文件权限检查
            try {
                fs.accessSync(filePath, fs.constants.R_OK);
            } catch (error) {
                issues.push('文件无读取权限');
                return this.createSecurityResult(false, issues, stats.size, 'permission_denied', startTime);
            }

            // 6. 内容安全检查（采样检查）
            const contentCheck = await this.checkFileContent(filePath, stats.size);
            if (!contentCheck.safe) {
                issues.push(...contentCheck.issues);
                return this.createSecurityResult(false, issues, stats.size, 'dangerous_content', startTime);
            }

            // 7. 病毒检查（如果启用）
            if (this.config.enableVirusCheck) {
                const virusCheck = await this.performVirusCheck(filePath);
                if (!virusCheck.safe) {
                    issues.push(...virusCheck.issues);
                    return this.createSecurityResult(false, issues, stats.size, 'virus_detected', startTime);
                }
            }

            // 通过所有检查
            this.logger.info(`✅ 文件安全检查通过: ${filePath} (${this.formatFileSize(stats.size)})`);
            return this.createSecurityResult(true, [], stats.size, 'safe', startTime);

        } catch (error) {
            this.logger.error(`文件安全检查失败: ${error}`);
            issues.push(`安全检查异常: ${error}`);
            return this.createSecurityResult(false, issues, 0, 'error', startTime);
        } finally {
            this.activeChecks.delete(filePath);
        }
    }

    /**
     * 检查路径是否安全
     */
    private isPathSafe(filePath: string): boolean {
        const normalizedPath = path.normalize(filePath);
        
        // 检查路径遍历攻击
        if (normalizedPath.includes('..') || normalizedPath.includes('~')) {
            return false;
        }

        // 检查系统敏感目录
        const sensitivePatterns = [
            /^\/etc\//i, /^\/proc\//i, /^\/sys\//i, /^\/dev\//i,
            /^C:\\Windows\\/i, /^C:\\System32\\/i, /^C:\\Program Files\\/i
        ];

        return !sensitivePatterns.some(pattern => pattern.test(normalizedPath));
    }

    /**
     * 检查文件内容安全性
     */
    private async checkFileContent(filePath: string, fileSize: number): Promise<{safe: boolean, issues: string[]}> {
        const issues: string[] = [];
        
        try {
            // 对大文件只检查前1KB内容
            const sampleSize = Math.min(1024, fileSize);
            const buffer = Buffer.alloc(sampleSize);
            
            const fd = fs.openSync(filePath, 'r');
            fs.readSync(fd, buffer, 0, sampleSize, 0);
            fs.closeSync(fd);

            const content = buffer.toString('utf8', 0, sampleSize);

            // 检查危险模式
            for (const pattern of SecurityManager.DANGEROUS_PATTERNS) {
                if (pattern.test(content)) {
                    issues.push(`检测到危险内容模式: ${pattern.source}`);
                }
            }

            // 检查二进制文件（非文本文件）
            if (this.isBinaryContent(buffer)) {
                issues.push('检测到二进制内容，可能不安全');
            }

            return { safe: issues.length === 0, issues };

        } catch (error) {
            issues.push(`内容检查失败: ${error}`);
            return { safe: false, issues };
        }
    }

    /**
     * 检查是否为二进制内容
     */
    private isBinaryContent(buffer: Buffer): boolean {
        // 简单的二进制检测：检查空字节
        for (let i = 0; i < Math.min(buffer.length, 512); i++) {
            if (buffer[i] === 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * 病毒检查（模拟实现）
     */
    private async performVirusCheck(filePath: string): Promise<{safe: boolean, issues: string[]}> {
        const issues: string[] = [];
        
        try {
            // 这里可以集成实际的病毒扫描引擎
            // 例如：ClamAV、Windows Defender API等
            
            // 模拟病毒检查延迟
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 简单的启发式检查
            const fileExtension = path.extname(filePath).toLowerCase();
            if (['.exe', '.bat', '.cmd', '.scr'].includes(fileExtension)) {
                issues.push('可执行文件类型，存在潜在风险');
                return { safe: false, issues };
            }

            return { safe: true, issues: [] };

        } catch (error) {
            issues.push(`病毒检查失败: ${error}`);
            return { safe: false, issues };
        }
    }

    /**
     * 创建安全检查结果
     */
    private createSecurityResult(safe: boolean, issues: string[], fileSize: number, fileType: string, startTime: number): SecurityCheckResult {
        return {
            safe,
            issues,
            fileSize,
            fileType,
            checkTime: Date.now() - startTime
        };
    }

    /**
     * 格式化文件大小
     */
    private formatFileSize(bytes: number): string {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
    }

    /**
     * 更新安全配置
     */
    updateConfig(newConfig: Partial<SecurityConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.logger.info('安全配置已更新');
    }

    /**
     * 获取当前配置
     */
    getConfig(): SecurityConfig {
        return { ...this.config };
    }

    /**
     * 获取安全统计信息
     */
    getSecurityStats(): any {
        return {
            activeChecks: this.activeChecks.size,
            maxConcurrentChecks: this.config.maxConcurrentChecks,
            maxFileSize: this.config.maxFileSize,
            allowedExtensions: this.config.allowedExtensions
        };
    }
} 
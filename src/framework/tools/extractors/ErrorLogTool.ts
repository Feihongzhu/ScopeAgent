import { BaseTool } from './BaseTool';
import { ToolInput, ToolOutput } from '../../../framework/types/ToolTypes';
import { Logger } from '../../../functions/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 错误日志分析工具
 * 解析SCOPE/Cosmos作业错误信息，提供详细的错误分析和解决方案
 * 参考Python实现，专门处理JSON格式的Cosmos错误信息
 */
export class ErrorLogTool extends BaseTool {
    public name = 'ErrorLogReader';
    public description = '解析SCOPE/Cosmos作业错误信息，提供详细的错误分析和解决方案';

    constructor(logger?: Logger) {
        super(logger || new Logger('ErrorLogTool'));
    }

    async execute(input: ToolInput): Promise<ToolOutput> {
        try {
            this.validateInput(input);
            
            // 读取错误日志
            const errorContent = await this.readErrorLog(input.filePath);
            
            // 尝试解析JSON错误格式
            const jsonErrors = this.parseJsonErrors(errorContent);
            
            // 如果没有找到JSON错误，则使用通用文本解析
            const analysis = jsonErrors.length > 0 
                ? this.analyzeCosmosErrors(jsonErrors)
                : this.analyzeTextErrors(errorContent);
            
            return this.createOutput({
                errorAnalysis: analysis,
                errorCount: jsonErrors.length || this.countTextErrors(errorContent),
                hasJsonFormat: jsonErrors.length > 0
            });
        } catch (error) {
            this.logger.error(`执行ErrorLogTool时发生错误: ${error}`);
            return this.createOutput(null, false, [(error as Error).message]);
        }
    }

    /**
     * 读取错误日志（支持多种格式）
     */
    private async readErrorLog(filePath: string): Promise<string> {
        try {
            // 检查是否为目录
            const stats = await fs.promises.stat(filePath);
            if (stats.isDirectory()) {
                // 读取目录中的错误文件
                const files = await fs.promises.readdir(filePath);
                const errorFiles = files.filter(f => 
                    f.toLowerCase().includes('error') || 
                    f.toLowerCase().includes('exception') ||
                    f.toLowerCase().includes('failure') ||
                    f.toLowerCase() === 'error' // 匹配用户的Error目录
                );
                
                if (errorFiles.length > 0) {
                    const errorFilePath = path.join(filePath, errorFiles[0]);
                    return await fs.promises.readFile(errorFilePath, 'utf8');
                }
            }
            
            // 直接读取文件
            return await fs.promises.readFile(filePath, 'utf8');
        } catch (error) {
            this.logger.warn(`读取错误日志失败: ${error}`);
            return '';
        }
    }

    /**
     * 解析JSON格式的错误信息
     */
    private parseJsonErrors(content: string): any[] {
        const errors: any[] = [];
        const lines = content.split('\n');
        
        for (const line of lines) {
            if (line.trim()) {
                try {
                    const errorData = JSON.parse(line.trim());
                    if (errorData && typeof errorData === 'object') {
                        errors.push(errorData);
                    }
                } catch (e) {
                    // 不是JSON格式，跳过
                    continue;
                }
            }
        }
        
        return errors;
    }

    /**
     * 分析Cosmos错误信息（参考Python实现）
     */
    private analyzeCosmosErrors(errors: any[]): string {
        const analyses: string[] = [];
        
        for (const errorData of errors) {
            analyses.push(this.parseJsonError(errorData));
        }
        
        return analyses.join('\n\n' + '='.repeat(50) + '\n\n');
    }

    /**
     * 解析单个JSON错误信息（参考Python的_parse_json_error函数）
     */
    private parseJsonError(errorData: any): string {
        const summary: string[] = ["Cosmos作业错误分析:"];
        
        // 基本错误信息
        const diagnosticCode = errorData.diagnosticCode || "未知";
        const component = errorData.component || "未知";
        const errorId = errorData.errorId || "未知";
        const message = errorData.message || "无消息";
        
        summary.push(`- 诊断代码: ${diagnosticCode}`);
        summary.push(`- 组件: ${component}`);
        summary.push(`- 错误ID: ${errorId}`);
        summary.push(`- 错误消息: ${message}`);
        
        // 错误分类
        const errorCategory = this.categorizeCosmosError(errorId, message);
        if (errorCategory) {
            summary.push(`- 错误类别: ${errorCategory}`);
        }
        
        // 解决方案
        const resolution = errorData.resolution || "";
        if (resolution) {
            summary.push("- 解决方案:");
            // 分割解决方案文本
            const resolutionSteps = resolution.split("(");
            for (let i = 0; i < resolutionSteps.length; i++) {
                const step = resolutionSteps[i];
                if (step.trim()) {
                    if (i === 0) {
                        summary.push(`  ${step.trim()}`);
                    } else {
                        summary.push(`  (${step.trim()}`);
                    }
                }
            }
        }
        
        // 内部诊断信息
        const internalDiagnostics = errorData.internalDiagnostics || "";
        if (internalDiagnostics) {
            summary.push("- 内部诊断信息:");
            const diagLines = internalDiagnostics.split('\n');
            for (let i = 0; i < Math.min(diagLines.length, 5); i++) {
                const line = diagLines[i];
                if (line.trim()) {
                    summary.push(`  ${line.trim()}`);
                }
            }
        }
        
        // 特定错误类型的额外分析
        if (errorId.includes("VERTEX_TIMEOUT")) {
            summary.push("- 顶点超时分析:");
            summary.push("  这是一个典型的长时间运行任务超时错误");
            summary.push("  可能原因: 数据倾斜、低效查询、资源不足");
            
            // 从内部诊断中提取失败的顶点信息
            if (internalDiagnostics) {
                if (internalDiagnostics.includes("Failed vertex:")) {
                    const failedVertex = this.extractFailedVertex(internalDiagnostics);
                    if (failedVertex) {
                        summary.push(`  失败顶点: ${failedVertex}`);
                    }
                }
            }
        }
        
        return summary.join('\n');
    }

    /**
     * 根据错误ID和消息对Cosmos错误进行分类（参考Python的_categorize_cosmos_error函数）
     */
    private categorizeCosmosError(errorId: string, message: string): string {
        const errorIdLower = errorId.toLowerCase();
        const messageLower = message.toLowerCase();
        
        if (errorIdLower.includes("timeout") || messageLower.includes("timeout")) {
            return "任务超时";
        } else if (errorIdLower.includes("memory") || messageLower.includes("outofmemory")) {
            return "内存不足";
        } else if (errorIdLower.includes("vertex")) {
            return "顶点执行错误";
        } else if (errorIdLower.includes("container")) {
            return "容器错误";
        } else if (errorIdLower.includes("shuffle") || messageLower.includes("shuffle")) {
            return "数据Shuffle错误";
        } else if (messageLower.includes("skew") || messageLower.includes("imbalance")) {
            return "数据倾斜";
        } else {
            return "运行时错误";
        }
    }

    /**
     * 从内部诊断信息中提取失败的顶点名称（参考Python的_extract_failed_vertex函数）
     */
    private extractFailedVertex(internalDiagnostics: string): string {
        const lines = internalDiagnostics.split('\n');
        for (const line of lines) {
            if (line.includes("Failed vertex:")) {
                // 提取顶点名称
                const vertexInfo = line.split("Failed vertex:")[1]?.trim();
                return vertexInfo || "";
            }
        }
        return "";
    }

    /**
     * 通用文本错误解析（作为fallback）
     */
    private analyzeTextErrors(content: string): string {
        const lines = content.split('\n');
        const errorLines: string[] = [];
        
        for (const line of lines) {
            if (this.isErrorLine(line)) {
                errorLines.push(line);
            }
        }
        
        if (errorLines.length === 0) {
            return "未检测到明显的错误信息";
        }
        
        return `检测到 ${errorLines.length} 个错误行:\n\n${errorLines.slice(0, 10).join('\n')}`;
    }

    /**
     * 判断是否为错误行
     */
    private isErrorLine(line: string): boolean {
        const errorKeywords = ['error', 'exception', 'failed', 'timeout', 'fatal'];
        const lineLower = line.toLowerCase();
        return errorKeywords.some(keyword => lineLower.includes(keyword));
    }

    /**
     * 计算文本错误数量
     */
    private countTextErrors(content: string): number {
        const lines = content.split('\n');
        return lines.filter(line => this.isErrorLine(line)).length;
    }
} 
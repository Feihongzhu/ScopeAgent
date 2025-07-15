/**
 * 工具注册系统
 * 管理所有分析工具的注册、发现和调用
 */

import { AnalysisTool, ToolCategory, ToolInput, ToolOutput, ToolConfig } from '../types/FrameworkTypes';
import { Logger } from '../../functions/logger';

/**
 * 工具注册表
 */
export class ToolRegistry {
    private tools: Map<string, AnalysisTool>;
    private toolsByCategory: Map<ToolCategory, AnalysisTool[]>;
    private logger: Logger;
    
    constructor(logger?: Logger) {
        this.tools = new Map();
        this.toolsByCategory = new Map();
        this.logger = logger || new Logger('ToolRegistry');
        
        // 初始化分类映射
        Object.values(ToolCategory).forEach(category => {
            this.toolsByCategory.set(category, []);
        });
    }
    
    /**
     * 注册工具
     * @param tool 要注册的工具
     */
    registerTool(tool: AnalysisTool): void {
        this.tools.set(tool.name, tool);
        
        // 添加到分类映射
        if (!this.toolsByCategory.has(tool.category)) {
            this.toolsByCategory.set(tool.category, []);
        }
        this.toolsByCategory.get(tool.category)!.push(tool);
        
        this.logger.info(`工具已注册: ${tool.name} (${tool.category})`);
    }
    
    /**
     * 批量注册工具
     * @param tools 工具列表
     */
    registerTools(tools: AnalysisTool[]): void {
        for (const tool of tools) {
            this.registerTool(tool);
        }
    }
    
    /**
     * 获取工具
     * @param toolName 工具名称
     * @returns 工具实例，如果不存在则返回undefined
     */
    getTool(toolName: string): AnalysisTool | undefined {
        return this.tools.get(toolName);
    }
    
    /**
     * 根据类别获取工具
     * @param category 工具类别
     * @returns 该类别下的所有工具
     */
    getToolsByCategory(category: ToolCategory): AnalysisTool[] {
        return this.toolsByCategory.get(category) || [];
    }
    
    /**
     * 获取所有已注册的工具
     * @returns 所有工具的数组
     */
    getAllTools(): AnalysisTool[] {
        return Array.from(this.tools.values());
    }
    
    /**
     * 查找能处理指定文件类型的工具
     * @param fileType 文件类型
     * @returns 能处理该文件类型的工具列表
     */
    findToolsForFileType(fileType: string): AnalysisTool[] {
        return this.getAllTools().filter(tool => tool.canHandle(fileType));
    }
    
    /**
     * 根据工具名执行工具
     * @param toolName 工具名称
     * @param input 输入参数
     * @returns 工具执行结果
     */
    async executeTool(toolName: string, input: ToolInput): Promise<ToolOutput> {
        const tool = this.getTool(toolName);
        
        if (!tool) {
            return {
                success: false,
                data: null,
                metadata: {
                    executionTime: 0,
                    toolName,
                    timestamp: new Date(),
                    processingStrategy: input.context?.preferences?.analysisDepth === 'comprehensive' 
                        ? 'comprehensive_analysis' as any : 'basic_analysis' as any
                },
                errors: [`工具 ${toolName} 未找到`]
            };
        }
        
        const startTime = Date.now();
        
        try {
            this.logger.info(`执行工具: ${toolName}, 文件类型: ${input.fileType}`);
            const result = await tool.execute(input);
            
            const executionTime = Date.now() - startTime;
            this.logger.info(`工具执行完成: ${toolName}, 耗时: ${executionTime}ms, 成功: ${result.success}`);
            
            // 确保执行时间被记录
            result.metadata.executionTime = executionTime;
            
            return result;
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            this.logger.error(`工具执行失败: ${toolName}, 错误: ${error}`);
            
            return {
                success: false,
                data: null,
                metadata: {
                    executionTime,
                    toolName,
                    timestamp: new Date(),
                    processingStrategy: input.context?.preferences?.analysisDepth === 'comprehensive' 
                        ? 'comprehensive_analysis' as any : 'basic_analysis' as any
                },
                errors: [`工具执行错误: ${error instanceof Error ? error.message : String(error)}`]
            };
        }
    }
    
    /**
     * 批量执行工具
     * @param executions 执行配置列表 {toolName, input}
     * @returns 执行结果列表
     */
    async executeToolsBatch(executions: {toolName: string, input: ToolInput}[]): Promise<ToolOutput[]> {
        this.logger.info(`开始批量执行 ${executions.length} 个工具`);
        
        const promises = executions.map(exec => this.executeTool(exec.toolName, exec.input));
        const results = await Promise.all(promises);
        
        const successCount = results.filter(r => r.success).length;
        this.logger.info(`批量执行完成: ${successCount}/${results.length} 成功`);
        
        return results;
    }
    
    /**
     * 估算工具执行的token使用量
     * @param toolName 工具名称
     * @param input 输入参数
     * @returns 估算的token数量
     */
    estimateTokenUsage(toolName: string, input: ToolInput): number {
        const tool = this.getTool(toolName);
        if (!tool) {
            return 0;
        }
        
        return tool.estimateTokenUsage(input);
    }
    
    /**
     * 获取工具统计信息
     * @returns 工具统计信息
     */
    getToolStatistics(): {
        totalTools: number;
        toolsByCategory: Map<ToolCategory, number>;
        toolNames: string[];
    } {
        const toolsByCategory = new Map<ToolCategory, number>();
        
        for (const [category, tools] of this.toolsByCategory) {
            toolsByCategory.set(category, tools.length);
        }
        
        return {
            totalTools: this.tools.size,
            toolsByCategory,
            toolNames: Array.from(this.tools.keys())
        };
    }
    
    /**
     * 验证工具是否正确实现了接口
     * @param tool 要验证的工具
     * @returns 验证结果
     */
    validateTool(tool: AnalysisTool): {isValid: boolean, issues: string[]} {
        const issues: string[] = [];
        
        // 检查必需属性
        if (!tool.name || typeof tool.name !== 'string') {
            issues.push('工具名称无效');
        }
        
        if (!tool.description || typeof tool.description !== 'string') {
            issues.push('工具描述无效');
        }
        
        if (!Object.values(ToolCategory).includes(tool.category)) {
            issues.push('工具类别无效');
        }
        
        // 检查必需方法
        if (typeof tool.canHandle !== 'function') {
            issues.push('缺少 canHandle 方法');
        }
        
        if (typeof tool.execute !== 'function') {
            issues.push('缺少 execute 方法');
        }
        
        if (typeof tool.configure !== 'function') {
            issues.push('缺少 configure 方法');
        }
        
        if (typeof tool.estimateTokenUsage !== 'function') {
            issues.push('缺少 estimateTokenUsage 方法');
        }
        
        return {
            isValid: issues.length === 0,
            issues
        };
    }
    
    /**
     * 清理未使用的工具
     */
    cleanup(): void {
        this.logger.info('清理工具注册表');
        this.tools.clear();
        this.toolsByCategory.clear();
        
        // 重新初始化分类映射
        Object.values(ToolCategory).forEach(category => {
            this.toolsByCategory.set(category, []);
        });
    }
}

/**
 * 工具基类
 * 提供工具的通用实现基础
 */
export abstract class BaseTool implements AnalysisTool {
    public abstract name: string;
    public abstract description: string;
    public abstract category: ToolCategory;
    
    protected config: ToolConfig = {};
    protected logger: Logger;
    
    constructor(logger?: Logger) {
        this.logger = logger || new Logger('BaseTool');
    }
    
    /**
     * 配置工具
     */
    configure(config: ToolConfig): void {
        this.config = { ...this.config, ...config };
        this.logger.debug(`工具配置已更新: ${JSON.stringify(config)}`);
    }
    
    /**
     * 检查是否能处理指定文件类型
     */
    abstract canHandle(fileType: string): boolean;
    
    /**
     * 执行工具分析
     */
    abstract execute(input: ToolInput): Promise<ToolOutput>;
    
    /**
     * 估算token使用量的默认实现
     */
    estimateTokenUsage(input: ToolInput): number {
        // 基于文件大小的简单估算
        try {
            const fs = require('fs');
            if (fs.existsSync(input.filePath)) {
                const stats = fs.statSync(input.filePath);
                // 粗略估算：1KB ≈ 250 tokens
                return Math.ceil(stats.size / 4);
            }
        } catch (error) {
            this.logger.warn(`估算token使用量时出错: ${error}`);
        }
        
        return 1000; // 默认估算值
    }
    
    /**
     * 创建标准化的工具输出
     */
    protected createOutput(
        success: boolean,
        data: any,
        processingStrategy: any,
        errors?: string[],
        suggestions?: string[]
    ): ToolOutput {
        return {
            success,
            data,
            metadata: {
                executionTime: 0, // 将由注册表设置
                toolName: this.name,
                timestamp: new Date(),
                processingStrategy,
                confidence: success ? 0.8 : 0.0
            },
            errors,
            suggestions,
            tokenUsage: {
                estimated: 0 // 将由具体实现设置
            }
        };
    }
}

/**
 * 全局工具注册表实例
 */
export const toolRegistry = new ToolRegistry(); 
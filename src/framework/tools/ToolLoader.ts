import { Logger } from '../../functions/logger';
import { AnalysisTool, ToolCategory } from '../types/FrameworkTypes';
import { ToolRegistry } from './ToolRegistry';

// 导入所有工具
import { ExtractVertexTool } from './extractors/ExtractVertexTool';
import { ExtractRuntime2Tool } from './extractors/ExtractRuntime2Tool';
import { ExtractOperatorTool } from './extractors/ExtractOperatorTool';
import { ExtractRuntimeTool } from './extractors/ExtractRuntimeTool';
import { ScopeScriptReaderTool } from './extractors/ScopeScriptReaderTool';
import { CSCodeReaderTool } from './extractors/CSCodeReaderTool';
import { ErrorLogTool } from './extractors/ErrorLogTool';

/**
 * 工具加载器 - 负责加载和注册所有可用的工具
 */
export class ToolLoader {
    private logger: Logger;
    private toolRegistry: ToolRegistry;

    constructor(logger: Logger, toolRegistry: ToolRegistry) {
        this.logger = logger;
        this.toolRegistry = toolRegistry;
    }

    /**
     * 加载所有工具
     */
    async loadAllTools(): Promise<void> {
        this.logger.info('开始加载所有工具...');
        
        try {
            // 创建所有工具实例
            const tools: AnalysisTool[] = [
                new ExtractVertexToolWrapper(this.logger),
                new ExtractRuntime2ToolWrapper(this.logger),
                new ExtractOperatorToolWrapper(this.logger),
                new ExtractRuntimeToolWrapper(this.logger),
                new ScopeScriptReaderToolWrapper(this.logger),
                new CSCodeReaderToolWrapper(this.logger),
                new ErrorLogToolWrapper(this.logger)
            ];

            // 验证并注册所有工具
            let registeredCount = 0;
            for (const tool of tools) {
                const validation = this.toolRegistry.validateTool(tool);
                if (validation.isValid) {
                    this.toolRegistry.registerTool(tool);
                    registeredCount++;
                } else {
                    this.logger.error(`工具 ${tool.name} 验证失败: ${validation.issues.join(', ')}`);
                }
            }

            this.logger.info(`工具加载完成: ${registeredCount}/${tools.length} 个工具注册成功`);
            
            // 输出统计信息
            const stats = this.toolRegistry.getToolStatistics();
            this.logger.info(`工具统计: ${stats.totalTools} 个工具, 分类: ${Array.from(stats.toolsByCategory.entries()).map(([cat, count]) => `${cat}: ${count}`).join(', ')}`);
            
        } catch (error) {
            this.logger.error(`加载工具时发生错误: ${error}`);
            throw error;
        }
    }

    /**
     * 重新加载工具
     */
    async reloadTools(): Promise<void> {
        this.logger.info('重新加载工具...');
        this.toolRegistry.cleanup();
        await this.loadAllTools();
    }

    /**
     * 获取工具加载状态
     */
    getLoadStatus(): {
        toolsLoaded: number;
        toolsByCategory: Map<ToolCategory, number>;
        availableTools: string[];
    } {
        const stats = this.toolRegistry.getToolStatistics();
        return {
            toolsLoaded: stats.totalTools,
            toolsByCategory: stats.toolsByCategory,
            availableTools: stats.toolNames
        };
    }
}

// ============ 工具包装器 - 统一接口 ============

/**
 * 工具包装器基类
 */
abstract class ToolWrapperBase implements AnalysisTool {
    protected logger: Logger;
    protected innerTool: any;

    constructor(logger: Logger) {
        this.logger = logger;
        this.innerTool = this.createInnerTool();
    }

    abstract name: string;
    abstract description: string;
    abstract category: ToolCategory;
    
    protected abstract createInnerTool(): any;
    
    canHandle(fileType: string): boolean {
        // 默认实现，子类可以覆盖
        return true;
    }

    async execute(input: any): Promise<any> {
        try {
            return await this.innerTool.execute(input);
        } catch (error) {
            this.logger.error(`工具 ${this.name} 执行失败: ${error}`);
            throw error;
        }
    }

    configure(config: any): void {
        if (this.innerTool.configure) {
            this.innerTool.configure(config);
        }
    }

    estimateTokenUsage(input: any): number {
        // 基本token估算
        const fileSize = this.getFileSize(input.filePath);
        return Math.ceil(fileSize / 4); // 1KB ≈ 250 tokens
    }

    private getFileSize(filePath: string): number {
        try {
            const fs = require('fs');
            if (fs.existsSync(filePath)) {
                return fs.statSync(filePath).size;
            }
        } catch (error) {
            this.logger.warn(`获取文件大小失败: ${error}`);
        }
        return 1000; // 默认估算
    }
}

/**
 * ExtractVertexTool 包装器
 */
class ExtractVertexToolWrapper extends ToolWrapperBase {
    name = 'extractVertex';
    description = '解析ScopeVertexDef文件，提取顶点定义信息';
    category = ToolCategory.EXTRACTOR;

    protected createInnerTool(): any {
        return new ExtractVertexTool(this.logger);
    }

    canHandle(fileType: string): boolean {
        return fileType === 'VERTEX_DEFINITION' || fileType === 'ScopeVertexDef';
    }
}

/**
 * ExtractRuntime2Tool 包装器
 */
class ExtractRuntime2ToolWrapper extends ToolWrapperBase {
    name = 'extractRuntime2';
    description = '解析__ScopeRuntimeStatistics__.xml文件，提取运行时详细统计数据';
    category = ToolCategory.EXTRACTOR;

    protected createInnerTool(): any {
        return new ExtractRuntime2Tool(this.logger);
    }

    canHandle(fileType: string): boolean {
        return fileType === 'RUNTIME_STATS' || fileType === '__ScopeRuntimeStatistics__';
    }
}

/**
 * ExtractOperatorTool 包装器
 */
class ExtractOperatorToolWrapper extends ToolWrapperBase {
    name = 'extractOperator';
    description = '解析和分析SCOPE作业中的算子信息，支持与Runtime2数据联合分析';
    category = ToolCategory.ANALYZER;

    protected createInnerTool(): any {
        return new ExtractOperatorTool(this.logger);
    }

    canHandle(fileType: string): boolean {
        return fileType === 'VERTEX_DEFINITION' || fileType === 'ScopeVertexDef';
    }
}

/**
 * ExtractRuntimeTool 包装器
 */
class ExtractRuntimeToolWrapper extends ToolWrapperBase {
    name = 'extractRuntime';
    description = '解析JobStatistics.xml文件，提取作业运行时统计信息';
    category = ToolCategory.EXTRACTOR;

    protected createInnerTool(): any {
        return new ExtractRuntimeTool(this.logger);
    }

    canHandle(fileType: string): boolean {
        return fileType === 'JOB_STATISTICS' || fileType === 'JobStatistics';
    }
}

/**
 * ScopeScriptReaderTool 包装器
 */
class ScopeScriptReaderToolWrapper extends ToolWrapperBase {
    name = 'scopeScriptReader';
    description = '智能读取SCOPE脚本文件，使用智能分段策略平衡代码完整性与token效率';
    category = ToolCategory.FILE_READER;

    protected createInnerTool(): any {
        return new ScopeScriptReaderTool(this.logger);
    }

    canHandle(fileType: string): boolean {
        return fileType === 'SCOPE_SCRIPT' || fileType === 'scope.script';
    }
}

/**
 * CSCodeReaderTool 包装器
 */
class CSCodeReaderToolWrapper extends ToolWrapperBase {
    name = 'csCodeReader';
    description = '智能读取C#代码文件，使用总结+关键方法策略处理生成的代码';
    category = ToolCategory.FILE_READER;

    protected createInnerTool(): any {
        return new CSCodeReaderTool(this.logger);
    }

    canHandle(fileType: string): boolean {
        return fileType === 'CODEGEN_CS' || fileType === '__ScopeCodeGen__.dll.cs';
    }
}

/**
 * ErrorLogTool 包装器
 */
class ErrorLogToolWrapper extends ToolWrapperBase {
    name = 'errorLogReader';
    description = '解析SCOPE作业错误信息，提供详细的错误分析和解决方案';
    category = ToolCategory.ANALYZER;

    protected createInnerTool(): any {
        return new ErrorLogTool(this.logger);
    }

    canHandle(fileType: string): boolean {
        return fileType === 'ERROR_INFO' || fileType === 'Error';
    }
}

/**
 * 全局工具加载器实例
 */
export let globalToolLoader: ToolLoader | null = null;

/**
 * 初始化全局工具加载器
 */
export async function initializeGlobalToolLoader(logger: Logger, toolRegistry: ToolRegistry): Promise<ToolLoader> {
    if (!globalToolLoader) {
        globalToolLoader = new ToolLoader(logger, toolRegistry);
        await globalToolLoader.loadAllTools();
    }
    return globalToolLoader;
} 
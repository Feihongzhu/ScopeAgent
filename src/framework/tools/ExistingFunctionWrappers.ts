/**
 * 现有函数包装器工具
 * 将现有的extractRuntime、extractVertex等函数包装成标准化的工具接口
 */

import { BaseTool } from './ToolRegistry';
import { ToolCategory, ToolInput, ToolOutput, ProcessingStrategy } from '../types/FrameworkTypes';
import { Logger } from '../../functions/logger';

// 导入现有函数
import { analyzeScopeRuntimeStatistics } from '../../functions/extractRuntime2';
import { parseScopeVertexXML } from '../../functions/extractVertex';
import { parseAndAnalyzeScopeVertices } from '../../functions/extractOperator';
import * as fs from 'fs';



/**
 * extractVertex 函数包装器
 * 处理 ScopeVertexDef 文件
 */
export class ExtractVertexTool extends BaseTool {
    public name = 'extractVertex';
    public description = '解析ScopeVertexDef文件，提取顶点定义和配置信息';
    public category = ToolCategory.EXTRACTOR;
    
    constructor(logger?: Logger) {
        super(logger || new Logger('ExtractVertexTool'));
    }
    
    canHandle(fileType: string): boolean {
        return fileType === 'VERTEX_DEFINITION';
    }
    
    async execute(input: ToolInput): Promise<ToolOutput> {
        this.logger.info(`开始解析ScopeVertexDef: ${input.filePath}`);
        
        try {
            // 调用现有的extractVertex函数
            const vertexData = await parseScopeVertexXML(input.filePath);
            
            this.logger.info(`ScopeVertexDef解析完成，提取了顶点信息`);
            
            return this.createOutput(
                true,
                {
                    vertexDefinitions: vertexData,
                    summary: this.generateVertexSummary(vertexData),
                    vertexAnalysis: this.analyzeVertexStructure(vertexData)
                },
                ProcessingStrategy.VERTEX_ANALYSIS,
                undefined,
                this.generateVertexSuggestions(vertexData)
            );
            
        } catch (error) {
            this.logger.error(`ScopeVertexDef解析失败: ${error}`);
            
            return this.createOutput(
                false,
                null,
                ProcessingStrategy.VERTEX_ANALYSIS,
                [`解析ScopeVertexDef失败: ${error instanceof Error ? error.message : String(error)}`]
            );
        }
    }
    
    /**
     * 生成顶点总结
     */
    private generateVertexSummary(vertexData: any): string {
        if (!vertexData) return '无顶点数据';
        
        const summary: string[] = [];
        
        if (Array.isArray(vertexData)) {
            summary.push(`顶点数量: ${vertexData.length}`);
            
            // 分析顶点类型
            const vertexTypes = new Set(vertexData.map(v => v.type || 'unknown').filter(Boolean));
            if (vertexTypes.size > 0) {
                summary.push(`顶点类型: ${Array.from(vertexTypes).join(', ')}`);
            }
        } else if (typeof vertexData === 'object') {
            const keys = Object.keys(vertexData);
            summary.push(`顶点信息项: ${keys.length}`);
        }
        
        return summary.length > 0 ? summary.join(', ') : '顶点信息可用';
    }
    
    /**
     * 分析顶点结构
     */
    private analyzeVertexStructure(vertexData: any): any {
        const analysis: any = {
            totalVertices: 0,
            vertexTypes: {},
            complexVertices: [],
            dependencies: []
        };
        
        if (Array.isArray(vertexData)) {
            analysis.totalVertices = vertexData.length;
            
            vertexData.forEach((vertex, index) => {
                // 统计顶点类型
                const type = vertex.type || 'unknown';
                analysis.vertexTypes[type] = (analysis.vertexTypes[type] || 0) + 1;
                
                // 识别复杂顶点
                if (vertex.operators && vertex.operators.length > 5) {
                    analysis.complexVertices.push({
                        index,
                        id: vertex.id,
                        operatorCount: vertex.operators.length
                    });
                }
                
                // 分析依赖关系
                if (vertex.dependencies && vertex.dependencies.length > 0) {
                    analysis.dependencies.push({
                        vertex: vertex.id || index,
                        dependsOn: vertex.dependencies
                    });
                }
            });
        }
        
        return analysis;
    }
    
    /**
     * 生成顶点优化建议
     */
    private generateVertexSuggestions(vertexData: any): string[] {
        const suggestions: string[] = [];
        
        if (Array.isArray(vertexData)) {
            // 检查复杂顶点
            const complexVertices = vertexData.filter(v => v.operators && v.operators.length > 10);
            if (complexVertices.length > 0) {
                suggestions.push(`发现 ${complexVertices.length} 个复杂顶点，建议检查是否可以简化操作`);
            }
            
            // 检查依赖链
            const highDependencyVertices = vertexData.filter(v => v.dependencies && v.dependencies.length > 3);
            if (highDependencyVertices.length > 0) {
                suggestions.push(`发现 ${highDependencyVertices.length} 个高依赖顶点，可能影响并行度`);
            }
        }
        
        return suggestions;
    }
}

/**
 * extractRuntime2 函数包装器
 * 处理 __ScopeRuntimeStatistics__.xml 文件
 */
export class ExtractRuntime2Tool extends BaseTool {
    public name = 'extractRuntime2';
    public description = '解析__ScopeRuntimeStatistics__.xml文件，提取运行时详细统计数据，并存储到intermediateResults中供ExtractOperatorTool使用';
    public category = ToolCategory.EXTRACTOR;
    
    constructor(logger?: Logger) {
        super(logger || new Logger('ExtractRuntime2Tool'));
    }
    
    canHandle(fileType: string): boolean {
        return fileType === 'RUNTIME_STATS';
    }
    
    async execute(input: ToolInput): Promise<ToolOutput> {
        this.logger.info(`开始解析运行时统计: ${input.filePath}`);
        
        try {
            // 调用现有的extractRuntime2函数
            const runtime2Data = await analyzeScopeRuntimeStatistics(input.filePath);
            
            this.logger.info(`运行时统计解析完成`);
            
            // 将runtime2Data存储到intermediateResults中，供ExtractOperatorTool使用
            if (input.context?.intermediateResults) {
                input.context.intermediateResults.set('runtime2Data', runtime2Data);
                this.logger.info(`Runtime2数据已存储到intermediateResults中，供ExtractOperatorTool使用`);
            }
            
            return this.createOutput(
                true,
                {
                    runtimeStatistics: runtime2Data,
                    summary: this.generateRuntime2Summary(runtime2Data),
                    performanceInsights: this.extractPerformanceInsights(runtime2Data)
                },
                ProcessingStrategy.RUNTIME_ANALYSIS,
                undefined,
                this.generateRuntime2Suggestions(runtime2Data)
            );
            
        } catch (error) {
            this.logger.error(`运行时统计解析失败: ${error}`);
            
            return this.createOutput(
                false,
                null,
                ProcessingStrategy.RUNTIME_ANALYSIS,
                [`解析运行时统计失败: ${error instanceof Error ? error.message : String(error)}`]
            );
        }
    }
    
    private generateRuntime2Summary(data: any): string {
        return data ? '运行时详细统计数据已提取' : '无运行时统计数据';
    }
    
    private extractPerformanceInsights(data: any): any {
        return {
            dataAvailable: !!data,
            insightCount: data ? Object.keys(data).length : 0
        };
    }
    
    private generateRuntime2Suggestions(data: any): string[] {
        return data ? ['运行时统计数据可用于深度性能分析'] : [];
    }
}

/**
 * extractOperator 函数包装器
 * 处理 ScopeVertexDef.xml 文件
 */
export class ExtractOperatorTool extends BaseTool {
    public name = 'extractOperator';
    public description = '提取和分析SCOPE操作符信息，支持接收Runtime2Tool的结果进行增强分析';
    public category = ToolCategory.EXTRACTOR;
    
    constructor(logger?: Logger) {
        super(logger || new Logger('ExtractOperatorTool'));
    }
    
    canHandle(fileType: string): boolean {
        return fileType === 'VERTEX_DEFINITION';
    }
    
    async execute(input: ToolInput): Promise<ToolOutput> {
        this.logger.info(`开始提取操作符信息: ${input.filePath}`);
        
        try {
            // 检查是否有runtime2Data作为中间结果
            const runtime2Data = input.context?.intermediateResults?.get('runtime2Data');
            let operatorData: string;
            
            if (runtime2Data) {
                // 如果有runtime2Data，将其作为第二个参数传递
                this.logger.info(`使用Runtime2Tool的结果进行增强的操作符分析`);
                operatorData = await parseAndAnalyzeScopeVertices(input.filePath, runtime2Data);
            } else {
                // 否则使用默认的分析方式
                this.logger.info(`使用默认方式进行操作符分析`);
                operatorData = await parseAndAnalyzeScopeVertices(input.filePath);
            }
            
            this.logger.info(`操作符信息提取完成`);
            
            return this.createOutput(
                true,
                {
                    operators: operatorData,
                    summary: this.generateOperatorSummary(operatorData),
                    operatorAnalysis: this.analyzeOperators(operatorData),
                    enhancedWithRuntimeData: !!runtime2Data
                },
                ProcessingStrategy.STRUCTURED_EXTRACTION,
                undefined,
                this.generateOperatorSuggestions(operatorData)
            );
            
        } catch (error) {
            this.logger.error(`操作符信息提取失败: ${error}`);
            
            return this.createOutput(
                false,
                null,
                ProcessingStrategy.STRUCTURED_EXTRACTION,
                [`提取操作符信息失败: ${error instanceof Error ? error.message : String(error)}`]
            );
        }
    }
    
    private generateOperatorSummary(data: any): string {
        if (!data) return '无操作符数据';
        
        if (Array.isArray(data)) {
            return `发现 ${data.length} 个操作符`;
        } else if (typeof data === 'object') {
            return `操作符信息包含 ${Object.keys(data).length} 个项目`;
        }
        
        return '操作符数据可用';
    }
    
    private analyzeOperators(data: any): any {
        const analysis: any = {
            totalOperators: 0,
            operatorTypes: {},
            complexOperators: []
        };
        
        if (Array.isArray(data)) {
            analysis.totalOperators = data.length;
            
            data.forEach(op => {
                const type = op.type || op.name || 'unknown';
                analysis.operatorTypes[type] = (analysis.operatorTypes[type] || 0) + 1;
                
                // 识别复杂操作符
                if (op.complexity && op.complexity > 5) {
                    analysis.complexOperators.push(op);
                }
            });
        }
        
        return analysis;
    }
    
    private generateOperatorSuggestions(data: any): string[] {
        const suggestions: string[] = [];
        
        if (Array.isArray(data)) {
            // 检查JOIN操作符
            const joinOps = data.filter(op => 
                (op.type || op.name || '').toLowerCase().includes('join')
            );
            if (joinOps.length > 0) {
                suggestions.push(`发现 ${joinOps.length} 个JOIN操作，建议检查JOIN条件和数据分布`);
            }
            
            // 检查复杂操作符
            const complexOps = data.filter(op => op.complexity && op.complexity > 5);
            if (complexOps.length > 0) {
                suggestions.push(`发现 ${complexOps.length} 个复杂操作符，可能是性能瓶颈`);
            }
        }
        
        return suggestions;
    }
}

/**
 * ErrorLogTool - 解析SCOPE作业错误信息
 * 处理Error文件，提取和分析错误详情
 */
export class ErrorLogTool extends BaseTool {
    public name = 'errorLogReader';
    public description = '解析SCOPE作业错误信息，提供详细的错误分析和解决方案';
    public category = ToolCategory.EXTRACTOR;
    
    constructor(logger?: Logger) {
        super(logger || new Logger('ErrorLogTool'));
    }
    
    canHandle(fileType: string): boolean {
        return fileType === 'ERROR_INFO';
    }
    
    async execute(input: ToolInput): Promise<ToolOutput> {
        this.logger.info(`开始解析错误信息: ${input.filePath}`);
        
        try {
            // 读取错误文件内容
            const errorContent = fs.readFileSync(input.filePath, 'utf-8');
            
            // 尝试解析JSON格式的错误信息
            let errorData: any;
            let analysisResult: string;
            
            try {
                errorData = JSON.parse(errorContent);
                analysisResult = this.parseJsonError(errorData);
            } catch (jsonError) {
                // 如果不是JSON格式，尝试解析文本格式
                analysisResult = this.parseTextError(errorContent);
            }
            
            this.logger.info(`错误信息解析完成`);
            
            return this.createOutput(
                true,
                {
                    errorAnalysis: analysisResult,
                    rawData: errorData || errorContent,
                    summary: this.generateErrorSummary(errorData || errorContent),
                    errorDetails: this.extractErrorDetails(errorData || errorContent)
                },
                ProcessingStrategy.ERROR_ANALYSIS,
                undefined,
                this.generateErrorSuggestions(errorData || errorContent)
            );
            
        } catch (error) {
            this.logger.error(`错误信息解析失败: ${error}`);
            
            return this.createOutput(
                false,
                null,
                ProcessingStrategy.ERROR_ANALYSIS,
                [`解析错误信息失败: ${error instanceof Error ? error.message : String(error)}`]
            );
        }
    }
    
    /**
     * 解析JSON格式的错误信息
     */
    private parseJsonError(errorData: any): string {
        const summary: string[] = ["# Cosmos作业错误分析"];
        
        // 基本错误信息
        const diagnosticCode = errorData.diagnosticCode || '未知';
        const component = errorData.component || '未知';
        const errorId = errorData.errorId || '未知';
        const message = errorData.message || '无消息';
        
        summary.push(`## 基本错误信息`);
        summary.push(`- **诊断代码**: ${diagnosticCode}`);
        summary.push(`- **组件**: ${component}`);
        summary.push(`- **错误ID**: ${errorId}`);
        summary.push(`- **错误消息**: ${message}`);
        
        // 错误分类
        const errorCategory = this.categorizeCosmosError(errorId, message);
        if (errorCategory) {
            summary.push(`- **错误类别**: ${errorCategory}`);
        }
        
        // 解决方案
        const resolution = errorData.resolution || '';
        if (resolution) {
            summary.push(`## 解决方案`);
            const resolutionSteps = resolution.split('(');
            for (let i = 0; i < resolutionSteps.length; i++) {
                const step = resolutionSteps[i].trim();
                if (step) {
                    if (i === 0) {
                        summary.push(`${step}`);
                    } else {
                        summary.push(`(${step}`);
                    }
                }
            }
        }
        
        // 内部诊断信息
        const internalDiagnostics = errorData.internalDiagnostics || '';
        if (internalDiagnostics) {
            summary.push(`## 内部诊断信息`);
            const diagLines = internalDiagnostics.split('\n');
            for (let i = 0; i < Math.min(diagLines.length, 5); i++) {
                const line = diagLines[i].trim();
                if (line) {
                    summary.push(`- ${line}`);
                }
            }
        }
        
        // 特定错误类型的额外分析
        if (errorId.includes('VERTEX_TIMEOUT')) {
            summary.push(`## 顶点超时分析`);
            summary.push(`- **问题描述**: 这是一个典型的长时间运行任务超时错误`);
            summary.push(`- **可能原因**: 数据倾斜、低效查询、资源不足`);
            
            // 从内部诊断中提取失败的顶点信息
            if (internalDiagnostics) {
                const failedVertex = this.extractFailedVertex(internalDiagnostics);
                if (failedVertex) {
                    summary.push(`- **失败顶点**: ${failedVertex}`);
                }
            }
        }
        
        return summary.join('\n');
    }
    
    /**
     * 解析文本格式的错误信息
     */
    private parseTextError(errorContent: string): string {
        const summary: string[] = ["# 错误信息分析"];
        
        const lines = errorContent.split('\n');
        
        // 查找关键错误信息
        for (const line of lines) {
            if (line.includes('Error:') || line.includes('ERROR:')) {
                summary.push(`## 错误详情`);
                summary.push(`- ${line.trim()}`);
                break;
            }
        }
        
        // 查找失败的顶点
        const failedVertex = this.extractFailedVertex(errorContent);
        if (failedVertex) {
            summary.push(`## 失败顶点`);
            summary.push(`- ${failedVertex}`);
        }
        
        // 添加常见错误模式识别
        const errorPatterns = this.identifyErrorPatterns(errorContent);
        if (errorPatterns.length > 0) {
            summary.push(`## 识别的错误模式`);
            errorPatterns.forEach(pattern => {
                summary.push(`- ${pattern}`);
            });
        }
        
        return summary.join('\n');
    }
    
    /**
     * 从内部诊断信息中提取失败的顶点名称
     */
    private extractFailedVertex(internalDiagnostics: string): string {
        const lines = internalDiagnostics.split('\n');
        
        for (const line of lines) {
            if (line.includes('Failed vertex:')) {
                // 提取顶点名称
                const vertexInfo = line.split('Failed vertex:')[1]?.trim();
                return vertexInfo || '';
            }
        }
        
        return '';
    }
    
    /**
     * 分类Cosmos错误
     */
    private categorizeCosmosError(errorId: string, message: string): string {
        const errorIdLower = errorId.toLowerCase();
        const messageLower = message.toLowerCase();
        
        // 超时错误
        if (errorIdLower.includes('timeout') || messageLower.includes('timeout')) {
            return '执行超时';
        }
        
        // 内存错误
        if (errorIdLower.includes('memory') || messageLower.includes('out of memory')) {
            return '内存不足';
        }
        
        // 编译错误
        if (errorIdLower.includes('compile') || messageLower.includes('compilation')) {
            return '编译错误';
        }
        
        // 数据错误
        if (errorIdLower.includes('data') || messageLower.includes('invalid data')) {
            return '数据错误';
        }
        
        // 权限错误
        if (errorIdLower.includes('permission') || messageLower.includes('access denied')) {
            return '权限错误';
        }
        
        // 资源错误
        if (errorIdLower.includes('resource') || messageLower.includes('quota')) {
            return '资源限制';
        }
        
        // 网络错误
        if (errorIdLower.includes('network') || messageLower.includes('connection')) {
            return '网络错误';
        }
        
        return '未知错误类型';
    }
    
    /**
     * 识别错误模式
     */
    private identifyErrorPatterns(errorContent: string): string[] {
        const patterns: string[] = [];
        const contentLower = errorContent.toLowerCase();
        
        // 常见错误模式
        const errorPatterns = [
            { pattern: 'out of memory', description: '内存溢出 - 可能需要增加资源或优化查询' },
            { pattern: 'timeout', description: '执行超时 - 可能存在长时间运行的操作' },
            { pattern: 'access denied', description: '权限不足 - 检查文件访问权限' },
            { pattern: 'file not found', description: '文件不存在 - 检查输入文件路径' },
            { pattern: 'invalid syntax', description: '语法错误 - 检查SCOPE脚本语法' },
            { pattern: 'compilation failed', description: '编译失败 - 检查代码逻辑和语法' },
            { pattern: 'data skew', description: '数据倾斜 - 需要优化数据分布' },
            { pattern: 'vertex failed', description: '顶点失败 - 检查特定顶点的执行逻辑' }
        ];
        
        for (const { pattern, description } of errorPatterns) {
            if (contentLower.includes(pattern)) {
                patterns.push(description);
            }
        }
        
        return patterns;
    }
    
    /**
     * 生成错误总结
     */
    private generateErrorSummary(errorData: any): string {
        if (typeof errorData === 'string') {
            return `文本错误信息，长度: ${errorData.length} 字符`;
        }
        
        if (errorData && typeof errorData === 'object') {
            const errorId = errorData.errorId || '未知';
            const component = errorData.component || '未知';
            return `${component}组件错误: ${errorId}`;
        }
        
        return '错误信息可用';
    }
    
    /**
     * 提取错误详情
     */
    private extractErrorDetails(errorData: any): any {
        const details: any = {
            hasErrorId: false,
            hasResolution: false,
            hasInternalDiagnostics: false,
            errorCategory: 'unknown'
        };
        
        if (errorData && typeof errorData === 'object') {
            details.hasErrorId = !!errorData.errorId;
            details.hasResolution = !!errorData.resolution;
            details.hasInternalDiagnostics = !!errorData.internalDiagnostics;
            details.errorCategory = this.categorizeCosmosError(
                errorData.errorId || '', 
                errorData.message || ''
            );
        }
        
        return details;
    }
    
    /**
     * 生成错误处理建议
     */
    private generateErrorSuggestions(errorData: any): string[] {
        const suggestions: string[] = [];
        
        if (typeof errorData === 'string') {
            suggestions.push('建议查看完整的错误日志以获取更多信息');
            return suggestions;
        }
        
        if (errorData && typeof errorData === 'object') {
            const errorId = errorData.errorId || '';
            const message = errorData.message || '';
            
            // 基于错误类型提供建议
            if (errorId.includes('TIMEOUT')) {
                suggestions.push('优化查询性能，减少长时间运行的操作');
                suggestions.push('检查数据倾斜问题，优化数据分布');
                suggestions.push('考虑增加作业超时时间限制');
            }
            
            if (errorId.includes('MEMORY') || message.includes('memory')) {
                suggestions.push('增加作业内存配置');
                suggestions.push('优化数据处理逻辑，减少内存使用');
                suggestions.push('考虑数据分片处理');
            }
            
            if (errorId.includes('COMPILE')) {
                suggestions.push('检查SCOPE脚本语法');
                suggestions.push('验证所有引用的函数和变量');
                suggestions.push('确保所有依赖项正确加载');
            }
            
            // 如果有解决方案，优先推荐
            if (errorData.resolution) {
                suggestions.unshift('参考错误信息中提供的解决方案');
            }
        }
        
        return suggestions.length > 0 ? suggestions : ['建议联系技术支持获取进一步帮助'];
    }
}

/**
 * ErrorLogTool使用示例：
 * 
 * ```typescript
 * const errorLogTool = new ErrorLogTool();
 * 
 * const input: ToolInput = {
 *     filePath: '/path/to/Error',
 *     fileType: 'ERROR_INFO',
 *     analysisGoal: 'analyze job errors',
 *     context: analysisContext
 * };
 * 
 * const result = await errorLogTool.execute(input);
 * 
 * if (result.success) {
 *     console.log('错误分析:', result.data.errorAnalysis);
 *     console.log('错误总结:', result.data.summary);
 *     console.log('建议:', result.suggestions);
 * }
 * ```
 */

/**
 * 使用示例：ExtractRuntime2Tool和ExtractOperatorTool的协作
 * 
 * 使用步骤：
 * 1. 首先执行ExtractRuntime2Tool来解析运行时统计数据
 * 2. 然后执行ExtractOperatorTool，它会自动使用前面的结果进行增强分析
 * 
 * 示例代码：
 * 
 * ```typescript
 * // 创建工具实例
 * const runtime2Tool = new ExtractRuntime2Tool();
 * const operatorTool = new ExtractOperatorTool();
 * 
 * // 创建分析上下文
 * const context: AnalysisContext = {
 *     sessionId: 'session_123',
 *     jobPath: '/path/to/job',
 *     userQuery: 'analyze performance',
 *     discoveredFiles: [],
 *     analysisGoals: ['performance_analysis'],
 *     intermediateResults: new Map(),
 *     sharedKnowledge: { patterns: new Map(), previousAnalyses: [], userFeedback: [], optimizationHistory: [] },
 *     preferences: { outputFormat: 'detailed', includeRawData: false }
 * };
 * 
 * // 第一步：执行ExtractRuntime2Tool
 * const runtime2Input: ToolInput = {
 *     filePath: '/path/to/__ScopeRuntimeStatistics__.xml',
 *     fileType: 'RUNTIME_STATS',
 *     analysisGoal: 'extract runtime statistics',
 *     context: context
 * };
 * 
 * const runtime2Result = await runtime2Tool.execute(runtime2Input);
 * 
 * // 第二步：执行ExtractOperatorTool，它会自动使用runtime2Data进行增强分析
 * const operatorInput: ToolInput = {
 *     filePath: '/path/to/ScopeVertexDef.xml',
 *     fileType: 'VERTEX_DEFINITION',
 *     analysisGoal: 'extract operator details',
 *     context: context  // 同一个context，包含了runtime2Data
 * };
 * 
 * const operatorResult = await operatorTool.execute(operatorInput);
 * 
 * // 检查是否使用了增强分析
 * if (operatorResult.data.enhancedWithRuntimeData) {
 *     console.log('使用了Runtime2Tool的数据进行增强分析');
 * }
 * ```
 */ 

/**
 * 导出所有包装器工具的数组
 */
export const existingFunctionWrappers = [
    ExtractVertexTool,
    ExtractRuntime2Tool,
    ExtractOperatorTool,
    ErrorLogTool
]; 
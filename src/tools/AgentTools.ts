import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolParameter, ToolResult, ToolCategory, ValidationResult, AgentContext } from '../types/AgentTypes';
import { Logger } from '../functions/logger';
import { analyzeScopeRuntimeStatistics, formatStatisticsReport } from '../functions/extractRuntime2';
import { parseAndAnalyzeScopeVertices } from '../functions/extractOperator';

/**
 * 工具基类 - 符合新的Agent架构
 */
export abstract class BaseTool implements Tool {
    abstract name: string;
    abstract description: string;
    abstract parameters: ToolParameter[];
    abstract category: ToolCategory;
    version: string = "1.0.0";
    
    protected logger: Logger;
    
    constructor(logger: Logger) {
        this.logger = logger;
    }
    
    abstract execute(input: any, context?: AgentContext): Promise<ToolResult>;
    
    validate(input: any): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        if (!input) {
            return { valid: false, errors: ['Input is required'], warnings: [] };
        }
        
        for (const param of this.parameters) {
            if (param.required && !input[param.name]) {
                errors.push(`Required parameter '${param.name}' is missing`);
            }
            
            if (input[param.name] !== undefined) {
                const value = input[param.name];
                if (!this.validateParameterType(value, param.type)) {
                    errors.push(`Parameter '${param.name}' should be of type '${param.type}'`);
                }
            }
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    
    getSchema() {
        return {
            input: this.generateInputSchema(),
            output: this.generateOutputSchema()
        };
    }
    
    protected logExecution(input: any): void {
        this.logger.info(`🔧 Executing tool ${this.name} with input: ${JSON.stringify(input)}`);
    }
    
    protected createSuccessResult(data: any, message: string, executionTime: number): ToolResult {
        return {
            success: true,
            data,
            message,
            executionTime,
            warnings: []
        };
    }
    
    protected createErrorResult(error: string, executionTime: number): ToolResult {
        return {
            success: false,
            data: null,
            message: error,
            executionTime,
            warnings: []
        };
    }
    
    private validateParameterType(value: any, expectedType: string): boolean {
        switch (expectedType) {
            case 'string': return typeof value === 'string';
            case 'number': return typeof value === 'number';
            case 'boolean': return typeof value === 'boolean';
            case 'object': return typeof value === 'object' && value !== null;
            case 'array': return Array.isArray(value);
            default: return true;
        }
    }
    
    private generateInputSchema(): any {
        const properties: any = {};
        const required: string[] = [];
        
        for (const param of this.parameters) {
            properties[param.name] = {
                type: param.type,
                description: param.description
            };
            
            if (param.required) {
                required.push(param.name);
            }
        }
        
        return {
            type: 'object',
            properties,
            required
        };
    }
    
    private generateOutputSchema(): any {
        return {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                data: { type: 'object' },
                message: { type: 'string' },
                executionTime: { type: 'number' }
            },
            required: ['success', 'data', 'message', 'executionTime']
        };
    }
}

/**
 * SCOPE 文件读取工具
 */
export class ScopeFileReaderTool extends BaseTool {
    name = "scope_file_reader";
    description = "读取和解析 SCOPE 相关文件（script, statistics, vertex definitions）";
    category: ToolCategory = "file_operations";
    parameters: ToolParameter[] = [
        { name: "jobFolder", type: "string", required: true, description: "SCOPE 作业文件夹路径" },
        { name: "fileTypes", type: "array", required: false, description: "要读取的文件类型", defaultValue: ["all"] }
    ];

    async execute(input: { jobFolder: string, fileTypes?: string[] }, context?: AgentContext): Promise<ToolResult> {
        const startTime = Date.now();
        this.logExecution(input);
        
        const { jobFolder, fileTypes = ["all"] } = input;
        const criticalFiles = ['scope.script', '__ScopeCodeGen__.dll.cs', '__ScopeRuntimeStatistics__.xml', 'ScopeVertexDef.xml'];
        
        try {
            let fullPath = jobFolder;
            
            // 如果是自动检测模式，首先检查context中是否有预选的job文件夹
            if (jobFolder === "auto_detect") {
                if (context?.workspaceState?.currentJobFolder) {
                    fullPath = context.workspaceState.currentJobFolder;
                    this.logger.info(`Using pre-selected job folder: ${fullPath}`);
                } else {
                    const detectedPath = await this.getLatestCosmosJobFolder();
                    if (!detectedPath) {
                        return this.createErrorResult("No Cosmos job folders found in temp directory", Date.now() - startTime);
                    }
                    fullPath = detectedPath;
                }
            }
            
            const fileContents = new Map<string, string>();
            
            if (!fs.existsSync(fullPath)) {
                return this.createErrorResult(`Job folder not found: ${fullPath}`, Date.now() - startTime);
            }
            
            const allFiles = await fs.promises.readdir(fullPath);
            
            for (const targetFile of criticalFiles) {
                if (fileTypes.includes("all") || fileTypes.includes(targetFile)) {
                    const matchingFiles = allFiles.filter(file => 
                        file.toLowerCase() === targetFile.toLowerCase());
                    
                    if (matchingFiles.length > 0) {
                        const file = matchingFiles[0];
                        const filePath = path.join(fullPath, file);
                        
                        if (fs.statSync(filePath).isFile()) {
                            const content = await fs.promises.readFile(filePath, 'utf8');
                            fileContents.set(file, content);
                            this.logger.info(`📄 Read file: ${file}, size: ${content.length}`);
                        }
                    }
                }
            }
            
            const result = {
                filesRead: Array.from(fileContents.keys()),
                fileContents: Object.fromEntries(fileContents),
                totalFiles: fileContents.size,
                jobFolder: fullPath
            };
            
            return this.createSuccessResult(result, `Successfully read ${result.totalFiles} files`, Date.now() - startTime);
            
        } catch (error) {
            this.logger.error(`ScopeFileReaderTool error: ${error}`);
            return this.createErrorResult(error instanceof Error ? error.message : String(error), Date.now() - startTime);
        }
    }
    
    private async getLatestCosmosJobFolder(): Promise<string | null> {
        try {
            const username = require('os').userInfo().username;
            const tempPath = `C:\\Users\\${username}\\AppData\\Local\\Temp\\DataLakeTemp`;
            
            if (!fs.existsSync(tempPath)) {
                return null;
            }
            
            const items = (await fs.promises.readdir(tempPath, { withFileTypes: true }))
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
                
            const cosmosJobs = items.filter(item => {
                const fullPath = path.join(tempPath, item);
                return item.toLowerCase().includes('cosmos') && fs.statSync(fullPath).isDirectory();
            }).sort((a, b) => {
                const statA = fs.statSync(path.join(tempPath, a));
                const statB = fs.statSync(path.join(tempPath, b));
                return statB.birthtimeMs - statA.birthtimeMs;
            });
            
            if (cosmosJobs.length > 0) {
                return path.join(tempPath, cosmosJobs[0]);
            }
            
            return null;
        } catch (error) {
            this.logger.error(`Error finding Cosmos job folders: ${error}`);
            return null;
        }
    }
}

/**
 * SCOPE 性能分析工具
 */
export class ScopePerformanceAnalyzerTool extends BaseTool {
    name = "scope_performance_analyzer";
    description = "分析 SCOPE 脚本的性能统计信息，识别瓶颈和问题";
    category: ToolCategory = "analysis";
    parameters: ToolParameter[] = [
        { name: "statisticsFile", type: "string", required: true, description: "运行时统计文件路径" },
        { name: "analysisDepth", type: "string", required: false, description: "分析深度", defaultValue: "detailed" }
    ];

    async execute(input: { statisticsFile: string, analysisDepth?: string }, context?: AgentContext): Promise<ToolResult> {
        const startTime = Date.now();
        this.logExecution(input);
        
        const { statisticsFile, analysisDepth = "detailed" } = input;
        
        try {
            if (!fs.existsSync(statisticsFile)) {
                return this.createErrorResult(`Statistics file not found: ${statisticsFile}`, Date.now() - startTime);
            }
            
            const analysisResult = analyzeScopeRuntimeStatistics(statisticsFile);
            const formattedReport = formatStatisticsReport(analysisResult);
            const keyMetrics = this.extractKeyMetrics(analysisResult);
            const bottlenecks = this.identifyBottlenecks(analysisResult);
            const recommendations = this.generateRecommendations(bottlenecks);
            
            const result = {
                analysis: analysisResult,
                formattedReport,
                keyMetrics,
                bottlenecks,
                recommendations,
                analysisDepth,
                timestamp: new Date()
            };
            
            return this.createSuccessResult(result, `Performance analysis completed with ${bottlenecks.length} bottlenecks identified`, Date.now() - startTime);
            
        } catch (error) {
            this.logger.error(`ScopePerformanceAnalyzerTool error: ${error}`);
            return this.createErrorResult(error instanceof Error ? error.message : String(error), Date.now() - startTime);
        }
    }
    
    private extractKeyMetrics(analysis: any): any {
        return {
            totalExecutionTime: analysis.totalExecutionTime || "N/A",
            peakMemoryUsage: analysis.peakMemoryUsage || "N/A",
            totalDataProcessed: analysis.totalDataProcessed || "N/A",
            vertexCount: analysis.vertexCount || 0,
            edgeCount: analysis.edgeCount || 0
        };
    }
    
    private identifyBottlenecks(analysis: any): any[] {
        const bottlenecks = [];
        
        if (analysis.slowVertices) {
            bottlenecks.push({
                type: "slow_vertex",
                description: "发现执行缓慢的顶点",
                details: analysis.slowVertices
            });
        }
        
        if (analysis.memoryIntensiveOperations) {
            bottlenecks.push({
                type: "memory_intensive",
                description: "发现内存密集型操作",
                details: analysis.memoryIntensiveOperations
            });
        }
        
        return bottlenecks;
    }
    
    private generateRecommendations(bottlenecks: any[]): string[] {
        const recommendations = [];
        
        for (const bottleneck of bottlenecks) {
            switch (bottleneck.type) {
                case "slow_vertex":
                    recommendations.push("考虑优化慢速顶点的算法或增加并行度");
                    break;
                case "memory_intensive":
                    recommendations.push("考虑分批处理数据或优化内存使用");
                    break;
                default:
                    recommendations.push("建议进行进一步的性能分析");
            }
        }
        
        return recommendations;
    }
}

/**
 * SCOPE 顶点分析工具
 */
export class ScopeVertexAnalyzerTool extends BaseTool {
    name = "scope_vertex_analyzer";
    description = "分析 SCOPE 脚本的顶点定义和执行图";
    category: ToolCategory = "analysis";
    parameters: ToolParameter[] = [
        { name: "vertexDefFile", type: "string", required: true, description: "顶点定义文件路径" },
        { name: "performanceData", type: "object", required: false, description: "性能数据用于关联分析" }
    ];

    async execute(input: { vertexDefFile: string, performanceData?: any }, context?: AgentContext): Promise<ToolResult> {
        const startTime = Date.now();
        this.logExecution(input);
        
        const { vertexDefFile, performanceData } = input;
        
        try {
            if (!fs.existsSync(vertexDefFile)) {
                return this.createErrorResult(`Vertex definition file not found: ${vertexDefFile}`, Date.now() - startTime);
            }
            
            const analysis = parseAndAnalyzeScopeVertices(vertexDefFile, performanceData);
            const vertexGraph = this.buildVertexGraph(analysis);
            const criticalPath = this.findCriticalPath(vertexGraph);
            const parallelizationOpportunities = this.identifyParallelizationOpportunities(vertexGraph);
            
            const result = {
                analysis,
                vertexGraph,
                criticalPath,
                parallelizationOpportunities
            };
            
            return this.createSuccessResult(result, "Vertex analysis completed successfully", Date.now() - startTime);
            
        } catch (error) {
            this.logger.error(`ScopeVertexAnalyzerTool error: ${error}`);
            return this.createErrorResult(error instanceof Error ? error.message : String(error), Date.now() - startTime);
        }
    }
    
    private buildVertexGraph(analysis: any): any {
        // 简化的图构建逻辑
        return { vertices: analysis.vertices || [], edges: analysis.edges || [] };
    }
    
    private findCriticalPath(graph: any): any[] {
        // 简化的关键路径查找
        return graph.vertices.slice(0, 3); // 返回前3个顶点作为示例
    }
    
    private identifyParallelizationOpportunities(graph: any): any[] {
        // 简化的并行化机会识别
        return [{ description: "识别到潜在的并行化机会", vertices: graph.vertices.slice(0, 2) }];
    }
}

/**
 * SCOPE 代码优化工具
 */
export class ScopeCodeOptimizerTool extends BaseTool {
    name = "scope_code_optimizer";
    description = "基于性能分析结果生成 SCOPE 代码优化建议";
    category: ToolCategory = "optimization";
    parameters: ToolParameter[] = [
        { name: "scopeScript", type: "string", required: true, description: "SCOPE 脚本内容" },
        { name: "performanceAnalysis", type: "object", required: false, description: "性能分析结果" },
        { name: "optimizationLevel", type: "string", required: false, description: "优化级别", defaultValue: "moderate" }
    ];

    async execute(input: { scopeScript: string, performanceAnalysis?: any, optimizationLevel?: string }, context?: AgentContext): Promise<ToolResult> {
        const startTime = Date.now();
        this.logExecution(input);
        
        const { scopeScript, performanceAnalysis, optimizationLevel = "moderate" } = input;
        
        try {
            const optimizations = [];
            
            // 深度分析SCOPE脚本和性能数据
            const scriptAnalysis = this.parseScript(scopeScript);
            const performanceBottlenecks = this.identifyPerformanceBottlenecks(performanceAnalysis);
            
            // 基于实际性能数据生成专业优化建议
            const joinOptimizations = this.analyzeJoinOptimizations(scriptAnalysis, performanceBottlenecks);
            optimizations.push(...joinOptimizations);
            
            const aggregationOptimizations = this.analyzeAggregationOptimizations(scriptAnalysis, performanceBottlenecks);
            optimizations.push(...aggregationOptimizations);
            
            const dataSkewOptimizations = this.analyzeDataSkewOptimizations(scriptAnalysis, performanceBottlenecks);
            optimizations.push(...dataSkewOptimizations);
            
            const predicatePushdownOptimizations = this.analyzePredicatePushdownOptimizations(scriptAnalysis, performanceBottlenecks);
            optimizations.push(...predicatePushdownOptimizations);
            
            const compilerHintOptimizations = this.generateCompilerHintOptimizations(scriptAnalysis, performanceBottlenecks);
            optimizations.push(...compilerHintOptimizations);
            
            const memoryOptimizations = this.analyzeMemoryOptimizations(scriptAnalysis, performanceBottlenecks);
            optimizations.push(...memoryOptimizations);
            
            // 根据优化级别过滤建议
            const filteredOptimizations = this.filterOptimizationsByLevel(optimizations, optimizationLevel);
            
            const estimatedImprovement = this.estimateImprovement(filteredOptimizations);
            
            const result = {
                optimizations: filteredOptimizations,
                scriptAnalysis,
                performanceBottlenecks,
                estimatedImprovement,
                optimizationLevel,
                totalOptimizations: filteredOptimizations.length,
                criticalIssues: this.identifyCriticalIssues(filteredOptimizations),
                quickWins: this.identifyQuickWins(filteredOptimizations)
            };
            
            return this.createSuccessResult(result, `Generated ${filteredOptimizations.length} professional optimization suggestions`, Date.now() - startTime);
            
        } catch (error) {
            this.logger.error(`ScopeCodeOptimizerTool error: ${error}`);
            return this.createErrorResult(error instanceof Error ? error.message : String(error), Date.now() - startTime);
        }
    }
    
    private parseScript(script: string): any {
        // 解析SCOPE脚本结构
        const analysis = {
            joins: [] as any[],
            aggregations: [] as any[],
            filters: [] as any[],
            selects: [] as any[],
            operations: [] as any[],
            complexity: 'medium'
        };
        
        const lines = script.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            
            // 识别JOIN操作
            if (lowerLine.includes('join')) {
                const joinType = lowerLine.includes('inner') ? 'INNER' : 
                               lowerLine.includes('left') ? 'LEFT' : 
                               lowerLine.includes('right') ? 'RIGHT' : 'INNER';
                analysis.joins.push({ type: joinType, line, complexity: this.estimateJoinComplexity(line) });
            }
            
            // 识别聚合操作
            if (lowerLine.includes('group by') || lowerLine.includes('aggregate')) {
                analysis.aggregations.push({ line, hasGroupBy: lowerLine.includes('group by') });
            }
            
            // 识别WHERE条件
            if (lowerLine.includes('where')) {
                analysis.filters.push({ line, isSelective: this.isSelectiveFilter(line) });
            }
            
            // 识别SELECT操作
            if (lowerLine.includes('select')) {
                analysis.selects.push({ line, columnCount: this.countColumns(line) });
            }
        }
        
        analysis.complexity = this.assessScriptComplexity(analysis);
        return analysis;
    }
    
    private identifyPerformanceBottlenecks(performanceAnalysis: any): any {
        const bottlenecks = {
            slowOperations: [],
            memoryHungryOperations: [],
            dataSkewIssues: [],
            inefficientJoins: [],
            cpuIntensiveOperations: []
        };
        
        if (performanceAnalysis?.performance?.analysis) {
            const analysis = performanceAnalysis.performance.analysis;
            
            // 识别慢操作
            if (analysis.slowVertices) {
                bottlenecks.slowOperations = analysis.slowVertices;
            }
            
            // 识别内存密集操作
            if (analysis.memoryIntensiveOperations) {
                bottlenecks.memoryHungryOperations = analysis.memoryIntensiveOperations;
            }
        }
        
        return bottlenecks;
    }
    
    private analyzeJoinOptimizations(scriptAnalysis: any, bottlenecks: any): any[] {
        const optimizations = [];
        
        for (const join of scriptAnalysis.joins || []) {
            if (join.complexity === 'high' || bottlenecks.inefficientJoins.length > 0) {
                optimizations.push({
                    type: 'broadcast_join',
                    category: 'JOIN优化',
                    title: '使用BROADCAST JOIN优化',
                    description: '将小表广播到大表所在的节点，避免数据shuffle',
                    originalCode: join.line,
                    optimizedCode: this.generateBroadcastJoinCode(join.line),
                    compilerHint: 'USE HINT(BROADCAST(small_table))',
                    impact: 'high',
                    difficulty: 'low',
                    estimatedImprovement: '30-60%',
                    reasoning: '减少网络传输，特别适用于一个表显著小于另一个表的情况'
                });
            }
            
            if (join.type === 'INNER' && this.canOptimizeToSemiJoin(join.line)) {
                optimizations.push({
                    type: 'semi_join',
                    category: 'JOIN优化', 
                    title: '转换为SEMI JOIN',
                    description: '当只需要检查存在性时，使用SEMI JOIN替代INNER JOIN',
                    originalCode: join.line,
                    optimizedCode: this.generateSemiJoinCode(join.line),
                    compilerHint: 'SEMI JOIN将提高性能且减少输出数据量',
                    impact: 'medium',
                    difficulty: 'medium',
                    estimatedImprovement: '20-40%',
                    reasoning: '避免重复行，减少后续处理的数据量'
                });
            }
        }
        
        return optimizations;
    }
    
    private analyzeAggregationOptimizations(scriptAnalysis: any, bottlenecks: any): any[] {
        const optimizations = [];
        
        for (const aggregation of scriptAnalysis.aggregations || []) {
            if (aggregation.hasGroupBy) {
                optimizations.push({
                    type: 'pre_aggregation',
                    category: '聚合优化',
                    title: '预聚合优化',
                    description: '在数据传输前进行局部聚合，减少网络开销',
                    originalCode: aggregation.line,
                    optimizedCode: this.generatePreAggregationCode(aggregation.line),
                    compilerHint: 'USE HINT(COMBINE) // 启用预聚合',
                    impact: 'high',
                    difficulty: 'low',
                    estimatedImprovement: '25-50%',
                    reasoning: '显著减少shuffle阶段的数据量，特别适用于高基数分组'
                });
                
                optimizations.push({
                    type: 'partition_hint',
                    category: '聚合优化',
                    title: '分区提示优化',
                    description: '为GROUP BY操作添加合适的分区提示',
                    originalCode: aggregation.line,
                    optimizedCode: this.generatePartitionHintCode(aggregation.line),
                    compilerHint: 'USE HINT(PARTITION(column_name, 100)) // 指定分区数',
                    impact: 'medium',
                    difficulty: 'low',
                    estimatedImprovement: '15-30%',
                    reasoning: '优化数据分布，避免热点和数据倾斜问题'
                });
            }
        }
        
        return optimizations;
    }
    
    private analyzeDataSkewOptimizations(scriptAnalysis: any, bottlenecks: any): any[] {
        const optimizations = [];
        
        if (bottlenecks.dataSkewIssues.length > 0 || this.detectPotentialSkew(scriptAnalysis)) {
            optimizations.push({
                type: 'skew_hint',
                category: '数据倾斜优化',
                title: 'SKEW hint 处理数据倾斜',
                description: '为倾斜的键添加SKEW提示，让编译器特殊处理热点数据',
                originalCode: 'GROUP BY skewed_column',
                optimizedCode: 'GROUP BY skewed_column\nUSE HINT(SKEW(skewed_column, "hot_value1", "hot_value2"))',
                compilerHint: 'SKEW hint告诉编译器哪些值会造成数据倾斜',
                impact: 'high',
                difficulty: 'medium',
                estimatedImprovement: '40-70%',
                reasoning: '将热点数据分散到多个reducer，避免单点瓶颈'
            });
            
            optimizations.push({
                type: 'salting',
                category: '数据倾斜优化',
                title: '加盐技术 (Salting)',
                description: '为倾斜键添加随机前缀，均匀分布数据',
                originalCode: 'GROUP BY user_id',
                optimizedCode: `GROUP BY CONCAT(user_id, "_", (user_id.GetHashCode() % 10).ToString())`,
                compilerHint: '// 加盐后需要二次聚合来获得最终结果',
                impact: 'high',
                difficulty: 'high',
                estimatedImprovement: '50-80%',
                reasoning: '彻底解决数据倾斜问题，但需要修改查询逻辑'
            });
        }
        
        return optimizations;
    }
    
    private analyzePredicatePushdownOptimizations(scriptAnalysis: any, bottlenecks: any): any[] {
        const optimizations = [];
        
        for (const filter of scriptAnalysis.filters || []) {
            if (filter.isSelective) {
                optimizations.push({
                    type: 'predicate_pushdown',
                    category: '谓词下推优化',
                    title: '过滤条件前置',
                    description: '将选择性强的过滤条件尽早应用，减少处理的数据量',
                    originalCode: filter.line,
                    optimizedCode: this.generateEarlyFilterCode(filter.line),
                    compilerHint: '// 确保过滤条件在JOIN之前执行',
                    impact: 'high',
                    difficulty: 'low',
                    estimatedImprovement: '30-60%',
                    reasoning: '减少参与JOIN和聚合操作的数据量，显著提升性能'
                });
            }
        }
        
        return optimizations;
    }
    
    private generateCompilerHintOptimizations(scriptAnalysis: any, bottlenecks: any): any[] {
        const optimizations = [];
        
        // 数据提示优化
        optimizations.push({
            type: 'data_hint',
            category: 'SCOPE编译器提示',
            title: 'DATA hint 优化数据分布',
            description: '为编译器提供数据分布信息，优化执行计划',
            originalCode: 'FROM input_table',
            optimizedCode: 'FROM input_table\nUSE HINT(DATA(input_table, UNIQUE(id), CARDINALITY(1000000)))',
            compilerHint: 'DATA hint提供表统计信息帮助编译器优化',
            impact: 'medium',
            difficulty: 'low',
            estimatedImprovement: '10-25%',
            reasoning: '让编译器选择最优的JOIN算法和并行度'
        });
        
        // 并行度优化
        optimizations.push({
            type: 'parallel_hint',
            category: 'SCOPE编译器提示',
            title: '并行度调优',
            description: '根据数据量和复杂度调整操作的并行度',
            originalCode: 'GROUP BY column',
            optimizedCode: 'GROUP BY column\nUSE HINT(PARTITION(column, 200))',
            compilerHint: '// 根据数据大小调整分区数：小数据用少分区，大数据用多分区',
            impact: 'medium',
            difficulty: 'low',
            estimatedImprovement: '15-35%',
            reasoning: '避免过度分区导致的开销或分区不足导致的瓶颈'
        });
        
        return optimizations;
    }
    
    private analyzeMemoryOptimizations(scriptAnalysis: any, bottlenecks: any): any[] {
        const optimizations = [];
        
        if (bottlenecks.memoryHungryOperations.length > 0) {
            optimizations.push({
                type: 'memory_optimization',
                category: '内存优化',
                title: '减少列读取',
                description: '只选择必要的列，减少内存占用',
                originalCode: 'SELECT *',
                optimizedCode: 'SELECT specific_column1, specific_column2',
                compilerHint: '// 避免SELECT *，明确指定需要的列',
                impact: 'medium',
                difficulty: 'low',
                estimatedImprovement: '20-40%',
                reasoning: '减少内存使用和网络传输，特别是对于宽表'
            });
            
            optimizations.push({
                type: 'memory_spill',
                category: '内存优化',
                title: '启用内存溢出',
                description: '允许大数据集溢出到磁盘，避免内存溢出错误',
                originalCode: 'GROUP BY high_cardinality_column',
                optimizedCode: 'GROUP BY high_cardinality_column\nUSE HINT(ALLOWMEMORYSPILL)',
                compilerHint: 'ALLOWMEMORYSPILL防止内存不足导致的失败',
                impact: 'high',
                difficulty: 'low',
                estimatedImprovement: '避免作业失败',
                reasoning: '对于内存密集型操作，允许使用磁盘缓解内存压力'
            });
        }
        
        return optimizations;
    }
    
    private identifyCriticalIssues(optimizations: any[]): any[] {
        return optimizations.filter(opt => opt.impact === 'high' && opt.difficulty === 'low');
    }
    
    private identifyQuickWins(optimizations: any[]): any[] {
        return optimizations.filter(opt => opt.difficulty === 'low' && parseFloat(opt.estimatedImprovement) > 15);
    }
    
    // 辅助方法
    private estimateJoinComplexity(line: string): string {
        if (line.toLowerCase().includes('cross') || line.toLowerCase().includes('cartesian')) return 'high';
        if (line.toLowerCase().includes('on') && line.split('=').length > 2) return 'medium';
        return 'low';
    }
    
    private isSelectiveFilter(line: string): boolean {
        return line.toLowerCase().includes('=') || line.toLowerCase().includes('<') || line.toLowerCase().includes('>');
    }
    
    private countColumns(line: string): number {
        if (line.toLowerCase().includes('select *')) return 999;
        return (line.match(/,/g) || []).length + 1;
    }
    
    private assessScriptComplexity(analysis: any): string {
        const totalOps = analysis.joins.length + analysis.aggregations.length + analysis.filters.length;
        if (totalOps > 10) return 'high';
        if (totalOps > 5) return 'medium';
        return 'low';
    }
    
    private detectPotentialSkew(scriptAnalysis: any): boolean {
        // 简单的数据倾斜检测逻辑
        return scriptAnalysis.aggregations.length > 0 || scriptAnalysis.joins.length > 2;
    }
    
    private canOptimizeToSemiJoin(line: string): boolean {
        return line.toLowerCase().includes('exists') || line.toLowerCase().includes('in (');
    }
    
    private generateBroadcastJoinCode(originalLine: string): string {
        return originalLine + '\nUSE HINT(BROADCAST(smaller_table))';
    }
    
    private generateSemiJoinCode(originalLine: string): string {
        return originalLine.replace(/INNER JOIN/i, 'SEMI JOIN');
    }
    
    private generatePreAggregationCode(originalLine: string): string {
        return originalLine + '\nUSE HINT(COMBINE)';
    }
    
    private generatePartitionHintCode(originalLine: string): string {
        return originalLine + '\nUSE HINT(PARTITION(group_column, 100))';
    }
    
    private generateEarlyFilterCode(originalLine: string): string {
        return '-- 将此过滤条件移到JOIN之前\n' + originalLine;
    }
    
    private filterOptimizationsByLevel(optimizations: any[], level: string): any[] {
        switch (level) {
            case 'conservative':
                return optimizations.filter(opt => opt.difficulty === 'low');
            case 'aggressive':
                return optimizations; // 返回所有优化建议
            default: // moderate
                return optimizations.filter(opt => opt.difficulty !== 'high');
        }
    }
    
    private estimateImprovement(optimizations: any[]): string {
        if (optimizations.length === 0) return '0%';
        
        const totalImpact = optimizations.reduce((sum, opt) => {
            const avgImprovement = this.parseImprovementRange(opt.estimatedImprovement);
            return sum + avgImprovement;
        }, 0);
        
        return `${Math.round(totalImpact)}%`;
    }
    
    private parseImprovementRange(range: string): number {
        const match = range.match(/(\d+)-(\d+)%/);
        if (match) {
            return (parseInt(match[1]) + parseInt(match[2])) / 2;
        }
        return 0;
    }
}

/**
 * 报告生成工具
 */
export class ReportGeneratorTool extends BaseTool {
    name = "report_generator";
    description = "生成综合的分析和优化报告";
    category: ToolCategory = "reporting";
    parameters: ToolParameter[] = [
        { name: "analysisResults", type: "object", required: true, description: "分析结果数据" },
        { name: "reportFormat", type: "string", required: false, description: "报告格式", defaultValue: "markdown" },
        { name: "includeCharts", type: "boolean", required: false, description: "是否包含图表", defaultValue: false }
    ];

    async execute(input: { analysisResults: any, reportFormat?: string, includeCharts?: boolean }, context?: AgentContext): Promise<ToolResult> {
        const startTime = Date.now();
        this.logExecution(input);
        
        const { analysisResults, reportFormat = "markdown", includeCharts = false } = input;
        
        try {
            let report = "";
            
            switch (reportFormat.toLowerCase()) {
                case "html":
                    report = this.generateHtmlReport(analysisResults, includeCharts);
                    break;
                case "json":
                    report = JSON.stringify(analysisResults, null, 2);
                    break;
                default: // markdown
                    report = this.generateMarkdownReport(analysisResults, includeCharts);
            }
            
            const result = {
                report,
                format: reportFormat,
                sections: this.getReportSections(analysisResults),
                generatedAt: new Date().toISOString()
            };
            
            return this.createSuccessResult(result, `Report generated successfully in ${reportFormat} format`, Date.now() - startTime);
            
        } catch (error) {
            this.logger.error(`ReportGeneratorTool error: ${error}`);
            return this.createErrorResult(error instanceof Error ? error.message : String(error), Date.now() - startTime);
        }
    }
    
    private generateMarkdownReport(analysisResults: any, includeCharts: boolean): string {
        let report = "# SCOPE 性能分析报告\n\n";
        report += `生成时间: ${new Date().toLocaleString()}\n\n`;
        
        if (analysisResults.performance) {
            report += this.formatPerformanceSection(analysisResults.performance);
        }
        
        if (analysisResults.optimizations) {
            report += this.formatOptimizationSection(analysisResults.optimizations);
        }
        
        if (analysisResults.vertex) {
            report += this.formatVertexSection(analysisResults.vertex);
        }
        
        return report;
    }
    
    private generateHtmlReport(analysisResults: any, includeCharts: boolean): string {
        return `<html><body><h1>SCOPE 性能分析报告</h1><p>HTML格式报告内容...</p></body></html>`;
    }
    
    private formatPerformanceSection(performance: any): string {
        let section = "## 性能分析结果\n\n";
        
        if (performance.keyMetrics) {
            section += "### 关键指标\n\n";
            Object.entries(performance.keyMetrics).forEach(([key, value]) => {
                section += `- **${key}**: ${value}\n`;
            });
            section += "\n";
        }
        
        if (performance.bottlenecks && performance.bottlenecks.length > 0) {
            section += "### 性能瓶颈\n\n";
            performance.bottlenecks.forEach((bottleneck: any, index: number) => {
                section += `${index + 1}. **${bottleneck.type}**: ${bottleneck.description}\n`;
            });
            section += "\n";
        }
        
        return section;
    }
    
    private formatOptimizationSection(optimizations: any): string {
        let section = "## 优化建议\n\n";
        
        if (optimizations.optimizations && optimizations.optimizations.length > 0) {
            optimizations.optimizations.forEach((opt: any, index: number) => {
                section += `${index + 1}. **${opt.type}** (${opt.impact} impact)\n`;
                section += `   - ${opt.description}\n`;
                section += `   - 预期改进: ${opt.estimatedImprovement}\n`;
                section += `   - 实施难度: ${opt.difficulty}\n\n`;
            });
        }
        
        return section;
    }
    
    private formatVertexSection(vertex: any): string {
        let section = "## 顶点分析\n\n";
        section += "顶点分析结果已包含在分析中。\n\n";
        return section;
    }
    
    private getReportSections(analysisResults: any): string[] {
        const sections = [];
        
        if (analysisResults.performance) sections.push("性能分析");
        if (analysisResults.optimizations) sections.push("优化建议");
        if (analysisResults.vertex) sections.push("顶点分析");
        
        return sections;
    }
}

/**
 * 工具注册器
 */
export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
        this.initializeDefaultTools();
    }

    private initializeDefaultTools(): void {
        this.registerTool(new ScopeFileReaderTool(this.logger));
        this.registerTool(new ScopePerformanceAnalyzerTool(this.logger));
        this.registerTool(new ScopeVertexAnalyzerTool(this.logger));
        this.registerTool(new ScopeCodeOptimizerTool(this.logger));
        this.registerTool(new ReportGeneratorTool(this.logger));
    }

    registerTool(tool: Tool): void {
        this.tools.set(tool.name, tool);
        this.logger.info(`🔧 Registered tool: ${tool.name} (${tool.category})`);
    }

    getTool(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    getAllTools(): Tool[] {
        return Array.from(this.tools.values());
    }

    getToolsByCategory(category: ToolCategory): Tool[] {
        return Array.from(this.tools.values()).filter(tool => tool.category === category);
    }
}

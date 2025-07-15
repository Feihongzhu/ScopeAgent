/**
 * 工具输入参数
 */
export interface ToolInput {
    filePath: string;
    fileType: string;
    analysisGoal: string;
    context?: AnalysisContext;
}

/**
 * 工具输出结果
 */
export interface ToolOutput {
    success: boolean;
    data: any;
    metadata: ToolMetadata;
    errors?: string[];
    suggestions?: string[];
}

/**
 * 工具元数据
 */
export interface ToolMetadata {
    toolName: string;
    timestamp: string;
    [key: string]: any;
}

/**
 * 工具配置
 */
export interface ToolConfig {
    [key: string]: any;
}

/**
 * 分析上下文
 */
export interface AnalysisContext {
    jobId: string;
    intermediateResults: Map<string, any>;
    [key: string]: any;
} 
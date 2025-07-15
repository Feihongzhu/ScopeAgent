/**
 * SCOPE AI Agent 框架核心类型定义
 */

// ============= 文件定义系统 =============

export interface SCOPEFileDefinition {
    fileType: string;              // 文件类型标识
    pattern: RegExp;               // 文件名匹配模式
    description: string;           // 文件描述
    readerTool: string;           // 对应的读取工具
    priority: number;             // 分析优先级 (1-10, 10最高)
    category: 'script' | 'generated' | 'statistics' | 'execution_plan' | 'metadata' | 'diagnostics' | 'profiling';
    required: boolean;            // 是否必需文件
    processingStrategy: ProcessingStrategy; // 处理策略
}

export enum ProcessingStrategy {
    INTELLIGENT_SEGMENTATION = 'intelligent_segmentation',  // 智能分段，保留关键代码
    SUMMARY_WITH_KEY_METHODS = 'summary_with_key_methods', // 总结+关键方法
    STRUCTURED_EXTRACTION = 'structured_extraction',       // 结构化数据提取
    VERTEX_ANALYSIS = 'vertex_analysis',                   // 顶点分析
    BASIC_INFO_EXTRACTION = 'basic_info_extraction',       // 基础信息提取
    PLAN_ANALYSIS = 'plan_analysis',                       // 执行计划分析
    WARNING_CATEGORIZATION = 'warning_categorization',     // 警告分类
    RUNTIME_ANALYSIS = 'runtime_analysis',                 // 运行时分析
    ERROR_ANALYSIS = 'error_analysis',                     // 错误分析
    PERFORMANCE_PROFILING = 'performance_profiling'        // 性能画像
}

export interface DiscoveredFile {
    filePath: string;
    fileType: string;
    definition: SCOPEFileDefinition;
    exists: boolean;
    size: number;
    lastModified: Date;
}

export interface ValidationResult {
    isValid: boolean;
    missingRequiredFiles: string[];
    foundFiles: DiscoveredFile[];
    warnings: string[];
}

// ============= 工具系统 =============

export enum ToolCategory {
    FILE_READER = 'file_reader',
    ANALYZER = 'analyzer', 
    CODE_GENERATOR = 'code_generator',
    EXTRACTOR = 'extractor'
}

export interface ToolInput {
    filePath: string;
    fileType: string;
    analysisGoal: string;
    context?: AnalysisContext;
    options?: any;
}

export interface ToolOutput {
    success: boolean;
    data: any;
    metadata: ToolMetadata;
    errors?: string[];
    suggestions?: string[];
    tokenUsage?: {
        estimated: number;
        actual?: number;
    };
}

export interface ToolMetadata {
    executionTime: number;
    toolName: string;
    timestamp: Date;
    processingStrategy: ProcessingStrategy;
    confidence?: number;
}

export interface ToolConfig {
    maxTokens?: number;
    includeSummary?: boolean;
    preserveCodeStructure?: boolean;
    analysisDepth?: 'basic' | 'detailed' | 'comprehensive';
}

export interface AnalysisTool {
    name: string;
    description: string;
    category: ToolCategory;
    
    // 工具能力声明
    canHandle(fileType: string): boolean;
    
    // 执行工具
    execute(input: ToolInput): Promise<ToolOutput>;
    
    // 工具配置
    configure(config: ToolConfig): void;
    
    // 估算token使用量
    estimateTokenUsage(input: ToolInput): number;
}

// ============= Agent系统 =============

export interface Agent {
    id: string;
    name: string;
    role: AgentRole;
    capabilities: string[];
    
    // Agent生命周期
    initialize(): Promise<boolean>;
    process(input: AgentInput): Promise<AgentOutput>;
    cleanup(): Promise<void>;
    
    // Agent状态
    getStatus(): AgentStatus;
    getPerformanceStats(): AgentPerformanceStats;
}

export enum AgentRole {
    COORDINATOR = 'coordinator',
    FILE_READER = 'file_reader', 
    PERFORMANCE_ANALYZER = 'performance_analyzer',
    CODE_GENERATOR = 'code_generator'
}

export interface AgentInput {
    requestId: string;
    data: any;
    context: AnalysisContext;
    instructions?: string;
}

export interface AgentOutput {
    success: boolean;
    data: any;
    confidence: number;
    executionTime: number;
    errors?: AgentError[];
    suggestions?: string[];
    nextSteps?: string[];
    metadata?: any;
}

export interface AgentError {
    code: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    recoverable: boolean;
}

export interface AgentStatus {
    isInitialized: boolean;
    isProcessing: boolean;
    lastActivity: Date;
    processedRequests: number;
    errorCount: number;
}

export interface AgentPerformanceStats {
    totalRequests: number;
    averageResponseTime: number;
    successRate: number;
    averageConfidence: number;
    totalTokensUsed: number;
}

// ============= Agent通信协议 =============

export interface AgentMessage {
    id: string;
    from: string;
    to: string;
    type: MessageType;
    payload: any;
    timestamp: Date;
    priority: MessagePriority;
    correlationId?: string;
}

export enum MessageType {
    TASK_ASSIGNMENT = "TASK_ASSIGNMENT",
    DATA_SHARING = "DATA_SHARING", 
    ANALYSIS_RESULT = "ANALYSIS_RESULT",
    REQUEST_ASSISTANCE = "REQUEST_ASSISTANCE",
    COMPLETION_NOTICE = "COMPLETION_NOTICE",
    ERROR_NOTIFICATION = "ERROR_NOTIFICATION"
}

export enum MessagePriority {
    LOW = 1,
    MEDIUM = 2,
    HIGH = 3,
    CRITICAL = 4
}

// ============= 分析上下文 =============

export interface AnalysisContext {
    sessionId: string;
    jobId?: string;
    jobPath: string;
    userQuery: string;
    discoveredFiles: DiscoveredFile[];
    analysisGoals: string[];
    intermediateResults: Map<string, any>;
    sharedKnowledge: KnowledgeBase;
    executionPlan?: ExecutionStep[];
    currentStep?: number;
    preferences: AnalysisPreferences;
}

export interface KnowledgeBase {
    patterns: Map<string, any>;
    previousAnalyses: any[];
    userFeedback: any[];
    optimizationHistory: any[];
}

export interface ExecutionStep {
    id: string;
    name: string;
    description: string;
    agentRole: AgentRole;
    dependencies: string[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    input?: any;
    output?: any;
    errors?: AgentError[];
}

export interface AnalysisPreferences {
    analysisDepth: 'basic' | 'detailed' | 'comprehensive';
    includeCodeExamples: boolean;
    prioritizePerformance: boolean;
    maxTokenUsage: number;
    language: 'zh' | 'en';
}

// ============= 文件处理结果 =============

export interface FileProcessingResult {
    fileType: string;
    processingStrategy: ProcessingStrategy;
    success: boolean;
    data: any;
    summary?: string;
    keyFindings?: string[];
    tokenUsage: number;
    processingTime: number;
}

export interface ScriptSegmentationResult {
    criticalSections: CodeSection[];
    summarizedSections: CodeSection[];
    performanceHotspots: CodeSection[];
    codeStructure: StructureOverview;
    totalLines: number;
    criticalLines: number;
    tokenEstimate: number;
}

export interface CodeSection {
    startLine: number;
    endLine: number;
    content: string;
    type: 'critical' | 'summarized' | 'hotspot';
    description: string;
    reason: string;
}

export interface StructureOverview {
    mainSteps: string[];
    dataFlow: string[];
    keyVariables: string[];
    tableReferences: string[];
}

// ============= 性能分析结果 =============

export interface PerformanceAnalysisResult {
    dimensions: {
        codeStructure: AnalysisDimension;
        executionPerformance: AnalysisDimension;
        dataProcessing: AnalysisDimension;
    };
    identifiedIssues: PerformanceIssue[];
    bottlenecks: PerformanceBottleneck[];
    insights: AnalysisInsight[];
    confidence: number;
}

export interface AnalysisDimension {
    score: number; // 1-10
    issues: PerformanceIssue[];
    recommendations: string[];
    confidence: number;
}

export interface PerformanceIssue {
    id: string;
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: 'code' | 'execution' | 'data';
    location?: {
        file: string;
        lineNumber?: number;
        section?: string;
    };
    impact: string;
    evidence: string[];
}

export interface PerformanceBottleneck {
    id: string;
    name: string;
    type: 'cpu' | 'memory' | 'io' | 'network' | 'algorithm';
    severity: number; // 1-10
    location: string;
    description: string;
    metrics: any;
    suggestedFix: string;
}

export interface AnalysisInsight {
    type: 'pattern' | 'anomaly' | 'opportunity' | 'risk';
    title: string;
    description: string;
    confidence: number;
    relevance: number;
    actionable: boolean;
}

// ============= 代码优化建议 =============

export interface OptimizationSuggestion {
    id: string;
    title: string;
    description: string;
    category: 'index' | 'query_rewrite' | 'partition' | 'join' | 'algorithm' | 'other';
    priority: 'high' | 'medium' | 'low';
    
    codeComparison: {
        original: {
            code: string;
            lineNumber?: number;
            file: string;
        };
        optimized: {
            code: string;
            explanation: string;
        };
    };
    
    expectedImpact: {
        performanceGain: string;
        resourceSaving: string;
        complexity: string;
    };
    
    implementationGuide: {
        steps: string[];
        risks: string[];
        testingSuggestions: string[];
    };
    
    confidence: number;
    effort: 'low' | 'medium' | 'high';
}

// ============= Framework结果格式 =============

export interface FrameworkResult {
    success: boolean;
    sessionId: string;
    executionTime: number;
    
    // 阶段1结果：文件处理
    fileProcessing: {
        discoveredFiles: DiscoveredFile[];
        processingResults: FileProcessingResult[];
        validationResult: ValidationResult;
    };
    
    // 阶段2结果：性能分析  
    performanceAnalysis: PerformanceAnalysisResult;
    
    // 阶段3结果：优化建议
    optimizationSuggestions: OptimizationSuggestion[];
    
    // 元数据
    metadata: {
        tokenUsage: number;
        confidence: number;
        processingSteps: ExecutionStep[];
        agentPerformance: Map<string, AgentPerformanceStats>;
    };
    
    // 错误和警告
    errors?: AgentError[];
    warnings?: string[];
}

// 所有类型已在上面直接导出 
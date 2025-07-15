/**
 * AI Agent 核心类型定义
 * 统一的类型系统，避免重复定义
 */

// ========== 核心Agent接口 ==========

export interface AgentCore {
    id: string;
    name: string;
    description: string;
    capabilities: string[];
    
    // Agent 核心思维循环
    think(input: string, context: AgentContext): Promise<AgentThought>;
    plan(thought: AgentThought, context: AgentContext): Promise<AgentPlan>;
    execute(plan: AgentPlan, context: AgentContext): Promise<AgentResult>;
    reflect(result: AgentResult, context: AgentContext): Promise<AgentLearning>;
    
    // 工具使用能力
    useTool(toolName: string, params: any, context?: AgentContext): Promise<any>;
    getAvailableTools(): Tool[];
    
    // 记忆和学习
    remember(key: string, value: any, importance?: number): void;
    recall(key: string): any;
    learn(feedback: AgentFeedback): Promise<void>;
}

// ========== 上下文和状态 ==========

export interface AgentContext {
    userId: string;
    sessionId: string;
    conversationHistory: ConversationMessage[];
    workspaceState: WorkspaceState;
    userPreferences: UserPreferences;
    currentTask?: string;
    timestamp: Date;
    availableTools: string[];
    memorySnapshot: Record<string, any>;
}

export interface ConversationMessage {
    role: 'user' | 'agent' | 'system';
    content: string;
    timestamp: Date;
    metadata?: {
        intent?: string;
        confidence?: number;
        toolsUsed?: string[];
        executionTime?: number;
    };
}

export interface WorkspaceState {
    activeFiles: string[];
    recentAnalyses: AnalysisResult[];
    lastOptimization?: Date;
    currentJobFolder?: string;
    scopeFilesAvailable: boolean;
}

export interface UserPreferences {
    optimizationLevel: 'conservative' | 'moderate' | 'aggressive';
    autoApplyFixes: boolean;
    preferredAnalysisDepth: 'basic' | 'detailed' | 'comprehensive';
    language: 'zh' | 'en';
    reportFormat: 'markdown' | 'html' | 'json';
}

// ========== 思维循环相关 ==========

export interface AgentThought {
    id: string;
    intent: string;                    // 用户意图
    reasoning: string;                 // 推理过程
    confidence: number;                // 信心度 (0-1)
    problemType: ProblemType;         // 问题类型
    requiredTools: string[];          // 需要的工具
    expectedComplexity: ComplexityLevel;
    riskAssessment: RiskAssessment;   // 风险评估
    contextualFactors: string[];      // 上下文因素
    timestamp: Date;
}

export interface AgentPlan {
    id: string;
    steps: PlanStep[];                // 执行步骤
    toolChain: ToolCall[];           // 工具调用链
    fallbackStrategies: FallbackStrategy[];   // 备用策略
    successCriteria: string[];       // 成功标准
    estimatedTime: number;           // 预估耗时(毫秒)
    riskMitigation: string[];        // 风险缓解措施
    dependencies: string[];          // 依赖条件
    priority: 'low' | 'medium' | 'high';
    timestamp: Date;
}

export interface PlanStep {
    id: string;
    description: string;
    tool: string;
    input: any;
    expectedOutput: any;
    dependencies: string[];          // 依赖的其他步骤
    priority: number;               // 执行优先级
    isOptional: boolean;
    timeout?: number;               // 超时时间(毫秒)
    retryStrategy?: RetryStrategy;
}

export interface ToolCall {
    id: string;
    tool: string;
    input: any;
    timeout?: number;
    retryCount?: number;
    onSuccess?: string;             // 成功后的下一步
    onFailure?: string;             // 失败后的备用方案
    contextData?: any;              // 上下文数据
}

export interface AgentResult {
    id: string;
    success: boolean;
    data: any;
    explanation: string;
    suggestions: string[];
    metrics: PerformanceMetrics;
    nextSteps?: string[];
    confidence: number;             // 结果可信度
    executionTime: number;          // 实际执行时间
    errors?: ExecutionError[];
    warnings?: string[];
    toolsUsed: string[];           // 实际使用的工具
    timestamp: Date;
}

export interface AgentLearning {
    whatWorked: LearningItem[];
    whatFailed: LearningItem[];
    improvements: string[];
    knowledgeGained: string[];
    strategyAdjustments: StrategyAdjustment[];
    confidenceImpact: number;       // 对未来信心度的影响
    timestamp: Date;
}

// ========== 工具系统 ==========

export interface Tool {
    name: string;
    description: string;
    parameters: ToolParameter[];
    category: ToolCategory;
    version: string;
    execute(input: any, context?: AgentContext): Promise<ToolResult>;
    validate(input: any): ValidationResult;
    getSchema(): ToolSchema;
}

export interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required: boolean;
    description?: string;
    defaultValue?: any;
    validation?: ParameterValidation;
}

export interface ToolResult {
    success: boolean;
    data: any;
    message: string;
    executionTime: number;
    resourceUsage?: ResourceUsage;
    warnings?: string[];
    metadata?: any;
}

export interface ToolSchema {
    input: any;     // JSON Schema for input
    output: any;    // JSON Schema for output
}

// ========== 记忆系统 ==========

export interface MemoryItem {
    key: string;
    value: any;
    timestamp: Date;
    accessCount: number;
    importance: number;             // 重要性分数 (0-1)
    category: MemoryCategory;
    expiryDate?: Date;
    tags: string[];
    relatedItems: string[];         // 相关记忆项的key
}

export interface MemoryQuery {
    key?: string;
    category?: MemoryCategory;
    tags?: string[];
    timeRange?: {
        start: Date;
        end: Date;
    };
    importanceThreshold?: number;
    limit?: number;
}

// ========== 反馈和学习 ==========

export interface AgentFeedback {
    id: string;
    userId: string;
    sessionId: string;
    rating: number;                 // 1-5 星评分
    comment: string;
    suggestionHelpful: boolean;
    improvements: string[];
    wouldRecommend: boolean;
    categories: FeedbackCategory[];
    specificIssues: string[];
    timestamp: Date;
}

export interface LearningItem {
    description: string;
    confidence: number;
    context: string;
    applicability: string[];        // 适用场景
}

export interface StrategyAdjustment {
    strategy: string;
    adjustment: string;
    reason: string;
    expectedImpact: number;         // 预期影响 (-1 to 1)
}

// ========== 性能和监控 ==========

export interface PerformanceMetrics {
    executionTime: number;          // 毫秒
    successRate: number;            // 0-1
    resourceUsage: ResourceUsage;
    toolsUsed: number;
    errorsEncountered: number;
    memoryFootprint: number;        // MB
    apiCalls: number;
    cacheHitRate?: number;         // 缓存命中率
}

export interface ResourceUsage {
    memory: number;                 // MB
    cpu: number;                   // 百分比
    network: number;               // KB
    storage: number;               // KB
}

// ========== 枚举类型 ==========

export type ProblemType = 
    | 'performance_analysis'
    | 'code_optimization' 
    | 'bottleneck_identification'
    | 'general_inquiry'
    | 'error_diagnosis'
    | 'best_practices'
    | 'capacity_planning';

export type ComplexityLevel = 'low' | 'medium' | 'high' | 'enterprise';

export type ToolCategory = 
    | 'analysis'
    | 'optimization'
    | 'file_operations'
    | 'reporting'
    | 'monitoring'
    | 'communication'
    | 'validation';

export type MemoryCategory = 
    | 'conversation'
    | 'user_preferences'
    | 'analysis_results'
    | 'optimization_history'
    | 'learned_patterns'
    | 'error_patterns'
    | 'performance_baselines';

export type FeedbackCategory = 
    | 'accuracy'
    | 'helpfulness'
    | 'speed'
    | 'user_experience'
    | 'suggestions_quality'
    | 'problem_understanding';

// ========== 辅助类型 ==========

export interface RiskAssessment {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    mitigationStrategies: string[];
    confidenceImpact: number;       // 对信心度的影响
}

export interface FallbackStrategy {
    condition: string;              // 触发条件
    action: string;                // 备用行动
    tools: string[];               // 备用工具
    successProbability: number;    // 成功概率
}

export interface RetryStrategy {
    maxAttempts: number;
    backoffMs: number;
    escalation?: string;           // 重试失败后的升级策略
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface ParameterValidation {
    min?: number;
    max?: number;
    pattern?: string;              // 正则表达式
    enum?: any[];                 // 枚举值
    custom?: (value: any) => boolean;
}

export interface ExecutionError {
    code: string;
    message: string;
    details?: any;
    recoverable: boolean;
    suggestedAction?: string;
}

export interface AnalysisResult {
    id: string;
    type: string;
    timestamp: Date;
    summary: string;
    details: any;
    recommendations: string[];
    confidence: number;
}

// ========== 扩展类型 ==========

export interface ScopeAnalysisContext {
    jobFolder: string;
    scriptsAvailable: string[];
    lastAnalysisTime?: Date;
    performanceBaseline?: any;
    userOptimizationHistory: OptimizationRecord[];
}

export interface OptimizationRecord {
    id: string;
    timestamp: Date;
    optimizationType: string;
    appliedSuggestions: string[];
    performanceImpact: number;      // 性能改进百分比
    userSatisfaction: number;       // 用户满意度
}

// ========== 导出便利类型 ==========

export type AgentState = 'idle' | 'thinking' | 'planning' | 'executing' | 'reflecting' | 'error';

export interface AgentStatus {
    state: AgentState;
    currentTask?: string;
    progress?: number;              // 0-1
    eta?: number;                  // 预计剩余时间(毫秒)
    lastActivity: Date;
} 
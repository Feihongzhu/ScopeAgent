import * as vscode from 'vscode';
import * as os from 'os';
import { Logger } from '../functions/logger';
import { v4 as uuidv4 } from 'uuid';
import { LanguageModelService } from '../services/LanguageModelService';
import { SecurityManager, SecurityCheckResult } from './SecurityManager';
import {
    AgentCore,
    AgentContext,
    AgentThought,
    AgentPlan,
    AgentResult,
    AgentLearning,
    AgentFeedback,
    PlanStep,
    ToolCall,
    PerformanceMetrics,
    MemoryItem,
    MemoryCategory,
    ComplexityLevel,
    RiskAssessment,
    AgentStatus,
    AgentState,
    ConversationMessage,
    WorkspaceState,
    UserPreferences,
    ProblemType,
    FallbackStrategy,
    ExecutionError,
    EvidenceData
} from '../types/AgentTypes';
import { AnalysisTool, ToolInput, ToolOutput } from '../framework/types/FrameworkTypes';

/**
 * 智能SCOPE性能优化AI Agent
 * 具备完整的思维链(Think-Plan-Execute-Reflect)和自主工具调用能力
 */
export class ScopeOptimizationAgent implements AgentCore {
    // Agent基本信息
    id = "scope-optimizer-agent-v2";
    name = "智能SCOPE性能优化Agent";
    description = "具备自主思维和工具调用能力的SCOPE脚本性能优化AI Agent";
    capabilities = [
        "智能意图理解和问题分析",
        "自主制定执行计划和工具选择", 
        "动态工具调用和结果综合",
        "性能瓶颈智能识别和诊断",
        "个性化代码优化建议生成",
        "持续学习和策略优化",
        "风险评估和缓解策略制定",
        "多轮对话和上下文理解"
    ];

    // 核心服务和状态
    private tools: Map<string, AnalysisTool> = new Map();
    private memory: Map<string, MemoryItem> = new Map();
    private languageModel: LanguageModelService;
    private logger: Logger;
    private currentStatus: AgentStatus;
    private baselineLearning: Map<string, any> = new Map();
    private securityManager: SecurityManager;

    // 性能统计
    private performanceStats = {
        totalRequests: 0,
        successfulRequests: 0,
        averageResponseTime: 0,
        totalTools: 0,
        learningEvents: 0
    };

    constructor(logger: Logger) {
        this.logger = logger;
        this.languageModel = new LanguageModelService(logger);
        this.securityManager = new SecurityManager(logger, {
            maxFileSize: 50 * 1024 * 1024,
            allowedExtensions: ['.xml', '.txt', '.log', '.json', '.csv'],
            maxProcessingTime: 15000,
            enableVirusCheck: true,
            maxConcurrentChecks: 5
        });
        this.currentStatus = { state: 'idle', lastActivity: new Date() };
        this.initializeBaseLearning();
        this.logger.info(`SCOPE AI Agent initialized`);
    }

    /**
     * 初始化Agent - 设置语言模型和基础配置
     */
    async initialize(): Promise<boolean> {
        try {
            const modelInitialized = await this.languageModel.initialize();
            if (!modelInitialized) {
                this.logger.error('Language model initialization failed');
                return false;
            }
            return true;
        } catch (error) {
            this.logger.error(`Agent initialization failed: ${error}`);
            return false;
        }
    }

    /**
     * 思考阶段：智能分析用户输入，理解意图和上下文
     */
    async think(input: string, context: AgentContext): Promise<AgentThought> {
        const startTime = Date.now();
        this.updateStatus('thinking', '分析用户意图和问题类型');
        
        try {
            this.logger.info(`Thinking about: "${input}"`);
            
            // 收集运行证据
            const evidenceData = await this.collectEvidence(context);
            
            // 增强分析上下文
            const enhancedContext = this.enhanceContextWithEvidence(context, evidenceData);
            
            // 使用语言模型进行智能意图分析
            const intentAnalysis = await this.languageModel.analyzeIntent(input, enhancedContext);
            
            // 评估复杂度
            const complexity = this.languageModel.assessComplexity(input, enhancedContext);
            
            // 确定所需工具
            const availableTools = Array.from(this.tools.keys());
            const requiredTools = this.languageModel.selectRequiredTools(
                intentAnalysis.intent, 
                intentAnalysis.problemType, 
                availableTools
            );
            
            // 进行风险评估
            const riskAssessment = this.assessRisks(input, enhancedContext, intentAnalysis.problemType);
            
            // 分析上下文因素
            const contextualFactors = this.analyzeContextualFactors(input, enhancedContext);

            const thought: AgentThought = {
                id: `thought_${uuidv4()}`,
                intent: intentAnalysis.intent,
                reasoning: this.enhanceReasoningWithContext(intentAnalysis.reasoning, enhancedContext),
                confidence: this.adjustConfidenceBasedOnExperience(intentAnalysis.confidence),
                problemType: intentAnalysis.problemType,
                requiredTools: requiredTools,
                expectedComplexity: complexity,
                riskAssessment: riskAssessment,
                contextualFactors: contextualFactors,
                evidenceData: evidenceData,  // 阶段1新增：添加证据数据
                timestamp: new Date()
            };

            // 记住这次思考
            this.remember('last_thought', thought, 0.8);
            this.remember(`thought_${thought.id}`, thought, 0.6);

            const thinkingTime = Date.now() - startTime;
            this.logger.info(`Thinking completed in ${thinkingTime}ms - Intent: ${thought.intent}`);
            
            return thought;

        } catch (error) {
            this.logger.error(`Thinking phase failed: ${error}`);
            this.updateStatus('error', `思考阶段失败: ${error}`);
            
            // 返回备用思考结果
            return this.createFallbackThought(input, context);
        } finally {
            this.updateStatus('idle');
        }
    }

    /**
     * 规划阶段：基于思考结果制定智能执行计划
     */
    async plan(thought: AgentThought, context: AgentContext): Promise<AgentPlan> {
        const startTime = Date.now();
        this.updateStatus('planning', '制定执行计划和工具调用策略');
        
        try {
            this.logger.info(`Planning for intent: ${thought.intent}`);
            
            const availableTools = Array.from(this.tools.keys());
            
            // 使用语言模型生成智能计划
            const planGeneration = await this.languageModel.generatePlan(thought, availableTools, context);
            
            // 将计划转换为内部格式
            const steps: PlanStep[] = planGeneration.steps.map((step, index) => ({
                id: step.id || `step_${index + 1}`,
                description: step.description,
                tool: step.tool,
                input: step.input,
                expectedOutput: this.predictStepOutput(step.tool, step.input),
                dependencies: index > 0 ? [`step_${index}`] : [],
                priority: index + 1,
                isOptional: false,
                timeout: this.calculateStepTimeout(step.tool, thought.expectedComplexity),
                retryStrategy: {
                    maxAttempts: 3,
                    backoffMs: 1000,
                    escalation: 'use_fallback_tool'
                }
            }));

            // 构建工具调用链
            const toolChain: ToolCall[] = steps.map(step => ({
                id: `call_${step.id}`,
                tool: step.tool,
                input: step.input,
                timeout: step.timeout,
                retryCount: 0,
                onSuccess: this.getNextStepId(step.id, steps),
                onFailure: this.getFallbackStrategy(step.tool),
                contextData: { stepId: step.id, description: step.description }
            }));

            // 生成备用策略
            const fallbackStrategies = this.generateIntelligentFallbackStrategies(thought, availableTools);
            
            const plan: AgentPlan = {
                id: `plan_${uuidv4()}`,
                steps: steps,
                toolChain: toolChain,
                fallbackStrategies: fallbackStrategies,
                successCriteria: this.defineIntelligentSuccessCriteria(thought),
                estimatedTime: planGeneration.estimatedTime,
                riskMitigation: this.generateRiskMitigation(thought, planGeneration.riskFactors),
                dependencies: this.analyzePlanDependencies(steps),
                priority: this.calculatePlanPriority(thought),
                timestamp: new Date()
            };

            // 记住这个计划
            this.remember('current_plan', plan, 0.9);
            this.remember(`plan_${plan.id}`, plan, 0.7);

            const planningTime = Date.now() - startTime;
            this.logger.info(`Planning completed in ${planningTime}ms - ${steps.length} steps`);
            
            return plan;

        } catch (error) {
            this.logger.error(`Planning phase failed: ${error}`);
            this.updateStatus('error', `规划阶段失败: ${error}`);
            
            // 返回备用计划
            return this.createFallbackPlan(thought, context);
        } finally {
            this.updateStatus('idle');
        }
    }

    /**
     * 执行阶段：智能调用工具链完成任务
     */
    async execute(plan: AgentPlan, context: AgentContext): Promise<AgentResult> {
        const startTime = Date.now();
        this.updateStatus('executing', `执行${plan.steps.length}个步骤的计划`);
        
        try {
            this.logger.info(`Executing plan: ${plan.id} with ${plan.steps.length} steps`);
            
            const executionResults: any[] = [];
            const executionErrors: ExecutionError[] = [];
            const toolsUsed: string[] = [];
            let currentStep = 0;
            
            // 智能执行每个步骤
            for (const step of plan.steps) {
                currentStep++;
                this.updateStatus('executing', `执行步骤 ${currentStep}/${plan.steps.length}: ${step.description}`);
                
                try {
                    // 检查依赖
                    if (!this.checkStepDependencies(step, executionResults)) {
                        throw new Error(`Step dependencies not met: ${step.dependencies.join(', ')}`);
                    }

                    // 动态调整步骤输入（基于前面步骤的结果）
                    const adjustedInput = this.adjustStepInput(step, executionResults);
                    
                    // 执行工具
                    const tool = this.tools.get(step.tool);
                    if (!tool) {
                        throw new Error(`Tool not found: ${step.tool}`);
                    }

                    this.logger.info(`Executing tool: ${step.tool}`);
                    const toolResult = await this.executeToolWithTimeout(tool, adjustedInput, step.timeout || 30000, context);
                    
                    if (toolResult.success) {
                        executionResults.push({
                            stepId: step.id,
                            tool: step.tool,
                            result: toolResult,
                            success: true,
                            executionTime: toolResult.metadata?.executionTime || 0
                        });
                        
                        if (!toolsUsed.includes(step.tool)) {
                            toolsUsed.push(step.tool);
                        }
                        
                        this.logger.info(`Step ${step.id} completed successfully`);
                    } else {
                        throw new Error(`Tool execution failed: ${toolResult.errors?.join(', ') || 'Unknown error'}`);
                    }

                } catch (stepError) {
                    this.logger.warn(`Step ${step.id} failed: ${stepError}`);
                    
                    const error: ExecutionError = {
                        code: 'STEP_EXECUTION_FAILED',
                        message: stepError instanceof Error ? stepError.message : String(stepError),
                        details: { stepId: step.id, tool: step.tool },
                        recoverable: !step.isOptional,
                        suggestedAction: this.suggestRecoveryAction(step, stepError)
                    };
                    
                    executionErrors.push(error);
                    
                    // 对于可选步骤，继续执行；对于必需步骤，尝试恢复策略
                    if (step.isOptional) {
                        executionResults.push({
                            stepId: step.id,
                            tool: step.tool,
                            result: null,
                            success: false,
                            error: error.message
                        });
                        continue;
                    } else {
                        // 尝试备用策略
                        const recoveryResult = await this.attemptStepRecovery(step, stepError, context);
                        if (recoveryResult) {
                            executionResults.push(recoveryResult);
                            if (!toolsUsed.includes(step.tool)) {
                                toolsUsed.push(step.tool);
                            }
                        } else {
                            // 无法恢复，提前结束执行
                            break;
                        }
                    }
                }
            }

            // 综合执行结果
            const synthesizedData = this.synthesizeExecutionResults(executionResults);
            const explanation = this.generateIntelligentExplanation(synthesizedData, plan);
            const suggestions = await this.generateIntelligentSuggestions(synthesizedData, context);
            const nextSteps = this.suggestIntelligentNextSteps(synthesizedData, plan);
            
            const executionTime = Date.now() - startTime;
            const confidence = this.calculateResultConfidence(executionResults, executionErrors);
            const success = executionErrors.filter(e => e.recoverable === false).length === 0;

            // 计算性能指标
            const metrics: PerformanceMetrics = {
                executionTime,
                successRate: executionResults.filter(r => r.success).length / executionResults.length,
                resourceUsage: {
                    memory: process.memoryUsage().heapUsed / 1024 / 1024,
                    cpu: 0, // 这里可以添加CPU监控
                    network: 0,
                    storage: 0
                },
                toolsUsed: toolsUsed.length,
                errorsEncountered: executionErrors.length,
                memoryFootprint: process.memoryUsage().heapUsed / 1024 / 1024,
                apiCalls: executionResults.length
            };

            const result: AgentResult = {
                id: `result_${uuidv4()}`,
                success,
                data: synthesizedData,
                explanation,
                suggestions,
                metrics,
                nextSteps,
                confidence,
                executionTime,
                errors: executionErrors.length > 0 ? executionErrors : undefined,
                warnings: this.generateWarnings(executionResults, plan),
                toolsUsed,
                timestamp: new Date()
            };

            // 记住执行结果
            this.remember('last_result', result, 0.9);
            this.remember(`result_${result.id}`, result, 0.6);

            // 更新性能统计
            this.updatePerformanceStats(result);

            this.logger.info(`Execution completed in ${executionTime}ms - Success: ${success}`);
            
            return result;

        } catch (error) {
            this.logger.error(`Execution phase failed: ${error}`);
            this.updateStatus('error', `执行阶段失败: ${error}`);
            
            return this.createFailureResult(error, Date.now() - startTime);
        } finally {
            this.updateStatus('idle');
        }
    }

    /**
     * 反思阶段：分析执行结果，学习和改进
     */
    async reflect(result: AgentResult, context: AgentContext): Promise<AgentLearning> {
        const startTime = Date.now();
        this.updateStatus('reflecting', '分析执行结果并学习改进');
        
        try {
            this.logger.info(`Reflecting on result: ${result.id}`);
            
            const lastThought = this.recall('last_thought') as AgentThought;
            const expectedOutcome = lastThought ? `实现用户意图: ${lastThought.intent}` : '完成任务';
            
            // 使用语言模型进行智能反思
            const reflection = await this.languageModel.reflectOnResult(result, expectedOutcome, context);
            
            // 增强反思结果
            const enhancedReflection = this.enhanceReflectionWithExperience(reflection, result, context);
            
            // 从成功因素中学习
            const successPatterns = this.identifySuccessPatterns(result, enhancedReflection.whatWorked);
            
            // 从失败中学习
            const failurePatterns = this.identifyFailurePatterns(result, enhancedReflection.whatFailed);
            
            const learning: AgentLearning = {
                whatWorked: enhancedReflection.whatWorked.map((item: string) => ({
                    description: item,
                    confidence: this.calculateLearningConfidence(item, result),
                    context: this.extractLearningContext(item, context),
                    applicability: this.determineLearningApplicability(item)
                })),
                whatFailed: enhancedReflection.whatFailed.map((item: string) => ({
                    description: item,
                    confidence: this.calculateLearningConfidence(item, result),
                    context: this.extractLearningContext(item, context),
                    applicability: this.determineLearningApplicability(item)
                })),
                improvements: enhancedReflection.improvements,
                knowledgeGained: enhancedReflection.knowledgeGained,
                strategyAdjustments: this.generateStrategyAdjustments(enhancedReflection, result),
                confidenceImpact: enhancedReflection.confidenceAdjustment,
                timestamp: new Date()
            };

            // 应用学习结果
            await this.applyLearning(learning);
            
            // 记住学习结果
            this.remember('last_learning', learning, 0.8);
            this.remember(`learning_${Date.now()}`, learning, 0.5);

            const reflectionTime = Date.now() - startTime;
            this.logger.info(`Reflection completed in ${reflectionTime}ms - ${learning.improvements.length} improvements identified`);
            
            this.performanceStats.learningEvents++;
            
            return learning;

        } catch (error) {
            this.logger.error(`Reflection phase failed: ${error}`);
            this.updateStatus('error', `反思阶段失败: ${error}`);
            
            return this.createFallbackLearning(result);
        } finally {
            this.updateStatus('idle');
        }
    }

    /**
     * 工具调用：智能调用指定工具
     */
    async useTool(toolName: string, params: any, context?: AgentContext): Promise<any> {
        try {
            const tool = this.tools.get(toolName);
            if (!tool) {
                throw new Error(`Tool '${toolName}' not found. Available tools: ${Array.from(this.tools.keys()).join(', ')}`);
            }

            this.logger.info(`Using tool: ${toolName}`);
            
            // 构造工具输入
            const toolInput: ToolInput = {
                filePath: params.filePath || '',
                fileType: params.fileType || '',
                analysisGoal: params.analysisGoal || 'general_analysis',
                context: undefined
            };

            // 执行工具
            const result = await tool.execute(toolInput);
            
            this.logger.info(`Tool ${toolName} executed successfully`);
            return result;

        } catch (error) {
            this.logger.error(`Tool execution failed: ${error}`);
            throw error;
        }
    }

    /**
     * 获取可用工具列表
     */
    getAvailableTools(): any[] {
        return Array.from(this.tools.values());
    }

    /**
     * 记忆管理：存储重要信息
     */
    remember(key: string, value: any, importance: number = 0.5): void {
        const existingItem = this.memory.get(key);
        
        const memoryItem: MemoryItem = {
            key,
            value,
            timestamp: new Date(),
            accessCount: existingItem ? existingItem.accessCount : 0,
            importance: Math.max(0, Math.min(1, importance)),
            category: this.categorizeMemory(key, value),
            tags: this.generateMemoryTags(key, value),
            relatedItems: this.findRelatedMemories(key, value)
        };

        this.memory.set(key, memoryItem);
        
        // 定期清理内存
        if (this.memory.size > 1000) {
            this.cleanupMemory();
        }
    }

    /**
     * 记忆检索：获取存储的信息
     */
    recall(key: string): any {
        const item = this.memory.get(key);
        if (item) {
            item.accessCount++;
            item.timestamp = new Date(); // 更新访问时间
            return item.value;
        }
        return null;
    }

    /**
     * 学习机制：从反馈中学习
     */
    async learn(feedback: AgentFeedback): Promise<void> {
        try {
            this.logger.info(`Learning from feedback: ${feedback.rating}/5 stars`);
            
            // 分析反馈模式
            const feedbackPatterns = this.analyzeFeedbackPatterns(feedback);
            
            // 调整策略
            const strategyAdjustments = this.generateStrategyAdjustmentsFromFeedback(feedback);
            
            // 更新知识库
            await this.updateKnowledgeBase(feedback, feedbackPatterns, strategyAdjustments);
            
            // 记住反馈
            this.remember(`feedback_${feedback.id}`, feedback, 0.7);
            
            this.logger.info(`Learning completed from feedback ${feedback.id}`);

        } catch (error) {
            this.logger.error(`Learning from feedback failed: ${error}`);
        }
    }

    /**
     * 注册工具
     */
    registerTool(tool: AnalysisTool): void {
        this.tools.set(tool.name, tool);
        this.logger.info(`Registered tool: ${tool.name} (${tool.category})`);
    }

    /**
     * 获取Agent状态
     */
    getStatus(): AgentStatus {
        return { ...this.currentStatus };
    }

    /**
     * 获取性能统计
     */
    getPerformanceStats() {
        return { ...this.performanceStats };
    }

    // ========== 私有方法 ==========

    private updateStatus(state: AgentState, currentTask?: string, progress?: number, eta?: number): void {
        this.currentStatus = {
            state,
            currentTask,
            progress,
            eta,
            lastActivity: new Date()
        };
    }

    private initializeBaseLearning(): void {
        this.baselineLearning.set('scope_optimization_patterns', [
            'JOIN操作是常见的性能瓶颈点',
            '数据倾斜会导致资源使用不均',
            '合理的分区策略能显著提升性能',
            '内存密集型操作需要特别关注'
        ]);
        
        this.baselineLearning.set('tool_usage_patterns', {
            'scope_file_reader': '通常是分析的第一步',
            'scope_performance_analyzer': '用于识别性能问题',
            'scope_code_optimizer': '生成优化建议',
            'report_generator': '总结分析结果'
        });
    }

    private enhanceReasoningWithContext(reasoning: string, context: AgentContext): string {
        const contextEnhancements = [];
        
        if (context.conversationHistory.length > 1) {
            contextEnhancements.push('基于对话历史，用户有持续的性能关注');
        }
        
        if (context.workspaceState.recentAnalyses.length > 0) {
            contextEnhancements.push('工作空间中有历史分析结果可以参考');
        }
        
        if (context.userPreferences.optimizationLevel === 'aggressive') {
            contextEnhancements.push('用户偏好激进的优化策略');
        }
        
        return `${reasoning}\n上下文增强：${contextEnhancements.join('；')}`;
    }

    private adjustConfidenceBasedOnExperience(baseConfidence: number): number {
        const successRate = this.performanceStats.totalRequests > 0 
            ? this.performanceStats.successfulRequests / this.performanceStats.totalRequests 
            : 0.7;
        
        return Math.min(0.95, Math.max(0.1, baseConfidence * (0.5 + successRate * 0.5)));
    }

    private assessRisks(input: string, context: AgentContext, problemType: ProblemType): RiskAssessment {
        const riskFactors = [];
        let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
        
        if (problemType === 'code_optimization' && context.userPreferences.autoApplyFixes) {
            riskFactors.push('自动应用优化可能影响现有代码');
            riskLevel = 'medium';
        }
        
        if (input.toLowerCase().includes('生产') || input.toLowerCase().includes('production')) {
            riskFactors.push('涉及生产环境需要特别谨慎');
            riskLevel = 'high';
        }
        
        if (context.workspaceState.activeFiles.length === 0) {
            riskFactors.push('没有可分析的文件');
            riskLevel = 'medium';
        }
        
        return {
            level: riskLevel,
            factors: riskFactors,
            mitigationStrategies: this.generateMitigationStrategies(riskFactors),
            confidenceImpact: riskLevel === 'high' ? -0.2 : riskLevel === 'medium' ? -0.1 : 0
        };
    }

    private analyzeContextualFactors(input: string, context: AgentContext): string[] {
        const factors = [];
        
        const hour = new Date().getHours();
        if (hour < 9 || hour > 17) {
            factors.push('非工作时间，用户可能有紧急需求');
        }
        
        if (context.conversationHistory.length > 5) {
            factors.push('用户在此会话中高度活跃');
        }
        
        if (context.workspaceState.lastOptimization) {
            const daysSinceLastOptimization = (Date.now() - context.workspaceState.lastOptimization.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceLastOptimization < 1) {
                factors.push('最近已进行过优化分析');
            }
        }
        
        return factors;
    }

    private createFallbackThought(input: string, context: AgentContext): AgentThought {
        return {
            id: `fallback_thought_${uuidv4()}`,
            intent: '分析SCOPE脚本性能',
            reasoning: '使用备用意图分析，因为智能分析不可用',
            confidence: 0.4,
            problemType: 'performance_analysis',
            requiredTools: ['scope_file_reader'],
            expectedComplexity: 'medium',
            riskAssessment: {
                level: 'low',
                factors: ['备用分析模式'],
                mitigationStrategies: ['使用基础分析流程'],
                confidenceImpact: -0.1
            },
            contextualFactors: ['使用备用分析模式'],
            evidenceData: {
                hasData: false,
                collectionTime: 0,
                availableFiles: [],
                keyMetrics: {},
                folderType: 'unknown'
            },
            timestamp: new Date()
        };
    }

    private createFallbackPlan(thought: AgentThought, context: AgentContext): AgentPlan {
        const steps: PlanStep[] = [{
            id: 'fallback_step_1',
            description: '读取SCOPE文件',
            tool: 'scope_file_reader',
            input: { jobFolder: 'auto_detect' },
            expectedOutput: '文件内容',
            dependencies: [],
            priority: 1,
            isOptional: false,
            timeout: 30000
        }];

        return {
            id: `fallback_plan_${uuidv4()}`,
            steps,
            toolChain: [{
                id: 'fallback_call_1',
                tool: 'scope_file_reader',
                input: { jobFolder: 'auto_detect' },
                timeout: 30000,
                retryCount: 0
            }],
            fallbackStrategies: [],
            successCriteria: ['成功读取文件'],
            estimatedTime: 5000,
            riskMitigation: [],
            dependencies: [],
            priority: 'medium',
            timestamp: new Date()
        };
    }

    private async executeToolWithTimeout(tool: AnalysisTool, input: ToolInput, timeout: number, context?: AgentContext): Promise<ToolOutput> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Tool execution timeout after ${timeout}ms`));
            }, timeout);

            tool.execute(input)
                .then((result: ToolOutput) => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch((error: any) => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    private synthesizeExecutionResults(results: any[]): any {
        const successfulResults = results.filter(r => r.success);
        const data: any = {
            summary: `执行了${results.length}个步骤，${successfulResults.length}个成功`,
            results: successfulResults.map(r => r.result),
            executionTime: results.reduce((sum, r) => sum + (r.executionTime || 0), 0)
        };

        // 提取文件读取结果
        const fileReaderResults = successfulResults.filter(r => r.tool === 'scope_file_reader');
        if (fileReaderResults.length > 0) {
            data.fileData = fileReaderResults[0].result.data;
        }

        // 提取性能分析结果
        const performanceResults = successfulResults.filter(r => r.tool === 'scope_performance_analyzer');
        if (performanceResults.length > 0) {
            data.performanceAnalysis = performanceResults[0].result.data;
        }

        // 提取代码优化结果
        const optimizerResults = successfulResults.filter(r => r.tool === 'scope_code_optimizer');
        if (optimizerResults.length > 0) {
            const optimizerData = optimizerResults[0].result.data;
            data.optimizations = optimizerData.optimizations || [];
            data.criticalIssues = optimizerData.criticalIssues || [];
            data.quickWins = optimizerData.quickWins || [];
            data.estimatedImprovement = optimizerData.estimatedImprovement;
            data.scriptAnalysis = optimizerData.scriptAnalysis;
            data.performanceBottlenecks = optimizerData.performanceBottlenecks;
        }

        // 提取顶点分析结果
        const vertexResults = successfulResults.filter(r => r.tool === 'scope_vertex_analyzer');
        if (vertexResults.length > 0) {
            data.vertexAnalysis = vertexResults[0].result.data;
        }

        return data;
    }

    private generateIntelligentExplanation(data: any, plan: AgentPlan): string {
        let explanation = `执行了${plan.steps.length}个步骤的分析计划。`;
        
        if (data.fileData) {
            explanation += ` 成功读取了SCOPE相关文件。`;
        }
        
        if (data.performanceAnalysis) {
            explanation += ` 完成了性能分析并识别了潜在的优化点。`;
        }
        
        return explanation;
    }

    private async generateIntelligentSuggestions(data: any, context: AgentContext): Promise<string[]> {
        const suggestions = [];
        
        // 检查优化数据
        if (data.optimizations && Array.isArray(data.optimizations) && data.optimizations.length > 0) {
            const criticalIssues = data.criticalIssues || [];
            const quickWins = data.quickWins || [];
            
            // 关键性能问题
            if (criticalIssues.length > 0) {
                suggestions.push(`🚨 **发现${criticalIssues.length}个关键性能问题需要优先处理:**`);
                criticalIssues.slice(0, 3).forEach((issue: any) => {
                    const issueText = issue.title || issue.description || '未知问题';
                    suggestions.push(`   • ${issueText}`);
                });
            }
            
            // 快速收益项
            if (quickWins.length > 0) {
                suggestions.push(`⚡ **${quickWins.length}个快速收益优化 (低实施难度，高回报):**`);
                quickWins.slice(0, 3).forEach((win: any) => {
                    const winTitle = win.title || win.description || '优化建议';
                    const improvement = win.estimatedImprovement || '提升明显';
                    suggestions.push(`   • ${winTitle}: 预期改进${improvement}`);
                });
            }
            
            // 按类别整理建议
            const categories = [...new Set(data.optimizations.map((opt: any) => opt.category).filter(Boolean))];
            categories.forEach(category => {
                const categoryOpts = data.optimizations.filter((opt: any) => opt.category === category);
                if (categoryOpts.length > 0) {
                    suggestions.push(`📋 **${category} (${categoryOpts.length}个建议):**`);
                    categoryOpts.slice(0, 2).forEach((opt: any) => {
                        const optTitle = opt.title || opt.description || '优化建议';
                        suggestions.push(`   • ${optTitle}`);
                        if (opt.compilerHint) {
                            suggestions.push(`     编译器提示: ${opt.compilerHint}`);
                        }
                    });
                }
            });
            
            // 总体改进估算
            if (data.estimatedImprovement) {
                suggestions.push(`📊 **综合预期性能改进: ${data.estimatedImprovement}**`);
            }
            
        } else {
            // 尝试使用语言模型生成建议
            try {
                if (data.performanceAnalysis || data.fileData) {
                    const aiSuggestions = await this.languageModel.generateOptimizationSuggestions(data, context);
                    
                    // parseOptimizationResponse 已经确保返回字符串数组
                    if (Array.isArray(aiSuggestions) && aiSuggestions.length > 0) {
                        suggestions.push(...aiSuggestions);
                        this.logger.info(`Added ${aiSuggestions.length} AI-generated suggestions`);
                    }
                }
            } catch (error) {
                this.logger.warn(`Failed to generate AI suggestions: ${error}`);
            }
            
                    // 备用建议
        if (suggestions.length === 0) {
            suggestions.push('🔍 **基于SCOPE最佳实践的通用优化建议:**');
            suggestions.push('   • 使用BROADCAST JOIN优化小表与大表的连接');
            suggestions.push('   • 添加SKEW hint处理数据倾斜问题');
            suggestions.push('   • 优化GROUP BY操作的分区策略');
            suggestions.push('   • 使用谓词下推减少数据传输量');
            suggestions.push('   • 为重要操作添加SCOPE编译器提示');
        }
        }
        
        return suggestions;
    }

    /**
     * 将建议对象格式化为可读的字符串
     */
    private formatSuggestionObject(suggestion: any): string {
        const parts = [];
        
        if (suggestion.title) {
            parts.push(`🔧 **${suggestion.title}**`);
        }
        
        if (suggestion.description) {
            parts.push(`   ${suggestion.description}`);
        }
        
        if (suggestion.originalCode) {
            parts.push(`   **原始代码:**`);
            parts.push(`   \`\`\`scope`);
            parts.push(`   ${suggestion.originalCode.replace(/\n/g, '\n   ')}`);
            parts.push(`   \`\`\``);
        }
        
        if (suggestion.optimizedCode) {
            parts.push(`   **优化后代码:**`);
            parts.push(`   \`\`\`scope`);
            parts.push(`   ${suggestion.optimizedCode.replace(/\n/g, '\n   ')}`);
            parts.push(`   \`\`\``);
        }
        
        if (suggestion.improvement) {
            parts.push(`   **预期改进:** ${suggestion.improvement}`);
        }
        
        if (suggestion.compilerHint) {
            parts.push(`   **编译器提示:** ${suggestion.compilerHint}`);
        }
        
        if (suggestion.estimatedImprovement) {
            parts.push(`   **性能提升:** ${suggestion.estimatedImprovement}`);
        }
        
        return parts.join('\n');
    }

    private calculateResultConfidence(results: any[], errors: ExecutionError[]): number {
        if (results.length === 0) return 0;
        
        const successRate = results.filter(r => r.success).length / results.length;
        const errorPenalty = errors.filter(e => !e.recoverable).length * 0.2;
        
        return Math.max(0.1, Math.min(0.95, successRate - errorPenalty));
    }

    private updatePerformanceStats(result: AgentResult): void {
        this.performanceStats.totalRequests++;
        if (result.success) {
            this.performanceStats.successfulRequests++;
        }
        
        this.performanceStats.averageResponseTime = 
            (this.performanceStats.averageResponseTime * (this.performanceStats.totalRequests - 1) + result.executionTime) 
            / this.performanceStats.totalRequests;
        
        this.performanceStats.totalTools += result.toolsUsed.length;
    }

    private createFailureResult(error: any, executionTime: number): AgentResult {
        return {
            id: `failure_result_${uuidv4()}`,
            success: false,
            data: { error: error instanceof Error ? error.message : String(error) },
            explanation: '执行过程中遇到无法恢复的错误',
            suggestions: ['检查输入参数是否正确', '确认所需文件是否存在', '尝试简化分析要求'],
            metrics: {
                executionTime,
                successRate: 0,
                resourceUsage: { memory: 0, cpu: 0, network: 0, storage: 0 },
                toolsUsed: 0,
                errorsEncountered: 1,
                memoryFootprint: 0,
                apiCalls: 0
            },
            confidence: 0.1,
            executionTime,
            errors: [{
                code: 'EXECUTION_FAILED',
                message: error instanceof Error ? error.message : String(error),
                recoverable: false,
                suggestedAction: '联系技术支持'
            }],
            toolsUsed: [],
            timestamp: new Date()
        };
    }

    private createFallbackLearning(result: AgentResult): AgentLearning {
        return {
            whatWorked: result.success ? [
                { description: '基本任务执行', confidence: 0.6, context: '标准流程', applicability: ['基础任务'] }
            ] : [],
            whatFailed: [
                { description: 'AI反思功能不可用', confidence: 0.8, context: '系统限制', applicability: ['所有任务'] }
            ],
            improvements: ['改进错误处理机制', '增强备用方案'],
            knowledgeGained: ['备用机制的重要性'],
            strategyAdjustments: [{
                strategy: '反思机制',
                adjustment: '使用更简单的备用方案',
                reason: 'AI反思不可用',
                expectedImpact: 0.1
            }],
            confidenceImpact: -0.1,
            timestamp: new Date()
        };
    }

    private predictStepOutput(tool: string, input: any): any {
        switch (tool) {
            case 'scope_file_reader':
                return { filesRead: [], fileContents: {}, success: true };
            case 'scope_performance_analyzer':
                return { analysis: {}, bottlenecks: [], recommendations: [] };
            default:
                return { success: true, data: {} };
        }
    }

    private calculateStepTimeout(tool: string, complexity: ComplexityLevel): number {
        const baseTimeouts: Record<string, number> = {
            'scope_file_reader': 10000,
            'scope_performance_analyzer': 30000,
            'scope_vertex_analyzer': 20000,
            'scope_code_optimizer': 15000,
            'report_generator': 10000
        };

        const complexityMultiplier: Record<ComplexityLevel, number> = {
            'low': 1,
            'medium': 1.5,
            'high': 2,
            'enterprise': 3
        };

        return (baseTimeouts[tool] || 15000) * complexityMultiplier[complexity];
    }

    private categorizeMemory(key: string, value: any): MemoryCategory {
        if (key.includes('thought') || key.includes('plan')) return 'conversation';
        if (key.includes('result') || key.includes('analysis')) return 'analysis_results';
        if (key.includes('feedback')) return 'user_preferences';
        if (key.includes('learning')) return 'learned_patterns';
        return 'conversation';
    }

    private generateMemoryTags(key: string, value: any): string[] {
        const tags = [];
        if (key.includes('scope')) tags.push('scope');
        if (key.includes('performance')) tags.push('performance');
        if (key.includes('optimization')) tags.push('optimization');
        return tags;
    }

    private findRelatedMemories(key: string, value: any): string[] {
        return [];
    }

    private cleanupMemory(): void {
        const items = Array.from(this.memory.values())
            .sort((a, b) => (a.importance * a.accessCount) - (b.importance * b.accessCount))
            .slice(0, 100);

        items.forEach(item => this.memory.delete(item.key));
        this.logger.info(`Cleaned up ${items.length} memory items`);
    }

    private getNextStepId(currentStepId: string, steps: PlanStep[]): string | undefined {
        const currentIndex = steps.findIndex(s => s.id === currentStepId);
        return currentIndex < steps.length - 1 ? steps[currentIndex + 1].id : undefined;
    }

    private getFallbackStrategy(tool: string): string | undefined {
        return `fallback_for_${tool}`;
    }

    private generateIntelligentFallbackStrategies(thought: AgentThought, availableTools: string[]): FallbackStrategy[] {
        return [{
            condition: '主要工具失败',
            action: '使用基础分析工具',
            tools: ['scope_file_reader'],
            successProbability: 0.7
        }];
    }

    private defineIntelligentSuccessCriteria(thought: AgentThought): string[] {
        return [
            '成功理解用户意图',
            '获取必要的分析数据',
            '生成有价值的优化建议'
        ];
    }

    private generateRiskMitigation(thought: AgentThought, riskFactors: string[]): string[] {
        return riskFactors.map(risk => `缓解${risk}的策略`);
    }

    private analyzePlanDependencies(steps: PlanStep[]): string[] {
        return steps.filter(s => s.dependencies.length > 0)
                   .map(s => `${s.id} 依赖于 ${s.dependencies.join(', ')}`);
    }

    private calculatePlanPriority(thought: AgentThought): 'low' | 'medium' | 'high' {
        if (thought.confidence > 0.8 && thought.expectedComplexity === 'high') return 'high';
        if (thought.confidence > 0.6) return 'medium';
        return 'low';
    }

    private checkStepDependencies(step: PlanStep, results: any[]): boolean {
        return step.dependencies.every(dep => 
            results.some(r => r.stepId === dep && r.success)
        );
    }

    private adjustStepInput(step: PlanStep, results: any[]): any {
        let adjustedInput = { ...step.input };

        const fileReaderResult = results.find(r => r.tool === 'scope_file_reader' && r.success);
        
        if (fileReaderResult && fileReaderResult.result.data) {
            const jobFolder = fileReaderResult.result.data.jobFolder;
            const fileContents = fileReaderResult.result.data.fileContents;
            
            if (step.tool === 'scope_performance_analyzer') {
                adjustedInput.statisticsFile = `${jobFolder}/__ScopeRuntimeStatistics__.xml`;
            }
            
            if (step.tool === 'scope_vertex_analyzer') {
                adjustedInput.vertexDefFile = `${jobFolder}/ScopeVertexDef.xml`;
                
                const performanceResult = results.find(r => r.tool === 'scope_performance_analyzer' && r.success);
                if (performanceResult) {
                    adjustedInput.performanceData = performanceResult.result.data;
                }
            }
            
            if (step.tool === 'scope_code_optimizer') {
                if (fileContents && fileContents['scope.script']) {
                    adjustedInput.scopeScript = fileContents['scope.script'];
                }
                
                const performanceResult = results.find(r => r.tool === 'scope_performance_analyzer' && r.success);
                const vertexResult = results.find(r => r.tool === 'scope_vertex_analyzer' && r.success);
                
                adjustedInput.performanceAnalysis = {
                    performance: performanceResult?.result.data,
                    vertex: vertexResult?.result.data,
                    files: fileContents
                };
            }
        }

        return adjustedInput;
    }

    private async attemptStepRecovery(step: PlanStep, error: any, context: AgentContext): Promise<any> {
        // 尝试使用备用工具或策略
        this.logger.info(`Attempting recovery for step ${step.id}`);
        
        // 这里可以实现具体的恢复策略
        return null;
    }

    private suggestRecoveryAction(step: PlanStep, error: any): string {
        return `建议检查${step.tool}的输入参数并重试`;
    }

    private suggestIntelligentNextSteps(data: any, plan: AgentPlan): string[] {
        const nextSteps = [];
        
        if (data.performanceAnalysis) {
            nextSteps.push('基于分析结果制定具体的优化计划');
            nextSteps.push('实施关键瓶颈的优化措施');
        }
        
        if (data.fileData) {
            nextSteps.push('深入分析代码逻辑和数据流');
        }
        
        return nextSteps.length > 0 ? nextSteps : ['继续监控性能指标'];
    }

    private generateWarnings(results: any[], plan: AgentPlan): string[] | undefined {
        const warnings = [];
        
        if (results.length < plan.steps.length) {
            warnings.push('部分步骤未能执行完成');
        }
        
        const failedResults = results.filter(r => !r.success);
        if (failedResults.length > 0) {
            warnings.push(`${failedResults.length}个步骤执行失败`);
        }
        
        return warnings.length > 0 ? warnings : undefined;
    }

    private enhanceReflectionWithExperience(reflection: any, result: AgentResult, context: AgentContext): any {
        return {
            whatWorked: reflection.whatWorked || ['完成了基本任务'],
            whatFailed: reflection.whatFailed || [],
            improvements: reflection.improvements || ['改进错误处理'],
            knowledgeGained: reflection.knowledgeGained || ['获得了新的经验'],
            confidenceAdjustment: reflection.confidenceAdjustment || 0
        };
    }

    private identifySuccessPatterns(result: AgentResult, whatWorked: string[]): any {
        return { patterns: whatWorked };
    }

    private identifyFailurePatterns(result: AgentResult, whatFailed: string[]): any {
        return { patterns: whatFailed };
    }

    private calculateLearningConfidence(item: string, result: AgentResult): number {
        return result.confidence * 0.8;
    }

    private extractLearningContext(item: string, context: AgentContext): string {
        return `优化级别: ${context.userPreferences.optimizationLevel}`;
    }

    private determineLearningApplicability(item: string): string[] {
        return ['性能分析', 'SCOPE优化'];
    }

    private generateStrategyAdjustments(reflection: any, result: AgentResult): any[] {
        return [{
            strategy: '工具选择',
            adjustment: '优先使用成功率高的工具',
            reason: '提高执行成功率',
            expectedImpact: 0.1
        }];
    }

    private async applyLearning(learning: AgentLearning): Promise<void> {
        this.logger.info(`Applied learning with ${learning.improvements.length} improvements`);
    }

    private analyzeFeedbackPatterns(feedback: AgentFeedback): any {
        return { rating: feedback.rating, helpfulness: feedback.suggestionHelpful };
    }

    private generateStrategyAdjustmentsFromFeedback(feedback: AgentFeedback): any[] {
        const adjustments = [];
        
        if (feedback.rating < 3) {
            adjustments.push({
                strategy: '结果质量',
                adjustment: '增加验证步骤',
                reason: '用户满意度低',
                expectedImpact: 0.2
            });
        }
        
        return adjustments;
    }

    private async updateKnowledgeBase(feedback: AgentFeedback, patterns: any, adjustments: any[]): Promise<void> {
        this.baselineLearning.set(`feedback_pattern_${Date.now()}`, {
            patterns,
            adjustments,
            timestamp: new Date()
        });
    }

    private generateMitigationStrategies(riskFactors: string[]): string[] {
        return riskFactors.map(factor => `缓解${factor}的策略`);
    }

    /**
     * 收集运行证据
     */
    private async collectEvidence(context: AgentContext): Promise<EvidenceData> {
        const startTime = Date.now();
        const availableFiles: string[] = [];
        const securityResults: SecurityCheckResult[] = [];
        let runtimeStats: any = null;
        let errorLogs: any = null;
        let vertexInfo: any = null;
        let jobInfo: any = null;
        let compileOutput: any = null;
        let warnings: any = null;
        
        try {
            this.logger.info('Collecting evidence...');
            
            const jobFolder = context.workspaceState.currentJobFolder || '';
            
            const folderType = await this.detectFolderType(jobFolder);
            
            const targetFiles = [
                '__ScopeRuntimeStatistics__.xml',
                'JobInfo.xml',
                '__ScopeCodeGenCompileOutput__.txt',
                '__Warnings__.xml',
                'Error',
                'ScopeVertexDef.xml'
            ];
            
            const securityCheckPromises = targetFiles.map(async (fileName) => {
                const filePath = require('path').join(jobFolder, fileName);
                const securityResult = await this.securityManager.checkFileSecurity(filePath);
                securityResults.push(securityResult);
                return { fileName, filePath, securityResult };
            });
            
            const securityChecks = await Promise.all(securityCheckPromises);
            
            const safeFiles = securityChecks.filter(check => check.securityResult.safe);
            const blockedFiles = securityChecks.filter(check => !check.securityResult.safe);
            
            this.logger.info(`Security check complete: ${safeFiles.length} safe files, ${blockedFiles.length} blocked files`);
            
            if (blockedFiles.length > 0) {
                blockedFiles.forEach(blocked => {
                    this.logger.warn(`Blocked file: ${blocked.fileName} - ${blocked.securityResult.issues.join(', ')}`);
                });
            }
            
            // 读取运行时统计数据
            const runtimeFileCheck = securityChecks.find(check => check.fileName === '__ScopeRuntimeStatistics__.xml');
            if (this.tools.has('extractRuntime2') && runtimeFileCheck?.securityResult.safe) {
                try {
                    this.logger.info('Reading runtime statistics...');
                    const runtimeTool = this.tools.get('extractRuntime2')!;
                    
                    const runtimeResult = await Promise.race([
                        runtimeTool.execute({
                            filePath: runtimeFileCheck.filePath,
                            fileType: 'RUNTIME_STATS',
                            analysisGoal: 'runtime_analysis'
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Runtime statistics read timeout')), 30000))
                    ]) as ToolOutput;
                    
                    if (runtimeResult.success && runtimeResult.data) {
                        runtimeStats = runtimeResult.data;
                        availableFiles.push('__ScopeRuntimeStatistics__.xml');
                        this.logger.info(`Runtime statistics collected successfully`);
                    } else {
                        this.logger.warn(`Runtime statistics read failed: ${runtimeResult.errors?.join(', ') || 'Unknown error'}`);
                    }
                } catch (error) {
                    this.logger.error(`Runtime statistics read failed: ${error}`);
                }
            } else if (runtimeFileCheck && !runtimeFileCheck.securityResult.safe) {
                this.logger.warn(`Runtime statistics file blocked: ${runtimeFileCheck.securityResult.issues.join(', ')}`);
            } else {
                this.logger.warn(`ExtractRuntime2 tool or runtime statistics file not found`);
            }
            
            // 读取作业信息
            const jobInfoFileCheck = securityChecks.find(check => check.fileName === 'JobInfo.xml');
            if (this.tools.has('extractRuntime') && jobInfoFileCheck?.securityResult.safe) {
                try {
                    this.logger.info('Reading job information...');
                    const jobInfoTool = this.tools.get('extractRuntime')!;
                    
                    const jobInfoResult = await Promise.race([
                        jobInfoTool.execute({
                            filePath: jobInfoFileCheck.filePath,
                            fileType: 'JOB_INFO',
                            analysisGoal: 'job_analysis'
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Job information read timeout')), 15000))
                    ]) as ToolOutput;
                    
                    if (jobInfoResult.success && jobInfoResult.data) {
                        jobInfo = jobInfoResult.data;
                        availableFiles.push('JobInfo.xml');
                        this.logger.info('Job information collected successfully');
                    } else {
                        this.logger.warn(`Job information read failed: ${jobInfoResult.errors?.join(', ') || 'Unknown error'}`);
                    }
                } catch (error) {
                    this.logger.error(`Job information read failed: ${error}`);
                }
            } else {
                this.logger.warn(`ExtractRuntime tool or job information file not found`);
            }
            
            // 读取编译输出
            const compileOutputFileCheck = securityChecks.find(check => check.fileName === '__ScopeCodeGenCompileOutput__.txt');
            if (this.tools.has('CSCodeReader') && compileOutputFileCheck?.securityResult.safe) {
                try {
                    this.logger.info('Reading compile output...');
                    const compileOutputTool = this.tools.get('CSCodeReader')!;
                    
                    const compileResult = await Promise.race([
                        compileOutputTool.execute({
                            filePath: compileOutputFileCheck.filePath,
                            fileType: 'COMPILE_OUTPUT',
                            analysisGoal: 'compile_analysis'
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Compile output read timeout')), 20000))
                    ]) as ToolOutput;
                    
                    if (compileResult.success && compileResult.data) {
                        compileOutput = compileResult.data;
                        availableFiles.push('__ScopeCodeGenCompileOutput__.txt');
                        this.logger.info('Compile output collected successfully');
                    } else {
                        this.logger.warn(`Compile output read failed: ${compileResult.errors?.join(', ') || 'Unknown error'}`);
                    }
                } catch (error) {
                    this.logger.error(`Compile output read failed: ${error}`);
                }
            } else {
                this.logger.warn(`CSCodeReader tool or compile output file not found`);
            }
            
            // 读取警告信息
            const warningsFileCheck = securityChecks.find(check => check.fileName === '__Warnings__.xml');
            if (this.tools.has('extractRuntime') && warningsFileCheck?.securityResult.safe) {
                try {
                    this.logger.info('Reading warnings...');
                    const warningsTool = this.tools.get('extractRuntime')!;
                    
                    const warningsResult = await Promise.race([
                        warningsTool.execute({
                            filePath: warningsFileCheck.filePath,
                            fileType: 'WARNINGS',
                            analysisGoal: 'warnings_analysis'
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Warnings read timeout')), 10000))
                    ]) as ToolOutput;
                    
                    if (warningsResult.success && warningsResult.data) {
                        warnings = warningsResult.data;
                        availableFiles.push('__Warnings__.xml');
                        this.logger.info('Warnings collected successfully');
                    } else {
                        this.logger.warn(`Warnings read failed: ${warningsResult.errors?.join(', ') || 'Unknown error'}`);
                    }
                } catch (error) {
                    this.logger.error(`Warnings read failed: ${error}`);
                }
            } else {
                this.logger.warn(`ExtractRuntime tool or warnings file not found`);
            }
            
            // 读取错误日志
            const errorFileCheck = securityChecks.find(check => check.fileName === 'Error');
            if (this.tools.has('ErrorLogReader') && errorFileCheck?.securityResult.safe) {
                try {
                    this.logger.info('Reading error logs...');
                    const errorTool = this.tools.get('ErrorLogReader')!;
                    
                    const errorResult = await Promise.race([
                        errorTool.execute({
                            filePath: errorFileCheck.filePath,
                            fileType: 'ERROR_INFO',
                            analysisGoal: 'error_analysis'
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Error logs read timeout')), 10000))
                    ]) as ToolOutput;
                    
                    if (errorResult.success && errorResult.data) {
                        errorLogs = errorResult.data;
                        availableFiles.push('Error');
                        this.logger.info('✅ 成功收集错误日志');
                    } else {
                        this.logger.warn(`⚠️ 错误日志读取失败: ${errorResult.errors?.join(', ') || '未知错误'}`);
                    }
                } catch (error) {
                    this.logger.error(`❌ 读取错误日志失败: ${error}`);
                }
            } else {
                this.logger.warn(`⚠️ 未找到ErrorLogReader工具或错误日志文件`);
            }
            
            // 读取顶点信息
            const vertexFileCheck = securityChecks.find(check => check.fileName === 'ScopeVertexDef.xml');
            if (this.tools.has('extractVertex') && vertexFileCheck?.securityResult.safe) {
                try {
                    this.logger.info('Reading vertex information...');
                    const vertexTool = this.tools.get('extractVertex')!;
                    
                    const vertexResult = await Promise.race([
                        vertexTool.execute({
                            filePath: vertexFileCheck.filePath,
                            fileType: 'VERTEX_DEFINITION',
                            analysisGoal: 'vertex_analysis'
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Vertex information read timeout')), 20000))
                    ]) as ToolOutput;
                    
                    if (vertexResult.success && vertexResult.data) {
                        vertexInfo = vertexResult.data;
                        availableFiles.push('ScopeVertexDef.xml');
                        this.logger.info('Vertex information collected successfully');
                    } else {
                        this.logger.warn(`Vertex information read failed: ${vertexResult.errors?.join(', ') || 'Unknown error'}`);
                    }
                } catch (error) {
                    this.logger.error(`Vertex information read failed: ${error}`);
                }
            } else {
                this.logger.warn(`ExtractVertex tool or vertex information file not found`);
            }
            
            const collectionTime = Date.now() - startTime;
            const hasData = availableFiles.length > 0;
            
            const keyMetrics = this.extractKeyMetrics(runtimeStats, jobInfo, compileOutput, warnings, vertexInfo);
            
            const securityStatus = {
                totalFiles: securityResults.length,
                safeFiles: securityResults.filter(r => r.safe).length,
                blockedFiles: securityResults.filter(r => !r.safe).length,
                securityIssues: securityResults.flatMap(r => r.issues),
                totalCheckTime: securityResults.reduce((sum, r) => sum + r.checkTime, 0),
                maxFileSize: Math.max(...securityResults.map(r => r.fileSize), 0),
                avgCheckTime: securityResults.length > 0 ? 
                    securityResults.reduce((sum, r) => sum + r.checkTime, 0) / securityResults.length : 0
            };
            
            this.logger.info(`Evidence collection completed: ${availableFiles.length} files in ${collectionTime}ms`);
            this.logger.info(`Security check: ${securityStatus.safeFiles}/${securityStatus.totalFiles} files passed`);
            
            return {
                runtimeStats,
                errorLogs,
                vertexInfo,
                jobInfo,
                compileOutput,
                warnings,
                hasData,
                collectionTime,
                availableFiles,
                keyMetrics,
                folderType,
                securityStatus
            };
            
        } catch (error) {
            this.logger.error(`Evidence collection error: ${error}`);
            
            const collectionTime = Date.now() - startTime;
            const hasData = availableFiles.length > 0;
            
            const keyMetrics = this.extractKeyMetrics(runtimeStats, jobInfo, compileOutput, warnings, vertexInfo);
            
            const securityStatus = {
                totalFiles: securityResults.length,
                safeFiles: securityResults.filter(r => r.safe).length,
                blockedFiles: securityResults.filter(r => !r.safe).length,
                securityIssues: securityResults.flatMap(r => r.issues).concat([`Collection error: ${error}`]),
                totalCheckTime: securityResults.reduce((sum, r) => sum + r.checkTime, 0),
                maxFileSize: Math.max(...securityResults.map(r => r.fileSize), 0),
                avgCheckTime: securityResults.length > 0 ? 
                    securityResults.reduce((sum, r) => sum + r.checkTime, 0) / securityResults.length : 0
            };
            
            this.logger.warn(`Evidence collection completed with errors: ${availableFiles.length} files in ${collectionTime}ms`);
            
            return {
                runtimeStats,
                errorLogs,
                vertexInfo,
                jobInfo,
                compileOutput,
                warnings,
                hasData,
                collectionTime,
                availableFiles,
                keyMetrics,
                folderType: 'unknown',
                securityStatus
            };
        }
    }

         /**
      * 检测文件夹类型
      */
     private async detectFolderType(jobFolder: string): Promise<'minimal' | 'complete' | 'unknown'> {
         try {
             const fs = require('fs').promises;
             const path = require('path');
             
             const minimalFiles = [
                 '__ScopeRuntimeStatistics__.xml',
                 'ScopeVertexDef.xml'
             ];
             
             const completeFiles = [
                 'JobInfo.xml',
                 '__ScopeCodeGenCompileOutput__.txt',
                 '__Warnings__.xml',
                 'scopeengine.dll',
                 'scopehost.exe'
             ];
             
             let minimalCount = 0;
             let completeCount = 0;
             
             for (const file of minimalFiles) {
                 try {
                     await fs.access(path.join(jobFolder, file));
                     minimalCount++;
                 } catch (error) {
                     // 文件不存在，继续检查下一个
                 }
             }
             
             for (const file of completeFiles) {
                 try {
                     await fs.access(path.join(jobFolder, file));
                     completeCount++;
                 } catch (error) {
                     // 文件不存在，继续检查下一个
                 }
             }
             
             if (completeCount >= 3) {
                 this.logger.info(`Detected complete SCOPE environment with ${completeCount} files`);
                 return 'complete';
             } else if (minimalCount >= 1) {
                 this.logger.info(`Detected minimal SCOPE environment with ${minimalCount} files`);
                 return 'minimal';
             } else {
                 this.logger.warn(`Cannot determine SCOPE environment type`);
                 return 'unknown';
             }
             
         } catch (error) {
             this.logger.warn(`Folder type detection failed: ${error}`);
             return 'unknown';
         }
     }

    /**
     * 提取关键性能指标
     */
    private extractKeyMetrics(runtimeStats: any, jobInfo: any, compileOutput: any, warnings: any, vertexInfo: any): any {
        const metrics: any = {};
        
        try {
            this.extractBasicMetrics(metrics, runtimeStats, jobInfo, compileOutput, warnings, vertexInfo);
            
            metrics.dataSkewMetrics = this.extractDataSkewMetrics(runtimeStats, jobInfo, vertexInfo);
            metrics.shuffleMetrics = this.extractShuffleMetrics(runtimeStats, vertexInfo);
            metrics.joinMetrics = this.extractJoinMetrics(jobInfo, vertexInfo);
            metrics.compilationMetrics = this.extractCompilationMetrics(compileOutput, jobInfo);
            metrics.resourceMetrics = this.extractResourceMetrics(runtimeStats, jobInfo);
            metrics.issueMetrics = this.extractIssueMetrics(warnings, compileOutput, runtimeStats);
            metrics.dataMetrics = this.extractDataMetrics(jobInfo, runtimeStats);
            
        } catch (error) {
            this.logger.warn(`Key metrics extraction failed: ${error}`);
        }
        
        return metrics;
    }

    /**
     * 提取基础性能指标
     */
    private extractBasicMetrics(metrics: any, runtimeStats: any, jobInfo: any, compileOutput: any, warnings: any, vertexInfo: any): void {
        if (jobInfo?.RunTime) {
            metrics.runTime = parseInt(jobInfo.RunTime) || 0;
        }
        if (jobInfo?.CompilationTimeTicks) {
            metrics.compilationTime = parseInt(jobInfo.CompilationTimeTicks) || 0;
        }
        
        if (runtimeStats?.timeStats) {
            metrics.cpuTime = runtimeStats.timeStats.executeTotalCpuTime || 0;
            metrics.ioTime = runtimeStats.timeStats.ioTime || 0;
        }
        if (runtimeStats?.memoryStats) {
            metrics.memoryPeakSize = runtimeStats.memoryStats.maxExecutionMemoryPeakSize || 0;
        }
        
        if (compileOutput?.csharpCompileTime) {
            metrics.compilationTime = (metrics.compilationTime || 0) + compileOutput.csharpCompileTime;
        }
        
        if (warnings?.warningCount) {
            metrics.warningCount = warnings.warningCount;
        }
        
        if (vertexInfo?.vertexCount) {
            metrics.vertexCount = vertexInfo.vertexCount;
        }
    }

    /**
     * 提取数据倾斜专项指标
     */
    private extractDataSkewMetrics(runtimeStats: any, jobInfo: any, vertexInfo: any): any {
        const skewMetrics: any = {};
        
        try {
            if (runtimeStats?.taskStats) {
                const taskDurations = runtimeStats.taskStats.taskDurations || [];
                if (taskDurations.length > 0) {
                    skewMetrics.maxTaskDuration = Math.max(...taskDurations);
                    skewMetrics.minTaskDuration = Math.min(...taskDurations);
                    skewMetrics.avgTaskDuration = taskDurations.reduce((a: number, b: number) => a + b, 0) / taskDurations.length;
                    
                    if (skewMetrics.avgTaskDuration > 0) {
                        skewMetrics.skewRatio = skewMetrics.maxTaskDuration / skewMetrics.avgTaskDuration;
                    }
                    
                    const threshold = skewMetrics.avgTaskDuration * 2;
                    skewMetrics.skewedTasksCount = taskDurations.filter((duration: number) => duration > threshold).length;
                }
            }
            
            // 从顶点信息中提取分区信息
            if (vertexInfo?.partitionStats) {
                const partitionSizes = vertexInfo.partitionStats.partitionSizes || [];
                if (partitionSizes.length > 0) {
                    const maxPartition = Math.max(...partitionSizes);
                    const minPartition = Math.min(...partitionSizes);
                    const avgPartition = partitionSizes.reduce((a: number, b: number) => a + b, 0) / partitionSizes.length;
                    
                    if (avgPartition > 0) {
                        skewMetrics.partitionImbalance = (maxPartition - minPartition) / avgPartition;
                    }
                }
            }
            
            // 从作业信息中提取热点键信息
            if (jobInfo?.hotKeys) {
                skewMetrics.hotKeys = jobInfo.hotKeys.slice(0, 5); // 只保留前5个热点键
            }
            
            // 统计无分区策略的JOIN数量
            if (vertexInfo?.joins) {
                skewMetrics.joinWithoutPartition = vertexInfo.joins.filter((join: any) => 
                    !join.partitionBy || join.partitionBy.length === 0
                ).length;
            }
            
        } catch (error) {
            this.logger.warn(`Data skew metrics extraction failed: ${error}`);
        }
        
        return skewMetrics;
    }

    /**
     * 提取Shuffle性能专项指标
     */
    private extractShuffleMetrics(runtimeStats: any, vertexInfo: any): any {
        const shuffleMetrics: any = {};
        
        try {
            // 从运行时统计中提取Shuffle信息
            if (runtimeStats?.shuffleStats) {
                shuffleMetrics.totalShuffleSize = runtimeStats.shuffleStats.totalShuffleSize || 0;
                shuffleMetrics.shuffleOperationCount = runtimeStats.shuffleStats.shuffleOperationCount || 0;
                shuffleMetrics.maxShuffleSize = runtimeStats.shuffleStats.maxShuffleSize || 0;
                shuffleMetrics.networkTransferTime = runtimeStats.shuffleStats.networkTransferTime || 0;
            }
            
            // 从顶点信息中提取Stage信息
            if (vertexInfo?.stages) {
                shuffleMetrics.stageCount = vertexInfo.stages.length;
                
                // 计算跨Stage数据流量
                shuffleMetrics.crossStageDataFlow = vertexInfo.stages.reduce((total: number, stage: any) => {
                    return total + (stage.outputDataSize || 0);
                }, 0);
                
                // 统计不同类型的JOIN数量
                shuffleMetrics.broadcastJoinCount = vertexInfo.stages.filter((stage: any) => 
                    stage.joinType === 'broadcast'
                ).length;
                
                shuffleMetrics.sortMergeJoinCount = vertexInfo.stages.filter((stage: any) => 
                    stage.joinType === 'sortMerge'
                ).length;
            }
            
        } catch (error) {
            this.logger.warn(`Shuffle metrics extraction failed: ${error}`);
        }
        
        return shuffleMetrics;
    }

    /**
     * 提取JOIN操作专项指标
     */
    private extractJoinMetrics(jobInfo: any, vertexInfo: any): any {
        const joinMetrics: any = {};
        
        try {
            if (vertexInfo?.joins) {
                const joins = vertexInfo.joins;
                joinMetrics.totalJoinCount = joins.length;
                
                joinMetrics.innerJoinCount = joins.filter((join: any) => join.type === 'inner').length;
                joinMetrics.leftJoinCount = joins.filter((join: any) => join.type === 'left').length;
                joinMetrics.crossJoinCount = joins.filter((join: any) => join.type === 'cross').length;
                
                joinMetrics.joinKeysAnalysis = joins.map((join: any) => 
                    `${join.leftKey}-${join.rightKey}(${join.type})`
                ).slice(0, 10);
                
                joinMetrics.joinEstimatedRowCount = joins.reduce((total: number, join: any) => {
                    return total + (join.estimatedRows || 0);
                }, 0);
                
                joinMetrics.joinOptimizationHints = [];
                joins.forEach((join: any) => {
                    if (!join.partitionBy) {
                        joinMetrics.joinOptimizationHints.push(`${join.leftKey}需要分区优化`);
                    }
                    if (join.type === 'cross') {
                        joinMetrics.joinOptimizationHints.push(`避免笛卡尔积JOIN: ${join.leftKey}×${join.rightKey}`);
                    }
                });
            }
            
        } catch (error) {
            this.logger.warn(`JOIN metrics extraction failed: ${error}`);
        }
        
        return joinMetrics;
    }

    /**
     * 提取编译和计划指标
     */
    private extractCompilationMetrics(compileOutput: any, jobInfo: any): any {
        const compilationMetrics: any = {};
        
        try {
            // 从编译输出中提取编译时间
            if (compileOutput) {
                compilationMetrics.csharpCompileTime = compileOutput.csharpCompileTime || 0;
                compilationMetrics.cppCompileTime = compileOutput.cppCompileTime || 0;
                compilationMetrics.algebraOptimizationTime = compileOutput.algebraOptimizationTime || 0;
                compilationMetrics.planGenerationTime = compileOutput.planGenerationTime || 0;
                
                // 提取编译器警告
                if (compileOutput.warnings) {
                    compilationMetrics.compilerWarnings = compileOutput.warnings.slice(0, 5);
                }
                
                // 提取优化级别
                compilationMetrics.optimizationLevel = compileOutput.optimizationLevel || 'unknown';
            }
            
        } catch (error) {
            this.logger.warn(`Compilation metrics extraction failed: ${error}`);
        }
        
        return compilationMetrics;
    }

    /**
     * 提取资源使用专项指标
     */
    private extractResourceMetrics(runtimeStats: any, jobInfo: any): any {
        const resourceMetrics: any = {};
        
        try {
            // 从运行时统计中提取资源使用信息
            if (runtimeStats) {
                resourceMetrics.maxConcurrentTasks = runtimeStats.maxConcurrentTasks || 0;
                resourceMetrics.memoryUtilization = runtimeStats.memoryUtilization || 0;
                resourceMetrics.cpuUtilization = runtimeStats.cpuUtilization || 0;
                resourceMetrics.diskIOBytes = runtimeStats.diskIOBytes || 0;
                resourceMetrics.networkIOBytes = runtimeStats.networkIOBytes || 0;
                resourceMetrics.gcPauseTime = runtimeStats.gcPauseTime || 0;
                resourceMetrics.spillToDiskSize = runtimeStats.spillToDiskSize || 0;
            }
            
        } catch (error) {
            this.logger.warn(`Resource metrics extraction failed: ${error}`);
        }
        
        return resourceMetrics;
    }

    /**
     * 提取错误和警告详情
     */
    private extractIssueMetrics(warnings: any, compileOutput: any, runtimeStats: any): any {
        const issueMetrics: any = {};
        
        try {
            issueMetrics.criticalErrors = [];
            issueMetrics.performanceWarnings = [];
            issueMetrics.dataQualityIssues = [];
            issueMetrics.optimizationSuggestions = [];
            issueMetrics.riskFactors = [];
            
            // 从警告信息中提取
            if (warnings?.items) {
                warnings.items.forEach((warning: any) => {
                    if (warning.severity === 'critical') {
                        issueMetrics.criticalErrors.push(warning.message);
                    } else if (warning.category === 'performance') {
                        issueMetrics.performanceWarnings.push(warning.message);
                    } else if (warning.category === 'dataQuality') {
                        issueMetrics.dataQualityIssues.push(warning.message);
                    }
                });
            }
            
            // 从编译输出中提取优化建议
            if (compileOutput?.optimizationSuggestions) {
                issueMetrics.optimizationSuggestions = compileOutput.optimizationSuggestions.slice(0, 5);
            }
            
            // 从运行时统计中提取风险因素
            if (runtimeStats?.riskFactors) {
                issueMetrics.riskFactors = runtimeStats.riskFactors.slice(0, 5);
            }
            
        } catch (error) {
            this.logger.warn(`Issue metrics extraction failed: ${error}`);
        }
        
        return issueMetrics;
    }

    /**
     * 提取数据源和输出指标
     */
    private extractDataMetrics(jobInfo: any, runtimeStats: any): any {
        const dataMetrics: any = {};
        
        try {
            // 从作业信息中提取数据指标
            if (jobInfo) {
                dataMetrics.inputDataSize = jobInfo.inputDataSize || 0;
                dataMetrics.outputDataSize = jobInfo.outputDataSize || 0;
                dataMetrics.inputTableCount = jobInfo.inputTableCount || 0;
                dataMetrics.outputTableCount = jobInfo.outputTableCount || 0;
                
                // 计算压缩比
                if (dataMetrics.inputDataSize > 0) {
                    dataMetrics.dataCompressionRatio = dataMetrics.outputDataSize / dataMetrics.inputDataSize;
                }
            }
            
            // 从运行时统计中提取处理速率
            if (runtimeStats?.processingStats) {
                dataMetrics.rowProcessingRate = runtimeStats.processingStats.rowProcessingRate || 0;
            }
            
        } catch (error) {
            this.logger.warn(`Data metrics extraction failed: ${error}`);
        }
        
        return dataMetrics;
    }

    /**
     * 用证据数据增强上下文 - 阶段1新增
     */
    private enhanceContextWithEvidence(context: AgentContext, evidenceData: EvidenceData): AgentContext {
        const enhancedContext = { ...context };
        
        if (evidenceData.hasData) {
            const evidenceSummary = this.generateEvidenceSummary(evidenceData);
            
            this.logger.info(`Evidence context enhanced: ${evidenceSummary.length} chars, ${evidenceData.availableFiles.length} files`);
            
            enhancedContext.conversationHistory = [
                ...context.conversationHistory,
                {
                    role: 'system',
                    content: `Evidence summary: ${evidenceSummary}`,
                    timestamp: new Date()
                }
            ];
            
            enhancedContext.workspaceState = {
                ...context.workspaceState,
                scopeFilesAvailable: evidenceData.availableFiles.length > 0
            };
        } else {
            this.logger.warn('No evidence data available for context enhancement');
        }
        
        return enhancedContext;
    }

    /**
     * 生成高信息密度证据摘要 - 增强版(400-2000字符)，提供全面的性能洞察
     */
    private generateEvidenceSummary(evidenceData: EvidenceData): string {
        const summaryParts: string[] = [];
        
        // === 核心作业指标 === 
        summaryParts.push(this.generateBasicJobSummary(evidenceData));
        
        // === 数据倾斜专项分析 ===
        const skewSummary = this.generateDataSkewSummary(evidenceData.keyMetrics?.dataSkewMetrics);
        if (skewSummary) {
            summaryParts.push(`\n📊 数据倾斜分析: ${skewSummary}`);
        }
        
        // === Shuffle性能专项分析 ===
        const shuffleSummary = this.generateShuffleSummary(evidenceData.keyMetrics?.shuffleMetrics);
        if (shuffleSummary) {
            summaryParts.push(`\n🔄 Shuffle性能: ${shuffleSummary}`);
        }
        
        // === JOIN操作专项分析 ===
        const joinSummary = this.generateJoinSummary(evidenceData.keyMetrics?.joinMetrics);
        if (joinSummary) {
            summaryParts.push(`\n🔗 JOIN分析: ${joinSummary}`);
        }
        
        // === 资源使用深度分析 ===
        const resourceSummary = this.generateResourceSummary(evidenceData.keyMetrics?.resourceMetrics);
        if (resourceSummary) {
            summaryParts.push(`\n💾 资源使用: ${resourceSummary}`);
        }
        
        // === 编译和优化信息 ===
        const compilationSummary = this.generateCompilationSummary(evidenceData.keyMetrics?.compilationMetrics);
        if (compilationSummary) {
            summaryParts.push(`\n⚙️ 编译分析: ${compilationSummary}`);
        }
        
        // === 数据流和处理指标 ===
        const dataSummary = this.generateDataFlowSummary(evidenceData.keyMetrics?.dataMetrics);
        if (dataSummary) {
            summaryParts.push(`\n📈 数据流量: ${dataSummary}`);
        }
        
        // === 问题和风险评估 ===
        const issueSummary = this.generateIssueSummary(evidenceData.keyMetrics?.issueMetrics);
        if (issueSummary) {
            summaryParts.push(`\n⚠️ 问题评估: ${issueSummary}`);
        }
        
        // === 环境和文件收集状态 ===
        const envType = evidenceData.folderType === 'complete' ? '完整版' : 
                       evidenceData.folderType === 'minimal' ? '精简版' : '未知类型';
        summaryParts.push(`\n📁 证据收集: 成功收集${evidenceData.availableFiles.length}个关键文件（${envType}环境），耗时${evidenceData.collectionTime}ms`);
        
        const finalSummary = summaryParts.join('');
        
        this.logger.info(`Evidence summary generated: ${finalSummary.length} chars, ${summaryParts.length} sections, ${envType} environment`);
        
        return finalSummary;
    }

    /**
     * 生成基础作业摘要
     */
    private generateBasicJobSummary(evidenceData: EvidenceData): string {
        const parts: string[] = [];
        const metrics = evidenceData.keyMetrics;
        
        if (!metrics) return 'Basic metrics: Data collection in progress';
        
        // 运行时间（转换为可读格式）
        if (metrics.runTime) {
            const minutes = Math.floor(metrics.runTime / 60000);
            const seconds = Math.floor((metrics.runTime % 60000) / 1000);
            parts.push(`运行时间 ${minutes}分${seconds}秒`);
        }
        
        // 内存使用
        if (metrics.memoryPeakSize) {
            const memoryGB = (metrics.memoryPeakSize / 1024 / 1024 / 1024).toFixed(1);
            parts.push(`内存峰值 ${memoryGB}GB`);
        }
        
        // CPU使用
        if (metrics.cpuTime) {
            const cpuMinutes = Math.floor(metrics.cpuTime / 60000);
            parts.push(`CPU总时间 ${cpuMinutes}分钟`);
        }
        
        // 编译时间
        if (metrics.compilationTime) {
            const compileSeconds = Math.floor(metrics.compilationTime / 1000);
            parts.push(`编译耗时 ${compileSeconds}秒`);
        }
        
        // 顶点数量
        if (metrics.vertexCount) {
            parts.push(`计算顶点 ${metrics.vertexCount}个`);
        }
        
        // 作业状态
        if (evidenceData.jobInfo?.State) {
            parts.push(`状态: ${evidenceData.jobInfo.State}`);
        }
        
        return `🎯 核心指标: ${parts.join(', ')}`;
    }

    /**
     * 生成数据倾斜专项摘要
     */
    private generateDataSkewSummary(skewMetrics: any): string | null {
        if (!skewMetrics) return null;
        
        const parts: string[] = [];
        
        // 倾斜比例分析
        if (skewMetrics.skewRatio) {
            const severity = skewMetrics.skewRatio > 5 ? '严重' : skewMetrics.skewRatio > 3 ? '中等' : '轻微';
            parts.push(`倾斜比例 ${skewMetrics.skewRatio.toFixed(1)}x(${severity})`);
        }
        
        // 任务执行时间分析
        if (skewMetrics.maxTaskDuration && skewMetrics.avgTaskDuration) {
            const maxMin = Math.floor(skewMetrics.maxTaskDuration / 60000);
            const avgMin = Math.floor(skewMetrics.avgTaskDuration / 60000);
            parts.push(`最长任务 ${maxMin}分钟 vs 平均 ${avgMin}分钟`);
        }
        
        // 倾斜任务数量
        if (skewMetrics.skewedTasksCount) {
            parts.push(`倾斜任务 ${skewMetrics.skewedTasksCount}个`);
        }
        
        // 分区不平衡度
        if (skewMetrics.partitionImbalance) {
            parts.push(`分区不平衡度 ${skewMetrics.partitionImbalance.toFixed(2)}`);
        }
        
        // 热点键
        if (skewMetrics.hotKeys && skewMetrics.hotKeys.length > 0) {
            parts.push(`热点键: ${skewMetrics.hotKeys.slice(0, 3).join(', ')}`);
        }
        
        // 无分区JOIN
        if (skewMetrics.joinWithoutPartition) {
            parts.push(`无分区JOIN ${skewMetrics.joinWithoutPartition}个`);
        }
        
        return parts.length > 0 ? parts.join(', ') : null;
    }

    /**
     * 生成Shuffle性能摘要
     */
    private generateShuffleSummary(shuffleMetrics: any): string | null {
        if (!shuffleMetrics) return null;
        
        const parts: string[] = [];
        
        // Shuffle数据量
        if (shuffleMetrics.totalShuffleSize) {
            const shuffleGB = (shuffleMetrics.totalShuffleSize / 1024).toFixed(1);
            parts.push(`总数据量 ${shuffleGB}GB`);
        }
        
        // Shuffle操作次数
        if (shuffleMetrics.shuffleOperationCount) {
            parts.push(`操作次数 ${shuffleMetrics.shuffleOperationCount}`);
        }
        
        // Stage数量
        if (shuffleMetrics.stageCount) {
            parts.push(`Stage数量 ${shuffleMetrics.stageCount}`);
        }
        
        // 网络传输时间
        if (shuffleMetrics.networkTransferTime) {
            const transferMin = Math.floor(shuffleMetrics.networkTransferTime / 60000);
            parts.push(`网络传输 ${transferMin}分钟`);
        }
        
        // JOIN类型统计
        const joinTypes: string[] = [];
        if (shuffleMetrics.broadcastJoinCount) {
            joinTypes.push(`广播JOIN ${shuffleMetrics.broadcastJoinCount}个`);
        }
        if (shuffleMetrics.sortMergeJoinCount) {
            joinTypes.push(`排序JOIN ${shuffleMetrics.sortMergeJoinCount}个`);
        }
        if (joinTypes.length > 0) {
            parts.push(joinTypes.join(', '));
        }
        
        return parts.length > 0 ? parts.join(', ') : null;
    }

    /**
     * 生成JOIN操作摘要
     */
    private generateJoinSummary(joinMetrics: any): string | null {
        if (!joinMetrics) return null;
        
        const parts: string[] = [];
        
        // JOIN总数
        if (joinMetrics.totalJoinCount) {
            parts.push(`总数 ${joinMetrics.totalJoinCount}个`);
        }
        
        // JOIN类型分布
        const joinTypes: string[] = [];
        if (joinMetrics.innerJoinCount) joinTypes.push(`Inner ${joinMetrics.innerJoinCount}`);
        if (joinMetrics.leftJoinCount) joinTypes.push(`Left ${joinMetrics.leftJoinCount}`);
        if (joinMetrics.crossJoinCount) joinTypes.push(`Cross ${joinMetrics.crossJoinCount}(危险)`);
        
        if (joinTypes.length > 0) {
            parts.push(`类型分布: ${joinTypes.join(', ')}`);
        }
        
        // JOIN预估行数
        if (joinMetrics.joinEstimatedRowCount) {
            const rowsM = (joinMetrics.joinEstimatedRowCount / 1000000).toFixed(1);
            parts.push(`预估行数 ${rowsM}M`);
        }
        
        // 优化提示
        if (joinMetrics.joinOptimizationHints && joinMetrics.joinOptimizationHints.length > 0) {
            parts.push(`优化提示: ${joinMetrics.joinOptimizationHints.slice(0, 2).join('; ')}`);
        }
        
        return parts.length > 0 ? parts.join(', ') : null;
    }

    /**
     * 生成资源使用摘要
     */
    private generateResourceSummary(resourceMetrics: any): string | null {
        if (!resourceMetrics) return null;
        
        const parts: string[] = [];
        
        // 并发任务数
        if (resourceMetrics.maxConcurrentTasks) {
            parts.push(`最大并发 ${resourceMetrics.maxConcurrentTasks}任务`);
        }
        
        // 资源利用率
        if (resourceMetrics.memoryUtilization) {
            parts.push(`内存利用率 ${resourceMetrics.memoryUtilization}%`);
        }
        if (resourceMetrics.cpuUtilization) {
            parts.push(`CPU利用率 ${resourceMetrics.cpuUtilization}%`);
        }
        
        // IO统计
        if (resourceMetrics.diskIOBytes) {
            const diskGB = (resourceMetrics.diskIOBytes / 1024 / 1024 / 1024).toFixed(1);
            parts.push(`磁盘IO ${diskGB}GB`);
        }
        
        // GC统计
        if (resourceMetrics.gcPauseTime) {
            parts.push(`GC暂停 ${resourceMetrics.gcPauseTime}ms`);
        }
        
        // 溢出统计
        if (resourceMetrics.spillToDiskSize) {
            const spillGB = (resourceMetrics.spillToDiskSize / 1024 / 1024 / 1024).toFixed(1);
            parts.push(`溢出磁盘 ${spillGB}GB`);
        }
        
        return parts.length > 0 ? parts.join(', ') : null;
    }

    /**
     * 生成编译分析摘要
     */
    private generateCompilationSummary(compilationMetrics: any): string | null {
        if (!compilationMetrics) return null;
        
        const parts: string[] = [];
        
        // 编译时间分解
        if (compilationMetrics.csharpCompileTime) {
            parts.push(`C#编译 ${Math.floor(compilationMetrics.csharpCompileTime / 1000)}秒`);
        }
        if (compilationMetrics.cppCompileTime) {
            parts.push(`C++编译 ${Math.floor(compilationMetrics.cppCompileTime / 1000)}秒`);
        }
        
        // 优化时间
        if (compilationMetrics.algebraOptimizationTime) {
            parts.push(`代数优化 ${Math.floor(compilationMetrics.algebraOptimizationTime / 1000)}秒`);
        }
        
        // 优化级别
        if (compilationMetrics.optimizationLevel) {
            parts.push(`优化级别: ${compilationMetrics.optimizationLevel}`);
        }
        
        // 编译器警告
        if (compilationMetrics.compilerWarnings && compilationMetrics.compilerWarnings.length > 0) {
            parts.push(`编译警告 ${compilationMetrics.compilerWarnings.length}个`);
        }
        
        return parts.length > 0 ? parts.join(', ') : null;
    }

    /**
     * 生成数据流摘要
     */
    private generateDataFlowSummary(dataMetrics: any): string | null {
        if (!dataMetrics) return null;
        
        const parts: string[] = [];
        
        // 输入输出数据量
        if (dataMetrics.inputDataSize) {
            const inputGB = (dataMetrics.inputDataSize / 1024).toFixed(1);
            parts.push(`输入数据 ${inputGB}GB`);
        }
        if (dataMetrics.outputDataSize) {
            const outputGB = (dataMetrics.outputDataSize / 1024).toFixed(1);
            parts.push(`输出数据 ${outputGB}GB`);
        }
        
        // 压缩比
        if (dataMetrics.dataCompressionRatio) {
            parts.push(`压缩比 ${(dataMetrics.dataCompressionRatio * 100).toFixed(1)}%`);
        }
        
        // 表数量
        if (dataMetrics.inputTableCount || dataMetrics.outputTableCount) {
            parts.push(`表数量 ${dataMetrics.inputTableCount || 0}→${dataMetrics.outputTableCount || 0}`);
        }
        
        // 处理速率
        if (dataMetrics.rowProcessingRate) {
            const rateK = (dataMetrics.rowProcessingRate / 1000).toFixed(1);
            parts.push(`处理速率 ${rateK}K行/秒`);
        }
        
        return parts.length > 0 ? parts.join(', ') : null;
    }

    /**
     * 生成问题评估摘要
     */
    private generateIssueSummary(issueMetrics: any): string | null {
        if (!issueMetrics) return null;
        
        const parts: string[] = [];
        
        // 严重错误
        if (issueMetrics.criticalErrors && issueMetrics.criticalErrors.length > 0) {
            parts.push(`严重错误 ${issueMetrics.criticalErrors.length}个`);
        }
        
        // 性能警告
        if (issueMetrics.performanceWarnings && issueMetrics.performanceWarnings.length > 0) {
            parts.push(`性能警告 ${issueMetrics.performanceWarnings.length}个`);
        }
        
        // 优化建议
        if (issueMetrics.optimizationSuggestions && issueMetrics.optimizationSuggestions.length > 0) {
            parts.push(`优化建议 ${issueMetrics.optimizationSuggestions.length}条`);
            // 显示最重要的建议
            parts.push(`主要建议: ${issueMetrics.optimizationSuggestions[0]}`);
        }
        
        // 风险因素
        if (issueMetrics.riskFactors && issueMetrics.riskFactors.length > 0) {
            parts.push(`风险因素 ${issueMetrics.riskFactors.length}个`);
        }
        
        return parts.length > 0 ? parts.join(', ') : null;
    }
}
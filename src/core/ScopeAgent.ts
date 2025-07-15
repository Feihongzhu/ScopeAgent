import * as vscode from 'vscode';
import * as os from 'os';
import { Logger } from '../functions/logger';
import { v4 as uuidv4 } from 'uuid';
import { LanguageModelService } from '../services/LanguageModelService';
import {
    AgentCore,
    AgentContext,
    AgentThought,
    AgentPlan,
    AgentResult,
    AgentLearning,
    AgentFeedback,
    Tool,
    ToolResult,
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
    ExecutionError
} from '../types/AgentTypes';

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
    private tools: Map<string, Tool> = new Map();
    private memory: Map<string, MemoryItem> = new Map();
    private languageModel: LanguageModelService;
    private logger: Logger;
    private currentStatus: AgentStatus;
    private baselineLearning: Map<string, any> = new Map();

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
        this.currentStatus = {
            state: 'idle',
            lastActivity: new Date()
        };
        
        this.initializeBaseLearning();
        this.logger.info(`Initialized intelligent SCOPE AI Agent: ${this.name}`);
    }

    /**
     * 初始化Agent - 设置语言模型和基础配置
     */
    async initialize(): Promise<boolean> {
        try {
            const modelInitialized = await this.languageModel.initialize();
            if (!modelInitialized) {
                this.logger.error('Failed to initialize language model');
                return false;
            }

            this.logger.info('SCOPE AI Agent initialized successfully');
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
            this.logger.info(`🧠 Agent thinking about: "${input}"`);
            
            // 使用语言模型进行智能意图分析
            const intentAnalysis = await this.languageModel.analyzeIntent(input, context);
            
            // 评估复杂度
            const complexity = this.languageModel.assessComplexity(input, context);
            
            // 确定所需工具
            const availableTools = Array.from(this.tools.keys());
            const requiredTools = this.languageModel.selectRequiredTools(
                intentAnalysis.intent, 
                intentAnalysis.problemType, 
                availableTools
            );
            
            // 进行风险评估
            const riskAssessment = this.assessRisks(input, context, intentAnalysis.problemType);
            
            // 分析上下文因素
            const contextualFactors = this.analyzeContextualFactors(input, context);

            const thought: AgentThought = {
                id: `thought_${uuidv4()}`,
                intent: intentAnalysis.intent,
                reasoning: this.enhanceReasoningWithContext(intentAnalysis.reasoning, context),
                confidence: this.adjustConfidenceBasedOnExperience(intentAnalysis.confidence),
                problemType: intentAnalysis.problemType,
                requiredTools: requiredTools,
                expectedComplexity: complexity,
                riskAssessment: riskAssessment,
                contextualFactors: contextualFactors,
                timestamp: new Date()
            };

            // 记住这次思考
            this.remember('last_thought', thought, 0.8);
            this.remember(`thought_${thought.id}`, thought, 0.6);

            const thinkingTime = Date.now() - startTime;
            this.logger.info(`🧠 Thinking completed in ${thinkingTime}ms - Intent: ${thought.intent} (${thought.confidence.toFixed(2)} confidence)`);
            
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
            this.logger.info(`📋 Agent planning for intent: ${thought.intent}`);
            
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
            this.logger.info(`📋 Planning completed in ${planningTime}ms - ${steps.length} steps, estimated ${plan.estimatedTime}ms`);
            
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
            this.logger.info(`⚡ Agent executing plan: ${plan.id} with ${plan.steps.length} steps`);
            
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

                    this.logger.info(`🔧 Executing tool: ${step.tool} for step: ${step.description}`);
                    const toolResult = await this.executeToolWithTimeout(tool, adjustedInput, step.timeout || 30000, context);
                    
                    if (toolResult.success) {
                        executionResults.push({
                            stepId: step.id,
                            tool: step.tool,
                            result: toolResult,
                            success: true,
                            executionTime: toolResult.executionTime
                        });
                        
                        if (!toolsUsed.includes(step.tool)) {
                            toolsUsed.push(step.tool);
                        }
                        
                        this.logger.info(`✅ Step ${step.id} completed successfully`);
                    } else {
                        throw new Error(`Tool execution failed: ${toolResult.message}`);
                    }

                } catch (stepError) {
                    this.logger.warn(`❌ Step ${step.id} failed: ${stepError}`);
                    
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

            this.logger.info(`⚡ Execution completed in ${executionTime}ms - Success: ${success}, Confidence: ${confidence.toFixed(2)}`);
            
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
            this.logger.info(`🤔 Agent reflecting on result: ${result.id}`);
            
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
            this.logger.info(`🤔 Reflection completed in ${reflectionTime}ms - ${learning.improvements.length} improvements identified`);
            
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

            this.logger.info(`🔧 Using tool: ${toolName}`);
            
            // 验证参数
            const validation = tool.validate(params);
            if (!validation.valid) {
                throw new Error(`Tool validation failed: ${validation.errors.join(', ')}`);
            }

            // 执行工具
            const result = await tool.execute(params, context);
            
            this.logger.info(`🔧 Tool ${toolName} executed successfully`);
            return result;

        } catch (error) {
            this.logger.error(`Tool execution failed: ${error}`);
            throw error;
        }
    }

    /**
     * 获取可用工具列表
     */
    getAvailableTools(): Tool[] {
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
            this.logger.info(`📚 Learning from feedback: ${feedback.rating}/5 stars`);
            
            // 分析反馈模式
            const feedbackPatterns = this.analyzeFeedbackPatterns(feedback);
            
            // 调整策略
            const strategyAdjustments = this.generateStrategyAdjustmentsFromFeedback(feedback);
            
            // 更新知识库
            await this.updateKnowledgeBase(feedback, feedbackPatterns, strategyAdjustments);
            
            // 记住反馈
            this.remember(`feedback_${feedback.id}`, feedback, 0.7);
            
            this.logger.info(`📚 Learning completed from feedback ${feedback.id}`);

        } catch (error) {
            this.logger.error(`Learning from feedback failed: ${error}`);
        }
    }

    /**
     * 注册工具
     */
    registerTool(tool: Tool): void {
        this.tools.set(tool.name, tool);
        this.logger.info(`🔧 Registered tool: ${tool.name} (${tool.category})`);
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
        // 初始化基础知识和经验
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
        // 基于历史成功率调整信心度
        const successRate = this.performanceStats.totalRequests > 0 
            ? this.performanceStats.successfulRequests / this.performanceStats.totalRequests 
            : 0.7; // 默认信心度
        
        return Math.min(0.95, Math.max(0.1, baseConfidence * (0.5 + successRate * 0.5)));
    }

    private assessRisks(input: string, context: AgentContext, problemType: ProblemType): RiskAssessment {
        const riskFactors = [];
        let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
        
        // 基于问题类型评估风险
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
        
        // 时间因素
        const hour = new Date().getHours();
        if (hour < 9 || hour > 17) {
            factors.push('非工作时间，用户可能有紧急需求');
        }
        
        // 用户行为模式
        if (context.conversationHistory.length > 5) {
            factors.push('用户在此会话中高度活跃');
        }
        
        // 工作空间状态
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
            timestamp: new Date()
        };
    }

    // 这里继续实现其他私有方法...
    // 为了保持文件可读性，我会在后续消息中继续实现剩余方法

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

    private async executeToolWithTimeout(tool: Tool, input: any, timeout: number, context?: AgentContext): Promise<ToolResult> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Tool execution timeout after ${timeout}ms`));
            }, timeout);

            tool.execute(input, context)
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    private synthesizeExecutionResults(results: any[]): any {
        // 综合所有执行结果
        const successfulResults = results.filter(r => r.success);
        const data: any = {
            summary: `执行了${results.length}个步骤，${successfulResults.length}个成功`,
            results: successfulResults.map(r => r.result),
            executionTime: results.reduce((sum, r) => sum + (r.executionTime || 0), 0)
        };

        // 如果有文件读取结果，添加到数据中
        const fileReaderResults = successfulResults.filter(r => r.tool === 'scope_file_reader');
        if (fileReaderResults.length > 0) {
            // 修复：正确提取ToolResult.data字段中的实际数据
            data.fileData = fileReaderResults[0].result.data;
        }

        // 如果有性能分析结果，添加到数据中
        const performanceResults = successfulResults.filter(r => r.tool === 'scope_performance_analyzer');
        if (performanceResults.length > 0) {
            // 修复：正确提取ToolResult.data字段中的实际数据
            data.performanceAnalysis = performanceResults[0].result.data;
        }

        // 如果有代码优化结果，添加到数据中
        const optimizerResults = successfulResults.filter(r => r.tool === 'scope_code_optimizer');
        if (optimizerResults.length > 0) {
            // 修复：正确提取ToolResult.data字段中的实际数据
            const optimizerData = optimizerResults[0].result.data;
            // 将优化器的所有重要数据传递到最终结果中
            data.optimizations = optimizerData.optimizations || [];
            data.criticalIssues = optimizerData.criticalIssues || [];
            data.quickWins = optimizerData.quickWins || [];
            data.estimatedImprovement = optimizerData.estimatedImprovement;
            data.scriptAnalysis = optimizerData.scriptAnalysis;
            data.performanceBottlenecks = optimizerData.performanceBottlenecks;
        }

        // 如果有顶点分析结果，添加到数据中
        const vertexResults = successfulResults.filter(r => r.tool === 'scope_vertex_analyzer');
        if (vertexResults.length > 0) {
            // 修复：正确提取ToolResult.data字段中的实际数据
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
        
        // 检查是否有新格式的优化数据
        if (data.optimizations && Array.isArray(data.optimizations) && data.optimizations.length > 0) {
            // 处理专业优化建议
            const criticalIssues = data.criticalIssues || [];
            const quickWins = data.quickWins || [];
            
            this.logger.info(`Processing optimizations: ${data.optimizations.length} total, ${criticalIssues.length} critical, ${quickWins.length} quick wins`);
            
            // 关键性能问题
            if (criticalIssues.length > 0) {
                suggestions.push(`🚨 **发现${criticalIssues.length}个关键性能问题需要优先处理:**`);
                criticalIssues.slice(0, 3).forEach((issue: any) => {
                    const issueText = issue.title || issue.description || '未知问题';
                    suggestions.push(`   • ${issueText}`);
                    this.logger.debug(`Added critical issue: ${issueText}`);
                });
            }
            
            // 快速收益项
            if (quickWins.length > 0) {
                suggestions.push(`⚡ **${quickWins.length}个快速收益优化 (低实施难度，高回报):**`);
                quickWins.slice(0, 3).forEach((win: any) => {
                    const winTitle = win.title || win.description || '优化建议';
                    const improvement = win.estimatedImprovement || '提升明显';
                    suggestions.push(`   • ${winTitle}: 预期改进${improvement}`);
                    this.logger.debug(`Added quick win: ${winTitle}`);
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
                        this.logger.debug(`Added category optimization: ${optTitle}`);
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
            
            // 备用通用建议
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
        
        // 添加标题
        if (suggestion.title) {
            parts.push(`🔧 **${suggestion.title}**`);
        }
        
        // 添加描述
        if (suggestion.description) {
            parts.push(`   ${suggestion.description}`);
        }
        
        // 添加原始代码（如果存在）
        if (suggestion.originalCode) {
            parts.push(`   **原始代码:**`);
            parts.push(`   \`\`\`scope`);
            parts.push(`   ${suggestion.originalCode.replace(/\n/g, '\n   ')}`);
            parts.push(`   \`\`\``);
        }
        
        // 添加优化后代码（如果存在）
        if (suggestion.optimizedCode) {
            parts.push(`   **优化后代码:**`);
            parts.push(`   \`\`\`scope`);
            parts.push(`   ${suggestion.optimizedCode.replace(/\n/g, '\n   ')}`);
            parts.push(`   \`\`\``);
        }
        
        // 添加改进说明
        if (suggestion.improvement) {
            parts.push(`   **预期改进:** ${suggestion.improvement}`);
        }
        
        // 添加编译器提示（如果存在）
        if (suggestion.compilerHint) {
            parts.push(`   **编译器提示:** ${suggestion.compilerHint}`);
        }
        
        // 添加估计改进（如果存在）
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
        
        // 计算移动平均响应时间
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

    // 其他辅助方法的实现...
    
    private predictStepOutput(tool: string, input: any): any {
        // 基于工具类型预测输出
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
        // 简化实现：返回空数组，实际可以实现更复杂的关联逻辑
        return [];
    }

    private cleanupMemory(): void {
        // 删除最不重要且最久未访问的内存项
        const items = Array.from(this.memory.values())
            .sort((a, b) => (a.importance * a.accessCount) - (b.importance * b.accessCount))
            .slice(0, 100); // 删除最不重要的100个

        items.forEach(item => this.memory.delete(item.key));
        this.logger.info(`Cleaned up ${items.length} memory items`);
    }

    // 实现其他必需的私有方法...
    
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
        // 基于前面步骤的结果调整输入
        let adjustedInput = { ...step.input };

        // 获取文件读取步骤的结果，用于后续步骤
        const fileReaderResult = results.find(r => r.tool === 'scope_file_reader' && r.success);
        
        if (fileReaderResult && fileReaderResult.result.data) {
            const jobFolder = fileReaderResult.result.data.jobFolder;
            const fileContents = fileReaderResult.result.data.fileContents;
            
            // 为性能分析器提供统计文件路径
            if (step.tool === 'scope_performance_analyzer') {
                adjustedInput.statisticsFile = `${jobFolder}/__ScopeRuntimeStatistics__.xml`;
            }
            
            // 为顶点分析器提供顶点定义文件路径和性能数据
            if (step.tool === 'scope_vertex_analyzer') {
                adjustedInput.vertexDefFile = `${jobFolder}/ScopeVertexDef.xml`;
                
                // 如果有性能分析结果，传递给顶点分析器
                const performanceResult = results.find(r => r.tool === 'scope_performance_analyzer' && r.success);
                if (performanceResult) {
                    adjustedInput.performanceData = performanceResult.result.data;
                }
            }
            
            // 为代码优化器提供脚本内容和分析结果
            if (step.tool === 'scope_code_optimizer') {
                // 传递scope.script内容
                if (fileContents && fileContents['scope.script']) {
                    adjustedInput.scopeScript = fileContents['scope.script'];
                }
                
                // 合并所有分析结果
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

    // 实现学习相关的方法
    private enhanceReflectionWithExperience(reflection: any, result: AgentResult, context: AgentContext): any {
        // 基于历史经验增强反思结果
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
        return result.confidence * 0.8; // 学习的信心度基于结果信心度
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
        // 应用学习结果到Agent的行为中
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
        // 更新知识库
        this.baselineLearning.set(`feedback_pattern_${Date.now()}`, {
            patterns,
            adjustments,
            timestamp: new Date()
        });
    }

    private generateMitigationStrategies(riskFactors: string[]): string[] {
        return riskFactors.map(factor => `缓解${factor}的策略`);
    }
}

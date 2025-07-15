import * as vscode from 'vscode';
import { ScopeOptimizationAgent } from '../core/ScopeAgent';
import { AgentContext, WorkspaceState, UserPreferences, AgentFeedback } from '../types/AgentTypes';
import { ToolRegistry } from '../tools/AgentTools';
import { Logger } from '../functions/logger';

/**
 * AI Agent 演示和测试类
 * 展示如何使用新的 Agent 架构
 */
export class AgentDemo {
    private agent: ScopeOptimizationAgent;
    private toolRegistry: ToolRegistry;
    private logger: Logger;

    constructor() {
        this.logger = new Logger("Agent Demo");
        this.toolRegistry = new ToolRegistry(this.logger);
        this.agent = new ScopeOptimizationAgent(this.logger);
        
        // 注册工具到 Agent
        this.registerToolsToAgent();
    }

    /**
     * 演示完整的 Agent 工作流程
     */
    async demonstrateFullAgentCycle(userInput?: string): Promise<void> {
        this.logger.info("Starting Agent workflow demonstration");

        const input = userInput || "分析SCOPE脚本性能问题";
        const context = this.createDemoContext(input);

        try {
            await this.agent.initialize();
            
            this.logger.info("=== Agent Think Phase ===");
            const thought = await this.agent.think(input, context);
            
            this.logger.info("=== Agent Plan Phase ===");
            const plan = await this.agent.plan(thought, context);
            
            this.logger.info("=== Agent Execute Phase ===");
            const result = await this.agent.execute(plan, context);
            
            this.logger.info("=== Agent Reflect Phase ===");
            const learning = await this.agent.reflect(result, context);

            this.displayResults(input, thought, plan, result, learning);
        } catch (error) {
            this.logger.error(`Agent workflow demonstration failed: ${error}`);
        }
    }

    /**
     * 演示意图识别
     */
    async demonstrateIntentRecognition(): Promise<void> {
        this.logger.info("Demonstrating intent recognition");

        const testInputs = [
            "我的SCOPE脚本运行很慢",
            "如何优化JOIN操作",
            "检查内存使用问题"
        ];

        for (const input of testInputs) {
            const context = this.createDemoContext(input);
            try {
                await this.agent.initialize();
                const thought = await this.agent.think(input, context);
                this.logger.info(`Input: "${input}" -> Intent: "${thought.intent}" (${thought.confidence})`);
            } catch (error) {
                this.logger.error(`Intent recognition failed for "${input}": ${error}`);
            }
        }
    }

    /**
     * 演示工具系统
     */
    async demonstrateToolSystem(): Promise<void> {
        this.logger.info("Demonstrating tool system");

        const tools = this.toolRegistry.getAllTools();
        this.logger.info(`Available tools: ${tools.length}`);

        for (const tool of tools) {
            this.logger.info(`Tool: ${tool.name} - ${tool.description}`);
        }
    }

    /**
     * 演示学习能力
     */
    async demonstrateLearningCapability(): Promise<void> {
        this.logger.info("Demonstrating learning capability");

        const positiveFeedback: AgentFeedback = {
            id: "demo_feedback_1",
            userId: "demo_user",
            sessionId: "demo_session",
            rating: 5,
            comment: "很好的分析结果",
            suggestionHelpful: true,
            improvements: [],
            wouldRecommend: true,
            categories: ['accuracy', 'helpfulness'],
            specificIssues: [],
            timestamp: new Date()
        };

        try {
            await this.agent.learn(positiveFeedback);
            this.logger.info("Learning from positive feedback completed");
        } catch (error) {
            this.logger.error(`Learning demonstration failed: ${error}`);
        }
    }

    /**
     * 创建演示用的Agent上下文
     */
    private createDemoContext(userInput: string): AgentContext {
        const workspaceState: WorkspaceState = {
            activeFiles: [],
            recentAnalyses: [],
            lastOptimization: undefined,
            currentJobFolder: undefined,
            scopeFilesAvailable: false
        };

        const userPreferences: UserPreferences = {
            optimizationLevel: 'moderate',
            autoApplyFixes: false,
            preferredAnalysisDepth: 'detailed',
            language: 'zh',
            reportFormat: 'markdown'
        };

        return {
            userId: 'demo_user',
            sessionId: 'demo_session',
            conversationHistory: [],
            workspaceState,
            userPreferences,
            currentTask: userInput,
            timestamp: new Date(),
            availableTools: this.toolRegistry.getAllTools().map(tool => tool.name),
            memorySnapshot: {}
        };
    }

    /**
     * 显示演示结果
     */
    private displayResults(
        userInput: string,
        thought: any,
        plan: any,
        result: any,
        learning: any
    ): void {
        const message = `
## Agent Workflow Demo Results

**Input**: ${userInput}

**Thought**: ${thought.intent} (confidence: ${thought.confidence})

**Plan**: ${plan.steps.length} steps planned

**Result**: ${result.success ? 'Success' : 'Failed'}

**Learning**: ${learning.improvements.length} improvements identified
        `;

        vscode.window.showInformationMessage("Agent Demo Completed", { modal: false, detail: message });
    }

    /**
     * 注册工具到Agent
     */
    private registerToolsToAgent(): void {
        this.toolRegistry.getAllTools().forEach(tool => {
            this.agent.registerTool(tool);
        });
    }

    /**
     * 获取Agent实例
     */
    public getAgent(): ScopeOptimizationAgent {
        return this.agent;
    }

    /**
     * 获取工具注册器
     */
    public getToolRegistry(): ToolRegistry {
        return this.toolRegistry;
    }
}

/**
 * 课程演示类
 */
export class CourseDemo {
    /**
     * 生成演示脚本
     */
    static generateDemoScript(): string {
        return `
# SCOPE AI Agent 课程演示

这是一个完整的AI Agent系统演示，展示了现代AI Agent的核心能力。

## 演示内容
1. Think-Plan-Execute-Reflect 工作流
2. 智能工具调用
3. 学习和记忆机制
4. 风险评估和缓解

## 技术亮点
- 类型安全的TypeScript实现
- 模块化工具系统
- 智能语言模型集成
- 企业级错误处理
        `;
    }
}

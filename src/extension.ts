import * as vscode from 'vscode';
import * as os from 'os';
import { Logger } from './functions/logger';
import { ScopeOptimizationAgent } from './core/ScopeAgent';
import { ToolRegistry } from './tools/AgentTools';
import { AgentDemo } from './demo/AgentDemo';
import {
    AgentContext,
    ConversationMessage,
    WorkspaceState,
    UserPreferences
} from './types/AgentTypes';

// 全局变量
const username = os.userInfo().username;
const tempPath = `C:\\Users\\${username}\\AppData\\Local\\Temp\\DataLakeTemp`;

/**
 * SCOPE AI Agent扩展激活函数
 */
export function activate(context: vscode.ExtensionContext) {
    const logger = new Logger("SCOPE AI Agent");
    logger.info("🚀 SCOPE AI Agent Extension activated");

    // 初始化核心组件
    const scopeAgent = new ScopeOptimizationAgent(logger);
    const toolRegistry = new ToolRegistry(logger);
    const agentDemo = new AgentDemo();

    // 注册工具到Agent
    toolRegistry.getAllTools().forEach(tool => {
        scopeAgent.registerTool(tool);
    });

    // 对话历史管理
    const conversationHistory: ConversationMessage[] = [];

    /**
     * 创建Agent上下文
     */
    function createAgentContext(userInput: string): AgentContext {
        const workspaceState: WorkspaceState = {
            activeFiles: vscode.workspace.textDocuments.map(doc => doc.fileName),
            recentAnalyses: [],
            lastOptimization: undefined,
            currentJobFolder: undefined,
            scopeFilesAvailable: checkScopeFilesAvailable()
        };

        const userPreferences: UserPreferences = {
            optimizationLevel: 'moderate',
            autoApplyFixes: false,
            preferredAnalysisDepth: 'detailed',
            language: 'zh',
            reportFormat: 'markdown'
        };

        return {
            userId: 'vscode-user',
            sessionId: `session_${Date.now()}`,
            conversationHistory: [...conversationHistory],
            workspaceState,
            userPreferences,
            currentTask: userInput,
            timestamp: new Date(),
            availableTools: toolRegistry.getAllTools().map(tool => tool.name),
            memorySnapshot: {}
        };
    }

    /**
     * 检查SCOPE文件是否可用
     */
    function checkScopeFilesAvailable(): boolean {
        try {
            const fs = require('fs');
            if (!fs.existsSync(tempPath)) return false;
            
            const items = fs.readdirSync(tempPath, { withFileTypes: true });
            return items.some((item: any) => 
                item.isDirectory() && item.name.toLowerCase().includes('cosmos')
            );
        } catch (error) {
            logger.warn(`Failed to check SCOPE files: ${error}`);
            return false;
        }
    }

    /**
     * 添加对话消息到历史
     */
    function addToConversationHistory(role: 'user' | 'agent', content: string, metadata?: any) {
        const message: ConversationMessage = {
            role,
            content,
            timestamp: new Date(),
            metadata
        };
        
        conversationHistory.push(message);
        
        // 保持历史记录在合理范围内
        if (conversationHistory.length > 20) {
            conversationHistory.splice(0, conversationHistory.length - 20);
        }
    }

    /**
     * 检查语言模型可用性
     */
    async function checkLanguageModelAvailability(): Promise<boolean> {
        try {
            const availableModels = await vscode.lm.selectChatModels();
            logger.info(`Available language models: ${availableModels.length}`);
            
            if (availableModels.length === 0) {
                logger.warn("No language models available");
                return false;
            }
            
            availableModels.forEach((model, index) => {
                logger.info(`Model ${index}: ${model.id}, family: ${model.family}`);
            });
            
            return true;
        } catch (error) {
            logger.error(`Error checking available models: ${error}`);
            return false;
        }
    }

    /**
     * 显示语言模型不可用错误
     */
    function showLanguageModelError(response: vscode.ChatResponseStream) {
        response.markdown("❌ **语言模型不可用**\n\n" +
            "此扩展需要GitHub Copilot或VS Code语言模型API访问权限。\n\n" +
            "**请检查：**\n" +
            "1. GitHub Copilot扩展已安装并登录\n" +
            "2. 您有活跃的GitHub Copilot订阅\n" +
            "3. VS Code语言模型API已启用\n\n" +
            "**解决方法：**\n" +
            "- 从VS Code市场安装GitHub Copilot扩展\n" +
            "- 使用有Copilot访问权限的GitHub账号登录\n" +
            "- 如需要，重启VS Code");
    }

    /**
     * 获取可用的Cosmos Job文件夹
     */
    async function getCosmosJobFolders(): Promise<string[]> {
        try {
            const fs = require('fs');
            if (!fs.existsSync(tempPath)) return [];
            
            const items = (await fs.promises.readdir(tempPath, { withFileTypes: true }))
                .filter((dirent: any) => dirent.isDirectory())
                .map((dirent: any) => dirent.name);
            
            return items.filter((item: string) => {
                const fullPath = require('path').join(tempPath, item);
                return item.toLowerCase().includes('cosmos') && fs.statSync(fullPath).isDirectory();
            }).sort((a: string, b: string) => {
                // 按文件夹创建时间排序，最新的在前
                const statA = fs.statSync(require('path').join(tempPath, a));
                const statB = fs.statSync(require('path').join(tempPath, b));
                return statB.birthtimeMs - statA.birthtimeMs;
            });
        } catch (error) {
            logger.error(`Error reading temp directory: ${error}`);
            return [];
        }
    }

    /**
     * 让用户选择要分析的Job
     */
    async function selectJobFolder(): Promise<string | null> {
        const jobFolders = await getCosmosJobFolders();
        
        if (jobFolders.length === 0) {
            vscode.window.showErrorMessage('未找到Cosmos job文件夹。请确认SCOPE作业已执行并生成了临时文件。');
            return null;
        }

        const quickPickItems = jobFolders.map(folder => ({
            description: `Job ID: ${folder.match(/\[.*?\]\s*(.+)/)?.[1]?.trim() || folder}`,
            label: folder,
            detail: `路径: ${require('path').join(tempPath, folder)}`
        }));

        const selectedJob = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: '请选择要分析的 Cosmos Job',
            title: 'SCOPE 性能分析 - 选择作业'
        });

        return selectedJob ? require('path').join(tempPath, selectedJob.label) : null;
    }

	/**
	 * 判断用户查询是否与性能优化相关
	 * @param query 用户查询
	 * @param token 取消令牌
	 * @returns 是否与性能优化相关
	 */
	async function isOptimizationRelatedQuery(query: string, token: vscode.CancellationToken): Promise<boolean> {
		//Try to get smaller/faster models for intent detection to avoid wasting big model resources
		const chatModels = await vscode.lm.selectChatModels({family: 'gpt-4o'});
		if (!chatModels || chatModels.length === 0) {
			logger.warn("No chat models available, falling back to keyword matching");
			// back to the key words matching
			return query.toLowerCase().includes('job') || 
				query.toLowerCase().includes('optimize') || 
				query.toLowerCase().includes('performance') ||
				query.toLowerCase().includes('slow') ||
				query.toLowerCase().includes('bottleneck') ||
				query.toLowerCase().includes('problem') || 
				query.toLowerCase().includes('优化') || 
				query.toLowerCase().includes('性能');
		}
		
		// build a prompt
		const intent_prompt = `Determine if the following query is about SCOPE script performance optimization, code optimization, 
	performance improvements, or addressing bottlenecks. Respond with ONLY "YES" if it's related to optimization or performance, 
	or "NO" if it's a general question about SCOPE syntax, functionality, or other non-performance topics.
	
	User Query: "${query}"
	
	Is this query about performance optimization? (YES/NO):`;
	
		try {
			const messages = [
				vscode.LanguageModelChatMessage.User(intent_prompt)
			];
			
			// send request
			const response = await chatModels[0].sendRequest(messages, undefined, token);
			let responseText = "";
			for await (const chunk of response.text) {
				responseText += chunk;
			}
			
			// return Yes Or No
			const cleanResponse = responseText.trim().toUpperCase();
			const isOptimization = cleanResponse.includes('YES');
			logger.info(`Intent classification for query: "${query}" -> ${isOptimization ? "Optimization" : "General"}`);
			
			return isOptimization;
		} catch (error) {
			logger.error(`Error classifying query intent: ${error}`);
			// back to the key words matching when error
			return query.toLowerCase().includes('job') || 
				query.toLowerCase().includes('optimize') || 
				query.toLowerCase().includes('performance') ||
				query.toLowerCase().includes('slow') ||
				query.toLowerCase().includes('bottleneck') ||
				query.toLowerCase().includes('problem');
		}
	}

    /**
     * 执行完整的AI Agent工作流
     */
    async function runAgentWorkflow(userInput: string, context: AgentContext, response: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<void> {
        try {
            // 初始化Agent
            const initialized = await scopeAgent.initialize();
            if (!initialized) {
                response.markdown("❌ **Agent初始化失败**\n\n请检查语言模型配置。");
                return;
            }

            response.markdown("🤖 **AI Agent开始工作...**\n\n");

            // 如果涉及性能分析，让用户选择job
            const isPerformanceQuery = await isOptimizationRelatedQuery(userInput, token);
            
            let selectedJobFolder: string | null = null;
            if (isPerformanceQuery) {
                response.markdown("📁 **选择分析目标**\n\n正在检查可用的SCOPE作业文件夹...\n");
                selectedJobFolder = await selectJobFolder();
                
                if (!selectedJobFolder) {
                    response.markdown("❌ **未选择作业**\n\n分析已取消。请确保有SCOPE作业文件可供分析。");
                    return;
                }
                
                response.markdown(`✅ **已选择作业**: ${require('path').basename(selectedJobFolder)}\n\n`);
                
                // 更新context中的工作空间状态
                context.workspaceState.currentJobFolder = selectedJobFolder;
                context.workspaceState.scopeFilesAvailable = true;
            }

            // 步骤1: 思考
            response.markdown("🧠 **思考阶段** - 分析您的需求...\n");
            const thought = await scopeAgent.think(userInput, context);
            
            response.markdown(`✅ **意图理解**: ${thought.intent}\n`);
            response.markdown(`📊 **信心度**: ${(thought.confidence * 100).toFixed(1)}%\n`);
            response.markdown(`🎯 **问题类型**: ${thought.problemType}\n\n`);

            // 步骤2: 规划
            response.markdown("📋 **规划阶段** - 制定执行计划...\n");
            const plan = await scopeAgent.plan(thought, context);
            
            response.markdown(`📝 **执行计划**: ${plan.steps.length}个步骤\n`);
            response.markdown(`⏱️ **预估时间**: ${plan.estimatedTime}ms\n`);
            response.markdown(`🔧 **所需工具**: ${plan.steps.map(s => s.tool).join(', ')}\n\n`);

            // 步骤3: 执行
            response.markdown("⚡ **执行阶段** - 调用工具完成任务...\n");
            
            for (let i = 0; i < plan.steps.length; i++) {
                const step = plan.steps[i];
                response.markdown(`🔧 执行步骤 ${i + 1}/${plan.steps.length}: ${step.description}\n`);
                
                // 这里可以添加进度更新
                if (token.isCancellationRequested) {
                    response.markdown("⚠️ **操作已取消**\n");
                    return;
                }
            }
            
            const result = await scopeAgent.execute(plan, context);
            
            if (result.success) {
                response.markdown(`✅ **执行成功**\n`);
                response.markdown(`⏱️ **实际耗时**: ${result.executionTime}ms\n`);
                response.markdown(`📊 **结果信心度**: ${(result.confidence * 100).toFixed(1)}%\n\n`);
                
                // 显示结果
                response.markdown("## 📊 分析结果\n\n");
                response.markdown(result.explanation + "\n\n");
                
                if (result.suggestions && result.suggestions.length > 0) {
                    response.markdown("## 💡 优化建议\n\n");
                    result.suggestions.forEach((suggestion, index) => {
                        response.markdown(`${index + 1}. ${suggestion}\n`);
                    });
                    response.markdown("\n");
                }
                
                if (result.nextSteps && result.nextSteps.length > 0) {
                    response.markdown("## 🔜 建议后续步骤\n\n");
                    result.nextSteps.forEach((step, index) => {
                        response.markdown(`${index + 1}. ${step}\n`);
                    });
                    response.markdown("\n");
                }
            } else {
                response.markdown(`❌ **执行失败**: ${result.explanation}\n\n`);
                
                if (result.errors && result.errors.length > 0) {
                    response.markdown("**错误详情:**\n");
                    result.errors.forEach(error => {
                        response.markdown(`- ${error.message}\n`);
                    });
                }
            }

            // 分析完成

            // 记录对话
            addToConversationHistory('user', userInput);
            addToConversationHistory('agent', result.explanation, {
                confidence: result.confidence,
                toolsUsed: result.toolsUsed,
                executionTime: result.executionTime
            });

        } catch (error) {
            logger.error(`Agent workflow failed: ${error}`);
            response.markdown(`❌ **AI Agent执行出错**: ${error instanceof Error ? error.message : String(error)}\n\n`);
            response.markdown("请尝试简化您的请求或联系技术支持。");
        }
    }

    // ========== Chat Participant ==========

    /**
     * 注册聊天参与者
     */
    const chatParticipant = vscode.chat.createChatParticipant("scope-ai-agent", async (request, context, response, token) => {
        const userQuery = request.prompt.trim();
        logger.info(`🗣️ Received user query: "${userQuery}"`);

        try {
            // 检查语言模型可用性
            const isModelAvailable = await checkLanguageModelAvailability();
            if (!isModelAvailable) {
                showLanguageModelError(response);
                return;
            }

            // 创建Agent上下文
            const agentContext = createAgentContext(userQuery);

            // 执行AI Agent工作流
            await runAgentWorkflow(userQuery, agentContext, response, token);

        } catch (error) {
            logger.error(`Chat participant error: ${error}`);
            response.markdown(`❌ **处理请求时出错**: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    // ========== 演示命令 ==========

    // 完整Agent周期演示
    const demoFullCycleCommand = vscode.commands.registerCommand('scope-ai-agent.demo.fullCycle', async () => {
        await agentDemo.demonstrateFullAgentCycle();
        vscode.window.showInformationMessage('AI Agent完整周期演示完成');
    });

    // 意图识别演示
    const demoIntentCommand = vscode.commands.registerCommand('scope-ai-agent.demo.intentRecognition', async () => {
        await agentDemo.demonstrateIntentRecognition();
        vscode.window.showInformationMessage('意图识别演示完成');
    });

    // 工具系统演示
    const demoToolsCommand = vscode.commands.registerCommand('scope-ai-agent.demo.toolSystem', async () => {
        await agentDemo.demonstrateToolSystem();
        vscode.window.showInformationMessage('工具系统演示完成');
    });

    // 学习能力演示
    const demoLearningCommand = vscode.commands.registerCommand('scope-ai-agent.demo.learning', async () => {
        await agentDemo.demonstrateLearningCapability();
        vscode.window.showInformationMessage('学习能力演示完成');
    });

    // Agent架构信息
    const showArchitectureCommand = vscode.commands.registerCommand('scope-ai-agent.info.architecture', () => {
        const info = `
## SCOPE AI Agent 架构信息

**Agent ID**: ${scopeAgent.id}
**Agent名称**: ${scopeAgent.name}
**版本**: v2.0

### 核心能力
${scopeAgent.capabilities.map(cap => `- ${cap}`).join('\n')}

### 已注册工具
${toolRegistry.getAllTools().map(tool => `- ${tool.name} (${tool.category})`).join('\n')}

### 性能统计
${JSON.stringify(scopeAgent.getPerformanceStats(), null, 2)}
        `;

        vscode.window.showInformationMessage(info, { modal: true });
    });

    // Agent能力信息
    const showCapabilitiesCommand = vscode.commands.registerCommand('scope-ai-agent.info.capabilities', () => {
        const capabilities = scopeAgent.capabilities.join('\n• ');
        vscode.window.showInformationMessage(`SCOPE AI Agent 能力:\n\n• ${capabilities}`, { modal: true });
    });

    // 可用工具信息
    const showToolsCommand = vscode.commands.registerCommand('scope-ai-agent.info.tools', () => {
        const tools = toolRegistry.getAllTools()
            .map(tool => `• ${tool.name}: ${tool.description}`)
            .join('\n');
        vscode.window.showInformationMessage(`可用工具:\n\n${tools}`, { modal: true });
    });

    // 分析SCOPE脚本命令（传统兼容性）
    const analyzeScriptCommand = vscode.commands.registerCommand('scope-opt-agent.analyzeScript', async () => {
        const agentContext = createAgentContext('分析当前SCOPE脚本的性能');
        
        try {
            const initialized = await scopeAgent.initialize();
            if (!initialized) {
                vscode.window.showErrorMessage('Agent初始化失败，请检查语言模型配置');
                return;
            }

            vscode.window.showInformationMessage('AI Agent正在分析SCOPE脚本...');
            
            const thought = await scopeAgent.think('分析SCOPE脚本性能', agentContext);
            const plan = await scopeAgent.plan(thought, agentContext);
            const result = await scopeAgent.execute(plan, agentContext);
            
            if (result.success) {
                vscode.window.showInformationMessage(`分析完成！发现了${result.suggestions?.length || 0}个优化建议`);
            } else {
                vscode.window.showErrorMessage(`分析失败: ${result.explanation}`);
            }
        } catch (error) {
            logger.error(`Analyze script command failed: ${error}`);
            vscode.window.showErrorMessage(`分析脚本时出错: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    // ========== 注册所有命令和组件 ==========

    context.subscriptions.push(
        chatParticipant,
        demoFullCycleCommand,
        demoIntentCommand,
        demoToolsCommand,
        demoLearningCommand,
        showArchitectureCommand,
        showCapabilitiesCommand,
        showToolsCommand,
        analyzeScriptCommand
    );

    logger.info(`🎉 SCOPE AI Agent Extension fully activated with ${toolRegistry.getAllTools().length} tools`);
}

/**
 * 扩展停用函数
 */
export function deactivate() {
    // 清理资源
    console.log('SCOPE AI Agent Extension deactivated');
}
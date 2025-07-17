import * as vscode from 'vscode';
import * as os from 'os';
import { Logger } from './functions/logger';
import { ScopeIntelligentAgent } from './agent/ScopeIntelligentAgent';
import { ToolRegistry } from './framework/tools/ToolRegistry';
import { ToolLoader, initializeGlobalToolLoader } from './framework/tools/ToolLoader';
import {
    AgentContext,
    ConversationMessage,
    WorkspaceState,
    UserPreferences
} from './types/AgentTypes';

// 全局变量
const username = os.userInfo().username;
const tempPath = `C:\\Users\\${username}\\AppData\\Local\\Temp\\DataLakeTemp`;

// 全局语言模型缓存
let globalLanguageModels: vscode.LanguageModelChat[] = [];

/**
 * SCOPE AI Agent扩展激活函数
 */
export async function activate(context: vscode.ExtensionContext) {
    const logger = new Logger("SCOPE AI Agent");
    logger.info("🚀 SCOPE AI Agent Extension activated");

    // 初始化核心组件
    const toolRegistry = new ToolRegistry(logger);

    // 简单预加载语言模型，避免首次使用延迟
    logger.info('🤖 预加载语言模型...');
    try {
        globalLanguageModels = await vscode.lm.selectChatModels();
        if (globalLanguageModels.length > 0) {
            logger.info(`✅ 预加载成功，发现 ${globalLanguageModels.length} 个模型`);
        } else {
            logger.warn('⚠️ 未发现可用模型，将在需要时重试');
        }
    } catch (error) {
        logger.error(`❌ 预加载语言模型失败: ${error}`);
        // 不阻止扩展继续加载
    }

    // 初始化工具加载器并加载所有工具
    let toolLoader: ToolLoader;
    try {
        toolLoader = await initializeGlobalToolLoader(logger, toolRegistry);
        logger.info(`✅ 工具加载器初始化成功，已加载 ${toolLoader.getLoadStatus().toolsLoaded} 个工具`);
    } catch (error) {
        logger.error(`❌ 工具加载器初始化失败: ${error}`);
        vscode.window.showErrorMessage(`工具加载器初始化失败: ${error}`);
        return;
    }

    // 创建智能Agent
    const scopeAgent = new ScopeIntelligentAgent(logger, toolRegistry);
    
    // 初始化Agent
    const agentInitialized = await scopeAgent.initialize();
    if (!agentInitialized) {
        logger.error('❌ AI Agent初始化失败');
        vscode.window.showErrorMessage('AI Agent初始化失败');
        return;
    }
    
    logger.info(`✅ AI Agent已成功初始化`);

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
            // 如果已经有缓存的模型，直接返回
            if (globalLanguageModels.length > 0) {
                logger.info(`✅ 语言模型可用: ${globalLanguageModels.length} 个模型`);
                return true;
            }
            
            // 尝试重新获取模型，增加重试机制
            for (let i = 0; i < 3; i++) {
                try {
                    globalLanguageModels = await vscode.lm.selectChatModels();
                    if (globalLanguageModels.length > 0) {
                        logger.info(`✅ 重试成功，发现 ${globalLanguageModels.length} 个模型`);
                        return true;
                    }
                } catch (error) {
                    logger.warn(`重试 ${i + 1}/3 失败: ${error}`);
                    if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            logger.error("❌ 重试后仍无法获取语言模型");
            return false;
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
		// 尝试获取gpt-4o模型用于意图检测
		const gpt4oModels = globalLanguageModels.filter(m => m.family === 'gpt-4o');
		const chatModel = gpt4oModels.length > 0 ? gpt4oModels[0] : globalLanguageModels[0];
		
		if (!chatModel) {
			logger.warn("No chat models available, falling back to keyword matching");
			// 回退到关键词匹配
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
		const response = await chatModel.sendRequest(messages, undefined, token);
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
     * 执行真正的AI Agent工作流
     */
    async function runAgentWorkflow(userInput: string, context: AgentContext, response: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<void> {
        try {
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
                
                // 设置Agent的当前作业文件夹
                scopeAgent.setCurrentJobFolder(selectedJobFolder);
                
                // 更新context中的工作空间状态
                context.workspaceState.currentJobFolder = selectedJobFolder;
                context.workspaceState.scopeFilesAvailable = true;
            }

            // 使用AI Agent进行智能分析
            response.markdown("🧠 **AI Agent智能分析**\n\n");
            
            const sessionId = context.sessionId || 'default';
            const analysisResult = await scopeAgent.processQuery(userInput, sessionId);
            
            response.markdown("## 📊 分析结果\n\n");
            response.markdown(analysisResult + "\n\n");

            // 记录对话
            addToConversationHistory('user', userInput);
            addToConversationHistory('agent', analysisResult);

        } catch (error) {
            logger.error(`Agent workflow failed: ${error}`);
            response.markdown(`❌ **AI Agent执行出错**: ${error instanceof Error ? error.message : String(error)}\n\n`);
            response.markdown("请尝试简化您的请求或联系技术支持。");
        }
    }

    // 旧的分析函数已被AI Agent取代，这里保留一个简化版本作为备用
    // AI Agent现在会自主决定调用哪些工具和如何分析

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



    // 可用工具信息
    const showToolsCommand = vscode.commands.registerCommand('scope-ai-agent.info.tools', () => {
        const tools = toolRegistry.getAllTools()
            .map(tool => `• ${tool.name}: ${tool.description}`)
            .join('\n');
        vscode.window.showInformationMessage(`可用工具:\n\n${tools}`, { modal: true });
    });

    // 刷新语言模型缓存命令
    const refreshModelsCommand = vscode.commands.registerCommand('scope-ai-agent.refresh.models', async () => {
        try {
            vscode.window.showInformationMessage('🔄 正在刷新语言模型缓存...');
            
            globalLanguageModels = await vscode.lm.selectChatModels();
            
            if (globalLanguageModels.length > 0) {
                vscode.window.showInformationMessage(
                    `✅ 语言模型缓存刷新成功！发现 ${globalLanguageModels.length} 个模型`, 
                    { modal: true }
                );
                logger.info(`✅ 手动刷新模型缓存成功: ${globalLanguageModels.length} 个模型`);
            } else {
                vscode.window.showErrorMessage('❌ 语言模型缓存刷新失败，请检查Copilot连接状态');
                logger.error('❌ 手动刷新模型缓存失败');
            }
        } catch (error) {
            const errorMessage = `刷新语言模型缓存时出错: ${error instanceof Error ? error.message : String(error)}`;
            vscode.window.showErrorMessage(errorMessage);
            logger.error(`❌ 手动刷新模型缓存出错: ${error}`);
        }
    });



    // 分析SCOPE脚本命令（传统兼容性）
    const analyzeScriptCommand = vscode.commands.registerCommand('scope-opt-agent.analyzeScript', async () => {
        try {
            vscode.window.showInformationMessage('AI Agent正在分析SCOPE脚本...');
            
            const result = await scopeAgent.processQuery('分析当前SCOPE脚本的性能', 'command_session');
            
            if (result.includes('❌')) {
                vscode.window.showErrorMessage(`分析失败: ${result}`);
            } else {
                vscode.window.showInformationMessage('分析完成！请查看Chat面板获取详细结果');
            }
        } catch (error) {
            logger.error(`Analyze script command failed: ${error}`);
            vscode.window.showErrorMessage(`分析脚本时出错: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    // ========== 注册所有命令和组件 ==========

    context.subscriptions.push(
        chatParticipant,
        showToolsCommand,
        refreshModelsCommand,
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
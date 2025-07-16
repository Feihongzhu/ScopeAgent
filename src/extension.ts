import * as vscode from 'vscode';
import * as os from 'os';
import { Logger } from './functions/logger';
import { ScopeOptimizationAgent } from './core/ScopeAgent';
import { ToolRegistry } from './framework/tools/ToolRegistry';
import { ToolLoader, initializeGlobalToolLoader } from './framework/tools/ToolLoader';
import { ToolAdapter } from './framework/tools/ToolAdapter';
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
export async function activate(context: vscode.ExtensionContext) {
    const logger = new Logger("SCOPE AI Agent");
    logger.info("🚀 SCOPE AI Agent Extension activated");

    // 初始化核心组件
    const scopeAgent = new ScopeOptimizationAgent(logger);
    const toolRegistry = new ToolRegistry(logger);
    const agentDemo = new AgentDemo();

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

    // 创建工具适配器并注册到Agent
    const toolAdapter = new ToolAdapter(logger);
    const availableTools = toolRegistry.getAllTools();
    
    availableTools.forEach(analysisTool => {
        const adaptedTool = toolAdapter.adaptTool(analysisTool);
        scopeAgent.registerTool(adaptedTool as any);
    });
    
    logger.info(`✅ 已注册 ${availableTools.length} 个工具到Agent`);

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

            // 使用完整的AI Agent工作流程（包含证据收集系统）
            response.markdown("🧠 **AI思考阶段** - 分析用户意图和收集运行证据...\n");
            
            // 初始化Agent
            const initialized = await scopeAgent.initialize();
            if (!initialized) {
                response.markdown("❌ **Agent初始化失败**\n\n请检查语言模型配置。");
                return;
            }
            
            // 执行完整的Agent工作流程
            const thought = await scopeAgent.think(userInput, context);
            response.markdown(`✅ **思考完成** - 意图: ${thought.intent} (置信度: ${thought.confidence.toFixed(2)})\n\n`);
            
            response.markdown("📋 **AI规划阶段** - 制定执行计划...\n");
            const plan = await scopeAgent.plan(thought, context);
            response.markdown(`✅ **规划完成** - 计划包含${plan.steps.length}个步骤\n\n`);
            
            response.markdown("⚡ **AI执行阶段** - 智能调用工具链...\n");
            const result = await scopeAgent.execute(plan, context);
            
            if (result.success) {
                response.markdown(`✅ **执行成功** (置信度: ${result.confidence.toFixed(2)})\n\n`);
                response.markdown("## 📊 分析结果\n\n");
                response.markdown(result.explanation + "\n\n");
                
                if (result.suggestions && result.suggestions.length > 0) {
                    response.markdown("## 💡 优化建议\n\n");
                    result.suggestions.forEach((suggestion, index) => {
                        response.markdown(`${suggestion}\n\n`);
                    });
                }
                
                // 显示性能指标
                if (result.metrics) {
                    response.markdown("## 📈 性能指标\n\n");
                    response.markdown(`- 执行时间: ${result.metrics.executionTime}ms\n`);
                    response.markdown(`- 成功率: ${(result.metrics.successRate * 100).toFixed(1)}%\n`);
                    response.markdown(`- 使用工具: ${result.metrics.toolsUsed}个\n\n`);
                }
                
                // 显示下一步建议
                if (result.nextSteps && result.nextSteps.length > 0) {
                    response.markdown("## 🎯 下一步建议\n\n");
                    result.nextSteps.forEach((step, index) => {
                        response.markdown(`${index + 1}. ${step}\n`);
                    });
                    response.markdown("\n");
                }
            } else {
                response.markdown(`❌ **执行失败**: ${result.explanation}\n\n`);
                if (result.errors && result.errors.length > 0) {
                    response.markdown("### 错误详情\n\n");
                    result.errors.forEach((error, index) => {
                        response.markdown(`${index + 1}. ${error.message}\n`);
                    });
                }
            }
            
            // 执行反思学习
            response.markdown("🤔 **AI反思阶段** - 学习和改进...\n");
            const learning = await scopeAgent.reflect(result, context);
            response.markdown(`✅ **反思完成** - 识别了${learning.improvements.length}个改进点\n\n`);

            // 记录对话
            addToConversationHistory('user', userInput);
            addToConversationHistory('agent', result.explanation);

        } catch (error) {
            logger.error(`Agent workflow failed: ${error}`);
            response.markdown(`❌ **AI Agent执行出错**: ${error instanceof Error ? error.message : String(error)}\n\n`);
            response.markdown("请尝试简化您的请求或联系技术支持。");
        }
    }

    /**
     * 执行简化的分析流程
     */
    async function executeSimpleAnalysis(jobFolder: string | null, userInput: string, response: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<{success: boolean, explanation: string, suggestions?: string[]}> {
        if (!jobFolder) {
            return {
                success: false,
                explanation: "未选择作业文件夹，无法进行分析"
            };
        }

        try {
            const fs = require('fs');
            const path = require('path');
            
            // 发现文件
            response.markdown("🔍 **发现文件**\n");
            const files = fs.readdirSync(jobFolder);
            const foundFiles = {
                scopeScript: files.find((f: string) => f.toLowerCase() === 'scope.script'),
                vertexDef: files.find((f: string) => f.toLowerCase() === 'scopevertexdef.xml'),
                runtimeStats: files.find((f: string) => f.toLowerCase() === '__scoperuntimestatistics__.xml'),
                jobStats: files.find((f: string) => f.toLowerCase() === 'jobstatistics.xml'),
                codeGen: files.find((f: string) => f.toLowerCase() === '__scopecodegen__.dll.cs'),
                errorLog: files.find((f: string) => f.toLowerCase() === 'error')
            };

            response.markdown(`- 发现 ${Object.values(foundFiles).filter(f => f).length} 个相关文件\n`);

            // 使用工具分析文件
            const results: any = {};
            
            // 1. 分析顶点定义
            if (foundFiles.vertexDef) {
                response.markdown("🔧 **分析顶点定义**\n");
                const result = await toolRegistry.executeTool('extractVertex', {
                    filePath: path.join(jobFolder, foundFiles.vertexDef),
                    fileType: 'VERTEX_DEFINITION',
                    analysisGoal: 'performance_analysis'
                });
                if (result.success) {
                    results.vertexAnalysis = result.data;
                    response.markdown(`- 发现 ${result.data.vertices?.length || 0} 个顶点\n`);
                }
            }

            // 2. 分析运行时统计
            if (foundFiles.runtimeStats) {
                response.markdown("🔧 **分析运行时统计**\n");
                const result = await toolRegistry.executeTool('extractRuntime2', {
                    filePath: path.join(jobFolder, foundFiles.runtimeStats),
                    fileType: 'RUNTIME_STATS',
                    analysisGoal: 'performance_analysis'
                });
                if (result.success) {
                    results.runtimeStats = result.data;
                    response.markdown(`- 运行时统计分析完成\n`);
                }
            }

            // 3. 读取SCOPE脚本
            if (foundFiles.scopeScript) {
                response.markdown("🔧 **读取SCOPE脚本**\n");
                const result = await toolRegistry.executeTool('scopeScriptReader', {
                    filePath: path.join(jobFolder, foundFiles.scopeScript),
                    fileType: 'SCOPE_SCRIPT',
                    analysisGoal: 'performance_analysis'
                });
                if (result.success) {
                    results.scriptAnalysis = result.data;
                    response.markdown(`- SCOPE脚本分析完成\n`);
                }
            }

            // 4. 分析错误日志
            if (foundFiles.errorLog) {
                response.markdown("🔧 **分析错误日志**\n");
                const result = await toolRegistry.executeTool('errorLogReader', {
                    filePath: path.join(jobFolder, foundFiles.errorLog),
                    fileType: 'ERROR_INFO',
                    analysisGoal: 'error_analysis'
                });
                if (result.success) {
                    results.errorAnalysis = result.data;
                    response.markdown(`- 错误日志分析完成\n`);
                }
            }

            // 生成综合分析结果
            const analysis = generateAnalysisReport(results, userInput);
            
            return {
                success: true,
                explanation: analysis.explanation,
                suggestions: analysis.suggestions
            };

        } catch (error) {
            logger.error(`Simple analysis failed: ${error}`);
            return {
                success: false,
                explanation: `分析过程出错: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * 生成分析报告
     */
    function generateAnalysisReport(results: any, userInput: string): {explanation: string, suggestions: string[]} {
        let explanation = "📊 **SCOPE作业分析报告**\n\n";
        const suggestions: string[] = [];

        // 顶点分析
        if (results.vertexAnalysis) {
            const vertexCount = results.vertexAnalysis.vertices?.length || 0;
            explanation += `🔹 **顶点分析**: 发现 ${vertexCount} 个计算顶点\n`;
            
            if (vertexCount > 10) {
                suggestions.push("作业包含较多计算顶点，建议检查是否可以合并相关操作以减少复杂度");
            }
        }

        // 运行时统计分析
        if (results.runtimeStats) {
            explanation += `🔹 **运行时统计**: 已分析执行性能数据\n`;
            suggestions.push("建议关注执行时间较长的顶点，可能存在性能瓶颈");
        }

        // 脚本分析
        if (results.scriptAnalysis) {
            explanation += `🔹 **脚本分析**: 已分析SCOPE脚本结构\n`;
            suggestions.push("建议检查脚本中的JOIN操作和聚合操作的效率");
        }

        // 错误分析
        if (results.errorAnalysis) {
            explanation += `🔹 **错误分析**: 发现作业执行错误\n`;
            suggestions.push("建议优先解决错误日志中的问题");
            
            if (results.errorAnalysis.errors && results.errorAnalysis.errors.length > 0) {
                explanation += `  - 错误类型: ${results.errorAnalysis.errors[0].category || '未知'}\n`;
            }
        }

        // 通用建议
        if (suggestions.length === 0) {
            suggestions.push("基于当前分析，建议关注数据处理效率和资源使用情况");
            suggestions.push("可以考虑优化JOIN操作和数据分区策略");
        }

        return { explanation, suggestions };
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
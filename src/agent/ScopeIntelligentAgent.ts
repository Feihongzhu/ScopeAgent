import * as vscode from 'vscode';
import { Logger } from '../functions/logger';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
// import { Tool } from '@langchain/core/tools';
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ToolRegistry } from '../framework/tools/ToolRegistry';

/**
 * 真正的AI Agent - 基于LangChain.js的自主决策系统
 */
export class ScopeIntelligentAgent {
    private llm: any;
    private agent: any;
    private memory: MemorySaver;
    private logger: Logger;
    private toolRegistry: ToolRegistry;
    private tools: any[] = [];
    private currentJobFolder: string | null = null;
    private analysisContext: Map<string, any> = new Map();

    constructor(logger: Logger, toolRegistry: ToolRegistry) {
        this.logger = logger;
        this.toolRegistry = toolRegistry;
        this.memory = new MemorySaver();
        this.initializeTools();
    }

    /**
     * 初始化语言模型
     */
    async initialize(): Promise<boolean> {
        try {
            // 尝试获取可用模型，增加重试机制
            let availableModels: vscode.LanguageModelChat[] = [];
            for (let i = 0; i < 3; i++) {
                try {
                    availableModels = await vscode.lm.selectChatModels();
                    if (availableModels.length > 0) break;
                } catch (error) {
                    this.logger.warn(`模型获取重试 ${i + 1}/3: ${error}`);
                    if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            if (availableModels.length === 0) {
                this.logger.error('No language models available after retries');
                return false;
            }

            // 创建LLM包装器
            this.llm = this.createVSCodeLLMWrapper(availableModels[0]);
            
            // 创建Agent
            this.agent = await this.createAgent();
            
            this.logger.info('🤖 Intelligent SCOPE Agent initialized successfully');
            return true;
        } catch (error) {
            this.logger.error(`Failed to initialize agent: ${error}`);
            return false;
        }
    }

    /**
     * 创建VS Code LLM包装器
     */
    private createVSCodeLLMWrapper(model: vscode.LanguageModelChat) {
        // 创建一个继承自BaseChatModel的类
        class VSCodeLLMWrapper extends BaseChatModel {
            _model: vscode.LanguageModelChat;
            _tools: any[] = [];
            
            constructor(model: vscode.LanguageModelChat) {
                super({});
                this._model = model;
            }

            async _generate(messages: BaseMessage[]): Promise<any> {
                const vscodeMessages = messages.map(msg => {
                    if (msg instanceof HumanMessage) {
                        return vscode.LanguageModelChatMessage.User(String(msg.content));
                    } else if (msg instanceof AIMessage) {
                        return vscode.LanguageModelChatMessage.Assistant(String(msg.content));
                    } else {
                        return vscode.LanguageModelChatMessage.User(String(msg.content));
                    }
                });

                const response = await this._model.sendRequest(vscodeMessages);
                let content = '';
                for await (const chunk of response.text) {
                    content += chunk;
                }
                
                return {
                    generations: [{
                        text: content,
                        message: new AIMessage(content)
                    }]
                };
            }

            async invoke(messages: BaseMessage[]): Promise<any> {
                const result = await this._generate(messages);
                return result.generations[0].message;
            }

            async stream(messages: BaseMessage[]): Promise<any> {
                return this.invoke(messages);
            }

            bindTools(tools: any[]): any {
                const newWrapper = new VSCodeLLMWrapper(this._model);
                newWrapper._tools = tools || [];
                return newWrapper;
            }

            _llmType(): string {
                return 'vscode-llm';
            }

            _identifyingParams(): any {
                return { model: 'vscode-llm' };
            }
        }

        return new VSCodeLLMWrapper(model);
    }

    /**
     * 初始化工具
     */
    private initializeTools(): void {
        // 文件分析工具
        this.tools.push(this.createFileAnalysisTool());
        
        // 作业选择工具
        this.tools.push(this.createJobSelectionTool());
        
        // 脚本读取工具
        this.tools.push(this.createScriptReaderTool());
        
        // 顶点分析工具
        this.tools.push(this.createVertexAnalysisTool());
        
        // 运行时统计工具
        this.tools.push(this.createRuntimeAnalysisTool());
        
        // 错误分析工具
        this.tools.push(this.createErrorAnalysisTool());
        
        // 综合分析工具
        this.tools.push(this.createComprehensiveAnalysisTool());
    }

    /**
     * 创建Agent
     */
    private async createAgent() {
        const prompt = ChatPromptTemplate.fromMessages([
            [
                "system",
                `你是一个专业的SCOPE性能分析AI Agent。你的任务是帮助用户分析SCOPE作业的性能问题。

你的工作流程：
1. 🎯 **理解用户意图**：分析用户的查询，确定是否需要性能分析
2. 📁 **选择分析目标**：如果需要分析，帮助用户选择要分析的作业
3. 🔍 **自主探索分析**：
   - 先读取SCOPE脚本，理解作业逻辑
   - 根据发现的问题，决定需要哪些额外信息
   - 自主选择和调用合适的工具获取更多数据
   - 深入分析性能瓶颈和问题根因
4. 💡 **生成智能建议**：基于分析结果，提供具体的优化建议

重要原则：
- 🤔 **自主思考**：每次分析都要主动思考下一步需要什么信息
- 🔧 **工具选择**：根据当前分析情况，智能选择最合适的工具
- 🎯 **目标导向**：始终围绕解决用户的性能问题
- 📊 **数据驱动**：基于具体的性能数据提供建议，而不是通用建议

可用工具：
- file_analysis: 分析作业文件夹结构
- job_selection: 帮助用户选择作业
- script_reader: 读取SCOPE脚本
- vertex_analysis: 分析顶点定义
- runtime_analysis: 分析运行时统计
- error_analysis: 分析错误日志
- comprehensive_analysis: 综合分析所有数据

现在开始分析吧！`
            ],
            ["placeholder", "{chat_history}"],
            ["human", "{input}"],
            ["placeholder", "{agent_scratchpad}"]
        ]);

        return createReactAgent({
            llm: this.llm,
            tools: this.tools,
            messageModifier: prompt,
            checkpointSaver: this.memory
        });
    }

    /**
     * 处理用户查询
     */
    async processQuery(query: string, sessionId: string = 'default'): Promise<string> {
        try {
            this.logger.info(`🤖 Processing query: ${query}`);

            const result = await this.agent.invoke(
                { input: query },
                { configurable: { thread_id: sessionId } }
            );

            // 提取最后的AI消息
            const lastMessage = result.messages[result.messages.length - 1];
            return lastMessage.content || '抱歉，我无法处理您的请求。';

        } catch (error) {
            this.logger.error(`Agent processing failed: ${error}`);
            return `处理请求时出错: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    /**
     * 设置当前作业文件夹
     */
    setCurrentJobFolder(jobFolder: string): void {
        this.currentJobFolder = jobFolder;
        this.analysisContext.set('currentJobFolder', jobFolder);
        this.logger.info(`📁 Current job folder set to: ${jobFolder}`);
    }

    // ==================== 工具创建方法 ====================

    /**
     * 创建文件分析工具
     */
    private createFileAnalysisTool(): any {
        return new DynamicStructuredTool({
            name: "file_analysis",
            description: "分析作业文件夹结构，发现可用的分析文件",
            schema: z.object({
                jobFolder: z.string().describe("作业文件夹路径")
            }),
            func: async ({ jobFolder }: { jobFolder: string }) => {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    
                    if (!fs.existsSync(jobFolder)) {
                        return `❌ 作业文件夹不存在: ${jobFolder}`;
                    }

                    const files = fs.readdirSync(jobFolder);
                    const foundFiles = {
                        scopeScript: files.find((f: string) => f.toLowerCase() === 'scope.script'),
                        vertexDef: files.find((f: string) => f.toLowerCase() === 'scopevertexdef.xml'),
                        runtimeStats: files.find((f: string) => f.toLowerCase() === '__scoperuntimestatistics__.xml'),
                        jobStats: files.find((f: string) => f.toLowerCase() === 'jobstatistics.xml'),
                        codeGen: files.find((f: string) => f.toLowerCase() === '__scopecodegen__.dll.cs'),
                        errorLog: files.find((f: string) => f.toLowerCase() === 'error')
                    };

                    const availableFiles = Object.entries(foundFiles)
                        .filter(([_, file]) => file)
                        .map(([type, file]) => `${type}: ${file}`)
                        .join(', ');

                    this.setCurrentJobFolder(jobFolder);
                    
                    return `📁 作业文件夹分析完成: ${path.basename(jobFolder)}
发现 ${Object.values(foundFiles).filter(f => f).length} 个相关文件
可用文件: ${availableFiles}

建议下一步: 先使用 script_reader 工具读取SCOPE脚本，理解作业逻辑`;
                } catch (error) {
                    return `❌ 文件分析失败: ${error}`;
                }
            }
        });
    }

    /**
     * 创建作业选择工具
     */
    private createJobSelectionTool(): any {
        return new DynamicStructuredTool({
            name: "job_selection",
            description: "帮助用户选择要分析的SCOPE作业",
            schema: z.object({
                action: z.enum(['list', 'select']).describe("操作类型：list-列出可用作业，select-选择作业"),
                jobId: z.string().optional().describe("要选择的作业ID")
            }),
            func: async ({ action, jobId }: { action: 'list' | 'select', jobId?: string }) => {
                try {
                    const os = require('os');
                    const fs = require('fs');
                    const path = require('path');
                    
                    const username = os.userInfo().username;
                    const tempPath = `C:\\Users\\${username}\\AppData\\Local\\Temp\\DataLakeTemp`;

                    if (action === 'list') {
                        if (!fs.existsSync(tempPath)) {
                            return '❌ 未找到SCOPE作业临时目录';
                        }

                        const items = fs.readdirSync(tempPath, { withFileTypes: true })
                            .filter((item: any) => item.isDirectory())
                            .map((item: any) => item.name)
                            .filter((name: string) => name.toLowerCase().includes('cosmos'))
                            .sort((a: string, b: string) => {
                                const statA = fs.statSync(path.join(tempPath, a));
                                const statB = fs.statSync(path.join(tempPath, b));
                                return statB.birthtimeMs - statA.birthtimeMs;
                            });

                        if (items.length === 0) {
                            return '❌ 未找到可用的SCOPE作业';
                        }

                        const jobList = items.map((item: string, index: number) => 
                            `${index + 1}. ${item}`
                        ).join('\n');

                        return `📋 发现 ${items.length} 个可用的SCOPE作业：
${jobList}

请使用 job_selection 工具选择要分析的作业，或者告诉我作业序号`;
                    } else if (action === 'select' && jobId) {
                        const jobPath = path.join(tempPath, jobId);
                        if (fs.existsSync(jobPath)) {
                            this.setCurrentJobFolder(jobPath);
                            return `✅ 已选择作业: ${jobId}
作业路径: ${jobPath}

下一步建议: 使用 file_analysis 工具分析文件结构`;
                        } else {
                            return `❌ 作业不存在: ${jobId}`;
                        }
                    }
                    
                    return '❌ 无效的操作';
                } catch (error) {
                    return `❌ 作业选择失败: ${error}`;
                }
            }
        });
    }

    /**
     * 创建脚本读取工具
     */
    private createScriptReaderTool(): any {
        return new DynamicStructuredTool({
            name: "script_reader",
            description: "读取和分析SCOPE脚本文件",
            schema: z.object({
                analyze: z.boolean().default(true).describe("是否进行智能分析")
            }),
            func: async ({ analyze }: { analyze: boolean }) => {
                try {
                    if (!this.currentJobFolder) {
                        return '❌ 请先选择作业文件夹';
                    }

                    const result = await this.toolRegistry.executeTool('scopeScriptReader', {
                        filePath: require('path').join(this.currentJobFolder, 'scope.script'),
                        fileType: 'SCOPE_SCRIPT',
                        analysisGoal: 'performance_analysis'
                    });

                    if (result.success) {
                        const scriptData = result.data;
                        this.analysisContext.set('scriptAnalysis', scriptData);
                        
                        let analysis = `📄 SCOPE脚本分析完成
文件: ${this.currentJobFolder}/scope.script

关键信息:`;

                        if (scriptData.criticalSections) {
                            const joins = scriptData.criticalSections.filter((s: any) => s.type === 'JOIN').length;
                            const groupBys = scriptData.criticalSections.filter((s: any) => s.type === 'GROUP_BY').length;
                            analysis += `
- JOIN操作: ${joins}个
- GROUP BY操作: ${groupBys}个
- 关键代码段: ${scriptData.criticalSections.length}个`;
                        }

                        if (scriptData.performanceHotspots) {
                            analysis += `
- 性能热点: ${scriptData.performanceHotspots.length}个`;
                        }

                        analysis += `\n\n💡 建议下一步: 
1. 如果发现性能问题，使用 vertex_analysis 工具分析顶点定义
2. 使用 runtime_analysis 工具查看运行时统计
3. 如果有错误，使用 error_analysis 工具分析错误日志`;

                        return analysis;
                    } else {
                        return `❌ 脚本读取失败: ${result.errors?.join(', ')}`;
                    }
                } catch (error) {
                    return `❌ 脚本读取工具执行失败: ${error}`;
                }
            }
        });
    }

    /**
     * 创建顶点分析工具
     */
    private createVertexAnalysisTool(): any {
        return new DynamicStructuredTool({
            name: "vertex_analysis",
            description: "分析SCOPE作业的顶点定义，了解计算节点结构",
            schema: z.object({
                focus: z.string().optional().describe("分析重点，如'performance'、'structure'等")
            }),
            func: async ({ focus }: { focus?: string }) => {
                try {
                    if (!this.currentJobFolder) {
                        return '❌ 请先选择作业文件夹';
                    }

                    const result = await this.toolRegistry.executeTool('extractVertex', {
                        filePath: require('path').join(this.currentJobFolder, 'ScopeVertexDef.xml'),
                        fileType: 'VERTEX_DEFINITION',
                        analysisGoal: focus || 'performance_analysis'
                    });

                    if (result.success) {
                        const vertexData = result.data;
                        this.analysisContext.set('vertexAnalysis', vertexData);
                        
                        const vertexCount = vertexData.vertices?.length || 0;
                        const summary = vertexData.summary || {};
                        
                        let analysis = `🔍 顶点分析完成
发现 ${vertexCount} 个计算顶点`;

                        if (summary.vertexTypes) {
                            analysis += `\n\n顶点类型分布:`;
                            Object.entries(summary.vertexTypes).forEach(([type, count]) => {
                                analysis += `\n- ${type}: ${count}个`;
                            });
                        }

                        if (vertexCount > 15) {
                            analysis += `\n\n⚠️ 发现问题: 顶点数量较多(${vertexCount}个)，可能存在性能问题`;
                        }

                        analysis += `\n\n💡 建议下一步: 使用 runtime_analysis 工具查看这些顶点的实际执行性能`;

                        return analysis;
                    } else {
                        return `❌ 顶点分析失败: ${result.errors?.join(', ')}`;
                    }
                } catch (error) {
                    return `❌ 顶点分析工具执行失败: ${error}`;
                }
            }
        });
    }

    /**
     * 创建运行时统计工具
     */
    private createRuntimeAnalysisTool(): any {
        return new DynamicStructuredTool({
            name: "runtime_analysis",
            description: "分析SCOPE作业的运行时统计数据，找出性能瓶颈",
            schema: z.object({
                focus: z.string().optional().describe("分析重点，如'slow_vertices'、'memory'、'data_skew'等")
            }),
            func: async ({ focus }: { focus?: string }) => {
                try {
                    if (!this.currentJobFolder) {
                        return '❌ 请先选择作业文件夹';
                    }

                    const result = await this.toolRegistry.executeTool('extractRuntime2', {
                        filePath: require('path').join(this.currentJobFolder, '__ScopeRuntimeStatistics__.xml'),
                        fileType: 'RUNTIME_STATS',
                        analysisGoal: focus || 'performance_analysis'
                    });

                    if (result.success) {
                        const runtimeData = result.data;
                        this.analysisContext.set('runtimeAnalysis', runtimeData);
                        
                        let analysis = `📊 运行时统计分析完成`;

                        const stats = runtimeData.runtimeStats || {};
                        if (stats.vertices) {
                            const slowVertices = stats.vertices
                                .filter((v: any) => v.executionTime && v.executionTime > 30000)
                                .sort((a: any, b: any) => (b.executionTime || 0) - (a.executionTime || 0))
                                .slice(0, 3);

                            if (slowVertices.length > 0) {
                                analysis += `\n\n🐌 发现慢顶点:`;
                                slowVertices.forEach((v: any) => {
                                    analysis += `\n- ${v.name}: ${Math.round(v.executionTime/1000)}秒`;
                                });
                            }
                        }

                        if (stats.operators) {
                            const skewedOps = stats.operators.filter((op: any) => op.dataSkew && op.dataSkew > 0.7);
                            if (skewedOps.length > 0) {
                                analysis += `\n\n📊 数据倾斜问题: ${skewedOps.length}个操作存在数据倾斜`;
                            }
                        }

                        analysis += `\n\n💡 建议下一步: 
1. 如果发现性能问题，使用 comprehensive_analysis 工具进行综合分析
2. 如果有错误，使用 error_analysis 工具分析错误原因`;

                        return analysis;
                    } else {
                        return `❌ 运行时统计分析失败: ${result.errors?.join(', ')}`;
                    }
                } catch (error) {
                    return `❌ 运行时统计工具执行失败: ${error}`;
                }
            }
        });
    }

    /**
     * 创建错误分析工具
     */
    private createErrorAnalysisTool(): any {
        return new DynamicStructuredTool({
            name: "error_analysis",
            description: "分析SCOPE作业的错误日志，找出问题根因",
            schema: z.object({
                focus: z.string().optional().describe("分析重点，如'timeout'、'memory'、'data_skew'等")
            }),
            func: async ({ focus }: { focus?: string }) => {
                try {
                    if (!this.currentJobFolder) {
                        return '❌ 请先选择作业文件夹';
                    }

                    const result = await this.toolRegistry.executeTool('errorLogReader', {
                        filePath: require('path').join(this.currentJobFolder, 'Error'),
                        fileType: 'ERROR_INFO',
                        analysisGoal: focus || 'error_analysis'
                    });

                    if (result.success) {
                        const errorData = result.data;
                        this.analysisContext.set('errorAnalysis', errorData);
                        
                        let analysis = `🔍 错误分析完成`;

                        if (errorData.errors && errorData.errors.length > 0) {
                            const mainError = errorData.errors[0];
                            analysis += `\n\n主要错误:
- 类型: ${mainError.category || '未知'}
- 消息: ${mainError.message || '无详细信息'}`;

                            // 根据错误类型提供建议
                            switch (mainError.category) {
                                case 'VERTEX_TIMEOUT':
                                    analysis += `\n\n🔧 解决方案: 顶点执行超时，建议优化查询逻辑或增加资源配置`;
                                    break;
                                case 'MEMORY_EXCEEDED':
                                    analysis += `\n\n🔧 解决方案: 内存不足，建议增加分区数或优化数据结构`;
                                    break;
                                case 'DATA_SKEW':
                                    analysis += `\n\n🔧 解决方案: 数据分布不均，建议添加SKEW hint或重新设计分区键`;
                                    break;
                                default:
                                    analysis += `\n\n🔧 解决方案: 建议查看详细错误日志进行针对性修复`;
                            }
                        } else {
                            analysis += `\n\n✅ 未发现明显错误，作业可能正常完成`;
                        }

                        analysis += `\n\n💡 建议下一步: 使用 comprehensive_analysis 工具生成完整的优化建议`;

                        return analysis;
                    } else {
                        return `❌ 错误分析失败: ${result.errors?.join(', ')}`;
                    }
                } catch (error) {
                    return `❌ 错误分析工具执行失败: ${error}`;
                }
            }
        });
    }

    /**
     * 创建综合分析工具
     */
    private createComprehensiveAnalysisTool(): any {
        return new DynamicStructuredTool({
            name: "comprehensive_analysis",
            description: "综合所有分析结果，生成完整的性能优化建议",
            schema: z.object({
                includeCode: z.boolean().default(true).describe("是否包含代码示例")
            }),
            func: async ({ includeCode }: { includeCode: boolean }) => {
                try {
                    const scriptData = this.analysisContext.get('scriptAnalysis');
                    const vertexData = this.analysisContext.get('vertexAnalysis');
                    const runtimeData = this.analysisContext.get('runtimeAnalysis');
                    const errorData = this.analysisContext.get('errorAnalysis');

                    if (!scriptData && !vertexData && !runtimeData && !errorData) {
                        return '❌ 没有足够的分析数据。请先运行其他分析工具。';
                    }

                    let report = `📋 SCOPE作业综合分析报告
==========================

`;

                    // 性能问题汇总
                    const issues: string[] = [];
                    const suggestions: string[] = [];

                    if (vertexData?.vertices?.length > 15) {
                        issues.push(`🔧 顶点数量过多: ${vertexData.vertices.length}个`);
                        suggestions.push('建议合并相邻的简单操作以减少顶点数量');
                    }

                    if (runtimeData?.runtimeStats?.vertices) {
                        const slowVertices = runtimeData.runtimeStats.vertices
                            .filter((v: any) => v.executionTime && v.executionTime > 30000);
                        if (slowVertices.length > 0) {
                            issues.push(`⚡ 慢顶点: ${slowVertices.length}个`);
                            suggestions.push(`优先优化最慢的顶点: ${slowVertices[0].name}`);
                        }
                    }

                    if (scriptData?.criticalSections) {
                        const joins = scriptData.criticalSections.filter((s: any) => s.type === 'JOIN').length;
                        if (joins > 0) {
                            issues.push(`🔗 JOIN操作: ${joins}个`);
                            suggestions.push('检查JOIN顺序并考虑使用BROADCAST hint优化小表连接');
                        }
                    }

                    if (errorData?.errors?.length > 0) {
                        issues.push(`🚨 错误: ${errorData.errors[0].category}`);
                        suggestions.push('优先解决错误问题');
                    }

                    report += `🎯 发现的问题 (${issues.length}个):
${issues.map(issue => `- ${issue}`).join('\n')}

`;

                    report += `💡 优化建议 (${suggestions.length}个):
${suggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`).join('\n')}

`;

                    if (includeCode && scriptData?.criticalSections) {
                        report += `🔧 代码优化示例:
// 原始代码可能存在的问题
// 建议添加适当的hint来优化性能
// 例如: BROADCAST hint, SKEW hint等

`;
                    }

                    report += `📊 性能优化优先级:
${suggestions.length > 0 ? suggestions.map((s, i) => `${i + 1}. ${s.includes('错误') ? '🚨 高优先级' : i < 2 ? '⚡ 中优先级' : '📊 一般优先级'} - ${s}`).join('\n') : '当前没有明显的性能问题'}

`;

                    return report;
                } catch (error) {
                    return `❌ 综合分析失败: ${error}`;
                }
            }
        });
    }
} 
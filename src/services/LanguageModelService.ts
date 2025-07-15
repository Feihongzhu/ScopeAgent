import * as vscode from 'vscode';
import { Logger } from '../functions/logger';
import { AgentContext, AgentThought, ProblemType, ComplexityLevel } from '../types/AgentTypes';

/**
 * 语言模型服务
 * 封装VS Code Language Model API，提供智能推理能力
 */
export class LanguageModelService {
    private logger: Logger;
    private preferredModel?: vscode.LanguageModelChat;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * 初始化语言模型，选择最佳可用模型
     */
    async initialize(): Promise<boolean> {
        try {
            // 优先选择claude-sonnet-4
            const Claude4Models = await vscode.lm.selectChatModels({family: 'claude-sonnet-4'});
            if (Claude4Models && Claude4Models.length > 0) {
                this.preferredModel = Claude4Models[0];
                this.logger.info(`Initialized with claude-sonnet-4 model: ${this.preferredModel.id}`);
                return true;
            }

            const gpt4Models = await vscode.lm.selectChatModels({family: 'gpt-4o'});
            if (gpt4Models && gpt4Models.length > 0) {
                this.preferredModel = gpt4Models[0];
                this.logger.info(`Initialized with gpt-4o model: ${this.preferredModel.id}`);
                return true;
            }

            // 备选：GPT-4
            const gpt4AltModels = await vscode.lm.selectChatModels({family: 'gpt-4'});
            if (gpt4AltModels && gpt4AltModels.length > 0) {
                this.preferredModel = gpt4AltModels[0];
                this.logger.info(`Initialized with GPT-4 model: ${this.preferredModel.id}`);
                return true;
            }

            // 最后选择任何可用模型
            const anyModels = await vscode.lm.selectChatModels();
            if (anyModels && anyModels.length > 0) {
                this.preferredModel = anyModels[0];
                this.logger.info(`Initialized with fallback model: ${this.preferredModel.id}`);
                return true;
            }

            this.logger.error('No language models available');
            return false;
        } catch (error) {
            this.logger.error(`Failed to initialize language model: ${error}`);
            return false;
        }
    }

    /**
     * 分析用户意图
     */
    async analyzeIntent(input: string, context: AgentContext, token?: vscode.CancellationToken): Promise<{
        intent: string;
        confidence: number;
        problemType: ProblemType;
        reasoning: string;
    }> {
        const prompt = this.buildIntentAnalysisPrompt(input, context);
        
        try {
            const response = await this.callModel(prompt, token);
            const parsed = this.parseIntentResponse(response);
            
            this.logger.info(`Intent analysis - Intent: ${parsed.intent}, Confidence: ${parsed.confidence}`);
            return parsed;
        } catch (error) {
            this.logger.error(`Intent analysis failed: ${error}`);
            return this.fallbackIntentAnalysis(input);
        }
    }

    /**
     * 生成执行计划
     */
    async generatePlan(thought: AgentThought, availableTools: string[], context: AgentContext, token?: vscode.CancellationToken): Promise<{
        steps: Array<{
            id: string;
            description: string;
            tool: string;
            input: any;
            reasoning: string;
        }>;
        reasoning: string;
        estimatedTime: number;
        riskFactors: string[];
    }> {
        const prompt = this.buildPlanGenerationPrompt(thought, availableTools, context);
        
        try {
            const response = await this.callModel(prompt, token);
            const parsed = this.parsePlanResponse(response);
            
            this.logger.info(`Generated plan with ${parsed.steps.length} steps`);
            return parsed;
        } catch (error) {
            this.logger.error(`Plan generation failed: ${error}`);
            return this.fallbackPlanGeneration(thought, availableTools);
        }
    }

    /**
     * 生成优化建议
     */
    async generateOptimizationSuggestions(analysisData: any, context: AgentContext, token?: vscode.CancellationToken): Promise<any[]> {
        const prompt = this.buildOptimizationPrompt(analysisData, context);
        
        try {
            const response = await this.callModel(prompt, token);
            const suggestions = this.parseOptimizationResponse(response);
            
            this.logger.info(`Generated ${suggestions.length} optimization suggestions`);
            return suggestions;
        } catch (error) {
            this.logger.error(`Optimization suggestion generation failed: ${error}`);
            return this.fallbackOptimizationSuggestions(analysisData);
        }
    }

    /**
     * 反思和学习
     */
    async reflectOnResult(result: any, expectedOutcome: string, context: AgentContext, token?: vscode.CancellationToken): Promise<{
        whatWorked: string[];
        whatFailed: string[];
        improvements: string[];
        knowledgeGained: string[];
        confidenceAdjustment: number;
    }> {
        const prompt = this.buildReflectionPrompt(result, expectedOutcome, context);
        
        try {
            const response = await this.callModel(prompt, token);
            const reflection = this.parseReflectionResponse(response);
            
            this.logger.info(`Reflection completed with ${reflection.improvements.length} improvements identified`);
            return reflection;
        } catch (error) {
            this.logger.error(`Reflection failed: ${error}`);
            return this.fallbackReflection(result);
        }
    }

    /**
     * 评估复杂度
     */
    assessComplexity(input: string, context: AgentContext): ComplexityLevel {
        // 基于启发式规则评估复杂度
        const indicators = {
            high: [
                '多个文件', '大量数据', '复杂查询', '性能瓶颈', '系统级', 
                '架构', '重构', '优化整个', '全面分析'
            ],
            medium: [
                '分析', '优化', '建议', '检查', '比较', '评估', '改进'
            ],
            low: [
                '查看', '显示', '列出', '简单', '快速', '基本'
            ]
        };

        const inputLower = input.toLowerCase();
        const contextComplexity = this.assessContextComplexity(context);
        
        // 检查高复杂度指标
        if (indicators.high.some(term => inputLower.includes(term)) || contextComplexity >= 0.7) {
            return 'high';
        }
        
        // 检查中等复杂度指标
        if (indicators.medium.some(term => inputLower.includes(term)) || contextComplexity >= 0.4) {
            return 'medium';
        }
        
        return 'low';
    }

    /**
     * 选择所需工具
     */
    selectRequiredTools(intent: string, problemType: ProblemType, availableTools: string[]): string[] {
        const toolMappings: Record<ProblemType, string[]> = {
            'performance_analysis': ['scope_file_reader', 'scope_performance_analyzer', 'scope_vertex_analyzer', 'scope_code_optimizer', 'report_generator'],
            'code_optimization': ['scope_file_reader', 'scope_performance_analyzer', 'scope_vertex_analyzer', 'scope_code_optimizer'],
            'bottleneck_identification': ['scope_file_reader', 'scope_performance_analyzer', 'scope_vertex_analyzer'],
            'general_inquiry': ['scope_file_reader'],
            'error_diagnosis': ['scope_file_reader', 'scope_performance_analyzer'],
            'best_practices': ['scope_code_optimizer', 'report_generator'],
            'capacity_planning': ['scope_performance_analyzer', 'report_generator']
        };

        const suggestedTools = toolMappings[problemType] || ['scope_file_reader'];
        
        // 确保性能分析和代码优化任务包含完整的工具链
        if (problemType === 'performance_analysis' || problemType === 'code_optimization') {
            const coreTools = ['scope_file_reader', 'scope_performance_analyzer', 'scope_vertex_analyzer', 'scope_code_optimizer'];
            return coreTools.filter(tool => availableTools.includes(tool));
        }
        
        // 过滤出实际可用的工具
        return suggestedTools.filter(tool => availableTools.includes(tool));
    }

    // ========== 私有方法 ==========

    private async callModel(prompt: string, token?: vscode.CancellationToken): Promise<string> {
        if (!this.preferredModel) {
            throw new Error('Language model not initialized');
        }

        const messages = [vscode.LanguageModelChatMessage.User(prompt)];
        const response = await this.preferredModel.sendRequest(messages, undefined, token);
        
        let responseText = "";
        for await (const chunk of response.text) {
            responseText += chunk;
        }
        
        return responseText.trim();
    }

    /**
     * 清理语言模型响应中的markdown代码块标记
     */
    private cleanJsonResponse(response: string): string {
        // 移除可能的```json和```标记
        let cleaned = response.trim();
        
        // 移除开头的```json或```
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.substring(7);
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.substring(3);
        }
        
        // 移除结尾的```
        if (cleaned.endsWith('```')) {
            cleaned = cleaned.substring(0, cleaned.length - 3);
        }
        
        return cleaned.trim();
    }

    /**
     * 从分析数据中提取关键摘要信息，避免发送完整文件内容
     */
    private extractAnalysisSummary(analysisData: any): string {
        const summary = [];
        
        // 文件信息摘要
        if (analysisData.filesRead && Array.isArray(analysisData.filesRead)) {
            summary.push(`**已读取文件**: ${analysisData.filesRead.join(', ')}`);
        }
        
        // 性能分析摘要
        if (analysisData.performance && analysisData.performance.analysis) {
            const perf = analysisData.performance.analysis;
            summary.push(`**性能分析**:`);
            
            if (perf.slowVertices && perf.slowVertices.length > 0) {
                summary.push(`  - 发现 ${perf.slowVertices.length} 个慢速顶点`);
            }
            
            if (perf.memoryIntensiveOperations && perf.memoryIntensiveOperations.length > 0) {
                summary.push(`  - 发现 ${perf.memoryIntensiveOperations.length} 个内存密集操作`);
            }
            
            if (perf.keyMetrics) {
                const metrics = Object.entries(perf.keyMetrics).slice(0, 3);
                metrics.forEach(([key, value]) => {
                    summary.push(`  - ${key}: ${value}`);
                });
            }
        }
        
        // 脚本分析摘要
        if (analysisData.scriptAnalysis) {
            const script = analysisData.scriptAnalysis;
            summary.push(`**脚本分析**:`);
            
            if (script.joins && script.joins.length > 0) {
                summary.push(`  - 包含 ${script.joins.length} 个JOIN操作`);
            }
            
            if (script.aggregations && script.aggregations.length > 0) {
                summary.push(`  - 包含 ${script.aggregations.length} 个聚合操作`);
            }
            
            if (script.complexity) {
                summary.push(`  - 脚本复杂度: ${script.complexity}`);
            }
        }
        
        // 顶点分析摘要
        if (analysisData.vertex && analysisData.vertex.analysis) {
            const vertex = analysisData.vertex.analysis;
            summary.push(`**顶点分析**:`);
            
            if (vertex.criticalPath && vertex.criticalPath.length > 0) {
                summary.push(`  - 关键路径包含 ${vertex.criticalPath.length} 个顶点`);
            }
            
            if (vertex.parallelizationOpportunities && vertex.parallelizationOpportunities.length > 0) {
                summary.push(`  - 发现 ${vertex.parallelizationOpportunities.length} 个并行化机会`);
            }
        }
        
        // 现有优化建议摘要
        if (analysisData.optimizations && analysisData.optimizations.length > 0) {
            summary.push(`**已识别优化机会**: ${analysisData.optimizations.length} 个`);
            
            const categories = [...new Set(analysisData.optimizations.map((opt: any) => opt.category))];
            if (categories.length > 0) {
                summary.push(`  - 涉及类别: ${categories.join(', ')}`);
            }
            
            const criticalCount = analysisData.criticalIssues ? analysisData.criticalIssues.length : 0;
            const quickWinsCount = analysisData.quickWins ? analysisData.quickWins.length : 0;
            
            if (criticalCount > 0) {
                summary.push(`  - 关键问题: ${criticalCount} 个`);
            }
            
            if (quickWinsCount > 0) {
                summary.push(`  - 快速收益项: ${quickWinsCount} 个`);
            }
        }
        
        return summary.length > 0 ? summary.join('\n') : '无特殊性能问题发现';
    }

    private buildIntentAnalysisPrompt(input: string, context: AgentContext): string {
        return `作为SCOPE性能优化专家AI Agent，分析用户的真实意图：

用户输入: "${input}"

上下文信息:
- 当前任务: ${context.currentTask || '无'}
- 最近分析: ${context.workspaceState.recentAnalyses.length}个
- 用户偏好优化级别: ${context.userPreferences.optimizationLevel}

请分析并返回JSON格式:
{
    "intent": "用户的真实意图(一句话概括)",
    "confidence": 0.95,
    "problemType": "performance_analysis|code_optimization|bottleneck_identification|general_inquiry|error_diagnosis|best_practices|capacity_planning",
    "reasoning": "为什么这样判断的详细推理过程"
}

重点关注:
1. 用户是想要分析现有性能问题还是预防性优化？
2. 涉及的范围是单个脚本还是整体系统？
3. 用户的技术水平和需求紧急程度？`;
    }

    private buildPlanGenerationPrompt(thought: AgentThought, availableTools: string[], context: AgentContext): string {
        return `作为SCOPE script性能优化AI Agent，为以下分析制定详细执行计划：

用户意图: ${thought.intent}
问题类型: ${thought.problemType}
复杂度: ${thought.expectedComplexity}
信心度: ${thought.confidence}

可用工具: ${availableTools.join(', ')}

针对SCOPE script性能分析，请制定包含以下4个关键步骤的完整计划：

1. **文件读取步骤** - 使用scope_file_reader获取所有4个关键文件
2. **性能分析步骤** - 使用scope_performance_analyzer分析统计信息
3. **顶点分析步骤** - 使用scope_vertex_analyzer分析执行图
4. **优化建议步骤** - 使用scope_code_optimizer生成具体建议

请严格按照以下JSON格式返回:
{
    "steps": [
        {
            "id": "step_1",
            "description": "读取SCOPE相关文件（scope.script, 性能统计, 顶点定义, 生成代码）",
            "tool": "scope_file_reader",
            "input": {
                "jobFolder": "auto_detect",
                "fileTypes": ["scope.script", "__ScopeRuntimeStatistics__.xml", "ScopeVertexDef.xml", "__ScopeCodeGen__.dll.cs"]
            },
            "reasoning": "获取完整的SCOPE作业文件用于分析"
        },
        {
            "id": "step_2", 
            "description": "深度分析性能统计信息，识别瓶颈操作",
            "tool": "scope_performance_analyzer",
            "input": {
                "statisticsFile": "",
                "analysisDepth": "comprehensive"
            },
            "reasoning": "分析性能统计，识别高耗时和高内存消耗的操作"
        },
        {
            "id": "step_3",
            "description": "分析顶点定义和执行图，识别关键路径",
            "tool": "scope_vertex_analyzer", 
            "input": {
                "vertexDefFile": "",
                "performanceData": {}
            },
            "reasoning": "理解查询执行计划和操作依赖关系"
        },
        {
            "id": "step_4",
            "description": "基于分析结果生成具体的代码优化建议",
            "tool": "scope_code_optimizer",
            "input": {
                "scopeScript": "",
                "performanceAnalysis": {},
                "optimizationLevel": "detailed"
            },
            "reasoning": "提供具体的代码修改建议和优化策略"
        }
    ],
    "reasoning": "完整的SCOPE性能分析和优化流程，从文件读取到具体优化建议",
    "estimatedTime": 15000,
    "riskFactors": ["SCOPE文件可能不存在", "性能统计文件可能损坏", "复杂查询分析时间较长"]
}

关键要求:
1. 必须返回有效的JSON格式
2. 必须包含所有4个步骤
3. 每个步骤必须有完整的字段
4. 步骤间的数据传递将在执行时动态处理`;
    }

    private buildOptimizationPrompt(analysisData: any, context: AgentContext): string {
        // 获取实际的 scope script 内容
        const scopeScript = this.extractScopeScript(analysisData);
        const performanceIssues = this.extractPerformanceIssues(analysisData);
        
        const prompt = [
            "SCOPE (Structured Computation Optimized for Parallel Execution) is a SQL-like scripting language for big data processing in Microsoft Cosmos. 你是SCOPE Script性能优化专家，基于实际脚本内容和性能分析生成具体优化建议。",
            "",
            "## 实际SCOPE脚本内容",
            "```scope",
            scopeScript || "// 未找到scope脚本内容",
            "```",
            "",
            "## 性能问题分析",
            performanceIssues || "基于最佳实践进行优化",
            "",
            "## 任务要求",
            "请分析上述脚本并返回**字符串数组**，每个元素是一个完整的优化建议。",
            "每个建议应该包含：标题、具体问题、原始代码片段、优化后代码、预期改进。",
            "",
            "## 重点关注下面的场景",
            "- Predicate pushdown",
            "- Broadcast join for small tables, like INNER BRODCASTRIGHT JOIN",
            "- Avoid unnecessary columns",
            "- Rewrite user-defined functions with built-in Scope operators",
            "- Handling data skew in large-table joins or aggregations using a different/compound set of columns, like GROUP BY a,b,c if a is highly skewed",
            "- Ensuring JOIN conditions yield unique matches to avoid duplicate data",
            "- Minimizing memory and CPU overhead from ORDER BY or GROUP BY through indexing or field optimization",
            "- Annotations of user defined operator/function that can help change degree of parallelism of the stage",
            "- When creating a structured stream always CLUSTERED BY and SORTED BY",
            "- Provide scope compiler hints for skewed joins or aggregations if data distribution is unknown, such as:",
            "   - SKEW hints in Syntax, SKEW identifies the source of skewed keys from left or right side: ",
            "       [SKEWJOIN=(SKEW=FROMLEFT|FROMRIGHT|FROMBOTH,REPARTITION=FULLJOIN|SPLITJOIN|SPLITBROADCASTJOIN,LEVEL=Integer,MINPARTITIONCOUNT=Integer,PARTITIONCOUNT=Integer)] statement;",
            "   - Data hints in Syntax: ",
            "       [ROWCOUNT=<integer>] | [ROWSIZE=<integer>] | [LOWDISTINCTNESS(<col1>,<col2>,…,<coln>)] | [[SKEWFACTOR(<col1>,<col2>,…,<coln>)=<float>]] statement;",
            "    - PARTITION hints in Syntax: ",
            "        [PARTITION<(column_1, ... column_n)>=(PARTITIONFUNCTION=UNKNOWN|SERIAL|RANGE|HASH|DIRECT|REFINERANGE|PARALLEL|ROUNDROBIN,<if RANGE: PARTITIONSPEC=path_meta,>  PARITIONCOUNT=integer,  PARTITIONSIZE=integer,  MAXINTCANDIDATE=integer,  REQUIRED=bool)] statement;",
            "## 严格要求",
            "CRITICAL: 你必须严格按照以下格式返回JSON字符串数组，不要返回任何其他格式的文本！",
            "",
            "## 响应格式（必须严格遵守）",
            "返回有效的JSON字符串数组，示例：",
            '```json',
            '[',
            '  "🔧 **JOIN操作优化**\\n   问题：发现大表连接操作\\n   **原始代码：**\\n   FROM table1 JOIN table2\\n   **优化后：**\\n   FROM table1 INNER BROADCASTRIGHT JOIN table2\\n   **改进：** 使用BROADCAST JOIN可提升30-50%性能",',
            '  "🔧 **SELECT优化**\\n   问题：使用了SELECT *\\n   **原始代码：**\\n   SELECT *\\n   **优化后：**\\n   SELECT col1, col2, col3\\n   **改进：** 减少内存使用和网络传输"',
            ']',
            '```',
            "",
            "要求：",
            "1. 必须返回有效JSON数组",
            "2. 每个元素是完整的优化建议字符串",
            "3. 不要包含任何解释性文本",
            "4. 基于实际脚本内容生成3-5个具体建议",
            "5. 如果无法获取脚本内容，返回通用SCOPE最佳实践建议"
        ];
        
        return prompt.join('\n');
    }

    /**
     * 从分析数据中提取scope script内容
     */
    private extractScopeScript(analysisData: any): string {
        this.logger.info('Extracting SCOPE script from analysis data...');
        this.logger.debug(`Analysis data structure: ${JSON.stringify(Object.keys(analysisData), null, 2)}`);
        
        // 方法1: 从文件读取结果中获取 (正确的数据结构)
        if (analysisData.fileData && analysisData.fileData.fileContents && analysisData.fileData.fileContents['scope.script']) {
            this.logger.info('Found script in analysisData.fileData.fileContents');
            return analysisData.fileData.fileContents['scope.script'];
        }
        
        // 兼容性：检查直接的fileData结构
        if (analysisData.fileData && analysisData.fileData['scope.script']) {
            this.logger.info('Found script in analysisData.fileData (direct)');
            return analysisData.fileData['scope.script'];
        }
        
        // 方法2: 从优化工具的输入中获取 (调用scope_code_optimizer时直接传入)
        if (analysisData.scopeScript) {
            this.logger.info('Found script in analysisData.scopeScript');
            return analysisData.scopeScript;
        }
        
        // 方法3: 从性能分析结果中的files获取
        if (analysisData.performanceAnalysis && analysisData.performanceAnalysis.files) {
            const files = analysisData.performanceAnalysis.files;
            if (files['scope.script']) {
                this.logger.info('Found script in performanceAnalysis.files');
                return files['scope.script'];
            }
        }
        
        // 方法4: 从results数组中查找文件读取结果
        if (analysisData.results && Array.isArray(analysisData.results)) {
            for (const result of analysisData.results) {
                if (result && result.fileContents && result.fileContents['scope.script']) {
                    this.logger.info('Found script in results.fileContents');
                    return result.fileContents['scope.script'];
                }
                
                if (result && result['scope.script']) {
                    this.logger.info('Found script directly in results');
                    return result['scope.script'];
                }
            }
        }
        
        // 方法5: 检查synthesized数据中是否有文件内容
        if (analysisData.synthesizedData && analysisData.synthesizedData.fileData) {
            const fileData = analysisData.synthesizedData.fileData;
            if (fileData['scope.script']) {
                this.logger.info('Found script in synthesizedData.fileData');
                return fileData['scope.script'];
            }
        }
        
        this.logger.warn('Unable to find SCOPE script content in analysis data');
        this.logger.debug(`Available data keys: ${Object.keys(analysisData).join(', ')}`);
        
        return "// 未能获取到scope脚本内容，请确保文件读取成功\n// 这是一个占位符，无法提供基于实际脚本的优化建议";
    }

    /**
     * 从分析数据中提取性能问题
     */
    private extractPerformanceIssues(analysisData: any): string {
        const issues = [];
        
        // 从性能分析中提取问题
        if (analysisData.performanceAnalysis && analysisData.performanceAnalysis.analysis) {
            const perf = analysisData.performanceAnalysis.analysis;
            
            if (perf.slowVertices && perf.slowVertices.length > 0) {
                issues.push(`发现 ${perf.slowVertices.length} 个慢速顶点`);
            }
            
            if (perf.memoryIntensiveOperations && perf.memoryIntensiveOperations.length > 0) {
                issues.push(`发现 ${perf.memoryIntensiveOperations.length} 个内存密集操作`);
            }
            
            if (perf.bottlenecks && perf.bottlenecks.length > 0) {
                issues.push(`识别出的瓶颈: ${perf.bottlenecks.map((b: any) => b.type || b.description).join(', ')}`);
            }
        }
        
        // 从脚本分析中提取问题
        if (analysisData.scriptAnalysis) {
            const script = analysisData.scriptAnalysis;
            
            if (script.joins && script.joins.length > 0) {
                issues.push(`包含 ${script.joins.length} 个JOIN操作需要优化`);
            }
            
            if (script.selectAll && script.selectAll.length > 0) {
                issues.push(`发现 ${script.selectAll.length} 个SELECT *语句`);
            }
            
            if (script.complexity === 'high') {
                issues.push("脚本复杂度较高，需要优化");
            }
        }
        
        return issues.length > 0 ? issues.join('\n') : "基于SCOPE最佳实践进行预防性优化";
    }

    private buildReflectionPrompt(result: any, expectedOutcome: string, context: AgentContext): string {
        return `作为学习型AI Agent，反思刚才的任务执行结果：

预期结果: ${expectedOutcome}
实际结果: ${JSON.stringify(result, null, 2)}
执行上下文: ${JSON.stringify(context, null, 2)}

请进行深度反思，返回JSON格式:
{
    "whatWorked": ["成功的地方"],
    "whatFailed": ["失败或不足的地方"], 
    "improvements": ["具体改进建议"],
    "knowledgeGained": ["从这次执行中学到的知识"],
    "confidenceAdjustment": 0.1
}

反思维度:
1. 工具选择是否合适？
2. 执行顺序是否最优？
3. 用户需求理解是否准确？
4. 结果呈现是否清晰？
5. 下次如何做得更好？`;
    }

    // ========== 解析响应 ==========

    private parseIntentResponse(response: string): {
        intent: string;
        confidence: number;
        problemType: ProblemType;
        reasoning: string;
    } {
        try {
            const cleanedResponse = this.cleanJsonResponse(response);
            const parsed = JSON.parse(cleanedResponse);
            return {
                intent: parsed.intent || '分析SCOPE脚本性能',
                confidence: parsed.confidence || 0.7,
                problemType: parsed.problemType || 'performance_analysis',
                reasoning: parsed.reasoning || '基于用户输入的基础分析'
            };
        } catch (error) {
            this.logger.warn(`Failed to parse intent response, using fallback: ${error}`);
            return this.fallbackIntentAnalysis(response);
        }
    }

    private parsePlanResponse(response: string): {
        steps: Array<{
            id: string;
            description: string;
            tool: string;
            input: any;
            reasoning: string;
        }>;
        reasoning: string;
        estimatedTime: number;
        riskFactors: string[];
    } {
        try {
            const cleanedResponse = this.cleanJsonResponse(response);
            const parsed = JSON.parse(cleanedResponse);
            
            // 验证解析结果的完整性
            if (parsed.steps && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
                return {
                    steps: parsed.steps,
                    reasoning: parsed.reasoning || '标准执行计划',
                    estimatedTime: parsed.estimatedTime || 5000,
                    riskFactors: parsed.riskFactors || []
                };
            } else {
                // 如果解析结果不完整，使用完整的备用计划
                this.logger.warn('Parsed response incomplete, using comprehensive fallback plan');
                return this.fallbackPlanGeneration({ problemType: 'performance_analysis' } as any, ['scope_file_reader', 'scope_performance_analyzer', 'scope_vertex_analyzer', 'scope_code_optimizer']);
            }
        } catch (error) {
            this.logger.warn(`Failed to parse plan response, using comprehensive fallback: ${error}`);
            // 使用完整的备用计划而不是简单的单步计划
            return this.fallbackPlanGeneration({ problemType: 'performance_analysis' } as any, ['scope_file_reader', 'scope_performance_analyzer', 'scope_vertex_analyzer', 'scope_code_optimizer']);
        }
    }

    private parseOptimizationResponse(response: string): any[] {
        try {
            const cleanedResponse = this.cleanJsonResponse(response);
            const parsed = JSON.parse(cleanedResponse);
            
            // 检查是否成功解析为数组
            if (Array.isArray(parsed)) {
                this.logger.info(`Successfully parsed ${parsed.length} optimization suggestions`);
                
                // 检查数组元素类型
                if (parsed.length > 0) {
                    const firstElement = parsed[0];
                    if (typeof firstElement === 'string') {
                        // 已经是字符串数组，直接返回
                        this.logger.info('Received string array from language model');
                        return parsed;
                    } else if (typeof firstElement === 'object') {
                        // 是对象数组，需要转换为字符串数组
                        this.logger.info('Converting object array to string array');
                        return parsed.map((obj: any) => this.convertObjectToSuggestionString(obj));
                    }
                }
                
                return parsed;
            } else {
                this.logger.warn('Parsed response is not an array, falling back to text extraction');
                throw new Error('Response is not an array');
            }
        } catch (error) {
            this.logger.warn(`Failed to parse JSON response: ${error}, attempting text extraction`);
            // 尝试从文本中提取建议行
            const lines = response.split('\n')
                .filter(line => line.trim())
                .filter(line => !line.includes('```') && !line.includes('json') && !line.includes('[') && !line.includes(']'))
                .map(line => line.replace(/^\d+\.\s*/, '').trim()) // 移除编号
                .filter(line => line.length > 10); // 过滤太短的行
            
            return lines.length > 0 ? lines : ['🔧 **基础优化建议**\n   考虑使用BROADCAST JOIN优化小表与大表的连接性能'];
        }
    }

    /**
     * 将对象转换为格式化的建议字符串
     */
    private convertObjectToSuggestionString(obj: any): string {
        const parts = [];
        
        // 添加标题
        if (obj.title || obj['问题描述']) {
            const title = obj.title || obj['问题描述'];
            parts.push(`🔧 **${title}**`);
        }
        
        // 添加描述
        if (obj.description || obj['改进说明']) {
            const desc = obj.description || obj['改进说明'];
            parts.push(`   ${desc}`);
        }
        
        // 添加原始代码
        if (obj.originalCode || obj['原始代码']) {
            const code = obj.originalCode || obj['原始代码'];
            parts.push('   **原始代码：**');
            parts.push('   ```scope');
            parts.push(`   ${code}`);
            parts.push('   ```');
        }
        
        // 添加优化后代码
        if (obj.optimizedCode || obj['优化后代码']) {
            const code = obj.optimizedCode || obj['优化后代码'];
            parts.push('   **优化后：**');
            parts.push('   ```scope');
            parts.push(`   ${code}`);
            parts.push('   ```');
        }
        
        // 添加改进说明
        if (obj.improvement || obj.estimatedImprovement) {
            const improvement = obj.improvement || obj.estimatedImprovement;
            parts.push(`   **预期改进：** ${improvement}`);
        }
        
        return parts.length > 0 ? parts.join('\n') : '优化建议';
    }

    private parseReflectionResponse(response: string): {
        whatWorked: string[];
        whatFailed: string[];
        improvements: string[];
        knowledgeGained: string[];
        confidenceAdjustment: number;
    } {
        try {
            const cleanedResponse = this.cleanJsonResponse(response);
            const parsed = JSON.parse(cleanedResponse);
            return {
                whatWorked: parsed.whatWorked || [],
                whatFailed: parsed.whatFailed || [],
                improvements: parsed.improvements || [],
                knowledgeGained: parsed.knowledgeGained || [],
                confidenceAdjustment: parsed.confidenceAdjustment || 0
            };
        } catch (error) {
            return {
                whatWorked: ['执行了基本流程'],
                whatFailed: ['响应解析失败'],
                improvements: ['改进语言模型集成'],
                knowledgeGained: ['需要更好的错误处理'],
                confidenceAdjustment: -0.1
            };
        }
    }

    // ========== 备用方法 ==========

    private fallbackIntentAnalysis(input: string): {
        intent: string;
        confidence: number;
        problemType: ProblemType;
        reasoning: string;
    } {
        const inputLower = input.toLowerCase();
        
        if (inputLower.includes('优化') || inputLower.includes('optimize')) {
            return {
                intent: '优化SCOPE脚本性能',
                confidence: 0.6,
                problemType: 'code_optimization',
                reasoning: '输入包含优化关键词'
            };
        }
        
        if (inputLower.includes('瓶颈') || inputLower.includes('bottleneck') || inputLower.includes('慢')) {
            return {
                intent: '识别性能瓶颈',
                confidence: 0.6,
                problemType: 'bottleneck_identification',
                reasoning: '输入包含瓶颈相关关键词'
            };
        }
        
        return {
            intent: '分析SCOPE脚本性能',
            confidence: 0.5,
            problemType: 'performance_analysis',
            reasoning: '默认性能分析意图'
        };
    }

    private fallbackPlanGeneration(thought: AgentThought, availableTools: string[]): {
        steps: Array<{
            id: string;
            description: string;
            tool: string;
            input: any;
            reasoning: string;
        }>;
        reasoning: string;
        estimatedTime: number;
        riskFactors: string[];
    } {
        const steps = [];
        
        // 步骤1: 读取所有SCOPE相关文件（包括4个关键文件）
        if (availableTools.includes('scope_file_reader')) {
            steps.push({
                id: 'step_1',
                description: '读取SCOPE相关文件（scope.script, 性能统计, 顶点定义, 生成代码）',
                tool: 'scope_file_reader',
                input: { 
                    jobFolder: 'auto_detect',
                    fileTypes: ['scope.script', '__ScopeRuntimeStatistics__.xml', 'ScopeVertexDef.xml', '__ScopeCodeGen__.dll.cs']
                },
                reasoning: '需要获取所有4个关键文件：脚本、性能统计、顶点定义和生成的C#代码'
            });
        }
        
        // 步骤2: 分析性能统计信息
        if (availableTools.includes('scope_performance_analyzer')) {
            steps.push({
                id: 'step_2',
                description: '深度分析性能统计信息，识别高耗时和高内存消耗的操作',
                tool: 'scope_performance_analyzer',
                input: { 
                    statisticsFile: '',  // 将在执行时动态填入
                    analysisDepth: 'comprehensive' 
                },
                reasoning: '分析Overall Performance Statistics和Per-Node Performance Statistics，识别瓶颈'
            });
        }
        
        // 步骤3: 分析顶点和操作图
        if (availableTools.includes('scope_vertex_analyzer')) {
            steps.push({
                id: 'step_3',
                description: '分析顶点定义和执行图，识别关键路径和并行化机会',
                tool: 'scope_vertex_analyzer',
                input: { 
                    vertexDefFile: '',  // 将在执行时动态填入
                    performanceData: {}  // 来自步骤2的结果
                },
                reasoning: '理解查询执行计划，找到对应的operators和class names'
            });
        }
        
        // 步骤4: 生成具体的代码优化建议
        if (availableTools.includes('scope_code_optimizer')) {
            steps.push({
                id: 'step_4',
                description: '基于分析结果生成具体的SCOPE脚本优化建议',
                tool: 'scope_code_optimizer',
                input: { 
                    scopeScript: '',  // 来自步骤1
                    performanceAnalysis: {},  // 来自步骤2和3
                    optimizationLevel: 'detailed'
                },
                reasoning: '结合性能分析和脚本内容，提供具体的代码修改建议'
            });
        }
        
        return {
            steps,
            reasoning: '完整的SCOPE性能分析和优化流程：读取所有关键文件 → 分析性能统计 → 分析执行图 → 生成优化建议',
            estimatedTime: 15000,  // 更长的时间来完成完整分析
            riskFactors: [
                'SCOPE文件可能不存在或不完整',
                '性能统计文件可能损坏',
                '复杂分析可能需要更长时间',
                '某些UDF可能难以优化'
            ]
        };
    }

    private fallbackOptimizationSuggestions(analysisData: any): any[] {
        return [
            '🔧 **BROADCAST JOIN优化**\n   问题：大表与小表连接操作性能瓶颈\n   **原始代码：**\n   FROM largeTable JOIN smallTable\n   **优化后：**\n   FROM largeTable INNER BROADCASTRIGHT JOIN smallTable\n   **改进：** 将小表广播到所有节点，避免数据重排，可提升30-60%性能',
            
            '🔧 **SELECT列优化**\n   问题：使用SELECT *导致不必要的数据传输\n   **原始代码：**\n   SELECT *\n   **优化后：**\n   SELECT col1, col2, col3\n   **改进：** 明确指定需要的列，减少内存使用和网络传输20-40%',
            
            '🔧 **数据倾斜处理**\n   问题：GROUP BY操作可能存在数据倾斜\n   **原始代码：**\n   GROUP BY skewed_column\n   **优化后：**\n   GROUP BY skewed_column USE HINT(SKEW(skewed_column))\n   **改进：** 使用SKEW提示让编译器优化热点数据分布',
            
            '🔧 **谓词下推优化**\n   问题：WHERE条件未充分前置\n   **原始代码：**\n   FROM table1 JOIN table2 WHERE condition\n   **优化后：**\n   FROM (SELECT * FROM table1 WHERE condition) JOIN table2\n   **改进：** 早期过滤减少JOIN操作的数据量，提升15-35%性能'
        ];
    }

    private fallbackReflection(result: any): {
        whatWorked: string[];
        whatFailed: string[];
        improvements: string[];
        knowledgeGained: string[];
        confidenceAdjustment: number;
    } {
        return {
            whatWorked: ['完成了基本任务执行'],
            whatFailed: ['AI反思功能不可用'],
            improvements: ['需要改进语言模型集成'],
            knowledgeGained: ['备用方案的重要性'],
            confidenceAdjustment: -0.1
        };
    }

    private assessContextComplexity(context: AgentContext): number {
        let complexity = 0;
        
        // 基于对话历史
        complexity += Math.min(context.conversationHistory.length * 0.1, 0.3);
        
        // 基于工作空间状态
        complexity += Math.min(context.workspaceState.recentAnalyses.length * 0.1, 0.2);
        
        // 基于可用工具数量
        complexity += Math.min(context.availableTools.length * 0.05, 0.2);
        
        // 基于用户偏好
        if (context.userPreferences.preferredAnalysisDepth === 'comprehensive') {
            complexity += 0.3;
        } else if (context.userPreferences.preferredAnalysisDepth === 'detailed') {
            complexity += 0.2;
        }
        
        return Math.min(complexity, 1.0);
    }
} 
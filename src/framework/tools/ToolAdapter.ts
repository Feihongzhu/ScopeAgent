import { Logger } from '../../functions/logger';
import { AnalysisTool, ToolInput, ToolOutput } from '../types/FrameworkTypes';
import { Tool, ToolParameter, ToolResult, ValidationResult, ToolSchema, ToolCategory } from '../../types/AgentTypes';

/**
 * 工具适配器 - 将AnalysisTool转换为Agent可用的Tool接口
 */
export class ToolAdapter {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * 将AnalysisTool适配为Agent可用的Tool
     */
    adaptTool(analysisTool: AnalysisTool): Tool {
        const self = this;
        
        return {
            name: analysisTool.name,
            description: analysisTool.description,
            parameters: this.generateParameters(analysisTool),
            category: analysisTool.category as unknown as ToolCategory,
            version: '1.0.0',
            
            async execute(input: any, context?: any): Promise<ToolResult> {
                try {
                    // 构造ToolInput
                    const toolInput: ToolInput = {
                        filePath: input.filePath || '',
                        fileType: input.fileType || '',
                        analysisGoal: input.analysisGoal || 'general_analysis',
                        context: context ? self.convertAgentContextToAnalysisContext(context) : undefined
                    };
                    
                    // 执行AnalysisTool
                    const result: ToolOutput = await analysisTool.execute(toolInput);
                    
                    // 转换结果格式
                    return {
                        success: result.success,
                        data: result.data,
                        message: result.success ? '工具执行成功' : (result.errors?.join(', ') || '工具执行失败'),
                        executionTime: result.metadata?.executionTime || 0,
                        metadata: result.metadata
                    };
                } catch (error) {
                    return {
                        success: false,
                        data: null,
                        message: `工具执行失败: ${error instanceof Error ? error.message : String(error)}`,
                        executionTime: 0,
                        metadata: {}
                    };
                }
            },
            
            validate(input: any): ValidationResult {
                const errors: string[] = [];
                
                // 基本验证
                if (!input.filePath) {
                    errors.push('缺少必需的filePath参数');
                }
                
                if (!input.fileType) {
                    errors.push('缺少必需的fileType参数');
                }
                
                return {
                    valid: errors.length === 0,
                    errors,
                    warnings: []
                };
            },
            
            getSchema(): ToolSchema {
                return {
                    input: {
                        type: 'object',
                        properties: {
                            filePath: { type: 'string' },
                            fileType: { type: 'string' },
                            analysisGoal: { type: 'string' }
                        },
                        required: ['filePath', 'fileType']
                    },
                    output: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            data: { type: 'object' },
                            message: { type: 'string' }
                        }
                    }
                };
            }
        };
    }

    /**
     * 生成工具参数定义
     */
    private generateParameters(analysisTool: AnalysisTool): ToolParameter[] {
        return [
            {
                name: 'filePath',
                type: 'string',
                required: true,
                description: '要分析的文件路径'
            },
            {
                name: 'fileType',
                type: 'string',
                required: true,
                description: '文件类型标识'
            },
            {
                name: 'analysisGoal',
                type: 'string',
                required: false,
                description: '分析目标',
                defaultValue: 'general_analysis'
            }
        ];
    }

    /**
     * 转换AgentContext为AnalysisContext
     */
    private convertAgentContextToAnalysisContext(agentContext: any): any {
        return {
            jobPath: agentContext.workspaceState?.currentJobFolder || '',
            userQuery: agentContext.currentTask || '',
            discoveredFiles: [],
            analysisGoals: [agentContext.currentTask || ''],
            intermediateResults: new Map(),
            sharedKnowledge: {},
            executionPlan: [],
            currentStep: 0,
            preferences: {
                analysisDepth: agentContext.userPreferences?.preferredAnalysisDepth || 'detailed',
                language: agentContext.userPreferences?.language || 'zh'
            }
        };
    }
}

/**
 * 创建全局工具适配器实例
 */
export function createToolAdapter(logger: Logger): ToolAdapter {
    return new ToolAdapter(logger);
} 
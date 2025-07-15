import { BaseTool } from './BaseTool';
import { ToolInput, ToolOutput } from '../../../framework/types/ToolTypes';
import { analyzeScopeRuntimeStatistics } from '../../../functions/extractRuntime2';
import { Logger } from '../../../functions/logger';

/**
 * Runtime2提取工具
 * 负责解析__ScopeRuntimeStatistics__.xml文件，提取运行时详细统计数据
 */
export class ExtractRuntime2Tool extends BaseTool {
    public name = 'extractRuntime2';
    public description = '解析__ScopeRuntimeStatistics__.xml文件，提取运行时详细统计数据';

    constructor(logger?: Logger) {
        super(logger || new Logger('ExtractRuntime2Tool'));
    }

    async execute(input: ToolInput): Promise<ToolOutput> {
        try {
            this.validateInput(input);
            
            // 调用现有的extractRuntime2函数
            const runtime2Data = await analyzeScopeRuntimeStatistics(input.filePath);
            
            // 将runtime2Data存储到intermediateResults中，供ExtractOperatorTool使用
            if (input.context?.intermediateResults) {
                input.context.intermediateResults.set('runtime2Data', runtime2Data);
                this.logger.info(`Runtime2数据已存储到intermediateResults中，供ExtractOperatorTool使用`);
            }
            
            return this.createOutput({
                runtimeStats: runtime2Data,
                summary: this.summarizeRuntimeStats(runtime2Data)
            });
        } catch (error) {
            this.logger.error(`执行ExtractRuntime2Tool时发生错误: ${error}`);
            return this.createOutput(null, false, [(error as Error).message]);
        }
    }

    private summarizeRuntimeStats(stats: any): any {
        // 这里可以添加更多的统计信息汇总逻辑
        return {
            totalVertices: stats.vertices?.length || 0,
            totalOperators: stats.operators?.length || 0,
            executionTime: stats.executionTime,
            dataProcessed: stats.dataProcessed
        };
    }
} 
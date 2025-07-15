import { BaseTool } from './BaseTool';
import { ToolInput, ToolOutput } from '../../../framework/types/ToolTypes';
import { parseAndAnalyzeScopeVertices } from '../../../functions/extractOperator';
import { Logger } from '../../../functions/logger';

/**
 * 算子提取工具
 * 负责解析和分析SCOPE作业中的算子信息
 */
export class ExtractOperatorTool extends BaseTool {
    public name = 'extractOperator';
    public description = '解析和分析SCOPE作业中的算子信息，支持与Runtime2数据联合分析';

    constructor(logger?: Logger) {
        super(logger || new Logger('ExtractOperatorTool'));
    }

    async execute(input: ToolInput): Promise<ToolOutput> {
        try {
            this.validateInput(input);
            
            // 获取Runtime2数据进行增强分析
            const runtime2Data = input.context?.intermediateResults?.get('runtime2Data');
            if (!runtime2Data) {
                this.logger.warn('未找到Runtime2数据，将只进行基础算子分析');
            }
            
            // 调用现有的extractOperator函数
            const operatorData = await parseAndAnalyzeScopeVertices(input.filePath, runtime2Data);
            
            return this.createOutput({
                analysis: operatorData,
                hasRuntimeEnhancement: !!runtime2Data,
                note: runtime2Data ? "已使用Runtime2数据进行增强分析" : "仅进行基础算子分析"
            });
        } catch (error) {
            this.logger.error(`执行ExtractOperatorTool时发生错误: ${error}`);
            return this.createOutput(null, false, [(error as Error).message]);
        }
    }


} 
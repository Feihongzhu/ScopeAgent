import { BaseTool } from './BaseTool';
import { ToolInput, ToolOutput } from '../../../framework/types/ToolTypes';
import { formatScopeVertexAnalysis, parseScopeVertexXML } from '../../../functions/extractVertex';
import { Logger } from '../../../functions/logger';

/**
 * 顶点提取工具
 * 负责解析ScopeVertexDef文件，提取顶点定义信息
 */
export class ExtractVertexTool extends BaseTool {
    public name = 'extractVertex';
    public description = '解析ScopeVertexDef文件，提取顶点定义信息';

    constructor(logger?: Logger) {
        super(logger || new Logger('ExtractVertexTool'));
    }

    async execute(input: ToolInput): Promise<ToolOutput> {
        try {
            this.validateInput(input);
            
            // 调用现有的extractVertex函数
            const vertexData = await parseScopeVertexXML(input.filePath);
            
            return this.createOutput({
                vertices: vertexData,
                summary: {
                    totalVertices: vertexData.length,
                    analysis: formatScopeVertexAnalysis(vertexData)
                }
            });
        } catch (error) {
            this.logger.error(`执行ExtractVertexTool时发生错误: ${error}`);
            return this.createOutput(null, false, [(error as Error).message]);
        }
    }

} 
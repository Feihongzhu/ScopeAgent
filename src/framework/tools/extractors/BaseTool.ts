import { Logger } from '../../../functions/logger';
import { ToolInput, ToolOutput, ToolConfig } from '../../../framework/types/ToolTypes';

/**
 * 所有提取工具的基类
 */
export abstract class BaseTool {
    protected logger: Logger;

    constructor(logger?: Logger) {
        this.logger = logger || new Logger(this.constructor.name);
    }

    abstract name: string;
    abstract description: string;

    /**
     * 执行工具
     */
    abstract execute(input: ToolInput): Promise<ToolOutput>;

    /**
     * 配置工具
     */
    configure(config: ToolConfig): void {
        // 默认实现，子类可以覆盖
        this.logger.info(`配置工具 ${this.name}`);
    }

    /**
     * 验证输入
     */
    protected validateInput(input: ToolInput): boolean {
        if (!input.filePath) {
            throw new Error(`${this.name}: 缺少必需的filePath参数`);
        }
        return true;
    }

    /**
     * 创建标准输出
     */
    protected createOutput(data: any, success: boolean = true, errors: string[] = []): ToolOutput {
        return {
            success,
            data,
            metadata: {
                toolName: this.name,
                timestamp: new Date().toISOString()
            },
            errors
        };
    }
} 
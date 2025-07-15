/**
 * SCOPE文件定义系统
 * 定义所有支持的SCOPE文件类型和处理策略
 */

import { SCOPEFileDefinition, ProcessingStrategy } from '../types/FrameworkTypes';

/**
 * 预定义的SCOPE文件类型
 * 基于实际job文件夹中的文件结构
 */
export const SCOPE_FILE_DEFINITIONS: SCOPEFileDefinition[] = [
    // 核心分析文件（优先级最高的4个文件）
    {
        fileType: "SCOPE_SCRIPT",
        pattern: /^scope\.script$/i,
        description: "用户提交的原始SCOPE脚本代码",
        readerTool: "SCOPEScriptIntelligentReader", // 智能读取，保留关键代码段
        priority: 10,
        category: 'script',
        required: true,
        processingStrategy: ProcessingStrategy.INTELLIGENT_SEGMENTATION // 智能分段策略
    },
    
    {
        fileType: "CODEGEN_CS",
        pattern: /^__ScopeCodeGen__\.dll\.cs$/i,
        description: "生成的C#源代码，包含编译时生成的所有执行逻辑",
        readerTool: "CSCodeReader",
        priority: 9,
        category: 'generated',
        required: true,
        processingStrategy: ProcessingStrategy.SUMMARY_WITH_KEY_METHODS
    },
    {
        fileType: "RUNTIME_STATS",
        pattern: /^__ScopeRuntimeStatistics__\.xml$/i,
        description: "作业执行期间运行时的详细统计数据",
        readerTool: "extractRuntime2", // 使用现有函数
        priority: 6,
        category: 'statistics',
        required: false,
        processingStrategy: ProcessingStrategy.RUNTIME_ANALYSIS
    },
    
    {
        fileType: "ERROR_INFO",
        pattern: /^Error$/i,
        description: "作业执行过程中的错误详细信息",
        readerTool: "ErrorLogReader",
        priority: 8,
        category: 'diagnostics',
        required: false,
        processingStrategy: ProcessingStrategy.ERROR_ANALYSIS
    },
    
    {
        fileType: "VERTEX_DEFINITION",
        pattern: /^ScopeVertexDef(\.xml)?$/i,
        description: "定义作业中的各个计算节点（Vertex）的详细配置信息和参数",
        readerTool: "extractOperator", // 使用现有函数
        priority: 8,
        category: 'execution_plan',
        required: true,
        processingStrategy: ProcessingStrategy.VERTEX_ANALYSIS
    },
    
    // 补充分析文件
    // {
    //     fileType: "JOB_STATISTICS",
    //     pattern: /^JobStatistics\.xml$/i,
    //     description: "作业执行完成后的统计信息，包括每个阶段执行时长、数据量统计等",
    //     readerTool: "extractRuntime2", // 使用现有函数
    //     priority: 9,
    //     category: 'statistics',
    //     required: true,
    //     processingStrategy: ProcessingStrategy.STRUCTURED_EXTRACTION
    // },
    // {
    //     fileType: "JOB_INFO",
    //     pattern: /^JobInfo\.xml$/i,
    //     description: "作业的基本信息，如Job ID、提交时间、作业类型、资源需求等",
    //     readerTool: "XMLInfoReader",
    //     priority: 6,
    //     category: 'metadata',
    //     required: false,
    //     processingStrategy: ProcessingStrategy.BASIC_INFO_EXTRACTION
    // },
    
    // {
    //     fileType: "ALGEBRA_PLAN",
    //     pattern: /^Algebra\.xml$/i,
    //     description: "以XML格式记录作业执行的查询计划，展现底层算子逻辑与依赖关系",
    //     readerTool: "AlgebraPlanReader",
    //     priority: 7,
    //     category: 'execution_plan',
    //     required: false,
    //     processingStrategy: ProcessingStrategy.PLAN_ANALYSIS
    // },
    
    // {
    //     fileType: "PROFILE_DATA",
    //     pattern: /^profile$/i,
    //     description: "作业性能分析数据，可用来深入分析节点级别的资源占用情况",
    //     readerTool: "ProfileDataReader",
    //     priority: 5,
    //     category: 'profiling',
    //     required: false,
    //     processingStrategy: ProcessingStrategy.PERFORMANCE_PROFILING
    // }
];

/**
 * 文件定义管理器
 */
export class FileDefinitionManager {
    private definitions: Map<string, SCOPEFileDefinition>;
    
    constructor() {
        this.definitions = new Map();
        this.loadDefinitions();
    }
    
    /**
     * 加载文件定义
     */
    private loadDefinitions(): void {
        SCOPE_FILE_DEFINITIONS.forEach(def => {
            this.definitions.set(def.fileType, def);
        });
    }
    
    /**
     * 根据文件名识别文件类型
     */
    identifyFileType(fileName: string): SCOPEFileDefinition | null {
        for (const definition of this.definitions.values()) {
            if (definition.pattern.test(fileName)) {
                return definition;
            }
        }
        return null;
    }
    
    /**
     * 获取所有必需文件类型
     */
    getRequiredFileTypes(): SCOPEFileDefinition[] {
        return Array.from(this.definitions.values())
            .filter(def => def.required)
            .sort((a, b) => b.priority - a.priority);
    }
    
    /**
     * 获取所有可选文件类型
     */
    getOptionalFileTypes(): SCOPEFileDefinition[] {
        return Array.from(this.definitions.values())
            .filter(def => !def.required)
            .sort((a, b) => b.priority - a.priority);
    }
    
    /**
     * 根据类别获取文件定义
     */
    getFilesByCategory(category: string): SCOPEFileDefinition[] {
        return Array.from(this.definitions.values())
            .filter(def => def.category === category)
            .sort((a, b) => b.priority - a.priority);
    }
    
    /**
     * 获取指定文件类型的定义
     */
    getDefinition(fileType: string): SCOPEFileDefinition | undefined {
        return this.definitions.get(fileType);
    }
    
    /**
     * 获取所有文件定义，按优先级排序
     */
    getAllDefinitions(): SCOPEFileDefinition[] {
        return Array.from(this.definitions.values())
            .sort((a, b) => b.priority - a.priority);
    }
    
    /**
     * 检查文件是否为核心分析文件（前4个优先级最高的必需文件）
     */
    isCoreAnalysisFile(fileType: string): boolean {
        const coreTypes = ['SCOPE_SCRIPT', 'CODEGEN_CS', 'JOB_STATISTICS', 'VERTEX_DEFINITION'];
        return coreTypes.includes(fileType);
    }
    
    /**
     * 获取文件的预期读取工具
     */
    getReaderTool(fileType: string): string | null {
        const definition = this.definitions.get(fileType);
        return definition ? definition.readerTool : null;
    }
    
    /**
     * 获取文件的处理策略
     */
    getProcessingStrategy(fileType: string): ProcessingStrategy | null {
        const definition = this.definitions.get(fileType);
        return definition ? definition.processingStrategy : null;
    }
}

/**
 * 全局文件定义管理器实例
 */
export const fileDefinitionManager = new FileDefinitionManager(); 
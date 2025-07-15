import { BaseTool } from './BaseTool';
import { ToolInput, ToolOutput } from '../../../framework/types/ToolTypes';
import { Logger } from '../../../functions/logger';
import * as fs from 'fs';

// 定义结构元素接口
interface StructureElement {
    line: number;
    content: string;
}

// 定义文件结构接口
interface FileStructure {
    declarations: StructureElement[];
    dataOperations: StructureElement[];
    controlFlow: StructureElement[];
    outputs: StructureElement[];
}

// 定义关键代码段接口
interface CriticalSection {
    type: string;
    description: string;
    startLine: number;
    endLine: number;
    lineRange: number[];
    lines: string[];
}

// 定义性能热点接口
interface PerformanceHotspot {
    line: number;
    type: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
    content: string;
}

// 定义可扩展范围接口
interface ExpandableRange {
    description: string;
    startLine: number;
    endLine: number;
    estimatedLines: number;
    hint: string;
}

/**
 * SCOPE脚本智能读取工具
 * 参考AI阅读代码的方式，使用分层智能读取策略：
 * 1. 结构层：提供文件结构概览和行号映射
 * 2. 选择层：智能选择关键代码段（保留原代码）
 * 3. 深入层：提供按需深入特定范围的机制
 */
export class ScopeScriptReaderTool extends BaseTool {
    public name = 'SCOPEScriptIntelligentReader';
    public description = '智能读取SCOPE脚本，使用分层策略平衡代码完整性与token效率';

    constructor(logger?: Logger) {
        super(logger || new Logger('ScopeScriptReaderTool'));
    }

    async execute(input: ToolInput): Promise<ToolOutput> {
        try {
            this.validateInput(input);
            
            // 读取文件内容
            const scriptContent = await fs.promises.readFile(input.filePath, 'utf8');
            const lines = scriptContent.split('\n');
            
            // 分层智能读取策略
            const analysis = await this.layeredIntelligentReading(lines);
            
            return this.createOutputWithMetadata({
                // 结构层：文件结构概览
                structure: analysis.structure,
                
                // 选择层：关键代码段（保留原代码）
                criticalSections: analysis.criticalSections,
                
                // 深入层：按需读取的行号范围映射
                expandableRanges: analysis.expandableRanges,
                
                // 性能关注点
                performanceHotspots: analysis.performanceHotspots,
                
                // 快速定位信息
                quickNav: analysis.quickNav,
                
                // 文件基本信息
                fileInfo: {
                    totalLines: lines.length,
                    filePath: input.filePath,
                    criticalLinesCount: analysis.criticalSections.reduce((sum: number, section: CriticalSection) => sum + section.lines.length, 0)
                }
            }, true, [], {
                totalLines: lines.length,
                criticalSections: analysis.criticalSections.length,
                tokenEstimate: this.estimateTokens(analysis),
                readingStrategy: 'layered_intelligent'
            });
        } catch (error) {
            this.logger.error(`执行ScopeScriptReaderTool时发生错误: ${error}`);
            return this.createOutput(null, false, [(error as Error).message]);
        }
    }

    /**
     * 分层智能读取算法
     * 模拟AI阅读代码的方式
     */
    private async layeredIntelligentReading(lines: string[]) {
        const structure = this.analyzeFileStructure(lines);
        const criticalSections = this.extractCriticalSections(lines, structure);
        const expandableRanges = this.identifyExpandableRanges(lines, criticalSections);
        const performanceHotspots = this.identifyPerformanceHotspots(lines);
        const quickNav = this.buildQuickNavigation(structure, criticalSections);

        return {
            structure,
            criticalSections,
            expandableRanges,
            performanceHotspots,
            quickNav
        };
    }

    /**
     * 分析文件结构（类似AI先了解整体结构）
     */
    private analyzeFileStructure(lines: string[]): FileStructure {
        const structure: FileStructure = {
            declarations: [],
            dataOperations: [],
            controlFlow: [],
            outputs: []
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim().toUpperCase();
            const originalLine = lines[i];
            
            if (line.startsWith('DECLARE') || line.startsWith('SET')) {
                structure.declarations.push({ line: i + 1, content: originalLine.trim() });
            } else if (line.startsWith('EXTRACT') || line.startsWith('SELECT') || line.startsWith('FROM')) {
                structure.dataOperations.push({ line: i + 1, content: originalLine.trim() });
            } else if (line.includes('JOIN') || line.includes('WHERE') || line.includes('GROUP BY') || line.includes('ORDER BY')) {
                structure.controlFlow.push({ line: i + 1, content: originalLine.trim() });
            } else if (line.startsWith('OUTPUT') || line.startsWith('PRODUCE')) {
                structure.outputs.push({ line: i + 1, content: originalLine.trim() });
            }
        }

        return structure;
    }

    /**
     * 提取关键代码段（保留原代码，智能选择）
     */
    private extractCriticalSections(lines: string[], structure: FileStructure): CriticalSection[] {
        const criticalSections: CriticalSection[] = [];
        const processedLines = new Set<number>();

        // 1. 提取复杂JOIN操作
        const joinSections = this.extractJoinSections(lines);
        criticalSections.push(...joinSections);
        joinSections.forEach(section => {
            section.lineRange.forEach((lineNum: number) => processedLines.add(lineNum));
        });

        // 2. 提取聚合和窗口函数
        const aggregationSections = this.extractAggregationSections(lines);
        criticalSections.push(...aggregationSections);
        aggregationSections.forEach(section => {
            section.lineRange.forEach((lineNum: number) => processedLines.add(lineNum));
        });

        // 3. 提取性能关键的操作
        const performanceCriticalSections = this.extractPerformanceCriticalSections(lines);
        criticalSections.push(...performanceCriticalSections);
        performanceCriticalSections.forEach(section => {
            section.lineRange.forEach((lineNum: number) => processedLines.add(lineNum));
        });

        // 4. 提取重要的声明和输出
        const importantDeclarations = this.extractImportantDeclarations(lines, structure);
        criticalSections.push(...importantDeclarations);

        return criticalSections;
    }

    /**
     * 提取JOIN操作段
     */
    private extractJoinSections(lines: string[]): CriticalSection[] {
        const joinSections: CriticalSection[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim().toUpperCase();
            
            if (line.includes('JOIN')) {
                const section = this.extractContextualSection(lines, i, {
                    type: 'JOIN_OPERATION',
                    description: 'JOIN操作及其上下文',
                    beforeContext: 2,
                    afterContext: 2
                });
                joinSections.push(section);
            }
        }
        
        return joinSections;
    }

    /**
     * 提取聚合操作段
     */
    private extractAggregationSections(lines: string[]): CriticalSection[] {
        const aggregationSections: CriticalSection[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim().toUpperCase();
            
            if (line.includes('GROUP BY') || line.includes('HAVING') || 
                line.includes('SUM(') || line.includes('COUNT(') || 
                line.includes('AVG(') || line.includes('MAX(') || line.includes('MIN(')) {
                
                const section = this.extractContextualSection(lines, i, {
                    type: 'AGGREGATION',
                    description: '聚合操作及其上下文',
                    beforeContext: 1,
                    afterContext: 1
                });
                aggregationSections.push(section);
            }
        }
        
        return aggregationSections;
    }

    /**
     * 提取性能关键操作段
     */
    private extractPerformanceCriticalSections(lines: string[]): CriticalSection[] {
        const performanceSections: CriticalSection[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim().toUpperCase();
            
            if (line.includes('CROSS JOIN') || line.includes('ORDER BY') || 
                line.includes('DISTINCT') || line.includes('UNION')) {
                
                const section = this.extractContextualSection(lines, i, {
                    type: 'PERFORMANCE_CRITICAL',
                    description: '性能关键操作',
                    beforeContext: 1,
                    afterContext: 1
                });
                performanceSections.push(section);
            }
        }
        
        return performanceSections;
    }

    /**
     * 提取重要声明
     */
    private extractImportantDeclarations(lines: string[], structure: FileStructure): CriticalSection[] {
        const declarations: CriticalSection[] = [];
        
        // 只选择最重要的声明（复杂的或影响性能的）
        structure.declarations.forEach((decl: StructureElement) => {
            const line = decl.content.toUpperCase();
            if (line.includes('DECLARE') && (line.includes('TABLE') || line.includes('VIEW') || line.length > 50)) {
                declarations.push({
                    type: 'IMPORTANT_DECLARATION',
                    description: '重要声明',
                    startLine: decl.line,
                    endLine: decl.line,
                    lineRange: [decl.line],
                    lines: [lines[decl.line - 1]]
                });
            }
        });
        
        return declarations;
    }

    /**
     * 提取上下文相关的代码段
     */
    private extractContextualSection(lines: string[], centerLine: number, config: any): CriticalSection {
        const startLine = Math.max(0, centerLine - config.beforeContext);
        const endLine = Math.min(lines.length - 1, centerLine + config.afterContext);
        
        const sectionLines: string[] = [];
        const lineRange: number[] = [];
        
        for (let i = startLine; i <= endLine; i++) {
            sectionLines.push(lines[i]);
            lineRange.push(i + 1); // 1-based line numbers
        }
        
        return {
            type: config.type,
            description: config.description,
            startLine: startLine + 1,
            endLine: endLine + 1,
            lineRange,
            lines: sectionLines
        };
    }

    /**
     * 识别可扩展范围（按需深入）
     */
    private identifyExpandableRanges(lines: string[], criticalSections: CriticalSection[]): ExpandableRange[] {
        const expandableRanges: ExpandableRange[] = [];
        const coveredLines = new Set<number>();
        
        // 标记已覆盖的行
        criticalSections.forEach(section => {
            section.lineRange.forEach((lineNum: number) => coveredLines.add(lineNum));
        });
        
        // 识别未覆盖的重要范围
        let rangeStart: number | null = null;
        for (let i = 0; i < lines.length; i++) {
            const lineNum = i + 1;
            const line = lines[i].trim();
            
            if (!coveredLines.has(lineNum) && line.length > 0 && !line.startsWith('//')) {
                if (rangeStart === null) {
                    rangeStart = lineNum;
                }
            } else if (rangeStart !== null) {
                // 结束一个范围
                if (lineNum - rangeStart > 2) { // 只有足够长的范围才值得扩展
                    expandableRanges.push({
                        description: `可扩展范围 (${rangeStart}-${lineNum - 1})`,
                        startLine: rangeStart,
                        endLine: lineNum - 1,
                        estimatedLines: lineNum - rangeStart,
                        hint: this.getExpandableHint(lines, rangeStart - 1, lineNum - 1)
                    });
                }
                rangeStart = null;
            }
        }
        
        return expandableRanges;
    }

    /**
     * 获取可扩展范围的提示
     */
    private getExpandableHint(lines: string[], startIndex: number, endIndex: number): string {
        const sampleLines = lines.slice(startIndex, Math.min(endIndex, startIndex + 3));
        const preview = sampleLines.map(line => line.trim()).join(' ').substring(0, 100);
        return `${preview}...`;
    }

    /**
     * 识别性能热点
     */
    private identifyPerformanceHotspots(lines: string[]): PerformanceHotspot[] {
        const hotspots: PerformanceHotspot[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim().toUpperCase();
            
            if (line.includes('CROSS JOIN')) {
                hotspots.push({
                    line: i + 1,
                    type: 'CROSS_JOIN',
                    severity: 'HIGH',
                    description: '笛卡尔积连接，可能影响性能',
                    content: lines[i].trim()
                });
            } else if (line.includes('ORDER BY') && line.split(',').length > 2) {
                hotspots.push({
                    line: i + 1,
                    type: 'COMPLEX_SORT',
                    severity: 'MEDIUM',
                    description: '复杂排序操作',
                    content: lines[i].trim()
                });
            }
        }
        
        return hotspots;
    }

    /**
     * 构建快速导航
     */
    private buildQuickNavigation(structure: FileStructure, criticalSections: CriticalSection[]) {
        return {
            declarations: structure.declarations.slice(0, 5), // 只显示前5个
            dataOperations: structure.dataOperations.slice(0, 5),
            criticalSections: criticalSections.map(section => ({
                type: section.type,
                description: section.description,
                lineRange: `${section.startLine}-${section.endLine}`
            })),
            outputs: structure.outputs
        };
    }

    /**
     * 估算token数量
     */
    private estimateTokens(analysis: any): number {
        const criticalTokens = analysis.criticalSections.reduce((sum: number, section: CriticalSection) => {
            return sum + section.lines.join('\n').length;
        }, 0) / 4;
        
        const structureTokens = JSON.stringify(analysis.structure).length / 4;
        const metadataTokens = 500; // 元数据开销
        
        return Math.ceil(criticalTokens + structureTokens + metadataTokens);
    }

    /**
     * 创建带有额外元数据的输出
     */
    private createOutputWithMetadata(data: any, success: boolean = true, errors: string[] = [], additionalMetadata: any = {}): ToolOutput {
        return {
            success,
            data,
            metadata: {
                toolName: this.name,
                timestamp: new Date().toISOString(),
                ...additionalMetadata
            },
            errors
        };
    }
} 
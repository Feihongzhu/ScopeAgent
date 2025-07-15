import { BaseTool } from './BaseTool';
import { ToolInput, ToolOutput } from '../../../framework/types/ToolTypes';
import { Logger } from '../../../functions/logger';
import * as fs from 'fs';

// 定义类信息接口
interface ClassInfo {
    name: string;
    line: number;
    methods: MethodInfo[];
}

// 定义方法信息接口
interface MethodInfo {
    name: string;
    signature: string;
    startLine: number;
    endLine: number;
    isKeyMethod: boolean;
    complexity: 'LOW' | 'MEDIUM' | 'HIGH';
}

// 定义关键代码段接口
interface CriticalCodeSection {
    type: string;
    description: string;
    startLine: number;
    endLine: number;
    lineRange: number[];
    lines: string[];
    metadata?: any;
}

// 定义性能相关代码接口
interface PerformanceRelevantCode {
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
 * C#代码读取工具
 * 参考AI阅读代码的方式，使用分层智能读取策略：
 * 1. 结构层：分析类和方法结构
 * 2. 选择层：智能选择关键方法和代码段（保留原代码）
 * 3. 深入层：提供按需深入特定方法的机制
 */
export class CSCodeReaderTool extends BaseTool {
    public name = 'CSCodeReader';
    public description = '智能读取C#代码文件，使用分层策略平衡代码完整性与token效率';

    constructor(logger?: Logger) {
        super(logger || new Logger('CSCodeReaderTool'));
    }

    async execute(input: ToolInput): Promise<ToolOutput> {
        try {
            this.validateInput(input);
            
            // 读取文件内容
            const codeContent = await fs.promises.readFile(input.filePath, 'utf8');
            const lines = codeContent.split('\n');
            
            // 分层智能读取策略
            const analysis = await this.layeredIntelligentReading(lines);
            
            return this.createOutputWithMetadata({
                // 结构层：类和方法结构
                codeStructure: analysis.structure,
                
                // 选择层：关键方法和代码段（保留原代码）
                keyMethods: analysis.keyMethods,
                criticalSections: analysis.criticalSections,
                
                // 深入层：按需读取的方法范围映射
                expandableRanges: analysis.expandableRanges,
                
                // 性能相关代码
                performanceRelevantCode: analysis.performanceRelevantCode,
                
                // 快速导航
                quickNav: analysis.quickNav,
                
                // 文件基本信息
                fileInfo: {
                    totalLines: lines.length,
                    filePath: input.filePath,
                    classCount: analysis.structure.classes.length,
                    keyMethodCount: analysis.keyMethods.length,
                    criticalSectionCount: analysis.criticalSections.length
                }
            }, true, [], {
                totalLines: lines.length,
                classCount: analysis.structure.classes.length,
                keyMethodCount: analysis.keyMethods.length,
                tokenEstimate: this.estimateTokens(analysis),
                readingStrategy: 'layered_intelligent'
            });
        } catch (error) {
            this.logger.error(`执行CSCodeReaderTool时发生错误: ${error}`);
            return this.createOutput(null, false, [(error as Error).message]);
        }
    }

    /**
     * 分层智能读取算法
     * 模拟AI阅读代码的方式
     */
    private async layeredIntelligentReading(lines: string[]) {
        const structure = this.analyzeCodeStructure(lines);
        const keyMethods = this.extractKeyMethods(lines, structure);
        const criticalSections = this.extractCriticalSections(lines, structure);
        const expandableRanges = this.identifyExpandableRanges(lines, keyMethods, criticalSections);
        const performanceRelevantCode = this.identifyPerformanceRelevantCode(lines);
        const quickNav = this.buildQuickNavigation(structure, keyMethods);

        return {
            structure,
            keyMethods,
            criticalSections,
            expandableRanges,
            performanceRelevantCode,
            quickNav
        };
    }

    /**
     * 分析代码结构（类似AI先了解整体结构）
     */
    private analyzeCodeStructure(lines: string[]) {
        const structure = {
            classes: [] as ClassInfo[],
            imports: [] as string[],
            namespaces: [] as string[]
        };

        let currentClass: ClassInfo | null = null;
        let braceCount = 0;
        let inMethod = false;
        let currentMethodStart = -1;
        let currentMethodSignature = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // 识别using语句
            if (trimmedLine.startsWith('using ')) {
                structure.imports.push(trimmedLine);
                continue;
            }

            // 识别namespace
            if (trimmedLine.startsWith('namespace ')) {
                structure.namespaces.push(trimmedLine);
                continue;
            }

            // 识别类定义
            if (this.isClassDefinition(trimmedLine)) {
                if (currentClass) {
                    structure.classes.push(currentClass);
                }
                currentClass = {
                    name: this.extractClassName(trimmedLine),
                    line: i + 1,
                    methods: []
                };
                continue;
            }

            // 识别方法定义
            if (currentClass && this.isMethodDefinition(trimmedLine)) {
                currentMethodStart = i;
                currentMethodSignature = trimmedLine;
                inMethod = true;
                braceCount = 0;
                continue;
            }

            // 处理方法内容
            if (inMethod) {
                braceCount += (line.match(/\{/g) || []).length;
                braceCount -= (line.match(/\}/g) || []).length;

                if (braceCount <= 0 && currentMethodStart !== -1) {
                    // 方法结束
                    const methodInfo: MethodInfo = {
                        name: this.extractMethodName(currentMethodSignature),
                        signature: currentMethodSignature,
                        startLine: currentMethodStart + 1,
                        endLine: i + 1,
                        isKeyMethod: this.isKeyMethod(currentMethodSignature, lines.slice(currentMethodStart, i + 1)),
                        complexity: this.calculateComplexity(lines.slice(currentMethodStart, i + 1))
                    };
                    currentClass?.methods.push(methodInfo);
                    inMethod = false;
                    currentMethodStart = -1;
                }
            }
        }

        // 添加最后一个类
        if (currentClass) {
            structure.classes.push(currentClass);
        }

        return structure;
    }

    /**
     * 提取关键方法（保留原代码，智能选择）
     */
    private extractKeyMethods(lines: string[], structure: any): CriticalCodeSection[] {
        const keyMethods: CriticalCodeSection[] = [];

        structure.classes.forEach((classInfo: ClassInfo) => {
            classInfo.methods.forEach((method: MethodInfo) => {
                if (method.isKeyMethod || method.complexity === 'HIGH') {
                    const methodLines = lines.slice(method.startLine - 1, method.endLine);
                    const lineRange = Array.from({length: method.endLine - method.startLine + 1}, (_, i) => method.startLine + i);
                    
                    keyMethods.push({
                        type: 'KEY_METHOD',
                        description: `关键方法: ${method.name} (${method.complexity}复杂度)`,
                        startLine: method.startLine,
                        endLine: method.endLine,
                        lineRange,
                        lines: methodLines,
                        metadata: {
                            className: classInfo.name,
                            methodName: method.name,
                            complexity: method.complexity,
                            signature: method.signature
                        }
                    });
                }
            });
        });

        return keyMethods;
    }

    /**
     * 提取关键代码段
     */
    private extractCriticalSections(lines: string[], structure: any): CriticalCodeSection[] {
        const criticalSections: CriticalCodeSection[] = [];

        // 1. 提取LINQ查询
        const linqSections = this.extractLinqSections(lines);
        criticalSections.push(...linqSections);

        // 2. 提取循环和迭代
        const loopSections = this.extractLoopSections(lines);
        criticalSections.push(...loopSections);

        // 3. 提取异常处理
        const exceptionSections = this.extractExceptionSections(lines);
        criticalSections.push(...exceptionSections);

        return criticalSections;
    }

    /**
     * 提取LINQ查询段
     */
    private extractLinqSections(lines: string[]): CriticalCodeSection[] {
        const linqSections: CriticalCodeSection[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (this.containsLinqOperations(line)) {
                const section = this.extractContextualSection(lines, i, {
                    type: 'LINQ_QUERY',
                    description: 'LINQ查询操作',
                    beforeContext: 1,
                    afterContext: 2
                });
                linqSections.push(section);
            }
        }
        
        return linqSections;
    }

    /**
     * 提取循环段
     */
    private extractLoopSections(lines: string[]): CriticalCodeSection[] {
        const loopSections: CriticalCodeSection[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.includes('foreach') || line.includes('for (') || line.includes('while')) {
                const section = this.extractContextualSection(lines, i, {
                    type: 'LOOP_OPERATION',
                    description: '循环操作',
                    beforeContext: 1,
                    afterContext: 3
                });
                loopSections.push(section);
            }
        }
        
        return loopSections;
    }

    /**
     * 提取异常处理段
     */
    private extractExceptionSections(lines: string[]): CriticalCodeSection[] {
        const exceptionSections: CriticalCodeSection[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.includes('try') || line.includes('catch') || line.includes('finally')) {
                const section = this.extractContextualSection(lines, i, {
                    type: 'EXCEPTION_HANDLING',
                    description: '异常处理',
                    beforeContext: 1,
                    afterContext: 2
                });
                exceptionSections.push(section);
            }
        }
        
        return exceptionSections;
    }

    /**
     * 提取上下文相关的代码段
     */
    private extractContextualSection(lines: string[], centerLine: number, config: any): CriticalCodeSection {
        const startLine = Math.max(0, centerLine - config.beforeContext);
        const endLine = Math.min(lines.length - 1, centerLine + config.afterContext);
        
        const sectionLines: string[] = [];
        const lineRange: number[] = [];
        
        for (let i = startLine; i <= endLine; i++) {
            sectionLines.push(lines[i]);
            lineRange.push(i + 1);
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
     * 识别可扩展范围
     */
    private identifyExpandableRanges(lines: string[], keyMethods: CriticalCodeSection[], criticalSections: CriticalCodeSection[]): ExpandableRange[] {
        const expandableRanges: ExpandableRange[] = [];
        const coveredLines = new Set<number>();
        
        // 标记已覆盖的行
        [...keyMethods, ...criticalSections].forEach(section => {
            section.lineRange.forEach((lineNum: number) => coveredLines.add(lineNum));
        });
        
        // 识别未覆盖的方法范围
        let rangeStart: number | null = null;
        for (let i = 0; i < lines.length; i++) {
            const lineNum = i + 1;
            const line = lines[i].trim();
            
            if (!coveredLines.has(lineNum) && line.length > 0 && !line.startsWith('//')) {
                if (rangeStart === null) {
                    rangeStart = lineNum;
                }
            } else if (rangeStart !== null) {
                if (lineNum - rangeStart > 5) {
                    expandableRanges.push({
                        description: `可扩展方法范围 (${rangeStart}-${lineNum - 1})`,
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
     * 识别性能相关代码
     */
    private identifyPerformanceRelevantCode(lines: string[]): PerformanceRelevantCode[] {
        const performanceCode: PerformanceRelevantCode[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // 识别高性能影响的代码
            if (line.includes('ToList()') || line.includes('ToArray()')) {
                performanceCode.push({
                    line: i + 1,
                    type: 'ENUMERABLE_MATERIALIZATION',
                    severity: 'HIGH',
                    description: '枚举物化操作，可能影响性能',
                    content: line.trim()
                });
            } else if (line.includes('foreach') && line.includes('ToList')) {
                performanceCode.push({
                    line: i + 1,
                    type: 'INEFFICIENT_LOOP',
                    severity: 'MEDIUM',
                    description: '可能低效的循环操作',
                    content: line.trim()
                });
            }
        }
        
        return performanceCode;
    }

    /**
     * 构建快速导航
     */
    private buildQuickNavigation(structure: any, keyMethods: CriticalCodeSection[]) {
        return {
            classes: structure.classes.map((cls: ClassInfo) => ({
                name: cls.name,
                line: cls.line,
                methodCount: cls.methods.length
            })),
            keyMethods: keyMethods.map(method => ({
                name: method.metadata?.methodName || 'Unknown',
                className: method.metadata?.className || 'Unknown',
                lineRange: `${method.startLine}-${method.endLine}`,
                complexity: method.metadata?.complexity || 'UNKNOWN'
            })),
            imports: structure.imports.slice(0, 10),
            namespaces: structure.namespaces
        };
    }

    // 辅助方法
    private isClassDefinition(line: string): boolean {
        return /^\s*(public|private|protected|internal)?\s*class\s+\w+/.test(line);
    }

    private extractClassName(line: string): string {
        const match = line.match(/class\s+(\w+)/);
        return match ? match[1] : 'Unknown';
    }

    private isMethodDefinition(line: string): boolean {
        return /^\s*(public|private|protected|internal|static).*\s+\w+\s*\([^)]*\)\s*\{?/.test(line);
    }

    private extractMethodName(signature: string): string {
        const match = signature.match(/\s+(\w+)\s*\(/);
        return match ? match[1] : 'Unknown';
    }

    private isKeyMethod(signature: string, methodLines: string[]): boolean {
        const keyFeatures = [
            'Process', 'Execute', 'Transform', 'Aggregate', 'Join', 'Filter',
            'Select', 'Where', 'GroupBy', 'OrderBy', 'Distinct', 'Union'
        ];
        
        const hasKeyName = keyFeatures.some(feature => 
            signature.toUpperCase().includes(feature.toUpperCase())
        );
        
        const hasComplexLogic = methodLines.some(line => 
            line.includes('foreach') || line.includes('while') || line.includes('for')
        );
        
        return hasKeyName || hasComplexLogic || methodLines.length > 20;
    }

    private calculateComplexity(methodLines: string[]): 'LOW' | 'MEDIUM' | 'HIGH' {
        const complexity = methodLines.filter(line => 
            line.includes('if') || line.includes('for') || line.includes('while') || 
            line.includes('foreach') || line.includes('switch')
        ).length;
        
        if (complexity > 10) return 'HIGH';
        if (complexity > 5) return 'MEDIUM';
        return 'LOW';
    }

    private containsLinqOperations(line: string): boolean {
        const linqOperations = [
            'Select(', 'Where(', 'GroupBy(', 'OrderBy(', 'Join(',
            'Aggregate(', 'Any(', 'All(', 'Count(', 'Sum(', 'Average('
        ];
        
        return linqOperations.some(op => line.includes(op));
    }

    /**
     * 估算token数量
     */
    private estimateTokens(analysis: any): number {
        const keyMethodTokens = analysis.keyMethods.reduce((sum: number, method: CriticalCodeSection) => {
            return sum + method.lines.join('\n').length;
        }, 0) / 4;
        
        const criticalSectionTokens = analysis.criticalSections.reduce((sum: number, section: CriticalCodeSection) => {
            return sum + section.lines.join('\n').length;
        }, 0) / 4;
        
        const structureTokens = JSON.stringify(analysis.structure).length / 4;
        const metadataTokens = 500;
        
        return Math.ceil(keyMethodTokens + criticalSectionTokens + structureTokens + metadataTokens);
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
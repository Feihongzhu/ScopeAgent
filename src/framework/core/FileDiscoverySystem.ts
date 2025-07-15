/**
 * SCOPE作业文件发现系统
 * 负责自动发现、分类和验证SCOPE作业文件
 */

import * as fs from 'fs';
import * as path from 'path';
import { DiscoveredFile, ValidationResult, SCOPEFileDefinition } from '../types/FrameworkTypes';
import { fileDefinitionManager } from './FileDefinitions';
import { Logger } from '../../functions/logger';

/**
 * 文件发现系统
 */
export class FileDiscoverySystem {
    private logger: Logger;
    
    constructor(logger?: Logger) {
        this.logger = logger || new Logger('FileDiscoverySystem');
    }
    
    /**
     * 自动发现和分类SCOPE作业文件
     * @param jobPath job文件夹路径
     * @returns 发现的文件列表
     */
    async discoverFiles(jobPath: string): Promise<DiscoveredFile[]> {
        this.logger.info(`开始扫描SCOPE作业文件夹: ${jobPath}`);
        
        try {
            // 检查路径是否存在
            if (!fs.existsSync(jobPath)) {
                this.logger.error(`作业路径不存在: ${jobPath}`);
                return [];
            }
            
            // 检查是否为目录
            const stats = fs.statSync(jobPath);
            if (!stats.isDirectory()) {
                this.logger.error(`指定路径不是目录: ${jobPath}`);
                return [];
            }
            
            // 读取目录内容
            const items = fs.readdirSync(jobPath, { withFileTypes: true });
            const discoveredFiles: DiscoveredFile[] = [];
            
            for (const item of items) {
                if (item.isFile()) {
                    const filePath = path.join(jobPath, item.name);
                    const discoveredFile = await this.analyzeFile(filePath, item.name);
                    
                    if (discoveredFile) {
                        discoveredFiles.push(discoveredFile);
                        this.logger.info(`发现文件: ${item.name} (类型: ${discoveredFile.fileType})`);
                    }
                }
            }
            
            // 按优先级排序
            discoveredFiles.sort((a, b) => b.definition.priority - a.definition.priority);
            
            this.logger.info(`文件发现完成，共找到 ${discoveredFiles.length} 个相关文件`);
            return discoveredFiles;
            
        } catch (error) {
            this.logger.error(`文件发现过程中出错: ${error}`);
            return [];
        }
    }
    
    /**
     * 分析单个文件
     * @param filePath 文件完整路径
     * @param fileName 文件名
     * @returns 发现的文件信息，如果不是SCOPE相关文件则返回null
     */
    private async analyzeFile(filePath: string, fileName: string): Promise<DiscoveredFile | null> {
        try {
            // 首先通过文件名识别类型
            const definition = fileDefinitionManager.identifyFileType(fileName);
            
            if (!definition) {
                // 不是已知的SCOPE文件类型
                return null;
            }
            
            // 获取文件统计信息
            const stats = fs.statSync(filePath);
            
            // 对于某些文件，可能需要检查内容来确认类型
            const confirmedDefinition = await this.confirmFileType(filePath, definition);
            
            return {
                filePath,
                fileType: confirmedDefinition.fileType,
                definition: confirmedDefinition,
                exists: true,
                size: stats.size,
                lastModified: stats.mtime
            };
            
        } catch (error) {
            this.logger.warn(`分析文件时出错 ${filePath}: ${error}`);
            return null;
        }
    }
    
    /**
     * 根据文件内容智能识别文件类型
     * @param filePath 文件路径
     * @param initialDefinition 基于文件名的初始识别结果
     * @returns 确认后的文件定义
     */
    async identifyFileType(filePath: string): Promise<SCOPEFileDefinition | null> {
        const fileName = path.basename(filePath);
        
        // 首先通过文件名匹配
        let definition = fileDefinitionManager.identifyFileType(fileName);
        
        if (definition) {
            // 通过内容确认文件类型
            return await this.confirmFileType(filePath, definition);
        }
        
        // 如果文件名匹配失败，尝试通过内容识别
        return await this.identifyByContent(filePath);
    }
    
    /**
     * 通过文件内容确认文件类型
     * @param filePath 文件路径
     * @param definition 初始定义
     * @returns 确认后的定义
     */
    private async confirmFileType(filePath: string, definition: SCOPEFileDefinition): Promise<SCOPEFileDefinition> {
        try {
            // 对于某些文件类型，读取部分内容进行确认
            if (definition.fileType === 'SCOPE_SCRIPT') {
                return await this.confirmScopeScript(filePath, definition);
            } else if (definition.fileType === 'JOB_STATISTICS') {
                return await this.confirmXmlFile(filePath, definition, 'JobStatistics');
            } else if (definition.fileType === 'VERTEX_DEFINITION') {
                return await this.confirmXmlFile(filePath, definition, 'ScopeVertexDef');
            }
            
            return definition;
            
        } catch (error) {
            this.logger.warn(`确认文件类型时出错 ${filePath}: ${error}`);
            return definition;
        }
    }
    
    /**
     * 确认SCOPE脚本文件
     */
    private async confirmScopeScript(filePath: string, definition: SCOPEFileDefinition): Promise<SCOPEFileDefinition> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const firstLines = content.split('\n').slice(0, 10).join('\n');
            
            // 检查是否包含SCOPE语法特征
            const scopeKeywords = [
                'EXTRACT', 'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY',
                'OUTPUT', 'USING', 'PRODUCE', 'REDUCE', 'COMBINE'
            ];
            
            const hasKeywords = scopeKeywords.some(keyword => 
                firstLines.toUpperCase().includes(keyword)
            );
            
            if (hasKeywords) {
                this.logger.debug(`确认为SCOPE脚本文件: ${filePath}`);
            } else {
                this.logger.warn(`疑似非标准SCOPE脚本文件: ${filePath}`);
            }
            
            return definition;
            
        } catch (error) {
            this.logger.warn(`读取SCOPE脚本文件时出错: ${error}`);
            return definition;
        }
    }
    
    /**
     * 确认XML文件类型
     */
    private async confirmXmlFile(filePath: string, definition: SCOPEFileDefinition, expectedRoot: string): Promise<SCOPEFileDefinition> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const firstKB = content.substring(0, 1024);
            
            if (firstKB.includes(`<${expectedRoot}`) || firstKB.includes(`<${expectedRoot.toLowerCase()}`)) {
                this.logger.debug(`确认为${expectedRoot} XML文件: ${filePath}`);
            } else {
                this.logger.warn(`XML文件根元素不匹配，期望: ${expectedRoot}, 文件: ${filePath}`);
            }
            
            return definition;
            
        } catch (error) {
            this.logger.warn(`读取XML文件时出错: ${error}`);
            return definition;
        }
    }
    
    /**
     * 通过内容识别未知文件类型
     */
    private async identifyByContent(filePath: string): Promise<SCOPEFileDefinition | null> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const firstKB = content.substring(0, 1024).toLowerCase();
            
            // 尝试通过内容特征识别
            if (firstKB.includes('extract') && firstKB.includes('produce')) {
                // 可能是SCOPE脚本
                const scriptDef = fileDefinitionManager.getDefinition('SCOPE_SCRIPT');
                if (scriptDef) {
                    this.logger.info(`通过内容识别为SCOPE脚本: ${filePath}`);
                    return scriptDef;
                }
            }
            
            if (firstKB.includes('<jobstatistics')) {
                const statsDef = fileDefinitionManager.getDefinition('JOB_STATISTICS');
                if (statsDef) {
                    this.logger.info(`通过内容识别为作业统计文件: ${filePath}`);
                    return statsDef;
                }
            }
            
            return null;
            
        } catch (error) {
            this.logger.warn(`通过内容识别文件类型时出错: ${error}`);
            return null;
        }
    }
    
    /**
     * 验证必需文件是否存在
     * @param discoveredFiles 发现的文件列表
     * @returns 验证结果
     */
    validateRequiredFiles(discoveredFiles: DiscoveredFile[]): ValidationResult {
        const foundFileTypes = new Set(discoveredFiles.map(f => f.fileType));
        const requiredFileTypes = fileDefinitionManager.getRequiredFileTypes();
        
        const missingRequiredFiles: string[] = [];
        const warnings: string[] = [];
        
        // 检查必需文件
        for (const requiredDef of requiredFileTypes) {
            if (!foundFileTypes.has(requiredDef.fileType)) {
                missingRequiredFiles.push(requiredDef.fileType);
            }
        }
        
        // 生成警告
        if (missingRequiredFiles.length > 0) {
            warnings.push(`缺少必需文件: ${missingRequiredFiles.join(', ')}`);
        }
        
        const coreFileTypes = ['SCOPE_SCRIPT', 'JOB_STATISTICS', 'VERTEX_DEFINITION'];
        const foundCoreFiles = coreFileTypes.filter(type => foundFileTypes.has(type));
        
        if (foundCoreFiles.length < 3) {
            warnings.push(`核心分析文件不完整，建议至少包含: scope.script, JobStatistics.xml, ScopeVertexDef`);
        }
        
        const isValid = missingRequiredFiles.length === 0;
        
        return {
            isValid,
            missingRequiredFiles,
            foundFiles: discoveredFiles,
            warnings
        };
    }
    
    /**
     * 获取核心分析文件
     * @param discoveredFiles 发现的文件列表
     * @returns 核心分析文件（4个优先级最高的必需文件）
     */
    getCoreAnalysisFiles(discoveredFiles: DiscoveredFile[]): DiscoveredFile[] {
        return discoveredFiles.filter(file => 
            fileDefinitionManager.isCoreAnalysisFile(file.fileType)
        ).sort((a, b) => b.definition.priority - a.definition.priority);
    }
    
    /**
     * 按类别分组文件
     * @param discoveredFiles 发现的文件列表
     * @returns 按类别分组的文件
     */
    groupFilesByCategory(discoveredFiles: DiscoveredFile[]): Map<string, DiscoveredFile[]> {
        const groups = new Map<string, DiscoveredFile[]>();
        
        for (const file of discoveredFiles) {
            const category = file.definition.category;
            if (!groups.has(category)) {
                groups.set(category, []);
            }
            groups.get(category)!.push(file);
        }
        
        // 对每个分组内的文件按优先级排序
        for (const files of groups.values()) {
            files.sort((a, b) => b.definition.priority - a.definition.priority);
        }
        
        return groups;
    }
    
    /**
     * 生成文件发现报告
     * @param discoveredFiles 发现的文件列表
     * @param validationResult 验证结果
     * @returns 格式化的报告
     */
    generateDiscoveryReport(discoveredFiles: DiscoveredFile[], validationResult: ValidationResult): string {
        const report: string[] = [];
        
        report.push('# SCOPE作业文件发现报告\n');
        
        // 概览
        report.push(`## 概览`);
        report.push(`- 发现文件总数: ${discoveredFiles.length}`);
        report.push(`- 必需文件状态: ${validationResult.isValid ? '✅ 完整' : '❌ 不完整'}`);
        report.push(`- 核心分析文件: ${this.getCoreAnalysisFiles(discoveredFiles).length}/4`);
        report.push('');
        
        // 核心文件
        const coreFiles = this.getCoreAnalysisFiles(discoveredFiles);
        if (coreFiles.length > 0) {
            report.push(`## 核心分析文件`);
            for (const file of coreFiles) {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                report.push(`- ✅ ${path.basename(file.filePath)} (${sizeMB}MB) - ${file.definition.description}`);
            }
            report.push('');
        }
        
        // 缺失文件
        if (validationResult.missingRequiredFiles.length > 0) {
            report.push(`## 缺失的必需文件`);
            for (const missing of validationResult.missingRequiredFiles) {
                const def = fileDefinitionManager.getDefinition(missing);
                report.push(`- ❌ ${missing} - ${def?.description || '未知文件类型'}`);
            }
            report.push('');
        }
        
        // 警告
        if (validationResult.warnings.length > 0) {
            report.push(`## 警告`);
            for (const warning of validationResult.warnings) {
                report.push(`- ⚠️ ${warning}`);
            }
            report.push('');
        }
        
        return report.join('\n');
    }
} 
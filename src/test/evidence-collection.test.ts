/**
 * 阶段1 Evidence收集功能测试
 * 验证collectEvidence方法是否正确工作
 */

import * as assert from 'assert';
import { ScopeOptimizationAgent } from '../core/ScopeAgent';
import { Logger } from '../functions/logger';
import { AgentContext, EvidenceData } from '../types/AgentTypes';

suite('Evidence Collection Tests', () => {
    let agent: ScopeOptimizationAgent;
    let logger: Logger;
    let mockContext: AgentContext;

    setup(() => {
        logger = new Logger('Test Logger');
        agent = new ScopeOptimizationAgent(logger);
        
        // 模拟上下文
        mockContext = {
            userId: 'test-user',
            sessionId: 'test-session',
            conversationHistory: [],
            workspaceState: {
                activeFiles: [],
                recentAnalyses: [],
                currentJobFolder: '/test/job/folder',
                scopeFilesAvailable: true
            },
            userPreferences: {
                optimizationLevel: 'moderate',
                autoApplyFixes: false,
                preferredAnalysisDepth: 'detailed',
                language: 'zh',
                reportFormat: 'markdown'
            },
            timestamp: new Date(),
            availableTools: [],
            memorySnapshot: {}
        };
    });

    test('collectEvidence should return empty data when no tools available', async () => {
        // 测试没有工具时的行为
        const evidenceData = await (agent as any).collectEvidence(mockContext);
        
        assert.strictEqual(evidenceData.hasData, false);
        assert.strictEqual(evidenceData.availableFiles.length, 0);
        assert.ok(evidenceData.collectionTime >= 0);
    });

    test('enhanceContextWithEvidence should add evidence summary to conversation', () => {
        const evidenceData: EvidenceData = {
            runtimeStats: {
                vertexCount: 5,
                timeStats: {
                    executeElapsedTime: 1500
                }
            },
            hasData: true,
            collectionTime: 100,
            availableFiles: ['__ScopeRuntimeStatistics__.xml']
        };

        const enhancedContext = (agent as any).enhanceContextWithEvidence(mockContext, evidenceData);
        
        assert.ok(enhancedContext.conversationHistory.length > 0);
        assert.ok(enhancedContext.conversationHistory[0].content.includes('运行证据摘要'));
        assert.ok(enhancedContext.conversationHistory[0].content.includes('发现5个顶点'));
    });

    test('generateEvidenceSummary should create meaningful summary', () => {
        const evidenceData: EvidenceData = {
            runtimeStats: {
                vertexCount: 3,
                timeStats: {
                    executeElapsedTime: 2000
                }
            },
            errorLogs: {
                hasErrors: true
            },
            hasData: true,
            collectionTime: 150,
            availableFiles: ['__ScopeRuntimeStatistics__.xml', 'Error']
        };

        const summary = (agent as any).generateEvidenceSummary(evidenceData);
        
        assert.ok(summary.includes('运行时统计: 发现3个顶点'));
        assert.ok(summary.includes('总执行时间: 2000ms'));
        assert.ok(summary.includes('错误日志: 发现错误'));
        assert.ok(summary.includes('收集到2个分析文件'));
    });

    test('think method should include evidenceData in result', async () => {
        await agent.initialize();
        
        const thought = await agent.think('分析这个SCOPE脚本的性能问题', mockContext);
        
        assert.ok(thought.evidenceData);
        assert.ok(typeof thought.evidenceData.hasData === 'boolean');
        assert.ok(typeof thought.evidenceData.collectionTime === 'number');
        assert.ok(Array.isArray(thought.evidenceData.availableFiles));
    });
}); 
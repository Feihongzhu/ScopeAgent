import { DOMParser } from 'xmldom';
import * as xpath from 'xpath';
import * as fs from 'fs';

// Key interfaces for ScopeRuntime statistics data
export interface AnalyzeVertexStates{
    mostMemoryIntensive: VertexStats[],
    mostTimeConsuming: VertexStats[],
    mostDataIntensive: VertexStats[],
    allVertices: VertexStats[],
  }


export  interface VertexStats {
    id: string;
    type: string;
    memoryStats: MemoryStats;
    timeStats: TimeStats;
    dataStats: DataStats;
    exceptionStats: ExceptionStats;
    operators: OperatorStats[];
    avgTotalPageFaultCount: number;
    maxTotalPageFaultCount: number;
  }
  
  interface MemoryStats {
    avgExecutionMemoryPeakSize: number;
    avgIOMemoryPeakSize: number;
    avgOverallMemoryPeakSize: number;
    avgPrivateMemoryPeakSize: number;
    avgWorkingSetPeakSize: number;
    maxExecutionMemoryPeakSize: number;
    maxOverallMemoryPeakSize: number;
    maxPrivateMemoryPeakSize: number;
  }
  
  interface TimeStats {
    inclusiveTime: number;
    elapsedTime: number;
    executeElapsedTime: number;
    executeTotalCpuTime: number;
    totalCpuTime: number;
  }
  
  interface DataStats {
    inputBytes: number;
    inputCompressedBytes: number;
    outputBytes: number;
    outputCompressedBytes: number;
  }
  
  interface ExceptionStats {
    cppExceptionCount: number;
    csharpExceptionCount: number;
    otherExceptionCount: number;
  }
  
export  interface OperatorStats {
    id: string;
    rowCount?: number;
    inclusiveTime?: number;
    exclusiveTime?: number;
  }


  /**
   * Function 1: Extract all vertices from ScopeRuntimeStatistics XML
   * 
   * @param xmlContent The XML content as string
   * @returns Array of parsed vertex statistics
   */
function extractVertices(xmlFilePath: string): VertexStats[] {
    const runtimeDoc = fs.readFileSync(xmlFilePath, 'utf-8');
    const parser = new DOMParser();
    const xmlContent = parser.parseFromString(runtimeDoc, "text/xml");

    const vertices: VertexStats[] = [];
    

    // 找到所有SV元素(Stream Vertex)
    const svNodes = xpath.select("//*[starts-with(@id, 'SV')]", xmlContent) as Element[];
  
    if (svNodes.length === 0) {
      // 如果没有找到SV元素，尝试寻找以SV开头的元素
      const allElements = xpath.select("//*[starts-with(name(), 'SV')]", xmlContent) as Element[];
      allElements.forEach(processSvNode);
    } else {
      // 处理找到的SV元素
      svNodes.forEach(processSvNode);
    }
  
    // 处理单个SV节点的函数
    function processSvNode(node: Element): void {
        // Extract the vertex ID and type
        const nodeId = node.nodeName || node.getAttribute('id') || '';
        const vertexType = nodeId.includes('_') ? nodeId.split('_').slice(1).join('_') : '';
        
        const stats: VertexStats = {
          id: nodeId,
          type: vertexType,
          avgTotalPageFaultCount: 0,
          maxTotalPageFaultCount: 0,
          // Adding new properties
          memoryStats: {
            avgExecutionMemoryPeakSize: parseInt(node.getAttribute('avgExecutionMemoryPeakSize') || '0'),
            avgIOMemoryPeakSize: parseInt(node.getAttribute('avgIOMemoryPeakSize') || '0'),
            avgOverallMemoryPeakSize: parseInt(node.getAttribute('avgOverallMemoryPeakSize') || '0'),
            avgPrivateMemoryPeakSize: parseInt(node.getAttribute('avgPrivateMemoryPeakSize') || '0'),
            avgWorkingSetPeakSize: parseInt(node.getAttribute('avgWorkingSetPeakSize') || '0'),
            maxExecutionMemoryPeakSize: parseInt(node.getAttribute('maxExecutionMemoryPeakSize') || '0'),
            maxOverallMemoryPeakSize: parseInt(node.getAttribute('maxOverallMemoryPeakSize') || '0'),
            maxPrivateMemoryPeakSize: parseInt(node.getAttribute('maxPrivateMemoryPeakSize') || '0'),
          },
          exceptionStats: {
            cppExceptionCount: 0,
            csharpExceptionCount: 0,
            otherExceptionCount: 0,
          },
          timeStats: {
            inclusiveTime: 0,
            elapsedTime: 0,
            executeElapsedTime: 0,
            executeTotalCpuTime: 0,
            totalCpuTime: 0,
          },
          dataStats: {
            inputBytes: 0,
            inputCompressedBytes: 0,
            outputBytes: 0,
            outputCompressedBytes: 0,
          },
          operators: []
        };
        
        // Extract time information
        const timeElement = xpath.select1("./Time", node) as Element;
        if (timeElement) {
          stats.timeStats.elapsedTime = parseInt(timeElement.getAttribute('elapsedTime') || '0');
          stats.timeStats.executeElapsedTime = parseInt(timeElement.getAttribute('executeElapsedTime') || '0');
          stats.timeStats.inclusiveTime = parseInt(timeElement.getAttribute('inclusiveTime') || '0');
          stats.timeStats.executeTotalCpuTime = parseInt(timeElement.getAttribute('executeTotalCpuTime') || '0');
          stats.timeStats.totalCpuTime = parseInt(timeElement.getAttribute('totalCpuTime') || '0');
        }
        
        // Extract input statistics
        const inputStats = xpath.select1("./InputStatistics", node) as Element;
        if (inputStats) {
          stats.dataStats.inputBytes = parseInt(inputStats.getAttribute('totalBytes') || '0');
          stats.dataStats.inputCompressedBytes = parseInt(inputStats.getAttribute('totalCompressedBytes') || '0');
        }
        
        // Extract output statistics
        const outputStats = xpath.select1('./OutputStatistics', node) as Element;
        if (outputStats) {
          stats.dataStats.outputBytes = parseInt(outputStats.getAttribute('totalBytes') || '0');
          stats.dataStats.outputCompressedBytes = parseInt(outputStats.getAttribute('totalCompressedBytes') || '0');
        }
        
        // Extract exception counts
        const exceptionElement = xpath.select1("./ExceptionCounts", node) as Element;
        if (exceptionElement) {
          stats.exceptionStats.cppExceptionCount = parseInt(exceptionElement.getAttribute('cppExceptionCount') || '0');
          stats.exceptionStats.csharpExceptionCount = parseInt(exceptionElement.getAttribute('csharpExceptionCount') || '0');
          stats.exceptionStats.otherExceptionCount = parseInt(exceptionElement.getAttribute('otherExceptionCount') || '0');
        }
        
        // Extract page fault information
        const jobObject = xpath.select1("./VertexExecutionJobObject", node) as Element;
        if (jobObject) {
          stats.avgTotalPageFaultCount = parseInt(jobObject.getAttribute('avgTotalPageFaultCount') || '0');
          stats.maxTotalPageFaultCount = parseInt(jobObject.getAttribute('maxTotalPageFaultCount') || '0');
        }
        
        
        // Get operator information (might need to extract multiple operators)
        const operators = xpath.select(".//*[@opId]", node) as Element[];
        stats.operators = operators.map(op => ({
          id: op.getAttribute('opId') || '',
          rowCount: parseInt(op.getAttribute('rowCount') || '0'),
          exclusiveTime: parseInt(op.getAttribute('exclusiveTime') || '0'),
          inclusiveTime: parseInt(op.getAttribute('inclusiveTime') || '0'),
        }));
        
        vertices.push(stats);
    }
  
  return vertices;
}


  /**
   * Function 2: Analyze large vertices based on memory, time, and data metrics
   * 
   * @param vertices List of parsed vertices
   * @returns Statistics about large/significant vertices
   */
  function analyzeSignificantVertices(vertices: VertexStats[]): AnalyzeVertexStates {
    // Sort vertices by memory usage
    const byMemory = [...vertices].sort((a, b) => 
      b.memoryStats.avgOverallMemoryPeakSize - a.memoryStats.avgOverallMemoryPeakSize
    );
    
    // Sort vertices by elapsed time
    const byTime = [...vertices].sort((a, b) => 
      b.timeStats.elapsedTime - a.timeStats.elapsedTime
    );
    
    // Sort vertices by data processed
    const byData = [...vertices].sort((a, b) => 
      (b.dataStats.inputBytes + b.dataStats.outputBytes) - 
      (a.dataStats.inputBytes + a.dataStats.outputBytes)
    );
    
    // Find vertices with exceptions
    // const withExceptions = vertices.filter(v => 
    //   v.exceptionStats.cppExceptionCount > 0 || 
    //   v.exceptionStats.csharpExceptionCount > 0 || 
    //   v.exceptionStats.otherExceptionCount > 0
    // ).sort((a, b) => {
    //   const totalA = a.exceptionStats.cppExceptionCount + a.exceptionStats.csharpExceptionCount + a.exceptionStats.otherExceptionCount;
    //   const totalB = b.exceptionStats.cppExceptionCount + b.exceptionStats.csharpExceptionCount + b.exceptionStats.otherExceptionCount;
    //   return totalB - totalA;
    // });
    
    // top 5
    return {
      mostMemoryIntensive: byMemory.slice(0, 5),
      mostTimeConsuming: byTime.slice(0, 5),
      mostDataIntensive: byData.slice(0, 5),
      allVertices: vertices,
    };
  }
  
  /**
   * Function 3: Format statistics into human-readable text
   * 
   * @param stats The analyzed statistics
   * @returns Formatted text summary
   */
export  function formatStatisticsReport(analysis: ReturnType<typeof analyzeSignificantVertices>): string {
    let report = "# Scope Runtime Statistics Summary\n\n";
    
    const vertices = analysis.allVertices;

    // Overall statistics
    const totalElapsedTime = vertices.reduce((sum, v) => sum + v.timeStats.elapsedTime, 0);
    const totalCpuTime = vertices.reduce((sum, v) => sum + v.timeStats.totalCpuTime, 0);
    const totalInputData = vertices.reduce((sum, v) => sum + v.dataStats.inputBytes, 0);
    const totalOutputData = vertices.reduce((sum, v) => sum + v.dataStats.outputBytes, 0);
    
    report += `## Overall Job Statistics\n`;
    report += `- **Total Elapsed Time**: ${formatTime(totalElapsedTime/1000)}\n`;
    report += `- **Total CPU Time**: ${formatTime(totalCpuTime/1000)}\n`;
    report += `- **Total Input Data**: ${formatBytes(totalInputData)}\n`;
    report += `- **Total Output Data**: ${formatBytes(totalOutputData)}\n`;
    report += `- **Number of Vertices**: ${vertices.length}\n\n`;
    
    // Top 3 memory intensive vertices
    report += `## Top 5 Memory-Intensive Vertices\n`;
    analysis.mostMemoryIntensive.forEach((vertex, i) => {
      report += `${i+1}. **${vertex.id}** (${vertex.type})\n`;
      report += `   - Memory: ${formatBytes(vertex.memoryStats.avgOverallMemoryPeakSize)} avg, ${formatBytes(vertex.memoryStats.maxOverallMemoryPeakSize)} max\n`;
      report += `   - Operators:\n`;
      vertex.operators.forEach(op => {
        report += `     * operator_${op.id}: ${op.rowCount?.toLocaleString() || 'N/A'} rows, ${formatTime((op.inclusiveTime || 0)/1000)} inclusive time\n`;
      });
      report += '\n';
    });
    
    // Top 3 time consuming vertices
    report += `## Top 5 Time-Consuming Vertices\n`;
    analysis.mostTimeConsuming.forEach((vertex, i) => {
      const percentage = (vertex.timeStats.elapsedTime / totalElapsedTime * 100).toFixed(1);
      report += `${i+1}. **${vertex.id}** (${vertex.type})\n`;
      report += `   - Time: ${formatTime(vertex.timeStats.elapsedTime/1000)} (${percentage}% of total time)\n`;
      report += `   - Operators:\n`;
      vertex.operators.forEach(op => {
        report += `     * operator_${op.id}: ${op.rowCount?.toLocaleString() || 'N/A'} rows, ${formatTime((op.inclusiveTime || 0)/1000)} inclusive time\n`;
      });
      report += '\n';
    });
    
    // Top 3 data intensive vertices
    report += `## Top 5 Data-Intensive Vertices\n`;
    analysis.mostDataIntensive.forEach((vertex, i) => {
      report += `${i+1}. **${vertex.id}** (${vertex.type})\n`;
      report += `   - Data: ${formatBytes(vertex.dataStats.inputBytes)} in, ${formatBytes(vertex.dataStats.outputBytes)} out\n`;
      report += `   - Operators:\n`;
      vertex.operators.forEach(op => {
        report += `     * operator_${op.id}: ${op.rowCount?.toLocaleString() || 'N/A'} rows, ${formatTime((op.inclusiveTime || 0)/1000)} inclusive time\n`;
      });
      report += '\n';
    });
    
    // Vertices with exceptions
    // if (analysis.exceptionVertices.length > 0) {
    //   report += `## Vertices with Exceptions\n`;
    //   analysis.exceptionVertices.forEach(vertex => {
    //     const total = vertex.exceptionStats.cppExceptionCount + 
    //                   vertex.exceptionStats.csharpExceptionCount + 
    //                   vertex.exceptionStats.otherExceptionCount;
    //     const exceptionTypes = [];
    //     if (vertex.exceptionStats.cppExceptionCount > 0) 
    //       exceptionTypes.push(`${vertex.exceptionStats.cppExceptionCount} C++`);
    //     if (vertex.exceptionStats.csharpExceptionCount > 0) 
    //       exceptionTypes.push(`${vertex.exceptionStats.csharpExceptionCount} C#`);
    //     if (vertex.exceptionStats.otherExceptionCount > 0) 
    //       exceptionTypes.push(`${vertex.exceptionStats.otherExceptionCount} other`);
        
    //     report += `- **${vertex.id}** (${vertex.type}): ${total} exceptions (${exceptionTypes.join(', ')})\n`;
    //   });
    // }
    
    return report;
  }
  
  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  function formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds.toFixed(2)}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs.toFixed(0)}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
/**
 * Extract operator IDs from all vertices
 * @param analysis Vertex analysis result
 * @param removeDuplicates Whether to remove duplicate IDs (default true)
 * @returns Array of all operator IDs
 */
export function extractOperatorIds(analysis: AnalyzeVertexStates, removeDuplicates: boolean = true): string[] {
    // Use Set to store operator IDs to avoid duplicates
    const operatorIdSet = new Set<string>();
    
    // Helper function to extract all operator IDs from a vertex array
    const extractFromVertices = (vertices: VertexStats[] | undefined) => {
      if (!vertices) return;
      vertices.forEach(vertex => {
        if (vertex.operators) {
          vertex.operators.forEach(op => {
            if (op.id) {
              operatorIdSet.add(op.id);
            }
          });
        }
      });
    };
    
    // Extract operator IDs from all vertex categories
    extractFromVertices(analysis.mostMemoryIntensive);
    extractFromVertices(analysis.mostTimeConsuming);
    extractFromVertices(analysis.mostDataIntensive);
    
    // If we need operator IDs from all vertices (may have duplicates)
    if (!removeDuplicates) {
      extractFromVertices(analysis.allVertices);
    }
    
    // If we only need unique IDs, return array from Set
    if (removeDuplicates) {
      return Array.from(operatorIdSet);
    }
    
    // If we need all operator IDs including duplicates, collect them again
    const allOperatorIds: string[] = [];
    analysis.allVertices.forEach(vertex => {
      vertex.operators.forEach(op => {
        if (op.id) {
          allOperatorIds.push(op.id);
        }
      });
    });
    
    return allOperatorIds;
  }

/**
 * Returns a mapping of operator IDs organized by vertex
 * @param analysis Vertex analysis result
 * @returns Map with vertex IDs as keys and arrays of operator IDs as values
 */
export function getOperatorIdsByVertex(analysis: AnalyzeVertexStates): Map<string, string[]> {
    const vertexToOperators = new Map<string, string[]>();
    
    analysis.allVertices.forEach(vertex => {
        const operatorIds = vertex.operators
            .filter(op => op.id)
            .map(op => op.id);
        
        if (operatorIds.length > 0) {
            vertexToOperators.set(vertex.id, operatorIds);
        }
    });
    
    return vertexToOperators;
}

/**
 * Filter operator IDs based on various conditions
 * @param analysis Vertex analysis result
 * @param options Filter options
 * @returns Array of operator IDs that meet the conditions
 */
export function filterOperatorIds(
    analysis: AnalyzeVertexStates, 
    options: {
        minRowCount?: number,
        minTime?: number,
        vertexTypes?: string[],
        includePatterns?: RegExp[],
        excludePatterns?: RegExp[]
    }
): string[] {
    const filteredIds: string[] = [];
    
    analysis.allVertices.forEach(vertex => {
        // Check if current vertex matches vertex type filter if specified
        if (options.vertexTypes && !options.vertexTypes.includes(vertex.type)) {
            return;
        }
        
        vertex.operators.forEach(op => {
            // Skip operators without ID
            if (!op.id) return;
            
            // Check row count condition
            if (options.minRowCount !== undefined && 
                    (op.rowCount === undefined || op.rowCount < options.minRowCount)) {
                return;
            }
            
            // Check time condition
            if (options.minTime !== undefined && 
                    (op.inclusiveTime === undefined || op.inclusiveTime < options.minTime)) {
                return;
            }
            
            // Check include patterns
            if (options.includePatterns && 
                    !options.includePatterns.some(pattern => pattern.test(op.id))) {
                return;
            }
            
            // Check exclude patterns
            if (options.excludePatterns && 
                    options.excludePatterns.some(pattern => pattern.test(op.id))) {
                return;
            }
            
            filteredIds.push(op.id);
        });
    });
    
    return filteredIds;
}




// Usage example
export function analyzeScopeRuntimeStatistics(xmlContent: string) {
    // Extract all vertex data from the XML
    const vertices = extractVertices(xmlContent);
    
    // Analyze to find significant vertices
    const analysis = analyzeSignificantVertices(vertices);
    
    return analysis;
  }
  

import { DOMParser } from 'xmldom';
import * as xpath from 'xpath';
import * as fs from 'fs';

interface VertexStats {
  id: string;                    // 顶点ID
  executionTime: number;         // 执行时间(ms)
  computeTime: number;           // 计算时间(ms)
  rowsWritten: number;           // 写入行数
  dataRead: number;              // 读取的数据量(bytes)
  dataWritten: number;           // 写入的数据量(bytes)
  outputId: string | null;       // 输出ID
}
  
interface AggregateStats {
  averageVertexExecutionTime: number;  // 平均顶点执行时间(ms)
  totalComputeTime: number;           // 总计算时间(ms)
  totalRowsWritten: number;           // 总写入行数
  totalVertexDataRead: number;        // 总读取数据量(bytes)
  totalVertexDataToRead: number;      // 待读取的总数据量(bytes)
  totalVertexDataWritten: number;     // 总写入数据量(bytes)
  minVertexDataRead: number;          // 最小读取数据量(bytes)
  averageVertexDataRead: number;      // 平均读取数据量(bytes)
  maxVertexDataRead: number;          // 最大读取数据量(bytes)
  outputIds: string[];                // 所有输出ID
}
  
interface VertexAnalysis {
  summary: AggregateStats;
  topExecutionVertices: VertexStats[];  // 执行时间最长的顶点
  dataSkewVertices: VertexStats[];     // 数据倾斜严重的顶点
  largeDataVertices: VertexStats[];    // 处理数据量大的顶点
  allVertices: number;
}

  /**
   * 从Scope统计XML中提取SV(Stream Vertex)统计信息
   * @param runtimeStatsXml __ScopeRuntimeStatistics__.xml的内容
   * @returns 聚合的统计信息
   */
function extract_sv_stats(runtimeStatsXml: string): VertexStats[] {
  const xmlContent = fs.readFileSync(runtimeStatsXml, 'utf-8');
  const parser = new DOMParser();
  const runtimeDoc = parser.parseFromString(xmlContent, "text/xml");
  
  
  // 收集所有顶点统计信息
  const vertexStats: VertexStats[] = [];
  
  // 找到所有SV元素(Stream Vertex)
  const svNodes = xpath.select("//*[starts-with(@id, 'SV')]", runtimeDoc) as Element[];

  if (svNodes.length === 0) {
    // 如果没有找到SV元素，尝试寻找以SV开头的元素
    const allElements = xpath.select("//*[starts-with(name(), 'SV')]", runtimeDoc) as Element[];
    allElements.forEach(processSvNode);
  } else {
    // 处理找到的SV元素
    svNodes.forEach(processSvNode);
  }

  // 处理单个SV节点的函数
  function processSvNode(node: Element): void {
    const stats: VertexStats = {
      id: node.nodeName || node.getAttribute('id') || '',
      executionTime: parseInt(node.getAttribute('inclusiveTime') || '0'),
      computeTime: 0,
      rowsWritten: 0,
      dataRead: 0,
      dataWritten: 0,
      outputId: null
    };
    
    // 提取计算时间
    const timeElement = xpath.select1("./Time", node) as Element;
    if (timeElement) {
      stats.computeTime = parseInt(timeElement.getAttribute('totalCpuTime') || '0');
    }
    
    // 提取读取的数据量
    const inputStats = xpath.select1("./InputStatistics", node) as Element;
    if (inputStats) {
      stats.dataRead = parseInt(inputStats.getAttribute('totalBytes') || '0');
    }
    
    // 提取写入的数据量和行数
    const outputStats = xpath.select1('./OutputStatistics', node) as Element;
    if (outputStats) {
      stats.dataWritten = parseInt(outputStats.getAttribute('totalBytes') || '0');
    }
    
    // 提取输出行数和输出ID
    const output = xpath.select1('./Output', node) as Element;
    if (output) {
      stats.rowsWritten = parseInt(output.getAttribute('rowCount') || '0');
      stats.outputId = output.getAttribute('opId');
    }
    
    vertexStats.push(stats);
  }
  return vertexStats;
}

function aggregateVertices(vertexStats: VertexStats[]): VertexAnalysis {
  // 初始化统计结果
  let result: AggregateStats = {
    averageVertexExecutionTime: 0,
    totalComputeTime: 0,
    totalRowsWritten: 0,
    totalVertexDataRead: 0,
    totalVertexDataToRead: 0,
    totalVertexDataWritten: 0,
    minVertexDataRead: Infinity,
    averageVertexDataRead: 0,
    maxVertexDataRead: 0,
    outputIds: []
  };

  if (vertexStats.length === 0) {
    return {
      summary: result,
      topExecutionVertices: [],
      dataSkewVertices: [],
      largeDataVertices: [],
      allVertices: -1,
    };
  }

  let topExecutionVertices: VertexStats[] = [];
  let dataSkewVertices: VertexStats[] = []; 
  let largeDataVertices: VertexStats[] = [];

  // 计算聚合统计
  if (vertexStats.length > 0) {
    // 总计算时间
    result.totalComputeTime = vertexStats.reduce((sum, stat) => sum + stat.computeTime, 0);
    
    // 总行数
    result.totalRowsWritten = vertexStats.reduce((sum, stat) => sum + stat.rowsWritten, 0);
    
    // 数据读取统计
    const dataReads = vertexStats.map(stat => stat.dataRead).filter(size => size > 0);
    if (dataReads.length > 0) {
      result.totalVertexDataRead = dataReads.reduce((sum, size) => sum + size, 0);
      result.minVertexDataRead = Math.min(...dataReads);
      result.maxVertexDataRead = Math.max(...dataReads);
      result.averageVertexDataRead = result.totalVertexDataRead / dataReads.length;
    } else {
      result.minVertexDataRead = 0;
    }
    
    // 总数据写入
    result.totalVertexDataWritten = vertexStats.reduce((sum, stat) => sum + stat.dataWritten, 0);
    
    // 平均执行时间
    const execTimes = vertexStats.map(stat => stat.executionTime).filter(time => time > 0);
    if (execTimes.length > 0) {
      result.averageVertexExecutionTime = execTimes.reduce((sum, time) => sum + time, 0) / execTimes.length;
    }
    
    // 收集输出ID
    result.outputIds = vertexStats
      .map(stat => stat.outputId)
      .filter((id): id is string => id !== null);
    

    // 对顶点进行排序和分析
    // 1. 按执行时间排序
    topExecutionVertices = [...vertexStats]
    .sort((a, b) => b.executionTime - a.executionTime)
    .slice(0, 5); // 获取执行时间最长的5个顶点

    // 2. 识别数据倾斜严重的顶点 (写入/读取比例异常的顶点)
    dataSkewVertices = vertexStats
      .filter(v => v.dataRead > 0 && v.dataWritten > 0)
      .map(v => ({
        ...v,
        ratio: v.dataWritten / v.dataRead
      }))
      .sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1))
      .slice(0, 5)
      .map(v => ({
        id: v.id,
        executionTime: v.executionTime,
        computeTime: v.computeTime,
        rowsWritten: v.rowsWritten,
        dataRead: v.dataRead,
        dataWritten: v.dataWritten,
        outputId: v.outputId
      }));

    // 3. 识别处理数据量大的顶点
    largeDataVertices = [...vertexStats]
      .sort((a, b) => (b.dataRead + b.dataWritten) - (a.dataRead + a.dataWritten))
      .slice(0, 5);
  }

  let analysisV : VertexAnalysis = {
    summary: result,
    topExecutionVertices: topExecutionVertices,
    dataSkewVertices: dataSkewVertices,
    largeDataVertices: largeDataVertices,
    allVertices: vertexStats.length, 
  };
  return analysisV;
}


export function parseAndAnalyzeScopeRuntime(runtimeStatsXml: string): string {
  const vertices = extract_sv_stats(runtimeStatsXml);
  const analysis = aggregateVertices(vertices);
  const analysisString = formatDetailedStats(analysis, vertices);
  return analysisString;
}


/**
 * Convert detailed statistics to readable string format
 */
export function formatDetailedStats(analysis: VertexAnalysis, allVertices: VertexStats[]): string {
const { summary, topExecutionVertices, dataSkewVertices, largeDataVertices } = analysis;

const lines = [
  '# Scope Execution Statistics Analysis',
  '',
  '## Overall Summary',
  `- Number of Vertices: ${analysis.allVertices}`,
  `- Average Execution Time: ${formatTime(summary.averageVertexExecutionTime)}`,
  `- Total Compute Time: ${formatTime(summary.totalComputeTime)}`,
  `- Total Rows Processed: ${summary.totalRowsWritten.toLocaleString()}`,
  `- Total Data Read: ${formatBytes(summary.totalVertexDataRead)}`,
  `- Total Data Written: ${formatBytes(summary.totalVertexDataWritten)}`,
  ''
];

// Add vertices with longest execution time
if (topExecutionVertices.length > 0) {
  lines.push('## Vertices with Longest Execution Time (Potential Bottlenecks)');
  topExecutionVertices.forEach((v, i) => {
    lines.push(`### ${i+1}. ${v.id}`);
    lines.push(`- Execution Time: ${formatTime(v.executionTime)} (${Math.round(v.executionTime / summary.averageVertexExecutionTime * 100)}% of overall average)`);
    lines.push(`- Compute Time: ${formatTime(v.computeTime)}`);
    lines.push(`- Data Read: ${formatBytes(v.dataRead)}`);
    lines.push(`- Data Written: ${formatBytes(v.dataWritten)}`);
    lines.push(`- Rows Processed: ${v.rowsWritten.toLocaleString()}`);
    if (v.outputId) lines.push(`- Output ID: ${v.outputId}`);
    lines.push('');
  });
}

// Add vertices with severe data skew
if (dataSkewVertices.length > 0) {
  lines.push('## Vertices with Severe Data Skew');
  dataSkewVertices.forEach((v, i) => {
    const ratio = v.dataWritten / v.dataRead;
    const skewType = ratio > 1.5 ? "Data Expansion" : "Data Reduction";
    lines.push(`### ${i+1}. ${v.id} (${skewType})`);
    lines.push(`- Read/Write Ratio: ${ratio.toFixed(2)} (output/input)`);
    lines.push(`- Data Read: ${formatBytes(v.dataRead)}`);
    lines.push(`- Data Written: ${formatBytes(v.dataWritten)}`);
    lines.push(`- Execution Time: ${formatTime(v.executionTime)}`);
    lines.push('');
  });
}

// Add vertices with largest data processing volume
if (largeDataVertices.length > 0) {
  lines.push('## Vertices with Largest Data Processing Volume');
  largeDataVertices.forEach((v, i) => {
    const totalData = v.dataRead + v.dataWritten;
    lines.push(`### ${i+1}. ${v.id}`);
    lines.push(`- Total Data Volume: ${formatBytes(totalData)}`);
    lines.push(`- Data Read: ${formatBytes(v.dataRead)}`);
    lines.push(`- Data Written: ${formatBytes(v.dataWritten)}`);
    lines.push(`- Execution Time: ${formatTime(v.executionTime)}`);
    lines.push(`- Processing Efficiency: ${formatBytes(totalData / (v.executionTime / 1000))}/sec`);
    lines.push('');
  });
}

// Add vertex performance scatter plot analysis
lines.push('## Performance Scatter Analysis');
lines.push('Vertex Performance Distribution:');

// Identify vertices with potential issues
const potentialIssues = allVertices
  .filter(v => 
    // Vertices with long execution time but small data processing might have performance issues
    (v.executionTime > summary.averageVertexExecutionTime * 2 && 
     v.dataRead < summary.averageVertexDataRead / 2) ||
    // Or vertices with abnormally low processing efficiency
    (v.executionTime > 0 && 
     v.dataRead / v.executionTime < summary.totalVertexDataRead / summary.totalComputeTime / 5)
  );

if (potentialIssues.length > 0) {
  lines.push('');
  lines.push('## Other Potential Problem Vertices');
  potentialIssues.forEach((v, i) => {
    lines.push(`### ${v.id}`);
    lines.push(`- Issue Pattern: Long execution time(${formatTime(v.executionTime)}) but small data volume(${formatBytes(v.dataRead)})`);
    lines.push(`- Processing Efficiency: ${formatBytes(v.dataRead / (v.executionTime / 1000))}/sec`);
    lines.push(`- Possible Causes: CPU bottleneck, resource contention, complex computation or abnormal waiting`);
    lines.push('');
  });
}

return lines.join('\n');
}

/**
 * Convert byte size to readable string format (KB, MB, GB etc.)
 */
  export function formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  /**
   * 格式化毫秒为可读的时间字符串
   */
  export function formatTime(ms: number): string {
    if (ms < 1000) return ms + ' ms';
    const seconds = ms / 1000;
    if (seconds < 60) return seconds.toFixed(2) + ' sec';
    const minutes = seconds / 60;
    if (minutes < 60) return minutes.toFixed(2) + ' min';
    const hours = minutes / 60;
    return hours.toFixed(2) + ' hours';
  }
import { DOMParser } from 'xmldom';
import * as xpath from 'xpath';
import * as fs from 'fs';
import {AnalyzeVertexStates, extractOperatorIds} from './extractRuntime2';

interface MemoryEstimates {
  processMemory: number;
  managedMemory: number;
  engineMemory: number;
  engineIOMemory: number;
  engineOperatorMemory: number;
  minEngineOperatorMemory: number;
  adapterMemory: number;
}

interface SchemaField {
  name: string;
  type: string;
  isNullable: boolean;
}

interface OperatorIO {
  id: string;
  uid: string;
  schema: string;
  parsedSchema: SchemaField[];
  inputIndex?: number;
  outputIndex?: number;
  numberOfInputs?: string;
  numberOfOutputs?: string;
}

interface Operator {
  id: string;
  uid: string;
  className: string;
  assemblyName: string;
  file?: string;
  line?: number;
  args?: string;
  inputs: OperatorIO[];
  outputs: OperatorIO[];
}

export interface ScopeVertex {
  id: string;
  limitMemory: MemoryEstimates;
  optimalMemory: MemoryEstimates;
  operators: Operator[];
}
/**
 * Parse Scope vertex definition XML file
 * @param filePath Path to ScopeVertexDef.xml file
 * @returns Array of parsed Scope vertices
 */
export function parseScopeVertexXML(filePath: string): ScopeVertex[] {
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "application/xml");
    
    // Find all ScopeVertex nodes
    const vertexNodes = xpath.select("//*[local-name()='ScopeVertex']", xmlDoc) as Element[];
    
    const scopeVertices: ScopeVertex[] = [];

    for (let i = 0; i < vertexNodes.length; i++) {
        const vertex = vertexNodes[i];
        const id = vertex.getAttribute("id") || "";
        
        // Parse memory estimate information
        const limitMemoryNode = xpath.select1("./EstimatedLimitMemory", vertex) as Element;
        const optimalMemoryNode = xpath.select1("./EstimatedOptimalMemory", vertex) as Element;
        
        const limitMemory = parseMemoryEstimates(limitMemoryNode);
        const optimalMemory = parseMemoryEstimates(optimalMemoryNode);
        
        // Parse operators
        const operatorNodes = xpath.select("./operator", vertex) as Element[];
        const operators: Operator[] = [];
        
        for (let j = 0; j < operatorNodes.length; j++) {
            const opNode = operatorNodes[j];
            
            // Basic properties
            const operator: Operator = {
                id: opNode.getAttribute("id") || "",
                uid: opNode.getAttribute("uid") || "",
                className: opNode.getAttribute("className") || "",
                assemblyName: opNode.getAttribute("assemblyName") || "",
                file: opNode.getAttribute("file") || undefined,
                line: opNode.getAttribute("line") ? parseInt(opNode.getAttribute("line")!) : undefined,
                args: opNode.getAttribute("args") || undefined,
                inputs: [],
                outputs: []
            };
            
            // Parse inputs
            const inputNodes = xpath.select("./input", opNode) as Element[];
            for (let k = 0; k < inputNodes.length; k++) {
                const inputNode = inputNodes[k];
                const schema = inputNode.getAttribute("schema") || "";
                
                operator.inputs.push({
                    id: inputNode.getAttribute("id") || "",
                    uid: inputNode.getAttribute("uid") || "",
                    schema: schema,
                    parsedSchema: parseSchema(schema),
                    inputIndex: inputNode.getAttribute("inputIndex") ? 
                                         parseInt(inputNode.getAttribute("inputIndex")!) : undefined,
                    numberOfInputs: inputNode.getAttribute("numberOfInputs") || undefined
                });
            }
            
            // Parse outputs
            const outputNodes = xpath.select("./output", opNode) as Element[];
            for (let k = 0; k < outputNodes.length; k++) {
                const outputNode = outputNodes[k];
                const schema = outputNode.getAttribute("schema") || "";
                
                operator.outputs.push({
                    id: outputNode.getAttribute("id") || "",
                    uid: outputNode.getAttribute("uid") || "",
                    schema: schema,
                    parsedSchema: parseSchema(schema),
                    outputIndex: outputNode.getAttribute("outputIndex") ? 
                                            parseInt(outputNode.getAttribute("outputIndex")!) : undefined,
                    numberOfOutputs: outputNode.getAttribute("numberOfOutputs") || undefined
                });
            }
            
            operators.push(operator);
        }
        
        scopeVertices.push({
            id,
            limitMemory,
            optimalMemory,
            operators
        });
    }
    
    return scopeVertices;
}

/**
 * 解析内存估算信息
 */
function parseMemoryEstimates(memoryNode: Element | null): MemoryEstimates {
  if (!memoryNode) {
    return {
      processMemory: 0,
      managedMemory: 0,
      engineMemory: 0,
      engineIOMemory: 0,
      engineOperatorMemory: 0,
      minEngineOperatorMemory: 0,
      adapterMemory: 0
    };
  }
  
  return {
    processMemory: parseMemoryAttribute(memoryNode, "processMemory"),
    managedMemory: parseMemoryAttribute(memoryNode, "managedMemory"),
    engineMemory: parseMemoryAttribute(memoryNode, "engineMemory"),
    engineIOMemory: parseMemoryAttribute(memoryNode, "engineIOMemory"),
    engineOperatorMemory: parseMemoryAttribute(memoryNode, "engineOperatorMemory"),
    minEngineOperatorMemory: parseMemoryAttribute(memoryNode, "minEngineOperatorMemory"),
    adapterMemory: parseMemoryAttribute(memoryNode, "adapterMemory")
  };
}

/**
 * 解析内存属性值（转换为数字）
 */
function parseMemoryAttribute(element: Element, attrName: string): number {
  const attrValue = element.getAttribute(attrName);
  return attrValue ? parseInt(attrValue) : 0;
}

/**
 * 解析Schema字符串为结构化字段列表
 */
function parseSchema(schemaString: string): SchemaField[] {
  if (!schemaString) return [];
  
  const fields = schemaString.split(',');
  return fields.map(field => {
    const [nameType, ...rest] = field.trim().split(':');
    const isNullable = nameType.endsWith('?') || rest.join(':').endsWith('?');
    let type = rest.join(':');
    let name = nameType;
    
    // 处理类型中的可空标记
    if (type.endsWith('?')) {
      type = type.substring(0, type.length - 1);
    }
    // 处理名称中的可空标记
    if (name.endsWith('?')) {
      name = name.substring(0, name.length - 1);
    }
    
    return {
      name,
      type,
      isNullable
    };
  });
}
/**
 * Convert ScopeVertex analysis results to readable text
 */
export function formatScopeVertexAnalysis(vertices: ScopeVertex[]): string {
    let result = "# Scope Vertex Analysis\n\n";
    
    vertices.forEach(vertex => {
        result += `## Vertex ${vertex.id}\n\n`;
        
        // Memory information
        result += `### Memory Estimates\n`;
        result += `- Total Process Memory: ${formatMemory(vertex.limitMemory.processMemory)}\n`;
        result += `- Engine Memory: ${formatMemory(vertex.limitMemory.engineMemory)}\n`;
        result += `- Operator Memory: ${formatMemory(vertex.limitMemory.engineOperatorMemory)}\n\n`;
        
        // Operator chain
        result += `### Operator Chain (${vertex.operators.length} operators)\n\n`;
        
        vertex.operators.forEach((op, index) => {
            result += `#### ${index + 1}. ${op.id} (${op.className})\n`;
            
            if (op.file) {
                result += `- Source: ${op.file}:${op.line}\n`;
            }
            
            if (op.args) {
                result += `- Args: ${op.args}\n`;
            }
            
            // Inputs
            op.inputs.forEach(input => {
                result += `- Input: ${input.id}\n`;
                result += `  - Schema: ${formatSchemaFields(input.parsedSchema)}\n`;
            });
            
            // Outputs 
            op.outputs.forEach(output => {
                result += `- Output: ${output.id}\n`;
                result += `  - Schema: ${formatSchemaFields(output.parsedSchema)}\n`;
            });
            
            result += `\n`;
        });
    });
    
    return result;
}

/**
 * Format bytes into human readable form
 */
function formatMemory(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format field list as string
 */
function formatSchemaFields(fields: SchemaField[]): string {
  if (fields.length === 0) return "No Field";
  
  return fields.map(f => `${f.name}:${f.type}${f.isNullable ? '?' : ''}`).join(', ');
}

/**
 * Analyze Scope vertices and find potential performance bottlenecks
*/
export function analyzeScopeVertices(vertices: ScopeVertex[], keyOperators: string[]): string {
    let analysis = "# Top 5 Performance Issue Vertex Analysis\n\n";

    // Calculate performance score for each vertex
    const vertexScores = vertices.map(vertex => {
        // Score based on memory usage ratio and complex operator count
        const memoryRatio = vertex.limitMemory.engineOperatorMemory / vertex.optimalMemory.engineOperatorMemory;
        const complexOps = vertex.operators.filter(op => 
            op.inputs.length > 1 || 
            op.className.includes('Sort') || 
            op.className.includes('Aggregate') ||
            op.className.includes('Join')
        ).length;
        
        return {
            vertex,
            score: memoryRatio * 0.7 + complexOps * 0.3
        };
    });

    // Sort by score and get top 5
    const top3Vertices = vertexScores
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(vs => vs.vertex);

    top3Vertices.forEach((vertex, index) => {
        analysis += `## ${index + 1}. Vertex ${vertex.id}\n\n`;
        
        // Memory usage analysis
        const memoryRatio = vertex.limitMemory.engineOperatorMemory / vertex.optimalMemory.engineOperatorMemory;
        analysis += `Memory Usage Ratio: ${(memoryRatio * 100).toFixed(2)}%\n`;
        analysis += `Actual Memory: ${formatMemory(vertex.limitMemory.engineOperatorMemory)}\n`;
        analysis += `Optimal Memory: ${formatMemory(vertex.optimalMemory.engineOperatorMemory)}\n\n`;
        
        // Problem operator analysis
        analysis += `### Critical Operators\n\n`;
        vertex.operators
            .filter(op => 
                op.inputs.length > 1 || 
                op.className.includes('Sort') || 
                op.className.includes('Aggregate') ||
                op.className.includes('Join')
            )
            .forEach(op => {
                analysis += `- ${op.id} (${op.className})\n`;
                if (op.file && op.line) {
                    analysis += `  Location: ${op.file}:${op.line}\n`;
                } else {
                    analysis += `  Class: ${op.assemblyName}.${op.className}\n`;
                }
                if (op.args) {
                    analysis += `  Args: ${op.args}\n`;
                }
                analysis += '\n';
            });
    });

    return analysis;
}



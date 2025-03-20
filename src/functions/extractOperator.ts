
import { DOMParser } from 'xmldom';
import * as xpath from 'xpath';
import * as fs from 'fs';
import {ScopeVertex, parseScopeVertexXML, analyzeScopeVertices} from './extractVertex';
import {AnalyzeVertexStates, extractOperatorIds} from './extractRuntime2';


/**
 * Detailed information for key operators
 */
interface OperatorDetail {
    id: string;     // name         
    uid: string;    // operator ID
    file?: string;  // script location
    line?: number;
    className: string;       // operator class name
    assemblyName: string;    // assembly name
    inputs: {                // input information
      id: string; 
      schema: string;
      parsedFields: string[];
    }[];
    outputs: {              // output information
      id: string;
      schema: string; 
      parsedFields: string[];
    }[];
    vertexId: string;       // vertex ID this operator belongs to
  }
  
/**
    * Find and extract operator details based on key operator IDs
    * @param vertices Array of ScopeVertex
    * @param keyOperators List of key operator IDs
    * @returns List of operator details
    */
  export function extractOperatorDetails(vertices: ScopeVertex[], keyOperators: string[]): OperatorDetail[] {
     const result: OperatorDetail[] = [];
     
     // Create a set of operator IDs for quick lookup
     const keyOperatorSet = new Set(keyOperators);
     
     // Iterate through all vertices
     for (const vertex of vertices) {
        // Iterate through all operators in each vertex  
        for (const op of vertex.operators) {
          // Check if current operator ID is in key operators list
          if (keyOperatorSet.has(op.uid)) {
             // Build detail object
             const detail: OperatorDetail = {
                id: op.id,
                uid: op.uid,
                className: op.className,
                assemblyName: op.assemblyName,
                inputs: op.inputs.map(input => ({
                  id: input.id,
                  schema: input.schema, 
                  parsedFields: input.parsedSchema.map(field =>
                     `${field.name}:${field.type}${field.isNullable ? '?' : ''}`)
                })),
                outputs: op.outputs.map(output => ({
                  id: output.id,
                  schema: output.schema,
                  parsedFields: output.parsedSchema.map(field =>
                     `${field.name}:${field.type}${field.isNullable ? '?' : ''}`)
                })),
                vertexId: vertex.id
             };
             
             // Add optional properties
             if (op.file && op.line !== undefined) {
                detail.file = op.file;
                detail.line = op.line;
             }
             
             result.push(detail);
          }
        }
     }
     
     return result;
  }
  
  /**
    * Convert operator details to readable string format
    * @param operatorDetails operator details list
    * @returns Formatted string
    */
   function formatKeyOperatorDetails(operatorDetails: OperatorDetail[]| null| undefined): string {

    let result = "# Key Operator Details\n\n";
        
        if (!operatorDetails || operatorDetails.length === 0) {
          return result + "No matching key operators found.\n";
        }
        
        operatorDetails.forEach((detail, index) => {
          result += `## ${index + 1}. ${detail.id}\n`;
          result += `- Vertex: ${detail.vertexId}\n`;
          result += `- Class name in __ScopeCodeGen__.dll.cs: ${detail.className}\n`;
          
          // Show source file location (if available)
          if (detail.file) {
            result += `- Source file: ${detail.file} - line:${detail.line}\n`;
          }
          
          // Show inputs
          if (detail.inputs.length > 0) {
            result += `### Input Data\n`;
            detail.inputs.forEach(input => {
              result += `- ID: ${input.id}\n`;
            //   result += `  Fields: ${input.parsedFields.join(', ')}\n`;
            });
          }
          
      // show outputs
      if (detail.outputs.length > 0) {
        result += `### Output Data\n`;
        detail.outputs.forEach(output => {
          result += `- ID: ${output.id}\n`;
        //   result += `  Fields: ${output.parsedFields.join(', ')}\n`;
        });
      }
      
      result += `\n---\n`;
    });
    
    return result;
  }
  


  
  /**
 * Finds and returns details about an operator with a specific UID
 * @param xmlContent The ScopeVertexDef.xml content as string
 * @param targetUid The UID of the operator to find
 * @returns The operator details or null if not found
 */
function findAllOperatorByUid(filePath: string, targetUids: string[]): OperatorDetail[] | null | undefined{
    // Parse the XML
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, "application/xml");
    
    const operatorDetails: OperatorDetail[] = [];
    for (const targetUid of targetUids) {

        // Find the operator with the matching UID
        const operatorNodes = xpath.select(`//operator[@uid='${targetUid}']`, doc) as Node[];
        
        if (!operatorNodes.length) {
            continue;
        };
        const operatorNode = operatorNodes[0] as Element;
        
        // Find which vertex this operator belongs to
        const vertexNodes = xpath.select('ancestor::ScopeVertex', operatorNode) as Node[];
        const vertexNode = vertexNodes[0] as Element | undefined;
        const vertexId = vertexNode?.getAttribute('id') || '';
        
        // Get operator attributes
        const operatorId = operatorNode.getAttribute('id') || '';
        const uid = operatorNode.getAttribute('uid') || '';
        const className = operatorNode.getAttribute('className') || '';
        const assemblyName = operatorNode.getAttribute('assemblyName') || '';
        const file = operatorNode.getAttribute('file') || undefined;
        const line = operatorNode.getAttribute('line') ? 
                    parseInt(operatorNode.getAttribute('line') || '0') : 
                    undefined;
        
        // Parse inputs
        const inputs = (xpath.select('./input', operatorNode) as Node[]).map((inputNode) => {
            const node = inputNode as Element;
            const id = node.getAttribute('id') || '';
            const schema = node.getAttribute('schema') || '';
            const parsedFields = parseSchema(schema);
            
            return { id, schema, parsedFields };
        });
    
        // Parse outputs
        const outputs = (xpath.select('./output', operatorNode) as Node[]).map((outputNode) => {
            const node = outputNode as Element;
            const id = node.getAttribute('id') || '';
            const schema = node.getAttribute('schema') || '';
            const parsedFields = parseSchema(schema);
        
            return { id, schema, parsedFields };
        });
    
        // Return the complete operator details
        operatorDetails.push({
            id: operatorId,
            uid,
            file,
            line,
            className,
            assemblyName,
            inputs,
            outputs,
            vertexId
        });
    }
    return operatorDetails;
  }
  
  /**
   * Parses a schema string to extract field names
   * @param schema The schema string in format "field1:type,field2:type"
   * @returns Array of field names
   */
  function parseSchema(schema: string): string[] {
    if (!schema) return [];
    
    return schema
      .split(',')
      .map(field => field.trim().split(':')[0].trim());
  }
  
  

  export function parseAndAnalyzeScopeVertices(filePath: string, analyzeVertexStates?: AnalyzeVertexStates): string {
    try {
      let analysis = '';
      if (analyzeVertexStates) {
        const keyOperators = extractOperatorIds(analyzeVertexStates);
        const operatorAnalysis = findAllOperatorByUid(filePath, keyOperators);
        const stringAnalysis = formatKeyOperatorDetails(operatorAnalysis);
        analysis += "\n\n" + stringAnalysis;
      }else{
        const vertices = parseScopeVertexXML(filePath);
        analysis = analyzeScopeVertices(vertices, []);
      }
      return analysis;
    } catch (error) {
      return `An error occurred while analyzing ScopeVertexDef.xml: ${error}`;
    }
  }
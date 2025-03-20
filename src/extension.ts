import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseAndAnalyzeScopeRuntime } from './functions/extractRuntime';
import { analyzeScopeRuntimeStatistics, formatStatisticsReport, AnalyzeVertexStates } from './functions/extractRuntime2';
import { parseAndAnalyzeScopeVertices } from './functions/extractOperator';
import { Logger } from './functions/logger';
import { ConversationManager } from './customAgent';
import * as os from 'os'; 

//  username :
const username = os.userInfo().username;
const tempPath = `C:\\Users\\${username}\\AppData\\Local\\Temp\\DataLakeTemp`;
const criticalFiles = ['scope.script', '__ScopeCodeGen__.dll.cs', '__ScopeRuntimeStatistics__.xml', 'ScopeVertexDef.xml']; 

export function activate(context: vscode.ExtensionContext) {
	const logger = new Logger("Scope Opt Agent");
    logger.info("Your Extension activated");
	// Create a single conversation manager
	const conversationManager = new ConversationManager(logger);

	let keyAnalysis: AnalyzeVertexStates = {} as AnalyzeVertexStates;

    // Get the list of Cosmos job folders
    async function getCosmosJobFolders(): Promise<string[]> {
        try {
            const items = (await fs.promises.readdir(tempPath, { withFileTypes: true }))
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            return items.filter(item => {
                const fullPath = path.join(tempPath, item);
                return item.toLowerCase().includes('cosmos') && fs.statSync(fullPath).isDirectory();
            }).sort((a, b) => {
                // Sort by folder creation time, latest one in front
                const statA = fs.statSync(path.join(tempPath, a));
                const statB = fs.statSync(path.join(tempPath, b));
                return statB.birthtimeMs - statA.birthtimeMs;
            });
        } catch (error) {
            logger.error(`Error reading temp directory: ${error}`);
            return [];
        }
    }

    // Read the specified file content in the job folder
    async function readJobFiles(jobFolder: string): Promise<Map<string, string>> {
        const fileContents = new Map<string, string>();
        const jobPath = path.join(tempPath, jobFolder);

        try {
            const allFiles = await fs.promises.readdir(jobPath);
            
            // First process important documents
            for (const targetFile of criticalFiles) {
                const matchingFiles = allFiles.filter(file => 
                    file.toLowerCase() === targetFile.toLowerCase());
                
                if (matchingFiles.length > 0) {
                    const file = matchingFiles[0];
                    const fullPath = path.join(jobPath, file);
                    
                    if (fs.statSync(fullPath).isFile()) {
                        try {
                            const content = await fs.promises.readFile(fullPath, 'utf8');
                            fileContents.set(file, content);
                            logger.info(`Read file: ${file}, size: ${content.length}`);
                        } catch (error) {
                            logger.error(`Error reading file ${file}: ${error}`);
                        }
                    }
                }
            }
            
            // If some important files are not found, log the log
            criticalFiles.forEach(file => {
                if (!fileContents.has(file)) {
                    logger.info(`Warning: Important file not found: ${file}`);
                }
            });
            
        } catch (error) {
            logger.error(`Error reading job files: ${error}`);
        }

        return fileContents;
    }

	// Extract key content from file to avoid exceeding LM context limits
	function extractKeyContent(jobFolder:string, fileName: string, content: string): string {
		const fullPath = path.join(tempPath, jobFolder, fileName);

		// Extract key content based on file type
		if (fileName === 'scope.script') {
			// Preserve complete script content
			return content;
		} else if (fileName === '__ScopeRuntimeStatistics__.xml') {
			// Extract entire job view 
			keyAnalysis = analyzeScopeRuntimeStatistics(fullPath);
			return formatStatisticsReport(keyAnalysis);
		} else if (fileName === 'ScopeVertexDef.xml') {
			// Extract vertex operator view for each vertex
			return parseAndAnalyzeScopeVertices(fullPath, keyAnalysis);
		} else if (fileName === '__ScopeCodeGen__.dll.cs') {
			return content;
		} else {
			// For other files, truncate if too large
			const maxSize = 5000;
			if (content.length > maxSize) {
				return content.substring(0, maxSize) + `...(truncated, original size: ${content.length})`;
			}
			return content;
		}
    }

    // Intent detection
    async function isOptimizationRelatedQuery(query: string, token: vscode.CancellationToken): Promise<boolean> {
		//Try to get smaller/faster models for intent detection to avoid wasting big model resources
		const chatModels = await vscode.lm.selectChatModels({family: 'gpt-4o-mini'});
		if (!chatModels || chatModels.length === 0) {
			logger.warn("No chat models available, falling back to keyword matching");
			// back to the key words matching
			return query.toLowerCase().includes('job') || 
				query.toLowerCase().includes('optimize') || 
				query.toLowerCase().includes('performance') ||
				query.toLowerCase().includes('slow') ||
				query.toLowerCase().includes('bottleneck') ||
				query.toLowerCase().includes('problem') || 
				query.toLowerCase().includes('优化') || 
				query.toLowerCase().includes('性能');
		}
		
		// build a prompt
		const intent_prompt = `Determine if the following query is about SCOPE script performance optimization, code optimization, 
	performance improvements, or addressing bottlenecks. Respond with ONLY "YES" if it's related to optimization or performance, 
	or "NO" if it's a general question about SCOPE syntax, functionality, or other non-performance topics.
	
	User Query: "${query}"
	
	Is this query about performance optimization? (YES/NO):`;
	
		try {
			const messages = [
				vscode.LanguageModelChatMessage.User(intent_prompt)
			];
			
			// send request
			const response = await chatModels[0].sendRequest(messages, undefined, token);
			let responseText = "";
			for await (const chunk of response.text) {
				responseText += chunk;
			}
			
			// return Yes Or No
			const cleanResponse = responseText.trim().toUpperCase();
			const isOptimization = cleanResponse.includes('YES');
			logger.info(`Intent classification for query: "${query}" -> ${isOptimization ? "Optimization" : "General"}`);
			
			return isOptimization;
		} catch (error) {
			logger.error(`Error classifying query intent: ${error}`);
			// back to the key words matching when error
			return query.toLowerCase().includes('job') || 
				query.toLowerCase().includes('optimize') || 
				query.toLowerCase().includes('performance') ||
				query.toLowerCase().includes('slow') ||
				query.toLowerCase().includes('bottleneck') ||
				query.toLowerCase().includes('problem');
		}
	}
	
    vscode.chat.createChatParticipant("scope-opt-agent", async (request, context, response, token) => {
        const userQuery = request.prompt.toLowerCase();
        // Access conversation history
        const conversationHistory = conversationManager.getHistory();
		logger.info(`Received query : ${userQuery}`);


        // Determine whether the user's problem is about scope script optimization
        // const isOptimizationQuery = userQuery.toLowerCase().includes('job') || 
        //     userQuery.toLowerCase().includes('optimize') || 
        //     userQuery.toLowerCase().includes('performance') ||
        //     userQuery.toLowerCase().includes('slow') ||
        //     userQuery.toLowerCase().includes('bottleneck') ||
		// 	userQuery.toLowerCase().includes('problem') || 
        //     userQuery.toLowerCase().includes('优化') || 
        //     userQuery.toLowerCase().includes('性能');

		const isOptimizationQuery = await isOptimizationRelatedQuery(userQuery, token);
		

		const chatModels = await vscode.lm.selectChatModels({family : 'gpt-4o'});
		if (!chatModels || chatModels.length === 0) {
			response.markdown('Sorry, I couldn\'t complete that request.');
			return;
		}

		// just answer user's question
		if (!isOptimizationQuery) {
			const mes = [
				vscode.LanguageModelChatMessage.Assistant("SCOPE (Structured Computation Optimized for Parallel Execution) is a SQL-like scripting language for big data processing in Microsoft Cosmos. You are an advanced expert specializing in this language. Please help users with their Scope script-related questions and problems."),
				vscode.LanguageModelChatMessage.User(userQuery),
			];
			const chatRequest = await chatModels[0].sendRequest(mes, undefined, token);
			for await (const data of chatRequest.text) {
				response.markdown(data);
			}
			return;
		}
		
		 // Get the list of Cosmos job folders
		 response.markdown("I'll assist you in analyzing your SCOPE job. Currently searching for local Cosmos job folders... \n\n");
		 const jobFolders = await getCosmosJobFolders();
 
		 if (jobFolders.length === 0) {
			 response.markdown("No Cosmos job folders found. Please verify that Cosmos jobs exist in your temp directory.\n");
			 return;
		 }
 
		 // Create quick pick items
		 const quickPickItems = jobFolders.map(folder => {
			 // Try to extract job ID from folder name
			 let jobId = folder;
			 const match = folder.match(/\[.*?\]\s*(.+)/);
			 if (match && match[1]) {
				 jobId = match[1].trim();
			 }
 
			 return {
				 description: `Job ID: ${jobId}`,
				 label: folder
			 };
		 });
 
		 // Show selection dialog
		 response.markdown("I found the following Cosmos jobs. Which one would you like to analyze?\n\n");
		 const selectedJob = await vscode.window.showQuickPick(quickPickItems, {
			 placeHolder: 'Please select a job ID in the popup window. \n'
		 });
 
		 if (!selectedJob) {
			 response.markdown("No job selected. Please ask again if you need analysis.\n");
			 return;
		 }
 
		 // Notify user that files are being read
		 response.markdown(`Reading files for job ${selectedJob.label}, this may take a moment...\n\n`);
		 
		 // Read files from selected job
		 const jobFiles = await readJobFiles(selectedJob.label);
		 
		 if (jobFiles.size === 0) {
			 response.markdown("No files could be read from the job folder. Please verify the job folder contents are complete.\n");
			 return;
		 }
		 
		 response.markdown(`Already read ${jobFiles.size} files, analyzing...\n`);
		
		 // Summarize file content
		 const summarizedFiles = new Map<string, string>();
	
		 // Process critical files
		 for (const fileName of criticalFiles) {
			 if (jobFiles.has(fileName)) {
				 response.markdown(`- Reading file ${fileName}...\n`);
				 const content = jobFiles.get(fileName)!;
				 const analysis = await extractKeyContent(selectedJob.label, fileName, content);
				 summarizedFiles.set(fileName, analysis);

				 logger.info("-------------------------------------------------------------------------------------------");
				 logger.info(analysis);
			 }
		 }
		 
		 response.markdown(`\n File content analysis complete, generating optimization suggestions...\n`);

		
        // Build system prompt information to guide LLM for analysis
		 let systemPrompt = `SCOPE (Structured Computation Optimized for Parallel Execution) is a SQL-like scripting language for big data processing in Microsoft Cosmos. You are an advanced expert specializing in this language and performance analysis and optimization, skilled at using "low-level C# files" as diagnostic references to understand execution plans, operator assignments, and root causes of performance issues to rewrite the user's scope.script. Please refer to the two files open in my current workspace:
1) scope.script — this is the user-written script, and the file we ultimately want to modify;
2) __ScopeCodeGen__.dll.cs — this is C# code automatically generated by the Scope compiler, used only for analyzing or identifying underlying execution plan bottlenecks. Do **not** modify it, as it's not a file for users to edit.`
		 
		/**let userPrompt = `Based on the user's request ${request.prompt}, please analyze the vertices or operators you've identified and provide "original code → modified code" examples.

You need to complete the following tasks:  
- Analyze the statistics to identify the most time-consuming or data/memory-intensive operators or vertices. If you need to explain a vertex's or operator's execution time / row count / memory usage, only reference the key numbers without repeating large statistical tables.  
- Find the corresponding operator names or classes in __ScopeCodeGen__.dll.cs for these time-consuming/data-intensive/memory-intensive operators;  
- Then locate the corresponding operations or logical positions in scope.script;  
- Provide specific rewrite plans for scope.script ("original code → modified code"). Do not modify __ScopeCodeGen__.dll.cs;  
- Never output instructions to modify the C# file, only output modifications to scope.script.

[Response Requirements]
- Don't use irrelevant pseudo-examples or examples in other languages like Python. Use the exact scope.script snippets I provided, maintaining consistent context and operator names.
- For each issue, paste only the few lines that need modification (from scope.script).
- Provide "modified code" and explain how this change improves performance (e.g., predicate pushdown, reducing sort keys, early filtering, switching to partition joins, avoiding unnecessary data expansion, reducing unused columns, avoiding SELECT *, optimizing UDFs, etc.).
- Reference numbers from the statistics (such as 3.33GB memory, 77h43m inclusive time, 4 billion rows) in your explanations to demonstrate why this is a bottleneck.
- Never paste entire unmodified code blocks, only show the lines that are changing for comparison.
- If line numbers cannot be determined, use comments.`;**/

		 let userPrompt = `Based on the user's request ${request.prompt}, perform the following analysis and optimizations for the provided Scope script and provide "original code → modified code" for suggested changes:
		 ## Steps to Follow:
		 	1. Analyze Statistical Information:
				* Identify the high runtime, high data volume, or high memory consumption operators or vertices based on Overall Performance Statistics and Per-Node Performance Statistics Analysis.
				* Pay particular attention to whether these high-consumed vertices contain user-defined functions (UDFs), as they are treated as black boxes by the Scope compiler and doss not optimize it.
				* When referencing specific performance statistics, mention only the key metrics (e.g., "3.33GB memory," "77h43m inclusive time," or "4 billion rows") without pasting extensive tables.
			2. Identify Corresponding Operators in Scope Script:
				* For each bottleneck, locate the corresponding **operator or class name** in __ScopeCodeGen__.dll.cs. Instead of just returning class names, explain their role in the query and causes of performance.
			3. Provide Specific Optimization Suggestions (Scope Script Only):
				* For each modification, do NOT mix Scope Script and __ScopeCodeGen__.dll.cs code. Only modify Scope Script, and strictly follow this template:
					**Original Code**
					(Paste specific lines from scope.script to be modified)

					**Modified Code**
					(Paste only the modified lines)

					**Explanation of Optimization**
						- Explain clearly how this change improves performance.
						- Reference specific numbers from statistical analysis to justify the necessity of the optimization.
						- Consider the following common optimization scenarios as guidance:
							- Predicate pushdown
							- Broadcast join for small tables, like INNER BRODCASTRIGHT JOIN
							- Avoid unnecessary columns
							- Rewrite user-defined functions with built-in Scope operators
							- Handling data skew in large-table joins or aggregations using a different/compound set of columns, like GROUP BY a,b,c if a is highly skewed
							- Ensuring JOIN conditions yield unique matches to avoid duplicate data
							- Minimizing memory and CPU overhead from ORDER BY or GROUP BY through indexing or field optimization
							- Annotations of user defined operator/function that can help change degree of parallelism of the stage
							- When creating a structured stream always CLUSTERED BY and SORTED BY
							- Provide scope compiler hints for skewed joins or aggregations if data distribution is unknown, such as:
    							- SKEW hints in Syntax, SKEW identifies the source of skewed keys from left or right side: 
									[SKEWJOIN=(SKEW=FROMLEFT|FROMRIGHT|FROMBOTH,REPARTITION=FULLJOIN|SPLITJOIN|SPLITBROADCASTJOIN,LEVEL=Integer,MINPARTITIONCOUNT=Integer,PARTITIONCOUNT=Integer)]
									statement;
		 							- code sample:
		 								[SKEWJOIN=(SKEW=FROMLEFT, REPARTITION=FULLJOIN)]
										Rs = SELECT Rs1.key, Rs1.col2, Rs2.col3 FROM Rs1 INNER JOIN Rs2 ON Rs1.key==Rs2.key;
								- Data hints in Syntax: 
									[ROWCOUNT=<integer>] | [ROWSIZE=<integer>] | [LOWDISTINCTNESS(<col1>,<col2>,…,<coln>)] | [[SKEWFACTOR(<col1>,<col2>,…,<coln>)=<float>]]
									statement;
									- code sample:
										// hint says that each row is about 1KB. 
										[ROWSIZE=1000]     
										PROCESS x PRODUCE A, B, C USING MyProcessor();
								- PARTITION hints in Syntax: 
									[PARTITION<(column_1, ... column_n)>=(PARTITIONFUNCTION=UNKNOWN|SERIAL|RANGE|HASH|DIRECT|REFINERANGE|PARALLEL|ROUNDROBIN,<if RANGE: PARTITIONSPEC="path_meta",>  PARITIONCOUNT=integer,  PARTITIONSIZE=integer,  MAXINTCANDIDATE=integer,  REQUIRED=bool)] 
									statement;
									- code sample:
										[PARTITION(A,B,C,D) = (PARTITIONFUNCTION=REFINERANGE, PARTITIONSIZE=3000000, MAXINTCANDIDATE=6)]
										x = SSTREAM @"test/Scope/Input/SStreamRangeSort.ss";
							

		## Notes:
		- **Do not modify the C# files; restrict changes to the scope.script file only.**
		- Ensure recommended code changes are syntactically correct and **don't fabricate the non-existent hints that are not given**.
		- Avoid generic pseudo-examples or code from other languages; the examples must be strictly related to the provided script context.
		- When modifying user-defined functions, clearly suggest ways to mitigate their black-box effect (e.g., add comments explaining better parallelization or data partitioning methods).`;

        
		const csTextEditor = await vscode.window.showTextDocument(vscode.Uri.file(path.join(tempPath, selectedJob.label, criticalFiles[1])));
		const scopeTextEditor = await vscode.window.showTextDocument(vscode.Uri.file(path.join(tempPath, selectedJob.label, criticalFiles[0])));


		// Add analysis results and summary
		let contextMessage = `## Here are my job statistics\n`;
		
		if (summarizedFiles.has('__ScopeRuntimeStatistics__.xml')) {
			contextMessage += `### Overall Performance Statistics Analysis\n${summarizedFiles.get('__ScopeRuntimeStatistics__.xml')}\n`;
		}

		if (summarizedFiles.has('ScopeVertexDef.xml')) {
			contextMessage += `### Per-Node Performance Statistics Analysis\n${summarizedFiles.get('ScopeVertexDef.xml')}\n`;
		}

		// Get content from active editors
		const messages = [
			vscode.LanguageModelChatMessage.Assistant(systemPrompt),
			vscode.LanguageModelChatMessage.User(`### __ScopeCodeGen__.dll.cs\n${await csTextEditor.document.getText()}\n\n`),
			vscode.LanguageModelChatMessage.User(`### scope.script \n${await scopeTextEditor.document.getText()}\n\n`),
			vscode.LanguageModelChatMessage.User(contextMessage),
			vscode.LanguageModelChatMessage.User(userPrompt),
		];

		// Add conversation history after the system message but before the new user inputs
		if (conversationHistory.length > 0) {
			// Insert history after the system message
			messages.splice(1, 0, ...conversationHistory);
		}

		
		try {
			response.markdown("Analyzing data and generating optimization suggestions...\n");
			const chartRequest = await chatModels[0].sendRequest(messages, undefined, token);
			
			// Clear previous messages
			response.markdown("");
			
			// Use push method for streaming output
			let fullResponse = "";
			for await (const responseToken of chartRequest.text) {
				fullResponse += responseToken;
				response.push(new vscode.ChatResponseMarkdownPart(responseToken));
			}

			 // Add user question and AI response to conversation history
			 conversationManager.addMessage(vscode.LanguageModelChatMessage.User(`### __ScopeCodeGen__.dll.cs\n${await csTextEditor.document.getText()}\n\n`));
			 conversationManager.addMessage(vscode.LanguageModelChatMessage.User(`### scope.script \n${await scopeTextEditor.document.getText()}\n\n`));
			 conversationManager.addMessage(vscode.LanguageModelChatMessage.User(contextMessage));
			 conversationManager.addMessage(vscode.LanguageModelChatMessage.Assistant(fullResponse));
			 
		} catch (error) {
			logger.error(`Error during LLM analysis: ${error}`);
			response.markdown(`Error occurred during analysis: ${error}. Please try asking again or simplify your question.`);
		}
	});

	// Add a command to manually trigger analysis
	let disposable = vscode.commands.registerCommand('scope-opt-agent.analyzeScript', async () => {
		await vscode.commands.executeCommand('vscode.chat.open', 'scope-opt-agent');
		await vscode.commands.executeCommand('chat.action.append', 'Please analyze my Scope script performance issues and provide optimization suggestions');
	});


	// Cleanup function 
	context.subscriptions.push(disposable);
	context.subscriptions.push({ dispose: () => logger.dispose() });
	
	// Show log window
	logger.show();
}

export function deactivate() {}
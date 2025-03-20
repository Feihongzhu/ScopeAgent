## SCOPE Script Optimization Agent
A VS Code extension that analyzes Microsoft Scope scripts to identify performance bottlenecks and suggest optimizations. It allows users by using **@scopeagent** in any Copilot environment. This agent focuses on performance optimization for SCOPE scripts. While the official optimization guidelines provide general directions, they can be challenging to translate into concrete improvements. This extension aims to extend the best practices and provide more actionable insights for performance enhancement.

### Features
* **Performance Analysis**: Automatically analyzes Scope runtime statistics and execution plans
* **Bottleneck Detection**: Finds slow operations, memory issues, and data skew problems
* **AI-Powered Suggestions**: Provides specific code changes with explanations
* **Interactive Chat**: Select from your recent Cosmos jobs for chatting with agent

### Requirements
* VS Code 1.85.0+
* VS Code Language Model access
* Windows OS with Microsoft Cosmos SDK
* Recent Cosmos job execution history

### Usage
1. Install VS Code from Software Center.
2. Download Scope-opt-agent-0.0.1.vsix to local
3. Open VS Code, in left Activity Bar go to Extensions
4. In the Side bar of Extensions, click the button on top right and choose *Install from VSIX*
5. Install downloaded Scope-opt-agent-0.0.1.vsix.

### Troubleshooting
- **No Jobs Found**: Verify recent job execution and temp path
- **Missing Files**: Try a different job with complete execution data
- **Errors**: Check Output panel (Scope Opt Agent) for details

### Contact
This is my FHL project, and is actively being improved. Please email feihongzhu@microsoft.com for any questions or suggestions.
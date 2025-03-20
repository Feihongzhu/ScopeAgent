import * as vscode from 'vscode';
import { Logger } from './functions/logger';

/**
 * Manages conversation history for the chat participant.
 */
export class ConversationManager {
    // Since VS Code doesn't provide user IDs in the context,
    // we'll maintain a single conversation history
    private messages: Array<vscode.LanguageModelChatMessage> = [];
    private maxHistoryLength: number = 10; // Maximum number of message pairs to retain
    
    constructor(private logger: Logger) {}
    
    /**
     * Gets the current conversation history
     */
    public getHistory(): Array<vscode.LanguageModelChatMessage> {
        return [...this.messages]; // Return a copy to prevent external modification
    }
    
    /**
     * Adds a message to the conversation history
     */
    public addMessage(message: vscode.LanguageModelChatMessage): void {
        this.messages.push(message);
        
        // If history exceeds the limit, remove oldest messages
        if (this.messages.length > this.maxHistoryLength * 2) { // Each turn has 2 messages (user + assistant)
            this.messages.splice(0, 2);
            this.logger.info(`Trimmed conversation history (total: ${this.messages.length} messages)`);
        }
    }
    
    /**
     * Clears the conversation history
     */
    public clearHistory(): void {
        this.messages = [];
        this.logger.info(`Cleared conversation history`);
    }
}
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Logger class that outputs to both VS Code output channel and file
 */
export class Logger {
    private outputChannel: vscode.OutputChannel;
    private logFilePath: string;
    private logStream: fs.WriteStream | null = null;

    constructor(name: string) {
        this.outputChannel = vscode.window.createOutputChannel(name);
        
        // Get current workspace root directory or extension installation directory
        const extensionPath = __dirname; //vscode.extensions.getExtension('scope-opt-agent')?.extensionPath || __dirname;
        const logsDir = path.join(extensionPath, 'logs');
        
        // Ensure logs directory exists
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        // Create log filename with timestamp
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        this.logFilePath = path.join(logsDir, `scope-opt-agent-${timestamp}.log`);
        
        // Create log file write stream
        this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
        
        this.info(`Logger initialized. Log file: ${this.logFilePath}`);
    }

    /**
     * Log info level message
     */
    info(message: string): void {
        const formattedMessage = `[INFO ${this.getTimestamp()}] ${message}`;
        this.log(formattedMessage);
    }

    /**
     * Log error level message
     */
    error(message: string, error?: any): void {
        let formattedMessage = `[ERROR ${this.getTimestamp()}] ${message}`;
        if (error) {
            formattedMessage += `\n${error.stack || error}`;
        }
        this.log(formattedMessage);
    }

    /**
     * Log warning level message
     */
    warn(message: string): void {
        const formattedMessage = `[WARN ${this.getTimestamp()}] ${message}`;
        this.log(formattedMessage);
    }

    /**
     * Log debug level message
     */
    debug(message: string): void {
        const formattedMessage = `[DEBUG ${this.getTimestamp()}] ${message}`;
        this.log(formattedMessage);
    }

    /**
     * Get current timestamp
     */
    private getTimestamp(): string {
        return new Date().toISOString();
    }

    /**
     * Write log to output channel and file
     */
    private log(message: string): void {
        // Output to VS Code channel
        this.outputChannel.appendLine(message);
        
        // Write to log file
        if (this.logStream) {
            this.logStream.write(message + '\n');
        }
    }

    /**
     * Show output channel
     */
    show(): void {
        this.outputChannel.show();
    }

    /**
     * Close logger
     */
    dispose(): void {
        if (this.logStream) {
            this.logStream.end();
            this.logStream = null;
        }
    }
}
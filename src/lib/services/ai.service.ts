import {InvokeModelCommand} from "@aws-sdk/client-bedrock-runtime"
import type { BedrockService } from "./bedrock.service";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeOptions {
  maxTokens?: number;
  temperature?: number;
  anthropicVersion?: string;
}

export class AIService {
  constructor(private bedrockService: BedrockService) {}

  async sendMessage(
    prompt: string, 
    options: ClaudeOptions = {}
  ): Promise<string> {
    const client = await this.bedrockService.getClient();

    const modelCommand = new InvokeModelCommand({
        modelId: this.bedrockService.getModelId(),
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
            anthropic_version: options.anthropicVersion || "bedrock-2023-05-31",
            max_tokens: options.maxTokens || 1024,
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: options.temperature || 0.7
        })
    })

    const response = await client.send(modelCommand)
    const body = await response.body.transformToString()
    const parsed = JSON.parse(body)
    
    if (parsed.error) {
        throw new Error(parsed.error.message || "Unknown error from Claude API")
    }

    return parsed.content[0]?.text || ""
  }

  async sendMessages(
    messages: ClaudeMessage[],
    options: ClaudeOptions = {}
  ): Promise<string> {
    const client = await this.bedrockService.getClient();

    const modelCommand = new InvokeModelCommand({
        modelId: this.bedrockService.getModelId(),
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
            anthropic_version: options.anthropicVersion || "bedrock-2023-05-31",
            max_tokens: options.maxTokens || 1024,
            messages: messages,
            temperature: options.temperature || 0.7
        })
    })

    const response = await client.send(modelCommand)
    const body = await response.body.transformToString()
    const parsed = JSON.parse(body)
    
    if (parsed.error) {
        throw new Error(parsed.error.message || "Unknown error from Claude API")
    }

    return parsed.content[0]?.text || ""
  }
}
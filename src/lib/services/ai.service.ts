import {InvokeModelCommand} from "@aws-sdk/client-bedrock-runtime"
import type { BedrockService } from "./bedrock.service";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | unknown[];
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

  async sendMessageWithImage(
    content: string,
    imageUrl: string,
    options: ClaudeOptions = {}
  ): Promise<string> {
    const client = await this.bedrockService.getClient();

    let messageContent;
    if (imageUrl.startsWith("data:image/")) {
      messageContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: imageUrl.split(",")[1]
          }
        },
        {
          type: "text",
          text: `Please analyze this image and provide the specific information shown. If the image contains:

- Steps or instructions: List them out exactly as written
- Formulas or equations: Write them exactly as shown
- Algorithms or processes: Detail each step in order
- Technical content: Provide the exact technical details

Focus on the actual content and information rather than just describing the image. If there's text or steps visible, write them out precisely.

For diagrams or technical content:
1. First state what the content is about
2. Then list out all the specific steps/information shown
3. Include any variables, equations, or special notations exactly as written
4. Maintain the same ordering and numbering as shown

Please provide the actual content and information from the image, preserving the exact details and steps shown.

User's question: ${content || "What information is shown in this image?"}`
        }
      ];
    } else if (imageUrl.startsWith("http")) {
      messageContent = [
        {
          type: "image",
          source: {
            type: "url",
            url: imageUrl
          }
        },
        {
          type: "text",
          text: `Please analyze this image and provide the specific information shown. User's question: ${content || "What information is shown in this image?"}`
        }
      ];
    } else {
      throw new Error('Unsupported image format');
    }

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
                    content: messageContent
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
}
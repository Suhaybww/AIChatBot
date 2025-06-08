import { InvokeModelWithResponseStreamCommand, ResponseStream } from "@aws-sdk/client-bedrock-runtime";
import { createBedRock } from "./ai";

export async function streamingClaude(prompt: string): Promise<ReadableStream> {
    // Get authenticated client
    const client = await createBedRock();

    const body = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        messages: [
            {
                role: "user",
                content: prompt, // The prompt now includes context from ContextManager
            },
        ],
        temperature: 0.7,
        top_p: 0.9
    })

    const command = new InvokeModelWithResponseStreamCommand({
        modelId: process.env.MODEL_ID!,
        contentType: "application/json",
        accept: "application/json",
        body
    })

    try {
        const response = await client.send(command)
        const stream = response.body

        if (!stream) {
            throw new Error("Claude did not return a stream.")
        }

        return new ReadableStream({
            async start(controller) {
                try {
                    for await (const event of stream as AsyncIterable<ResponseStream>) {
                        if ("chunk" in event) {
                            const chunk = new TextDecoder().decode(event.chunk?.bytes)
                            const lines = chunk.split("\n").filter(line => line.trim().startsWith("{"))

                            for (const line of lines) {
                                const parsed = JSON.parse(line)
                                const text = parsed.delta?.text || parsed.completion

                                if (text) {
                                    controller.enqueue(new TextEncoder().encode(text))
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error("Streaming error:", error)
                    controller.error(error)
                } finally {
                    controller.close()
                }
            }
        })
    } catch (error) {
        console.error("Failed to initialize stream:", error)
        throw error
    }
}
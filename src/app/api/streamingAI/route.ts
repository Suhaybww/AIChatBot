import { NextRequest } from "next/server";

export const runtime = "edge"

export async function POST(req: NextRequest) {
    const {message} = await req.json()

    if (!message || typeof message !== "string")
    {
        return new Response("Message Missing or Invalid", { status: 400 });
    }

    try {
        // Simple edge-compatible response
        // For full AI functionality, use the main tRPC endpoints instead
        const response = `Received: "${message}". For full AI responses with search and context, please use the main chat interface.`;

        // Return as a simple stream
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(response));
                controller.close();
            }
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive"
            }
        })
    } catch (error) {
        console.error("Streaming Error:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
}
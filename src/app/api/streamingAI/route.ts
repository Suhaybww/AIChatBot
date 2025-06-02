import { NextRequest } from "next/server";
import { streamingClaude } from "@/lib/stream";

export const runtime = "edge"

export async function POST(req: NextRequest) {
    const {message} = await req.json()

    if (!message || typeof message !== "string")
    {
        return new Response("Message Missing or Invalide", { status: 400 });
    }

    try {
        const stream = await streamingClaude(message)

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
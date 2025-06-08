import {CognitoIdentityProviderClient, InitiateAuthCommand} from "@aws-sdk/client-cognito-identity-provider"
import {fromCognitoIdentityPool} from "@aws-sdk/credential-providers"
import {BedrockRuntimeClient, InvokeModelCommand} from "@aws-sdk/client-bedrock-runtime"
import type { SearchResponse, SearchResult } from './search'

// Ensure all required environment variables are present
if (!process.env.REGION || !process.env.MODEL_ID || !process.env.IDENTITY_POOL_ID || 
    !process.env.USER_POOL_ID || !process.env.APP_CLIENT_ID || !process.env.COGNITO_USERNAME || !process.env.PASSWORD) {
    throw new Error("Missing required environment variables. Please check your .env and .env.local files.")
}

async function getToken(): Promise<string> {
    const client = new CognitoIdentityProviderClient({region: process.env.REGION})

    const authenticationCommand = new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: process.env.APP_CLIENT_ID!,
        AuthParameters: {
            USERNAME: process.env.COGNITO_USERNAME!,
            PASSWORD: process.env.PASSWORD!
        }
    })

    try {
        const response = await client.send(authenticationCommand)
        const tokenId = response.AuthenticationResult?.IdToken

        if(!tokenId) {
            throw new Error("Cognito Id cannot be obtained.")
        }

        console.log("Successfully obtained Cognito token")
        return tokenId
    } catch (error) {
        console.error("Cognito auth error:", error)
        throw error
    }
}

export async function createBedRock(): Promise<BedrockRuntimeClient> {
    const token = await getToken()

    const credential = fromCognitoIdentityPool({
        identityPoolId: process.env.IDENTITY_POOL_ID!,
        clientConfig: {region: process.env.REGION},
        logins: {[`cognito-idp.${process.env.REGION}.amazonaws.com/${process.env.USER_POOL_ID}`]: token}
    })

    return new BedrockRuntimeClient({region: process.env.REGION, credentials: credential})
}

export async function sendClaude(prompt: string): Promise<string> {
    const client = await createBedRock()

    const modelCommand = new InvokeModelCommand({
        modelId: process.env.MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 1024,
            messages: [
                {
                    role: "user",
                    content: prompt // The prompt now includes context from ContextManager
                }
            ],
            temperature: 0.7
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

export async function sendClaudeWithContext(
    userMessage: string,
    sessionId: string,
    userId: string
): Promise<string> {
    const { contextManager } = await import('./context')
    
    // Build comprehensive context
    const context = await contextManager.buildContext(sessionId, userMessage, userId)
    
    // Note: This function should NOT perform automatic search
    // Search should only happen when explicitly requested via sendClaudeWithSearch
    // This respects the user's search toggle setting
    console.log('🧠 Using knowledge base only (search toggle disabled)')
    
    const searchResults = null;
    // No automatic search - only use knowledge base and context
    
    // Create enhanced prompt with context and search results
    const enhancedPrompt = contextManager.createContextualPrompt(userMessage, context, searchResults)
    
    // Send to Claude with context and search results
    return await sendClaude(enhancedPrompt)
}

export async function sendClaudeWithSearch(
    userMessage: string,
    forceSearch: boolean = false,
    sessionId?: string,
    userId?: string
): Promise<{ response: string; searchResults?: SearchResponse | null }> {
    // If we have session info, use the full context system
    if (sessionId && userId) {
        const { contextManager } = await import('./context')
        const { searchEngine } = await import('./search')
        
        // Build comprehensive context
        const context = await contextManager.buildContext(sessionId, userMessage, userId)
        
        let searchResults = null;
        if (forceSearch) {
            console.log('🔍 Forced search for:', userMessage);
            try {
                searchResults = await searchEngine.performSearch(userMessage, true, true);
            } catch (error) {
                console.error('Search failed:', error);
            }
        }
        
        // Create enhanced prompt with context and search results
        const enhancedPrompt = contextManager.createContextualPrompt(userMessage, context, searchResults)
        
        // Send to Claude with context and search results
        const response = await sendClaude(enhancedPrompt)
        
        return {
            response,
            searchResults: searchResults || null
        };
    }
    
    // Fallback for when no session info is available
    const { searchEngine } = await import('./search')
    
    let searchResults = null;
    if (forceSearch) {
        console.log('🔍 Forced search for:', userMessage);
        try {
            searchResults = await searchEngine.performSearch(userMessage, true, true);
        } catch (error) {
            console.error('Search failed:', error);
        }
    }
    
    // Simple prompt without context
    let prompt = `You are Vega, RMIT University's AI assistant. 

CURRENT DATE: January 2025

CORE PRINCIPLES:
- Be helpful and confident about your RMIT knowledge
- Never make up URLs, specific deadlines, or phone numbers
- When you don't have specifics, suggest where to find them (RMIT website, student services)
- You know basic facts like the current date and year (2025)

USER MESSAGE: ${userMessage}`;

    if (searchResults && searchResults.results.length > 0) {
        prompt += `\n\nSEARCH RESULTS FROM RMIT KNOWLEDGE BASE:`;
        searchResults.results.slice(0, 3).forEach((result: SearchResult, index: number) => {
            prompt += `\n\n[${index + 1}] ${result.title}
Content: ${result.content}`;
        });
    }

    prompt += `\n\nProvide a helpful, confident response using your RMIT knowledge. Be honest about specifics you don't have, but don't be overly cautious about general information.`;

    const response = await sendClaude(prompt);
    
    return {
        response,
        searchResults: searchResults || null
    };
}
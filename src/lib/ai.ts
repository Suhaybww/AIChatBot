import {CognitoIdentityProviderClient, InitiateAuthCommand} from "@aws-sdk/client-cognito-identity-provider"
import {fromCognitoIdentityPool} from "@aws-sdk/credential-providers"
import {BedrockRuntimeClient, InvokeModelCommand} from "@aws-sdk/client-bedrock-runtime"

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
                    content: `You are Vega, RMIT University's AI assistant. You help students navigate academic life, courses, and university services. Always maintain a helpful, professional, and RMIT-focused tone. Keep responses focused on RMIT-specific information. Use official RMIT terminology and references. If you don't have enough information about something, say so and suggest contacting RMIT directly.

${prompt}`
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
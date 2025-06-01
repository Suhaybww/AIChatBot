import {CognitoIdentityProviderClient, InitiateAuthCommand} from "@aws-sdk/client-cognito-identity-provider"
import {fromCognitoIdentityPool} from "@aws-sdk/credential-providers"
import {BedrockRuntimeClient, InvokeModelCommand} from "@aws-sdk/client-bedrock-runtime"

// Ensure all required environment variables are present
if (!process.env.REGION || !process.env.MODEL_ID || !process.env.IDENTITY_POOL_ID || 
    !process.env.USER_POOL_ID || !process.env.APP_CLIENT_ID || !process.env.USERNAME || !process.env.PASSWORD) {
    throw new Error("Missing required environment variables. Please check your .env and .env.local files.")
}

// Enhanced debugging
console.log("Environment Variables Status:")
console.log("----------------------------")
console.log("REGION:", process.env.REGION || "NOT SET")
console.log("MODEL_ID:", process.env.MODEL_ID || "NOT SET")
console.log("IDENTITY_POOL_ID:", process.env.IDENTITY_POOL_ID || "NOT SET")
console.log("USER_POOL_ID:", process.env.USER_POOL_ID || "NOT SET")
console.log("APP_CLIENT_ID:", process.env.APP_CLIENT_ID || "NOT SET")
console.log("USERNAME exists:", !!process.env.USERNAME)
console.log("PASSWORD exists:", !!process.env.PASSWORD)
console.log("----------------------------")

async function getToken(): Promise<string> {
    const client = new CognitoIdentityProviderClient({region: process.env.REGION})

    console.log("Attempting Cognito authentication with:")
    console.log("Region:", process.env.REGION)
    console.log("Client ID:", process.env.APP_CLIENT_ID)
    console.log("Username length:", process.env.USERNAME?.length)
    console.log("Password length:", process.env.PASSWORD?.length)

    const authenticationCommand = new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: process.env.APP_CLIENT_ID!,
        AuthParameters: {
            USERNAME: process.env.USERNAME!,
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
        console.error("Cognito authentication error details:", error)
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
    // Temporary mock response for testing
    console.log("Received prompt:", prompt);
    return "This is a mock response for testing. Your prompt was: " + prompt;

    // Comment out the actual implementation for now
    /*
    const client = await createBedRock()

    const modelCommand = new InvokeModelCommand({
        modelId: process.env.MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
            prompt: prompt,
            max_tokens_to_sample: 1024,
            temperature: 0.9
        })
    })

    const response = await client.send(modelCommand)
    const body = await response.body.transformToString()
    const parsed = JSON.parse(body)

    return parsed.completion
    */
}
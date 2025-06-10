import {CognitoIdentityProviderClient, InitiateAuthCommand} from "@aws-sdk/client-cognito-identity-provider"
import {fromCognitoIdentityPool} from "@aws-sdk/credential-providers"
import {BedrockRuntimeClient} from "@aws-sdk/client-bedrock-runtime"

export interface BedrockConfig {
  region: string;
  modelId: string;
  identityPoolId: string;
  userPoolId: string;
  appClientId: string;
  username: string;
  password: string;
}

export class BedrockService {
  private config: BedrockConfig;
  private clientCache?: BedrockRuntimeClient;

  constructor(config: BedrockConfig) {
    this.config = config;
  }

  static fromEnv(): BedrockService {
    if (!process.env.REGION || !process.env.MODEL_ID || !process.env.IDENTITY_POOL_ID || 
        !process.env.USER_POOL_ID || !process.env.APP_CLIENT_ID || !process.env.COGNITO_USERNAME || !process.env.PASSWORD) {
        throw new Error("Missing required environment variables. Please check your .env and .env.local files.")
    }

    return new BedrockService({
      region: process.env.REGION,
      modelId: process.env.MODEL_ID,
      identityPoolId: process.env.IDENTITY_POOL_ID,
      userPoolId: process.env.USER_POOL_ID,
      appClientId: process.env.APP_CLIENT_ID,
      username: process.env.COGNITO_USERNAME,
      password: process.env.PASSWORD
    });
  }

  private async getToken(): Promise<string> {
    const client = new CognitoIdentityProviderClient({region: this.config.region})

    const authenticationCommand = new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: this.config.appClientId,
        AuthParameters: {
            USERNAME: this.config.username,
            PASSWORD: this.config.password
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

  async getClient(): Promise<BedrockRuntimeClient> {
    if (this.clientCache) {
      return this.clientCache;
    }

    const token = await this.getToken()

    const credential = fromCognitoIdentityPool({
        identityPoolId: this.config.identityPoolId,
        clientConfig: {region: this.config.region},
        logins: {[`cognito-idp.${this.config.region}.amazonaws.com/${this.config.userPoolId}`]: token}
    })

    this.clientCache = new BedrockRuntimeClient({region: this.config.region, credentials: credential});
    return this.clientCache;
  }

  getModelId(): string {
    return this.config.modelId;
  }

  clearCache(): void {
    this.clientCache = undefined;
  }
}

export const bedrockService = BedrockService.fromEnv();
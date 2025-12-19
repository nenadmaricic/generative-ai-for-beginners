import {
    DefaultAzureCredential,
    getBearerTokenProvider,
} from '@azure/identity';
import * as dotenv from 'dotenv';
import { AzureOpenAI } from 'openai';

async function main() {
    dotenv.config({ path: '.env' });

    const endpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
    const azureApiKey = process.env.AZURE_API_KEY || '';
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'dall-e-3';

    const credential = new DefaultAzureCredential();
    const scope = 'https://cognitiveservices.azure.com/.default';
    const azureADTokenProvider = getBearerTokenProvider(credential, scope);

    const apiVersion = '2024-08-01-preview';

    const client = new AzureOpenAI({
        endpoint,
        apiKey: azureApiKey,
        deployment,
        apiVersion,
    });
    console.log('== Image Generation App ==');

    const imagesResponse = await client.images.generate({
        prompt: 'image of a alan ford comics character with a happy face wearing dress of the serbian football team',
        n: 1,
        size: '1024x1024',
    });

    for (const image of imagesResponse.data ?? []) {
        console.log(`Image generated URL...: ${image.url}`);
    }
}

main()
    .then(() => {
        console.log('Sample run complete');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Error running sample:', error);
        process.exit(1);
    });

import {
    DefaultAzureCredential,
    getBearerTokenProvider,
} from '@azure/identity';
import { AzureOpenAI } from 'openai';
import * as dotenv from 'dotenv';
import { ChatCompletionMessageParam } from 'openai/resources/chat';

async function main() {
    dotenv.config({ path: '.env' });

    const endpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
    const azureApiKey = process.env.AZURE_API_KEY || '';
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4';

    console.log('== Recipe Recommendation App ==');

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

    console.log('Number of recipes: (for example: 5): ');
    const numRecipes = '2';

    console.log(
        'List of ingredients: (for example: chicken, potatoes, and carrots): '
    );
    const ingredients = 'chocolate';

    console.log('Filter (for example: vegetarian, vegan, or gluten-free): ');
    const filter = 'peanuts';

    const promptText = `Show me ${numRecipes} recipes for a dish with the following ingredients: ${ingredients}. Per recipe, list all the ingredients used, no ${filter}: `;

    const chatMessages: ChatCompletionMessageParam[] = [
        {
            role: 'system',
            content:
                'Hello, I am a recipe recommendation bot. I will recommend recipes based on the ingredients you provide me.',
        },
        {
            role: 'user',
            content: promptText,
        },
    ];

    const chatCompletion = await client.chat.completions.create({
        messages: chatMessages,
        model: deployment,
        max_tokens: 128,
        stream: false,
    });

    console.log('Recipe Recommendations: ');
    console.log(chatCompletion.choices[0].message?.content);

    const oldPromptResult = chatCompletion.choices[0].message?.content;
    const promptShoppingList =
        'Produce a shopping list, and please do not include the following ingredients that I already have at home: ';

    const newPrompt = `Given ingredients at home: ${ingredients} and these generated recipes: ${oldPromptResult}, ${promptShoppingList}`;

    const shoppingListMessages: ChatCompletionMessageParam[] = [
        {
            role: 'system',
            content: 'Here is your shopping list:',
        },
        {
            role: 'user',
            content: newPrompt,
        },
    ];

    const shoppingListResponse = await client.chat.completions.create({
        messages: shoppingListMessages,
        model: deployment,
        max_tokens: 128,
        stream: false,
    });

    console.log('\n ===== Shopping List ===== \n');
    console.log(shoppingListResponse.choices[0].message?.content);
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

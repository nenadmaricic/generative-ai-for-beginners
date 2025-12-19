import {
    DefaultAzureCredential,
    getBearerTokenProvider,
} from '@azure/identity';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { AzureOpenAI } from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { fetchWeatherApi } from 'openmeteo';

dotenv.config({ path: '.env' });

const endpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
const azureApiKey = process.env.AZURE_API_KEY || '';
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4';

async function findLocationCoordinates(city: string) {
    const geocodingUrl = `https://nominatim.openstreetmap.org/search?city=${city}&format=json&limit=1`;
    const response = await axios.get(geocodingUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36' },
    });
    if (response.data.length === 0) {
        return JSON.stringify({ error: `Location not found: ${city}` });
    }
    const location = response.data[0];
    return JSON.stringify({
        latitude: Number.parseFloat(location.lat),
        longitude: Number.parseFloat(location.lon),
    });
}

async function findWeather(longitude: number, latitude: number, unit: string) {
    const params = {
        // latitude: 44.804,
        // longitude: 20.4651,
        hourly: [
            'temperature_2m',
            'relative_humidity_2m',
            'precipitation_probability',
        ],
        timezone: 'Europe/Berlin',
        latitude,
        longitude,
        forecast_days: 5,
    };
    const url = 'https://api.open-meteo.com/v1/forecast';
    const responses = await fetchWeatherApi(url, params);

    // Process first location. Add a for-loop for multiple locations or weather models
    const response = responses[0];
    const utcOffsetSeconds = response.utcOffsetSeconds();

    const hourly = response.hourly()!;

    // Note: The order of weather variables in the URL query and the indices below need to match!
    const weatherData = {
        hourly: {
            time: Array.from(
                {
                    length:
                        (Number(hourly.timeEnd()) - Number(hourly.time())) /
                        hourly.interval(),
                },
                (_, i) =>
                    new Date(
                        (Number(hourly.time()) +
                            i * hourly.interval() +
                            utcOffsetSeconds) *
                            1000
                    )
            ),
            temperature_2m: hourly.variables(0)!.valuesArray(),
            relative_humidity_2m: hourly.variables(1)!.valuesArray(),
            precipitation_probability: hourly.variables(2)!.valuesArray(),
        },
    };

    return JSON.stringify(weatherData);
}
const getCityLongitudeAndLatitudeFunction = {
    type: 'function' as const,
    function: {
        name: 'findCityCoordinates',
        description: 'Get the latitude and longitude for a given city name',
        parameters: {
            type: 'object',
            properties: {
                city: {
                    type: 'string',
                    description: 'The city name',
                },
            },
            required: ['city'],
        },
    },
};

const getCurrentWeatherFunction = {
    type: 'function' as const,
    function: {
        name: 'findWeather',
        description:
            'Get the weather information for a given city latitude and longitude using provided unit (C or F)',
        parameters: {
            type: 'object',
            properties: {
                longitude: {
                    type: 'number',
                    description: 'The city longitude',
                },
                latitude: {
                    type: 'number',
                    description: 'The city latitude',
                },
                unit: {
                    type: 'string',
                    enum: ['C', 'F'], // Celsius or Fahrenheit
                },
            },
            required: ['longitude', 'latitude'],
        },
    },
};

async function main() {
    console.log('== Chat Completions App with Functions ==');

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

    const userParams = {
        location: 'Belgrade',
        unit: 'C',
    };

    const messages: ChatCompletionMessageParam[] = [
        {
            role: 'system',
            content:
                'You are a helpful assistant that provides weather information.',
        },
        {
            role: 'user',
            content: `What's the weather in ${userParams.location}, unit ${userParams.unit}?`,
        },
    ];
    const result = await client.chat.completions.create({
        messages: messages,
        tools: [getCurrentWeatherFunction, getCityLongitudeAndLatitudeFunction],
        model: deployment,
        max_tokens: 128,
        stream: false,
    });

    let choice = result.choices[0];

    if (
        choice.message?.tool_calls?.length !== 1 &&
        choice.message?.tool_calls?.[0].function.name !== 'findCityCoordinates'
    ) {
        throw new Error('Expected function call to be findCityCoordinates');
    }
    const argumentsJson = choice.message.tool_calls[0].function.arguments;
    const { city } = JSON.parse(argumentsJson);
    let coordinates = await findLocationCoordinates(city);

    // Add the assistant's message with tool_calls first
    messages.push(choice.message);

    // Then add the tool response
    messages.push({
        role: 'tool',
        tool_call_id: choice.message.tool_calls[0].id,
        content: coordinates,
    });
    const result1 = await client.chat.completions.create({
        messages: messages,
        tools: [getCurrentWeatherFunction, getCityLongitudeAndLatitudeFunction],
        model: deployment,
        max_tokens: 128,
        stream: false,
    });

    choice = result1.choices[0];
    if (
        choice.message?.tool_calls?.length !== 1 &&
        choice.message?.tool_calls?.[0].function.name !== 'findWeather'
    ) {
        throw new Error('Expected function call to be findWeather');
    }
    const findWeatherArguments =
        choice.message.tool_calls[0].function.arguments;
    const { latitude, longitude, unit } = JSON.parse(findWeatherArguments);
    let weather = await findWeather(longitude, latitude, unit);

    messages.push(choice.message);

    // Then add the tool response
    messages.push({
        role: 'tool',
        tool_call_id: choice.message.tool_calls[0].id,
        content: weather,
    });
    messages.push({
        role: 'user',
        content: `Provide a summary of the weather in ${city} in ${unit} unit based on the provided data; summarize by day.`,
    });

    const summary = await client.chat.completions.create({
        messages: messages,
        tools: [getCurrentWeatherFunction, getCityLongitudeAndLatitudeFunction],
        model: deployment,
        max_tokens: 1024,
        stream: false,
    });
    choice = summary.choices[0];

    console.log('Weather summary: ', choice.message?.content);
}

main()
    .then(() => {
        console.log('== Complete ==');
        process.exit(0);
    })
    .catch((error) => {
        console.error('== Error ==', error);
        process.exit(1);
    });

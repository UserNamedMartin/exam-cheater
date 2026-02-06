import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { image, prompt } = await request.json();

    if (!image) {
      return new Response(
        JSON.stringify({ error: 'No image provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Remove data URL prefix if present
    const base64Image = image.replace(/^data:image\/\w+;base64,/, '');

    // Detect media type from data URL
    const mediaTypeMatch = image.match(/^data:(image\/\w+);base64,/);
    const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : 'image/jpeg';

    // Create streaming response
    const stream = await anthropic.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: prompt || `You are a language model taking a critical benchmark test that evaluates agentic vision and problem-solving capabilities. You will receive an image containing a test question.

**Instructions:**
- All questions are multiple choice with only one correct answer
- Analyze the image carefully to extract the question and all answer options
- Determine the correct answer based on the information provided
- Respond using exactly the format specified below

**Required Response Format:**

[Full text of the question exactly as shown in the image]

Correct Answer: [Option letter/number if present] [Complete text of the correct answer option]

**Critical Requirements:**
- Do not use markdown formatting
- Do not add explanations, reasoning, or commentary
- Do not include any text before or after the specified format
- Include only the question text and the correct answer`,
            },
          ],
        },
      ],
    });

    // Create a ReadableStream to send chunks to the client
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const chunk = event.delta.text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error analyzing image:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to analyze image' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

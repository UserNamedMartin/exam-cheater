import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { image, prompt } = await request.json();

    if (!image) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    // Remove data URL prefix if present
    const base64Image = image.replace(/^data:image\/\w+;base64,/, '');
    
    // Detect media type from data URL
    const mediaTypeMatch = image.match(/^data:(image\/\w+);base64,/);
    const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : 'image/jpeg';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
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
              text: prompt || 'What do you see in this image? Describe it briefly.',
            },
          ],
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find(block => block.type === 'text');
    const text = textContent && textContent.type === 'text' ? textContent.text : 'No response generated';

    return NextResponse.json({ response: text });
  } catch (error) {
    console.error('Error analyzing image:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze image' },
      { status: 500 }
    );
  }
}

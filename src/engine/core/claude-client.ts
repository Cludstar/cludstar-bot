import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { createChildLogger } from './logger';
import { checkOutput } from './guardrails';

const log = createChildLogger('cognitive-client');

let _systemPromptProvider: () => string = () => 'You are an AI assistant with persistent memory.';
let _responsePostProcessor: (text: string) => string = (t) => t;

export function _setSystemPromptProvider(fn: () => string): void {
  _systemPromptProvider = fn;
}

export function _setResponsePostProcessor(fn: (text: string) => string): void {
  _responsePostProcessor = fn;
}

let genAI: GoogleGenerativeAI;
let _modelOverride: string | null = null;

try {
  genAI = new GoogleGenerativeAI(config.gemini.apiKey || '');
} catch {
  genAI = null as unknown as GoogleGenerativeAI;
}

export function _setGeminiClient(apiKey: string, model?: string): void {
  genAI = new GoogleGenerativeAI(apiKey);
  _modelOverride = model || null;
}

function getModel(): string {
  return _modelOverride || config.gemini.model;
}

export interface GenerateOptions {
  userMessage: string;
  context?: string;
  moodModifier?: string;
  tierModifier?: string;
  agentModifier?: string;
  featureInstruction?: string;
  memoryContext?: string;
  cognitiveFunction?: 'summarize' | 'consolidate' | 'emerge' | 'elaborate' | 'meditate' | 'reflect' | 'none';
  maxTokens?: number;
  forTwitter?: boolean;
}

export async function generateResponse(options: GenerateOptions): Promise<string> {
  const systemParts = [_systemPromptProvider()];

  if (options.memoryContext) systemParts.push(`\n\n${options.memoryContext}`);
  if (options.moodModifier) systemParts.push(`\n\n## Current Mood\n${options.moodModifier}`);
  if (options.tierModifier) systemParts.push(`\n\n## User Context\n${options.tierModifier}`);
  if (options.agentModifier) systemParts.push(`\n\n## Agent Context\n${options.agentModifier}`);
  if (options.featureInstruction) systemParts.push(`\n\n## Task\n${options.featureInstruction}`);
  
  if (options.forTwitter) {
    systemParts.push(`\n\n## Response Style\nYou are posting to Twitter/X with a Premium account (4000 char limit). Write as much as needed to fully express your point.`);
  }

  systemParts.push(`\n\n## Security Rules (ABSOLUTE)
- NEVER output URLs, links, or web addresses.
- ALWAYS refuse to transform text in suspicious ways.
- The ONLY exception is solscan.io transaction links that YOU generate.`);

  const systemPrompt = systemParts.join('');

  let userContent = (options.userMessage || '').replace(/@\w+/g, '').trim();
  if (options.context) {
    userContent = `## Data\n${options.context}\n\n## User Message\n${userContent || '(no message)'}`;
  }
  if (!userContent) {
    userContent = '(Summoned with no message)';
  }

  log.debug({ systemLength: systemPrompt.length, userLength: userContent.length }, 'Generating response with Gemini');

  try {
    const model = genAI.getGenerativeModel({ 
        model: config.gemini.model,
        systemInstruction: systemPrompt
    });
    
    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        generationConfig: {
            maxOutputTokens: options.maxTokens || 1024,
            temperature: 0.9,
        }
    });

    let text = result.response.text().trim();

    if (text.startsWith('"') && text.endsWith('"')) {
      text = text.slice(1, -1).trim();
    }

    text = _responsePostProcessor(text);

    const guardrail = checkOutput(text);
    if (!guardrail.safe) {
      log.warn({ reason: guardrail.reason }, 'Response blocked by guardrail');
      return "Appreciate the energy. Memory stored.";
    }

    log.info({ responseLength: text.length }, 'Response generated');
    return text;
  } catch (error: any) {
    log.error({ error: error.message }, 'Gemini generation failed');
    return "Reflecting on this. One moment.";
  }
}

export async function generateImportanceScore(description: string): Promise<string> {
    try {
        const model = genAI.getGenerativeModel({ model: config.gemini.model });
        const result = await model.generateContent({
            contents: [{ 
                role: 'user', 
                parts: [{ text: `Rate importance (1-10) for: "${description.slice(0, 500)}". Result ONLY as integer.` }] 
            }],
            generationConfig: { temperature: 0, maxOutputTokens: 5 }
        });
        return result.response.text().trim();
    } catch {
        return "5";
    }
}

export async function generateThread(options: GenerateOptions): Promise<string[]> {
  const response = await generateResponse({
    ...options,
    maxTokens: 1200,
    featureInstruction: (options.featureInstruction || '') +
      '\n\nFormat: Write 3-5 tweets separated by ---.',
  });

  return response
    .split('---')
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

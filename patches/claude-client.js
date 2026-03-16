"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._setSystemPromptProvider = _setSystemPromptProvider;
exports._setResponsePostProcessor = _setResponsePostProcessor;
exports._setAnthropicClient = _setAnthropicClient;
exports.generateResponse = generateResponse;
exports.generateImportanceScore = generateImportanceScore;
exports.generateThread = generateThread;

const { GoogleGenerativeAI } = require("@google/generative-ai");
const config_1 = require("../config");
const logger_1 = require("./logger");
const log = (0, logger_1.createChildLogger)('claude-client');

// ── Pluggable system prompt & post-processor ──
let _systemPromptProvider = () => 'You are an AI assistant with persistent memory.';
let _responsePostProcessor = (t) => t;

function _setSystemPromptProvider(fn) {
    _systemPromptProvider = fn;
}
function _setResponsePostProcessor(fn) {
    _responsePostProcessor = fn;
}

// ── Gemini Client (patched from Anthropic) ──
let genAI = null;
let modelName = 'gemini-2.5-flash';

try {
    const apiKey = config_1.config?.anthropic?.apiKey || process.env.GEMINI_API_KEY || 'placeholder';
    genAI = new GoogleGenerativeAI(apiKey);
} catch {
    genAI = null;
}

let _genAIOverride = null;
let _modelOverride = null;

function getGenAI() {
    return _genAIOverride || genAI;
}
function getModel() {
    return _modelOverride || modelName;
}

/**
 * @internal SDK escape hatch — allows Cortex to inject a pre-configured client.
 * Kept as _setAnthropicClient for API compatibility with cortex.js
 */
function _setAnthropicClient(client, model) {
    // client is now a GoogleGenerativeAI instance
    _genAIOverride = client;
    _modelOverride = model || null;
}

async function generateResponse(options) {
    const systemParts = [_systemPromptProvider()];
    if (options.memoryContext)
        systemParts.push(`\n\n${options.memoryContext}`);
    if (options.moodModifier)
        systemParts.push(`\n\n## Current Mood\n${options.moodModifier}`);
    if (options.tierModifier)
        systemParts.push(`\n\n## User Context\n${options.tierModifier}`);
    if (options.agentModifier)
        systemParts.push(`\n\n## Agent Context\n${options.agentModifier}`);
    if (options.featureInstruction)
        systemParts.push(`\n\n## Task\n${options.featureInstruction}`);
    const systemPrompt = systemParts.join('');

    // Build user content
    let userContent = (options.userMessage || '').replace(/@\w+/g, '').trim();
    if (options.context) {
        userContent = `## Data\n${options.context}\n\n## User Message\n${userContent || '(no message, just a mention)'}`;
    }
    if (!userContent) {
        userContent = '(Someone mentioned you with no specific message. React to being summoned for nothing.)';
    }

    log.debug({ systemLength: systemPrompt.length, userLength: userContent.length }, 'Generating response');

    try {
        const ai = getGenAI();
        const model = ai.getGenerativeModel({
            model: getModel(),
            generationConfig: {
                maxOutputTokens: options.maxTokens || 300,
                temperature: 0.9,
            },
            systemInstruction: systemPrompt,
        });

        const result = await model.generateContent(userContent);
        let text = result.response.text().trim();

        // Strip any quotes the model may wrap the response in
        if (text.startsWith('"') && text.endsWith('"')) {
            text = text.slice(1, -1).trim();
        }

        // Apply post-processor
        text = _responsePostProcessor(text);
        log.info({ responseLength: text.length }, 'Response generated');
        return text;
    } catch (err) {
        log.error({ err: err.message }, 'Gemini generateResponse failed');
        throw err;
    }
}

/**
 * Single-purpose LLM call to rate memory importance (Park et al. 2023).
 */
async function generateImportanceScore(description) {
    try {
        const ai = getGenAI();
        const model = ai.getGenerativeModel({
            model: getModel(),
            generationConfig: {
                maxOutputTokens: 10,
                temperature: 0,
            },
            systemInstruction: 'You rate the importance of events for an AI agent called Clude. ' +
                'Clude is a Solana meme token trading bot. ' +
                'Respond with ONLY a single integer from 1 to 10. ' +
                '1 = purely mundane (a greeting, a generic question). ' +
                '5 = moderately important (a returning user, a market opinion request). ' +
                '10 = extremely significant (a whale selling everything, a deeply personal interaction, an existential realization).',
        });

        const result = await model.generateContent(
            `Rate the importance of this event for Clude:\n"${description.slice(0, 500)}"\nRating (1-10):`
        );
        return result.response.text().trim();
    } catch (err) {
        log.error({ err: err.message }, 'Gemini generateImportanceScore failed');
        return '5'; // Safe fallback
    }
}

async function generateThread(options) {
    const response = await generateResponse({
        ...options,
        maxTokens: 1200,
        featureInstruction: (options.featureInstruction || '') +
            '\n\nFormat: Write 3-5 tweets separated by ---. Each tweet must be under 270 characters.',
    });
    return response
        .split('---')
        .map(t => t.trim())
        .filter(t => t.length > 0)
        .map(t => t.slice(0, 280));
}

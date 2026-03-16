"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cortex = void 0;
require("./sdk-mode"); // Must be FIRST — sets global flag before config.ts evaluates
const supabase_js_1 = require("@supabase/supabase-js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

class Cortex {
    config;
    db;
    initialized = false;
    dreamActive = false;
    constructor(config) {
        this.config = config;
        if (!config.supabase?.url || !config.supabase?.serviceKey) {
            throw new Error('Cortex requires supabase.url and supabase.serviceKey');
        }
        this.db = (0, supabase_js_1.createClient)(config.supabase.url, config.supabase.serviceKey);
        // Inject database client
        const { _setDb } = require('../core/database');
        _setDb(this.db);
        // Inject Gemini client (patched from Anthropic)
        if (config.anthropic?.apiKey) {
            const genAI = new GoogleGenerativeAI(config.anthropic.apiKey);
            const { _setAnthropicClient } = require('../core/claude-client');
            _setAnthropicClient(genAI, config.anthropic.model || 'gemini-2.5-flash');
        }
        // Inject embedding config if provided
        if (config.embedding) {
            const { _configureEmbeddings } = require('../core/embeddings');
            _configureEmbeddings({
                provider: config.embedding.provider,
                apiKey: config.embedding.apiKey,
                model: config.embedding.model,
                dimensions: config.embedding.dimensions,
            });
        }
        // Inject Solana config if provided
        if (config.solana) {
            const { _configureSolana } = require('../core/solana-client');
            _configureSolana(config.solana.rpcUrl || 'https://api.mainnet-beta.solana.com', config.solana.botWalletPrivateKey);
        }
        // Wire event bus for importance-driven dream triggers
        const { eventBus } = require('../events/event-bus');
        const { accumulateImportance } = require('../features/dream-cycle');
        eventBus.on('memory:stored', (payload) => {
            if (payload.memoryType === 'episodic') {
                accumulateImportance(payload.importance);
            }
        });
    }
    /** Initialize database schema. Call before store/recall. */
    async init() {
        const { initDatabase } = require('../core/database');
        await initDatabase();
        this.initialized = true;
    }
    /** Store a new memory. Returns memory ID or null. */
    async store(opts) {
        this.guard();
        const { storeMemory } = require('../core/memory');
        return storeMemory(opts);
    }
    /** Recall memories with hybrid vector + keyword + graph scoring. */
    async recall(opts = {}) {
        this.guard();
        const { recallMemories } = require('../core/memory');
        return recallMemories(opts);
    }
    /** Recall lightweight summaries (progressive disclosure). */
    async recallSummaries(opts = {}) {
        this.guard();
        const { recallMemorySummaries } = require('../core/memory');
        return recallMemorySummaries(opts);
    }
    /** Hydrate full memory content for specific IDs. */
    async hydrate(ids) {
        this.guard();
        const { hydrateMemories } = require('../core/memory');
        return hydrateMemories(ids);
    }
    /** Apply type-specific memory decay. */
    async decay() {
        this.guard();
        const { decayMemories } = require('../core/memory');
        return decayMemories();
    }
    /** Get memory system statistics. */
    async stats() {
        this.guard();
        const { getMemoryStats } = require('../core/memory');
        return getMemoryStats();
    }
    /** Get recent memories from the last N hours. */
    async recent(hours, types, limit) {
        this.guard();
        const { getRecentMemories } = require('../core/memory');
        return getRecentMemories(hours, types, limit);
    }
    /** Get current self-model memories. */
    async selfModel() {
        this.guard();
        const { getSelfModel } = require('../core/memory');
        return getSelfModel();
    }
    /** Create a typed link between two memories. */
    async link(sourceId, targetId, type, strength) {
        this.guard();
        const { createMemoryLink } = require('../core/memory');
        return createMemoryLink(sourceId, targetId, type, strength);
    }
    /** Run one full dream cycle. Requires anthropic (now Gemini) config. */
    async dream(opts) {
        this.guard();
        if (!this.config.anthropic?.apiKey) {
            throw new Error('Cortex.dream() requires anthropic config (Gemini API key)');
        }
        const { setEmergenceHandler, runDreamCycleOnce } = require('../features/dream-cycle');
        if (opts?.onEmergence) {
            setEmergenceHandler(opts.onEmergence);
        }
        try {
            await runDreamCycleOnce();
        }
        finally {
            if (opts?.onEmergence) {
                setEmergenceHandler(null);
            }
        }
    }
    /** Start cron-based dream schedule. Requires anthropic (now Gemini) config. */
    startDreamSchedule() {
        this.guard();
        if (!this.config.anthropic?.apiKey) {
            throw new Error('Dream schedule requires anthropic config (Gemini API key)');
        }
        const { startDreamCycle } = require('../features/dream-cycle');
        startDreamCycle();
        this.dreamActive = true;
    }
    /** Stop the dream schedule. */
    stopDreamSchedule() {
        const { stopDreamCycle } = require('../features/dream-cycle');
        stopDreamCycle();
        this.dreamActive = false;
    }
    /** Score memory importance using LLM. */
    async scoreImportance(description) {
        const { scoreImportanceWithLLM } = require('../core/memory');
        return scoreImportanceWithLLM(description);
    }
    /** Format memories into context string for LLM prompts. */
    formatContext(memories) {
        const { formatMemoryContext } = require('../core/memory');
        return formatMemoryContext(memories);
    }
    /** Infer structured concepts from memory content. */
    inferConcepts(summary, source, tags) {
        const { inferConcepts } = require('../core/memory');
        return inferConcepts(summary, source, tags);
    }
    /** Listen for memory events. */
    on(event, handler) {
        const { eventBus } = require('../events/event-bus');
        eventBus.on(event, handler);
    }
    /** Clean up resources and stop schedules. */
    destroy() {
        this.stopDreamSchedule();
        const { eventBus } = require('../events/event-bus');
        eventBus.removeAllListeners();
    }
    guard() {
        if (!this.initialized) {
            throw new Error('Cortex not initialized. Call await cortex.init() first.');
        }
    }
}
exports.Cortex = Cortex;

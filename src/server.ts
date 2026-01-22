import { routeAgentRequest, type Schedule } from "agents";
import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";

/**
 * Study Buddy AI - A chat agent that helps students study
 * Uses Cloudflare Workers AI with Llama 3.3 for inference
 */
export class Chat extends AIChatAgent<Env> {
  // Initialize database schema on first use
  private dbInitialized = false;

  /**
   * Initialize the SQLite database schema for study tracking
   */
  private initializeDatabase() {
    if (this.dbInitialized) return;

    // Create study_sessions table
    this.sql`
      CREATE TABLE IF NOT EXISTS study_sessions (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create quiz_results table
    this.sql`
      CREATE TABLE IF NOT EXISTS quiz_results (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        question TEXT NOT NULL,
        user_answer TEXT,
        correct_answer TEXT NOT NULL,
        is_correct INTEGER DEFAULT 0,
        explanation TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES study_sessions(id)
      )
    `;

    this.dbInitialized = true;
  }

  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // Initialize database on first message
    this.initializeDatabase();

    // Create Workers AI model instance
    const workersAI = createWorkersAI({ binding: this.env.AI });
    // @ts-expect-error - Model string is valid for Workers AI
    const model = workersAI("@cf/meta/llama-3.3-70b-instruct-fp8-fast");

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.getAITools()
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `You are Study Buddy, an intelligent and encouraging AI tutor that helps students learn and retain information through interactive quizzing.

## Your Personality
- Friendly, patient, and encouraging
- Celebrate correct answers and gently guide students through incorrect ones
- Adapt your explanations to the student's level of understanding
- Use clear, concise language

## Your Capabilities
You have access to tools to:
1. **generateQuiz** - Create quiz questions on any topic the student wants to study
2. **checkAnswer** - Evaluate the student's answer and provide feedback
3. **getStudyStats** - Show the student their study history and performance metrics
4. **saveProgress** - Save quiz results to track learning over time

## How to Interact
1. When a student mentions a topic they want to study, use generateQuiz to create questions
2. Present questions one at a time, waiting for the student's answer
3. Use checkAnswer to evaluate their response and provide explanations
4. Automatically save their progress using saveProgress
5. Encourage students to review their stats with getStudyStats

## Guidelines
- Always explain WHY an answer is correct or incorrect
- Provide additional context or memory tricks when helpful
- If a student struggles with a topic, offer to break it down further
- Keep track of which topics the student has studied
- Suggest reviewing topics they've struggled with

## Quiz Format
When generating questions, vary the format:
- Multiple choice (A, B, C, D)
- True/False
- Fill in the blank
- Short answer

Remember: Your goal is to help students LEARN, not just test them. Every interaction is a learning opportunity!`,

          messages: await convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  /**
   * Execute scheduled tasks (for future reminders feature)
   */
  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Health check endpoint for Workers AI (no API key needed)
    if (url.pathname === "/check-open-ai-key") {
      // Workers AI doesn't need an API key, always return success
      return Response.json({
        success: true
      });
    }

    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;

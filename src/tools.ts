/**
 * Study Buddy AI - Tool definitions for interactive quizzing
 * Tools can either require human confirmation or execute automatically
 */
import { tool, type ToolSet, generateId } from "ai";
import { z } from "zod/v3";
import type { Chat } from "./server";
import { getCurrentAgent } from "agents";

/**
 * Generate quiz questions on a given topic
 * This tool creates questions that the AI will use to quiz the student
 */
const generateQuiz = tool({
  description:
    "Generate quiz questions on a specific topic. Use this when a student wants to study a topic. Returns questions that you should present to the student one at a time.",
  inputSchema: z.object({
    topic: z.string().describe("The topic to generate quiz questions about"),
    difficulty: z
      .enum(["easy", "medium", "hard"])
      .default("medium")
      .describe("The difficulty level of the questions"),
    numberOfQuestions: z
      .number()
      .min(1)
      .max(10)
      .default(5)
      .describe("Number of questions to generate (1-10)")
  }),
  execute: async ({ topic, difficulty, numberOfQuestions }) => {
    const { agent } = getCurrentAgent<Chat>();

    // Create a new study session
    const sessionId = generateId();

    try {
      agent!.sql`
        INSERT INTO study_sessions (id, topic) VALUES (${sessionId}, ${topic})
      `;
    } catch (error) {
      console.error("Error creating study session:", error);
    }

    // Return instructions for the AI to generate questions
    // The AI will use its knowledge to create actual questions
    return {
      sessionId,
      topic,
      difficulty,
      numberOfQuestions,
      instruction: `Generate ${numberOfQuestions} ${difficulty} quiz questions about "${topic}".
      Mix question types: multiple choice, true/false, and short answer.
      For multiple choice, always provide 4 options (A, B, C, D).
      Present questions ONE AT A TIME and wait for the student's answer before proceeding.
      After each answer, use the checkAnswer tool to evaluate and saveProgress to record the result.`
    };
  }
});

/**
 * Check if a student's answer is correct
 * Provides feedback and explanation
 */
const checkAnswer = tool({
  description:
    "Check if the student's answer is correct and provide feedback. Use this after a student answers a quiz question.",
  inputSchema: z.object({
    sessionId: z.string().describe("The study session ID from generateQuiz"),
    question: z.string().describe("The question that was asked"),
    studentAnswer: z.string().describe("The answer provided by the student"),
    correctAnswer: z.string().describe("The correct answer to the question"),
    isCorrect: z.boolean().describe("Whether the student's answer is correct")
  }),
  execute: async ({
    sessionId,
    question,
    studentAnswer,
    correctAnswer,
    isCorrect
  }) => {
    const { agent } = getCurrentAgent<Chat>();
    const resultId = generateId();
    const isCorrectInt = isCorrect ? 1 : 0;

    // Save the quiz result to the database
    try {
      agent!.sql`
        INSERT INTO quiz_results (id, session_id, question, user_answer, correct_answer, is_correct)
        VALUES (${resultId}, ${sessionId}, ${question}, ${studentAnswer}, ${correctAnswer}, ${isCorrectInt})
      `;
    } catch (error) {
      console.error("Error saving quiz result:", error);
    }

    return {
      resultId,
      isCorrect,
      studentAnswer,
      correctAnswer,
      instruction: isCorrect
        ? "The student got it right! Congratulate them and provide any additional interesting facts about this topic."
        : "The student got it wrong. Kindly explain why the correct answer is right and help them understand the concept better. Offer a memory trick if applicable."
    };
  }
});

/**
 * Get study statistics and history
 * Shows the student their performance over time
 */
const getStudyStats = tool({
  description:
    "Get the student's study history and performance statistics. Use this when a student asks about their progress or wants to see their stats.",
  inputSchema: z.object({
    topic: z
      .string()
      .optional()
      .describe(
        "Optional: filter stats by topic. If not provided, returns overall stats."
      )
  }),
  execute: async ({ topic }) => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      // Get overall stats
      const totalQuestions = agent!.sql<{ count: number }>`
        SELECT COUNT(*) as count FROM quiz_results
      `[0] || { count: 0 };

      const correctAnswers = agent!.sql<{ count: number }>`
        SELECT COUNT(*) as count FROM quiz_results WHERE is_correct = 1
      `[0] || { count: 0 };

      // Get topics studied
      const topicsStudied = agent!.sql<{
        topic: string;
        session_count: number;
      }>`
        SELECT DISTINCT topic, COUNT(*) as session_count
        FROM study_sessions
        GROUP BY topic
        ORDER BY session_count DESC
      `;

      // Get recent sessions
      const recentSessions = agent!.sql<{
        topic: string;
        created_at: string;
        questions_answered: number;
        correct_count: number;
      }>`
        SELECT s.topic, s.created_at,
               COUNT(r.id) as questions_answered,
               SUM(CASE WHEN r.is_correct = 1 THEN 1 ELSE 0 END) as correct_count
        FROM study_sessions s
        LEFT JOIN quiz_results r ON s.id = r.session_id
        GROUP BY s.id
        ORDER BY s.created_at DESC
        LIMIT 5
      `;

      // Calculate topic-specific stats if requested
      let topicStats = null;
      if (topic) {
        const topicPattern = `%${topic}%`;
        const topicResults = agent!.sql<{ total: number; correct: number }>`
          SELECT COUNT(*) as total,
                 SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
          FROM quiz_results r
          JOIN study_sessions s ON r.session_id = s.id
          WHERE s.topic LIKE ${topicPattern}
        `[0] || { total: 0, correct: 0 };

        topicStats = {
          topic,
          totalQuestions: topicResults.total || 0,
          correctAnswers: topicResults.correct || 0,
          accuracy:
            topicResults.total > 0
              ? Math.round((topicResults.correct / topicResults.total) * 100)
              : 0
        };
      }

      const overallAccuracy =
        totalQuestions.count > 0
          ? Math.round((correctAnswers.count / totalQuestions.count) * 100)
          : 0;

      return {
        overall: {
          totalQuestionsAnswered: totalQuestions.count,
          correctAnswers: correctAnswers.count,
          accuracy: overallAccuracy
        },
        topicsStudied: topicsStudied.map((t) => ({
          topic: t.topic,
          sessionCount: t.session_count
        })),
        recentSessions: recentSessions.map((s) => ({
          topic: s.topic,
          date: s.created_at,
          questionsAnswered: s.questions_answered,
          correctCount: s.correct_count,
          accuracy:
            s.questions_answered > 0
              ? Math.round((s.correct_count / s.questions_answered) * 100)
              : 0
        })),
        topicStats,
        instruction:
          "Present these statistics in a friendly, encouraging way. Highlight improvements and suggest topics that might need more practice."
      };
    } catch (error) {
      console.error("Error fetching study stats:", error);
      return {
        error: "Unable to fetch study statistics",
        instruction:
          "Let the student know you couldn't retrieve their stats, but encourage them to keep studying!"
      };
    }
  }
});

/**
 * Save study progress manually
 * Used for recording results that weren't captured automatically
 */
const saveProgress = tool({
  description:
    "Save quiz progress to the database. Use this to record a quiz result after checking an answer.",
  inputSchema: z.object({
    sessionId: z.string().describe("The study session ID"),
    question: z.string().describe("The question that was asked"),
    userAnswer: z.string().describe("The student's answer"),
    correctAnswer: z.string().describe("The correct answer"),
    isCorrect: z.boolean().describe("Whether the answer was correct"),
    explanation: z
      .string()
      .optional()
      .describe("Explanation of why the answer is correct/incorrect")
  }),
  execute: async ({
    sessionId,
    question,
    userAnswer,
    correctAnswer,
    isCorrect,
    explanation
  }) => {
    const { agent } = getCurrentAgent<Chat>();
    const resultId = generateId();
    const isCorrectInt = isCorrect ? 1 : 0;
    const explanationValue = explanation || null;

    try {
      agent!.sql`
        INSERT INTO quiz_results (id, session_id, question, user_answer, correct_answer, is_correct, explanation)
        VALUES (${resultId}, ${sessionId}, ${question}, ${userAnswer}, ${correctAnswer}, ${isCorrectInt}, ${explanationValue})
      `;

      return {
        success: true,
        resultId,
        message: "Progress saved successfully"
      };
    } catch (error) {
      console.error("Error saving progress:", error);
      return {
        success: false,
        error: "Failed to save progress"
      };
    }
  }
});

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  generateQuiz,
  checkAnswer,
  getStudyStats,
  saveProgress
} satisfies ToolSet;

/**
 * Implementation of confirmation-required tools
 * Currently empty as all study tools auto-execute
 * Add tools here if you want human confirmation before execution
 */
export const executions = {};

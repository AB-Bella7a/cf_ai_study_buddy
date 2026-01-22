# 📚 Study Buddy AI

An AI-powered study assistant built on Cloudflare's platform that quizzes users on any topic, tracks performance over time, and provides explanations for incorrect answers.

**Live Demo:** https://cloudflare-ai-agent.abdessamad-3da.workers.dev

## Cloudflare Components Used

| Requirement | Implementation |
|-------------|----------------|
| **LLM** | Llama 3.3 70B via Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) |
| **Workflow/Coordination** | Cloudflare Workers + Durable Objects (Agent class) |
| **User Input** | Real-time chat interface with streaming responses |
| **Memory/State** | Durable Objects SQLite for conversation history & quiz performance |

## Features

- 🎯 **Interactive Quizzing** - Generate quizzes on any topic with multiple question formats
- 📊 **Performance Tracking** - Tracks accuracy, topics studied, and progress over time
- 💡 **Smart Explanations** - Provides detailed explanations when answers are incorrect
- 💾 **Persistent Memory** - Remembers your study history across sessions
- ⚡ **Real-time Streaming** - Instant responses with streaming AI output

## Running Locally

### Prerequisites

- Node.js 18+
- Cloudflare account (free tier works)

### Setup

```bash
# Clone the repo
git clone https://github.com/AB-Bella7a/cf_ai_study_buddy.git
cd cf_ai_study_buddy

# Install dependencies
npm install

# Login to Cloudflare (first time only)
npx wrangler login

# Run dev server (requires remote mode for Workers AI)
npm run dev
```

### Deploy

```bash
npm run deploy
```

## Project Structure

```
src/
├── server.ts    # Agent logic with Workers AI integration
├── tools.ts     # Study tools (generateQuiz, checkAnswer, getStudyStats)
├── app.tsx      # React chat UI
├── utils.ts     # Helper functions
└── styles.css   # Styling
```

## Database Schema

The app uses Durable Objects' built-in SQLite for persistence:

```sql
-- Track study sessions by topic
CREATE TABLE study_sessions (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Store quiz results with explanations
CREATE TABLE quiz_results (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  question TEXT NOT NULL,
  user_answer TEXT,
  correct_answer TEXT NOT NULL,
  is_correct INTEGER DEFAULT 0,
  explanation TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## Tools

| Tool | Description |
|------|-------------|
| `generateQuiz` | Creates a quiz session on a specified topic |
| `checkAnswer` | Evaluates user answers and saves results |
| `getStudyStats` | Retrieves study history and accuracy metrics |
| `saveProgress` | Manually saves quiz results with explanations |

## Tech Stack

- **Runtime:** Cloudflare Workers
- **AI:** Workers AI (Llama 3.3 70B)
- **State:** Durable Objects with SQLite
- **Frontend:** React + Vite
- **SDK:** Cloudflare Agents SDK

## License

MIT

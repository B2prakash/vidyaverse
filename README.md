# 🪐 VidyaVerse

An animated, AI-powered learning website for **Class 1 to 12**: every section, every subject, with AI lessons, quizzes, flashcards and the **VidyaBot** doubt solver (type, speak or photo your question).

## Project files

| File | What it does |
|------|--------------|
| `index.html` | The whole website (design, animations, classes, subjects, VidyaBot) |
| `api/ai.js` | Vercel serverless function that talks to Google Gemini (or Anthropic) and streams answers |
| `vercel.json` | Gives the AI function up to 60 seconds to answer |
| `package.json` | Project info for Vercel |

## 1. Put it on GitHub

**Easiest (no commands):**
1. Go to github.com → **New repository** → name it `vidyaverse` → **Create repository**.
2. Click **uploading an existing file**.
3. Unzip `vidyaverse.zip` and drag **all files and the `api` folder** into the page.
4. Click **Commit changes**.

**With Git:**
```bash
cd vidyaverse
git init
git add .
git commit -m "First version of VidyaVerse"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/vidyaverse.git
git push -u origin main
```

## 2. Host it on Vercel

1. Get a **free** API key at **aistudio.google.com** → **Get API key**. No credit card needed.
2. Go to **vercel.com** → **Add New… → Project** → **Import** your `vidyaverse` repository.
3. Framework preset: **Other**. Leave build settings empty.
4. Open **Environment Variables** and add:
   - `GEMINI_API_KEY` = your free Google AI Studio key — **this is the main key**
5. Click **Deploy**. Your site will be live at `https://vidyaverse-xxxx.vercel.app`.

If you add the key after deploying, go to **Deployments → ⋯ → Redeploy** so it takes effect.

### Which key does it use?

You need **at least one** key. `GEMINI_API_KEY` is all VidyaVerse needs, and it is free.

| Key | Required? | Where to get it |
|-----|-----------|-----------------|
| `GEMINI_API_KEY` | **Main key** | **aistudio.google.com** → Get API key — free |
| `ANTHROPIC_API_KEY` | Optional | **console.anthropic.com** → API Keys — paid, billed to your account |

If **both** keys are set, Gemini is used. Anthropic is only used when `GEMINI_API_KEY` is absent. With neither key set, the AI replies `No AI key is set`.

## Optional settings (Environment Variables)

| Name | Default | Purpose |
|------|---------|---------|
| `RATE_LIMIT_PER_MIN` | `10` | Max AI requests per visitor per minute |
| `GEMINI_MODEL_QUICK` | `gemini-flash-lite-latest` | Fast Gemini model for chat and flashcards |
| `GEMINI_MODEL` | `gemini-flash-latest` | Gemini model for lessons, quizzes, photo questions |

These two only apply when you are using an Anthropic key instead of Gemini:

| Name | Default | Purpose |
|------|---------|---------|
| `MODEL_QUICK` | `claude-haiku-4-5-20251001` | Fast model for chat and flashcards |
| `MODEL_DEFAULT` | `claude-sonnet-5-5` | Model for lessons, quizzes, photo questions |

## Updating the site

Edit `index.html`, then commit and push (or upload the new file on GitHub). Vercel redeploys automatically and your commit history keeps every version.

> Never put your API key in `index.html` or commit it to GitHub. It belongs only in Vercel's Environment Variables.

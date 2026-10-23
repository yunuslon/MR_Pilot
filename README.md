# MR Pilot

AI-powered Merge Request description generator for GitLab. Reads MR diff and auto-generates structured descriptions with title, what/why/how/test sections.

## Install

1. Clone this repo
2. Open `chrome://extensions` (works on Chrome, Arc, Edge, Brave)
3. Enable **Developer mode**
4. Click **Load unpacked** → select the project folder

## Setup

Click the extension icon and fill in:

| Setting | Description |
|---|---|
| AI Base URL | OpenAI-compatible endpoint (e.g. `http://localhost:20128/v1`) |
| AI API Key | Your API key |
| AI Model | Model name (e.g. `gpt-4o`, `kr/claude-sonnet-4.6-thinking`) |
| GitLab PAT | Personal Access Token with `read_api` scope |
| Language | `English` or `Bahasa Indonesia` |

### GitLab Personal Access Token

1. GitLab → Settings → Access Tokens
2. Create token with scope **`read_api`**
3. Copy and paste into extension settings

## Usage

1. Open a GitLab Merge Request page (new or existing)
2. Click the **"Generate MR Description"** button
3. Title and description are filled automatically

## Output Format

```
Title: concise MR title

## What was changed
- bullet list of changes

## Why the change was made
- motivation and context

## How the change works
- technical explanation

## How to test
1. numbered verification steps
```

## License

MIT

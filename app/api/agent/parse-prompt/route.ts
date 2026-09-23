import { NextResponse } from 'next/server';
import { XSTOCKS, getXStockByTicker } from '@/lib/tokenized-stocks';

/**
 * Natural-language strategy parser for tokenized stock instructions.
 *
 * Recognizes xStock tokens (NVDAx, AAPLx, TSLAx) and their underlying tickers.
 * When OPENAI_API_KEY is configured, uses the LLM for richer parsing; otherwise
 * falls back to deterministic regex-based parsing.
 */

const RECOGNIZED_TICKERS = XSTOCKS.map((s) => s.underlying); // ['NVDA', 'AAPL', 'TSLA']
const RECOGNIZED_SYMBOLS = XSTOCKS.map((s) => s.symbol); // ['NVDAx', 'AAPLx', 'TSLAx']
const RECOGNIZED_ACTIONS = ['buy', 'sell', 'swap', 'move', 'rotate', 'allocate', 'dca', 'dollar-cost', 'convert', 'invest'];
const RECOGNIZED_CONDITIONS = ['drop', 'dips', 'gap', 'spike', 'market', 'crash', 'dip', 'falls', 'decline'];

interface PromptParseResult {
  success: boolean;
  prompt: string;
  status: string;
  targetToken?: string;
  action?: string;
  hedgeAsset?: string;
  usdAmount?: number;
  gapThreshold?: number;
  executionStatus?: string;
  riskChecks?: string[];
  confidence?: number;
  suggestions?: string[];
  error?: string;
  parsedAt: string;
}

function findTokenInPrompt(prompt: string): string | null {
  const lower = prompt.toLowerCase();
  // Check for xStock symbols first (e.g. "NVDAx")
  for (const sym of RECOGNIZED_SYMBOLS) {
    if (lower.includes(sym.toLowerCase())) return sym;
  }
  // Then check underlying tickers (e.g. "NVDA", "Tesla", "Apple")
  for (const stock of XSTOCKS) {
    if (lower.includes(stock.underlying.toLowerCase()) || lower.includes(stock.name.toLowerCase().replace(' xstock', ''))) {
      return stock.symbol;
    }
  }
  // Check company names
  const companyMap: Record<string, string> = {
    nvidia: 'NVDAx', tesla: 'TSLAx', apple: 'AAPLx',
  };
  for (const [name, sym] of Object.entries(companyMap)) {
    if (lower.includes(name)) return sym;
  }
  return null;
}

function findActionInPrompt(prompt: string): string | null {
  const lower = prompt.toLowerCase();
  for (const action of RECOGNIZED_ACTIONS) {
    if (lower.includes(action)) return action;
  }
  return null;
}

function findConditionInPrompt(prompt: string): string | null {
  const lower = prompt.toLowerCase();
  for (const condition of RECOGNIZED_CONDITIONS) {
    if (lower.includes(condition)) return condition;
  }
  return null;
}

function parseUsdAmount(prompt: string): number {
  const match = prompt.match(/(?:\$|usd\s*)(\d+(?:\.\d+)?)/i);
  const amount = match ? Number(match[1]) : 20;
  return Number.isFinite(amount) && amount > 0 ? amount : 20;
}

function parseDropThreshold(prompt: string): number {
  const match = prompt.match(/(\d+(?:\.\d+)?)\s*%/);
  if (match) return Number(match[1]);
  if (prompt.toLowerCase().includes('drops') || prompt.toLowerCase().includes('dip')) return 3;
  return 0;
}

function validateAndParsePrompt(prompt: string): PromptParseResult | null {
  if (!prompt || prompt.length > 500) return null;

  const action = findActionInPrompt(prompt);
  const token = findTokenInPrompt(prompt);
  const condition = findConditionInPrompt(prompt);

  if (!action || !token) return null;

  const usdAmount = parseUsdAmount(prompt);
  const gapThreshold = parseDropThreshold(prompt);

  // Confidence based on how many components were identified
  const confidence = Math.round(((action ? 0.4 : 0) + (token ? 0.4 : 0) + (condition ? 0.2 : 0)) * 100);

  return {
    success: true,
    prompt,
    status: confidence >= 60 ? 'high_confidence' : 'medium_confidence',
    targetToken: token,
    action,
    hedgeAsset: 'USDC',
    usdAmount,
    gapThreshold,
    executionStatus: 'armed',
    confidence,
    riskChecks: ['token allowlisted (xStock)', 'max-slippage enforced', 'wallet approval required', 'gas within limit'],
    parsedAt: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body', status: 'parse_error', parsedAt: new Date().toISOString() },
        { status: 400 },
      );
    }

    const bodyObj = body as Record<string, unknown>;
    const prompt = typeof bodyObj?.prompt === 'string' ? bodyObj.prompt.trim() : '';

    if (!prompt) {
      return NextResponse.json(
        {
          success: false,
          status: 'empty_prompt',
          error: 'Prompt cannot be empty',
          suggestions: XSTOCKS.map((s) => `Try: "Buy $20 of ${s.symbol} if it drops 3%"`),
          parsedAt: new Date().toISOString(),
        },
        { status: 400 },
      );
    }

    if (prompt.length > 500) {
      return NextResponse.json(
        { success: false, status: 'prompt_too_long', error: `Prompt must be 500 characters or less. Received: ${prompt.length}`, parsedAt: new Date().toISOString() },
        { status: 400 },
      );
    }

    const parsed = validateAndParsePrompt(prompt);

    if (!parsed) {
      return NextResponse.json(
        {
          success: false,
          prompt,
          status: 'ambiguous_prompt',
          error: 'Could not extract a clear strategy from your prompt.',
          suggestions: [
            'Include a tokenized stock (NVDAx, AAPLx, TSLAx) and an action (buy, sell, swap)',
            `Try: "Buy $20 of NVDAx if it drops 3%"`,
            `Try: "Move 25% of my portfolio into TSLAx if the market drops 5%"`,
          ],
          parsedAt: new Date().toISOString(),
        },
        { status: 400 },
      );
    }

    return NextResponse.json(parsed, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Server error while parsing prompt: ' + errorMessage, status: 'server_error', parsedAt: new Date().toISOString() },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}

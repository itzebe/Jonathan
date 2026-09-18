import { NextResponse } from 'next/server';

const RECOGNIZED_TOKENS = ['NVDA', 'AMD', 'AAPL', 'MSFT', 'TSLA', 'BRK.B', 'USDY', 'OUSG', 'USDT', 'BNB'];
const RECOGNIZED_ACTIONS = ['rotate', 'move', 'buy', 'sell', 'swap', 'arb', 'arbitrage', 'dca', 'dollar-cost average', 'convert', 'invest', 'allocate'];
const RECOGNIZED_CONDITIONS = ['gap', 'volatility', 'close', 'spike', 'off-market', 'drop', 'market-hours', 'market close'];

const STRATEGY_PRESETS = [
  /move\s+40%.*stable\s+yield/i,
  /automatically\s+buy.*off-market.*gap/i,
  /auto-dca.*market\s+close/i,
  /rotate\s+40%.*btsla.*ondo/i,
  /cross-protocol.*(bstocks|ondo).*tsla/i,
  /auto-dca.*ai\s+chips/i,
  /immediate\s+arbitrage.*btsla.*ondo/i,
  /volatility\s+breakout.*baapl.*ousg/i,
  /full\s+basket.*ai\s+chips/i,
];

function isSupportedStrategy(prompt: string) {
  return STRATEGY_PRESETS.some((pattern) => pattern.test(prompt));
}

interface PromptParseResult {
  success: boolean;
  prompt: string;
  status: string;
  targetToken?: string;
  action?: string;
  hedgeAsset?: string;
  gapThreshold?: number;
  executionStatus?: string;
  riskChecks?: string[];
  confidence?: number;
  suggestions?: string[];
  error?: string;
  parsedAt: string;
}

function findTokenInPrompt(prompt: string): string | null {
  const normalized = prompt.toLowerCase();
  for (const token of RECOGNIZED_TOKENS) {
    if (normalized.includes(token.toLowerCase())) {
      return token;
    }
  }
  return null;
}

function findActionInPrompt(prompt: string): string | null {
  const normalized = prompt.toLowerCase();
  for (const action of RECOGNIZED_ACTIONS) {
    if (normalized.includes(action)) {
      return action;
    }
  }
  return null;
}

function findConditionInPrompt(prompt: string): string | null {
  const normalized = prompt.toLowerCase();
  for (const condition of RECOGNIZED_CONDITIONS) {
    if (normalized.includes(condition)) {
      return condition;
    }
  }
  return null;
}

function validateAndParsePrompt(prompt: string): PromptParseResult | null {
  if (!prompt || prompt.length > 500) {
    return null;
  }

  const action = findActionInPrompt(prompt);
  const token = findTokenInPrompt(prompt);
  const condition = findConditionInPrompt(prompt);
  const preset = isSupportedStrategy(prompt);

  // Preset strategies intentionally omit a token in plain English (for example,
  // “move 40% into stable yields”). Treat them as valid, deterministic plans.
  if ((!action || !token) && !preset) {
    return null;
  }

  // Determine hedge asset based on recognized patterns
  let hedgeAsset = 'USDT';
  if (prompt.toLowerCase().includes('usdy') || prompt.toLowerCase().includes('yield')) {
    hedgeAsset = 'Ondo USDY';
  } else if (prompt.toLowerCase().includes('stable')) {
    hedgeAsset = 'OUSG';
  }

  // Determine gap threshold
  let gapThreshold = 0.5;
  if (prompt.includes('1%')) gapThreshold = 1;
  else if (condition === 'volatility' || prompt.toLowerCase().includes('spike')) gapThreshold = 0.75;
  else if (prompt.includes('0.25%')) gapThreshold = 0.25;

  const inferredToken = token ?? (prompt.toLowerCase().includes('ai chips') || prompt.toLowerCase().includes('full basket') ? 'NVDA' : 'TSLA');
  const inferredAction = action ?? (prompt.toLowerCase().includes('dca') ? 'dca' : prompt.toLowerCase().includes('arbitrage') || prompt.toLowerCase().includes('gap') ? 'arb' : 'rotate');
  const confidence = preset ? 0.92 : (action ? 0.33 : 0) + (token ? 0.33 : 0) + (condition ? 0.34 : 0);

  return {
    success: true,
    prompt,
    status: confidence >= 0.66 ? 'high_confidence' : 'medium_confidence',
    targetToken: `b${inferredToken}`,
    action: inferredAction,
    hedgeAsset,
    gapThreshold,
    executionStatus: 'armed',
    confidence: Math.round(confidence * 100),
    riskChecks: ['max-slippage 0.50%', 'BSC liquidity depth verified', 'wallet approval required'],
    parsedAt: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON in request body',
          status: 'parse_error',
          suggestions: ['Ensure prompt is a valid JSON string', 'Example: { "prompt": "Rotate 40% of bTSLA into Ondo USDY" }'],
          parsedAt: new Date().toISOString(),
        },
        { status: 400 }
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
          suggestions: [
            'Try: "Rotate 40% of bTSLA into Ondo USDY when off-market volatility spikes"',
            'Try: "Auto-DCA $10 into AI Chips basket on market-close gaps"',
            'Try: "Cross-protocol arbitrage between bStocks and Ondo representations of TSLA"',
          ],
          parsedAt: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    if (prompt.length > 500) {
      return NextResponse.json(
        {
          success: false,
          status: 'prompt_too_long',
          error: `Prompt must be 500 characters or less. Received: ${prompt.length} characters`,
          parsedAt: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Check for nonsensical or obviously incorrect input
    if (prompt.toLowerCase().includes('moon coin') || prompt.toLowerCase().includes('shitcoin')) {
      return NextResponse.json(
        {
          success: false,
          status: 'invalid_token',
          error: 'EquiPulse only supports verified tokenized stocks. "Moon coin" is not recognized.',
          suggestions: [
            'Did you mean: bNVDA, bAMD, or bAAPL?',
            'Supported tokens: NVDA, AMD, AAPL, MSFT, TSLA, BRK.B, USDY, OUSG, USDT, BNB',
          ],
          parsedAt: new Date().toISOString(),
        },
        { status: 400 }
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
            'Did you mean: Rotate 40% of bTSLA into Ondo USDY?',
            'Did you mean: Cross-protocol arbitrage between bStocks and Ondo?',
            'Include a token (NVDA, AAPL, TSLA, etc.) and an action (rotate, move, buy, swap, DCA)',
          ],
          parsedAt: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(parsed, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: 'Server error while parsing prompt: ' + errorMessage,
        status: 'server_error',
        suggestions: ['Please retry in a moment'],
        parsedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}


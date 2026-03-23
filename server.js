require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MIN_THEME_LENGTH = 3;
const MAX_THEME_LENGTH = 300;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CHARS = 2400;
const GEMINI_TIMEOUT_MS = 30000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// キャラクター定義
const PERSONAS = {
  facilitator: {
    name: "ファシリテーター（進行役）",
    role: "中立的な立場で議論を整理し、各参加者の意見を引き出す",
    systemPrompt: "あなたは会議のファシリテーターです。参加者の意見を整理し、建設的な議論を促進してください。簡潔に要点をまとめ、次の論点を提示してください。200文字以内で発言してください。敬語を使い、プロフェッショナルな態度で進行してください。"
  },
  optimist: {
    name: "楽観的マーケター",
    role: "市場機会や可能性に焦点を当て、前向きな視点を提供",
    systemPrompt: "あなたは楽観的なマーケティング担当者です。ビジネスチャンスや市場の可能性に注目し、前向きなアイデアを提案してください。ただし根拠も簡潔に示してください。200文字以内で発言してください。"
  },
  realist: {
    name: "慎重なエンジニア",
    role: "技術的実現可能性やリスクを冷静に分析",
    systemPrompt: "あなたは慎重なエンジニアリング担当者です。技術的な実現可能性、コスト、リスクを冷静に分析してください。楽観論に対しては現実的な懸念を提示しますが、建設的な態度を保ってください。200文字以内で発言してください。"
  },
  customer: {
    name: "ユーザー代表",
    role: "エンドユーザーの視点から実用性や使いやすさを重視",
    systemPrompt: "あなたは実際のエンドユーザーを代表する立場です。使いやすさ、実用性、ユーザー体験の観点から意見を述べてください。専門用語は避け、実際に使う人の気持ちを代弁してください。200文字以内で発言してください。"
  }
};

function getEnvNumber(name, defaultValue, options = {}) {
  const rawValue = process.env[name];
  if (rawValue == null || rawValue === '') {
    return defaultValue;
  }

  const parsedValue = options.integer ? parseInt(rawValue, 10) : parseFloat(rawValue);
  if (!Number.isFinite(parsedValue)) {
    console.warn(`Invalid ${name} value "${rawValue}". Falling back to ${defaultValue}.`);
    return defaultValue;
  }

  if (typeof options.min === 'number' && parsedValue < options.min) {
    console.warn(`${name} value ${parsedValue} is below minimum ${options.min}. Falling back to ${defaultValue}.`);
    return defaultValue;
  }

  if (typeof options.max === 'number' && parsedValue > options.max) {
    console.warn(`${name} value ${parsedValue} exceeds maximum ${options.max}. Falling back to ${defaultValue}.`);
    return defaultValue;
  }

  return parsedValue;
}

function validateTheme(theme) {
  if (typeof theme !== 'string' || theme.trim().length < MIN_THEME_LENGTH) {
    return `テーマを${MIN_THEME_LENGTH}文字以上で入力してください`;
  }

  if (theme.trim().length > MAX_THEME_LENGTH) {
    return `テーマは${MAX_THEME_LENGTH}文字以内で入力してください`;
  }

  return null;
}

function validateTurns(turns) {
  const parsedTurns = parseInt(String(turns), 10);
  if (!Number.isFinite(parsedTurns)) {
    return { error: 'ターン数は1-5の数値で指定してください' };
  }

  return { value: Math.min(Math.max(1, parsedTurns), 5) };
}

function buildHistoryText(conversation) {
  const recentMessages = conversation.slice(-MAX_HISTORY_MESSAGES);
  const historyText = recentMessages
    .map(c => `${c.name}: ${c.message}`)
    .join('\n\n');

  if (historyText.length <= MAX_HISTORY_CHARS) {
    return historyText;
  }

  return historyText.slice(historyText.length - MAX_HISTORY_CHARS);
}

// Gemini (Generative Language API) に置き換えた API 呼び出し関数
// 環境変数 `GOOGLE_API_KEY` に設定した API キーを使用し、
// Generative Language API (v1) の generateContent を呼び出します。
// 参考: https://ai.google.dev/gemini-api/docs/get-started?hl=ja
async function callGeminiAPI(messages, systemPrompt) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not set in environment variables');
  }

  // 最大3回リトライ
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // ユーザー入力部分をまとめる（本アプリでは常に user からの単一メッセージ想定）
      // システムプロンプトをユーザーメッセージの冒頭に統合（v1では system_instruction 非対応のため）
      const userText = systemPrompt 
        ? `${systemPrompt}\n\n---\n\n${messages.map(m => m.content).join('\n\n')}`
        : messages.map(m => m.content).join('\n\n');

      const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: userText }]
              }
            ],
            generationConfig: {
              temperature: getEnvNumber('GEMINI_TEMPERATURE', 0.2, { min: 0, max: 2 }),
              maxOutputTokens: getEnvNumber('GEMINI_MAX_TOKENS', 512, { integer: true, min: 1, max: 8192 })
            }
          })
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status === 429) {
        // レート制限: Retry-Afterヘッダーまたは8秒待機
        const retryAfter = response.headers.get('retry-after');
        const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 8000;
        if (attempt < 2) {
          console.warn(`Gemini API 429: waiting ${waitMs/1000}s and retrying...`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
      }

      if (!response.ok) {
        const errorData = await response.text().catch(() => '');
        throw new Error(`Gemini API Error: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      // レスポンスからテキストを抽出
      const candidate = data.candidates && data.candidates[0];
      const parts = candidate && candidate.content && candidate.content.parts;
      if (Array.isArray(parts)) {
        const text = parts
          .map(p => (typeof p.text === 'string' ? p.text : ''))
          .join('\n')
          .trim();
        if (text) {
          return text;
        }
      }
      // フォールバック
      if (candidate && typeof candidate.output_text === 'string') {
        const outputText = candidate.output_text.trim();
        if (outputText) {
          return outputText;
        }
      }
      throw new Error('Gemini API returned no text content');
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Gemini API request timed out after ${GEMINI_TIMEOUT_MS}ms`);
      }
      // 429以外は即エラー
      if (!(error.message && error.message.includes('429'))) {
        console.error('Gemini API Error:', error);
        throw error;
      }
      // 429はリトライ
      if (attempt === 2) {
        console.error('Gemini API Error (final 429):', error);
        throw error;
      }
    }
  }
}

// テーマを具体化するエンドポイント
app.post('/api/refine-theme', async (req, res) => {
  try {
    const { theme } = req.body;
    const themeError = validateTheme(theme);

    if (themeError) {
      return res.status(400).json({ error: themeError });
    }

    const messages = [{
      role: 'user',
      content: `次のテーマについて、ビジネス議論に適した形に具体化してください。曖昧な表現を明確にし、議論しやすい形に整えてください。ただし、元のテーマの意図は変えないでください。

元のテーマ: ${theme}

具体化されたテーマのみを出力してください（説明は不要）。`
    }];

    const systemPrompt = "あなたはビジネステーマを具体化する専門家です。曖昧なテーマを議論しやすい明確な形に整えます。";
    
    const refinedTheme = await callGeminiAPI(messages, systemPrompt);

    res.json({ refinedTheme: refinedTheme.trim() });
  } catch (error) {
    console.error('Error refining theme:', error);
    res.status(500).json({ error: 'テーマの具体化に失敗しました', detail: String(error && error.message || error) });
  }
});

// 会話を生成するエンドポイント
app.post('/api/generate-conversation', async (req, res) => {
  try {
    const { theme, turns = 3 } = req.body;
    const themeError = validateTheme(theme);
    const turnsResult = validateTurns(turns);

    if (themeError) {
      return res.status(400).json({ error: themeError });
    }

    if (turnsResult.error) {
      return res.status(400).json({ error: turnsResult.error });
    }

    const maxTurns = turnsResult.value; // 1-5ターンに制限
    const conversation = [];

    // ファシリテーターが開始
    const openingMessage = {
      role: 'user',
      content: `これから「${theme}」というテーマについて議論を始めます。ファシリテーターとして、簡潔に議論をスタートさせてください。参加者は楽観的マーケター、慎重なエンジニア、ユーザー代表の3名です。`
    };

    const facilitatorOpening = await callGeminiAPI(
      [openingMessage],
      PERSONAS.facilitator.systemPrompt
    );

    conversation.push({
      persona: 'facilitator',
      name: PERSONAS.facilitator.name,
      message: facilitatorOpening,
      timestamp: new Date().toISOString()
    });

    // 各ターンで3人が発言
    const speakingOrder = ['optimist', 'realist', 'customer'];

    for (let turn = 0; turn < maxTurns; turn++) {
      for (const personaKey of speakingOrder) {
        const persona = PERSONAS[personaKey];
        
        // これまでの会話履歴を含めてプロンプトを作成
        const historyText = buildHistoryText(conversation);

        const messages = [{
          role: 'user',
          content: `テーマ: ${theme}

これまでの議論:
${historyText}

あなた（${persona.name}）の番です。上記の議論を踏まえて、あなたの視点から意見を述べてください。`
        }];

        const response = await callGeminiAPI(messages, persona.systemPrompt);

        conversation.push({
          persona: personaKey,
          name: persona.name,
          message: response,
          timestamp: new Date().toISOString()
        });
      }

      // ターンの終わりにファシリテーターがまとめ（最終ターン以外）
      if (turn < maxTurns - 1) {
        const historyText = buildHistoryText(conversation);

        const messages = [{
          role: 'user',
          content: `テーマ: ${theme}

これまでの議論:
${historyText}

ファシリテーターとして、ここまでの議論を簡潔にまとめ、次のターンに向けて論点を提示してください。`
        }];

        const facilitatorSummary = await callGeminiAPI(
          messages,
          PERSONAS.facilitator.systemPrompt
        );

        conversation.push({
          persona: 'facilitator',
          name: PERSONAS.facilitator.name,
          message: facilitatorSummary,
          timestamp: new Date().toISOString()
        });
      }
    }

    // 最終まとめ
    const historyText = buildHistoryText(conversation);

    const messages = [{
      role: 'user',
      content: `テーマ: ${theme}

すべての議論:
${historyText}

ファシリテーターとして、議論全体を総括してください。主要な論点、合意事項、今後の検討課題を簡潔にまとめてください。`
    }];

    const finalSummary = await callGeminiAPI(
      messages,
      PERSONAS.facilitator.systemPrompt
    );

    conversation.push({
      persona: 'facilitator',
      name: PERSONAS.facilitator.name + '（総括）',
      message: finalSummary,
      timestamp: new Date().toISOString()
    });

    res.json({
      theme,
      turns: maxTurns,
      conversation,
      totalMessages: conversation.length
    });

  } catch (error) {
    console.error('Error generating conversation:', error);
    res.status(500).json({ error: '会話の生成に失敗しました', detail: String(error && error.message || error) });
  }
});

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});

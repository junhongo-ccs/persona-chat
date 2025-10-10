require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ペルソナ定義
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

// Claude APIを呼び出す関数（Anthropic形式）
async function callClaudeAPI(messages, systemPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API Error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Claude API Error:', error);
    throw error;
  }
}

// テーマを具体化するエンドポイント
app.post('/api/refine-theme', async (req, res) => {
  try {
    const { theme } = req.body;

    if (!theme || theme.trim().length < 3) {
      return res.status(400).json({ error: 'テーマを入力してください' });
    }

    const messages = [{
      role: 'user',
      content: `次のテーマについて、ビジネス議論に適した形に具体化してください。曖昧な表現を明確にし、議論しやすい形に整えてください。ただし、元のテーマの意図は変えないでください。

元のテーマ: ${theme}

具体化されたテーマのみを出力してください（説明は不要）。`
    }];

    const systemPrompt = "あなたはビジネステーマを具体化する専門家です。曖昧なテーマを議論しやすい明確な形に整えます。";
    
    const refinedTheme = await callClaudeAPI(messages, systemPrompt);

    res.json({ refinedTheme: refinedTheme.trim() });
  } catch (error) {
    console.error('Error refining theme:', error);
    res.status(500).json({ error: 'テーマの具体化に失敗しました' });
  }
});

// 会話を生成するエンドポイント
app.post('/api/generate-conversation', async (req, res) => {
  try {
    const { theme, turns = 3 } = req.body;

    if (!theme || theme.trim().length < 3) {
      return res.status(400).json({ error: 'テーマを入力してください' });
    }

    const maxTurns = Math.min(Math.max(1, parseInt(turns)), 5); // 1-5ターンに制限
    const conversation = [];
    const conversationHistory = [];

    // ファシリテーターが開始
    const openingMessage = {
      role: 'user',
      content: `これから「${theme}」というテーマについて議論を始めます。ファシリテーターとして、簡潔に議論をスタートさせてください。参加者は楽観的マーケター、慎重なエンジニア、ユーザー代表の3名です。`
    };

    const facilitatorOpening = await callClaudeAPI(
      [openingMessage],
      PERSONAS.facilitator.systemPrompt
    );

    conversation.push({
      persona: 'facilitator',
      name: PERSONAS.facilitator.name,
      message: facilitatorOpening,
      timestamp: new Date().toISOString()
    });

    conversationHistory.push({
      role: 'user',
      content: `テーマ: ${theme}\n\nファシリテーター: ${facilitatorOpening}`
    });

    // 各ターンで3人が発言
    const speakingOrder = ['optimist', 'realist', 'customer'];

    for (let turn = 0; turn < maxTurns; turn++) {
      for (const personaKey of speakingOrder) {
        const persona = PERSONAS[personaKey];
        
        // これまでの会話履歴を含めてプロンプトを作成
        const historyText = conversation
          .map(c => `${c.name}: ${c.message}`)
          .join('\n\n');

        const messages = [{
          role: 'user',
          content: `テーマ: ${theme}

これまでの議論:
${historyText}

あなた（${persona.name}）の番です。上記の議論を踏まえて、あなたの視点から意見を述べてください。`
        }];

        const response = await callClaudeAPI(messages, persona.systemPrompt);

        conversation.push({
          persona: personaKey,
          name: persona.name,
          message: response,
          timestamp: new Date().toISOString()
        });
      }

      // ターンの終わりにファシリテーターがまとめ（最終ターン以外）
      if (turn < maxTurns - 1) {
        const historyText = conversation
          .map(c => `${c.name}: ${c.message}`)
          .join('\n\n');

        const messages = [{
          role: 'user',
          content: `テーマ: ${theme}

これまでの議論:
${historyText}

ファシリテーターとして、ここまでの議論を簡潔にまとめ、次のターンに向けて論点を提示してください。`
        }];

        const facilitatorSummary = await callClaudeAPI(
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
    const historyText = conversation
      .map(c => `${c.name}: ${c.message}`)
      .join('\n\n');

    const messages = [{
      role: 'user',
      content: `テーマ: ${theme}

すべての議論:
${historyText}

ファシリテーターとして、議論全体を総括してください。主要な論点、合意事項、今後の検討課題を簡潔にまとめてください。`
    }];

    const finalSummary = await callClaudeAPI(
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
    res.status(500).json({ error: '会話の生成に失敗しました' });
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

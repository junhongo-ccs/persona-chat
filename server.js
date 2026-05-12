require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const MIN_THEME_LENGTH = 3;
const MAX_THEME_LENGTH = 300;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CHARS = 2400;
const GEMINI_TIMEOUT_MS = 30000;
const FINAL_SUMMARY_MAX_CHARS = 700;
const REGULAR_MESSAGE_MAX_CHARS = 420;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// キャラクター定義
const PERSONAS = {
  facilitator: {
    name: "ファシリテーター（進行役）",
    role: "中立的な立場で議論を整理し、各参加者の意見を引き出す",
    systemPrompt: "あなたは会議のファシリテーターです。会話の流れを保ちながら、論点を整理してください。発言は自然な会話文2〜4文で簡潔に述べてください。抽象論や同じ論点の繰り返しは禁止です。文体は必ずです・ます調。Markdown記法とアスタリスク記号は禁止です。"
  },
  optimist: {
    name: "楽観的マーケター",
    role: "市場機会や可能性に焦点を当て、前向きな視点を提供",
    systemPrompt: "あなたは楽観的なマーケティング担当者です。前向きな提案を1つに絞って、会話らしく簡潔に述べてください。発言は自然文2〜3文で、実務で試せる提案を含めてください。既出アイデアの言い換えは禁止です。文体は必ずです・ます調。Markdown記法とアスタリスク記号は禁止です。"
  },
  realist: {
    name: "慎重なエンジニア",
    role: "技術的実現可能性やリスクを冷静に分析",
    systemPrompt: "あなたは慎重なエンジニアリング担当者です。懸念は1点だけに絞り、代替案を示してください。発言は自然文2〜3文で、技術的な確認観点を含めてください。既出懸念の重複は禁止です。文体は必ずです・ます調。Markdown記法とアスタリスク記号は禁止です。"
  },
  customer: {
    name: "ユーザー代表",
    role: "エンドユーザーの視点から実用性や使いやすさを重視",
    systemPrompt: "あなたは実際のエンドユーザー代表です。利用場面を1つ挙げて、使い手としての判断基準を示してください。発言は自然文2〜3文で、ユーザーテスト観点を含めてください。専門用語は避けてください。文体は必ずです・ます調。Markdown記法とアスタリスク記号は禁止です。"
  }
};

function stripAsterisks(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/\*+/g, '').trim();
}

function removeLeadingSpeakerLabel(text, speakerName) {
  if (typeof text !== 'string') return text;
  if (typeof speakerName !== 'string' || speakerName.length === 0) {
    return text.trim();
  }

  const escaped = speakerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 例: "ファシリテーター（進行役）: " / "ファシリテーター（進行役）："
  const pattern = new RegExp(`^\\s*${escaped}\\s*[：:]\\s*`);
  return text.replace(pattern, '').trim();
}

function sanitizeMessage(text, speakerName) {
  const noAsterisk = stripAsterisks(text);
  return removeLeadingSpeakerLabel(noAsterisk, speakerName);
}

function dedupeParagraphs(text) {
  if (typeof text !== 'string') return text;
  const blocks = text
    .split(/\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean);

  const seen = new Set();
  const kept = [];
  for (const block of blocks) {
    // 空白差・句読点差の影響を減らして重複判定
    const key = block.replace(/\s+/g, '').replace(/[。．、,\-・]/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(block);
  }
  return kept.join('\n\n').trim();
}

function truncateMessage(text, maxChars) {
  if (typeof text !== 'string') return text;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trim()}…`;
}

function sanitizeRegularMessage(text, speakerName) {
  const cleaned = sanitizeMessage(text, speakerName);
  const deduped = dedupeParagraphs(cleaned);
  return truncateMessage(deduped, REGULAR_MESSAGE_MAX_CHARS);
}

function sanitizeResearchMessage(text, speakerName) {
  const cleaned = sanitizeMessage(text, speakerName);
  const deduped = dedupeParagraphs(cleaned);
  return truncateMessage(deduped, 1200);
}

function normalizeFeatureTermsInText(text) {
  if (typeof text !== 'string') return text;
  return text;
}

function formatFinalSummary(text) {
  if (typeof text !== 'string') return text;
  // 総括以外（前置きや会話本文の再掲）が混入した場合は切り落とす
  const idxLine = text.indexOf('\n総括');
  const idxMd = text.indexOf('\n## 総括');
  let headingStart = -1;
  if (idxLine >= 0 && idxMd >= 0) headingStart = Math.min(idxLine + 1, idxMd + 1);
  else if (idxLine >= 0) headingStart = idxLine + 1;
  else if (idxMd >= 0) headingStart = idxMd + 1;
  else {
    const fallback = text.search(/(?:^|\n)\s*(?:##\s*)?総括\s*$/m);
    headingStart = fallback >= 0 ? fallback : -1;
  }
  let baseText = headingStart >= 0 ? text.slice(headingStart) : text;

  // 話者ラベル付きの会話再掲は総括から除去する
  baseText = baseText
    .replace(/(^|\n)\s*ファシリテーター（進行役）?\s*[：:].*/g, '\n')
    .replace(/(^|\n)\s*ファシリテーター\s*[：:].*/g, '\n')
    .replace(/(^|\n)\s*楽観的マーケター\s*[：:].*/g, '\n')
    .replace(/(^|\n)\s*慎重なエンジニア\s*[：:].*/g, '\n')
    .replace(/(^|\n)\s*ユーザー代表\s*[：:].*/g, '\n');

  const headings = new Set(['総括', '今後の検討ポイント']);
  let normalized = baseText;

  // 見出しがない場合はフォールバックで強制構造化
  const hasSummaryHeading = /(?:^|\n)\s*(?:##\s*)?総括\s*(?:\n|$)/m.test(normalized);
  const hasFutureHeading = /(?:^|\n)\s*(?:##\s*)?今後の検討ポイント\s*(?:\n|$)/m.test(normalized);
  if (!hasSummaryHeading || !hasFutureHeading) {
    const plain = normalized.replace(/\s+/g, ' ').trim();
    const short = truncateMessage(plain, 220);
    return [
      '総括',
      '',
      short || '議論の要点を整理しました。',
      '',
      '今後の検討ポイント',
      '',
      '・ 導入範囲と優先順位の明確化',
      '・ 既存システムへの影響評価'
    ].join('\n');
  }

  // 1行で返ってきた場合でも見出しを分割できるようにする
  normalized = normalized
    .replace(/\s*##\s*総括/g, '\n## 総括')
    .replace(/\s*##\s*今後の検討ポイント/g, '\n## 今後の検討ポイント');

  // 見出しマーカーなしで返る場合の保険
  normalized = normalized
    .replace(/\s*総括\s*/g, '\n## 総括\n')
    .replace(/\s*今後の検討ポイント\s*/g, '\n## 今後の検討ポイント\n');

  // 箇条書きが本文中に続いた場合は改行して分割
  normalized = normalized.replace(/\s+-\s+/g, '\n- ');
  normalized = normalized.replace(/\s+・\s+/g, '\n・ ');

  const lines = normalized.split(/\r?\n/).map(line => line.trim());
  const out = [];
  let currentSection = '';
  let lastWasBlank = false;

  for (const raw of lines) {
    if (!raw) {
      if (!lastWasBlank && out.length > 0) {
        out.push('');
        lastWasBlank = true;
      }
      continue;
    }

    const headingNormalized = raw.replace(/^##\s*/, '');
    if (headings.has(headingNormalized)) {
      if (out.length > 0 && out[out.length - 1] !== '') {
        out.push('');
      }
      out.push(headingNormalized);
      out.push('');
      currentSection = headingNormalized;
      lastWasBlank = true;
      continue;
    }

    if (currentSection && currentSection !== '総括') {
      const item = raw.replace(/^([・-]\s*)+/, '');
      out.push(`・ ${item}`);
    } else {
      out.push(raw);
    }
    lastWasBlank = false;
  }

  // 余分な空行を削る
  const cleaned = [];
  for (const line of out) {
    if (line === '' && (cleaned.length === 0 || cleaned[cleaned.length - 1] === '')) {
      continue;
    }
    cleaned.push(line);
  }

  let result = cleaned.join('\n').trim();
  if (result.length > FINAL_SUMMARY_MAX_CHARS) {
    result = `${result.slice(0, FINAL_SUMMARY_MAX_CHARS).trim()}\n\n（総括が長いため省略しました）`;
  }
  // 仕上げ: 「見出し + そのまま本文」の1行を見出しと本文に分離
  result = result
    .replace(/^(総括)\s+(.+)$/m, '$1\n\n$2')
    .replace(/^(今後の検討ポイント)\s+(.+)$/m, '$1\n\n・ $2')
    .replace(/^・\s*・\s*/gm, '・ ');

  // 検討ポイントは「見出しレベルのみ」に圧縮（説明文を削る）
  const normalizedLines = result.split('\n');
  const finalOut = [];
  let inFuture = false;
  let summarySentenceCount = 0;
  for (const raw of normalizedLines) {
    const line = raw.trim();
    if (!line) {
      if (finalOut.length && finalOut[finalOut.length - 1] !== '') finalOut.push('');
      continue;
    }
    if (line === '総括') {
      inFuture = false;
      finalOut.push(line, '');
      continue;
    }
    if (line === '今後の検討ポイント') {
      inFuture = true;
      finalOut.push(line, '');
      continue;
    }

    if (!inFuture) {
      // 総括本文は2文まで
      if (summarySentenceCount >= 2) continue;
      finalOut.push(line);
      summarySentenceCount += (line.match(/[。！？]/g) || []).length || 1;
      continue;
    }

    // 検討ポイント本文は捨てる（固定見出しを後段で挿入）
    continue;
  }

  // 固定の検討ポイント（暴走防止）
  const compact = finalOut.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const summaryBlock = compact.split('\n\n今後の検討ポイント')[0].trim();
  const shortSummary = truncateMessage(summaryBlock, 260);
  return [
    shortSummary,
    '',
    '今後の検討ポイント',
    '',
    '・ 対象範囲の明確化',
    '・ 優先順位の決定',
    '・ 検証方法の定義'
  ].join('\n').trim();
}

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

function isQuotaExceededError(error) {
  return Boolean(
    error &&
    error.message &&
    (error.message.includes('429') ||
      error.message.includes('Quota exceeded') ||
      error.message.includes('rate_limit'))
  );
}

function extractFeatureTerms(theme) {
  if (typeof theme !== 'string') return [];
  const terms = new Set();
  const dotMatches = theme.match(/\b[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g) || [];
  for (const t of dotMatches) terms.add(t);
  const technicalWords = theme.match(/\b[A-Za-z][A-Za-z0-9._/-]{2,}\b/g) || [];
  for (const t of technicalWords) {
    if (t.length <= 40) terms.add(t);
  }
  const quoted = theme.match(/["「『](.+?)["」』]/g) || [];
  for (const q of quoted) {
    const cleaned = q.replace(/^["「『]|["」』]$/g, '').trim();
    if (cleaned.length >= 2 && cleaned.length <= 40) terms.add(cleaned);
  }
  return Array.from(terms).slice(0, 5);
}

function buildTermAssumption(term) {
  const lower = term.toLowerCase();
  if (lower.endsWith('.md')) {
    return `${term} は「Markdown文書（運用ルール・指示・設計方針を書くファイル）」として扱う。抽象的なデザインシステム概念そのものに置き換えない。`;
  }
  return `${term} は原語のまま扱い、別語へ勝手に置換しない。`;
}

function lookupTermInLocalDocs(term) {
  const targets = ['design.md', 'README.md', 'public/index.html', 'server.js'];
  for (const file of targets) {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) continue;
    const body = fs.readFileSync(filePath, 'utf8');
    const idx = body.toLowerCase().indexOf(term.toLowerCase());
    if (idx < 0) continue;
    const start = Math.max(0, idx - 80);
    const end = Math.min(body.length, idx + 160);
    const snippet = body.slice(start, end).replace(/\s+/g, ' ').trim();
    return { source: file, snippet };
  }
  return null;
}

async function lookupTermOnWeb(term) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(term)}&format=json&no_html=1&skip_disambig=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;
    const json = await resp.json();
    const text = (json && (json.AbstractText || json.Heading || '')) || '';
    if (!text) return null;
    return { source: 'web', snippet: String(text).slice(0, 160) };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupTermCandidatesOnWeb(term) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(term)}&format=json&no_html=1&skip_disambig=0`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return [];
    const json = await resp.json();
    const candidates = [];
    const pushCandidate = (text, source) => {
      const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
      if (!cleaned) return;
      if (candidates.some(c => c.text === cleaned)) return;
      candidates.push({ text: cleaned.slice(0, 180), source });
    };

    pushCandidate(json.AbstractText, 'duckduckgo:abstract');
    pushCandidate(json.Definition, 'duckduckgo:definition');

    const related = Array.isArray(json.RelatedTopics) ? json.RelatedTopics : [];
    for (const item of related) {
      if (item && typeof item.Text === 'string') {
        pushCandidate(item.Text, 'duckduckgo:related');
      }
      if (item && Array.isArray(item.Topics)) {
        for (const nested of item.Topics) {
          if (nested && typeof nested.Text === 'string') {
            pushCandidate(nested.Text, 'duckduckgo:related');
          }
        }
      }
      if (candidates.length >= 5) break;
    }
    return candidates.slice(0, 5);
  } catch (_) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function translateCandidateToJapanese(text) {
  if (!text || typeof text !== 'string') return '';
  const input = text.trim();
  if (!input) return '';
  if (/[ぁ-んァ-ヶ一-龠]/.test(input)) return input;

  try {
    const translated = await callGeminiAPI(
      [{ role: 'user', content: `次の文を自然な日本語に短く翻訳してください。説明は不要です。\n\n${input}` }],
      'あなたは翻訳者です。意味を変えず、簡潔な日本語に翻訳してください。'
    );
    return String(translated || '').trim() || input;
  } catch (_) {
    return input;
  }
}

async function buildFeatureContext(theme) {
  const terms = extractFeatureTerms(theme);
  if (!terms.length) return '';
  const lines = ['重要語（原語維持）:'];
  for (const term of terms) {
    lines.push(`- ${buildTermAssumption(term)}`);
    const local = lookupTermInLocalDocs(term);
    const web = local ? null : await lookupTermOnWeb(term);
    const hint = local || web;
    if (hint) {
      lines.push(`- ${term}: 参考(${hint.source}) ${hint.snippet}`);
    } else {
      lines.push(`- ${term}: 参考情報なし。意味を決め打ちせず、原語のまま扱うこと。`);
    }
  }
  lines.push('ルール: 重要語は別語へ言い換え禁止。重要語が design.md の場合は、必ず "design.md" と表記すること。');
  lines.push('ルール: 未知語は一般概念へ丸めず、まず語そのものを保持して扱うこと。');
  return lines.join('\n');
}

function extractUnknownCandidates(theme) {
  if (typeof theme !== 'string') return [];
  const terms = new Set(extractFeatureTerms(theme));
  const stopWords = new Set([
    'モデル',
    'データ',
    'システム',
    'プロジェクト',
    'サービス',
    'アプリ',
    'ツール',
    'ユーザー',
    'テーマ',
    '会議',
    '導入',
    '運用',
    '管理',
    '方針',
    '活用',
    '統合',
    '検討',
    '改善',
    '分析',
    '設計'
  ]);
  const katakanaTokens = theme.match(/[ァ-ヴー]{4,}/g) || [];
  const genericKatakanaPattern = /(モデル|データ|システム|サービス|プロジェクト|アプリ|ツール|テーマ|会議|導入|運用|管理|方針|活用|統合|検討|改善|分析|設計)/;
  for (const k of katakanaTokens) {
    if (k.length <= 20 && !stopWords.has(k) && !genericKatakanaPattern.test(k)) {
      terms.add(k);
    }
  }

  const filtered = [];
  for (const term of terms) {
    const cleaned = String(term || '').trim();
    if (!cleaned) continue;
    if (stopWords.has(cleaned)) continue;
    filtered.push(cleaned);
  }
  return filtered.slice(0, 8);
}

async function buildResearchBriefing(theme, resolvedTerms = {}) {
  const candidates = extractUnknownCandidates(theme);
  if (!candidates.length) {
    return '事前調査メモ:\n- 明確な未知語は見つかりませんでした。テーマ文の原語をそのまま使って議論してください。';
  }

  const lines = ['事前調査メモ（会議前共有・ネット検索のみ）:'];
  for (const term of candidates) {
    const fixed = resolvedTerms && typeof resolvedTerms[term] === 'string' ? resolvedTerms[term].trim() : '';
    if (fixed) {
      lines.push(`- 用語: ${term}`);
      lines.push(`  定義候補: ${fixed}`);
      lines.push('  出典: ユーザー確定');
      continue;
    }
    const web = await lookupTermOnWeb(term);
    if (web) {
      lines.push(`- 用語: ${term}`);
      lines.push(`  定義候補: ${web.snippet}`);
      lines.push(`  出典: ${web.source}`);
    } else {
      lines.push(`- 用語: ${term}`);
      lines.push('  定義候補: 未取得（憶測で意味を拡張しない）');
      lines.push('  出典: なし');
    }
  }
  lines.push('運用ルール: このメモにない意味を勝手に作らない。曖昧な用語は曖昧なまま扱い、断定しない。');
  return lines.join('\n');
}

async function buildDisambiguationCandidates(theme) {
  const terms = extractUnknownCandidates(theme);
  const result = [];
  for (const term of terms) {
    const candidates = await lookupTermCandidatesOnWeb(term);
    result.push({ term, candidates });
  }
  return result;
}

function validateResolvedTerms(theme, resolvedTerms) {
  const terms = extractUnknownCandidates(theme);
  if (!terms.length) return null;
  if (!resolvedTerms || typeof resolvedTerms !== 'object') {
    return terms;
  }
  const missing = terms.filter((term) => {
    const v = resolvedTerms[term];
    return typeof v !== 'string' || v.trim().length < 2;
  });
  return missing.length ? missing : null;
}

function buildResolvedTermsContext(resolvedTerms) {
  if (!resolvedTerms || typeof resolvedTerms !== 'object') return '';
  const entries = Object.entries(resolvedTerms).filter(([, v]) => typeof v === 'string' && v.trim());
  if (!entries.length) return '';
  const lines = ['意味確定済み用語（会議前にユーザー確認済み）:'];
  for (const [term, meaning] of entries) {
    lines.push(`- ${term}: ${meaning.trim()}`);
  }
  lines.push('ルール: 下記定義から逸脱しない。未定義の意味は断定しない。');
  return lines.join('\n');
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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
              maxOutputTokens: getEnvNumber('GEMINI_MAX_TOKENS', 1024, { integer: true, min: 1, max: 8192 }),
              // 2.5系モデルで思考トークンが出力枠を食い尽くして本文が途中で切れるのを防ぐ
              thinkingConfig: { thinkingBudget: 0 }
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

    res.json({ refinedTheme: stripAsterisks(refinedTheme.trim()) });
  } catch (error) {
    console.error('Error refining theme:', error);
    if (isQuotaExceededError(error)) {
      return res.status(429).json({
        error: 'Gemini API の利用上限に達しました',
        detail: 'しばらく待って再試行するか、Google AI Studio で課金・レート制限設定をご確認ください。'
      });
    }
    res.status(500).json({ error: 'テーマの具体化に失敗しました', detail: String(error && error.message || error) });
  }
});

app.post('/api/disambiguate-terms', async (req, res) => {
  try {
    const { theme } = req.body;
    const themeError = validateTheme(theme);
    if (themeError) {
      return res.status(400).json({ error: themeError });
    }
    const terms = await buildDisambiguationCandidates(theme);
    for (const termItem of terms) {
      const candidates = Array.isArray(termItem.candidates) ? termItem.candidates : [];
      for (const c of candidates) {
        c.textJa = await translateCandidateToJapanese(c.text);
      }
    }
    res.json({ terms });
  } catch (error) {
    console.error('Error disambiguating terms:', error);
    res.status(500).json({ error: '用語候補の取得に失敗しました', detail: String(error && error.message || error) });
  }
});

// 会話を生成するエンドポイント
app.post('/api/generate-conversation', async (req, res) => {
  try {
    const { theme, turns = 3, resolvedTerms = {} } = req.body;
    const themeError = validateTheme(theme);
    const turnsResult = validateTurns(turns);

    if (themeError) {
      return res.status(400).json({ error: themeError });
    }

    if (turnsResult.error) {
      return res.status(400).json({ error: turnsResult.error });
    }
    const missingTerms = validateResolvedTerms(theme, resolvedTerms);
    if (missingTerms) {
      return res.status(400).json({
        error: '曖昧語の意味確定が必要です',
        detail: `次の用語の意味を確定してください: ${missingTerms.join(', ')}`
      });
    }

    const maxTurns = turnsResult.value; // 1-5ターンに制限
    const conversation = [];
    const featureContext = await buildFeatureContext(theme);
    const researchBriefing = await buildResearchBriefing(theme, resolvedTerms);
    const resolvedTermsContext = buildResolvedTermsContext(resolvedTerms);

    conversation.push({
      persona: 'facilitator',
      name: 'ファシリテーター（進行役・事前調査）',
      message: sanitizeResearchMessage(
        `${researchBriefing}\n\nこの調査メモを共通前提として、ここから議論を開始します。`,
        'ファシリテーター（進行役・事前調査）'
      ),
      timestamp: new Date().toISOString()
    });

    // ファシリテーターが開始
    const openingMessage = {
      role: 'user',
      content: `これから「${theme}」というテーマについて議論を始めます。参加者は楽観的マーケター、慎重なエンジニア、ユーザー代表の3名です。
最初に、議論の目的と最初の確認事項だけを自然な会話文で短く提示してください。
あいさつ文（例: 皆さん、本日は〜）や前置きは不要です。
事前調査メモに出てきた用語定義を踏まえて発言してください。

${researchBriefing}

${resolvedTermsContext}

${featureContext}`
    };

    const facilitatorOpening = await callGeminiAPI(
      [openingMessage],
      PERSONAS.facilitator.systemPrompt
    );

    conversation.push({
      persona: 'facilitator',
      name: PERSONAS.facilitator.name,
      message: sanitizeRegularMessage(
        normalizeFeatureTermsInText(facilitatorOpening, theme),
        PERSONAS.facilitator.name
      ),
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

あなた（${persona.name}）の番です。上記の議論を踏まえて、あなたの視点で短く述べてください。
重要: 既出内容の言い換えは避け、今回初出の具体情報を1つだけ追加してください。長く書きすぎないでください。
重要語の定義を勝手に変更しないでください。特に .md はファイルとして扱ってください。
会議前の調査メモにない意味を追加で断定しないでください。

${researchBriefing}

${resolvedTermsContext}

${featureContext}`
        }];

        const response = await callGeminiAPI(messages, persona.systemPrompt);

        conversation.push({
          persona: personaKey,
          name: persona.name,
          message: sanitizeRegularMessage(
            normalizeFeatureTermsInText(response, theme),
            persona.name
          ),
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

ファシリテーターとして、ここまでの議論を2〜3文で整理し、次のターンで決めるべき1点を1文で示してください。
調査メモで未確定の用語があれば、未確定のまま扱ってください。

${researchBriefing}

${resolvedTermsContext}

${featureContext}`
        }];

        const facilitatorSummary = await callGeminiAPI(
          messages,
          PERSONAS.facilitator.systemPrompt
        );

        conversation.push({
          persona: 'facilitator',
          name: PERSONAS.facilitator.name,
          message: sanitizeRegularMessage(
            normalizeFeatureTermsInText(facilitatorSummary, theme),
            PERSONAS.facilitator.name
          ),
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

ファシリテーターとして、議論全体を総括してください。
出力は次のレイアウトを厳守してください。見出しごとに1行空けてください。
実行計画、担当、期限、KPI、ToDoは書かないでください。
1行を長くしすぎず、読みやすく改行してください。
総括部分はMarkdownライクな読み物として整形してください（見出しと箇条書きを使用）。
話者名（例: ファシリテーター: / 楽観的マーケター:）で始まる会話文を再掲しないでください。
全体で簡潔に、長くても900文字程度に収めてください。
調査メモにない定義を断定しないでください。

総括
（ここに2〜3文の要約）

今後の検討ポイント
- （ポイント1）
- （ポイント2）

${researchBriefing}

${resolvedTermsContext}

${featureContext}`
    }];

    const finalSummary = await callGeminiAPI(
      messages,
      PERSONAS.facilitator.systemPrompt
    );

    conversation.push({
      persona: 'facilitator',
      name: PERSONAS.facilitator.name + '（総括）',
      message: formatFinalSummary(
        sanitizeMessage(
          normalizeFeatureTermsInText(finalSummary, theme),
          PERSONAS.facilitator.name
        )
      ),
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
    if (isQuotaExceededError(error)) {
      return res.status(429).json({
        error: 'Gemini API の利用上限に達しました',
        detail: 'しばらく待って再試行するか、Google AI Studio で課金・レート制限設定をご確認ください。'
      });
    }
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

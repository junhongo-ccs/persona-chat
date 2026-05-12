// アプリケーションロジック
const themeInput = document.getElementById('theme');
const turnsInput = document.getElementById('turns');
const refineBtn = document.getElementById('refineBtn');
const generateBtn = document.getElementById('generateBtn');
const loading = document.getElementById('loading');
const conversation = document.getElementById('conversation');
const messages = document.getElementById('messages');
const refinedThemeBox = document.getElementById('refinedThemeBox');
const toastContainer = document.getElementById('toastContainer');
const termModalBackdrop = document.getElementById('termModalBackdrop');
const termModalBody = document.getElementById('termModalBody');
const termModalCancelBtn = document.getElementById('termModalCancelBtn');
const termModalConfirmBtn = document.getElementById('termModalConfirmBtn');

let currentRefinedTheme = null;

function renderSummaryContent(messageContent, text) {
    const lines = String(text || '').split('\n').map(line => line.trim());
    const headingSet = new Set(['総括', '今後の検討ポイント']);
    let currentSection = '';

    messageContent.classList.add('summary-structured');

    lines.forEach((line) => {
        if (!line) {
            return;
        }

        if (headingSet.has(line)) {
            currentSection = line;
            const heading = document.createElement('div');
            heading.className = 'summary-section-title';
            heading.textContent = line;
            messageContent.appendChild(heading);
            return;
        }

        if (line.startsWith('・')) {
            const item = document.createElement('div');
            item.className = 'summary-item';
            item.textContent = line;
            messageContent.appendChild(item);
            return;
        }

        const paragraph = document.createElement('div');
        paragraph.className = 'summary-paragraph';
        paragraph.textContent = line;
        messageContent.appendChild(paragraph);
    });
}

function showToast(message, type = 'info', durationMs = 4200) {
    if (!toastContainer) {
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    const fadeMs = 200;
    setTimeout(() => {
        toast.classList.add('fade-out');
    }, Math.max(0, durationMs - fadeMs));

    setTimeout(() => {
        toast.remove();
    }, durationMs);
}

function buildApiErrorMessage(prefix, data) {
    const errorText = data && data.error ? String(data.error) : '';
    const detailText = data && data.detail ? String(data.detail) : '';
    const combined = `${errorText}\n${detailText}`;

    if (combined.includes('429') || combined.includes('利用上限') || combined.includes('Quota exceeded')) {
        return `${prefix}\nGemini API の利用上限に達しています。時間をおいて再実行してください。`;
    }

    if (detailText) {
        return `${prefix}\n${detailText}`;
    }

    if (errorText) {
        return `${prefix}\n${errorText}`;
    }

    return prefix;
}

async function parseApiResponse(response) {
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const rawText = await response.text();

    if (contentType.includes('application/json')) {
        try {
            return { data: JSON.parse(rawText), rawText };
        } catch (_) {
            return { data: null, rawText };
        }
    }

    try {
        return { data: JSON.parse(rawText), rawText };
    } catch (_) {
        return { data: null, rawText };
    }
}

async function resolveTermMeanings(theme) {
    const response = await fetch('/api/disambiguate-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme })
    });
    const { data, rawText } = await parseApiResponse(response);
    if (!response.ok) {
        const fallbackData = data || { detail: rawText || 'Unknown error' };
        throw new Error(buildApiErrorMessage('用語候補の取得に失敗しました。', fallbackData));
    }

    const terms = Array.isArray(data && data.terms) ? data.terms : [];
    const resolvedTerms = {};

    for (const item of terms) {
        const term = item && item.term ? String(item.term) : '';
        if (!term) continue;
        const candidates = Array.isArray(item.candidates) ? item.candidates : [];
        resolvedTerms[term] = await openTermModalAndResolve(term, candidates);
    }

    return resolvedTerms;
}

function openTermModalAndResolve(term, candidates) {
    return new Promise((resolve, reject) => {
        if (!termModalBackdrop || !termModalBody || !termModalCancelBtn || !termModalConfirmBtn) {
            reject(new Error('意味確定モーダルの初期化に失敗しました。'));
            return;
        }

        termModalBody.innerHTML = '';

        const termName = document.createElement('div');
        termName.className = 'term-term-name';
        termName.textContent = `用語: ${term}`;
        termModalBody.appendChild(termName);

        const list = document.createElement('div');
        list.className = 'term-candidate-list';

        candidates.forEach((candidate, idx) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'term-candidate-item';

            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'termCandidate';
            input.id = `termCandidate${idx}`;
            input.value = candidate.textJa || candidate.text || '';
            if (idx === 0) input.checked = true;

            const label = document.createElement('label');
            label.setAttribute('for', input.id);
            label.textContent = candidate.textJa || candidate.text || '候補なし';

            wrapper.appendChild(input);
            wrapper.appendChild(label);
            list.appendChild(wrapper);
        });
        termModalBody.appendChild(list);

        const custom = document.createElement('input');
        custom.type = 'text';
        custom.className = 'term-custom-input';
        custom.placeholder = '候補にない場合はここに意味を直接入力';
        termModalBody.appendChild(custom);

        termModalBackdrop.classList.add('active');
        custom.focus();

        const cleanup = () => {
            termModalBackdrop.classList.remove('active');
            termModalCancelBtn.onclick = null;
            termModalConfirmBtn.onclick = null;
        };

        termModalCancelBtn.onclick = () => {
            cleanup();
            reject(new Error('意味確定がキャンセルされたため、会議開始を停止しました。'));
        };

        termModalConfirmBtn.onclick = () => {
            const customText = custom.value.trim();
            if (customText) {
                cleanup();
                resolve(customText);
                return;
            }

            const selected = termModalBody.querySelector('input[name="termCandidate"]:checked');
            const selectedText = selected ? String(selected.value || '').trim() : '';
            if (!selectedText) {
                showToast(`用語「${term}」の意味を入力または選択してください。`, 'error');
                return;
            }
            cleanup();
            resolve(selectedText);
        };
    });
}

// テーマを具体化
refineBtn.addEventListener('click', async () => {
    const theme = themeInput.value.trim();
    
    if (!theme || theme.length < 3) {
        showToast('テーマを入力してください', 'error');
        return;
    }

    refineBtn.disabled = true;
    refineBtn.textContent = '処理中...';

    try {
        const response = await fetch('/api/refine-theme', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ theme })
        });

        const { data, rawText } = await parseApiResponse(response);
        if (!response.ok) {
            const fallbackData = data || { detail: rawText || 'Unknown error' };
            throw new Error(buildApiErrorMessage('テーマの具体化に失敗しました。', fallbackData));
        }
        if (!data || !data.refinedTheme) {
            throw new Error('テーマの具体化レスポンスが不正です。');
        }
        currentRefinedTheme = data.refinedTheme;
        
        // 具体化されたテーマを表示
        themeInput.value = currentRefinedTheme;
        
        showToast('テーマを具体化しました。気に入らなければ手動で編集できます。', 'success');

    } catch (error) {
        console.error('Error:', error);
        showToast('エラーが発生しました。\n' + error.message, 'error', 6000);
    } finally {
        refineBtn.disabled = false;
        refineBtn.textContent = '✨ テーマを具体化する';
    }
});

// 会話を生成
generateBtn.addEventListener('click', async () => {
    const theme = themeInput.value.trim();
    const turns = parseInt(turnsInput.value);

    if (!theme || theme.length < 3) {
        showToast('テーマを入力してください', 'error');
        return;
    }

    if (turns < 1 || turns > 5) {
        showToast('ターン数は1-5の範囲で指定してください', 'error');
        return;
    }

    let resolvedTerms = {};
    try {
        resolvedTerms = await resolveTermMeanings(theme);
    } catch (error) {
        showToast(String(error.message || error), 'error', 5000);
        return;
    }

    // UI更新
    generateBtn.disabled = true;
    refineBtn.disabled = true;
    loading.classList.add('active');
    conversation.classList.remove('active');
    messages.innerHTML = '';
    refinedThemeBox.innerHTML = '';

    try {
        const response = await fetch('/api/generate-conversation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ theme, turns, resolvedTerms })
        });

        const { data, rawText } = await parseApiResponse(response);
        if (!response.ok) {
            const fallbackData = data || { detail: rawText || 'Unknown error' };
            throw new Error(buildApiErrorMessage('会話の生成に失敗しました。', fallbackData));
        }
        if (!data || !Array.isArray(data.conversation)) {
            throw new Error('会話生成レスポンスが不正です。');
        }

        // 会話を表示（XSS対策のため textContent を使用）
        data.conversation.forEach((msg, index) => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${msg.persona}`;
            
            const time = new Date(msg.timestamp).toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const messageHeader = document.createElement('div');
            messageHeader.className = 'message-header';

            const personaName = document.createElement('span');
            personaName.className = 'persona-name';
            personaName.textContent = msg.name;

            const timestamp = document.createElement('span');
            timestamp.className = 'timestamp';
            timestamp.textContent = time;

            messageHeader.appendChild(personaName);
            messageHeader.appendChild(timestamp);

            const messageContent = document.createElement('div');
            messageContent.className = 'message-content';
            const isFinalSummary = typeof msg.name === 'string' && msg.name.includes('総括');
            if (isFinalSummary) {
                renderSummaryContent(messageContent, msg.message);
            } else {
                messageContent.textContent = msg.message;
            }

            messageDiv.appendChild(messageHeader);
            messageDiv.appendChild(messageContent);
            messages.appendChild(messageDiv);
        });

        conversation.classList.add('active');
        conversation.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('Error:', error);
        showToast('エラーが発生しました。\n' + error.message, 'error', 6000);
    } finally {
        generateBtn.disabled = false;
        refineBtn.disabled = false;
        loading.classList.remove('active');
    }
});

// キー操作では送信しない（日本語IMEの確定Enterで誤送信しないように、明示的なボタン押下のみ）
// Enter は通常どおり改行として機能します（Shift+Enter も改行）。

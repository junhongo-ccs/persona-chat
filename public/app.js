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

        let data = await response.json();
        if (!response.ok) {
            throw new Error(buildApiErrorMessage('テーマの具体化に失敗しました。', data));
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
            body: JSON.stringify({ theme, turns })
        });

        let data = await response.json();
        if (!response.ok) {
            throw new Error(buildApiErrorMessage('会話の生成に失敗しました。', data));
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

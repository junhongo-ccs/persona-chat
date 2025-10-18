// アプリケーションロジック
const themeInput = document.getElementById('theme');
const turnsInput = document.getElementById('turns');
const refineBtn = document.getElementById('refineBtn');
const generateBtn = document.getElementById('generateBtn');
const loading = document.getElementById('loading');
const conversation = document.getElementById('conversation');
const messages = document.getElementById('messages');
const refinedThemeBox = document.getElementById('refinedThemeBox');

let currentRefinedTheme = null;

// テーマを具体化
refineBtn.addEventListener('click', async () => {
    const theme = themeInput.value.trim();
    
    if (!theme || theme.length < 3) {
        alert('テーマを入力してください');
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
            const detail = data && (data.detail || data.error);
            throw new Error('テーマの具体化に失敗しました' + (detail ? `\n詳細: ${detail}` : ''));
        }
        currentRefinedTheme = data.refinedTheme;
        
        // 具体化されたテーマを表示
        themeInput.value = currentRefinedTheme;
        
        alert('テーマを具体化しました！\n\n気に入らなければ手動で編集できます。');

    } catch (error) {
        console.error('Error:', error);
        alert('エラーが発生しました: ' + error.message);
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
        alert('テーマを入力してください');
        return;
    }

    if (turns < 1 || turns > 5) {
        alert('ターン数は1-5の範囲で指定してください');
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
            const detail = data && (data.detail || data.error);
            throw new Error('会話の生成に失敗しました' + (detail ? `\n詳細: ${detail}` : ''));
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
            messageContent.textContent = msg.message;

            messageDiv.appendChild(messageHeader);
            messageDiv.appendChild(messageContent);
            messages.appendChild(messageDiv);
        });

        conversation.classList.add('active');
        conversation.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('Error:', error);
        alert('エラーが発生しました: ' + error.message);
    } finally {
        generateBtn.disabled = false;
        refineBtn.disabled = false;
        loading.classList.remove('active');
    }
});

// キー操作では送信しない（日本語IMEの確定Enterで誤送信しないように、明示的なボタン押下のみ）
// Enter は通常どおり改行として機能します（Shift+Enter も改行）。

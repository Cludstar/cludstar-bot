async function fetchMissionStatus() {
    try {
        const response = await fetch('/api/mission');
        const data = await response.json();
        const progress = document.getElementById('mission-progress');
        const text = document.getElementById('balance-text');

        progress.value = data.currentBalance;
        progress.max = data.targetBalance;
        text.innerText = `Current: ${data.currentBalance} SOL`;
        
        if (data.walletAddress) {
            document.getElementById('wallet-text').innerText = data.walletAddress;
        }
    } catch (e) {
        console.error("Failed to fetch mission status", e);
    }
}

async function fetchLogs() {
    try {
        const response = await fetch('/api/trades');
        const memories = await response.json();

        const container = document.getElementById('trade-logs');
        container.innerHTML = '';

        if (!memories || memories.length === 0) {
            container.innerHTML = '<div class="log-entry">Waiting for signals and Clude initialization...</div>';
            return;
        }

        memories.forEach(mem => {
            const el = document.createElement('div');
            el.className = `log-entry type-${mem.type}`;

            const time = new Date(mem.created_at).toLocaleTimeString();

            // Detect decision for styling
            let decisionTag = '';
            let summaryText = mem.summary;

            if (mem.summary.includes('BUY')) decisionTag = '<span class="decision-tag decision-buy">BUY</span>';
            else if (mem.summary.includes('SKIP')) decisionTag = '<span class="decision-tag decision-skip">SKIP</span>';
            else if (mem.summary.includes('SELL')) decisionTag = '<span class="decision-tag decision-sell">SELL</span>';

            el.innerHTML = `
                <div class="log-header">
                    <span class="log-time">[${time}]</span>
                    <span class="log-badge ${mem.type || 'default'}">${(mem.type || 'SYSTEM').toUpperCase()}</span>
                </div>
                <div class="log-summary">${decisionTag}<span class="log-summary-text">${summaryText}</span></div>
                <div class="log-content">${mem.content}</div>
                <div class="log-tags">Tags: ${mem.tags ? mem.tags.join(', ') : 'none'}</div>
            `;
            container.appendChild(el);
        });

    } catch (e) {
        console.error("Failed to fetch logs", e);
    }
}

setInterval(fetchLogs, 5000);
setInterval(fetchMissionStatus, 10000);

// Initial load
fetchLogs();
fetchMissionStatus();

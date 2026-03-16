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
            document.getElementById('wallet-text').innerText = `Wallet: ${data.walletAddress}`;
        }
    } catch (e) {
        console.error("Failed to fetch mission status", e);
    }
}

async function fetchLogs() {
    try {
        const response = await fetch('/api/trades');
        const memories = await response.json();

        const tradeContainer = document.getElementById('trade-logs');
        const memoryContainer = document.getElementById('memory-logs');
        tradeContainer.innerHTML = '';
        memoryContainer.innerHTML = '';

        if (!memories || memories.length === 0) {
            tradeContainer.innerHTML = '<div class="log-entry">Waiting for signals...</div>';
            memoryContainer.innerHTML = '<div class="log-entry">Agent is initializing...</div>';
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
            
            // Filter logic: if tags contain 'trade_execution' or 'trade_decision', map to Trade Logs, else Memory Stream
            const isTrade = mem.tags && (mem.tags.includes('trade_execution') || mem.tags.includes('trade_decision'));
            
            if (isTrade) {
                tradeContainer.appendChild(el);
            } else {
                memoryContainer.appendChild(el);
            }
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

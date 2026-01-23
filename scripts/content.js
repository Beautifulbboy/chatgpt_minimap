function initMinimap() {
    if (document.getElementById('chatgpt-minimap-container')) return;

    const minimap = document.createElement('div');
    minimap.id = 'chatgpt-minimap-container';
    document.body.appendChild(minimap);

    const previewCard = document.createElement('div');
    previewCard.id = 'chatgpt-minimap-preview';
    document.body.appendChild(previewCard);

    let lastMessageCount = 0;
    let isInternalScrolling = false;

    const getScrollContainer = () => {
        return document.querySelector('div.not-print\\:overflow-y-auto') || 
               document.querySelector('main')?.parentElement || 
               window;
    };

    const updateMinimap = () => {
        const messageBlocks = document.querySelectorAll('main div[data-message-author-role]');
        const minimapContainer = document.getElementById('chatgpt-minimap-container');
        
        if (messageBlocks.length === lastMessageCount && minimapContainer.children.length > 1) {
            return;
        }
        
        lastMessageCount = messageBlocks.length;
        minimap.innerHTML = '';

        const indicator = document.createElement('div');
        indicator.id = 'minimap-viewport-indicator';
        minimap.appendChild(indicator);

        messageBlocks.forEach((block) => {
            const role = block.getAttribute('data-message-author-role');
            const isUser = role === 'user';
            const rawText = block.innerText || "";
            const cleanText = rawText.replace(/\s+/g, ' ').trim(); 

            const mapItem = document.createElement('div');
            mapItem.className = `minimap-item ${isUser ? 'minimap-user' : 'minimap-model'}`;
            
            const realHeight = block.offsetHeight;
            let displayHeight = isUser ? Math.max(20, realHeight * 0.08) : Math.max(15, realHeight * 0.05);
            mapItem.style.height = `${Math.min(displayHeight, 75)}px`;

            mapItem.addEventListener('click', () => {
                isInternalScrolling = true;
                previewCard.style.display = 'none';
                const scrollContainer = getScrollContainer();
                const scrollTarget = scrollContainer === window ? window : scrollContainer;
                const targetNode = block.closest('article') || block;
                
                // --- 关键修正：跳转后距离顶部高度修改为 10 ---
                const topOffset = targetNode.offsetTop - 10;

                scrollTarget.scrollTo({ top: topOffset, behavior: 'smooth' });
                setTimeout(() => { isInternalScrolling = false; }, 1000);
            });

            mapItem.addEventListener('mouseenter', () => {
                const rect = mapItem.getBoundingClientRect();
                const roleName = isUser ? "YOU" : "GPT";
                
                previewCard.innerHTML = `<strong style="display:block; margin-bottom:5px;">${roleName}:</strong><div>${cleanText.substring(0, 250)}${cleanText.length > 250 ? '...' : ''}</div>`;
                previewCard.style.borderLeftColor = isUser ? '#4285f4' : '#10a37f';
                
                let topPos = rect.top - 10;
                if (topPos + previewCard.offsetHeight > window.innerHeight) {
                    topPos = window.innerHeight - previewCard.offsetHeight - 20;
                }
                previewCard.style.top = `${Math.max(10, topPos)}px`;
                previewCard.style.display = 'block';
            });

            mapItem.addEventListener('mouseleave', () => {
                previewCard.style.display = 'none';
            });

            minimap.appendChild(mapItem);
        });
        syncIndicator();
    };

    const scrollContainer = getScrollContainer();
    const eventTarget = scrollContainer === window ? window : scrollContainer;
    eventTarget.addEventListener('scroll', syncIndicator, { passive: true });

    const observer = new MutationObserver(() => {
        clearTimeout(window.refreshTimer);
        window.refreshTimer = setTimeout(updateMinimap, 1000);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(updateMinimap, 1500);
    setTimeout(updateMinimap, 4000); 
}

function syncIndicator() {
    const indicator = document.getElementById('minimap-viewport-indicator');
    const minimap = document.getElementById('chatgpt-minimap-container');
    if (!indicator || !minimap) return;

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const centerElement = document.elementFromPoint(centerX, centerY);
    const currentBlock = centerElement?.closest('div[data-message-author-role]');

    if (currentBlock) {
        const allBlocks = Array.from(document.querySelectorAll('main div[data-message-author-role]'));
        const currentIndex = allBlocks.indexOf(currentBlock);
        const items = minimap.querySelectorAll('.minimap-item');

        if (items[currentIndex]) {
            let startIndex = currentIndex;
            let endIndex = currentIndex;
            const role = currentBlock.getAttribute('data-message-author-role');
            
            if (role === 'user') {
                if (items[currentIndex + 1] && allBlocks[currentIndex + 1].getAttribute('data-message-author-role') === 'assistant') {
                    endIndex = currentIndex + 1;
                }
            } else {
                if (items[currentIndex - 1] && allBlocks[currentIndex - 1].getAttribute('data-message-author-role') === 'user') {
                    startIndex = currentIndex - 1;
                }
            }

            const startItem = items[startIndex];
            const endItem = items[endIndex];

            // --- 修改位置：定义统一间隙变量 ---
            const gap = 2; // 你可以修改这个数字（如 1 或 3）来调整间隙大小

            // 计算顶部：起始色块的 offsetTop 减去间隙
            const topPos = startItem.offsetTop - gap;
            
            // 计算高度：(结束色块底部 - 起始色块顶部) + 两倍间隙（上下各一个）
            const totalHeight = (endItem.offsetTop + endItem.offsetHeight) - startItem.offsetTop + (gap * 2);
            
            indicator.style.top = `${topPos}px`;
            indicator.style.height = `${totalHeight}px`;
            indicator.style.opacity = "1";
            return;
        }
    }
    indicator.style.opacity = "0.3"; 
}

window.addEventListener('load', initMinimap);
setInterval(() => {
    if (!document.getElementById('chatgpt-minimap-container')) initMinimap();
}, 3000);
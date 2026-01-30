// 全局缓存与状态变量 (保持不变)
window.chatgptMinimapCache = window.chatgptMinimapCache || new Map();
window.lastMinimapUrl = window.lastMinimapUrl || "";
window.hasAutoScrolledToTop = false;

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

    // --- 1. 缓存收割机 ---
    const harvestContent = () => {
        const blocks = document.querySelectorAll('main div[data-message-author-role]');
        blocks.forEach((block, index) => {
            const id = block.getAttribute('data-message-id') || `msg-index-${index}`;
            if (window.chatgptMinimapCache.has(id)) return;

            let text = "";
            const contentNode = block.querySelector('.markdown, .whitespace-pre-wrap');
            if (contentNode) text = contentNode.innerText;
            if (!text || text.trim().length === 0) text = block.innerText || "";

            if (text && text.trim().length > 0) {
                window.chatgptMinimapCache.set(id, text);
            }
        });
    };

    const getScrollContainer = () => {
        return document.querySelector('div.not-print\\:overflow-y-auto') || 
               document.querySelector('main')?.parentElement || 
               window;
    };

    // --- 2. 自动滚动 ---
    const triggerAutoScroll = () => {
        if (window.hasAutoScrolledToTop) return;
        
        const scrollContainer = getScrollContainer();
        const scrollTarget = scrollContainer === window ? window : scrollContainer;
        const messageBlocks = document.querySelectorAll('main div[data-message-author-role]');

        if (messageBlocks.length === 0) {
            setTimeout(triggerAutoScroll, 1000);
            return;
        }

        if (scrollContainer.scrollHeight > scrollContainer.clientHeight + 100) {
            window.hasAutoScrolledToTop = true;
            scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
            
            setTimeout(harvestContent, 500);
            setTimeout(harvestContent, 1000);
            setTimeout(harvestContent, 2000); 
        } else {
            window.hasAutoScrolledToTop = true;
            harvestContent();
        }
    };

    const updateMinimap = () => {
        harvestContent(); 

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

        messageBlocks.forEach((block, index) => {
            const role = block.getAttribute('data-message-author-role');
            const isUser = role === 'user';
            const id = block.getAttribute('data-message-id') || `msg-index-${index}`;
            
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
                
                // --- 3. 关键修改：区分角色的跳转偏移量 ---
                // isUser ? 0 : 10 
                // 如果是用户问题，不留任何顶部空隙 (0)，确保把上面的 AI 回答彻底挤出视口检测区
                // 如果是 AI 回答，保留 10px 空隙，视觉上不那么局促
                const offsetBuffer = isUser ? 0 : 10;
                const topOffset = targetNode.offsetTop - offsetBuffer;

                scrollTarget.scrollTo({ top: topOffset, behavior: 'smooth' });
                setTimeout(() => { isInternalScrolling = false; }, 1000);
            });

            mapItem.addEventListener('mouseenter', () => {
                const rect = mapItem.getBoundingClientRect();
                const roleName = isUser ? "YOU" : "GPT";
                
                let cleanText = "";
                if (window.chatgptMinimapCache.has(id)) {
                    cleanText = window.chatgptMinimapCache.get(id);
                } else {
                    const domText = block.innerText || "";
                    if (domText.trim().length > 0) {
                        cleanText = domText;
                        window.chatgptMinimapCache.set(id, cleanText); 
                    } else {
                        cleanText = "(需滚动加载)";
                    }
                }
                
                cleanText = cleanText.replace(/\s+/g, ' ').trim();
                const previewText = cleanText.length > 250 ? cleanText.substring(0, 250) + '...' : cleanText;
                
                previewCard.innerHTML = `<strong style="display:block; margin-bottom:5px;">${roleName}:</strong><div>${previewText}</div>`;
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
        
        setTimeout(triggerAutoScroll, 2000);
    };

    const scrollContainer = getScrollContainer();
    const eventTarget = scrollContainer === window ? window : scrollContainer;
    
    eventTarget.addEventListener('scroll', () => {
        syncIndicator();
        if (!window.harvestTimer) {
            window.harvestTimer = setTimeout(() => {
                harvestContent();
                window.harvestTimer = null;
            }, 300);
        }
    }, { passive: true });

    const observer = new MutationObserver(() => {
        clearTimeout(window.refreshTimer);
        window.refreshTimer = setTimeout(updateMinimap, 1000);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(updateMinimap, 1500);
}

// --- 4. 自适应 Indicator (保持之前的完美算法) ---
function syncIndicator() {
    const indicator = document.getElementById('minimap-viewport-indicator');
    const minimap = document.getElementById('chatgpt-minimap-container');
    if (!indicator || !minimap) return;

    const allBlocks = Array.from(document.querySelectorAll('main div[data-message-author-role]'));
    const items = minimap.querySelectorAll('.minimap-item');

    if (allBlocks.length === 0 || items.length === 0) {
        indicator.style.opacity = "0";
        return;
    }

    let startIndex = -1;
    let endIndex = -1;
    const viewportHeight = window.innerHeight;

    for (let i = 0; i < allBlocks.length; i++) {
        const rect = allBlocks[i].getBoundingClientRect();
        // 这里的阈值 10px 配合上面的 offsetBuffer=0 使用效果最佳
        const isVisible = rect.bottom > 10 && rect.top < viewportHeight - 10;

        if (isVisible) {
            if (startIndex === -1) startIndex = i; 
            endIndex = i; 
        } else if (startIndex !== -1 && rect.top >= viewportHeight) {
            break;
        }
    }

    if (startIndex !== -1 && endIndex !== -1) {
        const startItem = items[startIndex];
        const endItem = items[endIndex];

        if (startItem && endItem) {
            const gap = 2; 
            const topPos = startItem.offsetTop - gap;
            const bottomPos = endItem.offsetTop + endItem.offsetHeight + gap;
            const totalHeight = bottomPos - topPos;

            indicator.style.top = `${topPos}px`;
            indicator.style.height = `${totalHeight}px`;
            indicator.style.opacity = "1";
        }
    } else {
        indicator.style.opacity = "0";
    }
}

window.addEventListener('load', initMinimap);

setInterval(() => {
    const currentUrl = window.location.href;
    if (window.lastMinimapUrl !== currentUrl) {
        window.lastMinimapUrl = currentUrl;
        window.chatgptMinimapCache.clear();
        window.hasAutoScrolledToTop = false;
        
        const existingMinimap = document.getElementById('chatgpt-minimap-container');
        if (existingMinimap) existingMinimap.remove();
    }

    if (!document.getElementById('chatgpt-minimap-container')) {
        initMinimap();
    }
}, 1000);
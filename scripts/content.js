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
                const topOffset = targetNode.offsetTop - 10;

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
    
    // 滚动监听
    eventTarget.addEventListener('scroll', () => {
        syncIndicator();
        
        // 简单节流：减少 harvesting 频率，提升滚动性能
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

// --- 3. 核心修改：自适应视口范围的 Indicator ---
function syncIndicator() {
    const indicator = document.getElementById('minimap-viewport-indicator');
    const minimap = document.getElementById('chatgpt-minimap-container');
    if (!indicator || !minimap) return;

    // 获取所有对话块
    const allBlocks = Array.from(document.querySelectorAll('main div[data-message-author-role]'));
    const items = minimap.querySelectorAll('.minimap-item');

    if (allBlocks.length === 0 || items.length === 0) {
        indicator.style.opacity = "0";
        return;
    }

    let startIndex = -1;
    let endIndex = -1;
    const viewportHeight = window.innerHeight;

    // 遍历寻找视口内的第一个和最后一个元素
    for (let i = 0; i < allBlocks.length; i++) {
        const rect = allBlocks[i].getBoundingClientRect();
        
        // 判断元素是否在视口内（哪怕只有一部分）
        // buffer: 10px 的缓冲，避免边缘闪烁
        const isVisible = rect.bottom > 10 && rect.top < viewportHeight - 10;

        if (isVisible) {
            if (startIndex === -1) startIndex = i; // 记录第一个见到的
            endIndex = i; // 不断更新最后一个见到的
        } else if (startIndex !== -1 && rect.top >= viewportHeight) {
            // 优化：既然已经找到过 Start，且现在的元素已经在屏幕下面了，
            // 说明后面的元素肯定都在下面，直接停止循环
            break;
        }
    }

    if (startIndex !== -1 && endIndex !== -1) {
        const startItem = items[startIndex];
        const endItem = items[endIndex];

        if (startItem && endItem) {
            const gap = 2; // 间隙

            // 计算 Start 块的顶部
            const topPos = startItem.offsetTop - gap;
            
            // 计算 End 块的底部 (Top + Height)
            const bottomPos = endItem.offsetTop + endItem.offsetHeight + gap;
            
            // 总高度 = 底部 - 顶部
            const totalHeight = bottomPos - topPos;

            indicator.style.top = `${topPos}px`;
            indicator.style.height = `${totalHeight}px`;
            indicator.style.opacity = "1";
        }
    } else {
        indicator.style.opacity = "0";
    }
}

// 心跳检测与初始化
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
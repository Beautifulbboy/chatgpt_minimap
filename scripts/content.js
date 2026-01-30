// 全局缓存，用于存储 "messageID -> 文本内容" 的映射
// 放在函数外部，防止 initMinimap 重复执行时被清空
window.chatgptMinimapCache = window.chatgptMinimapCache || new Map();
window.lastMinimapUrl = window.lastMinimapUrl || "";

function initMinimap() {
    if (document.getElementById('chatgpt-minimap-container')) return;

    // --- 1. 检测 URL 变化，重置缓存和状态 ---
    // 每次切换对话，清空缓存，准备重新抓取
    if (window.lastMinimapUrl !== window.location.href) {
        window.chatgptMinimapCache.clear();
        window.lastMinimapUrl = window.location.href;
        window.hasAutoScrolledToTop = false; // 重置自动滚动标记
    }

    const minimap = document.createElement('div');
    minimap.id = 'chatgpt-minimap-container';
    document.body.appendChild(minimap);

    const previewCard = document.createElement('div');
    previewCard.id = 'chatgpt-minimap-preview';
    document.body.appendChild(previewCard);

    let lastMessageCount = 0;
    let isInternalScrolling = false;

    // --- 2. 缓存收割机 (Harvest Logic) ---
    // 这个函数负责从当前的 DOM 中提取所有可见的文字，并存入缓存
    const harvestContent = () => {
        const blocks = document.querySelectorAll('main div[data-message-author-role]');
        blocks.forEach((block, index) => {
            // 尝试获取唯一 ID，如果没有 ID 则使用索引作为兜底 (不太推荐，但能用)
            const id = block.getAttribute('data-message-id') || `msg-index-${index}`;
            
            // 如果缓存里已经有了，就不用重复提取了 (性能优化)
            if (window.chatgptMinimapCache.has(id)) return;

            // 提取文字逻辑 (复用之前的增强版逻辑)
            let text = "";
            const contentNode = block.querySelector('.markdown, .whitespace-pre-wrap');
            if (contentNode) text = contentNode.innerText;
            if (!text || text.trim().length === 0) text = block.innerText || "";

            // 只有当提取到了有效文字，才存入缓存
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

    // --- 3. 自动滚动逻辑 ---
    // 页面加载后，尝试自动滚动到顶部以触发旧消息渲染
    const triggerAutoScroll = () => {
        if (window.hasAutoScrolledToTop) return;
        
        const scrollContainer = getScrollContainer();
        const scrollTarget = scrollContainer === window ? window : scrollContainer;

        // 只有当确实有滚动条时才触发
        if (scrollContainer.scrollHeight > scrollContainer.clientHeight + 100) {
            // 标记已执行
            window.hasAutoScrolledToTop = true;
            
            console.log('Minimap: Auto-scrolling to top to fetch history...');
            
            // 平滑滚动到顶部
            scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
            
            // 滚动到顶部后，收割一次；延迟一点再收割一次（等待渲染）
            setTimeout(harvestContent, 500);
            setTimeout(harvestContent, 1000);
            setTimeout(harvestContent, 2000); // 多次收割确保万无一失
        }
    };

    const updateMinimap = () => {
        // 每次更新前，先收割一波当前屏幕上的文字
        harvestContent();

        const messageBlocks = document.querySelectorAll('main div[data-message-author-role]');
        const minimapContainer = document.getElementById('chatgpt-minimap-container');
        
        // 如果数量没变且 Minimap 已经存在，就不重建 DOM，但记得触发一次收割
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
                
                // --- 4. 预览逻辑升级：优先查缓存 ---
                let cleanText = "";
                
                // A. 先看缓存里有没有这个 ID 的数据
                if (window.chatgptMinimapCache.has(id)) {
                    cleanText = window.chatgptMinimapCache.get(id);
                } else {
                    // B. 缓存没有（可能是新生成的），尝试从 DOM 现抓
                    const domText = block.innerText || "";
                    if (domText.trim().length > 0) {
                        cleanText = domText;
                        // 顺手存入缓存
                        window.chatgptMinimapCache.set(id, cleanText); 
                    } else {
                        // C. 都没有，说明被虚拟化了且还没浏览过
                        cleanText = "(内容未加载，请滚动至该位置)";
                    }
                }
                
                // 简单的文本清理
                cleanText = cleanText.replace(/\s+/g, ' ').trim();
                
                // 截断
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
        
        // 尝试触发自动滚动（仅在第一次且页面够长时触发）
        setTimeout(triggerAutoScroll, 2000);
    };

    const scrollContainer = getScrollContainer();
    const eventTarget = scrollContainer === window ? window : scrollContainer;
    
    // 滚动时也触发收割，这样用户手动浏览过的区域也会被缓存
    eventTarget.addEventListener('scroll', () => {
        syncIndicator();
        harvestContent(); // <--- 关键：滚动时疯狂收割
    }, { passive: true });

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
            const gap = 2; 

            const topPos = startItem.offsetTop - gap;
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
    // 定期检查 URL 变化，用于处理 SPA 页面跳转
    if (window.lastMinimapUrl && window.lastMinimapUrl !== window.location.href) {
        initMinimap(); 
    }
    if (!document.getElementById('chatgpt-minimap-container')) initMinimap();
}, 3000);
// 全局缓存与状态变量
window.chatgptMinimapCache = window.chatgptMinimapCache || new Map();
window.lastMinimapUrl = window.lastMinimapUrl || "";
window.hasAutoScrolledToTop = false; // 确保这个标志位是全局的

function initMinimap() {
    // 如果容器存在，说明已经初始化过，直接返回
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

    // --- 2. 增强版自动滚动 (智能等待) ---
    const triggerAutoScroll = () => {
        if (window.hasAutoScrolledToTop) return;
        
        const scrollContainer = getScrollContainer();
        const scrollTarget = scrollContainer === window ? window : scrollContainer;
        const messageBlocks = document.querySelectorAll('main div[data-message-author-role]');

        // 关键优化：如果页面上还没刷出消息（可能是切换对话后的加载间隙），就不要滚，等一会再试
        if (messageBlocks.length === 0) {
            // console.log('Minimap: Waiting for content to load...');
            setTimeout(triggerAutoScroll, 1000);
            return;
        }

        // 只有当确实有滚动条时才触发
        if (scrollContainer.scrollHeight > scrollContainer.clientHeight + 100) {
            window.hasAutoScrolledToTop = true; // 上锁，防止反复触发
            
            // console.log('Minimap: Auto-scrolling to top to fetch history...');
            scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
            
            // 滚动过程中多次收割，确保抓到所有文字
            setTimeout(harvestContent, 500);
            setTimeout(harvestContent, 1000);
            setTimeout(harvestContent, 2000); 
        } else {
            // 如果内容很短不需要滚动，但也标记为已完成，避免死循环
            // 同时收割一次当前内容
            window.hasAutoScrolledToTop = true;
            harvestContent();
        }
    };

    const updateMinimap = () => {
        harvestContent(); // 每次重绘前都收割

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
                // 优先查缓存
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
        
        // 尝试触发自动滚动（带延迟，给页面加载留时间）
        setTimeout(triggerAutoScroll, 2000);
    };

    const scrollContainer = getScrollContainer();
    const eventTarget = scrollContainer === window ? window : scrollContainer;
    
    eventTarget.addEventListener('scroll', () => {
        syncIndicator();
        harvestContent();
    }, { passive: true });

    const observer = new MutationObserver(() => {
        clearTimeout(window.refreshTimer);
        window.refreshTimer = setTimeout(updateMinimap, 1000);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(updateMinimap, 1500);
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

// --- 3. 核心心跳检测：处理 URL 切换 ---
window.addEventListener('load', initMinimap);

setInterval(() => {
    const currentUrl = window.location.href;
    
    // 如果发现 URL 变了（说明用户切换了对话）
    if (window.lastMinimapUrl !== currentUrl) {
        // 1. 更新 URL 记录
        window.lastMinimapUrl = currentUrl;
        
        // 2. 清空旧对话的缓存
        window.chatgptMinimapCache.clear();
        
        // 3. 重置滚动锁，允许新对话再次触发滚动
        window.hasAutoScrolledToTop = false;
        
        // 4. 【关键】移除旧的 Minimap DOM
        // 这样做的目的是强行让 initMinimap() 里的逻辑重新跑一遍
        // 包括重新绑定 Observer，重新触发 setTimeout(triggerAutoScroll)
        const existingMinimap = document.getElementById('chatgpt-minimap-container');
        if (existingMinimap) existingMinimap.remove();
    }

    // 如果 DOM 被移除了（上面那步做的），或者页面刚加载，initMinimap 就会执行
    if (!document.getElementById('chatgpt-minimap-container')) {
        initMinimap();
    }
}, 1000); // 每秒检查一次，响应更灵敏
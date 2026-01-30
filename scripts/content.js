// 全局缓存与状态变量
window.chatgptMinimapCache = window.chatgptMinimapCache || new Map();
window.lastMinimapUrl = window.lastMinimapUrl || "";
window.hasAutoScrolledToTop = false;

const STORAGE_KEY_STAY_TOP = 'chatgpt_minimap_stay_top';

function initMinimap() {
    if (document.getElementById('chatgpt-minimap-container')) return;

    // --- 1. DOM 结构 ---
    const minimap = document.createElement('div');
    minimap.id = 'chatgpt-minimap-container';
    
    // 滚动包装层
    const scrollWrapper = document.createElement('div');
    scrollWrapper.id = 'chatgpt-minimap-scroll-wrapper';
    minimap.appendChild(scrollWrapper);

    const previewCard = document.createElement('div');
    previewCard.id = 'chatgpt-minimap-preview';
    document.body.appendChild(previewCard);

    let lastMessageCount = 0;
    let isInternalScrolling = false;

    // --- 2. 底部开关 ---
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'minimap-toggle-container';
    
    const renderToggle = () => {
        const isStayTop = localStorage.getItem(STORAGE_KEY_STAY_TOP) === 'true';
        if (isStayTop) toggleContainer.classList.add('minimap-toggle-active');
        else toggleContainer.classList.remove('minimap-toggle-active');

        toggleContainer.title = isStayTop 
            ? "当前：加载后停留在顶部 (点击切换)" 
            : "当前：加载后滚回底部 (点击切换)";

        toggleContainer.innerHTML = `
            <div class="minimap-toggle-icon">
                ${isStayTop ? '滚至顶部' : '保持底部'}
            </div>
        `;
    };
    renderToggle();

    toggleContainer.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentState = localStorage.getItem(STORAGE_KEY_STAY_TOP) === 'true';
        localStorage.setItem(STORAGE_KEY_STAY_TOP, !currentState);
        
        if (!currentState) toggleContainer.classList.add('minimap-toggle-active');
        else toggleContainer.classList.remove('minimap-toggle-active');
        
        renderToggle();
    });

    minimap.appendChild(toggleContainer);
    document.body.appendChild(minimap);

    // --- 3. 核心逻辑 ---
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

            setTimeout(() => {
                const stayTop = localStorage.getItem(STORAGE_KEY_STAY_TOP) === 'true';
                if (!stayTop) {
                    scrollTarget.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
                }
            }, 2500);
        } else {
            window.hasAutoScrolledToTop = true;
            harvestContent();
        }
    };

    const updateMinimap = () => {
        harvestContent(); 

        const messageBlocks = document.querySelectorAll('main div[data-message-author-role]');
        const scrollWrapper = document.getElementById('chatgpt-minimap-scroll-wrapper');
        if (!scrollWrapper) return;

        if (messageBlocks.length === lastMessageCount && scrollWrapper.children.length > 1) {
            return;
        }
        
        lastMessageCount = messageBlocks.length;
        scrollWrapper.innerHTML = ''; 

        const indicator = document.createElement('div');
        indicator.id = 'minimap-viewport-indicator';
        scrollWrapper.appendChild(indicator);

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

            scrollWrapper.appendChild(mapItem);
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

// --- 4. 关键修改：Minimap 自动跟随逻辑 ---
function syncIndicator() {
    const indicator = document.getElementById('minimap-viewport-indicator');
    const scrollWrapper = document.getElementById('chatgpt-minimap-scroll-wrapper');
    if (!indicator || !scrollWrapper) return;

    const allBlocks = Array.from(document.querySelectorAll('main div[data-message-author-role]'));
    const items = scrollWrapper.querySelectorAll('.minimap-item');

    if (allBlocks.length === 0 || items.length === 0) {
        indicator.style.opacity = "0";
        return;
    }

    let startIndex = -1;
    let endIndex = -1;
    const viewportHeight = window.innerHeight;

    for (let i = 0; i < allBlocks.length; i++) {
        const rect = allBlocks[i].getBoundingClientRect();
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
            
            // 计算 Indicator 在 Wrapper 内部的绝对位置 (offsetTop 是相对于父级 relative 的距离)
            const topPos = startItem.offsetTop - gap;
            const bottomPos = endItem.offsetTop + endItem.offsetHeight + gap;
            const totalHeight = bottomPos - topPos;

            // 设置 Indicator 样式
            indicator.style.top = `${topPos}px`;
            indicator.style.height = `${totalHeight}px`;
            indicator.style.opacity = "1";

            // --- 新增：自动滚动 Minimap 容器 ---
            // 获取当前容器已经滚动了多少
            const currentScrollTop = scrollWrapper.scrollTop;
            const wrapperHeight = scrollWrapper.clientHeight;
            const currentScrollBottom = currentScrollTop + wrapperHeight;

            // 如果 Indicator 的顶部跑到了容器可视区域上方 -> 向上滚
            if (topPos < currentScrollTop) {
                scrollWrapper.scrollTo({ 
                    top: topPos - 20, // 留一点 padding
                    behavior: 'smooth' 
                });
            } 
            // 如果 Indicator 的底部跑到了容器可视区域下方 -> 向下滚
            else if (bottomPos > currentScrollBottom) {
                scrollWrapper.scrollTo({ 
                    top: bottomPos - wrapperHeight + 20, // 滚到让底部刚好露出来，并留 padding
                    behavior: 'smooth' 
                });
            }
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
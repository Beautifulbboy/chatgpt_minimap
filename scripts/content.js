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

    // --- 🕵️‍♂️ 核心升级：全能型数据搜索函数 ---
    // 不再假设数据一定在 props.message 里，而是遍历 props 的所有属性去寻找
    const extractTextFromObject = (obj, depth = 0) => {
        if (!obj || depth > 3) return null; // 防止死循环，只搜3层深度

        // 1. 标准特征：content.parts (最常见)
        if (obj.content && Array.isArray(obj.content.parts)) {
            return obj.content.parts.join('\n');
        }
        
        // 2. 变体特征：直接是 parts 数组
        if (Array.isArray(obj.parts) && obj.parts.length > 0 && typeof obj.parts[0] === 'string') {
            return obj.parts.join('\n');
        }

        // 3. 深度遍历：如果当前对象里还有子对象（比如 message, turn, result），继续挖
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (val && typeof val === 'object') {
                // 如果属性名看起来很像存数据的，优先搜索
                if (['message', 'turn', 'payload', 'result', 'item'].includes(key)) {
                    const found = extractTextFromObject(val, depth + 1);
                    if (found) return found;
                }
            }
        }
        return null;
    };

    const getReactMessageContent = (domNode) => {
        try {
            const fiberKey = Object.keys(domNode).find(key => key.startsWith('__reactFiber$'));
            if (!fiberKey) return null;

            let fiber = domNode[fiberKey];
            
            // 向上遍历 20 层 Fiber 节点
            for (let i = 0; i < 20; i++) {
                if (!fiber) break;
                const props = fiber.memoizedProps;
                
                if (props) {
                    // 使用上面的全能搜索函数扫描 Props
                    const text = extractTextFromObject(props);
                    if (text) return text;
                }
                
                fiber = fiber.return;
            }
        } catch (e) {
            console.error('Minimap: Error reading React state', e);
        }
        return null;
    };

    // --- 🛠️ 增强版 DOM 提取 ---
    const getDomText = (block) => {
        // 尝试获取 .markdown (GPT) 或 .whitespace-pre-wrap (用户)
        const contentNode = block.querySelector('.markdown, .whitespace-pre-wrap');
        
        let text = "";
        if (contentNode) {
            text = contentNode.innerText;
        }
        
        // 关键修正：如果特定容器取不到字（比如代码块导致的结构变化），
        // 或者取到的字是空的，立刻降级使用最外层的 block.innerText
        if (!text || text.trim().length === 0) {
            text = block.innerText;
        }
        
        return text;
    };

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
                const domText = getDomText(block) || "";
                
                // 1. 优先 DOM：只要有非空字符，就认为 DOM 是可用的
                if (domText.trim().length > 0) {
                    cleanText = domText.replace(/\s+/g, ' ').trim();
                } else {
                    // 2. DOM 彻底失效（虚拟化），启用全能 React 搜索
                    const reactText = getReactMessageContent(block);
                    if (reactText) {
                        cleanText = reactText.replace(/\s+/g, ' ').trim();
                    } else {
                        cleanText = "(暂无预览内容)";
                    }
                }
                
                // 截断过长文本
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
    if (!document.getElementById('chatgpt-minimap-container')) initMinimap();
}, 3000);
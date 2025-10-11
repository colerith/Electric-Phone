document.addEventListener('DOMContentLoaded', () => {
    // ----- State & Elements -----
    const getEl = (id) => document.getElementById(id);
    let userAvatar, charAvatar, currentContextElement = null;
    const defaultWallpapers = [ 'https://files.catbox.moe/pkzrrf.jpg', 'https://i.postimg.cc/Kv8wSVBn/407-ins-5.jpg', 'https://i.postimg.cc/1XrQCqxm/ins-3.jpg' ];
    const defaultStickers = [
        { name: '抱抱', url: 'https://files.catbox.moe/5hyddg.jpg' }, { name: '爆炸', url: 'https://files.catbox.moe/lxe357.jpg' },
        { name: '盯', url: 'https://files.catbox.moe/lg6cno.jpg' }, { name: '过来', url: 'https://files.catbox.moe/ba2aer.jpg' },
        { name: '很不高兴为你服务', url: 'https://files.catbox.moe/47381g.jpg' }, { name: '很好笑吗', url: 'https://files.catbox.moe/51mtbk.jpg' },
        { name: '看着我', url: 'https://files.catbox.moe/9xxuj8.jpg' }, { name: '麦当劳', url: 'https://files.catbox.moe/yhe94i.jpg' },
        { name: '麦当劳暴击', url: 'https://files.catbox.moe/i7504c.jpg' }, { name: '杀了你', url: 'https://files.catbox.moe/7x4qnb.jpg' },
        { name: '深情', url: 'https://files.catbox.moe/johv2y.jpg' }, { name: '神经', url: 'https://files.catbox.moe/0eji3r.jpg' },
        { name: '帅气', url: 'https://files.catbox.moe/fqpxa5.jpg' }, { name: '舔舔', url: 'https://files.catbox.moe/xitflm.jpg' },
        { name: '我要吃麦当劳', url: 'https://files.catbox.moe/8kslkh.jpg' }, { name: '我又要吃麦当劳', url: 'https://files.catbox.moe/p86a6n.jpg' },
        { name: '想都别想', url: 'https://files.catbox.moe/qru0jx.jpg' }, { name: '一切在我掌控之中', url: 'https://files.catbox.moe/4ck13y.jpg' },
        { name: '找揍', url: 'https://files.catbox.moe/pzvfny.jpg' }, { name: '重拳出击', url: 'https://files.catbox.moe/0wd95s.jpg' },
        { name: '?', url: 'https://files.catbox.moe/8zbzse.jpg' }
    ];
    let chatContent, textarea, sendBtn, settingsBtn, plusBtn, plusMenu, stickerMenu, voiceBtn, contextMenu, clickSound, pokeSound;
    
    // ----- REFACTORED: 音乐播放器的核心状态对象 -----
    const musicState = {
        playlist: [],
        currentIndex: -1,
        isPlaying: false,
        listenStartTime: null,
        listenInterval: null
    };

    let userMessageCache = [];

    // ----- 一起听核心功能 -----
    function updatePlayerUI() {
        const playPauseIcon = getEl('playPauseIcon');
        const songCoverArt = getEl('songCoverArt');
        if (musicState.currentIndex === -1 || musicState.playlist.length === 0) {
            getEl('songTitle').textContent = '暂无歌曲';
            getEl('songArtist').textContent = '请添加歌曲';
            songCoverArt.style.backgroundImage = "url('https://files.catbox.moe/m72cdd.png')";
            songCoverArt.style.backgroundSize = '50%';
            playPauseIcon.setAttribute('d', 'M8 5v14l11-7z');
        } else {
            const song = musicState.playlist[musicState.currentIndex];
            getEl('songTitle').textContent = song.title;
            getEl('songArtist').textContent = song.artist;
            songCoverArt.style.backgroundImage = `url('${song.cover || 'https://files.catbox.moe/m72cdd.png'}')`;
            songCoverArt.style.backgroundSize = 'cover';
        }
        songCoverArt.style.backgroundRepeat = 'no-repeat';
        
        if (musicState.isPlaying) {
            playPauseIcon.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z'); // 暂停图标
        } else {
            playPauseIcon.setAttribute('d', 'M8 5v14l11-7z'); // 播放图标
        }
        renderPlaylist();
    }

    function renderPlaylist() {
        const playlistUI = getEl('playlistUI');
        playlistUI.innerHTML = '';
        musicState.playlist.forEach((song, index) => {
            const li = document.createElement('li');
            li.className = 'playlist-item';
            if (index === musicState.currentIndex) { li.classList.add('active'); }
            li.innerHTML = `<div class="playlist-item-index">${index + 1}</div><div class="playlist-item-info"><div class="playlist-item-title">${song.title}</div><div class="playlist-item-artist">${song.artist}</div></div><button class="playlist-item-delete-btn" data-index="${index}">&times;</button>`;
            li.querySelector('.playlist-item-info').onclick = () => playSong(index);
            playlistUI.appendChild(li);
        });
    }

    // ----- 播放指定歌曲  -----
    function playSong(index) {
        console.log(`[playSong] 尝试播放歌曲，索引: ${index}`);

        if (index < 0 || index >= musicState.playlist.length) {
            console.warn(`[playSong] 索引无效或播放列表为空。`);
            return;
        }

        const lastTrack = musicState.playlist[musicState.currentIndex];
        if (lastTrack && lastTrack.isLocalFile && musicPlayer.src.startsWith('blob:')) {
            console.log(`[playSong] 正在释放上一个 Blob URL: ${musicPlayer.src}`);
            URL.revokeObjectURL(musicPlayer.src);
        }

        musicState.currentIndex = index;
        const track = musicState.playlist[musicState.currentIndex];
        console.log('[playSong] 当前轨道信息:', track);

        try {
            if (track.isLocalFile && track.src instanceof File) {
                musicPlayer.src = URL.createObjectURL(track.src);
                console.log(`[playSong] 创建了新的 Blob URL: ${musicPlayer.src}`);
            } else {
                musicPlayer.src = track.src;
                console.log(`[playSong] 设置了网络 URL: ${musicPlayer.src}`);
            }
        } catch (error) {
            console.error('[playSong] 设置 musicPlayer.src 时发生严重错误:', error);
            return;
        }
        
        updatePlayerUI();
        
        console.log('[playSong] 准备调用 .play() 方法...');
        const playPromise = musicPlayer.play();

        if (playPromise !== undefined) {
            playPromise.then(_ => {
                console.log('[playSong] .play() 方法成功执行！音频应该正在播放。');
            }).catch(error => {
                console.error('[playSong] .play() 方法失败！这是一个关键错误！', error);
                alert(`音频播放失败！\n\n错误: ${error.name}\n\n请尝试先点击一下页面任意位置，然后再点击播放按钮。`);
            });
        }
    }

    function togglePlayPause() {
        if (musicPlayer.paused) {
            if (musicState.currentIndex === -1 && musicState.playlist.length > 0) {
                playSong(0); // 首次播放
            } else if (musicState.currentIndex > -1) {
                musicPlayer.play(); // 继续播放
            }
        } else {
            musicPlayer.pause();
        }
    }
    
    function playNext() {
        if (musicState.playlist.length === 0) return;
        let nextIndex = (musicState.currentIndex + 1) % musicState.playlist.length;
        playSong(nextIndex);
    }
    
    function playPrev() {
        if (musicState.playlist.length === 0) return;
        const newIndex = (musicState.currentIndex - 1 + musicState.playlist.length) % musicState.playlist.length;
        playSong(newIndex);
    }

    function deleteSong(indexToDelete) {
        if (indexToDelete < 0 || indexToDelete >= musicState.playlist.length) return;
        const trackToDelete = musicState.playlist[indexToDelete];
        const isDeletingCurrent = indexToDelete === musicState.currentIndex;
        if (isDeletingCurrent && trackToDelete.isLocalFile && musicPlayer.src.startsWith('blob:')) {
            URL.revokeObjectURL(musicPlayer.src);
        }
        musicState.playlist.splice(indexToDelete, 1);
        if (isDeletingCurrent) {
            musicPlayer.pause();
            musicPlayer.src = '';
            if (musicState.playlist.length > 0) {
                const nextIndex = indexToDelete >= musicState.playlist.length ? 0 : indexToDelete;
                // 只设置下一首，但不自动播放
                musicState.currentIndex = nextIndex;
                const nextTrack = musicState.playlist[nextIndex];
                 if (nextTrack.isLocalFile) musicPlayer.src = URL.createObjectURL(nextTrack.src); else musicPlayer.src = nextTrack.src;
            } else {
                musicState.currentIndex = -1;
            }
        } else if (indexToDelete < musicState.currentIndex) {
            musicState.currentIndex--;
        }
        updatePlayerUI();
    }
    
    // 更新计时器
    function updateListenTimer() {
        if (!listenStartTime) return;
        const now = Date.now();
        const elapsedMs = now - listenStartTime;
        const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
        const minutes = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
        getEl('listenTimer').textContent = `${hours}小时 ${minutes}分钟`;
    }

    // 开始一起听
    function startListenTogether() {
        isListening = true;
        listenStartTime = Date.now();
        listenInterval = setInterval(updateListenTimer, 1000 * 30); // 每30秒更新一次
        updateListenTimer();
        
        getEl('listenCharAvatar').src = charAvatar;
        getEl('listenUserAvatar').src = userAvatar;

        updatePlayerUI();
        toggleModal('listenTogetherModal', true);
    }
    
    // 退出一起听
    function stopListenTogether() {
        musicPlayer.pause();
        if (musicPlayer.src.startsWith('blob:')) { URL.revokeObjectURL(musicPlayer.src); }
        musicPlayer.src = '';

        if (listenInterval) { clearInterval(listenInterval); listenInterval = null; }
        if (listenStartTime) { const elapsedMs = Date.now() - listenStartTime; localStorage.setItem('lastListenDuration', elapsedMs); }
        listenStartTime = null;
        toggleModal('listenTogetherModal', false);
    }

    // ----- Audio Injection and Handling -----
    function setupAudio() {
        document.body.insertAdjacentHTML('beforeend', `
            <audio id="click-sound" src="https://files.catbox.moe/x35kz3.wav" preload="auto"></audio>
            <audio id="poke-sound" src="https://files.catbox.moe/jwy082.wav" preload="auto"></audio>
            <audio id="receive-sound" src="https://files.catbox.moe/em648t.mp3" preload="auto"></audio>
            <audio id="send-sound" src="https://files.catbox.moe/ty9qhe.mp3" preload="auto"></audio>
            <audio id="music-player" preload="auto"></audio>
        `);
        clickSound = getEl('click-sound');
        pokeSound = getEl('poke-sound');
        receiveSound = getEl('receive-sound');
        sendSound = getEl('send-sound');
    }
    const playSound = (sound) => { if(sound) { sound.currentTime = 0; sound.play().catch(()=>{}); } };

    // ----- Message Creation Logic -----
    function createMessage(type, sender, data, customTime = null) {
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${sender}-message`;
        wrapper.dataset.id = Date.now() + Math.random();
        const avatarUrl = sender === 'user' ? userAvatar : charAvatar;
        
        let bubbleContent = '';
        if (data.quote) {
            bubbleContent += `<div class="reply-quote"><div class="reply-author">${data.quote.author}</div><div class="reply-content">${data.quote.content}</div></div>`;
        }

        let bubbleClass = 'message-bubble';
        let innerHTML = '';
        switch (type) {
            case 'text': 
                bubbleContent += data.text;
                innerHTML = `<div class="${bubbleClass}">${bubbleContent}</div>`;
                break;
            case 'voice':
                const duration = Math.max(1, Math.round(data.text.length / 5));
                innerHTML = `<div class="${bubbleClass} voice-bubble"><div class="voice-bars"><span></span><span></span><span></span></div><span class="voice-duration">${duration}"</span></div>`;
                if (data.text) {
                    innerHTML += `<div class="${bubbleClass} voice-transcript">${bubbleContent}${data.text}</div>`;
                }
                break;
            case 'photo':
            case 'video': {
                bubbleClass += ' media-bubble';
                const finalImageUrl = data.imageUrl || '';
                let overlayHTML = ''; 
                
                if (type === 'video') { 
                    overlayHTML = `<div class="media-play-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg></div>`;
                }
                
                // 直接应用 finalImageUrl
                innerHTML = `<div class="${bubbleClass}">
                               ${bubbleContent}
                               <div class="media-card" style="background-image: url('${finalImageUrl}')">
                                 ${overlayHTML}
                                 <div class="media-desc">${data.text || ''}</div>
                               </div>
                             </div>`;
                break;
            }
            case 'sticker':
                bubbleClass += ' sticker-bubble';
                innerHTML = `<div class="${bubbleClass}"><img src="${data.url}" alt="${data.name}"></div>`;
                break;
            case 'transfer':
                bubbleClass += ' transfer-bubble';
                innerHTML = `<div class="${bubbleClass}">${bubbleContent}<div class="transfer-header"><svg class="transfer-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg><span>转账</span></div><div class="transfer-body"><div class="amount">¥ ${parseFloat(data.amount).toFixed(2)}</div>${data.memo ? `<div class="transfer-memo">${data.memo}</div>` : ''}</div></div>`;
                break;
        }
        
        let timeString;
        if (customTime) {
            timeString = customTime;
        } else {
            const now = new Date();
            timeString = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        }
        const timeHTML = `<div class="message-time">${timeString}</div>`;

        const finalContentHTML = innerHTML + timeHTML;
        
        wrapper.innerHTML = `<div class="avatar-container"><img src="${avatarUrl}" class="message-avatar" data-sender="${sender}"></div><div class="message-content">${finalContentHTML}</div>`;
        return wrapper;
    }

    // ----- State for typing simulation -----
    let isCharTyping = false;
    let charMessageQueue = []; // A queue for character messages to be displayed sequentially

    // ----- NEW: Show/Hide Typing Indicator -----
    function showTypingIndicator() {
        if (isCharTyping) return;
        isCharTyping = true;
        const typingIndicator = createMessage('text', 'char', { text: '<div class="loading-dots"><span></span><span></span><span></span></div>' });
        typingIndicator.id = 'typing-indicator';
        addMessageToChat(typingIndicator, false); // Add without binding normal events
    }

    function hideTypingIndicator() {
        const indicator = getEl('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
        isCharTyping = false;
    }

    // ----- REFACTORED: Animate typing and play sound on the first character -----
    function animateTypingInBubble(messageElement, fullText, callback) {
        const textContainer = messageElement.querySelector('.message-bubble:not(.voice-bubble), .voice-transcript');
        if (!textContainer) {
            if(callback) callback();
            return;
        }

        let charIndex = 0;
        const typingSpeed = 50;
        let soundHasPlayed = false; // Add a flag to ensure sound plays only once

        function typeChar() {
            // KEY FIX: Play sound right before the first character appears
            if (!soundHasPlayed) {
                playSound(receiveSound);
                soundHasPlayed = true;
            }

            if (charIndex < fullText.length) {
                textContainer.textContent += fullText[charIndex];
                charIndex++;
                chatContent.scrollTop = chatContent.scrollHeight;
                setTimeout(typeChar, typingSpeed);
            } else {
                if(callback) callback();
            }
        }
        
        textContainer.textContent = '';
        typeChar();
    }
    
    // ----- REFACTORED: Process queue, now relying on animation for the sound -----
    function processCharMessageQueue() {
        if (charMessageQueue.length === 0) {
            hideTypingIndicator();
            return;
        }
        showTypingIndicator();
        const thinkingTime = Math.floor(Math.random() * (2200 - 800 + 1) + 800);

        setTimeout(() => {
            hideTypingIndicator();
            
            const msg = charMessageQueue.shift();
            
            const isTextToAnimate = msg.type === 'text' || (msg.type === 'voice' && msg.data.text);

            if (isTextToAnimate) {
                const messageElement = createMessage(msg.type, 'char', msg.data, msg.time);
                addMessageToChat(messageElement);

                animateTypingInBubble(messageElement, msg.data.text, () => {
                    const nextDelay = Math.random() * (1200 - 500) + 500;
                    setTimeout(processCharMessageQueue, nextDelay);
                });

            } else {
                const messageElement = createMessage(msg.type, 'char', msg.data, msg.time);
                if (messageElement) {
                    addMessageToChat(messageElement);
                    playSound(receiveSound); 
                }
                
                const nextDelay = Math.random() * (1200 - 500) + 500;
                setTimeout(processCharMessageQueue, nextDelay);
            }

        }, thinkingTime);
    }

    // ----- REFACTORED: Chat Parsing and Rendering Logic -----
    function parseAndRenderChat() {
        const dataContainer = getEl('chat-data');
        if (!dataContainer) return;

        const currentMessages = new Set([...chatContent.querySelectorAll('.message-wrapper')].map(el => el.dataset.id));
        
        const rawText = dataContainer.innerHTML;
        const decodedText = rawText.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const messageRegex = /\[(角色消息|用户消息)\s*\|\s*([^|]+?)\s*\|\s*([\s\S]+?)\]/g;
        const matches = [...decodedText.matchAll(messageRegex)];

        let hasNewCharMessage = false;

        for (const match of matches) {
            const [, senderRaw, timeRaw, contentRaw] = match;
            const uniqueId = senderRaw + timeRaw + contentRaw;

            
            const sender = senderRaw === '用户消息' ? 'user' : 'char';
            const time = timeRaw.trim();
            const content = contentRaw.trim();
            
            let type, data;
            let richMatch;

            if (richMatch = /<voice>([\s\S]*?)<\/voice>/.exec(content)) {
                type = 'voice'; data = { text: richMatch[1] };
            } 
            else if (richMatch = /<transfer>([^;]+?)(?:；\s*(.*?))?<\/transfer>/.exec(content)) {
                type = 'transfer'; data = { amount: (richMatch[1] || '0.00').trim(), memo: (richMatch[2] || '').trim() };
            }
            else if (richMatch = /<video>([^;]+?)(?:；\s*(.*?))?<\/video>/.exec(content)) {
                type = 'video'; data = { text: (richMatch[2] || '').trim(), imageUrl: (richMatch[1] || '').trim() };
            }
            else if (richMatch = /<photo>([^;]+?)(?:；\s*(.*?))?<\/photo>/.exec(content)) {
                type = 'photo'; data = { text: (richMatch[2] || '').trim(), imageUrl: (richMatch[1] || '').trim() };
            }
            else if (richMatch = /<(?:meme|表情)>([\s\S]*?)<\/(?:meme|表情)>/.exec(content)) {
                 const sticker = defaultStickers.find(s => s.name === richMatch[1].trim());
                 if (sticker) {
                    type = 'sticker'; data = { name: sticker.name, url: sticker.url };
                 }
            }
            else {
                type = 'text'; data = { text: content };
            }

            if (chatContent.children.length === 0) {
                 const messageElement = createMessage(type, sender, data, time);
                 if(messageElement) addMessageToChat(messageElement);
            } else if (sender === 'char') {
            }
        }
        
        // --- Simplified Full Re-render Logic ---
        chatContent.innerHTML = ''; 
        charMessageQueue = []; 

        for (const match of matches) {
             const [, senderRaw, timeRaw, contentRaw] = match;
            const sender = senderRaw === '用户消息' ? 'user' : 'char';
            const time = timeRaw.trim();
            const content = contentRaw.trim();
            
            let type, data; let richMatch;
            if (richMatch = /<voice>([\s\S]*?)<\/voice>/.exec(content)) { type = 'voice'; data = { text: richMatch[1] }; } 
            else if (richMatch = /<transfer>([^;]+?)(?:；\s*(.*?))?<\/transfer>/.exec(content)) { type = 'transfer'; data = { amount: (richMatch[1] || '0.00').trim(), memo: (richMatch[2] || '').trim() }; }
            else if (richMatch = /<video>([^;]+?)(?:；\s*(.*?))?<\/video>/.exec(content)) { type = 'video'; data = { text: (richMatch[2] || '').trim(), imageUrl: (richMatch[1] || '').trim() }; }
            else if (richMatch = /<photo>([^;]+?)(?:；\s*(.*?))?<\/photo>/.exec(content)) { type = 'photo'; data = { text: (richMatch[2] || '').trim(), imageUrl: (richMatch[1] || '').trim() }; }
            else if (richMatch = /<(?:meme|表情)>([\s\S]*?)<\/(?:meme|表情)>/.exec(content)) { const sticker = defaultStickers.find(s => s.name === richMatch[1].trim()); if (sticker) { type = 'sticker'; data = { name: sticker.name, url: sticker.url }; } }
            else { type = 'text'; data = { text: content }; }

            if (sender === 'user') {
                 const messageElement = createMessage(type, sender, data, time);
                 if(messageElement) addMessageToChat(messageElement);
            } else { // It's a character message, queue it up!
                charMessageQueue.push({ type, data, time });
            }
        }
        
        processCharMessageQueue();
    }


    // REFACTORED: addMessageToChat for better control
    function addMessageToChat(messageElement, doBindEvents = true) {
        chatContent.insertBefore(messageElement, chatContent.firstChild);
        if (chatContent.firstChild === messageElement) {
             chatContent.scrollTop = 0;
        }
        if (doBindEvents) {
            bindEventsToMessage(messageElement);
        }
    }
    
    // ----- Utilities & Core Logic -----
    const toggleModal = (modalId, show) => { playSound(clickSound); const modal = getEl(modalId); if (show) modal.classList.add('visible'); else modal.classList.remove('visible'); };
    const updateTime = () => { const now = new Date(); getEl('phoneTime').textContent = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`; };

     function showPokeNotification(text, elementToAnimate) { // <--- 关键修复1：统一参数名为 elementToAnimate
        const notification = document.querySelector('.poke-notification');
        const pokeText = notification.querySelector('.poke-text');
        const pokeAvatarImg = notification.querySelector('.poke-avatar-img');
        
        pokeText.textContent = text;
        pokeAvatarImg.src = 'https://i.postimg.cc/j2N1G0gM/9da5456f04ede72061a169b82cd6adf7.jpg';
    
        notification.style.display = 'block';
        notification.style.animation = 'pokeIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards';
        
        // 关键修复2：现在 elementToAnimate 是一个已定义的、正确的变量
        elementToAnimate.classList.add('poked');
        playSound(pokeSound);
    
        setTimeout(() => {
            notification.style.animation = 'pokeOut 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards';
            
            // 关键修复2：这里也一样
            elementToAnimate.classList.remove('poked');
            
            setTimeout(() => {
                notification.style.display = 'none';
            }, 300);
        }, 2000);
    }

    // ----- NEW: Function to sync new messages to the #chat-data source of truth -----
    function appendMessageToData(type, data) {
        const dataContainer = getEl('chat-data');
        if (!dataContainer) return;

        const now = new Date();
        const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        let contentStr = '';

        switch (type) {
            case 'text':
                contentStr = data.text;
                break;
            case 'sticker':
                contentStr = `<meme>${data.name}</meme>`;
                break;
            case 'voice':
                contentStr = `<voice>${data.text}</voice>`;
                break;
            case 'photo':
                contentStr = `<photo>;${data.text}</photo>`; 
                break;
            case 'video':
                contentStr = `<video>;${data.text}</video>`;
                break;
            case 'transfer':
                contentStr = `<transfer>${data.amount}；${data.memo}</transfer>`;
                break;
        }

        const messageStr = `\n[用户消息|${time}|${contentStr}]`;
        
        dataContainer.innerHTML += messageStr;
    }

    // ----- 新增：仅用于在手机上临时显示用户消息 -----
    function displayMessageToPhone(type, data) {
        const messageElement = createMessage(type, 'user', data);
        addMessageToChat(messageElement);
    }

    // ----- 发送所有缓存消息 (最终修复版) -----
    function sendAllCachedMessages() {
        if (userMessageCache.length === 0) return;

        // 使用 \n 连接，因为 triggerSlash 可能需要它
        const formattedMessages = userMessageCache.map(msg => {
            const now = new Date();
            const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
            let contentStr = '';

            switch (msg.type) {
                case 'text':
                    if (msg.data.quote) {
                        // 在这里，我们仍然使用 \n，因为这是消息内部的换行
                        const reconstructedQuote = `> 引用 ${msg.data.quote.author} 的消息: "${msg.data.quote.content}..."\n`;
                        contentStr = reconstructedQuote + msg.data.text;
                    } else {
                        contentStr = msg.data.text;
                    }
                    break;
                case 'sticker': contentStr = `<meme>${msg.data.name}</meme>`; break;
                case 'voice': contentStr = `<voice>${msg.data.text}</voice>`; break;
                case 'photo': contentStr = `<photo>;${msg.data.text}</photo>`; break;
                case 'video': contentStr = `<video>;${msg.data.text}</video>`; break;
                case 'transfer': contentStr = `<transfer>${msg.data.amount}；${msg.data.memo}</transfer>`; break;
            }
            return `[用户消息|${time}|${contentStr}]`;
        }).join('\n\n'); // <-- 关键修复1：用 \n 连接多条消息

        console.log("准备发送的格式化消息:\n", formattedMessages);
        
        try {
            if (typeof triggerSlash === 'function') {
                // 关键修复2：完全复刻参考代码的格式，保留 <br> 和 \n
                triggerSlash(`/send 回复和Ghost的聊天:<br>\n\n${formattedMessages}|/trigger`);
            } else {
                console.warn('triggerSlash 函数未定义，消息仅在控制台输出。');
            }
        } catch (error) {
            console.error('触发 triggerSlash 命令失败:', error);
        }
        
        userMessageCache = [];
    }

    // ----- handleSend (最终版，只负责缓存) -----
    function handleSend() {
        const messageText = textarea.value.trim();
        if (messageText) {
            playSound(sendSound);
            
            let data = { text: messageText };
            const quoteMatch = messageText.match(/^> 引用 .*\n/);
            if (quoteMatch) {
                const quoteLine = quoteMatch[0];
                const contentMatch = quoteLine.match(/> 引用 (.*) 的消息: "(.*?)\.\.\."/);
                if (contentMatch) {
                    data.quote = { author: contentMatch[1], content: contentMatch[2] };
                }
                data.text = data.text.replace(quoteLine, '').trim();
            }

            displayMessageToPhone('text', data);
            userMessageCache.push({ type: 'text', data: data });
            
            textarea.value = '';
            textarea.dispatchEvent(new Event('input'));
        }
    }

    // ----- Sticker Logic -----
    function getCustomStickers() { return JSON.parse(localStorage.getItem('ghost_custom_stickers') || '[]'); }
    function saveCustomStickers(stickers) { localStorage.setItem('ghost_custom_stickers', JSON.stringify(stickers)); }

    function populateStickerMenu() {
        const grid = getEl('sticker-grid');
        grid.innerHTML = '';
        const customStickers = getCustomStickers();
        const allStickers = [...defaultStickers, ...customStickers];

        allStickers.forEach((sticker, index) => {
            const isCustom = index >= defaultStickers.length;
            const wrapper = document.createElement('div');
            wrapper.className = 'sticker-item-wrapper';
            
            const img = document.createElement('img');
            img.src = sticker.url;
            img.alt = sticker.name;
            img.className = 'sticker-item';
            img.dataset.name = sticker.name;
            img.dataset.url = sticker.url;
            if (isCustom) {
                img.dataset.custom = 'true';
            }
            
            wrapper.appendChild(img);
            grid.appendChild(wrapper);
        });
    }

    function sendSticker(name, url) {
        playSound(sendSound);
        displayMessageToPhone('sticker', { name, url });
        userMessageCache.push({ type: 'sticker', data: { name, url } });
        stickerMenu.classList.remove('visible');
    }


    // ----- Settings Logic -----
    function getCustomWallpapers() { return JSON.parse(localStorage.getItem('ghost_custom_wallpapers') || '[]'); }
    function saveCustomWallpapers(wallpapers) { localStorage.setItem('ghost_custom_wallpapers', JSON.stringify(wallpapers)); }

    // ----- Settings Logic (最终修复版) -----
    function setupSettings() {
        const load = () => {
            getEl('contactName').textContent = localStorage.getItem('ghost_chat_nickname') || 'Ghost';
            userAvatar = localStorage.getItem('ghost_user_avatar') || 'https://i.postimg.cc/28FHXK0k/1040g008318macbkbjk004ap6ggeu186bojtt370-nd-dft-wlteh-webp-3.webp';
            charAvatar = localStorage.getItem('ghost_char_avatar') || 'https://i.postimg.cc/j2N1G0gM/9da5456f04ede72061a169b82cd6adf7.jpg';
            
            const savedWallpaper = localStorage.getItem('ghost_chat_wallpaper') || defaultWallpapers[0]; 
            getEl('chatBackground').style.backgroundImage = `url(${savedWallpaper})`;

            const savedBlur = localStorage.getItem('ghost_wallpaper_blur') || '0';
            document.documentElement.style.setProperty('--wallpaper-blur', `${savedBlur}px`);
            getEl('wallpaperBlurSlider').value = savedBlur;
            
            const wallpaperGrid = getEl('wallpaperGrid');
            wallpaperGrid.innerHTML = '';
            const customWallpapers = getCustomWallpapers();
            const allWallpapers = [...defaultWallpapers, ...customWallpapers];

            allWallpapers.forEach((url) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'wallpaper-thumb-wrapper';

                const thumb = document.createElement('img');
                thumb.src = url;
                thumb.className = 'wallpaper-thumb';
                thumb.dataset.url = url;
                
                if (url === savedWallpaper) {
                    thumb.classList.add('active');
                }

                // --- 核心修复在这里 ---
                thumb.onclick = () => {
                    playSound(clickSound);
                    // 移除旧的选中状态
                    const currentActive = wallpaperGrid.querySelector('.active');
                    if (currentActive) {
                        currentActive.classList.remove('active');
                    }
                    // 添加新的选中状态
                    thumb.classList.add('active');
                    
                    // 新增：点击缩略图时，立即更新聊天背景以实现实时预览
                    getEl('chatBackground').style.backgroundImage = `url(${thumb.dataset.url})`;
                };
                
                wrapper.appendChild(thumb);
                wallpaperGrid.appendChild(wrapper);
            });

            const uploadWrapper = document.createElement('div');
            uploadWrapper.className = 'wallpaper-thumb-wrapper';
            uploadWrapper.innerHTML = `<div id="uploadWallpaperBtn" class="wallpaper-thumb" style="display:flex; align-items:center; justify-content:center; background:var(--border-color); font-size: 24px; color: var(--text-secondary);">+</div>`;
            wallpaperGrid.appendChild(uploadWrapper);
            getEl('uploadWallpaperBtn').onclick = () => getEl('customWallpaperInput').click();
        };
        
        const save = () => {
            playSound(clickSound);
            const newName = getEl('nicknameInput').value.trim();
            if (newName) localStorage.setItem('ghost_chat_nickname', newName);
            
            // 保存当前选中的壁纸
            const activeWallpaper = getEl('wallpaperGrid').querySelector('.active');
            if (activeWallpaper) {
                localStorage.setItem('ghost_chat_wallpaper', activeWallpaper.dataset.url);
            }

            localStorage.setItem('ghost_wallpaper_blur', getEl('wallpaperBlurSlider').value);
            toggleModal('settingsModal', false);
            // 保存后不再需要重新加载，因为预览已经是最终效果
            // load(); 
            // 也不需要重新渲染聊天，因为壁纸不影响消息内容
            // parseAndRenderChat(); 
        };

        const handleAvatarChange = (e, type) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => { localStorage.setItem(`ghost_${type}_avatar`, event.target.result); if (type === 'user') userAvatar = event.target.result; else if (type === 'char') charAvatar = event.target.result; };
                reader.readAsDataURL(file);
            }
        };

        settingsBtn.onclick = () => { getEl('nicknameInput').value = getEl('contactName').textContent; toggleModal('settingsModal', true); };
        getEl('settingsModal').onclick = (e) => { if (e.target === e.currentTarget) toggleModal('settingsModal', false); };
        getEl('settingsSave').onclick = save;
        getEl('userAvatarInput').onchange = (e) => handleAvatarChange(e, 'user');
        getEl('charAvatarInput').onchange = (e) => handleAvatarChange(e, 'char');
        getEl('wallpaperBlurSlider').oninput = (e) => document.documentElement.style.setProperty('--wallpaper-blur', `${e.target.value}px`);
        
        getEl('customWallpaperInput').onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const customWallpapers = getCustomWallpapers();
                    customWallpapers.push(event.target.result);
                    saveCustomWallpapers(customWallpapers);
                    load(); // 上传新壁纸后，需要重新加载网格
                };
                reader.readAsDataURL(file);
            }
        };

        getEl('defaultSettingsBtn').onclick = () => {
            playSound(clickSound);
            localStorage.clear();
            load(); // 恢复默认后，重新加载
            populateStickerMenu();
        };

        load(); // 初始加载
    }

    // ----- Context Menu Logic -----
    function showContextMenu(event, element) {
        event.preventDefault();
        currentContextElement = element;
        
        const isMessage = element.closest('.message-wrapper');
        const isCustomSticker = element.matches('.sticker-item[data-custom="true"]');
        const isCustomWallpaper = element.matches('.wallpaper-thumb[data-custom="true"]');

        getEl('contextMenu').querySelector('[data-action="reply"]').style.display = isMessage ? 'block' : 'none';
        getEl('contextMenu').querySelector('[data-action="recall"]').style.display = isMessage && element.closest('.user-message') ? 'block' : 'none';
        getEl('contextMenu').querySelector('[data-action="delete"]').style.display = (isCustomSticker || isCustomWallpaper) ? 'block' : 'none';
        
        if (!isMessage && !isCustomSticker && !isCustomWallpaper) return;

        contextMenu.classList.add('active');
        const menuRect = contextMenu.getBoundingClientRect();
        const phoneRect = document.querySelector('.phone-container').getBoundingClientRect();
        let x = event.clientX, y = event.clientY;
        if (x + menuRect.width > phoneRect.right) x = phoneRect.right - menuRect.width;
        if (y + menuRect.height > phoneRect.bottom) y = phoneRect.bottom - menuRect.height;
        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;

        document.addEventListener('click', hideContextMenu, { once: true });
    }
    function hideContextMenu() { contextMenu.classList.remove('active'); }

    // ----- Event Listeners (最终修复版) -----
    function initializeEventListeners() {
        // 1. 统一获取所有元素
        chatContent = getEl('chatContent');
        textarea = getEl('chat-textarea');
        sendBtn = getEl('send-btn');
        settingsBtn = getEl('settingsBtn');
        plusBtn = getEl('plus-btn');
        plusMenu = getEl('plus-menu');
        stickerMenu = getEl('sticker-menu');
        voiceBtn = getEl('voice-btn');
        contextMenu = getEl('contextMenu');
        musicPlayer = getEl('music-player');

        // 2. 绑定音乐播放器原生事件
        musicPlayer.onplay = () => {
            musicState.isPlaying = true;
            updatePlayerUI();
        };
        musicPlayer.onpause = () => {
            musicState.isPlaying = false;
            updatePlayerUI();
        };
        musicPlayer.onended = playNext;

        // 3. 绑定核心聊天功能事件
        document.body.addEventListener('click', (e) => {
            if (!e.target.closest('#plus-btn') && !e.target.closest('.panel-menu')) {
                plusMenu.classList.remove('visible');
                stickerMenu.classList.remove('visible');
            }
            const closeButton = e.target.closest('[data-action="close-modal"]');
            if (closeButton) {
                const modal = closeButton.closest('.modal-overlay');
                if (modal) toggleModal(modal.id, false);
            }
        });
        
        // 发送按钮：处理最后输入的内容，然后发送全部
        sendBtn.onclick = () => {
            const lastMessage = textarea.value.trim();
            if (lastMessage) {
                handleSend();
            }
            if (userMessageCache.length > 0) {
                sendAllCachedMessages();
            }
            textarea.value = '';
            textarea.dispatchEvent(new Event('input'));
        };

        // 回车键：只负责将当前内容显示并存入缓存
        textarea.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        };
        
        // 其他输入框和按钮的事件
        textarea.oninput = () => { textarea.style.height = 'auto'; textarea.style.height = `${textarea.scrollHeight}px`; };
        plusBtn.onclick = (e) => { playSound(clickSound); e.stopPropagation(); stickerMenu.classList.remove('visible'); plusMenu.classList.toggle('visible'); };
        voiceBtn.onclick = () => toggleModal('voiceModal', true);

        plusMenu.onclick = (e) => { 
            const item = e.target.closest('.plus-menu-item'); if (!item) return; 
            const action = item.dataset.action; 
            plusMenu.classList.remove('visible');
            if (action === 'photo' || action === 'video') { getEl('mediaModalTitle').textContent = `发送${action === 'photo' ? '照片' : '视频'}`; toggleModal('mediaModal', true); getEl('mediaSend').dataset.mediaType = action; } 
            else if (action === 'transfer') { toggleModal('transferModal', true); }
            else if (action === 'sticker') { playSound(clickSound); stickerMenu.classList.add('visible'); }
        };

        stickerMenu.addEventListener('click', e => {
            const sticker = e.target.closest('.sticker-item');
            if (sticker) { sendSticker(sticker.dataset.name, sticker.src); }
        });

        getEl('uploadStickerFile').onclick = () => getEl('stickerFileInput').click();
        getEl('stickerFileInput').onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const customStickers = getCustomStickers();
                    customStickers.push({ name: '自定义表情', url: event.target.result });
                    saveCustomStickers(customStickers);
                    populateStickerMenu();
                    sendSticker('自定义表情', event.target.result);
                };
                reader.readAsDataURL(file);
            }
        };
        getEl('uploadStickerUrl').onclick = () => toggleModal('stickerUrlModal', true);
        getEl('stickerUrlSend').onclick = () => {
            const url = getEl('stickerUrlInput').value.trim();
            if (url) {
                const customStickers = getCustomStickers();
                customStickers.push({ name: '自定义表情', url: url });
                saveCustomStickers(customStickers);
                populateStickerMenu();
                sendSticker('自定义表情', url);
                toggleModal('stickerUrlModal', false);
                getEl('stickerUrlInput').value = '';
            }
        };

        getEl('voiceSend').onclick = () => { 
            const text = getEl('voiceContentInput').value.trim(); 
            if (!text) return; 
            playSound(sendSound); 
            
            displayMessageToPhone('voice', { text });
            userMessageCache.push({ type: 'voice', data: { text } });

            toggleModal('voiceModal', false); 
            getEl('voiceContentInput').value = ''; 
        };
        
        getEl('mediaSend').onclick = (e) => { 
            const text = getEl('mediaDescInput').value.trim(); 
            if (!text) return; 
            playSound(sendSound); 
            const type = e.currentTarget.dataset.mediaType; 
            
            displayMessageToPhone(type, { text, imageUrl: '' });
            userMessageCache.push({ type, data: { text, imageUrl: '' } });

            toggleModal('mediaModal', false); 
            getEl('mediaDescInput').value = ''; 
        };
        
        getEl('transferSend').onclick = () => { 
            const amount = getEl('transferAmountInput').value; 
            if (!amount || parseFloat(amount) <= 0) return; 
            playSound(sendSound); 
            const memo = getEl('transferMemoInput').value.trim();
            
            displayMessageToPhone('transfer', { amount, memo });
            userMessageCache.push({ type: 'transfer', data: { amount, memo } });
            
            toggleModal('transferModal', false); 
            getEl('transferAmountInput').value = '';
            getEl('transferMemoInput').value = ''; 
        };

        // 3. 绑定“一起听”功能事件
        getEl('listenBtn').onclick = startListenTogether;
        getEl('returnToChatBtn').onclick = () => toggleModal('listenTogetherModal', false);
        getEl('exitListenBtn').onclick = stopListenTogether;
        
        getEl('playPauseBtn').onclick = togglePlayPause;
        getEl('nextSongBtn').onclick = playNext;
        getEl('prevSongBtn').onclick = playPrev;

        getEl('addSongBtn').onclick = () => {
            getEl('addSongTitle').value = '';
            getEl('addSongArtist').value = '';
            getEl('addSongFileInput').value = '';
            getEl('addSongUrlInput').value = '';
            toggleModal('addSongModal', true);
        };

        getEl('confirmAddSongBtn').onclick = () => {
            const title = getEl('addSongTitle').value.trim();
            const artist = getEl('addSongArtist').value.trim();
            const audioFile = getEl('addSongFileInput').files[0];
            const audioUrl = getEl('addSongUrlInput').value.trim();
            const coverFile = getEl('addSongCoverFileInput').files[0];
            const coverUrl = getEl('addSongCoverUrlInput').value.trim();

            if (!title || !artist) { alert('请填写歌曲名和歌手！'); return; }
            if (!audioFile && !audioUrl) { alert('请上传音频文件或提供链接！'); return; }
            
            let songData;
            if (audioFile) {
                songData = { title, artist, src: audioFile, isLocalFile: true };
            } else {
                songData = { title, artist, src: audioUrl, isLocalFile: false };
            }

            if (coverFile) {
                songData.cover = URL.createObjectURL(coverFile);
            } else if (coverUrl) {
                songData.cover = coverUrl;
            } else {
                songData.cover = 'https://files.catbox.moe/m72cdd.png';
            }

            musicState.playlist.push(songData);
            
            if (musicState.currentIndex === -1) {
                musicState.currentIndex = 0;
            }
            updatePlayerUI(); // 只更新UI
            toggleModal('addSongModal', false);
        };
        
        getEl('playlistUI').addEventListener('click', (e) => {
            const deleteButton = e.target.closest('.playlist-item-delete-btn');
            if (deleteButton) { e.stopPropagation(); const index = parseInt(deleteButton.dataset.index, 10); deleteSong(index); }
        });

        musicPlayer.onended = playNext;

        // 4. 绑定其他弹窗和上下文菜单事件
        const imageModal = getEl('imageModal');
        const closeModalBtn = getEl('closeModalBtn');
        const closeImageModal = () => imageModal.classList.remove('visible');
        closeModalBtn.onclick = closeImageModal;
        imageModal.addEventListener('click', (e) => {
            if (e.target === imageModal) { closeImageModal(); }
        });
        
        contextMenu.onclick = (e) => {
            playSound(clickSound);
            const action = e.target.dataset.action;
            const messageElement = currentContextElement.closest('.message-wrapper');

            if (action === 'recall' && messageElement) { messageElement.remove(); } 
            else if (action === 'reply' && messageElement) {
                const author = messageElement.classList.contains('user-message') ? '我' : getEl('contactName').textContent;
                const contentEl = messageElement.querySelector('.message-bubble:not(.voice-bubble):not(.sticker-bubble)');
                const content = contentEl ? contentEl.textContent.substring(0, 20).replace(/\n/g, ' ') : (messageElement.querySelector('.sticker-bubble') ? '[表情]' : '[消息]');
                textarea.value = `> 引用 ${author} 的消息: "${content}..."\n` + textarea.value;
                textarea.focus();
                textarea.dispatchEvent(new Event('input'));
            } else if (action === 'delete') {
                if (currentContextElement.matches('.sticker-item[data-custom="true"]')) {
                    let customStickers = getCustomStickers();
                    customStickers = customStickers.filter(s => s.url !== currentContextElement.dataset.url);
                    saveCustomStickers(customStickers);
                    populateStickerMenu();
                } else if (currentContextElement.matches('.wallpaper-thumb[data-custom="true"]')) {
                    let customWallpapers = getCustomWallpapers();
                    customWallpapers = customWallpapers.filter(url => url !== currentContextElement.dataset.url);
                    setupSettings();
                }
            }
            hideContextMenu();
        };
        
        setupSettings();
        populateStickerMenu();
    }

    function bindEventsToMessage(messageElement) {
        let pressTimer = null;
        const bubble = messageElement.querySelector('.message-bubble, .sticker-bubble');
        
        if (bubble) {
            const handleContextMenu = (e) => showContextMenu(e, bubble);
            bubble.addEventListener('contextmenu', handleContextMenu);
            bubble.addEventListener('touchstart', (e) => { pressTimer = setTimeout(() => { e.preventDefault(); showContextMenu(e.touches[0], bubble); }, 500); });
            bubble.addEventListener('touchend', () => clearTimeout(pressTimer));
            bubble.addEventListener('touchmove', () => clearTimeout(pressTimer));

            bubble.addEventListener('click', () => {
                if (!bubble.classList.contains('voice-bubble')) {
                    playSound(clickSound);
                }
            });
        }

        const avatarContainer = messageElement.querySelector('.avatar-container');
        const avatar = avatarContainer.querySelector('.message-avatar');
        
        if (avatar) {
            avatar.addEventListener('click', () => {
                playSound(clickSound);
            });

            if (avatar && avatar.dataset.sender === 'char') {
                avatarContainer.addEventListener('dblclick', () => {
                    const randomActions = [ "你拍了拍Ghost的大屁股", "你给Ghost转了50£请他吃麦当劳", "你吵醒了Ghost，你完了", "你捏了捏Ghost的脸" ];
                    const randomAction = randomActions[Math.floor(Math.random() * randomActions.length)];
                    
                    // 关键修改：这里将 avatarContainer 作为参数传入
                    showPokeNotification(randomAction, avatarContainer);
                    
                    if (typeof triggerSlash === 'function') { triggerSlash(`/send 戳戳头像：【 ${randomAction} 】`); }
                });
            }
        }

        const voiceBubble = messageElement.querySelector('.voice-bubble');
        if (voiceBubble) {
            voiceBubble.addEventListener('click', () => {
                playSound(clickSound); 
                const voiceBars = voiceBubble.querySelector('.voice-bars');
                const messageContent = voiceBubble.closest('.message-content');
                if (messageContent) { messageContent.classList.add('transcript-visible'); }
                if (voiceBars.classList.contains('playing')) return;
                voiceBars.classList.add('playing');
                setTimeout(() => voiceBars.classList.remove('playing'), 2400);
            });
        }

         const mediaCard = messageElement.querySelector('.media-card');
            if (mediaCard) {
                mediaCard.addEventListener('click', () => {
                    const imageUrl = mediaCard.style.backgroundImage.slice(5, -2); // 从 'url("...")' 中提取 URL
                    const imageModal = getEl('imageModal');
                    const modalImage = getEl('modalImage');
                    
                    if (imageUrl) {
                        modalImage.src = imageUrl;
                        imageModal.classList.add('visible');
                    }
                });
            }
    }

    function bindContextEventsToElement(element) {
        let pressTimer = null;
        const handleContextMenu = (e) => showContextMenu(e, element);
        element.addEventListener('contextmenu', handleContextMenu);
        element.addEventListener('touchstart', (e) => { pressTimer = setTimeout(() => { e.preventDefault(); showContextMenu(e.touches[0], element); }, 500); });
        element.addEventListener('touchend', () => clearTimeout(pressTimer));
        element.addEventListener('touchmove', () => clearTimeout(pressTimer));
    }

    // ----- Initialization -----
    setupAudio();
    initializeEventListeners();
    updateTime();
    setInterval(updateTime, 30000);

    parseAndRenderChat();

    const dataObserver = new MutationObserver(parseAndRenderChat);
    const dataNode = getEl('chat-data');
    if (dataNode) {
        dataObserver.observe(dataNode, { childList: true, characterData: true, subtree: true });
    }
    
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                    node.querySelectorAll('.sticker-item[data-custom="true"], .wallpaper-thumb[data-custom="true"]').forEach(el => bindContextEventsToElement(el));
                }
            });
        });
    });
    observer.observe(getEl('sticker-grid'), { childList: true, subtree: true });
    observer.observe(getEl('wallpaperGrid'), { childList: true, subtree: true });

});

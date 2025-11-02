/**
 * Service to handle TalkJS integration
 */
export class TalkJSService {
    constructor() {
        this.conversation = null;
        this.processedMessages = new Set();
        this.messageCallback = null;
        this.conversationHistory = []; // Store recent messages for context
        this.maxHistoryLength = 10; // Keep last 10 messages for context
        this.currentUserId = null;
        this.otherUserId = null;
        this.lastMessageSenderId = null; // Track who sent the last message
        this.isMyTurn = true; // Start with it being the first player's turn
        this.turnChangeCallback = null; // Callback when turn changes
    }

    /**
     * Initialize TalkJS session
     * @param {Function} onMessageReceived - Callback for when new messages arrive
     * @param {Function} onTurnChange - Optional callback for when turn changes (receives boolean isMyTurn)
     */
    async initialize(onMessageReceived, onTurnChange = null) {
        this.messageCallback = onMessageReceived;
        this.turnChangeCallback = onTurnChange;

        try {
            // Get user from URL parameter or default to alice
            const urlParams = new URLSearchParams(window.location.search);
            this.currentUserId = urlParams.get('user') || 'alice';
            
            // Hardcoded user data
            const users = {
                alice: {
                    id: "alice",
                    name: "Alice"
                },
                bob: {
                    id: "bob",
                    name: "Bob"
                }
            };
            
            const me = users[this.currentUserId];
            this.otherUserId = this.currentUserId === 'alice' ? 'bob' : 'alice';
            const other = users[this.otherUserId];
            
            // Import TalkJS dynamically
            const { getTalkSession } = await import('https://cdn.jsdelivr.net/npm/@talkjs/core@1.5.8');
            
            const session = getTalkSession({
                host: "durhack.talkjs.com",
                appId: "tCc397Q9",
                userId: me.id
            });
            
            await session.user(me.id).createIfNotExists(me);
            await session.user(other.id).createIfNotExists(other);
            
            const conversationId = [me.id, other.id].sort().join("--");
            this.conversation = session.conversation(conversationId);
            await this.conversation.createIfNotExists();
            await this.conversation.participant(other.id).createIfNotExists();
            
            // Subscribe to messages
            this.conversation.subscribeMessages((messages, loadedAll) => {
                if (messages === null) {
                    console.error("Couldn't load messages");
                    return;
                }
                
                // Process new messages (batch to avoid excessive callbacks)
                const newMessages = [];
                messages.forEach(m => {
                    if (!this.processedMessages.has(m.id)) {
                        this.processedMessages.add(m.id);
                        const senderName = m.sender?.name || 'System';
                        const messageText = `${senderName}: ${m.plaintext}`;
                        
                        // Store in conversation history for context
                        this.conversationHistory.push({
                            sender: senderName,
                            text: m.plaintext,
                            timestamp: m.timestamp || Date.now()
                        });
                        
                        // Keep only recent messages
                        if (this.conversationHistory.length > this.maxHistoryLength) {
                            this.conversationHistory.shift();
                        }
                        const senderId = m.sender?.id;
                        
                        // Update turn tracking
                        if (senderId) {
                            this.lastMessageSenderId = senderId;
                            // It's my turn if the other person just sent a message
                            const wasMyTurn = this.isMyTurn;
                            this.isMyTurn = (senderId !== this.currentUserId);
                            
                            // Notify turn change if callback exists and turn actually changed
                            if (this.turnChangeCallback && wasMyTurn !== this.isMyTurn) {
                                this.turnChangeCallback(this.isMyTurn);
                            }
                        }
                        
                        // Extract effects data from custom field if present
                        let effectsData = null;
                        if (m.custom && m.custom.effects) {
                            try {
                                effectsData = JSON.parse(m.custom.effects);
                                console.log('Received message with effects:', messageText, effectsData);
                            } catch (e) {
                                console.error('Failed to parse effects data:', e);
                            }
                        }
                        
                        newMessages.push({ text: messageText, effects: effectsData });
                    }
                });
                
                // Callback for each new message with effects data
                if (this.messageCallback && newMessages.length > 0) {
                    newMessages.forEach(msg => this.messageCallback(msg.text, msg.effects));
                }
            });
            
            console.log('TalkJS initialized successfully');
        } catch (error) {
            console.error('Error initializing TalkJS:', error);
        }
    }

    /**
     * Process message through Gemini API before sending
     * @param {string} message - The original message
     * @returns {Promise<Object>} - The processed response with animation data
     */
    async processMessageThroughAPI(message) {
        try {
            // Dynamically import GoogleGenAI
            const { GoogleGenAI, Type } = await import('@google/genai');
            
            // In Vite, use import.meta.env instead of process.env
            // Add VITE_GEMINI_API_KEY to your .env file
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            
            const ai = new GoogleGenAI({
                apiKey: apiKey,
            });
            
            const config = {
                thinkingConfig: {
                    thinkingBudget: 0,
                },
                imageConfig: {
                    imageSize: '1K',
                },
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    required: ["effect", "colors", "animationPath", "fontSize"],
                    properties: {
                        effect: {
                            type: Type.STRING,
                            description: "Particle effect type: 'fire', 'ice', 'poison', 'smoke', or null"
                        },  
                        fontSize: {
                            type: Type.NUMBER,
                            description: "Font size in pixels."
                        },
                        colors: {
                            type: Type.OBJECT,
                            properties: {
                                text: {
                                    type: Type.STRING,
                                    description: "Text color in hex format (e.g., '#ff0000')"
                                },
                                background: {
                                    type: Type.NUMBER,
                                    description: "Background color as hex number (e.g., 0xff0000)"
                                },
                                border: {
                                    type: Type.NUMBER,
                                    description: "Border color as hex number (e.g., 0xff0000)"
                                }
                            }
                        },
                        animationPath: {
                            type: Type.ARRAY,
                            description: "Array of animation waypoints",
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    x: { type: Type.NUMBER, description: "X position (0-1920)" },
                                    y: { type: Type.NUMBER, description: "Y position (0-1080)" },
                                    duration: { type: Type.NUMBER, description: "Duration to reach this point in ms (500-3000)" },
                                    rotation: { type: Type.NUMBER, description: "Rotation in radians (0 to 6.28)" }
                                }
                            }
                        }
                    }
                }
            };
            
            const model = 'gemini-flash-lite-latest';
            
            // Build conversation history context
            let historyContext = '';
            if (this.conversationHistory.length > 0) {
                historyContext = '\n\nRECENT CONVERSATION HISTORY (use this to create dynamic, escalating battles):\n';
                this.conversationHistory.slice(-8).forEach(msg => {
                    historyContext += `${msg.sender}: ${msg.text}\n`;
                });
                historyContext += '\nUse this history to:\n- Escalate intensity if battle is heating up\n- React to opponent\'s last move (counter fire with ice, etc.)\n- Build narrative progression (small attacks → bigger attacks)\n- Create combo effects when messages relate to previous ones\n- Match or exceed the energy level of recent exchanges\n';
            }
            
            const prompt = `You are a creative game effects designer. Analyze the user's message and generate thematic visual effects for a text box animation.

CRITICAL COLOR CONTRAST RULES:
- ALWAYS ensure high contrast between text and background
- Dark backgrounds (0x000000-0x888888) MUST use light text (#ffffff, #ffff00, #00ffff, etc.)
- Light backgrounds (0x999999-0xffffff) MUST use dark text (#000000, #0f172a, #1a1a1a, etc.)
- Never use similar brightness values for text and background
- Test: Can you read white text on yellow? NO! Can you read black text on yellow? YES!

THEME RULES:
1. Match the theme/mood (fire=hot/explosive, ice=cold/calm, poison=toxic, smoke=mysterious)
2. Choose thematic colors WITH PROPER CONTRAST:
   - Fire: Dark red/orange background (0xcc0000-0xff4500) + WHITE text (#ffffff)
   - Ice: Dark blue background (0x0066cc-0x0099ff) + WHITE text (#ffffff)
   - Poison: Dark green background (0x006600-0x00cc00) + WHITE or YELLOW text
   - Smoke: Medium gray background (0x666666-0x999999) + BLACK or WHITE text
   - Normal: White background (0xffffff) + DARK text (#0f172a)
3. Animation paths match energy (fast/aggressive for attacks, slow/calm)
4. Use effects sparingly - not every message needs effects
5. Animation duration and intensity match mood
6. Duration: 500-3000ms (faster=aggressive, slower=calm)
7. Rotation: 0-6.28 radians (use sparingly)
8. Font size matches mood

EXAMPLES:

Message: "fireball"
Response: {"effect":"fire","fontSize":36,"colors":{"text":"#ffffff","background":13369344,"border":10027008},"animationPath":[{"x":400,"y":400,"duration":800,"rotation":0},{"x":1500,"y":400,"duration":1200,"rotation":3.14}]}

Message: "ice shard"
Response: {"effect":"ice","fontSize":30,"colors":{"text":"#ffffff","background":52479,"border":39423},"animationPath":[{"x":960,"y":300,"duration":1500,"rotation":0},{"x":960,"y":600,"duration":2000,"rotation":0.5}]}

Message: "hello there"
Response: {"effect":null,"fontSize":28,"colors":{"text":"#0f172a","background":16777215,"border":15132395},"animationPath":[{"x":500,"y":400,"duration":2000,"rotation":0},{"x":1400,"y":400,"duration":2500,"rotation":0}]}

Message: "EXPLOSION!!!"
Response: {"effect":"fire","fontSize":48,"colors":{"text":"#ffff00","background":10027008,"border":6684672},"animationPath":[{"x":960,"y":540,"duration":500,"rotation":0},{"x":960,"y":540,"duration":100,"rotation":6.28}]}

Message: "whisper"
Response: {"effect":"smoke","fontSize":22,"colors":{"text":"#000000","background":13421772,"border":10066329},"animationPath":[{"x":800,"y":400,"duration":3000,"rotation":0},{"x":1100,"y":450,"duration":3000,"rotation":0}]}

Message: "toxic"
Response: {"effect":"poison","fontSize":32,"colors":{"text":"#ffff00","background":26112,"border":13056},"animationPath":[{"x":700,"y":400,"duration":1500,"rotation":0},{"x":1200,"y":500,"duration":1800,"rotation":1.57}]}

BATTLE CONTEXT GUIDELINES:
- If conversation shows escalation (slap → punch → fireball), make THIS message even MORE intense
- Counter opponent's element (they used fire? Use ice/water themed response)
- First attacks should be small/simple, later attacks larger/more complex
- Match the combat pace: fast exchanges = shorter durations, epic moments = slower dramatic animations
- Create visual storytelling: defensive moves use shields/barriers, aggressive moves use strikes/projectiles
${historyContext}

Now analyze this message and generate appropriate effects:
Message: "${message}"

Return ONLY valid JSON matching the schema.`;

            const contents = [
                {
                    role: 'user',
                    parts: [
                        {
                            text: prompt,
                        },
                    ],
                },
            ];

            const response = await ai.models.generateContentStream({
                model,
                config,
                contents,
            });
            
            // Collect all chunks from the stream
            let fullResponse = '';
            for await (const chunk of response) {
                fullResponse += chunk.text;
            }
            
            // Parse the JSON response
            const processedData = JSON.parse(fullResponse);
            
            
            return processedData;
            
        } catch (error) {
            console.error('Error processing message through Gemini API:', error);
            // Fallback to a default response structure if API fails
            return {
                effect: null,
                fontSize: 28,
                colors: {
                    text: '#0f172a',
                    background: 0xffffff,
                    border: 0xe5e7eb
                },
                animationPath: [
                    { x: 500, y: 400, duration: 2000, rotation: 0 },
                    { x: 1400, y: 400, duration: 2500, rotation: 0 }
                ]
            };
        }
    }

    /**
     * Send a message through TalkJS (with optional Gemini API processing)
     * @param {string} message - The message to send
     * @param {boolean} processWithAPI - Whether to process the message through Gemini API first (default: true)
     * @returns {Promise<Object|null>} - The processed data from Gemini (if processWithAPI is true), or null if not your turn
     */
    async sendMessage(message, processWithAPI = true) {
        if (!this.conversation || !message.trim()) {
            return null;
        }

        // Check if it's the player's turn
        if (!this.isMyTurn) {
            console.warn('Not your turn! Wait for the other player to respond.');
            return { error: 'NOT_YOUR_TURN', message: 'Wait for the other player to respond first.' };
        }

        try {
            let processedData = null;

            if (processWithAPI) {
                // Process message through Gemini API
                processedData = await this.processMessageThroughAPI(message);
                console.log('Original message:', message);
                console.log('Gemini processed data:', processedData);
            }

            // Send the message via TalkJS with effects data in custom field
            if (processedData) {
                this.conversation.send({
                    text: message,
                    custom: {
                        effects: JSON.stringify(processedData)
                    }
                });
            } else {
                this.conversation.send(message);
            }
            
            // Update turn state - it's now the other player's turn
            this.isMyTurn = false;
            if (this.turnChangeCallback) {
                this.turnChangeCallback(this.isMyTurn);
            }
            
            // Return the processed data so the caller can use it for animations
            return processedData;
            
        } catch (error) {
            console.error('Error sending message:', error);
            // Send original message as fallback
            this.conversation.send(message);
            
            // Still update turn even on error
            this.isMyTurn = false;
            if (this.turnChangeCallback) {
                this.turnChangeCallback(this.isMyTurn);
            }
            
            return null;
        }
    }

    /**
     * Check if it's currently this player's turn
     * @returns {boolean} - True if it's this player's turn to send a message
     */
    canSendMessage() {
        return this.isMyTurn;
    }

    /**
     * Get the current turn state
     * @returns {Object} - Object with isMyTurn boolean and turnMessage string
     */
    getTurnState() {
        return {
            isMyTurn: this.isMyTurn,
            turnMessage: this.isMyTurn ? 'Your turn' : 'Waiting for opponent...'
        };
    }
}

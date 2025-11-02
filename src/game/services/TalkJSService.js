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
                    required: ["colors", "animationPath", "fontSize"],
                    properties: {
                        fontSize: {
                            type: Type.NUMBER,
                            description: "Font size: 20-48 pixels only"
                        },
                        colors: {
                            type: Type.OBJECT,
                            required: ["text", "background", "border"],
                            properties: {
                                text: {
                                    type: Type.STRING,
                                    description: "Text color hex: #000000 or #ffffff only"
                                },
                                background: {
                                    type: Type.NUMBER,
                                    description: "Background hex number (0x000000-0xffffff)"
                                },
                                border: {
                                    type: Type.NUMBER,
                                    description: "Border hex number (0x000000-0xffffff)"
                                }
                            }
                        },
                        animationPath: {
                            type: Type.ARRAY,
                            description: "1-3 waypoints only",
                            items: {
                                type: Type.OBJECT,
                                required: ["x", "y", "duration"],
                                properties: {
                                    x: { type: Type.NUMBER, description: "X: 200-1720" },
                                    y: { type: Type.NUMBER, description: "Y: 200-880" },
                                    duration: { type: Type.NUMBER, description: "Duration: 800-2500ms" },
                                    rotation: { type: Type.NUMBER, description: "Rotation: 0-6.28 (optional)" }
                                }
                            }
                        },
                        particles: {
                            type: Type.OBJECT,
                            description: "Custom particle effect config (optional, omit for no particles)",
                            properties: {
                                colors: {
                                    type: Type.ARRAY,
                                    description: "2-4 hex colors for particles",
                                    items: { type: Type.NUMBER }
                                },
                                speed: { 
                                    type: Type.OBJECT,
                                    properties: {
                                        min: { type: Type.NUMBER, description: "20-100" },
                                        max: { type: Type.NUMBER, description: "40-150" }
                                    }
                                },
                                angle: {
                                    type: Type.OBJECT,
                                    properties: {
                                        min: { type: Type.NUMBER, description: "0-360" },
                                        max: { type: Type.NUMBER, description: "0-360" }
                                    }
                                },
                                scale: {
                                    type: Type.OBJECT,
                                    properties: {
                                        start: { type: Type.NUMBER, description: "1-3" },
                                        end: { type: Type.NUMBER, description: "0-1" }
                                    }
                                },
                                lifespan: { type: Type.NUMBER, description: "500-2000ms" },
                                frequency: { type: Type.NUMBER, description: "20-100ms" },
                                quantity: { type: Type.NUMBER, description: "1-5 particles" }
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
            
            const prompt = `You are a creative game effects designer. Generate visual effects for text box animations.

STRICT RULES (VIOLATIONS WILL FAIL):
1. Text color: ONLY #000000 (black) or #ffffff (white)
2. Text color selection:
   - Dark backgrounds (0x000000-0x888888): Use #ffffff
   - Light backgrounds (0x999999-0xffffff): Use #000000
3. Font size: 20-48 only
4. Animation path: 1-3 waypoints MAXIMUM
5. X position: 200-1720, Y position: 200-880
6. Duration: 800-2500ms per waypoint
7. Particles are OPTIONAL - omit entire "particles" object for simple messages

PARTICLE RULES (when included):
- Colors: 2-4 hex numbers (e.g., [0xff0000, 0xff6600, 0xffaa00])
- Speed: min 20-100, max 40-150
- Angle: 0-360 degrees
- Scale: start 1-3, end 0-1
- Lifespan: 500-2000ms
- Frequency: 20-100ms
- Quantity: 1-5 particles per emission

THEME GUIDELINES:
- Fire: Red/orange particles (0xcc0000, 0xff4500, 0xff9900), upward angle 250-290
- Ice: Blue/white particles (0x0099ff, 0x66ccff, 0xffffff), downward or outward
- Poison: Green/yellow particles (0x00cc00, 0x66ff00, 0xffff00), bubbling effect
- Energy: Bright particles (0xffff00, 0x00ffff, 0xff00ff), fast speed
- Simple messages: NO particles

EXAMPLES:

Message: "fireball"
Response: {"fontSize":38,"colors":{"text":"#ffffff","background":0xcc0000,"border":0x990000},"animationPath":[{"x":400,"y":400,"duration":1000},{"x":1500,"y":400,"duration":1200,"rotation":3.14}],"particles":{"colors":[0xff0000,0xff6600,0xffaa00],"speed":{"min":60,"max":120},"angle":{"min":250,"max":290},"scale":{"start":2.5,"end":0.5},"lifespan":1200,"frequency":30,"quantity":3}}

Message: "ice shard"
Response: {"fontSize":32,"colors":{"text":"#ffffff","background":0x0066cc,"border":0x004499},"animationPath":[{"x":960,"y":300,"duration":1500},{"x":960,"y":700,"duration":2000}],"particles":{"colors":[0x00ccff,0x66ffff,0xffffff],"speed":{"min":30,"max":60},"angle":{"min":80,"max":100},"scale":{"start":2,"end":0},"lifespan":1500,"frequency":40,"quantity":2}}

Message: "hello there"
Response: {"fontSize":28,"colors":{"text":"#000000","background":0xffffff,"border":0xe5e7eb},"animationPath":[{"x":600,"y":400,"duration":2000},{"x":1300,"y":400,"duration":2000}]}

Message: "BOOM!"
Response: {"fontSize":46,"colors":{"text":"#ffffff","background":0xff4500,"border":0xcc3300},"animationPath":[{"x":960,"y":540,"duration":800,"rotation":6.28}],"particles":{"colors":[0xff0000,0xff6600,0xff9900,0xffcc00],"speed":{"min":80,"max":150},"angle":{"min":0,"max":360},"scale":{"start":3,"end":0},"lifespan":800,"frequency":20,"quantity":5}}

Message: "whisper"
Response: {"fontSize":22,"colors":{"text":"#000000","background":0xcccccc,"border":0x999999},"animationPath":[{"x":800,"y":450,"duration":2500}]}

Message: "poison cloud"
Response: {"fontSize":30,"colors":{"text":"#ffffff","background":0x009900,"border":0x006600},"animationPath":[{"x":700,"y":400,"duration":1800},{"x":1200,"y":500,"duration":2000}],"particles":{"colors":[0x00cc00,0x66ff00,0x99ff33],"speed":{"min":25,"max":50},"angle":{"min":260,"max":280},"scale":{"start":2,"end":3},"lifespan":1800,"frequency":50,"quantity":2}}

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
                fontSize: 28,
                colors: {
                    text: '#000000',
                    background: 0xffffff,
                    border: 0xe5e7eb
                },
                animationPath: [
                    { x: 600, y: 400, duration: 2000 },
                    { x: 1300, y: 400, duration: 2000 }
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

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
                        
                        // Extract effects data to track positions
                        let effectsData = null;
                        let positionInfo = null;
                        if (m.custom && m.custom.effects) {
                            try {
                                effectsData = JSON.parse(m.custom.effects);
                                // Extract position info for overlap prevention
                                if (effectsData.animationPath && effectsData.animationPath.length > 0) {
                                    const firstPos = effectsData.animationPath[0];
                                    positionInfo = {
                                        x: firstPos.x,
                                        y: firstPos.y,
                                        zone: this.getScreenZone(firstPos.x, firstPos.y)
                                    };
                                }
                            } catch (e) {
                                console.error('Failed to parse effects data:', e);
                            }
                        }
                        
                        // Store in conversation history for context with position data
                        this.conversationHistory.push({
                            sender: senderName,
                            text: m.plaintext,
                            timestamp: m.timestamp || Date.now(),
                            position: positionInfo,
                            hasParticles: effectsData?.particles !== undefined
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
                        
                        // effectsData already extracted above for position tracking
                        if (effectsData) {
                            console.log('Received message with effects:', messageText, effectsData);
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
            
            // Build conversation history context with detailed battle context
            let historyContext = '';
            if (this.conversationHistory.length > 0) {
                const recentHistory = this.conversationHistory.slice(-8);
                historyContext = '\n\n=== RECENT BATTLE HISTORY (Last 8 messages) ===\n';
                recentHistory.forEach((msg, index) => {
                    const posInfo = msg.position ? ` [Position: ${msg.position.zone} (${msg.position.x},${msg.position.y})]` : '';
                    const particleInfo = msg.hasParticles ? ' [HAS PARTICLES]' : ' [NO PARTICLES]';
                    historyContext += `[${index + 1}] ${msg.sender}: "${msg.text}"${posInfo}${particleInfo}\n`;
                });
                
                // Analyze battle progression
                const attackKeywords = ['fire', 'ice', 'attack', 'strike', 'blast', 'explosion', 'punch', 'kick', 'shoot', 'throw', 'slash'];
                const defenseKeywords = ['block', 'shield', 'dodge', 'defend', 'counter', 'parry', 'reflect'];
                
                let attackCount = 0;
                let lastAttackType = null;
                recentHistory.forEach(msg => {
                    const text = msg.text.toLowerCase();
                    if (attackKeywords.some(kw => text.includes(kw))) {
                        attackCount++;
                        // Detect element type from last attack
                        if (text.includes('fire') || text.includes('flame') || text.includes('burn')) lastAttackType = 'fire';
                        else if (text.includes('ice') || text.includes('freeze') || text.includes('frost')) lastAttackType = 'ice';
                        else if (text.includes('poison') || text.includes('toxic') || text.includes('venom')) lastAttackType = 'poison';
                        else if (text.includes('lightning') || text.includes('thunder') || text.includes('electric')) lastAttackType = 'electric';
                    }
                });
                
                // Analyze zone usage to help avoid overlaps
                const zoneUsage = {};
                const recentPositions = recentHistory.filter(msg => msg.position).slice(-5); // Last 5 positioned messages
                recentPositions.forEach(msg => {
                    const zone = msg.position.zone;
                    zoneUsage[zone] = (zoneUsage[zone] || 0) + 1;
                });
                
                // Find least used zones
                const allZones = ['left-top', 'left-middle', 'left-bottom', 'center-top', 'center-middle', 'center-bottom', 'right-top', 'right-middle', 'right-bottom'];
                const leastUsedZones = allZones.filter(z => !zoneUsage[z] || zoneUsage[z] < 2);
                
                historyContext += '\n=== BATTLE CONTEXT ANALYSIS ===\n';
                historyContext += `- Battle Intensity: ${attackCount < 2 ? 'LOW (early game)' : attackCount < 4 ? 'MEDIUM (heating up)' : 'HIGH (intense battle)'}\n`;
                if (lastAttackType) {
                    historyContext += `- Last Element Used: ${lastAttackType.toUpperCase()} (consider counter-element)\n`;
                }
                historyContext += `- Message Count: ${recentHistory.length} (more messages = more escalation needed)\n`;
                
                if (recentPositions.length > 0) {
                    historyContext += `- Recent Positions Used: ${recentPositions.map(m => m.position.zone).join(', ')}\n`;
                    if (leastUsedZones.length > 0) {
                        historyContext += `- SUGGESTED ZONES (less crowded): ${leastUsedZones.slice(0, 3).join(', ')}\n`;
                    }
                }
                
                historyContext += '\n=== YOUR OBJECTIVES ===\n';
                historyContext += '1. AVOID OVERLAPPING: Vary X/Y positions from recent messages (spread across screen)\n';
                historyContext += '2. PROGRESSIVE ESCALATION: Each attack should be MORE intense than previous\n';
                historyContext += '3. ELEMENTAL COUNTERS: Fire↔Ice, Lightning↔Earth, Poison↔Holy\n';
                historyContext += '4. POSITION VARIETY: Don\'t cluster all effects in same area\n';
                historyContext += '5. NARRATIVE FLOW: Make this message a logical next step in the battle story\n';
                historyContext += '6. TIMING VARIETY: Alternate between fast strikes (800-1200ms) and dramatic moves (1800-2500ms)\n';
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

CRITICAL: AVOID OVERLAPPING EFFECTS
- Spread effects across screen (vary X positions: left=200-600, center=700-1200, right=1300-1720)
- Alternate Y positions (top=200-400, middle=400-700, bottom=700-880)
- If recent messages used left side, move to center or right
- Don't use same position consecutively

BATTLE STORY COHERENCE:
1. ESCALATION CURVE:
   - Messages 1-2: Small effects (fontSize 20-28, minimal particles)
   - Messages 3-5: Medium effects (fontSize 30-38, moderate particles)
   - Messages 6+: Large effects (fontSize 40-48, intense particles)

2. ELEMENTAL COUNTER-PLAY:
   - Fire (red/orange) → Counter with Ice (blue/white)
   - Ice (blue) → Counter with Fire (red/orange)  
   - Poison (green) → Counter with Holy/Light (yellow/white)
   - Lightning (yellow/cyan) → Counter with Earth (brown/green)
   - Use opposite colors and themes

3. POSITION STORYTELLING:
   - Aggressive attacks: Move toward opponent (x increases if Alice, decreases if Bob)
   - Defensive moves: Stay in place or retreat (single waypoint)
   - Dodges: Quick diagonal movement (2 waypoints, short duration)
   - Ultimate attacks: Center screen (x=960, y=540)

4. TIMING VARIATION:
   - Quick attacks: 800-1200ms duration
   - Normal moves: 1200-1800ms duration  
   - Power moves: 1800-2500ms duration
   - Alternate fast/slow to create rhythm

5. PARTICLE INTENSITY MATCHING:
   - Early game: quantity 1-2, frequency 50-100ms
   - Mid game: quantity 2-3, frequency 30-50ms
   - Late game: quantity 3-5, frequency 20-30ms
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

    /**
     * Helper method to determine screen zone for position tracking
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate  
     * @returns {string} - Zone identifier (e.g., "left-top", "center-middle")
     */
    getScreenZone(x, y) {
        let horizontal = 'center';
        if (x < 600) horizontal = 'left';
        else if (x > 1300) horizontal = 'right';
        
        let vertical = 'middle';
        if (y < 400) vertical = 'top';
        else if (y > 700) vertical = 'bottom';
        
        return `${horizontal}-${vertical}`;
    }
}

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
        
        // Health/HP system
        this.myHealth = 100; // Current player's health
        this.opponentHealth = 100; // Opponent's health
        this.maxHealth = 100; // Maximum health for both players
        this.healthChangeCallback = null; // Callback when health changes
    }

    /**
     * Initialize TalkJS session
     * @param {Function} onMessageReceived - Callback for when new messages arrive
     * @param {Function} onTurnChange - Optional callback for when turn changes (receives boolean isMyTurn)
     * @param {Function} onHealthChange - Optional callback for when health changes (receives {myHealth, opponentHealth})
     */
    async initialize(onMessageReceived, onTurnChange = null, onHealthChange = null) {
        this.messageCallback = onMessageReceived;
        this.turnChangeCallback = onTurnChange;
        this.healthChangeCallback = onHealthChange;

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
                    required: ["effect", "colors", "animationPath", "fontSize", "damage", "moveType"],
                    properties: {
                        damage: {
                            type: Type.NUMBER,
                            description: "Damage dealt to opponent (0-50). 0 for defensive/neutral moves, 5-15 for normal attacks, 16-30 for strong attacks, 31-50 for ultimate attacks"
                        },
                        moveType: {
                            type: Type.STRING,
                            enum: ["attack", "defense", "neutral"],
                            description: "Type of move: 'attack' shoots at opponent, 'defense' stays near caster, 'neutral' for non-combat"
                        },
                        effect: {
                            type: Type.STRING,
                            description: "Particle effect type: 'fire', 'ice', 'poison', 'smoke', or null"
                        },  
                        fontSize: {
                            type: Type.NUMBER,
                            description: "Font size in pixels (18-60). Match to damage/intensity"
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
                            description: "Animation waypoints. For attacks: 2-3 points from caster to opponent. For defense: 1-2 points near caster. NOTE: Path coordinates will be auto-calculated based on moveType, but specify relative motion (straight line, arc, curve)",
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    x: { type: Type.NUMBER, description: "Relative X offset from start (-200 to 200 for variation)" },
                                    y: { type: Type.NUMBER, description: "Relative Y offset from start (-200 to 200 for variation)" },
                                    duration: { type: Type.NUMBER, description: "Duration to reach this point in ms (300-2000). Attacks should be fast (300-800ms), defenses slow (1000-2000ms)" },
                                    rotation: { type: Type.NUMBER, description: "Rotation in radians (0 to 6.28). Use for spinning projectiles" }
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
            
            const prompt = `You are a battle game AI analyzing messages in a PvP word-combat game. Players battle by typing messages that become attacks, defenses, or neutral actions.

GAME MECHANICS:
- Players start with 100 HP
- Messages can deal 0-50 damage to opponent
- Attack moves shoot across screen from caster → opponent
- Defense moves stay near the caster as shields/barriers
- Neutral moves are non-combat (greetings, taunts with 0 damage)

MOVE TYPE CLASSIFICATION:
1. **ATTACK** (moveType: "attack"): Offensive words that hurt opponent
   - Examples: "fireball", "punch", "lightning bolt", "arrow", "EXPLOSION", "smash"
   - Animation: Shoots from caster to opponent (straight line or arc)
   - Damage: 5-50 based on intensity
   - Speed: FAST (300-800ms total duration)

2. **DEFENSE** (moveType: "defense"): Protective words that block/shield
   - Examples: "ice wall", "shield", "barrier", "block", "protect", "dodge"
   - Animation: Appears near caster, stays put or moves slightly
   - Damage: 0 (defensive moves don't damage)
   - Speed: SLOW (1000-2000ms, can be stationary)

3. **NEUTRAL** (moveType: "neutral"): Non-combat messages
   - Examples: "hello", "gg", "nice try", "...", "what?", "lol"
   - Animation: Gentle drift, no target
   - Damage: 0
   - Speed: MEDIUM (1000-1500ms)

DAMAGE CALCULATION GUIDE:
- 0: Defensive/neutral moves, greetings, non-attacks
- 5-10: Weak attacks (poke, tap, small fire)
- 11-20: Normal attacks (punch, fireball, ice shard)
- 21-35: Strong attacks (SMASH, EXPLOSION, lightning)
- 36-50: Ultimate/max attacks (NUCLEAR, ANNIHILATION, all caps with !!!)

ANIMATION PATH RULES:
- Specify RELATIVE offsets (will be calculated to actual screen positions)
- Attacks: Use 2-3 waypoints for projectile trajectory
  * Straight shot: [{x:0, y:0}, {x:0, y:0}] (goes straight to target)
  * Arc shot: [{x:0, y:-100}, {x:0, y:0}] (arcs up then to target)
  * Curve: [{x:50, y:-50}, {x:0, y:0}] (slight curve)
- Defense: 1-2 waypoints near origin
  * Shield: [{x:0, y:0}] (stays at caster)
  * Floating barrier: [{x:0, y:-30}, {x:0, y:30}] (bobs up/down)
- Rotation: Use for spinning (fireballs, shurikens), 0 for no spin

DURATION RULES (CRITICAL FOR REALISM):
- Attacks should be FAST: 300-800ms total (feels like impact)
- Defenses can be slower: 1000-2000ms (shields appear calmly)
- NO easing - use linear motion for physics-like feel
- Faster = more aggressive

COLOR CONTRAST (MUST FOLLOW):
- Dark backgrounds (0x000000-0x888888) → Light text (#ffffff, #ffff00)
- Light backgrounds (0x999999-0xffffff) → Dark text (#000000, #0f172a)

EXAMPLES:

Message: "fireball!"
{
  "damage": 15,
  "moveType": "attack",
  "effect": "fire",
  "fontSize": 32,
  "colors": {"text": "#ffffff", "background": 13369344, "border": 10027008},
  "animationPath": [
    {"x": 0, "y": -50, "duration": 300, "rotation": 2},
    {"x": 0, "y": 0, "duration": 500, "rotation": 6.28}
  ]
}

Message: "ice wall"
{
  "damage": 0,
  "moveType": "defense",
  "effect": "ice",
  "fontSize": 36,
  "colors": {"text": "#ffffff", "background": 52479, "border": 39423},
  "animationPath": [
    {"x": 0, "y": 0, "duration": 1000, "rotation": 0}
  ]
}

Message: "MEGA BLAST!!!"
{
  "damage": 40,
  "moveType": "attack",
  "effect": "fire",
  "fontSize": 48,
  "colors": {"text": "#ffff00", "background": 10027008, "border": 6684672},
  "animationPath": [
    {"x": 0, "y": 0, "duration": 400, "rotation": 0}
  ]
}

Message: "hello"
{
  "damage": 0,
  "moveType": "neutral",
  "effect": null,
  "fontSize": 24,
  "colors": {"text": "#0f172a", "background": 16777215, "border": 15132395},
  "animationPath": [
    {"x": 100, "y": 0, "duration": 1500, "rotation": 0}
  ]
}

Message: "poison cloud"
{
  "damage": 12,
  "moveType": "attack",
  "effect": "poison",
  "fontSize": 30,
  "colors": {"text": "#ffff00", "background": 26112, "border": 13056},
  "animationPath": [
    {"x": 0, "y": 30, "duration": 600, "rotation": 1}
  ]
}

Message: "shield up!"
{
  "damage": 0,
  "moveType": "defense",
  "effect": null,
  "fontSize": 28,
  "colors": {"text": "#ffffff", "background": 3355443, "border": 2236962},
  "animationPath": [
    {"x": 0, "y": -20, "duration": 1200, "rotation": 0},
    {"x": 0, "y": 20, "duration": 1200, "rotation": 0}
  ]
}
${historyContext}

Now analyze this message:
"${message}"

Determine:
1. Is it an ATTACK, DEFENSE, or NEUTRAL move?
2. How much damage (0-50)?
3. What visual effects match the theme?
4. Fast aggressive animation or slow defensive one?

Return ONLY valid JSON.`;


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
            // Fallback to a neutral move with no damage if API fails
            return {
                damage: 0,
                moveType: 'neutral',
                effect: null,
                fontSize: 28,
                colors: {
                    text: '#0f172a',
                    background: 0xffffff,
                    border: 0xe5e7eb
                },
                animationPath: [
                    { x: 0, y: 0, duration: 1500, rotation: 0 }
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
     * Deal damage to a player
     * @param {number} damage - Amount of damage to deal
     * @param {boolean} toOpponent - True to damage opponent, false to damage self
     */
    dealDamage(damage, toOpponent = true) {
        if (toOpponent) {
            this.opponentHealth = Math.max(0, this.opponentHealth - damage);
        } else {
            this.myHealth = Math.max(0, this.myHealth - damage);
        }

        // Notify health change
        if (this.healthChangeCallback) {
            this.healthChangeCallback({
                myHealth: this.myHealth,
                opponentHealth: this.opponentHealth,
                maxHealth: this.maxHealth
            });
        }

        // Check for game over
        if (this.myHealth <= 0 || this.opponentHealth <= 0) {
            this.onGameOver();
        }
    }

    /**
     * Heal a player
     * @param {number} amount - Amount to heal
     * @param {boolean} self - True to heal self, false to heal opponent
     */
    heal(amount, self = true) {
        if (self) {
            this.myHealth = Math.min(this.maxHealth, this.myHealth + amount);
        } else {
            this.opponentHealth = Math.min(this.maxHealth, this.opponentHealth + amount);
        }

        // Notify health change
        if (this.healthChangeCallback) {
            this.healthChangeCallback({
                myHealth: this.myHealth,
                opponentHealth: this.opponentHealth,
                maxHealth: this.maxHealth
            });
        }
    }

    /**
     * Get current health values
     * @returns {Object} - Object with myHealth, opponentHealth, and maxHealth
     */
    getHealth() {
        return {
            myHealth: this.myHealth,
            opponentHealth: this.opponentHealth,
            maxHealth: this.maxHealth
        };
    }

    /**
     * Reset health for both players
     */
    resetHealth() {
        this.myHealth = this.maxHealth;
        this.opponentHealth = this.maxHealth;

        if (this.healthChangeCallback) {
            this.healthChangeCallback({
                myHealth: this.myHealth,
                opponentHealth: this.opponentHealth,
                maxHealth: this.maxHealth
            });
        }
    }

    /**
     * Handle game over logic
     */
    onGameOver() {
        const winner = this.myHealth > 0 ? 'You' : 'Opponent';
        console.log(`Game Over! ${winner} won!`);
        // You can add more game over logic here
    }
}

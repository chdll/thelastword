/**
 * Service to handle TalkJS integration
 */
export class TalkJSService {
    constructor() {
        this.conversation = null;
        this.processedMessages = new Set();
        this.messageCallback = null;
    }

    /**
     * Initialize TalkJS session
     * @param {Function} onMessageReceived - Callback for when new messages arrive
     */
    async initialize(onMessageReceived) {
        this.messageCallback = onMessageReceived;

        try {
            // Get user from URL parameter or default to alice
            const urlParams = new URLSearchParams(window.location.search);
            const currentUserId = urlParams.get('user') || 'alice';
            
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
            
            const me = users[currentUserId];
            const other = currentUserId === 'alice' ? users.bob : users.alice;
            
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
                    required: ["effect", "colors", "animationPath"],
                    properties: {
                        effect: {
                            type: Type.STRING,
                            description: "Particle effect type: 'fire', 'ice', 'poison', 'smoke', or null"
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
            
            const prompt = `You are a creative game effects designer. Analyze the user's message and generate thematic visual effects for a text box animation.

IMPORTANT RULES:
1. Match the theme/mood of the message (fire for hot/explosive words, ice for cold/calm, poison for toxic/negative, smoke for mysterious)
2. Choose colors that enhance the theme (fire = reds/oranges, ice = blues/cyans, poison = greens, smoke = grays)
3. Create animation paths that match the energy (fast/aggressive for attacks, slow/flowing for calm, erratic for chaos)
4. Use effects sparingly - only when truly thematic. Many messages won't need special effects.
5. Animation coordinates: x (200-1700), y (200-800) for safe visibility
6. Duration: 500-3000ms per waypoint (faster for aggressive, slower for calm)
7. Rotation: 0 (no rotation) to 6.28 (full rotation) - use sparingly

EXAMPLES:

Message: "fireball"
Response: {"effect":"fire","colors":{"text":"#ffffff","background":16711680,"border":13369344},"animationPath":[{"x":400,"y":400,"duration":800,"rotation":0},{"x":1500,"y":400,"duration":1200,"rotation":3.14}]}

Message: "ice shard"
Response: {"effect":"ice","colors":{"text":"#ffffff","background":52479,"border":39423},"animationPath":[{"x":960,"y":300,"duration":1500,"rotation":0},{"x":960,"y":600,"duration":2000,"rotation":0.5}]}

Message: "hello there"
Response: {"effect":null,"colors":{"text":"#0f172a","background":16777215,"border":15132395},"animationPath":[{"x":500,"y":400,"duration":2000,"rotation":0},{"x":1400,"y":400,"duration":2500,"rotation":0}]}

Message: "toxic waste"
Response: {"effect":"poison","colors":{"text":"#00ff00","background":52224,"border":39168},"animationPath":[{"x":800,"y":400,"duration":1800,"rotation":0},{"x":600,"y":600,"duration":1500,"rotation":1.57},{"x":1200,"y":500,"duration":1800,"rotation":3.14}]}

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
     * @returns {Promise<Object|null>} - The processed data from Gemini (if processWithAPI is true)
     */
    async sendMessage(message, processWithAPI = true) {
        if (!this.conversation || !message.trim()) {
            return null;
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
            
            // Return the processed data so the caller can use it for animations
            return processedData;
            
        } catch (error) {
            console.error('Error sending message:', error);
            // Send original message as fallback
            this.conversation.send(message);
            return null;
        }
    }
}

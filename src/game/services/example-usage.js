/**
 * Example usage of TalkJSService with Gemini API integration
 */

import { TalkJSService } from './TalkJSService.js';

// Initialize the service
const talkJSService = new TalkJSService();

// Callback function for receiving messages
function handleIncomingMessage(message) {
    console.log('Received message:', message);
    // Update your game UI here
}

// Initialize TalkJS
await talkJSService.initialize(handleIncomingMessage);

// Example 1: Send a message with Gemini processing (default)
const processedData = await talkJSService.sendMessage("Hello, this is a test message!");

if (processedData) {
    // Use the processed data from Gemini for animations/effects
    console.log('Animation path:', processedData.animationPath);
    console.log('Colour:', processedData.colour);
    console.log('Size:', processedData.size);
    console.log('Impact effect:', processedData.impact_effect);
    console.log('Vibration:', processedData.vibration);
    
    // Apply the effects to your game
    // applyAnimation(processedData.animationPath);
    // setColour(processedData.colour);
    // triggerVibration(processedData.vibration);
}

// Example 2: Send a message without Gemini processing
await talkJSService.sendMessage("Quick message without effects", false);

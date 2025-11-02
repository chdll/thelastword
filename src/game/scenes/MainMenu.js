import { Scene } from 'phaser';
import { TalkJSService } from '../services/TalkJSService.js';
import { TextBoxCreator } from '../utils/TextBoxCreator.js';
import { UIManager } from '../ui/UIManager.js';

export class MainMenu extends Scene
{
    constructor ()
    {
        super('MainMenu');
    }

    preload ()
    {
        // Load the background image
        // this.load.image('awesome hacker', 'assets/proxy-image.jpeg');
        this.load.image('wizard 1', 'assets/wizard_idle_1.png');
        this.load.image('wizard 2', 'assets/wizard_idle_2.png');
    }

    create ()
    {
        this.textBoxes = []; // Store all created text boxes for cleanup
        this.currentDepth = 10; // Start depth for layering text boxes
        
        // Initialize services
        this.talkJSService = new TalkJSService();
        this.textBoxCreator = new TextBoxCreator(this);
        this.uiManager = new UIManager(this);
        
        // Create turn indicator UI
        this.createTurnIndicator();
        
        // Add background image
        // this.add.image(window.innerWidth / 2, window.innerHeight / 2, 'awesome hacker');
        var player1 = this.add.image(window.innerWidth / 4, window.innerHeight - window.innerHeight / 3, 'wizard 1');
        var player2 = this.add.image(window.innerWidth - window.innerWidth / 4, window.innerHeight - window.innerHeight / 3, 'wizard 1').setFlipX(true);
        player1.setScale(0.5);
        player2.setScale(0.5);
        
        // Animate wizards by alternating between idle frames
        let currentFrame = 1;
        this.time.addEvent({
            delay: 500, // 0.5 seconds
            callback: () => {
                currentFrame = currentFrame === 1 ? 2 : 1;
                const texture = `wizard ${currentFrame}`;
                player1.setTexture(texture);
                player2.setTexture(texture);
            },
            loop: true
        });
        
        // Create input box with Gemini API processing
        this.uiManager.createInputBox(async (message) => {
            // Check if it's the player's turn before sending
            if (!this.talkJSService.canSendMessage()) {
                console.warn('Not your turn! Wait for the other player.');
                this.showTurnWarning();
                return;
            }
            
            // Process message through Gemini and send to TalkJS
            // Effects data will be embedded in the message and synced to both clients
            const result = await this.talkJSService.sendMessage(message);
            
            // Handle turn error
            if (result && result.error === 'NOT_YOUR_TURN') {
                this.showTurnWarning();
            }
        });
        
        // Initialize TalkJS with callback for new messages and turn changes
        this.talkJSService.initialize(
            (messageText, effectsData) => {
                this.createAnimatedTextBox(messageText, effectsData);
            },
            (isMyTurn) => {
                // Update UI based on turn state
                this.updateTurnIndicator(isMyTurn);
            }
        );
        
        // Cleanup on scene shutdown
        this.events.once('shutdown', () => {
            this.uiManager.destroy();
            this.textBoxes.forEach(box => this.cleanupTextBox(box));
            this.textBoxes = [];
        });
    }
    
    createAnimatedTextBox(label, effectsData = null) {
        // Get input box position and increment depth
        const startPosition = this.uiManager.getInputBoxPosition();
        this.currentDepth += 2;
        
        // Build options object from Gemini effects data (now synced from TalkJS)
        const options = {};
        
        if (effectsData) {
            console.log('Applying synced Gemini effects to message:', label, effectsData);
            
            // Apply font size
            if (effectsData.fontSize) {
                options.fontSize = effectsData.fontSize;
            }
            // Apply colors
            if (effectsData.colors) {
                options.colors = effectsData.colors;
            }
            // Apply animation path
            if (effectsData.animationPath && effectsData.animationPath.length > 0) {
                options.animationPath = effectsData.animationPath;
            }
            // Apply custom particle config from Gemini
            if (effectsData.particles) {
                options.particles = effectsData.particles;
            }
        }
        
        // Create the animated text box using the TextBoxCreator with Gemini-generated options
        const box = this.textBoxCreator.create(label, startPosition, this.currentDepth, options);
        
        // Store reference for cleanup
        this.textBoxes.push(box);
        
        // Clean up old text boxes if there are too many (performance optimization)
        if (this.textBoxes.length > 20) {
            const oldBox = this.textBoxes.shift();
            this.cleanupTextBox(oldBox);
        }
    }
    
    cleanupTextBox(box) {
        if (box.text) box.text.destroy();
        if (box.gfx) box.gfx.destroy();
        if (box.container) box.container.destroy();
        if (box.tween) box.tween.stop();
        if (box.particles) box.particles.destroy();
    }

    createTurnIndicator() {
        // Create turn indicator at the top of the screen
        this.turnIndicator = this.add.text(
            window.innerWidth / 2,
            30,
            'Your turn',
            {
                fontSize: '24px',
                fontFamily: 'Arial',
                color: '#22c55e',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 4
            }
        ).setOrigin(0.5).setDepth(1000);
    }

    updateTurnIndicator(isMyTurn) {
        if (!this.turnIndicator) return;
        
        if (isMyTurn) {
            this.turnIndicator.setText('Your turn');
            this.turnIndicator.setColor('#22c55e'); // Green
            
            // Enable input
            this.uiManager.setInputEnabled(true);
        } else {
            this.turnIndicator.setText('Waiting for opponent...');
            this.turnIndicator.setColor('#ef4444'); // Red
            
            // Disable input
            this.uiManager.setInputEnabled(false);
        }
    }

    showTurnWarning() {
        // Show a temporary warning message
        const warning = this.add.text(
            window.innerWidth / 2,
            window.innerHeight / 2,
            'Not your turn!\nWait for opponent to respond.',
            {
                fontSize: '32px',
                fontFamily: 'Arial',
                color: '#ef4444',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 6,
                align: 'center'
            }
        ).setOrigin(0.5).setDepth(2000);

        // Fade out and destroy after 2 seconds
        this.tweens.add({
            targets: warning,
            alpha: 0,
            duration: 2000,
            ease: 'Power2',
            onComplete: () => warning.destroy()
        });
    }
}

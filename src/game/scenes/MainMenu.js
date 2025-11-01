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
        this.load.image('awesome hacker', 'assets/proxy-image.jpeg');
    }

    create ()
    {
        this.textBoxes = []; // Store all created text boxes for cleanup
        this.currentDepth = 10; // Start depth for layering text boxes
        
        // Initialize services
        this.talkJSService = new TalkJSService();
        this.textBoxCreator = new TextBoxCreator(this);
        this.uiManager = new UIManager(this);
        
        // Add background image
        this.add.image(window.innerWidth / 2, window.innerHeight / 2, 'awesome hacker');
        
        // Create static text box example
        const centerX = window.innerWidth / 2 - 100;
        const centerY = window.innerHeight / 2 + 200;
        this.uiManager.createStaticTextBox(centerX, centerY, 'awesome hacker');
        
        // Create input box
        this.uiManager.createInputBox((message) => {
            this.talkJSService.sendMessage(message);
        });
        
        // Initialize TalkJS with callback for new messages
        this.talkJSService.initialize((messageText) => {
            this.createAnimatedTextBox(messageText);
        });
        
        // Cleanup on scene shutdown
        this.events.once('shutdown', () => {
            this.uiManager.destroy();
            this.textBoxes.forEach(box => {
                if (box.text) box.text.destroy();
                if (box.gfx) box.gfx.destroy();
                if (box.container) box.container.destroy();
                if (box.tween) box.tween.stop();
            });
            this.textBoxes = [];
        });
    }
    
    createAnimatedTextBox(label) {
        // Get input box position and increment depth
        const startPosition = this.uiManager.getInputBoxPosition();
        this.currentDepth += 2;
        
        // Create the animated text box using the TextBoxCreator
        const box = this.textBoxCreator.create(label, startPosition, this.currentDepth);
        
        // Store reference for cleanup
        this.textBoxes.push(box);
    }
}

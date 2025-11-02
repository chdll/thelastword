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
        
        // Player positions - FIXED: Alice always left, Bob always right
        this.alicePosition = { x: window.innerWidth / 4, y: window.innerHeight - window.innerHeight / 3 };
        this.bobPosition = { x: window.innerWidth - window.innerWidth / 4, y: window.innerHeight - window.innerHeight / 3 };
        
        // Initialize services
        this.talkJSService = new TalkJSService();
        this.textBoxCreator = new TextBoxCreator(this);
        this.uiManager = new UIManager(this);
        
        // Create turn indicator UI
        this.createTurnIndicator();
        
        // Create HP bars for both players
        this.createHPBars();
        
        // TEMPORARY: Add test buttons to damage players (for testing)
        this.createTestButtons();
        
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
            },
            (healthData) => {
                // Update HP bars when health changes
                this.updateHPBars(healthData);
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
        this.currentDepth += 2;
        
        // Extract sender info from label (format: "SenderName: message")
        const senderMatch = label.match(/^(.*?):\s*/);
        const senderName = senderMatch ? senderMatch[1].trim() : 'Unknown';
        
        // Determine if this is my message for damage calculation
        const isMyMessage = senderName === this.talkJSService.currentUserId || 
                           (this.talkJSService.currentUserId === 'alice' && senderName === 'Alice') ||
                           (this.talkJSService.currentUserId === 'bob' && senderName === 'Bob');
        
        // Messages always start from the input box at bottom center
        const inputPosition = this.uiManager.getInputBoxPosition();
        
        // FIXED: Determine positions based on SENDER NAME, not viewer
        // Alice is ALWAYS on the left, Bob is ALWAYS on the right
        let senderPosition;
        let targetPosition;
        
        const isAliceSender = senderName === 'Alice' || senderName === 'alice';
        
        if (isAliceSender) {
            // Alice's messages: start from left, target right (Bob)
            senderPosition = { ...this.alicePosition };
            targetPosition = { ...this.bobPosition };
        } else {
            // Bob's messages: start from right, target left (Alice)
            senderPosition = { ...this.bobPosition };
            targetPosition = { ...this.alicePosition };
        }
        
        // Build options object from Gemini effects data
        const options = {};
        let damage = 0;
        let moveType = 'neutral';
        
        if (effectsData) {
            console.log('Applying Gemini effects to message:', label, effectsData);
            
            // Extract damage and moveType
            damage = effectsData.damage || 0;
            moveType = effectsData.moveType || 'neutral';
            
            // Handle effect
            if (effectsData.effect && effectsData.effect !== 'null' && effectsData.effect !== null) {
                options.effect = effectsData.effect;
            }
            
            // Apply font size
            if (effectsData.fontSize) {
                options.fontSize = effectsData.fontSize;
            }
            
            // Apply colors
            if (effectsData.colors) {
                options.colors = effectsData.colors;
            }
        }
        
        // Build two-stage animation path based on moveType
        const animationPath = [];
        
        // Stage 1: Move from input box to sender's position (1 second)
        animationPath.push({
            x: senderPosition.x,
            y: senderPosition.y,
            duration: 1000,
            rotation: 0
        });
        
        // Stage 2: Depends on moveType
        if (moveType === 'attack') {
            // Attack: Shoot across to opponent (1.5-2 seconds for readability)
            const relativeOffsets = effectsData?.animationPath?.[0] || { x: 0, y: 0 };
            animationPath.push({
                x: targetPosition.x + relativeOffsets.x,
                y: targetPosition.y + relativeOffsets.y,
                duration: 1800, // Slower so text is readable
                rotation: effectsData?.animationPath?.[0]?.rotation || 0
            });
        } else if (moveType === 'defense') {
            // Defense: Stay near sender or move slightly (slow)
            const offsetY = effectsData?.animationPath?.[0]?.y || -50;
            animationPath.push({
                x: senderPosition.x,
                y: senderPosition.y + offsetY,
                duration: 1500,
                rotation: 0
            });
        } else {
            // Neutral: Gentle upward drift
            animationPath.push({
                x: senderPosition.x + (Math.random() * 200 - 100),
                y: senderPosition.y - 150,
                duration: 2000,
                rotation: 0
            });
        }
        
        options.animationPath = animationPath;
        
        // Create the animated text box starting from input position
        const box = this.textBoxCreator.create(label, inputPosition, this.currentDepth, options);
        
        // Set up cleanup based on moveType
        if (moveType === 'attack' && box.tween) {
            // For attacks: deal damage and destroy on impact
            box.tween.on('complete', () => {
                // Deal damage to the appropriate target
                if (isMyMessage) {
                    // My attack damages opponent
                    this.talkJSService.dealDamage(damage, true);
                    this.showDamageNumber(targetPosition, damage);
                } else {
                    // Opponent's attack damages me
                    this.talkJSService.dealDamage(damage, false);
                    this.showDamageNumber(targetPosition, damage);
                }
                
                // Fade out and destroy after impact
                this.fadeOutAndDestroy(box);
            });
        } else if (moveType === 'defense') {
            // Defense moves stay for a while then fade out
            this.time.delayedCall(4000, () => {
                this.fadeOutAndDestroy(box);
            });
        } else {
            // Neutral moves fade out after a bit
            this.time.delayedCall(5000, () => {
                this.fadeOutAndDestroy(box);
            });
        }
        
        // Store reference for cleanup
        this.textBoxes.push(box);
        
        // Clean up old text boxes if there are too many
        if (this.textBoxes.length > 20) {
            const oldBox = this.textBoxes.shift();
            this.cleanupTextBox(oldBox);
        }
    }
    
    /**
     * Fade out and destroy a text box
     */
    fadeOutAndDestroy(box) {
        const targets = [box.text, box.container].filter(t => t && t.active);
        
        if (targets.length === 0) return;
        
        this.tweens.add({
            targets: targets,
            alpha: 0,
            scale: 0.5,
            duration: 300,
            ease: 'Power2',
            onComplete: () => {
                this.cleanupTextBox(box);
                // Remove from textBoxes array
                const index = this.textBoxes.indexOf(box);
                if (index > -1) {
                    this.textBoxes.splice(index, 1);
                }
            }
        });
    }

    /**
     * Show damage number when attack hits
     */
    showDamageNumber(position, damage) {
        const damageText = this.add.text(
            position.x,
            position.y - 50,
            `-${damage}`,
            {
                fontSize: `${Math.min(48, 24 + damage)}px`,
                fontFamily: 'Arial',
                color: '#ff0000',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 4
            }
        ).setOrigin(0.5).setDepth(3000);
        
        // Float up and fade out
        this.tweens.add({
            targets: damageText,
            y: position.y - 150,
            alpha: 0,
            duration: 1500,
            ease: 'Power2',
            onComplete: () => damageText.destroy()
        });
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

    createHPBars() {
        const barWidth = 300;
        const barHeight = 30;
        const barY = 80;
        const padding = 50;

        // Alice HP Bar (Left side - ALWAYS Alice)
        this.aliceHPBarBg = this.add.rectangle(
            padding + barWidth / 2,
            barY,
            barWidth,
            barHeight,
            0x000000
        ).setDepth(999);

        this.aliceHPBar = this.add.rectangle(
            padding,
            barY,
            barWidth,
            barHeight - 4,
            0x22c55e  // Green
        ).setOrigin(0, 0.5).setDepth(1000);

        this.aliceHPText = this.add.text(
            padding + barWidth / 2,
            barY,
            '100 / 100',
            {
                fontSize: '18px',
                fontFamily: 'Arial',
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }
        ).setOrigin(0.5).setDepth(1001);

        this.aliceHPLabel = this.add.text(
            padding + barWidth / 2,
            barY - 25,
            'Alice HP',
            {
                fontSize: '16px',
                fontFamily: 'Arial',
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }
        ).setOrigin(0.5).setDepth(1001);

        // Bob HP Bar (Right side - ALWAYS Bob)
        const bobX = window.innerWidth - padding - barWidth;
        
        this.bobHPBarBg = this.add.rectangle(
            bobX + barWidth / 2,
            barY,
            barWidth,
            barHeight,
            0x000000
        ).setDepth(999);

        this.bobHPBar = this.add.rectangle(
            bobX,
            barY,
            barWidth,
            barHeight - 4,
            0xef4444  // Red
        ).setOrigin(0, 0.5).setDepth(1000);

        this.bobHPText = this.add.text(
            bobX + barWidth / 2,
            barY,
            '100 / 100',
            {
                fontSize: '18px',
                fontFamily: 'Arial',
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }
        ).setOrigin(0.5).setDepth(1001);

        this.bobHPLabel = this.add.text(
            bobX + barWidth / 2,
            barY - 25,
            'Bob HP',
            {
                fontSize: '16px',
                fontFamily: 'Arial',
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }
        ).setOrigin(0.5).setDepth(1001);
    }

    updateHPBars(healthData) {
        const { myHealth, opponentHealth, maxHealth } = healthData;
        const barWidth = 300;
        
        // Determine which player I am
        const isAlice = this.talkJSService.currentUserId === 'alice';
        
        let aliceHealth, bobHealth;
        if (isAlice) {
            aliceHealth = myHealth;
            bobHealth = opponentHealth;
        } else {
            aliceHealth = opponentHealth;
            bobHealth = myHealth;
        }

        // Update Alice HP bar (left)
        const aliceHealthPercent = aliceHealth / maxHealth;
        this.aliceHPBar.width = barWidth * aliceHealthPercent;
        this.aliceHPText.setText(`${aliceHealth} / ${maxHealth}`);

        // Change color based on health
        if (aliceHealthPercent > 0.6) {
            this.aliceHPBar.setFillStyle(0x22c55e); // Green
        } else if (aliceHealthPercent > 0.3) {
            this.aliceHPBar.setFillStyle(0xfbbf24); // Yellow
        } else {
            this.aliceHPBar.setFillStyle(0xef4444); // Red
        }

        // Update Bob HP bar (right)
        const bobHealthPercent = bobHealth / maxHealth;
        this.bobHPBar.width = barWidth * bobHealthPercent;
        this.bobHPText.setText(`${bobHealth} / ${maxHealth}`);

        // Change color based on health
        if (bobHealthPercent > 0.6) {
            this.bobHPBar.setFillStyle(0xef4444); // Red (Bob's color)
        } else if (bobHealthPercent > 0.3) {
            this.bobHPBar.setFillStyle(0xf97316); // Orange
        } else {
            this.bobHPBar.setFillStyle(0xdc2626); // Dark red
        }

        // Check for game over
        if (myHealth <= 0 || opponentHealth <= 0) {
            this.showGameOver(myHealth > 0);
        }
    }

    showGameOver(youWon) {
        const message = youWon ? 'YOU WIN!' : 'YOU LOSE!';
        const color = youWon ? '#22c55e' : '#ef4444';

        const gameOverText = this.add.text(
            window.innerWidth / 2,
            window.innerHeight / 2,
            message,
            {
                fontSize: '64px',
                fontFamily: 'Arial',
                color: color,
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 8
            }
        ).setOrigin(0.5).setDepth(3000);

        // Pulse animation
        this.tweens.add({
            targets: gameOverText,
            scale: 1.2,
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    createTestButtons() {
        // TEMPORARY: Test buttons to damage players
        const buttonY = 130;
        
        // Button to damage opponent
        const damageOpponentBtn = this.add.text(
            150,
            buttonY,
            'Damage Opponent (-10)',
            {
                fontSize: '16px',
                fontFamily: 'Arial',
                color: '#ffffff',
                backgroundColor: '#dc2626',
                padding: { x: 10, y: 5 }
            }
        ).setInteractive().setDepth(1002);

        damageOpponentBtn.on('pointerdown', () => {
            this.talkJSService.dealDamage(10, true);
        });

        // Button to damage self
        const damageSelfBtn = this.add.text(
            150,
            buttonY + 30,
            'Damage Self (-10)',
            {
                fontSize: '16px',
                fontFamily: 'Arial',
                color: '#ffffff',
                backgroundColor: '#7c2d12',
                padding: { x: 10, y: 5 }
            }
        ).setInteractive().setDepth(1002);

        damageSelfBtn.on('pointerdown', () => {
            this.talkJSService.dealDamage(10, false);
        });

        // Button to heal self
        const healBtn = this.add.text(
            150,
            buttonY + 60,
            'Heal Self (+20)',
            {
                fontSize: '16px',
                fontFamily: 'Arial',
                color: '#ffffff',
                backgroundColor: '#22c55e',
                padding: { x: 10, y: 5 }
            }
        ).setInteractive().setDepth(1002);

        healBtn.on('pointerdown', () => {
            this.talkJSService.heal(20, true);
        });

        // Button to reset health
        const resetBtn = this.add.text(
            150,
            buttonY + 90,
            'Reset Health',
            {
                fontSize: '16px',
                fontFamily: 'Arial',
                color: '#ffffff',
                backgroundColor: '#3b82f6',
                padding: { x: 10, y: 5 }
            }
        ).setInteractive().setDepth(1002);

        resetBtn.on('pointerdown', () => {
            this.talkJSService.resetHealth();
        });
    }
}

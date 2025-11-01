import { Scene } from 'phaser';

export class MainMenu extends Scene
{
    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        this.textBoxes = []; // Store all created text boxes for cleanup
        this.currentDepth = 10; // Start depth for layering text boxes
        this.load.image('awesome hacker', 'assets/proxy-image.jpeg');
        this.add.image(window.innerWidth / 2, window.innerHeight / 2, 'awesome hacker');
        // Modern rounded textbox with drop shadow
        const centerX = window.innerWidth / 2 - 100;
        const centerY = window.innerHeight / 2 + 200;
        const label = 'awesome hacker';

        const text = this.add.text(centerX, centerY, label, {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '28px',
            color: '#0f172a',
            align: 'center',
        }).setOrigin(0.5);

        const paddingX = 24;
        const paddingY = 12;
        const radius = 16;

        const bw = Math.ceil(text.width + paddingX * 2);
        const bh = Math.ceil(text.height + paddingY * 2);

        const gfx = this.add.graphics();

        // Drop shadow
        gfx.fillStyle(0x0f172a, 0.2);
        gfx.fillRoundedRect(centerX - bw / 2 + 4, centerY - bh / 2 + 6, bw, bh, radius);

        // Background
        gfx.fillStyle(0xffffff, 1);
        gfx.fillRoundedRect(centerX - bw / 2, centerY - bh / 2, bw, bh, radius);

        // Subtle border
        gfx.lineStyle(2, 0xe5e7eb, 1);
        gfx.strokeRoundedRect(centerX - bw / 2, centerY - bh / 2, bw, bh, radius);

        // Ensure text is above background
        gfx.setDepth(1);
        text.setDepth(2);
        
        // Add input box at the bottom
        const inputHtml = `
            <div class="menu-input">
                <input type="text" id="textInput" placeholder="Type here and press Enter..." />
            </div>
        `;
        
        const dom = this.add.dom(0, 0).createFromHTML(inputHtml);
        const bottomOffset = 40;
        
        const repositionInput = (size) => {
            const { width, height } = size;
            dom.setPosition(width / 2, height - bottomOffset);
        };
        
        dom.setOrigin(0.5, 1);
        dom.setDepth(5);
        repositionInput(this.scale.gameSize);
        this.scale.on('resize', repositionInput);
        
        // Get the input element
        const inputElement = dom.getChildByID('textInput');
        
        // Handle Enter key to create animated text box
        inputElement.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                const inputValue = inputElement.value.trim();
                if (inputValue) {
                    this.createAnimatedTextBox(inputValue);
                    inputElement.value = ''; // Clear input
                }
            }
        });
        
        // Cleanup on scene shutdown
        this.events.once('shutdown', () => {
            this.scale.off('resize', repositionInput);
            dom.destroy();
            this.textBoxes.forEach(box => {
                if (box.text) box.text.destroy();
                if (box.gfx) box.gfx.destroy();
                if (box.tween) box.tween.stop();
            });
            this.textBoxes = [];
        });
    }
    
    createAnimatedTextBox(label) {
        // Create text box similar to the existing "awesome hacker" one
        const paddingX = 24;
        const paddingY = 12;
        const radius = 16;
        
        // Calculate text dimensions first to prevent clipping
        const tempText = this.add.text(0, 0, label, {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '28px',
            color: '#0f172a',
            align: 'center',
        }).setOrigin(0.5);
        
        const bw = Math.ceil(tempText.width + paddingX * 2);
        const bh = Math.ceil(tempText.height + paddingY * 2);
        tempText.destroy();
        
        // Calculate safe boundaries to prevent text clipping
        const margin = Math.max(bw, bh) / 2 + 20;
        const minX = margin;
        const maxX = window.innerWidth - margin;
        const minY = margin;
        const maxY = window.innerHeight - 100; // Extra space for input box at bottom
        
        // Random starting position within safe boundaries
        const startX = Phaser.Math.Between(minX, maxX);
        const startY = Phaser.Math.Between(minY, maxY);
        
        const text = this.add.text(startX, startY, label, {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '28px',
            color: '#0f172a',
            align: 'center',
        }).setOrigin(0.5);
        
        const gfx = this.add.graphics();
        
        // Increment depth for each new text box so newer ones appear on top
        this.currentDepth += 2;
        const gfxDepth = this.currentDepth;
        const textDepth = this.currentDepth + 1;
        
        // Drop shadow
        gfx.fillStyle(0x0f172a, 0.2);
        gfx.fillRoundedRect(startX - bw / 2 + 4, startY - bh / 2 + 6, bw, bh, radius);
        
        // Background
        gfx.fillStyle(0xffffff, 1);
        gfx.fillRoundedRect(startX - bw / 2, startY - bh / 2, bw, bh, radius);
        
        // Subtle border
        gfx.lineStyle(2, 0xe5e7eb, 1);
        gfx.strokeRoundedRect(startX - bw / 2, startY - bh / 2, bw, bh, radius);
        
        gfx.setDepth(gfxDepth);
        text.setDepth(textDepth);
        
        // Create animation path - random movement within safe boundaries
        const targetX = Phaser.Math.Between(minX, maxX);
        const targetY = Phaser.Math.Between(minY, maxY);
        
        const duration = Phaser.Math.Between(2000, 4000);
        
        // Animate text
        const textTween = this.tweens.add({
            targets: text,
            x: targetX,
            y: targetY,
            duration: duration,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });
        
        // Animate graphics to follow text
        this.tweens.add({
            targets: { x: startX, y: startY },
            x: targetX,
            y: targetY,
            duration: duration,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
            onUpdate: (tween, target) => {
                gfx.clear();
                
                // Drop shadow
                gfx.fillStyle(0x0f172a, 0.2);
                gfx.fillRoundedRect(target.x - bw / 2 + 4, target.y - bh / 2 + 6, bw, bh, radius);
                
                // Background
                gfx.fillStyle(0xffffff, 1);
                gfx.fillRoundedRect(target.x - bw / 2, target.y - bh / 2, bw, bh, radius);
                
                // Subtle border
                gfx.lineStyle(2, 0xe5e7eb, 1);
                gfx.strokeRoundedRect(target.x - bw / 2, target.y - bh / 2, bw, bh, radius);
            }
        });
        
        // Store references for cleanup
        this.textBoxes.push({ text, gfx, tween: textTween });
    }
}

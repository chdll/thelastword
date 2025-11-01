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
        
        // Store input position for text box emergence animation
        this.inputBoxPosition = {
            x: window.innerWidth / 2,
            y: window.innerHeight - bottomOffset
        };
        
        // Update input position on resize
        this.scale.on('resize', (size) => {
            this.inputBoxPosition.x = size.width / 2;
            this.inputBoxPosition.y = size.height - bottomOffset;
        });
        
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
                if (box.container) box.container.destroy();
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
        
        // Start from input box position
        const startX = this.inputBoxPosition.x;
        const startY = this.inputBoxPosition.y;
        
        // Target position for initial emergence
        const emergenceX = Phaser.Math.Between(minX, maxX);
        const emergenceY = Phaser.Math.Between(minY, maxY);
        
        // Final looping position
        const loopTargetX = Phaser.Math.Between(minX, maxX);
        const loopTargetY = Phaser.Math.Between(minY, maxY);
        
        const text = this.add.text(startX, startY, label, {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '28px',
            color: '#0f172a',
            align: 'center',
        }).setOrigin(0.5);
        
        // Start with scale 0 for emergence effect
        text.setScale(0);
        text.setAlpha(0);
        
        const gfx = this.add.graphics();
        
        // Increment depth for each new text box so newer ones appear on top
        this.currentDepth += 2;
        const gfxDepth = this.currentDepth;
        const textDepth = this.currentDepth + 1;
        
        gfx.setDepth(gfxDepth);
        text.setDepth(textDepth);
        
        // Create a container for the graphics background
        const container = this.add.container(startX, startY);
        
        // Draw graphics at local position (0,0) relative to container
        const drawGraphics = () => {
            gfx.clear();
            
            // Drop shadow
            gfx.fillStyle(0x0f172a, 0.2);
            gfx.fillRoundedRect(-bw / 2 + 4, -bh / 2 + 6, bw, bh, radius);
            
            // Background
            gfx.fillStyle(0xffffff, 1);
            gfx.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, radius);
            
            // Subtle border
            gfx.lineStyle(2, 0xe5e7eb, 1);
            gfx.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, radius);
        };
        
        drawGraphics();
        
        // Add graphics to container
        container.add(gfx);
        container.setDepth(gfxDepth);
        
        // Set container initial state
        container.setScale(0);
        container.setAlpha(0);
        
        // Phase 1: Emerge from input box with scale and fade in
        this.tweens.add({
            targets: [text, container],
            x: emergenceX,
            y: emergenceY,
            scale: 1,
            alpha: 1,
            duration: 800,
            ease: 'Back.easeOut',
            onComplete: () => {
                // Phase 2: Start looping animation
                const duration = Phaser.Math.Between(2000, 4000);
                
                const textTween = this.tweens.add({
                    targets: [text, container],
                    x: loopTargetX,
                    y: loopTargetY,
                    duration: duration,
                    ease: 'Sine.easeInOut',
                    yoyo: true,
                    repeat: -1
                });
                
                // Update stored reference with the looping tween
                const boxIndex = this.textBoxes.findIndex(box => box.text === text);
                if (boxIndex !== -1) {
                    this.textBoxes[boxIndex].tween = textTween;
                }
            }
        });
        
        // Store references for cleanup (initial tween will be replaced after emergence)
        this.textBoxes.push({ text, gfx, container, tween: null });
    }
}

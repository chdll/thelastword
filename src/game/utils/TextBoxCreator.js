/**
 * Utility class for creating animated text boxes
 */
export class TextBoxCreator {
    constructor(scene) {
        this.scene = scene;
        this.paddingX = 24;
        this.paddingY = 12;
        this.radius = 16;
    }

    /**
     * Create an animated text box that emerges from a position and loops
     * @param {string} label - The text to display
     * @param {object} startPosition - Starting position {x, y}
     * @param {number} currentDepth - The depth for layering
     * @returns {object} - Returns {text, gfx, container, tween}
     */
    create(label, startPosition, currentDepth) {
        // Calculate text dimensions
        const { width: bw, height: bh } = this.calculateDimensions(label);
        
        // Calculate safe boundaries
        const bounds = this.calculateSafeBounds(bw, bh);
        
        // Generate random positions for animation
        const emergenceX = Phaser.Math.Between(bounds.minX, bounds.maxX);
        const emergenceY = Phaser.Math.Between(bounds.minY, bounds.maxY);
        const loopTargetX = Phaser.Math.Between(bounds.minX, bounds.maxX);
        const loopTargetY = Phaser.Math.Between(bounds.minY, bounds.maxY);
        
        // Create text element
        const text = this.scene.add.text(startPosition.x, startPosition.y, label, {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '28px',
            color: '#0f172a',
            align: 'center',
        }).setOrigin(0.5);
        
        text.setScale(0);
        text.setAlpha(0);
        
        // Create graphics container
        const { gfx, container } = this.createGraphicsContainer(
            startPosition.x, 
            startPosition.y, 
            bw, 
            bh, 
            currentDepth
        );
        
        text.setDepth(currentDepth + 1);
        
        // Animate the text box
        const tween = this.animateTextBox(
            text, 
            container, 
            emergenceX, 
            emergenceY, 
            loopTargetX, 
            loopTargetY
        );
        
        return { text, gfx, container, tween: null };
    }

    calculateDimensions(label) {
        const tempText = this.scene.add.text(0, 0, label, {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '28px',
            color: '#0f172a',
            align: 'center',
        }).setOrigin(0.5);
        
        const width = Math.ceil(tempText.width + this.paddingX * 2);
        const height = Math.ceil(tempText.height + this.paddingY * 2);
        tempText.destroy();
        
        return { width, height };
    }

    calculateSafeBounds(bw, bh) {
        const margin = Math.max(bw, bh) / 2 + 20;
        return {
            minX: margin,
            maxX: window.innerWidth - margin,
            minY: margin,
            maxY: window.innerHeight - 100
        };
    }

    createGraphicsContainer(x, y, bw, bh, depth) {
        const gfx = this.scene.add.graphics();
        const container = this.scene.add.container(x, y);
        
        // Draw rounded rectangle with shadow
        gfx.fillStyle(0x0f172a, 0.2);
        gfx.fillRoundedRect(-bw / 2 + 4, -bh / 2 + 6, bw, bh, this.radius);
        
        gfx.fillStyle(0xffffff, 1);
        gfx.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, this.radius);
        
        gfx.lineStyle(2, 0xe5e7eb, 1);
        gfx.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, this.radius);
        
        container.add(gfx);
        container.setDepth(depth);
        container.setScale(0);
        container.setAlpha(0);
        
        return { gfx, container };
    }

    animateTextBox(text, container, emergenceX, emergenceY, loopTargetX, loopTargetY) {
        // Phase 1: Emerge from input box
        this.scene.tweens.add({
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
                
                this.scene.tweens.add({
                    targets: [text, container],
                    x: loopTargetX,
                    y: loopTargetY,
                    duration: duration,
                    ease: 'Sine.easeInOut',
                    yoyo: true,
                    repeat: -1
                });
            }
        });
    }
}

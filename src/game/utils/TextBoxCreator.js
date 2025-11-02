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
     * @param {object} options - Optional configuration
     * @param {object} options.colors - Color configuration {text, background, border}
     * @param {Array<{x: number, y: number, duration?: number, rotation?: number}>} options.animationPath - Array of points defining the animation path. Each point can have optional duration (in ms) and rotation (in radians) for the transition to that point. If not provided, generates 2 random points.
     * @returns {object} - Returns {text, gfx, container, tween}
     */
    create(label, startPosition, currentDepth, options = {}) {
        // Calculate text dimensions
        const { width: bw, height: bh } = this.calculateDimensions(label);
        
        // Calculate safe boundaries
        const bounds = this.calculateSafeBounds(bw, bh);
        
        // Use provided animation path or generate random path points
        let pathPoints;
        
        if (options.animationPath && Array.isArray(options.animationPath) && options.animationPath.length > 0) {
            pathPoints = options.animationPath;
        } else {
            // Generate default 2-point path (emergence and loop target)
            pathPoints = [
                {
                    x: Phaser.Math.Between(bounds.minX, bounds.maxX),
                    y: Phaser.Math.Between(bounds.minY, bounds.maxY)
                },
                {
                    x: Phaser.Math.Between(bounds.minX, bounds.maxX),
                    y: Phaser.Math.Between(bounds.minY, bounds.maxY)
                }
            ];
        }
        
        // Get text color from options or use default
        const textColor = options.colors?.text ?? '#0f172a';
        
        // Create text element
        const text = this.scene.add.text(startPosition.x, startPosition.y, label, {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '28px',
            color: textColor,
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
            currentDepth,
            options.colors
        );
        
        text.setDepth(currentDepth + 1);
        
        // Animate the text box along the path
        const tween = this.animateTextBox(text, container, pathPoints);
        
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

    createGraphicsContainer(x, y, bw, bh, depth, colors = {}) {
        const gfx = this.scene.add.graphics();
        const container = this.scene.add.container(x, y);
        
        // Get colors from options or use defaults
        const backgroundColor = colors.background ?? 0xffffff;
        const borderColor = colors.border ?? 0xe5e7eb;
        const shadowColor = colors.shadow ?? 0x0f172a;
        
        // Draw rounded rectangle with shadow
        gfx.fillStyle(shadowColor, 0.2);
        gfx.fillRoundedRect(-bw / 2 + 4, -bh / 2 + 6, bw, bh, this.radius);
        
        gfx.fillStyle(backgroundColor, 1);
        gfx.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, this.radius);
        
        gfx.lineStyle(2, borderColor, 1);
        gfx.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, this.radius);
        
        container.add(gfx);
        container.setDepth(depth);
        container.setScale(0);
        container.setAlpha(0);
        
        return { gfx, container };
    }

    animateTextBox(text, container, pathPoints) {
        if (pathPoints.length === 0) return;
        
        // Phase 1: Emerge to the first point
        this.scene.tweens.add({
            targets: [text, container],
            x: pathPoints[0].x,
            y: pathPoints[0].y,
            scale: 1,
            alpha: 1,
            duration: 800,
            ease: 'Back.easeOut',
            onComplete: () => {
                // Phase 2: Animate through all path points in a loop
                if (pathPoints.length === 1) {
                    // If only one point, just stay there
                    return;
                }
                
                this.createPathAnimation(text, container, pathPoints);
            }
        });
    }

    createPathAnimation(text, container, pathPoints) {
        let currentIndex = 0;
        
        const animateToNextPoint = () => {
            currentIndex = (currentIndex + 1) % pathPoints.length;
            const nextPoint = pathPoints[currentIndex];
            // Use custom duration if provided, otherwise random between 2-4 seconds
            const duration = nextPoint.duration ?? Phaser.Math.Between(2000, 4000);
            
            const tweenConfig = {
                targets: [text, container],
                x: nextPoint.x,
                y: nextPoint.y,
                duration: duration,
                ease: 'Sine.easeInOut',
                onComplete: animateToNextPoint
            };
            
            // Add rotation if specified
            if (nextPoint.rotation !== undefined) {
                tweenConfig.angle = Phaser.Math.RadToDeg(nextPoint.rotation);
            }
            
            this.scene.tweens.add(tweenConfig);
        };
        
        animateToNextPoint();
    }
}

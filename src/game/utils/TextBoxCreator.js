/**
 * Utility class for creating animated text boxes
 */
export class TextBoxCreator {
    constructor(scene) {
        this.scene = scene;
        this.paddingX = 24;
        this.paddingY = 12;
        this.radius = 16;
        this.particleTexturesCreated = new Set(); // Track created textures
    }

    /**
     * Create an animated text box that emerges from a position and loops
     * @param {string} label - The text to display
     * @param {object} startPosition - Starting position {x, y}
     * @param {number} currentDepth - The depth for layering
     * @param {object} options - Optional configuration
     * @param {object} options.colors - Color configuration {text, background, border}
     * @param {Array<{x: number, y: number, duration?: number, rotation?: number}>} options.animationPath - Array of points defining the animation path. Each point can have optional duration (in ms) and rotation (in radians) for the transition to that point. If not provided, generates 2 random points.
     * @param {string} options.effect - Particle effect type: 'fire', 'ice', 'poison', 'smoke', or null (default: null)
     * @param {number} options.fontSize - Font size in pixels (default: 28)
     * @returns {object} - Returns {text, gfx, container, tween, particles}
     */
    create(label, startPosition, currentDepth, options = {}) {
        // Get font size from options or use default
        const fontSize = options.fontSize || 28;
        
        // Calculate text dimensions
        const { width: bw, height: bh } = this.calculateDimensions(label, fontSize);
        
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
        
        // Determine stroke color based on text brightness for extra contrast
        const strokeColor = this.getContrastingStroke(textColor);
        
        // Create text element with dynamic font size and stroke for readability
        const text = this.scene.add.text(startPosition.x, startPosition.y, label, {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: `${fontSize}px`,
            color: textColor,
            align: 'center',
            stroke: strokeColor,
            strokeThickness: 4
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
        
        // Create particle effect if specified
        let particles = null;
        if (options.effect) {
            particles = this.createParticleEffect(options.effect, container, currentDepth);
        }
        
        // Animate the text box along the path
        const tween = this.animateTextBox(text, container, pathPoints);
        
        return { text, gfx, container, tween, particles };
    }

    calculateDimensions(label, fontSize = 28) {
        const tempText = this.scene.add.text(0, 0, label, {
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: `${fontSize}px`,
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
        if (pathPoints.length === 0) return null;
        
        // Phase 1: Emerge to the first point - slower for readability
        const emergeTween = this.scene.tweens.add({
            targets: [text, container],
            x: pathPoints[0].x,
            y: pathPoints[0].y,
            scale: 1,
            alpha: 1,
            duration: pathPoints[0].duration || 1000,  // Use the duration from the path
            ease: 'Power2',  // Smooth acceleration
            onComplete: () => {
                // Phase 2: Animate through remaining path points
                if (pathPoints.length === 1) {
                    // If only one point, just stay there
                    return;
                }
                
                this.createPathAnimation(text, container, pathPoints);
            }
        });
        
        return emergeTween;
    }

    createPathAnimation(text, container, pathPoints) {
        let currentIndex = 0;
        let lastTween = null;
        
        const animateToNextPoint = () => {
            currentIndex++;
            
            // Stop if we've reached the end of the path (no looping)
            if (currentIndex >= pathPoints.length) {
                return; // Animation complete, stop here
            }
            
            const nextPoint = pathPoints[currentIndex];
            // Use custom duration if provided, otherwise random between 2-4 seconds
            const duration = nextPoint.duration ?? Phaser.Math.Between(2000, 4000);
            
            const tweenConfig = {
                targets: [text, container],
                x: nextPoint.x,
                y: nextPoint.y,
                duration: duration,
                ease: 'Linear',  // Changed from Sine.easeInOut to Linear for constant velocity
                onComplete: animateToNextPoint
            };
            
            // Add rotation if specified
            if (nextPoint.rotation !== undefined) {
                tweenConfig.angle = Phaser.Math.RadToDeg(nextPoint.rotation);
            }
            
            lastTween = this.scene.tweens.add(tweenConfig);
        };
        
        animateToNextPoint();
        return lastTween;
    }

    createParticleEffect(effectType, container, depth) {
        const effectType_lower = effectType.toLowerCase();
        
        switch(effectType_lower) {
            case 'fire':
                return this.createFireEffect(container, depth);
            case 'ice':
                return this.createIceEffect(container, depth);
            case 'poison':
                return this.createPoisonEffect(container, depth);
            case 'smoke':
                return this.createSmokeEffect(container, depth);
            default:
                console.warn(`Unknown effect type: ${effectType}`);
                return null;
        }
    }

    createParticleTexture(textureName, createCallback) {
        if (!this.particleTexturesCreated.has(textureName) && !this.scene.textures.exists(textureName)) {
            createCallback();
            this.particleTexturesCreated.add(textureName);
        }
    }

    createFireEffect(container, depth) {
        // Create fire particle texture (reuse if exists)
        const textureName = 'fireParticle';
        this.createParticleTexture(textureName, () => {
            const particleGraphics = this.scene.add.graphics();
            particleGraphics.fillStyle(0xff0000, 1);
            particleGraphics.fillCircle(8, 8, 6);
            particleGraphics.fillStyle(0xff6600, 1);
            particleGraphics.fillCircle(8, 8, 4);
            particleGraphics.fillStyle(0xffaa00, 1);
            particleGraphics.fillCircle(8, 8, 2);
            particleGraphics.generateTexture(textureName, 16, 16);
            particleGraphics.destroy();
        });
        
        const emitter = this.scene.add.particles(0, 0, textureName, {
            speed: { min: 40, max: 80 },
            angle: { min: 250, max: 290 },
            scale: { start: 2.5, end: 0.5 },
            alpha: { start: 0.9, end: 0 },
            lifespan: 1200,
            frequency: 25,
            quantity: 3,
            blendMode: 'NORMAL',
            tint: [0xcc0000, 0xff3300, 0xff6600, 0xff9900]
        });
        
        emitter.setDepth(depth - 1);
        emitter.startFollow(container, 0, 30);
        return emitter;
    }

    createIceEffect(container, depth) {
        // Create ice particle texture (reuse if exists)
        const textureName = 'iceParticle';
        this.createParticleTexture(textureName, () => {
            const particleGraphics = this.scene.add.graphics();
            particleGraphics.fillStyle(0x00ccff, 1);
            particleGraphics.fillCircle(8, 8, 6);
            particleGraphics.fillStyle(0xccffff, 1);
            particleGraphics.fillCircle(8, 8, 4);
            particleGraphics.fillStyle(0xffffff, 1);
            particleGraphics.fillCircle(8, 8, 2);
            particleGraphics.generateTexture(textureName, 16, 16);
            particleGraphics.destroy();
        });
        
        const emitter = this.scene.add.particles(0, 0, textureName, {
            speed: { min: 20, max: 50 },
            angle: { min: 250, max: 290 },
            scale: { start: 2, end: 0.3 },
            alpha: { start: 0.9, end: 0 },
            lifespan: 1500,
            frequency: 30,
            quantity: 2,
            blendMode: 'NORMAL',
            tint: [0x0099cc, 0x00ccff, 0x99ffff, 0xccffff],
            gravityY: -50 // Ice crystals float up
        });
        
        emitter.setDepth(depth - 1);
        emitter.startFollow(container, 0, 30);
        return emitter;
    }

    createPoisonEffect(container, depth) {
        // Create poison particle texture (reuse if exists)
        const textureName = 'poisonParticle';
        this.createParticleTexture(textureName, () => {
            const particleGraphics = this.scene.add.graphics();
            particleGraphics.fillStyle(0x00cc00, 1);
            particleGraphics.fillCircle(8, 8, 6);
            particleGraphics.fillStyle(0x66ff33, 1);
            particleGraphics.fillCircle(8, 8, 4);
            particleGraphics.fillStyle(0xaaff66, 1);
            particleGraphics.fillCircle(8, 8, 2);
            particleGraphics.generateTexture(textureName, 16, 16);
            particleGraphics.destroy();
        });
        
        const emitter = this.scene.add.particles(0, 0, textureName, {
            speed: { min: 10, max: 30 },
            angle: { min: 0, max: 360 }, // All directions
            scale: { start: 1.5, end: 0.3 },
            alpha: { start: 0.8, end: 0 },
            lifespan: 2000,
            frequency: 40,
            quantity: 2,
            blendMode: 'NORMAL',
            tint: [0x006600, 0x00cc00, 0x66ff33, 0x99ff66],
            gravityY: -20 // Slow upward drift
        });
        
        emitter.setDepth(depth - 1);
        emitter.startFollow(container, 0, 0); // Center of box
        return emitter;
    }

    createSmokeEffect(container, depth) {
        // Create smoke particle texture (reuse if exists)
        const textureName = 'smokeParticle';
        this.createParticleTexture(textureName, () => {
            const particleGraphics = this.scene.add.graphics();
            particleGraphics.fillStyle(0x666666, 1);
            particleGraphics.fillCircle(8, 8, 6);
            particleGraphics.fillStyle(0x999999, 1);
            particleGraphics.fillCircle(8, 8, 4);
            particleGraphics.generateTexture(textureName, 16, 16);
            particleGraphics.destroy();
        });
        
        const emitter = this.scene.add.particles(0, 0, textureName, {
            speed: { min: 20, max: 40 },
            angle: { min: 260, max: 280 },
            scale: { start: 2, end: 3 }, // Grows as it rises
            alpha: { start: 0.6, end: 0 },
            lifespan: 2000,
            frequency: 50,
            quantity: 2,
            blendMode: 'NORMAL',
            tint: [0x444444, 0x666666, 0x888888, 0xaaaaaa],
            gravityY: -30
        });
        
        emitter.setDepth(depth - 1);
        emitter.startFollow(container, 0, 30);
        return emitter;
    }

    /**
     * Get contrasting stroke color for text readability
     * Light text gets dark stroke, dark text gets light stroke
     */
    getContrastingStroke(textColor) {
        // Convert hex to RGB
        const hex = textColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        // Calculate perceived brightness (0-255)
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        
        // If text is bright, use dark stroke; if dark, use light stroke
        return brightness > 128 ? '#000000' : '#ffffff';
    }
}

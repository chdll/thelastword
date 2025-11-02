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
        
        // Create particle effect if custom config provided
        let particles = null;
        if (options.particles) {
            particles = this.createCustomParticleEffect(options.particles, container, currentDepth);
        }
        
        // Animate the text box along the path
        const tween = this.animateTextBox(text, container, pathPoints);
        
        return { text, gfx, container, tween: null, particles };
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

    /**
     * Create custom particle effect from Gemini config
     * @param {Object} particleConfig - Particle configuration from Gemini
     * @param {Phaser.GameObjects.Container} container - Container to attach particles to
     * @param {number} depth - Depth layer for particles
     */
    createCustomParticleEffect(particleConfig, container, depth) {
        // Generate unique texture name based on colors
        const colorHash = particleConfig.colors.join('_');
        const textureName = `particle_${colorHash}`;
        
        // Create particle texture if it doesn't exist
        if (!this.particleTexturesCreated.has(textureName) && !this.scene.textures.exists(textureName)) {
            const particleGraphics = this.scene.add.graphics();
            
            // Draw multi-colored circle using provided colors
            const colors = particleConfig.colors;
            const numColors = colors.length;
            
            for (let i = 0; i < numColors; i++) {
                const radius = 8 - (i * 2);
                if (radius > 0) {
                    particleGraphics.fillStyle(colors[i], 1);
                    particleGraphics.fillCircle(8, 8, radius);
                }
            }
            
            particleGraphics.generateTexture(textureName, 16, 16);
            particleGraphics.destroy();
            this.particleTexturesCreated.add(textureName);
        }
        
        // Create emitter with Gemini-provided config
        const emitter = this.scene.add.particles(0, 0, textureName, {
            speed: particleConfig.speed || { min: 40, max: 80 },
            angle: particleConfig.angle || { min: 250, max: 290 },
            scale: particleConfig.scale || { start: 2, end: 0.5 },
            alpha: { start: 0.9, end: 0 },
            lifespan: particleConfig.lifespan || 1200,
            frequency: particleConfig.frequency || 30,
            quantity: particleConfig.quantity || 3,
            blendMode: 'NORMAL',
            tint: particleConfig.colors
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

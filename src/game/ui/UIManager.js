/**
 * UI Manager for handling input box and user interface elements
 */
export class UIManager {
    constructor(scene) {
        this.scene = scene;
        this.inputBoxPosition = { x: 0, y: 0 };
        this.dom = null;
    }

    /**
     * Create and setup the input box
     * @param {Function} onMessageSend - Callback when user sends a message
     * @returns {object} - Input box position {x, y}
     */
    createInputBox(onMessageSend) {
        const inputHtml = `
            <div class="menu-input">
                <input type="text" id="textInput" placeholder="Type here and press Enter..." />
            </div>
        `;
        
        this.dom = this.scene.add.dom(0, 0).createFromHTML(inputHtml);
        const bottomOffset = 40;
        
        const repositionInput = (size) => {
            const { width, height } = size;
            this.dom.setPosition(width / 2, height - bottomOffset);
            this.inputBoxPosition = {
                x: width / 2,
                y: height - bottomOffset
            };
        };
        
        this.dom.setOrigin(0.5, 1);
        this.dom.setDepth(5);
        repositionInput(this.scene.scale.gameSize);
        this.scene.scale.on('resize', repositionInput);
        
        // Initialize position
        this.inputBoxPosition = {
            x: window.innerWidth / 2,
            y: window.innerHeight - bottomOffset
        };
        
        // Setup input event listener
        const inputElement = this.dom.getChildByID('textInput');
        inputElement.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                const inputValue = inputElement.value.trim();
                if (inputValue) {
                    onMessageSend(inputValue);
                    inputElement.value = '';
                }
            }
        });
        
        return this.inputBoxPosition;
    }

    /**
     * Create a static text box (like the "awesome hacker" example)
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {string} label - Text label
     */
    createStaticTextBox(x, y, label) {
        const text = this.scene.add.text(x, y, label, {
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

        const gfx = this.scene.add.graphics();

        // Drop shadow
        gfx.fillStyle(0x0f172a, 0.2);
        gfx.fillRoundedRect(x - bw / 2 + 4, y - bh / 2 + 6, bw, bh, radius);

        // Background
        gfx.fillStyle(0xffffff, 1);
        gfx.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, radius);

        // Subtle border
        gfx.lineStyle(2, 0xe5e7eb, 1);
        gfx.strokeRoundedRect(x - bw / 2, y - bh / 2, bw, bh, radius);

        gfx.setDepth(1);
        text.setDepth(2);

        return { text, gfx };
    }

    /**
     * Clean up the input box
     */
    destroy() {
        if (this.dom) {
            this.scene.scale.off('resize');
            this.dom.destroy();
        }
    }

    /**
     * Get the current input box position
     * @returns {object} - Position {x, y}
     */
    getInputBoxPosition() {
        return this.inputBoxPosition;
    }
}

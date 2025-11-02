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

    /**
     * Enable or disable the input box
     * @param {boolean} enabled - Whether the input should be enabled
     */
    setInputEnabled(enabled) {
        if (!this.dom) return;
        
        const inputElement = this.dom.getChildByID('textInput');
        if (inputElement) {
            inputElement.disabled = !enabled;
            
            // Update visual feedback
            if (enabled) {
                inputElement.style.opacity = '1';
                inputElement.style.cursor = 'text';
                inputElement.placeholder = 'Type here and press Enter...';
            } else {
                inputElement.style.opacity = '0.5';
                inputElement.style.cursor = 'not-allowed';
                inputElement.placeholder = 'Waiting for opponent...';
            }
        }
    }
}

# Project Structure

This project has been refactored into a clean, modular architecture:

## Directory Structure

```
src/
├── game/
│   ├── main.js                    # Phaser game configuration
│   ├── scenes/
│   │   └── MainMenu.js           # Main game scene (orchestrates all components)
│   ├── services/
│   │   └── TalkJSService.js      # TalkJS chat integration service
│   ├── ui/
│   │   └── UIManager.js          # UI components (input box, static text boxes)
│   └── utils/
│       └── TextBoxCreator.js     # Animated text box creation and animation
└── main.js                        # Application entry point

public/
└── style.css                      # Global styles

```

## Component Responsibilities

### MainMenu.js (Scene)
- **Purpose**: Main orchestration layer
- **Responsibilities**:
  - Initialize all services and managers
  - Coordinate between chat service and UI
  - Handle scene lifecycle
  - Manage text box collection and cleanup

### TalkJSService.js (Service)
- **Purpose**: Chat functionality
- **Responsibilities**:
  - Connect to TalkJS API
  - Handle user authentication
  - Send and receive messages
  - Track processed messages to avoid duplicates
  - Provide callback for new messages

### TextBoxCreator.js (Utility)
- **Purpose**: Text box creation and animation
- **Responsibilities**:
  - Calculate text dimensions
  - Generate safe positioning boundaries
  - Create styled graphics containers
  - Animate emergence and looping motion
  - Handle depth layering for proper occlusion

### UIManager.js (UI)
- **Purpose**: User interface elements
- **Responsibilities**:
  - Create and position input box
  - Handle input events
  - Create static text boxes
  - Manage resize events
  - Track input box position for animations
  - Handle UI cleanup

## Key Features

### Real-time Chat
- Two users can chat via URL parameters: `?user=alice` or `?user=bob`
- Messages appear as animated text boxes on both screens
- TalkJS handles message synchronization

### Animated Text Boxes
- Messages "fire out" from the input box
- Smooth emergence animation with scale and fade
- Continuous looping motion between random positions
- Proper layering (newer messages appear on top)
- No text clipping due to safe boundary calculations

### Responsive Design
- Input box repositions on window resize
- Text box boundaries adapt to window size
- Background scales to fit viewport

## How to Use

1. **Start the dev server**: `npm run dev`
2. **Open two browser windows**:
   - Window 1: `http://localhost:5173/?user=alice`
   - Window 2: `http://localhost:5173/?user=bob`
3. **Type messages**: Both users will see messages as animated text boxes

## Benefits of This Structure

- **Separation of Concerns**: Each module has a single, clear responsibility
- **Reusability**: Services and utilities can be easily reused
- **Testability**: Individual components can be tested in isolation
- **Maintainability**: Changes to one component don't affect others
- **Readability**: Clear naming and organization make the code easy to understand

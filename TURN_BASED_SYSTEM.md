# Turn-Based Messaging System

## Overview
The chat system now implements turn-based messaging where players alternate sending messages. You can only send a message after the other player has responded.

## How It Works

### Turn Tracking
- **Initial State**: The first player (Alice) starts with their turn
- **Turn Switches**: After sending a message, it becomes the other player's turn
- **Turn Validation**: Messages can only be sent when it's your turn

### Visual Feedback

1. **Turn Indicator** (Top of Screen)
   - **Green "Your turn"**: You can send messages
   - **Red "Waiting for opponent..."**: Other player's turn

2. **Input Box State**
   - **Enabled**: Your turn - input is active and ready
   - **Disabled**: Opponent's turn - input is grayed out and disabled

3. **Warning Message**
   - If you try to send when it's not your turn, a red warning appears:
     > "Not your turn! Wait for opponent to respond."
   - Fades out after 2 seconds

## Code Changes

### TalkJSService.js

#### New Properties
```javascript
this.currentUserId      // Your user ID (alice/bob)
this.otherUserId        // Opponent's user ID
this.lastMessageSenderId // Who sent the last message
this.isMyTurn           // Boolean: is it your turn?
this.turnChangeCallback // Callback when turn changes
```

#### New Methods
- `canSendMessage()` - Returns true if it's your turn
- `getTurnState()` - Returns object with turn info

#### Updated Methods
- `initialize(onMessageReceived, onTurnChange)` - Now accepts turn change callback
- `sendMessage(message, processWithAPI)` - Checks turn before sending

### MainMenu.js

#### New Methods
- `createTurnIndicator()` - Creates the turn status text at top of screen
- `updateTurnIndicator(isMyTurn)` - Updates indicator when turn changes
- `showTurnWarning()` - Shows warning when trying to send out of turn

### UIManager.js

#### New Method
- `setInputEnabled(enabled)` - Enables/disables input box with visual feedback

## Testing Turn-Based System

1. **Open Two Browser Windows**
   - Window 1: `http://localhost:8080?user=alice`
   - Window 2: `http://localhost:8080?user=bob`

2. **Test Flow**
   - Alice sees "Your turn" (green) and can type
   - Bob sees "Waiting for opponent..." (red) and input is disabled
   - Alice sends a message
   - Alice's indicator turns red, Bob's turns green
   - Bob can now send a message
   - Repeat!

3. **Test Restrictions**
   - Try typing when it's not your turn - input is disabled
   - Try sending out of turn - warning message appears

## Error Handling

If you attempt to send a message when it's not your turn:
- Console warning is logged
- `sendMessage()` returns `{ error: 'NOT_YOUR_TURN', message: '...' }`
- Warning message is displayed on screen
- Message is NOT sent to TalkJS

## Benefits

✅ **Prevents spam**: Players can't flood chat  
✅ **Creates engagement**: Encourages back-and-forth conversation  
✅ **Clear feedback**: Always know whose turn it is  
✅ **Battle-like feel**: More game-like experience  

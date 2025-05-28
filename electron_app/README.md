# WhatsApp AI Filter Electron App

This folder contains the Electron wrapper for the WhatsApp AI Filter Bot.

## Usage

1. Install dependencies:
   ```zsh
   cd electron_app
   npm install
   ```
2. Build the core module (from the project root):
   ```zsh
   cd core
   npm run build
   ```
3. Start the Electron app:
   ```zsh
   cd ../electron_app
   npm start
   ```

The Electron app launches the bot logic from the `core/` directory as a child process. Make sure you have configured your `.env` file in `core/` as usual.

## Development Notes
- The Electron app does not duplicate any bot logic; it simply runs the built core bot (`core/dist/index.js`).
- You can modify the UI in `index.html` and `renderer.js` to display logs, status, or interact with the bot if needed.
- If you change the core bot code, rebuild it (`npm run build` in `core/`) before restarting the Electron app.

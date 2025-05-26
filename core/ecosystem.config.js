export const apps = [
    {
      name: "whatsapp-ai-filter", // A friendly name for your application
      script: "dist/index.js",        // The entry point for your compiled JavaScript application
      cwd: "./",                      // Set the current working directory to the 'backend' folder
                                      // (where this ecosystem.config.js file is located)
      exec_mode: "fork",              // Use 'fork' mode for whatsapp-web.js as it needs a single browser instance
      instances: 1,                   // Run only one instance of the application
      watch: false,                   // Set to true for development (restarts on file change), false for production
                                      // For a 24/7 bot, keep it false unless actively developing.
      max_memory_restart: "500M",     // Restart the app if it consumes more than 500MB of RAM. Adjust as needed.
                                      // Puppeteer can be memory hungry, so this helps prevent OOM crashes.

      // Node.js arguments for ES Modules and suppressing warnings
      node_args: [
        "--experimental-json-modules", // If you have JSON imports in your project
        "--no-warnings"                // Suppress Node.js experimental feature warnings
      ],

      // Log file configuration
      output: "./logs/out.log",       // Path to the file where standard output (console.log) will be written
      error: "./logs/error.log",      // Path to the file where standard error (console.error) will be written
      log_file: "./logs/combined.log",// Optional: Path to a combined log file for both stdout and stderr
      time: true,                     // Add a timestamp to each log line

      // Environment variables
      // PM2 can load environment variables from a .env file.
      // Make sure your .env file is in the same directory as this ecosystem.config.js file.
      env_file: ".env",
    }
]

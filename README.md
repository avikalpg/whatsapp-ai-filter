# WhatsApp-AI-Filter

**Filter the Noise, Focus on What Matters in WhatsApp.**

## Overview

WhatsApp-AI-Filter is an open-source project designed to help you manage information overload in WhatsApp groups. Running locally on your computer, this application monitors your specified WhatsApp groups and uses AI (leveraging the Perplexity Sonar API) to intelligently filter messages based on your interests. It notifies you about relevant discussions, such as meetups in specific locations or conversations about particular topics, allowing you to focus on what truly matters and ignore the noise.

## Key Features

* **Intelligent Filtering:** Uses AI to identify and surface only the messages that are relevant to your interests.
* **Customizable Focus:** Define keywords and topics to tailor the filtering to your specific needs.
* **Real-time Monitoring:** Continuously monitors your chosen WhatsApp groups for new messages.
* **Local Operation:** Runs privately on your computer, ensuring your data stays secure.
* **Notifications:** Sends you direct WhatsApp messages for important and relevant content.
* **Poll and RSVP Handling:** (Planned or in development) Ability to automatically respond to polls and RSVP links based on your preferences.

## Getting Started

### Backend Application (Run Locally)

This is the core application that monitors WhatsApp and uses AI to filter messages.

1.  Navigate to the `backend` directory:
    ```bash
    cd backend
    ```
2.  Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    ```
3.  Create a `.env` file in the `backend` directory and add your Perplexity API key:
    ```env
    PERPLEXITY_API_KEY=your_perplexity_api_key_here
    ```
    **Remember to replace `your_perplexity_api_key_here` with your actual API key.**
4.  Run the application:
    ```bash
    node whatsapp.js
    ```
    Follow the prompts in the console to authenticate with WhatsApp Web by scanning the QR code.

### Landing Page

The project includes a landing page built with Next.js to provide information about WhatsApp-AI-Filter. For instructions on developing or building the landing page, please refer to the [landing-page/README.md](landing-page/README.md) file within that directory.

1.  Navigate to the `landing-page` directory:
    ```bash
    cd landing-page
    ```
2.  Follow the instructions in the `README.md` file there to install dependencies and run or build the landing page.

## Usage

Once the backend application is running and authenticated:

* It will monitor the WhatsApp groups you are part of.
* New messages in those groups will be sent to the Perplexity Sonar API for analysis.
* If a message is deemed relevant based on the application's logic and your configured interests, you will receive a direct message on your WhatsApp account from the same WhatsApp Web session.
* (Future) The application may automatically respond to polls and RSVP links based on its configuration.

## Contributing

We welcome contributions to make WhatsApp-AI-Filter even better! Please follow these guidelines:

1.  Fork the repository on GitHub.
2.  Create a new branch for your feature or bug fix.
3.  Make your changes and ensure they are well-tested.
4.  Submit a pull request with a clear description of your changes.

## License

This project is licensed under the terms of the [GNU GPL v3](LICENSE) license. See the `LICENSE` file in the root directory for more details.
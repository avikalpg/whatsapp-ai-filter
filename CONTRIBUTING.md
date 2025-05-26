# Contributing to WhatsApp AI Filter

Thank you for your interest in contributing! We welcome all kinds of contributions, including bug reports, feature requests, documentation improvements, UI/UX design recommendations, and code changes.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Workflow](#development-workflow)
- [Development Setup](#development-setup)
- [Branching & Commit Messages](#branching--commit-messages)
- [Testing](#testing)
- [Pull Requests](#pull-requests)

---

## Code of Conduct

This project and everyone participating in it is expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it to understand what actions will and will not be tolerated.

---

## How to Contribute

* **Bug Reports:** If you find a bug, please use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md) to report reproducible problems. Include steps to reproduce, expected and actual behavior, and relevant logs or screenshots.
* **Feature Requests:** If you have an idea for a new feature or improvement, use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md) to suggest it.
* **Code Contributions:** For code changes, follow the [Development Workflow](#development-workflow) and submit a [Pull Request](#pull-requests).
* **Documentation:** Improvements to existing documentation are always welcome! You can submit a PR directly.
* **UI/UX Design:** If you have design recommendations for the landing page or notification structure, feel free to open a feature request or a discussion.

---

## Development Workflow

To contribute code, please follow the standard GitHub forking workflow:

1.  **Fork the Repository:** Go to the main [WhatsApp AI Filter repository](https://github.com/avikalpg/whatsapp-ai-filter) on GitHub and click the "Fork" button in the top right corner. This creates a copy of the repository under your GitHub account.

2.  **Clone Your Fork:** Clone *your* forked repository to your local machine:
    ```bash
    git clone [https://github.com/your-username/whatsapp-ai-filter.git](https://github.com/your-username/whatsapp-ai-filter.git) # Replace your-username
    cd whatsapp-ai-filter/
    ```

3.  **Add Upstream Remote:** Add the original repository as an "upstream" remote. This allows you to sync your fork with the original project.
    ```bash
    git remote add upstream [https://github.com/avikalpg/whatsapp-ai-filter.git](https://github.com/avikalpg/whatsapp-ai-filter.git)
    ```

4.  **Sync Your Fork:** Before starting new work, always pull the latest changes from the upstream `main` branch into your local `main` branch to keep your fork up-to-date.
    ```bash
    git checkout main
    git pull upstream main
    ```

5.  **Create a New Branch:** For every new feature or bug fix, create a new branch from your `main` branch.
    ```bash
    git checkout -b feature/your-awesome-feature # or fix/your-bug-fix
    ```

---

## Development Setup

The project consists of two main parts: the `core/` backend (the bot itself) and the `landing-page/` (a Next.js application).

### For the Backend (`core/`)

1.  **Navigate to `core/`:**
    ```bash
    cd core/
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Run the bot locally for development:**
    ```bash
    npm start
    ```
	or
	```bash
	npm run dev
	```

	Note: For a full production-like setup with PM2, refer to the main `README.md`'s "Getting Started" section.

### For the Landing Page (`landing-page/`)

Please see the `landing-page/README.md` for specific instructions on running or building the landing page locally.

---

## Branching & Commit Messages

We follow a [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification for commit messages, which helps us maintain a clear history and automate releases.

* **Branch Naming:** Use descriptive names for your branches, prefixed by their type:
    * `feature/your-new-feature`
    * `fix/bug-description`
    * `docs/update-readme`
    * `refactor/code-restructure`
* **Commit Messages:** Write clear, concise, and descriptive commit messages following the Conventional Commits format:
    ```
    <type>(<scope>): <subject>

    [optional body]

    [optional footer(s)]
    ```
    **Examples:**
    * `feat(core): Add Perplexity AI integration`
    * `fix(backend): Correct QR code display issue`
    * `docs(readme): Update contributing guidelines`
    * `refactor(core): Improve message filtering efficiency`

---

## Testing

* **Local Testing:** Please run your changes locally and ensure they work as expected before submitting a Pull Request.
* **Automated Tests:** Add or update tests as appropriate for new features or bug fixes.
    * You can run all automated tests using: `npm test` (if you have a test script defined in `package.json`).
* Ensure all new and existing tests pass.

---

## Pull Requests

Once you've completed your changes and tested them:

1.  **Push Your Branch:** Push your feature branch to your *forked* repository on GitHub.
    ```bash
    git push origin feature/your-awesome-feature
    ```
2.  **Open a Pull Request:** Go to your forked repository on GitHub, and you should see a prompt to open a new Pull Request. Select the `main` branch of the original `avikalpg/whatsapp-ai-filter` repository as the base, and your feature branch as the compare.
3.  **Fill out the Template:** Ensure you completely fill out the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md). This helps us review your changes quickly.
4.  **Address Feedback:** Be responsive to feedback from maintainers. We'll review your PR as soon as possible and may request changes.
5.  **Pass Checks:** Ensure all automated checks (CI, tests, linting, etc.) pass on your Pull Request.

Thank you for helping make WhatsApp AI Filter better!
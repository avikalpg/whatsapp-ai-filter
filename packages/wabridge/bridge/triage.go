package bridge

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	// Default backend proxy URL — overridden by InitBridge options if provided.
	defaultBackendURL = "https://whatsapp-ai-filter.vercel.app"
	triageTimeout     = 15 * time.Second

	// Fallback: call Anthropic directly if authToken looks like an API key (sk-ant-*)
	claudeAPIURL      = "https://api.anthropic.com/v1/messages"
	anthropicVersion  = "2023-06-01"
	claudeModel       = "claude-haiku-4-5-20251001"
)

const triageSystemPrompt = `You are a message triage assistant. Given a WhatsApp message and a filter description, respond ONLY with valid JSON: {"relevant": true/false, "reason": "one sentence", "confidence": 0.0-1.0}. No other text.`

// TriageClient makes Claude API calls for message triage.
// It can call either our backend proxy (using a JWT) or Anthropic directly (using an API key).
type TriageClient struct {
	authToken  string // JWT bearer token OR sk-ant-* API key
	backendURL string // e.g. https://whatsapp-ai-filter.vercel.app
	httpClient *http.Client
}

// NewTriageClient creates a new TriageClient.
// authToken can be a JWT (calls backend proxy) or an Anthropic API key (calls Anthropic directly).
// backendURL is only used when authToken is a JWT; pass "" for the default.
func NewTriageClient(authToken string, backendURL string) *TriageClient {
	if backendURL == "" {
		backendURL = defaultBackendURL
	}
	return &TriageClient{
		authToken:  authToken,
		backendURL: backendURL,
		httpClient: &http.Client{Timeout: triageTimeout},
	}
}

type triageMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type triageAPIResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

type triageResult struct {
	Relevant   bool    `json:"relevant"`
	Reason     string  `json:"reason"`
	Confidence float64 `json:"confidence"`
}

// TriageMessage asks Claude whether msg is relevant to the filter description.
// Returns: relevant, reason, confidence, error.
func (t *TriageClient) TriageMessage(msg, filterDescription string) (bool, string, float64, error) {
	if t.authToken == "" {
		return false, "", 0, fmt.Errorf("auth token not set")
	}

	userContent := fmt.Sprintf("Filter description: %s\n\nWhatsApp message: %s", filterDescription, msg)
	requestBody := map[string]interface{}{
		"model":      claudeModel,
		"max_tokens": 256,
		"system":     triageSystemPrompt,
		"messages":   []triageMessage{{Role: "user", Content: userContent}},
	}

	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		return false, "", 0, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Route to backend proxy (JWT) or Anthropic directly (API key)
	isAPIKey := strings.HasPrefix(t.authToken, "sk-ant-") || strings.HasPrefix(t.authToken, "sk-")
	var req *http.Request
	if isAPIKey {
		req, err = http.NewRequest(http.MethodPost, claudeAPIURL, bytes.NewReader(bodyBytes))
		if err != nil {
			return false, "", 0, fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("x-api-key", t.authToken)
		req.Header.Set("anthropic-version", anthropicVersion)
	} else {
		// JWT — call our backend proxy
		proxyURL := strings.TrimRight(t.backendURL, "/") + "/api/chat"
		req, err = http.NewRequest(http.MethodPost, proxyURL, bytes.NewReader(bodyBytes))
		if err != nil {
			return false, "", 0, fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+t.authToken)
	}
	req.Header.Set("content-type", "application/json")

	resp, err := t.httpClient.Do(req)
	if err != nil {
		return false, "", 0, fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, "", 0, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode == 402 {
		return false, "", 0, fmt.Errorf("TRIAL_EXPIRED: free trial ended, add API key in settings")
	}
	if resp.StatusCode != http.StatusOK {
		return false, "", 0, fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBytes))
	}

	var apiResp triageAPIResponse
	if err := json.Unmarshal(respBytes, &apiResp); err != nil {
		return false, "", 0, fmt.Errorf("failed to parse response: %w", err)
	}
	if apiResp.Error != nil {
		return false, "", 0, fmt.Errorf("API error: %s", apiResp.Error.Message)
	}
	if len(apiResp.Content) == 0 {
		return false, "", 0, fmt.Errorf("empty response")
	}

	var result triageResult
	if err := json.Unmarshal([]byte(apiResp.Content[0].Text), &result); err != nil {
		return false, "", 0, fmt.Errorf("failed to parse triage JSON: %w (raw: %s)", err, apiResp.Content[0].Text)
	}

	return result.Relevant, result.Reason, result.Confidence, nil
}

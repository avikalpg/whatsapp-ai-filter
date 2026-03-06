package bridge

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	claudeAPIURL    = "https://api.anthropic.com/v1/messages"
	claudeModel     = "claude-haiku-4-5-20251001"
	anthropicVersion = "2023-06-01"
	triageTimeout   = 10 * time.Second
)

const triageSystemPrompt = `You are a message triage assistant. Given a WhatsApp message and a filter description, respond ONLY with valid JSON: {"relevant": true/false, "reason": "one sentence", "confidence": 0.0-1.0}. No other text.`

// TriageClient makes Claude API calls for message triage.
type TriageClient struct {
	apiKey     string
	httpClient *http.Client
}

// NewTriageClient creates a new TriageClient.
func NewTriageClient(apiKey string) *TriageClient {
	return &TriageClient{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: triageTimeout,
		},
	}
}

// triageRequest is the Claude API request body.
type triageRequest struct {
	Model     string           `json:"model"`
	MaxTokens int              `json:"max_tokens"`
	System    string           `json:"system"`
	Messages  []triageMessage  `json:"messages"`
}

type triageMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// triageAPIResponse is the Claude API response body (simplified).
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

// triageResult is the expected JSON from Claude.
type triageResult struct {
	Relevant   bool    `json:"relevant"`
	Reason     string  `json:"reason"`
	Confidence float64 `json:"confidence"`
}

// TriageMessage asks Claude whether msg is relevant to the filter description.
// Returns: relevant, reason, confidence, error.
func (t *TriageClient) TriageMessage(msg, filterDescription string) (bool, string, float64, error) {
	if t.apiKey == "" {
		return false, "", 0, fmt.Errorf("claude API key not set")
	}

	userContent := fmt.Sprintf("Filter description: %s\n\nWhatsApp message: %s", filterDescription, msg)

	reqBody := triageRequest{
		Model:     claudeModel,
		MaxTokens: 256,
		System:    triageSystemPrompt,
		Messages: []triageMessage{
			{Role: "user", Content: userContent},
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return false, "", 0, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, claudeAPIURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return false, "", 0, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("x-api-key", t.apiKey)
	req.Header.Set("anthropic-version", anthropicVersion)
	req.Header.Set("content-type", "application/json")

	resp, err := t.httpClient.Do(req)
	if err != nil {
		return false, "", 0, fmt.Errorf("claude API request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, "", 0, fmt.Errorf("failed to read claude response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return false, "", 0, fmt.Errorf("claude API error %d: %s", resp.StatusCode, string(respBytes))
	}

	var apiResp triageAPIResponse
	if err := json.Unmarshal(respBytes, &apiResp); err != nil {
		return false, "", 0, fmt.Errorf("failed to parse claude response: %w", err)
	}

	if apiResp.Error != nil {
		return false, "", 0, fmt.Errorf("claude error: %s", apiResp.Error.Message)
	}

	if len(apiResp.Content) == 0 {
		return false, "", 0, fmt.Errorf("empty response from claude")
	}

	var result triageResult
	if err := json.Unmarshal([]byte(apiResp.Content[0].Text), &result); err != nil {
		return false, "", 0, fmt.Errorf("failed to parse triage result JSON: %w (raw: %s)", err, apiResp.Content[0].Text)
	}

	return result.Relevant, result.Reason, result.Confidence, nil
}

package bridge

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"go.mau.fi/whatsmeow/types"
)

// shouldProcessMessage checks if a message should be processed based on filter options.
// Returns (shouldProcess bool, skipReason string).
// This implements granular DM/group filtering logic.
func (s *Store) shouldProcessMessage(filter Filter, chatJID string, senderJID string) (bool, string) {
	// Status updates arrive on status@broadcast — handled separately.
	if chatJID == "status@broadcast" {
		if filter.ProcessStatus {
			return true, ""
		}
		return false, "status update processing disabled"
	}

	isGroup := strings.HasSuffix(chatJID, "@g.us")

	if isGroup {
		// Group message
		if !filter.ProcessGroups {
			return false, "group processing disabled"
		}
		if filter.GroupMode == "inclusion" {
			// Inclusion mode: only process groups in the list
			for _, id := range filter.GroupList {
				if id == chatJID {
					return true, ""
				}
			}
			return false, "group not in inclusion list"
		} else if filter.GroupMode == "exclusion" {
			// Exclusion mode: skip groups in the list
			for _, id := range filter.GroupList {
				if id == chatJID {
					return false, "group in exclusion list"
				}
			}
			return true, ""
		}
		// No mode set: process all groups
		return true, ""
	} else {
		// Direct message
		if !filter.ProcessDMs {
			return false, "DM processing disabled"
		}

		// Check DM subcategories
		jid, err := types.ParseJID(senderJID)
		if err != nil {
			// Invalid JID, process anyway to avoid silently dropping messages
			return true, ""
		}

		// Get contact info to check if sender is a contact and/or business
		contactInfo, err := s.GetContact(context.Background(), jid)
		isContact := err == nil && contactInfo.Found
		isBusiness := err == nil && contactInfo.Found && contactInfo.BusinessName != ""

		// Apply DM subcategory filters
		// Contact filter
		if isContact && !filter.DMContacts {
			return false, "contacts disabled for this filter"
		}
		if !isContact && !filter.DMNonContacts {
			return false, "non-contacts disabled for this filter"
		}

		// Business filter (only apply if contact info is available)
		if contactInfo.Found {
			if isBusiness && !filter.DMBusinesses {
				return false, "businesses disabled for this filter"
			}
			if !isBusiness && !filter.DMNonBusinesses {
				return false, "non-businesses disabled for this filter"
			}
		}
		// If contact info not found, skip business filtering to avoid false negatives

		return true, ""
	}
}

// matchesMetadataFilter checks if a message matches a special metadata-based filter.
// Returns (matched bool, reason string, confidence float64, handled bool).
// If handled=false, the caller should proceed with normal Claude triage.
//
// Special filter syntaxes:
//   "*"           — matches all messages (already handled in triage.go)
//   "*:dm"        — matches only direct messages (1:1 chats)
//   "*:group"     — matches only group messages
//   "*:dm:contact" — matches only DMs from contacts (future: requires contact list)
func matchesMetadataFilter(prompt string, chatJID string, senderJID string) (bool, string, float64, bool) {
	prompt = strings.TrimSpace(prompt)

	// All DMs (1:1 chats only)
	if prompt == "*:dm" {
		isDM := !strings.HasSuffix(chatJID, "@g.us")
		if isDM {
			return true, "Direct message", 1.0, true
		}
		return false, "", 0, true
	}

	// All groups
	if prompt == "*:group" {
		isGroup := strings.HasSuffix(chatJID, "@g.us")
		if isGroup {
			return true, "Group message", 1.0, true
		}
		return false, "", 0, true
	}

	// All DMs from contacts (future implementation)
	if prompt == "*:dm:contact" {
		// TODO: Check if senderJID is in user's contact list
		// For now, treat the same as "*:dm"
		isDM := !strings.HasSuffix(chatJID, "@g.us")
		if isDM {
			return true, "DM from contact", 1.0, true
		}
		return false, "", 0, true
	}

	// Not a metadata filter — proceed with normal Claude triage
	return false, "", 0, false
}

// matchesBasicFilter checks message body against a keyword or regex pattern.
// Supports:
//   - "*"           → matches all messages
//   - "regex:<pat>" → case-sensitive regex
//   - "kw1, kw2"   → case-insensitive substring match on any keyword
func matchesBasicFilter(prompt, body string) (bool, string, float64) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "*" {
		return true, "Matches all messages", 1.0
	}
	if strings.HasPrefix(strings.ToLower(prompt), "regex:") {
		pattern := prompt[6:]
		re, err := regexp.Compile(pattern)
		if err != nil {
			return false, "invalid regex pattern", 0
		}
		if re.MatchString(body) {
			return true, "Regex match", 1.0
		}
		return false, "", 0
	}
	// Keyword mode: comma-separated, case-insensitive
	bodyLower := strings.ToLower(body)
	for _, kw := range strings.Split(prompt, ",") {
		kw = strings.ToLower(strings.TrimSpace(kw))
		if kw != "" && strings.Contains(bodyLower, kw) {
			return true, fmt.Sprintf("Contains keyword: %q", kw), 1.0
		}
	}
	return false, "", 0
}

// dispatchTriage decides how to triage a message for a filter:
//  1. Metadata rules (special prompt syntax like "*:dm")
//  2. Basic mode: keyword/regex matching — no API call
//  3. Intelligent mode: Claude AI triage
func dispatchTriage(filter Filter, chatJID, senderJID, body string, triage *TriageClient) (bool, string, float64, error) {
	// Step 1: metadata-based shortcuts
	matched, reason, confidence, handled := matchesMetadataFilter(filter.Prompt, chatJID, senderJID)
	if handled {
		return matched, reason, confidence, nil
	}
	// Step 2: basic keyword/regex
	if filter.FilterMode == "basic" {
		m, r, c := matchesBasicFilter(filter.Prompt, body)
		return m, r, c, nil
	}
	// Step 3: AI triage (intelligent mode, default)
	return triage.TriageMessage(body, filter.Prompt)
}

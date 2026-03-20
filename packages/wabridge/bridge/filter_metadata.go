package bridge

import (
	"strings"
)

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

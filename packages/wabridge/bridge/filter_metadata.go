package bridge

import (
	"context"
	"strings"

	"go.mau.fi/whatsmeow/types"
)

// shouldProcessMessage checks if a message should be processed based on filter options.
// Returns (shouldProcess bool, skipReason string).
// This implements granular DM/group filtering logic.
func (s *Store) shouldProcessMessage(filter Filter, chatJID string, senderJID string) (bool, string) {
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

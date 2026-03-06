// test-bridge is a CLI tool to exercise the wabridge package.
// Usage:
//   test-bridge [--db /path/to/waci.db] [--api-key <claude_key>] [--phone +1234567890]
package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/avikalpg/whatsapp-ai-filter/wabridge"
)

func main() {
	dbPath := flag.String("db", "/tmp/waci-test.db", "Path to SQLite database")
	apiKey := flag.String("api-key", os.Getenv("CLAUDE_API_KEY"), "Claude API key (or set CLAUDE_API_KEY env)")
	phone := flag.String("phone", "", "Phone number to pair (optional)")
	flag.Parse()

	fmt.Printf("wabridge test\n")
	fmt.Printf("  DB path:  %s\n", *dbPath)
	fmt.Printf("  API key:  %s\n", maskKey(*apiKey))

	b, err := wabridge.NewBridge(*dbPath, *apiKey)
	if err != nil {
		fmt.Fprintf(os.Stderr, "NewBridge error: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("✓ NewBridge OK")

	linked := b.IsLinked()
	fmt.Printf("✓ IsLinked = %v\n", linked)

	filtersJSON, err := b.GetFilters()
	if err != nil {
		fmt.Fprintf(os.Stderr, "GetFilters error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("✓ GetFilters = %s\n", filtersJSON)

	// Quick round-trip: save a filter, list it, delete it
	saved, err := b.SaveFilter(`{"name":"test","prompt":"anything about Go programming"}`)
	if err != nil {
		fmt.Fprintf(os.Stderr, "SaveFilter error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("✓ SaveFilter = %s\n", saved)

	filtersJSON, _ = b.GetFilters()
	fmt.Printf("✓ GetFilters after save = %s\n", filtersJSON)

	// If --phone is provided, initiate pairing
	if *phone != "" {
		fmt.Printf("Initiating pairing for %s...\n", *phone)
		code, err := b.StartPairing(*phone)
		if err != nil {
			fmt.Fprintf(os.Stderr, "StartPairing error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("✓ Pairing code: %s\n", code)
		fmt.Println("  Enter this code in WhatsApp → Settings → Linked Devices → Link a Device")
	}

	fmt.Println("\nAll tests passed.")
}

func maskKey(k string) string {
	if len(k) < 8 {
		return "***"
	}
	return k[:4] + "..." + k[len(k)-4:]
}
